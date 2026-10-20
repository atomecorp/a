import { logStructured } from './server_logger.js';
import { peertubeVideoRef } from '../atome/src/shared/online_video_refs.js';

// Public PeerTube operations of /ws/api (PeerTube tool, `online_video_providers.js`).
//
// - `peertube-search`: the federated index Sepia Search (Framasoft), public
//   videos only, ten per page; `pageToken` is the next result offset.
// - `peertube-resolve`: the playable streams of one video, read from its own
//   instance (HLS master playlist first, then the web video files). Only an
//   instance of the public PeerTube directory is ever contacted, so a client
//   cannot make this server fetch an address of its choosing.

const SEARCH_ENDPOINT = 'https://sepiasearch.org/api/v1/search/videos';
const DIRECTORY_ENDPOINT = 'https://instances.joinpeertube.org/api/v1/instances/hosts?count=5000&start=0';
const PAGE_SIZE = 10;
const MAX_OFFSET = 9000;
const DIRECTORY_REFRESH_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_FILE_RESOLUTION = 1080;
const PUBLIC_PRIVACY = 1;
const PUBLISHED_STATE = 1;
const requestsByAddress = new Map();
let directory = { hosts: null, at: 0 };

const text = (value) => String(value == null ? '' : value).trim();
const httpsUrl = (value) => {
    try { const url = new URL(text(value)); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};
const reply = (type, requestId, fields) => ({
    type: `${type}-response`, requestId, request_id: requestId, success: fields.ok === true, ...fields
});
const logFailure = (log, requestId, error, data) => log('warn', {
    component: 'peertube', request_id: requestId, message: error, data
});
const isPlayable = (video) => video?.privacy?.id === PUBLIC_PRIVACY && video.isLive !== true && video.nsfw !== true;

const rateLimited = (address, now) => {
    const key = String(address || 'unknown');
    const recent = (requestsByAddress.get(key) || []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
    recent.push(now);
    requestsByAddress.set(key, recent);
    if (requestsByAddress.size > 10000) {
        for (const [entry, times] of requestsByAddress) {
            if (times.every((at) => now - at >= WINDOW_MS)) requestsByAddress.delete(entry);
        }
    }
    return false;
};

const readJson = async (fetchResource, url) => {
    const response = await fetchResource(url, { signal: AbortSignal.timeout(8000), redirect: 'error',
        headers: { accept: 'application/json' } });
    if (!response.ok) { const error = new Error(`status_${response.status}`); error.status = response.status; throw error; }
    return response.json();
};

const searchResult = (video) => {
    const ref = peertubeVideoRef(video?.url)?.ref;
    if (!ref || !isPlayable(video)) return [];
    return [{
        url: ref, title: text(video.name),
        thumbnail: httpsUrl(video.thumbnailUrl || video.previewUrl),
        channel: text(video.channel?.displayName || video.account?.displayName),
        host: peertubeVideoRef(ref).host, duration: Number(video.duration) || 0
    }];
};

const handleSearch = async (message, address, { fetchResource, now, log }) => {
    const requestId = message.requestId || message.request_id || null;
    const query = text(message.query);
    const start = message.pageToken ? Number(message.pageToken) : 0;
    if (!query || query.length > 120 || !Number.isInteger(start) || start < 0 || start > MAX_OFFSET) {
        return reply('peertube-search', requestId, { ok: false, error: 'peertube_search_invalid_query' });
    }
    if (rateLimited(address, now)) return reply('peertube-search', requestId, { ok: false, error: 'peertube_search_rate_limited' });
    const params = new URLSearchParams({ search: query, start: String(start), count: String(PAGE_SIZE),
        nsfw: 'false', isLive: 'false' });
    try {
        const payload = await readJson(fetchResource, `${SEARCH_ENDPOINT}?${params}`);
        const videos = Array.isArray(payload?.data) ? payload.data : [];
        const next = start + PAGE_SIZE;
        const more = videos.length === PAGE_SIZE && next < Math.min(Number(payload?.total) || 0, MAX_OFFSET);
        return reply('peertube-search', requestId, { ok: true, results: videos.flatMap(searchResult),
            nextPageToken: more ? String(next) : '' });
    } catch (error) {
        logFailure(log, requestId, 'peertube_search_unavailable', {
            status: error?.status || 0, cause: String(error?.message || error).slice(0, 300) });
        return reply('peertube-search', requestId, { ok: false, error: 'peertube_search_unavailable' });
    }
};

const directoryHosts = async (fetchResource, now) => {
    if (directory.hosts && now - directory.at < DIRECTORY_REFRESH_MS) return directory.hosts;
    const payload = await readJson(fetchResource, DIRECTORY_ENDPOINT);
    const hosts = new Set((Array.isArray(payload?.data) ? payload.data : []).map((entry) => text(entry?.host).toLowerCase()).filter(Boolean));
    if (!hosts.size) throw new Error('peertube_directory_empty');
    directory = { hosts, at: now };
    return hosts;
};

// The web video files: the highest up to 1080p first, a larger one only after
// every smaller one; never the audio-only file (resolution 0).
const fileRank = (height) => (height <= MAX_FILE_RESOLUTION ? MAX_FILE_RESOLUTION - height : height);
const fileStreams = (files) => (Array.isArray(files) ? files : [])
    .map((file) => ({ height: Number(file?.resolution?.id) || 0, url: httpsUrl(file?.fileUrl) }))
    .filter((file) => file.height > 0 && file.url)
    .sort((a, b) => fileRank(a.height) - fileRank(b.height))
    .slice(0, 2).map((file) => ({ kind: 'video', url: file.url }));

const handleResolve = async (message, address, { fetchResource, now, log }) => {
    const requestId = message.requestId || message.request_id || null;
    const video = peertubeVideoRef(message.url);
    if (!video) return reply('peertube-resolve', requestId, { ok: false, error: 'peertube_video_invalid' });
    if (rateLimited(address, now)) return reply('peertube-resolve', requestId, { ok: false, error: 'peertube_search_rate_limited' });
    try {
        if (!(await directoryHosts(fetchResource, now)).has(video.host)) {
            return reply('peertube-resolve', requestId, { ok: false, error: 'peertube_video_unavailable' });
        }
        const payload = await readJson(fetchResource, `https://${video.host}/api/v1/videos/${encodeURIComponent(video.id)}`);
        if (!isPlayable(payload) || payload?.state?.id !== PUBLISHED_STATE) {
            return reply('peertube-resolve', requestId, { ok: false, error: 'peertube_video_unavailable' });
        }
        const streams = [
            ...(Array.isArray(payload.streamingPlaylists) ? payload.streamingPlaylists : [])
                .map((playlist) => httpsUrl(playlist?.playlistUrl)).filter(Boolean).map((url) => ({ kind: 'hls', url })),
            ...fileStreams(payload.files)
        ];
        if (!streams.length) return reply('peertube-resolve', requestId, { ok: false, error: 'peertube_video_unavailable' });
        return reply('peertube-resolve', requestId, { ok: true, url: video.ref, title: text(payload.name),
            duration: Number(payload.duration) || 0, streams });
    } catch (error) {
        const missing = error?.status === 404 || error?.status === 403;
        const code = missing ? 'peertube_video_unavailable' : 'peertube_resolve_unavailable';
        logFailure(log, requestId, code, { host: video.host, status: error?.status || 0,
            cause: String(error?.message || error).slice(0, 300) });
        return reply('peertube-resolve', requestId, { ok: false, error: code });
    }
};

export const handleWsPeertube = async (message, address, {
    fetchResource = fetch,
    now = Date.now(),
    log = logStructured
} = {}) => {
    if (message?.type === 'peertube-search') return handleSearch(message, address, { fetchResource, now, log });
    if (message?.type === 'peertube-resolve') return handleResolve(message, address, { fetchResource, now, log });
    return null;
};
