"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { GenericModal } from "@/components/ui/generic-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, Trash2, Copy, Check, KeyRound, ShieldCheck, Clock } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getBots, registerBot, revokeBot } from "@/app/actions/bots";

const PERMISSION_OPTIONS = ["READ", "SYNC", "UPLOAD", "DELETE", "LIST"];

export default function BotsPage() {
  const { user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (user && user.role !== "PLATFORM_ADMIN" && user.role !== "TENANT_ADMIN") {
      router.replace("/");
    }
  }, [user, router]);

  const [bots, setBots]               = React.useState<any[]>([]);
  const [searchTerm, setSearchTerm]   = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Form state
  const [botName, setBotName]             = React.useState("");
  const [publicKey, setPublicKey]         = React.useState("");
  const [selectedPerms, setSelectedPerms] = React.useState<string[]>(["READ", "SYNC"]);
  const [loading, setLoading]             = React.useState(false);
  const [error, setError]                 = React.useState("");

  // Post-registration success state
  const [newBotId, setNewBotId] = React.useState<string | null>(null);
  const [copied, setCopied]     = React.useState(false);

  React.useEffect(() => { fetchBots(); }, []);

  async function fetchBots() {
    const result = await getBots();
    if (result.success) setBots(result.data ?? []);
  }

  function resetForm() {
    setBotName(""); setPublicKey(""); setSelectedPerms(["READ", "SYNC"]);
    setError(""); setNewBotId(null); setCopied(false);
  }

  async function handleRegisterBot() {
    if (!botName.trim() || !publicKey.trim()) {
      setError("Bot name and public key are required."); return;
    }
    setError(""); setLoading(true);
    const fd = new FormData();
    fd.set("name", botName.trim());
    fd.set("publicKey", publicKey.trim());
    fd.set("permissions", selectedPerms.join(","));
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

  async function handleCopyBotId() {
    if (!newBotId) return;
    await navigator.clipboard.writeText(newBotId);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function togglePerm(perm: string) {
    setSelectedPerms(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  }

  const columns: ColumnDef<any>[] = [
    {
      header: "Bot Name",
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-md text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-semibold">{row.name}</span>
        </div>
      ),
    },
    {
      header: "Registered By",
      accessorKey: "user",
      cell: (row) => (
        <span className="text-muted-foreground">{row.user?.email ?? "—"}</span>
      ),
    },
    {
      header: "Permissions",
      accessorKey: "permissions",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.permissions ?? []).map((p: string) => (
            <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
          ))}
        </div>
      ),
    },
    {
      header: "Status",
      accessorKey: "isActive",
      cell: (row) => (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
          row.isActive
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
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
          {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString(undefined, {
            year: "numeric", month: "short", day: "numeric",
          }) : "Never"}
        </span>
      ),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      className: "text-right",
      cell: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke bot access?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes <strong>{row.name}</strong> and immediately invalidates all its tokens.
                  The bot's next heartbeat will fail — this is the Kill Switch.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => handleRevoke(row.id)}
                >
                  Revoke
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 h-full flex flex-col space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bot Identities</h1>
          <p className="text-muted-foreground mt-1">
            Register machine identities for headless automation. Delete a bot to immediately revoke its access.
          </p>
        </div>

        <GenericModal
          title={newBotId ? "Bot Registered" : "Register Bot Identity"}
          description={
            newBotId
              ? "Copy the Bot ID below and paste it into the CloudVault desktop agent."
              : "Paste the public key generated by the CloudVault desktop agent."
          }
          open={isModalOpen}
          onOpenChange={(open) => { setIsModalOpen(open); if (!open) resetForm(); }}
          trigger={
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Bot
            </Button>
          }
          footer={
            newBotId ? (
              <Button onClick={() => { setIsModalOpen(false); resetForm(); }}>Done</Button>
            ) : (
              <Button disabled={loading} onClick={handleRegisterBot}>
                {loading ? "Registering…" : "Register Bot"}
              </Button>
            )
          }
        >
          {newBotId ? (
            /* ── Success: show Bot ID ──────────────────────────────────── */
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Bot registered successfully</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Copy the Bot ID and paste it into the CloudVault desktop agent → Bot tab → Bot ID field.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bot ID</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all">
                    {newBotId}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopyBotId}>
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Registration form ─────────────────────────────────────── */
            <div className="space-y-4 py-2">
              {/* How-to */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> How to get the public key
                </p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Open the CloudVault desktop agent.</li>
                  <li>Go to Login → Bot tab → Generate Key Pair.</li>
                  <li>Copy the public key and paste it below.</li>
                </ol>
              </div>

              <div>
                <label className="text-sm font-medium">Bot Name</label>
                <Input
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  placeholder="e.g. Production Sync Agent"
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium">Public Key (PEM)</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={6}
                  placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Permissions</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {PERMISSION_OPTIONS.map((perm) => (
                    <button
                      key={perm}
                      type="button"
                      onClick={() => togglePerm(perm)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selectedPerms.includes(perm)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:border-primary/50"
                      }`}
                    >
                      {perm}
                    </button>
                  ))}
                </div>
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
          onSearch={setSearchTerm}
          emptyMessage="No bots registered yet. Add one to get started."
        />
      </div>
    </div>
  );
}
