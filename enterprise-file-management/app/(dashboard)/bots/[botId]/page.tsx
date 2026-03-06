'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield, Activity, Bot, ShieldOff, CheckCircle2, XCircle, RefreshCw,
  ArrowUpFromLine, ArrowDownToLine, Trash2, Stethoscope, Wifi, WifiOff,
  AlertTriangle, Clock,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/components/providers/AuthProvider';
import { getBots, getBucketsForTenant, updateBotPermissions, revokeBot, getBotActivity } from '@/app/actions/bots';

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
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-3">
      {/* Ribbon */}
      <div className="flex gap-0.5 h-10">
        {buckets.map((b, i) => (
          <div
            key={i}
            title={b.status === 'none' ? 'No data' : `${b.status} · ${b.latency}ms · ${ago(b.timestamp)}`}
            className={`flex-1 rounded-sm ${color(b)} opacity-90 hover:opacity-100 transition-opacity cursor-default`}
          />
        ))}
      </div>
      {/* Metrics row */}
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
      {/* Legend */}
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

// ── Diagnostic Card ──────────────────────────────────────────────────────────
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BotDetailPage() {
  const { user } = useAuth();
  const params   = useParams();
  const router   = useRouter();
  const botId    = params.botId as string;

  React.useEffect(() => {
    if (user && user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') router.replace('/');
  }, [user, router]);

  const [bot, setBot]       = React.useState<any>(null);
  const [buckets, setBuckets] = React.useState<any[]>([]);
  const [matrix, setMatrix] = React.useState<Record<string, Record<string, boolean>>>({});
  const [activity, setActivity]         = React.useState<any[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [healthData, setHealthData]     = React.useState<any>(null);
  const [healthLoading, setHealthLoading] = React.useState(false);
  const [saving, setSaving]   = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState('');

  React.useEffect(() => {
    getBots().then(r => {
      const found = (r.data ?? []).find((b: any) => b.id === botId);
      if (!found) { router.replace('/bots'); return; }
      setBot(found);
      setMatrix(parseBucketPerms(found.permissions ?? []));
    });
    getBucketsForTenant().then(r => { if (r.success) setBuckets(r.data ?? []); });
  }, [botId]);

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

  return (
    <div className="space-y-6 px-4 md:px-6 lg:px-8 py-6">
      {/* Header */}
      <div>
        <Button variant="link" className="px-0 text-muted-foreground mb-2" onClick={() => router.push('/bots')}>
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
                    The service account's next heartbeat will fail — this is the Kill Switch.
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

      {/* Tabs */}
      <Tabs defaultValue="permissions" className="w-full mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="permissions" className="gap-2"><Shield className="h-4 w-4" /> Permissions</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2" onClick={loadActivity}><Activity className="h-4 w-4" /> Activity</TabsTrigger>
          <TabsTrigger value="health" className="gap-2" onClick={loadHealth}><Stethoscope className="h-4 w-4" /> Health & Metrics</TabsTrigger>
        </TabsList>

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

              {/* Status banner */}
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

              {/* Heartbeat Ribbon */}
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

              {/* Diagnostics Grid */}
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
