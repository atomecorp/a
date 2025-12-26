import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { ensureUserHome } from './userHome.js';

const DEFAULT_ALLOWED_COMMANDS = [
  'mkdir',
  'ls',
  'pwd',
  'whoami',
  'touch',
  'cat',
  'echo',
  'stat'
];

const DEFAULT_INSTALL_COMMANDS = {
  darwin: ['brew'],
  freebsd: ['pkg']
};

const DEFAULT_POLICY = {
  enabled: false,
  allowAllUsers: false,
  allowedUsers: [],
  allowedCommands: DEFAULT_ALLOWED_COMMANDS,
  allowInstall: false,
  allowRoot: false,
  requireToken: false,
  userRoot: 'data/users',
  maxDurationMs: 15000,
  maxOutputBytes: 64 * 1024
};

const UNSAFE_TOKEN_REGEX = /[;&|><`$]/;

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
  }
  return false;
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}


async function loadPolicy(projectRoot) {
  const envPolicyPath = process.env.SQUIRREL_SHELL_POLICY_PATH;
  const policyPath = envPolicyPath
    ? path.resolve(projectRoot, envPolicyPath)
    : path.resolve(projectRoot, 'server', 'shell_policy.json');

  let filePolicy = {};
  try {
    const raw = await fs.readFile(policyPath, 'utf8');
    filePolicy = JSON.parse(raw);
  } catch (_) {
    filePolicy = {};
  }

  const envAllowedUsers = toList(process.env.SQUIRREL_SHELL_ALLOWED_USERS);
  const envAllowedCommands = toList(process.env.SQUIRREL_SHELL_ALLOWED_COMMANDS);
  const envInstallCommands = toList(process.env.SQUIRREL_SHELL_INSTALL_COMMANDS);

  const policy = {
    ...DEFAULT_POLICY,
    ...filePolicy,
    enabled: normalizeBoolean(process.env.SQUIRREL_SHELL_ENABLED ?? filePolicy.enabled),
    allowAllUsers: normalizeBoolean(process.env.SQUIRREL_SHELL_ALLOW_ALL_USERS ?? filePolicy.allowAllUsers),
    allowInstall: normalizeBoolean(process.env.SQUIRREL_SHELL_ALLOW_INSTALL ?? filePolicy.allowInstall),
    allowRoot: normalizeBoolean(process.env.SQUIRREL_SHELL_ALLOW_ROOT ?? filePolicy.allowRoot),
    requireToken: normalizeBoolean(process.env.SQUIRREL_SHELL_REQUIRE_TOKEN ?? filePolicy.requireToken),
    userRoot: process.env.SQUIRREL_SHELL_USER_ROOT || filePolicy.userRoot || DEFAULT_POLICY.userRoot,
    maxDurationMs: Number(process.env.SQUIRREL_SHELL_MAX_DURATION_MS || filePolicy.maxDurationMs || DEFAULT_POLICY.maxDurationMs),
    maxOutputBytes: Number(process.env.SQUIRREL_SHELL_MAX_OUTPUT_BYTES || filePolicy.maxOutputBytes || DEFAULT_POLICY.maxOutputBytes)
  };

  if (envAllowedUsers.length) policy.allowedUsers = envAllowedUsers;
  if (envAllowedCommands.length) policy.allowedCommands = envAllowedCommands;
  if (envInstallCommands.length) policy.installCommands = envInstallCommands;

  return policy;
}

function parseCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escape = false;

  for (const char of command) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (escape || quote) {
    throw new Error('Invalid command syntax (unfinished escape/quote)');
  }

  if (current) tokens.push(current);
  return tokens;
}

function hasUnsafeToken(token) {
  return UNSAFE_TOKEN_REGEX.test(token);
}

function isPathToken(token) {
  if (!token) return false;
  if (token.startsWith('-')) return false;
  if (token.startsWith('/') || token.startsWith('~') || token.startsWith('.')) return true;
  return token.includes('/');
}

function hasPathTraversal(token) {
  return token.includes('..') || token.startsWith('~') || token.startsWith('/');
}


function normalizeTokens(commandPayload) {
  if (Array.isArray(commandPayload?.tokens)) {
    return commandPayload.tokens.map(String);
  }

  if (Array.isArray(commandPayload?.args) && typeof commandPayload.command === 'string') {
    return [commandPayload.command, ...commandPayload.args.map(String)];
  }

  if (Array.isArray(commandPayload?.command)) {
    return commandPayload.command.map(String);
  }

  if (typeof commandPayload.command === 'string') {
    return parseCommand(commandPayload.command);
  }

  if (typeof commandPayload === 'string') {
    return parseCommand(commandPayload);
  }

  return [];
}

function resolveScope(scope) {
  const value = String(scope || 'sandbox').toLowerCase();
  if (value === 'root') return 'root';
  if (value === 'elevated') return 'elevated';
  return 'sandbox';
}

function getInstallAllowlist(policy) {
  if (Array.isArray(policy.installCommands) && policy.installCommands.length) {
    return policy.installCommands;
  }
  const platform = os.platform();
  return DEFAULT_INSTALL_COMMANDS[platform] || [];
}

function validateInstallCommand(tokens, allowed) {
  if (!tokens.length) return { ok: false, error: 'Empty command' };
  const cmd = tokens[0];
  if (!allowed.includes(cmd)) {
    return { ok: false, error: 'Installer command not allowed' };
  }
  const action = tokens[1];
  if (action !== 'install') {
    return { ok: false, error: 'Only install actions are allowed' };
  }
  const packages = tokens.slice(2).filter((token) => !token.startsWith('-'));
  if (!packages.length) {
    return { ok: false, error: 'Missing package name' };
  }
  return { ok: true };
}

function validateTokens(tokens, policy, scope) {
  if (!tokens.length) return { ok: false, error: 'Command is required' };
  if (tokens.join(' ').length > 512) return { ok: false, error: 'Command too long' };

  for (const token of tokens) {
    if (hasUnsafeToken(token)) {
      return { ok: false, error: 'Unsafe token detected' };
    }
  }

  if (scope === 'elevated') {
    if (!policy.allowInstall) return { ok: false, error: 'Install commands are disabled' };
    const allowed = getInstallAllowlist(policy);
    return validateInstallCommand(tokens, allowed);
  }

  if (scope === 'root' && !policy.allowRoot) {
    return { ok: false, error: 'Root scope is disabled' };
  }

  const allowed = policy.allowedCommands || DEFAULT_ALLOWED_COMMANDS;
  if (!allowed.includes(tokens[0])) {
    return { ok: false, error: 'Command not allowed' };
  }

  if (scope !== 'root') {
    for (const token of tokens) {
      if (isPathToken(token) && hasPathTraversal(token)) {
        return { ok: false, error: 'Path traversal detected' };
      }
    }
  }

  return { ok: true };
}

function resolveCwd(scope, userRoot, cwd) {
  if (scope === 'root') {
    return cwd ? path.resolve('/', cwd) : '/';
  }
  if (!cwd) return userRoot;
  const resolved = path.resolve(userRoot, cwd);
  const relative = path.relative(userRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Working directory is outside of sandbox');
  }
  return resolved;
}

function getRequiredToken(scope) {
  if (scope === 'root') return process.env.SQUIRREL_SHELL_ROOT_TOKEN || '';
  if (scope === 'elevated') return process.env.SQUIRREL_SHELL_ELEVATED_TOKEN || '';
  return process.env.SQUIRREL_SHELL_TOKEN || '';
}

export async function executeShellCommand({
  payload,
  projectRoot,
  user,
  connectionId
}) {
  const policy = await loadPolicy(projectRoot);
  if (!policy.enabled) {
    return { success: false, error: 'Shell API is disabled' };
  }

  if (!user?.id) {
    return { success: false, error: 'Authenticated user required' };
  }

  const allowedUsers = policy.allowedUsers || [];
  if (!policy.allowAllUsers) {
    if (!allowedUsers.length) {
      return { success: false, error: 'Shell allowlist is empty', userId: user.id };
    }
    if (!allowedUsers.includes(String(user.id))) {
      return { success: false, error: 'User is not allowed to run shell commands', userId: user.id };
    }
  }

  const scope = resolveScope(payload?.scope);
  const tokens = normalizeTokens(payload || {});
  const validation = validateTokens(tokens, policy, scope);
  if (!validation.ok) {
    return { success: false, error: validation.error || 'Command rejected' };
  }

  const requiredToken = getRequiredToken(scope);
  if (scope === 'root' || scope === 'elevated') {
    if (!requiredToken) {
      return { success: false, error: 'Shell token not configured for this scope' };
    }
    if (!payload?.token || payload.token !== requiredToken) {
      return { success: false, error: 'Shell token missing or invalid' };
    }
  } else if (policy.requireToken) {
    if (!requiredToken) {
      return { success: false, error: 'Shell token not configured' };
    }
    if (!payload?.token || payload.token !== requiredToken) {
      return { success: false, error: 'Shell token missing or invalid' };
    }
  }

  const userHome = await ensureUserHome(projectRoot, { id: user.id, username: user.username }, policy.userRoot);
  const userRoot = userHome.home;

  let cwd;
  try {
    cwd = resolveCwd(scope, userRoot, payload?.cwd);
  } catch (error) {
    return { success: false, error: error.message };
  }

  const command = tokens[0];
  const args = tokens.slice(1);
  const startTime = Date.now();
  const timeoutMs = Math.min(
    Number(payload?.timeoutMs || payload?.timeout_ms || policy.maxDurationMs || DEFAULT_POLICY.maxDurationMs),
    policy.maxDurationMs || DEFAULT_POLICY.maxDurationMs
  );
  const maxOutput = policy.maxOutputBytes || DEFAULT_POLICY.maxOutputBytes;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      try { proc.kill('SIGKILL'); } catch (_) { }
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      if (stdout.length >= maxOutput) return;
      stdout += chunk.toString();
      if (stdout.length > maxOutput) {
        stdout = stdout.slice(0, maxOutput);
      }
    });

    proc.stderr.on('data', (chunk) => {
      if (stderr.length >= maxOutput) return;
      stderr += chunk.toString();
      if (stderr.length > maxOutput) {
        stderr = stderr.slice(0, maxOutput);
      }
    });

    const finalize = (payloadResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(killTimer);
      resolve(payloadResult);
    };

    proc.on('error', (error) => {
      finalize({
        success: false,
        error: error.message,
        stdout,
        stderr,
        durationMs: Date.now() - startTime
      });
    });

    proc.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      if (timedOut) {
        finalize({
          success: false,
          error: 'Command timed out',
          stdout,
          stderr,
          exitCode: code,
          durationMs
        });
        return;
      }

      finalize({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code,
        durationMs
      });
    });
  }).then((result) => {
    const summary = {
      userId: user.id,
      username: user.username || null,
      scope,
      cwd,
      command: tokens.join(' '),
      connectionId: connectionId || null,
      exitCode: result.exitCode
    };
    console.log('[shell] request', JSON.stringify(summary));
    return {
      ...result,
      cwd,
      scope
    };
  });
}
