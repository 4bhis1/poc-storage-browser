import React from 'react';
import { Home, HardDrive, Clock, Star, Trash, Settings } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="w-64 bg-slate-50 flex flex-col h-full shrink-0">
            <div className="p-3 px-3 space-y-1 mt-2">
                <button
                    onClick={() => navigate('/')}
                    className={`flex items-center w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                        location.pathname === '/' || location.pathname.startsWith('/files')
                            ? 'bg-blue-100/70 text-blue-900'
                            : 'text-slate-700 hover:bg-[#e8ebf0] hover:text-slate-900'
                    }`}
                >
                    <Home className="h-[18px] w-[18px] mr-4" strokeWidth={2} />
                    Home
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
