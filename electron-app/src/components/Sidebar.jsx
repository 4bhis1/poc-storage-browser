
import React from 'react';
import { Cloud, ChevronRight, HardDrive, LayoutDashboard, Search as SearchIcon } from 'lucide-react';
import clsx from 'clsx';
import { useSystem } from '../contexts/SystemContext';

const Sidebar = ({ tabs, activeTab, onTabChange }) => {
    const { diskStats } = useSystem();
    const diskUsagePercent = diskStats ? Math.round((diskStats.used / diskStats.total) * 100) : 0;
    const usedSpace = diskStats ? (diskStats.used / (1024 * 1024 * 1024)).toFixed(1) : '0';
    const totalSpace = diskStats ? (diskStats.total / (1024 * 1024 * 1024)).toFixed(1) : '0';

    // Group tabs for easier rendering
    const platformTabs = tabs.filter(t => ['transfers', 'files', 'buckets', 'search'].includes(t.id));
    const managementTabs = tabs.filter(t => ['security', 'settings'].includes(t.id));

    return (
        <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 h-full">
            {/* App Header */}
            <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-200/50 shrink-0">
                <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                    <Cloud size={18} fill="currentColor" />
                </div>
                <div>
                    <h1 className="font-bold text-slate-900 leading-none">CloudVault</h1>
                    <p className="text-[10px] text-slate-500 font-medium">Enterprise Edition</p>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8">
                
                {/* Platform Group */}
                <div>
                    <h3 className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Platform</h3>
                    <div className="space-y-0.5">
                        {platformTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                                    activeTab === tab.id 
                                        ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                )}
                            >
                                <tab.icon size={18} className={clsx(activeTab === tab.id ? "text-blue-600" : "text-slate-400")} />
                                <span>{tab.label}</span>
                                {activeTab === tab.id && <ChevronRight size={14} className="ml-auto text-slate-400" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Management Group */}
                <div>
                    <h3 className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Management</h3>
                    <div className="space-y-0.5">
                        {managementTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                                    activeTab === tab.id 
                                        ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                )}
                            >
                                <tab.icon size={18} className={clsx(activeTab === tab.id ? "text-blue-600" : "text-slate-400")} />
                                <span>{tab.label}</span>
                                {tab.alert && <span className="ml-auto w-2 h-2 rounded-full bg-red-500" />}
                            </button>
                        ))}
                    </div>
                </div>

            </div>

            {/* Footer / Storage Widget */}
            <div className="p-4 border-t border-slate-200 bg-white">
                <div className="flex items-center gap-2 mb-2 text-slate-900">
                    <HardDrive size={16} className="text-slate-500" />
                    <span className="text-xs font-medium">Storage Usage</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div 
                        className="h-full bg-blue-600 rounded-full transition-all duration-500" 
                        style={{ width: `${diskUsagePercent}%` }}
                    />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                    <span>{usedSpace} GB Used</span>
                    <span>{totalSpace} GB Total</span>
                </div>
            </div>
            
            {/* User Profile Tiny */}
            <div className="p-4 border-t border-slate-200 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs border border-slate-200">
                    SC
                 </div>
                 <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium text-slate-900 truncate">Sarah Chen</p>
                     <p className="text-xs text-slate-500 truncate">Admin</p>
                 </div>
            </div>
        </div>
    );
};

export default Sidebar;
