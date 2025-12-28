import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { coerceLogEnvelope, isValidLogEnvelope } from '../../src/shared/logging.js';

const PORT = Number(process.env.ATOME_DEV_DAEMON_PORT || 7777);
const WS_PATH = '/dev/logs';
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const positions = new Map();

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (error) {
    console.warn('Failed to create logs directory:', error?.message || error);
  }
}

function broadcast(wss, payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

function asEnvelope(entry, fallback = {}) {
  const normalized = coerceLogEnvelope(entry, fallback);
  if (isValidLogEnvelope(normalized)) return normalized;
  return coerceLogEnvelope(
    {
      message: 'invalid log payload',
      data: entry
    },
    { source: 'daemon', component: 'daemon', level: 'warn' }
  );
}

async function readNewLines(wss, filePath) {
  let stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch (_) {
    positions.set(filePath, 0);
    return;
  }

  const lastPos = positions.get(filePath) || 0;
  const nextPos = stats.size;
  if (nextPos < lastPos) {
    positions.set(filePath, 0);
  }
  const start = positions.get(filePath) || 0;
  if (nextPos === start) return;

  const length = nextPos - start;
  const buffer = Buffer.alloc(length);
  const fd = await fs.promises.open(filePath, 'r');
  try {
    await fd.read(buffer, 0, length, start);
  } finally {
    await fd.close();
  }
  positions.set(filePath, nextPos);

  const lines = buffer.toString('utf8').split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    try {
      const parsed = JSON.parse(line);
      broadcast(wss, asEnvelope(parsed, { source: 'daemon', component: 'tail' }));
    } catch (error) {
      broadcast(
        wss,
        asEnvelope(
          {
            message: 'non-json log line',
            data: { line, file: filePath }
          },
          { source: 'daemon', component: 'tail', level: 'warn' }
        )
      );
    }
  });
}

function startWatcher(wss) {
  const watcher = fs.watch(LOG_DIR, { persistent: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.log')) return;
    const filePath = path.join(LOG_DIR, filename);
    readNewLines(wss, filePath).catch((error) => {
      broadcast(
        wss,
        asEnvelope(
          { message: 'tail read failed', data: { file: filePath, error: error?.message || error } },
          { source: 'daemon', component: 'tail', level: 'error' }
        )
      );
    });
  });

  return watcher;
}

async function seedPositions() {
  try {
    const files = await fs.promises.readdir(LOG_DIR);
    await Promise.all(
      files
        .filter((name) => name.endsWith('.log'))
        .map(async (name) => {
          const filePath = path.join(LOG_DIR, name);
          const stats = await fs.promises.stat(filePath);
          positions.set(filePath, stats.size);
        })
    );
  } catch (_) {
    // ignore
  }
}

function startServer() {
  ensureLogDir();
  seedPositions().catch(() => {});
  const wss = new WebSocketServer({ port: PORT, path: WS_PATH });

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify(
        asEnvelope(
          { message: 'dev daemon connected', data: { port: PORT, path: WS_PATH } },
          { source: 'daemon', component: 'ws', level: 'info' }
        )
      )
    );

    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed?.type === 'log' && parsed.payload) {
          broadcast(wss, asEnvelope(parsed.payload, { source: 'daemon', component: 'ws' }));
          return;
        }
        if (parsed?.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch (_) {
        // Ignore malformed input.
      }
    });
  });

  startWatcher(wss);

  console.log(`Dev daemon listening on ws://localhost:${PORT}${WS_PATH}`);
}

startServer();
