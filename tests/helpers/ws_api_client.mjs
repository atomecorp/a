// Client WebSocket de test pour /ws/api.
//
// Vivait sous server/ alors qu'aucun code serveur ne l'importe: seul
// tests/eve/adole_commit_boundary.probe.mjs s'en sert. Déplacé ici pour que
// server/ ne contienne que du code que le serveur exécute.
import WebSocket from 'ws';
import crypto from 'crypto';

function wsApiUrl(baseUrl) {
    const parsed = new URL(baseUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/api';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
}

export function sendWsApiRequest(baseUrl, message, options = {}) {
    const requestId = message.requestId || message.request_id || crypto.randomUUID();
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10000);
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(wsApiUrl(baseUrl));
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            socket.close();
            reject(new Error('WebSocket request timeout'));
        }, timeoutMs);
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            socket.close();
            callback(value);
        };
        socket.once('open', () => {
            socket.send(JSON.stringify({ ...message, requestId }));
        });
        socket.on('message', (raw) => {
            try {
                const response = JSON.parse(raw.toString());
                if ((response.requestId || response.request_id) !== requestId) return;
                finish(resolve, response);
            } catch (error) {
                finish(reject, error);
            }
        });
        socket.once('error', (error) => finish(reject, error));
        socket.once('close', () => {
            clearTimeout(timeout);
            if (!settled) finish(reject, new Error('WebSocket connection closed before response'));
        });
    });
}
