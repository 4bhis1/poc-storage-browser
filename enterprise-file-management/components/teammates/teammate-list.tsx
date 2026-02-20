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
import { InviteTeammateModal } from "./invite-teammate-modal"
import { Users, Search, Plus, Mail } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface Teammate {
    id: string
    name: string | null
    email: string
    role: string
    createdAt: string
}

interface TeammateListProps {
    initialTeammates: Teammate[]
}

export function TeammateList({ initialTeammates }: TeammateListProps) {
    const [searchTerm, setSearchTerm] = useState("")

    const filteredTeammates = initialTeammates.filter(teammate =>
    (teammate.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teammate.email.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Teammates</h1>
                    <p className="text-muted-foreground">
                        Manage team members and their access levels.
                    </p>
                </div>
                <InviteTeammateModal />
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Team Members</CardTitle>
                            <CardDescription>
                                Users with access to your organization's resources.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search teammates..."
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
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Joined</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTeammates.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                        No teammates found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTeammates.map((teammate) => (
                                    <TableRow key={teammate.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                        {teammate.name?.substring(0, 2).toUpperCase() || 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-semibold">{teammate.name || 'Unknown'}</div>
                                                    <div className="text-xs text-muted-foreground">{teammate.email}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{teammate.role}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">Active</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {new Date(teammate.createdAt).toLocaleDateString()}
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
