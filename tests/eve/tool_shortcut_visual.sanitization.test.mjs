import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildToolShortcutCreateSpec,
    resolveToolShortcutRole,
    TOOL_SHORTCUT_ROLE
} from '../../eVe/intuition/shared/tool_shortcut_visual.js';

test('tool shortcut create spec exposes canonical envelope and property-owned persistence fields', () => {
    const spec = buildToolShortcutCreateSpec({
        projectId: 'project_alpha',
        left: 12,
        top: 34,
        label: 'Play',
        toolId: 'ui.play',
        toolNameKey: 'play',
        toolIcon: './assets/images/icons/play.svg',
        toolActionMode: 'On_Click',
        toolGatewayAction: 'Play',
        toolLatch: true,
        sourceToolChildren: [{ key: 'child' }],
        sourceAtomeId: 'source_tool'
    });

    assert.equal(spec.id.startsWith('tool_shortcut_play_'), true);
    assert.equal(spec.type, 'shape');
    assert.equal(spec.kind, 'shape');
    assert.equal(spec.renderer, 'intuition_tool_shortcut');
    assert.deepEqual(spec.meta, {
        project_id: 'project_alpha',
        parent_id: 'project_alpha'
    });
    assert.equal(spec.atome_id, undefined);
    assert.equal(spec.project_id, undefined);
    assert.equal(spec.parent_id, undefined);
    assert.equal(spec.toolShortcut, undefined);
    assert.equal(spec.sourceToolId, undefined);
    assert.equal(spec.sourceToolChildren, undefined);

    assert.equal(spec.properties.atome_role, TOOL_SHORTCUT_ROLE);
    assert.equal(spec.properties.tool_shortcut, true);
    assert.equal(spec.properties.is_tool_shortcut, true);
    assert.equal(spec.properties.source_tool_id, 'ui.play');
    assert.equal(spec.properties.source_tool_action_mode, 'on_click');
    assert.equal(spec.properties.source_tool_gateway_action, 'play');
    assert.equal(spec.properties.source_tool_latch, 'true');
    assert.equal(spec.properties.source_tool_children, JSON.stringify([{ key: 'child' }]));
    assert.equal(spec.properties.source_atome_id, 'source_tool');
    assert.equal(spec.properties.source_atome_type, 'tool');
});

test('tool shortcut role resolver accepts canonical properties', () => {
    assert.equal(resolveToolShortcutRole({
        properties: {
            atome_role: TOOL_SHORTCUT_ROLE
        }
    }), true);

    assert.equal(resolveToolShortcutRole({
        properties: {
            tool_shortcut: true
        }
    }), true);
});
