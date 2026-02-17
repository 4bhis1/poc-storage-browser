
import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon,
  Music,
  Video,
  MoreVertical, 
  Grid3X3, 
  List, 
  ChevronRight, 
  ArrowLeft,
  Search,
  Plus,
  Cloud,
  RefreshCw,
  HardDrive,
  Download,
  Upload,
  Trash2,
  Copy,
  Settings,
  CheckCircle2,
  ArrowUpDown,
  X,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useSystem } from '../contexts/SystemContext';

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

const FilesPage = ({ rootPath }) => {
  const { syncState, syncProgress } = useSystem();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(rootPath || '/home/abhishek/demo');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [syncMode, setSyncMode] = useState('two-way'); // 'one-way' | 'two-way'
  const [downloadInfo, setDownloadInfo] = useState(null);

  useEffect(() => {
    if (rootPath) setCurrentPath(rootPath);
  }, [rootPath]);

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
        // Mock Data simulation
        setTimeout(() => {
            setItems([
                { name: 'Documents', isDirectory: true, size: 0, date: '2024-02-10' },
                { name: 'Images', isDirectory: true, size: 0, date: '2024-02-11' },
                { name: 'Work', isDirectory: true, size: 0, date: '2024-02-12' },
                { name: 'Project_Specs.pdf', isDirectory: false, size: 2400000, date: '2024-02-15' },
                { name: 'budget_2024.xlsx', isDirectory: false, size: 15000, date: '2024-02-14' },
                { name: 'vacation.jpg', isDirectory: false, size: 4500000, date: '2024-01-20' },
                { name: 'intro.mp4', isDirectory: false, size: 156000000, date: '2023-12-25' },
                { name: 'notes.txt', isDirectory: false, size: 1024, date: '2024-02-16' },
            ]);
            setLoading(false);
        }, 500);
      }
  };

  useEffect(() => {
    fetchContent(currentPath);
    setSelectedItems(new Set());
  }, [currentPath]);

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
          return cleanup; // Assuming preload returns cleanup function or just ignore
      }
  }, [currentPath]);

  const handleSync = async () => {
      const url = "https://stx-chatbot-web-ui-v3-uat-a2b8c9d1.s3.ap-south-1.amazonaws.com/index.html";
      try {
          setDownloadInfo({ filename: 'index.html', progress: 0, status: 'starting', total: 0 });
          if (window.electronAPI) {
            await window.electronAPI.downloadFile(url, currentPath);
          } else {
              alert("Download feature only available in Electron app");
              setDownloadInfo(null);
          }
      } catch (error) {
          console.error("Download failed", error);
          setDownloadInfo({ filename: 'Download Failed', progress: 0, status: 'error', total: 0 });
          setTimeout(() => setDownloadInfo(null), 3000);
      }
  };

  const handleNavigate = (path) => {
      setCurrentPath(path);
  };

  const navigateUp = () => {
      if (currentPath === rootPath) return;
      const lastSlashIndex = currentPath.lastIndexOf('/');
      if (lastSlashIndex > 0) {
          const parent = currentPath.substring(0, lastSlashIndex);
          if (parent.length >= rootPath.length) {
              handleNavigate(parent);
          } else {
              handleNavigate(rootPath);
          }
      } else {
           handleNavigate(rootPath);
      }
  };

  const handleItemClick = (item) => {
      if (item.isDirectory) {
          const separator = currentPath === '/' ? '' : '/';
          handleNavigate(`${currentPath}${separator}${item.name}`);
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

  const toggleSelectAll = () => {
      if (selectedItems.size === items.length) {
          setSelectedItems(new Set());
      } else {
          setSelectedItems(new Set(items.map(i => i.name)));
      }
  };

  // Breadcrumbs Generator
  const getBreadcrumbs = () => {
      const parts = currentPath.split('/').filter(p => p);
      return (
          <nav className="flex items-center gap-1 text-sm text-slate-500 overflow-hidden">
             <button onClick={() => handleNavigate(rootPath)} className="hover:text-slate-900 px-1 transition-colors font-medium">Root</button>
             {parts.map((part, index) => {
                 const path = '/' + parts.slice(0, index + 1).join('/');
                 const isClickable = path.startsWith(rootPath);
                 
                 if (!isClickable && path !== rootPath) return null;
                 
                 return (
                    <React.Fragment key={path}>
                        <ChevronRight size={14} className="text-slate-400" />
                        <button 
                            onClick={() => path.length >= rootPath.length && handleNavigate(path)}
                            className={clsx(
                                "px-1 transition-colors truncate max-w-[150px]",
                                index === parts.length - 1 ? "font-medium text-slate-900" : "hover:text-slate-900",
                                path.length < rootPath.length && "opacity-50 cursor-default hover:text-slate-500"
                            )}
                        >
                            {part}
                        </button>
                    </React.Fragment>
                 );
             })}
          </nav>
      );
  };

  return (
    <div className="h-full flex flex-col bg-white text-slate-900 animate-in fade-in zoom-in-95 duration-300">
      
      {/* 1. Top Toolbar */}
      <div className="flex flex-col gap-4 p-6 pb-2 border-b border-slate-200 bg-white sticky top-0 z-10">
          
          {/* Breadcrumbs & Actions Row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <button 
                    onClick={navigateUp}
                    disabled={currentPath === rootPath}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                {getBreadcrumbs()}
              </div>

              <div className="flex items-center gap-3">
                  {/* View Toggle */}
                  <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setViewMode('list')}
                        className={clsx(
                            "p-1.5 rounded-md transition-all flex items-center justify-center",
                            viewMode === 'list' ? "bg-slate-100 text-slate-900 shadow-sm font-medium" : "text-slate-400 hover:text-slate-600"
                        )}
                        title="List View"
                    >
                        <List size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={clsx(
                            "p-1.5 rounded-md transition-all flex items-center justify-center",
                            viewMode === 'grid' ? "bg-slate-100 text-slate-900 shadow-sm font-medium" : "text-slate-400 hover:text-slate-600"
                        )}
                        title="Grid View"
                    >
                        <Grid3X3 size={16} />
                    </button>
                  </div>

                  <button 
                      onClick={handleSync}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                      <RefreshCw size={16} className={downloadInfo ? "animate-spin" : ""} />
                      <span>Sync</span>
                  </button>

                  <button 
                      onClick={() => fetchContent(currentPath)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-md shadow-blue-500/20"
                  >
                      <Plus size={16} />
                      <span>Upload</span>
                  </button>
              </div>
          </div>
          
          {/* Selected Action Bar */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-3 text-sm animate-in slide-in-from-top-1 bg-blue-50 p-2 rounded-lg border border-blue-100">
              <span className="text-blue-700 font-medium px-2">
                {selectedItems.size} selected
              </span>
              <div className="h-4 w-px bg-blue-200" />
              <button 
                className="flex items-center gap-1.5 px-3 py-1 hover:bg-blue-100 rounded text-blue-700 transition-colors"
                onClick={() => alert(`Downloading ${selectedItems.size} files...`)}
              >
                <Download size={14} /> Download
              </button>
              <button 
                className="flex items-center gap-1.5 px-3 py-1 hover:bg-red-100 rounded text-red-600 transition-colors"
                onClick={() => { setSelectedItems(new Set()); alert('Deleted files'); }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
      </div>

      {/* Sync Banner Progress */}
      {syncState.status === 'syncing' && (
         <div className="bg-white border-b border-indigo-100 p-3 flex items-center gap-4 px-6">
             <div className="p-1.5 bg-indigo-50 rounded-full animate-spin">
                <RefreshCw size={14} className="text-indigo-600" />
             </div>
             <div className="flex-1 max-w-2xl">
                <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-indigo-900 font-medium">Syncing changes to S3...</span>
                    <span className="text-indigo-600">{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" 
                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }} 
                    />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">{syncProgress.filename}</p>
             </div>
         </div>
      )}

      {/* 2. Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {loading ? (
             <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <div className="w-8 h-8 border-2 border-blue-500/50 border-t-blue-500 rounded-full animate-spin mb-4" />
                <p>Loading contents...</p>
            </div>
        ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <Cloud size={64} className="mb-4 opacity-20" />
                <p className="text-lg font-medium text-slate-600">Folder is empty</p>
                <p className="text-sm opacity-50">Drag and drop files to upload</p>
            </div>
        ) : (
            <>
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {items.map((item, i) => (
                            <div 
                                key={i}
                                onClick={() => handleItemClick(item)}
                                className={clsx(
                                    "group p-4 bg-white border rounded-xl cursor-pointer transition-all hover:bg-slate-50 hover:shadow-md flex flex-col gap-3 relative",
                                    selectedItems.has(item.name) ? "border-blue-500 ring-1 ring-blue-500/50 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                                )}
                            >
                                <div className="flex justify-between items-start">
                                    <div className={clsx(
                                        "p-2.5 rounded-lg border",
                                        item.isDirectory ? "bg-blue-50 border-blue-100" : "bg-white border-slate-100"
                                    )}>
                                        <FileIcon name={item.name} isDirectory={item.isDirectory} size={24} />
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedItems.has(item.name)}
                                        onChange={() => toggleSelect(item.name)}
                                        className={clsx(
                                            "w-4 h-4 rounded border-slate-300 bg-white checked:bg-blue-500 transition-opacity cursor-pointer",
                                            selectedItems.has(item.name) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div>
                                    <p className="font-medium text-slate-700 text-sm truncate" title={item.name}>{item.name}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {item.isDirectory ? 'Folder' : formatBytes(item.size || 0)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
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
                                            "group transition-colors cursor-pointer",
                                            selectedItems.has(item.name) ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50"
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
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        {downloadInfo.status === 'downloading' || downloadInfo.status === 'starting' ? (
                            <Loader2 size={18} className="animate-spin text-blue-600" />
                        ) : downloadInfo.status === 'completed' ? (
                            <CheckCircle2 size={18} className="text-green-600" />
                        ) : (
                            <X size={18} className="text-red-600" />
                        )}
                        {downloadInfo.status === 'completed' ? 'Download Complete' : 'Downloading File'}
                    </h3>
                    {downloadInfo.status === 'completed' && (
                        <button onClick={() => setDownloadInfo(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={16} />
                        </button>
                    )}
                </div>
                <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FileText size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">{downloadInfo.filename}</p>
                            <p className="text-xs text-slate-500">
                                {downloadInfo.status === 'starting' ? 'Connecting...' : 
                                 downloadInfo.status === 'error' ? 'Failed' : 
                                 `${downloadInfo.progress}% • ${downloadInfo.total ? formatBytes(downloadInfo.total) : 'Unknown size'}`}
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
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
        </div>
      )}

    </div>
  );
};

export default FilesPage;
