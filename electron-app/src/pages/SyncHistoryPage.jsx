import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';
import {
  RefreshCw, CheckCircle2, XCircle, Clock,
  Archive, Download, Upload, History, ArrowLeft, ChevronDown, ChevronRight
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';

export default function SyncHistoryPage() {
    const { configId } = useParams();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [activities, setActivities] = useState([]);
    const [expandedJobs, setExpandedJobs] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            if (window.electronAPI) {
                const [jobsRes, actRes] = await Promise.all([
                    window.electronAPI.getSyncJobs(configId),
                    window.electronAPI.getLocalSyncActivities(configId)
                ]);
                setJobs(jobsRes || []);
                setActivities(actRes || []);
            }
        } catch (err) {
            console.error('[SyncHistoryPage] Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 8000);
        return () => clearInterval(interval);
    }, [configId]);

    const handleForceSync = async () => {
        if (window.electronAPI) {
            await window.electronAPI.forceSync();
            setTimeout(fetchData, 6000);
        }
    };

    const toggleJob = (jobId) => {
        const next = new Set(expandedJobs);
        if (next.has(jobId)) next.delete(jobId);
        else next.add(jobId);
        setExpandedJobs(next);
    };

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

    // Group activities by SyncJobId
    const groupedActivities = useMemo(() => {
        const groups = {};
        activities.forEach(a => {
            const jid = a.syncJobId || 'adhoc';
            if (!groups[jid]) groups[jid] = [];
            groups[jid].push(a);
        });
        return groups;
    }, [activities]);

    const stats = useMemo(() => {
        const total = activities.filter(a => a.action !== 'SKIP').length;
        const uploads = activities.filter(a => a.action === 'UPLOAD' && a.status === 'SUCCESS').length;
        const downloads = activities.filter(a => a.action === 'DOWNLOAD' && a.status === 'SUCCESS').length;
        const failed = activities.filter(a => a.status === 'FAILED').length;
        return { total, uploads, downloads, failed };
    }, [activities]);

    return (
        <div className="space-y-4 p-6 h-full overflow-auto bg-slate-50/50">
            {/* ── Toolbar ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <nav className="flex items-center gap-2 text-sm">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/sync')} className="-ml-3 gap-1 hover:bg-white border-transparent">
                        <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <span className="text-slate-300">|</span>
                    <History className="h-4 w-4 text-slate-500 mr-1" />
                    <span className="font-semibold text-slate-900 tracking-tight">Sync History Details</span>
                </nav>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 bg-white shadow-sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button size="sm" className="gap-1.5 shadow-sm bg-blue-600 hover:bg-blue-700" onClick={handleForceSync}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Sync Now
                    </Button>
                </div>
            </div>

            {/* ── Summary Stats ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Files</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-[11px] text-amber-600 font-bold uppercase tracking-wider">Uploads</p>
                    <p className="text-2xl font-black text-amber-600 mt-1">{stats.uploads}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-[11px] text-emerald-600 font-bold uppercase tracking-wider">Downloads</p>
                    <p className="text-2xl font-black text-emerald-600 mt-1">{stats.downloads}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm border-rose-100">
                    <p className="text-[11px] text-rose-600 font-bold uppercase tracking-wider">Failed</p>
                    <p className="text-2xl font-black text-rose-600 mt-1">{stats.failed}</p>
                </div>
            </div>

            {/* ── Runs List ──────────────────────────────────────────────────── */}
            <div className="space-y-3 mt-6">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 px-1">
                    <Clock className="h-4 w-4" /> Recent Sync Runs
                </h3>

                {jobs.length === 0 && !loading && (
                    <div className="bg-white rounded-xl border border-dashed border-slate-300 py-12 flex flex-col items-center justify-center text-slate-400">
                        <Archive className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-sm font-medium">No sync runs recorded yet</p>
                    </div>
                )}

                {jobs.map((job) => (
                    <div key={job.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200">
                        {/* Job Header */}
                        <div 
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => toggleJob(job.id)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-full ${job.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : job.status === 'FAILED' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {job.status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5" /> : job.status === 'FAILED' ? <XCircle className="h-5 w-5" /> : <RefreshCw className="h-5 w-5 animate-spin" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-slate-900">Run {formatDate(job.startTime)}</p>
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600`}>{job.status}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium">
                                        {job.filesHandled || 0} files processed • {job.endTime ? `Duration: ${Math.round((new Date(job.endTime) - new Date(job.startTime)) / 1000)}s` : 'In progress...'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {job.error && <span className="text-[10px] text-rose-500 font-bold max-w-[200px] truncate">{job.error}</span>}
                                {expandedJobs.has(job.id) ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                            </div>
                        </div>

                        {/* Job Details (Activities) */}
                        {expandedJobs.has(job.id) && (
                            <div className="border-t border-slate-100 bg-slate-50/30">
                                {groupedActivities[job.id]?.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-transparent border-none">
                                                <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">File</TableHead>
                                                <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Action</TableHead>
                                                <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Status</TableHead>
                                                <TableHead className="py-2 text-[10px] uppercase font-bold text-slate-400">Error</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupedActivities[job.id].map((act) => (
                                                <TableRow key={act.id} className="hover:bg-white/50 border-slate-100 last:border-0">
                                                    <TableCell className="text-[13px] font-medium text-slate-700 py-2.5">{act.fileName}</TableCell>
                                                    <TableCell className="py-2.5">{getActionBadge(act.action, act.status)}</TableCell>
                                                    <TableCell className="py-2.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {act.status === 'SUCCESS' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-rose-500" />}
                                                            <span className={`text-[11px] font-bold ${act.status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>{act.status}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-[11px] text-rose-500 max-w-[150px] truncate py-2.5" title={act.error || ''}>{act.error}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="p-8 text-center text-xs text-slate-400 font-medium italic">
                                        No file transfers needed in this run.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Ad-hoc / Non-job activities (Live uploads etc) */}
                {groupedActivities['adhoc']?.length > 0 && (
                     <div className="mt-8">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 px-1 mb-3">
                            <RefreshCw className="h-4 w-4" /> Other Activities (Manual/Live)
                        </h3>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/50">
                                        <TableHead>File</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groupedActivities['adhoc'].map((act) => (
                                        <TableRow key={act.id}>
                                            <TableCell className="text-[13px] font-medium">{act.fileName}</TableCell>
                                            <TableCell>{getActionBadge(act.action, act.status)}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    {act.status === 'SUCCESS' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-rose-500" />}
                                                    <span className={`text-[11px] font-bold ${act.status === 'SUCCESS' ? 'text-emerald-600' : 'text-rose-600'}`}>{act.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-[11px] text-slate-400">{formatDate(act.createdAt)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
}
