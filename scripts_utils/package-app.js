#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    access,
    copyFile,
    mkdir,
    readdir,
    rm,
    stat,
    writeFile
} from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cliArgs = process.argv.slice(2);
const cliOptions = {
    source: undefined,
    name: undefined,
    overwrite: false
};

for (const arg of cliArgs) {
    if (arg.startsWith('--source=')) {
        cliOptions.source = arg.slice('--source='.length).trim();
    } else if (arg.startsWith('--name=')) {
        cliOptions.name = arg.slice('--name='.length).trim();
    } else if (arg === '--overwrite' || arg === '--force' || arg === '-y') {
        cliOptions.overwrite = true;
    } else if (!cliOptions.source) {
        cliOptions.source = arg.trim();
    } else if (!cliOptions.name) {
        cliOptions.name = arg.trim();
    }
}

let rl;

const getReadline = () => {
    if (!rl) {
        rl = createInterface({ input, output });
    }
    return rl;
};

const ask = async (question) => {
    const answer = await getReadline().question(question);
    return answer.trim();
};

async function pathExists(targetPath) {
    try {
        await access(targetPath);
        return true;
    } catch (error) {
        return false;
    }
}

async function copyDirectory(src, dest) {
    if (!(await pathExists(src))) {
        return;
    }

    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else if (entry.isSymbolicLink()) {
            try {
                const target = await stat(srcPath);
                if (target.isDirectory()) {
                    await copyDirectory(srcPath, destPath);
                } else {
                    await copyFile(srcPath, destPath);
                }
            } catch {
                // Ignore broken links silently
            }
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

async function main() {
    try {
        const defaultSourcePath = path.join(projectRoot, 'src', 'application', 'index.js');
        const sourceInput = cliOptions.source ? cliOptions.source.trim() : defaultSourcePath;
        if (!sourceInput) {
            throw new Error('Aucun chemin fourni.');
        }

        const sourcePath = path.resolve(sourceInput);
        if (!(await pathExists(sourcePath))) {
            throw new Error(`Le fichier ${sourcePath} est introuvable.`);
        }

        if (path.extname(sourcePath) !== '.js') {
            throw new Error("Le fichier fourni doit avoir l'extension .js");
        }

        const defaultPackageName = path.basename(sourcePath, '.js');
        const packageNameInput = (cliOptions.name ?? await ask(`Nom du package (défaut: ${defaultPackageName}) : `)).trim();
        const packageName = packageNameInput || defaultPackageName;

        const packagesRoot = path.join(projectRoot, 'packages');
        await mkdir(packagesRoot, { recursive: true });

        const targetDir = path.join(packagesRoot, packageName);

        if (await pathExists(targetDir)) {
            const overwriteAnswer = cliOptions.overwrite
                ? 'y'
                : (await ask(`Le dossier ${targetDir} existe déjà. Le recréer ? (y/N) `)).toLowerCase();
            if (!['y', 'o', 'yes', 'oui'].includes(overwriteAnswer)) {
                console.log('Opération annulée.');
                return;
            }
            await rm(targetDir, { recursive: true, force: true });
        }

        await mkdir(targetDir, { recursive: true });

        const exampleDest = path.join(targetDir, path.basename(sourcePath));

        await copyDirectory(path.join(projectRoot, 'src', 'js'), path.join(targetDir, 'js'));
        await copyDirectory(path.join(projectRoot, 'src', 'assets'), path.join(targetDir, 'assets'));
        await copyDirectory(path.join(projectRoot, 'src', 'css'), path.join(targetDir, 'css'));
        await copyDirectory(path.join(projectRoot, 'src', 'squirrel'), path.join(targetDir, 'squirrel'));
        await copyDirectory(path.join(projectRoot, 'src', 'application'), path.join(targetDir, 'application'));
        await copyFile(sourcePath, exampleDest);

        const manifest = {
            name: packageName,
            short_name: packageName,
            start_url: '.',
            display: 'standalone',
            background_color: '#111111',
            theme_color: '#111111',
            lang: 'fr-FR',
            description: `Application empaquetée depuis ${path.relative(projectRoot, sourcePath)}`,
            icons: []
        };

        await writeFile(
            path.join(targetDir, 'manifest.json'),
            JSON.stringify(manifest, null, 2),
            'utf8'
        );

        const cacheName = `package-${packageName}-v1`;
        const serviceWorkerContent = `const CACHE_NAME = '${cacheName}';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then(networkResponse => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());
    })
  );
});
`;

        await writeFile(path.join(targetDir, 'service-worker.js'), serviceWorkerContent, 'utf8');

        const indexHtmlContent = `<!DOCTYPE html>
<html lang="fr">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="App">
  <title>${packageName}</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="css/squirrel.css">
  <link rel="stylesheet" href="js/leaflet.min.css">
  <script src="js/gsap.min.js"></script>
  <script src="js/leaflet.min.js"></script>
  <script src="js/wavesurfer.min.js"></script>
  <script type="module" src="js/three.min.js"></script>
  <script type="module" src="squirrel/spark.js"></script>
  <script type="module">
    let __appImported = false;
    const importAppOnce = () => {
      if (__appImported) {
        return;
      }
      __appImported = true;
      import('./application/index.js');
    };

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOS) {
      window.addEventListener('squirrel:ready', importAppOnce, { once: true });
    } else {
      window.addEventListener('local-server-ready', importAppOnce, { once: true });
      window.addEventListener('squirrel:ready', () => {
        setTimeout(importAppOnce, 900);
      }, { once: true });
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(err => {
          console.warn('Service worker registration failed:', err);
        });
      }, { once: true });
    }
  </script>
</head>

<body>
</body>

</html>
`;

        await writeFile(path.join(targetDir, 'index.html'), indexHtmlContent, 'utf8');

        console.log(`✅ Package prêt dans ${targetDir}`);
        console.log('Fichiers inclus :');
        console.log(`- ${path.basename(exampleDest)}`);
        console.log('- manifest.json');
        console.log('- service-worker.js');
        console.log('- index.html');
        console.log('- js');
        console.log('- assets');
        console.log('- css');
        console.log('- squirrel');
        console.log('- application');
        console.log('\nServez ce dossier en local (ex: `npx http-server`) et ouvrez http://localhost:PORT pour tester la PWA.');
        console.log('Le service worker nécessite un contexte sécurisé (HTTPS ou localhost).');
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exitCode = 1;
    } finally {
        if (rl) {
            rl.close();
        }
    }
}

main();
