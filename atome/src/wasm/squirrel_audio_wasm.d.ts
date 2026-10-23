/* tslint:disable */
/* eslint-disable */
export function audio_stop_instance(voice_id: string): void;
/**
 * The AudioContext playback renders into; recording opens its worklet on it.
 */
export function audio_shared_context(): AudioContext;
/**
 * A late end for a scheduled or sounding voice: `end_frame` frames after its
 * first one, fading over `release_frames`. Returns whether the voice is known.
 */
export function audio_set_voice_end(voice_id: string, end_frame: number, release_frames: number): boolean;
export function audio_set_pan(id: string, pan: number): void;
/**
 * `{ frames_rendered, base_context_frame, sample_rate, discontinuities, block_frames }`.
 */
export function audio_render_clock(): object;
export function audio_play(id: string): number;
export function audio_play_instance(asset_id: string, voice_id: string, start_seconds: number, duration_seconds: number | null | undefined, gain: number, pan: number, rate: number, loop_start_seconds?: number | null, loop_end_seconds?: number | null, strip_id?: string | null): number;
/**
 * Load an audio clip from raw bytes (WAV, MP3, OGG).
 * In WASM, we cannot read files from disk so JS must pass the bytes.
 */
export function audio_load_clip_from_bytes(id: string, data: Uint8Array): number;
export function audio_stop(id: string): void;
/**
 * Starts each voice exactly on its rendered frame (`ScheduledVoice` list, as
 * the native `audio_schedule_instances`): the render loop stops there, starts
 * it, and renders on. A frame already rendered starts it on the next block
 * instead; the returned frames say which.
 */
export function audio_schedule_voices(voices: any): Float64Array;
export function audio_set_volume(id: string, db: number): void;
export function audio_shutdown(): void;
export function audio_destroy_clip(id: string): void;
export function audio_set_playback_rate(id: string, rate: number): void;
export function audio_init(): void;
export function audio_mix_live_push(device_id: string, pcm: Float32Array): void;
export function audio_mix_module_state(module_id: string): number | undefined;
export function audio_mix_levels(): Array<any>;
export function audio_mix_apply(program: any): number;
export function audio_mix_cut_tail(module_id: string): void;
export class VoiceConversation {
  free(): void;
  /**
   * True when the stream is cut: the page resets the Silero state.
   */
  setSpeaking(speaking: boolean): boolean;
  constructor();
  /**
   * `{ type: 'speech_start' }`, `{ type: 'feed', pcm: Int16Array }`, `{ type: 'close', end: 'spoken' | 'too_long' }`.
   */
  push(frame: Float32Array, probability: number): Array<any>;
  reset(): void;
  /**
   * 512 samples in [-1, 1]: whether Silero must score this frame.
   */
  listen(frame: Float32Array): boolean;
  inputDb(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly audio_destroy_clip: (a: number, b: number) => [number, number];
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
  readonly __wbg_voiceconversation_free: (a: number, b: number) => void;
  readonly voiceconversation_inputDb: (a: number) => number;
  readonly voiceconversation_listen: (a: number, b: number, c: number) => number;
  readonly voiceconversation_new: () => number;
  readonly voiceconversation_push: (a: number, b: number, c: number, d: number) => any;
  readonly voiceconversation_reset: (a: number) => void;
  readonly voiceconversation_setSpeaking: (a: number, b: number) => number;
  readonly audio_mix_apply: (a: any) => [number, number, number];
  readonly audio_mix_cut_tail: (a: number, b: number) => [number, number];
  readonly audio_mix_levels: () => [number, number, number];
  readonly audio_mix_live_push: (a: number, b: number, c: number, d: number) => [number, number];
  readonly audio_mix_module_state: (a: number, b: number) => [number, number, number];
  readonly audio_stop_instance: (a: number, b: number) => [number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __wbindgen_export_5: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h5734e605a807805c: (a: number, b: number) => void;
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
