
import React, { useState } from 'react';
import { Activity, FolderSync, ShieldAlert, Settings, HardDrive, Search } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import TransfersPage from './pages/TransfersPage';
import FilesPage from './pages/FilesPage';
import SearchPage from './pages/SearchPage';
import BucketsPage from './pages/BucketsPage';
import SecurityPage from './pages/SecurityPage';
import SettingsPage from './pages/SettingsPage';
import { SystemProvider } from './contexts/SystemContext';
import { AuthProvider } from './contexts/AuthContext';

const AppContent = () => {
    const [activeTab, setActiveTab] = useState('transfers');
    const [view, setView] = useState('dashboard'); 
    const [rootPath, setRootPath] = useState('/home/abhishek/demo');

    const tabs = [
        { id: 'transfers', icon: Activity, label: 'Activity' },
        { id: 'files', icon: FolderSync, label: 'Files' },
        { id: 'buckets', icon: HardDrive, label: 'Buckets' },
        { id: 'search', icon: Search, label: 'Search' },
        { id: 'security', icon: ShieldAlert, label: 'Security', alert: true },
        { id: 'settings', icon: Settings, label: 'Config' }
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'transfers': return <TransfersPage />;
            case 'files': return <FilesPage rootPath={rootPath} />;
            case 'buckets': return <BucketsPage />;
            case 'search': return <SearchPage />;
            case 'security': return <SecurityPage />;
            case 'settings': return <SettingsPage rootPath={rootPath} onUpdateRootPath={setRootPath} />;
            default: return <TransfersPage />;
        }
    };

    return (
        <div className="flex h-screen w-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 overflow-hidden">
            {/* Dashboard View Container - Full Screen Layout */}
            <div className="flex w-full h-full">
                
                <Sidebar 
                    tabs={tabs} 
                    activeTab={activeTab} 
                    onTabChange={setActiveTab} 
                    onViewChange={setView}
                />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-white">
                    
                    {/* Top Navigation Bar with Stats */}
                    <TopBar activeTab={activeTab} />

                    {/* Page Content */}
                    <div className="flex-1 overflow-hidden p-0">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SidecarUI = () => {
    return (
        <SystemProvider>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </SystemProvider>
    );
};


export default SidecarUI;
