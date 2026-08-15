import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMainToolInteractionRuntime } from '../../eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js';

describe('main tool interaction failure reporting', () => {
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
