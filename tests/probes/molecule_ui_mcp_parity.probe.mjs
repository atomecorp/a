import assert from 'node:assert/strict';
import test from 'node:test';

import { registerTimelineDefaultTools } from '../../atome/src/squirrel/ai/default_tools_timeline.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createRichMoleculeFixture } from '../fixtures/molecule/canonical_v2_fixtures.mjs';

const createSession = (suffix) => createMoleculeSession({
    timeline: {
        ...createRichMoleculeFixture(),
        timeline_id: `parity_${suffix}`,
        owner_atome_id: `parity_owner_${suffix}`
    },
    eventSink: { async append() { return { ok: true }; } }
});

test('UI actions and MCP tools converge on the same Molecule state and history semantics', async () => {
    const sessions = new Map([
        ['ui', createSession('ui')],
        ['mcp', createSession('mcp')]
    ]);
    const api = {
        async applyGroupTimelineOperation(detail) {
            return sessions.get(detail.group_id).applyTimelineOperation(detail.operation, detail.command);
        },
        async applyGroupTimelineBatch(detail) {
            return sessions.get(detail.group_id).applyBatch(detail.operations, detail);
        },
        async undoGroupTimeline(detail) {
            return sessions.get(detail.group_id).undo();
        },
        async redoGroupTimeline(detail) {
            return sessions.get(detail.group_id).redo();
        }
    };
    globalThis.eveMoleculeTimelineApi = api;

    try {
        const mcpTools = new Map();
        registerTimelineDefaultTools({
            Agent: { registerTool(definition) { mcpTools.set(definition.name, definition); } }
        });

        const command = {
            clip_id: 'fixture_rich:clip:audio',
            start_seconds: 2.5
        };
        await api.applyGroupTimelineOperation({
            group_id: 'ui', operation: 'ui.timeline.clip.move', command
        });
        await mcpTools.get('eve.timeline.clip.move').handler({
            group_id: 'mcp', command
        });

        const batch = [
            {
                operation: 'molecule.transport.playhead',
                command: { playhead_seconds: 4 }
            },
            {
                operation: 'molecule.quantization.set',
                command: { quantization: '1/16beat' }
            }
        ];
        await api.applyGroupTimelineBatch({
            group_id: 'ui', operations: batch, label: 'parity'
        });
        await mcpTools.get('eve.timeline.batch').handler({
            group_id: 'mcp', operations: batch, label: 'parity'
        });

        const uiState = sessions.get('ui').getState();
        const mcpState = sessions.get('mcp').getState();
        assert.deepEqual(
            { ...uiState, timeline_id: '', owner_atome_id: '' },
            { ...mcpState, timeline_id: '', owner_atome_id: '' }
        );
        assert.equal(sessions.get('ui').getHistory().undo.length, 2);
        assert.equal(sessions.get('mcp').getHistory().undo.length, 2);

        await api.undoGroupTimeline({ group_id: 'ui' });
        await mcpTools.get('eve.timeline.history.undo').handler({ group_id: 'mcp' });
        assert.equal(sessions.get('ui').getState().transport.playhead_seconds, 0);
        assert.equal(sessions.get('mcp').getState().transport.playhead_seconds, 0);
    } finally {
        delete globalThis.eveMoleculeTimelineApi;
    }
});
