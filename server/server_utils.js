/**
 * server small utilities — upload id/name, admin auth, recording detection.
 */

import crypto from 'crypto';
import { sanitizeFileName } from './fileStorage.js';

const WS_FILE_CHUNK_DEFAULT = 256 * 1024;
const WS_FILE_CHUNK_MAX = 1024 * 1024;
const WS_FILE_CHUNK_MIN = 8 * 1024;

const RECORDING_NAME_PREFIXES = [
  'audio_',
  'video_',
  'recording_',
  'audio_recording_',
  'video_recording_'
];

const RECORDING_ATOME_TYPES = new Set(['audio_recording', 'video_recording']);

export function sanitizeUploadId(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  return value;
}

export function coerceWsChunkSize(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return WS_FILE_CHUNK_DEFAULT;
  if (parsed < WS_FILE_CHUNK_MIN) return WS_FILE_CHUNK_MIN;
  return Math.min(parsed, WS_FILE_CHUNK_MAX);
}

export function looksLikeRecordingName(name) {
  const raw = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!raw) return false;
  return RECORDING_NAME_PREFIXES.some((prefix) => raw.startsWith(prefix));
}

export function looksLikeRecordingType(atomeType) {
  const type = typeof atomeType === 'string' ? atomeType.trim().toLowerCase() : '';
  return type && RECORDING_ATOME_TYPES.has(type);
}

export function getAdminSecret() {
  return process.env.EVE_ADMIN_PASSWORD
    || process.env.SQUIRREL_ADMIN_PASSWORD
    || '';
}

export function isAdminPasswordValid(value) {
  const secret = getAdminSecret();
  if (!secret || !value) return false;
  const secretBuf = Buffer.from(String(secret));
  const valueBuf = Buffer.from(String(value));
  if (secretBuf.length !== valueBuf.length) return false;
  return crypto.timingSafeEqual(secretBuf, valueBuf);
}

export function getAdminPasswordFromRequest(request) {
  const header = request.headers?.['x-admin-password'];
  if (Array.isArray(header)) return header[0];
  if (typeof header === 'string') return header;
  return request.body?.admin_password || request.body?.adminPassword || null;
}

export function resolveUserId(user) {
  const direct = user?.id || user?.userId || user?.user_id || user?.sub;
  if (direct !== undefined && direct !== null) {
    const text = String(direct).trim();
    if (text) return text;
  }

  const phone = user?.phone || user?.user_phone || user?.userPhone;
  if (phone !== undefined && phone !== null) {
    const text = String(phone).trim();
    if (text) return generateDeterministicUserId(text);
  }

  const logLine = user?.username || user?.name;
  if (logLine !== undefined && logLine !== null) {
    const text = String(logLine).trim();
    if (text) return text;
  }

  return 'anonymous';
}

export function pickDisplayName(file, safeRequestedName) {
  if (typeof file?.original_name === 'string' && file.original_name.trim()) {
    return file.original_name;
  }
  if (typeof file?.file_name === 'string' && file.file_name.trim()) {
    return file.file_name;
  }
  if (typeof file?.name === 'string' && file.name.trim()) {
    return file.name;
  }
  return safeRequestedName;
}
