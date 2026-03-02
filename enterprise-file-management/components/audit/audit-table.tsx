"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  FileUp,
  Plus,
  Share2,
  Trash2,
  Upload,
  UserPlus,
  RefreshCw,
  Download,
} from "lucide-react";
import { formatDateTime } from "@/lib/mock-data";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const actionIcons: Record<string, React.ElementType> = {
  upload: Upload,
  download: Download,
  share: Share2,
  delete: Trash2,
  create_bucket: Plus,
  modify: FileUp,
  view: Eye,
  invite_user: UserPlus,
  sync: RefreshCw,
};

const actionColors: Record<string, string> = {
  upload: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  download: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  share: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  delete: "bg-red-500/10 text-red-600 dark:text-red-400",
  create_bucket: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  modify: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  view: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  invite_user: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  sync: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

export function AuditTable({ logs, pagination }: { logs: any[], pagination?: any }) {
  const [selectedLog, setSelectedLog] = React.useState<any | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Action</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="hidden md:table-cell">Target</TableHead>
            <TableHead className="hidden lg:table-cell">Bucket</TableHead>
            <TableHead className="hidden lg:table-cell">IP Address</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            let iconKey = "view";
            const action = log.action.toLowerCase();

            if (action.includes("upload")) iconKey = "upload";
            else if (action.includes("download")) iconKey = "download";
            else if (action.includes("delete") || action.includes("remove")) iconKey = "delete";
            else if (action.includes("share") || action.includes("permission")) iconKey = "share";
            else if (action.includes("create")) iconKey = "create_bucket";
            else if (action.includes("team") || action.includes("login")) iconKey = "invite_user";

            const Icon = actionIcons[iconKey] || Eye;

            const details = log.details || {};
            const resourceId = log.resourceId || "-";
            const resourceType = log.resource ? log.resource.split(":")[0] : "";
            const isFileEvent = resourceType === "FileObject";

            let targetDisplay = "-";
            if (action === "ip_access_denied") {
              targetDisplay = details.path ? `${details.method || ''} ${details.path}`.trim() : resourceId;
            } else if (isFileEvent) {
              targetDisplay = details.key || details.name || details.fileName || resourceId;
            } else {
              targetDisplay =
                details.teamName ||
                details.invitedEmail ||
                details.toEmail ||
                details.email ||
                details.name ||
                resourceId;
            }

            // IP Address handling: prioritize the new direct db column over details
            const ipDisplay = log.ipAddress || details.ip || "System";

            return (
              <React.Fragment key={log.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedLog(log)}
                >
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`gap-1 capitalize ${actionColors[iconKey] || actionColors["view"]}`}
                    >
                      <Icon className="h-3 w-3" />
                      {log.action.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">
                        {details.isSharedAccess ? "External User" : (log.user?.name || "Unknown")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {details.downloadedByEmail || log.user?.email || "N/A"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate" title={targetDisplay}>
                    {targetDisplay}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {(() => {
                      const rawBucket = details.bucketName || (details.bucketId ? "S3 Bucket" : resourceType);
                      const ignoredBuckets = ["Authentication", "System", "Tenant", "ResourcePolicy", "Team", "TeamMembership", "User", "Share", "FileObject", "Bucket"];
                      return ignoredBuckets.includes(rawBucket) ? "-" : rawBucket;
                    })()}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground font-mono text-xs">
                    {ipDisplay}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(new Date(log.createdAt).toISOString())}
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No audit logs found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      <Dialog open={!!selectedLog} onOpenChange={(open: boolean) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="mt-4 flex flex-col gap-6 overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0 overflow-y-auto sm:overflow-visible">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Action</h4>
                  <Badge variant="secondary" className="capitalize">
                    {selectedLog.action.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Timestamp</h4>
                  <p className="text-sm font-medium text-foreground">
                    {formatDateTime(new Date(selectedLog.createdAt).toISOString())}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">User</h4>
                  <p className="text-sm font-medium text-foreground">
                    {selectedLog.user?.name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedLog.user?.email || "No email available"}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">IP Address</h4>
                  <p className="text-sm font-mono text-foreground">
                    {selectedLog.ipAddress || (selectedLog.details && selectedLog.details.ip) || "System"}
                  </p>
                </div>
                {selectedLog.resource && (
                  <div className="col-span-1 sm:col-span-2">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Resource</h4>
                    <p className="text-sm font-mono text-foreground">{selectedLog.resource}</p>
                  </div>
                )}
                {selectedLog.resourceId && (
                  <div className="col-span-1 sm:col-span-2">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Resource ID</h4>
                    <p className="text-sm font-mono text-foreground">{selectedLog.resourceId}</p>
                  </div>
                )}
                {selectedLog.status && (
                  <div className="col-span-1 sm:col-span-2">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
                    <Badge variant={selectedLog.status === "SUCCESS" ? "default" : "destructive"}>
                      {selectedLog.status}
                    </Badge>
                  </div>
                )}
              </div>
              
              <div className="border-t pt-4 flex flex-col min-h-0 overflow-hidden">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 shrink-0">Payload Details</h4>
                <div className="bg-muted p-4 rounded-md overflow-auto text-xs text-foreground font-mono flex-1">
                  <pre>{JSON.stringify(selectedLog.details || {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pagination && pagination.totalPages >= 1 && logs.length > 0 && (
        <div className="py-4 border-t border-border mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={(e) => {
                    e.preventDefault();
                    if (pagination.currentPage > 1) handlePageChange(pagination.currentPage - 1);
                  }}
                  href="#"
                  size="default"
                  className={pagination.currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="text-sm text-muted-foreground mx-4">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext 
                  onClick={(e) => {
                    e.preventDefault();
                    if (pagination.currentPage < pagination.totalPages) handlePageChange(pagination.currentPage + 1);
                  }}
                  href="#"
                  size="default"
                  className={pagination.currentPage >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
