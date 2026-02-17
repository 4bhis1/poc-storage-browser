
import React, { useState, useMemo } from 'react';
import { 
  Search, 
  X, 
  FolderOpen, 
  FileText, 
  Image as ImageIcon, 
  Sheet, 
  Archive, 
  Video, 
  Music, 
  FileCode, 
  File 
} from 'lucide-react';
import clsx from 'clsx';

// ... (Mock Data remains the same)
const allFiles = [
    { id: "f1", name: "system-design-v3.pdf", type: "pdf", size: 4500000, path: "/Engineering/Architecture/system-design-v3.pdf", modifiedAt: "2026-02-12T16:00:00Z", owner: "Alex Rivera" },
    { id: "f2", name: "api-schema.json", type: "code", size: 85000, path: "/Engineering/Architecture/api-schema.json", modifiedAt: "2026-02-12T16:00:00Z", owner: "Alex Rivera" },
    { id: "f3", name: "infra-diagram.png", type: "image", size: 2200000, path: "/Engineering/Architecture/infra-diagram.png", modifiedAt: "2026-02-10T14:30:00Z", owner: "Marcus Kim" },
    { id: "f4", name: "sprint-42-report.pdf", type: "pdf", size: 1200000, path: "/Engineering/Sprint Reports/sprint-42-report.pdf", modifiedAt: "2026-02-15T09:00:00Z", owner: "Sarah Chen" },
    { id: "f5", name: "sprint-41-report.pdf", type: "pdf", size: 980000, path: "/Engineering/Sprint Reports/sprint-41-report.pdf", modifiedAt: "2026-02-08T09:00:00Z", owner: "Sarah Chen" },
    { id: "f6", name: "velocity-tracker.xlsx", type: "spreadsheet", size: 340000, path: "/Engineering/Sprint Reports/velocity-tracker.xlsx", modifiedAt: "2026-02-15T09:00:00Z", owner: "Marcus Kim" },
    { id: "f7", name: "onboarding-guide.docx", type: "document", size: 560000, path: "/Engineering/onboarding-guide.docx", modifiedAt: "2026-02-10T09:00:00Z", owner: "Sarah Chen" },
    { id: "f8", name: "deployment-checklist.md", type: "code", size: 12000, path: "/Engineering/deployment-checklist.md", modifiedAt: "2026-02-10T09:00:00Z", owner: "Sarah Chen" },
    { id: "f9", name: "logo-primary.svg", type: "image", size: 48000, path: "/Marketing/Brand Assets/logo-primary.svg", modifiedAt: "2026-02-16T11:30:00Z", owner: "Elena Volkov" },
    { id: "f10", name: "brand-guidelines-2026.pdf", type: "pdf", size: 8700000, path: "/Marketing/Brand Assets/brand-guidelines-2026.pdf", modifiedAt: "2026-02-16T11:30:00Z", owner: "Elena Volkov" },
    { id: "f11", name: "color-palette.png", type: "image", size: 320000, path: "/Marketing/Brand Assets/color-palette.png", modifiedAt: "2026-02-16T11:30:00Z", owner: "Elena Volkov" },
    { id: "f12", name: "q4-campaign-results.xlsx", type: "spreadsheet", size: 1800000, path: "/Marketing/q4-campaign-results.xlsx", modifiedAt: "2026-02-16T11:30:00Z", owner: "Elena Volkov" },
    { id: "f13", name: "product-demo.mp4", type: "video", size: 145000000, path: "/Marketing/product-demo.mp4", modifiedAt: "2026-02-14T15:20:00Z", owner: "James Wu" },
    { id: "f14", name: "annual-report-2025.pdf", type: "pdf", size: 12400000, path: "/Finance/annual-report-2025.pdf", modifiedAt: "2026-02-13T17:00:00Z", owner: "Priya Sharma" },
    { id: "f15", name: "budget-forecast-q1.xlsx", type: "spreadsheet", size: 2100000, path: "/Finance/budget-forecast-q1.xlsx", modifiedAt: "2026-02-13T17:00:00Z", owner: "Priya Sharma" },
];

const fileIcons = {
  folder: FolderOpen,
  pdf: FileText,
  image: ImageIcon,
  document: FileText,
  spreadsheet: Sheet,
  archive: Archive,
  video: Video,
  audio: Music,
  code: FileCode,
  other: File,
};

const fileTypeFilters = [
  "pdf",
  "image",
  "document",
  "spreadsheet",
  "archive",
  "video",
  "code",
];

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
};

const SearchPage = () => {
    const [query, setQuery] = useState("");
    const [activeFilters, setActiveFilters] = useState(new Set());

    const toggleFilter = (type) => {
        const next = new Set(activeFilters);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        setActiveFilters(next);
    };

    const filteredFiles = useMemo(() => {
        let results = allFiles;
        if (query.trim()) {
            const q = query.toLowerCase();
            results = results.filter(f => 
                f.name.toLowerCase().includes(q) || 
                f.path.toLowerCase().includes(q) || 
                f.owner.toLowerCase().includes(q)
            );
        }
        if (activeFilters.size > 0) {
            results = results.filter(f => activeFilters.has(f.type));
        }
        return results;
    }, [query, activeFilters]);

    return (
        <div className="h-full flex flex-col bg-slate-50 text-slate-900 animate-in fade-in zoom-in-95 duration-300">
             
             {/* Header Section */}
             <div className="p-6 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10 w-full">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-6">Search</h1>
                
                {/* Search Input */}
                <div className="relative max-w-2xl mb-4 text-slate-900">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search by file name, path, or owner..." 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm placeholder-slate-400 font-medium"
                        autoFocus
                    />
                    {query && (
                        <button 
                            onClick={() => setQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
                
                <p className="text-xs text-slate-500 mb-4 inline-block px-1 py-0.5 rounded">
                    Press <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 font-medium mx-1">Cmd K</span> for quick search
                </p>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="text-slate-500 mr-2 font-medium">Type:</span>
                    {fileTypeFilters.map((type) => (
                        <button
                            key={type}
                            onClick={() => toggleFilter(type)}
                            className={clsx(
                                "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide transition-all border",
                                activeFilters.has(type) 
                                    ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            {type}
                        </button>
                    ))}
                    {activeFilters.size > 0 && (
                        <button 
                            onClick={() => setActiveFilters(new Set())}
                            className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors ml-2 font-medium underline underline-offset-2"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
             </div>

             {/* Results Area */}
             <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                 <p className="text-sm text-slate-500 mb-3 font-medium">
                     {filteredFiles.length} result{filteredFiles.length !== 1 ? "s" : ""}
                     {query && <span> for "<span className="text-slate-900">{query}</span>"</span>}
                 </p>

                 {filteredFiles.length > 0 ? (
                     <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                         <table className="w-full text-left text-sm">
                             <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200 font-semibold h-10 tracking-wider">
                                 <tr>
                                     <th className="px-6 py-3 w-1/3">Name</th>
                                     <th className="px-6 py-3 hidden md:table-cell">Path</th>
                                     <th className="px-6 py-3 hidden sm:table-cell">Size</th>
                                     <th className="px-6 py-3 hidden lg:table-cell">Modified</th>
                                     <th className="px-6 py-3 hidden lg:table-cell">Owner</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100 text-slate-600">
                                 {filteredFiles.map((file) => {
                                     const Icon = fileIcons[file.type] || File;
                                     return (
                                         <tr key={file.id} className="hover:bg-slate-50/80 transition-colors group cursor-default">
                                             <td className="px-6 py-3">
                                                 <div className="flex items-center gap-3 text-slate-900">
                                                     <Icon className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
                                                     <span className="font-medium truncate max-w-[200px]" title={file.name}>
                                                         {file.name}
                                                     </span>
                                                 </div>
                                             </td>
                                             <td className="px-6 py-3 hidden md:table-cell">
                                                 <span className="text-xs text-slate-400 font-mono truncate max-w-[250px] inline-block" title={file.path}>
                                                     {file.path}
                                                 </span>
                                             </td>
                                             <td className="px-6 py-3 hidden sm:table-cell text-slate-500 font-tabular-nums text-xs">
                                                 {formatBytes(file.size)}
                                             </td>
                                             <td className="px-6 py-3 hidden lg:table-cell text-slate-500 text-xs">
                                                 {formatDate(file.modifiedAt)}
                                             </td>
                                             <td className="px-6 py-3 hidden lg:table-cell text-slate-500 text-xs">
                                                 {file.owner}
                                             </td>
                                         </tr>
                                     );
                                 })}
                             </tbody>
                         </table>
                     </div>
                 ) : (
                     <div className="flex flex-col items-center justify-center py-24 text-center opacity-70">
                         <div className="bg-slate-100 p-4 rounded-full mb-4 ring-8 ring-slate-50">
                            <Search className="h-8 w-8 text-slate-400" />
                         </div>
                         <h3 className="text-lg font-semibold text-slate-900">No results found</h3>
                         <p className="text-sm text-slate-500 mt-2 max-w-xs leading-relaxed">
                             We couldn't find any files matching your search. Try different keywords or filters.
                         </p>
                         <button 
                            onClick={() => { setQuery(""); setActiveFilters(new Set()); }}
                            className="mt-6 px-5 py-2 text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-md transition-all font-medium shadow-sm"
                        >
                            Clear all filters
                        </button>
                     </div>
                 )}
             </div>
        </div>
    );
};

export default SearchPage;
