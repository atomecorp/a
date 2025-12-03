/**
 * Atome/Squirrel Core Updater API
 * 
 * Core update system from GitHub
 * Source: https://github.com/atomecorp/a/tree/main/src
 * 
 * @module update_atome
 */

// Import server URL resolver
import { getLocalServerUrl } from './serverUrls.js';

const AtomeUpdater = (function () {
    'use strict';

    // Configuration
    const CONFIG = {
        github: {
            owner: 'atomecorp',
            repo: 'a',
            branch: 'main',
            srcPath: 'src',
            // Use refs/heads/main to bypass CDN cache!
            rawBaseUrl: 'https://raw.githubusercontent.com/atomecorp/a/refs/heads/main'
        },
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
                            updatedAt: data.updatedAt || null
                        };
                    }
                } catch (e) {
                    // Try next path
                }
            }

            log('Version file not found, assuming first install');
            return { version: '0.0.0', updatedAt: null };
        } catch (e) {
            log('Could not read version file:', e.message);
            return { version: '0.0.0', updatedAt: null };
        }
    }

    // Cache for remote version data (includes files list)
    let _remoteVersionData = null;

    /**
     * Get latest version.json from GitHub (raw URL - no rate limit)
     * Returns the full version.json including the files list
     */
    async function getLatestVersion() {
        const { rawBaseUrl } = CONFIG.github;
        log('Fetching latest version from GitHub (raw URL)...');

        try {
            // Use raw URL with cache-busting timestamp
            const versionUrl = `${rawBaseUrl}/src/version.json?t=${Date.now()}`;
            log(`Fetching: ${versionUrl}`);

            const response = await fetch(versionUrl);

            if (!response.ok) {
                throw new Error(`Failed to fetch version.json: ${response.status}`);
            }

            const data = await response.json();
            log(`Remote version: ${data.version}, files: ${(data.files || []).length}`);

            // Cache the full data including files list
            _remoteVersionData = data;

            return {
                version: data.version || '0.0.0',
                updatedAt: data.updatedAt || new Date().toISOString(),
                files: data.files || [],
                protectedPaths: data.protectedPaths || []
            };

        } catch (error) {
            log('Failed to get latest version:', error.message);
            throw new Error(`Cannot check for updates: ${error.message}`);
        }
    }

    /**
     * Simple version comparison
     */
    function hasUpdate(current, latest) {
        log(`Comparing: local=${current.version}, remote=${latest.version}`);

        const result = compareVersions(latest.version, current.version);
        const updateAvailable = result > 0;

        log(`Result: ${updateAvailable ? 'UPDATE AVAILABLE' : 'up to date'}`);
        return updateAvailable;
    }

    /**
     * Compare semantic versions
     * Returns: 1 if a > b, -1 if a < b, 0 if equal
     */
    function compareVersions(a, b) {
        const partsA = a.split('.').map(n => parseInt(n, 10) || 0);
        const partsB = b.split('.').map(n => parseInt(n, 10) || 0);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA > numB) return 1;
            if (numA < numB) return -1;
        }
        return 0;
    }

    /**
     * Check if updates are available
     */
    async function checkForUpdates() {
        log('Checking for updates...');

        try {
            const [current, latest] = await Promise.all([
                getCurrentVersion(),
                getLatestVersion()
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
                latestVersion: latest.version
            };
        } catch (error) {
            log('Check failed:', error.message);
            return { hasUpdate: false, error: error.message };
        }
    }

    /**
     * Get file list from version.json on GitHub (raw URL = no rate limit)
     * The file list is auto-generated by GitHub Action on each push
     */
    async function getFileList() {
        // Not needed anymore - we download the entire ZIP
        // Kept for backwards compatibility
        log('getFileList: Using ZIP download method - no file list needed');
        return [];
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
     * Apply update on Tauri (via ZIP download)
     * Downloads ZIP from GitHub, extracts src/, cleans up
     */
    async function applyUpdateTauri(files, latestVersion) {
        const platform = getPlatform();

        if (!platform.isTauri) {
            throw new Error('Tauri platform not detected');
        }

        const baseUrl = getLocalServerUrl() || 'http://127.0.0.1:3000';
        const { owner, repo, branch } = CONFIG.github;
        const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

        log('applyUpdateTauri: Using ZIP download method');
        log('ZIP URL:', zipUrl);

        // Get protectedPaths from GitHub version.json
        const versionData = _remoteVersionData || await getLatestVersion();
        const protectedPaths = versionData.protectedPaths || [];
        log('Protected paths from GitHub:', protectedPaths);

        notifyProgress('download', 10, 'Downloading repository ZIP...');

        // Ask Axum to download ZIP, extract src/, and clean up
        const response = await fetch(`${baseUrl}/api/admin/sync-from-zip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zipUrl: zipUrl,
                extractPath: 'src',
                protectedPaths: protectedPaths
            })
        });

        log('Response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            log('Error response:', errorData);
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const result = await response.json();
        log('Success response:', result);

        notifyProgress('complete', 100, 'Update complete!');

        return {
            success: result.success,
            filesUpdated: result.filesUpdated || 0,
            errors: result.errors || null
        };
    }

    /**
     * Apply update on Fastify server (via ZIP download)
     */
    async function applyUpdateServer(files, latestVersion) {
        notifyProgress('request', 10, 'Sending request to server...');

        const { owner, repo, branch } = CONFIG.github;
        const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

        // Get protectedPaths from GitHub version.json
        const versionData = _remoteVersionData || await getLatestVersion();
        const protectedPaths = versionData.protectedPaths || [];
        log('Protected paths from GitHub:', protectedPaths);

        // Ask Fastify to download ZIP, extract src/, and clean up
        const response = await fetch('/api/admin/sync-from-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                zipUrl: zipUrl,
                extractPath: 'src',
                protectedPaths: protectedPaths
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
     * Apply update (downloads ZIP from GitHub)
     */
    async function applyUpdate(options = {}) {
        if (_updateInProgress) {
            throw new Error('Update already in progress');
        }

        _updateInProgress = true;
        const platform = getPlatform();

        log(`Starting update on ${platform.name}...`);

        try {
            // Get latest version info
            notifyProgress('check', 5, 'Checking latest version...');
            const latestVersion = await getLatestVersion();

            let result;

            if (platform.isTauri) {
                result = await applyUpdateTauri([], latestVersion);
            } else {
                result = await applyUpdateServer([], latestVersion);
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
     * Force sync all files from GitHub without version check
     * Downloads ZIP, extracts src/, replaces local files
     */
    async function forceSync() {
        if (_updateInProgress) {
            throw new Error('Update already in progress');
        }

        _updateInProgress = true;
        const platform = getPlatform();

        log(`Force sync starting on ${platform.name}...`);

        try {
            notifyProgress('download', 10, 'Downloading from GitHub...');

            let result;

            if (platform.isTauri) {
                result = await applyUpdateTauri([], null);
            } else {
                result = await applyUpdateServer([], null);
            }

            if (_callbacks.onComplete) {
                _callbacks.onComplete(result);
            }

            return result;

        } catch (error) {
            log('Force sync failed:', error.message);

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
                branch: CONFIG.github.branch
            }
        };
    }

    // Public API
    return {
        checkForUpdates,
        applyUpdate,
        forceSync,
        getCurrentVersion,
        getLatestVersion,
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
