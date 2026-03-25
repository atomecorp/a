import assert from 'node:assert/strict';

import {
    buildStartupBriefing,
    evaluateProactiveNotifications,
    coalesceProactiveNotifications
} from './proactive_scheduler.js';
import { createProactiveStateStore } from './proactive_state_store.js';

const calls = [];
const proactiveState = createProactiveStateStore();
proactiveState.clear();
proactiveState.setEnabled(true);
proactiveState.setStartupBriefingEnabled(true);

const toolRouter = {
    async execute(request = {}) {
        calls.push(`${request.domain}:${request.operation}`);
        if (request.domain === 'mail') {
            return {
                ok: true,
                domain: 'mail',
                items: [{ message_id: 'mail_1' }, { message_id: 'mail_2' }],
                stats: { unread: 2 }
            };
        }
        return {
            ok: true,
            domain: 'calendar',
            items: [{ id: 'event_1', title: 'Point Paul', start_at: '2026-03-25T10:00:00Z' }]
        };
    }
};

const briefing = await buildStartupBriefing({
    toolRouter,
    proactiveState,
    locale: 'fr-FR'
});

assert.equal(briefing.ok, true, 'startup briefing should assemble real tool results');
assert.match(briefing.text, /2 mail\(s\) non lu\(s\)/i, 'startup briefing should mention unread mail count');
assert.equal(calls.includes('mail:list'), true, 'startup briefing should use the mail tool path');
assert.equal(calls.includes('calendar:list'), true, 'startup briefing should use the calendar tool path');

const triggers = evaluateProactiveNotifications({
    now: new Date('2026-03-25T09:52:00Z'),
    locale: 'fr-FR',
    proactiveState,
    events: [{
        id: 'event_soon_1',
        title: 'Point Paul',
        start_at: '2026-03-25T10:00:00Z'
    }]
});

assert.equal(triggers.length, 1, 'meeting alerts should fire when the event is close');
assert.match(triggers[0].text, /commence dans/i, 'meeting alerts should produce a human-readable proactive message');

proactiveState.recordDelivery('calendar', new Date('2026-03-25T09:50:00Z'));
const cooldownSuppressed = evaluateProactiveNotifications({
    now: new Date('2026-03-25T09:52:00Z'),
    locale: 'fr-FR',
    proactiveState,
    events: [{
        id: 'event_soon_1',
        title: 'Point Paul',
        start_at: '2026-03-25T10:00:00Z'
    }]
});

assert.equal(cooldownSuppressed.length, 0, 'calendar cooldown should suppress repeated proactive alerts');

proactiveState.snoozeDomain('calendar', '2026-03-25T10:30:00Z');
const snoozed = evaluateProactiveNotifications({
    now: new Date('2026-03-25T09:58:00Z'),
    locale: 'fr-FR',
    proactiveState,
    cooldownByDomain: { calendar: 0 },
    events: [{
        id: 'event_soon_2',
        title: 'Dentiste',
        start_at: '2026-03-25T10:00:00Z'
    }]
});

assert.equal(snoozed.length, 0, 'snoozed domains should suppress proactive alerts');

const coalesced = coalesceProactiveNotifications([
    { type: 'meeting_soon', domain: 'calendar', confidence: 0.95, priority: 1, text: 'Meeting soon.' },
    { type: 'startup_briefing', domain: 'mail', confidence: 0.9, priority: 0.9, text: '2 unread mails.' }
], { locale: 'en-US' });

assert.equal(coalesced.length, 1, 'multiple close proactive triggers should coalesce');
assert.match(coalesced[0].text, /Meeting soon\./, 'coalesced trigger should preserve the highest-priority text');

const disabledState = createProactiveStateStore();
disabledState.clear();
const disabledBriefing = await buildStartupBriefing({
    toolRouter,
    proactiveState: disabledState,
    locale: 'fr-FR'
});

assert.equal(disabledBriefing.skipped, true, 'startup briefing should remain opt-in by default');

console.log('proactive_scheduler.test: PASS');
process.exit(0);
