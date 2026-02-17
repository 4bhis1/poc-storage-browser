"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Archive,
  FileCode,
  FileText,
  FolderOpen,
  HardDrive,
  Image,
  Music,
  Sheet,
  Video,
  File,
  CreditCard,
  Settings,
  Search,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { flattenFiles, mockFiles, type FileType } from "@/lib/mock-data"

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

const allFiles = flattenFiles(mockFiles)

export function SearchCommandDialog() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search files, buckets, and settings..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Files">
          {allFiles
            .filter((f) => f.type !== "folder")
            .slice(0, 8)
            .map((file) => {
              const Icon = fileIcons[file.type]
              return (
                <CommandItem
                  key={file.id}
                  onSelect={() => {
                    setOpen(false)
                    router.push("/files")
                  }}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{file.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {file.path}
                  </span>
                </CommandItem>
              )
            })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => {
              setOpen(false)
              router.push("/files")
            }}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Files
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false)
              router.push("/buckets")
            }}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            Buckets
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false)
              router.push("/search")
            }}
          >
            <Search className="mr-2 h-4 w-4" />
            Advanced Search
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false)
              router.push("/audit")
            }}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Audit & Costs
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false)
              router.push("/settings")
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
