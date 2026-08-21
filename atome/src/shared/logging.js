const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

export const LOG_SCHEMA_VERSION = 1;

export function buildLogEnvelope({
  level = 'info',
  source = 'unknown',
  component = 'unknown',
  message = '',
  data = null,
  request_id = null,
  session_id = null
} = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    source,
    component,
    request_id,
    session_id,
    message,
    data
  };
}

export function isValidLogEnvelope(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.timestamp !== 'string' || entry.timestamp.length === 0) return false;
  if (!LOG_LEVELS.includes(entry.level)) return false;
  if (typeof entry.source !== 'string' || entry.source.length === 0) return false;
  if (typeof entry.component !== 'string' || entry.component.length === 0) return false;
  if (typeof entry.message !== 'string') return false;
  return true;
}

export function coerceLogEnvelope(entry, defaults = {}) {
  const base = entry && typeof entry === 'object' ? entry : {};
  const level = LOG_LEVELS.includes(base.level) ? base.level : (defaults.level || 'info');
  const source = typeof base.source === 'string' && base.source.trim()
    ? base.source
    : (defaults.source || 'unknown');
  const component = typeof base.component === 'string' && base.component.trim()
    ? base.component
    : (defaults.component || 'unknown');
  const message = typeof base.message === 'string'
    ? base.message
    : (base.message != null ? JSON.stringify(base.message) : '');
  const request_id = typeof base.request_id === 'string' ? base.request_id : (defaults.request_id || null);
  const session_id = typeof base.session_id === 'string' ? base.session_id : (defaults.session_id || null);
  const data = 'data' in base ? base.data : (defaults.data ?? null);
  const timestamp = typeof base.timestamp === 'string' && base.timestamp
    ? base.timestamp
    : new Date().toISOString();

  return {
    timestamp,
    level,
    source,
    component,
    request_id,
    session_id,
    message,
    data
  };
}

export function serializeLogEnvelope(entry) {
  return JSON.stringify(entry);
}

