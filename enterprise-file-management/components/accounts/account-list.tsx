"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AddAccountModal } from "./add-account-modal"
import { Cloud, Search, Plus } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { RefreshCw, MoreHorizontal, Edit, Power, Trash2, CheckCircle2, XCircle } from "lucide-react"

interface Account {
    id: string
    name: string
    isActive: boolean
    createdAt: string
    _count: {
        buckets: number
    }
}

interface AccountListProps {
    initialAccounts: Account[]
}

export function AccountList({ initialAccounts }: AccountListProps) {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState("")
    const [syncing, setSyncing] = useState<string | null>(null)
    const [editOpen, setEditOpen] = useState(false)
    const [editingAccount, setEditingAccount] = useState<Account | null>(null)

    function getAuthHeader(): Record<string, string> {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
        return token ? { 'Authorization': `Bearer ${token}` } : {}
    }

    const handleSync = async (accountId: string) => {
        setSyncing(accountId)
        try {
            const res = await fetch(`/api/accounts/${accountId}/sync`, {
                method: "POST",
                headers: getAuthHeader()
            })

            if (res.ok) {
                const result = await res.json()
                toast.success(`Sync complete: ${result.syncedBuckets} buckets, ${result.syncedFiles} files`)
                router.refresh()
            } else {
                const error = await res.json()
                toast.error(error.error || "Sync failed")
            }
        } catch (error) {
            toast.error("Error during sync")
        } finally {
            setSyncing(null)
        }
    }

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingAccount) return

        const formData = new FormData(e.target as HTMLFormElement)
        const name = formData.get("name") as string

        try {
            const res = await fetch(`/api/accounts/${editingAccount.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify({ name }),
            })

            if (res.ok) {
                toast.success("Account updated successfully")
                setEditOpen(false)
                setEditingAccount(null)
                router.refresh()
            } else {
                toast.error("Failed to update account")
            }
        } catch {
            toast.error("Error updating account")
        }
    }

    const handleToggleStatus = async (account: Account) => {
        try {
            const res = await fetch(`/api/accounts/${account.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...getAuthHeader()
                },
                body: JSON.stringify({ isActive: !account.isActive }),
            })

            if (res.ok) {
                toast.success(`Account marked as ${!account.isActive ? 'active' : 'inactive'}`)
                router.refresh()
            } else {
                toast.error("Failed to update status")
            }
        } catch {
            toast.error("Error updating status")
        }
    }

    const handleDelete = async (account: Account) => {
        if (!confirm(`Are you sure you want to delete account "${account.name}"? This cannot be undone.`)) return

        try {
            const res = await fetch(`/api/accounts/${account.id}`, {
                method: "DELETE",
                headers: getAuthHeader()
            })

            if (res.ok) {
                toast.success("Account deleted successfully")
                router.refresh()
            } else {
                const error = await res.json()
                toast.error(error.error || "Failed to delete account")
            }
        } catch {
            toast.error("Error deleting account")
        }
    }

    const filteredAccounts = initialAccounts.filter(account =>
        account.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">AWS Accounts</h1>
                    <p className="text-muted-foreground">
                        Manage your connected AWS accounts and buckets.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => router.refresh()}>
                        <RefreshCw className="h-4 w-4" />
                        <span className="sr-only">Refresh</span>
                    </Button>
                    <AddAccountModal onSuccess={() => router.refresh()} />
                </div>
            </div>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Account</DialogTitle>
                        <DialogDescription>
                            Update account details.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdateAccount} autoComplete="off" className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-name">Account Name</Label>
                            <Input
                                id="edit-name"
                                name="name"
                                defaultValue={editingAccount?.name}
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                            <Button type="submit">Save Changes</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Connected Accounts</CardTitle>
                            <CardDescription>
                                List of AWS accounts linked to your organization.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search accounts..."
                                    className="pl-8 w-[250px]"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account Name</TableHead>
                                <TableHead>Buckets</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAccounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No accounts found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredAccounts.map((account) => (
                                    <TableRow key={account.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                                                    <Cloud className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold">{account.name}</div>
                                                    <div className="text-xs text-muted-foreground">ID: ...{account.id.slice(-4)}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{account._count.buckets}</TableCell>
                                        <TableCell>
                                            {account.isActive ? (
                                                <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/20 shadow-none border-0">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Active
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="gap-1 bg-gray-100 text-gray-500 hover:bg-gray-200 shadow-none border-0">
                                                    <XCircle className="h-3 w-3" />
                                                    Inactive
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => handleSync(account.id)}
                                                    disabled={syncing === account.id || !account.isActive}
                                                    title="Sync Buckets"
                                                >
                                                    <RefreshCw className={`h-4 w-4 ${syncing === account.id ? 'animate-spin' : ''}`} />
                                                    <span className="sr-only">Sync</span>
                                                </Button>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => {
                                                            setEditingAccount(account)
                                                            setEditOpen(true)
                                                        }}>
                                                            <Edit className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleToggleStatus(account)}>
                                                            <Power className="mr-2 h-4 w-4" />
                                                            {account.isActive ? 'Mark as Inactive' : 'Mark as Active'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-red-600 focus:text-red-600"
                                                            onClick={() => handleDelete(account)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
