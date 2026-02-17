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
  Share2,
  Trash2,
  Upload,
} from "lucide-react"
import Link from "next/link"
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
import {
  mockAuditLogs,
  mockBuckets,
  mockCostData,
  formatBytes,
  formatDateTime,
} from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"

const stats = [
  {
    title: "Total Files",
    value: "196,430",
    change: "+2,340 this month",
    icon: FolderOpen,
  },
  {
    title: "Total Storage",
    value: "1.23 TB",
    change: "71% of quota",
    icon: HardDrive,
  },
  {
    title: "Active Buckets",
    value: "6",
    change: "1 new this month",
    icon: Archive,
  },
  {
    title: "Monthly Cost",
    value: "$3,250",
    change: "+7.6% from last month",
    icon: CreditCard,
  },
]

const actionIcons: Record<string, React.ElementType> = {
  upload: Upload,
  download: Download,
  share: Share2,
  delete: Trash2,
  create_bucket: Plus,
  modify: FileUp,
  view: Eye,
}

const storageByBucket = mockBuckets.map((b) => ({
  name: b.name,
  size: b.totalSize / 1_000_000_000,
}))

export default function OverviewPage() {
  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
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
                  <div className="text-2xl font-semibold tracking-tight">
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.change}
                  </p>
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
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockCostData}>
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
                        formatter={(value: number) => [`$${value}`, "Total"]}
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
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={storageByBucket} layout="vertical">
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
                          `${value.toFixed(1)} GB`,
                          "Size",
                        ]}
                      />
                      <Bar
                        dataKey="size"
                        fill="var(--color-primary)"
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
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
                <Link href="/search" className="block">
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
                  {mockAuditLogs.slice(0, 6).map((log) => {
                    const Icon = actionIcons[log.action] || Eye
                    return (
                      <div key={log.id} className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {log.user}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {log.action}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {log.file} in {log.bucket}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
