import * as React from "react";
import {
  ArrowDownToLine,
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
import { CostChart } from "@/components/audit/cost-chart";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mockCostData, formatDateTime } from "@/lib/mock-data";
import { SearchCommandDialog } from "@/components/search-command";
import { getAuditLogs } from "@/app/actions/audit";
import { getTenantsForFilter } from "@/app/actions/tenants";
import { AuditLog } from "@/lib/generated/prisma/client";
import { AuditFilters } from "@/components/audit/audit-filters";
import { ExportCsvButton } from "@/components/audit/export-csv-button";
import { AuditTable } from "@/components/audit/audit-table";
import { AuditRefreshButton } from "@/components/audit/audit-refresh-button";

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

const latestCost = mockCostData[mockCostData.length - 1];

export default async function AuditPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const action = typeof searchParams.action === 'string' ? searchParams.action : undefined;
  const timeRange = typeof searchParams.timeRange === 'string' ? searchParams.timeRange : undefined;
  const dateFrom = typeof searchParams.dateFrom === 'string' ? searchParams.dateFrom : undefined;
  const dateTo = typeof searchParams.dateTo === 'string' ? searchParams.dateTo : undefined;
  const pageParam = typeof searchParams.page === 'string' ? searchParams.page : '1';
  const page = parseInt(pageParam, 10) || 1;
  const tenantId = typeof searchParams.tenantId === 'string' ? searchParams.tenantId : undefined;

  const [result, tenantsResult] = await Promise.all([
    getAuditLogs({ action, timeRange, dateFrom, dateTo, page, limit: 10, tenantId }),
    getTenantsForFilter().catch(() => ({ success: false as const, error: "Failed" })),
  ]);
  const logs = result.success ? (result.data as any[]) : [];
  const pagination = result.success ? (result as any).pagination : null;
  const tenants = tenantsResult.success ? (tenantsResult as any).data : [];

  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Audit & Sync Logs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Audit & Sync Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor storage costs, manage file syncing activities, and review
              user audit logs.
            </p>
          </div>

     
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <AuditFilters tenants={tenants} />
                <div className="flex items-center gap-2">
                  <AuditRefreshButton />
                  <ExportCsvButton logs={logs} />
                </div>
              </div>

              <AuditTable logs={logs} pagination={pagination} />
           
        </div>
      </div>
    </>
  );
}
