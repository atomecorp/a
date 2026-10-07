import { logStructured } from './server_logger.js';

const YOUTUBE_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_DAILY_REQUESTS = 80;
const requestsByAddress = new Map();
let dailyWindow = '';
let dailyRequests = 0;

const reply = (requestId, fields) => ({
  type: 'youtube-search-response', requestId, request_id: requestId,
  success: fields.ok === true, ...fields
});

// The client only receives a stable code; the real cause stays in the server log.
const logFailure = (log, requestId, error, data) => log('warn', {
  component: 'youtube_search', request_id: requestId, message: error, data
});

export const handleWsYoutubeSearch = async (message, address, {
  apiKey = process.env.YOUTUBE_DATA_API_KEY,
  fetchResource = fetch,
  now = Date.now(),
  log = logStructured
} = {}) => {
  if (message?.type !== 'youtube-search') return null;
  const requestId = message.requestId || message.request_id || null;
  const query = String(message.query || '').trim();
  const pageToken = String(message.pageToken || '').trim();
  if (!query || query.length > 120 || pageToken.length > 256) {
    return reply(requestId, { ok: false, error: 'youtube_search_invalid_query' });
  }
  if (!apiKey) {
    logFailure(log, requestId, 'youtube_search_not_configured', { missing: 'YOUTUBE_DATA_API_KEY' });
    return reply(requestId, { ok: false, error: 'youtube_search_not_configured' });
  }
  const day = new Date(now).toISOString().slice(0, 10);
  if (dailyWindow !== day) { dailyWindow = day; dailyRequests = 0; }
  if (dailyRequests >= MAX_DAILY_REQUESTS) {
    return reply(requestId, { ok: false, error: 'youtube_search_quota_guard' });
  }
  const key = String(address || 'unknown');
  const recent = (requestsByAddress.get(key) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return reply(requestId, { ok: false, error: 'youtube_search_rate_limited' });
  }
  recent.push(now);
  dailyRequests += 1;
  requestsByAddress.set(key, recent);
  if (requestsByAddress.size > 10000) {
    for (const [entry, times] of requestsByAddress) {
      if (times.every((at) => now - at >= WINDOW_MS)) requestsByAddress.delete(entry);
    }
  }
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', q: query, maxResults: '10', key: apiKey
  });
  if (pageToken) params.set('pageToken', pageToken);
  try {
    const response = await fetchResource(`${YOUTUBE_SEARCH_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const error = response.status === 403 ? 'youtube_search_quota_or_permission' : 'youtube_search_unavailable';
      // Google explains a refusal in its body (keyInvalid, quotaExceeded,
      // accessNotConfigured…); the request URL carries the key and is never logged.
      const detail = await response.json().catch(() => null);
      logFailure(log, requestId, error, { status: response.status,
        reason: String(detail?.error?.errors?.[0]?.reason || detail?.error?.status || ''),
        provider_message: String(detail?.error?.message || '').slice(0, 300) });
      return reply(requestId, { ok: false, error });
    }
    const payload = await response.json();
    const results = (Array.isArray(payload.items) ? payload.items : []).flatMap((item) => {
      const videoId = String(item?.id?.videoId || '');
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];
      return [{
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: String(item?.snippet?.title || ''),
        thumbnail: String(item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || ''),
        channel: String(item?.snippet?.channelTitle || '')
      }];
    });
    return reply(requestId, { ok: true, results,
      nextPageToken: String(payload.nextPageToken || '') });
  } catch (error) {
    logFailure(log, requestId, 'youtube_search_unavailable', {
      exception: String(error?.name || 'Error'), cause: String(error?.message || error).slice(0, 300) });
    return reply(requestId, { ok: false, error: 'youtube_search_unavailable' });
  }
};
