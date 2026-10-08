#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const entries = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
const info = file => fs.existsSync(file) ? fs.lstatSync(file) : null;
const modified = file => info(file)?.mtimeMs || 0;
const directory = file => info(file)?.isDirectory() && !info(file)?.isSymbolicLink();

// Build ownership is checked against Xcode's descriptor, not a guessed folder name.
function workspaceOf(cache) {
    const descriptor = path.join(cache, 'Info.plist');
    if (!info(descriptor)?.isFile()) return null;
    return execFileSync('/usr/bin/plutil', ['-extract', 'WorkspacePath', 'raw', '-o', '-', descriptor], { encoding: 'utf8' }).trim();
}

export function activeCompilers() {
    const processes = execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' });
    return processes.split('\n').map(line => path.basename(line.trim()))
        .filter(name => /^(cargo|rustc|xcodebuild|XCBuild|swift-frontend|clang|clang\+\+|ld|atome|squirrel)$/.test(name));
}

function assertContained(file, container) {
    const relative = path.relative(container, file);
    if (info(container)?.isSymbolicLink()) throw new Error('build_cache_container_symlink_forbidden');
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('build_cache_path_outside_container');
    let cursor = container;
    for (const part of relative.split(path.sep)) {
        cursor = path.join(cursor, part);
        if (info(cursor)?.isSymbolicLink()) throw new Error(`build_cache_symlink_forbidden:${cursor}`);
    }
}

export function planBuildCleanup({ root = projectRoot,
    derivedData = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData'), phase = 'end',
    readWorkspace = workspaceOf } = {}) {
    if (!['start', 'end'].includes(phase)) throw new Error('build_cache_phase_invalid');
    root = fs.realpathSync(root);
    const target = path.join(root, 'platforms/desktop-tauri/target');
    const temp = path.join(root, 'temp');
    const plan = [];
    const wholeDirectories = [];
    const selected = new Set();
    const kept = [];
    const add = (file, reason, container = root) => {
        const record = info(file);
        if (!record) return;
        assertContained(file, container);
        if (selected.has(file) || wholeDirectories.some(parent => file.startsWith(`${parent}${path.sep}`))) return;
        if (record.isDirectory()) {
            wholeDirectories.push(file);
            for (let index = plan.length - 1; index >= 0; index--) {
                if (plan[index].path.startsWith(`${file}${path.sep}`)) plan.splice(index, 1);
            }
        }
        selected.add(file);
        plan.push({ path: file, reason, container });
    };
    const profiles = ['debug', 'release'].map(name => {
        const folder = path.join(target, name);
        const bundle = path.join(folder, 'bundle/macos/atome.app');
        return { name, folder, bundle, time: modified(path.join(bundle, 'Contents/Info.plist')),
            binaryTime: modified(path.join(folder, 'atome')) };
    });
    const newestBundle = profiles.filter(profile => profile.time).sort((a, b) => b.time - a.time)[0];
    const newestBinary = profiles.filter(profile => profile.binaryTime).sort((a, b) => b.binaryTime - a.binaryTime)[0];
    const cacheProfile = newestBinary || newestBundle;
    if (newestBundle) kept.push(newestBundle.bundle);
    for (const profile of profiles) {
        assertContained(path.join(profile.folder, 'deps'), root);
        for (const entry of entries(path.join(profile.folder, 'deps'))) {
            if (entry.isFile() && entry.name.endsWith('.rcgu.o')) add(path.join(profile.folder, 'deps', entry.name), 'abandoned-rust-object');
        }
        // This staging tree came from an old resource map. Current resources
        // ship wasm under atome/src, never a second Rust target tree.
        for (const resource of ['project']) {
            const copiedTarget = path.join(profile.folder, resource, 'atome/renderers/bevy-core/target');
            add(copiedTarget, 'copied-rust-build-cache');
        }
        if (phase === 'end' && cacheProfile && profile.name !== cacheProfile.name) {
            for (const child of ['deps', 'build', '.fingerprint', 'incremental', 'examples', 'atome', 'libsquirrel_lib.a', 'libsquirrel_lib.dylib', 'libsquirrel_lib.rlib']) {
                add(path.join(profile.folder, child), 'obsolete-tauri-profile');
            }
        } else kept.push(profile.folder);
        if (phase === 'end' && newestBundle && profile.name !== newestBundle.name) add(path.join(profile.folder, 'bundle'), 'obsolete-tauri-bundle');
    }
    if (phase === 'start') return { plan, kept };

    for (const entry of entries(target)) {
        if (entry.isDirectory() && /-linux-android$/.test(entry.name)) add(path.join(target, entry.name), 'obsolete-android-build-cache');
    }

    const project = path.join(root, 'platforms/ios/atome-auv3/atome.xcodeproj');
    const ownsWorkspace = cache => [project, path.join(project, 'project.xcworkspace')].includes(readWorkspace(cache));
    const caches = [];
    for (const entry of entries(derivedData)) {
        if (!entry.isDirectory() || !entry.name.startsWith('atome-')) continue;
        const cache = path.join(derivedData, entry.name);
        assertContained(cache, derivedData);
        if (ownsWorkspace(cache)) caches.push(cache);
    }
    caches.sort((a, b) => modified(b) - modified(a));
    if (caches[0]) kept.push(caches[0]);
    for (const cache of caches.slice(1)) add(cache, 'duplicate-xcode-cache', derivedData);
    if (caches[0]) {
        const intermediates = path.join(caches[0], 'Build/Intermediates.noindex');
        const sharedRust = path.join(intermediates, 'atome.build/Debug-iphoneos/ios-bevy-renderer-target');
        kept.push(sharedRust);
        for (const base of [intermediates, path.join(intermediates, 'ArchiveIntermediates/atome/IntermediateBuildFilesPath')]) {
            for (const projectEntry of entries(base)) {
                if (!projectEntry.isDirectory() || projectEntry.name !== 'atome.build') continue;
                const projectCache = path.join(base, projectEntry.name);
                for (const configuration of entries(projectCache)) {
                    if (!configuration.isDirectory()) continue;
                    const rust = path.join(projectCache, configuration.name, 'ios-bevy-renderer-target');
                    if (rust !== sharedRust) add(rust, 'duplicate-ios-rust-cache', derivedData);
                }
            }
        }
    }

    const jobs = entries(temp).filter(entry => entry.isDirectory() && /^testflight\.[A-Za-z0-9]+$/.test(entry.name))
        .map(entry => path.join(temp, entry.name));
    const completeJobs = jobs.map(job => {
        const archive = entries(job).find(entry => entry.isDirectory() && entry.name.endsWith('.xcarchive')
            && info(path.join(job, entry.name, 'Info.plist'))?.isFile());
        const ipa = entries(path.join(job, 'export')).find(entry => entry.isFile() && entry.name.endsWith('.ipa'));
        return archive && ipa ? { job, time: modified(path.join(job, 'export', ipa.name)) } : null;
    }).filter(Boolean).sort((a, b) => b.time - a.time || a.job.localeCompare(b.job));
    if (completeJobs[0]) kept.push(completeJobs[0].job);
    for (const job of jobs) {
        if (job !== completeJobs[0]?.job) add(job, 'obsolete-testflight-run');
        else add(path.join(job, 'DerivedData'), 'per-run-xcode-cache');
    }
    const inspectTemporaryCache = (cache, depth) => {
        if (directory(path.join(cache, 'Build/Intermediates.noindex'))) {
            if (ownsWorkspace(cache)) add(cache, 'temporary-xcode-cache');
            return;
        }
        if (depth === 0) return;
        for (const entry of entries(cache)) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('testflight.')
                || ['target', 'node_modules', 'android-sdk', 'android-avd', 'platforms', 'atome', 'eVe'].includes(entry.name)) continue;
            inspectTemporaryCache(path.join(cache, entry.name), depth - 1);
        }
    };
    inspectTemporaryCache(temp, 3);
    // Other platform toolchains, simulators, source trees and ordinary temp
    // folders are outside this owner's deletion contract.
    return { plan, kept };
}

export function cleanBuildCaches(options = {}) {
    const busy = (options.compilerCheck || activeCompilers)();
    if (busy.length) return { status: 'deferred', reason: 'build-owner-active', compilers: [...new Set(busy)] };
    const result = planBuildCleanup(options);
    const counts = {};
    for (const item of result.plan) counts[item.reason] = (counts[item.reason] || 0) + 1;
    if (options.apply) {
        // Recheck immediately before mutation; never stop or signal a build.
        if ((options.compilerCheck || activeCompilers)().length) return { status: 'deferred', reason: 'compiler-started' };
        for (const item of result.plan) {
            assertContained(item.path, item.container);
            fs.rmSync(item.path, { recursive: true, force: true });
        }
    }
    return { status: options.apply ? 'cleaned' : 'preview', removed: result.plan.length, categories: counts, kept: result.kept };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    try {
        const phase = process.argv.find(value => value.startsWith('--phase='))?.slice(8) || 'end';
        const report = cleanBuildCaches({ apply: process.argv.includes('--apply'), phase });
        process.stdout.write(`[build-cache] ${JSON.stringify(report)}\n`);
    } catch (error) {
        process.stderr.write(`[build-cache] ${error.message}\n`);
        process.exitCode = 1;
    }
}
