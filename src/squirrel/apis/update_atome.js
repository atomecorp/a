/**
 * Atome/Squirrel Core Updater API
 * 
 * Core update system from GitHub
 * Source: https://github.com/atomecorp/a/tree/main/src
 * 
 * @module update_atome
 */

const AtomeUpdater = (function () {
    'use strict';

    // Configuration
    const CONFIG = {
        github: {
            owner: 'atomecorp',
            repo: 'a',
            branch: 'main',
            srcPath: 'src',
            // Use raw.githubusercontent.com to avoid rate limits
            rawBaseUrl: 'https://raw.githubusercontent.com/atomecorp/a/main',
            // API still needed for file listing (but cached)
            apiBaseUrl: 'https://api.github.com/repos/atomecorp/a'
        },
        // Directories to update
        updatePaths: [
            'src/squirrel',
            'src/application/core',
            'src/application/security'
        ],
        // Protected files/directories (do not overwrite)
        protectedPaths: [
            'src/application/examples',
            'src/application/config'
        ],
        // Current version file path (relative to project root)
        versionFile: 'src/version.json',
        // Cache duration for file list (5 minutes)
        cacheDuration: 5 * 60 * 1000
    };

    // Internal state
    let _updateInProgress = false;
    let _lastCheck = null;
    let _fileListCache = null;
    let _fileListCacheTime = 0;
    let _callbacks = {
        onProgress: null,
        onComplete: null,
        onError: null
    };

    /**
     * Detect current platform
     */
    function getPlatform() {
        const isTauri = !!(
            window.__TAURI__ ||
            window.__TAURI_INTERNALS__ ||
            (typeof navigator !== 'undefined' && /tauri/i.test(navigator.userAgent || ''))
        );
        const port = window.location?.port || '';

        return {
            isTauri,
            isServer: !isTauri && (port === '3001' || port === '3000'),
            canWriteFiles: isTauri,
            name: isTauri ? 'Tauri' : 'Server'
        };
    }

    /**
     * Log with prefix
     */
    function log(message, ...args) {
        console.log(`[AtomeUpdater] ${message}`, ...args);
    }

    /**
     * Notify progress
     */
    function notifyProgress(step, progress, message) {
        if (_callbacks.onProgress) {
            _callbacks.onProgress({ step, progress, message });
        }
        log(`${step}: ${message} (${progress}%)`);
    }

    /**
     * Get current version from local file
     */
    async function getCurrentVersion() {
        try {
            // Try multiple possible paths
            const paths = [
                `/version.json`,
                `/src/version.json`,
                `/${CONFIG.versionFile}`
            ];

            for (const path of paths) {
                try {
                    const response = await fetch(`${path}?t=${Date.now()}`);
                    if (response.ok) {
                        const data = await response.json();
                        return {
                            version: data.version || '0.0.0',
                            commit: data.commit || null,
                            updatedAt: data.updatedAt || null
                        };
                    }
                } catch (e) {
                    // Try next path
                }
            }

            // Fallback: version file not found
            log('Version file not found, assuming first install');
            return { version: '0.0.0', commit: null, updatedAt: null };
        } catch (e) {
            log('Could not read version file:', e.message);
            return { version: '0.0.0', commit: null, updatedAt: null };
        }
    }

    /**
     * Get latest commit from main branch
     * Uses raw.githubusercontent.com to avoid rate limits
     */
    async function getLatestCommit() {
        const { rawBaseUrl } = CONFIG.github;

        try {
            // Fetch version.json from raw GitHub (no rate limit)
            const versionUrl = `${rawBaseUrl}/src/version.json?t=${Date.now()}`;
            const response = await fetch(versionUrl);

            if (response.ok) {
                const data = await response.json();
                if (data.commit) {
                    return {
                        sha: data.commit,
                        shortSha: data.commit.substring(0, 7),
                        message: data.message || 'Update available',
                        date: data.updatedAt || new Date().toISOString(),
                        author: data.author || 'atomecorp'
                    };
                }
            }

            // Fallback: try GitHub API with rate limit handling
            return await getLatestCommitFromAPI();

        } catch (error) {
            log('Failed to get latest commit:', error.message);
            throw error;
        }
    }

    /**
     * Fallback: Get latest commit from GitHub API
     */
    async function getLatestCommitFromAPI() {
        const { owner, repo, branch } = CONFIG.github;
        const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'AtomeUpdater/1.0'
            }
        });

        if (!response.ok) {
            if (response.status === 403) {
                const remaining = response.headers.get('X-RateLimit-Remaining');
                const resetTime = response.headers.get('X-RateLimit-Reset');
                const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : null;
                const message = remaining === '0'
                    ? `GitHub rate limit reached. Try again after ${resetDate?.toLocaleTimeString() || '1 hour'}`
                    : 'GitHub access denied (403)';
                throw new Error(message);
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const commit = await response.json();

        return {
            sha: commit.sha,
            shortSha: commit.sha.substring(0, 7),
            message: commit.commit.message.split('\n')[0],
            date: commit.commit.committer.date,
            author: commit.commit.author.name
        };
    }

    /**
     * Compare two versions/commits
     */
    function hasUpdate(current, latest) {
        if (current.commit && latest.sha) {
            return current.commit !== latest.sha;
        }
        return true; // If no local commit, assume update is available
    }

    /**
     * Check if updates are available
     */
    async function checkForUpdates() {
        log('Checking for updates...');

        try {
            const [current, latest] = await Promise.all([
                getCurrentVersion(),
                getLatestCommit()
            ]);

            const updateAvailable = hasUpdate(current, latest);

            _lastCheck = {
                timestamp: new Date().toISOString(),
                current,
                latest,
                hasUpdate: updateAvailable
            };

            log('Check complete:', updateAvailable ? 'Update available' : 'Up to date');

            return {
                hasUpdate: updateAvailable,
                currentVersion: current.version,
                currentCommit: current.commit,
                latestCommit: latest.sha,
                latestCommitShort: latest.shortSha,
                commitMessage: latest.message,
                commitDate: latest.date,
                commitAuthor: latest.author
            };
        } catch (error) {
            log('Check failed:', error.message);
            return { hasUpdate: false, error: error.message };
        }
    }

    /**
     * Get file list to update from GitHub
     * Only retrieves files in updatePaths
     * Uses cache to avoid rate limits
     */
    async function getFileList(path = null) {
        // Check cache first (only for full list, not recursive calls)
        if (!path && _fileListCache && (Date.now() - _fileListCacheTime < CONFIG.cacheDuration)) {
            log('Using cached file list');
            return _fileListCache;
        }

        const { owner, repo, branch, rawBaseUrl } = CONFIG.github;
        let files = [];

        // If no path specified, scan only updatePaths
        const pathsToScan = path ? [path] : CONFIG.updatePaths;

        for (const scanPath of pathsToScan) {
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${scanPath}?ref=${branch}`;

            try {
                const response = await fetch(url, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'AtomeUpdater/1.0'
                    }
                });

                if (!response.ok) {
                    if (response.status === 403) {
                        log(`Rate limit hit for ${scanPath}, using raw URLs`);
                        // Fallback: cannot list files without API, skip this path
                        continue;
                    }
                    log(`Failed to list ${scanPath}: ${response.status}`);
                    continue;
                }

                const items = await response.json();

                for (const item of items) {
                    // Check if path is protected
                    const relativePath = item.path;
                    const isProtected = CONFIG.protectedPaths.some(p => relativePath.startsWith(p));

                    if (isProtected) {
                        log(`Skipping protected path: ${relativePath}`);
                        continue;
                    }

                    if (item.type === 'file') {
                        // Use raw.githubusercontent.com URL instead of API download_url
                        files.push({
                            path: item.path,
                            downloadUrl: `${rawBaseUrl}/${item.path}`,
                            sha: item.sha,
                            size: item.size
                        });
                    } else if (item.type === 'dir') {
                        // Recursion for subdirectories
                        const subFiles = await getFileList(item.path);
                        files = files.concat(subFiles);
                    }
                }
            } catch (error) {
                log(`Error scanning ${scanPath}:`, error.message);
            }
        }

        // Cache the result (only for full list)
        if (!path) {
            _fileListCache = files;
            _fileListCacheTime = Date.now();
        }

        return files;
    }

    /**
     * Download a file
     */
    async function downloadFile(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`);
        }
        return await response.text();
    }

    /**
     * Apply update on Tauri (via HTTP Axum route)
     */
    async function applyUpdateTauri(files, latestCommit) {
        const platform = getPlatform();

        if (!platform.isTauri) {
            throw new Error('Tauri platform not detected');
        }

        // Use local HTTP route (port 3000) to write files
        const baseUrl = 'http://127.0.0.1:3000';

        notifyProgress('download', 0, 'Preparing download...');

        const totalFiles = files.length;
        let processedFiles = 0;
        let errors = [];

        for (const file of files) {
            try {
                notifyProgress('download', Math.round((processedFiles / totalFiles) * 50),
                    `Downloading: ${file.path}`);

                const content = await downloadFile(file.downloadUrl);

                notifyProgress('install', 50 + Math.round((processedFiles / totalFiles) * 45),
                    `Installing: ${file.path}`);

                // Write file via HTTP Axum route
                const response = await fetch(`${baseUrl}/api/admin/apply-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: file.path,
                        content: content
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }

                processedFiles++;
            } catch (error) {
                log(`Error processing ${file.path}:`, error.message);
                errors.push({ path: file.path, error: error.message });
            }
        }

        // Update version file
        notifyProgress('finalize', 95, 'Updating version file...');

        const versionContent = JSON.stringify({
            version: '1.0.4', // Increment manually or use a system
            commit: latestCommit.sha,
            updatedAt: new Date().toISOString()
        }, null, 2);

        const versionResponse = await fetch(`${baseUrl}/api/admin/apply-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: CONFIG.versionFile,
                content: versionContent
            })
        });

        if (!versionResponse.ok) {
            log('Failed to update version file');
        }

        notifyProgress('complete', 100, 'Update complete!');

        return {
            success: errors.length === 0,
            filesUpdated: processedFiles,
            errors: errors.length > 0 ? errors : null
        };
    }

    /**
     * Apply update on Fastify server
     */
    async function applyUpdateServer(files, latestCommit) {
        notifyProgress('request', 10, 'Sending request to server...');

        // Send file list to server for download
        const response = await fetch('/api/admin/apply-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                source: `https://github.com/${CONFIG.github.owner}/${CONFIG.github.repo}`,
                branch: CONFIG.github.branch,
                commit: latestCommit.sha,
                paths: CONFIG.updatePaths
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Server error: ${response.status}`);
        }

        const result = await response.json();

        notifyProgress('complete', 100, 'Server update complete!');

        return result;
    }

    /**
     * Apply update
     */
    async function applyUpdate(options = {}) {
        if (_updateInProgress) {
            throw new Error('Update already in progress');
        }

        _updateInProgress = true;
        const platform = getPlatform();

        log(`Starting update on ${platform.name}...`);

        try {
            // Get latest commit
            notifyProgress('check', 5, 'Checking latest version...');
            const latestCommit = await getLatestCommit();

            // Get file list
            notifyProgress('list', 10, 'Getting file list...');
            const files = await getFileList();
            log(`Found ${files.length} files to update`);

            let result;

            if (platform.isTauri) {
                result = await applyUpdateTauri(files, latestCommit);
            } else {
                result = await applyUpdateServer(files, latestCommit);
            }

            if (_callbacks.onComplete) {
                _callbacks.onComplete(result);
            }

            return result;

        } catch (error) {
            log('Update failed:', error.message);

            if (_callbacks.onError) {
                _callbacks.onError(error);
            }

            throw error;
        } finally {
            _updateInProgress = false;
        }
    }

    /**
     * Configure callbacks
     */
    function setCallbacks(callbacks) {
        if (callbacks.onProgress) _callbacks.onProgress = callbacks.onProgress;
        if (callbacks.onComplete) _callbacks.onComplete = callbacks.onComplete;
        if (callbacks.onError) _callbacks.onError = callbacks.onError;
    }

    /**
     * Return current status
     */
    function getStatus() {
        return {
            updateInProgress: _updateInProgress,
            lastCheck: _lastCheck,
            platform: getPlatform(),
            config: {
                source: `https://github.com/${CONFIG.github.owner}/${CONFIG.github.repo}`,
                branch: CONFIG.github.branch,
                updatePaths: CONFIG.updatePaths
            }
        };
    }

    // Public API
    return {
        checkForUpdates,
        applyUpdate,
        getCurrentVersion,
        getLatestCommit,
        setCallbacks,
        getStatus,
        getPlatform,
        CONFIG
    };

})();

// Global export
if (typeof window !== 'undefined') {
    window.AtomeUpdater = AtomeUpdater;
}

// ES module export if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AtomeUpdater;
}
