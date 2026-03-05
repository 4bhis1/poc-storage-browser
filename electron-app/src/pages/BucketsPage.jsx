import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Globe, HardDrive, Lock, RefreshCw, FolderOpen, MoreHorizontal, Settings, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable } from '../components/ui/data-table';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';

const storageClassColors = {
  STANDARD:    "bg-emerald-500/10 text-emerald-600",
  STANDARD_IA: "bg-blue-500/10 text-blue-600",
  GLACIER:     "bg-cyan-500/10 text-cyan-600",
  DEEP_ARCHIVE:"bg-purple-500/10 text-purple-600",
};

const storageClassLabels = {
  STANDARD:    "Standard",
  STANDARD_IA: "Infrequent Access",
  GLACIER:     "Glacier",
  DEEP_ARCHIVE:"Deep Archive",
};

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

const formatDate = (dateString) => {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function BucketsPage() {
  const navigate = useNavigate();
  const [buckets, setBuckets] = useState([]);
  const [bucketStats, setBucketStats] = useState({}); // bucketId → { count, size }
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(null);

  const fetchBuckets = async () => {
    setLoading(true);
    try {
      if (!window.electronAPI) { setBuckets([]); setLoading(false); return; }

      // Fetch buckets
      const { rows: bucketRows } = await window.electronAPI.dbQuery(
        'SELECT * FROM "Bucket" ORDER BY "createdAt" DESC', []
      );
      setBuckets(bucketRows || []);

      // Fetch per-bucket file counts and total sizes
      const statsRes = await window.electronAPI.dbQuery(
        `SELECT "bucketId",
                SUM(CASE WHEN "isFolder" = 0 THEN 1 ELSE 0 END) as file_count,
                COALESCE(SUM(CASE WHEN "isFolder" = 0 THEN size ELSE 0 END), 0) as total_size
         FROM "FileObject"
         GROUP BY "bucketId"`,
        []
      );

      const statsMap = {};
      for (const row of (statsRes.rows || [])) {
        statsMap[row.bucketId] = {
          count: parseInt(row.file_count || 0),
          size: parseInt(row.total_size || 0),
        };
      }
      setBucketStats(statsMap);
    } catch (error) {
      console.error('Failed to fetch buckets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (bucketId) => {
    setSyncing(bucketId);
    try {
      if (window.electronAPI?.syncBucketsNow) {
        // Assume global sync for now if specific bucket sync is not available on client
        await window.electronAPI.syncBucketsNow();
      }
    } catch (err) {
      console.error('Failed to sync bucket:', err);
    } finally {
      setSyncing(null);
      fetchBuckets();
    }
  };

  useEffect(() => {
    fetchBuckets();
    const interval = setInterval(fetchBuckets, 10000);
    return () => clearInterval(interval);
  }, []);

  const data = buckets.map(b => {
    const st = bucketStats[b.id] || { count: 0, size: 0 };
    return {
      ...b,
      fileCount: st.count,
      totalSize: st.size,
      maxSize: b.maxSize || 107374182400 // 100GB dummy fallback for UI
    };
  });

  const columns = [
    {
      header: "Bucket Name",
      accessorKey: "name",
      cell: (bucket) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 shrink-0 border border-blue-100">
            <HardDrive className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex flex-col truncate">
            <span className="font-semibold text-slate-900">{bucket.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
              <Globe className="h-3 w-3" />
              <span>{bucket.region}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      header: "Storage Class & Settings",
      accessorKey: "storageClass",
      className: "hidden md:table-cell",
      cell: (bucket) => (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={storageClassColors[bucket.storageClass] || "bg-slate-100 text-slate-700 font-medium"}>
            {storageClassLabels[bucket.storageClass] || bucket.storageClass || 'Standard'}
          </Badge>
          {bucket.encryption && (
            <Badge variant="secondary" className="gap-1 bg-slate-50 text-[10px] py-0 h-5 border border-slate-200 text-slate-600 font-medium tracking-wide shadow-sm">
              <Lock className="h-2.5 w-2.5" /> Encrypted
            </Badge>
          )}
          {bucket.versioning && (
            <Badge variant="secondary" className="gap-1 bg-slate-50 text-[10px] py-0 h-5 border border-slate-200 text-slate-600 font-medium tracking-wide shadow-sm">
              <Shield className="h-2.5 w-2.5" /> Versioned
            </Badge>
          )}
        </div>
      )
    },
    {
      header: "Usage",
      accessorKey: "totalSize",
      cell: (bucket) => {
        const usagePercent = bucket.maxSize ? Math.round((bucket.totalSize / bucket.maxSize) * 100) : 0;
        return (
          <div className="space-y-1.5 w-full min-w-[120px] max-w-[200px]">
             <div className="flex items-center justify-between text-xs">
               <span className="text-slate-500 font-medium">
                 {formatBytes(bucket.totalSize)} of {formatBytes(bucket.maxSize)}
               </span>
               <span className="text-slate-700 font-semibold">{usagePercent}%</span>
             </div>
             <Progress value={usagePercent} className="h-1.5 bg-slate-100" />
          </div>
        );
      }
    },
    {
      header: "Files",
      accessorKey: "fileCount",
      className: "hidden lg:table-cell text-slate-500 font-medium",
      cell: (bucket) => <span>{(bucket.fileCount || 0).toLocaleString()}</span>
    },
    {
      header: "Created",
      accessorKey: "createdAt",
      className: "hidden lg:table-cell text-slate-500",
      cell: (bucket) => <span className="text-sm font-medium">{formatDate(bucket.createdAt)}</span>
    },
    {
      header: "",
      accessorKey: "actions",
      className: "w-10",
      cell: (bucket) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 focus-visible:ring-0" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-white border-slate-200 shadow-md">
            <DropdownMenuItem asChild className="cursor-pointer text-sm font-medium text-slate-700">
              <Link to={`/files/${bucket.id}`}>
                <FolderOpen className="mr-2 h-4 w-4 text-blue-500" /> Browse Files
              </Link>
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSync(bucket.id); }} disabled={syncing === bucket.id} className="cursor-pointer text-sm font-medium text-slate-700">
              <RefreshCw className={`mr-2 h-4 w-4 text-emerald-500 ${syncing === bucket.id ? 'animate-spin' : ''}`} /> Force Sync Files
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="cursor-pointer text-sm font-medium text-slate-500">
              <Settings className="mr-2 h-4 w-4" /> Edit Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Buckets</h1>
            <p className="text-slate-500 mt-1">
              Manage your synced S3 storage buckets locally.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
          <DataTable
            data={data.filter(b => b.name?.toLowerCase().includes(searchQuery.toLowerCase()))}
            columns={columns}
            searchPlaceholder="Search buckets by name..."
            onSearch={setSearchQuery}
            onRowClick={(bucket) => navigate(`/files/${bucket.id}`)}
            actions={
              <Button variant="outline" size="sm" onClick={fetchBuckets} className="h-9 gap-1.5 font-medium shadow-sm" disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
