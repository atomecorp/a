import { test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const calls = vi.hoisted(() => ({ store: vi.fn(), save: vi.fn() }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js', async original => ({
    ...await original(),
    loadHomeProfile: async () => ({ ok: true, userId: 'fixture-owner', profile: { name: 'Fixture' } }),
    persistHomeProfile: (...args) => calls.save(...args)
}));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_vault.js', () => ({
    storeHomeAiToken: (...args) => calls.store(...args), lockHomeVault() {},
    readHomeVaultState: async () => ({ unlocked: true, credentials: [], mailConfigured: false,
        providers: [{ id: 'openai', kind: 'chat', configured: true, models: ['fixture-model'] }] })
}));
vi.mock('../../atome/src/squirrel/voice/bootstrap.js', () => ({
    bootstrapGlobalVoice: () => ({ wake: { subscribe: () => () => {} } })
}));
import { homeSurface, handleHomeCardEvent, readHomePanelState } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js';

const fixture = async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = dom.window; globalThis.document = dom.window.document;
    calls.store.mockReset().mockResolvedValue({ ok: true, configured: true });
    calls.save.mockReset().mockImplementation(async ({ profile }) => ({ ok: true, profile }));
    const release = homeSurface.onOpen({ context: { guest: false }, refresh() {} });
    await vi.waitFor(() => expect(readHomePanelState().loading).toBe(false));
    await handleHomeCardEvent({ type: 'home.accordion.toggle', section: 'settings' });
    await handleHomeCardEvent({ type: 'home.subaccordion.toggle', section: 'settings.passkeys' });
    await handleHomeCardEvent({ type: 'home.field.focus', field: 'security.aiKeys.openai', event: {} }, { refresh() {} });
    const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
    expect(editor).not.toBeNull();
    return { dom, editor, close() { release(); dom.window.close(); Object.assign(globalThis, previous); } };
};
for (const action of ['native blur', 'Enter', 'Bevy blur']) test(action + ' stores the OpenAI draft through the existing vault owner exactly once', async () => {
    const f = await fixture();
    try {
        f.editor.value = 'fixture-key';
        f.editor.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        if (action === 'native blur') f.editor.blur();
        if (action === 'Enter') f.editor.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        if (action === 'Bevy blur') await handleHomeCardEvent({ type: 'home.field.blur', field: 'security.aiKeys.openai' });
        await vi.waitFor(() => expect(calls.store).toHaveBeenCalledOnce());
        expect(calls.store).toHaveBeenCalledWith({ userId: 'fixture-owner', providerId: 'openai', apiKey: 'fixture-key' });
        await vi.waitFor(() => expect(calls.save).toHaveBeenCalledOnce());
        expect(JSON.stringify(calls.save.mock.calls)).not.toContain('fixture-key');
        await handleHomeCardEvent({ type: 'home.field.blur', field: 'security.aiKeys.openai' });
        expect(calls.store).toHaveBeenCalledOnce();
    } finally { f.close(); }
});
test('focusing and leaving an empty replacement never overwrites a configured key', async () => {
    const f = await fixture();
    try { f.editor.blur(); await Promise.resolve(); expect(calls.store).not.toHaveBeenCalled(); }
    finally { f.close(); }
});
