
import React from 'react';
import { ChevronRight, Home, Menu, HardDrive, ArrowUp, ArrowDown } from 'lucide-react';
import { useSystem } from '../contexts/SystemContext';

const TopBar = ({ currentPath, onNavigate, rootPath }) => {
    const { networkStats, diskStats } = useSystem();

    // Format bytes helper
    const formatBytes = (bytes) => {
        if (!bytes && bytes !== 0) return '0 B';
        if (bytes === 0) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSec) => {
        return formatBytes(bytesPerSec) + '/s';
    };

    // Calculate disk usage
    const usedSpace = diskStats ? formatBytes(diskStats.used) : '0 GB';
    const totalSpace = diskStats ? formatBytes(diskStats.total) : '0 GB';
    const diskUsagePercent = diskStats ? Math.round((diskStats.used / diskStats.total) * 100) : 0;

    // Breadcrumbs logic
    const getBreadcrumbs = () => {
        if (!currentPath) return null;
        
        // Ensure rootPath has no trailing slash for consistent splitting
        const cleanRoot = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
        const cleanCurrent = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
        
        // If we are strictly at root
        if (cleanCurrent === cleanRoot) {
             return (
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                    <span className="flex items-center gap-1.5 text-slate-900 font-semibold">
                        <Home size={16} />
                        Root
                    </span>
                </div>
            );
        }

        const relativePath = cleanCurrent.replace(cleanRoot, '');
        const parts = relativePath.split('/').filter(p => p);

        return (
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap">
                <button 
                    onClick={() => onNavigate(rootPath)}
                    className="flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer"
                >
                    <Home size={16} />
                </button>
                {parts.map((part, index) => {
                     const isLast = index === parts.length - 1;
                     // Reconstruct path for click
                     const pathUpToHere = cleanRoot + '/' + parts.slice(0, index + 1).join('/');
                     
                     return (
                        <React.Fragment key={index}>
                            <ChevronRight size={14} className="text-slate-400 shrink-0" />
                            <span 
                                className={`truncate max-w-[150px] ${isLast ? 'text-slate-900 font-semibold' : 'hover:text-slate-900 cursor-pointer transition-colors'}`}
                                onClick={() => !isLast && onNavigate(pathUpToHere)}
                            >
                                {part}
                            </span>
                        </React.Fragment>
                     );
                })}
            </div>
        );
    };

    return (
        <div className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 sticky top-0 z-30 w-full shadow-sm">
            {/* Left: Breadcrumbs */}
            <div className="flex items-center gap-4 flex-1 min-w-0 mr-4">
                {getBreadcrumbs()}
            </div>

            {/* Right: Stats */}
            <div className="flex items-center gap-6 shrink-0">
                {/* Network Speed */}
                <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-full bg-emerald-100 text-emerald-600">
                            <ArrowDown size={14} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Down</span>
                            <span className="text-xs font-bold text-slate-700 font-mono">{formatSpeed(networkStats?.down || 0)}</span>
                        </div>
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded-full bg-blue-100 text-blue-600">
                            <ArrowUp size={14} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col leading-none">
                             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Up</span>
                             <span className="text-xs font-bold text-slate-700 font-mono">{formatSpeed(networkStats?.up || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Disk Storage */}
                <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <HardDrive size={18} />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex justify-between text-xs mb-1 min-w-[120px]">
                            <span className="font-semibold text-slate-700">Storage</span>
                            <span className="text-slate-500">{diskUsagePercent}%</span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${diskUsagePercent}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                            {usedSpace} / {totalSpace}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopBar;
