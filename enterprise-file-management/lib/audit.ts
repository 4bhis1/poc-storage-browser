import prisma from "@/lib/prisma";
import { resolveGeo } from "@/lib/geo";

export type AuditAction =
  | "FILE_UPLOAD"
  | "FILE_UPLOAD_INITIATED"
  | "FILE_DOWNLOAD"
  | "FILE_READ"
  | "FILE_DELETE"
  | "FILE_SHARED"
  | "SHARE_UPDATED"
  | "SHARE_REVOKED"
  | "FOLDER_CREATE"
  | "MULTIPART_UPLOAD_INITIATED"
  | "TEAM_CREATED"
  | "TEAM_UPDATED"
  | "TEAM_DELETED"
  | "TEAM_MEMBER_ADDED"
  | "TEAM_MEMBER_REMOVED"
  | "TEAM_POLICIES_UPDATED"
  | "PERMISSION_ADDED"
  | "PERMISSION_REMOVED"
  | "USER_INVITED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "LOGIN"
  | "LOGOUT"
  | "IP_ACCESS_DENIED"
  | "BUCKET_CREATE"
  | "BUCKET_DELETE"
  | "TENANT_CREATED"
  | "TENANT_UPDATED"
  | "TENANT_DELETED"
  | "AGENT_CREDENTIALS_REQUESTED"
  | "USER_ASSIGNED_TENANT"
  | "USER_REMOVED_TENANT";

export type AuditStatus = "SUCCESS" | "FAILED";

export interface AuditParams {
  userId: string | null;
  action: AuditAction;
  resource: string; // e.g. "FileObject", "Team", "ResourcePolicy"
  resourceId?: string; // the actual record id (optional)
  details?: Record<string, unknown>;
  status: AuditStatus;
  ipAddress?: string; // The IP address of the requester
}

/**
 * Fire-and-forget audit log writer.
 * Call this WITHOUT await so it never blocks the HTTP response.
 *
 * Example:
 *   void logAudit({ userId, action: "FILE_UPLOAD", resource: "FileObject", details: { name, key }, status: "SUCCESS" });
 */
export function logAudit(params: AuditParams): void {
  const { userId, action, resource, resourceId, details, status, ipAddress } =
    params;

  // Run asynchronously in the background — never blocks the caller
  (async () => {
    let country: string | null = null;
    let region: string | null = null;

    if (ipAddress) {
      try {
        const geo = await resolveGeo(ipAddress);
        country = geo.country;
        region = geo.region;
      } catch {
        // Geo failure must never block the audit write
      }
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: resourceId ? `${resource}:${resourceId}` : resource,
        details: details ? JSON.stringify(details) : null,
        status,
        ipAddress,
        country,
        region,
        ...(userId ? { createdBy: userId, updatedBy: userId } : {}),
      },
    });
  })().catch((err) => {
    // Silent fail — audit must never crash the main request
    console.error("[audit] Failed to write audit log:", err);
  });
}
