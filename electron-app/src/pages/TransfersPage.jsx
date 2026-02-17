
import React from 'react';
import { Database, Cpu, ShieldAlert, FileText, Pause } from 'lucide-react';
import clsx from 'clsx';

const TransfersPage = () => {
    // Mock Data
    const activeTransfers = [
        { id: 1, name: 'Q3_Financial_Raw_Data.csv', size: '4.2 GB', progress: 45, speed: '12 MB/s', parts: '14/32', status: 'uploading', tier: 'Standard' },
        { id: 2, name: 'Project_Alpha_Assets.zip', size: '850 MB', progress: 78, speed: '45 MB/s', parts: '8/10', status: 'uploading', tier: 'Intelligent' },
    ];

    return (
        <div className="space-y-6 h-full flex flex-col bg-slate-50 animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="p-6 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Activity Overview</h1>
                <p className="text-sm text-slate-500 mt-1">Monitor real-time transfers, storage metrics, and system health.</p>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Database size={80} className="text-blue-600" />
                        </div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Storage Used</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">4.2 TB <span className="text-sm text-slate-400 font-normal">/ 10 TB</span></h3>
                        <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-blue-600 h-full w-[42%] rounded-full" />
                        </div>
                    </div>

                    <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Cpu size={80} className="text-purple-600" />
                        </div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Tier Savings</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">$142.50 <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full ml-2">+12%</span></h3>
                        <p className="text-xs text-slate-500 mt-2">via Intelligent Tiering</p>
                    </div>

                    <div className="p-5 rounded-xl bg-white border border-red-100 shadow-sm relative overflow-hidden group hover:shadow-md hover:border-red-200 transition-all">
                        <div className="absolute top-0 right-0 p-3 text-red-600 opacity-5 group-hover:opacity-10 transition-opacity">
                            <ShieldAlert size={80} />
                        </div>
                        <p className="text-red-600 text-xs uppercase tracking-wider font-bold">GuardDuty Threats</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">1 Blocked <span className="text-sm text-slate-500 font-normal">this week</span></h3>
                        <button className="text-xs text-red-600 hover:text-red-700 mt-3 font-medium hover:underline">View details</button>
                    </div>
                </div>

                {/* Active Queue Section */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="text-base font-semibold text-slate-900">Active Queue</h2>
                        <div className="flex gap-2">
                             <button className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
                                Pause All
                            </button>
                             <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200">
                                Prioritize Uploads
                            </button>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 font-medium">File Name</th>
                                    <th className="px-6 py-3 font-medium">Progress (Multipart)</th>
                                    <th className="px-6 py-3 font-medium">Size</th>
                                    <th className="px-6 py-3 font-medium">Est. Cost Tier</th>
                                    <th className="px-6 py-3 font-medium text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activeTransfers.map((file) => (
                                    <tr key={file.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
                                                    <FileText size={18} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900">{file.name}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{file.speed} • Uploading</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 w-1/3">
                                            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                                                <span className="font-medium text-blue-700">{file.progress}%</span>
                                                <span>Chunks: {file.parts}</span>
                                            </div>
                                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex shadow-inner">
                                                <div className="bg-blue-500 h-full w-[45%] rounded-l-full" />
                                                <div className="bg-blue-400 h-full w-[10%] mx-[1px]" />
                                                <div className="bg-transparent h-full w-[5%]" /> 
                                                <div className="bg-blue-200 h-full w-[5%] rounded-r-full" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 font-mono text-xs">{file.size}</td>
                                        <td className="px-6 py-4">
                                            <span className={clsx(
                                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                file.tier === 'Intelligent' 
                                                    ? "bg-purple-50 text-purple-700 border-purple-200" 
                                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                            )}>
                                                {file.tier}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors">
                                                <Pause size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TransfersPage;
