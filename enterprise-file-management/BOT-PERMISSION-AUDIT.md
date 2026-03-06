# Bot Permission Enforcement Audit — Complete Findings & Fix Instructions

## Executive Summary

Bot permissions are stored as `["BUCKET:<bucketId>:<PERM>", ...]` in `BotIdentity.permissions` and correctly embedded in the JWT during `/api/bot/verify`. However, **only 1 out of 10+ API routes that serve data to bots actually enforces these permissions**. A bot assigned to a single bucket can currently access ALL buckets and ALL files in its tenant.

---

## How Bot Permissions Work (Current Design)

### Permission Format
```
BUCKET:<bucketId>:READ
BUCKET:<bucketId>:WRITE
BUCKET:<bucketId>:UPLOAD
BUCKET:<bucketId>:DOWNLOAD
BUCKET:<bucketId>:DELETE
```

### Token Flow
1. Admin registers bot via UI → `POST /api/bot` or `registerBot()` server action
2. Permissions stored in `BotIdentity.permissions` (Prisma `String[]`)
3. Electron agent calls `POST /api/bot/verify` with EdDSA-signed JWT
4. Server issues HS256 JWT with `{ type: 'bot', permissions: [...], email, tenantId }`
5. Agent uses this JWT as `Authorization: Bearer <token>` on all subsequent API calls
6. `POST /api/bot/refresh` re-issues JWT with fresh permissions from DB

### The Problem
Most API routes use `verifyToken()` from `lib/token.ts` which ONLY validates Cognito RS256 JWTs. Bot JWTs are HS256 and silently fail verification → routes either reject the bot entirely OR fall back to looking up the user by email without checking bot-scoped permissions.

---

## Route-by-Route Audit

### ✅ CORRECTLY ENFORCED

#### 1. `GET /api/agent/sync` — `app/api/agent/sync/route.ts`
- Tries bot JWT (HS256) first via `jwtVerify(token, BOT_JWT_SECRET)`
- Extracts `botPermissions` from payload
- Parses `BUCKET:id:PERM` → `allowedBucketIds`
- Filters buckets: `{ id: { in: allowedBucketIds } }`
- **This is the ONLY route doing it right. Use this as the reference pattern.**

#### 2. `GET /api/heartbeat` — `app/api/heartbeat/route.ts`
- Correctly verifies bot JWT and checks `bot.isActive`
- Only returns status info, no data leakage
- **No fix needed.**

#### 3. `POST /api/bot/verify` — `app/api/bot/verify/route.ts`
- Issues the JWT with permissions embedded
- **No fix needed.**

#### 4. `POST /api/bot/refresh` — `app/api/bot/refresh/route.ts`
- Re-reads permissions from DB and re-issues JWT
- **No fix needed.**

---

### 🔴 CRITICAL — NO BOT PERMISSION ENFORCEMENT

#### 5. `GET /api/files` — `app/api/files/route.ts`
**Severity: CRITICAL**
**Impact: Bot can list ALL files in ANY bucket within its tenant**

**Current behavior:**
- Lines 14-33: Uses `getCurrentUser()` (session-based) OR falls back to `verifyToken()` (Cognito only)
- Bot HS256 JWT fails `verifyToken()` silently → if session exists for the bot's user email, it proceeds as that user
- No extraction of `permissions` from bot JWT
- `bucketId` query param accepted without validation against bot permissions
- Returns all files matching the query with zero bucket-scoping

**What needs to change:**
1. Add bot JWT verification (HS256) as a third auth path
2. Extract `permissions` from bot JWT payload
3. Parse `BUCKET:id:*` to get `allowedBucketIds`
4. If `bucketId` param is provided, verify it's in `allowedBucketIds`
5. If no `bucketId` param, add `{ bucketId: { in: allowedBucketIds } }` to the where clause
6. Apply same logic to the POST handler (file creation)

---

#### 6. `POST /api/files` — `app/api/files/route.ts`
**Severity: CRITICAL**
**Impact: Bot can create files/folders in ANY bucket**

**Current behavior:**
- Lines 133-155: Uses `verifyToken()` (Cognito only)
- Bot JWT fails silently → falls through to user lookup by email
- `checkPermission(user, 'WRITE', ...)` uses RBAC policies, NOT bot permissions
- Bot's user account may have broader access than the bot should

**What needs to change:**
1. Add bot JWT verification before `verifyToken()` fallback
2. If bot token detected, extract `allowedBucketIds` and required permission (WRITE/UPLOAD)
3. Verify `body.bucketId` is in `allowedBucketIds` AND bot has WRITE or UPLOAD permission for it
4. Reject with 403 if bucket not in bot's allowed list

---

#### 7. `GET /api/buckets` — `app/api/buckets/route.ts`
**Severity: CRITICAL**
**Impact: Bot can see ALL buckets in its tenant**

**Current behavior:**
- Line 14: Uses `getCurrentUser()` (session-based only)
- Bot calling with Bearer token has no session → returns 401
- BUT if the electron app also sets a session cookie (from SSO flow), the bot's user session grants full tenant access
- No bot JWT handling at all
- RBAC filtering is based on user role, not bot permissions

**What needs to change:**
1. Add Bearer token auth path (same as `/api/files` pattern)
2. Add bot JWT verification (HS256)
3. If bot token detected, extract `allowedBucketIds`
4. Override the `whereClause` to: `{ id: { in: allowedBucketIds } }`
5. Ignore role-based RBAC for bots — their permissions are explicit

---

#### 8. `GET /api/explorer` — `app/api/explorer/route.ts`
**Severity: CRITICAL**
**Impact: Bot can search ALL files across ALL buckets in its tenant**

**Current behavior:**
- Lines 10-18: Uses `verifyToken()` (Cognito only)
- Bot HS256 JWT fails `verifyToken()` → returns 401 to bot
- BUT if bot's user email resolves via Cognito token (dual-auth scenario), full tenant access is granted
- RBAC filtering exists for TEAMMATE role but NOT for bots
- `allowedBucketIdFilter` is computed from user policies, not bot permissions

**What needs to change:**
1. Add bot JWT verification before Cognito fallback
2. If bot token detected, set `allowedBucketIdFilter` from bot permissions instead of user policies
3. Apply the filter in both the FTS (raw SQL) path and the Prisma ORM path
4. Ensure `bucketId` query param is validated against bot's allowed buckets

---

#### 9. `GET /api/files/presigned` — `app/api/files/presigned/route.ts`
**Severity: CRITICAL**
**Impact: Bot can get presigned download/upload URLs for ANY bucket**

**Current behavior:**
- Line 18: Uses `verifyToken()` (Cognito only)
- Bot JWT fails → 401 (unless dual-auth)
- `checkPermission()` uses RBAC policies, not bot permissions
- If bot's user has broad RBAC access, presigned URLs are issued for any bucket

**What needs to change:**
1. Add bot JWT verification
2. Extract `allowedBucketIds` and per-bucket permissions (READ/WRITE/DOWNLOAD)
3. Verify `bucketId` param is in `allowedBucketIds`
4. Verify the specific action (download/upload) matches bot's permission for that bucket
5. Reject with 403 if not authorized

---

#### 10. `DELETE /api/files/[id]` — `app/api/files/[id]/route.ts`
**Severity: HIGH**
**Impact: Bot can delete files in ANY bucket**

**Current behavior:**
- Line 23: Uses `verifyToken()` (Cognito only)
- `checkPermission(user, 'WRITE', ...)` uses RBAC, not bot permissions
- No bot JWT handling

**What needs to change:**
1. Add bot JWT verification
2. After fetching the file, verify `file.bucketId` is in bot's `allowedBucketIds`
3. Verify bot has DELETE or WRITE permission for that bucket
4. Reject with 403 if not authorized

---

#### 11. `PATCH /api/files/[id]` — `app/api/files/[id]/route.ts`
**Severity: HIGH**
**Impact: Bot can rename files in ANY bucket**

**Current behavior:**
- Same as DELETE — uses `verifyToken()` only, RBAC-based permission check

**What needs to change:**
- Same pattern as DELETE fix above

---

#### 12. `POST /api/files/multipart/initiate` — `app/api/files/multipart/initiate/route.ts`
**Severity: HIGH**
**Impact: Bot can initiate multipart uploads to ANY bucket**

**Current behavior:**
- Line 13: Uses `verifyToken()` (Cognito only)
- `checkPermission(user, 'WRITE', ...)` uses RBAC

**What needs to change:**
1. Add bot JWT verification
2. Verify `body.bucketId` is in bot's `allowedBucketIds` with WRITE/UPLOAD permission
3. Same pattern applies to `sign-part`, `complete`, `abort`, `status` routes

---

#### 13. `GET /api/file-explorer` — `app/api/file-explorer/route.ts`
**Severity: HIGH**
**Impact: Bot can browse files in ANY bucket via the file explorer endpoint**

**Current behavior:**
- Line 12: Uses `verifyToken()` (Cognito only)
- `checkPermission()` uses RBAC policies
- No bot JWT handling

**What needs to change:**
1. Add bot JWT verification
2. If bot, extract `allowedBucketIds`
3. Filter `allowedBucketIds` array to only include bot-permitted buckets
4. If `bucketId` param provided, verify it's in bot's allowed list

---

#### 14. `POST /api/agent/credentials` — `app/api/agent/credentials/route.ts`
**Severity: MEDIUM**
**Impact: Bot can get AWS credentials for any account in its tenant (not scoped to permitted buckets)**

**Current behavior:**
- Line 37: Uses `verifyToken()` (Cognito only) — bot JWT fails
- Even if it worked, credentials are scoped to account level, not bucket level
- Bot could use raw AWS credentials to access S3 buckets directly, bypassing all app-level permissions

**What needs to change:**
1. Add bot JWT verification
2. When bot requests credentials, validate the requested `accountId` owns only buckets the bot has access to
3. Consider: should bots even have access to raw AWS credentials? This is an architectural decision.
4. At minimum, audit log should record which bot requested credentials

---

#### 15. `POST /api/agent/sync-history` & `GET /api/agent/sync-history` — `app/api/agent/sync-history/route.ts`
**Severity: LOW**
**Impact: Bot can read/write ALL sync history (not scoped)**

**Current behavior:**
- Uses `verifyToken()` (Cognito only)
- GET returns all sync histories with no tenant/bot scoping
- POST creates sync history with no ownership tracking

**What needs to change:**
1. Add bot JWT verification
2. Consider adding a `botId` or `userId` field to `SyncHistory` model for scoping
3. GET should filter by the requesting bot's identity

---

### ⚠️ SESSION-ONLY ROUTES (Not directly callable by bot JWT, but vulnerable via session)

#### 16. `POST /api/buckets` — `app/api/buckets/route.ts`
- Uses `getCurrentUser()` (session only)
- Bots shouldn't create buckets — but if bot's user has an active session, they could
- **Recommendation:** Add explicit bot rejection: if request comes from a bot session, return 403

#### 17. `DELETE /api/buckets/[id]` — `app/api/buckets/[id]/route.ts`
- Uses `getCurrentUser()` (session only)
- Same concern as bucket creation
- **Recommendation:** Same as above

#### 18. `POST /api/shares` & `GET /api/shares` — `app/api/shares/route.ts`
- Uses `getCurrentUser()` (session only)
- Bots shouldn't create or list shares
- **Recommendation:** Add explicit bot rejection

---

## Recommended Fix: Shared Helper Function

Create a reusable helper that all routes can call:

### File: `lib/bot-auth.ts`

```typescript
import { jwtVerify } from 'jose';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);

export interface BotAuthResult {
  isBot: true;
  botId: string;
  email: string;
  tenantId: string;
  permissions: string[];
  allowedBucketIds: string[];
  /** Check if bot has a specific permission on a specific bucket */
  hasBucketPermission: (bucketId: string, action: string) => boolean;
}

export interface UserAuthResult {
  isBot: false;
}

export type AuthResult = BotAuthResult | UserAuthResult;

/**
 * Try to verify a token as a bot JWT.
 * Returns BotAuthResult if it's a valid bot token, null otherwise.
 */
export async function verifyBotToken(token: string): Promise<BotAuthResult | null> {
  try {
    const { payload } = await jwtVerify(token, BOT_JWT_SECRET);
    if (payload.type !== 'bot') return null;

    const permissions = (payload.permissions as string[]) || [];
    
    // Parse "BUCKET:<id>:<PERM>" entries
    const bucketPerms = permissions
      .filter(p => p.startsWith('BUCKET:'))
      .map(p => {
        const parts = p.split(':');
        return { bucketId: parts[1], action: parts[2] };
      });

    const allowedBucketIds = [...new Set(bucketPerms.map(bp => bp.bucketId))];

    return {
      isBot: true,
      botId: payload.sub as string,
      email: payload.email as string,
      tenantId: payload.tenantId as string,
      permissions,
      allowedBucketIds,
      hasBucketPermission: (bucketId: string, action: string) => {
        return bucketPerms.some(
          bp => bp.bucketId === bucketId && 
               (bp.action === action || bp.action === 'FULL_ACCESS')
        );
      },
    };
  } catch {
    return null;
  }
}

/**
 * Validate that a bucketId is in the bot's allowed list.
 * Returns true if user is not a bot (no restriction) or if bot has access.
 */
export function assertBotBucketAccess(
  botAuth: BotAuthResult | null,
  bucketId: string,
  requiredAction?: string
): boolean {
  if (!botAuth) return true; // Not a bot — no bot-level restriction
  if (!botAuth.allowedBucketIds.includes(bucketId)) return false;
  if (requiredAction) return botAuth.hasBucketPermission(bucketId, requiredAction);
  return true;
}
```

---

## Fix Implementation Order (by priority)

### Phase 1 — Critical Data Leaks (do first)
| # | Route | File | Issue |
|---|-------|------|-------|
| 1 | `GET /api/files` | `app/api/files/route.ts` | Bot sees all files |
| 2 | `GET /api/buckets` | `app/api/buckets/route.ts` | Bot sees all buckets |
| 3 | `GET /api/explorer` | `app/api/explorer/route.ts` | Bot searches all files |
| 4 | `GET /api/file-explorer` | `app/api/file-explorer/route.ts` | Bot browses all files |

### Phase 2 — Write/Delete Operations
| # | Route | File | Issue |
|---|-------|------|-------|
| 5 | `POST /api/files` | `app/api/files/route.ts` | Bot creates files anywhere |
| 6 | `GET /api/files/presigned` | `app/api/files/presigned/route.ts` | Bot gets URLs for any bucket |
| 7 | `DELETE /api/files/[id]` | `app/api/files/[id]/route.ts` | Bot deletes any file |
| 8 | `PATCH /api/files/[id]` | `app/api/files/[id]/route.ts` | Bot renames any file |
| 9 | `POST /api/files/multipart/*` | `app/api/files/multipart/*/route.ts` | Bot uploads to any bucket |

### Phase 3 — Credential & History Scoping
| # | Route | File | Issue |
|---|-------|------|-------|
| 10 | `POST /api/agent/credentials` | `app/api/agent/credentials/route.ts` | Bot gets any account's creds |
| 11 | `GET/POST /api/agent/sync-history` | `app/api/agent/sync-history/route.ts` | Unscoped history |

### Phase 4 — Session-Based Route Hardening
| # | Route | File | Issue |
|---|-------|------|-------|
| 12 | `POST /api/buckets` | `app/api/buckets/route.ts` | Bot shouldn't create buckets |
| 13 | `DELETE /api/buckets/[id]` | `app/api/buckets/[id]/route.ts` | Bot shouldn't delete buckets |
| 14 | `POST /api/shares` | `app/api/shares/route.ts` | Bot shouldn't create shares |

---

## Fix Pattern for Each Route

Every route that serves data to bots needs this pattern added near the top of the handler:

```typescript
import { verifyBotToken, assertBotBucketAccess } from '@/lib/bot-auth';

// Inside the handler, after extracting the token:
const token = request.headers.get('Authorization')?.split(' ')[1];

// 1. Try bot JWT first
const botAuth = token ? await verifyBotToken(token) : null;

let user;
if (botAuth) {
  // Bot authenticated — look up user by email for DB operations
  user = await prisma.user.findUnique({
    where: { email: botAuth.email },
    include: { /* ... */ },
  });
} else {
  // Fall back to session or Cognito token
  user = await getCurrentUser();
  if (!user && token) {
    const payload = await verifyToken(token);
    // ... existing Cognito flow
  }
}

// 2. When building the query, scope by bot permissions
if (botAuth) {
  // For listing routes (buckets, files, explorer):
  whereClause.bucketId = { in: botAuth.allowedBucketIds };
  // OR for single-bucket routes:
  if (!assertBotBucketAccess(botAuth, bucketId, 'READ')) {
    return NextResponse.json({ error: 'Forbidden: bot lacks access to this bucket' }, { status: 403 });
  }
}
```

---

## Electron App Considerations

### `electron-app/backend/sync.js` — `SyncManager.syncAll()`
- Calls `GET /api/agent/sync` which IS correctly filtered ✅
- The local SQLite DB will only contain permitted buckets after sync
- However, the electron app also calls other routes (`/api/files`, `/api/files/presigned`) for individual operations
- These routes are NOT filtered → the electron app can access more than it should

### `electron-app/backend/bot-auth.js`
- Correctly implements EdDSA signing and handshake
- Token refresh works correctly
- **No changes needed here** — the fix is server-side

---

## Testing Checklist

After implementing fixes, verify:

- [ ] Bot with permission `BUCKET:abc123:READ` calling `GET /api/buckets` only sees bucket `abc123`
- [ ] Same bot calling `GET /api/files?bucketId=OTHER_ID` gets 403
- [ ] Same bot calling `GET /api/files` (no bucketId) only sees files from `abc123`
- [ ] Same bot calling `GET /api/explorer?q=test` only searches within `abc123`
- [ ] Same bot calling `GET /api/files/presigned?bucketId=OTHER_ID&action=download` gets 403
- [ ] Same bot calling `DELETE /api/files/<file-in-other-bucket>` gets 403
- [ ] Same bot calling `POST /api/files` with `bucketId=OTHER_ID` gets 403
- [ ] Bot with `BUCKET:abc123:READ` (no WRITE) calling `POST /api/files` with `bucketId=abc123` gets 403
- [ ] Admin user (non-bot) access is unchanged — no regression
- [ ] TEAMMATE RBAC policies still work correctly for non-bot users
- [ ] Bot token refresh picks up permission changes from DB
