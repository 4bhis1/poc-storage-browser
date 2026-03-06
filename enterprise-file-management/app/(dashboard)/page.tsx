"use client"

import {
  Archive,
  ArrowUpRight,
  CreditCard,
  Download,
  Eye,
  FileUp,
  FolderOpen,
  HardDrive,
  Link2,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
  Calendar as CalendarIcon,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { format, differenceInDays } from "date-fns"
import { DateRange } from "react-day-picker"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes, formatDateTime } from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"
import { getAuditLogs, getDashboardStats, type DashboardStats } from "@/app/actions/audit"
import { getAgentStatus } from "@/app/actions/agent"
import * as React from "react"
import { useEffect, useState } from "react"
import { useAuth } from "@/components/providers/AuthProvider"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

const actionIcons: Record<string, React.ElementType> = {
  upload: Upload,
  download: Download,
  share: Share2,
  delete: Trash2,
  create_bucket: Plus,
  modify: FileUp,
  view: Eye,
}

export default function OverviewPage() {
  const { user } = useAuth()
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [timeRange, setTimeRange] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const { toast } = useToast()

  const [refreshing, setRefreshing] = React.useState(false)

  const fetchData = React.useCallback((filters?: any) => {
    setStatsLoading(true)
    getAuditLogs().then((res) => {
      if (res.success && res.data) setRecentLogs(res.data.slice(0, 6))
    })
    getAgentStatus().then((res) => {
      if (res.success) setAgentStatus(res.data)
    })
    const statsFilters = filters || { timeRange }
    if (timeRange === "custom" && dateRange?.from && dateRange?.to) {
      statsFilters.dateFrom = dateRange.from.toISOString()
      statsFilters.dateTo = dateRange.to.toISOString()
    }
    getDashboardStats(statsFilters).then((res) => {
      if (res.success) setDashboardStats(res.data)
      setStatsLoading(false)
      setRefreshing(false)
    })
  }, [timeRange, dateRange])

  useEffect(() => {
    getAuditLogs().then((res) => {
      if (res.success && res.data) {
        setRecentLogs(res.data.slice(0, 6))
      }
    })
    getAgentStatus().then((res) => {
      if (res.success) setAgentStatus(res.data)
    })
  }, []) // Audit logs + agent status loaded once

  useEffect(() => {
    if (timeRange === "custom" && (!dateRange?.from || !dateRange?.to)) {
      return
    }

    setStatsLoading(true)
    const filters: any = { timeRange }
    if (timeRange === "custom" && dateRange?.from && dateRange?.to) {
      filters.dateFrom = dateRange.from.toISOString()
      filters.dateTo = dateRange.to.toISOString()
    }

    getDashboardStats(filters).then((res) => {
      if (res.success) {
        setDashboardStats(res.data)
      }
      setStatsLoading(false)
    })
  }, [timeRange, dateRange])

  // Derive stat cards from real data
  const stats = [
    {
      title: "Total Files",
      value: statsLoading
        ? null
        : dashboardStats
        ? dashboardStats.totalFiles.toLocaleString()
        : "—",
      change: dashboardStats ? `${formatBytes(dashboardStats.totalStorageBytes)} across all buckets` : "",
      icon: FolderOpen,
    },
    {
      title: "Total Storage",
      value: statsLoading
        ? null
        : dashboardStats
        ? formatBytes(dashboardStats.totalStorageBytes)
        : "—",
      change: dashboardStats
        ? `${dashboardStats.activeBuckets} bucket${dashboardStats.activeBuckets !== 1 ? "s" : ""}`
        : "",
      icon: HardDrive,
    },
    {
      title: "Active Buckets",
      value: statsLoading
        ? null
        : dashboardStats
        ? String(dashboardStats.activeBuckets)
        : "—",
      change: "",
      icon: Archive,
    },
    {
      title: "Monthly Cost",
      value: statsLoading
        ? null
        : dashboardStats
        ? `$${dashboardStats.monthlyCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "—",
      change: "Estimated at $0.023/GB",
      icon: CreditCard,
    },
  ]

  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="flex items-center gap-2">
                  Overview
                  {user?.role && (
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                      {user.role}
                    </Badge>
                  )}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => { setRefreshing(true); fetchData() }}
            disabled={refreshing || statsLoading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>

          {timeRange === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      const days = differenceInDays(range.to, range.from)
                      if (days > 30) {
                        toast({
                          title: "Invalid Range",
                          description: "Custom date range cannot exceed 30 days.",
                          variant: "destructive"
                        })
                        return
                      }
                    }
                    setDateRange(range)
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          )}

          <Select value={timeRange} onValueChange={(val) => {
            setTimeRange(val)
            if (val !== "custom") {
              setDateRange(undefined)
            }
          }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="14d">Last 14 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Agent Status Alert */}
          {agentStatus && agentStatus.status !== 'ONLINE' && (
            <div className={`rounded-lg border-2 p-4 ${
              agentStatus.status === 'OFFLINE'
                ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'
                : 'border-slate-200 bg-slate-50 dark:bg-slate-900'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  agentStatus.status === 'OFFLINE'
                    ? 'bg-yellow-100'
                    : 'bg-slate-100'
                }`}>
                  {agentStatus.status === 'OFFLINE' ? (
                    <WifiOff className="h-5 w-5 text-yellow-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`font-semibold ${
                    agentStatus.status === 'OFFLINE'
                      ? 'text-yellow-800 dark:text-yellow-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {agentStatus.status === 'OFFLINE' ? 'Agent Offline' : 'Agent Not Connected'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {agentStatus.status === 'OFFLINE' && agentStatus.lastHeartbeatAt
                      ? `Last seen ${new Date(agentStatus.lastHeartbeatAt).toLocaleString()}`
                      : 'No heartbeat received yet'}
                  </p>
                  {agentStatus.diagnostics && agentStatus.diagnostics.total > 0 && (
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        {agentStatus.diagnostics.passed} passed
                      </span>
                      {agentStatus.diagnostics.warnings > 0 && (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-yellow-600" />
                          {agentStatus.diagnostics.warnings} warnings
                        </span>
                      )}
                      {agentStatus.diagnostics.failed > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          ✕ {agentStatus.diagnostics.failed} failed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {stat.value === null ? (
                    <>
                      <Skeleton className="h-7 w-24 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-semibold tracking-tight">
                        {stat.value}
                      </div>
                      {stat.change && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {stat.change}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            {/* Cost Trend */}
            <Card className="lg:col-span-4">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Cost Trend
                </CardTitle>
                <Link href="/audit">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    View details
                    <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  {statsLoading ? (
                    <div className="flex h-full items-end gap-2 pb-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          className="flex-1 rounded"
                          style={{ height: `${40 + i * 12}%` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dashboardStats?.costTrend ?? []}>
                        <defs>
                          <linearGradient
                            id="colorTotal"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-primary)"
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
                          formatter={(value: number) => [`$${value}`, "Est. Cost"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="var(--color-primary)"
                          strokeWidth={2}
                          fill="url(#colorTotal)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Storage by Bucket */}
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Storage by Bucket
                </CardTitle>
                <Link href="/buckets">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    Manage
                    <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  {statsLoading ? (
                    <div className="flex flex-col justify-end gap-2 h-full pb-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dashboardStats?.storageByBucket ?? []}
                        layout="vertical"
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          stroke="var(--color-muted-foreground)"
                          tickFormatter={(value) => `${value} GB`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          stroke="var(--color-muted-foreground)"
                          width={100}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--color-popover)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "var(--radius-md)",
                            color: "var(--color-popover-foreground)",
                            fontSize: 12,
                          }}
                          formatter={(value: number) => [
                            `${value.toFixed(3)} GB`,
                            "Size",
                          ]}
                        />
                        <Bar
                          dataKey="sizeGb"
                          fill="var(--color-primary)"
                          radius={[0, 4, 4, 0]}
                          barSize={18}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions + Recent Activity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            {/* Quick Actions */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/files" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Files
                  </Button>
                </Link>
                <Link href="/buckets" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Bucket
                  </Button>
                </Link>
                <Link href="/audit" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    View Audit Logs
                  </Button>
                </Link>
                <Link href="/explorer" className="block">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    Search Files
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="lg:col-span-5">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Recent Activity
                </CardTitle>
                <Link href="/audit">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    View all
                    <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentLogs.map((log) => {
                    let iconKey = "view"
                    const action = log.action.toLowerCase() || ""
                    if (action.includes("upload")) iconKey = "upload"
                    else if (action.includes("download")) iconKey = "download"
                    else if (action.includes("delete") || action.includes("remove")) iconKey = "delete"
                    else if (action.includes("share") || action.includes("permission")) iconKey = "share"
                    else if (action.includes("create")) iconKey = "create_bucket"

                    const Icon = actionIcons[iconKey] || Eye
                    const details = log.details || {}
                    const displayResource =
                      details.name ||
                      details.key ||
                      details.email ||
                      log.resourceId ||
                      log.resource

                    return (
                      <div key={log.id} className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {log.user?.name || "Unknown"}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {log.action.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {displayResource}{" "}
                            {details.bucketName ? `in ${details.bucketName}` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                    )
                  })}
                  {recentLogs.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No recent activity
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
