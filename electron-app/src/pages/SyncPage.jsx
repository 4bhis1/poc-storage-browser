import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../components/ui/button';
import {
  RefreshCw, CheckCircle2, XCircle, Clock,
  Download, Upload, History, Plus, Settings, FolderOpen, Trash2,
  ArrowDownCircle, ArrowUpCircle, Eye, Info, Radio, Pause, Play
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function SyncPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(true);

    const [buckets, setBuckets] = useState([]);
    
    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [editingConfigId, setEditingConfigId] = useState(null); // null = create, string = edit
    const [newConfigName, setNewConfigName] = useState('');
    const [newConfigInterval, setNewConfigInterval] = useState(5);
    const [newDirection, setNewDirection] = useState('DOWNLOAD');
    const [newUseWatcher, setNewUseWatcher] = useState(true);
    const [newMappings, setNewMappings] = useState([]); // {localPath, bucketId, shouldZip}

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
                const session = await window.electronAPI.auth?.getSession?.();
                const userId = session?.email || session?.username || null;
                const res = await window.electronAPI.dbQuery(
                    userId
                        ? 'SELECT id, name FROM "Bucket" WHERE "userId" = $1 ORDER BY name ASC'
                        : 'SELECT id, name FROM "Bucket" ORDER BY name ASC',
                    userId ? [userId] : []
                );
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

    const [isForceSyncing, setIsForceSyncing] = useState(false);

    const handleForceSync = async () => {
        if (window.electronAPI) {
            setIsForceSyncing(true);
            await window.electronAPI.forceSync();
            setTimeout(() => {
                loadData();
                setIsForceSyncing(false);
            }, 3000);
        }
    };

    const [syncingConfigId, setSyncingConfigId] = useState(null);

    const handleSyncConfigNow = async (configId) => {
        if (!window.electronAPI?.syncConfigNow) return;
        setSyncingConfigId(configId);
        try {
            const result = await window.electronAPI.syncConfigNow(configId);
            if (!result.success) {
                console.warn('Sync blocked:', result.error);
            }
            setTimeout(() => {
                fetchConfigs();
                setSyncingConfigId(null);
            }, 4000);
        } catch (err) {
            console.error('Sync now failed', err);
            setSyncingConfigId(null);
        }
    };

    // --- Modal Actions ---
    const handleAddMapping = () => {
        setNewMappings([...newMappings, { localPath: '', bucketId: buckets[0]?.id || '', shouldZip: false }]);
    };

    const handleToggleMappingZip = (index) => {
        const updated = [...newMappings];
        updated[index].shouldZip = !updated[index].shouldZip;
        setNewMappings(updated);
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
        
        const payload = {
            name: newConfigName,
            intervalMinutes: parseInt(newConfigInterval),
            direction: newDirection,
            useWatcher: newDirection === 'UPLOAD' ? newUseWatcher : false,
            mappings: newMappings
        };

        try {
            if (editingConfigId) {
                await window.electronAPI.updateSyncConfig({ id: editingConfigId, ...payload });
            } else {
                await window.electronAPI.createSyncConfig(payload);
            }
            closeModal();
            fetchConfigs();
        } catch (err) {
            console.error('Failed to save config', err);
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingConfigId(null);
        setNewConfigName('');
        setNewMappings([]);
        setNewConfigInterval(5);
        setNewDirection('DOWNLOAD');
        setNewUseWatcher(true);
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

    const openModal = () => {
        setNewConfigName('');
        setNewMappings([]);
        setNewConfigInterval(5);
        setNewDirection('DOWNLOAD');
        setNewUseWatcher(true);
        setEditingConfigId(null);
        setShowModal(true);
    };

    const openEditModal = (config) => {
        setEditingConfigId(config.id);
        setNewConfigName(config.name);
        setNewConfigInterval(config.intervalMinutes || 5);
        setNewDirection(config.direction || 'DOWNLOAD');
        setNewUseWatcher(config.useWatcher === 1 || config.useWatcher === true);
        setNewMappings((config.mappings || []).map(m => ({
            localPath: m.localPath,
            bucketId: m.bucketId,
            shouldZip: m.shouldZip === 1 || m.shouldZip === true,
        })));
        setShowModal(true);
    };

    // --- Helpers ---
    const formatDate = (dateString) => {
        if (!dateString) return '--';
        const d = new Date(dateString);
        return d.toLocaleString('en-IN', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'Asia/Kolkata',
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
                    <Button size="sm" className="gap-1.5" onClick={openModal}>
                        <Plus className="h-4 w-4" /> Add Sync Config
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={loadData} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button variant="secondary" size="sm" className="gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={handleForceSync} disabled={isForceSyncing}>
                        <RefreshCw className={`h-4 w-4 ${isForceSyncing ? 'animate-spin' : ''}`} /> {isForceSyncing ? 'Syncing...' : 'Sync All Now'}
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
                                    Create a sync configuration to map local folders to cloud buckets. Choose between uploading to the cloud or downloading from it.
                                </p>
                                <Button className="mt-6 gap-1.5" onClick={openModal}>
                                    <Plus className="h-4 w-4" /> Create First Config
                                </Button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {configs.map(config => {
                                const direction = config.direction || 'DOWNLOAD';
                                const isUpload = direction === 'UPLOAD';
                                const isSyncing = config.isSyncing || syncingConfigId === config.id;
                                const watcherActive = isUpload && config.useWatcher;

                                return (
                                    <div key={config.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative group cursor-pointer" onClick={() => openEditModal(config)}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                {/* Direction badge */}
                                                <div className={`p-1.5 rounded-lg ${isUpload ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                                                    {isUpload 
                                                        ? <ArrowUpCircle className="h-4 w-4 text-amber-600" />
                                                        : <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                                                    }
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-slate-900 text-base">{config.name}</h3>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                                            {isUpload && watcherActive
                                                                ? <Eye className="h-3 w-3 text-blue-500" />
                                                                : <Clock className="h-3 w-3" />
                                                            }
                                                            {isUpload && watcherActive
                                                                ? 'Watcher'
                                                                : `Every ${config.intervalMinutes}m`
                                                            }
                                                        </p>
                                                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${isUpload ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                            {isUpload ? '⬆ Upload' : '⬇ Download'}
                                                        </span>
                                                        {isUpload && !watcherActive && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                                                                <Clock className="h-2.5 w-2.5" />
                                                                Cron
                                                            </span>
                                                        )}
                                                        {watcherActive && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600">
                                                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                                Live
                                                            </span>
                                                        )}
                                                        {config.mappings?.some(m => m.shouldZip) && (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-50 text-violet-600">
                                                                📦 Zip
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteConfig(config.id); }} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors" title="Delete Config">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 rounded-lg p-3 my-4 max-h-[140px] overflow-y-auto space-y-2 border border-slate-100">
                                            <div className="text-xs font-semibold text-slate-500 mb-1">MAPPED FOLDERS ({config.mappings?.length || 0})</div>
                                            {config.mappings?.map(map => (
                                                <div key={map.id} className="text-xs flex flex-col gap-0.5 text-slate-700 bg-white p-2 rounded border border-slate-100 shadow-sm">
                                                    <div className="font-medium truncate tracking-tight text-[11px] text-blue-600 flex items-center gap-1">
                                                        S3: {buckets.find(b=>b.id === map.bucketId)?.name || map.bucketId}
                                                        {map.shouldZip && <span className="text-[9px] bg-violet-100 text-violet-600 px-1 py-0.5 rounded font-bold">ZIP</span>}
                                                    </div>
                                                    <div className="truncate text-slate-500" title={map.localPath}>Local: {map.localPath}</div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between mt-auto">
                                            <div className="flex flex-col">
                                                <p className="text-xs text-slate-400">
                                                    Last run: {formatDate(config.lastSync)}
                                                </p>
                                                {isSyncing && (
                                                    <p className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 mt-0.5">
                                                        <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Syncing...
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    className="h-7 text-xs px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200" 
                                                    onClick={(e) => { e.stopPropagation(); handleSyncConfigNow(config.id); }}
                                                    disabled={isSyncing}
                                                >
                                                    <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                                                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-7 text-xs px-3 bg-white" onClick={(e) => { e.stopPropagation(); navigate(`/sync/${config.id}`); }}>
                                                    <History className="h-3 w-3 mr-1" /> History
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

            {/* MODAL: ADD CONFIG */}
            {showModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800">{editingConfigId ? 'Edit Sync Configuration' : 'New Sync Configuration'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1">
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            {/* Config Name + Interval */}
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
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sync Interval</label>
                                    <select 
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
                                        value={newConfigInterval}
                                        onChange={e => setNewConfigInterval(e.target.value)}
                                    >
                                        <option value="1">1 minute (Aggressive)</option>
                                        <option value="5">5 minutes (Default)</option>
                                        <option value="15">15 minutes (Standard)</option>
                                        <option value="30">30 minutes</option>
                                        <option value="60">1 hour (Relaxed)</option>
                                        <option value="1440">Daily (24 hours)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Direction Toggle */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Sync Direction</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setNewDirection('DOWNLOAD'); setNewUseWatcher(false); }}
                                        className={`relative flex flex-col gap-1.5 p-4 rounded-xl border-2 transition-all text-left ${
                                            newDirection === 'DOWNLOAD' 
                                                ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100' 
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        {newDirection === 'DOWNLOAD' && (
                                            <div className="absolute top-2.5 right-2.5">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <ArrowDownCircle className={`h-5 w-5 ${newDirection === 'DOWNLOAD' ? 'text-emerald-600' : 'text-slate-400'}`} />
                                            <span className={`font-semibold text-sm ${newDirection === 'DOWNLOAD' ? 'text-emerald-800' : 'text-slate-700'}`}>
                                                Download from Cloud
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            Mirrors cloud files to your PC. Files deleted in the cloud will <strong>not</strong> be deleted from your local folder.
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { setNewDirection('UPLOAD'); setNewUseWatcher(true); }}
                                        className={`relative flex flex-col gap-1.5 p-4 rounded-xl border-2 transition-all text-left ${
                                            newDirection === 'UPLOAD' 
                                                ? 'border-amber-500 bg-amber-50/50 shadow-sm shadow-amber-100' 
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        {newDirection === 'UPLOAD' && (
                                            <div className="absolute top-2.5 right-2.5">
                                                <CheckCircle2 className="h-4 w-4 text-amber-500" />
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <ArrowUpCircle className={`h-5 w-5 ${newDirection === 'UPLOAD' ? 'text-amber-600' : 'text-slate-400'}`} />
                                            <span className={`font-semibold text-sm ${newDirection === 'UPLOAD' ? 'text-amber-800' : 'text-slate-700'}`}>
                                                Upload to Cloud
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            Sends local files to the cloud bucket. New and changed files are automatically synced.
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Watcher Toggle (Upload only) */}
                            {newDirection === 'UPLOAD' && (
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Upload Trigger</label>
                                    <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3 border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => setNewUseWatcher(!newUseWatcher)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                newUseWatcher ? 'bg-blue-600' : 'bg-slate-300'
                                            }`}
                                        >
                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                newUseWatcher ? 'translate-x-5' : 'translate-x-0'
                                            }`} />
                                        </button>
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">
                                                {newUseWatcher ? 'Real-time Watcher Enabled' : 'Interval-Only Mode'}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {newUseWatcher 
                                                    ? 'Files are uploaded immediately when added or changed. 2-second debounce applied.' 
                                                    : `Files will be scanned every ${newConfigInterval} minute(s) and uploaded if changed.`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Mapped Folders */}
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
                                            {/* Zip toggle — only shown for UPLOAD configs */}
                                            {newDirection === 'UPLOAD' && (
                                                <div className="flex items-center gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleMappingZip(idx)}
                                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                            mapping.shouldZip ? 'bg-violet-600' : 'bg-slate-300'
                                                        }`}
                                                    >
                                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                            mapping.shouldZip ? 'translate-x-4' : 'translate-x-0'
                                                        }`} />
                                                    </button>
                                                    <span className="text-xs text-slate-600">
                                                        {mapping.shouldZip
                                                            ? <span className="font-medium text-violet-700">Zip folder before upload — folder will be compressed into a .zip and uploaded as a single file</span>
                                                            : <span className="text-slate-400">Upload files individually (no zip)</span>
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => handleDeleteMapping(idx)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded mt-0.5 transition-colors">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Safety Info */}
                            <div className="flex items-start gap-2.5 bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    <strong>ETag Verification:</strong> The sync engine uses MD5 checksums (ETags) and file size to verify only changed files are transferred. This prevents duplicate uploads and unnecessary downloads.
                                </p>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <Button type="button" variant="ghost" className="text-slate-500 hover:text-slate-800 border bg-white border-slate-200" onClick={closeModal}>Cancel</Button>
                            <Button 
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700 shadow-sm"
                                disabled={!newConfigName.trim() || newMappings.length === 0 || newMappings.some(m => !m.localPath || !m.bucketId)}
                                onClick={handleSaveConfig}
                            >
                                {editingConfigId ? 'Save Changes' : 'Save Configuration'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
