"use client"

import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTenant } from "@/app/actions/tenants"
import { toast } from "sonner"

export function CreateTenantModal() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setLoading(true)

        const formData = new FormData(event.currentTarget)
        const result = await createTenant(formData)

        setLoading(false)

        if (result.success) {
            toast.success("Tenant created successfully")
            setOpen(false)
        } else {
            toast.error(result.error || "Failed to create tenant")
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Tenant
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create Tenant</DialogTitle>
                        <DialogDescription>
                            Add a new organization and its administrator account.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Org Name
                            </Label>
                            <Input
                                id="name"
                                name="name"
                                placeholder="Acme Corp"
                                className="col-span-3"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="adminName" className="text-right">
                                Admin Name
                            </Label>
                            <Input
                                id="adminName"
                                name="adminName"
                                placeholder="John Doe"
                                className="col-span-3"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="adminEmail" className="text-right">
                                Admin Email
                            </Label>
                            <Input
                                id="adminEmail"
                                name="adminEmail"
                                type="email"
                                placeholder="admin@acme.com"
                                className="col-span-3"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="adminPassword" className="text-right">
                                Password
                            </Label>
                            <Input
                                id="adminPassword"
                                name="adminPassword"
                                type="password"
                                className="col-span-3"
                                required
                                minLength={8}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
