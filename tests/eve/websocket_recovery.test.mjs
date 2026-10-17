import { afterEach, expect, test, vi } from 'vitest';
import { TauriWebSocket } from '../../atome/src/squirrel/apis/unified/adole_websocket.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const connected = () => {
    vi.useFakeTimers(); vi.stubGlobal('WebSocket', { OPEN: 1 });
    const transport = new TauriWebSocket('ws://synthetic/ws/api');
    const socket = { readyState: 1, send: vi.fn(), close: vi.fn() };
    transport.socket = socket; transport.isConnected = true;
    return { transport, socket };
};

test('a silent OPEN socket is retired after one shared health probe', async () => {
    const { transport, socket } = connected();
    try {
        const probe = transport.verifyConnection();
        expect(transport.verifyConnection()).toBe(probe);
        expect(socket.send).toHaveBeenCalledExactlyOnceWith('{"type":"ping"}');
        await vi.advanceTimersByTimeAsync(3000);
        expect(await probe).toBe(false);
        expect(socket.close).toHaveBeenCalledTimes(1);
        expect(transport.isConnected).toBe(false);
        expect(transport.reconnectTimer).not.toBeNull();
    } finally { transport.dispose(); }
    expect(vi.getTimerCount()).toBe(0);
});

test('a slow operation does not discard a socket that answers its health probe', async () => {
    const { transport, socket } = connected();
    try {
        const result = transport.send({ type: 'auth', action: 'me' }, { timeoutMs: 20 });
        await vi.advanceTimersByTimeAsync(20);
        expect((await result).error).toBe('Request timeout');
        transport.handleMessage('{"type":"pong"}');
        await vi.advanceTimersByTimeAsync(3000);
        expect(transport.socket).toBe(socket); expect(socket.close).not.toHaveBeenCalled();
        expect(transport.isConnected).toBe(true);
        expect(transport.reconnectTimer).toBeNull();
        expect(socket.send.mock.calls.filter(([raw]) => JSON.parse(raw).type === 'auth')).toHaveLength(1);
    } finally { transport.dispose(); }
});

test('disconnect settles an active probe and ignores a late pong', async () => {
    const { transport } = connected();
    const probe = transport.verifyConnection();
    transport.dispose();
    expect(await probe).toBe(false);
    transport.handleMessage('{"type":"pong"}');
    expect(transport.heartbeat).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});
