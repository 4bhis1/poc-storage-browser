# Enterprise File Sync - Electron Client

This is a companion Electron application for the Enterprise File Management System. It allows users to select a local directory to watch and "sync" (currently simulates sync by detecting file changes).

## Features

- **Folder Selection**: Choose any local directory to monitor.
- **Real-time Watcher**: Uses `chokidar` to detect file additions, changes, and deletions instantly.
- **Modern UI**: Dark-themed, responsive interface matching the enterprise dashboard aesthetics.
- **Activity Log**: Detailed log of all file system events.

## Setup & Run

1.  Navigate to this directory:

    ```bash
    cd electron-app
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Start the application:
    ```bash
    npm start
    ```

## Development

- **main.js**: Electron main process, handles window creation and file system watching.
- **renderer.js**: Frontend logic for the UI.
- **preload.js**: Secure bridge between main and renderer processes.
- **styles.css**: Custom styling.

## Integration Note

Currently, this client runs in "simulation mode" where it logs file changes locally. To integrate with the main Enterprise File Management system, update `main.js` to send `POST` requests to the Next.js API endpoints (once created).
