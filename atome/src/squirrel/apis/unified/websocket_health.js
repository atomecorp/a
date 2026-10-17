// Shared liveness contract for canonical API and delivery sockets. It never retries a command.
//
// A socket is alive while it speaks: any inbound frame (a pong, a response, a
// replayed event) settles the pending check. Only a socket silent for the whole
// deadline is declared dead. A busy local server (sync replay on iOS) answers
// late but keeps sending, so it is never torn down with its requests in flight.
const HEALTH_DEADLINE_MS = 10000;
// A frame received this recently already proves the link: no ping is sent.
const RECENT_TRAFFIC_MS = 5000;

export const socketHealthMixin = {
    noteInbound() {
        this.lastInboundAt = Date.now();
        if (this.heartbeat) this.finishHeartbeat(true);
    },

    finishHeartbeat(alive) {
        const pending = this.heartbeat;
        if (!pending) return;
        this.heartbeat = null;
        clearTimeout(pending.timer);
        if (alive) this.reconnectAttempt = 0;
        pending.resolve(alive);
    },

    verifyConnection() {
        if (this.disposed) return Promise.resolve(false);
        if (this.heartbeat) return this.heartbeat.promise;
        if (this.socket?.readyState !== (this.WebSocketClass?.OPEN ?? globalThis.WebSocket?.OPEN ?? 1)) return this.connect();
        if (Date.now() - (this.lastInboundAt || 0) < RECENT_TRAFFIC_MS) return Promise.resolve(true);
        const socket = this.socket;
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        const timer = setTimeout(() => {
            if (this.socket !== socket) { this.finishHeartbeat(false); return; }
            this.onHealthTimeout(socket);
        }, HEALTH_DEADLINE_MS);
        this.heartbeat = { promise, resolve, timer };
        try { socket.send(JSON.stringify({ type: 'ping' })); }
        catch (_) {
            this.onHealthTimeout(socket);
        }
        return promise;
    }
};
