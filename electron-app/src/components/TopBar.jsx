
import React from 'react';
import { ChevronRight, Home, Menu, Search, Video, Music, FileText, Folder } from 'lucide-react';
import clsx from 'clsx';
import { useLocation } from 'react-router-dom'; // Assuming we might use this later, but for now simple props

const TopBar = ({ activeTab }) => {
    
    // Breadcrumb logic helper
    const getBreadcrumbs = () => {
        const path = activeTab ? activeTab.charAt(0).toUpperCase() + activeTab.slice(1) : 'Overview';
        return (
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <span className="flex items-center gap-1.5 hover:text-slate-900 transition-colors cursor-pointer">
                    <Home size={14} />
                    CloudVault
                </span>
                <ChevronRight size={14} className="text-slate-400" />
                <span className="text-slate-900 font-semibold cursor-default">
                    {path}
                </span>
            </div>
        );
    };

    return (
        <div className="h-14 border-b border-slate-200 bg-white/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 sticky top-0 z-30 w-full">
            {/* Left: Breadcrumbs / Title */}
            <div className="flex items-center gap-4">
                <button className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900">
                    <Menu size={20} />
                </button>
                {getBreadcrumbs()}
            </div>

            {/* Right: Actions / Profile (Minimal) */}
            <div className="flex items-center gap-3">
                 <div className="relative group">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-500 text-sm hover:bg-white hover:border-slate-300 transition-all cursor-pointer shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="font-medium text-xs">System Healthy</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopBar;
