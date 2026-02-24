import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';
import {
  CheckCircle2, XCircle, Clock,
  Archive, Download, Upload, History
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function RecentActivitiesPage() {
    const { token } = useAuth();
    const [localActivities, setLocalActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchLocalActivities = async () => {
        setLoading(true);
        try {
            if (window.electronAPI?.getLocalSyncActivities) {
                // Fetching all local activities regardless of configId
                const rows = await window.electronAPI.getLocalSyncActivities(null);
                setLocalActivities(rows || []);
            }
        } catch (err) {
            console.error('[RecentActivitiesPage] Failed to fetch local activities', err);
        } finally {
            setLoading(false);
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
            (a.fileName && a.fileName.toLowerCase().includes(q)) ||
            (a.action && a.action.toLowerCase().includes(q)) ||
            (a.status && a.status.toLowerCase().includes(q))
        );
    }, [localActivities, search]);

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10 sticky top-0">
                <nav className="flex items-center gap-2 text-sm">
                    <History className="h-4 w-4 text-slate-500" />
                    <span className="font-semibold text-slate-900">Recent Activities</span>
                </nav>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-4">
                <div className="relative max-w-sm">
                    <input
                        type="text"
                        placeholder="Search all activities..."
                        className="w-full rounded-md border border-input bg-white px-3 py-1.5 pl-9 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                    </svg>
                </div>
                
                {loading && localActivities.length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-sm">Loading activity logs...</div>
                )}
                
                {!loading && filteredActivities.length > 0 ? (
                    <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent bg-slate-50/50">
                                    <TableHead className="font-semibold text-slate-600">File</TableHead>
                                    <TableHead className="w-28 font-semibold text-slate-600">Action</TableHead>
                                    <TableHead className="w-28 font-semibold text-slate-600">Status</TableHead>
                                    <TableHead className="hidden lg:table-cell w-40 font-semibold text-slate-600">Time</TableHead>
                                    <TableHead className="w-20 text-center font-semibold text-slate-600">Synced</TableHead>
                                    <TableHead className="hidden xl:table-cell font-semibold text-slate-600">Error</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredActivities.map((act) => (
                                    <TableRow key={act.id} className="hover:bg-slate-50 transition-colors">
                                        <TableCell className="font-medium text-slate-800 text-sm max-w-[220px] truncate" title={act.fileName}>
                                            {act.fileName}
                                        </TableCell>
                                        <TableCell>{getActionBadge(act.action, act.status)}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                {act.status === 'SUCCESS' ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                ) : act.status === 'FAILED' ? (
                                                    <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                                                ) : (
                                                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                )}
                                                <span className={`text-xs font-bold tracking-wide ${act.status === 'FAILED' ? 'text-rose-600' : act.status === 'SUCCESS' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                    {act.status}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden lg:table-cell text-slate-500 text-xs tracking-tight">
                                            {formatDate(act.createdAt)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {act.synced ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" title="Synced to Global DB" />
                                            ) : (
                                                <Clock className="h-4 w-4 text-amber-400 mx-auto" title="Pending sync to Global DB" />
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden xl:table-cell text-xs text-rose-500 max-w-[200px] truncate" title={act.error || ''}>
                                            {act.error || ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : !loading && (
                    <div className="text-center py-20 text-slate-500">
                        {search ? 'No activities match your search' : 'No recent sync activities found.'}
                    </div>
                )}
            </div>
        </div>
    );
}
