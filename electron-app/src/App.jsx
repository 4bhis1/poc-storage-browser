
import React, { useState, useEffect } from 'react';
import TopBar from './components/TopBar';
import FilesPage from './pages/FilesPage';
import { SystemProvider } from './contexts/SystemContext';

const AppContent = () => {
    // Determine initial root path - strictly hardcoded or could be dynamic
    // I will keep it for now.
    const rootPath = '/home/abhishek/FMS';
    const [currentPath, setCurrentPath] = useState(rootPath);

    // If rootPath changes, reset currentPath (e.g. if we had a settings page to change it, but we removed it. 
    // Keeping it simple).
    
    return (
        <div className="flex flex-col h-screen w-screen bg-white text-slate-900 font-sans selection:bg-blue-100 overflow-hidden">
            {/* Top Navigation Bar with Stats & Breadcrumbs */}
            <TopBar 
                currentPath={currentPath} 
                onNavigate={setCurrentPath} 
                rootPath={rootPath} 
            />

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative">
                <FilesPage 
                    currentPath={currentPath} 
                    onNavigate={setCurrentPath}
                    rootPath={rootPath}
                />
            </div>
        </div>
    );
};

const SidecarUI = () => {
    return (
        <SystemProvider>
            <AppContent />
        </SystemProvider>
    );
};

export default SidecarUI;
