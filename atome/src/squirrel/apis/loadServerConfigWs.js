const normalizeNoTrailingSlash = (url) => {
    if (typeof url !== 'string') return '';
    return url.trim().replace(/\/$/, '');
};

const toWsBase = (httpBase) => normalizeNoTrailingSlash(httpBase)
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:');

export function buildFastifyWsUrl(httpBase, path) {
    const wsBase = toWsBase(httpBase);
    const nextPath = typeof path === 'string' && path.startsWith('/') ? path : '/ws/api';
    return `${wsBase}${nextPath}`;
}
