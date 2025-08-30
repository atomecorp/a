// Types for Squirrel AV Audio API
// Note: If you do not use TypeScript, these definitions still help via editors.

export type BackendName = 'iplug' | 'html';

export type WhenSpec =
  | { type: 'now' }
  | { type: 'hostSampleTime'; value: number }
  | { type: 'bufferOffset'; value: number };

export interface EnvelopeADSR { a: number; d: number; s: number; r: number }
export interface Marker { name: string; frame: number }
export interface Sprite { name: string; start: number; end: number }

export interface CreateClipOpts {
  id: string;
  path_or_bookmark: string; // iOS: security-scoped bookmark or app-group relative path
  mode: 'preload' | 'stream';
  gain_db?: number;
  pan?: number;
  envelope_default?: EnvelopeADSR;
  markers?: Marker[];
  sprites?: Sprite[];
}

export interface PlayOpts {
  clip_id: string;
  when?: WhenSpec;
  start?: number | { marker: string } | { sprite: string };
  end?: number | { marker: string } | 'until_note_off' | 'clip_end';
  loop?: { mode: 'off' | 'forward' | 'pingpong'; start?: number; end?: number; count?: number | 'sustain' };
  velocity?: number;
  pitch_cents?: number;
  gain_db_delta?: number;
  pan_delta?: number;
  envelope_override?: EnvelopeADSR;
  xfade_samples?: number;
  follow?: Array<{ action: 'jump' | 'play'; target_marker?: string; target_clip_id?: string; probability?: number }>;
}

export interface StopOpts { voice_id: string; release_ms?: number }
export interface StopClipOpts { clip_id: string; release_ms?: number }
export interface JumpOpts { voice_id: string; to: number | { marker: string }; xfade_samples?: number }
export interface SetParamOpts { target: 'global' | 'clip' | 'voice'; id?: number; name?: string; value: number }
export interface MapMidiOpts { /* mapping schema, UI-declared, executed natively */ [k: string]: any }
export interface QueryClipOpts { id: string }

export interface AVAudioAPI {
  set_backend(name: BackendName): boolean;
  detect_and_set_backend(order?: BackendName[]): BackendName | null;
  on(type: string, fn: (payload: any) => void): void;
  off(type: string, fn: (payload: any) => void): void;
  create_clip(opts: CreateClipOpts): Promise<boolean> | boolean;
  destroy_clip(arg: { id: string }): Promise<boolean> | boolean;
  play(opts: PlayOpts): Promise<{ voice_id: string } | boolean> | { voice_id: string } | boolean;
  stop(opts: StopOpts): Promise<boolean> | boolean;
  stop_clip(opts: StopClipOpts): Promise<boolean> | boolean;
  jump(opts: JumpOpts): Promise<boolean> | boolean;
  set_param(opts: SetParamOpts): Promise<boolean> | boolean;
  map_midi(mapping: MapMidiOpts): Promise<boolean> | boolean;
  add_marker(arg: Marker & { clip_id: string }): Promise<boolean> | boolean;
  remove_marker(arg: { clip_id: string; name: string }): Promise<boolean> | boolean;
  set_marker_follow_actions(arg: { clip_id: string; marker: string; actions: any[] }): Promise<boolean> | boolean;
  clear_marker_follow_actions(arg: { clip_id: string; marker: string }): Promise<boolean> | boolean;
  query_clip?(arg: QueryClipOpts): Promise<any> | any;
}

declare global {
  interface Window {
    Squirrel: any;
  }
}
