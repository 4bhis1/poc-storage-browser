"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { GenericModal } from "@/components/ui/generic-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Plus, Copy, Check, ShieldCheck, Clock, ShieldOff, AlertTriangle, Wifi, WifiOff, Clock3,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getBots, registerBot, revokeBot,
} from "@/app/actions/bots";

function parseBucketPerms(permissions: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  permissions.forEach(p => {
    const parts = p.split(':');
    if (parts[0] === 'BUCKET' && parts.length === 3) {
      if (!map[parts[1]]) map[parts[1]] = [];
      map[parts[1]].push(parts[2]);
    }
  });
  return map;
}

export default function BotsPage() {
  const { user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && user.role !== "PLATFORM_ADMIN" && user.role !== "TENANT_ADMIN") {
      router.replace("/");
    }
  }, [user, router]);

  const [bots, setBots] = React.useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [botName, setBotName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [newBotId, setNewBotId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => { fetchBots(); }, []);

  async function fetchBots() {
    const r = await getBots();
    if (r.success) setBots(r.data ?? []);
  }

  function resetForm() {
    setBotName(""); setError(""); setNewBotId(null); setCopied(false);
  }

  async function handleRegisterBot() {
    if (!botName.trim()) { setError("Account name is required."); return; }
    setError(""); setLoading(true);
    const fd = new FormData();
    fd.set("name", botName.trim());
    const result = await registerBot(fd);
    setLoading(false);
    if (!result.success) { setError(result.error ?? "Failed to register bot"); return; }
    setNewBotId(result.botId!);
    await fetchBots();
  }

  async function handleRevoke(botId: string) {
    await revokeBot(botId);
    setBots(prev => prev.filter(b => b.id !== botId));
  }

  const columns: ColumnDef<any>[] = [
    {
      header: "Account Name",
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-md text-primary"><Bot className="h-4 w-4" /></div>
          <span className="font-semibold">{row.name}</span>
        </div>
      ),
    },
    {
      header: "Registered By",
      accessorKey: "user",
      cell: (row) => <span className="text-muted-foreground">{row.user?.email ?? "—"}</span>,
    },
    {
      header: "Bucket Permissions",
      accessorKey: "permissions",
      cell: (row) => {
        const parsed = parseBucketPerms(row.permissions ?? []);
        const count = Object.keys(parsed).length;
        if (count === 0) return <span className="text-muted-foreground text-xs">No permissions</span>;
        return (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">{count} bucket{count !== 1 ? 's' : ''}</Badge>
            {Array.from(new Set(Object.values(parsed).flat())).map(p => (
              <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      header: "Status",
      accessorKey: "isActive",
      cell: (row) => {
        if (row.isPendingSetup) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              <Clock3 className="h-3 w-3" />
              Pending Setup
            </span>
          );
        }
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
            row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}>
            <ShieldCheck className="h-3 w-3" />
            {row.isActive ? "Active" : "Revoked"}
          </span>
        );
      },
    },
    {
      header: "Connection",
      accessorKey: "connectionStatus",
      cell: (row) => {
        if (row.connectionStatus === 'never_connected') {
          return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <WifiOff className="h-3 w-3" />
              Never Connected
            </span>
          );
        }
        const isOnline = row.connectionStatus === "online";
        return (
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              isOnline
                ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? "Online" : "Offline"}
            </span>
            {row.hasDiagnosticFailures && !isOnline && (
              <div title="Diagnostics have failures" className="text-yellow-500">
                <AlertTriangle className="h-4 w-4" />
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Last Used",
      accessorKey: "lastUsedAt",
      cell: (row) => (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Never"}
        </span>
      ),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      className: "text-right",
      cell: (row) => (
        <div onClick={e => e.stopPropagation()}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 gap-1.5 text-xs font-medium">
                <ShieldOff className="h-3.5 w-3.5" /> Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke service account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently deletes <strong>{row.name}</strong> and invalidates all its tokens immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => handleRevoke(row.id)}
                >Revoke</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Accounts</h1>
          <p className="text-muted-foreground mt-1">
            Register service accounts for headless automation. Click a row to configure and manage.
          </p>
        </div>

        <GenericModal
          title={newBotId ? "Service Account Created" : "Create Service Account"}
          description={newBotId ? "Copy the Service Account ID and configure it in the agent." : "Enter a name for the service account. You'll configure the key and permissions after creation."}
          open={isModalOpen}
          onOpenChange={(open) => { setIsModalOpen(open); if (!open) resetForm(); }}
          trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Create Account</Button>}
          footer={
            newBotId
              ? <Button onClick={() => { setIsModalOpen(false); resetForm(); router.push(`/bots/${newBotId}`); }}>Go to Agent Config</Button>
              : <Button disabled={loading} onClick={handleRegisterBot}>{loading ? "Creating…" : "Create Account"}</Button>
          }
          className="sm:max-w-xl"
        >
          {newBotId ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Service account created successfully</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Click "Go to Agent Config" to set up the public key and configure permissions.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Service Account ID</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all">{newBotId}</code>
                  <Button variant="outline" size="icon" onClick={async () => {
                    await navigator.clipboard.writeText(newBotId);
                    setCopied(true); setTimeout(() => setCopied(false), 2000);
                  }}>
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Account Name</label>
                <Input value={botName} onChange={e => setBotName(e.target.value)} placeholder="e.g. Production Sync Agent" className="mt-1" autoFocus />
              </div>
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
            </div>
          )}
        </GenericModal>
      </div>

      <div className="flex-1 bg-background rounded-lg border shadow-sm p-4 mt-6">
        <DataTable
          data={bots}
          columns={columns}
          searchPlaceholder="Search service accounts by name or email…"
          emptyMessage="No service accounts registered yet. Create one to get started."
          onRowClick={(row) => router.push(`/bots/${row.id}`)}
        />
      </div>
    </div>
  );
}
