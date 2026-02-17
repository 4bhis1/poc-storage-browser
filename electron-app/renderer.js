const selectBtn = document.getElementById('select-folder-btn');
const setupSection = document.getElementById('setup-section');
const dashboardSection = document.getElementById('dashboard-section');
const syncStatus = document.getElementById('sync-status');
const logsList = document.getElementById('logs-list');
const fileCountEl = document.getElementById('file-count');
const lastSyncEl = document.getElementById('last-sync');
const clearLogsBtn = document.getElementById('clear-logs');

let fileCounter = 0;

selectBtn.addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
        startSyncing(folderPath);
    }
});

clearLogsBtn.addEventListener('click', () => {
    logsList.innerHTML = '';
});

async function startSyncing(path) {
    // Update UI
    setupSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    syncStatus.innerText = 'Syncing Active';
    syncStatus.classList.add('active');

    // Start sync process
    await window.electronAPI.startSync(path);
    
    addLogEntry('System', `Started watching folder: ${path}`, 'system');
}

function addLogEntry(type, message, status = 'added') {
    const item = document.createElement('div');
    item.className = `log-item ${status}`;
    
    let icon = '';
    if (status === 'added') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
    else if (status === 'changed') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    else if (status === 'removed') icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>';
    else icon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

    item.innerHTML = `
        <div class="log-icon">${icon}</div>
        <div class="log-content">
            <div style="font-weight:500; margin-bottom: 2px;">${type === 'file' ? 'File Change detected' : type}</div>
            <div class="log-path">${message}</div>
            <div class="log-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    
    logsList.prepend(item);
    
    // Update stats
    lastSyncEl.innerText = new Date().toLocaleTimeString();
}

window.electronAPI.onFileAdded((path) => {
    fileCounter++;
    fileCountEl.innerText = fileCounter;
    addLogEntry('File Added', path, 'added');
});

window.electronAPI.onFileChanged((path) => {
    addLogEntry('File Changed', path, 'changed');
});

window.electronAPI.onFileRemoved((path) => {
    // fileCounter--; // Depending on logic
    addLogEntry('File Removed', path, 'removed');
});

window.electronAPI.onDirAdded((path) => {
    addLogEntry('Directory Added', path, 'added');
});

window.electronAPI.onDirRemoved((path) => {
    addLogEntry('Directory Removed', path, 'removed');
});

window.electronAPI.onError((msg) => {
    addLogEntry('Error', msg, 'removed');
});
