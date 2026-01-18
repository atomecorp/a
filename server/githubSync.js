/**
 * GitHub Auto-Sync Module
 * 
 * - Polls GitHub every minute for new commits
 * - Triggers sync-from-zip when changes detected
 * - Broadcasts version updates to all connected clients via WebSocket
 */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Configuration
const CONFIG = {
    github: {
        owner: 'atomecorp',
        repo: 'a',
        branch: 'main'
    },
    pollIntervalMs: 60000, // 1 minute
    versionFilePath: path.join(PROJECT_ROOT, 'src', 'version.json')
};

// State
let lastCommitSha = null;
let pollIntervalId = null;
let githubToken = null;
let connectedClients = new Map(); // clientId -> { ws, type: 'tauri'|'browser', lastSeen }
let syncInProgress = false;

/**
 * Initialize GitHub token from environment
 */
function initGitHubToken() {
    githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    if (githubToken) {
        console.log('🔑 GitHub token configured for API access');
    } else {
        console.log('⚠️  No GITHUB_TOKEN found - using unauthenticated API (60 req/hour limit)');
    }
}

/**
 * Get latest commit SHA from GitHub
 */
async function getLatestCommitSha() {
    const { owner, repo, branch } = CONFIG.github;
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;

    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Squirrel-Framework'
    };

    if (githubToken) {
        headers['Authorization'] = `Bearer ${githubToken}`;
    }

    try {
        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 403) {
                console.warn('⚠️  GitHub API rate limit reached');
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        return data.sha;
    } catch (error) {
        console.error('❌ Failed to fetch commit SHA:', error.message);
        return null;
    }
}

/**
 * Get local version from version.json
 */
async function getLocalVersion() {
    try {
        const content = await fs.readFile(CONFIG.versionFilePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('❌ Failed to read local version.json:', error.message);
        return { version: '0.0.0' };
    }
}

/**
 * Perform sync from GitHub ZIP
 */
async function performSync() {
    if (syncInProgress) {
        console.log('⏳ Sync already in progress, skipping...');
        return false;
    }

    syncInProgress = true;
    console.log('🔄 Starting auto-sync from GitHub...');

    try {
        const { owner, repo, branch } = CONFIG.github;
        const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

        // Get protected paths from remote version.json first
        let protectedPaths = ['src/application/temp'];
        try {
            const versionUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/src/version.json`;
            const versionResponse = await fetch(versionUrl);
            if (versionResponse.ok) {
                const versionData = await versionResponse.json();
                protectedPaths = versionData.protectedPaths || protectedPaths;
            }
        } catch (e) {
            console.warn('⚠️  Could not fetch remote protectedPaths, using defaults');
        }

        // Download and extract ZIP
        const response = await fetch(zipUrl);
        if (!response.ok) {
            throw new Error(`Failed to download ZIP: ${response.status}`);
        }

        const zipBuffer = Buffer.from(await response.arrayBuffer());
        console.log('📥 Downloaded ZIP:', zipBuffer.length, 'bytes');

        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();

        // Find root prefix
        let rootPrefix = '';
        if (entries.length > 0) {
            const firstName = entries[0].entryName;
            const idx = firstName.indexOf('/');
            if (idx > 0) {
                rootPrefix = firstName.substring(0, idx + 1);
            }
        }

        let updatedCount = 0;
        const extractPrefix = 'src/';

        for (const entry of entries) {
            if (entry.isDirectory) continue;

            const name = entry.entryName;
            const relativePath = name.startsWith(rootPrefix)
                ? name.substring(rootPrefix.length)
                : name;

            // Only extract src/ files
            if (!relativePath.startsWith(extractPrefix)) continue;

            // Skip protected paths
            if (protectedPaths.some(p => relativePath.startsWith(p))) continue;

            const targetPath = path.join(PROJECT_ROOT, relativePath);
            const targetDir = path.dirname(targetPath);

            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(targetPath, entry.getData());
            updatedCount++;
        }

        console.log(`✅ Auto-sync complete: ${updatedCount} files updated`);

        // Broadcast new version to all clients
        const newVersion = await getLocalVersion();
        broadcastVersionUpdate(newVersion);

        return true;
    } catch (error) {
        console.error('❌ Auto-sync failed:', error.message);
        return false;
    } finally {
        syncInProgress = false;
    }
}

/**
 * Check for updates and sync if needed
 */
async function checkForUpdates() {
    const currentSha = await getLatestCommitSha();

    if (!currentSha) {
        return; // API error, skip this check
    }

    if (lastCommitSha === null) {
        // First check, just store the SHA
        lastCommitSha = currentSha;
        console.log('📍 Initial commit SHA:', currentSha.substring(0, 8));
        return;
    }

    if (currentSha !== lastCommitSha) {
        console.log('🆕 New commit detected:', currentSha.substring(0, 8));
        lastCommitSha = currentSha;
        await performSync();
    }
}

/**
 * Start polling for GitHub updates
 */
function startPolling() {
    if (pollIntervalId) {
        console.log('⚠️  Polling already running');
        return;
    }

    initGitHubToken();

    console.log(`🔄 Starting GitHub polling (every ${CONFIG.pollIntervalMs / 1000}s)`);

    // Initial check
    checkForUpdates();

    // Start interval
    pollIntervalId = setInterval(checkForUpdates, CONFIG.pollIntervalMs);
}

/**
 * Stop polling
 */
function stopPolling() {
    if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
        console.log('⏹️  GitHub polling stopped');
    }
}

// =============================================================================
// WebSocket Client Manager
// =============================================================================

/**
 * Register a new client connection
 */
function registerClient(clientId, ws, clientType = 'browser') {
    connectedClients.set(clientId, {
        ws,
        type: clientType,
        lastSeen: Date.now(),
        version: null
    });
    console.log(`🔗 Client connected: ${clientId} (${clientType}) - Total: ${connectedClients.size}`);
}

/**
 * Unregister a client
 */
function unregisterClient(clientId) {
    if (connectedClients.has(clientId)) {
        connectedClients.delete(clientId);
        console.log(`🔌 Client disconnected: ${clientId} - Total: ${connectedClients.size}`);
    }
}

/**
 * Update client's reported version
 */
function updateClientVersion(clientId, version) {
    const client = connectedClients.get(clientId);
    if (client) {
        client.version = version;
        client.lastSeen = Date.now();
    }
}

/**
 * Broadcast version update to all connected clients
 */
function broadcastVersionUpdate(versionData) {
    const message = JSON.stringify({
        type: 'version_update',
        version: versionData.version,
        timestamp: new Date().toISOString(),
        protectedPaths: versionData.protectedPaths || []
    });

    let sentCount = 0;
    for (const [clientId, client] of connectedClients) {
        try {
            if (client.ws.readyState === 1) { // WebSocket.OPEN
                client.ws.send(message);
                sentCount++;
            }
        } catch (error) {
            console.error(`❌ Failed to send to ${clientId}:`, error.message);
        }
    }

    console.log(`📢 Version broadcast: ${versionData.version} → ${sentCount} clients`);
}

/**
 * Broadcast arbitrary message to all clients
 * @param {string} type - Message type
 * @param {object} data - Message data
 * @param {string} [excludeClientId] - Client ID to exclude from broadcast (to avoid echo)
 */
function broadcastMessage(type, data, excludeClientId = null) {
    const message = JSON.stringify({ type, ...data, timestamp: new Date().toISOString() });

    for (const [clientId, client] of connectedClients) {
        // Skip the client that originated this message (avoid duplicate)
        if (excludeClientId && clientId === excludeClientId) {
            console.log(`[Broadcast] Skipping client ${clientId} (sender)`);
            continue;
        }
        try {
            if (client.ws.readyState === 1) {
                client.ws.send(message);
            }
        } catch (error) {
            // Silent fail for individual clients
        }
    }
}

/**
 * Get all connected clients info
 */
function getConnectedClients() {
    const clients = [];
    for (const [clientId, client] of connectedClients) {
        clients.push({
            id: clientId,
            type: client.type,
            version: client.version,
            lastSeen: client.lastSeen
        });
    }
    return clients;
}

/**
 * Handle incoming WebSocket message
 */
async function handleClientMessage(clientId, message) {
    try {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'register':
                // Client announces itself
                const client = connectedClients.get(clientId);
                if (client) {
                    client.type = data.clientType || 'browser';
                    client.version = data.version;
                    client.lastSeen = Date.now();
                }

                // Send current version back using the unified welcome envelope
                const currentVersion = await getLocalVersion();
                return {
                    type: 'welcome',
                    clientId,
                    server: 'fastify',
                    version: currentVersion.version,
                    protectedPaths: currentVersion.protectedPaths || [],
                    capabilities: ['events', 'sync_request', 'file-events', 'atome-events', 'account-events'],
                    timestamp: new Date().toISOString()
                };

            case 'sync_request':
                // Client requests sync
                if (!syncInProgress) {
                    performSync();
                }
                return { type: 'sync_started' };

            case 'ping':
                const clientInfo = connectedClients.get(clientId);
                if (clientInfo) {
                    clientInfo.lastSeen = Date.now();
                }
                return { type: 'pong' };

            case 'offline_changes':
                // Client reports offline changes for conflict resolution
                console.log(`📥 Offline changes from ${clientId}:`, data.changes?.length || 0);
                // TODO: Implement conflict resolution logic
                return { type: 'offline_changes_received', count: data.changes?.length || 0 };

            default:
                return { type: 'error', message: 'Unknown message type' };
        }
    } catch (error) {
        return { type: 'error', message: error.message };
    }
}

export {
    startPolling,
    stopPolling,
    performSync,
    getLocalVersion,
    registerClient,
    unregisterClient,
    updateClientVersion,
    broadcastVersionUpdate,
    broadcastMessage,
    getConnectedClients,
    handleClientMessage,
    CONFIG
};
