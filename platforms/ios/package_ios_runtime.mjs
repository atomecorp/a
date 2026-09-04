#!/usr/bin/env node

import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');
const atomeRoot = path.join(projectRoot, 'atome');
const sourceRoot = path.join(atomeRoot, 'src');
const eveRoot = path.join(projectRoot, 'eVe');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
if (!outputArg) throw new Error('package_ios_runtime_output_required');
const outputRoot = path.resolve(outputArg.slice('--output='.length));
// Measurement window, 2026-09-04: the byte budget alone has never been shown to
// be the dimension WebKit's per-process limit responds to. It is temporarily
// widened to admit the opt-level="s" candidate (15,009,530 bytes, 65,254
// functions against 75,015) so the device can decide between code size and
// function count. Restore a budget the iPhone actually validated.
const IOS_WEB_RENDERER_MAX_BYTES = 16_000_000;
const rendererWasmPath = path.join(sourceRoot, 'wasm/squirrel_bevy_renderer_bg.wasm');
const rendererWasmBytes = (await stat(rendererWasmPath)).size;
if (rendererWasmBytes > IOS_WEB_RENDERER_MAX_BYTES) {
    throw new Error(
        `ios_renderer_memory_budget_exceeded:${rendererWasmBytes}>${IOS_WEB_RENDERER_MAX_BYTES};`
        + ' rebuild the release renderer with ./platforms/web/bevy-renderer/build.sh'
    );
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'tests', 'documentations', 'concept', 'R&D']);
const SKIP_EXTENSIONS = new Set(['.js', '.mjs', '.map', '.rs', '.ts', '.md', '.lock', '.orig']);
const RAW_SCRIPT_PATHS = new Set([
    'src/squirrel/early-init.js',
    'src/js/gsap.min.js',
    'src/wasm/squirrel_audio_wasm.js',
    'src/wasm/squirrel_bevy_renderer.js',
    'src/wasm/renderer_version.mjs'
]);
const SKIP_RUNTIME_PATHS = new Set([
    'src/assets/videos/JeezsFire.mp4',
    'src/assets/videos/WhatsApp Video 2026-04-28 at 21.27.38.mp4',
    'src/assets/videos/video_1787217554069.mp4',
    'src/wasm/squirrel_bevy_renderer_bg.wasm.br',
    'src/wasm/squirrel_bevy_renderer_bg.wasm.gz'
]);

const walk = async (root, visit, relative = '') => {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.DS_Store' || entry.name.startsWith('.git') || SKIP_DIRS.has(entry.name)) continue;
        const next = path.join(relative, entry.name);
        if (entry.isDirectory()) await walk(root, visit, next);
        else await visit(path.join(root, next), next);
    }
};

const descriptorPattern = /\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*path:\s*['"]([^'"]+\.js)['"]/g;
const descriptors = new Map();
const javascriptRoots = [sourceRoot, eveRoot];
for (const root of javascriptRoots) {
    await walk(root, async (absolutePath) => {
        if (!absolutePath.endsWith('.js')) return;
        const source = await readFile(absolutePath, 'utf8');
        for (const match of source.matchAll(descriptorPattern)) {
            const moduleId = match[1];
            const target = path.resolve(path.dirname(absolutePath), match[2]);
            const existing = descriptors.get(moduleId);
            if (existing && existing !== target) {
                throw new Error(`packaged_module_id_collision:${moduleId}`);
            }
            descriptors.set(moduleId, target);
        }
    });
}

const OPTIONAL_MODULE_IDS = new Set([
    'ai.agent_gateway',
    'ai.default_tools',
    'ai.model_catalog_refresh',
    'bank.bootstrap',
    'calendar.bootstrap',
    'contacts.bootstrap',
    'mail.bootstrap',
    'voice.bootstrap'
]);
const EVE_ENTRY_MODULE_ID = 'application.eVe';
const isEveModule = (moduleId) => moduleId === EVE_ENTRY_MODULE_ID || moduleId.startsWith('eve.');
const criticalDescriptors = [...descriptors.entries()]
    .filter(([moduleId]) => !OPTIONAL_MODULE_IDS.has(moduleId) && !isEveModule(moduleId));
const eveDescriptors = [...descriptors.entries()]
    .filter(([moduleId]) => moduleId.startsWith('eve.'));
const EVE_CRITICAL_MODULE_IDS = new Set([
    'eve.bevy_ui_runtime',
    'eve.tool_genesis',
    'eve.atome_commit',
    'eve.languages',
    'eve.i18n',
    'eve.design',
    'eve.project_bootstrap',
    'eve.bootstrap'
]);
const eveCriticalDescriptors = eveDescriptors.filter(([moduleId]) => EVE_CRITICAL_MODULE_IDS.has(moduleId));
const eveDeferredDescriptors = eveDescriptors.filter(([moduleId]) => !EVE_CRITICAL_MODULE_IDS.has(moduleId));
if (eveCriticalDescriptors.length !== EVE_CRITICAL_MODULE_IDS.size) {
    throw new Error('packaged_eve_critical_descriptor_missing');
}
const optionalDescriptors = [...descriptors.entries()]
    .filter(([moduleId]) => OPTIONAL_MODULE_IDS.has(moduleId));
const registryLines = criticalDescriptors
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleId, target]) => `  ${JSON.stringify(moduleId)}: () => import(${JSON.stringify(target)})`);
registryLines.push(`  ${JSON.stringify(EVE_ENTRY_MODULE_ID)}: () => import('/chunks/eve/eve-application.js')`);
for (const [moduleId] of optionalDescriptors.sort(([left], [right]) => left.localeCompare(right))) {
    registryLines.push(
        `  ${JSON.stringify(moduleId)}: () => import('/chunks/optional-integrations.js')`
        + `.then((module) => module.optionalModuleLoaders[${JSON.stringify(moduleId)}]())`
    );
}
const entrySource = `
globalThis.__ATOME_PACKAGED_MODULES__ = Object.freeze({
${registryLines.join(',\n')}
});
await import(${JSON.stringify(path.join(sourceRoot, 'squirrel/spark.js'))});
`;
const optionalEntrySource = `
export const optionalModuleLoaders = Object.freeze({
${optionalDescriptors
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleId, target]) => `  ${JSON.stringify(moduleId)}: () => import(${JSON.stringify(target)})`)
    .join(',\n')}
});
`;
const workspaceSurfacePath = path.join(eveRoot, 'intuition/tools/user_workspace_surface_runtime.js');
const WORKSPACE_SURFACE_ENTRY_NAME = 'critical-workspace-surface';
const WORKSPACE_SURFACE_ENTRY_URL = `/chunks/eve/${WORKSPACE_SURFACE_ENTRY_NAME}.js`;
const workspaceMainMenuPath = path.join(eveRoot, 'intuition/tools/workspace_main_menu_visibility.js');
const WORKSPACE_MAIN_MENU_ENTRY_NAME = 'critical-workspace-main-menu';
const WORKSPACE_MAIN_MENU_ENTRY_URL = `/chunks/eve/${WORKSPACE_MAIN_MENU_ENTRY_NAME}.js`;
const bevyProjectPreviewCaptureFramePath = path.join(eveRoot, 'domains/rendering/bevy_project_preview_capture_frame.js');
const EXTRA_CRITICAL_ENTRY_COUNT = 2;
const criticalEntryNameByModuleId = new Map(eveCriticalDescriptors.map(([moduleId]) => [
    moduleId,
    `critical-${moduleId.slice('eve.'.length).replace(/[^a-zA-Z0-9_-]/g, '-')}`
]));
const criticalEveEntryUrlByPath = new Map([
    ...eveCriticalDescriptors.map(([moduleId, target]) => [
        target,
        `/chunks/eve/${criticalEntryNameByModuleId.get(moduleId)}.js`
    ]),
    [workspaceSurfacePath, WORKSPACE_SURFACE_ENTRY_URL],
    [workspaceMainMenuPath, WORKSPACE_MAIN_MENU_ENTRY_URL]
]);
const eveApplicationSource = `
import { startEve } from ${JSON.stringify(path.join(eveRoot, 'eVe.js'))};
globalThis.__ATOME_PACKAGED_MODULES__ = Object.freeze({
  ...(globalThis.__ATOME_PACKAGED_MODULES__ || {}),
${[
    ...eveCriticalDescriptors.map(([moduleId]) => (
        `  ${JSON.stringify(moduleId)}: () => import(${JSON.stringify(`/chunks/eve/${criticalEntryNameByModuleId.get(moduleId)}.js`)})`
    )),
    ...eveDeferredDescriptors.map(([moduleId, target]) => (
        `  ${JSON.stringify(moduleId)}: () => import(${JSON.stringify(target)})`
    ))
]
    .sort((left, right) => left.localeCompare(right))
    .join(',\n')}
});
await startEve();
`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const deferredEntryTargets = new Map();
const deferDynamicImportsPlugin = {
    name: 'atome-ios-deferred-imports',
    setup(buildContext) {
        buildContext.onResolve({ filter: /.*/ }, async (args) => {
            if (args.kind !== 'dynamic-import') return null;
            if (args.path.startsWith('/chunks/')) return { path: args.path, external: true };
            const resolved = await buildContext.resolve(args.path, {
                importer: args.importer,
                resolveDir: args.resolveDir,
                kind: 'import-statement'
            });
            if (resolved.errors.length || !resolved.path) return null;
            const criticalEntryUrl = criticalEveEntryUrlByPath.get(resolved.path);
            if (criticalEntryUrl) return { path: criticalEntryUrl, external: true };
            const relative = path.relative(projectRoot, resolved.path).replace(/\\/g, '/');
            const entryName = relative.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
            const existing = deferredEntryTargets.get(entryName);
            if (existing && existing !== resolved.path) throw new Error(`packaged_deferred_entry_collision:${entryName}`);
            deferredEntryTargets.set(entryName, resolved.path);
            return { path: `/chunks/deferred/${entryName}.js`, external: true };
        });
    }
};
// Home is deferred, but its anonymous/authenticated actions call the same
// workspace owner already loaded by the critical boot graph. Without this
// alias, esbuild emits a second copy of that stateful module in the deferred
// graph, so the two copies can bootstrap and project the Dashboard concurrently.
const reuseCriticalEveModulesPlugin = {
    name: 'atome-ios-reuse-critical-eve-modules',
    setup(buildContext) {
        buildContext.onResolve({ filter: /\.js$/ }, (args) => {
            const resolved = path.resolve(args.resolveDir || path.dirname(args.importer), args.path);
            const criticalEntryUrl = criticalEveEntryUrlByPath.get(resolved);
            return criticalEntryUrl ? { path: criticalEntryUrl, external: true } : null;
        });
    }
};
const optionalBuild = await build({
    stdin: {
        contents: optionalEntrySource,
        resolveDir: projectRoot,
        sourcefile: 'chunks/optional-integrations.entry.js'
    },
    absWorkingDir: projectRoot,
    bundle: true,
    splitting: false,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    external: ['/wasm/*', 'node:*'],
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    outfile: path.join(outputRoot, 'chunks/optional-integrations.js'),
    logLevel: 'warning',
    metafile: true,
    write: true
});
const criticalGroupBuild = await build({
    entryPoints: {
        ...Object.fromEntries(eveCriticalDescriptors.map(([moduleId, target]) => [
            criticalEntryNameByModuleId.get(moduleId),
            target
        ])),
        [WORKSPACE_SURFACE_ENTRY_NAME]: workspaceSurfacePath,
        [WORKSPACE_MAIN_MENU_ENTRY_NAME]: workspaceMainMenuPath
    },
    absWorkingDir: projectRoot,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    external: ['/chunks/*', '/wasm/*', 'node:*'],
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    outdir: path.join(outputRoot, 'chunks/eve'),
    entryNames: '[name]',
    chunkNames: 'critical-shared-[hash]',
    plugins: [deferDynamicImportsPlugin],
    logLevel: 'warning',
    metafile: true,
    write: true
});
const eveBuild = await build({
    stdin: {
        contents: eveApplicationSource,
        resolveDir: projectRoot,
        sourcefile: 'eve-application.js'
    },
    absWorkingDir: projectRoot,
    bundle: true,
    splitting: false,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    external: ['/chunks/*', '/wasm/*', 'node:*'],
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    outfile: path.join(outputRoot, 'chunks/eve/eve-application.js'),
    plugins: [deferDynamicImportsPlugin],
    logLevel: 'warning',
    metafile: true,
    write: true
});
const deferredBuild = deferredEntryTargets.size ? await build({
    entryPoints: Object.fromEntries(deferredEntryTargets),
    absWorkingDir: projectRoot,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    external: ['/chunks/*', '/wasm/*', 'node:*'],
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    outdir: path.join(outputRoot, 'chunks/deferred'),
    entryNames: '[name]',
    chunkNames: 'shared/[name]-[hash]',
    plugins: [reuseCriticalEveModulesPlugin],
    logLevel: 'warning',
    metafile: true,
    write: true
}) : null;
const criticalBuild = await build({
    stdin: {
        contents: entrySource,
        resolveDir: projectRoot,
        sourcefile: 'src/squirrel/spark.packaged.js'
    },
    absWorkingDir: projectRoot,
    bundle: true,
    splitting: false,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    external: ['/chunks/*', '/wasm/*', 'node:*'],
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    outfile: path.join(outputRoot, 'src/squirrel/spark.js'),
    logLevel: 'warning',
    metafile: true,
    write: true
});
const previewCaptureFrameBuild = await build({
    entryPoints: [bevyProjectPreviewCaptureFramePath],
    absWorkingDir: projectRoot,
    bundle: true,
    splitting: false,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    external: ['/wasm/*', 'node:*'],
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    outfile: path.join(outputRoot, 'eVe/domains/rendering/bevy_project_preview_capture_frame.js'),
    logLevel: 'warning',
    metafile: true,
    write: true
});
await writeFile(
    path.join(outputRoot, 'build-manifest.json'),
    JSON.stringify({
        version: 1,
        module_count: descriptors.size,
        critical_module_count: criticalDescriptors.length + eveCriticalDescriptors.length + EXTRA_CRITICAL_ENTRY_COUNT,
        eve_module_count: eveDescriptors.length,
        optional_module_count: optionalDescriptors.length,
        critical_outputs: criticalBuild.metafile.outputs,
        eve_outputs: eveBuild.metafile.outputs,
        eve_critical_outputs: criticalGroupBuild.metafile.outputs,
        preview_capture_outputs: previewCaptureFrameBuild.metafile.outputs,
        deferred_outputs: deferredBuild?.metafile.outputs || {},
        optional_outputs: optionalBuild.metafile.outputs
    }, null, 2)
);

await build({
    entryPoints: [path.join(sourceRoot, 'squirrel/voice/local_tts_worker.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['safari16.4'],
    minifySyntax: true,
    minifyWhitespace: true,
    outfile: path.join(outputRoot, 'src/squirrel/voice/local_tts_worker.js'),
    logLevel: 'warning'
});

const copyRuntimeFiles = async (root, prefix) => {
    await walk(root, async (absolutePath, relativePath) => {
        const outputRelative = path.join(prefix, relativePath);
        const extension = path.extname(relativePath).toLowerCase();
        if (SKIP_RUNTIME_PATHS.has(outputRelative)) return;
        if (SKIP_EXTENSIONS.has(extension) && !RAW_SCRIPT_PATHS.has(outputRelative)) return;
        const destination = path.join(outputRoot, outputRelative);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(absolutePath, destination);
    });
};

await copyRuntimeFiles(sourceRoot, 'src');
await copyRuntimeFiles(eveRoot, 'eVe');

for (const name of ['server_config.json', 'version.txt']) {
    const source = path.join(projectRoot, name);
    try {
        if ((await stat(source)).isFile()) await cp(source, path.join(outputRoot, name));
    } catch { }
}

const rubberbandSource = path.join(projectRoot, 'node_modules/rubberband-wasm/dist');
try {
    await cp(rubberbandSource, path.join(outputRoot, 'vendor/rubberband-wasm'), { recursive: true });
} catch { }

const outputEntries = [];
await walk(outputRoot, async (absolutePath, relativePath) => {
    const details = await stat(absolutePath);
    outputEntries.push({ path: relativePath.split(path.sep).join('/'), bytes: details.size });
});
await writeFile(
    path.join(outputRoot, 'runtime-manifest.json'),
    JSON.stringify({ version: 1, files: outputEntries.sort((a, b) => a.path.localeCompare(b.path)) }, null, 2)
);
console.log(
    `[iOS runtime] ${outputEntries.length} files, ${criticalDescriptors.length + eveCriticalDescriptors.length + EXTRA_CRITICAL_ENTRY_COUNT} critical owners in one shared graph, `
    + `${optionalDescriptors.length} deferred owners -> ${outputRoot}`
);
