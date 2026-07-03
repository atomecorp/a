/**
 * server + eVe version cache & hot-reload watchers.
 */

import { promises as fs } from 'fs';
import { watch, watchFile } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let versionWatchersStarted = false;
const VERSION_FILE = path.join(PROJECT_ROOT, 'version.txt');
const EVE_VERSION_FILE = path.join(PROJECT_ROOT, 'eVe', 'version.txt');
const VERSION_FILE_WATCH_INTERVAL_MS = 1500;
export let SERVER_VERSION = 'unknown';
export let EVE_VERSION = 'unknown';

export async function loadVersionFile(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const trimmed = raw.trim();
    return trimmed || 'unknown';
  } catch (error) {
    const details = error && typeof error === 'object' && 'message' in error
      ? error.message
      : String(error);
    console.warn(`[Version] Failed to read ${label}:`, details);
    return 'unknown';
  }
}

export async function loadServerVersion() {
  return loadVersionFile(VERSION_FILE, 'version.txt');
}

export async function loadEveVersion() {
  return loadVersionFile(EVE_VERSION_FILE, 'eVe/version.txt');
}

export async function refreshVersionCache() {
  const [nextServerVersion, nextEveVersion] = await Promise.all([
    loadServerVersion(),
    loadEveVersion()
  ]);
  const changed = nextServerVersion !== SERVER_VERSION || nextEveVersion !== EVE_VERSION;
  SERVER_VERSION = nextServerVersion;
  EVE_VERSION = nextEveVersion;
  if (changed) {
    console.info(`[Version] Runtime versions updated: Atome ${SERVER_VERSION}, eVe ${EVE_VERSION}`);
  }
  return {
    atomeVersion: SERVER_VERSION,
    eveVersion: EVE_VERSION
  };
}

export function startVersionWatchers() {
  if (versionWatchersStarted) return;
  versionWatchersStarted = true;
  const refresh = () => {
    void refreshVersionCache().catch(() => null);
  };
  const watch = (filePath) => {
    watchFile(filePath, { interval: VERSION_FILE_WATCH_INTERVAL_MS }, (current, previous) => {
      if (!current || !previous) {
        refresh();
        return;
      }
      if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
        refresh();
      }
    });
  };

  watch(VERSION_FILE);
  watch(EVE_VERSION_FILE);
}
