export const installWebViewErrorGuards = () => {
    if (typeof window === 'undefined' || window._squirrelErrorHandlerInstalled) return;

    window._squirrelErrorHandlerInstalled = true;

    window.addEventListener('unhandledrejection', function onUnhandledRejectionCapture(event) {
        console.error('[Squirrel] Unhandled Promise Rejection caught:', event.reason);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }, true);

    window.addEventListener('unhandledrejection', function onUnhandledRejectionBubble(event) {
        event.preventDefault();
        return false;
    }, false);

    window.onerror = function onWindowError(message, url, line, column) {
        console.error('[Squirrel] Uncaught error:', message, 'at', url, line, column);
        return true;
    };
};