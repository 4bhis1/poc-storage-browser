
import React from 'react';
import { ShieldAlert, FileText, CheckCircle, AlertTriangle } from 'lucide-react';

const SecurityPage = () => {
    return (
        <div className="h-full flex flex-col bg-slate-50 text-slate-900 animate-in fade-in zoom-in-95 duration-300">
             
             {/* Header */}
             <div className="p-6 pb-4 border-b border-slate-200 bg-white sticky top-0 z-10 flex items-center gap-4">
                 <div className="p-2.5 bg-red-50 rounded-lg text-red-600 border border-red-100">
                    <ShieldAlert size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Security Center</h1>
                    <p className="text-sm text-slate-500">Monitor threats and quarantine status.</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Alert Banner */}
                <div className="bg-white border border-red-100 rounded-xl p-6 flex flex-col md:flex-row items-start gap-5 shadow-sm shadow-red-50">
                    <div className="p-3 bg-red-50 rounded-full text-red-600 border border-red-100 shrink-0">
                        <AlertTriangle size={36} />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            Threats Detected
                            <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-200">Critical</span>
                        </h2>
                        <p className="text-slate-500 mt-2 text-sm leading-relaxed max-w-2xl">
                            AWS GuardDuty has flagged files matching known malware signatures. These files have been isolated locally and prevented from uploading to the organization bucket to protect your infrastructure.
                        </p>
                        
                        <div className="flex gap-3 mt-4">
                             <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-red-200">
                                Resolve All Issues
                            </button>
                             <button className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                                View Security Report
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quarantined Items Table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-semibold text-slate-900">Quarantined Items</h3>
                        <div className="flex gap-2 text-xs">
                            <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-600 font-medium shadow-sm">Filter: All</span>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase font-semibold tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 font-medium">File Name</th>
                                    <th className="px-6 py-3 font-medium">Severity</th>
                                    <th className="px-6 py-3 font-medium">Detection Source</th>
                                    <th className="px-6 py-3 font-medium">Path</th>
                                    <th className="px-6 py-3 font-medium text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr className="bg-red-50/30 hover:bg-red-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-red-100 rounded text-red-600">
                                                 <FileText size={16} />
                                            </div>
                                            <span className="font-medium text-slate-900">Malicious_Script.exe</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-red-100 text-red-700 border border-red-200">
                                            High
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">AWS GuardDuty</td>
                                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">/Downloads/Temp/</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-red-600 hover:text-red-800 text-xs font-medium hover:underline">Delete Permanently</button>
                                    </td>
                                </tr>
                                 {/* Safe Item Example */}
                                 <tr className="bg-white hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-slate-100 rounded text-slate-500">
                                                 <FileText size={16} />
                                            </div>
                                            <span className="font-medium text-slate-700">unknown_installer.dmg</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase bg-amber-100 text-amber-700 border border-amber-200">
                                            Medium
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">Heuristic Analysis</td>
                                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">/Downloads/</td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-500 hover:text-slate-700 text-xs font-medium hover:underline">Review</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SecurityPage;
