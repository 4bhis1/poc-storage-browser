const path = require('path');
const fs = require('fs');

/**
 * Validates that a given path is within the allowed root directory.
 * Prevents directory traversal attacks.
 */
function validatePath(targetPath, rootPath) {
    if (!targetPath || !rootPath) return false;
    
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.resolve(targetPath);
    
    return resolvedTarget.startsWith(resolvedRoot);
}

/**
 * Ensures the root path exists.
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

module.exports = {
    validatePath,
    ensureDirectoryExists
};
