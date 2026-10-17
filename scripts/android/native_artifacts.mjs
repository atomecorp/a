import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from './release_tools.mjs';

// Shared native archive contract for APK and AAB; only the archive prefix varies.
export function assertNativeLink(dynamic, programHeaders, abi, runtime) {
    if (runtime && (!/Shared library: \[libc\.so\]/.test(dynamic) || !/Shared library: \[libc\+\+_shared\.so\]/.test(dynamic))) {
        throw new Error('Android runtime must dynamically link libc.so and libc++_shared.so');
    }
    if (['arm64-v8a', 'x86_64'].includes(abi)) {
        const loads = programHeaders.split('\n').filter(line => /^\s*LOAD\s/.test(line));
        if (!loads.length || loads.some(line => Number(line.trim().split(/\s+/).at(-1)) < 16384
            || !Number.isFinite(Number(line.trim().split(/\s+/).at(-1))))) {
            throw new Error('64-bit native libraries must support 16 KB ELF page alignment');
        }
    }
}

export async function verifyNativePayload({ artifact, entries, directory, environment, run = runTool, format = 'aab', requireArm64 = false }) {
    const prefix = format === 'apk' ? 'lib' : format === 'aab' ? 'base/lib' : null;
    if (!prefix) throw new Error('Unsupported native archive format');
    const names = entries.filter(entry => new RegExp(`^${prefix}/[^/]+/[^/]+\\.so$`).test(entry));
    const abis = [...new Set(names.map(entry => entry.slice(prefix.length + 1).split('/')[0]))].sort();
    if (!abis.length) throw new Error('Archive has no native runtime');
    if (requireArm64 && !abis.includes('arm64-v8a')) throw new Error('AAB is missing its ARM64 native runtime');
    const prebuilt = path.join(environment.NDK_HOME, 'toolchains/llvm/prebuilt');
    const hosts = (await readdir(prebuilt, { withFileTypes: true })).filter(entry => entry.isDirectory());
    if (hosts.length !== 1) throw new Error('Expected exactly one resolved NDK host toolchain');
    const readelf = path.join(prebuilt, hosts[0].name, 'bin/llvm-readelf');
    for (const abi of abis) {
        for (const required of ['libsquirrel_lib.so', 'libc++_shared.so']) {
            if (!names.includes(`${prefix}/${abi}/${required}`)) throw new Error(`Archive is missing ${required} for ${abi}`);
        }
        const target = path.join(directory, abi);
        await mkdir(target);
        for (const name of names.filter(item => item.startsWith(`${prefix}/${abi}/`))) {
            const file = path.join(target, path.basename(name));
            await run('unzip', ['-p', artifact, name], { stdoutFile: file });
            const dynamic = await run(readelf, ['-d', file]);
            const headers = await run(readelf, ['-lW', file]);
            try { assertNativeLink(dynamic, headers, abi, name.endsWith('/libsquirrel_lib.so')); }
            catch (error) { throw new Error(`${abi}/${path.basename(name)}: ${error.message}`); }
        }
    }
    return abis;
}

async function main() {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const artifact = process.argv[2];
    if (!artifact?.endsWith('.apk')) throw new Error('Expected an exact APK path');
    const directory = await mkdtemp(path.join(root, 'temp/android-native-check-'));
    try {
        const entries = (await runTool('unzip', ['-Z1', artifact])).trim().split(/\r?\n/);
        const abis = await verifyNativePayload({ artifact, entries, directory, environment: process.env, format: 'apk' });
        process.stdout.write(`[apk] Native payload verified: ${abis.join(', ')}\n`);
    } finally { await rm(directory, { recursive: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { process.stderr.write(`[apk] Native validation failed: ${error.message}\n`); process.exitCode = 1; });
}
