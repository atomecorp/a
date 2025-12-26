import path from 'path';
import { promises as fs } from 'fs';

const DEFAULT_USER_ROOT = 'data/users';

function sanitizeName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function resolveUserRoot(projectRoot, rootOverride) {
  const configured = typeof rootOverride === 'string' && rootOverride.trim()
    ? rootOverride.trim()
    : (process.env.SQUIRREL_SHELL_USER_ROOT || DEFAULT_USER_ROOT);
  return path.resolve(projectRoot, configured);
}

function resolveUserLabel(user) {
  return sanitizeName(user?.id || user?.user_id || user?.username || user?.phone || 'user');
}

export function getUserHome(projectRoot, user, rootOverride) {
  const base = resolveUserRoot(projectRoot, rootOverride);
  const label = resolveUserLabel(user);
  const home = path.resolve(base, label);
  const relative = path.relative(base, home);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid user home path');
  }
  return { base, home, label };
}

export async function ensureUserHome(projectRoot, user, rootOverride) {
  const { base, home, label } = getUserHome(projectRoot, user, rootOverride);
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  await fs.mkdir(home, { recursive: true, mode: 0o700 });

  const welcomePath = path.join(home, 'welcome.txt');
  let created = false;

  try {
    await fs.access(welcomePath);
  } catch (_) {
    const text = [
      `Welcome ${label}`,
      `User ID: ${user?.user_id || user?.id || 'unknown'}`,
      `Created: ${new Date().toISOString()}`,
      ''
    ].join('\n');
    await fs.writeFile(welcomePath, text, { mode: 0o600 });
    created = true;
  }

  return { base, home, label, welcomePath, created };
}
