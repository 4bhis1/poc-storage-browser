"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
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
import { deleteTenant } from "@/app/actions/tenants";
import { toast } from "sonner";

interface DeleteTenantButtonProps {
  tenantId: string;
  tenantName: string;
}

export function DeleteTenantButton({ tenantId, tenantName }: DeleteTenantButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isConfirmed = confirmName === tenantName;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTenant(tenantId);
      if (result.success) {
        toast.success(`Tenant "${tenantName}" is being deleted in the background.`);
        setOpen(false);
        router.push("/superadmin/tenants");
      } else {
        toast.error(result.error || "Failed to initiate tenant deletion.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmName(""); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Tenant
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Delete Tenant</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{tenantName}</strong> and all its users, teams, buckets (DB records only), and data. S3 objects will not be touched.
            <br /><br />
            This action runs in the background and <strong>cannot be undone</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="confirm-name">
            Type <span className="font-mono font-semibold">{tenantName}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={tenantName}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
