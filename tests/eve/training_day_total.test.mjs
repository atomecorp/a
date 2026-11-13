// R-137 (13 Nov. 2026): the day's exercise time, every activity counted once.
import { expect, test } from 'vitest';
import { trainingDayTotal, trainingLocalDay } from '../../eVe/domains/training/training_day_total.js';

const at = (hour, minute = 0) => new Date(2026, 10, 13, hour, minute).toISOString();

test('sessions, practices and imports of the day add up; an import of the same session counts once', () => {
    const day = trainingLocalDay(at(12));
    const total = trainingDayTotal({ day,
        sessions: [{ session_id: 's1', exercise_id: 'sprint_hiit', status: 'completed', start: at(8), end: at(8, 30), active_minutes: 25 },
            { session_id: 's2', exercise_id: 'biceps_curl', status: 'stopped', start: at(18), end: at(18, 12), active_minutes: 10 },
            { session_id: 'old', exercise_id: 'biceps_curl', status: 'completed', start: new Date(2026, 10, 12, 9).toISOString(), end: new Date(2026, 10, 12, 9, 20).toISOString(), active_minutes: 20 }],
        practices: [{ log_id: 'p1', discipline_id: 'yoga', started_at: at(12), totals: { active_s: 900 } }],
        imported: [{ source_id: 'strava_same', sport: 'Run', start: at(8, 5), end: at(8, 28), moving_s: 1300 },
            { source_id: 'strava_walk', sport: 'Walk', start: at(16), end: at(16, 40), moving_s: 1800 }] });
    expect(total.minutes).toBe(25 + 10 + 15 + 30);
    expect(total.items.map(item => item.id)).toEqual(['s1', 'p1', 'strava_walk', 's2']);
});

test('nothing done reads zero', () => {
    expect(trainingDayTotal({ day: '2026-11-13' })).toEqual({ day: '2026-11-13', minutes: 0, seconds: 0, items: [] });
});
