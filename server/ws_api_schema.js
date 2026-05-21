const API_REQUEST_ALLOWED_KEYS = new Set(['type', 'id', 'method', 'path', 'body', 'headers']);
const API_REQUEST_ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const API_REQUEST_ALLOWED_PATHS = [
    /^\/api\/auth\/me(?:$|[/?#])/,
    /^\/api\/auth\/update(?:$|[/?#])/,
    /^\/api\/projects(?:$|[/?#])/,
    /^\/api\/activities(?:$|[/?#])/,
    /^\/api\/atomes(?:$|[/?#])/,
    /^\/api\/sharing(?:$|[/?#])/,
    /^\/api\/files(?:$|[/?#])/,
    /^\/api\/uploads(?:$|[/?#])/
];

const assertPlainObject = (value, error) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(error);
    }
};

const normalizeApiRequestPath = (path) => {
    const rawPath = String(path || '').trim();
    if (!rawPath || rawPath.length > 2048) {
        throw new Error('api_request_path_invalid');
    }
    if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\') || /[\u0000-\u001F]/.test(rawPath)) {
        throw new Error('api_request_path_invalid');
    }
    const parsed = new URL(rawPath, 'http://squirrel.local');
    const normalizedPath = `${parsed.pathname}${parsed.search}`;
    if (!API_REQUEST_ALLOWED_PATHS.some((pattern) => pattern.test(normalizedPath))) {
        throw new Error('api_request_route_not_allowed');
    }
    return normalizedPath;
};

const normalizeApiRequestHeaders = (headers, attachedUserId) => {
    const filteredHeaders = {
        'content-type': 'application/json',
        'x-ws-user-id': attachedUserId
    };
    if (headers === undefined || headers === null) return filteredHeaders;
    assertPlainObject(headers, 'api_request_headers_invalid');
    const allowedHeaderKeys = new Set(['authorization']);
    for (const key of Object.keys(headers)) {
        if (!allowedHeaderKeys.has(String(key).toLowerCase())) {
            throw new Error('api_request_header_not_allowed');
        }
    }
    if (typeof headers.authorization === 'string') {
        filteredHeaders.authorization = headers.authorization;
    }
    return filteredHeaders;
};

export function normalizeWsApiRequest(data, attachedUserId) {
    assertPlainObject(data, 'api_request_invalid');
    const userId = String(attachedUserId || '').trim();
    if (!userId) {
        throw new Error('api_request_auth_required');
    }
    for (const key of Object.keys(data)) {
        if (!API_REQUEST_ALLOWED_KEYS.has(key)) {
            throw new Error('api_request_field_not_allowed');
        }
    }
    if (data.type !== 'api-request') {
        throw new Error('api_request_type_invalid');
    }
    const method = String(data.method || 'GET').trim().toUpperCase();
    if (!API_REQUEST_ALLOWED_METHODS.has(method)) {
        throw new Error('api_request_method_not_allowed');
    }
    const path = normalizeApiRequestPath(data.path);
    return {
        id: data.id,
        method,
        path,
        body: data.body,
        headers: normalizeApiRequestHeaders(data.headers, userId)
    };
}
