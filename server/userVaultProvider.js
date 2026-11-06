import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

// Fastify reaches each person's vault through the Rust supervisor (atome-server),
// which runs one `atome-vault` process per person, the only writer of that vault.
// One connection carries every request, in the supervisor's binary frames
// (atome/servers/atome-vault/src/frame.rs): a u32 big-endian length of what
// follows, a u64 request id, a one-byte tag, the body. SERVICE frames ask the
// supervisor's own vault router (atome/servers/atome-server/src/vault_router).
const ROUTED = 4;
const SERVICE = 5;
const RESULT = 2;
const FAILURE = 3;
const HEAD_BYTES = 9;

const principalKey = (principalId) => crypto
    .createHash('sha256')
    .update(String(principalId))
    .digest('hex');

const prefixed = (text) => {
    const bytes = Buffer.from(text, 'utf8');
    const length = Buffer.alloc(2);
    length.writeUInt16BE(bytes.length);
    return [length, bytes];
};

const encodeFrame = (id, tag, body) => {
    const head = Buffer.alloc(4 + HEAD_BYTES);
    head.writeUInt32BE(HEAD_BYTES + body.reduce((size, part) => size + part.length, 0), 0);
    head.writeBigUInt64BE(id, 4);
    head.writeUInt8(tag, 12);
    return Buffer.concat([head, ...body]);
};

const requestBody = (operation, payload) => [...prefixed(operation), Buffer.from(JSON.stringify(payload ?? {}), 'utf8')];

export class UserVaultProvider {
    constructor(options = {}) {
        this.root = path.resolve(options.root || process.env.SQUIRREL_VAULT_ROOT || 'database_storage/vaults');
        this.socketPath = options.socketPath || process.env.ATOME_VAULT_SUPERVISOR_SOCKET;
        if (!this.socketPath) throw new Error('vault_supervisor_socket_missing');
        this.pending = new Map();
        this.nextId = 1n;
        this.connection = null;
    }

    // The person's vault directory; the supervisor starts the vault on its first request.
    async ensure(principalId) {
        const id = String(principalId || '').trim();
        if (!id) throw new Error('vault_principal_required');
        return { principalId: id, vaultRoot: path.join(this.root, principalKey(id)) };
    }

    connect() {
        if (this.connection) return this.connection;
        const connection = net.createConnection(this.socketPath);
        const chunks = [];
        let buffered = 0;
        let expected = 4;
        connection.on('data', (chunk) => {
            chunks.push(chunk);
            buffered += chunk.length;
            while (buffered >= expected) {
                const bytes = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, buffered);
                chunks.length = 0;
                const length = bytes.readUInt32BE(0);
                if (bytes.length < 4 + length) {
                    chunks.push(bytes);
                    expected = 4 + length;
                    return;
                }
                this.answer(bytes.subarray(4, 4 + length));
                const rest = bytes.subarray(4 + length);
                if (rest.length) chunks.push(rest);
                buffered = rest.length;
                expected = 4;
            }
        });
        const closed = (error) => {
            if (this.connection === connection) this.connection = null;
            const failure = new Error(error?.code ? `vault_supervisor_unreachable:${error.code}` : 'vault_supervisor_closed');
            for (const waiting of this.pending.values()) waiting.reject(failure);
            this.pending.clear();
        };
        connection.once('error', closed);
        connection.once('close', () => closed(null));
        this.connection = connection;
        return connection;
    }

    answer(content) {
        const id = content.readBigUInt64BE(0);
        const waiting = this.pending.get(id);
        if (!waiting) return;
        this.pending.delete(id);
        const tag = content.readUInt8(8);
        const body = content.subarray(HEAD_BYTES);
        if (tag === RESULT) waiting.resolve(JSON.parse(body.toString('utf8')));
        else waiting.reject(new Error(tag === FAILURE ? body.toString('utf8') : 'vault_frame_invalid'));
    }

    send(tag, body) {
        const requestId = this.nextId;
        this.nextId += 1n;
        return new Promise((resolve, reject) => {
            this.pending.set(requestId, { resolve, reject });
            this.connect().write(encodeFrame(requestId, tag, body));
        });
    }

    request(principalId, operation, payload = {}) {
        const id = String(principalId || '').trim();
        if (!id) return Promise.reject(new Error('vault_principal_required'));
        return this.send(ROUTED, [...prefixed(id), ...requestBody(operation, payload)]);
    }

    // An operation of the vault router (`router:<name>`), which reads the central registries and shares.
    service(operation, payload = {}) {
        return this.send(SERVICE, requestBody(operation, payload));
    }

    // The supervisor keeps the vaults; Fastify only leaves its connection.
    async close() {
        this.connection?.end();
    }
}

export const createUserVaultProvider = (options) => new UserVaultProvider(options);
