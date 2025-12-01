/**
 * Atome/Squirrel Core Updater API
 * 
 * Système de mise à jour du core depuis GitHub
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
            srcPath: 'src'
        },
        // Dossiers à mettre à jour
        updatePaths: [
            'src/squirrel',
            'src/application/core',
            'src/application/security'
        ],
        // Fichiers/dossiers protégés (ne pas écraser)
        protectedPaths: [
            'src/application/examples',
            'src/application/config'
        ],
        // Version actuelle (chemin relatif depuis la racine web)
        versionFile: 'version.json'
    };

    // État interne
    let _updateInProgress = false;
    let _lastCheck = null;
    let _callbacks = {
        onProgress: null,
        onComplete: null,
        onError: null
    };

    /**
     * Détecte la plateforme actuelle
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
     * Log avec préfixe
     */
    function log(message, ...args) {
        console.log(`[AtomeUpdater] ${message}`, ...args);
    }

    /**
     * Notifie la progression
     */
    function notifyProgress(step, progress, message) {
        if (_callbacks.onProgress) {
            _callbacks.onProgress({ step, progress, message });
        }
        log(`${step}: ${message} (${progress}%)`);
    }

    /**
     * Récupère la version actuelle
     */
    async function getCurrentVersion() {
        try {
            const response = await fetch(`/${CONFIG.versionFile}?t=${Date.now()}`);
            if (response.ok) {
                const data = await response.json();
                return {
                    version: data.version || '0.0.0',
                    commit: data.commit || null,
                    updatedAt: data.updatedAt || null
                };
            }
        } catch (e) {
            log('Could not read version file:', e.message);
        }
        return { version: '0.0.0', commit: null, updatedAt: null };
    }

    /**
     * Récupère le dernier commit de la branche main
     */
    async function getLatestCommit() {
        const { owner, repo, branch } = CONFIG.github;
        const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'AtomeUpdater/1.0'
                }
            });

            if (!response.ok) {
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
        } catch (error) {
            log('Failed to get latest commit:', error.message);
            throw error;
        }
    }

    /**
     * Compare deux versions/commits
     */
    function hasUpdate(current, latest) {
        if (current.commit && latest.sha) {
            return current.commit !== latest.sha;
        }
        return true; // Si pas de commit local, considérer qu'il y a une MAJ
    }

    /**
     * Vérifie si des mises à jour sont disponibles
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
     * Récupère la liste des fichiers à mettre à jour depuis GitHub
     */
    async function getFileList(path = CONFIG.github.srcPath) {
        const { owner, repo, branch } = CONFIG.github;
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'AtomeUpdater/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to list ${path}: ${response.status}`);
        }

        const items = await response.json();
        let files = [];

        for (const item of items) {
            // Vérifier si le chemin est protégé
            const relativePath = item.path;
            const isProtected = CONFIG.protectedPaths.some(p => relativePath.startsWith(p));

            if (isProtected) {
                log(`Skipping protected path: ${relativePath}`);
                continue;
            }

            if (item.type === 'file') {
                files.push({
                    path: item.path,
                    downloadUrl: item.download_url,
                    sha: item.sha,
                    size: item.size
                });
            } else if (item.type === 'dir') {
                // Récursion pour les sous-dossiers
                const subFiles = await getFileList(item.path);
                files = files.concat(subFiles);
            }
        }

        return files;
    }

    /**
     * Télécharge un fichier
     */
    async function downloadFile(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`);
        }
        return await response.text();
    }

    /**
     * Applique la mise à jour sur Tauri (via commandes Tauri)
     */
    async function applyUpdateTauri(files, latestCommit) {
        const platform = getPlatform();

        if (!platform.isTauri) {
            throw new Error('Tauri API not available');
        }

        const invoke = window.__TAURI__?.invoke ||
            window.__TAURI_INTERNALS__?.invoke;

        if (!invoke) {
            throw new Error('Tauri invoke not available');
        }

        notifyProgress('download', 0, 'Préparation du téléchargement...');

        const totalFiles = files.length;
        let processedFiles = 0;
        let errors = [];

        for (const file of files) {
            try {
                notifyProgress('download', Math.round((processedFiles / totalFiles) * 50),
                    `Téléchargement: ${file.path}`);

                const content = await downloadFile(file.downloadUrl);

                notifyProgress('install', 50 + Math.round((processedFiles / totalFiles) * 45),
                    `Installation: ${file.path}`);

                // Écrire le fichier via Tauri
                await invoke('write_update_file', {
                    path: file.path,
                    content: content
                });

                processedFiles++;
            } catch (error) {
                log(`Error processing ${file.path}:`, error.message);
                errors.push({ path: file.path, error: error.message });
            }
        }

        // Mettre à jour le fichier version
        notifyProgress('finalize', 95, 'Mise à jour du fichier version...');

        const versionContent = JSON.stringify({
            version: '1.0.4', // Incrémenter manuellement ou utiliser un système
            commit: latestCommit.sha,
            updatedAt: new Date().toISOString()
        }, null, 2);

        await invoke('write_update_file', {
            path: CONFIG.versionFile,
            content: versionContent
        });

        notifyProgress('complete', 100, 'Mise à jour terminée!');

        return {
            success: true,
            filesUpdated: processedFiles,
            errors: errors.length > 0 ? errors : null
        };
    }

    /**
     * Applique la mise à jour sur le serveur Fastify
     */
    async function applyUpdateServer(files, latestCommit) {
        notifyProgress('request', 10, 'Envoi de la demande au serveur...');

        // Envoyer la liste des fichiers au serveur pour qu'il les télécharge
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

        notifyProgress('complete', 100, 'Mise à jour serveur terminée!');

        return result;
    }

    /**
     * Applique la mise à jour
     */
    async function applyUpdate(options = {}) {
        if (_updateInProgress) {
            throw new Error('Update already in progress');
        }

        _updateInProgress = true;
        const platform = getPlatform();

        log(`Starting update on ${platform.name}...`);

        try {
            // Récupérer le dernier commit
            notifyProgress('check', 5, 'Vérification de la dernière version...');
            const latestCommit = await getLatestCommit();

            // Récupérer la liste des fichiers
            notifyProgress('list', 10, 'Récupération de la liste des fichiers...');
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
     * Configure les callbacks
     */
    function setCallbacks(callbacks) {
        if (callbacks.onProgress) _callbacks.onProgress = callbacks.onProgress;
        if (callbacks.onComplete) _callbacks.onComplete = callbacks.onComplete;
        if (callbacks.onError) _callbacks.onError = callbacks.onError;
    }

    /**
     * Retourne l'état actuel
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

    // API publique
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

// Export global
if (typeof window !== 'undefined') {
    window.AtomeUpdater = AtomeUpdater;
}

// Export ES module si disponible
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AtomeUpdater;
}
