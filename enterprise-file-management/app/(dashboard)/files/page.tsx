"use client"

import * as React from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { FileBrowser } from "@/components/file-browser"
import { FileUploadDialog } from "@/components/file-upload-dialog"
import { SearchCommandDialog } from "@/components/search-command"

import { useSearchParams } from "next/navigation"

import { NewFolderDialog } from "@/components/new-folder-dialog"
import { Suspense } from "react"

function FilesPageContent() {
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [newFolderOpen, setNewFolderOpen] = React.useState(false)
  // State for current path - lifted from FileBrowser
  const [path, setPath] = React.useState<{ id: string, name: string }[]>([])
  const [refreshKey, setRefreshKey] = React.useState(0)

  const searchParams = useSearchParams()
  const bucketId = searchParams.get('bucketId')

  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Files</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <FileBrowser
            bucketId={bucketId}
            onUploadClick={() => setUploadOpen(true)}
            onNewFolderClick={() => setNewFolderOpen(true)}
            path={path}
            setPath={setPath}
            refreshTrigger={refreshKey}
          />
        </div>
      </div>

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        bucketId={bucketId}
        currentPath={path}
      />

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        bucketId={bucketId}
        currentPath={path}
        onFolderCreated={() => {
          setRefreshKey(prev => prev + 1)
        }}
      />
    </>
  )
}

export default function FilesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FilesPageContent />
    </Suspense>
  )
}
