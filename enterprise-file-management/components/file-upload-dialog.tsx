"use client"

import * as React from "react"
import { CloudUpload, File, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatBytes } from "@/lib/mock-data"
import { toast } from "sonner"

interface UploadFile {
  id: string
  name: string
  size: number
  progress: number
  status: "pending" | "uploading" | "complete" | "error"
}

interface FileUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FileUploadDialog({ open, onOpenChange }: FileUploadDialogProps) {
  const [files, setFiles] = React.useState<UploadFile[]>([])
  const [bucket, setBucket] = React.useState("prod-assets")
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const newFiles: UploadFile[] = Array.from(fileList).map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      progress: 0,
      status: "pending" as const,
    }))
    setFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const simulateUpload = () => {
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as const } : f
      )
    )

    // Simulate progress
    const interval = setInterval(() => {
      setFiles((prev) => {
        const updated = prev.map((f) => {
          if (f.status === "uploading") {
            const newProgress = Math.min(f.progress + Math.random() * 15, 100)
            return {
              ...f,
              progress: newProgress,
              status:
                newProgress >= 100
                  ? ("complete" as const)
                  : ("uploading" as const),
            }
          }
          return f
        })

        const allDone = updated.every(
          (f) => f.status === "complete" || f.status === "error"
        )
        if (allDone) {
          clearInterval(interval)
          toast.success(`${updated.length} files uploaded successfully`)
        }

        return updated
      })
    }, 200)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setFiles([])
    }
    onOpenChange(open)
  }

  const pendingCount = files.filter((f) => f.status === "pending").length
  const uploadingCount = files.filter((f) => f.status === "uploading").length
  const isUploading = uploadingCount > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Drag and drop files or browse to upload to your bucket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bucket selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Destination Bucket</label>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prod-assets">prod-assets</SelectItem>
                <SelectItem value="finance-vault">finance-vault</SelectItem>
                <SelectItem value="media-archive">media-archive</SelectItem>
                <SelectItem value="dev-sandbox">dev-sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <CloudUpload
              className={`h-10 w-10 ${
                isDragging ? "text-primary" : "text-muted-foreground"
              }`}
            />
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragging ? "Drop files here" : "Click to browse or drag files here"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports any file type up to 5 GB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-md border p-2.5"
                  >
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {file.name}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                      {(file.status === "uploading" ||
                        file.status === "complete") && (
                        <Progress
                          value={file.progress}
                          className="h-1"
                        />
                      )}
                    </div>
                    {!isUploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                : "No files selected"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                onClick={simulateUpload}
                disabled={pendingCount === 0 || isUploading}
              >
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
