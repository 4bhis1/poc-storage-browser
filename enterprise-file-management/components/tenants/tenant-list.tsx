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
import { Building, Search } from "lucide-react"
import { CreateTenantModal } from "./create-tenant-modal"
import { formatBytes } from "@/lib/mock-data"
import { useState } from "react"

interface Tenant {
    id: string
    name: string
    createdAt: string
    _count: {
        users: number
    }
    storageUsed: number
}

interface TenantListProps {
    initialTenants: Tenant[]
}

export function TenantList({ initialTenants }: TenantListProps) {
    const [searchTerm, setSearchTerm] = useState("")

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
                <CreateTenantModal />
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
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                                                    <Building className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold">{tenant.name}</div>
                                                    <div className="text-xs text-muted-foreground">{tenant.id}</div>
                                                </div>
                                            </div>
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
        </div>
    )
}
