'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Activity, Bot, ShieldOff, CheckCircle2, XCircle, RefreshCw, ArrowUpFromLine, ArrowDownToLine, Trash2 } from 'lucide-react';
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
  FILE_UPLOAD:   { icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,   color: 'text-blue-500' },
  FILE_DOWNLOAD: { icon: <ArrowDownToLine className="h-3.5 w-3.5" />,   color: 'text-emerald-500' },
  FILE_DELETE:   { icon: <Trash2 className="h-3.5 w-3.5" />,            color: 'text-red-500' },
  LOGIN:         { icon: <CheckCircle2 className="h-3.5 w-3.5" />,      color: 'text-purple-500' },
  LOGOUT:        { icon: <XCircle className="h-3.5 w-3.5" />,           color: 'text-slate-400' },
};

export default function BotDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const botId = params.botId as string;

  React.useEffect(() => {
    if (user && user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
      router.replace('/');
    }
  }, [user, router]);

  const [bot, setBot]         = React.useState<any>(null);
  const [buckets, setBuckets] = React.useState<any[]>([]);
  const [matrix, setMatrix]   = React.useState<Record<string, Record<string, boolean>>>({});
  const [activity, setActivity] = React.useState<any[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [saving, setSaving]   = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState('');

  // Load bot + buckets
  React.useEffect(() => {
    getBots().then(r => {
      const found = (r.data ?? []).find((b: any) => b.id === botId);
      if (!found) { router.replace('/bots'); return; }
      setBot(found);
      setMatrix(parseBucketPerms(found.permissions ?? []));
    });
    getBucketsForTenant().then(r => {
      if (r.success) setBuckets(r.data ?? []);
    });
  }, [botId]);

  // Load activity on tab switch
  function loadActivity() {
    setActivityLoading(true);
    getBotActivity(botId).then(r => {
      setActivity(r.success ? (r.data ?? []) : []);
      setActivityLoading(false);
    });
  }

  function handleCheckbox(bucketId: string, action: string, checked: boolean) {
    setMatrix(prev => {
      const row = { ...prev[bucketId], [action]: checked };
      if (checked && action !== 'READ') row['READ'] = true;
      if (!checked && action === 'READ') {
        ACTIONS.forEach(a => { if (a !== 'READ') row[a] = false; });
      }
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

  if (!bot) return <div className="p-8 text-center text-muted-foreground">Loading bot...</div>;

  return (
    <div className="space-y-6 px-4 md:px-6 lg:px-8 py-6">
      {/* Header */}
      <div>
        <Button variant="link" className="px-0 text-muted-foreground mb-2" onClick={() => router.push('/bots')}>
          ← Back to Bots
        </Button>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-3 rounded-lg text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{bot.name}</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Registered by {bot.user?.email} ·{' '}
                Last used {bot.lastUsedAt ? new Date(bot.lastUsedAt).toLocaleDateString() : 'never'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              bot.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
            }`}>
              {bot.isActive ? 'Active' : 'Revoked'}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <ShieldOff className="h-3.5 w-3.5" /> Revoke Bot
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke bot access?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently deletes <strong>{bot.name}</strong> and invalidates all its tokens immediately.
                    The bot's next heartbeat will fail — this is the Kill Switch.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleRevoke}
                  >Revoke</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="permissions" className="w-full mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="permissions" className="gap-2">
            <Shield className="h-4 w-4" /> Permissions
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2" onClick={loadActivity}>
            <Activity className="h-4 w-4" /> Bot Activity
          </TabsTrigger>
        </TabsList>

        {/* ── Permissions Tab ── */}
        <TabsContent value="permissions" className="space-y-0 bg-slate-50 dark:bg-slate-900 border rounded-lg overflow-hidden">
          <div className="flex justify-between items-center bg-white dark:bg-slate-950 px-6 py-4 border-b">
            <div>
              <h2 className="text-xl font-semibold">Bucket Access Matrix</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select the actions this bot is allowed to perform on each bucket.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className={`text-sm font-medium ${saveMsg.startsWith('Saved') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {saveMsg}
                </span>
              )}
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          <div className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-slate-100 dark:bg-slate-800/50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold w-1/3">Buckets</th>
                  {ACTIONS.map(a => (
                    <th key={a} className="px-6 py-4 font-semibold text-center">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y border-b bg-white dark:bg-slate-950">
                {buckets.length === 0 && (
                  <tr>
                    <td colSpan={ACTIONS.length + 1} className="px-6 py-8 text-center text-muted-foreground">
                      No buckets available in this tenant.
                    </td>
                  </tr>
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

        {/* ── Activity Tab ── */}
        <TabsContent value="activity" className="bg-white dark:bg-slate-950 border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Bot Activity</h2>
              <p className="text-sm text-muted-foreground mt-1">Recent sync and authentication events for this bot.</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={loadActivity} disabled={activityLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${activityLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {activityLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Loading activity…
            </div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Activity className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No activity recorded yet.</p>
              <p className="text-xs mt-1">Events will appear here once the bot starts syncing.</p>
            </div>
          ) : (
            <div className="divide-y">
              {activity.map(log => {
                let details: any = {};
                try { details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details ?? {}); } catch {}
                const meta = ACTION_META[log.action];
                return (
                  <div key={log.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <div className={`shrink-0 ${meta?.color ?? 'text-muted-foreground'}`}>
                      {meta?.icon ?? <Activity className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{log.action.replace(/_/g, ' ')}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                        }`}>{log.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {details.name || details.fileName || log.resource || '—'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
