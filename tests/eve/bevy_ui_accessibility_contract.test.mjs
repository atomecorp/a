import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createBevyUiAccessibilityRuntime } from '../../eVe/domains/rendering/bevy_ui_accessibility_runtime.js';
import { createBevyUiRuntimeState } from '../../eVe/domains/rendering/bevy_ui_runtime_state.js';
import { normalizeBevyUiTree, createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';

const documents = [];
afterEach(() => documents.splice(0).forEach(dom => dom.window.close()));
const button = (id, x = 0, y = 0, extra = {}) => ({ id: 'native_' + id, kind: 'button',
    style: { position_type: 'absolute', position: [x, y], size: [40, 40] },
    accessibility: { label: id }, on: { activate: () => {} }, ...extra });
const fixture = (children) => {
    const dom = new JSDOM('<!doctype html><canvas tabindex="0"></canvas>'); documents.push(dom);
    const canvas = dom.window.document.querySelector('canvas'), state = createBevyUiRuntimeState();
    const emitted = [], revealed = [], changed = [];
    const owner = createBevyUiAccessibilityRuntime({ state, emit: event => {
        emitted.push(event); state.handlers.get(`${event.tree_id}:${event.node_id}:${event.event}`)?.(event);
    }, reveal: target => revealed.push(target.nodeId), focusChanged: (...args) => changed.push(args),
    focusStyle: { border: [2, 2, 2, 2], border_color: [0, 0.5, 1, 1] } });
    const update = (nodes, layer = 'projectView') => {
        state.handlers.clear();
        const tree = normalizeBevyUiTree({ id: 'matrix', handlers: state.handlers,
            tree: { layer, root: { id: 'root', kind: 'root', style: { size: [400, 400] }, children: nodes } } });
        state.trees.set('matrix', { surface: canvas, tree }); owner.synchronize(); return tree;
    };
    const find = name => [...dom.window.document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === name);
    const key = (element, name) => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    update(children);
    return { dom, canvas, state, owner, update, find, key, emitted, revealed, changed };
};

describe('canonical BevyUI accessibility projection', () => {
    it('routes Enter and Space to the current node handlers without a business-state copy', () => {
        const calls = [];
        const f = fixture([button('Parent', 0, 0, { accessibility: { label: 'Parent', default_action: 'double_click' },
            on: { activate: () => calls.push('select'), double_click: () => calls.push('open') } })]);
        const element = f.find('Parent'); element.focus(); f.key(element, 'Enter'); f.key(element, ' ');
        expect(calls).toEqual(['open', 'select']);
        f.update([button('Parent', 0, 0, { accessibility: { label: 'Parent', default_action: 'double_click' },
            on: { activate: () => calls.push('new-select'), double_click: () => calls.push('new-open') } })]);
        expect(f.find('Parent')).toBe(element); f.key(element, 'Enter');
        expect(calls.at(-1)).toBe('new-open');
        expect(element.attributes.length).toBe(3);
        expect(f.dom.window.document.querySelector('.eve-atome')).toBeNull();
        expect(element.parentElement.style.clipPath).toBe('inset(50%)');
        expect(f.state.focusTarget).toMatchObject({ treeId: 'matrix', nodeId: 'native_Parent', semantic: true });
    });

    it('moves spatially, reveals the real node and decorates only the rendering projection', () => {
        const f = fixture([button('first'), button('right', 50), button('below', 0, 50)]);
        f.find('first').focus(); f.key(f.find('first'), 'ArrowRight');
        expect(f.dom.window.document.activeElement).toBe(f.find('right'));
        f.key(f.find('right'), 'ArrowDown');
        expect(f.dom.window.document.activeElement).toBe(f.find('below'));
        expect(f.revealed).toEqual(['native_first', 'native_right', 'native_below']);
        const original = f.state.trees.get('matrix').tree;
        const projected = f.owner.decorate(original, 'matrix');
        expect(projected.root.children[2].style.border).toEqual([2, 2, 2, 2]);
        expect(original.root.children[2].style.border).toBeUndefined();
        expect(f.owner.decorate(original, 'another')).toBe(original);
        f.key(f.find('below'), 'Escape');
        expect(f.owner.readFocus()).toBeNull();
        expect(f.dom.window.document.activeElement).toBe(f.canvas);
    });

    it('keeps focus and follows the latest tree order when rows reorder', () => {
        const f = fixture([button('first'), button('second', 50)]), second = f.find('second'); second.focus();
        f.update([button('second', 50), button('first')]);
        expect([...f.dom.window.document.querySelectorAll('button')].map(node => node.getAttribute('aria-label'))).toEqual(['second', 'first']);
        expect(f.dom.window.document.activeElement).toBe(second);
        expect(f.owner.readFocus()?.nodeId).toBe('native_second');
    });

    it('shares one Tab stop per native navigation group and dispatches key events to its owner', () => {
        const keys = [], f = fixture(['first', 'second'].map((id, index) => button(id, index * 50, 0, {
            accessibility: { label: id, navigation_group: 'matrix_tiles' },
            on: { activate() {}, key_down: event => keys.push(event.key) } })));
        expect(f.find('first').tabIndex).toBe(0); expect(f.find('second').tabIndex).toBe(-1);
        expect(f.owner.focusNode({ id: 'matrix', nodeId: 'native_second' })).toBe(true);
        expect(f.find('first').tabIndex).toBe(-1); expect(f.find('second').tabIndex).toBe(0);
        f.key(f.find('second'), 'End'); expect(keys).toEqual(['End']);
        expect(f.dom.window.document.activeElement).toBe(f.find('second'));
    });

    it('does not expose generated node identifiers as assistive labels', () => {
        const f = fixture([button('real'), { ...button('internal'), accessibility: { label: 'native_internal' } }]);
        expect(f.find('real')).toBeDefined(); expect(f.find('native_internal')).toBeUndefined();
    });

    it('rejects stale activation as soon as an ancestor becomes hidden', () => {
        const calls = [], f = fixture([{ id: 'parent', kind: 'column', children: [button('child', 0, 0, {
            on: { activate: () => calls.push('activate') } })] }]);
        const element = f.find('child'); element.focus();
        f.state.trees.get('matrix').tree.root.children[0].accessibility = { hidden: true };
        element.click(); expect(calls).toEqual([]);
        f.owner.synchronize();
        expect(f.find('child')).toBeUndefined(); expect(f.owner.readFocus()).toBeNull();
    });

    it('cannot activate a replacement node through a detached semantic control', () => {
        const calls = [], f = fixture([button('old')]), old = f.find('old');
        f.update([]); f.update([button('old', 0, 0, { on: { activate: () => calls.push('new') } })]);
        old.click(); expect(calls).toEqual([]);
        f.find('old').click(); expect(calls).toEqual(['new']);
    });

    it('does not focus or activate disabled controls and removes stale semantic attributes', () => {
        const calls = [], f = fixture([button('disabled', 0, 0, { accessibility: { label: 'disabled', disabled: true },
            on: { activate: () => calls.push('activate') } }), button('enabled', 50, 0, {
            accessibility: { label: 'enabled', role: 'checkbox', checked: false } })]);
        f.find('disabled').focus(); f.find('disabled').click();
        expect(f.owner.readFocus()).toBeNull(); expect(calls).toEqual([]);
        expect(f.find('enabled').getAttribute('aria-checked')).toBe('false');
        f.update([button('enabled')]);
        expect(f.find('enabled').hasAttribute('role')).toBe(false);
        expect(f.find('enabled').hasAttribute('aria-checked')).toBe(false);
        f.find('enabled').focus();
        f.update([button('enabled', 0, 0, { accessibility: { label: 'enabled', disabled: true } })]);
        expect(f.owner.readFocus()).toBeNull();
    });

    it('releases focus, controls and the semantic surface on suspension and unmount', () => {
        const f = fixture([button('first')]); f.find('first').focus();
        f.state.suspendedTrees.add('matrix'); f.owner.synchronize();
        expect(f.find('first')).toBeUndefined(); expect(f.state.focusTarget).toBeNull();
        f.state.suspendedTrees.delete('matrix'); f.owner.synchronize();
        expect(f.find('first')).toBeDefined();
        f.state.trees.delete('matrix'); f.owner.releaseTree('matrix');
        expect(f.dom.window.document.querySelector('[id^="eve_bevy_semantics_"]')).toBeNull();
    });

    it('leaves newer pointer focus intact when the semantic projection synchronizes', () => {
        const f = fixture([button('first'), button('second', 50)]); f.find('first').focus();
        const pointerFocus = { treeId: 'matrix', nodeId: 'native_second', canvas: f.canvas };
        f.state.focusTarget = pointerFocus; f.owner.synchronize();
        expect(f.state.focusTarget).toBe(pointerFocus);
        expect(f.owner.readFocus()).toBeNull();
    });

    it('retains the canonical hidden-editor handoff for text fields', () => {
        const calls = [], f = fixture([button('text', 0, 0, { kind: 'text_input', on: { focus: () => calls.push('edit') } })]);
        f.find('text').focus(); expect(calls).toEqual([]);
        f.key(f.find('text'), 'Enter'); expect(calls).toEqual(['edit']);
    });

    it('records a failed focus projection in the existing overlay diagnostics', async () => {
        const dom = new JSDOM('<canvas tabindex="0"></canvas>', { url: 'http://localhost/' }); documents.push(dom);
        let rejectProjection = false;
        const runtime = createEveBevyUiRuntime({ requestFrame: () => 0, overlayProjector: { project: async () => {
            if (rejectProjection) throw new Error('focus_projection_rejected');
            return [];
        } } });
        await runtime.mountTree({ id: 'failure', surface: dom.window.document.querySelector('canvas'),
            tree: { id: 'failure', disableScaleWatch: true, root: { id: 'root', kind: 'root', children: [button('focus')] } } });
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            rejectProjection = true; dom.window.document.querySelector('button').focus();
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(runtime.readOverlayDiagnostics().lastOverlayError).toBe('focus_projection_rejected');
            expect(warning).not.toHaveBeenCalled();
        } finally { warning.mockRestore(); rejectProjection = false; await runtime.unmountTree({ id: 'failure' }); }
    });

    it('integrates mount, update, opacity, suspension and unmount in the real shared runtime', async () => {
        const dom = new JSDOM('<!doctype html><canvas id="project" tabindex="0"></canvas>', { url: 'http://localhost/' }); documents.push(dom);
        const canvas = dom.window.document.querySelector('canvas'), calls = [], projections = [];
        const runtime = createEveBevyUiRuntime({ requestFrame: () => 0,
            overlayProjector: { project: async input => { projections.push(input); return []; } } });
        const tree = { id: 'matrix', disableScaleWatch: true, root: { id: 'root', kind: 'root', style: { size: [400, 400] },
            children: [button('open', 0, 0, { on: { activate: () => calls.push('activate') } })] } };
        await runtime.mountTree({ id: 'matrix', tree, surface: canvas });
        const element = dom.window.document.querySelector('button'); expect(element.getAttribute('aria-label')).toBe('open');
        element.focus(); await new Promise(resolve => setTimeout(resolve, 10)); element.click(); expect(calls).toEqual(['activate']);
        expect(runtime.state.sourceTrees.get('matrix').tree.root.children[0].style.border).toBeUndefined();
        expect(runtime.state.trees.get('matrix').tree.root.children[0].style.border).toEqual([2, 2, 2, 2]);
        await runtime.setTreeOpacity({ id: 'matrix', opacity: 0 }); expect(dom.window.document.querySelector('button')).toBeNull();
        await runtime.setTreeOpacity({ id: 'matrix', opacity: 1 }); expect(dom.window.document.querySelector('button')).not.toBeNull();
        await runtime.setTreeSuspended({ id: 'matrix', suspended: true }); expect(dom.window.document.querySelector('button')).toBeNull();
        await runtime.setTreeSuspended({ id: 'matrix', suspended: false }); expect(dom.window.document.querySelector('button')).not.toBeNull();
        await runtime.unmountTree({ id: 'matrix' }); expect(dom.window.document.querySelector('[id^="eve_bevy_semantics_"]')).toBeNull();
    });
});
