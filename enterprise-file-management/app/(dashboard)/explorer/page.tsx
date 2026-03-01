"use client"

import * as React from "react"
import {
  Archive,
  File,
  FileCode,
  FileText,
  FolderOpen,
  Image,
  Music,
  RefreshCw,
  Search,
  Sheet,
  Video,
  X,
} from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Input } from "@/components/ui/input"
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
import { formatBytes, formatDate } from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"
import { useAuth } from "@/components/providers/AuthProvider"
import { fetchWithAuth } from "@/lib/api"
import { toast } from "sonner"
import { FileViewer } from "@/components/file-viewer"

// Extended type based on API response
export type FileType = "folder" | "pdf" | "image" | "document" | "spreadsheet" | "archive" | "video" | "audio" | "code" | "other"

export interface ApiFileItem {
  id: string
  name: string
  key: string
  type: FileType
  size: number
  modifiedAt: string
  owner: string
  ownerId: string
  bucketName: string
  bucketId: string
  tenantId: string
}

const fileIcons: Record<FileType, React.ElementType> = {
  folder: FolderOpen,
  pdf: FileText,
  image: Image,
  document: FileText,
  spreadsheet: Sheet,
  archive: Archive,
  video: Video,
  audio: Music,
  code: FileCode,
  other: File,
}

const fileTypeFilters: FileType[] = [
  "document",
  "spreadsheet",
  "pdf",
  "image",
  "archive",
  "video",
  "code",
]

export default function ExplorerPage() {
  const { user } = useAuth()
  const [query, setQuery] = React.useState("")
  const [activeFilters, setActiveFilters] = React.useState<Set<FileType>>(new Set())
  const [files, setFiles] = React.useState<ApiFileItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(true)
  const observerTarget = React.useRef(null)
  const [debounceTimeout, setDebounceTimeout] = React.useState<NodeJS.Timeout | null>(null)
  
  const [teammates, setTeammates] = React.useState<{id: string, name: string, email: string}[]>([])
  const [filterCreator, setFilterCreator] = React.useState<string>("ALL")
  
  const [selectedFile, setSelectedFile] = React.useState<ApiFileItem | null>(null)
  const [viewerOpen, setViewerOpen] = React.useState(false)

  React.useEffect(() => {
    const fetchTeammates = async () => {
      try {
        const res = await fetchWithAuth('/api/teammates')
        if (res.ok) {
          const data = await res.json()
          setTeammates(data)
        }
      } catch (err) {
        console.error('Failed to fetch teammates', err)
      }
    }
    fetchTeammates()
  }, [])

  const fetchFiles = React.useCallback(async (pageNum: number, searchQuery: string, filters: Set<FileType>, creatorId: string, isNewFilter: boolean = false) => {
    try {
      if (pageNum === 1) setLoading(true)
      else setLoadingMore(true)
      
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const url = new URL('/api/explorer', window.location.origin)
      if (searchQuery.trim()) url.searchParams.append('q', searchQuery.trim())
      
      if (creatorId !== "ALL") url.searchParams.append('createdBy', creatorId)

      if (filters.size > 0) {
        url.searchParams.append('types', Array.from(filters).join(','))
      }

      url.searchParams.append('page', pageNum.toString())
      url.searchParams.append('limit', '20')
      
      const res = await fetchWithAuth(url.toString())
      if (res.ok) {
        const result = await res.json()
        const { data, metadata } = result
        
        if (isNewFilter || pageNum === 1) {
          setFiles(data)
        } else {
          setFiles(prev => [...prev, ...data])
        }
        
        setHasMore(metadata.page < metadata.totalPages)
        setPage(metadata.page)
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to fetch files")
        setHasMore(false)
      }
    } catch (err) {
      console.error('Failed to fetch explorer files:', err)
      toast.error("Failed to fetch files")
      setHasMore(false)
    } finally {
      if (pageNum === 1) setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  React.useEffect(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout)
    const timeout = setTimeout(() => {
      setPage(1)
      fetchFiles(1, query, activeFilters, filterCreator, true)
    }, 300)
    setDebounceTimeout(timeout)
    return () => clearTimeout(timeout)
  }, [query, activeFilters, filterCreator, fetchFiles])

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          const nextPage = page + 1
          fetchFiles(nextPage, query, activeFilters, filterCreator)
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
  }, [hasMore, loading, loadingMore, page, query, activeFilters, filterCreator, fetchFiles])

  const toggleFilter = (type: FileType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
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
              <BreadcrumbPage>File Explorer</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Search Input */}
          <div className="space-y-4">
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by file name, path, or owner..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 h-11 text-base"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setQuery("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Press{" "}
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">Cmd</span>K
              </kbd>{" "}
              for quick search
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Created By:</span>
              <Select value={filterCreator} onValueChange={setFilterCreator}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Users</SelectItem>
                  {teammates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name || t.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground mr-1 hidden sm:inline">Type:</span>
              {fileTypeFilters.map((type) => (
                <Badge
                  key={type}
                  variant={activeFilters.has(type) ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => toggleFilter(type)}
                >
                  {type}
                </Badge>
              ))}
              {(activeFilters.size > 0 || filterCreator !== "ALL") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setActiveFilters(new Set())
                    setFilterCreator("ALL")
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {loading && page === 1 ? 'Searching...' : `${files.length} result${files.length !== 1 ? "s" : ""}`}
              {query && !loading && ` for "${query}"`}
            </p>

            {files.length > 0 ? (
              <div className="rounded-lg border overflow-hidden w-full">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[40%]">Name</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Bucket
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Size
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Modified
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        By
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file) => {
                      const Icon = fileIcons[file.type] || fileIcons.other
                      return (
                        <TableRow 
                          key={file.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedFile(file)
                            setViewerOpen(true)
                          }}
                        >
                          <TableCell className="align-top">
                            <div className="flex items-start gap-2.5">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <span
                                className="text-sm font-medium break-all leading-snug"
                                title={file.name}
                              >
                                {file.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground align-top break-words">
                            {file.bucketName}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground align-top whitespace-nowrap">
                            {formatBytes(file.size)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground align-top whitespace-nowrap">
                            {formatDate(file.modifiedAt)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground align-top break-words">
                            {file.owner}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No files found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search term or adjust your filters
                </p>
              </div>
            )}

            <div ref={observerTarget} className="h-4 w-full" />
            
            {loadingMore && (
              <div className="text-center py-4">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary" />
              </div>
            )}
          </div>
        </div>
      </div>

      <FileViewer 
        file={selectedFile} 
        open={viewerOpen} 
        onOpenChange={setViewerOpen} 
      />
    </>
  )
}
