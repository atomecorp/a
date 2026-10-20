// Boot configuration read before the Fastify instance exists: .env files and
// the HTTPS certificate lookup. Both run at the exact point server.js used to
// run them inline, so modules evaluated earlier still see the pre-.env state.
import path from 'path';
import { readFileSync, existsSync } from 'fs';

function loadEnvFile(filePath, options = {}) {
  const { override = false } = options;
  if (!existsSync(filePath)) return false;

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) continue;

    const key = line.slice(0, delimiterIndex).trim();
    if (!key) continue;

    let value = line.slice(delimiterIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');

    if (override || !(key in process.env)) {
      process.env[key] = value;
    }
  }
  return true;
}

export function loadServerEnvFiles(projectRoot_env) {
  // Load .env and .env.local (local overrides main)
  loadEnvFile(path.join(projectRoot_env, '.env'));
  loadEnvFile(path.join(projectRoot_env, '.env.local'), { override: true });
}

export function resolveHttpsOptions(projectRoot) {
  // HTTPS Configuration
  let httpsOptions = null;
  if (process.env.USE_HTTPS === 'true') {
    // Check multiple locations for certificates
    // 1. Production path (deploy/certs)
    // 2. Local development path (dev/certs)
    const possibleDirs = [
      path.join(projectRoot, 'deploy', 'certs'),
      path.join(projectRoot, 'dev', 'certs'),
      path.join(projectRoot, 'scripts', 'certs'),
      path.join(projectRoot, 'certs')
    ];

    let certConfig = null;

    for (const dir of possibleDirs) {
      // Check for standard names (key.pem, cert.pem) - used by our scripts
      if (existsSync(path.join(dir, 'key.pem')) && existsSync(path.join(dir, 'cert.pem'))) {
        certConfig = {
          key: path.join(dir, 'key.pem'),
          cert: path.join(dir, 'cert.pem')
        };
        break;
      }
      // Check for Let's Encrypt names (privkey.pem, fullchain.pem) - if copied directly
      if (existsSync(path.join(dir, 'privkey.pem')) && existsSync(path.join(dir, 'fullchain.pem'))) {
        certConfig = {
          key: path.join(dir, 'privkey.pem'),
          cert: path.join(dir, 'fullchain.pem')
        };
        break;
      }
    }

    if (certConfig) {
      try {
        console.log(`🔐 Loading HTTPS certificates from: ${path.dirname(certConfig.key)}`);
        httpsOptions = {
          key: readFileSync(certConfig.key),
          cert: readFileSync(certConfig.cert)
        };
        console.log('🔐 HTTPS enabled');
      } catch (e) {
        console.error('❌ Failed to load SSL certificates:', e.message);
      }
    } else {
      console.warn('⚠️ USE_HTTPS is true but no valid certificates found in deploy/certs/, dev/certs/, scripts/certs/, or certs/');
    }
  }
  return httpsOptions;
}
