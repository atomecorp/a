import { test, expect, vi } from 'vitest';
import { createEveAssistantRuntime } from '../../eVe/voice/assistant/assistant_runtime.js';

const binding = vi.hoisted(() => ({ create: null }));
vi.mock('../../atome/src/squirrel/voice/assistant_session_controller.js', () => ({
    bindVoiceAssistantSession: options => binding.create(options)
}));

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};
const harness = (providerResolver = async () => ({ ok: true, providerId: 'openai' })) => {
    let time = 0, sequence = 0, connected = false;
    const frames = new Map(), renders = [], changes = [], commands = [];
    const controller = { open: vi.fn(async () => {}), pause: vi.fn(async () => {}),
        resume: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    binding.create = async ({ onSession }) => {
        controller.pause.mockImplementation(async () => {
            connected = false;
            onSession({ phase: 'idle', connected: false, microphoneActive: false, error: '', sessionId: null });
        });
        controller.open.mockImplementation(async () => {
            connected = true;
            onSession({ phase: 'listening', connected, microphoneActive: true, error: '', sessionId: 'test' });
        });
        return { controller, unsubscribeSession() {}, unsubscribeFrames() {} };
    };
    const dock = { open: vi.fn(async () => {}), close: vi.fn(async () => {}), refresh() {}, blur() {},
        toggleInput: vi.fn(async () => { api.focusText(); return { open: true }; }) };
    const api = createEveAssistantRuntime({
        env: { addEventListener() {}, removeEventListener() {},
            matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) },
        providerResolver, dockFactory: () => dock, now: () => time,
        requestFrame: callback => { frames.set(++sequence, callback); return sequence; },
        cancelFrame: id => frames.delete(id), renderScene: async frame => renders.push(frame),
        clearScene: async () => {}, commandBus: { append: command => commands.push(command) }, translate: key => key
    });
    const flush = async () => { for (let count = 0; count < 8; count++) await Promise.resolve(); };
    const advance = async () => {
        time += 1000;
        const pending = [...frames.values()]; frames.clear();
        pending.forEach(callback => callback());
        await flush();
    };
    api.subscribe(state => changes.push(state));
    return { api, dock, controller, renders, changes, commands, flush, advance,
        async dispose() { const closed = api.close(); await advance(); await closed; await api.dispose(); } };
};

test('a provider lookup failure stays visible and can be retried without closing the assistant', async () => {
    let failed = true;
    const h = harness(async () => {
        if (failed) throw new Error('provider_connection_closed');
        return { ok: true, providerId: 'openai' };
    });
    try {
        await h.api.open(); await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, phase: 'error', transition: 'visible', error: 'provider_connection_closed' });
        expect(h.dock.close).not.toHaveBeenCalled();
        failed = false;
        await h.api.open(); await h.flush(); await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, connected: true, error: '', inputMode: 'voice' });
    } finally { await h.dispose(); }
});

test('the first Atom hold opens voice; a subsequent hold focuses text', async () => {
    const h = harness();
    try {
        await h.api.toggleInput({ source: 'bevy_ui_main_menu_atome' }); await h.flush();
        expect(h.api.getState()).toMatchObject({ active: true, inputMode: 'voice', connected: true, microphoneActive: true });
        expect(h.dock.toggleInput).not.toHaveBeenCalled();
        expect(h.controller.pause).not.toHaveBeenCalled();
        await h.api.toggleInput({ source: 'assistant_dock' }); await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, inputMode: 'text', transition: 'visible', microphoneActive: false });
        expect(h.dock.toggleInput).toHaveBeenCalledTimes(1);
        expect(h.commands.map(command => command.action)).toEqual(['open']);
    } finally { await h.dispose(); }
});

test('text focus during provider lookup reveals the assistant without waiting for a voice connection', async () => {
    const provider = deferred();
    const h = harness(() => provider.promise);
    try {
        const opening = h.api.open(); await h.flush();
        expect(h.api.getState().transition).toBe('connecting');
        h.api.focusText(); await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, inputMode: 'text', transition: 'visible', connected: false });
        provider.resolve({ ok: true, providerId: 'openai' }); await opening; await h.flush();
        expect(h.controller.open).not.toHaveBeenCalled();
        expect(h.api.getState().transition).toBe('visible');
        expect(h.renders.at(-1).listeningActive).toBe(false);
    } finally { provider.resolve({ ok: true, providerId: 'openai' }); await h.dispose(); }
});

test('a voice startup failure leaves its reason visible instead of a permanently connecting Atom', async () => {
    const h = harness();
    binding.create = async () => {
        h.controller.open.mockRejectedValue(new Error('realtime_microphone_denied'));
        return { controller: h.controller, unsubscribeSession() {}, unsubscribeFrames() {} };
    };
    try {
        await h.api.open(); await h.flush(); await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, transition: 'visible', phase: 'error', error: 'realtime_microphone_denied' });
        expect(h.dock.close).not.toHaveBeenCalled();
    } finally { await h.dispose(); }
});

test('an asynchronous session failure reveals its error even before the connection opens', async () => {
    const h = harness();
    let publish;
    binding.create = async ({ onSession }) => {
        publish = onSession;
        h.controller.open.mockResolvedValue(undefined);
        return { controller: h.controller, unsubscribeSession() {}, unsubscribeFrames() {} };
    };
    try {
        await h.api.open(); await h.flush();
        expect(h.api.getState().transition).toBe('connecting');
        publish({ connected: false, microphoneActive: false, phase: 'error', error: 'realtime_disconnected' });
        await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, transition: 'visible', phase: 'error', error: 'realtime_disconnected' });
    } finally { await h.dispose(); }
});

test('a failed microphone retry stays visible and can be closed normally', async () => {
    const h = harness();
    try {
        await h.api.open(); await h.flush(); h.api.focusText(); await h.flush();
        h.controller.resume.mockRejectedValue(new Error('realtime_disconnected'));
        await h.api.listen(); await h.advance();
        expect(h.api.getState()).toMatchObject({ active: true, transition: 'visible', phase: 'error', error: 'realtime_disconnected' });
    } finally { await h.dispose(); }
    expect(h.api.getState()).toMatchObject({ active: false, connected: false, microphoneActive: false });
});

test('a rejected old voice retry cannot corrupt a replacement session', async () => {
    const h = harness(), resumed = deferred();
    try {
        await h.api.open(); await h.flush(); h.api.focusText(); await h.flush();
        h.controller.resume.mockImplementation(() => resumed.promise);
        const retry = h.api.listen(); await h.flush();
        const closed = h.api.close(); await h.advance(); await closed;
        await h.api.open(); await h.flush();
        resumed.reject(new Error('obsolete_realtime_failure')); await retry;
        expect(h.api.getState()).toMatchObject({ active: true, connected: true, error: '', phase: 'listening' });
    } finally { await h.dispose(); }
});
