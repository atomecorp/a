import { validateParams } from '../ai/agent_gateway_normalize.js';
import { DASHBOARD_OBJECTIVE_TARGET_SCHEMA, DASHBOARD_UNLOCK_SOURCES } from '../../shared/dashboard_progression_contract.js';
import { OBJECTIVE_EFFORT_SCHEMA, OBJECTIVE_MONEY_BUDGET_SCHEMA, OBJECTIVE_TIME_BUDGET_SCHEMA } from '../../shared/objective_settings_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the eVe Basic
// home grows with the user's health objectives. The home, its Objectives rubric
// and the monitor selector run through these commands too. A locked brick is only
// absent from the eVe Basic home: it never removes a capability, training.*,
// shopping.*, food.*, gps.* and every other tool stay callable by MCP, voice and
// panels at any tier. Counts only, never a health value.
const count = { type: 'number', minimum: 0 };
export const DASHBOARD_PROGRESSION_ERRORS = Object.freeze(['progression_actor_required', 'progression_context_changed',
    'progression_objective_required', 'progression_target_invalid', 'progression_monitor_unknown', 'progression_monitor_not_selected',
    'progression_commit_failed', 'progression_unlock_invalid', 'progression_read_incomplete', 'progression_unknown_command',
    'progression_invalid_argument', 'progression_settings_invalid', 'progression_settings_unavailable', 'progression_schedule_unavailable',
    'progression_time_budget_required', 'progression_aim_invalid', 'progression_deadline_invalid', 'progression_challenge_invalid',
    'progression_done_invalid', 'progression_session_required', 'progression_session_choice_invalid', 'progression_ongoing_unavailable', 'progression_ongoing_none', 'progression_ongoing_unknown', 'progression_stage_layout_unavailable', 'progression_search_unavailable', 'progression_duo_unavailable', 'progression_duo_nothing_held', 'progression_duo_tile_unknown',
    'progression_results_unavailable', 'progression_results_closed', 'progression_results_day_invalid', 'progression_results_week_future',
    'progression_preparation_unavailable', 'progression_close_failed']);

const progress = { type: 'object', properties: { source: { type: 'string', enum: DASHBOARD_UNLOCK_SOURCES }, met: count, required: count, window_days: count } };
const brick = { type: 'object', properties: { brick_id: { type: 'string' }, kind: { type: 'string', enum: ['tile', 'activity', 'tool'] },
    ref: { type: 'string' }, tier: { type: 'number' }, state: { type: 'string', enum: ['unlocked', 'next', 'locked', 'unavailable'] },
    unlocked_at: { type: 'string' } } };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const settings = read => ({ type: 'object', additionalProperties: false, properties: { time_budget: read ? nullable(OBJECTIVE_TIME_BUDGET_SCHEMA) : OBJECTIVE_TIME_BUDGET_SCHEMA,
    effort: read ? nullable(OBJECTIVE_EFFORT_SCHEMA) : OBJECTIVE_EFFORT_SCHEMA, money_budget: nullable(OBJECTIVE_MONEY_BUDGET_SCHEMA) } });
const schedule = { type: 'object', properties: { start_minutes: count, minutes: count, days: { type: 'array', items: { type: 'integer' } },
    calendar: { type: 'boolean' } } };
// The Duo shown (dashboard_duo.js#inspect): its phase, the tile chosen, the tiles offered.
const duo = { open: { type: 'boolean' }, phase: { type: 'string' }, rubric: { type: 'string' }, tiles: { type: 'array', items: { type: 'string' } } };
// An objective named by its id, or by its goal (one per official goal: muscle, movement, weight, aging…).
const named = { objective_id: { type: 'string', minLength: 1, maxLength: 200 }, goal: { type: 'string', minLength: 1, maxLength: 64 } };
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const RESULTS_ACTIVITIES = ['all', 'sport', 'meals', 'wellbeing'];
const sessionRows = { session_id: { type: 'string' }, objectives: { type: 'array', items: { type: 'object', properties: {
    objective_id: { type: 'string' }, name: { type: 'string' }, goal: { type: 'string' }, counted: { type: 'boolean' } } } } };
const output = properties => ({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' },
    error: { type: 'string', enum: DASHBOARD_PROGRESSION_ERRORS }, ...properties } });
const definitions = {
    'progression.read': [{ include: { type: 'string', enum: ['catalog'] } }, [], false,
        'Read how far the user\'s eVe Basic home has grown: current tier, unlocked bricks (tiles, activities, tools) with their '
        + 'date, the next brick and its progress as counts (days or sessions held, never a health value). '
        + 'include "catalog" adds every tier, its rule and its bricks.',
        { tier: { type: 'number' }, bricks: { type: 'array', items: brick }, next: { type: 'object', properties: { brick_id: { type: 'string' },
            tier: { type: 'number' }, rule_id: { type: 'string' }, objective_id: { type: 'string' }, progress } },
            visible_refs: { type: 'array', items: { type: 'string' } }, activity_keys: { type: 'array', items: { type: 'string' } }, health: { type: 'string', enum: ['counted', 'denied_for_actor', 'unavailable'] },
            catalog: { type: 'object' } }],
    'progression.evaluate': [{ preview: { type: 'boolean' } }, [], true,
        'Check the user\'s health objectives against the tier rules and record the bricks newly earned (an earned brick is never '
        + 'taken back; calling it again records nothing new). preview true only reports what would unlock. Health measures count only for the user acting in the app; '
        + 'for an assistant or MCP caller only declared sessions count and the health rules are listed in skipped.',
        { unlocked: { type: 'array', items: brick }, skipped: { type: 'array', items: { type: 'object', properties: {
            rule_id: { type: 'string' }, reason: { type: 'string' } } } }, tier: { type: 'number' } }],
    'objectives.list': [{}, [], false,
        'List the user\'s own health objectives (projects) with their goal, measurable target and progress counts.',
        { objectives: { type: 'array', items: { type: 'object', properties: { objective_id: { type: 'string' }, name: { type: 'string' },
            goal: { type: 'string' }, catalog_id: { type: 'string' }, target: DASHBOARD_OBJECTIVE_TARGET_SCHEMA, tier: { type: 'number' },
            aim: { type: ['string', 'null'] }, deadline: { type: ['object', 'null'] }, challenge: { type: ['object', 'null'] }, closed: { type: ['object', 'null'] }, sessions: count,
            today: { type: 'object' }, exercises: { type: 'array', items: { type: 'string' } } } } } }],
    'objective.target.set': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 }, monitor_id: { type: 'string', minLength: 1, maxLength: 64 },
        comparator: { type: 'string', enum: ['gte', 'lte'] }, value: { type: 'number', minimum: 0 }, sessions_only: { type: 'boolean' } }, ['objective_id'], true,
        'Set or adjust the measurable target of one of the user\'s health objectives: a health monitor (e.g. steps, sleep) with '
        + 'its daily value, or sessions_only true to count declared sessions. Omitted fields keep their value.',
        { objective_id: { type: 'string' }, target: DASHBOARD_OBJECTIVE_TARGET_SCHEMA }],
    'objective.settings.read': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 } }, ['objective_id'], false,
        'Read the three settings of one of the user\'s objectives: the time given to it (minutes per day or week, chosen days), '
        + 'the effort wanted (1 minimum … 5 ambitious) and its money budget (null when it has none).',
        { objective_id: { type: 'string' }, settings: settings(true) }],
    'objective.settings.set': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 }, ...settings(false).properties }, ['objective_id'], true,
        'Set one or more settings of one of the user\'s objectives, as its panel does: time_budget (minutes per day or week and the '
        + 'chosen days, 0 Sunday … 6 Saturday), effort (1 minimum, 2 gentle, 3 regular, 4 sustained, 5 ambitious), money_budget '
        + '(amount, ISO currency, basis total, month or week; null removes the budget). Omitted settings keep their value.',
        { objective_id: { type: 'string' }, settings: settings(true) }],
    'objective.schedule.read': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 } }, ['objective_id'], false,
        'Read the schedule of one of the user\'s objectives other than sleep: the hour of its session (minutes after midnight), its length '
        + 'and days (from its time budget) and whether its sessions are in the calendar (null when none was set).',
        { objective_id: { type: 'string' }, schedule: nullable(schedule) }],
    'objective.schedule.set': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 }, start_minutes: { type: 'integer', minimum: 0, maximum: 1439 },
        calendar: { type: 'boolean' } }, ['objective_id'], true,
        'Set the schedule of one of the user\'s objectives other than sleep, as its preparation screen does: start_minutes the hour of its '
        + 'session (minutes after midnight, 1080 = 18:00; a new hour moves every session still to come, not those already lived, today\'s when '
        + 'already done, nor a series the user moved in the calendar), calendar true to keep its sessions in the calendar with their reminder, false '
        + 'to suspend them. Its length and days come from its time budget (dashboard.objective.settings.set). Omitted fields keep their value.',
        { objective_id: { type: 'string' }, schedule }],
    'objective.aim.set': [{ ...named, aim: { type: 'string', enum: ['mass', 'strength', 'tone', 'endurance', 'cardio', 'mobility', 'upkeep'] } }, ['aim'], true,
        'Set the general sport aim of an objective: Muscles (goal muscle) mass, strength or tone; Forme (goal movement) endurance, cardio, '
        + 'mobility or upkeep. An exercise\'s own settings never change it.', { objective_id: { type: 'string' }, aim: { type: 'string' } }],
    'objective.deadline.set': [{ ...named, date: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' } }, ['date'], true,
        'Give an objective a deadline (date YYYY-MM-DD, today or later), its sessions counted until then; an empty date takes it away.',
        { objective_id: { type: 'string' }, deadline: { type: ['object', 'null'] } }],
    'objective.challenge.set': [{ ...named, count: { type: 'integer', minimum: 0, maximum: 365 }, unit: { type: 'string', enum: ['days', 'sessions'] } }, ['count'], true,
        'Make an objective a counted challenge (« 21 jours de planche »: count 21, unit days, the days with a counted session; '
        + 'unit sessions counts sessions), advancing by itself with the sessions; count 0 takes it away.',
        { objective_id: { type: 'string' }, challenge: { type: ['object', 'null'] } }],
    'objective.prepare': [{ ...named }, [], false,
        'Show the preparation screens of one of the user\'s objectives again, as « Régler » in its tile\'s hold does: its aim, effort, time, '
        + 'hour, deadline (a date, or none), challenge (a count and days or sessions) and bricks, each on its own control; its « C\'est parti » '
        + 'applies them. Writes nothing by itself.', { objective_id: { type: 'string' }, opening: { type: 'boolean' } }],
    'objective.done': [{ ...named, day }, [], true,
        'Declare a session of an objective done without phone or watch (« j\'ai fait ma séance »): on a day its routine plans one it '
        + 'accomplishes that session, else it adds one; one declaration per day (already true when the day was done). Without objective_id '
        + 'or goal, the objective whose session is planned today. day (YYYY-MM-DD, today by default) may be a past day.',
        { objective_id: { type: 'string' }, day: { type: 'string' }, already: { type: 'boolean' }, accomplished: { type: 'boolean' } }],
    'objective.close': [{ ...named }, [], true,
        'Close an objective reached (« Clore », « j\'ai atteint mon objectif, clos-le »), as « Clore » in its tile\'s hold does: its reminders '
        + 'stop (its programme paused, its sessions in the calendar and their alarms suspended); its sessions, counts and calendar past stay. '
        + 'A closed objective lists closed { at }; closing it again changes nothing (already true).',
        { objective_id: { type: 'string' }, closed: { type: 'object' }, already: { type: 'boolean' } }],
    'session.objectives.read': [{ session_id: { type: 'string', minLength: 1 } }, [], false,
        'List the objectives one Sport, nap or meditation session counts for (the session followed now when session_id is omitted), '
        + 'each with counted true or false.', sessionRows],
    'session.objectives.set': [{ session_id: { type: 'string', minLength: 1 }, ...named, counted: { type: 'boolean' } }, ['counted'], true,
        'While a session runs or on its summary, make it count (true) or no longer count (false) for one objective, without '
        + 'interrupting it (« compte aussi pour Bien vieillir », « pas pour Poids »). Its other objectives keep counting.', sessionRows],
    'monitors.select': [{ ids: { type: 'array', maxItems: 64, uniqueItems: true, items: { type: 'string', pattern: '^[a-z0-9_]{1,64}$' } } }, ['ids'], true,
        'Choose the health monitors the user\'s home shows, in order (ids from the health catalog). Replaces the selection.',
        { ids: { type: 'array', items: { type: 'string' } } }],
    'monitors.favorite': [{ id: { type: 'string', pattern: '^[a-z0-9_]{1,64}$' }, favorite: { type: 'boolean' } }, ['id', 'favorite'], true,
        'Make one selected health monitor the favourite the eVe Pro home\'s Moniteur tile shows (favorite true; another favourite is '
        + 'replaced, there is only one), or no longer the favourite (false: the tile then shows no monitor).',
        { ids: { type: 'array', items: { type: 'string' } }, favorite: { type: 'string' } }],
    'ongoing.open': [{ key: { type: 'string', minLength: 1, maxLength: 200 } }, [], false,
        'Show on the home the activities under way (a Sport exercise, a nap, a meditation, a breathing, a relaxation, running or '
        + 'paused): the one named by key (else the last chosen, else the first) large with its time, a row for each. Writes nothing.',
        { shown: { type: 'array', items: { type: 'string' } }, chosen: { type: 'string' } }],
    'stage.layout': [{ layout: { type: 'string', enum: ['tiles', 'list'] } }, ['layout'], false,
        'Lay the long collection shown on the home\'s stage (a shopping aisle, the basket…) as tiles a page at a time or as a '
        + 'list of rows, as its band\'s Liste / Tuiles tool does. Writes nothing.', { layout: { type: 'string' } }],
    // Duo (R-006 Q67): two tools on the home at once, as the « Duo » row of a hold does. Only when the user asks.
    'duo.open': [{ tile: { type: 'string', pattern: '^[a-z0-9_]{1,64}$' } }, [], false,
        'Open the Duo around the tool shown on the home\'s stage (« deux outils à la fois », « mets une vidéo pendant ma séance »): '
        + 'that tool stays below (beside it on a wide screen) with its own band, the home\'s tiles offered above it; tile (a home tile: media, '
        + 'projects, capture, calendar, contacts, activity…) chooses the second zone at once. Never offered unasked. Writes nothing.', duo],
    'duo.choose': [{ tile: { type: 'string', pattern: '^[a-z0-9_]{1,64}$' } }, ['tile'], false,
        'In the Duo shown, choose the second zone\'s tile (media, projects, capture…), as a touch on it does: its level shows in that '
        + 'zone, what is touched there opening in it. Writes nothing.', duo],
    'duo.close': [{}, [], false, 'Close the Duo\'s second zone, as the lit « Duo » of a hold does: the tool held takes the stage again. Writes nothing.',
        { open: { type: 'boolean' } }],
    'search.end': [{}, [], false,
        'End the search or the filter under way on the home, as the Close in its Back\'s place does: the field emptied, the list, '
        + 'the rubric or the home given back as it was before the words (ended false when none was under way). Writes nothing.',
        { ended: { type: 'boolean' } }],
    // The Résultats monitor (Moniteur › Résultats): what a touch does there. It shows; it never answers a health value.
    'results.open': [{ day, activities: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: RESULTS_ACTIVITIES } } }, [], false,
        'Show the user\'s Résultats on the home (Moniteur › Résultats): the rings of the objectives that have a goal, a card per '
        + 'measure of the day, the week above them. day (YYYY-MM-DD, today by default, never a day to come); activities the toggles '
        + 'lit (all, sport, meals, wellbeing; every one by default). Writes nothing and answers no health value.', { day: { type: 'string' } }],
    'results.day': [{ day }, ['day'], false,
        'On the Résultats shown, choose the day (YYYY-MM-DD, today or before), as a touch on a day of its week does. Writes nothing.',
        { day: { type: 'string' } }],
    'results.week': [{ offset: { type: 'integer', enum: [-1, 1] } }, ['offset'], false,
        'On the Résultats shown, turn the week (-1 the week before, 1 the week after, never past the current one), as a sideways '
        + 'swipe on it does: the same weekday is chosen. Writes nothing.', { day: { type: 'string' } }],
    'results.filter': [{ activities: { type: 'array', uniqueItems: true, items: { type: 'string', enum: RESULTS_ACTIVITIES } } }, ['activities'], false,
        'On the Résultats shown, light exactly these activities\' toggles (all lights them all; an empty list none): only their rings '
        + 'and the cards of their measures show, with the « après » cards (after meals, after an effort). Writes nothing.',
        { activities: { type: 'array', items: { type: 'string' } } }],
    'results.hour': [{ hour: { anyOf: [{ type: 'integer', minimum: 0, maximum: 23 }, { type: 'null' }] } }, ['hour'], false,
        'On the Résultats shown, choose an hour of the day (0 to 23) as sliding along a card does: every card then shows that hour; '
        + 'null gives the whole day back. Writes nothing.', { hour: { anyOf: [{ type: 'integer' }, { type: 'null' }] } }],
    'results.feeling': [{}, [], false,
        'On the Résultats shown, open the feeling\'s rows (Forme, Force, Humeur) as a touch on its Ressenti card does; closing them '
        + 'gives the Résultats back. Writes nothing.', {}],
    'results.close': [{}, [], false, 'Close the Résultats shown, as its ✕ does. Writes nothing.', {}]
};
export const DASHBOARD_PROGRESSION_COMMANDS = Object.freeze(Object.entries(definitions)
    .map(([action, [properties, required, persistent, description, result]]) => Object.freeze({
        name: `dashboard.${action}`, action, description, persistent, capability: persistent ? 'progression.write' : 'progression.read',
        input_schema: { type: 'object', additionalProperties: false, properties, required }, output_schema: output(result)
    })));

export const validateDashboardProgressionInput = (action, input) => {
    const contract = DASHBOARD_PROGRESSION_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'progression_invalid_argument';
};
export const DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS = 'Home progression: the eVe Basic home starts with the Atom, Contacts, '
    + 'Calendar and Goals and earns more tiles (Activity, Capture, Plan, Create…) as the user keeps a health objective; the monitors '
    + 'the user chooses (dashboard.monitors.select) show above the Atom, up to six; '
    + '« qu\'est-ce que j\'ai débloqué », « qu\'est-ce qui vient ensuite » call dashboard.progression.read and answer with the next '
    + 'brick and its count (days or sessions held), never a health value you do not have. « mes objectifs » calls '
    + 'dashboard.objectives.list; « vise 8000 pas par jour », « je veux dormir 7 heures » call dashboard.objective.target.set '
    + '(sleep in minutes). « j\'y consacre 20 minutes par jour », « effort léger », « budget de 50 euros par mois », « plus de budget » '
    + 'call dashboard.objective.settings.set on that objective (dashboard.objective.settings.read to answer about them); « fais-moi ma séance à 18 h », « enlève-la du calendrier » call '
    + 'dashboard.objective.schedule.set (dashboard.objective.schedule.read to answer about it). A tracked session counts for '
    + 'its objectives by itself: « j\'ai fait ma séance » (done without phone or watch) calls dashboard.objective.done; during a session or '
    + 'on its summary « compte aussi pour Bien vieillir » calls dashboard.session.objectives.set counted true with goal aging, « pas pour Poids » '
    + 'counted false with goal weight; « je veux courir 5 km avant le 15 mars » calls dashboard.objective.deadline.set, « défi : 21 jours de '
    + 'planche » dashboard.objective.challenge.set count 21 unit days, « je vise la force » dashboard.objective.aim.set (dashboard.objectives.list '
    + 'answers about them); « règle mon objectif Muscles », « montre-moi ses réglages » call dashboard.objective.prepare; « j\'ai atteint mon objectif, clos-le » calls dashboard.objective.close. A locked brick is only hidden from that home: it removes no capability, so never refuse a Sport, '
    + 'shopping, food, GPS or any other request because of the tier, call its tool directly. « qu\'est-ce qui est en cours », « montre ma '
    + 'séance en cours » call dashboard.ongoing.open. « deux outils à la fois », « mets une vidéo pendant ma séance » call dashboard.duo.open '
    + '(tile media), « ferme le duo » dashboard.duo.close; never propose the Duo unasked. « affiche en liste », « en tuiles » on a long collection call dashboard.stage.layout. « ferme la recherche », « efface la recherche » call dashboard.search.end. '
    + '« montre mes résultats », « mes résultats d\'hier » call dashboard.results.open (day); on the Résultats shown « la semaine dernière » '
    + 'dashboard.results.week offset -1, « mardi » dashboard.results.day, « seulement le sport » dashboard.results.filter [sport], « tout » [all], '
    + '« à 10 h » dashboard.results.hour 10, « toute la journée » hour null, « mon ressenti » dashboard.results.feeling, « ferme » dashboard.results.close. '
    + 'These commands show; they never give a health value back, so never state one.';
