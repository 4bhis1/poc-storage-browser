# CloudVault — Product Requirements Document

---

## 1. What Is This Product?

CloudVault is an **enterprise S3 file management platform** with two tightly coupled components:

1. **enterprise-file-management** — A Next.js 14 web application (the "control plane"). Admins manage tenants, users, teams, buckets, bots, shares, and audit logs here.
2. **electron-app** — A desktop agent (Electron + React) that runs on-premise on a machine. It syncs files between a local folder and S3 buckets, uploads/downloads on a schedule or in real-time via a file watcher.

The two talk to each other over HTTP. The web app is the source of truth; the desktop agent is the execution engine.

---

## 2. Core Problem Being Solved

Enterprises need to:
- Manage S3 buckets across multiple AWS accounts from a single dashboard
- Control which users/teams can access which buckets (RBAC)
- Run automated, headless sync agents on servers without human login
- Share individual files securely with external parties (expiry, download limits, password protection)
- Audit every action for compliance

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  enterprise-file-management                  │
│                    (Next.js 14 Web App)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Auth     │  │ Buckets  │  │ Files    │  │ Bots/Agent │  │
│  │ Cognito  │  │ Explorer │  │ Shares   │  │ API        │  │
│  │ Google   │  │ RBAC     │  │ Multipart│  │            │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                                                              │
│  PostgreSQL (Prisma ORM)    AWS S3 (presigned URLs)          │
└─────────────────────────────────────────────────────────────┘
                          ▲  HTTP/REST
                          │
┌─────────────────────────────────────────────────────────────┐
│                       electron-app                           │
│                  (Desktop Sync Agent)                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Auth     │  │ Sync     │  │ Watcher  │  │ Local DB   │  │
│  │ Cognito  │  │ Engine   │  │ chokidar │  │ SQLite     │  │
│  │ SSO/Bot  │  │          │  │          │  │            │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                                                              │
│  Local Filesystem (ROOT_PATH = /home/user/FMS)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model (Key Entities)

| Entity | Description |
|---|---|
| `Tenant` | An organization. All data is scoped to a tenant. One tenant can be a "hub" tenant. |
| `User` | A person. Has a role: `PLATFORM_ADMIN`, `TENANT_ADMIN`, `TEAM_ADMIN`, or `TEAMMATE`. |
| `Account` | An AWS account (access key + secret) linked to a tenant. |
| `AwsAccount` | A cross-account IAM role link (roleArn + externalId) for assume-role access. |
| `Bucket` | An S3 bucket. Belongs to a tenant and optionally an Account or AwsAccount. Has quota, versioning, encryption flags. |
| `FileObject` | A file or folder record mirrored from S3. Hierarchical (parentId). Has full-text search vector. |
| `Team` | A group of users within a tenant. Can have IP allowlist. |
| `ResourcePolicy` | RBAC policy: grants a user or team specific actions on a resource (bucket, file, etc.). |
| `BotIdentity` | A machine identity. Has an Ed25519 public key and a list of bucket-scoped permissions. |
| `Share` | A secure file share link. Has expiry, download limit, optional password. |
| `SyncHistory` / `SyncActivity` | Server-side record of what the agent synced. |
| `AuditLog` | Every significant action is logged here with user, action, resource, IP, status. |
| `MultipartUpload` | Tracks in-progress S3 multipart uploads for resumability. |

---

## 5. User Roles & Access

| Role | Capabilities |
|---|---|
| `PLATFORM_ADMIN` | Full access to everything — all tenants, all users, superadmin panel |
| `TENANT_ADMIN` | Full access within their tenant — users, teams, buckets, bots |
| `TEAM_ADMIN` | Manages their team's members and policies |
| `TEAMMATE` | Access only to resources explicitly granted via `ResourcePolicy` |

---

## 6. Authentication Flows

### 6.1 Web App — Human Login
1. User visits `/login`
2. Submits email + password → `POST /api/auth/login` → Cognito `InitiateAuth`
3. If `NEW_PASSWORD_REQUIRED` challenge → user sets new password → `POST /api/auth/new-password`
4. On success: Cognito returns `accessToken` + `refreshToken` → stored as HTTP-only cookies
5. `PLATFORM_ADMIN` → redirected to `/superadmin`; others → `/`
6. Google SSO also available via Cognito Hosted UI (`/api/auth/google`)
7. Token refresh: `POST /api/auth/refresh` uses stored refreshToken to get new tokens
8. IP blocking: if user's IP is in a team's `allowedIps` blocklist → 403 → `/ip-blocked`

### 6.2 Desktop Agent — Human SSO (PKCE Loopback)
1. User clicks "Login with Browser" in the Electron app
2. App generates PKCE `verifier` + `challenge` (SHA-256)
3. App starts a local HTTP server on a random port (e.g. `http://127.0.0.1:54321`)
4. App opens system browser to: `http://localhost:3000/api/auth/agent-sso?challenge=<ch>&redirect_uri=http://127.0.0.1:54321`
5. If not logged in → web app redirects to `/login?redirect=<sso-url>`
6. After login → web app generates a one-time auth code, stores it with the challenge
7. Web app redirects browser to `http://127.0.0.1:54321?code=<code>`
8. Electron's loopback server receives the code
9. Electron calls `POST /api/auth/token-exchange` with `{ code, verifier }`
10. Server verifies PKCE, returns `{ accessToken, refreshToken, email }`
11. Electron stores tokens in encrypted `electron-store`

### 6.3 Desktop Agent — Bot/Machine Auth (Secretless)
This is the headless, no-human-in-the-loop flow for automated agents:

1. Admin generates an Ed25519 key pair in the Electron app (Bot tab → "Generate Key Pair")
2. Admin copies the public key PEM and pastes it into the web app (Bots page → "Add Bot")
3. Admin assigns bucket-level permissions to the bot (READ/WRITE/DELETE/SHARE/DOWNLOAD per bucket)
4. Web app creates a `BotIdentity` record with the public key and permissions
5. Web app returns a `botId` — admin pastes this into the Electron app
6. At runtime, Electron signs a short-lived JWT with its Ed25519 private key
7. Electron calls `POST /api/bot/verify` with `{ botId, signedJwt }`
8. Server verifies the EdDSA signature against the stored public key
9. Server issues an HS256 `accessToken` (15 min TTL) + `refreshToken` (7 days TTL) with permissions embedded
10. Electron uses this token as `Authorization: Bearer <token>` on all API calls
11. Token refresh: `POST /api/bot/refresh` re-reads permissions from DB and re-issues

---

## 7. Web Application — Pages & Features

### 7.1 Dashboard (`/`)
- Stats cards: Total Files, Total Storage, Active Buckets, Monthly Cost (estimated at $0.023/GB)
- Cost Trend chart (area chart, monthly)
- Storage by Bucket chart (horizontal bar)
- Recent Activity feed (last 6 audit log entries)
- Quick Actions: Upload Files, Create Bucket, View Audit Logs, Search Files
- Time range filter: Today, 7d, 14d, 30d, All Time, Custom (max 30 days)

### 7.2 Buckets (`/buckets`)
- List all buckets in the tenant
- Create bucket (name, region, link to AWS account)
- View bucket details, quota usage
- Trigger manual S3 sync (re-index files from S3 into DB)
- Delete bucket

### 7.3 Files (`/files`)
- Browse files within a bucket
- Upload files (single, multi, folder)
- Multipart upload for large files (initiate → sign parts → complete/abort)
- Create folders
- Download files (presigned S3 URL)
- Delete files
- Rename files
- Share files (creates a `Share` record)

### 7.4 Explorer (`/explorer`)
- Full-text search across all files in the tenant
- Uses PostgreSQL `tsvector` GIN index for fast FTS
- Falls back to Prisma ORM `contains` query
- Results scoped by RBAC policies for TEAMMATE role

### 7.5 File Explorer (`/file-explorer`)
- Hierarchical folder browser (tree view)
- Navigate into folders, list children

### 7.6 Shares (`/shares`)
- List all active shares created by the user
- Create share: pick file, set expiry date, download limit, optional password
- Revoke shares
- Public share page at `/file/share/[shareId]` — no login required
  - If password-protected: shows auth form first
  - Shows file info, download button
  - Tracks download count, enforces limit, checks expiry

### 7.7 Audit (`/audit`)
- Full audit log table with filters: action type, user, date range
- Every upload, download, delete, share, login, bucket create/delete is logged

### 7.8 Teams (`/teams`)
- Create and manage teams within the tenant
- Add/remove members
- Set IP allowlist per team (blocks access from non-allowed IPs)
- Assign resource policies to teams

### 7.9 Users (`/users`)
- List all users in the tenant
- Invite users (creates user record, Cognito account)
- Assign roles
- Deactivate users

### 7.10 Bots (`/bots`)
- List all registered bot identities
- Register new bot: name + public key PEM + bucket permission matrix
- View bot status (Active/Revoked), connection status (Online/Offline via heartbeat), last used
- Click into a bot to see its activity log and edit permissions
- Revoke bot (deletes the identity, invalidates all tokens immediately)

### 7.11 Accounts (`/accounts`)
- Manage AWS accounts (access key + secret) linked to the tenant
- These credentials are used by the agent to generate presigned URLs

### 7.12 Settings (`/settings`)
- User preferences: theme mode (light/dark/system), theme color, font, border radius

### 7.13 Superadmin (`/superadmin`) — PLATFORM_ADMIN only
- Manage all tenants (create, view, delete)
- Manage all users across tenants
- Manage AWS accounts (cross-account IAM role links)
- Manage all buckets globally

---

## 8. Desktop Agent — Features

### 8.1 Authentication
- Cognito direct login (email + password)
- Browser SSO via PKCE loopback (opens system browser, no password in app)
- Bot/machine auth (Ed25519 key pair, no human needed)
- Proactive token refresh (5 min before expiry)
- On logout: wipes all local SQLite data

### 8.2 Sync Engine
- On login: immediately runs `syncAll()` to pull tenant/account/bucket/file metadata from web app
- Periodic sync: every 1 minute checks for configs due to run
- Per-config sync: each `SyncConfig` has an interval (e.g. every 30 min), direction (DOWNLOAD or UPLOAD), and mappings (local folder ↔ bucket)

**DOWNLOAD mode:**
- Fetches file list from local DB (populated by `syncAll`)
- For each file: checks if it exists locally with matching size/ETag
- If missing or changed: gets presigned download URL from `GET /api/files/presigned`, streams file to disk
- Prevents re-upload loop: registers downloading paths in a `Set` so the file watcher skips them

**UPLOAD mode:**
- Walks local folder recursively
- For each local file: checks if it exists in S3 (via local DB) and if size/mtime has changed
- If new or modified: queues an upload task
- File watcher (chokidar) also triggers uploads in real-time for UPLOAD configs

### 8.3 File Watcher
- Uses `chokidar` to watch configured local folders
- Events: `add`, `change`, `unlink`, `addDir`, `unlinkDir`
- `add` → triggers upload (with dedup guard)
- `unlink` → triggers delete from S3
- Only active for UPLOAD-direction configs with `useWatcher = true`

### 8.4 Transfer Queue
- Uploads and downloads are queued
- Progress tracked per transfer (bytes written, percentage)
- Status broadcast to renderer via IPC (`transfer-status-update`)

### 8.5 Local Database (SQLite)
- Mirrors the server's data model: Tenant, Account, Bucket, FileObject
- Additional tables: SyncConfig, SyncMapping, SyncJob, LocalSyncActivity, SyncState
- WAL mode for concurrent read/write safety
- Wiped on logout

### 8.6 System Monitoring
- Network stats (rx/tx bytes per second) — polled every 1 second
- Disk stats (total/used/available) — polled every 10 seconds
- Broadcast to renderer via IPC

### 8.7 Heartbeat
- Pings `GET /api/heartbeat` periodically to keep the bot session alive
- If 401 received → fires `auth-expired` event → UI shows re-login prompt

---

## 9. API Surface

### Auth
| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Cognito username/password auth |
| `POST /api/auth/new-password` | Handle NEW_PASSWORD_REQUIRED challenge |
| `GET /api/auth/google` | Redirect to Cognito Hosted UI (Google SSO) |
| `GET /api/auth/callback` | Cognito OAuth callback |
| `POST /api/auth/refresh` | Refresh Cognito tokens |
| `POST /api/auth/logout` | Clear session cookies |
| `GET /api/auth/me` | Get current user info |
| `POST /api/auth/forgot-password` | Initiate Cognito forgot-password flow |
| `POST /api/auth/confirm-password` | Confirm reset with code + new password |
| `GET /api/auth/agent-sso` | PKCE SSO initiation for Electron agent |
| `POST /api/auth/token-exchange` | Exchange PKCE code for tokens |

### Bot / Agent
| Endpoint | Purpose |
|---|---|
| `POST /api/bot` | Register a new bot identity |
| `POST /api/bot/verify` | EdDSA handshake → issue HS256 tokens |
| `POST /api/bot/refresh` | Refresh bot tokens |
| `GET /api/heartbeat` | Bot keepalive ping |
| `GET /api/agent/sync` | Pull full tenant/bucket/file data for agent |
| `POST /api/agent/credentials` | Get temporary AWS credentials |
| `GET/POST /api/agent/sync-history` | Read/write sync history |

### Files & Buckets
| Endpoint | Purpose |
|---|---|
| `GET/POST /api/buckets` | List / create buckets |
| `GET/PATCH/DELETE /api/buckets/[id]` | Get / update / delete bucket |
| `GET/POST /api/files` | List / create files |
| `GET/PATCH/DELETE /api/files/[id]` | Get / rename / delete file |
| `GET /api/files/presigned` | Get presigned S3 URL (upload or download) |
| `POST /api/files/multipart/initiate` | Start multipart upload |
| `POST /api/files/multipart/sign-part` | Sign a part |
| `POST /api/files/multipart/complete` | Complete multipart upload |
| `POST /api/files/multipart/abort` | Abort multipart upload |
| `GET /api/explorer` | Full-text search across files |
| `GET /api/file-explorer` | Hierarchical folder browse |

### Shares
| Endpoint | Purpose |
|---|---|
| `GET/POST /api/shares` | List / create shares |
| `GET /api/shares/[shareId]` | Get share details |
| `POST /api/shares/[shareId]/auth` | Authenticate a password-protected share |
| `GET /api/shares/[shareId]/download` | Download shared file |

### Admin
| Endpoint | Purpose |
|---|---|
| `GET/POST /api/users` | List / invite users |
| `GET/POST /api/accounts` | List / create AWS accounts |
| `GET/POST /api/aws-accounts` | List / create cross-account IAM links |
| `GET/POST /api/policies` | List / create RBAC policies |
| `GET/POST /api/teammates` | Manage team memberships |
| `GET/POST /api/tenant/teams` | Tenant-scoped team management |
| `GET /api/superadmin/tenants` | Superadmin: list all tenants |
| `GET /api/superadmin/users` | Superadmin: list all users |

---

## 10. Security Model

### Human Users
- Cognito RS256 JWT verified on every API call via `verifyToken()`
- Session cookies (HTTP-only) for web app
- RBAC via `ResourcePolicy` table — actions checked with `checkPermission(user, action, resourceId)`
- IP allowlist per team — enforced at login

### Bot Identities
- Ed25519 asymmetric key pair — private key never leaves the agent machine
- Server stores only the public key
- HS256 app-level JWT issued after successful EdDSA verification
- Permissions are bucket-scoped: `BUCKET:<id>:<ACTION>`
- Only `GET /api/agent/sync` and `GET /api/heartbeat` currently enforce bot permissions correctly
- **Known gap (documented in BOT-PERMISSION-AUDIT.md):** 10+ other routes do not yet enforce bot-scoped permissions — a bot can currently access all buckets in its tenant

### File Sharing
- Share links are UUIDs — not guessable
- Optional bcrypt password protection
- Expiry date enforced server-side
- Download count enforced server-side

---

## 11. End-to-End Workflow: Agent Sync

```
1. Admin registers bot in web app
   → generates BotIdentity with public key + bucket permissions

2. Admin pastes botId into Electron app

3. Electron app performs handshake
   → signs JWT with Ed25519 private key
   → POST /api/bot/verify
   → receives HS256 accessToken with permissions embedded

4. Electron calls GET /api/agent/sync
   → server returns tenants, accounts (with AWS creds), buckets, file lists
   → scoped to bot's allowed buckets

5. Electron upserts data into local SQLite DB

6. SyncManager runs per-config sync:
   DOWNLOAD: for each file in DB → check local → download missing via presigned URL
   UPLOAD:   for each local file → check DB → upload new/modified via presigned URL

7. File watcher (chokidar) handles real-time uploads for UPLOAD configs

8. Sync activities logged to LocalSyncActivity (local) and SyncHistory (server)

9. Heartbeat pings /api/heartbeat every N seconds to keep session alive

10. Token refresh happens automatically 5 min before expiry
```

---

## 12. Known Issues & In-Progress Work

1. **Bot permission enforcement** — Only `GET /api/agent/sync` and `GET /api/heartbeat` enforce bucket-scoped permissions. All other routes (`/api/files`, `/api/buckets`, `/api/explorer`, `/api/files/presigned`, etc.) do not. A full fix plan is documented in `BOT-PERMISSION-AUDIT.md`.

2. **Error handling for DB disconnection** — noted in `electon-temp.txt` as a TODO.

3. **Agent tab in web app** — planned addition to the Collaboration section (alongside Teams), for secretless machine-to-machine auth management.

4. **Sync history scoping** — `SyncHistory` records are not yet scoped to a specific bot or user, making it hard to attribute sync activity to a specific agent.

---

## 13. Tech Stack

| Layer | Technology |
|---|---|
| Web frontend | Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui, Recharts |
| Web backend | Next.js API Routes + Server Actions |
| ORM | Prisma (PostgreSQL) |
| Auth | AWS Cognito (RS256 JWT), Google OAuth via Cognito Hosted UI |
| Bot auth | Ed25519 (node:crypto) + HS256 (jose) |
| File storage | AWS S3 (presigned URLs) |
| Desktop app | Electron, React (Vite), chokidar, better-sqlite3, electron-store |
| Desktop auth | AWS Cognito SDK, PKCE loopback, Ed25519 bot auth |
| Database (local) | SQLite (WAL mode) |
| Database (server) | PostgreSQL |
| Containerization | Docker (Dockerfile present) |
