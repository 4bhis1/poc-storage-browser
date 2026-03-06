import React from 'react';
import { BarChart2, HardDrive, Clock, RefreshCw, LayoutGrid, FileUp, Stethoscope } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const navGroups = [
  {
    title: "",
    items: [
      { path: '/', label: 'Dashboard', icon: BarChart2, exact: true },
    ]
  },
  {
    title: "STORAGE",
    items: [
      { path: '/buckets', label: 'Buckets', icon: HardDrive },
      { path: '/explorer', label: 'File Explorer', icon: FileUp },
    ]
  },
  {
    title: "SYNC",
    items: [
      { path: '/sync', label: 'Sync', icon: RefreshCw },
      { path: '/recent', label: 'Recent Activities', icon: Clock },
    ]
  },
  {
    title: "DIAGNOSTICS",
    items: [
      { path: '/doctor', label: 'Doctor', icon: Stethoscope },
    ]
  }
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path, exact) => {
    if (exact) return location.pathname === path;
    if (path === '/buckets') {
      return location.pathname === '/buckets' || location.pathname.startsWith('/files/');
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-64 bg-slate-50 flex flex-col h-full shrink-0 border-r border-slate-200">
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {group.title && (
              <h3 className="px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {group.title}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map(({ path, label, icon: Icon, exact }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex items-center w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group ${
                    isActive(path, exact)
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] mr-3 shrink-0 ${
                    isActive(path, exact) ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'
                  }`} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
