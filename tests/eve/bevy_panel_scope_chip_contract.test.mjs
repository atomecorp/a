import assert from 'node:assert/strict';
import { test } from 'vitest';

import { normalizeScopeChipPresentation } from '../../atome/src/squirrel/components/scope_chip_contract.js';
import { scopeChipGroupNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_scope_chips.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { INTERACTIVE_KINDS, SUPPORTED_KINDS } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';

const options = [
    { value: 'events', label: 'Events' },
    { value: 'todos', label: 'Todos' },
    { value: 'reminders', label: 'Reminders', disabled: true }
];

test('canonical scope-chip contract normalizes independent selected values', () => {
    const presentation = normalizeScopeChipPresentation({ options, values: ['events', 'todos'] });
    assert.deepEqual(presentation.values, ['events', 'todos']);
    assert.throws(() => normalizeScopeChipPresentation({ options, values: 'events' }), /squirrel_scope_chip_values_array_required/);
    assert.throws(() => normalizeScopeChipPresentation({ options, values: ['events', 'events'] }), /squirrel_scope_chip_value_duplicate:events/);
    assert.throws(() => normalizeScopeChipPresentation({ options, values: ['missing'] }), /squirrel_scope_chip_value_unknown:missing/);
    assert.throws(() => normalizeScopeChipPresentation({ options, values: ['reminders'] }), /squirrel_scope_chip_value_disabled:reminders/);
});

test('shared scope-chip builder uses native buttons with Select states and no disabled handler', () => {
    const group = scopeChipGroupNode({
        id: 'scope', options, values: ['events'], hoveredValue: 'todos', focusedValue: 'todos', pressedValue: 'events', on: { activate: () => {} }
    });
    const [events, todos, reminders] = group.children;
    assert.equal(group.kind, 'row');
    assert.equal(events.kind, 'button');
    assert.equal(SUPPORTED_KINDS.has(events.kind), true);
    assert.equal(INTERACTIVE_KINDS.has(events.kind), true);
    assert.deepEqual(events.style.size[1], BEVY_PANEL_TOKENS.scopeChip.heightPx);
    assert.deepEqual(events.style.background, BEVY_PANEL_TOKENS.buttonMaterial.pressed.background);
    assert.deepEqual(todos.style.background, BEVY_PANEL_TOKENS.buttonMaterial.hover.background);
    assert.ok(todos.style.shadow);
    assert.equal(reminders.on, undefined);
    assert.equal(reminders.style.opacity, BEVY_PANEL_TOKENS.select.disabledOpacity);
});

