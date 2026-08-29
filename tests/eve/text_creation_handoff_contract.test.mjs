import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';

import { textCreationSession } from '../../eVe/core/atome_events/text_creation_session.js';
import {
    getTextServiceState,
    unmountActiveTextEditor
} from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
import { createTextToolCreateRuntime } from '../../eVe/intuition/runtime/eve_intuition/text_tool_create_runtime.js';
import { createTextEditingSession } from '../../eVe/domains/rendering/text_editing_session.js';

test('desktop text creation hands provisional typing to the single canonical hidden editor', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    textCreationSession.abort();
    const session = createTextEditingSession({ documentRef: () => dom.window.document });
    try {
        dom.window.eveToolBase = {
            createAtome: async () => ({ ok: true, id: 'created_text' })
        };
        textCreationSession.begin({
            layer: dom.window.document.body,
            clientX: 20,
            clientY: 30,
            localX: 20,
            localY: 30
        });
        textCreationSession.provisionalEl.value = 'Typed during creation';
        const provisional = textCreationSession.provisionalEl;
        provisional.setSelectionRange(2, 5);
        provisional.dispatchEvent(new dom.window.CompositionEvent('compositionstart'));
        const runtime = createTextToolCreateRuntime({
            resolveCurrentProjectId: () => 'project',
            removeEmptyTextAtomes: async () => ({ ok: true }),
            setAllTextAtomesEditable: () => 0,
            textCreationSession,
            beginProjectSceneTextEdit: ({ atomeId, initialValue }) => {
                session.start({ ownerId: atomeId, value: initialValue });
                return { atome_id: atomeId };
            },
            scheduleProvisionalAdopt: () => null,
            scheduleTextAtomeFocus: () => null,
            rememberCreatedBackgroundTextAtome: () => null,
            clearBackgroundKeyboardState: () => null
        });
        const result = await runtime.createEditableTextAtome({
            action: 'pointer.click',
            input: {
                pointer: { x: 20, y: 30 },
                project_id: 'project',
                allow_inactive: true
            },
            source: { type: 'ui', layer: 'text_background_click' }
        });
        assert.equal(result.created, true);
        assert.equal(result.width, 9);
        assert.equal(result.height, 24);
        assert.equal(textCreationSession.isIdle(), true);
        assert.equal(getTextServiceState().activeEditorCount, 1);
        assert.equal(session.getEditor(), provisional);
        assert.deepEqual(session.getSnapshot().selection, { start: 2, end: 5, caret: 5 });
        assert.equal(session.getSnapshot().composing, true);
        provisional.dispatchEvent(new dom.window.CompositionEvent('compositionend'));
        assert.equal(session.getSnapshot().composing, false);
        assert.equal(dom.window.document.querySelectorAll('#eve_hidden_text_service textarea').length, 1);
        assert.equal(
            dom.window.document.querySelector('#eve_hidden_text_service textarea').value,
            'Typed during creation'
        );
    } finally {
        session.stop();
        textCreationSession.abort();
        unmountActiveTextEditor();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});
