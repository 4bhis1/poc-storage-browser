"use client"

import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { toast } from "sonner"
import { fetchWithAuth } from "@/lib/api"

interface AddAccountModalProps {
    onSuccess?: () => void
}

export function AddAccountModal({ onSuccess }: AddAccountModalProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)

        const formData = new FormData(e.currentTarget)
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
                toast.success("AWS account connected successfully")
                setOpen(false)
                    ; (e.target as HTMLFormElement).reset()
                onSuccess?.()
            } else {
                const error = await res.json()
                toast.error(error.error || "Failed to connect account")
            }
        } catch {
            toast.error("Error connecting account")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
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
                        Connect an AWS account to your organization. Credentials are stored encrypted.
                    </DialogDescription>
                </DialogHeader>
                {/* autoComplete="off" prevents browser from filling saved passwords */}
                <form onSubmit={onSubmit} autoComplete="off" className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="am-name">Account Name</Label>
                        <Input
                            id="am-name"
                            name="name"
                            placeholder="e.g. Production"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="am-key-id">Access Key ID</Label>
                        <Input
                            id="am-key-id"
                            name="awsAccessKeyId"
                            placeholder="AKIA..."
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="am-secret">Secret Access Key</Label>
                        <Input
                            id="am-secret"
                            name="awsSecretAccessKey"
                            type="password"
                            placeholder="wJalrX..."
                            autoComplete="new-password"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Connect Account
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
