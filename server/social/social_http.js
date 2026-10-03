// Provider HTTP calls for the social adapters. A provider message is never
// forwarded as is (an authentication failure may quote a token): only a
// slug-shaped provider code survives, next to atome's own error code.

export class SocialError extends Error {
    constructor(code, { providerCode = null, httpStatus = null, reached = false, detail = null } = {}) {
        super(code);
        this.code = code;
        this.providerCode = providerCode;
        this.httpStatus = httpStatus;
        // True when the request may have reached the provider: a publish request
        // in that state must become `unconfirmed`, never be retried blindly.
        this.reached = reached;
        this.detail = detail;
    }
}

const slug = (value) => {
    const text = String(value ?? '').trim();
    return /^[A-Za-z0-9_.-]{1,80}$/.test(text) ? text : null;
};

const providerCodeOf = (body) => slug(body?.error?.code ?? body?.error_code ?? body?.error?.error_subcode)
    || slug(body?.error?.type) || slug(typeof body?.error === 'string' ? body.error : null);

export const classifyHttpFailure = (status, providerCode = null) => {
    if (status === 401 || providerCode === 'access_token_invalid' || providerCode === '190') return 'social_session_expired';
    if (status === 403 || providerCode === 'scope_not_authorized' || providerCode === '200' || providerCode === '10') return 'social_permission_missing';
    if (status === 429 || /rate_limit|spam_risk_too_many_posts|^(4|17|32|613)$/.test(providerCode || '')) return 'social_provider_rate_limited';
    if (status >= 500) return 'social_provider_unavailable';
    return 'social_provider_rejected';
};

// `init.body` may be a string, URLSearchParams, FormData or bytes. Every call
// carries the job's AbortSignal; `redirect: 'error'` refuses provider redirects.
export async function socialFetch(fetchImpl, url, init = {}, { reaches = false } = {}) {
    let response;
    try {
        response = await fetchImpl(url, { redirect: 'error', ...init });
    } catch (error) {
        if (init.signal?.aborted) throw new SocialError('social_cancelled', { reached: reaches });
        throw new SocialError('social_network_interrupted', { reached: reaches, detail: error?.name || null });
    }
    const text = await response.text().catch(() => '');
    let body = null;
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    // TikTok answers 200 with `error.code !== 'ok'` for refusals.
    const tiktokCode = body?.error && typeof body.error === 'object' && 'code' in body.error && 'log_id' in body.error
        ? slug(body.error.code) : null;
    if (!response.ok || (tiktokCode && tiktokCode !== 'ok')) {
        const providerCode = tiktokCode || providerCodeOf(body);
        // An explicit refusal is final; only a provider-side failure (5xx) on a
        // publishing request leaves the outcome unknown.
        throw new SocialError(classifyHttpFailure(response.status, providerCode), {
            providerCode, httpStatus: response.status, reached: reaches && response.status >= 500
        });
    }
    return body;
}

export const formBody = (fields) => new URLSearchParams(Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]));

export const delay = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new SocialError('social_cancelled')); }, { once: true });
});
