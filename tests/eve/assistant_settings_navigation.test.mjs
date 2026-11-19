import { test, expect, vi } from 'vitest';
import { AI_SETTINGS_ERROR_CODES, assistantErrorDestination, createAssistantSettingsNavigation, openAssistantAiSettings } from '../../eVe/voice/assistant/assistant_ai_settings.js';
import { assistantErrorMessage, buildAssistantConversationNodes } from '../../eVe/voice/assistant/assistant_conversation_view.js';
import { requestAssistantTool } from '../../eVe/voice/assistant/assistant_conversation_actions.js';
import { openRequiredPanel } from '../../eVe/intuition/runtime/eve_intuition/panel_actions_runtime.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

for (const error of AI_SETTINGS_ERROR_CODES) test(error + ' remains explicit without floating text', () => {
    expect(assistantErrorMessage(error)).not.toBe('');
    expect(buildAssistantConversationNodes({ width: 480, itemSize: 48, iconOffsetX: 0, zIndex: 1,
        api: { getState: () => ({ active: true, error, conversation: { turns: [] } }) } })).toEqual([]);
});

// Every AI key is atome's own, on the server (R-120): the text models' (user, 19 Nov, R-173), then Runway's and
// MusicGPT's (Q4, 19 Nov). A key error has no link and is said in the conversation, whatever the provider.
test('an AI key error has no link and never navigates', async () => {
    const pause = vi.fn(async () => {}), navigate = vi.fn(async () => ({ ok: true }));
    const navigation = createAssistantSettingsNavigation({ isActive: () => true, pause, navigate, onFailure: vi.fn() });
    for (const error of AI_SETTINGS_ERROR_CODES) {
        expect(assistantErrorDestination(error)).toBe('');
        expect(navigation.handle(error)).toBe(false);
    }
    await flush(); expect(pause).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    await expect(openAssistantAiSettings({ error: 'invalid_api_key', invoke: vi.fn(),
        loadModule: async () => ({ ensureHomePanelModule: async () => {} }) })).rejects.toThrow('assistant_settings_destination_unknown');
});

test('authentication opens the existing phone login rather than the restricted guest card', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    await openAssistantAiSettings({ error: 'not_authenticated', invoke,
        loadModule: async () => ({ ensureHomePanelModule: async () => {} }) });
    expect(invoke.mock.calls[0][0].input).toEqual({ requireAuthentication: true });
});

test('a missing project opens Matrix without choosing or creating a project', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    await openAssistantAiSettings({ error: 'ai_generator_project_missing', invoke });
    expect(invoke.mock.calls[0][0]).toMatchObject({ tool_id: 'ui.matrix.view', action: 'open', input: {} });
});

test('simultaneous errors for the same destination pause once and navigate once per attempt', async () => {
    const pause = vi.fn(async () => {}), navigate = vi.fn(async () => ({ ok: true }));
    const navigation = createAssistantSettingsNavigation({ isActive: () => true, pause, navigate, onFailure: vi.fn() });
    navigation.begin();
    expect(navigation.handle('not_authenticated')).toBe(true);
    navigation.handle('auth_session_required'); navigation.handle('wake_principal_unavailable');
    await flush();
    expect(pause).toHaveBeenCalledTimes(1); expect(navigate).toHaveBeenCalledTimes(1);
    navigation.begin(); navigation.handle('not_authenticated'); await flush();
    expect(navigate).toHaveBeenCalledTimes(2);
});

test('closing while loading Home prevents the actual command from executing', async () => {
    const loaded = deferred(), invoke = vi.fn(); let current = true;
    const pending = openAssistantAiSettings({ error: 'not_authenticated', invoke, isCurrent: () => current,
        loadModule: async () => ({ ensureHomePanelModule: () => loaded.promise }) });
    await flush(); current = false; loaded.resolve();
    expect(await pending).toEqual({ ok: false, cancelled: true }); expect(invoke).not.toHaveBeenCalled();
});

test('an obsolete failure cannot alter a replacement attempt', async () => {
    const pending = deferred(), onFailure = vi.fn();
    const navigation = createAssistantSettingsNavigation({ isActive: () => true, pause: async () => {},
        navigate: async () => { await pending.promise; throw new Error('old_failure'); }, onFailure });
    navigation.begin(); navigation.handle('not_authenticated'); await flush();
    navigation.begin(); pending.resolve(); await flush(); expect(onFailure).not.toHaveBeenCalled();
});

test('a late prerequisite from a closed session cannot pause or open anything', async () => {
    const pause = vi.fn(), navigate = vi.fn();
    const navigation = createAssistantSettingsNavigation({ isActive: () => false, pause, navigate });
    expect(navigation.handle('not_authenticated')).toBe(true);
    await flush(); expect(pause).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

test('a captured command is not reported as an opened settings panel', async () => {
    await expect(openRequiredPanel({ toolId: 'ui.home.panel', invoke: async () => ({ ok: true, captured: true }) }))
        .rejects.toThrow('required_panel_open_failed');
});

for (const error of ['eve_voice_assistant_api_unavailable', 'assistant_image_request_incomplete', 'assistant_speech_text_required'])
test('a missing text prerequisite focuses the message field: ' + error, async () => {
    const focusText = vi.fn(), navigate = vi.fn();
    const navigation = createAssistantSettingsNavigation({ isActive: () => true, pause: async () => {}, focusText, navigate });
    navigation.handle(error); await flush();
    expect(focusText).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
    expect(assistantErrorMessage(error)).not.toBe('');
});

test('opening failures remain explicit even when the gateway envelope reports success', async () => {
    await expect(openRequiredPanel({ toolId: 'ui.home.panel', invoke: async () => ({ ok: true,
        result: { ok: true, result: { ok: false, error: 'home_navigation_failed' } } }) })).rejects.toThrow('home_navigation_failed');
    expect(assistantErrorMessage('provider_connection_closed')).not.toBe('');
});

test('tool prerequisites stop the text or Realtime turn before delivering a narrated response', async () => {
    await expect(requestAssistantTool({ handleAtomeMCPRequestAsync: async () => ({ result: { ok: false,
        error: 'ai_generator_project_missing' } }) }, {})).rejects.toThrow('ai_generator_project_missing');
    const result = { result: { ok: false, error: 'permission_denied' } };
    expect(await requestAssistantTool({ handleAtomeMCPRequestAsync: async () => result }, {})).toBe(result);
});
