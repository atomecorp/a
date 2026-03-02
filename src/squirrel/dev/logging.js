import {
  buildLogEnvelope,
  coerceLogEnvelope,
  isValidLogEnvelope
} from '../../shared/logging.js';
import { isDebugEnabled, shouldLogLevel } from '../../shared/debug.js';
import { loadServerConfigOnce } from '../apis/loadServerConfig.js';

const LOG_ENDPOINT = '/dev/client-log';
const FASTIFY_FALLBACK = 'http://127.0.0.1:3001';
const SESSION_KEY = 'atome_session_id';
const MAX_ARG_STRING = 2000;
const NETWORK_LOG_FLUSH_INTERVAL_MS = 120;
const NETWORK_LOG_BATCH_SIZE = 20;
const NETWORK_LOG_MAX_QUEUE = 400;
const NETWORK_LOG_FAILURE_COOLDOWN_MS = 15000;
const NETWORK_LOG_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_LOG_ALLOWLIST = [
  /\[SyncDebug\]/,
  /\[SyncCommit\]/,
  /\[SyncWS\]/,
  /\[SyncAuth\]/,
  /\[AtomeSync\]/
];

function isTauriRuntime() {
  if (typeof window === 'undefined') return false;
  if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
  if (window.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
  const protocol = String(window.location?.protocol || '').toLowerCase();
  if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:') return true;
  const hasTauriObjects = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  if (!hasTauriObjects) return false;
  const userAgent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  return /tauri/i.test(userAgent);
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

  if (!isTauriRuntime()) {
    const origin = normalizeBase(window.location?.origin);
    return origin && origin !== 'null' ? origin : '';
  }

  return FASTIFY_FALLBACK;
}

const networkLogState = {
  queue: [],
  flushTimer: null,
  inFlight: false,
  disabledUntilMs: 0,
  consecutiveFailures: 0,
  permanentlyDisabled: false,
  configPromise: null
};

function ensureServerConfigInitialized() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!networkLogState.configPromise) {
    networkLogState.configPromise = Promise.resolve()
      .then(() => loadServerConfigOnce())
      .catch(() => null);
  }
  return networkLogState.configPromise;
}

function scheduleNetworkFlush(delayMs = NETWORK_LOG_FLUSH_INTERVAL_MS) {
  if (networkLogState.flushTimer) return;
  const safeDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : NETWORK_LOG_FLUSH_INTERVAL_MS;
  networkLogState.flushTimer = setTimeout(() => {
    networkLogState.flushTimer = null;
    void flushNetworkQueue();
  }, safeDelay);
}

function enqueueNetworkLog(payload) {
  if (networkLogState.permanentlyDisabled) return false;
  if (!payload || typeof payload !== 'object') return false;
  if (networkLogState.queue.length >= NETWORK_LOG_MAX_QUEUE) {
    const overflow = networkLogState.queue.length - NETWORK_LOG_MAX_QUEUE + 1;
    networkLogState.queue.splice(0, overflow);
  }
  networkLogState.queue.push(payload);
  scheduleNetworkFlush();
  return true;
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
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    const seen = new WeakSet();
    const serialized = JSON.stringify(value, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
    return serialized === undefined ? String(value) : serialized;
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
  return !isDebugEnabled();
}

function shouldAllowConsoleLog(level, args) {
  if (!isStrictLogFilter()) return true;
  const allowlist = getLogAllowlist();
  if (!allowlist.length) return true;
  const message = formatArgs(args);
  return allowlist.some((token) => {
    if (token instanceof RegExp) return token.test(message);
    return message.includes(token);
  });
}

function shouldPrintConsole(level, args) {
  if (!isStrictLogFilter()) return true;
  if (level === 'error' || level === 'warn') return true;
  return shouldAllowConsoleLog(level, args);
}

async function flushNetworkQueue() {
  if (networkLogState.inFlight) return;
  if (!networkLogState.queue.length) return;

  const now = Date.now();
  if (networkLogState.disabledUntilMs > now) {
    scheduleNetworkFlush(networkLogState.disabledUntilMs - now);
    return;
  }

  networkLogState.inFlight = true;
  const batch = networkLogState.queue.splice(0, NETWORK_LOG_BATCH_SIZE);
  if (!batch.length) {
    networkLogState.inFlight = false;
    return;
  }

  try {
    await ensureServerConfigInitialized();
    const base = resolveFastifyBase();
    if (!base) {
      networkLogState.queue = batch.concat(networkLogState.queue).slice(0, NETWORK_LOG_MAX_QUEUE);
      scheduleNetworkFlush(1000);
      return;
    }

    const response = await fetch(`${base}${LOG_ENDPOINT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch.length === 1 ? batch[0] : { logs: batch }),
      keepalive: false
    });
    if (!response || response.ok !== true) {
      networkLogState.consecutiveFailures += 1;
      if (networkLogState.consecutiveFailures >= NETWORK_LOG_MAX_CONSECUTIVE_FAILURES) {
        networkLogState.disabledUntilMs = Date.now() + NETWORK_LOG_FAILURE_COOLDOWN_MS;
      }
      networkLogState.queue = batch.concat(networkLogState.queue).slice(0, NETWORK_LOG_MAX_QUEUE);
      return;
    }
    networkLogState.consecutiveFailures = 0;
  } catch (_) {
    networkLogState.consecutiveFailures += 1;
    if (networkLogState.consecutiveFailures >= NETWORK_LOG_MAX_CONSECUTIVE_FAILURES) {
      networkLogState.disabledUntilMs = Date.now() + NETWORK_LOG_FAILURE_COOLDOWN_MS;
    }
    networkLogState.queue = batch.concat(networkLogState.queue).slice(0, NETWORK_LOG_MAX_QUEUE);
  } finally {
    networkLogState.inFlight = false;
    if (networkLogState.queue.length) {
      scheduleNetworkFlush(networkLogState.consecutiveFailures > 0 ? 300 : NETWORK_LOG_FLUSH_INTERVAL_MS);
    }
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

  enqueueNetworkLog(finalPayload);
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
      if (!shouldPrintConsole(level, args)) return;
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

function bootstrapLogging() {
  if (typeof window === 'undefined') {
    installConsoleWrapper();
    return;
  }

  installConsoleWrapper();
  Promise.resolve()
    .then(() => ensureServerConfigInitialized())
    .catch(() => null);
}

bootstrapLogging();
