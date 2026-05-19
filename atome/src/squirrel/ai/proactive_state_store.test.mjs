import assert from 'node:assert/strict';

import { createProactiveStateStore } from './proactive_state_store.js';

const store = createProactiveStateStore();

store.clear();

store.setEnabled(true);
store.setStartupBriefingEnabled(true);
store.setDomainPreference('calendar', { cooldown_ms: 120000 });
store.recordDelivery('calendar', new Date('2026-03-25T09:00:00Z'));
store.snoozeDomain('calendar', '2026-03-25T10:00:00Z');

const state = store.load();

assert.equal(state.enabled, true, 'proactive state store should persist the global enable flag');
assert.equal(state.startup_briefing_enabled, true, 'proactive state store should persist startup briefing enablement');
assert.equal(state.domain_preferences?.calendar?.cooldown_ms, 120000, 'proactive state store should persist domain preferences');
assert.equal(state.cooldown_by_domain?.calendar, '2026-03-25T09:00:00.000Z', 'proactive state store should persist delivery cooldown timestamps');
assert.equal(state.snoozed_until_by_domain?.calendar, '2026-03-25T10:00:00Z', 'proactive state store should persist snoozes');

console.log('proactive_state_store.test: PASS');
