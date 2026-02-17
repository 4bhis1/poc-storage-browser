// ============================================================
// CloudVault - Mock Data Layer
// ============================================================

export type FileType =
  | "folder"
  | "pdf"
  | "image"
  | "document"
  | "spreadsheet"
  | "archive"
  | "video"
  | "audio"
  | "code"
  | "other"

export interface FileItem {
  id: string
  name: string
  type: FileType
  size: number // bytes
  modifiedAt: string
  createdAt: string
  owner: string
  bucket: string
  path: string
  children?: FileItem[]
  starred?: boolean
  shared?: boolean
  storageClass?: "STANDARD" | "STANDARD_IA" | "GLACIER" | "DEEP_ARCHIVE"
}

export interface Bucket {
  id: string
  name: string
  region: string
  storageClass: "STANDARD" | "STANDARD_IA" | "GLACIER" | "DEEP_ARCHIVE"
  fileCount: number
  totalSize: number // bytes
  maxSize: number // bytes (quota)
  createdAt: string
  versioning: boolean
  encryption: boolean
  tags: string[]
}

export interface AuditLog {
  id: string
  action: "upload" | "download" | "delete" | "share" | "create_bucket" | "modify" | "view"
  user: string
  userEmail: string
  file: string
  bucket: string
  timestamp: string
  ip: string
  details?: string
}

export interface CostEntry {
  month: string
  storage: number
  requests: number
  transfer: number
  total: number
}

export interface User {
  id: string
  name: string
  email: string
  role: "admin" | "editor" | "viewer"
  avatar?: string
  lastActive: string
}

export interface Organization {
  id: string
  name: string
  tenantId: string
  region: string
  memberCount: number
  plan: "starter" | "pro" | "enterprise"
  createdAt: string
}

// ============================================================
// File System Mock
// ============================================================

function file(
  id: string,
  name: string,
  type: FileType,
  size: number,
  path: string,
  opts?: Partial<FileItem>
): FileItem {
  return {
    id,
    name,
    type,
    size,
    modifiedAt: "2026-02-10T14:30:00Z",
    createdAt: "2025-11-05T09:15:00Z",
    owner: "Sarah Chen",
    bucket: "prod-assets",
    path,
    storageClass: "STANDARD",
    ...opts,
  }
}

export const mockFiles: FileItem[] = [
  {
    id: "f1",
    name: "Engineering",
    type: "folder",
    size: 0,
    modifiedAt: "2026-02-14T10:00:00Z",
    createdAt: "2025-06-01T08:00:00Z",
    owner: "Sarah Chen",
    bucket: "prod-assets",
    path: "/Engineering",
    children: [
      {
        id: "f1-1",
        name: "Architecture",
        type: "folder",
        size: 0,
        modifiedAt: "2026-02-12T16:00:00Z",
        createdAt: "2025-06-10T08:00:00Z",
        owner: "Alex Rivera",
        bucket: "prod-assets",
        path: "/Engineering/Architecture",
        children: [
          file("f1-1-1", "system-design-v3.pdf", "pdf", 4_500_000, "/Engineering/Architecture/system-design-v3.pdf", { owner: "Alex Rivera", modifiedAt: "2026-02-12T16:00:00Z" }),
          file("f1-1-2", "api-schema.json", "code", 85_000, "/Engineering/Architecture/api-schema.json", { owner: "Alex Rivera" }),
          file("f1-1-3", "infra-diagram.png", "image", 2_200_000, "/Engineering/Architecture/infra-diagram.png", { owner: "Marcus Kim", starred: true }),
        ],
      },
      {
        id: "f1-2",
        name: "Sprint Reports",
        type: "folder",
        size: 0,
        modifiedAt: "2026-02-15T09:00:00Z",
        createdAt: "2025-08-01T08:00:00Z",
        owner: "Sarah Chen",
        bucket: "prod-assets",
        path: "/Engineering/Sprint Reports",
        children: [
          file("f1-2-1", "sprint-42-report.pdf", "pdf", 1_200_000, "/Engineering/Sprint Reports/sprint-42-report.pdf", { modifiedAt: "2026-02-15T09:00:00Z" }),
          file("f1-2-2", "sprint-41-report.pdf", "pdf", 980_000, "/Engineering/Sprint Reports/sprint-41-report.pdf"),
          file("f1-2-3", "velocity-tracker.xlsx", "spreadsheet", 340_000, "/Engineering/Sprint Reports/velocity-tracker.xlsx", { owner: "Marcus Kim" }),
        ],
      },
      file("f1-3", "onboarding-guide.docx", "document", 560_000, "/Engineering/onboarding-guide.docx", { shared: true }),
      file("f1-4", "deployment-checklist.md", "code", 12_000, "/Engineering/deployment-checklist.md"),
    ],
  },
  {
    id: "f2",
    name: "Marketing",
    type: "folder",
    size: 0,
    modifiedAt: "2026-02-16T11:30:00Z",
    createdAt: "2025-07-15T08:00:00Z",
    owner: "Elena Volkov",
    bucket: "prod-assets",
    path: "/Marketing",
    children: [
      {
        id: "f2-1",
        name: "Brand Assets",
        type: "folder",
        size: 0,
        modifiedAt: "2026-02-16T11:30:00Z",
        createdAt: "2025-07-20T08:00:00Z",
        owner: "Elena Volkov",
        bucket: "prod-assets",
        path: "/Marketing/Brand Assets",
        children: [
          file("f2-1-1", "logo-primary.svg", "image", 48_000, "/Marketing/Brand Assets/logo-primary.svg", { owner: "Elena Volkov", starred: true }),
          file("f2-1-2", "brand-guidelines-2026.pdf", "pdf", 8_700_000, "/Marketing/Brand Assets/brand-guidelines-2026.pdf", { owner: "Elena Volkov", modifiedAt: "2026-02-16T11:30:00Z" }),
          file("f2-1-3", "color-palette.png", "image", 320_000, "/Marketing/Brand Assets/color-palette.png", { owner: "Elena Volkov" }),
        ],
      },
      file("f2-2", "q4-campaign-results.xlsx", "spreadsheet", 1_800_000, "/Marketing/q4-campaign-results.xlsx", { owner: "Elena Volkov" }),
      file("f2-3", "product-demo.mp4", "video", 145_000_000, "/Marketing/product-demo.mp4", { owner: "James Wu", storageClass: "STANDARD_IA" }),
    ],
  },
  {
    id: "f3",
    name: "Finance",
    type: "folder",
    size: 0,
    modifiedAt: "2026-02-13T17:00:00Z",
    createdAt: "2025-05-01T08:00:00Z",
    owner: "Priya Sharma",
    bucket: "finance-vault",
    path: "/Finance",
    children: [
      file("f3-1", "annual-report-2025.pdf", "pdf", 12_400_000, "/Finance/annual-report-2025.pdf", { owner: "Priya Sharma", starred: true }),
      file("f3-2", "budget-forecast-q1.xlsx", "spreadsheet", 2_100_000, "/Finance/budget-forecast-q1.xlsx", { owner: "Priya Sharma" }),
      file("f3-3", "tax-documents-2025.zip", "archive", 45_000_000, "/Finance/tax-documents-2025.zip", { owner: "Priya Sharma", storageClass: "GLACIER" }),
      file("f3-4", "expense-policy.docx", "document", 180_000, "/Finance/expense-policy.docx", { owner: "Priya Sharma", shared: true }),
    ],
  },
  file("f4", "company-handbook.pdf", "pdf", 3_200_000, "/company-handbook.pdf", { shared: true, starred: true }),
  file("f5", "meeting-recording-02-10.mp4", "video", 89_000_000, "/meeting-recording-02-10.mp4", { owner: "James Wu", modifiedAt: "2026-02-10T14:30:00Z", storageClass: "STANDARD_IA" }),
  file("f6", "quarterly-data-export.csv", "spreadsheet", 5_600_000, "/quarterly-data-export.csv", { owner: "Marcus Kim", modifiedAt: "2026-02-08T12:00:00Z" }),
  file("f7", "backup-2026-02.tar.gz", "archive", 230_000_000, "/backup-2026-02.tar.gz", { owner: "Alex Rivera", storageClass: "GLACIER", modifiedAt: "2026-02-01T03:00:00Z" }),
]

// ============================================================
// Buckets
// ============================================================

export const mockBuckets: Bucket[] = [
  {
    id: "b1",
    name: "prod-assets",
    region: "us-east-1",
    storageClass: "STANDARD",
    fileCount: 12_847,
    totalSize: 48_000_000_000,
    maxSize: 100_000_000_000,
    createdAt: "2024-03-15T08:00:00Z",
    versioning: true,
    encryption: true,
    tags: ["production", "primary"],
  },
  {
    id: "b2",
    name: "finance-vault",
    region: "us-east-1",
    storageClass: "STANDARD_IA",
    fileCount: 3_421,
    totalSize: 15_200_000_000,
    maxSize: 50_000_000_000,
    createdAt: "2024-06-01T08:00:00Z",
    versioning: true,
    encryption: true,
    tags: ["finance", "compliance"],
  },
  {
    id: "b3",
    name: "media-archive",
    region: "us-west-2",
    storageClass: "GLACIER",
    fileCount: 45_230,
    totalSize: 820_000_000_000,
    maxSize: 1_000_000_000_000,
    createdAt: "2024-01-10T08:00:00Z",
    versioning: false,
    encryption: true,
    tags: ["media", "archive"],
  },
  {
    id: "b4",
    name: "dev-sandbox",
    region: "eu-west-1",
    storageClass: "STANDARD",
    fileCount: 892,
    totalSize: 2_300_000_000,
    maxSize: 10_000_000_000,
    createdAt: "2025-09-20T08:00:00Z",
    versioning: false,
    encryption: false,
    tags: ["development", "testing"],
  },
  {
    id: "b5",
    name: "compliance-logs",
    region: "us-east-1",
    storageClass: "DEEP_ARCHIVE",
    fileCount: 128_400,
    totalSize: 340_000_000_000,
    maxSize: 500_000_000_000,
    createdAt: "2023-11-01T08:00:00Z",
    versioning: true,
    encryption: true,
    tags: ["compliance", "audit", "legal"],
  },
  {
    id: "b6",
    name: "cdn-static",
    region: "us-east-1",
    storageClass: "STANDARD",
    fileCount: 5_640,
    totalSize: 8_500_000_000,
    maxSize: 25_000_000_000,
    createdAt: "2024-08-12T08:00:00Z",
    versioning: false,
    encryption: false,
    tags: ["cdn", "static", "public"],
  },
]

// ============================================================
// Audit Logs
// ============================================================

export const mockAuditLogs: AuditLog[] = [
  { id: "a1", action: "upload", user: "Sarah Chen", userEmail: "sarah@acme.co", file: "system-design-v3.pdf", bucket: "prod-assets", timestamp: "2026-02-17T09:23:00Z", ip: "192.168.1.42", details: "4.5 MB uploaded" },
  { id: "a2", action: "download", user: "Marcus Kim", userEmail: "marcus@acme.co", file: "brand-guidelines-2026.pdf", bucket: "prod-assets", timestamp: "2026-02-17T08:15:00Z", ip: "10.0.0.15", details: "Direct download" },
  { id: "a3", action: "share", user: "Elena Volkov", userEmail: "elena@acme.co", file: "company-handbook.pdf", bucket: "prod-assets", timestamp: "2026-02-16T16:42:00Z", ip: "172.16.0.8", details: "Shared with external partner" },
  { id: "a4", action: "delete", user: "Alex Rivera", userEmail: "alex@acme.co", file: "old-backup-2024.tar.gz", bucket: "media-archive", timestamp: "2026-02-16T14:10:00Z", ip: "192.168.1.100", details: "Permanent deletion" },
  { id: "a5", action: "create_bucket", user: "Sarah Chen", userEmail: "sarah@acme.co", file: "-", bucket: "staging-assets", timestamp: "2026-02-15T11:00:00Z", ip: "192.168.1.42", details: "Region: eu-west-1, Class: STANDARD" },
  { id: "a6", action: "modify", user: "Priya Sharma", userEmail: "priya@acme.co", file: "budget-forecast-q1.xlsx", bucket: "finance-vault", timestamp: "2026-02-15T09:30:00Z", ip: "10.0.0.22", details: "File overwritten (v3 -> v4)" },
  { id: "a7", action: "upload", user: "James Wu", userEmail: "james@acme.co", file: "product-demo.mp4", bucket: "prod-assets", timestamp: "2026-02-14T15:20:00Z", ip: "172.16.0.33", details: "145 MB uploaded" },
  { id: "a8", action: "view", user: "Marcus Kim", userEmail: "marcus@acme.co", file: "annual-report-2025.pdf", bucket: "finance-vault", timestamp: "2026-02-14T10:05:00Z", ip: "10.0.0.15", details: "Preview accessed" },
  { id: "a9", action: "download", user: "Elena Volkov", userEmail: "elena@acme.co", file: "logo-primary.svg", bucket: "prod-assets", timestamp: "2026-02-13T17:45:00Z", ip: "172.16.0.8" },
  { id: "a10", action: "share", user: "Sarah Chen", userEmail: "sarah@acme.co", file: "onboarding-guide.docx", bucket: "prod-assets", timestamp: "2026-02-13T12:00:00Z", ip: "192.168.1.42", details: "Shared with new hires team" },
  { id: "a11", action: "upload", user: "Alex Rivera", userEmail: "alex@acme.co", file: "backup-2026-02.tar.gz", bucket: "media-archive", timestamp: "2026-02-12T03:00:00Z", ip: "192.168.1.100", details: "Automated backup - 230 MB" },
  { id: "a12", action: "modify", user: "Marcus Kim", userEmail: "marcus@acme.co", file: "velocity-tracker.xlsx", bucket: "prod-assets", timestamp: "2026-02-11T14:22:00Z", ip: "10.0.0.15", details: "Sprint 42 data added" },
  { id: "a13", action: "delete", user: "Priya Sharma", userEmail: "priya@acme.co", file: "draft-budget.xlsx", bucket: "finance-vault", timestamp: "2026-02-10T11:00:00Z", ip: "10.0.0.22", details: "Moved to trash" },
  { id: "a14", action: "download", user: "James Wu", userEmail: "james@acme.co", file: "meeting-recording-02-10.mp4", bucket: "prod-assets", timestamp: "2026-02-10T16:30:00Z", ip: "172.16.0.33" },
  { id: "a15", action: "view", user: "Sarah Chen", userEmail: "sarah@acme.co", file: "expense-policy.docx", bucket: "finance-vault", timestamp: "2026-02-09T08:45:00Z", ip: "192.168.1.42" },
]

// ============================================================
// Cost Data
// ============================================================

export const mockCostData: CostEntry[] = [
  { month: "Sep 2025", storage: 1_420, requests: 320, transfer: 580, total: 2_320 },
  { month: "Oct 2025", storage: 1_510, requests: 380, transfer: 620, total: 2_510 },
  { month: "Nov 2025", storage: 1_650, requests: 410, transfer: 690, total: 2_750 },
  { month: "Dec 2025", storage: 1_780, requests: 350, transfer: 540, total: 2_670 },
  { month: "Jan 2026", storage: 1_890, requests: 420, transfer: 710, total: 3_020 },
  { month: "Feb 2026", storage: 2_010, requests: 460, transfer: 780, total: 3_250 },
]

// ============================================================
// Users & Organization
// ============================================================

export const mockUsers: User[] = [
  { id: "u1", name: "Sarah Chen", email: "sarah@acme.co", role: "admin", lastActive: "2026-02-17T09:23:00Z" },
  { id: "u2", name: "Alex Rivera", email: "alex@acme.co", role: "admin", lastActive: "2026-02-16T14:10:00Z" },
  { id: "u3", name: "Marcus Kim", email: "marcus@acme.co", role: "editor", lastActive: "2026-02-17T08:15:00Z" },
  { id: "u4", name: "Elena Volkov", email: "elena@acme.co", role: "editor", lastActive: "2026-02-16T16:42:00Z" },
  { id: "u5", name: "James Wu", email: "james@acme.co", role: "editor", lastActive: "2026-02-14T15:20:00Z" },
  { id: "u6", name: "Priya Sharma", email: "priya@acme.co", role: "viewer", lastActive: "2026-02-15T09:30:00Z" },
]

export const mockOrganization: Organization = {
  id: "org-1",
  name: "Acme Corporation",
  tenantId: "tn-acme-8x4k2m",
  region: "us-east-1",
  memberCount: 42,
  plan: "enterprise",
  createdAt: "2023-06-15T08:00:00Z",
}

// ============================================================
// Helpers
// ============================================================

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function getFileIcon(type: FileType): string {
  const icons: Record<FileType, string> = {
    folder: "Folder",
    pdf: "FileText",
    image: "Image",
    document: "FileText",
    spreadsheet: "Sheet",
    archive: "Archive",
    video: "Video",
    audio: "Music",
    code: "FileCode",
    other: "File",
  }
  return icons[type]
}

export function flattenFiles(files: FileItem[]): FileItem[] {
  const result: FileItem[] = []
  for (const f of files) {
    result.push(f)
    if (f.children) {
      result.push(...flattenFiles(f.children))
    }
  }
  return result
}
