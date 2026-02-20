import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon,
  Music,
  Video,
  List, 
  Grid3X3, 
  Loader2,
  Cloud,
  CheckCircle2,
  X,
  Download,
  Trash2,
  MoreVertical,
  RefreshCw
} from 'lucide-react';
import clsx from 'clsx';

const FileIcon = ({ name, isDirectory, size = 24, className }) => {
    if (isDirectory) return <Folder size={size} className={clsx("text-blue-500 fill-blue-500/20", className)} />;
    
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <ImageIcon size={size} className={clsx("text-emerald-500", className)} />;
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return <Video size={size} className={clsx("text-purple-500", className)} />;
    if (['mp3', 'wav', 'ogg'].includes(ext)) return <Music size={size} className={clsx("text-pink-500", className)} />;
    if (['pdf'].includes(ext)) return <FileText size={size} className={clsx("text-red-500", className)} />;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileText size={size} className={clsx("text-green-500", className)} />;
    if (['zip', 'rar', 'tar', '7z'].includes(ext)) return <Folder size={size} className={clsx("text-amber-500", className)} />;
    
    return <FileText size={size} className={clsx("text-slate-400", className)} />;
};

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};

const FilesPage = ({ currentPath, onNavigate, rootPath }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  const fetchContent = (path) => {
      setLoading(true);
      if (window.electronAPI) {
        window.electronAPI.listContent(path)
          .then(result => {
             const sorted = result.sort((a, b) => {
                 if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                 return a.isDirectory ? -1 : 1;
             });
             setItems(sorted);
             setLoading(false);
          })
          .catch(err => {
            console.error("Failed to load content", err);
            setLoading(false);
          });
      } else {
       
      }
  };

  useEffect(() => {
    fetchContent(currentPath);
    setSelectedItems(new Set());
  }, [currentPath]);

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onSyncProgress) {
        const cleanup = window.electronAPI.onSyncProgress((data) => {
            if (data.type === 'complete' || data.type === 'error') {
                // Stop spinner, show summary
                setSyncStatus({ ...data, active: false });
                // Refresh file list and auto-dismiss after 4s
                fetchContent(currentPath);
                setTimeout(() => setSyncStatus(null), 4000);
            } else {
                setSyncStatus({ ...data, active: true });
            }
        });
        return cleanup;
    }
  }, []);

  useEffect(() => {
      if (window.electronAPI) {
          const cleanup = window.electronAPI.onDownloadProgress((data) => {
               setDownloadInfo({
                   filename: data.filename,
                   progress: Math.round(data.progress),
                   status: data.progress >= 100 ? 'completed' : 'downloading',
                   total: data.total
               });
               
               if (data.progress >= 100) {
                   setTimeout(() => {
                       setDownloadInfo(null);
                       fetchContent(currentPath); // Refresh list
                   }, 2000);
               }
          });
          return cleanup;
      }
  }, [currentPath]);

  const handleItemClick = (item) => {
      if (item.isDirectory) {
          const separator = currentPath.endsWith('/') ? '' : '/';
          onNavigate(`${currentPath}${separator}${item.name}`);
      } else {
          toggleSelect(item.name);
      }
  };

  const toggleSelect = (name) => {
      const newSelected = new Set(selectedItems);
      if (newSelected.has(name)) {
          newSelected.delete(name);
      } else {
          newSelected.add(name);
      }
      setSelectedItems(newSelected);
  };

  const handleUpload = async (isDirectory) => {
    if (!window.electronAPI) return;

    let items = [];
    try {
        if (isDirectory) {
            items = await window.electronAPI.selectFolderForUpload();
        } else {
            items = await window.electronAPI.selectFileForUpload();
        }
    } catch (err) {
        console.error("Selection cancelled or failed", err);
        return;
    }

    if (!items || items.length === 0) return;

    let zip = false;
    if (isDirectory) {
        // Simple confirm dialog
        zip = window.confirm("Do you want to zip this folder before uploading?");
    }

    try {
        // Call backend via preload
        const results = await window.electronAPI.uploadItems(items, currentPath, zip);
        console.log('Upload Results:', results);
        fetchContent(currentPath);
    } catch (error) {
        console.error('Upload failed:', error);
    }
  };

  const handleSync = async () => {
    if (window.electronAPI) {
        setLoading(true);
        try {
            const result = await window.electronAPI.syncS3(currentPath);
            console.log('Sync Result:', result);
            if(result.success) {
                // Could show a toast here
            }
            fetchContent(currentPath);
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setLoading(false);
        }
    }
  };

  const toggleSelectAll = () => {
      if (selectedItems.size === items.length) {
          setSelectedItems(new Set());
      } else {
          setSelectedItems(new Set(items.map(i => i.name)));
      }
  };

  const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const files = Array.from(e.dataTransfer.files).map(f => f.path);
      if (files.length > 0 && window.electronAPI) {
          setLoading(true);
          try {
              const results = await window.electronAPI.handleFileDrop(files, currentPath);
              console.log('Drop results:', results);
              fetchContent(currentPath); // Refresh
          } catch (error) {
              console.error('File drop error:', error);
          } finally {
              setLoading(false);
          }
      }
  };

  const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
  };

  return (
    <div 
        className="h-full flex flex-col bg-white text-slate-900 absolute inset-0"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
    >
      
      {/* Minimal Toolbar (View Toggle & Selection Actions only) */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white z-10 sticky top-0">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-500">
                    {items.length} items
                </span>

                {/* Refresh Button */}
                <button
                  onClick={() => fetchContent(currentPath)}
                  disabled={loading}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors ml-2 disabled:opacity-50"
                  title="Refresh"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                
                {/* Sync Button */}
                <button 
                  onClick={() => handleSync()}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md text-xs font-medium transition-colors ml-2 disabled:opacity-50"
                  title="Sync with S3"
                >
                    <Cloud size={14} />
                    Sync
                </button>

                {/* Upload Buttons */}
                <div className="flex items-center gap-2 ml-2">
                    <button 
                        onClick={() => handleUpload(false)}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-md text-xs font-medium transition-colors border border-slate-200"
                    >
                        <FileText size={14} />
                        Upload File
                    </button>
                    <button 
                        onClick={() => handleUpload(true)}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-md text-xs font-medium transition-colors border border-slate-200"
                    >
                        <Folder size={14} />
                        Upload Folder
                    </button>
                </div>

                {selectedItems.size > 0 && (
                    <>
                        <div className="w-px h-4 bg-slate-300 mx-1" />
                        <span className="text-sm font-medium text-blue-600">
                            {selectedItems.size} selected
                        </span>
                        <div className="flex items-center gap-1 ml-2">
                             <button className="p-1 hover:bg-slate-100 rounded text-slate-500" title="Download">
                                <Download size={16} />
                             </button>
                             <button className="p-1 hover:bg-slate-100 rounded text-red-500" title="Delete">
                                <Trash2 size={16} />
                             </button>
                        </div>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                    <button
                        onClick={() => setViewMode('list')}
                        className={clsx(
                            "p-1.5 rounded-md transition-all flex items-center justify-center",
                            viewMode === 'list' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                        title="List View"
                    >
                        <List size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={clsx(
                            "p-1.5 rounded-md transition-all flex items-center justify-center",
                            viewMode === 'grid' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        )}
                        title="Grid View"
                    >
                        <Grid3X3 size={16} />
                    </button>
                  </div>
            </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {loading ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
                <p>Loading contents...</p>
            </div>
        ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Cloud size={64} className="mb-4 opacity-20" />
                <p className="text-lg font-medium text-slate-600">Folder is empty</p>
                <div 
                    className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() => fetchContent(currentPath)}
                >
                    Refresh
                </div>
            </div>
        ) : (
            <>
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-10">
                        {items.map((item, i) => (
                            <div 
                                key={i}
                                onClick={() => handleItemClick(item)}
                                className={clsx(
                                    "group p-4 bg-white border rounded-xl cursor-pointer transition-all hover:bg-slate-50 hover:shadow-md flex flex-col gap-3 relative select-none",
                                    selectedItems.has(item.name) ? "border-blue-500 ring-1 ring-blue-500/50 bg-blue-50/50" : "border-slate-200 hover:border-slate-300"
                                )}
                            >
                                <div className="flex justify-between items-start pointer-events-none">
                                    <div className={clsx(
                                        "p-3 rounded-xl border transition-colors",
                                        item.isDirectory ? "bg-blue-50 border-blue-100 text-blue-600" : "bg-white border-slate-100 text-slate-500"
                                    )}>
                                        <FileIcon name={item.name} isDirectory={item.isDirectory} size={28} />
                                    </div>
                                    <div className="pointer-events-auto" onClick={(e) => { e.stopPropagation(); toggleSelect(item.name); }}>
                                        <div className={clsx(
                                            "w-5 h-5 rounded border flex items-center justify-center transition-all",
                                            selectedItems.has(item.name) 
                                                ? "bg-blue-500 border-blue-500 text-white" 
                                                : "border-slate-300 bg-white opacity-0 group-hover:opacity-100 hover:border-blue-400"
                                        )}>
                                            {selectedItems.has(item.name) && <CheckCircle2 size={12} />}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="font-medium text-slate-700 text-sm truncate" title={item.name}>{item.name}</p>
                                    <p className="text-[10px] text-slate-400 mt-1 font-medium">
                                        {item.isDirectory ? 'Folder' : formatBytes(item.size || 0)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm mb-10">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200 font-medium">
                                <tr>
                                    <th className="w-10 px-4 py-3">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedItems.size === items.length && items.length > 0}
                                            onChange={toggleSelectAll}
                                            className="w-3.5 h-3.5 rounded border-slate-300 bg-white checked:bg-blue-500 cursor-pointer"
                                        />
                                    </th>
                                    <th className="px-4 py-3 font-medium">Name</th>
                                    <th className="px-4 py-3 font-medium hidden md:table-cell">Size</th>
                                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Modified</th>
                                    <th className="px-4 py-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, i) => (
                                    <tr 
                                        key={i} 
                                        onClick={() => handleItemClick(item)}
                                        className={clsx(
                                            "group transition-colors cursor-pointer select-none",
                                            selectedItems.has(item.name) ? "bg-blue-50/50 hover:bg-blue-100/50" : "hover:bg-slate-50"
                                        )}
                                    >
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedItems.has(item.name)}
                                                onChange={() => toggleSelect(item.name)}
                                                className="w-3.5 h-3.5 rounded border-slate-300 bg-white checked:bg-blue-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <FileIcon name={item.name} isDirectory={item.isDirectory} size={18} />
                                                <span className={clsx("font-medium truncate", selectedItems.has(item.name) ? "text-blue-700" : "text-slate-700")}>
                                                    {item.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                                            {item.isDirectory ? '--' : formatBytes(item.size || 0)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                                            {item.date || 'Today'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button className="p-1 text-slate-400 hover:text-slate-900 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreVertical size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </>
        )}
      </div>

      {/* Download Progress Dialog */}
      {downloadInfo && (
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-5 duration-300 z-50">
            {/* Same as before... */}
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    {downloadInfo.status === 'downloading' || downloadInfo.status === 'starting' ? (
                        <Loader2 size={14} className="animate-spin text-blue-600" />
                    ) : downloadInfo.status === 'completed' ? (
                        <CheckCircle2 size={14} className="text-green-600" />
                    ) : (
                        <X size={14} className="text-red-600" />
                    )}
                    {downloadInfo.status === 'completed' ? 'Download Complete' : 'Downloading...'}
                </h3>
                {downloadInfo.status === 'completed' && (
                    <button onClick={() => setDownloadInfo(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={14} />
                    </button>
                )}
            </div>
            <div className="p-3">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                        <FileText size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate text-xs">{downloadInfo.filename}</p>
                        <p className="text-[10px] text-slate-500">
                            {downloadInfo.status === 'starting' ? 'Connecting...' : 
                             `${downloadInfo.progress}% • ${downloadInfo.total ? formatBytes(downloadInfo.total) : ''}`}
                        </p>
                    </div>
                </div>
                
                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                    <div 
                        className={clsx(
                            "h-full transition-all duration-300",
                            downloadInfo.status === 'completed' ? "bg-green-500" : 
                            downloadInfo.status === 'error' ? "bg-red-500" : "bg-blue-600"
                        )}
                        style={{ width: `${downloadInfo.progress}%` }}
                    />
                </div>
            </div>
        </div>
      )}

      {/* Sync Progress Toast */}
      {syncStatus && (
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50" style={{animation: 'slideUp 0.3s ease'}}>
          <div className={clsx(
            "p-3 border-b border-slate-100 flex justify-between items-center",
            syncStatus.type === 'upload' ? 'bg-purple-50/60' :
            syncStatus.type === 'download' ? 'bg-emerald-50/60' :
            syncStatus.type === 'complete' ? 'bg-green-50/60' :
            syncStatus.type === 'error' ? 'bg-red-50/60' : 'bg-slate-50/60'
          )}>
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              {syncStatus.active ? (
                <Loader2 size={14} className={clsx(
                  'animate-spin',
                  syncStatus.type === 'upload' ? 'text-purple-600' : 'text-emerald-600'
                )} />
              ) : syncStatus.type === 'error' ? (
                <X size={14} className="text-red-500" />
              ) : (
                <CheckCircle2 size={14} className="text-green-600" />
              )}
              {syncStatus.type === 'upload' ? 'Uploading to S3...' :
               syncStatus.type === 'download' ? 'Downloading from S3...' :
               syncStatus.type === 'complete' ? 'Sync Complete' :
               syncStatus.type === 'error' ? 'Sync Error' : 'Syncing...'}
            </h3>
            {!syncStatus.active && (
              <button onClick={() => setSyncStatus(null)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="p-3">
            {/* Upload row */}
            {syncStatus.type === 'upload' && (
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate text-xs">{syncStatus.filename}</p>
                  <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">Uploading</p>
                </div>
              </div>
            )}

            {/* Download row */}
            {syncStatus.type === 'download' && (
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate text-xs">{syncStatus.filename}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">Downloading</p>
                </div>
              </div>
            )}

            {/* Info / Complete / Error */}
            {(syncStatus.type === 'info' || syncStatus.type === 'complete' || syncStatus.type === 'error') && (
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'p-1.5 rounded-lg flex-shrink-0',
                  syncStatus.type === 'complete' ? 'bg-green-100 text-green-600' :
                  syncStatus.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                )}>
                  <Cloud size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-xs">{syncStatus.message || 'Processing...'}</p>
                  {syncStatus.type === 'complete' && (
                    <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider">Complete</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default FilesPage;
