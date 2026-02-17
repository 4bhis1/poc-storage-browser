"use client"

import * as React from "react"
import {
  Globe,
  HardDrive,
  Lock,
  MoreHorizontal,
  Plus,
  Settings,
  Shield,
  Trash2,
  FolderOpen,
  Tag,
} from "lucide-react"
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
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { mockBuckets, formatBytes, formatDate } from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"

const storageClassColors: Record<string, string> = {
  STANDARD: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  STANDARD_IA: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  GLACIER: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  DEEP_ARCHIVE: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
}

const storageClassLabels: Record<string, string> = {
  STANDARD: "Standard",
  STANDARD_IA: "Infrequent Access",
  GLACIER: "Glacier",
  DEEP_ARCHIVE: "Deep Archive",
}

export default function BucketsPage() {
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Buckets</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Buckets</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your S3 storage buckets and configurations.
              </p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Create Bucket
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Bucket</DialogTitle>
                  <DialogDescription>
                    Configure a new S3 bucket for your organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bucket-name">Bucket Name</Label>
                    <Input id="bucket-name" placeholder="my-bucket-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Region</Label>
                    <Select defaultValue="us-east-1">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                        <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                        <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                        <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Storage Class</Label>
                    <Select defaultValue="STANDARD">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STANDARD">Standard</SelectItem>
                        <SelectItem value="STANDARD_IA">Infrequent Access</SelectItem>
                        <SelectItem value="GLACIER">Glacier</SelectItem>
                        <SelectItem value="DEEP_ARCHIVE">Deep Archive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Versioning</Label>
                      <p className="text-xs text-muted-foreground">
                        Keep multiple versions of objects
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Encryption</Label>
                      <p className="text-xs text-muted-foreground">
                        AES-256 server-side encryption
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        toast.success("Bucket created successfully")
                        setCreateOpen(false)
                      }}
                    >
                      Create Bucket
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Bucket Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mockBuckets.map((bucket) => {
              const usagePercent = Math.round(
                (bucket.totalSize / bucket.maxSize) * 100
              )
              return (
                <Card key={bucket.id} className="group">
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <HardDrive className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-medium">
                          {bucket.name}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Globe className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {bucket.region}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <FolderOpen className="mr-2 h-4 w-4" />
                          Browse Files
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Settings className="mr-2 h-4 w-4" />
                          Edit Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive-foreground">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Bucket
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={storageClassColors[bucket.storageClass]}
                      >
                        {storageClassLabels[bucket.storageClass]}
                      </Badge>
                      {bucket.encryption && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-2.5 w-2.5" />
                          Encrypted
                        </Badge>
                      )}
                      {bucket.versioning && (
                        <Badge variant="secondary" className="gap-1">
                          <Shield className="h-2.5 w-2.5" />
                          Versioned
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {formatBytes(bucket.totalSize)} of{" "}
                          {formatBytes(bucket.maxSize)}
                        </span>
                        <span className="text-muted-foreground font-medium">
                          {usagePercent}%
                        </span>
                      </div>
                      <Progress
                        value={usagePercent}
                        className="h-1.5"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span>
                        {bucket.fileCount.toLocaleString()} files
                      </span>
                      <span>Created {formatDate(bucket.createdAt)}</span>
                    </div>
                    {bucket.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {bucket.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
