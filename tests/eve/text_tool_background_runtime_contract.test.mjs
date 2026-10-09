import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { JSDOM } from 'jsdom';

import { createTextToolBackgroundRuntime } from '../../eVe/intuition/runtime/eve_intuition/text_tool_background_runtime.js';

const previousDocument = globalThis.document;
const previousElement = globalThis.Element;
const previousHTMLElement = globalThis.HTMLElement;

afterEach(() => {
    globalThis.document = previousDocument;
    globalThis.Element = previousElement;
    globalThis.HTMLElement = previousHTMLElement;
});

test('an active canonical text session blocks Return from background text creation even during focus transition', async () => {
    const dom = new JSDOM('<!doctype html><body><canvas id="eve_surface_project"></canvas></body>');
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    let invocations = 0;
    const runtime = createTextToolBackgroundRuntime({
        activateTextToolMode: () => true,
        commitTextAtomeImmediately: async () => ({ ok: true }),
        deactivateTextToolMode: () => true,
        ensureCaretAtEndOfTextAtome: () => true,
        hasActiveCanonicalTextEdit: () => true,
        hasCachedLatchedToolOutside: () => false,
        insertBufferedTextIntoCreatedAtome: async () => ({ ok: true }),
        invokeTool: async () => { invocations += 1; return { ok: true }; },
        isTemporaryBackgroundTextToolSessionActive: () => false,
        isTextToolModeActive: () => true,
        readSelectionSnapshot: () => ({ ids: [] }),
        rememberTextToolBackgroundFocus: () => true,
        resolveCurrentProjectId: () => 'project_text',
        resolveTextAtomeEditingRefs: () => null,
        stabilizeCreatedTextAtomeCaretAtEnd: async () => null,
        textCreationSession: { begin: () => true },
        textToolBackgroundFocusState: { projectId: 'project_text', parentId: 'molecule', pointer: { x: 20, y: 20 }, at: Date.now() },
        textToolBackgroundKeyboardState: { pending: false, buffer: '', activeAtomeId: null },
        textToolProjectClickDispatchState: { lastEventTs: null, lastSignature: '', lastAt: 0 }
    });
    const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true
    });
    const result = await runtime.handleTextToolBackgroundKeydown({ event });
    assert.deepEqual(result, { ok: false, skipped: true, reason: 'active_text_edit' });
    assert.equal(invocations, 0);
    assert.equal(event.defaultPrevented, false);
});

test('a background double-tap that opens the temporary Text session stops an armed Draw', async () => {
    const dom = new JSDOM('<!doctype html><body><main id="project_view_project_text"><canvas id="eve_surface_project"></canvas></main></body>');
    const previousWindow = globalThis.window;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    let drawActive = true;
    let textActive = false;
    const invoked = [];
    dom.window.__eveDrawTool = { isActive: () => drawActive, deactivate: () => { drawActive = false; } };
    dom.window.__eveTextTool = { isActive: () => textActive, deactivate: () => { textActive = false; } };
    try {
        const runtime = createTextToolBackgroundRuntime({
            activateTextToolMode: () => { textActive = true; return true; },
            commitTextAtomeImmediately: async () => ({ ok: true }),
            deactivateTextToolMode: () => { textActive = false; return { active: false }; },
            ensureCaretAtEndOfTextAtome: () => true,
            hasActiveCanonicalTextEdit: () => false,
            hasCachedLatchedToolOutside: () => false,
            insertBufferedTextIntoCreatedAtome: async () => ({ ok: true }),
            invokeTool: async (request) => { invoked.push(request.tool_id); return { ok: true, created: true, atome_id: 'text_1' }; },
            isTemporaryBackgroundTextToolSessionActive: () => false,
            isTextToolModeActive: () => textActive,
            readSelectionSnapshot: () => ({ ids: [] }),
            rememberTextToolBackgroundFocus: () => true,
            resolveCurrentProjectId: () => 'project_text',
            resolveTextAtomeEditingRefs: () => null,
            stabilizeCreatedTextAtomeCaretAtEnd: async () => null,
            textCreationSession: { begin: () => true, isActive: () => false, isInGracePeriod: () => false },
            textToolBackgroundFocusState: { projectId: 'project_text', parentId: null, pointer: null, at: 0 },
            textToolBackgroundKeyboardState: { pending: false, buffer: '', activeAtomeId: null },
            textToolProjectClickDispatchState: { lastEventTs: null, lastSignature: '', lastAt: 0 }
        });
        const layer = dom.window.document.querySelector('main');
        const result = await runtime.handleTextToolProjectBackgroundClick({
            layer, event: { type: 'pointerup', pointerType: 'touch', clientX: 120, clientY: 80, timeStamp: 42 }, clickCount: 2
        });
        assert.equal(result.ok, true);
        assert.deepEqual(invoked, ['ui.text.create']);
        assert.equal(textActive, true);
        assert.equal(drawActive, false);
    } finally {
        globalThis.window = previousWindow;
    }
});
