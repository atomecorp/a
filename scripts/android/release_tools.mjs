import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

/** Run a platform tool with argument arrays. Never include raw tool errors/secrets in reports. */
export async function runTool(command, args, { cwd, env = process.env, timeout = 120000, stdoutFile } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '', bytes = 0, settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (error) reject(error); else resolve(result);
        };
        const timer = setTimeout(() => { child.kill('SIGTERM'); finish(new Error(`${path.basename(command)} timed out`)); }, timeout);
        const writing = stdoutFile ? pipeline(child.stdout, createWriteStream(stdoutFile, { mode: 0o600 })) : null;
        if (writing) writing.catch(error => { child.kill('SIGTERM'); finish(error); });
        else child.stdout.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > 8 * 1024 * 1024) { child.kill('SIGTERM'); finish(new Error('Tool output exceeds the diagnostic budget')); }
            else output += chunk;
        });
        // Consume stderr without exposing passwords, provider responses or local private data.
        child.stderr.resume();
        child.on('error', () => finish(new Error(`Required tool unavailable: ${path.basename(command)}`)));
        child.on('close', async code => {
            if (code !== 0) { finish(new Error(`${path.basename(command)} failed (exit ${code}); no release was approved`)); return; }
            if (writing) {
                try { await writing; } catch (error) { finish(error); return; }
            }
            finish(null, output);
        });
    });
}

export async function sha256File(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

/** AGP already owns bundletool and its dependencies. Resolution is explicitly offline. */
export async function bundletoolRunner(root, environment = process.env, run = runTool) {
    if (!environment.JAVA_HOME) throw new Error('JAVA_HOME must be resolved by the canonical Android lane');
    const android = path.join(root, 'platforms/desktop-tauri/gen/android');
    const result = await run('bash', [path.join(android, 'gradlew'), '--offline', '--console=plain', '-q', 'atomeBundletoolClasspath'],
        { cwd: android, env: environment });
    const lines = result.split(/\r?\n/).filter(line => line.startsWith('ATOME_BUNDLETOOL_CLASSPATH='));
    if (lines.length !== 1 || !lines[0].includes('bundletool')) throw new Error('AGP bundletool classpath is unavailable');
    const classpath = lines[0].slice('ATOME_BUNDLETOOL_CLASSPATH='.length);
    const java = path.join(environment.JAVA_HOME, 'bin/java');
    return args => run(java, ['-cp', classpath, 'com.android.tools.build.bundletool.BundleToolMain', ...args],
        { cwd: android, env: environment });
}
