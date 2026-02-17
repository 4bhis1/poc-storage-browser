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
  flattenFiles,
  mockFiles,
  formatBytes,
  formatDate,
  type FileItem,
  type FileType,
} from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"

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
  "pdf",
  "image",
  "document",
  "spreadsheet",
  "archive",
  "video",
  "code",
]

const allFiles = flattenFiles(mockFiles).filter((f) => f.type !== "folder")

export default function SearchPage() {
  const [query, setQuery] = React.useState("")
  const [activeFilters, setActiveFilters] = React.useState<Set<FileType>>(
    new Set()
  )

  const toggleFilter = (type: FileType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const filteredFiles = React.useMemo(() => {
    let results = allFiles
    if (query.trim()) {
      const q = query.toLowerCase()
      results = results.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q) ||
          f.owner.toLowerCase().includes(q)
      )
    }
    if (activeFilters.size > 0) {
      results = results.filter((f) => activeFilters.has(f.type))
    }
    return results
  }, [query, activeFilters])

  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Search</BreadcrumbPage>
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground mr-1">Type:</span>
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
            {activeFilters.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setActiveFilters(new Set())}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Results */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {filteredFiles.length} result{filteredFiles.length !== 1 ? "s" : ""}
              {query && ` for "${query}"`}
            </p>

            {filteredFiles.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Path
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Size
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Modified
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Owner
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFiles.map((file) => {
                      const Icon = fileIcons[file.type]
                      return (
                        <TableRow key={file.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium truncate">
                                {file.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono text-xs">
                            {file.path}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {formatBytes(file.size)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {formatDate(file.modifiedAt)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
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
          </div>
        </div>
      </div>
    </>
  )
}
