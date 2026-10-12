import { test, expect, vi, afterEach } from 'vitest';
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/session.js', () => ({ getSessionState: () => ({ mode: 'authenticated', user: { id: 'owner' } }) }));
vi.mock('../../atome/src/squirrel/atome/mcp.js', () => ({ handleAtomeMCPRequestAsync: vi.fn(async () => ({ result: { ok: true } })) }));
import { CalendarAPI } from '../../eVe/intuition/tools/calendar_api.js';
import { eventCache, alarmTimers } from '../../eVe/intuition/tools/calendar_engine_state.js';
import { resolveActorProfile } from '../../atome/src/squirrel/atome/mcp_security.js';
import { handleAtomeMCPRequestAsync } from '../../atome/src/squirrel/atome/mcp.js';
afterEach(() => { for (const timers of alarmTimers.values()) timers.forEach(clearTimeout); alarmTimers.clear(); eventCache.clear(); vi.useRealTimers(); vi.clearAllMocks(); delete globalThis.window; });
const install = () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-10T10:00:00Z'));
    const records = new Map();
    globalThis.window = { Atome: {
        commit: vi.fn(async payload => {
            const previous = records.get(payload.atome_id);
            records.set(payload.atome_id, { ...previous, atome_id: payload.atome_id, type: payload.type || previous?.type,
                project_id: payload.project_id || previous?.project_id, properties: { ...previous?.properties, ...payload.props } });
            return { ok: true };
        }),
        getStateCurrent: async id => records.get(id) || null
    } };
};
test('approved timeline defaults preserve explicitly restricted actors', () => {
    expect(resolveActorProfile().capabilities).toEqual(expect.arrayContaining(['timeline.read', 'timeline.write']));
    expect(resolveActorProfile({ actor: { capabilities: ['calendar.read'] } }).capabilities).toEqual(['calendar.read']);
});
test('agenda countdown persists before a single MCP dispatch and cancellation retains event', async () => {
    install();
    const alarm = await CalendarAPI.setAlarm({ projectId: 'project', title: 'Alarm', delay_ms: 2000,
        command: { tool_id: 'ui.project.transport', input: { operation: 'stop' } } });
    expect(alarm.ok).toBe(true);
    expect((await CalendarAPI.readAlarms({ eventId: alarm.eventId })).items[0].remaining_ms).toBe(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(handleAtomeMCPRequestAsync).toHaveBeenCalledTimes(1);
    expect(handleAtomeMCPRequestAsync.mock.calls[0][0].params).toMatchObject({ actor: { user_id: 'owner' }, tool_id: 'ui.project.transport' });
    const event = eventCache.get(alarm.eventId);
    expect(event.alarms[0].firedAt).toBeTruthy();
    CalendarAPI.scheduleAlarmsForEvent(event);
    await vi.advanceTimersByTimeAsync(10000);
    expect(handleAtomeMCPRequestAsync).toHaveBeenCalledTimes(1);
    await CalendarAPI.cancelAlarm({ eventId: alarm.eventId });
    expect(eventCache.get(alarm.eventId).alarms).toEqual([]);
});
test('cancelled and distant alarms never fire early', async () => {
    install();
    const alarm = await CalendarAPI.setAlarm({ title: 'Later', delay_ms: 3000000000, command: { tool_id: 'ui.project.transport' } });
    await vi.advanceTimersByTimeAsync(2147483647);
    expect(handleAtomeMCPRequestAsync).not.toHaveBeenCalled();
    await CalendarAPI.cancelAlarm({ eventId: alarm.eventId, alarmId: alarm.alarmId });
    await vi.advanceTimersByTimeAsync(1000000000);
    expect(handleAtomeMCPRequestAsync).not.toHaveBeenCalled();
});
