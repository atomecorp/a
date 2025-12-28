import {
  buildLogEnvelope,
  coerceLogEnvelope,
  isValidLogEnvelope
} from '../../shared/logging.js';

const LOG_ENDPOINT = '/dev/client-log';
const FASTIFY_FALLBACK = 'http://127.0.0.1:3001';
const SESSION_KEY = 'atome_session_id';
const MAX_ARG_STRING = 2000;

function isTauriRuntime() {
  return typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function isTruthyFlag(value) {
  return value === true || value === '1' || value === 'true';
}

function isUiLoggingDisabled() {
  if (typeof window === 'undefined') return false;
  if (isTruthyFlag(window.__SQUIRREL_DISABLE_UI_LOGS__)) return true;
  const config = window.__SQUIRREL_SERVER_CONFIG__;
  if (config && config.logging && isTruthyFlag(config.logging.disableUiLogs)) return true;
  return false;
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
      original[method](...args);
      if (inSend) return;
      inSend = true;
      Promise.resolve()
        .then(() => emitLog(method === 'log' ? 'info' : method, args))
        .finally(() => {
          inSend = false;
        });
    };
  });

  window.atomeLog = (level, message, data = null) => {
    emitLog(level, [message, data]);
  };
}

installConsoleWrapper();
