import assert from 'node:assert/strict';

import {
    layoutCalendarEvents,
    layoutMonthEvents,
    projectCalendarRange,
    quickCalendarDraft,
    resizeCalendarEvent,
    shiftCalendarEvent
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_projection.js';

const anchor = new Date('2026-08-03T12:00:00.000Z');
const events = [{
    id: 'event_a', title: 'A', start: new Date('2026-08-03T09:00:00.000Z'),
    end: new Date('2026-08-03T10:30:00.000Z'), allDay: false
}, {
    id: 'event_b', title: 'B', start: new Date('2026-08-03T09:30:00.000Z'),
    end: new Date('2026-08-03T11:00:00.000Z'), allDay: false
}, {
    id: 'event_all_day', title: 'All day', start: new Date('2026-08-04T00:00:00.000Z'),
    end: new Date('2026-08-05T00:00:00.000Z'), allDay: true
}];

const month = projectCalendarRange({ view: 'month', anchor, locale: 'fr-FR' });
assert.equal(month.days.length, 42, 'month projection keeps a bounded six-week grid');
assert.equal(month.days[0].date.getDay(), 1, 'French month projection starts on Monday');

const monthDraft = quickCalendarDraft({
    view: 'month', range: month, date: new Date(2026, 7, 12), allDay: true
});
assert.equal(monthDraft.start.getHours(), 0, 'month quick-create starts at local midnight');
assert.equal(monthDraft.end.getDate(), 13, 'month quick-create ends on the next local calendar day');
assert.equal(monthDraft.allDay, true);

const daylightSavingDraft = quickCalendarDraft({
    view: 'month', range: month, date: new Date(2026, 2, 29, 12), allDay: true
});
assert.deepEqual(
    [daylightSavingDraft.start.getFullYear(), daylightSavingDraft.start.getMonth(), daylightSavingDraft.start.getDate()],
    [2026, 2, 29],
    'all-day quick-create preserves the selected local date across a daylight-saving boundary'
);
assert.deepEqual(
    [daylightSavingDraft.end.getFullYear(), daylightSavingDraft.end.getMonth(), daylightSavingDraft.end.getDate()],
    [2026, 2, 30],
    'all-day quick-create advances by one local calendar day across a daylight-saving boundary'
);

const week = projectCalendarRange({ view: 'week', anchor, locale: 'fr-FR' });
const layout = layoutCalendarEvents({ events, range: week, width: 700, hourHeight: 48 });
assert.equal(layout.timed.length, 2, 'week layout projects timed events');
assert.equal(layout.allDay.length, 1, 'week layout keeps a separate all-day lane');
assert.equal(layout.timed[0].columnCount, 2, 'overlapping events share a deterministic column group');
assert.notEqual(layout.timed[0].x, layout.timed[1].x, 'overlapping events have distinct hit rectangles');
assert.ok(layout.hitZones.every((zone) => zone.eventId), 'every projected event owns a renderer-neutral hit zone');

const weekDraft = quickCalendarDraft({
    view: 'week', range: week, width: 742, x: 42 + 150, y: (9.4 * 48), hourHeight: 48
});
assert.equal(weekDraft.start.getMinutes(), 30, 'time-grid quick-create snaps to the nearest fifteen minutes');
assert.equal(weekDraft.end - weekDraft.start, 60 * 60000, 'time-grid quick-create defaults to one hour');
assert.equal(weekDraft.start.getDate(), week.days[1].date.getDate(), 'horizontal position selects the canonical range day');
assert.equal(quickCalendarDraft({ view: 'week', range: week, width: 742, x: 20, y: 100 }), null, 'time gutter does not create events');

const spanning = layoutMonthEvents({
    events: [{
        id: 'month_span', title: 'Span', allDay: true,
        start: new Date(2026, 7, 2), end: new Date(2026, 7, 5)
    }],
    range: month,
    width: 700,
    cellHeight: 88
});
assert.equal(spanning.segments.length, 2, 'an all-day event crossing a week boundary uses two continuous segments');
assert.equal(spanning.segments[0].first, true, 'only the true beginning owns the start handle');
assert.equal(spanning.segments[0].last, false);
assert.equal(spanning.segments[1].first, false);
assert.equal(spanning.segments[1].last, true, 'only the true ending owns the end handle');

const shifted = shiftCalendarEvent(events[0], { days: 1, minutes: 30 });
assert.equal(shifted.start.toISOString(), '2026-08-04T09:30:00.000Z');
assert.equal(shifted.end.toISOString(), '2026-08-04T11:00:00.000Z');

const resized = resizeCalendarEvent(events[0], { minutes: -120 });
assert.equal(resized.end.toISOString(), '2026-08-03T09:15:00.000Z', 'resize enforces the minimum duration');

const shiftedAllDay = shiftCalendarEvent(events[2], { days: 1, minutes: 90 });
assert.equal(shiftedAllDay.start.toISOString(), '2026-08-05T00:00:00.000Z', 'all-day drag ignores vertical minute movement');
assert.equal(shiftedAllDay.end.toISOString(), '2026-08-06T00:00:00.000Z');
const resizedAllDay = resizeCalendarEvent(events[2], { days: 2, edge: 'end' });
assert.equal(resizedAllDay.end.toISOString(), '2026-08-07T00:00:00.000Z', 'all-day resize follows horizontal day movement');

console.log('calendar_projection_contract: ok');
