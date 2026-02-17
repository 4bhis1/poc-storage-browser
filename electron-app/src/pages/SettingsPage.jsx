
import React, { useState } from 'react';
import { Settings, FolderOpen, Save, RefreshCw, AlertCircle } from 'lucide-react';
import { useSystem } from '../contexts/SystemContext';

const SettingsPage = ({ rootPath, onUpdateRootPath }) => {
    const { syncState } = useSystem();
    const [syncMode, setSyncMode] = useState('two-way');
    const [confirming, setConfirming] = useState(false);

    const handleSelectFolder = async () => {
        if (window.electronAPI) {
            try {
                const folder = await window.electronAPI.selectFolder();
                if (folder) {
                    onUpdateRootPath(folder);
                }
            } catch (error) {
                console.error("Failed to select folder:", error);
            }
        } else {
            alert("This feature is only available in the desktop application.");
        }
    };

    const handleSaveSyncSettings = () => {
        // Here you would typically persist this to a store or backend
        // For now we'll just simulate a save
        setConfirming(true);
        setTimeout(() => setConfirming(false), 2000);
    };

    return (
        <div className="h-full flex flex-col bg-slate-50 text-slate-900 animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="p-6 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10 flex items-center gap-4">
                 <div className="p-2.5 bg-slate-900 rounded-lg text-white">
                    <Settings size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
                    <p className="text-sm text-slate-500">Manage application preferences and sync configurations</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 max-w-4xl space-y-8">
                
                {/* Sync Location Section */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                        <FolderOpen size={18} className="text-blue-600" />
                        <h3 className="font-medium text-slate-900">Sync Location</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-slate-500">
                            Select the local directory where your enterprise files will be synchronized.
                            Ensure you have sufficient disk space.
                        </p>
                        
                        <div className="flex gap-3 items-center">
                            <div className="flex-1 bg-slate-950 text-slate-300 font-mono text-sm rounded-lg px-4 py-2.5 border border-slate-800 shadow-inner truncate">
                                {rootPath || 'No folder selected'}
                            </div>
                            <button 
                                onClick={handleSelectFolder}
                                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm whitespace-nowrap"
                            >
                                Change Location
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sync Mode Section */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                         <RefreshCw size={18} className="text-indigo-600" />
                        <h3 className="font-medium text-slate-900">Sync Strategy</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Two-Way Sync Option */}
                            <label className={`relative flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${syncMode === 'two-way' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                                <input 
                                    type="radio" 
                                    name="syncMode" 
                                    value="two-way" 
                                    checked={syncMode === 'two-way'} 
                                    onChange={() => setSyncMode('two-way')}
                                    className="mt-1 w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-medium text-slate-900">Two-way Sync</span>
                                    <span className="block text-xs text-slate-500 mt-1">
                                        Changes in local folder and cloud are kept in sync. Deletions propagate both ways.
                                    </span>
                                </div>
                            </label>

                            {/* One-Way Sync Option */}
                            <label className={`relative flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${syncMode === 'one-way' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                                <input 
                                    type="radio" 
                                    name="syncMode" 
                                    value="one-way" 
                                    checked={syncMode === 'one-way'} 
                                    onChange={() => setSyncMode('one-way')}
                                    className="mt-1 w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-medium text-slate-900">One-way (Download Only)</span>
                                    <span className="block text-xs text-slate-500 mt-1">
                                        Only downloads changes from cloud. Local changes are ignored or overwritten suitable for backups.
                                    </span>
                                </div>
                            </label>
                        </div>

                         <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                             <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                             <p className="text-xs text-amber-800">
                                 Note: Changing sync strategy will trigger a full re-scan of your synchronized directory. This may take some time depending on the number of files.
                             </p>
                         </div>

                         <div className="flex justify-end pt-2">
                             <button
                                onClick={handleSaveSyncSettings}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-all shadow-sm ${confirming ? 'bg-green-600' : 'bg-slate-900 hover:bg-slate-800'}`}
                             >
                                 {confirming ? (
                                    <>Configuration Saved</>
                                 ) : (
                                    <>
                                        <Save size={16} />
                                        Save Configuration
                                    </>
                                 )}
                             </button>
                         </div>
                    </div>
                </div>

                {/* Placeholder Section */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm opacity-60">
                     <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-medium text-slate-900">Bandwidth Limits</h3>
                    </div>
                    <div className="p-6">
                        <p className="text-sm text-slate-500">Feature coming soon...</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
