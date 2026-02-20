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
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
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
  const [buckets, setBuckets] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [accounts, setAccounts] = React.useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>('')

  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterAccountId, setFilterAccountId] = React.useState('')

  // Pagination state
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(true)
  const observerTarget = React.useRef(null)

  const [syncing, setSyncing] = React.useState<string | null>(null)

  const getAuthHeader = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
    return token ? { 'Authorization': `Bearer ${token}` } : {}
  }

  const fetchBuckets = async (pageNum: number, isNewFilter: boolean = false) => {
    try {
      if (pageNum === 1) setLoading(true)
      else setLoadingMore(true)

      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '10',
        search: searchQuery,
      })
      if (filterAccountId) params.append('accountId', filterAccountId)

      const res = await fetch(`/api/buckets?${params.toString()}`, {
        headers: { ...getAuthHeader() }
      })

      if (res.ok) {
        const result = await res.json()
        const { data, metadata } = result

        if (isNewFilter || pageNum === 1) {
          setBuckets(data)
        } else {
          setBuckets(prev => [...prev, ...data])
        }

        setHasMore(metadata.page < metadata.totalPages)
        setPage(metadata.page)
      } else {
        toast.error("Failed to fetch buckets")
      }
    } catch (error) {
      toast.error("Failed to fetch buckets")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchBuckets(1, true)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, filterAccountId])

  // Infinite scroll observer
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          const nextPage = page + 1
          fetchBuckets(nextPage)
        }
      },
      { threshold: 1.0 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current)
      }
    }
  }, [hasMore, loading, loadingMore, page])


  const handleSync = async (bucketId: string) => {
    setSyncing(bucketId)
    try {
      const res = await fetch(`/api/buckets/${bucketId}/sync`, {
        method: 'POST',
        headers: { ...getAuthHeader() }
      })
      if (res.ok) {
        toast.success("Bucket synced successfully")
        // Refresh current view
        setPage(1)
        fetchBuckets(1, true)
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to sync bucket")
      }
    } catch {
      toast.error("Failed to sync bucket")
    } finally {
      setSyncing(null)
    }
  }

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts?isActive=true', {
        headers: { ...getAuthHeader() }
      })
      if (res.ok) {
        const data = await res.json()
        setAccounts(data)
        if (data.length > 0) setSelectedAccountId(data[0].id)
      }
    } catch {
      toast.error('Failed to fetch accounts')
    }
  }

  // Fetch accounts when dialog opens
  React.useEffect(() => {
    if (createOpen) fetchAccounts()
  }, [createOpen])

  // Also fetch accounts for the filter dropdown
  React.useEffect(() => {
    fetchAccounts()
  }, [])

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const name = formData.get('name') as string
    const region = formData.get('region') as string
    const versioning = formData.get('versioning') === 'on'
    const encryption = formData.get('encryption') === 'on'

    if (!selectedAccountId) {
      toast.error('Please select an AWS account')
      return
    }

    try {
      const res = await fetch('/api/buckets', {
        method: 'POST',
        body: JSON.stringify({
          name,
          region,
          accountId: selectedAccountId,
          versioning,
          encryption
        }),
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        }
      })

      if (res.ok) {
        toast.success("Bucket created successfully on AWS S3")
        setCreateOpen(false)
        form.reset()
        setPage(1)
        fetchBuckets(1, true)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data?.error || "Failed to create bucket")
      }
    } catch (error) {
      toast.error("Error creating bucket")
    }
  }

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
                <form onSubmit={handleCreateBucket} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>AWS Account</Label>
                    {accounts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No AWS accounts found. Please add one in Settings.
                      </p>
                    ) : (
                      <Select
                        value={selectedAccountId}
                        onValueChange={setSelectedAccountId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc: any) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bucket-name">Bucket Name</Label>
                    <Input id="bucket-name" name="name" placeholder="my-bucket-name" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Region</Label>
                    <Select name="region" defaultValue="us-east-1">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                        <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                        <SelectItem value="eu-west-1">EU (Ireland)</SelectItem>
                        <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                        <SelectItem value="ap-south-1">Asia Pacific (Mumbai)</SelectItem>
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
                    <Switch name="versioning" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Encryption</Label>
                      <p className="text-xs text-muted-foreground">
                        AES-256 server-side encryption
                      </p>
                    </div>
                    <Switch defaultChecked name="encryption" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      Create Bucket
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search buckets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select
              value={filterAccountId}
              onValueChange={(value) => setFilterAccountId(value === "ALL" ? "" : value)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Accounts</SelectItem>
                {accounts.map((acc: any) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => {
              setPage(1)
              fetchBuckets(1, true)
            }}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh</span>
            </Button>
          </div>

          {/* Bucket Grid */}
          {loading && page === 1 ? (
            <div className="text-center py-10">Loading buckets...</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {buckets.map((bucket) => {
                const usagePercent = bucket.maxSize ? Math.round(
                  (bucket.totalSize / bucket.maxSize) * 100
                ) : 0
                return (
                  <div key={bucket.id} className="relative group p-0">
                    <Link href={`/files?bucketId=${bucket.id}`} className="block h-full">
                      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
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
                          <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSync(bucket.id)
                              }}
                              disabled={syncing === bucket.id}
                            >
                              <RefreshCw className={`h-4 w-4 ${syncing === bucket.id ? 'animate-spin' : ''}`} />
                              <span className="sr-only">Sync</span>
                            </Button>
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
                                <DropdownMenuItem asChild>
                                  <Link href={`/files?bucketId=${bucket.id}`}>
                                    <FolderOpen className="mr-2 h-4 w-4" />
                                    Browse Files
                                  </Link>
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
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="secondary"
                              className={storageClassColors[bucket.storageClass] || "bg-gray-100 text-gray-800"}
                            >
                              {storageClassLabels[bucket.storageClass] || bucket.storageClass}
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
                              {(bucket.fileCount || 0).toLocaleString()} files
                            </span>
                            <span>Created {formatDate(bucket.createdAt)}</span>
                          </div>
                          {bucket.tags && bucket.tags.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Tag className="h-3 w-3 text-muted-foreground" />
                              {bucket.tags.map((tag: string) => (
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
                    </Link>
                  </div>
                )
              })}

              {/* Sentinel for infinite scroll */}
              <div ref={observerTarget} className="h-4 w-full" />

              {loadingMore && (
                <div className="col-span-full text-center py-4">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
