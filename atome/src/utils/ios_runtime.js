export const isIOSDevice = (navigatorLike = globalThis?.navigator) => {
    if (!navigatorLike) return false;

    return /iPad|iPhone|iPod/.test(navigatorLike.userAgent || '')
        || (navigatorLike.platform === 'MacIntel' && Number(navigatorLike.maxTouchPoints || 0) > 1);
};

export const readInjectedLocalPort = (target = globalThis?.window) => {
    const raw = target?.__ATOME_LOCAL_HTTP_PORT__
        || target?.ATOME_LOCAL_HTTP_PORT
        || target?.__LOCAL_HTTP_PORT
        || target?.__SQUIRREL_TAURI_LOCAL_PORT__
        || 0;
    const port = Number(raw);
    return Number.isFinite(port) && port > 0 ? port : 0;
};

export const waitForIOSLocalServerReady = (timeoutMs = 6000, target = globalThis?.window) => {
    if (!target?.addEventListener || !target?.removeEventListener) {
        return Promise.resolve(false);
    }

    if (readInjectedLocalPort(target)) return Promise.resolve(true);

    return new Promise((resolve) => {
        let settled = false;
        let pollId = null;
        let timeoutId = null;

        const cleanup = () => {
            target.removeEventListener('local-server-ready', onReady);
            if (pollId) clearInterval(pollId);
            if (timeoutId) clearTimeout(timeoutId);
        };

        const finish = (ready) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(ready);
        };

        const onReady = () => finish(true);

        target.addEventListener('local-server-ready', onReady, { once: true });
        pollId = setInterval(() => {
            if (readInjectedLocalPort(target)) finish(true);
        }, 50);
        timeoutId = setTimeout(() => finish(!!readInjectedLocalPort(target)), timeoutMs);
    });
};