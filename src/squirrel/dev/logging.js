import {
  buildLogEnvelope,
  coerceLogEnvelope,
  isValidLogEnvelope
} from '../../shared/logging.js';
import { isDebugEnabled, shouldLogLevel } from '../../shared/debug.js';

const LOG_ENDPOINT = '/dev/client-log';
const FASTIFY_FALLBACK = 'http://127.0.0.1:3001';
const SESSION_KEY = 'atome_session_id';
const MAX_ARG_STRING = 2000;
const DEFAULT_LOG_ALLOWLIST = [
  /Tone\.js v\d+/,
  '[Atome] Config:',
  '[Squirrel] Error handlers installed',
  '[Squirrel] AdoleAPI v3.0 loaded globally',
  'Current platform:',
  /^Squirrel\s+\d+/,
  /^Server\s+\d+/,
  '[Squirrel] server_config.json loaded',
  '[Squirrel] __SQUIRREL_FASTIFY_URL__:',
  '[Squirrel] __SQUIRREL_FASTIFY_WS_API_URL__:',
  '[Squirrel] __SQUIRREL_FASTIFY_WS_SYNC_URL__:',
  /\[sync_engine\]/,
  /\[sync_atomes\]/
];

function isTauriRuntime() {
  return typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function isUiLoggingDisabled() {
  return !isDebugEnabled();
}

function getTauriInvoke() {
  if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
    return window.__TAURI__.invoke.bind(window.__TAURI__);
  }
  if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
    return window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  }
  return null;
}

function isLocalHostname(hostname) {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === ''
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
  );
}

function normalizeBase(base) {
  return typeof base === 'string' ? base.replace(/\/$/, '') : base;
}

function resolveFastifyBase() {
  if (typeof window === 'undefined') return FASTIFY_FALLBACK;

  const configured = normalizeBase(window.__SQUIRREL_FASTIFY_URL__);
  if (configured) {
    if (window.location && window.location.protocol === 'https:' && configured.startsWith('http://')) {
      try {
        const host = new URL(configured).hostname;
        if (!isLocalHostname(host)) {
          return configured.replace(/^http:/, 'https:');
        }
      } catch (_) {
        // Ignore URL parsing errors; keep configured as-is.
      }
    }
    return configured;
  }

  const location = window.location;
  if (!location) return FASTIFY_FALLBACK;

  if (isLocalHostname(location.hostname)) {
    return FASTIFY_FALLBACK;
  }

  const origin = normalizeBase(location.origin);
  return origin && origin !== 'null' ? origin : FASTIFY_FALLBACK;
}

function getSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) return cached;
    const fresh = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch (_) {
    return null;
  }
}

function safeStringify(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch (_) {
    return String(value);
  }
}

function formatArgs(args) {
  return args
    .map((arg) => {
      const text = safeStringify(arg);
      return text.length > MAX_ARG_STRING ? `${text.slice(0, MAX_ARG_STRING)}...` : text;
    })
    .join(' ');
}

function getLogAllowlist() {
  return DEFAULT_LOG_ALLOWLIST;
}

function isStrictLogFilter() {
  return true;
}

function shouldAllowConsoleLog(level, args) {
  if (!isStrictLogFilter() && (level === 'error' || level === 'warn')) {
    return true;
  }
  const allowlist = getLogAllowlist();
  if (!allowlist.length) return true;
  const message = formatArgs(args);
  return allowlist.some((token) => {
    if (token instanceof RegExp) return token.test(message);
    return message.includes(token);
  });
}

async function sendToFastify(payload) {
  const base = resolveFastifyBase();
  const url = `${base}${LOG_ENDPOINT}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch (_) {
    // Avoid recursive logging when the log endpoint is offline.
  }
}

async function sendToTauri(payload) {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error('Tauri invoke unavailable');
  await invoke('log_from_webview', { payload });
}

async function emitLog(level, args) {
  if (isUiLoggingDisabled()) return;
  const source = isTauriRuntime() ? 'tauri_webview' : 'browser';
  const message = formatArgs(args);
  const data = {
    args: args.map((arg) => {
      if (arg instanceof Error) {
        return { name: arg.name, message: arg.message, stack: arg.stack };
      }
      return arg;
    }),
    url: typeof window !== 'undefined' ? window.location.href : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
  };

  const envelope = buildLogEnvelope({
    level,
    source,
    component: 'ui',
    message,
    data,
    session_id: getSessionId()
  });

  const finalPayload = coerceLogEnvelope(envelope, { source, component: 'ui' });
  if (!isValidLogEnvelope(finalPayload)) return;

  try {
    if (isTauriRuntime()) {
      await sendToTauri(finalPayload);
      return;
    }
  } catch (_) {
    // Fall through to HTTP logging.
  }

  await sendToFastify(finalPayload);
}

function installConsoleWrapper() {
  if (typeof window === 'undefined') return;
  if (window.__ATOME_CONSOLE_WRAPPED__) return;
  window.__ATOME_CONSOLE_WRAPPED__ = true;

  const original = {};
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  let inSend = false;

  methods.forEach((method) => {
    original[method] = console[method];
    console[method] = (...args) => {
      const level = method === 'log' ? 'info' : method;
      if (!shouldLogLevel(level)) return;
      original[method](...args);
      if (!shouldAllowConsoleLog(level, args)) {
        return;
      }
      if (inSend) return;
      inSend = true;
      Promise.resolve()
        .then(() => emitLog(level, args))
        .finally(() => {
          inSend = false;
        });
    };
  });

  window.atomeLog = (level, message, data = null) => {
    if (!shouldLogLevel(level)) return;
    if (!shouldAllowConsoleLog(level, [message, data])) return;
    emitLog(level, [message, data]);
  };
}

installConsoleWrapper();
