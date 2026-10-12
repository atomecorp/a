import { test, expect, vi } from 'vitest';
import { createEveAssistantRuntime } from '../../eVe/voice/assistant/assistant_runtime.js';
import { getSessionState, setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';

const binding = vi.hoisted(() => ({ create: null }));
vi.mock('../../atome/src/squirrel/voice/assistant_session_controller.js', () => ({
    bindVoiceAssistantSession: options => binding.create(options)
}));
vi.mock('../../atome/src/squirrel/ai/assistant_provider_config.js', () => ({
    resolveAssistantProviderConfig: async () => ({ ok: false, providerId: 'openai', error: 'no_ai_key_configured' })
}));

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};
const harness = (providerResolver = async () => ({ ok: true, providerId: 'openai' }), openAiSettings, overrides = {}) => {
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
        env: { crypto: globalThis.crypto, addEventListener() {}, removeEventListener() {},
            matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) },
        providerResolver, ...(openAiSettings ? { openAiSettings } : {}), dockFactory: () => dock, now: () => time,
        requestFrame: callback => { frames.set(++sequence, callback); return sequence; },
        cancelFrame: id => frames.delete(id), renderScene: async frame => renders.push(frame),
        clearScene: async () => {}, commandBus: { append: command => commands.push(command) }, translate: key => key, ...overrides
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

test('slow startup paints before provider lookup and announces once after 500 ms', async () => {
    vi.useFakeTimers();
    const provider = deferred();
    const audio = { loadTransientAsset: vi.fn(async () => {}), startVoice: vi.fn(async () => {}),
        stopVoice: vi.fn(async () => {}), releaseTransientAsset: vi.fn(async () => {}) };
    const h = harness(() => provider.promise, undefined, { audio,
        announcementBytes: async () => [{ pcm: Array(22050).fill(.1), sampleRate: 22050, phonemes: [] }, null] });
    try {
        const opening = h.api.open();
        expect(h.api.getState()).toMatchObject({ active: true, phase: 'opening', connected: false });
        expect(h.dock.open).toHaveBeenCalledOnce(); await h.flush();
        await vi.advanceTimersByTimeAsync(499); expect(audio.startVoice).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1); expect(audio.startVoice).toHaveBeenCalledOnce();
        provider.resolve({ ok: true, providerId: 'openai' }); await opening; await h.flush();
        await vi.advanceTimersByTimeAsync(2000);
        expect(audio.startVoice).toHaveBeenCalledOnce(); expect(audio.releaseTransientAsset).toHaveBeenCalledOnce();
        expect(h.api.getState()).toMatchObject({ connected: true, microphoneActive: true });
    } finally { provider.resolve({ ok: true, providerId: 'openai' }); await h.dispose(); vi.useRealTimers(); }
});

test('closing during preparation suppresses delayed audio and obsolete provider results', async () => {
    vi.useFakeTimers(); const provider = deferred();
    const audio = { loadTransientAsset: vi.fn(), startVoice: vi.fn() };
    const h = harness(() => provider.promise, undefined, { audio,
        announcementBytes: async () => [{ pcm: [.1], sampleRate: 22050, phonemes: [] }, null] });
    try {
        const opening = h.api.open(); await h.flush();
        const closing = h.api.close(); await h.advance(); await closing;
        await vi.advanceTimersByTimeAsync(1000);
        provider.resolve({ ok: true, providerId: 'openai' }); await opening;
        expect(audio.startVoice).not.toHaveBeenCalled(); expect(h.controller.open).not.toHaveBeenCalled();
        expect(h.api.getState().active).toBe(false);
    } finally { provider.resolve({ ok: true, providerId: 'openai' }); await h.dispose(); vi.useRealTimers(); }
});

test('the capture prerequisite offers an explicit settings link and reconnects only on activation', async () => {
    let configured = false;
    const settings = vi.fn(async () => ({ ok: true }));
    const h = harness(async () => configured ? { ok: true, providerId: 'openai' }
        : { ok: false, error: 'provider_principal_unavailable' }, settings);
    try {
        const conversationId = h.api.getState().conversation.id;
        h.api.selectLevel(3);
        await h.api.open(); await h.flush(); await h.advance();
        expect(settings).not.toHaveBeenCalled();
        h.api.openErrorPanel(h.api.getState().error); await h.flush();
        expect(settings).toHaveBeenCalledOnce();
        expect(h.api.getState()).toMatchObject({ active: true, inputMode: 'text', connected: false,
            conversation: { id: conversationId, level: 3 } });
        expect(h.controller.open).not.toHaveBeenCalled();
        configured = true; await h.flush(); expect(h.controller.open).not.toHaveBeenCalled();
        await h.api.open(); await h.flush(); await h.advance();
        expect(h.api.getState()).toMatchObject({ connected: true, conversation: { id: conversationId, level: 3 } });
        expect(settings).toHaveBeenCalledOnce();
    } finally { await h.dispose(); }
});

test('a failed settings opening exposes a short error rather than swallowing the refusal', async () => {
    const h = harness(async () => ({ ok: false, error: 'invalid_api_key' }), async () => { throw new Error('missing_canvas'); });
    try {
        await h.api.open(); await h.flush(); await h.advance();
        h.api.openErrorPanel(h.api.getState().error); await h.flush();
        expect(h.api.getState().error).toBe('required_panel_open_failed');
    } finally { await h.dispose(); }
});

test('a text prerequisite preserves the exact turn and its explicit attachment without generating a reply', async () => {
    const previous = getSessionState();
    setSessionState({ mode: 'authenticated', user: { id: 'fixture' } }, { persist: false, silent: true });
    const settings = vi.fn(async () => ({ ok: true })), h = harness(undefined, settings);
    try {
        await h.api.open(); await h.flush();
        const attachment = h.api.addImageReference(new File(['fixture'], 'reference.txt', { type: 'text/plain' }));
        const before = h.api.getState().conversation;
        const result = await h.api.sendText('Keep my exact request'); await h.flush();
        expect(result).toMatchObject({ ok: false, error: 'no_ai_key_configured' });
        expect(settings).not.toHaveBeenCalled();
        h.api.openErrorPanel(result.error); await h.flush(); expect(settings).toHaveBeenCalledOnce();
        expect(h.api.getState().conversation).toMatchObject({ id: before.id, level: before.level,
            turns: [{ role: 'user', text: 'Keep my exact request', attachments: [{ id: attachment, name: 'reference.txt' }] }] });
        expect(h.api.getState().image.references[0].id).toBe(attachment);
    } finally { await h.dispose(); setSessionState(previous, { persist: false, silent: true }); }
});

test('a media prerequisite keeps references and opens the project chooser only through its link', async () => {
    const previous = getSessionState();
    setSessionState({ mode: 'authenticated', user: { id: 'fixture' } }, { persist: false, silent: true });
    const settings = vi.fn(async () => ({ ok: true })), h = harness(undefined, settings);
    try {
        await h.api.open(); await h.flush();
        const attachment = h.api.addImageReference(new File(['fixture'], 'reference.txt', { type: 'text/plain' }));
        const result = await h.api.generateImage({ prompt: 'Make an image', projectId: '' }); await h.flush();
        expect(result).toEqual({ ok: false, error: 'ai_generator_project_missing' });
        expect(settings).not.toHaveBeenCalled();
        h.api.openErrorPanel(result.error); await h.flush();
        expect(settings).toHaveBeenCalledOnce(); expect(settings.mock.calls[0][0].error).toBe('ai_generator_project_missing');
        expect(h.api.getState().image.references[0].id).toBe(attachment);
    } finally { await h.dispose(); setSessionState(previous, { persist: false, silent: true }); }
});

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
