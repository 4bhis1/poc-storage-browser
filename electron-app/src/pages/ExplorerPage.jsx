import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Archive,
  File,
  FileCode,
  FileText,
  FolderOpen,
  Image,
  Music,
  Search,
  Sheet,
  Video,
  X,
  RefreshCw,
  HardDrive
} from "lucide-react"

import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationNext, PaginationPrevious,
} from '../components/ui/pagination';

const fileIcons = {
  folder: FolderOpen,
  pdf: FileText,
  image: Image,
  document: FileText,
  spreadsheet: Sheet,
  archive: Archive,
  video: Video,
  audio: Music,
  code: FileCode,
  other: File,
}

const fileTypeFilters = [
  "document", "spreadsheet", "pdf", "image", "archive", "video", "code"
]

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  if (!dateString) return '--';
  const d = new Date(dateString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: '2-digit', minute: '2-digit' });
};

const getFileType = (file) => {
  if (file.isFolder) return 'folder';
  const mime = file.mimeType || '';
  const name = file.name?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('archive') || name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.tar') || name.endsWith('.gz')) return 'archive';
  if (name.match(/\.(js|ts|jsx|tsx|py|go|rs|java|cpp|c|html|css|json|sh)$/)) return 'code';
  return 'other';
};

export default function ExplorerPage() {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      if (!window.electronAPI) {
        setFiles([]); setLoading(false); return;
      }
      
      const res = await window.electronAPI.dbQuery(
        `SELECT f.*, b.name as "bucketName" 
         FROM "FileObject" f 
         JOIN "Bucket" b ON f."bucketId" = b.id 
         WHERE f."isFolder" = false 
         ORDER BY f."updatedAt" DESC`
      );
      
      const fetchedFiles = (res.rows || []).map(f => ({
        ...f,
        type: getFileType(f)
      }));
      setFiles(fetchedFiles);
    } catch (err) {
      console.error('Failed to fetch explorer files:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const toggleFilter = (type) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
    setPage(1);
  }

  // Local filtering & pagination
  const filteredFiles = useMemo(() => {
    let result = files;

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(f => 
        f.name?.toLowerCase().includes(q) || 
        f.bucketName?.toLowerCase().includes(q)
      );
    }

    if (activeFilters.size > 0) {
      result = result.filter(f => activeFilters.has(f.type));
    }

    return result;
  }, [files, query, activeFilters]);

  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage) || 1;
  const paginatedFiles = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredFiles.slice(start, start + itemsPerPage);
  }, [filteredFiles, page]);

  const handleItemClick = async (file) => {
    // Open natively
    const ROOT_PATH = "/home/abhishek/FMS";
    // We assume file.path contains the relative path (e.g., 'folder/file.ext' or 'file.ext') within the bucket.
    // If path is not available, we fallback to just name for flat root structures.
    const relativePath = file.path ? file.path : file.name;
    const localPath = `${ROOT_PATH}/${file.bucketName}/${relativePath}`;
    
    try {
      await window.electronAPI.openFile(localPath.replace(/\/+/g, '/'));
    } catch (err) {
      console.warn('Could not open file:', localPath);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">File Explorer</h1>
            <p className="text-slate-500 mt-1">
              Search and view all your globally synced files.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchFiles} className="h-9 gap-1.5 font-medium shadow-sm" disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6 space-y-6">
          
          {/* Search bar */}
          <div className="space-y-4">
            <div className="relative max-w-2xl text-slate-900 border-none outline-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by file name or bucket..."
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                className="pl-9 h-11 text-base bg-white border-slate-200 focus-visible:ring-blue-500 focus-visible:border-blue-500 rounded-lg shadow-sm w-full"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-slate-400 hover:text-slate-600 focus-visible:ring-0"
                  onClick={() => { setQuery(""); setPage(1); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-600 mr-2">File Type:</span>
              {fileTypeFilters.map((type) => (
                <Badge
                  key={type}
                  variant={activeFilters.has(type) ? "default" : "outline"}
                  className={`cursor-pointer capitalize tracking-wide transition-colors ${activeFilters.has(type) ? 'bg-slate-900 text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100 bg-white shadow-sm border-slate-200'}`}
                  onClick={() => toggleFilter(type)}
                >
                  {type}
                </Badge>
              ))}
              {activeFilters.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-slate-500 ml-2 hover:bg-slate-100"
                  onClick={() => {
                    setActiveFilters(new Set())
                    setPage(1)
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="space-y-3">
             <p className="text-sm font-medium text-slate-500">
               {loading && files.length === 0 ? 'Loading...' : `${filteredFiles.length} result${filteredFiles.length !== 1 ? "s" : ""}`}
             </p>
             
             {paginatedFiles.length > 0 ? (
               <div className="rounded-lg border border-slate-200 overflow-hidden w-full bg-white shadow-sm">
                 <Table className="table-fixed w-full">
                   <TableHeader className="bg-slate-50">
                     <TableRow className="hover:bg-transparent border-slate-200 group">
                       <TableHead className="w-[40%] font-semibold text-slate-700">Name</TableHead>
                       <TableHead className="hidden md:table-cell font-semibold text-slate-700">Bucket</TableHead>
                       <TableHead className="hidden sm:table-cell font-semibold text-slate-700">Size</TableHead>
                       <TableHead className="hidden lg:table-cell font-semibold text-slate-700">Modified</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {paginatedFiles.map(file => {
                       const Icon = fileIcons[file.type] || fileIcons.other
                       return (
                         <TableRow
                           key={file.id}
                           onClick={() => handleItemClick(file)}
                           className="cursor-pointer hover:bg-slate-50/80 transition-colors border-slate-100/60"
                         >
                           <TableCell className="align-top py-3">
                             <div className="flex items-start gap-3">
                               <Icon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                               <span className="text-sm font-medium text-slate-700 break-all leading-snug">
                                 {file.name}
                               </span>
                             </div>
                           </TableCell>
                           <TableCell className="hidden md:table-cell text-sm text-slate-500 align-top break-words py-3">
                             <div className="flex items-center gap-1.5">
                               <HardDrive className="h-3 w-3 text-slate-300" />
                               {file.bucketName}
                             </div>
                           </TableCell>
                           <TableCell className="hidden sm:table-cell text-sm text-slate-500 align-top whitespace-nowrap py-3">
                             {formatBytes(file.size)}
                           </TableCell>
                           <TableCell className="hidden lg:table-cell text-sm text-slate-500 align-top whitespace-nowrap py-3">
                             {formatDate(file.updatedAt)}
                           </TableCell>
                         </TableRow>
                       )
                     })}
                   </TableBody>
                 </Table>
               </div>
             ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                  <Search className="h-10 w-10 text-slate-300 mb-4" />
                  <p className="text-lg font-medium text-slate-700">No files found</p>
                  <p className="text-sm text-slate-500 mt-1">Try adjusting your search query or filters.</p>
                </div>
             )}

             {/* Pagination Control */}
             {totalPages > 1 && (
               <div className="pt-4 mt-4 border-t border-slate-100">
                 <Pagination>
                   <PaginationContent>
                     <PaginationItem>
                       <PaginationPrevious 
                         onClick={(e) => {
                           e.preventDefault();
                           if (page > 1) setPage(page - 1);
                         }}
                         href="#"
                         size="default"
                         className={`text-slate-600 ${page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} hover:bg-slate-100`}
                       />
                     </PaginationItem>
                     <PaginationItem>
                       <span className="text-sm font-medium text-slate-600 mx-4">
                         Page {page} of {totalPages}
                       </span>
                     </PaginationItem>
                     <PaginationItem>
                       <PaginationNext 
                         onClick={(e) => {
                           e.preventDefault();
                           if (page < totalPages) setPage(page + 1);
                         }}
                         href="#"
                         size="default"
                         className={`text-slate-600 ${page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} hover:bg-slate-100`}
                       />
                     </PaginationItem>
                   </PaginationContent>
                 </Pagination>
               </div>
             )}

          </div>
        </div>
      </div>
    </div>
  )
}
