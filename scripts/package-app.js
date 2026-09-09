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
    readFile,
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

// Artifacts a browser/PWA runtime never loads: build sources, dev maps, docs,
// tests, VCS/tooling dirs. Excluding them from packages strips the vendored
// Rust renderer tree, 7.5 MB of sourcemaps, colocated tests, and documentation
// without touching any runtime-loaded js/css/wasm/asset. Source tree untouched.
// Aligné sur platforms/ios/package_ios_runtime.mjs, qui excluait déjà ces
// répertoires et ces vidéos: R&D (912 Ko de maquettes HTML et de marque-pages),
// les documentations et les tests colocalisés n'ont rien à faire dans un paquet
// exécutable, et les trois vidéos ci-dessous ne sont référencées par aucun code
// produit (24,9 Mo).
const SKIP_DIR_NAMES = new Set(['node_modules', 'target', '.git', 'R&D', 'documentations', 'concept', 'tests']);
const SKIP_FILE_EXTS = new Set(['.map', '.rs', '.md', '.orig', '.lock']);
const SKIP_FILE_NAMES = new Set([
    'JeezsFire.mp4',
    'video_1787217554069.mp4',
    'WhatsApp Video 2026-04-28 at 21.27.38.mp4'
]);
const shouldSkipEntry = (entry) => {
    if (entry.isDirectory()) {
        return SKIP_DIR_NAMES.has(entry.name);
    }
    if (entry.name === '.DS_Store') {
        return true;
    }
    if (/\.(?:test|probe)\.mjs$/.test(entry.name)) {
        return true;
    }
    if (SKIP_FILE_NAMES.has(entry.name)) {
        return true;
    }
    return SKIP_FILE_EXTS.has(path.extname(entry.name));
};

async function copyDirectory(src, dest) {
    if (!(await pathExists(src))) {
        return;
    }

    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        if (shouldSkipEntry(entry)) {
            continue;
        }
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
        const defaultSourcePath = path.join(projectRoot, 'atome', 'src', 'application', 'index.js');
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

        // The package must reproduce the URL space the app is written against:
        //   /            -> atome/src        (assets, squirrel, utils, shared, wasm, ...)
        //   /eVe/        -> eVe              (reached by ../../../../eVe/ from atome/src)
        //   /vendor/rubberband-wasm/         (declared by the importmap AND by RUBBERBAND_WASM_URL)
        // The previous shape copied five subfolders flat AND the whole atome/ tree on top,
        // which duplicated the 188 MB of assets while still leaving utils/ and shared/ --
        // the first five imports of spark.js -- missing from the flat root.
        await copyDirectory(path.join(projectRoot, 'atome', 'src'), targetDir);
        await copyDirectory(path.join(projectRoot, 'eVe'), path.join(targetDir, 'eVe'));
        await copyDirectory(
            path.join(projectRoot, 'node_modules', 'rubberband-wasm', 'dist'),
            path.join(targetDir, 'vendor', 'rubberband-wasm')
        );
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

        // index.html is NOT re-authored here. A hand-written copy drifted from the real
        // entry point: it lost the importmap (114 bare `#squirrel/` specifiers stop
        // resolving), it never loaded early-init.js, and it registered a second,
        // cache-first service worker that contradicts atome/src/sw.js -- the very
        // stale-JS hazard sw.js documents avoiding. The real entry is copied verbatim
        // by copyDirectory above; only the <title> and the manifest link are patched.
        const entryHtmlPath = path.join(targetDir, 'index.html');
        const entryHtml = await readFile(entryHtmlPath, 'utf8');
        const packagedHtml = entryHtml
            .replace(/<title>[^<]*<\/title>/, `<title>${packageName}</title>`)
            .replace(
                /(\s*)<link rel="stylesheet"/,
                `$1<link rel="manifest" href="./manifest.json">$1<link rel="stylesheet"`
            );
        if (packagedHtml === entryHtml) {
            throw new Error('package_index_html_patch_failed: atome/src/index.html changed shape');
        }
        await writeFile(entryHtmlPath, packagedHtml, 'utf8');

        console.log(`✅ Package prêt dans ${targetDir}`);
        console.log('Fichiers inclus :');
        console.log(`- ${path.basename(exampleDest)}`);
        console.log('- manifest.json');
        console.log('- index.html + sw.js (copies conformes de atome/src)');
        console.log('- assets, css, js, squirrel, application, utils, shared, wasm');
        console.log('- eVe/');
        console.log('- vendor/rubberband-wasm/');
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
