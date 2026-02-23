import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';
import {
  RefreshCw, CheckCircle2, XCircle, Clock,
  Archive, Download, Upload, History
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function SyncPage() {
    const { token } = useAuth();
    const [localActivities, setLocalActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // --- Local DB fetch (primary source — always works, no network needed) ---
    const fetchLocalActivities = async () => {
        setLoading(true);
        try {
            if (window.electronAPI?.getLocalSyncActivities) {
                const rows = await window.electronAPI.getLocalSyncActivities();
                setLocalActivities(rows || []);
            } else {
                // Fallback: read via generic dbQuery
                const res = await window.electronAPI?.dbQuery(
                    `SELECT * FROM "LocalSyncActivity" ORDER BY "createdAt" DESC LIMIT 200`,
                    []
                );
                setLocalActivities(res?.rows || []);
            }
        } catch (err) {
            console.error('[SyncPage] Failed to fetch local activities', err);
        } finally {
            setLoading(false);
        }
    };

    const handleForceSync = async () => {
        if (window.electronAPI) {
            await window.electronAPI.forceSync();
            // Sync runs async — poll after a delay to show new data
            setTimeout(fetchLocalActivities, 6000);
        }
    };

    useEffect(() => {
        fetchLocalActivities();
        const interval = setInterval(fetchLocalActivities, 8000);
        return () => clearInterval(interval);
    }, []);

    const formatDate = (dateString) => {
        if (!dateString) return '--';
        const d = new Date(dateString);
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    const getActionBadge = (action, status) => {
        let colorClasses = 'bg-blue-50 text-blue-600';
        if (status === 'FAILED') colorClasses = 'bg-rose-50 text-rose-600';
        else if (action === 'UPLOAD') colorClasses = 'bg-amber-50 text-amber-700';
        else if (action === 'DOWNLOAD') colorClasses = 'bg-emerald-50 text-emerald-700';
        else if (action === 'SKIP') colorClasses = 'bg-slate-100 text-slate-500';
        else if (action === 'DELETE') colorClasses = 'bg-red-50 text-red-600';
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${colorClasses}`}>
                {action === 'UPLOAD' && <Upload className="h-2.5 w-2.5" />}
                {action === 'DOWNLOAD' && <Download className="h-2.5 w-2.5" />}
                {action}
            </span>
        );
    };

    const filteredActivities = useMemo(() => {
        if (!search.trim()) return localActivities;
        const q = search.toLowerCase();
        return localActivities.filter(a =>
            a.fileName?.toLowerCase().includes(q) ||
            a.action?.toLowerCase().includes(q) ||
            a.status?.toLowerCase().includes(q)
        );
    }, [localActivities, search]);

    // Summary stats
    const stats = useMemo(() => {
        const total = localActivities.filter(a => a.action !== 'SKIP').length;
        const uploads = localActivities.filter(a => a.action === 'UPLOAD' && a.status === 'SUCCESS').length;
        const downloads = localActivities.filter(a => a.action === 'DOWNLOAD' && a.status === 'SUCCESS').length;
        const failed = localActivities.filter(a => a.status === 'FAILED').length;
        const pending = localActivities.filter(a => !a.synced).length;
        return { total, uploads, downloads, failed, pending };
    }, [localActivities]);

    return (
        <div className="space-y-4 p-6 h-full overflow-auto">
            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <nav className="flex items-center gap-1 text-sm">
                    <History className="h-4 w-4 mr-1 text-muted-foreground" />
                    <span className="font-medium text-foreground">Sync Activity</span>
                </nav>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchLocalActivities} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handleForceSync}>
                        <Download className="h-4 w-4" />
                        Sync Now
                    </Button>
                </div>
            </div>

            {/* ── Summary Stats ───────────────────────────────────────────────── */}
            {localActivities.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border bg-white p-3">
                        <p className="text-xs text-muted-foreground font-medium">Total</p>
                        <p className="text-2xl font-bold text-slate-800 mt-0.5">{stats.total}</p>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                        <p className="text-xs text-amber-600 font-medium">Uploads</p>
                        <p className="text-2xl font-bold text-amber-600 mt-0.5">{stats.uploads}</p>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                        <p className="text-xs text-emerald-600 font-medium">Downloads</p>
                        <p className="text-2xl font-bold text-emerald-600 mt-0.5">{stats.downloads}</p>
                    </div>
                    <div className="rounded-lg border bg-white p-3">
                        <p className="text-xs text-rose-600 font-medium">Failed</p>
                        <p className="text-2xl font-bold text-rose-600 mt-0.5">{stats.failed}</p>
                    </div>
                </div>
            )}

            {/* ── Search ──────────────────────────────────────────────────────── */}
            <div className="relative max-w-sm">
                <input
                    type="text"
                    placeholder="Search by file, action or status..."
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 pl-9 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
            </div>

            {/* ── Loading ──────────────────────────────────────────────────────── */}
            {loading && localActivities.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">Loading sync activity...</div>
            )}

            {/* ── Empty ────────────────────────────────────────────────────────── */}
            {!loading && localActivities.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Archive className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">No activity yet</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                        Upload a file or click <strong>Sync Now</strong> to start syncing. Activities will appear here instantly.
                    </p>
                    <Button className="mt-4 gap-1.5" size="sm" onClick={handleForceSync}>
                        <Download className="h-4 w-4" /> Sync Now
                    </Button>
                </div>
            )}

            {/* ── Activity Table ──────────────────────────────────────────────── */}
            {filteredActivities.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>File</TableHead>
                                <TableHead className="w-28">Action</TableHead>
                                <TableHead className="w-28">Status</TableHead>
                                <TableHead className="hidden lg:table-cell w-40">Time</TableHead>
                                <TableHead className="w-20 text-center">Synced</TableHead>
                                <TableHead className="hidden xl:table-cell">Error</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredActivities.map((act) => (
                                <TableRow key={act.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-medium text-sm max-w-[220px] truncate" title={act.fileName}>
                                        {act.fileName}
                                    </TableCell>
                                    <TableCell>
                                        {getActionBadge(act.action, act.status)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            {act.status === 'SUCCESS' ? (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                            ) : act.status === 'FAILED' ? (
                                                <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                            ) : (
                                                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                            )}
                                            <span className={`text-xs font-medium ${act.status === 'FAILED' ? 'text-rose-600' : act.status === 'SUCCESS' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                {act.status}
                                            </span>
                                            {act.status === 'FAILED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleForceSync}
                                                    className="h-5 px-1.5 text-[10px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 ml-1"
                                                >
                                                    Retry
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                                        {formatDate(act.createdAt)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {act.synced ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mx-auto" title="Synced to Global DB" />
                                        ) : (
                                            <Clock className="h-3.5 w-3.5 text-amber-400 mx-auto" title="Pending sync to Global DB" />
                                        )}
                                    </TableCell>
                                    <TableCell className="hidden xl:table-cell text-xs text-rose-500 max-w-[180px] truncate" title={act.error || ''}>
                                        {act.error || ''}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
