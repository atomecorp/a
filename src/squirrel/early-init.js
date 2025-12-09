/**
 * 🛡️ SQUIRREL EARLY INIT - Error Handler Installation
 * 
 * This script MUST be loaded synchronously (NOT as a module) BEFORE any other scripts.
 * It prevents Tauri WebView from reloading on unhandled promise rejections.
 * 
 * Usage in HTML: <script src="squirrel/early-init.js"></script>
 * (without type="module" to ensure synchronous execution)
 */

(function () {
    'use strict';

    if (window._squirrelEarlyInitDone) return;
    window._squirrelEarlyInitDone = true;

    // ═══════════════════════════════════════════════════════════════════════════
    // TAURI AVAILABILITY TRACKING (via HTTP fetch - silent, no console errors)
    // ═══════════════════════════════════════════════════════════════════════════

    var loadTime = Date.now();
    var tauriAvailable = false; // Start assuming unavailable - will be updated
    var tauriCheckInterval = null;
    window._tauriAvailable = false; // Expose globally for other modules

    /**
     * Check Tauri availability using HTTP fetch (silent - no console errors)
     * Uses fetch instead of WebSocket to avoid Safari console errors
     */
    function checkTauriViaHttp() {
        return new Promise(function (resolve) {
            // If we're in Tauri environment, assume it's available
            if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
                tauriAvailable = true;
                window._tauriAvailable = true;
                if (!window._tauriInitLogged) {
                    window._tauriInitLogged = true;
                    console.log('[Squirrel] ✅ Tauri environment detected');
                }
                resolve(true);
                return;
            }
            
            // Only check on localhost (dev environment)
            var hostname = window.location.hostname || '';
            var isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1' || 
                             hostname === '' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
            
            if (!isLocalDev) {
                tauriAvailable = false;
                window._tauriAvailable = false;
                resolve(false);
                return;
            }

            // Use fetch with timeout to check if Tauri server is running
            var controller = new AbortController();
            var timeoutId = setTimeout(function() { controller.abort(); }, 2000);

            fetch('http://127.0.0.1:3000/api/auth/local/me', {
                method: 'GET',
                signal: controller.signal,
                credentials: 'omit',
                headers: { 'Accept': 'application/json' }
            })
            .then(function() {
                clearTimeout(timeoutId);
                var wasOffline = tauriAvailable === false && window._tauriInitLogged !== true;
                tauriAvailable = true;
                window._tauriAvailable = true;

                if (!window._tauriInitLogged) {
                    window._tauriInitLogged = true;
                    console.log('[Squirrel] ✅ Tauri server detected');
                } else if (wasOffline) {
                    console.log('[Squirrel] 🔄 Tauri server reconnected');
                    window.dispatchEvent(new CustomEvent('squirrel:tauri-reconnected'));
                }

                // Stop checking interval since server is available
                if (tauriCheckInterval) {
                    clearInterval(tauriCheckInterval);
                    tauriCheckInterval = null;
                }

                resolve(true);
            })
            .catch(function() {
                clearTimeout(timeoutId);
                tauriAvailable = false;
                window._tauriAvailable = false;

                // Start periodic check if not running
                if (!tauriCheckInterval) {
                    tauriCheckInterval = setInterval(checkTauriViaHttp, 30000);
                }
                resolve(false);
            });
        });
    }

    // Backwards compatibility alias
    var checkTauriViaWebSocket = checkTauriViaHttp;

    // Tauri availability detection:
    // - If __TAURI__ exists, we're in Tauri app, mark as available immediately
    // - Otherwise, start with null (unknown) - will be determined on first ping
    // This allows browser clients to connect to Tauri server if it's running
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
        tauriAvailable = true;
        window._tauriAvailable = true;
        console.log('[Squirrel] ✅ Tauri runtime detected');
    } else {
        // Unknown - will be determined when checkBackends() does a ping
        tauriAvailable = null;
        window._tauriAvailable = false;
    }

    function remoteLog(level, message, data) {
        // Only log locally - no remote logging to avoid XHR errors
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Squirrel]', message, data || '');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL: Prevent Tauri WebView reload on unhandled promise rejections
    // ═══════════════════════════════════════════════════════════════════════════

    // Capture phase - catches rejections first
    window.addEventListener('unhandledrejection', function (e) {
        var reason = e.reason;
        var reasonStr = 'Unknown';
        var reasonData = null;

        try {
            if (reason === null || reason === undefined) {
                reasonStr = String(reason);
            } else if (typeof reason === 'string') {
                reasonStr = reason;
            } else if (reason instanceof Error) {
                reasonStr = reason.message || reason.toString();
                reasonData = { name: reason.name, stack: reason.stack };
            } else if (typeof reason === 'object') {
                reasonStr = reason.message || reason.error || JSON.stringify(reason).substring(0, 500);
                reasonData = reason;
            } else {
                reasonStr = String(reason);
            }
        } catch (ex) {
            reasonStr = 'Could not stringify reason: ' + ex.message;
        }

        remoteLog('error', '⛔ Unhandled Promise Rejection (PREVENTED)', {
            reason: reasonStr,
            reasonData: reasonData,
            stack: reason && reason.stack ? reason.stack : null
        });
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    }, true);

    // Bubble phase - backup handler
    window.addEventListener('unhandledrejection', function (e) {
        e.preventDefault();
        return false;
    }, false);

    // Global error handler
    window.onerror = function (msg, url, line, col, error) {
        remoteLog('error', '⛔ Uncaught error (PREVENTED)', {
            message: msg,
            url: url,
            line: line,
            col: col,
            stack: error && error.stack ? error.stack : null
        });
        return true; // Prevents default handling
    };

    // Error event handler (catches more errors)
    window.addEventListener('error', function (e) {
        remoteLog('error', '⛔ Error event (PREVENTED)', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno
        });
        e.preventDefault();
        return false;
    }, true);

    // ═══════════════════════════════════════════════════════════════════════════
    // SILENT SERVER DETECTION VIA WEBSOCKET (no console errors)
    // ═══════════════════════════════════════════════════════════════════════════

    var originalFetch = window.fetch;
    var fastifyAvailable = null; // null = unknown, true = online, false = offline
    var fastifyWs = null;
    var pendingFastifyRequests = []; // Queue of pending requests when Fastify is offline
    var fastifyCheckInterval = null;

    /**
     * Check Fastify availability using WebSocket (silent - no console errors)
     * WebSocket errors don't appear in console unlike fetch errors
     */
    function checkFastifyViaWebSocket() {
        return new Promise(function (resolve) {
            // If already connected, just return true
            if (fastifyWs && fastifyWs.readyState === WebSocket.OPEN) {
                resolve(true);
                return;
            }

            // Close any existing connection
            if (fastifyWs) {
                try { fastifyWs.close(); } catch (e) { }
                fastifyWs = null;
            }

            try {
                fastifyWs = new WebSocket('ws://127.0.0.1:3001/ws/sync');

                var timeout = setTimeout(function () {
                    if (fastifyWs) {
                        try { fastifyWs.close(); } catch (e) { }
                        fastifyWs = null;
                    }
                    fastifyAvailable = false;
                    resolve(false);
                }, 3000);

                fastifyWs.onopen = function () {
                    clearTimeout(timeout);
                    var wasOffline = fastifyAvailable === false;
                    fastifyAvailable = true;

                    if (wasOffline) {
                        console.log('[Squirrel] ✅ Fastify server reconnected');
                        processPendingFastifyRequests();
                    }

                    // Stop checking interval since we're connected
                    if (fastifyCheckInterval) {
                        clearInterval(fastifyCheckInterval);
                        fastifyCheckInterval = null;
                    }

                    resolve(true);
                };

                fastifyWs.onerror = function () {
                    // Silent - no console error with WebSocket
                    clearTimeout(timeout);
                    fastifyAvailable = false;
                    fastifyWs = null;

                    // Start periodic check if not running
                    if (!fastifyCheckInterval) {
                        fastifyCheckInterval = setInterval(checkFastifyViaWebSocket, 10000);
                    }
                    resolve(false);
                };

                fastifyWs.onclose = function () {
                    if (fastifyAvailable === true) {
                        fastifyAvailable = false;
                        // Start periodic check to detect reconnection
                        if (!fastifyCheckInterval) {
                            fastifyCheckInterval = setInterval(checkFastifyViaWebSocket, 10000);
                        }
                    }
                    fastifyWs = null;
                };

            } catch (e) {
                fastifyAvailable = false;
                resolve(false);
            }
        });
    }

    // Process queued requests when Fastify comes back online
    function processPendingFastifyRequests() {
        if (pendingFastifyRequests.length === 0) return;

        console.log('[Squirrel] 🔄 Processing ' + pendingFastifyRequests.length + ' pending Fastify requests');

        var requests = pendingFastifyRequests.slice();
        pendingFastifyRequests = [];

        requests.forEach(function (pending) {
            originalFetch(pending.url, pending.options)
                .then(pending.resolve)
                .catch(pending.reject);
        });
    }

    // Only check Fastify if we're on localhost (dev environment)
    // This avoids WebSocket connection errors in production
    var isLocalDev = (function () {
        var hostname = window.location?.hostname || '';
        return hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.');
    })();

    // DON'T check at startup - wait for first actual request
    // This prevents WebSocket errors in console
    // The first fetch to localhost will trigger the check
    fastifyAvailable = null; // null = unknown, will be determined on first request

    window.fetch = function (url, options) {
        var urlStr = typeof url === 'string' ? url : (url && url.url) || String(url);

        var isTauriRequest = urlStr.includes('127.0.0.1:3000') || urlStr.includes('localhost:3000');
        var isFastifyRequest = urlStr.includes('127.0.0.1:3001') || urlStr.includes('localhost:3001');
        var isPingRequest = urlStr.includes('/api/server-info');

        // ALWAYS allow ping requests - they're used to check server availability
        // Only block non-ping requests when we know the server is offline

        // Block non-ping requests to Tauri if we know it's offline
        if (isTauriRequest && tauriAvailable === false && !isPingRequest) {
            return Promise.reject(new Error('Tauri server unreachable'));
        }

        // For Fastify: queue request if offline, it will be processed when server comes back
        if (isFastifyRequest && fastifyAvailable === false && !isPingRequest) {
            // Queue the request for later
            return new Promise(function (resolve, reject) {
                pendingFastifyRequests.push({
                    url: url,
                    options: options,
                    resolve: resolve,
                    reject: reject,
                    timestamp: Date.now()
                });
                // Clean old requests (older than 5 minutes)
                var cutoff = Date.now() - 300000;
                pendingFastifyRequests = pendingFastifyRequests.filter(function (r) {
                    return r.timestamp > cutoff;
                });
            });
        }

        return originalFetch.apply(this, arguments)
            .then(function (response) {
                // Update availability on success
                if (isTauriRequest) {
                    tauriAvailable = true;
                    window._tauriAvailable = true;
                }
                if (isFastifyRequest) {
                    fastifyAvailable = true;
                }
                return response;
            })
            .catch(function (error) {
                // Update availability on failure
                if (isTauriRequest) {
                    tauriAvailable = false;
                    window._tauriAvailable = false;
                }
                if (isFastifyRequest) {
                    fastifyAvailable = false;
                    lastFastifyCheck = Date.now();
                    // Start periodic check
                    if (!fastifyCheckInterval) {
                        fastifyCheckInterval = setInterval(checkFastifySilently, 10000);
                    }
                }
                throw error;
            });
    };

    // Expose Fastify availability check
    window._checkFastifyAvailable = function () {
        return fastifyAvailable;
    };

    // Expose function to manually trigger reconnection check
    window._recheckFastify = checkFastifyViaWebSocket;

    // Expose WebSocket connection for other modules
    window._getFastifyWs = function () {
        return fastifyWs;
    };

    // Silent init - no log spam
})();
