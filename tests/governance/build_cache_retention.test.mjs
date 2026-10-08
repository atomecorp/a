import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { cleanBuildCaches } from '../../scripts/build_cache_retention.mjs';

const roots = [];
const parent = new URL('../../temp/', import.meta.url);
function fixture() {
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent.pathname, 'build-retention-test-'));
    roots.push(root);
    const workspace = path.join(root, 'platforms/ios/atome-auv3/atome.xcodeproj/project.xcworkspace');
    const put = (file, text = 'preserve') => {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, text);
        return target;
    };
    const options = { root, derivedData: path.join(root, 'derived'), compilerCheck: () => [],
        readWorkspace: cache => fs.readFileSync(path.join(cache, 'Info.plist'), 'utf8') };
    return { root, workspace, put, options, exists: file => fs.existsSync(path.join(root, file)) };
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

test('startup removes abandoned objects and staging copies while retaining usable libraries and signed app contents', () => {
    const f = fixture(), profile = 'platforms/desktop-tauri/target/debug';
    f.put(`${profile}/deps/old.rcgu.o`);
    f.put(`${profile}/deps/current.rlib`);
    f.put(`${profile}/deps/current.rmeta`);
    f.put(`${profile}/.fingerprint/current/invoked.timestamp`);
    f.put(`${profile}/incremental/current/object.o`);
    f.put(`${profile}/project/atome/renderers/bevy-core/target/deps/unused.rlib`);
    f.put(`${profile}/bundle/macos/atome.app/Contents/Info.plist`);
    f.put(`${profile}/bundle/macos/atome.app/Contents/Resources/project/atome/renderers/bevy-core/target/keep`);
    f.put('data/users/account/private.db');
    f.put('atome/src/keep.js');
    f.put('temp/android-sdk/keep');
    const report = cleanBuildCaches({ ...f.options, apply: true, phase: 'start' });
    expect(report.status).toBe('cleaned');
    expect(f.exists(`${profile}/deps/old.rcgu.o`)).toBe(false);
    expect(f.exists(`${profile}/project/atome/renderers/bevy-core/target`)).toBe(false);
    for (const file of [`${profile}/deps/current.rlib`, `${profile}/deps/current.rmeta`,
        `${profile}/incremental/current/object.o`, `${profile}/bundle/macos/atome.app/Contents/Resources/project/atome/renderers/bevy-core/target/keep`,
        'data/users/account/private.db', 'atome/src/keep.js', 'temp/android-sdk/keep']) expect(f.exists(file)).toBe(true);
});

test('preview is read-only and cleanup is idempotent', () => {
    const f = fixture();
    const file = 'platforms/desktop-tauri/target/debug/deps/old.rcgu.o'; f.put(file);
    expect(cleanBuildCaches(f.options).status).toBe('preview'); expect(f.exists(file)).toBe(true);
    cleanBuildCaches({ ...f.options, apply: true });
    expect(cleanBuildCaches({ ...f.options, apply: true }).removed).toBe(0);
});

test('compiler activity defers cleanup before scanning or after planning', () => {
    const f = fixture(); const file = 'platforms/desktop-tauri/target/debug/deps/old.rcgu.o'; f.put(file);
    expect(cleanBuildCaches({ ...f.options, apply: true, compilerCheck: () => ['rustc'] }).status).toBe('deferred');
    let calls = 0;
    expect(cleanBuildCaches({ ...f.options, apply: true, compilerCheck: () => ++calls === 1 ? [] : ['cargo'] }).status).toBe('deferred');
    expect(f.exists(file)).toBe(true);
});

test('cleanup rejects a cache symlink rather than traversing outside its owner', () => {
    const f = fixture(); f.put('source/keep.rcgu.o');
    const debug = path.join(f.root, 'platforms/desktop-tauri/target/debug'); fs.mkdirSync(debug, { recursive: true });
    fs.symlinkSync(path.join(f.root, 'source'), path.join(debug, 'deps'));
    expect(() => cleanBuildCaches({ ...f.options, apply: true })).toThrow('build_cache_symlink_forbidden');
    expect(f.exists('source/keep.rcgu.o')).toBe(true);
});

test('shutdown preserves newest complete distribution and the one canonical Xcode cache', () => {
    const f = fixture();
    for (const name of ['old', 'new']) {
        f.put(`temp/testflight.${name}/Atome.xcarchive/Info.plist`);
        const ipa = f.put(`temp/testflight.${name}/export/atome.ipa`);
        fs.utimesSync(ipa, 100, name === 'new' ? 200 : 100);
        f.put(`temp/testflight.${name}/DerivedData/Build/generated`);
    }
    f.put('temp/testflight.failed/log');
    f.put('derived/atome-current/Info.plist', f.workspace);
    f.put('derived/atome-current/Build/Intermediates.noindex/atome.build/Debug-iphoneos/ios-bevy-renderer-target/reusable.rlib');
    f.put('derived/atome-current/Build/Intermediates.noindex/atome.build/Release-iphoneos/ios-bevy-renderer-target/duplicate.rlib');
    f.put('derived/other-project/Info.plist', '/unrelated/project');
    f.put('temp/old-ios/Info.plist', f.workspace);
    f.put('temp/old-ios/Build/Intermediates.noindex/cache');
    f.put('temp/health-authorization/simulator/Info.plist', f.workspace);
    f.put('temp/health-authorization/simulator/Build/Intermediates.noindex/cache');
    f.put('temp/report/keep.json');
    const result = cleanBuildCaches({ ...f.options, apply: true });
    expect(result.kept).toContain(path.join(f.root, 'derived/atome-current'));
    expect(f.exists('derived/atome-current/Info.plist')).toBe(true);
    expect(f.exists('derived/atome-current/Build/Intermediates.noindex/atome.build/Debug-iphoneos/ios-bevy-renderer-target/reusable.rlib')).toBe(true);
    expect(f.exists('derived/atome-current/Build/Intermediates.noindex/atome.build/Release-iphoneos/ios-bevy-renderer-target')).toBe(false);
    expect(f.exists('derived/other-project/Info.plist')).toBe(true);
    expect(f.exists('temp/testflight.new/export/atome.ipa')).toBe(true);
    for (const file of ['temp/testflight.old', 'temp/testflight.failed', 'temp/testflight.new/DerivedData', 'temp/old-ios']) expect(f.exists(file)).toBe(false);
    expect(f.exists('temp/report/keep.json')).toBe(true);
    expect(f.exists('temp/health-authorization/simulator')).toBe(false);
});

test('obsolete Tauri profile is removed only after choosing the newest bundle', () => {
    const f = fixture();
    for (const name of ['debug', 'release']) {
        const file = f.put(`platforms/desktop-tauri/target/${name}/bundle/macos/atome.app/Contents/Info.plist`);
        fs.utimesSync(file, 100, name === 'debug' ? 200 : 100);
        f.put(`platforms/desktop-tauri/target/${name}/deps/current.rlib`);
    }
    cleanBuildCaches({ ...f.options, apply: true });
    expect(f.exists('platforms/desktop-tauri/target/debug/deps/current.rlib')).toBe(true);
    expect(f.exists('platforms/desktop-tauri/target/release/deps')).toBe(false);
    expect(f.exists('platforms/desktop-tauri/target/release/bundle')).toBe(false);
});

test('retention integration uses lifecycle hooks and a shared Xcode DerivedData', () => {
    const run = fs.readFileSync(new URL('../../run.sh', import.meta.url), 'utf8');
    const release = fs.readFileSync(new URL('../../scripts/XCode_testflight_generator', import.meta.url), 'utf8');
    expect(run).toContain('maintain_build_cache start');
    expect(run).toContain("trap 'maintain_build_cache end' EXIT");
    expect(release).not.toContain('-derivedDataPath "$run_directory/DerivedData"');
    const rust = fs.readFileSync(new URL('../../platforms/ios/build_bevy_renderer.sh', import.meta.url), 'utf8');
    expect(rust).toContain('atome.build/Debug-iphoneos/ios-bevy-renderer-target');
});

test('a later dev build keeps its warm cache even when the latest signed bundle is Release', () => {
    const f = fixture();
    const app = f.put('platforms/desktop-tauri/target/release/bundle/macos/atome.app/Contents/Info.plist');
    const executable = f.put('platforms/desktop-tauri/target/debug/atome');
    fs.utimesSync(app, 100, 100); fs.utimesSync(executable, 200, 200);
    f.put('platforms/desktop-tauri/target/debug/deps/reusable.rlib');
    cleanBuildCaches({ ...f.options, apply: true });
    expect(f.exists('platforms/desktop-tauri/target/debug/deps/reusable.rlib')).toBe(true);
    expect(f.exists('platforms/desktop-tauri/target/release/bundle/macos/atome.app/Contents/Info.plist')).toBe(true);
});

test.skipIf(process.platform !== 'darwin')('native Xcode descriptors containing dates remain readable', () => {
    const f = fixture();
    f.put('derived/atome-current/Info.plist', `<?xml version="1.0"?><plist version="1.0"><dict><key>WorkspacePath</key><string>${path.dirname(f.workspace)}</string><key>LastAccessedDate</key><date>2026-10-07T10:00:00Z</date></dict></plist>`);
    const { readWorkspace, ...options } = f.options;
    expect(cleanBuildCaches(options).kept).toContain(path.join(f.root, 'derived/atome-current'));
});

test('run.sh executes cleanup around its child and preserves the child exit status', () => {
    const f = fixture();
    const run = f.put('run.sh', fs.readFileSync(new URL('../../run.sh', import.meta.url), 'utf8'));
    const log = path.join(f.root, 'events');
    const scripts = {
        'bin/uname': '#!/bin/sh\necho Darwin\n',
        'bin/node': '#!/bin/sh\necho "$3" >> "$RETENTION_TEST_LOG"\n',
        'scripts/setup/run_unix.sh': '#!/bin/sh\nif [ "$1" = "--test" ]; then read -r value; echo "$value" >> "$RETENTION_TEST_LOG"; fi\necho run >> "$RETENTION_TEST_LOG"\nexit 7\n'
    };
    for (const [file, content] of Object.entries(scripts)) fs.chmodSync(f.put(file, content), 0o755);
    const env = { ...process.env, PATH: `${f.root}/bin:${process.env.PATH}`, RETENTION_TEST_LOG: log };
    expect(spawnSync('/bin/bash', [run, '--test'], { env, input: 'stdin-preserved\n' }).status).toBe(7);
    expect(fs.readFileSync(log, 'utf8')).toBe('--phase=start\nstdin-preserved\nrun\n--phase=end\n');
    fs.unlinkSync(log);
    expect(spawnSync('/bin/bash', [run, '--help'], { env }).status).toBe(7);
    expect(fs.readFileSync(log, 'utf8')).toBe('run\n');
});
