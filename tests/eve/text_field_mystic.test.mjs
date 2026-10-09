import { afterEach, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { CONTEXT_MENUS } from '../../eVe/intuition/menu/context_menus_loader.js';
import { createMysticContextItemsRuntime } from '../../eVe/intuition/runtime/eve_intuition/mystic_context_items_runtime.js';
import { buildBevyUiMysticTree, resolveBevyMysticTreeGeometry } from '../../eVe/intuition/ribbon/bevy_ui_mystic_model.js';
import { restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';
import { createPanelTextEditingRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js';
import { installIntuitionXMysticContextRuntime } from '../../eVe/intuition/mystic/context.js';
import { setMysticRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';

// Bootstrap is a separate boundary; the tests install the real item owner and
// context runtime, without launching the application or its account services.
vi.mock('../../eVe/intuition/eVeIntuition.js', () => ({ ensureMysticContextItemsRuntime: async () => {} }));

const catalog = Object.fromEntries(Object.keys(CONTEXT_MENUS.commands).map(key => [key, { icon: key, tool_id: `ui.${key}` }]));
const itemOwner = () => createMysticContextItemsRuntime({
    applyDeleteSelection: vi.fn(), cloneToolExtraInput: value => value,
    getAtomeElement: () => null, getAtomeKindFromElement: () => '', getDefaultContent: () => catalog,
    hasProjectAutomationForAtomeSync: () => false, invokeProjectMediaImport: vi.fn(),
    invokeUnifiedContextTool: vi.fn(() => { throw new Error('field_must_not_invoke_object_tool'); }),
    isWorkspaceActive: () => false, normalizeMainToolKey: key => key,
    readSelectionSnapshot: () => ({ selectedIds: [] }), resolveCanonicalMainToolId: id => id,
    resolveMainToolKeyFromToolId: id => id, translate: (_key, fallback) => fallback,
    triggerMainToolInteraction: vi.fn()
});
const surface = { getBoundingClientRect: () => ({ width: 390, height: 500 }) };
afterEach(() => { setMysticRuntime(null); vi.unstubAllGlobals(); });

test.each(['beginner', 'intermediate', 'advanced'])('%s fields expose exactly two actions in every work mode', async level => {
    const win = { __eveWorkspaceMode: { mode: 'project', projectId: 'field_modes' },
        __eveProfilePreferences: { visual: { masteryLevel: level } } };
    vi.stubGlobal('window', win);
    const owner = itemOwner();
    for (const mode of ['edit', 'consultation', 'performance']) {
        restoreProjectWorkModeValue('field_modes', mode);
        const copied = vi.fn(() => ({ ok: true })), pasted = vi.fn(() => ({ ok: true }));
        const items = owner.resolveMysticContextItems({ type: 'text_field', hasValue: true,
            projectId: 'field_modes', onCopy: copied, onPaste: pasted });
        expect(items.map(item => item.key)).toEqual(['copy', 'paste']);
        const geometry = resolveBevyMysticTreeGeometry({ surface, items, center: { x: 180, y: 250 } });
        expect(geometry.centerItem).toBeNull();
        expect(buildBevyUiMysticTree({ surface, items, geometry }).root.children).toHaveLength(2);
        await items[0].onSelect(); await items[1].onSelect();
        expect(copied).toHaveBeenCalledOnce(); expect(pasted).toHaveBeenCalledOnce();
    }
    restoreProjectWorkModeValue('field_modes', 'edit');
});

test('empty and read-only fields retain Copy/Paste with only the applicable action enabled', () => {
    const owner = itemOwner();
    const readOnly = owner.resolveMysticContextItems({ type: 'text_field', hasValue: true, canPaste: false });
    expect(readOnly.map(item => [item.key, item.disabled])).toEqual([['copy', false], ['paste', true]]);
    const empty = owner.resolveMysticContextItems({ type: 'text_field', hasValue: false });
    expect(empty.map(item => [item.key, item.disabled])).toEqual([['copy', true], ['paste', false]]);
    expect(resolveBevyMysticTreeGeometry({ surface, items: [], center: { x: 180, y: 250 } }).centerItem.disabled).toBe(true);
});

test('the first field hold supplies Copy/Paste; copying a selected range and pasting repaint the target', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
    let clipboard = '';
    vi.stubGlobal('navigator', { clipboard: { writeText: async text => { clipboard = text; }, readText: async () => clipboard } });
    const owner = itemOwner();
    const cleanup = installIntuitionXMysticContextRuntime({ resolveItems: owner.resolveMysticContextItems });
    let opening = null, menuOpen = false;
    setMysticRuntime({ isOpen: () => menuOpen,
        openAt: async options => { opening = options; menuOpen = true; return true; },
        close: () => { menuOpen = false; opening?.onClose?.(); } });
    const values = { source: 'bonjour monde', target: 'old' }, refresh = vi.fn();
    const editing = createPanelTextEditingRuntime({ name: 'field_menu',
        readField: key => values[key], writeDraft: (key, value) => { values[key] = value; } });
    for (const key of Object.keys(values)) editing.registerField(key, { width: 300, height: 40, nodeId: key });
    try {
        editing.handle({ type: 'field_menu.field.focus', key: 'source', event: { x: 12, y: 15 } });
        const editor = dom.window.document.querySelector('textarea');
        editor.setSelectionRange(0, 7); editor.dispatchEvent(new dom.window.Event('select'));
        await editing.longPress('source', { client_x: 180, client_y: 250 }, refresh);
        expect(opening.context.type).toBe('text_field');
        expect(opening.items.map(item => item.key)).toEqual(['copy', 'paste']);
        await opening.items[0].onSelect(); expect(clipboard).toBe('bonjour');
        menuOpen = false; opening.onClose();
        editing.handle({ type: 'field_menu.field.focus_all', key: 'target' }, { refresh });
        await editing.longPress('target', { client_x: 180, client_y: 250 }, refresh);
        await opening.items[1].onSelect();
        expect(values.target).toBe('bonjour'); expect(refresh).toHaveBeenCalled();
    } finally {
        editing.stop(); cleanup(); setMysticRuntime(null); dom.window.close();
    }
});
