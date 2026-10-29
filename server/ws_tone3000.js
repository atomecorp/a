import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logStructured } from './server_logger.js';

// TONE3000 (todo/effets_generateurs_audio D22): one « Atome » account for every
// user. Its secret key (`TONE3000_SECRET_KEY`, in development
// `private/tone3000.txt`) is read here only and never leaves the server: the
// server searches the NAM captures, lists a tone's models and downloads the
// chosen `.nam`, which the client stores as a library atome (synced, offline).
// API: https://www.tone3000.com/api (v1; 100 requests a minute).

const API = 'https://www.tone3000.com/api/v1';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = path.join(PROJECT_ROOT, 'private', 'tone3000.txt');
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_MODEL_BYTES = 16 * 1024 * 1024;
const requestsByAddress = new Map();

const text = (value) => String(value == null ? '' : value).trim();

// The secret key: the environment's, else the development file's `t3k_cs_…` line.
export const tone3000Key = (env = process.env, readFile = (file) => fs.readFileSync(file, 'utf8')) => {
    if (text(env.TONE3000_SECRET_KEY)) return text(env.TONE3000_SECRET_KEY);
    let content = '';
    try { content = readFile(KEY_FILE); } catch { return ''; }
    const lines = content.split(/\r?\n/).map(text).filter(Boolean);
    return lines.find((line) => line.startsWith('t3k_cs_')) || lines.find((line) => /^[A-Za-z0-9_\-.]{20,}$/.test(line)) || '';
};

const reply = (requestId, fields) => ({
    type: 'tone3000-response', requestId, request_id: requestId, success: fields.ok === true, ...fields
});

const tone = (entry) => ({
    id: entry.id, title: text(entry.title), author: text(entry.user?.username || entry.user?.name),
    gear: text(entry.gear), license: text(entry.license), sizes: Array.isArray(entry.sizes) ? entry.sizes : [],
    a2_models: Number(entry.a2_models_count) || 0, models: Number(entry.models_count) || 0,
    downloads: Number(entry.downloads_count) || 0, image: Array.isArray(entry.images) ? text(entry.images[0]) : '',
    url: text(entry.url)
});

const model = (entry) => ({
    id: entry.id, tone_id: entry.tone_id, name: text(entry.name), size: text(entry.size),
    architecture: entry.architecture_version ?? null
});

const readApi = async ({ fetchResource, key }, route, params) => {
    const response = await fetchResource(`${API}/${route}?${new URLSearchParams(params)}`, {
        signal: AbortSignal.timeout(10_000), redirect: 'error',
        headers: { accept: 'application/json', authorization: `Bearer ${key}` }
    });
    if (!response.ok) throw Object.assign(new Error(`tone3000_status_${response.status}`), { status: response.status });
    return response.json();
};

// The model's file, fetched with the key only from TONE3000 itself.
const readModel = async ({ fetchResource, key }, modelUrl) => {
    const url = new URL(modelUrl);
    if (url.protocol !== 'https:' || !(url.hostname === 'tone3000.com' || url.hostname.endsWith('.tone3000.com'))) {
        throw new Error('tone3000_model_host_unexpected');
    }
    const response = await fetchResource(url, {
        signal: AbortSignal.timeout(30_000), redirect: 'follow', headers: { authorization: `Bearer ${key}` }
    });
    if (!response.ok) throw Object.assign(new Error(`tone3000_status_${response.status}`), { status: response.status });
    const body = await response.text();
    if (body.length > MAX_MODEL_BYTES) throw new Error('tone3000_model_too_large');
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || !parsed.architecture || !parsed.weights) throw new Error('tone3000_model_not_nam');
    return body;
};

const limited = (address, now) => {
    const key = String(address || 'unknown');
    const recent = (requestsByAddress.get(key) || []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
    recent.push(now);
    requestsByAddress.set(key, recent);
    return false;
};

// `{ type: 'tone3000', action: 'search' | 'models' | 'download', … }`.
export const handleWsTone3000 = async (message, address, {
    key, fetchResource = fetch, now = Date.now(), log = logStructured
} = {}) => {
    if (message?.type !== 'tone3000') return null;
    key ??= tone3000Key();
    const requestId = message.requestId || message.request_id || null;
    if (!key) {
        log('warn', { component: 'tone3000', request_id: requestId, message: 'tone3000_not_configured', data: { missing: 'private/tone3000.txt' } });
        return reply(requestId, { ok: false, error: 'tone3000_not_configured' });
    }
    if (limited(address, now)) return reply(requestId, { ok: false, error: 'tone3000_rate_limited' });
    const context = { fetchResource, key };
    try {
        if (message.action === 'search') {
            const query = text(message.query);
            if (query.length > 120) return reply(requestId, { ok: false, error: 'tone3000_invalid_query' });
            const page = Math.max(1, Math.trunc(Number(message.page) || 1));
            const found = await readApi(context, 'tones/search', {
                format: 'nam', architecture: '2', page: String(page), page_size: '25',
                ...(query ? { query, sort: 'best-match' } : { sort: 'downloads-all-time' }),
                ...(text(message.gear) ? { gears: text(message.gear) } : {})
            });
            return reply(requestId, { ok: true, tones: (found.data || []).map(tone), page: found.page, total_pages: found.total_pages });
        }
        if (message.action === 'models') {
            const toneId = Math.trunc(Number(message.tone_id));
            if (!toneId) return reply(requestId, { ok: false, error: 'tone3000_invalid_tone' });
            const found = await readApi(context, 'models', { tone_id: String(toneId), architecture: '2', page_size: '100' });
            return reply(requestId, { ok: true, models: (found.data || []).map(model) });
        }
        if (message.action === 'download') {
            const modelId = Math.trunc(Number(message.model_id));
            if (!modelId) return reply(requestId, { ok: false, error: 'tone3000_invalid_model' });
            const entry = await readApi(context, `models/${modelId}`, {});
            const capture = await readModel(context, entry.model_url);
            const owner = await readApi(context, `tones/${entry.tone_id}`, {}).then(tone);
            return reply(requestId, { ok: true, model: model(entry), tone: owner, capture });
        }
        return reply(requestId, { ok: false, error: 'tone3000_invalid_action' });
    } catch (error) {
        log('warn', { component: 'tone3000', request_id: requestId, message: String(error?.message || error), data: { action: message.action, status: error?.status || null } });
        return reply(requestId, { ok: false, error: String(error?.message || '').startsWith('tone3000_') ? error.message : 'tone3000_unavailable' });
    }
};
