import React, { createContext, useContext, useState, useEffect } from 'react';

const SystemContext = createContext();

export const useSystem = () => useContext(SystemContext);

export const SystemProvider = ({ children }) => {
    const [networkStats, setNetworkStats] = useState({ up: 0, down: 0 });
    const [diskStats, setDiskStats] = useState(null);
    const [syncState, setSyncState] = useState({ status: 'idle', message: 'All files synced' }); // status: idle, syncing, error
    const [syncProgress, setSyncProgress] = useState({ total: 0, current: 0, filename: '' });

    useEffect(() => {
        // Mock data for browser development if electronAPI is not available
        if (!window.electronAPI) {
            console.warn('Electron API not found, using mock data');
            const interval = setInterval(() => {
                setNetworkStats({
                    up: Math.random() * 1024 * 1024 * 5, // Random up to 5MB/s
                    down: Math.random() * 1024 * 1024 * 20 // Random up to 20MB/s
                });
                setDiskStats({
                    total: 1024 * 1024 * 1024 * 500, // 500GB
                    used: 1024 * 1024 * 1024 * 350, // 350GB
                    available: 1024 * 1024 * 1024 * 150, // 150GB
                    mount: '/',
                    use_percent: 70
                });
            }, 2000);

            // Mock Sync Progress
            let progress = 0;
            const syncInterval = setInterval(() => {
                progress += 10;
                if (progress > 100) {
                    progress = 0;
                    setSyncState({ status: 'idle', message: 'All files synced' });
                    setSyncProgress({ total: 100, current: 0, filename: '' });
                } else if (progress < 100 && progress > 0) {
                     setSyncState({ status: 'syncing', message: 'Syncing files...' });
                     setSyncProgress({ 
                        total: 100, 
                        current: progress, 
                        filename: `backup_file_${Math.floor(Math.random() * 100)}.dat` 
                     });
                }
            }, 1000);

            return () => {
                clearInterval(interval);
                clearInterval(syncInterval);
            };
        }

        // Real Electron API listeners
        const cleanupNetwork = window.electronAPI.onNetworkStats((stats) => {
            setNetworkStats({
                up: stats.tx_sec,
                down: stats.rx_sec
            });
        });

        const cleanupDisk = window.electronAPI.onDiskStats((stats) => {
            setDiskStats(stats);
        });

        // Cleanup function isn't strictly returned by onNetworkStats/onDiskStats in current preload implementation
        // so we rely on the component unmounting which rarely happens for the root provider.
        // Ideally we'd implement removeListener in preload.
        
        return () => {
            // Cleanup logic if implemented
        };
    }, []);

    return (
        <SystemContext.Provider value={{ networkStats, diskStats, syncState, syncProgress }}>
            {children}
        </SystemContext.Provider>
    );
};
