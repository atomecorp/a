import { test, expect, vi, afterEach } from 'vitest';
import { createRuntimeHarness, findNode } from './bevy_ui_main_menu_test_helpers.mjs';
import { BEVY_MAIN_MENU_ATOME_ID } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { normalizeVisualPreferences } from '../../eVe/intuition/tools/user_visual_preferences_model.js';
import { buildMatrixToolDefinitions } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_matrix_defs.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';

const { loadUserProfile, upsertUserProfile } = vi.hoisted(() => ({ loadUserProfile: vi.fn(), upsertUserProfile: vi.fn() }));
vi.mock('../../eVe/domains/user/profile_api.js', () => ({ loadUserProfile, upsertUserProfile }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({
    invokeToolGateway: vi.fn(async payload => {
        expect(payload).toMatchObject({ tool_id: 'ui.main_menu.tools.set', action: 'commit' });
        const module = await import('../../eVe/intuition/ribbon/bevy_ui_product_registry.js');
        return module.getMainMenuRuntime().applyToolsCollapsed(payload.input.collapsed);
    })
}));
afterEach(() => vi.clearAllMocks());
const tree = h => h.calls.filter(call => call.payload?.tree).at(-1).payload.tree;
const atom = h => findNode(tree(h).root, BEVY_MAIN_MENU_ATOME_ID);
const cleanup = h => { setMainMenuRuntime(null, h.window); h.runtime.destroy(); h.restore(); h.dom.window.close(); };
const prepare = async options => {
    const h = createRuntimeHarness(options);
    setMainMenuRuntime(h.runtime, h.window);
    h.window.__eveWorkspaceMode = { mode: 'project', projectId: 'fold-a' };
    h.window.__eveProfilePreferences = { visual: { masteryLevel: 'advanced', handedness: options?.handedness || 'right' } };
    loadUserProfile.mockResolvedValue({ ok: true, userId: 'fold-user', profile: { preferences: { visual: { handedness: 'left' } } } });
    upsertUserProfile.mockResolvedValue({ ok: true });
    await h.runtime.open();
    return h;
};
const swipe = async (h, dx, dy = 0) => {
    atom(h).on.press({ x: 100, y: 100 });
    // Rebuilding during focus/hover must not lose the ongoing pointer session.
    await h.runtime.refresh();
    atom(h).on.drag({ x: 100 + dx, y: 100 + dy });
    await atom(h).on.release({ x: 100 + dx, y: 100 + dy });
};

test.each(['right', 'left'])('%s Atom sweep folds, persists and restores without moving the anchor', async handedness => {
    const shortPress = vi.fn();
    const h = await prepare({ handedness, onAtomShortPress: shortPress });
    try {
        const initial = tree(h).itemBoxes.find(box => box.item.id === BEVY_MAIN_MENU_ATOME_ID);
        const dx = handedness === 'right' ? -28 : 28;
        await swipe(h, dx);
        expect(h.runtime.measure()).toMatchObject({ itemCount: 1, toolsCollapsed: true });
        expect(tree(h).itemBoxes[0].x).toBe(initial.x);
        expect(tree(h).itemBoxes[0].y).toBe(initial.y);
        expect(upsertUserProfile.mock.calls.at(-1)[0].preferences.visual).toMatchObject({ mainMenuToolsCollapsed: true, handedness: 'left' });
        expect(upsertUserProfile.mock.calls.at(-1)[1]).toMatchObject({ allowCreate: false, eventSource: 'main_menu_fold' });
        await atom(h).on.activate();
        expect(shortPress).not.toHaveBeenCalled();
        await h.runtime.hideCompletely(true);
        h.window.__eveWorkspaceMode = { mode: 'project', projectId: 'fold-b' };
        await h.runtime.showFully();
        expect(h.runtime.measure().itemCount).toBe(1);
        await h.runtime.showAtomOnly();
        await h.runtime.showFully();
        expect(h.runtime.measure().itemCount).toBe(1);
        await swipe(h, -dx);
        expect(h.runtime.measure().itemCount).toBeGreaterThan(1);
        expect(h.runtime.measure().toolsCollapsed).toBe(false);
        expect(upsertUserProfile.mock.calls.at(-1)[0].preferences.visual.mainMenuToolsCollapsed).toBe(false);
        await h.runtime.hideCompletely(true);
        await h.runtime.showFully();
        expect(h.runtime.measure().itemCount).toBeGreaterThan(1);
    } finally { cleanup(h); }
});

test('tap, vertical travel, short motion and cancelled sweep leave the preference alone', async () => {
    const shortPress = vi.fn();
    const h = await prepare({ onAtomShortPress: shortPress });
    try {
        await swipe(h, 0);
        await atom(h).on.activate();
        expect(shortPress).toHaveBeenCalledTimes(1);
        await swipe(h, -3);
        await swipe(h, -3, -28);
        atom(h).on.press({ x: 100, y: 100 });
        atom(h).on.drag({ x: 70, y: 100 });
        atom(h).on.cancel();
        await atom(h).on.release({ x: 70, y: 100 });
        expect(h.runtime.measure().toolsCollapsed).toBe(false);
        expect(upsertUserProfile).not.toHaveBeenCalled();
        h.window.__eveWorkspaceMode = { mode: 'dashboard' };
        await swipe(h, -28);
        expect(upsertUserProfile).not.toHaveBeenCalled();
    } finally { cleanup(h); }
});

test('profile hydration and normalisation retain the folded choice', async () => {
    const h = await prepare();
    try {
        const visual = normalizeVisualPreferences({ masteryLevel: 'advanced', mainMenuToolsCollapsed: true });
        h.window.__eveProfilePreferences = { visual };
        h.window.dispatchEvent(new h.window.CustomEvent('eve:profile-preferences-updated', { detail: { preferences: { visual } } }));
        await h.runtime.refresh();
        expect(h.runtime.measure().itemCount).toBe(1);
        expect(normalizeVisualPreferences(visual).mainMenuToolsCollapsed).toBe(true);
        expect(normalizeVisualPreferences({}).mainMenuToolsCollapsed).toBe(false);
    } finally { cleanup(h); }
});

test('folding clears a palette and pinned slider without clearing tool activation', async () => {
    const h = await prepare();
    try {
        h.runtime.state.activePaletteKey = 'capture';
        h.runtime.state.sliderPreview = { nodeId: 'slider', pinned: true };
        h.runtime.state.latchedByToolId.set('tool.main.capture', true);
        await h.runtime.setToolsCollapsed(true);
        expect(h.runtime.measure()).toMatchObject({ itemCount: 1, activePaletteKey: '' });
        expect(h.runtime.state.sliderPreview).toBeNull();
        expect(h.runtime.getToolLatchedState({ toolId: 'tool.main.capture' })).toBe(true);
    } finally { cleanup(h); }
});

test('the hidden persistent command declares a required boolean and rejects invalid direct input', async () => {
    const definition = buildMatrixToolDefinitions(value => value, 'registered_handler').find(value => value.tool_id === 'ui.main_menu.tools.set');
    expect(definition.input_schema).toMatchObject({ required: ['collapsed'], properties: { collapsed: { type: 'boolean' } } });
    expect(definition.behavior.effects.commit).toBe('persistent');
    const { persistMainMenuToolsCollapsed } = await import('../../eVe/intuition/ribbon/bevy_ui_main_menu_fold.js');
    expect(() => persistMainMenuToolsCollapsed('true')).toThrow('main_menu_tools_collapsed_boolean_required');
    expect(upsertUserProfile).not.toHaveBeenCalled();
});
