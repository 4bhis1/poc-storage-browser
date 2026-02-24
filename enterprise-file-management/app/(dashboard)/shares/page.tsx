"use client"

import * as React from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { GenericTable } from "@/components/ui/generic-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Edit, Trash2, Shield, Eye, CalendarClock } from "lucide-react"
import { GenericModal } from "@/components/ui/generic-modal"
import { Suspense } from "react"
import { Checkbox } from "@/components/ui/checkbox"

// Mock Data
const MOCK_SHARES = [
  { id: "1", name: "Q1 Financial Report.pdf", sharedWith: "john@example.com", expiresAt: "2026-03-01T10:00:00Z", access: "Read Only", status: "Active" },
  { id: "2", name: "Product Roadmap.pptx", sharedWith: "design-team@example.com", expiresAt: "2026-04-15T00:00:00Z", access: "Edit", status: "Active" },
  { id: "3", name: "Architecture Diagram.drawio", sharedWith: "vendor-tech@external.com", expiresAt: "2026-02-28T00:00:00Z", access: "View", status: "Expired" },
  { id: "4", name: "Project Requirements.docx", sharedWith: "sarah@example.com", expiresAt: null, access: "Edit", status: "Active" },
];

function SharesPageContent() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [shares, setShares] = React.useState(MOCK_SHARES)
  
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingShare, setEditingShare] = React.useState<any>(null)
  
  // Edit Form State
  const [editAccess, setEditAccess] = React.useState("")

  const filteredShares = React.useMemo(() => {
    return shares.filter(share => 
      share.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      share.sharedWith.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [shares, searchQuery])

  const handleEditClick = (share: any) => {
    setEditingShare(share)
    setEditAccess(share.access)
    setEditOpen(true)
  }

  const handleSaveEdit = () => {
    if (!editingShare) return
    
    setShares(prev => prev.map(s => 
      s.id === editingShare.id ? { ...s, access: editAccess } : s
    ))
    setEditOpen(false)
    setEditingShare(null)
  }

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to revoke this share?")) {
      setShares(prev => prev.filter(s => s.id !== id))
    }
  }

  const columns = [
    { header: "Name", accessorKey: "name", cell: (row: any) => <span className="font-medium text-slate-900 dark:text-slate-100">{row.name}</span> },
    { header: "Shared With", accessorKey: "sharedWith", cell: (row: any) => <span className="text-muted-foreground">{row.sharedWith}</span> },
    { header: "Access", accessorKey: "access", cell: (row: any) => (
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {row.access === 'Edit' ? <Shield className="h-3 w-3 text-amber-500" /> : <Eye className="h-3 w-3 text-emerald-500" />}
        {row.access}
      </span>
    )},
    { header: "Expires On", accessorKey: "expiresAt", cell: (row: any) => (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {row.expiresAt ? (
          <>
            <CalendarClock className="h-3 w-3" />
            {new Date(row.expiresAt).toLocaleDateString()}
          </>
        ) : "Never"}
      </span>
    )},
    { header: "Status", accessorKey: "status", cell: (row: any) => (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'}`}>
        {row.status}
      </span>
    )},
    { 
      header: "", 
      accessorKey: "actions",
      cell: (row: any) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleEditClick(row)} title="Edit Share">
            <Edit className="h-4 w-4 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(row.id)} title="Revoke Share">
            <Trash2 className="h-4 w-4 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50" />
          </Button>
        </div>
      )
    }
  ]

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Shares</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Active Shares</h1>
            <p className="text-muted-foreground">Manage files and folders you have shared with other users or externally.</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by file name or email..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {/* Additional actions could go here, e.g. "Create New Share" if applicable */}
          </div>

          <div className="bg-white dark:bg-slate-950 rounded-lg border shadow-sm">
            <GenericTable 
              columns={columns} 
              data={filteredShares} 
              emptyMessage="No shared files match your search." 
            />
          </div>

        </div>
      </div>

      <GenericModal
        title="Edit Share Settings"
        description={`Update permissions for ${editingShare?.name}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        footer={
          <Button onClick={handleSaveEdit}>
            Save Changes
          </Button>
        }
      >
        <div className="py-4 space-y-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Shared With</label>
            <Input value={editingShare?.sharedWith} disabled className="bg-slate-50 dark:bg-slate-900" />
          </div>
          
          <div className="grid gap-3 pt-2">
            <label className="text-sm font-medium">Access Level</label>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="view-only" 
                checked={editAccess === 'Read Only' || editAccess === 'View'} 
                onCheckedChange={() => setEditAccess('Read Only')} 
              />
              <label htmlFor="view-only" className="text-sm font-medium leading-none cursor-pointer">
                View Only
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="edit-access" 
                checked={editAccess === 'Edit'} 
                onCheckedChange={() => setEditAccess('Edit')} 
              />
              <label htmlFor="edit-access" className="text-sm font-medium leading-none cursor-pointer">
                Edit Access
              </label>
            </div>
          </div>
        </div>
      </GenericModal>
    </>
  )
}

export default function SharesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading shares...</div>}>
      <SharesPageContent />
    </Suspense>
  )
}
