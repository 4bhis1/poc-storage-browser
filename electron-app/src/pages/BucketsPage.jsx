
import React, { useState } from 'react';
import { 
  HardDrive, 
  Globe, 
  MoreHorizontal, 
  FolderOpen, 
  Settings, 
  Trash2, 
  Lock, 
  Shield, 
  Tag, 
  Plus 
} from 'lucide-react';
import clsx from 'clsx';

// Mock Data (adapted from enterprise-file-management/lib/mock-data.ts)
const mockBuckets = [
  {
    id: "b1",
    name: "prod-assets",
    region: "us-east-1",
    storageClass: "STANDARD",
    fileCount: 12847,
    totalSize: 48000000000,
    maxSize: 100000000000,
    createdAt: "2024-03-15T08:00:00Z",
    versioning: true,
    encryption: true,
    tags: ["production", "primary"],
  },
  {
    id: "b2",
    name: "finance-vault",
    region: "us-east-1",
    storageClass: "STANDARD_IA",
    fileCount: 3421,
    totalSize: 15200000000,
    maxSize: 50000000000,
    createdAt: "2024-06-01T08:00:00Z",
    versioning: true,
    encryption: true,
    tags: ["finance", "compliance"],
  },
  {
    id: "b3",
    name: "media-archive",
    region: "us-west-2",
    storageClass: "GLACIER",
    fileCount: 45230,
    totalSize: 820000000000,
    maxSize: 1000000000000,
    createdAt: "2024-01-10T08:00:00Z",
    versioning: false,
    encryption: true,
    tags: ["media", "archive"],
  },
  {
    id: "b4",
    name: "dev-sandbox",
    region: "eu-west-1",
    storageClass: "STANDARD",
    fileCount: 892,
    totalSize: 2300000000,
    maxSize: 10000000000,
    createdAt: "2025-09-20T08:00:00Z",
    versioning: false,
    encryption: false,
    tags: ["development", "testing"],
  },
  {
    id: "b5",
    name: "compliance-logs",
    region: "us-east-1",
    storageClass: "DEEP_ARCHIVE",
    fileCount: 128400,
    totalSize: 340000000000,
    maxSize: 500000000000,
    createdAt: "2023-11-01T08:00:00Z",
    versioning: true,
    encryption: true,
    tags: ["compliance", "audit", "legal"],
  },
  {
    id: "b6",
    name: "cdn-static",
    region: "us-east-1",
    storageClass: "STANDARD",
    fileCount: 5640,
    totalSize: 8500000000,
    maxSize: 25000000000,
    createdAt: "2024-08-12T08:00:00Z",
    versioning: false,
    encryption: false,
    tags: ["cdn", "static", "public"],
  },
];

const storageClassColors = {
  STANDARD: "bg-emerald-50 text-emerald-700 border-emerald-200",
  STANDARD_IA: "bg-blue-50 text-blue-700 border-blue-200",
  GLACIER: "bg-cyan-50 text-cyan-700 border-cyan-200",
  DEEP_ARCHIVE: "bg-purple-50 text-purple-700 border-purple-200",
};

const storageClassLabels = {
  STANDARD: "Standard",
  STANDARD_IA: "Infrequent Access",
  GLACIER: "Glacier",
  DEEP_ARCHIVE: "Deep Archive",
};

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

const BucketsPage = () => {
    const [createModalOpen, setCreateModalOpen] = useState(false);

    return (
        <div className="h-full flex flex-col bg-slate-50 text-slate-900 animate-in fade-in zoom-in-95 duration-300">
             {/* Header Section */}
             <div className="p-6 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10 flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Buckets</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Manage your S3 storage buckets and configurations.
                    </p>
                </div>
                <button 
                    onClick={() => setCreateModalOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Plus size={16} />
                    Create Bucket
                </button>
             </div>

             {/* Content Area */}
             <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {mockBuckets.map((bucket) => {
                        const usagePercent = Math.round((bucket.totalSize / bucket.maxSize) * 100);
                        
                        return (
                            <div key={bucket.id} className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
                                {/* Card Header */}
                                <div className="p-5 pb-3 flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-100">
                                            <HardDrive className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-900">{bucket.name}</h3>
                                            <div className="flex items-center gap-1.5 mt-0.5 text-slate-500">
                                                <Globe className="h-3 w-3" />
                                                <span className="text-xs">{bucket.region}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                                        <MoreHorizontal size={18} />
                                    </button>
                                </div>

                                {/* Card Content */}
                                <div className="p-5 pt-0 space-y-4 flex-1">
                                    {/* Badges */}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border", storageClassColors[bucket.storageClass])}>
                                            {storageClassLabels[bucket.storageClass]}
                                        </span>
                                        {bucket.encryption && (
                                            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                <Lock size={10} /> Encrypted
                                            </span>
                                        )}
                                        {bucket.versioning && (
                                            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                <Shield size={10} /> Versioned
                                            </span>
                                        )}
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-500">
                                                {formatBytes(bucket.totalSize)} of {formatBytes(bucket.maxSize)}
                                            </span>
                                            <span className="font-medium text-slate-700">{usagePercent}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className={clsx("h-full rounded-full transition-all duration-500", 
                                                    usagePercent > 90 ? "bg-red-500" :
                                                    usagePercent > 75 ? "bg-amber-500" : "bg-blue-600"
                                                )} 
                                                style={{ width: `${usagePercent}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Footer Info */}
                                    <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-50 mt-auto">
                                        <span>{bucket.fileCount.toLocaleString()} files</span>
                                        <span>Created {formatDate(bucket.createdAt)}</span>
                                    </div>
                                    
                                    {/* Tags */}
                                    {bucket.tags.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                            <Tag className="h-3 w-3 text-slate-400" />
                                            {bucket.tags.map(tag => (
                                                <span key={tag} className="text-[10px] px-1.5 py-0 rounded border border-slate-200 text-slate-500 bg-slate-50">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
             </div>

             {/* Simple Create Bucket Modal Overlay */}
             {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 pb-4 border-b border-slate-100">
                            <h2 className="text-lg font-semibold text-slate-900">Create New Bucket</h2>
                            <p className="text-sm text-slate-500 mt-1">Configure a new S3 bucket for your organization.</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Bucket Name</label>
                                <input type="text" placeholder="my-bucket-name" className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Region</label>
                                <select className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white">
                                    <option value="us-east-1">US East (N. Virginia)</option>
                                    <option value="us-west-2">US West (Oregon)</option>
                                    <option value="eu-west-1">EU (Ireland)</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <button 
                                    onClick={() => setCreateModalOpen(false)}
                                    className="px-4 py-2 border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => { alert('Bucket Created!'); setCreateModalOpen(false); }}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors"
                                >
                                    Create Bucket
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
             )}
        </div>
    );
};

export default BucketsPage;
