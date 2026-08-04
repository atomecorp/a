import assert from 'node:assert/strict';

import { createMcpCommunicationHandlers } from '../../../../../atome/src/squirrel/atome/mcp_handlers_communication.js';
import { resolveAccessPolicy, resolveRateLimitRule } from '../../../../../atome/src/squirrel/atome/mcp_security_policy.js';

const previousApi = globalThis.CalendarAPI;
const calls = [];
globalThis.CalendarAPI = {
    shareCalendar(params) { calls.push(['share', params]); return { ok: true }; },
    exportWebcal(params) { calls.push(['export', params]); return { ok: true, ics: 'BEGIN:VCALENDAR' }; }
};

const handlers = createMcpCommunicationHandlers();
assert.equal(typeof handlers['calendar.share'], 'function', 'MCP ledger exposes the existing share command');
assert.equal(typeof handlers['calendar.export_webcal'], 'function', 'MCP ledger exposes the existing ICS command');
await handlers['calendar.share']({ phone: '+33123456789' });
await handlers['calendar.export_webcal']({ calendarId: 'default' });
assert.deepEqual(calls.map(([kind]) => kind), ['share', 'export']);

const sharePolicy = resolveAccessPolicy('calendar.share', {});
assert.equal(sharePolicy.confirmation_required, true, 'calendar sharing remains confirmation-gated');
assert.deepEqual(sharePolicy.required_capabilities, ['calendar.write', 'share.write']);
assert.equal(resolveRateLimitRule('calendar.share')?.id, 'calendar.write');

if (previousApi === undefined) delete globalThis.CalendarAPI;
else globalThis.CalendarAPI = previousApi;

console.log('mcp_calendar_completion: ok');
