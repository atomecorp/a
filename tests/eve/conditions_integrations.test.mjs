import { describe, expect, it } from 'vitest';
import { createPanelConditionsRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_conditions_runtime.js';
import { commRuntime, commSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_comm_runtime.js';
import { buildEventParticles, normalizeEvent } from '../../eVe/intuition/tools/calendar_model.js';

const findNode = (entry, id) => {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.id === id) return entry;
    for (const child of entry.children || []) {
        const match = findNode(child, id);
        if (match) return match;
    }
    return null;
};

describe('shared Conditions integrations', () => {
    it('uses one configurable Bevy runtime to filter contacts and render the compact accordion', () => {
        const runtime = createPanelConditionsRuntime({
            name: 'test_conditions',
            intentPrefix: 'test.conditions',
            domain: 'contacts',
            defaultSource: 'contact',
            defaultProperty: 'name',
            defaultOperator: 'contains',
            caseInsensitive: true,
            properties: [{ value: 'name', label: 'Name', source: 'contact', field: 'name', type: 'string' }],
            operators: [{ value: 'contains', label: 'contains' }]
        });
        runtime.setDocument({
            schemaVersion: 1,
            root: { source: 'contact', field: 'name', operator: 'contains', value: 'music', caseInsensitive: true }
        });
        expect(runtime.filter([{ name: 'Music Lab' }, { name: 'Studio' }])).toEqual([{ name: 'Music Lab' }]);
        const snapshot = runtime.readState();
        expect(runtime.document()).toEqual({
            schemaVersion: 1,
            root: { source: 'contact', field: 'name', operator: 'contains', value: 'music', caseInsensitive: true }
        });
        expect(runtime.buildNode(snapshot, 420, () => {}).id).toBe('test_conditions');

        const grouped = {
            schemaVersion: 1,
            root: {
                combinator: 'or',
                children: [
                    { source: 'contact', field: 'name', operator: 'eq', value: 'Alice' },
                    { source: 'contact', field: 'name', operator: 'eq', value: 'Bob' }
                ]
            }
        };
        runtime.setDocument(grouped);
        expect(runtime.readState().advanced).toBe(false);
        expect(runtime.readState().groupMode).toBe('or');
        expect(runtime.document()).toEqual({
            schemaVersion: 1,
            root: {
                combinator: 'or',
                children: [
                    { source: 'contact', field: 'name', operator: 'eq', value: 'alice', caseInsensitive: true },
                    { source: 'contact', field: 'name', operator: 'eq', value: 'bob', caseInsensitive: true }
                ]
            }
        });
        expect(runtime.filter([{ name: 'Alice' }, { name: 'Carol' }])).toEqual([{ name: 'Alice' }]);
    });

    it('routes Finder properties through the generic Conditions runtime', async () => {
        const records = [
            { id: 'one', name: 'Alpha', properties: { score: 8 } },
            { id: 'two', name: 'Beta', properties: { score: 3 } }
        ];
        const runtime = createPanelConditionsRuntime({
            name: 'finder_conditions_test',
            intentPrefix: 'finder.conditions',
            domain: 'search',
            defaultSource: 'record',
            properties: [{ value: 'record.score', source: 'record', field: 'score', type: 'number' }],
            operators: [{ value: 'gte', label: 'at least' }]
        });
        await runtime.discover({ candidates: records });
        runtime.setDocument({ source: 'record', field: 'score', operator: 'gte', value: 5 });
        expect(runtime.filter(records).map((record) => record.id)).toEqual(['one']);
    });

    it('uses a directly editable property field with agnostic dynamic suggestions', async () => {
        const runtime = createPanelConditionsRuntime({
            name: 'flat_conditions',
            intentPrefix: 'flat.conditions',
            domain: 'contacts',
            defaultSource: 'contact',
            defaultProperty: 'contact.name',
            properties: [
                { value: 'contact.name', label: 'Name', source: 'contact', field: 'name', group: 'all' },
                { value: 'health.heart_rate', label: 'Heart rate', source: 'health', field: 'heart_rate', group: 'live' }
            ]
        });
        const context = { candidates: [], refresh: () => {} };
        await runtime.handle({ type: 'flat.conditions.toggle' }, context);
        const row = runtime.readState().rows[0];
        await runtime.handle({ type: 'flat.conditions.menu', id: row.id, part: 'property' }, context);
        const tree = runtime.buildNode(runtime.readState(), 420, () => {});
        const propertyInput = findNode(tree, 'flat_conditions_0_property');
        const first = findNode(tree, 'flat_conditions_0_property_suggestions_option_0_label');
        const second = findNode(tree, 'flat_conditions_0_property_suggestions_option_1_label');
        expect(propertyInput?.kind).toBe('text_input');
        expect(propertyInput?.on?.focus).toBeTypeOf('function');
        expect(first?.text).toBe('Name');
        expect(second?.text).toBe('Heart rate');
        expect(JSON.stringify(tree)).not.toContain('__condition_create_computed__');
        expect(JSON.stringify(tree)).not.toContain('Create a criterion');
    });

    it('renders one property match without violating the shared list contract', async () => {
        const runtime = createPanelConditionsRuntime({
            name: 'single_match_conditions',
            intentPrefix: 'single.match.conditions',
            domain: 'contacts',
            defaultSource: 'contact',
            defaultProperty: 'contact.name',
            properties: [
                { value: 'contact.name', label: 'Name', source: 'contact', field: 'name' },
                { value: 'contact.weight', label: 'Weight', source: 'contact', field: 'weight', type: 'number' }
            ]
        });
        const context = { candidates: [], refresh: () => {} };
        await runtime.handle({ type: 'single.match.conditions.toggle' }, context);
        const snapshot = runtime.readState();
        const row = snapshot.rows[0];
        row.propertyDraft = 'weig';
        row.propertyDirty = true;
        row.expanded = 'property';
        const tree = runtime.buildNode(snapshot, 420, () => {});
        expect(findNode(tree, 'single_match_conditions_0_property_suggestions_option_0_label')?.text).toBe('Weight');
        expect(JSON.stringify(tree)).not.toContain('squirrel_selectable_list_options_minimum');
    });

    it('adds a row with an operator compatible with its discovered property', async () => {
        const runtime = createPanelConditionsRuntime({
            name: 'compatible_operator_conditions',
            intentPrefix: 'compatible.operator.conditions',
            domain: 'communication',
            defaultSource: 'runtime',
            defaultProperty: 'runtime.online',
            defaultOperator: 'contains',
            properties: [{
                value: 'runtime.online',
                label: 'online',
                source: 'runtime',
                field: 'online',
                type: 'boolean',
                operators: ['eq', 'ne']
            }],
            operators: [
                { value: 'contains', label: 'contains' },
                { value: 'eq', label: 'is equal to' },
                { value: 'ne', label: 'is not equal to' }
            ]
        });
        const context = { candidates: [], refresh: () => {} };
        await runtime.handle({ type: 'compatible.operator.conditions.toggle' }, context);
        await runtime.handle({ type: 'compatible.operator.conditions.add' }, context);
        expect(runtime.readState().rows.map((row) => row.operator)).toEqual(['eq', 'eq']);
        expect(() => runtime.buildNode(runtime.readState(), 420, () => {})).not.toThrow();
    });

    it('uses the same Conditions runtime for Communication recipient targeting', () => {
        const runtime = createPanelConditionsRuntime({
            name: 'comm_conditions_test', intentPrefix: 'comm.conditions', domain: 'communication',
            defaultSource: 'contact', caseInsensitive: true,
            properties: [{ value: 'contact.vehicle.color', source: 'contact', field: 'vehicle.color', type: 'string' }],
            operators: [{ value: 'eq', label: 'is' }]
        });
        runtime.setDocument({ source: 'contact', field: 'vehicle.color', operator: 'eq', value: 'red' });
        const contacts = [
            { id: 'a', vehicle: { color: 'red' } },
            { id: 'b', vehicle: { color: 'blue' } }
        ];
        expect(runtime.filter(contacts).map((entry) => entry.id)).toEqual(['a']);
    });

    it('keeps Communication Conditions independent and discovers properties without a local catalogue', async () => {
        const previousAtome = globalThis.atome;
        try {
            globalThis.atome = { conditions: {
                registry: { operators: () => [{ id: 'contains', label: 'contains' }] },
                properties: { discover: async () => [
                    { value: 'contact.vehicle.color', label: 'Vehicle color', source: 'contact', field: 'vehicle.color', type: 'string' },
                    { value: 'contact.profile.weight', label: 'Weight', source: 'contact', field: 'profile.weight', type: 'number' }
                ] },
                lists: { list: async () => [] },
                query: { watch: async () => null }
            } };
            commRuntime.reset();
            const emitted = [];
            const context = { refresh: () => {}, patchText: () => {} };
            let content = commSurface.buildContent(commSurface.readState(), {
                bodyWidth: 480,
                emit: (intent) => emitted.push(intent)
            });
            const advanced = content.find((entry) => entry.id === 'comm_advanced');
            const conditions = content.find((entry) => entry.id === 'comm_conditions');
            expect(advanced).toBeTruthy();
            expect(conditions).toBeTruthy();
            expect(findNode(advanced, 'comm_conditions')).toBeNull();

            findNode(conditions, 'comm_conditions_header').on.activate();
            await commSurface.handleEvent(emitted.shift(), context);
            await new Promise((resolve) => setTimeout(resolve, 0));
            content = commSurface.buildContent(commSurface.readState(), {
                bodyWidth: 480,
                emit: (intent) => emitted.push(intent)
            });
            const add = findNode(content.find((entry) => entry.id === 'comm_conditions'), 'comm_conditions_add');
            expect(add).toBeTruthy();
            add.on.press();
            await commSurface.handleEvent(emitted.shift(), context);
            expect(commSurface.readState().conditions.rows).toHaveLength(2);
            const row = commSurface.readState().conditions.rows[0];
            await commSurface.handleEvent({
                type: 'comm.conditions.menu', id: row.id, part: 'property'
            }, context);
            content = commSurface.buildContent(commSurface.readState(), {
                bodyWidth: 480,
                emit: (intent) => emitted.push(intent)
            });
            const conditionsTree = content.find((entry) => entry.id === 'comm_conditions');
            const serialized = JSON.stringify(conditionsTree);
            expect(serialized).toContain('Vehicle color');
            expect(serialized).toContain('Weight');
            expect(serialized).not.toContain('Distance');
        } finally {
            globalThis.atome = previousAtome;
        }
    });

    it('opens immediately while remote property discovery is still pending', async () => {
        const previousAtome = globalThis.atome;
        let releaseDiscovery;
        try {
            globalThis.atome = { conditions: {
                registry: { operators: () => [{ id: 'eq', label: 'is' }] },
                properties: { discover: (options) => options.authority === 'local'
                    ? Promise.resolve([])
                    : new Promise((resolve) => { releaseDiscovery = resolve; }) },
                lists: { list: async () => [] },
                query: { watch: async () => null }
            } };
            const runtime = createPanelConditionsRuntime({
                name: 'pending_conditions', intentPrefix: 'pending.conditions', domain: 'communication',
                defaultSource: 'contact'
            });
            const opening = runtime.handle({ type: 'pending.conditions.toggle' }, {
                discoverRemote: true,
                refresh: () => {}
            });
            await opening;
            expect(runtime.readState().open).toBe(true);
            expect(runtime.readState().discoveryPending).toBe(true);
            releaseDiscovery([{ value: 'contact.width', label: 'Width', source: 'contact', field: 'width', type: 'number' }]);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(runtime.readState().discoveryPending).toBe(false);
        } finally {
            globalThis.atome = previousAtome;
        }
    });

    it('keeps local live/schema properties when remote discovery is unavailable', async () => {
        const previousAtome = globalThis.atome;
        try {
            globalThis.atome = { conditions: {
                registry: { operators: () => [{ id: 'eq', label: 'is' }] },
                properties: { discover: async (options) => {
                    if (options.authority === 'remote') throw new Error('condition_remote_unavailable');
                    return [{ value: 'contact.width', label: 'Width', source: 'contact', field: 'width', type: 'number' }];
                } },
                lists: { list: async () => [] },
                query: { watch: async () => null }
            } };
            const runtime = createPanelConditionsRuntime({
                name: 'combined_conditions', intentPrefix: 'combined.conditions', domain: 'communication',
                defaultSource: 'contact'
            });
            await runtime.handle({ type: 'combined.conditions.toggle' }, {
                discoverRemote: true,
                refresh: () => {}
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
            await runtime.handle({ type: 'combined.conditions.add' }, { refresh: () => {} });
            expect(runtime.readState().rows[0]).toMatchObject({
                source: 'contact', field: 'width', propertyDraft: 'Width', propertyDirty: false
            });
            expect(runtime.readState().discoveryError).toBe('');
        } finally {
            globalThis.atome = previousAtome;
        }
    });

    it('round-trips Calendar conditions through canonical event particles', () => {
        const conditions = {
            schemaVersion: 1,
            root: { source: 'runtime', field: 'online', operator: 'eq', value: true }
        };
        const event = normalizeEvent({
            id: 'event_conditions',
            title: 'Online event',
            start: '2026-08-13T20:00:00.000Z',
            conditions
        });
        const particles = buildEventParticles(event);
        expect(JSON.parse(particles.conditions)).toEqual(conditions);
        expect(normalizeEvent({ id: event.id, properties: particles }).conditions).toEqual(conditions);
    });
});
