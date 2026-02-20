"use client"

import * as React from "react"
import Link from "next/link"
import {
  Archive,
  ArrowUpDown,
  ChevronRight,
  Copy,
  Download,
  File,
  FileCode,
  FileText,
  FolderOpen,
  FolderPlus,
  Grid3X3,
  HardDrive,
  Image,
  List,
  MoreHorizontal,
  Move,
  Music,
  Pencil,
  RefreshCw,
  Sheet,
  Star,
  Trash2,
  Upload,
  Users,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  mockFiles,
  formatBytes,
  formatDate,
  type FileItem,
  type FileType,
} from "@/lib/mock-data"

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

const fileColors: Record<FileType, string> = {
  folder: "text-primary",
  pdf: "text-red-500",
  image: "text-emerald-500",
  document: "text-blue-500",
  spreadsheet: "text-green-500",
  archive: "text-amber-500",
  video: "text-purple-500",
  audio: "text-pink-500",
  code: "text-orange-500",
  other: "text-muted-foreground",
}

type SortKey = "name" | "size" | "modifiedAt" | "owner"
type ViewMode = "grid" | "list"

interface FileBrowserProps {
  bucketId: string | null
  onUploadClick: () => void
  onNewFolderClick: () => void
  path: { id: string, name: string }[]
  setPath: (path: { id: string, name: string }[]) => void
  refreshTrigger?: number
}

import { usePermission } from "@/lib/hooks/usePermission";
import { getAuthHeader } from "@/lib/token";

// ...

// ... (previous imports and interfaces)

export function FileBrowser({ bucketId, onUploadClick, onNewFolderClick, path, setPath, refreshTrigger = 0 }: FileBrowserProps) {
  const { can } = usePermission();
  const [viewMode, setViewMode] = React.useState<ViewMode>("list")
  const [sortKey, setSortKey] = React.useState<SortKey>("name")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [files, setFiles] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [fileToRename, setFileToRename] = React.useState<any>(null)
  const [newName, setNewName] = React.useState("")

  const currentParentId = path.length > 0 ? path[path.length - 1].id : null

  const fetchFiles = React.useCallback(async () => {
    if (!bucketId) {
      setFiles([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('bucketId', bucketId)
      if (currentParentId) params.append('parentId', currentParentId)

      const res = await fetch(`/api/file-explorer?${params.toString()}`, {
        headers: {
          ...getAuthHeader()
        }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.files) {
          setFiles(data.files)
        } else {
          setFiles([])
        }
      } else {
        toast.error("Failed to fetch files")
      }
    } catch (error) {
      toast.error("Failed to fetch files")
    } finally {
      setLoading(false)
    }
  }, [bucketId, currentParentId])

  // Permission Check
  const canUpload = can('WRITE', { resourceType: 'bucket' }); // Check global or contextual write permission

  React.useEffect(() => {
    fetchFiles()
    setSelected(new Set())
  }, [fetchFiles, refreshTrigger])

  // Sorting
  const currentFiles = React.useMemo(() => {
    return [...files].sort((a, b) => {
      // Folders first
      if (a.type === "folder" && b.type !== "folder") return -1
      if (a.type !== "folder" && b.type === "folder") return 1
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name)
        case "size":
          return (b.size || 0) - (a.size || 0)
        case "modifiedAt":
          return (
            new Date(b.modifiedAt).getTime() -
            new Date(a.modifiedAt).getTime()
          )
        case "owner":
          return (a.owner || '').localeCompare(b.owner || '')
        default:
          return 0
      }
    })
  }, [files, sortKey])

  const navigateToFolder = (folder: { id: string, name: string }) => {
    setPath([...path, folder])
  }

  const navigateToBreadcrumb = (index: number) => {
    setPath(path.slice(0, index))
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === currentFiles.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(currentFiles.map((f) => f.id)))
    }
  }

  const handleAction = async (action: string, file: any) => {
    if (action === "Rename") {
      setFileToRename(file)
      setNewName(file.name)
      setRenameOpen(true)
      return
    }

    if (action === "Delete") {
      if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return

      try {
        const res = await fetch(`/api/files/${file.id}`, {
          method: "DELETE",
          headers: { ...getAuthHeader() }
        })
        if (res.ok) {
          toast.success("File deleted successfully")
          fetchFiles()
          if (selected.has(file.id)) toggleSelect(file.id)
        } else {
          toast.error("Failed to delete file")
        }
      } catch (error) {
        toast.error("Error deleting file")
      }
      return
    }

    if (action === "Download") {
      try {
        const res = await fetch(`/api/files/presigned?bucketId=${file.bucketId || bucketId}&name=${file.name}&action=download&parentId=${file.parentId || ''}`, {
          headers: { ...getAuthHeader() }
        })
        if (res.ok) {
          const { url } = await res.json()
          if (url) {
            window.open(url, '_blank')
          } else {
            toast.error("Failed to generate download URL")
          }
        } else {
          toast.error("Failed to download file")
        }
      } catch (error) {
        toast.error("Error downloading file")
      }
      return
    }

    toast.success(`${action}: ${file.name}`)
  }

  const confirmRename = async () => {
    if (!fileToRename || !newName) return

    try {
      const res = await fetch(`/api/files/${fileToRename.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader()
        },
        body: JSON.stringify({ name: newName })
      })

      if (res.ok) {
        toast.success("File renamed successfully")
        fetchFiles()
        setRenameOpen(false)
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to rename file")
      }
    } catch (error) {
      toast.error("Error renaming file")
    }
  }

  const FileContextMenu = ({ file }: { file: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleAction("Download", file)}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("Copy link", file)}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("Share", file)}>
          <Users className="mr-2 h-4 w-4" />
          Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleAction("Rename", file)}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAction("Move", file)}>
          <Move className="mr-2 h-4 w-4" />
          Move
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleAction("Delete", file)}
          className="text-destructive-foreground"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm">
          <button
            onClick={() => navigateToBreadcrumb(0)}
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            All Files
          </button>
          {path.map((segment, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                onClick={() => navigateToBreadcrumb(i + 1)}
                className={
                  i === path.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground transition-colors"
                }
              >
                {segment.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <ArrowUpDown className="mr-1 h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="size">Size</SelectItem>
              <SelectItem value="modifiedAt">Modified</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fetchFiles()}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh files</span>
          </Button>

          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">List view</span>
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
              <span className="sr-only">Grid view</span>
            </Button>
          </div>

          {canUpload && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onNewFolderClick}>
                <FolderPlus className="h-4 w-4" />
                New Folder
              </Button>
              <Button size="sm" className="gap-1.5" onClick={onUploadClick}>
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Selected count */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => toast.success(`Downloaded ${selected.size} files`)}
          >
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive-foreground"
            onClick={() => {
              toast.success(`Deleted ${selected.size} files`)
              setSelected(new Set())
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
        </div>
      )}

      {loading && <div className="text-center py-10">Loading files...</div>}

      {!loading && viewMode === "list" && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      selected.size === currentFiles.length &&
                      currentFiles.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Size</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Modified
                </TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentFiles.map((file) => {
                const Icon = fileIcons[file.type as FileType] || File
                const color = fileColors[file.type as FileType] || "text-muted-foreground"
                return (
                  <TableRow
                    key={file.id}
                    className="group cursor-pointer hover:bg-muted/50 transition-colors"
                    data-state={selected.has(file.id) ? "selected" : undefined}
                    onClick={() =>
                      file.type === "folder"
                        ? navigateToFolder({ id: file.id, name: file.name })
                        : handleAction("Preview", file)
                    }
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(file.id)}
                        onCheckedChange={() => toggleSelect(file.id)}
                        aria-label={`Select ${file.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5 w-full text-left">
                        <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                        <span className="text-sm font-medium truncate">
                          {file.name}
                        </span>
                        {file.starred && (
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        )}
                        {file.shared && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            Shared
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {file.type === "folder" ? "--" : formatBytes(file.size)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {formatDate(file.modifiedAt)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {file.owner}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <FileContextMenu file={file} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && viewMode === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {currentFiles.map((file) => {
            const Icon = fileIcons[file.type as FileType] || File
            const color = fileColors[file.type as FileType] || "text-muted-foreground"
            return (
              <Card
                key={file.id}
                className={`group cursor-pointer transition-colors hover:bg-accent/50 ${selected.has(file.id) ? "ring-2 ring-primary" : ""
                  }`}
                onClick={() =>
                  file.type === "folder"
                    ? navigateToFolder({ id: file.id, name: file.name })
                    : toggleSelect(file.id)
                }
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <FileContextMenu file={file} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.type === "folder"
                        ? `${(file.children || []).length} items`
                        : formatBytes(file.size)}
                    </p>
                  </div>
                  {file.starred && (
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400 mt-1.5" />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && !bucketId && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No bucket selected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Please select a bucket from the Buckets page to view files.
          </p>
          <Link href="/buckets">
            <Button className="mt-4 gap-1.5">
              <HardDrive className="h-4 w-4" />
              Go to Buckets
            </Button>
          </Link>
        </div>
      )}

      {!loading && bucketId && currentFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">This folder is empty</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload files or create a new folder to get started
          </p>
          <Button className="mt-4 gap-1.5" onClick={onUploadClick}>
            <Upload className="h-4 w-4" />
            Upload Files
          </Button>
        </div>
      )}
      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {fileToRename?.name}</DialogTitle>
            <DialogDescription>
              Enter a new name for this file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">New Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={fileToRename?.name}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRename} disabled={!newName.trim() || newName === fileToRename?.name}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
