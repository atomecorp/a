import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMainToolInteractionRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js';
import { createMainToolCatalogRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js';
import { createMainToolRegistrationRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_registration_runtime.js';

describe('main tool interaction failure reporting', () => {
    for (const order of ['command-first', 'menu-first']) it(`preserves dedicated command handlers with ${order} initialization`, async () => {
        const normalize = (value) => String(value || '').trim();
        const catalog = createMainToolCatalogRuntime({ normalizeMainToolKey: normalize });
        const registry = new Map();
        const content = {
            midi_binding: { type: 'tool', atome_tool: true, tool_id: 'ui.midi.binding.panel', action: 'toggle', latch: true },
            line_splitter: { type: 'tool', atome_tool: true, tool_id: 'ui.text.line_splitter', action: 'momentary' }
        };
        const command = ({ input }) => ({ ok: true, target: input.target_atome_id });
        const registerCommands = () => Object.values(content).forEach(({ tool_id }) => {
            if (!registry.has(tool_id)) registry.set(tool_id, command);
        });
        const registerMenu = createMainToolRegistrationRuntime({
            ...catalog, intuitionContent: content, normalizeMainToolKey: normalize,
            registerAtomeTool: (definition) => registry.set(definition.tool_id, definition.handler),
            resolvePanelContextElement: () => null,
            triggerMainToolInteraction: () => ({ ok: false, error: 'wrong_owner' })
        });
        if (order === 'command-first') registerCommands();
        registerMenu();
        registerCommands();
        for (const handler of registry.values()) {
            expect(handler).toBe(command);
            expect(await handler({ input: { target_atome_id: 'selected-text' } })).toEqual({ ok: true, target: 'selected-text' });
        }
        expect(registry.size).toBe(2);
    });
    let previousDocument;
    let previousHTMLElement;

    beforeEach(() => {
        previousDocument = globalThis.document;
        previousHTMLElement = globalThis.HTMLElement;
        globalThis.HTMLElement = class HTMLElement {};
        globalThis.document = { getElementById: () => null };
    });

    afterEach(() => {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
        else globalThis.HTMLElement = previousHTMLElement;
    });

    it('preserves the typed failure returned by a latch activation handler', async () => {
        const runtime = createMainToolInteractionRuntime({
            getIntuitionContent: () => ({
                home: {
                    action: 'toggle',
                    tool_id: 'tool.main.home',
                    active: async () => ({ ok: false, error: 'home_surface_open_failed' }),
                    inactive: async () => ({ ok: true })
                }
            }),
            mainToolIdByKey: { home: 'tool.main.home' },
            maybeBlockSelectionRequiredToolActivation: () => null,
            normalizeMainToolKey: (value) => String(value || '').trim(),
            readExplicitLatched: () => null,
            resolveIntuitionItemId: (value) => value,
            resolveMainToolLatchedState: () => false,
            syncToolLatchedState: () => {},
            unwrapToolGatewayResult: (value) => ({ payload: value })
        });

        await expect(runtime.triggerMainToolInteraction('home', 'touch')).resolves.toMatchObject({
            ok: false,
            error: 'home_surface_open_failed',
            handler: 'active'
        });
    });
});
