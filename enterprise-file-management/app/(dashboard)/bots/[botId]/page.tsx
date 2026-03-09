'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield, Activity, Bot, ShieldOff, CheckCircle2, XCircle, RefreshCw,
  ArrowUpFromLine, ArrowDownToLine, Trash2, Stethoscope, Wifi, WifiOff,
  AlertTriangle, Clock, Settings, Copy, Check, KeyRound, Monitor, Cpu, MemoryStick,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/components/providers/AuthProvider';
import { getBots, getBucketsForTenant, updateBotPermissions, revokeBot, getBotActivity, configureBotKey } from '@/app/actions/bots';

const ACTIONS = ['READ', 'WRITE', 'DELETE', 'SHARE', 'DOWNLOAD'];

function parseBucketPerms(permissions: string[]): Record<string, Record<string, boolean>> {
  const matrix: Record<string, Record<string, boolean>> = {};
  permissions.forEach(p => {
    const parts = p.split(':');
    if (parts[0] === 'BUCKET' && parts.length === 3) {
      if (!matrix[parts[1]]) matrix[parts[1]] = {};
      matrix[parts[1]][parts[2]] = true;
    }
  });
  return matrix;
}

const ACTION_META: Record<string, { icon: React.ReactNode; color: string }> = {
  FILE_UPLOAD:   { icon: <ArrowUpFromLine className="h-3.5 w-3.5" />, color: 'text-blue-500' },
  FILE_DOWNLOAD: { icon: <ArrowDownToLine className="h-3.5 w-3.5" />, color: 'text-emerald-500' },
  FILE_DELETE:   { icon: <Trash2 className="h-3.5 w-3.5" />,          color: 'text-red-500' },
  LOGIN:         { icon: <CheckCircle2 className="h-3.5 w-3.5" />,    color: 'text-purple-500' },
  LOGOUT:        { icon: <XCircle className="h-3.5 w-3.5" />,         color: 'text-slate-400' },
};

// ── Heartbeat Ribbon ─────────────────────────────────────────────────────────
function HeartbeatRibbon({ logs }: { logs: any[] }) {
  const now = Date.now();
  const buckets = Array.from({ length: 60 }, (_, i) => {
    const start = now - (60 - i) * 60 * 1000;
    const end   = start + 60 * 1000;
    const inBucket = logs.filter(l => {
      const t = new Date(l.timestamp).getTime();
      return t >= start && t < end;
    });
    if (!inBucket.length) return { status: 'none', latency: 0, timestamp: null };
    const latest = inBucket[inBucket.length - 1];
    return { status: latest.status, latency: latest.latencyMs || 0, error: latest.error, timestamp: latest.timestamp };
  });

  const successLogs = logs.filter(l => l.status === 'SUCCESS');
  const avgLatency  = successLogs.length
    ? Math.round(successLogs.reduce((s, l) => s + (l.latencyMs || 0), 0) / successLogs.length)
    : 0;
  const uptime = logs.length
    ? ((successLogs.length / logs.length) * 100).toFixed(1)
    : '0.0';
  const lastSuccess = successLogs.at(-1)?.timestamp ?? null;

  function color(b: typeof buckets[0]) {
    if (b.status === 'none')    return 'bg-muted';
    if (b.status === 'FAILED')  return 'bg-red-500';
    if (b.latency < 200)        return 'bg-emerald-500';
    if (b.latency < 500)        return 'bg-yellow-500';
    return 'bg-orange-500';
  }

  function ago(ts: string | null) {
    if (!ts) return 'Never';
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-0.5 h-10">
        {buckets.map((b, i) => (
          <div
            key={i}
            title={b.status === 'none' ? 'No data' : `${b.status} · ${b.latency}ms · ${ago(b.timestamp)}`}
            className={`flex-1 rounded-sm ${color(b)} opacity-90 hover:opacity-100 transition-opacity cursor-default`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Latency</p>
          <p className="text-xl font-black mt-0.5">{avgLatency}ms</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Uptime (session)</p>
          <p className="text-xl font-black mt-0.5">{uptime}%</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Last Success</p>
          <p className="text-xl font-black mt-0.5 text-sm">{ago(lastSuccess)}</p>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t">
        {[
          { cls: 'bg-emerald-500', label: 'Fast (<200ms)' },
          { cls: 'bg-yellow-500',  label: 'Slow (200-500ms)' },
          { cls: 'bg-red-500',     label: 'Failed' },
          { cls: 'bg-muted',       label: 'No data' },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const DIAG_STATUS: Record<string, { icon: React.ReactNode; border: string; bg: string }> = {
  pass: { icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />, border: 'border-emerald-200', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
  warn: { icon: <AlertTriangle className="h-5 w-5 text-yellow-600" />, border: 'border-yellow-200',  bg: 'bg-yellow-50 dark:bg-yellow-950/20' },
  fail: { icon: <XCircle className="h-5 w-5 text-red-600" />,          border: 'border-red-200',     bg: 'bg-red-50 dark:bg-red-950/20' },
};

function DiagCard({ d }: { d: any }) {
  const s = DIAG_STATUS[d.status] ?? DIAG_STATUS.warn;
  const data = typeof d.data === 'string' ? (() => { try { return JSON.parse(d.data); } catch { return null; } })() : d.data;
  return (
    <div className={`rounded-xl border-2 p-4 ${s.border} ${s.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        {s.icon}
        <span className="font-semibold text-sm">{d.name}</span>
        {d.durationMs > 0 && <span className="ml-auto text-xs text-muted-foreground">{d.durationMs}ms</span>}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{d.detail}</p>
      {data && typeof data === 'object' && (
        <div className="mt-2 pt-2 border-t border-current/10 grid grid-cols-2 gap-1 text-xs">
          {Object.entries(data).map(([k, v]) => (
            <div key={k}><span className="text-muted-foreground">{k}:</span> <span className="font-medium">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BotDetailPage() {
  const { user } = useAuth();
  const params   = useParams();
  const router   = useRouter();
  const botId    = params.botId as string;

  React.useEffect(() => {
    if (user && user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') router.replace('/');
  }, [user, router]);

  const [bot, setBot] = React.useState<any>(null);
  const [buckets, setBuckets] = React.useState<any[]>([]);
  const [matrix, setMatrix] = React.useState<Record<string, Record<string, boolean>>>({});
  const [activity, setActivity] = React.useState<any[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [healthData, setHealthData] = React.useState<any>(null);
  const [healthLoading, setHealthLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState('');

  // Agent Config state
  const [publicKeyInput, setPublicKeyInput] = React.useState('');
  const [keyConfigLoading, setKeyConfigLoading] = React.useState(false);
  const [keyConfigMsg, setKeyConfigMsg] = React.useState('');
  const [copiedAgentId, setCopiedAgentId] = React.useState(false);
  const [showFullKey, setShowFullKey] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    getBots().then(r => {
      const found = (r.data ?? []).find((b: any) => b.id === botId);
      if (!found) { router.replace('/bots'); return; }
      setBot(found);
      setMatrix(parseBucketPerms(found.permissions ?? []));
    });
    getBucketsForTenant().then(r => { if (r.success) setBuckets(r.data ?? []); });
  }, [botId]);

  // Auto-advance to step 3 when agent connects: poll health every 10s while on step 2
  React.useEffect(() => {
    const isKeyConfigured = bot?.publicKey && bot.publicKey !== '';
    const hasConnected = !!bot?.lastHeartbeatAt;
    if (!isKeyConfigured || hasConnected) return; // only poll on step 2

    function poll() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
      fetch(`/api/agent/health?botId=${botId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data?.bot?.lastHeartbeatAt) {
            // Agent connected — load full health data and advance
            setHealthData(data);
            setBot((prev: any) => ({ ...prev, lastHeartbeatAt: data.bot.lastHeartbeatAt, machineInfo: data.bot.machineInfo ?? prev.machineInfo }));
            if (pollRef.current) clearInterval(pollRef.current);
          }
        })
        .catch(() => {});
    }

    poll(); // immediate first check
    pollRef.current = setInterval(poll, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [bot?.publicKey, bot?.lastHeartbeatAt, botId]);

  function loadActivity() {
    setActivityLoading(true);
    getBotActivity(botId).then(r => {
      setActivity(r.success ? (r.data ?? []) : []);
      setActivityLoading(false);
    });
  }

  function loadHealth() {
    setHealthLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    fetch(`/api/agent/health?botId=${botId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setHealthData(data); setHealthLoading(false); })
      .catch(() => setHealthLoading(false));
  }

  async function handleSaveKey() {
    if (!publicKeyInput.trim()) {
      setKeyConfigMsg('Public key is required');
      return;
    }
    setKeyConfigLoading(true);
    setKeyConfigMsg('');
    const result = await configureBotKey(botId, publicKeyInput);
    setKeyConfigLoading(false);
    if (result.success) {
      setKeyConfigMsg('Public key saved successfully');
      setBot((prev: any) => ({ ...prev, publicKey: publicKeyInput.trim() }));
    } else {
      setKeyConfigMsg(result.error ?? 'Failed to save key');
    }
  }

  function handleCheckbox(bucketId: string, action: string, checked: boolean) {
    setMatrix(prev => {
      const row = { ...prev[bucketId], [action]: checked };
      if (checked && action !== 'READ') row['READ'] = true;
      if (!checked && action === 'READ') ACTIONS.forEach(a => { if (a !== 'READ') row[a] = false; });
      return { ...prev, [bucketId]: row };
    });
  }

  async function handleSave() {
    setSaving(true); setSaveMsg('');
    const permsObj: Record<string, string[]> = {};
    Object.entries(matrix).forEach(([bid, actions]) => {
      const active = Object.keys(actions).filter(a => actions[a]);
      if (active.length) permsObj[bid] = active;
    });
    const r = await updateBotPermissions(botId, permsObj);
    setSaving(false);
    setSaveMsg(r.success ? 'Saved successfully' : (r.error ?? 'Failed to save'));
  }

  async function handleRevoke() {
    await revokeBot(botId);
    router.replace('/bots');
  }

  if (!bot) return <div className="p-8 text-center text-muted-foreground">Loading service account...</div>;

  const hLogs = (healthData?.heartbeatLogs as any[]) ?? [];
  const diags = (healthData?.diagnostics as any[]) ?? [];
  const botStatus = healthData?.bot?.status ?? 'UNKNOWN';
  const isOnline  = botStatus === 'ONLINE';
  const isKeyConfigured = bot.publicKey && bot.publicKey !== '';
  const hasConnected = !!bot.lastHeartbeatAt;
  
  // Determine wizard step based on state
  const getWizardStep = () => {
    if (!isKeyConfigured) return 1; // Need to paste key
    if (!hasConnected) return 2;    // Key saved, waiting for first connection
    return 3;                        // Connected, show machine info
  };
  const wizardStep = getWizardStep();

  return (
    <div className="space-y-6 px-4 md:px-6 lg:px-8 py-6">
      <div>
        <Button variant="link" className="px-0 text-muted-foreground mb-2 cursor-pointer" onClick={() => router.push('/bots')}>
          ← Back to Service Accounts
        </Button>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-3 rounded-lg text-primary"><Bot className="h-6 w-6" /></div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{bot.name}</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Registered by {bot.user?.email} · Last used {bot.lastUsedAt ? new Date(bot.lastUsedAt).toLocaleDateString() : 'never'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${bot.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {bot.isActive ? 'Active' : 'Revoked'}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <ShieldOff className="h-3.5 w-3.5" /> Revoke Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke service account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently deletes <strong>{bot.name}</strong> and invalidates all its tokens immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleRevoke}>
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <Tabs defaultValue="permissions" className="w-full mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="permissions" className="gap-2 cursor-pointer"><Shield className="h-4 w-4" /> Permissions</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2 cursor-pointer" onClick={loadActivity}><Activity className="h-4 w-4" /> Activity</TabsTrigger>
          <TabsTrigger value="health" className="gap-2 cursor-pointer" onClick={loadHealth}><Stethoscope className="h-4 w-4" /> Health & Metrics</TabsTrigger>
          <TabsTrigger value="config" className="gap-2 cursor-pointer"><Settings className="h-4 w-4" /> Agent Config</TabsTrigger>
        </TabsList>

        {/* ── Agent Config ── */}
        <TabsContent value="config" className="space-y-4">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map((step) => (
              <React.Fragment key={step}>
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                  wizardStep >= step 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {wizardStep > step ? <Check className="h-4 w-4" /> : step}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-1 rounded ${wizardStep > step ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Paste Public Key */}
          {wizardStep === 1 && (
            <div className="bg-white dark:bg-slate-950 border rounded-lg p-6 space-y-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950 mb-3">
                  <KeyRound className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold">Step 1: Configure Public Key</h2>
                <p className="text-sm text-muted-foreground mt-1">Generate a key pair in the desktop agent and paste the public key here.</p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">How to get the public key:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-sm text-blue-700 dark:text-blue-400">
                  <li>Open the CloudVault desktop agent</li>
                  <li>Navigate to Login → Bot tab</li>
                  <li>Click "Generate Key Pair"</li>
                  <li>Copy the public key displayed</li>
                </ol>
              </div>

              <div>
                <label className="text-sm font-medium">Public Key (PEM)</label>
                <textarea
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={8}
                  placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                  value={publicKeyInput}
                  onChange={e => setPublicKeyInput(e.target.value)}
                />
              </div>

              {keyConfigMsg && (
                <p className={`text-sm font-medium ${keyConfigMsg.includes('success') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {keyConfigMsg}
                </p>
              )}

              <Button onClick={handleSaveKey} disabled={keyConfigLoading || !publicKeyInput.trim()} className="w-full" size="lg">
                {keyConfigLoading ? 'Saving...' : 'Next →'}
              </Button>
            </div>
          )}

          {/* Step 2: Show Agent ID */}
          {wizardStep === 2 && (
            <div className="bg-white dark:bg-slate-950 border rounded-lg p-6 space-y-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 mb-3">
                  <Bot className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold">Step 2: Connect Agent</h2>
                <p className="text-sm text-muted-foreground mt-1">Copy the Agent ID below and paste it into the desktop agent.</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">Agent ID</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={async () => {
                      await navigator.clipboard.writeText(botId);
                      setCopiedAgentId(true);
                      setTimeout(() => setCopiedAgentId(false), 2000);
                    }}
                  >
                    {copiedAgentId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy
                  </Button>
                </div>
                <code className="block rounded-md bg-white/50 dark:bg-slate-900/50 px-4 py-3 text-sm font-mono break-all border border-emerald-100 dark:border-emerald-900">
                  {botId}
                </code>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">Next steps in the desktop agent:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-sm text-amber-700 dark:text-amber-400">
                  <li>Go to Login → Bot tab</li>
                  <li>Paste the Agent ID above into the "Service Account ID" field</li>
                  <li>Click "Connect" to complete the handshake</li>
                </ol>
              </div>

              <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                <div className="animate-pulse h-3 w-3 rounded-full bg-amber-500" />
                <span className="text-sm text-muted-foreground">Waiting for agent to connect...</span>
                <Button variant="ghost" size="sm" onClick={async () => {
                  const r = await getBots();
                  const found = (r.data ?? []).find((b: any) => b.id === botId);
                  if (found) setBot(found);
                }}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Connected - Show Agent ID + System Info */}
          {wizardStep === 3 && (
            <div className="space-y-6">
              {/* Agent ID */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-indigo-600" />
                    <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100">Agent ID</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Connected
                    </span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
                      await navigator.clipboard.writeText(botId);
                      setCopiedAgentId(true);
                      setTimeout(() => setCopiedAgentId(false), 2000);
                    }}>
                      {copiedAgentId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  First connected: {bot.lastHeartbeatAt ? new Date(bot.lastHeartbeatAt).toLocaleString() : 'Unknown'}
                </p>
                <code className="block rounded-md bg-white/50 dark:bg-slate-900/50 px-4 py-3 text-sm font-mono break-all border border-indigo-100 dark:border-indigo-900">
                  {botId}
                </code>
              </div>

              {/* System Information */}
              {(() => {
                // Prefer machineInfo from healthData (freshest), fall back to bot.machineInfo
                const info = (healthData?.bot?.machineInfo ?? bot.machineInfo) as any;
                if (!info) return (
                  <div className="bg-white dark:bg-slate-950 border rounded-lg p-8 text-center">
                    <Monitor className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                    <p className="text-sm text-muted-foreground">Fetching system information...</p>
                    <p className="text-xs text-muted-foreground mt-1">Will appear after the agent's next health report (~5 min).</p>
                  </div>
                );
                const fields: { key: keyof typeof info; label: string; icon: React.ReactNode; sub?: keyof typeof info }[] = [
                  { key: 'hostname',     label: 'Hostname',          icon: <Monitor className="h-4 w-4" /> },
                  { key: 'os',           label: 'Operating System',  icon: <Monitor className="h-4 w-4" /> },
                  { key: 'arch',         label: 'Architecture',      icon: <Cpu className="h-4 w-4" /> },
                  { key: 'cpuModel',     label: 'CPU',               icon: <Cpu className="h-4 w-4" />,         sub: 'cpuCores' },
                  { key: 'totalMemory',  label: 'RAM',               icon: <MemoryStick className="h-4 w-4" />, sub: 'freeMemory' },
                  { key: 'ipAddress',    label: 'IP Address',        icon: <Wifi className="h-4 w-4" /> },
                  { key: 'macAddress',   label: 'MAC Address',       icon: <Wifi className="h-4 w-4" /> },
                  { key: 'agentVersion', label: 'Agent Version',     icon: <Bot className="h-4 w-4" /> },
                ];
                return (
                  <div className="bg-white dark:bg-slate-950 border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Monitor className="h-5 w-5" /> System Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {fields.filter(f => info[f.key]).map(f => (
                        <div key={String(f.key)} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                          <span className="text-muted-foreground mt-0.5">{f.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">{f.label}</p>
                            <p className="text-sm font-medium truncate font-mono">{String(info[f.key])}</p>
                            {f.sub && info[f.sub] && (
                              <p className="text-xs text-muted-foreground">
                                {f.key === 'cpuModel' ? `${info[f.sub]} cores` : `${info[f.sub]} free`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>

        {/* ── Permissions ── */}
        <TabsContent value="permissions" className="space-y-0 bg-slate-50 dark:bg-slate-900 border rounded-lg overflow-hidden">
          <div className="flex justify-between items-center bg-white dark:bg-slate-950 px-6 py-4 border-b">
            <div>
              <h2 className="text-xl font-semibold">Bucket Access Matrix</h2>
              <p className="text-sm text-muted-foreground mt-1">Select the actions this service account is allowed to perform on each bucket.</p>
            </div>
            <div className="flex items-center gap-3">
              {saveMsg && <span className={`text-sm font-medium ${saveMsg.startsWith('Saved') ? 'text-emerald-600' : 'text-red-500'}`}>{saveMsg}</span>}
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-slate-100 dark:bg-slate-800/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold w-1/3">Buckets</th>
                  {ACTIONS.map(a => <th key={a} className="px-6 py-4 font-semibold text-center">{a}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y border-b bg-white dark:bg-slate-950">
                {buckets.length === 0 && (
                  <tr><td colSpan={ACTIONS.length + 1} className="px-6 py-8 text-center text-muted-foreground">No buckets available.</td></tr>
                )}
                {buckets.map(bucket => (
                  <tr key={bucket.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <span className="block">{bucket.name}</span>
                      <span className="text-xs text-muted-foreground font-normal">{bucket.region}</span>
                    </td>
                    {ACTIONS.map(action => (
                      <td key={action} className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={matrix[bucket.id]?.[action] ?? false}
                            onCheckedChange={checked => handleCheckbox(bucket.id, action, checked as boolean)}
                            className="data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Activity ── */}
        <TabsContent value="activity" className="bg-white dark:bg-slate-950 border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Account Activity</h2>
              <p className="text-sm text-muted-foreground mt-1">Recent sync and authentication events.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={loadActivity} disabled={activityLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${activityLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          {activityLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading activity…</div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Activity className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {activity.map(log => {
                let details: any = {};
                try { details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details ?? {}); } catch {}
                const meta = ACTION_META[log.action];
                return (
                  <div key={log.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <div className={`shrink-0 ${meta?.color ?? 'text-muted-foreground'}`}>{meta?.icon ?? <Activity className="h-3.5 w-3.5" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{log.action.replace(/_/g, ' ')}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{log.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{details.name || details.fileName || log.resource || '—'}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Health & Metrics ── */}
        <TabsContent value="health" className="border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-white dark:bg-slate-950">
            <div>
              <h2 className="text-xl font-semibold">Agent Health & Metrics</h2>
              <p className="text-sm text-muted-foreground mt-1">Heartbeat history and environment diagnostics from the agent.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={loadHealth} disabled={healthLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {healthLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm bg-white dark:bg-slate-950">Loading…</div>
          ) : !healthData ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-white dark:bg-slate-950">
              <Stethoscope className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">Click Refresh to load health data.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-950 p-6 space-y-6">
              <div className={`flex items-center gap-4 rounded-xl border-2 p-4 ${isOnline ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 bg-slate-50 dark:bg-slate-900'}`}>
                <div className={`p-2 rounded-lg ${isOnline ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  {isOnline ? <Wifi className="h-5 w-5 text-emerald-600" /> : <WifiOff className="h-5 w-5 text-slate-400" />}
                </div>
                <div className="flex-1">
                  <p className={`text-lg font-bold ${isOnline ? 'text-emerald-700' : 'text-slate-500'}`}>{botStatus}</p>
                  <p className="text-xs text-muted-foreground">
                    Last heartbeat: {healthData.bot?.lastHeartbeatAt ? new Date(healthData.bot.lastHeartbeatAt).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{hLogs.length} beats recorded</p>
                  <p>{diags.length} diagnostics</p>
                </div>
              </div>

              {hLogs.length > 0 ? (
                <div className="rounded-xl border p-4 space-y-2">
                  <p className="text-sm font-semibold">Heartbeat — Last 60 minutes</p>
                  <HeartbeatRibbon logs={hLogs} />
                </div>
              ) : (
                <div className="rounded-xl border p-6 text-center text-muted-foreground text-sm">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No heartbeat data yet — agent reports every 5 minutes.
                </div>
              )}

              {diags.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-3">System Diagnostics</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {diags.map((d: any) => <DiagCard key={d.name} d={d} />)}
                  </div>
                </div>
              )}

              {diags.length === 0 && hLogs.length > 0 && (
                <div className="rounded-xl border p-6 text-center text-muted-foreground text-sm">
                  No diagnostics run yet — use the Doctor tab in the agent to run them.
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
