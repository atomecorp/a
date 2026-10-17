// Optional native WebView cache must never gate SQLite/keystore authorization.
export function readOptionalAuthCache(operation, timeoutMs = 500) {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        Promise.resolve().then(operation).then(value => { clearTimeout(timer); resolve(value); }, () => {
            clearTimeout(timer); resolve(null);
        });
    });
}
