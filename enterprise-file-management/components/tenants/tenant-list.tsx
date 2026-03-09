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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building, Search, Link as LinkIcon, AlertTriangle, RefreshCw } from "lucide-react"
import { CreateTenantModal } from "./create-tenant-modal"
import { formatBytes } from "@/lib/mock-data"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Tenant {
    id: string
    name: string
    createdAt: string
    _count: {
        users: number
    }
    storageUsed: number
    awsAccounts?: { id: string }[]
}

interface TenantListProps {
    initialTenants: Tenant[]
    showAwsLink?: boolean
}

export function TenantList({ initialTenants, showAwsLink = false }: TenantListProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [tenantToReplace, setTenantToReplace] = useState<Tenant | null>(null)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const filteredTenants = initialTenants.filter(tenant =>
        tenant.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
                    <p className="text-muted-foreground">
                        Manage organizations and their subscription plans.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 text-xs"
                        onClick={() => startTransition(() => router.refresh())}
                        disabled={isPending}
                        title="Refresh tenants"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <CreateTenantModal />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Tenants</CardTitle>
                            <CardDescription>
                                List of all registered organizations on the platform.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search tenants..."
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
                                <TableHead>Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Users</TableHead>
                                <TableHead>Storage Used</TableHead>
                                <TableHead className="text-right">Created</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTenants.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                        No tenants found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTenants.map((tenant) => (
                                    <TableRow key={tenant.id}>
                                        <TableCell className="font-medium">
                                            <Link href={`/superadmin/tenants/${tenant.id}`} className="flex items-center gap-2 hover:underline group">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                                                    <Building className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-primary flex items-center gap-1 group-hover:text-primary/80 transition-colors">
                                                        {tenant.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{tenant.id}</div>
                                                </div>
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="default">Active</Badge>
                                            {/* Status is currently hardcoded as per DB schema, flexible to change later */}
                                        </TableCell>
                                        <TableCell>{tenant._count.users}</TableCell>
                                        <TableCell>{formatBytes(tenant.storageUsed)}</TableCell>
                                        <TableCell className="text-right">
                                            {new Date(tenant.createdAt).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={!!tenantToReplace} onOpenChange={(open) => !open && setTenantToReplace(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Replace AWS Connection for {tenantToReplace?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This tenant already has an active AWS Account connection. To link a new one, you must first delete the existing connection from the AWS Accounts dashboard.
                            <br /><br />
                            Are you sure you want to proceed to the AWS Accounts dashboard to manage this connection?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Link href="/superadmin/aws-accounts">
                                Go to AWS Accounts
                            </Link>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
