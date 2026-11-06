/* tslint:disable */
/* eslint-disable */

export class VoiceConversation {
    free(): void;
    [Symbol.dispose](): void;
    inputDb(): number;
    /**
     * 512 samples in [-1, 1]: whether Silero must score this frame.
     */
    listen(frame: Float32Array): boolean;
    constructor();
    /**
     * `{ type: 'speech_start' }`, `{ type: 'feed', pcm: Int16Array }`, `{ type: 'close', end: 'spoken' | 'too_long' }`.
     */
    push(frame: Float32Array, probability: number): Array<any>;
    reset(): void;
    /**
     * Test mode (todo/refonte_assistant_vocal.md §18.7), off by default: every frame scored is kept.
     */
    setRecording(on: boolean): void;
    /**
     * True when the stream is cut: the page resets the Silero state.
     */
    setSpeaking(speaking: boolean): boolean;
    /**
     * `{ pcm: Float32Array, cuts: Uint32Array }` of the turn the last `close` ended, once; else undefined.
     */
    takeRecording(): any;
}

export function audio_destroy_clip(id: string): void;

/**
 * `owner` plays on the engine's context itself (`on`) or lets it go: held,
 * the engine never sleeps.
 */
export function audio_hold(owner: string, on: boolean): Promise<any> | undefined;

export function audio_init(): void;

export function audio_instrument(command: any): any;

export function audio_instrument_sample_load(sample_id: string, left: Float32Array, right: Float32Array | null | undefined, sample_rate: number): void;

/**
 * Load an audio clip from raw bytes (WAV, MP3, OGG).
 * In WASM, we cannot read files from disk so JS must pass the bytes.
 */
export function audio_load_clip_from_bytes(id: string, data: Uint8Array): number;

export function audio_mix_apply(program: any): number;

export function audio_mix_asset_load_capture(asset_id: string, json: string): void;

export function audio_mix_asset_load_impulse(asset_id: string, left: Float32Array, right: Float32Array | null | undefined, sample_rate: number): void;

export function audio_mix_asset_unload(asset_id: string): void;

export function audio_mix_cut_tail(module_id: string): void;

export function audio_mix_levels(): Array<any>;

export function audio_mix_live_push(device_id: string, pcm: Float32Array): void;

export function audio_mix_module_state(module_id: string): number | undefined;

export function audio_play(id: string): number;

export function audio_play_instance(asset_id: string, voice_id: string, start_seconds: number, duration_seconds: number | null | undefined, gain: number, pan: number, rate: number, loop_start_seconds?: number | null, loop_end_seconds?: number | null, strip_id?: string | null): number;

/**
 * `{ frames_rendered, base_context_frame, sample_rate, discontinuities, block_frames }`.
 */
export function audio_render_clock(): object;

/**
 * Starts each voice exactly on its rendered frame (`ScheduledVoice` list, as
 * the native `audio_schedule_instances`): the render loop stops there, starts
 * it, and renders on. A frame already rendered starts it on the next block
 * instead; the returned frames say which.
 */
export function audio_schedule_voices(voices: any): Float64Array;

export function audio_set_pan(id: string, pan: number): void;

export function audio_set_playback_rate(id: string, rate: number): void;

/**
 * A late end for a scheduled or sounding voice: `end_frame` frames after its
 * first one, fading over `release_frames`. Returns whether the voice is known.
 */
export function audio_set_voice_end(voice_id: string, end_frame: number, release_frames: number): boolean;

export function audio_set_volume(id: string, db: number): void;

/**
 * The AudioContext playback renders into; recording opens its worklet on it.
 */
export function audio_shared_context(): AudioContext;

export function audio_shutdown(): void;

export function audio_stop(id: string): void;

export function audio_stop_instance(voice_id: string): void;

/**
 * A demand on the engine: asleep, it renders again; answers its context's
 * resume then, nothing when it was awake.
 */
export function audio_wake(): Promise<any> | undefined;

/**
 * `expandCalendarOccurrences(event, start, end, limit)`: the starts (ms) of one recurring event.
 */
export function calendarExpand(event: string, from: number | null | undefined, until: number | null | undefined, limit: number): Float64Array;

/**
 * `calendarOccurrenceEnd(event, start)`: the end (ms) of the occurrence starting at `start`,
 * `undefined` when the event has none.
 */
export function calendarOccurrenceEnd(event: string, start: number): number | undefined;

/**
 * `calendarRangeOccurrences(events, range, limit)`: per occurrence, in order, the index of its event,
 * the index of its series' master, its start, 1 or 0 for an end or none, and that end (ms).
 */
export function calendarRangeOccurrences(events: string, from: number | null | undefined, until: number | null | undefined, future_only: boolean, exclude_completed: boolean, limit: number): Float64Array;

export function clickBar(rate: number, bpm: number, beats: number, click_seconds: number, accent_hz: number, beat_hz: number): Float32Array;

/**
 * `windows`: `[from, hold_end, to]` per planned note; each answer a `{ start, end, truncated }` or null.
 */
export function cutTakes(channels: Array<any>, threshold_db: number, pre_roll: number, windows: Uint32Array): any;

export function decodeWav(bytes: Uint8Array): Array<any>;

/**
 * `{ bits, channels: Int32Array[] }` of an 8/16/24-bit PCM WAV.
 */
export function decodeWavIntegers(bytes: Uint8Array): object;

export function detectOnsets(channels: Array<any>, sample_rate: number, sensitivity: number, min_gap_ms: number, start: number, end: number): Uint32Array;

export function encodeFlac(channels: Array<any>, sample_rate: number, bits: number): Uint8Array;

export function encodeWav(channels: Array<any>, sample_rate: number, bits: number): Uint8Array;

/**
 * `loops`: `[start, end, ping_pong]` per loop, written with `smpl_root` when it is given.
 */
export function encodeWavIntegers(channels: Array<any>, sample_rate: number, bits: number, smpl_root: number | null | undefined, loops: Uint32Array): Uint8Array;

export function endOfSound(channels: Array<any>, threshold_db: number, tail_frames: number): number;

export function findLoop(channels: Array<any>, start: number, end: number, radius: number, window: number, candidates: number): any;

export function isWav(bytes: Uint8Array): boolean;

/**
 * `ramps`: `[from, to]` per ramp.
 */
export function layEditPiece(channels: Array<any>, length: number, gain: number, ramps: Float64Array): Array<any>;

export function nearestZeroCrossing(channels: Array<any>, frame: number, radius: number): number;

export function readEditWindow(channels: Array<any>, start: number, end: number, dc: boolean, reverse: boolean): Array<any>;

export function sourceRate(bytes: Uint8Array): number | undefined;

export function toneSamples(hz: number, seconds: number, rate: number, edge_seconds: number, gain: number): Float32Array;

export function wavInfo(bytes: Uint8Array): any;

export function waveformPeaks(channels: Array<any>, max_peaks: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly audio_destroy_clip: (a: number, b: number) => [number, number];
    readonly audio_hold: (a: number, b: number, c: number) => [number, number, number];
    readonly audio_init: () => [number, number];
    readonly audio_load_clip_from_bytes: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly audio_play: (a: number, b: number) => [number, number, number];
    readonly audio_play_instance: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => [number, number, number];
    readonly audio_render_clock: () => any;
    readonly audio_schedule_voices: (a: any) => [number, number, number, number];
    readonly audio_set_pan: (a: number, b: number, c: number) => [number, number];
    readonly audio_set_playback_rate: (a: number, b: number, c: number) => [number, number];
    readonly audio_set_voice_end: (a: number, b: number, c: number, d: number) => number;
    readonly audio_set_volume: (a: number, b: number, c: number) => [number, number];
    readonly audio_shared_context: () => [number, number, number];
    readonly audio_shutdown: () => [number, number];
    readonly audio_stop: (a: number, b: number) => [number, number];
    readonly audio_stop_instance: (a: number, b: number) => [number, number];
    readonly audio_wake: () => [number, number, number];
    readonly audio_instrument: (a: any) => [number, number, number];
    readonly audio_instrument_sample_load: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly audio_mix_apply: (a: any) => [number, number, number];
    readonly audio_mix_asset_load_capture: (a: number, b: number, c: number, d: number) => [number, number];
    readonly audio_mix_asset_load_impulse: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly audio_mix_asset_unload: (a: number, b: number) => [number, number];
    readonly audio_mix_cut_tail: (a: number, b: number) => [number, number];
    readonly audio_mix_levels: () => [number, number, number];
    readonly audio_mix_live_push: (a: number, b: number, c: number, d: number) => [number, number];
    readonly audio_mix_module_state: (a: number, b: number) => [number, number, number];
    readonly calendarExpand: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly calendarOccurrenceEnd: (a: number, b: number, c: number) => [number, number, number, number];
    readonly calendarRangeOccurrences: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly __wbg_voiceconversation_free: (a: number, b: number) => void;
    readonly voiceconversation_inputDb: (a: number) => number;
    readonly voiceconversation_listen: (a: number, b: number, c: number) => number;
    readonly voiceconversation_new: () => number;
    readonly voiceconversation_push: (a: number, b: number, c: number, d: number) => any;
    readonly voiceconversation_reset: (a: number) => void;
    readonly voiceconversation_setRecording: (a: number, b: number) => void;
    readonly voiceconversation_setSpeaking: (a: number, b: number) => number;
    readonly voiceconversation_takeRecording: (a: number) => any;
    readonly clickBar: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly cutTakes: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly decodeWav: (a: number, b: number) => [number, number, number];
    readonly decodeWavIntegers: (a: number, b: number) => [number, number, number];
    readonly detectOnsets: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly encodeFlac: (a: any, b: number, c: number) => [number, number, number, number];
    readonly encodeWav: (a: any, b: number, c: number) => [number, number, number, number];
    readonly encodeWavIntegers: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly endOfSound: (a: any, b: number, c: number) => [number, number, number];
    readonly findLoop: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly isWav: (a: any) => number;
    readonly layEditPiece: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly nearestZeroCrossing: (a: any, b: number, c: number) => [number, number, number];
    readonly readEditWindow: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly sourceRate: (a: any) => [number, number, number];
    readonly toneSamples: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wavInfo: (a: any) => [number, number, number];
    readonly waveformPeaks: (a: any, b: number) => [number, number, number, number];
    readonly wasm_bindgen__convert__closures_____invoke__hfdb5f1f393d59aed: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
