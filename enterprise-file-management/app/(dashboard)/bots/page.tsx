"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { GenericModal } from "@/components/ui/generic-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bot, Plus, Copy, Check, KeyRound, ShieldCheck, Clock, ShieldOff,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getBots, getBucketsForTenant, registerBot, revokeBot,
} from "@/app/actions/bots";

const BUCKET_PERMS = ["READ", "WRITE", "DELETE", "SHARE", "DOWNLOAD"];

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

  const [bots, setBots]               = React.useState<any[]>([]);
  const [buckets, setBuckets]         = React.useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Register form state
  const [botName, setBotName]         = React.useState("");
  const [publicKey, setPublicKey]     = React.useState("");
  const [bucketPerms, setBucketPerms] = React.useState<Record<string, Set<string>>>({});
  const [loading, setLoading]         = React.useState(false);
  const [error, setError]             = React.useState("");
  const [newBotId, setNewBotId]       = React.useState<string | null>(null);
  const [copied, setCopied]           = React.useState(false);

  React.useEffect(() => { fetchBots(); fetchBuckets(); }, []);

  async function fetchBots() {
    const r = await getBots();
    if (r.success) setBots(r.data ?? []);
  }

  async function fetchBuckets() {
    const r = await getBucketsForTenant();
    if (r.success) {
      setBuckets(r.data ?? []);
      const init: Record<string, Set<string>> = {};
      (r.data ?? []).forEach((b: any) => { init[b.id] = new Set(); });
      setBucketPerms(init);
    }
  }

  function resetForm() {
    setBotName(""); setPublicKey(""); setError(""); setNewBotId(null); setCopied(false);
    const init: Record<string, Set<string>> = {};
    buckets.forEach(b => { init[b.id] = new Set(); });
    setBucketPerms(init);
  }

  function togglePerm(bucketId: string, perm: string) {
    setBucketPerms(prev => {
      const next = { ...prev, [bucketId]: new Set(prev[bucketId]) };
      next[bucketId].has(perm) ? next[bucketId].delete(perm) : next[bucketId].add(perm);
      return next;
    });
  }

  function toggleAllPermsForBucket(bucketId: string) {
    setBucketPerms(prev => {
      const cur = prev[bucketId];
      return { ...prev, [bucketId]: cur.size === BUCKET_PERMS.length ? new Set() : new Set(BUCKET_PERMS) };
    });
  }

  async function handleRegisterBot() {
    if (!botName.trim() || !publicKey.trim()) { setError("Bot name and public key are required."); return; }
    setError(""); setLoading(true);
    const fd = new FormData();
    fd.set("name", botName.trim());
    fd.set("publicKey", publicKey.trim());
    const permsObj: Record<string, string[]> = {};
    Object.entries(bucketPerms).forEach(([bid, perms]) => {
      if (perms.size > 0) permsObj[bid] = Array.from(perms);
    });
    fd.set("bucketPermissions", JSON.stringify(permsObj));
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
      header: "Bot Name",
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
      cell: (row) => (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
          row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        }`}>
          <ShieldCheck className="h-3 w-3" />
          {row.isActive ? "Active" : "Revoked"}
        </span>
      ),
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
                <AlertDialogTitle>Revoke bot access?</AlertDialogTitle>
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
          <h1 className="text-3xl font-bold tracking-tight">Bot Identities</h1>
          <p className="text-muted-foreground mt-1">
            Register machine identities for headless automation. Click a row to manage permissions and view activity.
          </p>
        </div>

        <GenericModal
          title={newBotId ? "Bot Registered" : "Register Bot Identity"}
          description={newBotId ? "Copy the Bot ID and paste it into the CloudVault desktop agent." : "Configure the bot's identity and bucket access permissions."}
          open={isModalOpen}
          onOpenChange={(open) => { setIsModalOpen(open); if (!open) resetForm(); }}
          trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Add Bot</Button>}
          footer={
            newBotId
              ? <Button onClick={() => { setIsModalOpen(false); resetForm(); }}>Done</Button>
              : <Button disabled={loading} onClick={handleRegisterBot}>{loading ? "Registering…" : "Register Bot"}</Button>
          }
          className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {newBotId ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Bot registered successfully</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Copy the Bot ID and paste it into the CloudVault desktop agent → Bot tab → Bot ID field.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bot ID</label>
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
            <div className="space-y-5 py-2">
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> How to get the public key</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Open the CloudVault desktop agent.</li>
                  <li>Go to Login → Bot tab → Generate Key Pair.</li>
                  <li>Copy the public key and paste it below.</li>
                </ol>
              </div>
              <div>
                <label className="text-sm font-medium">Bot Name</label>
                <Input value={botName} onChange={e => setBotName(e.target.value)} placeholder="e.g. Production Sync Agent" className="mt-1" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium">Public Key (PEM)</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={5} placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
                  value={publicKey} onChange={e => setPublicKey(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Bucket Access Matrix</label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">Select the actions this bot is allowed to perform on each bucket.</p>
                {buckets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No buckets found in this tenant.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="grid bg-muted/50 border-b px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      style={{ gridTemplateColumns: `1fr repeat(${BUCKET_PERMS.length}, 80px)` }}>
                      <span>Buckets</span>
                      {BUCKET_PERMS.map(p => <span key={p} className="text-center">{p}</span>)}
                    </div>
                    {buckets.map((bucket, i) => {
                      const perms = bucketPerms[bucket.id] ?? new Set();
                      return (
                        <div key={bucket.id}
                          className={`grid items-center px-4 py-3 ${i !== buckets.length - 1 ? 'border-b' : ''} hover:bg-muted/30`}
                          style={{ gridTemplateColumns: `1fr repeat(${BUCKET_PERMS.length}, 80px)` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <Checkbox checked={perms.size === BUCKET_PERMS.length} onCheckedChange={() => toggleAllPermsForBucket(bucket.id)} className="shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{bucket.name}</p>
                              <p className="text-xs text-muted-foreground">{bucket.region}</p>
                            </div>
                          </div>
                          {BUCKET_PERMS.map(perm => (
                            <div key={perm} className="flex justify-center">
                              <Checkbox checked={perms.has(perm)} onCheckedChange={() => togglePerm(bucket.id, perm)} />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
            </div>
          )}
        </GenericModal>
      </div>

      <div className="flex-1 bg-background rounded-lg border shadow-sm p-4">
        <DataTable
          data={bots}
          columns={columns}
          searchPlaceholder="Search bots by name or email…"
          emptyMessage="No bots registered yet. Add one to get started."
          onRowClick={(row) => router.push(`/bots/${row.id}`)}
        />
      </div>
    </div>
  );
}
