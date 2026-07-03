/**
 * visio.js pure helpers + media codec/RTC defaults — ADOLE v3.0
 */

export const DEFAULT_RTC_MIN_PORT = 40000;
export const DEFAULT_RTC_MAX_PORT = 49999;
export const DEFAULT_LISTEN_IP = '127.0.0.1';

export const DEFAULT_MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  }
];

export function nowIso() {
  try {
    return new Date().toISOString();
  } catch (error) {
        console.warn("[cleanup] operation failed", error);
    return String(Date.now());
  }
}

export function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/\s+/g, '');
  return cleaned || null;
}

export function makeRequestId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
        console.warn("[cleanup] operation failed", error);
    return null;
  }
}

export function normalizeVisibility(raw) {
  if (raw === 'public' || raw === 'connections') return raw;
  return 'private';
}

export function ensureSet(map, key) {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  return map.get(key);
}
