import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const principalKey = (principalId) => crypto
    .createHash('sha256')
    .update(String(principalId))
    .digest('hex');

const requestSocket = ({ socketPath, secret, operation, payload, timeoutMs }) => new Promise((resolve, reject) => {
    const connection = net.createConnection(socketPath);
    const chunks = [];
    const timer = setTimeout(() => {
        connection.destroy();
        reject(new Error('vault_request_timeout'));
    }, timeoutMs);
    const finish = (handler) => (value) => {
        clearTimeout(timer);
        handler(value);
    };
    connection.setEncoding('utf8');
    connection.once('error', finish(reject));
    connection.on('data', (chunk) => {
        const newline = chunk.indexOf('\n');
        chunks.push(newline < 0 ? chunk : chunk.slice(0, newline));
        if (newline < 0) return;
        connection.end();
        try {
            const response = JSON.parse(chunks.join(''));
            if (!response.ok) throw new Error(response.error || 'vault_request_failed');
            finish(resolve)(response.result);
        } catch (error) {
            finish(reject)(error);
        }
    });
    connection.once('connect', () => {
        connection.write(`${JSON.stringify({
            requestId: crypto.randomUUID(), secret, operation, payload
        })}\n`);
    });
});

export class UserVaultProvider {
    constructor(options = {}) {
        this.root = path.resolve(options.root || process.env.SQUIRREL_VAULT_ROOT || 'database_storage/vaults');
        const unixSocketBase = process.platform === 'darwin' ? '/tmp' : os.tmpdir();
        this.socketRoot = path.resolve(
            options.socketRoot
            || process.env.SQUIRREL_VAULT_SOCKET_ROOT
            || path.join(unixSocketBase, `atome-vault-${process.pid}`)
        );
        this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10_000);
        this.idleMs = Math.max(1, Number(options.idleMs) || 180_000);
        this.children = new Map();
        fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
        fs.mkdirSync(this.socketRoot, { recursive: true, mode: 0o700 });
    }

    async ensure(principalId) {
        const id = String(principalId || '').trim();
        if (!id) throw new Error('vault_principal_required');
        const existing = this.children.get(id);
        if (existing?.stopping) { await existing.stopping; return this.ensure(id); }
        if (existing?.ready === true && existing.child.exitCode == null) {
            this.scheduleIdle(existing);
            return existing;
        }
        if (existing?.startPromise && existing.child.exitCode == null) {
            await existing.startPromise;
            return existing;
        }
        const key = principalKey(id);
        const vaultRoot = path.join(this.root, key);
        const socketPath = path.join(this.socketRoot, `${key.slice(0, 24)}.sock`);
        const secret = crypto.randomBytes(32).toString('hex');
        fs.mkdirSync(vaultRoot, { recursive: true, mode: 0o700 });
        const child = fork(new URL('./userVaultProcess.js', import.meta.url), [id, vaultRoot, socketPath], {
            env: { ...process.env, SQUIRREL_VAULT_IPC_SECRET: secret },
            execArgv: [],
            stdio: ['ignore', 'ignore', 'pipe', 'ipc']
        });
        const record = { child, principalId: id, vaultRoot, socketPath, secret, ready: false };
        let stderr = '';
        child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
        this.children.set(id, record);
        record.startPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('vault_start_timeout')), this.timeoutMs);
            child.once('error', (error) => { clearTimeout(timer); reject(error); });
            child.once('exit', (code) => {
                if (record.ready) return;
                clearTimeout(timer);
                reject(new Error(`vault_exit_${code}:${stderr}`));
            });
            child.on('message', (message) => {
                if (message?.type !== 'vault-ready' || message.principalId !== id) return;
                clearTimeout(timer);
                record.ready = true;
                resolve();
            });
        });
        await record.startPromise;
        record.startPromise = null;
        this.scheduleIdle(record);
        return record;
    }

    scheduleIdle(record) {
        clearTimeout(record.idleTimer);
        if (record.requests || record.stopping) return;
        record.idleTimer = setTimeout(() => {
            // A new request clears this timer before opening its IPC socket.
            if (!record.requests && this.children.get(record.principalId) === record) {
                void this.stop(record.principalId);
            }
        }, this.idleMs);
        record.idleTimer.unref();
    }

    async request(principalId, operation, payload = {}) {
        const record = await this.ensure(principalId);
        clearTimeout(record.idleTimer);
        record.requests = (record.requests || 0) + 1;
        try { return await requestSocket({
            socketPath: record.socketPath,
            secret: record.secret,
            operation,
            payload,
            timeoutMs: this.timeoutMs
        }); } finally {
            record.requests -= 1;
            if (this.children.get(record.principalId) === record) this.scheduleIdle(record);
        }
    }

    async stop(principalId) {
        const id = String(principalId || '').trim();
        const record = this.children.get(id);
        if (!record) return;
        if (record.stopping) return record.stopping;
        clearTimeout(record.idleTimer);
        record.stopping = (async () => {
          if (record.child.exitCode == null) {
            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(forceTimer);
                    clearTimeout(fallbackTimer);
                    resolve();
                };
                const forceTimer = setTimeout(() => {
                    if (record.child.exitCode == null) record.child.kill('SIGKILL');
                }, 3000);
                const fallbackTimer = setTimeout(finish, 4000);
                record.child.once('exit', finish);
                record.child.kill('SIGTERM');
            });
          }
          if (this.children.get(id) === record) this.children.delete(id);
        })();
        return record.stopping;
    }

    async stopAll() {
        await Promise.all(Array.from(this.children.keys()).map((id) => this.stop(id)));
    }
}

export const createUserVaultProvider = (options) => new UserVaultProvider(options);
