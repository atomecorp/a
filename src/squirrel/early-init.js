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
    // TAURI AVAILABILITY TRACKING
    // ═══════════════════════════════════════════════════════════════════════════

    var loadTime = Date.now();
    var tauriAvailable = false; // Start assuming unavailable - will be updated
    window._tauriAvailable = false; // Expose globally for other modules

    // Silent check using fetch (no XHR errors in console)
    function checkTauriSilently() {
        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 1500);

        return fetch('http://127.0.0.1:3000/api/server-info', {
            method: 'GET',
            signal: controller.signal
        })
            .then(function (response) {
                clearTimeout(timeoutId);
                tauriAvailable = response.ok;
                window._tauriAvailable = tauriAvailable;
                if (tauriAvailable) {
                    console.log('[Squirrel] ✅ Tauri server detected');
                }
                return tauriAvailable;
            })
            .catch(function () {
                clearTimeout(timeoutId);
                tauriAvailable = false;
                window._tauriAvailable = false;
                return false;
            });
    }

    // Check immediately
    checkTauriSilently();

    // Re-check periodically (every 30 seconds) in case Tauri starts later
    setInterval(function () {
        var wasAvailable = tauriAvailable;
        checkTauriSilently().then(function (isNowAvailable) {
            if (!wasAvailable && isNowAvailable) {
                console.log('[Squirrel] 🔄 Tauri server reconnected - triggering sync');
                // Dispatch event for sync modules to pick up
                window.dispatchEvent(new CustomEvent('squirrel:tauri-reconnected'));
            }
        });
    }, 30000);

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
    // DEBUG: Intercept all fetch calls to track what triggers reload
    // ═══════════════════════════════════════════════════════════════════════════

    var originalFetch = window.fetch;
    window.fetch = function (url, options) {
        var urlStr = typeof url === 'string' ? url : (url && url.url) || String(url);
        var method = (options && options.method) || 'GET';

        // Skip logging for Tauri if we know it's not available
        var isTauriRequest = urlStr.includes('3000');

        // Only log if Tauri is available or status is unknown
        if (isTauriRequest && tauriAvailable !== false) {
            remoteLog('info', '📡 FETCH to Tauri', { method: method, url: urlStr });
        }

        return originalFetch.apply(this, arguments)
            .then(function (response) {
                if (isTauriRequest && tauriAvailable !== false) {
                    tauriAvailable = true; // Now we know it's available
                    remoteLog('info', '✅ FETCH response from Tauri', {
                        status: response.status,
                        url: urlStr
                    });
                }
                return response;
            })
            .catch(function (error) {
                if (isTauriRequest) {
                    // Mark Tauri as unavailable to stop future spam
                    tauriAvailable = false;
                    // Only log once, not for every failed request
                    if (!window._tauriErrorLogged) {
                        window._tauriErrorLogged = true;
                        console.warn('[Squirrel] Tauri server not available - using Fastify only');
                    }
                }
                throw error;
            });
    };

    // Only log init complete if not spamming
    if (tauriAvailable !== false) {
        remoteLog('info', '✅ Early init complete - all handlers installed');
    }
})();
