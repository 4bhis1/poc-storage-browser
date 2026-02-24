"use client"

import * as React from "react"
import {
  ArrowDownToLine,
  Download,
  Eye,
  FileUp,
  Plus,
  Share2,
  Trash2,
  Upload,
  UserPlus,
  RefreshCw,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  mockAuditLogs,
  mockCostData,
  formatDateTime,
} from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"

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
}

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
}

const latestCost = mockCostData[mockCostData.length - 1]

export default function AuditPage() {
  const [actionFilter, setActionFilter] = React.useState<string>("all")

  const filteredLogs =
    actionFilter === "all"
      ? mockAuditLogs
      : mockAuditLogs.filter((log) => log.action === actionFilter)

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
              Monitor storage costs, manage file syncing activities, and review user audit logs.
            </p>
          </div>

          <Tabs defaultValue="costs" className="space-y-6">
            <TabsList>
              <TabsTrigger value="costs">Cost Overview</TabsTrigger>
              <TabsTrigger value="logs">Sync & Activity Logs</TabsTrigger>
            </TabsList>

            {/* Cost Overview */}
            <TabsContent value="costs" className="space-y-6">
              {/* Cost Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Storage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      ${latestCost.storage.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      GB x Tier Rate
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Requests
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      ${latestCost.requests.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      GET/PUT/LIST ops
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Data Transfer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">
                      ${latestCost.transfer.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Outbound data
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Monthly
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold text-primary">
                      ${latestCost.total.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      +7.6% from last month
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Cost Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Cost Breakdown Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mockCostData}>
                        <defs>
                          <linearGradient
                            id="colorStorage"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-chart-1)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-chart-1)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                          <linearGradient
                            id="colorRequests"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-chart-2)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-chart-2)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                          <linearGradient
                            id="colorTransfer"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-chart-5)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-chart-5)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          stroke="var(--color-muted-foreground)"
                        />
                        <YAxis
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          stroke="var(--color-muted-foreground)"
                          tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--color-popover)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-md)",
                            color: "var(--color-popover-foreground)",
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => [
                            `$${value}`,
                            name.charAt(0).toUpperCase() + name.slice(1),
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12 }}
                          formatter={(value: string) =>
                            value.charAt(0).toUpperCase() + value.slice(1)
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="storage"
                          stroke="var(--color-chart-1)"
                          strokeWidth={2}
                          fill="url(#colorStorage)"
                        />
                        <Area
                          type="monotone"
                          dataKey="requests"
                          stroke="var(--color-chart-2)"
                          strokeWidth={2}
                          fill="url(#colorRequests)"
                        />
                        <Area
                          type="monotone"
                          dataKey="transfer"
                          stroke="var(--color-chart-5)"
                          strokeWidth={2}
                          fill="url(#colorTransfer)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cost Formula */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Cost Formula
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md bg-secondary p-4 font-mono text-sm">
                    <p className="text-foreground">
                      {'Total Monthly Cost = (Storage GB x Tier Rate) + (Request Count x Request Rate) + (Data Transfer Out GB x Transfer Rate)'}
                    </p>
                    <div className="mt-3 space-y-1 text-muted-foreground text-xs">
                      <p>{'Standard: $0.023/GB | IA: $0.0125/GB | Glacier: $0.004/GB | Deep Archive: $0.00099/GB'}</p>
                      <p>{'GET: $0.0004/1K requests | PUT: $0.005/1K requests'}</p>
                      <p>{'Data Transfer Out: $0.09/GB (first 10 TB)'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audit Logs */}
            <TabsContent value="logs" className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Select
                    value={actionFilter}
                    onValueChange={setActionFilter}
                  >
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Filter by action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="upload">Upload</SelectItem>
                      <SelectItem value="download">Download</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                      <SelectItem value="share">Share</SelectItem>
                      <SelectItem value="modify">Modify</SelectItem>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="create_bucket">
                        Create Bucket
                      </SelectItem>
                      <SelectItem value="invite_user">
                        Invite User
                      </SelectItem>
                      <SelectItem value="sync">
                        Folder Sync
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    toast.success("Audit log export started")
                  }
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="hidden md:table-cell">
                        File
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Bucket
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        IP Address
                      </TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => {
                      const Icon = actionIcons[log.action] || Eye
                      return (
                        <TableRow key={log.id}>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`gap-1 capitalize ${
                                actionColors[log.action] || ""
                              }`}
                            >
                              <Icon className="h-3 w-3" />
                              {log.action.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">
                                {log.user}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {log.userEmail}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                            {log.file}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {log.bucket}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground font-mono text-xs">
                            {log.ip}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDateTime(log.timestamp)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  )
}
