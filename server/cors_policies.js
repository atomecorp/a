// CORS for the one caller that can never appear in the credentialed allowlist.
//
// The iOS/AUv3 app is served by WKWebView through the custom `atome:` scheme.
// WebKit treats that origin as OPAQUE: it is not a loopback origin, it is not
// `tauri://localhost`, and it must never be added to the credentialed allowlist
// (the same reason `null` is refused there). With no entry, @fastify/cors
// answers a request from the phone with NO `Access-Control-Allow-Origin` at
// all, so the WebView cannot read ANY http response from this server — which is
// why the wallpaper download and the wallpaper file it stores never reached the
// surface on iOS while both worked in Tauri and in the browser.
//
// The answer is the policy `/api/server/verify` already uses for this exact
// origin: wildcard origin, NO credentials. Authorization stays a bearer token
// in a header, so nothing depends on a cookie, and because the response carries
// no `Access-Control-Allow-Credentials`, a credentialed request from any other
// site is still refused by the browser before it is sent.
//
// It is scoped to the media routes the phone must reach over plain HTTP;
// everything else keeps the restricted allowlist.

const OPAQUE_NATIVE_ORIGIN_SCHEMES = new Set(['atome:', 'asset:', 'ipc:']);

const NATIVE_HTTP_MEDIA_ROUTES = [
    /^\/api\/uploads(?:\/|$)/i,
    /^\/api\/recordings(?:\/|$)/i,
    /^\/api\/extract-audio(?:\/|$)/i
];

export const OPAQUE_NATIVE_CORS_HEADERS = [
    'Content-Type',
    'Authorization',
    'Range',
    'X-Filename',
    'X-Original-Name',
    'X-Atome-Id',
    'X-Atome-Type',
    'X-Mime-Type',
    'X-File-Path',
    'X-File-Name',
    'X-User-Id',
    'X-Username',
    'X-Phone',
    'X-Wallpaper-Inline'
].join(', ');

const OPAQUE_NATIVE_CORS_METHODS = 'GET, HEAD, POST, OPTIONS';
const OPAQUE_NATIVE_CORS_EXPOSED = 'Content-Range, Content-Length, Accept-Ranges';

// `null` is accepted here for the same reason `/api/server/verify` accepts it:
// this policy grants no credentials, so it hands nothing to a caller that does
// not already carry a bearer token. Depending on the WebKit build, a page on a
// custom scheme reports either `atome://…` or a null origin, and the phone must
// not depend on which. The credentialed allowlist still refuses `null`.
export const isOpaqueNativeOrigin = (origin) => {
    const raw = String(origin || '').trim().toLowerCase();
    if (!raw) return false;
    if (raw === 'null') return true;
    const separator = raw.indexOf(':');
    if (separator < 0) return false;
    return OPAQUE_NATIVE_ORIGIN_SCHEMES.has(raw.slice(0, separator + 1));
};

export const isNativeHttpMediaRoute = (url) => {
    const raw = String(url || '').trim();
    if (!raw) return false;
    const path = raw.split('?')[0].split('#')[0];
    return NATIVE_HTTP_MEDIA_ROUTES.some((pattern) => pattern.test(path));
};

// Applied from an `onSend` hook so it also lands on the preflight reply that
// @fastify/cors short-circuits, and so a route that already answered keeps its
// own status and body.
export const applyOpaqueNativeOriginCors = (request, reply) => {
    const origin = request?.headers?.origin;
    if (!isOpaqueNativeOrigin(origin)) return false;
    if (!isNativeHttpMediaRoute(request?.raw?.url || request?.url)) return false;
    const requestedHeaders = request.headers['access-control-request-headers'];
    reply.header('Access-Control-Allow-Origin', '*');
    reply.removeHeader('Access-Control-Allow-Credentials');
    reply.header('Access-Control-Allow-Methods', OPAQUE_NATIVE_CORS_METHODS);
    reply.header(
        'Access-Control-Allow-Headers',
        (Array.isArray(requestedHeaders) ? requestedHeaders[0] : requestedHeaders) || OPAQUE_NATIVE_CORS_HEADERS
    );
    reply.header('Access-Control-Expose-Headers', OPAQUE_NATIVE_CORS_EXPOSED);
    reply.header('Access-Control-Max-Age', '86400');
    reply.header('Vary', 'Origin');
    return true;
};
