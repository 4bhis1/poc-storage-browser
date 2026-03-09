"use client";

import { useState, useTransition } from "react";
import { Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenant } from "@/app/actions/tenants";
import { toast } from "sonner";

interface EditTenantDialogProps {
  tenantId: string;
  currentName: string;
}

export function EditTenantDialog({ tenantId, currentName }: EditTenantDialogProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(currentName);
  const [isPending, startTransition] = useTransition();

  const isChanged = newName.trim() !== "" && newName.trim() !== currentName;

  function handleUpdate() {
    if (!isChanged) return;
    
    startTransition(async () => {
      const result = await updateTenant(tenantId, newName);
      if (result.success) {
        toast.success(`Tenant renamed to "${newName.trim()}".`);
        setOpen(false);
      } else {
        toast.error(result.error || "Failed to update tenant name.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNewName(currentName); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 ml-2">
          <Edit2 className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Edit Tenant Name</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
          <DialogDescription>
            Change the display name of this tenant organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name" className="text-right">
              Name
            </Label>
            <Input
              id="tenant-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="col-span-3"
              placeholder="e.g. Acme Corp"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={!isChanged || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
