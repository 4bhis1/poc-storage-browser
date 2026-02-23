import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Globe, HardDrive, Lock, RefreshCw, Plus, Trash2, FolderOpen, Settings, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

const storageClassColors = {
  STANDARD: "bg-emerald-500/10 text-emerald-600",
  STANDARD_IA: "bg-blue-500/10 text-blue-600",
  GLACIER: "bg-cyan-500/10 text-cyan-600",
  DEEP_ARCHIVE: "bg-purple-500/10 text-purple-600",
};

const storageClassLabels = {
  STANDARD: "Standard",
  STANDARD_IA: "Infrequent Access",
  GLACIER: "Glacier",
  DEEP_ARCHIVE: "Deep Archive",
};

export default function BucketsPage() {
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchBuckets = async () => {
    setLoading(true);
    try {
        if (window.electronAPI) {
            const { rows } = await window.electronAPI.dbQuery('SELECT * FROM "Bucket" ORDER BY "createdAt" DESC');
            setBuckets(rows);
        } else {
            console.warn('Electron API unavailable');
            setBuckets([]);
        }
    } catch (error) {
        console.error('Failed to fetch buckets:', error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuckets();
    const interval = setInterval(fetchBuckets, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString) => {
      const d = new Date(dateString);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const filteredBuckets = buckets.filter(b => b.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-white"> 
      <div className="flex-1 overflow-auto bg-white p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-2xl font-normal text-slate-800 tracking-tight">
                  Home
              </div>
          </div>

          <div className="flex justify-between items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Input
                placeholder="Search buckets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-4">

            <select className="border border-input bg-background px-3 h-10 rounded-md text-sm text-slate-700 w-[200px]">
                <option value="ALL">Filter by Account</option>
            </select>
            <Button variant="outline" size="icon" onClick={fetchBuckets}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            </div>
          </div>

          {filteredBuckets.length === 0 && !loading ? (
              <div className="text-center py-10 text-slate-500">
                  No buckets found locally. Waiting for sync...
              </div>
          ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredBuckets.map((bucket) => (
                    <div key={bucket.id} className="relative group p-0">
                        <Link to={`/files/${bucket.id}`} className="block h-full">
                          <Card className="h-full border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer shadow-sm">
                              <CardHeader className="flex flex-row items-start justify-between pb-2 p-5 w-full">
                                  <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                                          <HardDrive className="h-5 w-5 text-blue-600" />
                                      </div>
                                      <div>
                                          <CardTitle className="text-base font-semibold text-slate-900">
                                              {bucket.name}
                                          </CardTitle>
                                          <div className="flex items-center gap-1.5 mt-0.5 text-slate-500">
                                              <Globe className="h-3 w-3" />
                                              <span className="text-xs">
                                                  {bucket.region}
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              </CardHeader>
                              <CardContent className="p-5 pt-0 space-y-3">
                                  <div className="flex items-center gap-2 text-xs flex-wrap">
                                      <span className={`px-2.5 py-0.5 rounded-full font-medium ${storageClassColors[bucket.storageClass] || "bg-slate-100 text-slate-700"}`}>
                                          {storageClassLabels[bucket.storageClass] || 'Standard'}
                                      </span>
                                      {bucket.encryption && (
                                        <span className="px-2.5 py-0.5 rounded-full font-medium bg-slate-100 flex items-center gap-1 text-slate-700">
                                            <Lock className="h-3 w-3" />
                                            Encrypted
                                        </span>
                                      )}
                                  </div>
                                  <div className="space-y-1.5">
                                      <div className="flex items-center justify-between text-xs">
                                          <span className="text-slate-500">
                                              {bucket.fileCount || 0} files
                                          </span>
                                          <span className="text-slate-700 font-medium">0%</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-blue-500" style={{ width: '0%' }}></div>
                                      </div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                                      <span>1 files</span>
                                      <span>Created {formatDate(bucket.createdAt)}</span>
                                  </div>
                              </CardContent>
                          </Card>
                        </Link>
                    </div>
                ))}
              </div>
          )}
        </div>
      </div>
    </div>
  );
}
