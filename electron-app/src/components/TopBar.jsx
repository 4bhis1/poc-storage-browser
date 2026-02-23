import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, LogOut, HardDrive, Search, Cloud, FolderOpen, File, X } from 'lucide-react';
import { useSystem } from '../contexts/SystemContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

const TopBar = () => {
    const { networkStats, diskStats } = useSystem();
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef(null);
    const debounceRef = useRef(null);

    const formatBytes = (bytes) => {
        if (!bytes && bytes !== 0) return '0 B';
        if (bytes === 0) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSec) => formatBytes(bytesPerSec) + '/s';
    const diskUsagePercent = diskStats ? Math.round((diskStats.used / diskStats.total) * 100) : 0;

    // Debounced search
    const doSearch = useCallback(async (q) => {
        if (!q || q.trim().length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }
        setIsSearching(true);
        try {
            if (window.electronAPI?.searchFiles) {
                const results = await window.electronAPI.searchFiles(q.trim());
                setSearchResults(results || []);
                setShowDropdown(true);
            }
        } catch (err) {
            console.error('[Search] Error:', err);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 250);
    };

    const handleResultClick = (result) => {
        setShowDropdown(false);
        setSearchQuery('');
        setSearchResults([]);
        navigate(`/files/${result.bucketId}`);
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        setShowDropdown(false);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getFileIcon = (result) => {
        if (result.isFolder) return <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />;
        const mime = result.mimeType || '';
        const name = result.name?.toLowerCase() || '';
        if (mime.startsWith('image/')) return <File className="h-4 w-4 text-emerald-500 shrink-0" />;
        if (mime.startsWith('video/')) return <File className="h-4 w-4 text-purple-500 shrink-0" />;
        return <File className="h-4 w-4 text-slate-400 shrink-0" />;
    };

    const formatFileSize = (size) => {
        if (!size) return '';
        return formatBytes(size);
    };

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
                <div ref={searchRef} className="relative w-full max-w-2xl group flex flex-col">
                    {/* Input */}
                    <div className="relative flex items-center">
                        <div className="absolute left-0 inset-y-0 flex items-center pl-4 pointer-events-none z-10">
                            <Search className={`h-5 w-5 transition-colors ${isSearching ? 'text-blue-500 animate-pulse' : 'text-slate-500 group-focus-within:text-slate-800'}`} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search in Vault..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                            className="w-full pl-12 pr-10 h-12 bg-[#edf2fc] border border-transparent rounded-full focus:outline-none focus:bg-white focus:border-transparent focus:shadow-[0_1px_3px_0_rgba(0,0,0,0.1)] text-base transition-all text-slate-800 placeholder-slate-500"
                        />
                        {searchQuery && (
                            <button
                                onClick={clearSearch}
                                className="absolute right-4 inset-y-0 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Results Dropdown */}
                    {showDropdown && (
                        <div className="absolute top-14 left-0 right-0 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-slate-100 z-[9999] max-h-[400px] overflow-y-auto">
                            {searchResults.length === 0 && !isSearching ? (
                                <div className="px-5 py-8 text-center text-slate-500 text-sm">
                                    No files found for "<span className="font-medium text-slate-700">{searchQuery}</span>"
                                </div>
                            ) : (
                                <>
                                    <div className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                                        {isSearching ? 'Searching...' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
                                    </div>
                                    <div className="py-1">
                                        {searchResults.map((result) => (
                                            <button
                                                key={result.id}
                                                onClick={() => handleResultClick(result)}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left group/item"
                                            >
                                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover/item:bg-white transition-colors">
                                                    {getFileIcon(result)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-800 truncate">{result.name}</p>
                                                    <p className="text-xs text-slate-400 truncate">
                                                        {result.bucketName} / {result.key}
                                                        {result.size ? <span className="ml-2 text-slate-300">•</span> : null}
                                                        {result.size ? <span className="ml-2">{formatFileSize(result.size)}</span> : null}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${result.isFolder ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>
                                                    {result.isFolder ? 'FOLDER' : 'FILE'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Stats & User */}
            <div className="flex items-center gap-5 shrink-0 pr-3">
                {/* Network & Disk */}
                <div className="hidden lg:flex items-center gap-5 mr-2">
                    <div className="flex flex-col items-end leading-none justify-center items-center w-15" title="Download Speed">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Down</span>
                        <div className="flex items-center gap-1 text-slate-700 font-mono text-xs">
                           <ArrowDown size={12} className="text-emerald-500"/> {formatSpeed(networkStats?.down || 0)}
                        </div>
                    </div>
                    <div className="flex flex-col items-end leading-none justify-center items-center w-15" title="Upload Speed">
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
