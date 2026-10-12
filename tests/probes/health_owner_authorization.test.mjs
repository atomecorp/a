import { expect, test } from 'vitest';
import { createHealthOwner } from '../../atome/src/squirrel/health/health_owner.js';

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
function setup(handler) {
    const calls = [];
    const channel = {
        host: 'ios', isOpen: () => true,
        call: async (command, payload) => {
            calls.push({ command, payload });
            const handled = await handler?.(command, payload);
            if (handled) return handled;
            if (command === 'health_link_status') return { ok: true, result: { linked: true } };
            if (command === 'health_request_access') return { ok: true, result: { completed: true } };
            return { ok: true, result: {} };
        }
    };
    const owner = createHealthOwner({ channel, getAccountId: () => 'A', pollMs: 1e9 });
    return { owner, calls };
}

test('completed false is an explicit failure with its original native reason', async () => {
    const { owner } = setup(command => command === 'health_request_access' && ({ ok: true, result: { completed: false, error: 'store_locked' } }));
    expect(await owner.requestAccess(['steps'])).toMatchObject({ ok: false, completed: false, error: 'store_locked' });
    owner.seal();
});

test('bridge failure remains explicit and does not poison subsequent access requests', async () => {
    let failed = true;
    const { owner } = setup(command => command === 'health_request_access' && failed && ({ ok: false, error: 'health_channel_invalid' }));
    expect(await owner.requestAccess(['steps'])).toMatchObject({ ok: false, error: 'health_channel_invalid' });
    failed = false;
    expect(await owner.requestAccess(['steps'])).toMatchObject({ ok: true });
    owner.seal();
});

test('concurrent central access calls merge the catalog into one native call', async () => {
    const { owner, calls } = setup();
    await Promise.all([owner.requestAccess(['steps']), owner.requestAccess(['weight']), owner.requestAccess(['heart_rate'])]);
    const requests = calls.filter(c => c.command === 'health_request_access');
    expect(requests).toHaveLength(1);
    expect(requests[0].payload.monitors.sort()).toEqual(['heart_rate', 'steps', 'weight']);
    owner.seal();
});

test('a pre-authorization permission reply is discarded and followed by a fresh read', async () => {
    let release;
    let readCount = 0;
    const { owner } = setup(command => {
        if (command !== 'health_read') return;
        readCount++;
        if (readCount === 1) return new Promise(resolve => { release = () => resolve({ ok: true, result: { results: { steps: { status: 'permission_required' } } } }); });
        return { ok: true, result: { results: { steps: { status: 'ok', hasData: true, value: 123 } } } };
    });
    const states = [];
    const unsubscribe = owner.subscribe('steps', reading => states.push(reading.state));
    await settle();
    await owner.requestAccess(['steps']); await settle();
    release(); await settle();
    expect(states).not.toContain('needs_permission');
    expect(owner.reading('steps')).toMatchObject({ state: 'value', value: 123 });
    expect(readCount).toBe(2);
    unsubscribe(); owner.seal();
});

test('partial access and empty results do not become a refusal', async () => {
    const { owner } = setup(command => command === 'health_read' && ({ ok: true, result: { results: {
        steps: { status: 'ok', hasData: true, value: 123 }, weight: { status: 'ok', hasData: false }
    } } }));
    const releaseSteps = owner.subscribe('steps', () => {});
    const releaseWeight = owner.subscribe('weight', () => {});
    await owner.requestAccess(['steps', 'weight']); await settle();
    expect(owner.reading('steps').state).toBe('value');
    expect(owner.reading('weight').state).toBe('no_data');
    releaseSteps(); releaseWeight(); owner.seal();
});

test('queued permissions cannot migrate to a different account or a sealed channel', async () => {
    const { owner, calls } = setup();
    const pending = owner.requestAccess(['steps']);
    owner.resetContext('B');
    expect(await pending).toMatchObject({ ok: false, error: 'health_context_changed' });
    expect(calls.filter(c => c.command === 'health_request_access')).toHaveLength(0);
    owner.seal();
    expect(await owner.requestAccess(['steps'])).toMatchObject({ ok: false });
});

test('capability discovery retries technical and unknown-status failures', async () => {
    let count = 0;
    const { owner } = setup(command => {
        if (command !== 'health_capabilities') return;
        count++;
        return { ok: true, result: { available: true, monitors: { steps: count === 1
            ? { supported: false, reason: 'health_authorization_status_unknown' }
            : { supported: true, access: 'not_determined' } } } };
    });
    expect((await owner.capabilities()).monitors.steps.reason).toBe('health_authorization_status_unknown');
    expect((await owner.capabilities()).monitors.steps.access).toBe('not_determined');
    expect(count).toBe(2);
    owner.seal();
});

test.each(['heart_rate', 'exercise_minutes', 'oxygen_saturation', 'steps'])('an invalidation during a pending %s read is drained without waiting for polling', async id => {
    let complete, count = 0;
    const target = new EventTarget();
    const channel = { host: 'ios', isOpen: () => true, call: async command => {
        if (command === 'health_link_status') return { ok: true, result: { linked: true } };
        if (command !== 'health_read') return { ok: true, result: {} };
        count++;
        const reply = value => ({ ok: true, result: { results: { [id]: {
            status: 'ok', hasData: true, value,
            samples: [{ value, start: 1000, end: 2000 + value }]
        } } } });
        return count === 1 ? new Promise(resolve => { complete = () => resolve(reply(60)); }) : reply(90);
    } };
    const owner = createHealthOwner({ channel, eventTarget: target, getAccountId: () => 'A', pollMs: 1e9 });
    const release = owner.subscribe(id, () => {});
    try {
        await settle();
        for (let i = 0; i < 3; i++) target.dispatchEvent(Object.assign(new Event('atome:native-health-invalidated'), { detail: { monitors: [id] } }));
        await settle();
        expect(count).toBe(1);
        complete(); await settle();
        expect(count).toBe(2);
        expect(owner.reading(id)).toMatchObject({ state: 'value', value: 90 });
    } finally { release(); owner.seal(); }
});

test('foreground return retries a read still pending from the background', async () => {
    let complete, count = 0;
    const doc = new EventTarget(); doc.visibilityState = 'visible';
    const channel = { host: 'ios', isOpen: () => true, call: async command => {
        if (command === 'health_link_status') return { ok: true, result: { linked: true } };
        if (command !== 'health_read') return { ok: true, result: {} };
        count++;
        const reply = value => ({ ok: true, result: { results: { exercise_minutes: { status: 'ok', hasData: true, value } } } });
        return count === 1 ? new Promise(resolve => { complete = () => resolve(reply(12)); }) : reply(18);
    } };
    const owner = createHealthOwner({ channel, documentRef: doc, getAccountId: () => 'A', pollMs: 1e9 });
    const release = owner.subscribe('exercise_minutes', () => {});
    try {
        await settle();
        doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
        expect(owner.stats().polling).toBe(false);
        doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
        await settle(); complete(); await settle();
        expect(count).toBe(2);
        expect(owner.reading('exercise_minutes')).toMatchObject({ state: 'value', value: 18 });
    } finally { release(); owner.seal(); }
});

test('re-reading an unchanged SpO2 sample preserves its measurement date until the source provides a new one', async () => {
    let sample = { value: .97, start: 1000, end: 2000 };
    const {owner} = setup(command => command === 'health_read' && ({ok:true,result:{results:{oxygen_saturation:{status:'ok',scale:'fraction',samples:[sample]}}}}));
    const release = owner.subscribe('oxygen_saturation',()=>{});
    try {
        await settle();
        expect(owner.reading('oxygen_saturation')).toMatchObject({state:'value',value:97,measuredTo:2000});
        owner.refresh(); await settle();
        expect(owner.reading('oxygen_saturation')).toMatchObject({value:97,measuredTo:2000});
        sample={value:.98,start:3000,end:4000};owner.refresh();await settle();
        expect(owner.reading('oxygen_saturation')).toMatchObject({value:98,measuredTo:4000});
    } finally {release();owner.seal();}
});
