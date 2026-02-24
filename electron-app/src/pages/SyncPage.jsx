import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';
import {
  RefreshCw, CheckCircle2, XCircle, Clock,
  Archive, Download, Upload, History, Plus, Settings, FolderOpen, Trash2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function SyncPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [buckets, setBuckets] = useState([]);
    
    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [newConfigName, setNewConfigName] = useState('');
    const [newConfigInterval, setNewConfigInterval] = useState(5);
    const [newMappings, setNewMappings] = useState([]); // {localPath, bucketId}

    // --- Fetchers ---
    const fetchConfigs = async () => {
        try {
            if (window.electronAPI?.getSyncConfigs) {
                const res = await window.electronAPI.getSyncConfigs();
                setConfigs(res || []);
            }
        } catch (err) {
            console.error('Failed to fetch configs', err);
        }
    };

    const fetchBuckets = async () => {
        try {
            if (window.electronAPI?.dbQuery) {
                const res = await window.electronAPI.dbQuery('SELECT id, name FROM "Bucket" ORDER BY name ASC', []);
                setBuckets(res.rows || []);
            }
        } catch (err) {
            console.error('Failed to fetch buckets', err);
        }
    };

    const loadData = async () => {
        setLoading(true);
        await Promise.all([fetchConfigs(), fetchBuckets()]);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            fetchConfigs();
        }, 8000);
        return () => clearInterval(interval);
    }, []);

    const handleForceSync = async () => {
        if (window.electronAPI) {
            await window.electronAPI.forceSync();
            setTimeout(loadData, 3000);
        }
    };

    // --- Modal Actions ---
    const handleAddMapping = () => {
        setNewMappings([...newMappings, { localPath: '', bucketId: buckets[0]?.id || '' }]);
    };

    const handleSelectFolder = async (index) => {
        if (!window.electronAPI) return;
        const folder = await window.electronAPI.selectSyncFolder();
        if (folder) {
            const updated = [...newMappings];
            updated[index].localPath = folder;
            setNewMappings(updated);
        }
    };

    const handleDeleteMapping = (index) => {
        const updated = [...newMappings];
        updated.splice(index, 1);
        setNewMappings(updated);
    };

    const handleMappingBucketChange = (index, bucketId) => {
        const updated = [...newMappings];
        updated[index].bucketId = bucketId;
        setNewMappings(updated);
    };

    const handleSaveConfig = async () => {
        if (!newConfigName.trim() || newMappings.length === 0) return;
        if (newMappings.some(m => !m.localPath || !m.bucketId)) return;
        
        try {
            await window.electronAPI.createSyncConfig({
                name: newConfigName,
                intervalMinutes: parseInt(newConfigInterval),
                mappings: newMappings
            });
            setShowModal(false);
            setNewConfigName('');
            setNewMappings([]);
            setNewConfigInterval(5);
            fetchConfigs();
        } catch (err) {
            console.error('Failed to save config', err);
        }
    };

    const handleDeleteConfig = async (id) => {
        if (!confirm('Are you sure you want to delete this sync configuration?')) return;
        try {
            await window.electronAPI.deleteSyncConfig(id);
            fetchConfigs();
        } catch (err) {
            console.error('Failed to delete config', err);
        }
    };

    // --- Helpers ---
    const formatDate = (dateString) => {
        if (!dateString) return '--';
        const d = new Date(dateString);
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10 sticky top-0">
                <nav className="flex items-center gap-2 text-sm">
                    <RefreshCw className="h-4 w-4 text-slate-500" />
                    <span className="font-semibold text-slate-900">Sync Configurations</span>
                </nav>
                
                <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}>
                        <Plus className="h-4 w-4" /> Add Sync Config
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={loadData} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button variant="secondary" size="sm" className="gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={handleForceSync}>
                        <RefreshCw className="h-4 w-4" /> Sync Now
                    </Button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto p-6">
                
                <div className="space-y-4">
                        {loading && configs.length === 0 && (
                            <div className="text-center py-10 text-muted-foreground text-sm">Loading Sync Configurations...</div>
                        )}
                        
                        {!loading && configs.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Settings className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-lg font-medium text-slate-800">No Sync Configurations Yet</p>
                                <p className="text-sm text-slate-500 mt-1 max-w-sm">
                                    Create a sync configuration to map multiple local folders to multiple cloud buckets, and schedule automatic syncs.
                                </p>
                                <Button className="mt-6 gap-1.5" onClick={() => setShowModal(true)}>
                                    <Plus className="h-4 w-4" /> Create First Config
                                </Button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {configs.map(config => (
                                <div key={config.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h3 className="font-semibold text-slate-900 text-base">{config.name}</h3>
                                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                                <Clock className="h-3 w-3" /> Runs every {config.intervalMinutes}m
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleDeleteConfig(config.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors" title="Delete Config">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-lg p-3 my-4 max-h-[140px] overflow-y-auto space-y-2 border border-slate-100">
                                        <div className="text-xs font-semibold text-slate-500 mb-1">MAPPED FOLDERS ({config.mappings?.length || 0})</div>
                                        {config.mappings?.map(map => (
                                            <div key={map.id} className="text-xs flex flex-col gap-0.5 text-slate-700 bg-white p-2 rounded border border-slate-100 shadow-sm">
                                                <div className="font-medium truncate tracking-tight text-[11px] text-blue-600">S3: {buckets.find(b=>b.id === map.bucketId)?.name || map.bucketId}</div>
                                                <div className="truncate text-slate-500" title={map.localPath}>Local: {map.localPath}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto">
                                        <p className="text-xs text-slate-400">
                                            Last run: {formatDate(config.lastSync)}
                                        </p>
                                        <Button size="sm" variant="outline" className="h-7 text-xs px-3 bg-white" onClick={() => navigate(`/sync/${config.id}`)}>
                                            <History className="h-3 w-3 mr-1" /> View History
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            {/* MODAL: ADD CONFIG */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">New Sync Configuration</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Configuration Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Design Assets Sync" 
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        value={newConfigName}
                                        onChange={e => setNewConfigName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sync Interval (Minutes)</label>
                                    <select 
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
                                        value={newConfigInterval}
                                        onChange={e => setNewConfigInterval(e.target.value)}
                                    >
                                        <option value="1">1 minute (Aggressive)</option>
                                        <option value="5">5 minutes (Default)</option>
                                        <option value="15">15 minutes (Standard)</option>
                                        <option value="60">1 hour (Relaxed)</option>
                                        <option value="1440">Daily (24 hours)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Mapped Folders ({newMappings.length})</label>
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1 py-0 px-2" onClick={handleAddMapping}>
                                        <Plus className="h-3 w-3" /> Add Mapping
                                    </Button>
                                </div>
                                
                                {newMappings.length === 0 && (
                                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
                                        No folders mapped yet. Click "Add Mapping" to link a local folder to a cloud bucket.
                                    </div>
                                )}

                                {newMappings.map((mapping, idx) => (
                                    <div key={idx} className="flex gap-2 items-start bg-slate-50 p-3 rounded-lg border border-slate-200">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex gap-2">
                                                <select 
                                                    className="w-1/3 border border-slate-300 rounded-md px-2.5 py-1.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-slate-700"
                                                    value={mapping.bucketId}
                                                    onChange={e => handleMappingBucketChange(idx, e.target.value)}
                                                >
                                                    <option value="" disabled>Select Bucket...</option>
                                                    {buckets.map(b => (
                                                        <option key={b.id} value={b.id}>{b.name}</option>
                                                    ))}
                                                </select>
                                                <div className="flex flex-1 relative">
                                                    <input 
                                                        type="text" 
                                                        className="flex-1 border border-slate-300 rounded-md pl-9 pr-2.5 py-1.5 text-sm bg-white cursor-not-allowed text-slate-500 font-mono text-xs" 
                                                        readOnly 
                                                        placeholder="No folder selected..."
                                                        value={mapping.localPath}
                                                    />
                                                    <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                </div>
                                                <Button type="button" variant="secondary" size="sm" onClick={() => handleSelectFolder(idx)} className="shrink-0 bg-white border border-slate-200 hover:bg-slate-100">
                                                    Browse
                                                </Button>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => handleDeleteMapping(idx)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded mt-0.5 transition-colors">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <Button type="button" variant="ghost" className="text-slate-500 hover:text-slate-800 border bg-white border-slate-200" onClick={() => setShowModal(false)}>Cancel</Button>
                            <Button 
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700 shadow-sm"
                                disabled={!newConfigName.trim() || newMappings.length === 0 || newMappings.some(m => !m.localPath || !m.bucketId)}
                                onClick={handleSaveConfig}
                            >
                                Save Configuration
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
