import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '../components/ui/table';

import {
  Archive, ArrowUpDown, ChevronRight, CloudUpload,
  Copy, Download, File, FileCode, FileText,
  FolderOpen, FolderPlus, HardDrive, Image,
  List, LayoutGrid, MoreHorizontal, Move,
  Music, Pencil, RefreshCw, Star,
  Trash2, Upload, Users, Video, X, Package,
  Folder,
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

// ─── Upload Dialog ───────────────────────────────────────────────────────────
function FileUploadDialog({ open, onOpenChange, bucketInfo, folderStack }) {
  const [selectedFiles, setSelectedFiles] = useState([]);  // File objects from file input
  const [selectedFolders, setSelectedFolders] = useState([]); // { name, path } from native dialog
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shouldZip, setShouldZip] = useState(false);
  const fileInputRef = useRef(null);

  const hasFolders = selectedFolders.length > 0;
  const totalItems = selectedFiles.length + selectedFolders.length;

  const handleAddFiles = (fileList) => {
    if (!fileList) return;
    const newFiles = Array.from(fileList);
    setSelectedFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}:${f.size}`));
      return [...prev, ...newFiles.filter(f => !existingKeys.has(`${f.name}:${f.size}`))];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Use Electron's native folder picker — returns actual folder PATHS (not webkitdirectory file objects)
  const handleSelectFolder = async () => {
    const paths = await window.electronAPI.selectFolderForUpload();
    if (!paths || paths.length === 0) return;
    setSelectedFolders(prev => {
      const existingPaths = new Set(prev.map(f => f.path));
      const newFolders = paths
        .filter(p => !existingPaths.has(p))
        .map(p => ({ name: p.split('/').pop() || p, path: p }));
      return [...prev, ...newFolders];
    });
  };

  const removeFile = (index) => setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  const removeFolder = (index) => setSelectedFolders(prev => prev.filter((_, i) => i !== index));

  const handleUpload = async () => {
    if (totalItems === 0 || !bucketInfo) return;
    setUploading(true);

    const currentPhysicalPath = [ROOT_PATH, bucketInfo.name, ...folderStack.map(f => f.name)].join('/');

    // Build the item list:
    // - Regular files: resolve path via webUtils
    // - Folders: already actual paths from native dialog
    const filePaths = selectedFiles
      .map(f => window.electronAPI.getFilePath(f))
      .filter(Boolean);

    const folderPaths = selectedFolders.map(f => f.path);

    const allPaths = [...new Set([...filePaths, ...folderPaths])];

    if (allPaths.length === 0) {
      alert('Could not read file paths. Please re-select files.');
      setUploading(false);
      return;
    }

    try {
      // shouldZip applies only when folders are selected
      await window.electronAPI.uploadItems(allPaths, currentPhysicalPath, hasFolders && shouldZip);
    } catch (err) {
      console.error('[UploadDialog] Upload error:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      handleClose(false);
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleAddFiles(e.dataTransfer.files);
  };

  const handleClose = (val) => {
    if (!val) {
      setSelectedFiles([]);
      setSelectedFolders([]);
      setShouldZip(false);
    }
    onOpenChange(val);
  };

  const currentPathDisplay = folderStack.length > 0
    ? `/${folderStack.map(f => f.name).join('/')}/`
    : '/ (Root)';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Drag and drop files or browse to upload to your bucket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination Path */}
          <div className="space-y-1.5 min-w-0">
            <Label>Destination Path</Label>
            <div className="flex items-center px-3 py-2 text-sm border rounded-md bg-muted/50 text-muted-foreground">
              <span className="truncate">{currentPathDisplay}</span>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <CloudUpload className={`h-10 w-10 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragging ? "Drop files here" : "Click to browse or drag files here"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Supports any file type up to 5 GB</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => handleAddFiles(e.target.files)}
            />
          </div>

          {/* Folder picker — uses native Electron dialog for real folder PATH */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleSelectFolder}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Select Folder
            </Button>
            <span className="text-xs text-muted-foreground">
              Select an entire folder to upload
            </span>
          </div>

          {/* Zip toggle — shown when folders are selected */}
          {hasFolders && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Package className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-amber-900">Folder detected</p>
                <p className="text-xs text-amber-700">
                  Would you like to compress the folder into a ZIP before uploading?
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="zip-toggle"
                    checked={shouldZip}
                    onCheckedChange={setShouldZip}
                  />
                  <label htmlFor="zip-toggle" className="text-sm text-amber-900 cursor-pointer select-none">
                    Zip folder before uploading
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Selected items list */}
          {totalItems > 0 && (
            <div className="max-h-[200px] w-full overflow-y-auto pr-1 border rounded-md">
              <div className="space-y-1 p-1">
                {/* Folder items */}
                {selectedFolders.map((folder, i) => (
                  <div key={`folder-${i}`} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-md border border-amber-200 bg-amber-50/40 p-2.5">
                    <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{folder.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{folder.path}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFolder(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {/* Regular file items */}
                {selectedFiles.map((file, i) => (
                  <div key={`file-${i}`} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-md border p-2.5">
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatBytes(file.size)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalItems > 0
                ? `${totalItems} item${totalItems > 1 ? 's' : ''} selected${hasFolders && shouldZip ? ' — will be zipped' : ''}`
                : "No files selected"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={totalItems === 0 || uploading} className="gap-1.5">
                {uploading ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
                ) : (
                  <>
                    {hasFolders && shouldZip ? <Package className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                    {hasFolders && shouldZip ? 'Zip & Upload' : 'Upload'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Folder Dialog (enterprise-identical) ────────────────────────────────
function NewFolderDialog({ open, onOpenChange, bucketInfo, folderStack, onFolderCreated }) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !bucketInfo) return;
    setIsLoading(true);
    try {
      const currentPhysicalPath = [ROOT_PATH, bucketInfo.name, ...folderStack.map(f => f.name)].join('/');
      const newPath = `${currentPhysicalPath}/${name.trim()}`;
      const ok = await window.electronAPI.createFolder(newPath);
      if (!ok) throw new Error('Failed to create folder');
      setName('');
      onOpenChange(false);
      onFolderCreated?.();
    } catch (err) {
      alert('Failed to create folder: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentPathDisplay = folderStack.length > 0
    ? `/${folderStack.map(f => f.name).join('/')}`
    : 'root';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogDescription>
            Create a new folder in{' '}
            <span className="font-medium text-foreground">
              {bucketInfo?.name}{currentPathDisplay}
            </span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Documents"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rename Dialog ───────────────────────────────────────────────────────────
function RenameDialog({ open, onOpenChange, file, onRenamed }) {
  const [name, setName] = useState('');
  useEffect(() => { if (file) setName(file.name); }, [file]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || name === file?.name) return;
    // Rename local file via IPC
    try {
      const parent = file.path.substring(0, file.path.lastIndexOf('/'));
      const newPath = `${parent}/${name.trim()}`;
      await window.electronAPI.renameFile?.(file.path, newPath);
      onRenamed?.();
    } catch {
      alert('Failed to rename — check console.');
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename {file?.name}</DialogTitle>
          <DialogDescription>Enter a new name for this file.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rename">New Name</Label>
              <Input
                id="rename"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={file?.name}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || name === file?.name}>Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── File Context Menu ───────────────────────────────────────────────────────
function FileContextMenu({ file, onAction }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAction('download', file)}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('copy', file)}>
          <Copy className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('share', file)}>
          <Users className="mr-2 h-4 w-4" />
          Share
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction('rename', file)}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('move', file)}>
          <Move className="mr-2 h-4 w-4" />
          Move
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
          onClick={() => onAction('delete', file)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [fileToRename, setFileToRename] = useState(null);

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

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleAction = async (action, file) => {
    if (action === 'rename') {
      setFileToRename(file);
      setRenameOpen(true);
      return;
    }
    if (action === 'delete') {
      if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
      alert('Delete functionality coming in next update.');
      return;
    }
    // 'download' option removed — files already sync locally via SyncManager
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
            All Files
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

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setNewFolderOpen(true)}
            disabled={!bucketInfo}
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setUploadOpen(true)}
            disabled={!bucketInfo}
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
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
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Download className="mr-1 h-3 w-3" /> Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
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
          <Button className="mt-4 gap-1.5" onClick={() => navigate('/')}>
            <HardDrive className="h-4 w-4" /> Go to Buckets
          </Button>
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────────────── */}
      {!loading && bucketId && currentFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">This folder is empty</p>
          <p className="text-sm text-muted-foreground mt-1">Upload files or create a new folder to get started</p>
          <Button className="mt-4 gap-1.5" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload Files
          </Button>
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
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="w-10" />
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
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    Admin
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <FileContextMenu file={file} onAction={handleAction} />
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
                  <div onClick={e => e.stopPropagation()}>
                    <FileContextMenu file={file} onAction={handleAction} />
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

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        bucketInfo={bucketInfo}
        folderStack={folderStack}
      />

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        bucketInfo={bucketInfo}
        folderStack={folderStack}
        onFolderCreated={fetchFiles}
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        file={fileToRename}
        onRenamed={fetchFiles}
      />
    </div>
  );
}
