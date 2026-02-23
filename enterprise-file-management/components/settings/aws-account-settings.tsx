
"use client"

import * as React from "react"
import { Plus, RefreshCw, Trash2, CheckCircle2, AlertCircle, MoreHorizontal, Edit, Power, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

interface AwsAccount {
    id: string
    name: string
    isActive: boolean
    createdAt: string
    _count?: {
        buckets: number
    }
}

import { fetchWithAuth } from "@/lib/api"

export function AwsAccountSettings() {
    const [accounts, setAccounts] = React.useState<AwsAccount[]>([])
    const [loading, setLoading] = React.useState(true)
    const [createOpen, setCreateOpen] = React.useState(false)
    const [editOpen, setEditOpen] = React.useState(false)
    const [editingAccount, setEditingAccount] = React.useState<AwsAccount | null>(null)
    const [syncing, setSyncing] = React.useState<string | null>(null)

    const fetchAccounts = React.useCallback(async () => {
        try {
            const res = await fetchWithAuth("/api/accounts", {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
                cache: 'no-store',
            })
            if (res.ok) {
                const data = await res.json()
                setAccounts(data)
            } else {
                toast.error("Failed to fetch accounts")
            }
        } catch (error) {
            toast.error("Failed to fetch accounts")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        fetchAccounts()
    }, [fetchAccounts])

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault()
        const formData = new FormData(e.target as HTMLFormElement)
        const data = Object.fromEntries(formData)

        try {
            const res = await fetchWithAuth("/api/accounts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            })

            if (res.ok) {
                toast.success("AWS Account added successfully")
                setCreateOpen(false)
                fetchAccounts()
            } else {
                const error = await res.json()
                toast.error(error.error || "Failed to add account")
            }
        } catch (error) {
            toast.error("Error adding account")
        }
    }

    const handleSync = async (accountId: string) => {
        setSyncing(accountId)
        try {
            const res = await fetchWithAuth(`/api/accounts/${accountId}/sync`, {
                method: "POST",
            })

            if (res.ok) {
                const result = await res.json()
                toast.success(`Sync complete: ${result.syncedBuckets} buckets, ${result.syncedFiles} files`)
                fetchAccounts() // Refresh to show updated counts if we display them
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
            const res = await fetchWithAuth(`/api/accounts/${editingAccount.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name }),
            })

            if (res.ok) {
                toast.success("Account updated successfully")
                setEditOpen(false)
                setEditingAccount(null)
                fetchAccounts()
            } else {
                toast.error("Failed to update account")
            }
        } catch {
            toast.error("Error updating account")
        }
    }

    const handleToggleStatus = async (account: AwsAccount) => {
        try {
            const res = await fetchWithAuth(`/api/accounts/${account.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ isActive: !account.isActive }),
            })

            if (res.ok) {
                toast.success(`Account marked as ${!account.isActive ? 'active' : 'inactive'}`)
                fetchAccounts()
            } else {
                toast.error("Failed to update status")
            }
        } catch {
            toast.error("Error updating status")
        }
    }

    const handleDelete = async (account: AwsAccount) => {
        if (!confirm(`Are you sure you want to delete account "${account.name}"? This cannot be undone.`)) return

        try {
            const res = await fetchWithAuth(`/api/accounts/${account.id}`, {
                method: "DELETE",
            })

            if (res.ok) {
                toast.success("Account deleted successfully")
                fetchAccounts()
            } else {
                const error = await res.json()
                toast.error(error.error || "Failed to delete account")
            }
        } catch {
            toast.error("Error deleting account")
        }
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">Connected AWS Accounts</CardTitle>
                        <CardDescription>
                            Manage AWS accounts linked to your organization.
                        </CardDescription>
                    </div>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="gap-1.5">
                                <Plus className="h-4 w-4" />
                                Add Account
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add AWS Account</DialogTitle>
                                <DialogDescription>
                                    Enter your AWS credentials. We recommend creating an IAM user with read-only S3 access.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleAddAccount} autoComplete="off" className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="ci-name">Account Name</Label>
                                    <Input id="ci-name" name="name" placeholder="e.g. Production" autoComplete="off" required />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="ci-key-id">Access Key ID</Label>
                                    <Input id="ci-key-id" name="awsAccessKeyId" placeholder="AKIA..." autoComplete="off" required />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="ci-secret">Secret Access Key</Label>
                                    <Input id="ci-secret" name="awsSecretAccessKey" type="password" placeholder="wJalrX..." autoComplete="new-password" required />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                                    <Button type="submit">Connect Account</Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>

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
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-6 text-muted-foreground">Loading accounts...</div>
                    ) : accounts.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed rounded-lg">
                            <h3 className="text-lg font-semibold">No Accounts Connected</h3>
                            <p className="text-sm text-muted-foreground mt-1 mb-4">Connect an AWS account to start syncing S3 buckets.</p>
                            <Button variant="outline" onClick={() => setCreateOpen(true)}>Connect AWS Account</Button>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Buckets</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {accounts.map((account) => (
                                    <TableRow key={account.id}>
                                        <TableCell className="font-medium">
                                            {account.name}
                                            {!account.isActive && (
                                                <Badge variant="outline" className="ml-2 text-xs text-muted-foreground">
                                                    Inactive
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{account._count?.buckets || 0}</TableCell>
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
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
