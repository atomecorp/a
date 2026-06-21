const DEFAULT_TIMEOUT_MS = 15000;

const normalizeText = (value) => String(value || '').trim();
const isIpLikeHost = (value) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(value || '')) || String(value || '').includes(':');
const resolveServername = (transport = {}) => {
    const explicit = normalizeText(transport.servername || '');
    if (explicit) return explicit;
    const host = normalizeText(transport.host || '');
    return host && !isIpLikeHost(host) ? host : undefined;
};

const toFiniteNumber = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const waitForEvent = (emitter, successEvent, errorEvent = 'error') => new Promise((resolve, reject) => {
    const onSuccess = (...args) => {
        cleanup();
        resolve(args);
    };
    const onError = (error) => {
        cleanup();
        reject(error);
    };
    const cleanup = () => {
        emitter.off(successEvent, onSuccess);
        emitter.off(errorEvent, onError);
    };
    emitter.once(successEvent, onSuccess);
    emitter.once(errorEvent, onError);
});

class BufferedSocket {
    constructor(socket) {
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.closed = false;
        this.ended = false;
        this.error = null;
        this.pendingWaiter = null;
        this.listeners = null;
        this.attach(socket);
    }

    attach(socket) {
        if (!socket) {
            throw new Error('buffered_socket_requires_socket');
        }
        this.detach();
        this.socket = socket;
        const onData = (chunk) => {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            this.buffer = Buffer.concat([this.buffer, data]);
            this.flushWaiter();
        };
        const onError = (error) => {
            this.error = error || new Error('socket_error');
            this.flushWaiter();
        };
        const onClose = () => {
            this.closed = true;
            this.flushWaiter();
        };
        const onEnd = () => {
            this.ended = true;
            this.flushWaiter();
        };
        this.listeners = { onData, onError, onClose, onEnd };
        socket.on('data', onData);
        socket.on('error', onError);
        socket.on('close', onClose);
        socket.on('end', onEnd);
    }

    detach() {
        if (!this.socket || !this.listeners) return;
        this.socket.off('data', this.listeners.onData);
        this.socket.off('error', this.listeners.onError);
        this.socket.off('close', this.listeners.onClose);
        this.socket.off('end', this.listeners.onEnd);
        this.listeners = null;
    }

    flushWaiter() {
        if (!this.pendingWaiter) return;
        const waiter = this.pendingWaiter;
        this.pendingWaiter = null;
        waiter.resolve();
    }

    async waitFor(predicate) {
        while (!predicate()) {
            if (this.error) throw this.error;
            if ((this.closed || this.ended) && this.buffer.length === 0) {
                throw new Error('socket_closed');
            }
            await new Promise((resolve) => {
                this.pendingWaiter = { resolve };
            });
        }
    }

    async readLine() {
        await this.waitFor(() => this.buffer.includes(0x0a) || this.error || this.closed || this.ended);
        const newlineIndex = this.buffer.indexOf(0x0a);
        if (newlineIndex < 0) {
            if (this.buffer.length === 0) throw new Error('socket_closed');
            const line = this.buffer.toString('utf8');
            this.buffer = Buffer.alloc(0);
            return line.replace(/\r$/, '');
        }
        const lineBuffer = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        return lineBuffer.toString('utf8').replace(/\r$/, '');
    }

    async readBytes(length) {
        const size = Math.max(0, Number(length) || 0);
        await this.waitFor(() => this.buffer.length >= size || this.error || this.closed || this.ended);
        if (this.buffer.length < size) {
            throw new Error(`socket_closed_before_${size}_bytes`);
        }
        const chunk = this.buffer.slice(0, size);
        this.buffer = this.buffer.slice(size);
        return chunk;
    }

    async write(data) {
        const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        await new Promise((resolve, reject) => {
            this.socket.write(payload, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async upgradeToTls(options = {}) {
        const tls = await import('node:tls');
        const tlsSocket = tls.connect({
            socket: this.socket,
            ...(options.servername ? { servername: options.servername } : {}),
            rejectUnauthorized: options.rejectUnauthorized !== false
        });
        this.closed = false;
        this.ended = false;
        this.error = null;
        this.attach(tlsSocket);
        await waitForEvent(tlsSocket, 'secureConnect');
        return this;
    }

    async end() {
        if (!this.socket) return;
        await new Promise((resolve) => {
            this.socket.end(() => resolve());
        });
    }
}

const connectSocket = async (transport = {}) => {
    const security = normalizeText(transport.security || 'plain').toLowerCase();
    const timeoutMs = toFiniteNumber(transport.timeout_ms || transport.timeoutMs, DEFAULT_TIMEOUT_MS);
    let socket;
    if (security === 'tls') {
        const tls = await import('node:tls');
        socket = tls.connect({
            host: transport.host,
            port: transport.port,
            ...(resolveServername(transport) ? { servername: resolveServername(transport) } : {}),
            rejectUnauthorized: transport.reject_unauthorized !== false && transport.rejectUnauthorized !== false
        });
        if (timeoutMs > 0) {
            socket.setTimeout(timeoutMs, () => socket.destroy(new Error('socket_timeout')));
        }
        const buffered = new BufferedSocket(socket);
        await waitForEvent(socket, 'secureConnect');
        return buffered;
    }
    const net = await import('node:net');
    socket = net.createConnection({
        host: transport.host,
        port: transport.port
    });
    if (timeoutMs > 0) {
        socket.setTimeout(timeoutMs, () => socket.destroy(new Error('socket_timeout')));
    }
    const buffered = new BufferedSocket(socket);
    await waitForEvent(socket, 'connect');
    return buffered;
};

export {
    normalizeText,
    toFiniteNumber,
    resolveServername,
    connectSocket
};
