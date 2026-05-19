import { loadServerConfigOnce } from '../../squirrel/apis/loadServerConfig.js';

const DEFAULT_TIMEOUT_MS = 15000;
const shellState = {
    socket: null,
    isOpen: false,
    isAuthed: false,
    pending: new Map(),
    defaults: {
        scope: 'sandbox',
        cwd: '',
        token: '',
        authToken: '',
        silent: false
    }
};

function getAuthToken() {
    try {
        const token = localStorage.getItem('cloud_auth_token')
            || localStorage.getItem('auth_token')
            || localStorage.getItem('local_auth_token');
        return token && token.length > 10 ? token : null;
    } catch (_) {
        return null;
    }
}

function getWsUrl() {
    if (typeof window === 'undefined') return '';
    const fromGlobal = window.__SQUIRREL_FASTIFY_WS_API_URL__;
    if (fromGlobal) return fromGlobal;
    const origin = window.location?.origin || '';
    return origin ? origin.replace(/^http/, 'ws') + '/ws/api' : '';
}

function createRequestId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(payload) {
  try {
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

async function decodeWsPayload(raw) {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Blob) {
    return await raw.text();
  }
  if (raw instanceof ArrayBuffer) {
    return new TextDecoder().decode(raw);
  }
  if (raw && raw.buffer instanceof ArrayBuffer) {
    return new TextDecoder().decode(raw.buffer);
  }
  return '';
}

function attachSocketHandlers(socket) {
    socket.addEventListener('open', () => {
        shellState.isOpen = true;
    });

    socket.addEventListener('close', () => {
        shellState.isOpen = false;
        shellState.isAuthed = false;
    });

  socket.addEventListener('message', (event) => {
    decodeWsPayload(event.data).then((raw) => {
      const data = safeJsonParse(raw);
      if (!data || !data.type) return;

      if (data.type === 'auth-response') {
        const req = shellState.pending.get(data.requestId);
        if (req) {
          shellState.pending.delete(data.requestId);
          shellState.isAuthed = !!data.success;
          req.resolve(data);
        }
        return;
      }

      if (data.type === 'shell-response') {
        const req = shellState.pending.get(data.requestId);
        if (req) {
          shellState.pending.delete(data.requestId);
          req.resolve(data);
        }
      }
    }).catch(() => {});
  });
}

async function ensureSocket() {
    if (shellState.socket && shellState.isOpen) return shellState.socket;

    await loadServerConfigOnce();
    const wsUrl = getWsUrl();
    if (!wsUrl) throw new Error('Shell WS URL not configured');

    shellState.socket = new WebSocket(wsUrl);
    attachSocketHandlers(shellState.socket);

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Shell WS connection timeout')), 5000);
        shellState.socket.addEventListener('open', () => {
            clearTimeout(timeout);
            resolve();
        }, { once: true });
        shellState.socket.addEventListener('error', () => {
            clearTimeout(timeout);
            reject(new Error('Shell WS connection error'));
        }, { once: true });
    });

    return shellState.socket;
}

async function ensureAuth(token) {
    if (shellState.isAuthed) return true;
    const socket = await ensureSocket();
    const requestId = createRequestId('shell_auth');

    const payload = {
        type: 'auth',
        action: 'me',
        token,
        requestId
    };

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            shellState.pending.delete(requestId);
            resolve(false);
        }, 5000);

        shellState.pending.set(requestId, {
            resolve: (response) => {
                clearTimeout(timeout);
                resolve(!!response.success);
            }
        });

        socket.send(JSON.stringify(payload));
    });
}

function normalizeInput(input) {
    if (typeof input === 'string') {
        return { command: input };
    }
    if (input && typeof input === 'object') {
        if (typeof input.command === 'string' || Array.isArray(input.command)) {
            return input;
        }
    }
    return {};
}

function printResult(result, silent) {
    if (silent) return;
    if (result.success) {
        console.log(`[shell] ok (code=${result.exitCode ?? 'n/a'})`);
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.warn(result.stderr);
    } else {
        console.error('[shell] error:', result.error || 'Command failed');
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.warn(result.stderr);
    }
}

async function shell(input) {
    const payload = normalizeInput(input);
    const command = payload.command || payload.cmd;
    if (!command) {
        return { success: false, error: 'Missing command' };
    }

    const authToken = payload.authToken || payload.auth_token || shellState.defaults.authToken || getAuthToken();
    if (!authToken) {
        return { success: false, error: 'No auth token available' };
    }

    await ensureSocket();
    const authed = await ensureAuth(authToken);
    if (!authed) {
        return { success: false, error: 'Shell authentication failed' };
    }

    const requestId = createRequestId('shell');
    const scope = payload.scope || shellState.defaults.scope || 'sandbox';
    const cwd = payload.cwd || shellState.defaults.cwd || '';
    const timeoutMs = payload.timeoutMs || DEFAULT_TIMEOUT_MS;
    const silent = payload.silent ?? shellState.defaults.silent;
    const shellToken = payload.shellToken || payload.token || shellState.defaults.token;

    const message = {
        type: 'shell',
        requestId,
        command,
        args: payload.args,
        tokens: payload.tokens,
        scope,
        cwd,
        token: shellToken,
        timeoutMs
    };

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            shellState.pending.delete(requestId);
            resolve({ success: false, error: 'Shell request timed out' });
        }, timeoutMs + 2000);

        shellState.pending.set(requestId, {
            resolve: (response) => {
                clearTimeout(timeout);
                printResult(response, silent);
                resolve(response);
            }
        });

        shellState.socket.send(JSON.stringify(message));
    });
}

shell.configure = (options = {}) => {
    if (options.scope) shellState.defaults.scope = options.scope;
    if (options.cwd !== undefined) shellState.defaults.cwd = options.cwd;
    if (options.token !== undefined) shellState.defaults.token = options.token;
    if (options.authToken !== undefined) shellState.defaults.authToken = options.authToken;
    if (options.silent !== undefined) shellState.defaults.silent = options.silent;
};

shell.reset = () => {
    shellState.defaults = {
        scope: 'sandbox',
        cwd: '',
        token: '',
        authToken: '',
        silent: false
    };
};

if (typeof window !== 'undefined') {
  window.shell = shell;
  if (!window.__SHELL_UI_LOADED__) {
    window.__SHELL_UI_LOADED__ = true;
    import('./shellUI.js').catch((err) => {
      console.warn('[shell] UI load failed:', err?.message || err);
    });
  }
}

export { shell };
