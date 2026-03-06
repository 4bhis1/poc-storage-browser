import { getPlatformStats } from "@/app/actions/platform-stats"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Building2, Users, HardDrive, FolderOpen, Cloud, Bot,
  ArrowUpRight, CheckCircle2, AlertCircle, Clock, Plus, Eye
} from "lucide-react"
import Link from "next/link"
import { formatBytes } from "@/lib/mock-data"

function StatCard({ title, value, sub, icon: Icon, href }: {
  title: string; value: string | number; sub?: string; icon: React.ElementType; href?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {href && (
          <Link href={href} className="text-xs text-primary flex items-center gap-1 mt-2 hover:underline">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function AwsStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline" className="text-xs">None</Badge>
  if (status === "CONNECTED") return <Badge variant="default" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Connected</Badge>
  if (status === "FAILED" || status === "DISCONNECTED") return <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="h-3 w-3" />{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
  return <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />Pending</Badge>
}

export default async function SuperAdminDashboardPage() {
  const stats = await getPlatformStats()

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Dashboard</h1>
          <p className="text-muted-foreground text-sm">Overview of all tenants, infrastructure, and activity.</p>
        </div>
        <Button asChild>
          <Link href="/superadmin/tenants">
            <Plus className="h-4 w-4 mr-2" />
            Create Tenant
          </Link>
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Tenants" value={stats.tenantCount} sub="registered orgs" icon={Building2} href="/superadmin/tenants" />
        <StatCard title="Active Users" value={stats.userCount} sub="across all tenants" icon={Users} />
        <StatCard title="Total Files" value={stats.totalFiles.toLocaleString()} sub={formatBytes(stats.totalStorageBytes)} icon={FolderOpen} />
        <StatCard title="Storage Used" value={formatBytes(stats.totalStorageBytes)} sub={`${stats.bucketCount} buckets`} icon={HardDrive} />
        <StatCard title="AWS Accounts" value={`${stats.awsConnected}/${stats.awsTotal}`} sub="connected" icon={Cloud} href="/superadmin/tenants" />
        <StatCard title="Active Bots" value={stats.botCount} sub="online agents" icon={Bot} />
      </div>

      {/* AWS Health + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AWS Account Health</CardTitle>
            <CardDescription>Cross-account integration status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Connected
              </div>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.awsConnected}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <Clock className="h-4 w-4" /> Pending
              </div>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.awsPending}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" /> Failed
              </div>
              <span className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.awsFailed}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <Link href="/superadmin/tenants"><Building2 className="h-4 w-4" />Manage Tenants</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <Link href="/superadmin/buckets"><HardDrive className="h-4 w-4" />View Buckets</Link>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <Link href="/superadmin/tenants"><Cloud className="h-4 w-4" />AWS Accounts</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Audit */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" asChild>
              <Link href="/superadmin/users"><Eye className="h-3 w-3" />View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentAuditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{log.userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{log.action.replace(/_/g, " ")}</p>
                  </div>
                  <Badge variant={log.status === "SUCCESS" ? "secondary" : "destructive"} className="text-[10px] shrink-0">
                    {log.status}
                  </Badge>
                </div>
              ))}
              {stats.recentAuditLogs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Overview Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Tenants</CardTitle>
            <CardDescription>Latest registered organizations</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
            <Link href="/superadmin/tenants">View all <ArrowUpRight className="h-3 w-3" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Buckets</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>AWS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topTenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/superadmin/tenants/${t.id}`} className="flex items-center gap-2 hover:underline group">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Building2 className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-primary">{t.name}</p>
                        {t.isHubTenant && <Badge variant="outline" className="text-[10px] px-1 py-0">Hub</Badge>}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{t.userCount}</TableCell>
                  <TableCell className="text-sm">{t.bucketCount}</TableCell>
                  <TableCell className="text-sm">{formatBytes(t.storageBytes)}</TableCell>
                  <TableCell><AwsStatusBadge status={t.awsStatus} /></TableCell>
                </TableRow>
              ))}
              {stats.topTenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No tenants yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
