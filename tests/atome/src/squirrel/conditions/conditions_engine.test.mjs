import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    CONDITION_STATES,
    createConditionEngine,
    createConditionRegistry,
    createConditionService
} from '../../../../../atome/src/squirrel/conditions/index.js';

const createFixture = () => {
    const registry = createConditionRegistry();
    registry.registerProperty({ source: 'atome', field: 'color', type: 'string' });
    registry.registerProperty({ source: 'atome', field: 'width', type: 'number' });
    registry.registerProperty({ source: 'profile', field: 'phone', type: 'string' });
    registry.registerProperty({
        source: 'location',
        field: 'distance',
        type: 'number',
        resolve: (context) => context.locationPermission === 'granted'
            ? { available: true, value: context.distance }
            : { available: false, reasonCode: 'location_permission_denied' }
    });
    return { registry, engine: createConditionEngine({ registry }) };
};

test('conditions evaluate typed leaves and nested three-state groups', async () => {
    const { engine } = createFixture();
    const set = {
        root: {
            combinator: 'and',
            children: [
                { source: 'atome', field: 'color', operator: 'eq', value: 'red' },
                {
                    combinator: 'or',
                    children: [
                        { source: 'atome', field: 'width', operator: 'gte', value: 200 },
                        { source: 'profile', field: 'phone', operator: 'exists' }
                    ]
                }
            ]
        }
    };
    assert.equal((await engine.evaluate(set, { atome: { color: 'red', width: 220 }, profile: {} })).state, CONDITION_STATES.TRUE);
    assert.equal((await engine.evaluate(set, { atome: { color: 'blue', width: 220 }, profile: {} })).state, CONDITION_STATES.FALSE);
    assert.equal((await engine.evaluate(set, { atome: { color: 'red' }, profile: {} })).state, CONDITION_STATES.UNKNOWN);
});

test('unknown data never matches and security domains deny', async () => {
    const { engine } = createFixture();
    const condition = { source: 'location', field: 'distance', operator: 'lte', value: 20 };
    const evaluation = await engine.evaluate(condition, { locationPermission: 'denied' });
    assert.equal(evaluation.state, CONDITION_STATES.UNKNOWN);
    assert.equal(evaluation.reasonCode, 'location_permission_denied');
    const acl = await engine.match(condition, { locationPermission: 'denied' }, { domain: 'acl' });
    assert.equal(acl.policy, 'deny');
    assert.equal(acl.decision, 'deny');
    assert.equal(acl.matched, false);
    const automation = await engine.match(condition, { locationPermission: 'denied' }, { domain: 'automation' });
    assert.equal(automation.decision, 'wait');
});

test('typed equality and existence operators preserve their declared semantics', async () => {
    const registry = createConditionRegistry();
    registry.registerProperty({ source: 'profile', field: 'age', type: 'number' });
    registry.registerProperty({ source: 'profile', field: 'nickname', type: 'string' });
    const engine = createConditionEngine({ registry });

    assert.equal((await engine.evaluate({ source: 'profile', field: 'age', operator: 'eq', value: '42' }, { profile: { age: 42 } })).state, 'true');
    assert.equal((await engine.evaluate({ source: 'profile', field: 'nickname', operator: 'exists' }, { profile: {} })).state, 'false');
    assert.equal((await engine.evaluate({ source: 'profile', field: 'nickname', operator: 'not_exists' }, { profile: {} })).state, 'true');
});

test('synchronous evaluation keeps a 10k-item focused filter bounded', () => {
    const registry = createConditionRegistry();
    registry.registerProperty({ source: 'record', field: 'score', type: 'number' });
    const engine = createConditionEngine({ registry });
    const condition = { source: 'record', field: 'score', operator: 'gte', value: 5000 };
    const startedAt = performance.now();
    let matches = 0;
    for (let score = 0; score < 10000; score += 1) {
        if (engine.matchSync(condition, { record: { score } }, { domain: 'search' }).matched) matches += 1;
    }
    const elapsedMs = performance.now() - startedAt;
    assert.equal(matches, 5000);
    assert.ok(elapsedMs < 1000, `focused Conditions evaluation took ${elapsedMs.toFixed(1)}ms`);
});

test('unknown properties, operators and malformed groups fail validation', () => {
    const { engine } = createFixture();
    assert.equal(engine.validate({ source: 'atome', field: 'secret', operator: 'eq', value: true }).ok, false);
    assert.equal(engine.validate({ source: 'atome', field: 'color', operator: 'execute', value: 'red' }).ok, false);
    assert.equal(engine.validate({ combinator: 'not', children: [] }).ok, false);
});

test('watch observes declared dependencies and cleans up idempotently', async () => {
    const { engine } = createFixture();
    let color = 'red';
    let rerun = null;
    let unsubscribeCount = 0;
    const states = [];
    const context = {
        atome: { get color() { return color; } },
        subscribeDependencies(dependencies, callback) {
            assert.deepEqual(dependencies, ['atome.color']);
            rerun = callback;
            return () => { unsubscribeCount += 1; };
        }
    };
    const watcher = await engine.watch(
        { source: 'atome', field: 'color', operator: 'eq', value: 'red' },
        context,
        (next) => states.push(next.state)
    );
    assert.deepEqual(states, [CONDITION_STATES.TRUE]);
    color = 'blue';
    await rerun();
    assert.deepEqual(states, [CONDITION_STATES.TRUE, CONDITION_STATES.FALSE]);
    assert.equal(watcher.unsubscribe(), true);
    assert.equal(watcher.unsubscribe(), false);
    assert.equal(unsubscribeCount, 1);
});

test('saved sets use canonical commits, live revisions and security reauthorization', async () => {
    const { registry } = createFixture();
    const commits = [];
    const service = createConditionService({
        registry,
        commit: async (event) => { commits.push(event); return { ok: true }; }
    });
    const base = await service.sets.save({
        id: 'condition_set_red',
        name: 'Red objects',
        root: { source: 'atome', field: 'color', operator: 'eq', value: 'red' }
    });
    assert.equal(base.revision, 1);
    assert.equal(commits[0].type, 'condition_set');
    await service.bindings.attach({
        id: 'binding_acl_red',
        conditionSetId: base.id,
        domain: 'acl',
        target: { atomeId: 'shape_1', propertyPath: 'color', operation: 'read' }
    }, { authorized: true });
    assert.equal((await service.bindings.evaluate('binding_acl_red', { atome: { color: 'red' } })).decision, 'allow');
    await assert.rejects(
        service.sets.save({ ...base, name: 'Red items' }),
        /condition_set_reauthorization_required/
    );
    const updated = await service.sets.save({ ...base, name: 'Red items' }, { authorized: true });
    assert.equal(updated.revision, 2);
    assert.equal(service.bindings.list(base.id)[0].authorizedRevision, 2);
    assert.equal((await service.bindings.evaluate('binding_acl_red', { atome: { color: 'red' } })).decision, 'allow');
    await assert.rejects(service.sets.remove(base.id), /condition_set_in_use/);
});

test('saved sets and bindings hydrate after a service reload', async () => {
    const { registry } = createFixture();
    const persisted = new Map();
    const commit = async (event) => {
        if (event.kind === 'delete') persisted.delete(event.atome_id);
        else persisted.set(event.atome_id, {
            atome_id: event.atome_id,
            atome_type: event.type,
            properties: { ...event.props, type: event.type }
        });
        return { ok: true };
    };
    const first = createConditionService({ registry, commit });
    await first.sets.save({
        id: 'condition_set_reloaded',
        name: 'Reloaded set',
        root: { source: 'atome', field: 'color', operator: 'eq', value: 'red' }
    });
    await first.bindings.attach({
        id: 'binding_reloaded',
        conditionSetId: 'condition_set_reloaded',
        domain: 'search',
        target: { finder: 'all' }
    });

    const reloaded = createConditionService({
        registry,
        commit,
        read: async (id) => persisted.get(id) || null,
        list: async () => Array.from(persisted.values())
    });
    assert.equal((await reloaded.sets.get('condition_set_reloaded')).name, 'Reloaded set');
    assert.equal((await reloaded.bindings.load('condition_set_reloaded'))[0].id, 'binding_reloaded');
    await assert.rejects(reloaded.sets.remove('condition_set_reloaded'), /condition_set_in_use/);
});

test('a computed-property provider outage does not hide independent discovered properties', async () => {
    const registry = createConditionRegistry();
    registry.registerProperty({ source: 'contact', field: 'width', type: 'number', label: 'Width' });
    const providerErrors = [];
    const service = createConditionService({
        registry,
        list: async () => { throw new Error('remote_account_not_provisioned'); }
    });
    const properties = await service.properties.discover({
        source: 'contact',
        scope: { candidateSource: 'contact' },
        candidates: [],
        authority: 'local',
        onProviderError: (entry) => providerErrors.push(entry)
    });
    assert.equal(properties.some((entry) => entry.source === 'contact' && entry.field === 'width'), true);
    assert.equal(providerErrors[0]?.provider, 'computed');
});
