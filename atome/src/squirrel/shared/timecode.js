// Shared timecode formatting and parsing (seconds <-> text), plus the musical
// position (bars/beats) used when a host gives a tempo. Pure functions: no
// locale, no DOM; callers own labels and units.

const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const pad = (value, size = 2) => String(Math.trunc(value)).padStart(size, '0');

/**
 * `mm:ss.cc` (centiseconds), `h:mm:ss.cc` from one hour, or `mm:ss:ff` frames
 * when `fps` is given. `signed: true` writes `+` on positive values (offsets).
 */
export const formatTimecode = (seconds, { fps = 0, signed = false } = {}) => {
    const value = finite(seconds);
    const sign = value < 0 ? '-' : (signed && value > 0 ? '+' : '');
    const frameRate = Math.max(0, Math.trunc(finite(fps)));
    const unitsPerSecond = frameRate || 100;
    const totalUnits = Math.round(Math.abs(value) * unitsPerSecond);
    const units = totalUnits % unitsPerSecond;
    const totalSeconds = Math.floor(totalUnits / unitsPerSecond);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const head = hours ? `${hours}:${pad(minutes)}` : pad(minutes);
    return `${sign}${head}:${pad(secs)}${frameRate ? ':' : '.'}${pad(units)}`;
};

/**
 * A length as people read it on a list: `3:12`, `1:04:05` from one hour (whole seconds, no fraction).
 */
export const formatClockDuration = (seconds) => {
    const whole = Math.max(0, Math.round(finite(seconds)));
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    return hours ? `${hours}:${pad(minutes)}:${pad(whole % 60)}` : `${minutes}:${pad(whole % 60)}`;
};

/**
 * Reads what a user types: `75`, `75.5`, `1:15.5`, `0:01:15.50`, `-0:02`.
 * Returns seconds, or null when the text is not a timecode.
 */
export const parseTimecode = (text) => {
    const source = String(text ?? '').trim().replace(',', '.');
    const match = /^([+-])?((?:\d+:){0,2})(\d+(?:\.\d+)?)$/.exec(source);
    if (!match) return null;
    const parts = match[2] ? match[2].split(':').filter(Boolean).map(Number) : [];
    const seconds = parts.reduce((total, part) => (total * 60) + part, 0) * 60 + Number(match[3]);
    if (parts.length && Number(match[3]) >= 60) return null;
    return match[1] === '-' ? -seconds : seconds;
};

/** Musical position of `seconds` at `tempo` (1-based bar and beat, ticks per beat). */
export const secondsToMusicalPosition = (seconds, { tempo = 120, beatsPerBar = 4, ticksPerBeat = 960 } = {}) => {
    const bpm = finite(tempo, 120) > 0 ? finite(tempo, 120) : 120;
    const meter = Math.max(1, Math.trunc(finite(beatsPerBar, 4)));
    const totalTicks = Math.round(Math.max(0, finite(seconds)) * (bpm / 60) * ticksPerBeat);
    const totalBeats = Math.floor(totalTicks / ticksPerBeat);
    return { bar: Math.floor(totalBeats / meter) + 1, beat: (totalBeats % meter) + 1, tick: totalTicks % ticksPerBeat };
};

/** `bar.beat.tick` text, e.g. `3.2.480`. */
export const formatMusicalPosition = (seconds, options = {}) => {
    const { bar, beat, tick } = secondsToMusicalPosition(seconds, options);
    return `${bar}.${beat}.${pad(tick, 3)}`;
};

/** Nearest multiple of one beat / `division` (division 1 = beat, 2 = eighth…). */
export const quantizeSecondsToBeat = (seconds, { tempo = 120, division = 1 } = {}) => {
    const bpm = finite(tempo, 120) > 0 ? finite(tempo, 120) : 120;
    const step = 60 / bpm / Math.max(1, Math.trunc(finite(division, 1)));
    return Math.max(0, Math.round(finite(seconds) / step) * step);
};
