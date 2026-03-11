import React from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';

/**
 * HeartbeatRibbon — 60-minute pulse visualization
 * Shows the last 60 minutes of heartbeat status as a horizontal bar.
 * Color coding: green (< 200ms), yellow (200-500ms), red (failed), gray (no data)
 */
export default function HeartbeatRibbon({ logs, currentStatus }) {
  // Timestamps are stored as local ISO strings (with offset or Z) — parse directly
  const parseUTC = (ts) => ts ? new Date(ts).getTime() : 0;

  // Group logs into 1-minute buckets (60 total)
  const now = Date.now();
  const buckets = Array.from({ length: 60 }, (_, i) => {
    const bucketStart = now - (60 - i) * 60 * 1000;
    const bucketEnd = bucketStart + 60 * 1000;
    
    const logsInBucket = logs.filter(log => {
      const logTime = parseUTC(log.timestamp);
      return logTime >= bucketStart && logTime < bucketEnd;
    });

    if (logsInBucket.length === 0) return { status: 'none', latency: 0 };

    // Use the most recent log in this bucket
    const latest = logsInBucket[logsInBucket.length - 1];
    return {
      status: latest.status,
      latency: latest.latencyMs || 0,
      error: latest.error,
      timestamp: latest.timestamp,
    };
  });

  // Calculate metrics
  const successLogs = logs.filter(l => l.status === 'SUCCESS');
  const avgLatency = successLogs.length > 0
    ? Math.round(successLogs.reduce((sum, l) => sum + (l.latencyMs || 0), 0) / successLogs.length)
    : 0;

  const last24h = logs.filter(l => {
    const logTime = parseUTC(l.timestamp);
    return logTime > now - 24 * 60 * 60 * 1000;
  });
  const uptime24h = last24h.length > 0
    ? ((last24h.filter(l => l.status === 'SUCCESS').length / last24h.length) * 100).toFixed(1)
    : 0;

  const lastSuccess = successLogs.length > 0 ? successLogs[successLogs.length - 1].timestamp : null;

  function getColor(bucket) {
    if (bucket.status === 'none') return 'bg-slate-200';
    if (bucket.status === 'FAILED') return 'bg-red-500';
    if (bucket.latency < 200) return 'bg-emerald-500';
    if (bucket.latency < 500) return 'bg-yellow-500';
    return 'bg-orange-500';
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${currentStatus === 'ACTIVE' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            {currentStatus === 'ACTIVE' ? (
              <Wifi className="h-5 w-5 text-emerald-600" />
            ) : (
              <WifiOff className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Agent Heartbeat</h3>
            <p className="text-xs text-slate-500">Last 60 minutes</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
          currentStatus === 'ACTIVE' 
            ? 'bg-emerald-100 text-emerald-700' 
            : 'bg-slate-100 text-slate-600'
        }`}>
          {currentStatus || 'UNKNOWN'}
        </div>
      </div>

      {/* Pulse Ribbon */}
      <div className="flex gap-0.5 h-12 mb-4">
        {buckets.map((bucket, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${getColor(bucket)} transition-all hover:opacity-80 cursor-pointer group relative`}
            title={bucket.status === 'none' ? 'No data' : `${bucket.status} - ${bucket.latency}ms`}
          >
            {bucket.status !== 'none' && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {bucket.status === 'FAILED' ? bucket.error || 'Failed' : `${bucket.latency}ms`}
                <div className="text-[10px] text-slate-400">{formatTime(bucket.timestamp)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Latency</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5">{avgLatency}ms</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Uptime (24h)</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5">{uptime24h}%</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Success</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5 text-sm">{formatTime(lastSuccess)}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
          <span>Fast (&lt;200ms)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <div className="w-3 h-3 rounded-sm bg-yellow-500"></div>
          <span>Slow (200-500ms)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <div className="w-3 h-3 rounded-sm bg-red-500"></div>
          <span>Failed</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <div className="w-3 h-3 rounded-sm bg-slate-200"></div>
          <span>No Data</span>
        </div>
      </div>
    </div>
  );
}
