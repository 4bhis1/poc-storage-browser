import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';

import {
  Archive, ArrowUpDown, ChevronRight,
  File, FileCode, FileText,
  FolderOpen, HardDrive, Image,
  List, LayoutGrid, Music, RefreshCw, Video
} from 'lucide-react';

const ROOT_PATH = "/home/abhishek/FMS";

// ─── Helpers ────────────────────────────────────────────────────────────────
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

const fileIconMap = {
  folder: { Icon: FolderOpen, color: 'text-primary' },
  pdf: { Icon: FileText, color: 'text-red-500' },
  image: { Icon: Image, color: 'text-emerald-500' },
  document: { Icon: FileText, color: 'text-blue-500' },
  spreadsheet: { Icon: FileText, color: 'text-green-500' },
  archive: { Icon: Archive, color: 'text-amber-500' },
  video: { Icon: Video, color: 'text-purple-500' },
  audio: { Icon: Music, color: 'text-pink-500' },
  code: { Icon: FileCode, color: 'text-orange-500' },
  other: { Icon: File, color: 'text-muted-foreground' },
};

const FileIcon = ({ file, className = "h-4 w-4" }) => {
  const type = getFileType(file);
  const { Icon, color } = fileIconMap[type] || fileIconMap.other;
  return <Icon className={`${className} shrink-0 ${color}`} />;
};

// ─── Main File Browser Page ──────────────────────────────────────────────────
export default function FilesPage() {
  const { bucketId } = useParams();
  const navigate = useNavigate();

  // State
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bucketInfo, setBucketInfo] = useState(null);
  const [folderStack, setFolderStack] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [sortKey, setSortKey] = useState('name');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (!bucketId) { setLoading(false); return; }
    setLoading(true);
    try {
      const bucketRes = await window.electronAPI.dbQuery('SELECT name FROM "Bucket" WHERE id = $1', [bucketId]);
      if (bucketRes.rows.length > 0) {
        const bucket = bucketRes.rows[0];
        setBucketInfo(bucket);
        const physPath = [ROOT_PATH, bucket.name, ...folderStack.map(f => f.name)].join('/');
        const content = await window.electronAPI.listContent({ folderPath: physPath, sortBy: 'az' });
        setFiles(content || []);
      }
    } catch (err) {
      console.error('fetchFiles error:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [bucketId, folderStack]);

  useEffect(() => {
    fetchFiles();
    let unsubs = [];
    if (window.electronAPI?.onFileChange) {
      ['add', 'unlink', 'addDir', 'unlinkDir'].forEach(evt => {
        unsubs.push(window.electronAPI.onFileChange(evt, fetchFiles));
      });
    }
    const interval = setInterval(fetchFiles, 30000);
    return () => { unsubs.forEach(fn => fn()); clearInterval(interval); };
  }, [fetchFiles]);

  // ── Sorting + filtering ──────────────────────────────────────────────────
  const currentFiles = useMemo(() => {
    let list = [...files];
    if (search.trim()) {
      list = list.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    }
    return list.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name);
        case 'size': return (b.size || 0) - (a.size || 0);
        case 'modifiedAt': return new Date(b.updatedAt) - new Date(a.updatedAt);
        default: return 0;
      }
    });
  }, [files, sortKey, search]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const navigateToFolder = (folder) => {
    setFolderStack(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSelected(new Set());
  };

  const navigateToBreadcrumb = (index) => {
    setFolderStack(prev => prev.slice(0, index));
    setSelected(new Set());
  };

  // ── Selection ────────────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(prev => prev.size === currentFiles.length ? new Set() : new Set(currentFiles.map(f => f.id)));
  };

  // Click folder → navigate in, click file → open with native app
  const handleItemClick = async (file) => {
    if (file.isFolder) {
      navigateToFolder(file);
    } else {
      // Build full local path and open with the OS default application
      const parts = [ROOT_PATH, bucketInfo?.name, ...folderStack.map(f => f.name), file.name];
      const localPath = parts.join('/');
      try {
        await window.electronAPI.openFile(localPath);
      } catch {
        console.warn('[FilesPage] Could not open file:', localPath);
      }
    }
  };

  return (
    <div className="space-y-4 p-6 h-full overflow-auto">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm">
          <button
            onClick={() => navigateToBreadcrumb(0)}
            className="text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            {bucketInfo?.name || "Bucket"}
          </button>
          {folderStack.map((segment, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                onClick={() => navigateToBreadcrumb(i + 1)}
                className={i === folderStack.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground transition-colors"}
              >
                {segment.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <ArrowUpDown className="mr-1 h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="size">Size</SelectItem>
              <SelectItem value="modifiedAt">Modified</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchFiles} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {/* View Toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <input
          type="text"
          placeholder="Search files and folders..."
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 pl-9 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
      </div>

      {/* ── Selection bar ────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{selected.size} selected</span>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading files...</div>
      )}

      {/* ── No bucket ────────────────────────────────────────────────────── */}
      {!loading && !bucketId && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No bucket selected</p>
          <p className="text-sm text-muted-foreground mt-1">Please select a bucket from the Buckets page to view files.</p>
          <Button className="mt-4 gap-1.5" onClick={() => navigate('/buckets')}>
            <HardDrive className="h-4 w-4" /> Go to Buckets
          </Button>
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────────────── */}
      {!loading && bucketId && currentFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">This folder is empty</p>
          <p className="text-sm text-muted-foreground mt-1">Files are synced from S3</p>
        </div>
      )}

      {/* ── List View ────────────────────────────────────────────────────── */}
      {!loading && viewMode === "list" && currentFiles.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === currentFiles.length && currentFiles.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Size</TableHead>
                <TableHead className="hidden lg:table-cell">Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentFiles.map(file => (
                <TableRow
                  key={file.id}
                  className="group cursor-pointer"
                  data-state={selected.has(file.id) ? "selected" : undefined}
                  onClick={() => handleItemClick(file)}
                >
                  <TableCell onClick={e => { e.stopPropagation(); toggleSelect(file.id); }}>
                    <Checkbox
                      checked={selected.has(file.id)}
                      onCheckedChange={() => toggleSelect(file.id)}
                      aria-label={`Select ${file.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <FileIcon file={file} />
                      <span className="text-sm font-medium truncate">{file.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {file.isFolder ? '--' : formatBytes(file.size)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {formatDate(file.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Grid View ────────────────────────────────────────────────────── */}
      {!loading && viewMode === "grid" && currentFiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {currentFiles.map(file => (
            <Card
              key={file.id}
              className={`group cursor-pointer transition-colors hover:bg-accent/50 ${selected.has(file.id) ? "ring-2 ring-primary" : ""}`}
              onClick={() => handleItemClick(file)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <FileIcon file={file} className="h-5 w-5" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.isFolder ? 'Folder' : formatBytes(file.size)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
