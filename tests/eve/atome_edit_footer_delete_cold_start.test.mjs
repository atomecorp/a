import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { createAtomeEditFooterDefinitionInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_edit_footer_definition_invocation_runtime.js';

test('footer Delete prepares its lazy canonical handler before unified invocation', async () => {
    const dom = new JSDOM('<!doctype html><button id="delete"></button>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    let loaded = false;
    const calls = [];
    const runtime = createAtomeEditFooterDefinitionInvocationRuntime({
        state: { activeAtomeId: 'selected_a' },
        ensureDeletePanelModule: async () => { loaded = true; },
        maybeBlockSelectionRequiredToolActivation: () => null,
        handleFinderTouch: async () => ({ ok: true }),
        getFinderToolEl: () => null,
        invokeToolFromUiButton: async () => ({ ok: true }),
        invokeUnifiedContextTool: async (input) => {
            calls.push(input);
            return loaded ? { ok: true } : { ok: false, error: 'tool_handler_missing_v2' };
        },
        resolveDefinitionToolId: (definition) => definition.toolId,
        buildToolExtraInput: () => ({ selection_ids: ['selected_a'] }),
        isContextBoundTransportToolId: () => false
    });

    const result = await runtime.invokeAtomeEditFooterToolDefinitionWithContext({
        key: 'delete', toolId: 'ui.delete.selection', selectionRequired: true
    }, { atomeId: 'selected_a', payload: { domEl: dom.window.document.getElementById('delete') } });

    assert.equal(result.ok, true);
    assert.equal(loaded, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].extraInput.selection_ids, ['selected_a']);
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
});
