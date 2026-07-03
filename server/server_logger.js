/**
 * server structured logger (pino) + logStructured helper.
 */

import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import { SERVER_VERSION, EVE_VERSION } from './server_version.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FASTIFY_LOG_FILE = path.join(PROJECT_ROOT, 'logs', 'fastify.log');
const logLevel = process.env.LOG_LEVEL || 'info';
export const MINIMAL_LOGS =
  process.env.SQUIRREL_MINIMAL_LOGS !== '0'
  && process.env.SQUIRREL_MINIMAL_LOGS !== 'false';
const logStreams = pino.multistream([
  { stream: process.stdout },
  { stream: pino.destination({ dest: FASTIFY_LOG_FILE, sync: false }) }
]);

export const logger = pino(
  {
    level: logLevel,
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: { level(label) { return { level: label }; } },
    base: { source: 'fastify', component: 'http' }
  },
  logStreams
);

let _server = null;
export function setLogServer(s) { _server = s; }

export function logStructured(level, { source = 'fastify', component = 'server', request_id = null, session_id = null, message = '', data = null } = {}) {
  const payload = {
    source,
    component,
    request_id,
    session_id,
    app_version: SERVER_VERSION,
    eve_version: EVE_VERSION,
    data
  };
  if (typeof _server?.log?.[level] === 'function') {
    server.log[level](payload, message);
  } else {
    const logLine = { ...payload, level, timestamp: new Date().toISOString(), message };
    process.stdout.write(`${JSON.stringify(logLine)}\n`);
  }
}
