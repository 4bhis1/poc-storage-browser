"use client"

import * as React from "react"
import { CloudUpload, File, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAuthHeader } from "@/lib/token"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { formatBytes } from "@/lib/mock-data"
import { toast } from "sonner"
import { useUpload } from "@/components/providers/upload-provider"

// ... inside DialogContent ...
// Shadcn DialogContent has a default Close button, but to add cursor-pointer we might need to override or assume it's there.
// Actually, shadcn/ui DialogContent usually includes the Close button.
// If I can't easily modify the internal Close, I can disable it and add my own?
// Or I can just rely on global CSS or a class on DialogContent?
// Let's check if I can pass a class to the close button.
// Standard shadcn DialogContent:
/*
  <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
    <X className="h-4 w-4" />
    <span className="sr-only">Close</span>
  </DialogPrimitive.Close>
*/
// It usually has standard styles. 'cursor-pointer' is often default for buttons, but if not:
// I can't easily edit the *primitive* without editing the ui/dialog.tsx component.
// I will check components/ui/dialog.tsx first.
// For now, I will fix the syntax error as priority.



interface FileUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucketId: string | null
  currentPath: { id: string, name: string }[]
}

export function FileUploadDialog({ open, onOpenChange, bucketId, currentPath }: FileUploadDialogProps) {
  const { addFiles } = useUpload()
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const newFiles = Array.from(fileList)
    setSelectedFiles((prev) => [...prev, ...newFiles])

    // Reset file input to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = () => {
    // Determine parentId from currentPath
    const parentId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null

    if (bucketId) {
      addFiles(selectedFiles, bucketId, parentId)
      toast.success("Uploads started in background")
      handleClose(false)
    }
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
    handleAddFiles(e.dataTransfer.files)
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelectedFiles([])
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg w-full overflow-hidden"> {/* Added overflow control and w-full */}
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Drag and drop files or browse to upload to your bucket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination Path */}
          <div className="space-y-1.5 min-w-0"> {/* added min-w-0 */}
            <label className="text-sm font-medium">Destination Path</label>
            <div className="flex items-center px-3 py-2 text-sm border rounded-md bg-muted/50 text-muted-foreground truncate"> {/* Added truncate */}
              <span className="truncate"> {/* Inner truncate for text */}
                {currentPath.length > 0
                  ? `/${currentPath.map(p => p.name).join('/')}/`
                  : '/ (Root)'}
              </span>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
              }`}
          >
            <CloudUpload
              className={`h-10 w-10 ${isDragging ? "text-primary" : "text-muted-foreground"
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
              onChange={(e) => handleAddFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {selectedFiles.length > 0 && (
            <div className="max-h-[200px] w-full overflow-y-auto pr-2 border rounded-md">
              <div className="space-y-2 p-1">
                {selectedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-md border p-2.5 max-w-full"
                  >
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 w-full">
                        <p className="text-sm font-medium truncate">
                          {file.name}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 cursor-pointer"
                      onClick={() => removeFile(i)}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )} {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedFiles.length > 0
                ? `${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""} selected`
                : "No files selected"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={selectedFiles.length === 0}
                className="cursor-pointer"
              >
                Upload
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
