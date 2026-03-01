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

export function AuditTable({ logs }: { logs: any[] }) {
  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
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
                  onClick={() => toggleRow(log.id)}
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
                {expandedRows[log.id] && (
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={6} className="p-0 border-b-0">
                      <div className="p-4 bg-muted/30 inner-shadow text-xs overflow-x-auto">
                        <pre className="font-mono text-muted-foreground whitespace-pre-wrap m-0">
                          {JSON.stringify(details, null, 2).replace(/^{|}$/g, "") || "No details available"}
                        </pre>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
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
    </div>
  );
}
