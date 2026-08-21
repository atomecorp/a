import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PANEL_SURFACE_DEFINITIONS } from '../../eVe/intuition/panel_definitions.js';

const TARGETS = Object.freeze({
    home: ['eVe/intuition/tools/user.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_home_runtime.js'],
    contact: ['eVe/intuition/tools/contact.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js'],
    info: ['eVe/intuition/tools/infos.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js'],
    finder: ['eVe/intuition/tools/finder.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js'],
    communicate: ['eVe/intuition/tools/communication.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_comm_runtime.js'],
    calendar: ['eVe/intuition/tools/calendar.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js'],
    size: ['eVe/intuition/tools/size.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_size_runtime.js'],
    font: ['eVe/intuition/tools/font.js', 'eVe/intuition/runtime/bevy_panel/bevy_panel_font_runtime.js']
});

Object.entries(TARGETS).forEach(([key, [bridgePath, runtimePath]]) => {
    const definition = PANEL_SURFACE_DEFINITIONS[key];
    const bridge = readFileSync(bridgePath, 'utf8');
    const runtime = readFileSync(runtimePath, 'utf8');
    assert.ok(definition, `${key} must have a panel surface definition`);
    assert.match(bridge, /registerBevyPanelSurface\(/, `${key} must register its Bevy surface`);
    assert.match(runtime, new RegExp(`surfaceId:\\s*['"]${definition.surface_id}['"]`),
        `${key} must declare ${definition.surface_id}`);
    assert.doesNotMatch(`${bridge}\n${runtime}`, /createEveDialog|document\.createElement|innerHTML/,
        `${key} must not recreate an HTML product panel`);
});
