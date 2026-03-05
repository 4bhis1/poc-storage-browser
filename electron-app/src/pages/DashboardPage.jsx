import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, RefreshCw,
  HardDrive, ArrowDown, ArrowUp, Download, Upload,
  FolderOpen, Activity, ShieldCheck, Wifi, Database,
  AlertCircle, Zap, TrendingUp, BarChart2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSystem } from '../contexts/SystemContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
  return formatBytes(bytesPerSec) + '/s';
}

function timeAgo(dateString) {
  if (!dateString) return 'Never';
  const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'blue', onClick }) {
  const colors = {
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    border: 'border-blue-100' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   border: 'border-amber-100' },
    rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    border: 'border-rose-100' },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  border: 'border-purple-100' },
    slate:   { bg: 'bg-slate-100',  icon: 'text-slate-600',   border: 'border-slate-200' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border ${c.border} p-5 flex items-center gap-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5' : ''}`}
    >
      <div className={`p-3 rounded-xl ${c.bg} shrink-0`}>
        <Icon className={`h-5 w-5 ${c.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({ act }) {
  const actionColors = {
    DOWNLOAD: 'bg-emerald-50 text-emerald-700',
    UPLOAD:   'bg-amber-50 text-amber-700',
    DELETE:   'bg-rose-50 text-rose-600',
    SKIP:     'bg-slate-100 text-slate-500',
  };
  const ActionIcon = act.action === 'DOWNLOAD' ? Download : act.action === 'UPLOAD' ? Upload : Activity;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0 group">
      <div className={`p-1.5 rounded-lg ${actionColors[act.action] || 'bg-blue-50 text-blue-600'} shrink-0`}>
        <ActionIcon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{act.fileName}</p>
        <p className="text-xs text-slate-400">{formatDate(act.createdAt)}</p>
      </div>
      <div className="shrink-0">
        {act.status === 'SUCCESS'
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          : <XCircle className="h-4 w-4 text-rose-500" />}
      </div>
    </div>
  );
}

// ── Transfer Row ──────────────────────────────────────────────────────────────

function TransferRow({ transfer }) {
  const pct = Math.min(100, Math.round(transfer.progress || 0));
  const isDownload = transfer.type === 'download';
  const Icon = isDownload ? Download : Upload;
  const barColor = transfer.status === 'error' ? 'bg-rose-500' : isDownload ? 'bg-emerald-500' : 'bg-amber-500';
  return (
    <div className="py-2.5 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-3 mb-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${isDownload ? 'text-emerald-600' : 'text-amber-600'}`} />
        <p className="text-sm font-medium text-slate-800 truncate flex-1">{transfer.name}</p>
        <span className="text-xs font-bold text-slate-500 shrink-0">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor} ${transfer.status === 'done' ? 'opacity-50' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {transfer.bytesTransferred > 0 && (
        <p className="text-[10px] text-slate-400 mt-0.5">{formatBytes(transfer.bytesTransferred)} transferred</p>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, token } = useAuth();
  const { networkStats, diskStats } = useSystem();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    buckets: 0, files: 0, totalSize: 0,
    lastSync: null, syncConfigs: 0, activeConfigs: 0,
    recentSuccess: 0, recentFailed: 0,
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [activeTransfers, setActiveTransfers] = useState([]);
  const [syncConfigs, setSyncConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      // Core stats from local DB
      const [bucketRes, fileRes, actRes, configRes] = await Promise.all([
        window.electronAPI.dbQuery('SELECT COUNT(*) as count FROM "Bucket"', []),
        window.electronAPI.dbQuery('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM "FileObject" WHERE "isFolder" = false', []),
        window.electronAPI.getLocalSyncActivities(null),
        window.electronAPI.getSyncConfigs(),
      ]);

      // Last sync time across all configs
      const lastSyncRes = await window.electronAPI.dbQuery(
        'SELECT "lastSync" FROM "SyncConfig" WHERE "lastSync" IS NOT NULL ORDER BY "lastSync" DESC LIMIT 1', []
      );

      const activities = actRes || [];
      const successCount = activities.filter(a => a.status === 'SUCCESS').length;
      const failedCount  = activities.filter(a => a.status === 'FAILED').length;

      setStats({
        buckets: parseInt(bucketRes.rows[0]?.count || 0),
        files: parseInt(fileRes.rows[0]?.count || 0),
        totalSize: parseInt(fileRes.rows[0]?.total || 0),
        lastSync: lastSyncRes.rows[0]?.lastSync || null,
        syncConfigs: (configRes || []).length,
        activeConfigs: (configRes || []).filter(c => c.isActive).length,
        recentSuccess: successCount,
        recentFailed: failedCount,
      });

      setRecentActivities(activities.slice(0, 8));
      setSyncConfigs((configRes || []).slice(0, 3));

      // Active transfers
      const transfers = await window.electronAPI.getActiveTransfers();
      setActiveTransfers(Object.values(transfers || {}).filter(t => t.status !== 'done' && t.status !== 'error').slice(0, 4));
    } catch (err) {
      console.error('[Dashboard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Transfer status subscription
  useEffect(() => {
    if (!window.electronAPI?.onTransferStatusUpdate) return;
    const cleanup = window.electronAPI.onTransferStatusUpdate((transfers) => {
      setActiveTransfers(
        Object.values(transfers || {})
          .filter(t => t.status !== 'done' && t.status !== 'error')
          .slice(0, 4)
      );
    });
    return cleanup;
  }, []);

  const diskPct = diskStats ? Math.round((diskStats.used / diskStats.total) * 100) : 0;
  const diskBarColor = diskPct > 85 ? 'bg-rose-500' : diskPct > 65 ? 'bg-amber-500' : 'bg-blue-500';

  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const handleForceSync = async () => {
    if (window.electronAPI) {
      setIsForceSyncing(true);
      await window.electronAPI.forceSync();
      setTimeout(() => {
        fetchAll();
        setIsForceSyncing(false);
      }, 3000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/80 overflow-auto">
      {/* ── Header ────────────────── */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-900">Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 bg-white" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-sm" onClick={handleForceSync} disabled={isForceSyncing}>
            {isForceSyncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {isForceSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Auth / Status Banner ─────── */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 rounded-2xl p-5 flex items-center gap-5 shadow-lg">
          <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-lg shadow-md shrink-0">
            {(user?.name || user?.email || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base truncate">
              {user?.name || user?.email || 'CloudVault Agent'}
            </p>
            <p className="text-slate-400 text-xs mt-0.5 truncate">{user?.email || 'Logged in'}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-1.5 text-xs">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">Agent Online</span>
            </div>
            <div className="h-6 w-px bg-slate-600" />
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300 text-xs font-medium">Session Active</span>
            </div>
          </div>
        </div>

        {/* ── Stats Grid ──────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={HardDrive}
            label="Buckets"
            value={loading ? '—' : stats.buckets}
            sub="Synced locally"
            color="blue"
            onClick={() => navigate('/buckets')}
          />
          <StatCard
            icon={Database}
            label="Files"
            value={loading ? '—' : stats.files.toLocaleString()}
            sub={formatBytes(stats.totalSize) + ' total'}
            color="purple"
            onClick={() => navigate('/buckets')}
          />
          <StatCard
            icon={CheckCircle2}
            label="Synced OK"
            value={loading ? '—' : stats.recentSuccess}
            sub="Successful transfers"
            color="emerald"
          />
          <StatCard
            icon={AlertCircle}
            label="Failed"
            value={loading ? '—' : stats.recentFailed}
            sub={stats.recentFailed > 0 ? 'Check activities log' : 'All good'}
            color={stats.recentFailed > 0 ? 'rose' : 'slate'}
            onClick={() => stats.recentFailed > 0 && navigate('/recent')}
          />
        </div>

        {/* ── Middle Row ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Sync Status */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4 text-blue-500" /> Sync Engine
              </h3>
              <button
                onClick={() => navigate('/sync')}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                Manage →
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Configs</span>
                <span className="font-bold text-slate-900">{stats.syncConfigs}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Active</span>
                <span className="font-bold text-emerald-600">{stats.activeConfigs}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Last Sync</span>
                <span className={`font-bold ${stats.lastSync ? 'text-slate-900' : 'text-slate-400'}`}>
                  {timeAgo(stats.lastSync)}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3 mt-1 space-y-2">
                {syncConfigs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2 italic">No sync configs yet</p>
                ) : (
                  syncConfigs.map(cfg => {
                    const isUpload = cfg.direction === 'UPLOAD';
                    const watcherActive = isUpload && cfg.useWatcher;
                    return (
                    <button
                      key={cfg.id}
                      onClick={() => navigate(`/sync/${cfg.id}`)}
                      className="w-full flex items-center justify-between text-xs bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-slate-700 truncate mr-2">
                        <span className={`text-[10px] ${isUpload ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {isUpload ? '⬆' : '⬇'}
                        </span>
                        {cfg.name}
                        {watcherActive && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />}
                      </span>
                      <span className="text-slate-400 shrink-0">every {cfg.intervalMinutes}m</span>
                    </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Network & Disk */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-4">
              <Activity className="h-4 w-4 text-purple-500" /> System Resources
            </h3>
            <div className="space-y-5">
              {/* Network */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">
                  <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> Network</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1">
                      <ArrowDown className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase">Down</span>
                    </div>
                    <p className="font-black text-slate-800 text-sm font-mono">{formatSpeed(networkStats?.down || 0)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                      <ArrowUp className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase">Up</span>
                    </div>
                    <p className="font-black text-slate-800 text-sm font-mono">{formatSpeed(networkStats?.up || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Disk */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-500 font-semibold uppercase tracking-wide flex items-center gap-1">
                    <HardDrive className="h-3 w-3" /> Disk Usage
                  </span>
                  <span className="font-black text-slate-700">{diskPct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${diskBarColor}`}
                    style={{ width: `${diskPct}%` }}
                  />
                </div>
                {diskStats && (
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                    <span>{formatBytes(diskStats.used)} used</span>
                    <span>{formatBytes(diskStats.available)} free</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Transfers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-amber-500" /> Active Transfers
              </h3>
              {activeTransfers.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                  {activeTransfers.length} active
                </span>
              )}
            </div>
            {activeTransfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">All transfers complete</p>
                <p className="text-xs text-slate-400 mt-0.5">No active uploads or downloads</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activeTransfers.map(t => <TransferRow key={t.id} transfer={t} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent Activity Log ──────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-500" /> Recent Activity Log
            </h3>
            <button
              onClick={() => navigate('/recent')}
              className="text-xs text-blue-600 font-semibold hover:underline"
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-slate-50 px-5">
            {loading && recentActivities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Loading activity log…</p>
            ) : recentActivities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8 italic">No recent activities. Start a sync to see events here.</p>
            ) : (
              recentActivities.map(act => <ActivityRow key={act.id} act={act} />)
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
