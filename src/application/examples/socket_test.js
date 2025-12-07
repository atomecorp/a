/**
 * Socket & Atome Sync Test
 * 
 * Interactive demo testing:
 * 1. WebSocket connections (/ws/events, /ws/sync)
 * 2. Unified Atome API (create, update, delete, sync) via Unified APIs
 * 3. Authentication integration with dual-server support (UnifiedAuth)
 * 
 * Uses the unified API modules for all operations
 */

import { UnifiedAtome, UnifiedAuth, UnifiedSync, isAuthenticated, TauriAdapter, FastifyAdapter } from '../../squirrel/apis/unified/index.js';
import { getLocalServerUrl, getCloudServerUrl, isTauri } from '../../squirrel/apis/serverUrls.js';

// ============================================================================
// API CONFIGURATION
// ============================================================================

// Server URLs constants for dual-server testing
const TAURI_SERVER = getLocalServerUrl() || 'http://127.0.0.1:3000';
const FASTIFY_SERVER = getCloudServerUrl();

// Server availability tracking (updated from UnifiedAtome)
let tauriServerAvailable = false;
let fastifyServerAvailable = false;

/**
 * Detect which servers are available at startup
 * Uses the unified module for silent detection
 */
async function detectAvailableServers() {
    console.log('[socket_test] Detecting available servers...');

    const status = await UnifiedAuth.checkAvailability();
    tauriServerAvailable = status.tauri;
    fastifyServerAvailable = status.fastify;

    console.log('[socket_test] Server availability:', {
        tauri: tauriServerAvailable ? 'UP' : 'DOWN/SKIPPED',
        fastify: fastifyServerAvailable ? 'UP' : 'DOWN'
    });

    return status;
}

// Determine auth config based on environment
const useLocalAuth = isTauri();
const authPrefix = useLocalAuth ? '/api/auth/local' : '/api/auth';
const TOKEN_KEY = useLocalAuth ? 'local_auth_token' : 'cloud_auth_token';

console.log('[socket_test] API config:', { useLocalAuth, authPrefix, TOKEN_KEY });

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

        log(`Attempting login via UnifiedAuth: ${identifier}...`);

        // Use UnifiedAuth - handles both backends automatically
        const result = await UnifiedAuth.login({
            username: identifier,
            phone: identifier,
            password
        });

        if (result.success) {
            const userData = result.user;
            localStorage.setItem('user_data', JSON.stringify(userData));

            authStatus.$({
                css: { backgroundColor: '#6bcb77' },
                text: `🔓 ${userData?.username || identifier}`
            });

            log(`✅ Logged in: Tauri=${result.backends?.tauri}, Fastify=${result.backends?.fastify}`, 'success');
            updatePendingCount();

            // Load user's atomes after login
            await loadUserAtomes();
        } else {
            log(`❌ Login failed: ${result.error}`, 'error');
            if (result.backends) {
                log(`Backend details: Tauri=${result.backends.tauri?.error || 'N/A'}, Fastify=${result.backends.fastify?.error || 'N/A'}`, 'warn');
            }
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
    onAction: async () => {
        // Use UnifiedAuth for logout - handles both backends
        const result = await UnifiedAuth.logout();

        if (result.success) {
            log(`✅ Logged out: Tauri=${result.backends?.tauri}, Fastify=${result.backends?.fastify}`, 'info');
        } else {
            log(`Logout: ${result.error || 'Completed with warnings'}`, 'warn');
        }

        // Clear user data from localStorage
        localStorage.removeItem('user_data');

        authStatus.$({
            css: { backgroundColor: '#ff6b6b' },
            text: '🔒 Not Logged In'
        });

        // Clear visual area on logout - user's objects should not be visible
        clearVisualArea();
    }
});

// Register button
Button({
    text: 'Register',
    parent: authSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#28a745',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        const phone = loginInput.value;
        const password = passwordInput.value;

        if (!phone || !password) {
            log('Please enter phone and password to register', 'warn');
            return;
        }

        // Use phone as username for simplicity
        const username = phone;

        log(`Registering via UnifiedAuth: ${phone}...`);

        // Use UnifiedAuth - handles both backends automatically
        const result = await UnifiedAuth.register({
            username,
            phone,
            password
        });

        if (result.success) {
            const userData = result.user;
            localStorage.setItem('user_data', JSON.stringify(userData));

            authStatus.$({
                css: { backgroundColor: '#6bcb77' },
                text: `🔓 ${userData?.username || phone}`
            });

            log(`✅ Account created! User ID: ${userData?.id}`, 'success');
            log(`Backends: Tauri=${result.backends?.tauri}, Fastify=${result.backends?.fastify}`, 'info');
        } else {
            log(`❌ Registration failed: ${result.error}`, 'error');
            if (result.backends) {
                if (result.backends.tauri?.error) log(`Tauri: ${result.backends.tauri.error}`, 'warn');
                if (result.backends.fastify?.error) log(`Fastify: ${result.backends.fastify.error}`, 'warn');
            }
        }
    }
});

// Delete Account button
Button({
    text: 'Delete Account',
    parent: authSection,
    css: {
        padding: '10px 20px',
        backgroundColor: '#6c757d',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        position: 'relative'
    },
    onAction: async () => {
        // Check for ANY token (local or cloud)
        const localToken = localStorage.getItem('local_auth_token');
        const cloudToken = localStorage.getItem('cloud_auth_token');

        if (!localToken && !cloudToken) {
            log('You must be logged in to delete your account', 'warn');
            return;
        }

        // Create modal overlay using Squirrel syntax
        const modalOverlay = $('div', {
            id: 'delete-account-modal',
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: '10000'
            }
        });

        // Modal container
        const modalContainer = $('div', {
            parent: modalOverlay,
            css: {
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                width: '350px',
                maxWidth: '90vw',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }
        });

        // Modal header
        const modalHeader = $('div', {
            parent: modalContainer,
            css: {
                padding: '15px 20px',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f8f9fa'
            }
        });

        $('h3', {
            parent: modalHeader,
            text: '🗑️ Delete Account',
            css: {
                margin: '0',
                fontSize: '1.1em',
                color: '#333'
            }
        });

        // Close button
        const closeBtn = $('span', {
            parent: modalHeader,
            text: '✕',
            css: {
                cursor: 'pointer',
                fontSize: '18px',
                color: '#666',
                padding: '5px'
            }
        });
        closeBtn.onclick = () => modalOverlay.remove();

        // Modal content
        const modalContent = $('div', {
            parent: modalContainer,
            css: {
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px'
            }
        });

        $('p', {
            parent: modalContent,
            text: '⚠️ Are you sure you want to delete your account? This cannot be undone!',
            css: {
                color: '#dc3545',
                fontWeight: 'bold',
                margin: '0',
                fontSize: '14px'
            }
        });

        $('label', {
            parent: modalContent,
            text: 'Enter your password to confirm:',
            css: {
                color: '#333',
                fontSize: '14px'
            }
        });

        const passwordInput = $('input', {
            parent: modalContent,
            id: 'delete-account-password',
            css: {
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                width: '100%',
                boxSizing: 'border-box'
            }
        });
        passwordInput.type = 'password';
        passwordInput.placeholder = 'Your password';

        // Modal footer with buttons
        const modalFooter = $('div', {
            parent: modalContainer,
            css: {
                padding: '15px 20px',
                borderTop: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                backgroundColor: '#f8f9fa'
            }
        });

        // Cancel button
        Button({
            parent: modalFooter,
            text: 'Cancel',
            css: {
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            onAction: () => {
                log('Account deletion cancelled', 'info');
                modalOverlay.remove();
            }
        });

        // Delete button
        Button({
            parent: modalFooter,
            text: 'Delete Account',
            css: {
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer'
            },
            onAction: async () => {
                const password = document.getElementById('delete-account-password').value;

                if (!password) {
                    log('Password is required to delete account', 'error');
                    return;
                }

                log('Deleting account via UnifiedAuth...');

                // Use UnifiedAuth - handles both backends automatically
                const result = await UnifiedAuth.deleteAccount({ password });

                // Clear user data
                localStorage.removeItem('user_data');

                if (result.success) {
                    log(`✅ Account deleted: Tauri=${result.backends?.tauri}, Fastify=${result.backends?.fastify}`, 'success');

                    authStatus.$({
                        css: { backgroundColor: '#ff6b6b' },
                        text: '🔒 Not Logged In'
                    });

                    clearVisualArea();
                } else {
                    log(`❌ Delete failed: ${result.error}`, 'error');
                    if (result.backends) {
                        if (result.backends.tauri?.error) log(`Tauri: ${result.backends.tauri.error}`, 'warn');
                        if (result.backends.fastify?.error) log(`Fastify: ${result.backends.fastify.error}`, 'warn');
                    }
                }

                modalOverlay.remove();
            }
        });

        // Add modal to document
        document.body.appendChild(modalOverlay);

        // Focus password input
        setTimeout(() => passwordInput.focus(), 100);

        // Close on overlay click
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        };

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                modalOverlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
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
        wsEvents = new WebSocket(FASTIFY_SERVER.replace('http', 'ws') + '/ws/events');

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
        wsSync = new WebSocket(FASTIFY_SERVER.replace('http', 'ws') + '/ws/sync');

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
        if (!isAuthenticated()) {
            log('Please login first', 'warn');
            return;
        }

        log('Creating test Atome...');

        try {
            const result = await UnifiedAtome.create({
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
            const result = await UnifiedAtome.update(testAtomeId, {
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
            const result = await UnifiedAtome.delete(testAtomeId);

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
        log('Syncing servers and processing pending operations...');

        try {
            await UnifiedAtome.sync();
            log('Sync complete!', 'success');
            updatePendingCount();

            // Reload atomes to show synced data
            await loadUserAtomes();
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

// Track selected visual atome - use window for global scope access in callbacks
window.selectedVisualAtomeId = null;
window.updateVisualAtomeBtn = null;
window.deleteVisualAtomeBtn = null;

// Function to select a visual atome
window.selectVisualAtome = function (atomeId, element) {
    // Deselect previous
    if (window.selectedVisualAtomeId) {
        const prevElem = document.getElementById(window.selectedVisualAtomeId);
        if (prevElem) {
            prevElem.style.outline = 'none';
            prevElem.style.boxShadow = 'none';
        }
    }

    // Toggle selection
    if (window.selectedVisualAtomeId === atomeId) {
        window.selectedVisualAtomeId = null;
        log('Atome deselected', 'info');
    } else {
        window.selectedVisualAtomeId = atomeId;
        element.style.outline = '3px solid #007bff';
        element.style.boxShadow = '0 0 10px rgba(0,123,255,0.5)';
        log(`Selected atome: ${atomeId}`, 'info');
    }

    // Update button states
    window.updateVisualAtomeButtons();
};

// Function to update button states based on selection
window.updateVisualAtomeButtons = function () {
    if (window.updateVisualAtomeBtn) {
        window.updateVisualAtomeBtn.style.opacity = window.selectedVisualAtomeId ? '1' : '0.5';
        window.updateVisualAtomeBtn.style.pointerEvents = window.selectedVisualAtomeId ? 'auto' : 'none';
    }
    if (window.deleteVisualAtomeBtn) {
        window.deleteVisualAtomeBtn.style.opacity = window.selectedVisualAtomeId ? '1' : '0.5';
        window.deleteVisualAtomeBtn.style.pointerEvents = window.selectedVisualAtomeId ? 'auto' : 'none';
    }
};

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
    text: 'Created Atomes will appear here when reconstructed (click to select)'
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
        const localToken = localStorage.getItem('local_auth_token');
        const cloudToken = localStorage.getItem('cloud_auth_token');

        if (!localToken && !cloudToken) {
            log('Please login first', 'warn');
            return;
        }

        // Remove placeholder text if present (only first time)
        const placeholder = visualArea.querySelector('p');
        if (placeholder) placeholder.remove();

        // Generate a unique ID for the atome
        const atomeId = `atome_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        // Create atome data with explicit CSS properties
        const cssProps = {
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
        };

        const atomeData = {
            id: atomeId,
            kind: 'shape',
            tag: 'div',
            properties: {
                css: cssProps,
                text: '⚛️'
            }
        };

        // Use UnifiedAtome for creation (handles both servers automatically)
        try {
            const result = await UnifiedAtome.create(atomeData);

            if (result.success) {
                $('div', {
                    parent: visualArea,
                    id: atomeId,
                    css: cssProps,
                    text: '⚛️',
                    onclick: function () {
                        window.selectVisualAtome(atomeId, this);
                    }
                });
                log(`Visual Atome created: ${atomeId}`, 'success');
            } else if (result.queued) {
                // Still show visually but indicate it's queued
                $('div', {
                    parent: visualArea,
                    id: atomeId,
                    css: { ...cssProps, opacity: '0.7' },
                    text: '⏳',
                    onclick: function () {
                        window.selectVisualAtome(atomeId, this);
                    }
                });
                log(`Visual Atome queued: ${atomeId} (offline)`, 'warn');
            } else {
                log(`Failed to create atome: ${result.error}`, 'error');
            }

            updatePendingCount();
        } catch (error) {
            log(`Create error: ${error.message}`, 'error');
        }
    }
});

// Buttons container for visual atome actions
const visualAtomeActionsContainer = $('div', {
    parent: '#view',
    css: {
        display: 'flex',
        gap: '10px',
        marginTop: '10px',
        marginBottom: '10px'
    }
});

// Update Selected Atome button
window.updateVisualAtomeBtn = Button({
    text: 'Update Selected',
    parent: visualAtomeActionsContainer,
    id: 'update-visual-atome-btn',
    css: {
        padding: '10px 20px',
        backgroundColor: '#ff9800',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        opacity: '0.5',
        pointerEvents: 'none',
        position: 'relative'
    },
    onAction: async () => {
        if (!window.selectedVisualAtomeId) {
            log('No atome selected', 'warn');
            return;
        }

        // Update with new random color using UnifiedAtome
        const newColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
        const newBorderRadius = `${Math.random() * 50}%`;

        try {
            const result = await UnifiedAtome.update(window.selectedVisualAtomeId, {
                properties: {
                    css: {
                        backgroundColor: newColor,
                        borderRadius: newBorderRadius
                    }
                }
            });

            if (result.success || result.queued) {
                // Update visual element
                const elem = document.getElementById(window.selectedVisualAtomeId);
                if (elem) {
                    elem.style.backgroundColor = newColor;
                    elem.style.borderRadius = newBorderRadius;
                }
                log(`Updated atome: ${window.selectedVisualAtomeId}${result.queued ? ' (queued)' : ''}`, 'success');
            } else {
                log(`Update failed: ${result.error}`, 'error');
            }

            updatePendingCount();
        } catch (error) {
            log(`Update error: ${error.message}`, 'error');
        }
    }
});

// Delete Selected Atome button
window.deleteVisualAtomeBtn = Button({
    text: 'Delete Selected',
    parent: visualAtomeActionsContainer,
    id: 'delete-visual-atome-btn',
    css: {
        padding: '10px 20px',
        backgroundColor: '#f44336',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer',
        opacity: '0.5',
        pointerEvents: 'none',
        position: 'relative'
    },
    onAction: async () => {
        if (!window.selectedVisualAtomeId) {
            log('No atome selected', 'warn');
            return;
        }

        try {
            const result = await UnifiedAtome.delete(window.selectedVisualAtomeId);

            if (result.success || result.queued) {
                // Remove visual element
                const elem = document.getElementById(window.selectedVisualAtomeId);
                if (elem) elem.remove();

                log(`Deleted atome: ${window.selectedVisualAtomeId}${result.queued ? ' (queued)' : ''}`, 'success');
                window.selectedVisualAtomeId = null;
                window.updateVisualAtomeButtons();
            } else {
                log(`Delete failed: ${result.error}`, 'error');
            }

            updatePendingCount();
        } catch (error) {
            log(`Delete error: ${error.message}`, 'error');
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
    // Use UnifiedAtome for pending count
    const count = UnifiedAtome.getPendingCount();
    pendingOpsStatus.$({
        css: { backgroundColor: count > 0 ? '#ffc107' : '#666' },
        text: `📤 Pending: ${count}`
    });
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
            text: 'Created Atomes will appear here when reconstructed (click to select)'
        });
    }

    // Reset selection state
    window.selectedVisualAtomeId = null;
    window.updateVisualAtomeButtons();
}

/**
 * Load user's atomes from available servers and display them
 * Uses UnifiedAtome.list() for unified fetching
 */
async function loadUserAtomes() {
    if (!isAuthenticated()) {
        return;
    }

    log('Loading your atomes from available servers...', 'info');

    try {
        const result = await UnifiedAtome.list({ kind: 'shape' });

        if (result.success && result.data && result.data.length > 0) {
            const atomesList = result.data;

            // Clear placeholder
            const area = document.getElementById('visual-test-area');
            if (area) {
                area.innerHTML = '';

                // Reset selection state
                window.selectedVisualAtomeId = null;
                window.updateVisualAtomeButtons();

                // Recreate each atome visually with selection support
                atomesList.forEach(atome => {
                    const css = atome.properties?.css || atome.data?.css || {
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

                    const atomeId = atome.id;
                    $('div', {
                        parent: area,
                        id: atomeId,
                        css: css,
                        text: atome.properties?.text || atome.data?.text || '⚛️',
                        onclick: function () {
                            window.selectVisualAtome(atomeId, this);
                        }
                    });
                });

                log(`Total: ${atomesList.length} unique atomes loaded`, 'success');
            }
        } else {
            log('No atomes found', 'info');
        }
    } catch (error) {
        console.debug('[loadUserAtomes] Error:', error.message);
        log('No atomes found', 'info');
    }
}

// Check initial auth status using UnifiedAuth.me()
async function checkAuthStatus() {
    console.log('[checkAuthStatus] Checking authentication status via UnifiedAuth...');

    // Use UnifiedAuth.me() - handles both backends automatically
    const result = await UnifiedAuth.me();

    console.log('[checkAuthStatus] UnifiedAuth.me result:', result);

    if (result.success && result.user) {
        const userData = result.user;

        authStatus.$({
            css: { backgroundColor: '#6bcb77' },
            text: `🔓 ${userData.username || userData.phone || 'User'}`
        });
        localStorage.setItem('user_data', JSON.stringify(userData));

        log(`Session restored: ${userData.username || userData.phone} (source: ${result.source})`, 'success');

        // Load user's atomes after successful auth check
        await loadUserAtomes();
    } else {
        clearVisualArea();
        if (result.error === 'No authentication token found') {
            log('No auth token found', 'info');
        } else {
            log('Session expired, please login again', 'warn');
        }
    }

    updatePendingCount();
}

// Listen for Atome events (local, from Atome.create/update/delete)
window.addEventListener('atome:created', (e) => {
    log(`[Local] Atome created: ${e.detail.data?.id}`, 'info');
});

window.addEventListener('atome:updated', (e) => {
    log(`[Local] Atome updated: ${e.detail.data?.id}`, 'info');
});

window.addEventListener('atome:synced', (e) => {
    log(`[Sync] Complete: ${e.detail.results?.length || 0} ops, ${e.detail.pending} pending`, 'info');
});

// Listen for REAL-TIME Atome sync events (from WebSocket, other clients)
window.addEventListener('squirrel:atome-created', (e) => {
    const atome = e.detail;
    log(`[Sync] 🆕 Remote atome created: ${atome?.id}`, 'success');

    // Add the new atome visually if it belongs to current user
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && atome) {
        try {
            const [, payload] = token.split('.');
            const decoded = JSON.parse(atob(payload));
            const currentUserId = decoded.sub || decoded.id || decoded.userId;

            // Only show if created by current user (or no created_by for legacy)
            if (!atome.created_by || atome.created_by === currentUserId) {
                const area = document.getElementById('visual-test-area');
                if (area && !document.getElementById(atome.id)) {
                    const css = atome.properties?.css || {
                        width: '80px', height: '80px', backgroundColor: '#66bb6a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 'bold', cursor: 'pointer'
                    };
                    $('div', {
                        parent: area,
                        id: atome.id,
                        css: css,
                        text: atome.properties?.text || '⚛️',
                        onclick: function () {
                            window.selectVisualAtome(atome.id, this);
                        }
                    });
                }
            }
        } catch (err) {
            console.warn('[Sync] Could not process created atome:', err);
        }
    }
});

window.addEventListener('squirrel:atome-updated', (e) => {
    const atome = e.detail;
    log(`[Sync] ✏️ Remote atome updated: ${atome?.id}`, 'info');

    // Update the visual element if it exists
    if (atome?.id) {
        const el = document.getElementById(atome.id);
        if (el && atome.properties) {
            // Apply CSS updates
            if (atome.properties.css) {
                Object.assign(el.style, atome.properties.css);
            }
            // Apply text update
            if (atome.properties.text !== undefined) {
                el.textContent = atome.properties.text;
            }
        }
    }
});

window.addEventListener('squirrel:atome-deleted', (e) => {
    const atome = e.detail;
    log(`[Sync] 🗑️ Remote atome deleted: ${atome?.id}`, 'warn');

    // Remove the visual element
    if (atome?.id) {
        const el = document.getElementById(atome.id);
        if (el) {
            el.remove();
            // Clear selection if this was the selected atome
            if (window.selectedVisualAtomeId === atome.id) {
                window.selectedVisualAtomeId = null;
                window.updateVisualAtomeButtons();
            }
        }
    }
});

// ============================================================================
// AUTO-CONNECT WEBSOCKET FOR REAL-TIME SYNC
// ============================================================================
function connectSyncWebSocket() {
    if (wsSync && wsSync.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    console.log('[WebSocket] Connecting to /ws/sync for real-time updates...');
    wsSync = new WebSocket(FASTIFY_SERVER.replace('http', 'ws') + '/ws/sync');

    wsSync.onopen = () => {
        wsSyncStatus.$({ css: { backgroundColor: '#6bcb77' }, text: '🟢 /ws/sync' });
        log('WebSocket connected for real-time sync', 'success');
    };

    wsSync.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('[WebSocket] Message received:', data.type);

            // Handle atome sync events
            if (data.type === 'atome:created' && data.atome) {
                log(`[Sync] 🆕 Atome created: ${data.atome.id}`, 'success');

                // Add visually if not already present
                const area = document.getElementById('visual-test-area');
                if (area && !document.getElementById(data.atome.id)) {
                    const css = data.atome.properties?.css || {
                        width: '80px', height: '80px', backgroundColor: '#66bb6a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 'bold', cursor: 'pointer'
                    };
                    $('div', {
                        parent: area,
                        id: data.atome.id,
                        css: css,
                        text: data.atome.properties?.text || '⚛️',
                        onclick: function () { window.selectVisualAtome(data.atome.id, this); }
                    });
                    // Remove placeholder if present
                    const placeholder = area.querySelector('p');
                    if (placeholder) placeholder.remove();
                }
            }

            if (data.type === 'atome:updated' && data.atome) {
                log(`[Sync] ✏️ Atome updated: ${data.atome.id}`, 'info');
                const el = document.getElementById(data.atome.id);
                if (el && data.atome.properties?.css) {
                    Object.assign(el.style, data.atome.properties.css);
                }
            }

            if (data.type === 'atome:deleted' && data.atome) {
                log(`[Sync] 🗑️ Atome deleted: ${data.atome.id}`, 'warn');
                const el = document.getElementById(data.atome.id);
                if (el) {
                    el.remove();
                    if (window.selectedVisualAtomeId === data.atome.id) {
                        window.selectedVisualAtomeId = null;
                        window.updateVisualAtomeButtons();
                    }
                }
            }
        } catch (e) {
            console.log('[WebSocket] Raw message:', event.data);
        }
    };

    wsSync.onclose = () => {
        wsSyncStatus.$({ css: { backgroundColor: '#666' }, text: '⚪ /ws/sync' });
        log('WebSocket disconnected, reconnecting in 3s...', 'warn');
        // Auto-reconnect after 3 seconds
        setTimeout(connectSyncWebSocket, 3000);
    };

    wsSync.onerror = (err) => {
        console.warn('[WebSocket] Error:', err);
    };
}

// Initialize - detect servers first, then check auth
(async () => {
    await detectAvailableServers();

    // Update UI to show server status
    if (!tauriServerAvailable && !fastifyServerAvailable) {
        log('⚠️ No server available - running in offline mode', 'warn');
    } else {
        const servers = [];
        if (tauriServerAvailable) servers.push('Tauri (local)');
        if (fastifyServerAvailable) servers.push('Fastify (cloud)');
        log(`Servers available: ${servers.join(', ')}`, 'success');
    }

    await checkAuthStatus();

    // Only connect WebSocket if Fastify is available
    if (fastifyServerAvailable) {
        connectSyncWebSocket();
    }

    log('Socket & Atome Test initialized', 'success');
})();

export default {};
