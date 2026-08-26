import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { createAtomeEditFooterDefinitionInvocationRuntime } from '../../eVe/intuition/runtime/eve_intuition/atome_edit_footer_definition_invocation_runtime.js';
import { projectViewPlayback } from '../../eVe/domains/rendering/project_view_playback_runtime.js';
import { feedContextualRailWithRow } from '../../eVe/domains/rendering/project_view_contextual_rail.js';

test('footer Delete prepares its lazy canonical handler before unified invocation', async () => {
    const dom = new JSDOM('<!doctype html><button id="delete"></button>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    let loaded = false;
    const calls = [];
    const payloadOptions = [];
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
        buildToolExtraInput: (options) => {
            payloadOptions.push(options);
            return { selection_ids: options.preferActiveAtomeOnly ? [options.activeAtomeId] : ['stale_a', 'selected_a'] };
        },
        isContextBoundTransportToolId: () => false
    });

    const result = await runtime.invokeAtomeEditFooterToolDefinitionWithContext({
        key: 'delete', toolId: 'ui.delete.selection', selectionRequired: true
    }, { atomeId: 'selected_a', payload: { domEl: dom.window.document.getElementById('delete') } });

    assert.equal(result.ok, true);
    assert.equal(loaded, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].extraInput.selection_ids, ['selected_a']);
    assert.equal(payloadOptions[0].preferActiveAtomeOnly, true);
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
});

test('structured rail Play delegates the exact List or Matrix record to the project playback owner', async () => {
    const dom = new JSDOM('<!doctype html><button id="play"></button>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    let gatewayCalled = false;
    const runtime = createAtomeEditFooterDefinitionInvocationRuntime({
        state: { activeAtomeId: 'caption_row' },
        ensureDeletePanelModule: async () => {},
        maybeBlockSelectionRequiredToolActivation: () => null,
        handleFinderTouch: async () => ({ ok: true }),
        getFinderToolEl: () => null,
        invokeToolFromUiButton: async () => ({ ok: true }),
        invokeUnifiedContextTool: async () => { gatewayCalled = true; return { ok: true }; },
        resolveDefinitionToolId: (definition) => definition.toolId,
        buildToolExtraInput: () => ({ selection_ids: ['caption_row'] }),
        isContextBoundTransportToolId: (toolId) => toolId === 'ui.play'
    });
    const result = await runtime.invokeAtomeEditFooterToolDefinitionWithContext({
        key: 'play', toolId: 'ui.play'
    }, {
        atomeId: 'caption_row',
        railOnly: true,
        record: { id: 'caption_row', project_id: 'project_structured', type: 'text', structured_context: true, properties: { kind: 'text' } },
        payload: { domEl: dom.window.document.getElementById('play') }
    });
    assert.equal(result.ok, true);
    assert.equal(result.id, 'caption_row');
    assert.equal(gatewayCalled, false);
    await projectViewPlayback.stop();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
});

test('a structured List or Matrix selection hands the active rail the marked canonical record', async () => {
    const calls = [];
    const record = { id: 'video_row', type: 'video', project_id: 'project_structured', properties: { kind: 'video' } };
    const result = await feedContextualRailWithRow({
        target: { id: record.id, record }, projectId: record.project_id,
        api: { enter: (options) => { calls.push(options); return { ok: true }; } }
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].railOnly, true);
    assert.equal(calls[0].record.id, record.id);
    assert.equal(calls[0].record.structured_context, true);
});
