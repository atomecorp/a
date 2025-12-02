/**
 * Socket & Atome Sync Test
 * 
 * Interactive demo testing:
 * 1. WebSocket connections (/ws/events, /ws/sync)
 * 2. Atome API (create, update, delete, sync)
 * 3. Authentication integration
 */

// ============================================================================
// API CONFIGURATION (same as user_creation.js)
// ============================================================================
function resolveApiConfig() {
    if (typeof window !== 'undefined' && window.SQUIRREL_API_BASE) {
        return { base: window.SQUIRREL_API_BASE, isLocal: false };
    }
    try {
        const stored = localStorage.getItem('squirrel_api_base');
        if (stored) return { base: stored, isLocal: false };
    } catch (e) { }

    let isTauri = false;
    if (typeof window !== 'undefined' && window.__TAURI__) isTauri = true;
    if (!isTauri) {
        try {
            const platform = typeof current_platform === 'function' ? current_platform() : '';
            if (typeof platform === 'string' && platform.toLowerCase().includes('taur')) isTauri = true;
        } catch (_) { }
    }
    if (!isTauri && typeof window !== 'undefined' && window.location?.port === '1420') isTauri = true;

    if (isTauri) return { base: 'http://127.0.0.1:3000', isLocal: true };

    if (typeof window !== 'undefined') {
        const hostname = window.location?.hostname;
        const port = window.location?.port;
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
            return { base: 'http://localhost:3001', isLocal: false };
        }
    }
    return { base: '', isLocal: false };
}

const apiConfig = resolveApiConfig();
const apiBase = apiConfig.base;
const useLocalAuth = apiConfig.isLocal;
const authPrefix = useLocalAuth ? '/api/auth/local' : '/api/auth';
const TOKEN_KEY = useLocalAuth ? 'local_auth_token' : 'cloud_auth_token';

console.log('[socket_test] API config:', { apiBase, useLocalAuth, authPrefix, TOKEN_KEY });

// ============================================================================
// TITLE
// ============================================================================
$('h1', {
    parent: '#view',
    id: 'socket-test-title',
    css: {
        backgroundColor: '#1a1a2e',
        color: '#eee',
        padding: '20px',
        margin: '0 0 20px 0',
        borderRadius: '8px',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif'
    },
    text: '🔌 Socket & Atome Sync Test'
});

// ============================================================================
// STATUS BAR
// ============================================================================
const statusBar = $('div', {
    parent: '#view',
    id: 'status-bar',
    css: {
        display: 'flex',
        gap: '20px',
        padding: '15px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        marginBottom: '20px',
        flexWrap: 'wrap'
    }
});

// Auth status indicator
const authStatus = $('div', {
    parent: statusBar,
    id: 'auth-status',
    css: {
        padding: '8px 16px',
        borderRadius: '20px',
        backgroundColor: '#ff6b6b',
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold'
    },
    text: '🔒 Not Logged In'
});

// WebSocket Events status
const wsEventsStatus = $('div', {
    parent: statusBar,
    id: 'ws-events-status',
    css: {
        padding: '8px 16px',
        borderRadius: '20px',
        backgroundColor: '#666',
        color: 'white',
        fontSize: '14px'
    },
    text: '⚪ /ws/events'
});

// WebSocket Sync status
const wsSyncStatus = $('div', {
    parent: statusBar,
    id: 'ws-sync-status',
    css: {
        padding: '8px 16px',
        borderRadius: '20px',
        backgroundColor: '#666',
        color: 'white',
        fontSize: '14px'
    },
    text: '⚪ /ws/sync'
});

// Pending ops indicator
const pendingOpsStatus = $('div', {
    parent: statusBar,
    id: 'pending-ops',
    css: {
        padding: '8px 16px',
        borderRadius: '20px',
        backgroundColor: '#666',
        color: 'white',
        fontSize: '14px'
    },
    text: '📤 Pending: 0'
});

// ============================================================================
// CONSOLE OUTPUT
// ============================================================================
const consoleOutput = $('div', {
    parent: '#view',
    id: 'console-output',
    css: {
        backgroundColor: '#1e1e1e',
        color: '#00ff00',
        fontFamily: 'Monaco, Consolas, monospace',
        fontSize: '12px',
        padding: '15px',
        borderRadius: '8px',
        height: '200px',
        overflowY: 'auto',
        marginBottom: '20px',
        whiteSpace: 'pre-wrap'
    },
    text: '> Console ready...\n'
});

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const colors = {
        info: '#00ff00',
        error: '#ff6b6b',
        warn: '#ffd93d',
        success: '#6bcb77'
    };
    const prefix = { info: 'ℹ️', error: '❌', warn: '⚠️', success: '✅' };

    const line = $('div', {
        parent: consoleOutput,
        css: { color: colors[type] || colors.info }
    });
    line.textContent = `[${timestamp}] ${prefix[type] || ''} ${message}`;

    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ============================================================================
// SECTION: AUTHENTICATION
// ============================================================================
$('h2', {
    parent: '#view',
    css: {
        color: '#333',
        borderBottom: '2px solid #007bff',
        paddingBottom: '10px',
        marginTop: '20px'
    },
    text: '🔐 Authentication'
});

const authSection = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '20px',
        alignItems: 'center'
    }
});

// Login input
const loginInput = $('input', {
    parent: authSection,
    attrs: {
        type: 'text',
        placeholder: useLocalAuth ? 'Phone number' : 'Username or email'
    },
    css: {
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ccc',
        width: '200px'
    }
});

// Password input
const passwordInput = $('input', {
    parent: authSection,
    attrs: {
        type: 'password',
        placeholder: 'Password'
    },
    css: {
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ccc',
        width: '150px'
    }
});

// Login button
Button({
    text: 'Login',
    parent: authSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#007bff',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const identifier = loginInput.value;
        const password = passwordInput.value;

        if (!identifier || !password) {
            log('Please enter phone and password', 'warn');
            return;
        }

        log(`Attempting login as: ${identifier}...`);

        try {
            // Both Axum (local) and Fastify (cloud) use { phone, password }
            const body = { phone: identifier, password };

            const response = await fetch(`${apiBase}${authPrefix}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (data.success && data.token) {
                localStorage.setItem(TOKEN_KEY, data.token);
                localStorage.setItem('user_data', JSON.stringify(data.user));

                authStatus.$({
                    css: { backgroundColor: '#6bcb77' },
                    text: `🔓 ${data.user.username || identifier}`
                });

                log(`Logged in as: ${data.user.username}`, 'success');
                updatePendingCount();
                
                // Load user's atomes after login
                await loadUserAtomes();
            } else {
                log(`Login failed: ${data.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            log(`Login error: ${error.message}`, 'error');
        }
    }
});

// Logout button
Button({
    text: 'Logout',
    parent: authSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#dc3545',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('user_data');

        authStatus.$({
            css: { backgroundColor: '#ff6b6b' },
            text: '🔒 Not Logged In'
        });

        // Clear visual area on logout - user's objects should not be visible
        clearVisualArea();
        
        log('Logged out', 'info');
    }
});

// ============================================================================
// SECTION: WEBSOCKET TESTS
// ============================================================================
$('h2', {
    parent: '#view',
    css: {
        color: '#333',
        borderBottom: '2px solid #007bff',
        paddingBottom: '10px',
        marginTop: '20px'
    },
    text: '🔌 WebSocket Connections'
});

const wsSection = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '20px'
    }
});

let wsEvents = null;
let wsSync = null;

// Connect /ws/events
Button({
    text: 'Connect /ws/events',
    parent: wsSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#17a2b8',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: () => {
        if (wsEvents && wsEvents.readyState === WebSocket.OPEN) {
            log('/ws/events already connected', 'warn');
            return;
        }

        log('Connecting to /ws/events...');
        wsEvents = new WebSocket('ws://localhost:3001/ws/events');

        wsEvents.onopen = () => {
            wsEventsStatus.$({
                css: { backgroundColor: '#6bcb77' },
                text: '🟢 /ws/events'
            });
            log('/ws/events connected!', 'success');
        };

        wsEvents.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                log(`[/ws/events] ${data.type}: ${JSON.stringify(data).substring(0, 100)}...`);
            } catch (e) {
                log(`[/ws/events] ${event.data}`);
            }
        };

        wsEvents.onclose = () => {
            wsEventsStatus.$({
                css: { backgroundColor: '#666' },
                text: '⚪ /ws/events'
            });
            log('/ws/events disconnected', 'warn');
        };

        wsEvents.onerror = (err) => {
            log(`/ws/events error: ${err.message || 'Connection failed'}`, 'error');
        };
    }
});

// Connect /ws/sync
Button({
    text: 'Connect /ws/sync',
    parent: wsSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#28a745',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: () => {
        if (wsSync && wsSync.readyState === WebSocket.OPEN) {
            log('/ws/sync already connected', 'warn');
            return;
        }

        log('Connecting to /ws/sync...');
        wsSync = new WebSocket('ws://localhost:3001/ws/sync');

        wsSync.onopen = () => {
            wsSyncStatus.$({
                css: { backgroundColor: '#6bcb77' },
                text: '🟢 /ws/sync'
            });
            log('/ws/sync connected!', 'success');
        };

        wsSync.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                log(`[/ws/sync] ${data.type}: ${JSON.stringify(data).substring(0, 100)}...`);

                if (data.type === 'welcome') {
                    log(`Server version: ${data.version}`, 'success');
                }
            } catch (e) {
                log(`[/ws/sync] ${event.data}`);
            }
        };

        wsSync.onclose = () => {
            wsSyncStatus.$({
                css: { backgroundColor: '#666' },
                text: '⚪ /ws/sync'
            });
            log('/ws/sync disconnected', 'warn');
        };

        wsSync.onerror = (err) => {
            log(`/ws/sync error: ${err.message || 'Connection failed'}`, 'error');
        };
    }
});

// Disconnect all
Button({
    text: 'Disconnect All',
    parent: wsSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#dc3545',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: () => {
        if (wsEvents) {
            wsEvents.close();
            wsEvents = null;
        }
        if (wsSync) {
            wsSync.close();
            wsSync = null;
        }
        log('All WebSockets disconnected', 'info');
    }
});

// Send ping
Button({
    text: 'Send Ping',
    parent: wsSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#ffc107',
        color: 'black',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: () => {
        if (wsSync && wsSync.readyState === WebSocket.OPEN) {
            wsSync.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            log('Ping sent to /ws/sync', 'info');
        } else {
            log('Not connected to /ws/sync', 'warn');
        }
    }
});

// ============================================================================
// SECTION: ATOME API TESTS
// ============================================================================
$('h2', {
    parent: '#view',
    css: {
        color: '#333',
        borderBottom: '2px solid #007bff',
        paddingBottom: '10px',
        marginTop: '20px'
    },
    text: '⚛️ Atome API Tests'
});

const atomeSection = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '20px'
    }
});

let testAtomeId = null;

// Create Atome
Button({
    text: 'Create Atome',
    parent: atomeSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#28a745',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        if (!window.Atome) {
            log('Atome API not loaded', 'error');
            return;
        }

        if (!Atome.isAuthenticated()) {
            log('Please login first', 'warn');
            return;
        }

        log('Creating test Atome...');

        try {
            const result = await Atome.create({
                kind: 'shape',
                tag: 'div',
                properties: {
                    css: {
                        color: 'red',
                        width: '100px',
                        height: '100px',
                        backgroundColor: '#ff6b6b'
                    },
                    text: 'Test Atome'
                }
            });

            if (result.success || result.queued) {
                testAtomeId = result.data.id;
                log(`Atome created: ${testAtomeId}${result.queued ? ' (queued)' : ''}`, 'success');
                updatePendingCount();
            } else {
                log(`Create failed: ${result.error}`, 'error');
            }
        } catch (error) {
            log(`Create error: ${error.message}`, 'error');
        }
    }
});

// Update Atome
Button({
    text: 'Update Atome',
    parent: atomeSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#ffc107',
        color: 'black',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        if (!testAtomeId) {
            log('Create an Atome first', 'warn');
            return;
        }

        log(`Updating Atome: ${testAtomeId}...`);

        try {
            const result = await Atome.update({
                id: testAtomeId,
                properties: {
                    css: {
                        backgroundColor: '#4ecdc4',
                        borderRadius: '50%'
                    }
                }
            });

            if (result.success || result.queued) {
                log(`Atome updated${result.queued ? ' (queued)' : ''}`, 'success');
                updatePendingCount();
            } else {
                log(`Update failed: ${result.error}`, 'error');
            }
        } catch (error) {
            log(`Update error: ${error.message}`, 'error');
        }
    }
});

// Delete Atome
Button({
    text: 'Delete Atome',
    parent: atomeSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#dc3545',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        if (!testAtomeId) {
            log('No Atome to delete', 'warn');
            return;
        }

        log(`Deleting Atome: ${testAtomeId}...`);

        try {
            const result = await Atome.delete({ id: testAtomeId });

            if (result.success || result.queued) {
                log(`Atome deleted${result.queued ? ' (queued)' : ''}`, 'success');
                testAtomeId = null;
                updatePendingCount();
            } else {
                log(`Delete failed: ${result.error}`, 'error');
            }
        } catch (error) {
            log(`Delete error: ${error.message}`, 'error');
        }
    }
});

// Sync
Button({
    text: 'Force Sync',
    parent: atomeSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#6f42c1',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        log('Syncing pending operations...');

        try {
            const result = await Atome.sync();

            if (result.success) {
                log(`Sync complete: ${result.synced || 0} operations`, 'success');
            } else {
                log(`Sync failed: ${result.reason}`, 'warn');
            }
            updatePendingCount();
        } catch (error) {
            log(`Sync error: ${error.message}`, 'error');
        }
    }
});

// ============================================================================
// SECTION: VISUAL TEST AREA
// ============================================================================
$('h2', {
    parent: '#view',
    css: {
        color: '#333',
        borderBottom: '2px solid #007bff',
        paddingBottom: '10px',
        marginTop: '20px'
    },
    text: '🎨 Visual Test Area'
});

const visualArea = $('div', {
    parent: '#view',
    id: 'visual-test-area',
    css: {
        backgroundColor: '#f0f0f0',
        border: '2px dashed #ccc',
        borderRadius: '8px',
        padding: '20px',
        minHeight: '150px',
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center'
    }
});

$('p', {
    parent: visualArea,
    css: { color: '#999', margin: '0' },
    text: 'Created Atomes will appear here when reconstructed'
});

// Create Visual Atome button
Button({
    text: 'Create Visual Atome',
    parent: '#view',
    css: {
        padding: '10px 20px',
        backgroundColor: '#e91e63',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        marginTop: '10px',
        position: 'relative'
    },
    onAction: async () => {
        if (!Atome.isAuthenticated()) {
            log('Please login first', 'warn');
            return;
        }

        // Remove placeholder text if present (only first time)
        const placeholder = visualArea.querySelector('p');
        if (placeholder) placeholder.remove();

        // Create and display atome
        const atomeData = {
            kind: 'shape',
            tag: 'div',
            properties: {
                css: {
                    width: '80px',
                    height: '80px',
                    backgroundColor: `hsl(${Math.random() * 360}, 70%, 60%)`,
                    borderRadius: `${Math.random() * 50}%`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'transform 0.2s'
                },
                text: '⚛️'
            }
        };

        try {
            const result = await Atome.create(atomeData);

            if (result.success || result.queued) {
                // Reconstruct visually
                const elem = $('div', {
                    parent: visualArea,
                    id: result.data.id,
                    css: atomeData.properties.css,
                    text: atomeData.properties.text,
                    onclick: function () {
                        this.style.transform = this.style.transform === 'scale(1.2)' ? 'scale(1)' : 'scale(1.2)';
                    }
                });

                log(`Visual Atome created: ${result.data.id}`, 'success');
                updatePendingCount();
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// ============================================================================
// SECTION: USER FILES
// ============================================================================
$('h2', {
    parent: '#view',
    css: {
        color: '#333',
        borderBottom: '2px solid #28a745',
        paddingBottom: '10px',
        marginTop: '20px'
    },
    text: '📁 User Files & Sharing'
});

const filesSection = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '20px'
    }
});

// File list container
const filesListContainer = $('div', {
    parent: '#view',
    id: 'files-list-container',
    css: {
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        padding: '15px',
        marginBottom: '20px',
        maxHeight: '200px',
        overflowY: 'auto'
    }
});

$('div', {
    parent: filesListContainer,
    css: { color: '#666', fontStyle: 'italic' },
    text: 'Click "My Files" or "Accessible Files" to load...'
});

// Get my files button
Button({
    text: 'My Files',
    parent: filesSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#28a745',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            log('Please login first', 'warn');
            return;
        }

        log('Fetching my files...');

        try {
            const response = await fetch('/api/files/my-files', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                filesListContainer.innerHTML = '';

                if (data.data.length === 0) {
                    $('div', {
                        parent: filesListContainer,
                        css: { color: '#666', fontStyle: 'italic' },
                        text: 'No files uploaded yet'
                    });
                } else {
                    data.data.forEach(file => {
                        const fileRow = $('div', {
                            parent: filesListContainer,
                            css: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px',
                                backgroundColor: '#fff',
                                marginBottom: '5px',
                                borderRadius: '4px',
                                border: '1px solid #ddd'
                            }
                        });

                        $('span', {
                            parent: fileRow,
                            text: `📄 ${file.name}`
                        });

                        $('span', {
                            parent: fileRow,
                            css: { color: '#666', fontSize: '12px' },
                            text: file.is_public ? '🌐 Public' : '🔒 Private'
                        });
                    });
                }

                log(`Loaded ${data.count} files`, 'success');
            } else {
                log(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// Get accessible files button
Button({
    text: 'Accessible Files',
    parent: filesSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#17a2b8',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            log('Please login first', 'warn');
            return;
        }

        log('Fetching accessible files...');

        try {
            const response = await fetch('/api/files/accessible', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                filesListContainer.innerHTML = '';

                if (data.data.length === 0) {
                    $('div', {
                        parent: filesListContainer,
                        css: { color: '#666', fontStyle: 'italic' },
                        text: 'No accessible files'
                    });
                } else {
                    data.data.forEach(file => {
                        const fileRow = $('div', {
                            parent: filesListContainer,
                            css: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px',
                                backgroundColor: file.access === 'owner' ? '#d4edda' : '#cce5ff',
                                marginBottom: '5px',
                                borderRadius: '4px',
                                border: '1px solid #ddd'
                            }
                        });

                        $('span', {
                            parent: fileRow,
                            text: `📄 ${file.name}`
                        });

                        $('span', {
                            parent: fileRow,
                            css: {
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: file.access === 'owner' ? '#28a745' : '#007bff',
                                color: 'white',
                                fontSize: '11px'
                            },
                            text: file.access.toUpperCase()
                        });
                    });
                }

                log(`Loaded ${data.count} accessible files`, 'success');
            } else {
                log(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// File stats button
Button({
    text: 'Stats',
    parent: filesSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#6c757d',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            log('Please login first', 'warn');
            return;
        }

        try {
            const response = await fetch('/api/files/stats', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                log(`📊 Files: ${data.data.totalFiles} total, ${data.data.publicFiles} public, ${data.data.sharedFiles} shared`, 'info');
            } else {
                log(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// Upload test file button
Button({
    text: 'Upload Test File',
    parent: filesSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#fd7e14',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);

        // Create test file content
        const content = `Test file created at ${new Date().toISOString()}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const fileName = `test_${Date.now()}.txt`;

        log(`Uploading test file: ${fileName}...`);

        try {
            const response = await fetch('/api/uploads', {
                method: 'POST',
                headers: {
                    'X-Filename': fileName,
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: blob
            });

            const data = await response.json();

            if (data.success) {
                log(`File uploaded: ${data.file} (owner: ${data.owner})`, 'success');
            } else {
                log(`Upload failed: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// ============================================================================
// SECTION: SHARING
// ============================================================================
$('h2', {
    parent: '#view',
    css: {
        color: '#333',
        borderBottom: '2px solid #9b59b6',
        paddingBottom: '10px',
        marginTop: '20px'
    },
    text: '🤝 Sharing'
});

const sharingSection = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        marginBottom: '20px',
        alignItems: 'center'
    }
});

// Resource type select
const resourceTypeSelect = $('select', {
    parent: sharingSection,
    css: {
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ccc'
    }
});

['project', 'atome', 'file'].forEach(type => {
    $('option', {
        parent: resourceTypeSelect,
        attrs: { value: type },
        text: type.charAt(0).toUpperCase() + type.slice(1)
    });
});

// Resource ID input
const resourceIdInput = $('input', {
    parent: sharingSection,
    attrs: {
        type: 'text',
        placeholder: 'Resource ID'
    },
    css: {
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ccc',
        width: '150px'
    }
});

// Target user input
const targetUserInput = $('input', {
    parent: sharingSection,
    attrs: {
        type: 'text',
        placeholder: 'Target User ID'
    },
    css: {
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ccc',
        width: '150px'
    }
});

// Permission select
const permissionSelect = $('select', {
    parent: sharingSection,
    css: {
        padding: '10px',
        borderRadius: '5px',
        border: '1px solid #ccc'
    }
});

['read', 'write', 'admin'].forEach(perm => {
    $('option', {
        parent: permissionSelect,
        attrs: { value: perm },
        text: perm.charAt(0).toUpperCase() + perm.slice(1)
    });
});

// Create share button
Button({
    text: 'Share',
    parent: sharingSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#9b59b6',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            log('Please login first', 'warn');
            return;
        }

        const resourceType = resourceTypeSelect.value;
        const resourceId = resourceIdInput.value;
        const targetUserId = targetUserInput.value;
        const permission = permissionSelect.value;

        if (!resourceId || !targetUserId) {
            log('Please enter resource ID and target user ID', 'warn');
            return;
        }

        log(`Sharing ${resourceType} "${resourceId}" with user ${targetUserId} (${permission})...`);

        try {
            const response = await fetch('/api/share/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    resource_type: resourceType,
                    resource_id: resourceId,
                    target_user_id: targetUserId,
                    permission
                })
            });

            const data = await response.json();

            if (data.success) {
                log(`Share created: ${data.data.id}`, 'success');
            } else {
                log(`Share failed: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// Shares list container
const sharesListContainer = $('div', {
    parent: '#view',
    id: 'shares-list-container',
    css: {
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        padding: '15px',
        marginBottom: '20px',
        maxHeight: '200px',
        overflowY: 'auto'
    }
});

$('div', {
    parent: sharesListContainer,
    css: { color: '#666', fontStyle: 'italic' },
    text: 'Click "My Shares" or "Shared With Me" to load...'
});

const sharesButtonsSection = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        marginBottom: '20px'
    }
});

// My shares button
Button({
    text: 'My Shares',
    parent: sharesButtonsSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#9b59b6',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            log('Please login first', 'warn');
            return;
        }

        try {
            const response = await fetch('/api/share/my-shares', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                sharesListContainer.innerHTML = '';

                if (data.data.length === 0) {
                    $('div', {
                        parent: sharesListContainer,
                        css: { color: '#666', fontStyle: 'italic' },
                        text: 'No shares created yet'
                    });
                } else {
                    data.data.forEach(share => {
                        const shareRow = $('div', {
                            parent: sharesListContainer,
                            css: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px',
                                backgroundColor: '#fff',
                                marginBottom: '5px',
                                borderRadius: '4px',
                                border: '1px solid #ddd'
                            }
                        });

                        $('span', {
                            parent: shareRow,
                            text: `📤 ${share.resource_type}/${share.resource_id} → ${share.target_user_id}`
                        });

                        $('span', {
                            parent: shareRow,
                            css: {
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: '#9b59b6',
                                color: 'white',
                                fontSize: '11px'
                            },
                            text: share.permission === 1 ? 'READ' : share.permission === 2 ? 'WRITE' : 'ADMIN'
                        });
                    });
                }

                log(`Loaded ${data.data.length} shares`, 'success');
            } else {
                log(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// Shared with me button
Button({
    text: 'Shared With Me',
    parent: sharesButtonsSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#3498db',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
            log('Please login first', 'warn');
            return;
        }

        try {
            const response = await fetch('/api/share/shared-with-me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                sharesListContainer.innerHTML = '';

                if (data.data.length === 0) {
                    $('div', {
                        parent: sharesListContainer,
                        css: { color: '#666', fontStyle: 'italic' },
                        text: 'Nothing shared with you yet'
                    });
                } else {
                    data.data.forEach(share => {
                        const shareRow = $('div', {
                            parent: sharesListContainer,
                            css: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px',
                                backgroundColor: '#e3f2fd',
                                marginBottom: '5px',
                                borderRadius: '4px',
                                border: '1px solid #bbdefb'
                            }
                        });

                        $('span', {
                            parent: shareRow,
                            text: `📥 ${share.resource_type}/${share.resource_id} ← ${share.owner_id}`
                        });

                        $('span', {
                            parent: shareRow,
                            css: {
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: '#3498db',
                                color: 'white',
                                fontSize: '11px'
                            },
                            text: share.permission === 1 ? 'READ' : share.permission === 2 ? 'WRITE' : 'ADMIN'
                        });
                    });
                }

                log(`Loaded ${data.data.length} shares`, 'success');
            } else {
                log(`Error: ${data.error}`, 'error');
            }
        } catch (error) {
            log(`Error: ${error.message}`, 'error');
        }
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function updatePendingCount() {
    if (window.Atome) {
        const count = Atome.getPendingCount();
        pendingOpsStatus.$({
            css: { backgroundColor: count > 0 ? '#ffc107' : '#666' },
            text: `📤 Pending: ${count}`
        });
    }
}

/**
 * Clear the visual area and show placeholder
 */
function clearVisualArea() {
    const area = document.getElementById('visual-test-area');
    if (area) {
        area.innerHTML = '';
        $('p', {
            parent: area,
            css: { color: '#999', margin: '0' },
            text: 'Created Atomes will appear here when reconstructed'
        });
    }
}

/**
 * Load user's atomes from server and display them
 */
async function loadUserAtomes() {
    if (!Atome.isAuthenticated()) {
        return;
    }
    
    try {
        log('Loading your atomes...', 'info');
        const result = await Atome.list({ kind: 'shape' });
        
        if (result.success && result.data && result.data.length > 0) {
            // Clear placeholder
            const area = document.getElementById('visual-test-area');
            if (area) {
                area.innerHTML = '';
                
                // Recreate each atome visually
                result.data.forEach(atome => {
                    const css = atome.properties?.css || {
                        width: '80px',
                        height: '80px',
                        backgroundColor: '#666',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    };
                    
                    $('div', {
                        parent: area,
                        id: atome.id,
                        css: css,
                        text: atome.properties?.text || '⚛️',
                        onclick: function () {
                            this.style.transform = this.style.transform === 'scale(1.2)' ? 'scale(1)' : 'scale(1.2)';
                        }
                    });
                });
                
                log(`Loaded ${result.data.length} atomes`, 'success');
            }
        } else {
            log('No atomes found', 'info');
        }
    } catch (error) {
        log(`Error loading atomes: ${error.message}`, 'error');
    }
}

// Check initial auth status by calling the /me endpoint
async function checkAuthStatus() {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
        log('No auth token found', 'info');
        clearVisualArea();
        return;
    }

    try {
        const response = await fetch(`${apiBase}${authPrefix}/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success && data.user) {
            authStatus.$({
                css: { backgroundColor: '#6bcb77' },
                text: `🔓 ${data.user.username || data.user.phone || 'User'}`
            });
            log(`Already logged in as: ${data.user.username || data.user.phone}`, 'info');
            
            // Load user's atomes after successful auth check
            await loadUserAtomes();
        } else {
            // Token invalid, clear it
            localStorage.removeItem(TOKEN_KEY);
            clearVisualArea();
            log('Session expired, please login again', 'warn');
        }
    } catch (error) {
        log(`Auth check error: ${error.message}`, 'error');
    }

    updatePendingCount();
}

// Listen for Atome events
window.addEventListener('atome:created', (e) => {
    log(`[Event] Atome created: ${e.detail.data?.id}`, 'info');
});

window.addEventListener('atome:updated', (e) => {
    log(`[Event] Atome updated: ${e.detail.data?.id}`, 'info');
});

window.addEventListener('atome:synced', (e) => {
    log(`[Event] Sync complete: ${e.detail.results?.length || 0} ops, ${e.detail.pending} pending`, 'info');
});

// Initialize
checkAuthStatus();
log('Socket & Atome Test initialized', 'success');

export default {};
