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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function SharesPageContent() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [shares, setShares] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)
  const [pagination, setPagination] = React.useState<any>(null)
  
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingShare, setEditingShare] = React.useState<any>(null)
  
  // Edit Form State
  const [editExpiryDays, setEditExpiryDays] = React.useState("7")
  const [editDownloadLimit, setEditDownloadLimit] = React.useState("3")
  const [editPassword, setEditPassword] = React.useState("")
  const [removePassword, setRemovePassword] = React.useState(false)
  const [editSaving, setEditSaving] = React.useState(false)

  React.useEffect(() => {
    fetchShares(page)
  }, [page])

  const fetchShares = async (currentPage: number) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/shares?page=${page}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setShares(data.shares || [])
        setPagination(data.pagination || null)
      }
    } catch (err) {
      console.error("Failed to fetch shares:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredShares = React.useMemo(() => {
    if (!searchQuery) return shares;
    return shares.filter(share => 
      share.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      share.sharedWith.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [shares, searchQuery])

  // Reset page when search query changes to ensure users see relevant results from page 1
  React.useEffect(() => {
    if (searchQuery) setPage(1);
  }, [searchQuery]);

  const handleEditClick = (share: any) => {
    setEditingShare(share)
    setEditExpiryDays("") // We don't easily know days remaining, so leave blank to imply "no change" or require explicit input
    setEditDownloadLimit(share.downloadLimit?.toString() || "")
    setEditPassword("")
    setRemovePassword(false)
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingShare) return
    
    setEditSaving(true)
    try {
      const payload: any = {}
      if (editExpiryDays) payload.expiryDays = parseInt(editExpiryDays, 10)
      if (editDownloadLimit) payload.downloadLimit = parseInt(editDownloadLimit, 10)
      
      if (editPassword) {
        payload.password = editPassword
      } else if (removePassword) {
        payload.password = ""
      }

      const res = await fetch(`/api/shares/${editingShare.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const data = await res.json()
        setShares(prev => prev.map(s => s.id === editingShare.id ? { 
          ...s, 
          status: data.share.status,
          access: data.share.passwordProtected ? "Protected Download" : "Download",
        } : s))
        setEditOpen(false)
        setEditingShare(null)
      } else {
        alert("Failed to update share settings")
      }
    } catch (err) {
      console.error(err)
      alert("An error occurred while updating")
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to revoke this share?")) {
      try {
        const res = await fetch(`/api/shares/${id}`, { method: "DELETE" })
        if (res.ok) {
          setShares(prev => prev.map(s => s.id === id ? { ...s, status: "REVOKED" } : s))
        } else {
          alert("Failed to revoke share");
        }
      } catch (err) {
        console.error("Error revoking share", err);
      }
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
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'}`}>
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
            <form 
              autoComplete="off" 
              onSubmit={(e) => e.preventDefault()} 
              className="relative w-full max-w-md"
            >
              {/* Dummy input to trick aggressive autofillers */}
              <input type="email" className="hidden" aria-hidden="true" tabIndex={-1} />
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="share-search-input"
                name="search"
                type="search"
                placeholder="Search by file name or email..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="new-password"
                spellCheck="false"
              />
            </form>
            {/* Additional actions could go here, e.g. "Create New Share" if applicable */}
          </div>

          <div className="bg-white dark:bg-slate-950 rounded-lg border shadow-sm">
            <GenericTable 
              columns={columns} 
              data={filteredShares} 
              emptyMessage="No shared files match your search." 
            />
          </div>

          {!loading && pagination && pagination.totalPages >= 1 && shares.length > 0 && (
            <div className="py-4 border-t border-border mt-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={(e) => {
                        e.preventDefault();
                        if (pagination.currentPage > 1) setPage(pagination.currentPage - 1);
                      }}
                      href="#"
                      size="default"
                      className={pagination.currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-sm text-muted-foreground mx-4">
                      Page {pagination.currentPage} of {pagination.totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext 
                      onClick={(e) => {
                        e.preventDefault();
                        if (pagination.currentPage < pagination.totalPages) setPage(pagination.currentPage + 1);
                      }}
                      href="#"
                      size="default"
                      className={pagination.currentPage >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}

        </div>
      </div>

      <GenericModal
        key={editOpen ? `open-${editingShare?.id}` : "closed"}
        title="Edit Share Settings"
        description={`Update permissions for ${editingShare?.name}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        footer={
          <Button onClick={handleSaveEdit} disabled={editSaving}>
            {editSaving ? "Saving..." : "Save Changes"}
          </Button>
        }
      >
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="py-4 space-y-4">
          <input type="email" className="hidden" aria-hidden="true" tabIndex={-1} />
          
          <div className="grid gap-2">
            <label className="text-sm font-medium">Shared With</label>
            <div className="flex h-10 w-full rounded-md border border-input bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed">
              {editingShare?.sharedWith}
            </div>
          </div>
          
          <div className="grid gap-2 pt-2">
            <label className="text-sm font-medium">Update Expiry (Days from today)</label>
            <Input 
              type="number" 
              min="1" 
              max="365" 
              placeholder="e.g. 7" 
              value={editExpiryDays} 
              onChange={(e) => setEditExpiryDays(e.target.value)} 
            />
            <p className="text-xs text-muted-foreground">Leave blank to keep existing expiration.</p>
          </div>

          <div className="grid gap-2 pt-2">
            <label className="text-sm font-medium">Update Download Limit</label>
            <Input 
              type="number" 
              min="1" 
              placeholder="e.g. 5" 
              value={editDownloadLimit} 
              onChange={(e) => setEditDownloadLimit(e.target.value)} 
            />
          </div>

          <div className="grid gap-2 pt-2">
            <label className="text-sm font-medium">Update Password</label>
            <Input 
              type="password" 
              placeholder="Enter new password (optional)" 
              value={editPassword} 
              disabled={removePassword}
              onChange={(e) => setEditPassword(e.target.value)} 
              autoComplete="new-password"
              spellCheck="false"
            />
            {editingShare?.access === "Protected Download" && (
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox 
                  id="remove-password" 
                  checked={removePassword} 
                  onCheckedChange={(checked: boolean | "indeterminate") => {
                    setRemovePassword(checked === true)
                    if (checked === true) setEditPassword("")
                  }} 
                />
                <label
                  htmlFor="remove-password"
                  className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Remove existing password requirement
                </label>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {editingShare?.access === "Protected Download" 
                ? "Leave empty to keep existing password." 
                : "Leave empty to keep share unprotected."}
            </p>
          </div>
        </form>
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
