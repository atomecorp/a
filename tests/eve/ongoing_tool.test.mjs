// The « en cours » tool (dashboard_ongoing_tool.js, user request of 2 Nov. 2026): its touch goes straight back to the one
// activity under way (its card, the same session), reaching the Dashboard first from a view that is not it; several under
// way, « En direct » lists them; an activity that ended is no longer under way.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ongoingActivityChanged, registerOngoingActivity } from '../../eVe/domains/programs/activity_ongoing.js';
import { anchorOngoingTool, openOngoingTool, ongoingToolRect } from '../../eVe/domains/dashboard/dashboard_ongoing_tool.js';

const activity = (key, calls) => {
    let live = true;
    const entry = { key, active: () => live, open: () => { calls.push(`open:${key}`); return { ok: true }; }, ring: () => null };
    registerOngoingActivity(entry);
    return { end: () => { live = false; ongoingActivityChanged(); } };
};

test('one activity under way: the touch reaches the Dashboard, then opens that activity', async () => {
    const calls = [];
    const release = anchorOngoingTool({ visible: () => true, box: () => null, reach: async () => { calls.push('reach'); }, openAll: () => calls.push('all') });
    const sport = activity('sport_one', calls);
    await openOngoingTool();
    assert.deepEqual(calls, ['reach', 'open:sport_one']);
    sport.end(); release();
});

test('several under way: « En direct » lists them; none shown without a view', async () => {
    const calls = [];
    const release = anchorOngoingTool({ visible: () => true, box: () => null, openAll: () => { calls.push('all'); return { ok: true }; } });
    const one = activity('first', calls), two = activity('second', calls);
    await openOngoingTool();
    assert.deepEqual(calls, ['all']);
    one.end(); two.end(); release();
    assert.equal(ongoingToolRect(), null);
    assert.deepEqual(await openOngoingTool(), { ok: false, error: 'dashboard_ongoing_view_missing' });
});
