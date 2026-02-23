import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, LogOut, HardDrive, Search, Cloud } from 'lucide-react';
import { useSystem } from '../contexts/SystemContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';

const TopBar = () => {
    const { networkStats, diskStats } = useSystem();
    const { user, logout } = useAuth();
    const navigate = useNavigate();

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

    const diskUsagePercent = diskStats ? Math.round((diskStats.used / diskStats.total) * 100) : 0;

    return (
        <div className="h-16 bg-slate-50 flex items-center justify-between px-3 shrink-0 w-full">
            {/* Logo area */}
            <div className="w-64 shrink-0 flex items-center px-1 cursor-pointer" onClick={() => navigate('/')}>
                <div className="p-1 px-1.5 rounded-lg text-slate-800 mr-1.5 flex items-center justify-center">
                    <Cloud size={28} strokeWidth={2.5} fill="currentColor" stroke="none" className="text-blue-500"/>
                </div>
                <span className="text-[22px] font-normal text-slate-700 tracking-tight">Cloud<span className="font-semibold text-slate-800">Vault</span></span>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-3xl px-4 flex justify-center">
                <div className="relative w-full max-w-2xl group flex">
                    <div className="absolute left-0 inset-y-0 flex items-center pl-4 pointer-events-none">
                        <Search className="h-5 w-5 text-slate-500 group-focus-within:text-slate-800 transition-colors" />
                    </div>
                    <Input 
                        placeholder="Search in Vault..." 
                        className="w-full pl-12 h-12 bg-[#edf2fc] border-transparent rounded-full focus-visible:ring-0 focus-visible:bg-white focus-visible:border-transparent focus-visible:shadow-[0_1px_3px_0_rgba(0,0,0,0.1)] text-base transition-all"
                    />
                </div>
            </div>

            {/* Right: Stats & User */}
            <div className="flex items-center gap-5 shrink-0 pr-3">
                {/* Network & Disk */}
                <div className="hidden lg:flex items-center gap-5 mr-2">
                    <div className="flex flex-col items-end leading-none" title="Download Speed">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Down</span>
                        <div className="flex items-center gap-1 text-slate-700 font-mono text-xs">
                           <ArrowDown size={12} className="text-emerald-500"/> {formatSpeed(networkStats?.down || 0)}
                        </div>
                    </div>
                    <div className="flex flex-col items-end leading-none" title="Upload Speed">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Up</span>
                        <div className="flex items-center gap-1 text-slate-700 font-mono text-xs">
                           <ArrowUp size={12} className="text-blue-500"/> {formatSpeed(networkStats?.up || 0)}
                        </div>
                    </div>
                    <div className="h-8 w-px bg-slate-200 ml-1"></div>
                    <div className="flex items-center gap-1.5 text-slate-600 ml-1" title="Storage Usage">
                        <HardDrive size={16} />
                        <span className="text-xs font-semibold">{diskUsagePercent}%</span>
                    </div>
                </div>

                {/* User Profile */}
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={logout} title="Logout" className="h-10 w-10 mr-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200/50">
                        <LogOut className="h-5 w-5" />
                    </Button>
                    <div className="h-9 w-9 bg-purple-100 text-purple-700 font-bold rounded-full flex items-center justify-center text-sm shadow-sm cursor-pointer border border-purple-200/60">
                        {(user?.name || 'A').charAt(0).toUpperCase()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopBar;
