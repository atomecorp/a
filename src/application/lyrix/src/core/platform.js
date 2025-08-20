// Platform / environment helpers centralised here to avoid regex duplication
export function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// (Optional) unified log helper – intentionally quiet (no console spam) but
// easy to toggle if deeper diagnostics are needed.
export function appLog(category, message, data) {
    // Toggle verbose logs by setting window.__LYRIX_DEBUG__ = true
    if (!window.__LYRIX_DEBUG__) return;
    const ts = new Date().toISOString();
    const payload = data ? ` | ${JSON.stringify(data)}` : '';
    // eslint-disable-next-line no-console
    console.log(`[#Lyrix ${category}] ${ts}: ${message}${payload}`);
}
