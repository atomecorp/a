import { coerceLogEnvelope, isValidLogEnvelope } from '../../shared/logging.js';

const DEFAULT_WS = 'ws://localhost:7777/dev/logs';
const MAX_LOGS = 1000;
const MAX_BUFFER = 500;

function shouldEnable() {
  if (typeof window === 'undefined') return false;
  if (window.__ATOME_DEV_CONSOLE__ === true) return true;
  const stored = localStorage.getItem('atome_dev_console');
  if (stored === '1' || stored === 'true') return true;
  const url = new URL(window.location.href);
  return url.searchParams.get('devconsole') === '1';
}

function resolveWsUrl() {
  if (window.__ATOME_DEV_LOGS_WS__) return window.__ATOME_DEV_LOGS_WS__;
  const stored = localStorage.getItem('atome_dev_logs_ws');
  if (stored) return stored;
  return DEFAULT_WS;
}

function resolveFastifyBase() {
  const configured = window.__SQUIRREL_FASTIFY_URL__;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:3001';
}

function resolveAxumBase() {
  const port = window.__ATOME_LOCAL_HTTP_PORT__ || 3000;
  return `http://127.0.0.1:${port}`;
}

function formatLogLine(entry) {
  const time = entry.timestamp ? entry.timestamp.slice(11, 19) : '--:--:--';
  const level = entry.level?.toUpperCase() || 'INFO';
  const source = entry.source || 'unknown';
  const component = entry.component || 'unknown';
  const message = entry.message || '';
  return `${time} [${level}] ${source}/${component} ${message}`;
}

function initDevConsole() {
  if (!shouldEnable()) return;
  if (window.__ATOME_DEV_CONSOLE_READY__) return;

  if (!document.body) {
    window.addEventListener('DOMContentLoaded', initDevConsole, { once: true });
    return;
  }

  window.__ATOME_DEV_CONSOLE_READY__ = true;

  const logs = [];
  const buffer = [];
  const selected = new Set();
  let paused = false;
  let ws = null;
  let connected = false;

  const container = document.createElement('div');
  container.setAttribute('data-test-id', 'dev-console');
  Object.assign(container.style, {
    position: 'fixed',
    left: '12px',
    right: '12px',
    bottom: '12px',
    height: '280px',
    background: 'rgba(18, 18, 20, 0.96)',
    color: '#e6e6e6',
    fontFamily: 'Menlo, Consolas, monospace',
    fontSize: '12px',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    zIndex: '9999'
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(25, 25, 28, 0.9)'
  });

  const title = document.createElement('div');
  title.textContent = 'Atome Dev Console';
  title.style.fontWeight = '600';

  const status = document.createElement('div');
  status.textContent = 'ws: disconnected';
  status.style.opacity = '0.7';
  status.setAttribute('data-test-id', 'dev-console-status');

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '6px';

  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = 'Pause';
  pauseBtn.setAttribute('data-test-id', 'dev-console-pause');

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export';
  exportBtn.setAttribute('data-test-id', 'dev-console-export');

  const snapshotBtn = document.createElement('button');
  snapshotBtn.textContent = 'Snapshot';
  snapshotBtn.setAttribute('data-test-id', 'dev-console-snapshot');

  [pauseBtn, exportBtn, snapshotBtn].forEach((btn) => {
    Object.assign(btn.style, {
      background: '#2f2f36',
      color: '#f4f4f4',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '6px',
      padding: '4px 8px',
      cursor: 'pointer'
    });
  });

  controls.append(pauseBtn, exportBtn, snapshotBtn);

  header.append(title, status, controls);

  const filterRow = document.createElement('div');
  filterRow.style.display = 'flex';
  filterRow.style.gap = '8px';
  filterRow.style.padding = '6px 12px';
  filterRow.style.borderBottom = '1px solid rgba(255,255,255,0.08)';

  const sourceFilter = document.createElement('input');
  sourceFilter.placeholder = 'source';
  sourceFilter.setAttribute('data-test-id', 'dev-console-filter-source');
  const levelFilter = document.createElement('input');
  levelFilter.placeholder = 'level';
  levelFilter.setAttribute('data-test-id', 'dev-console-filter-level');
  const textFilter = document.createElement('input');
  textFilter.placeholder = 'search';
  textFilter.setAttribute('data-test-id', 'dev-console-filter-text');

  [sourceFilter, levelFilter, textFilter].forEach((input) => {
    Object.assign(input.style, {
      flex: '1',
      background: '#1f1f23',
      color: '#f4f4f4',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '6px',
      padding: '4px 6px'
    });
  });

  filterRow.append(sourceFilter, levelFilter, textFilter);

  const list = document.createElement('div');
  list.style.flex = '1';
  list.style.overflow = 'auto';
  list.style.padding = '8px 12px';
  list.setAttribute('data-test-id', 'dev-console-list');

  container.append(header, filterRow, list);
  document.body.appendChild(container);

  function setStatus(text, ok) {
    status.textContent = text;
    status.style.color = ok ? '#8ef59b' : '#f58e8e';
  }

  function matchesFilter(entry) {
    const source = sourceFilter.value.trim().toLowerCase();
    const level = levelFilter.value.trim().toLowerCase();
    const text = textFilter.value.trim().toLowerCase();

    if (source && !(entry.source || '').toLowerCase().includes(source)) return false;
    if (level && !(entry.level || '').toLowerCase().includes(level)) return false;
    if (text) {
      const haystack = `${entry.message || ''} ${JSON.stringify(entry.data || '')}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  }

  function render() {
    list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const filtered = logs.filter(matchesFilter);

    filtered.forEach((entry) => {
      const row = document.createElement('div');
      row.textContent = formatLogLine(entry);
      row.style.padding = '2px 0';
      row.style.cursor = 'pointer';
      row.style.color = entry.level === 'error' ? '#f58e8e' : entry.level === 'warn' ? '#f5cf8e' : '#e6e6e6';

      if (selected.has(entry._id)) {
        row.style.background = 'rgba(255,255,255,0.08)';
      }

      row.addEventListener('click', () => {
        if (selected.has(entry._id)) {
          selected.delete(entry._id);
          row.style.background = 'transparent';
        } else {
          selected.add(entry._id);
          row.style.background = 'rgba(255,255,255,0.08)';
        }
      });

      if (entry.request_id) {
        row.title = `request_id: ${entry.request_id}`;
      }

      fragment.appendChild(row);
    });

    list.appendChild(fragment);
  }

  function addLog(entry) {
    const enriched = { ...entry, _id: `${Date.now()}-${Math.random().toString(16).slice(2)}` };
    logs.push(enriched);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    render();
  }

  function connect() {
    const wsUrl = resolveWsUrl();
    ws = new WebSocket(wsUrl);
    setStatus('ws: connecting', false);

    ws.addEventListener('open', () => {
      connected = true;
      setStatus('ws: connected', true);
    });

    ws.addEventListener('close', () => {
      connected = false;
      setStatus('ws: disconnected', false);
      setTimeout(connect, 1500);
    });

    ws.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        payload = { message: event.data };
      }

      const entry = coerceLogEnvelope(payload, {
        source: 'daemon',
        component: 'stream',
        level: 'info'
      });
      if (!isValidLogEnvelope(entry)) return;

      if (paused) {
        buffer.push(entry);
        if (buffer.length > MAX_BUFFER) buffer.shift();
        return;
      }
      addLog(entry);
    });
  }

  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    if (!paused && buffer.length) {
      buffer.splice(0).forEach(addLog);
    }
  });

  exportBtn.addEventListener('click', () => {
    const filtered = logs.filter(matchesFilter);
    const payload = selected.size
      ? filtered.filter((entry) => selected.has(entry._id))
      : filtered;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dev-console-export.json';
    link.click();
    URL.revokeObjectURL(url);
  });

  snapshotBtn.addEventListener('click', async () => {
    const fastifyBase = resolveFastifyBase();
    const axumBase = resolveAxumBase();
    const recentLogs = logs.slice(-200);

    try {
      const [axumState, fastifyState] = await Promise.all([
        fetch(`${axumBase}/dev/state`).then((res) => res.json()).catch(() => null),
        fetch(`${fastifyBase}/dev/state`).then((res) => res.json()).catch(() => null)
      ]);

      await fetch(`${fastifyBase}/dev/snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: { axum: axumState, fastify: fastifyState },
          logs: recentLogs
        })
      });
    } catch (_) {
      // No-op: snapshot is optional.
    }
  });

  sourceFilter.addEventListener('input', render);
  levelFilter.addEventListener('input', render);
  textFilter.addEventListener('input', render);

  connect();

  window.AtomeDevConsole = {
    open: () => (container.style.display = 'flex'),
    close: () => (container.style.display = 'none'),
    toggle: () => {
      container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    }
  };
}

initDevConsole();
