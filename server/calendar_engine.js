// The calendar engine for the reference Fastify in Node: icalendar.js reads its occurrences from
// squirrel_audio_wasm (atome/engines/atome-calendar), here loaded once from the files the page
// loads, before any route reads an occurrence.
import { readFileSync } from 'node:fs';
import { calendarRangeOccurrences, loadCalendarEngine } from '../atome/src/squirrel/calendar/icalendar.js';

const WASM_ROOT = new URL('../atome/src/wasm/', import.meta.url);
await loadCalendarEngine({
    moduleUrl: new URL('squirrel_audio_wasm.js', WASM_ROOT).href,
    binary: readFileSync(new URL('squirrel_audio_wasm_bg.wasm', WASM_ROOT))
});

export { calendarRangeOccurrences };
