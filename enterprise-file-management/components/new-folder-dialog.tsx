"use client"

import * as React from "react"
import { FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { fetchWithAuth } from "@/lib/api"

interface NewFolderDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    bucketId: string | null
    currentPath: { id: string, name: string }[]
    onFolderCreated: () => void
}

export function NewFolderDialog({
    open,
    onOpenChange,
    bucketId,
    currentPath,
    onFolderCreated,
}: NewFolderDialogProps) {
    const [name, setName] = React.useState("")
    const [isLoading, setIsLoading] = React.useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        if (!bucketId) {
            toast.error("No bucket selected")
            return
        }

        setIsLoading(true)
        try {
            const parentId = currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null

            const res = await fetchWithAuth("/api/files", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: name.trim(),
                    isFolder: true,
                    bucketId,
                    parentId,
                }),
            })

            if (!res.ok) {
                throw new Error("Failed to create folder")
            }

            toast.success("Folder created successfully")
            setName("")
            onOpenChange(false)
            onFolderCreated()
        } catch (error) {
            toast.error("Failed to create folder")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>
                        Create a new folder in{" "}
                        {currentPath.length > 0
                            ? `/${currentPath.map((p) => p.name).join("/")}`
                            : "root"}
                        .
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Folder Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Documents"
                                autoFocus
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading || !name.trim()}>
                            {isLoading ? "Creating..." : "Create Folder"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
