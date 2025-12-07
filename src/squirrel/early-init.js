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
    // REMOTE LOGGING - Send logs to Axum server (3000) to survive page reloads
    // ═══════════════════════════════════════════════════════════════════════════
    
    var loadTime = Date.now();
    var logBuffer = [];
    
    function remoteLog(level, message, data) {
        var entry = {
            timestamp: new Date().toISOString(),
            elapsed: Date.now() - loadTime,
            level: level,
            message: message,
            data: data || null,
            url: window.location.href,
            userAgent: navigator.userAgent
        };
        
        // Also log locally
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Squirrel]', message, data || '');
        
        // Send to Axum server (port 3000) - fire and forget, no await
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'http://127.0.0.1:3000/api/debug-log', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(entry));
        } catch (e) {
            // Ignore send errors
        }
    }
    
    remoteLog('info', 'Page loaded', { loadTime: loadTime });

    // ═══════════════════════════════════════════════════════════════════════════
    // DEBUG: Track page lifecycle to understand reloads
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Track beforeunload to catch reloads
    window.addEventListener('beforeunload', function(e) {
        var elapsed = Date.now() - loadTime;
        remoteLog('warn', '⚠️ PAGE UNLOADING', { 
            elapsed: elapsed,
            stack: new Error().stack 
        });
    });
    
    // Track navigation
    window.addEventListener('popstate', function(e) {
        remoteLog('warn', 'popstate event', { state: e.state });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL: Prevent Tauri WebView reload on unhandled promise rejections
    // ═══════════════════════════════════════════════════════════════════════════

    // Capture phase - catches rejections first
    window.addEventListener('unhandledrejection', function (e) {
        remoteLog('error', '⛔ Unhandled Promise Rejection (PREVENTED)', {
            reason: String(e.reason),
            stack: e.reason && e.reason.stack ? e.reason.stack : null
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
    window.addEventListener('error', function(e) {
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
    window.fetch = function(url, options) {
        var urlStr = typeof url === 'string' ? url : (url && url.url) || String(url);
        var method = (options && options.method) || 'GET';
        
        // Log requests to port 3000 (Tauri/Axum server)
        if (urlStr.includes('3000')) {
            remoteLog('info', '📡 FETCH to Tauri', { method: method, url: urlStr });
        }
        
        return originalFetch.apply(this, arguments)
            .then(function(response) {
                if (urlStr.includes('3000')) {
                    remoteLog('info', '✅ FETCH response from Tauri', { 
                        status: response.status, 
                        url: urlStr 
                    });
                }
                return response;
            })
            .catch(function(error) {
                if (urlStr.includes('3000')) {
                    remoteLog('error', '❌ FETCH error from Tauri', { 
                        error: error.message, 
                        url: urlStr 
                    });
                }
                throw error;
            });
    };
    
    remoteLog('info', '✅ Early init complete - all handlers installed');
})();
