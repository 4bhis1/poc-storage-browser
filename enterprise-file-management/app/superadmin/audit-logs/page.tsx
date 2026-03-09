import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { getAuditLogs } from "@/app/actions/audit";
import { AuditFilters } from "@/components/audit/audit-filters";
import { ExportCsvButton } from "@/components/audit/export-csv-button";
import { AuditTable } from "@/components/audit/audit-table";
import { AuditRefreshButton } from "@/components/audit/audit-refresh-button";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SuperAdminAuditLogsPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLATFORM_ADMIN") {
    return redirect("/login");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const action = typeof searchParams.action === 'string' ? searchParams.action : undefined;
  const timeRange = typeof searchParams.timeRange === 'string' ? searchParams.timeRange : undefined;
  const dateFrom = typeof searchParams.dateFrom === 'string' ? searchParams.dateFrom : undefined;
  const dateTo = typeof searchParams.dateTo === 'string' ? searchParams.dateTo : undefined;
  const pageParam = typeof searchParams.page === 'string' ? searchParams.page : '1';
  const page = parseInt(pageParam, 10) || 1;

  const result = await getAuditLogs({ action, timeRange, dateFrom, dateTo, page, limit: 10 });
  const logs = result.success ? (result.data as any[]) : [];
  const pagination = result.success ? (result as any).pagination : null;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Global Platform Audit Logs</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Global Platform Audit Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor activities across all tenants, users, and buckets on the platform.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <AuditFilters />
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
