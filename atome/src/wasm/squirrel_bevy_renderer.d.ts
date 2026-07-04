/* tslint:disable */
/* eslint-disable */

export function apply_atome_bevy_despawn(id: string): void;

export function apply_atome_bevy_layer(patch: any): void;

export function apply_atome_bevy_ops(ops: any): void;

export function apply_atome_bevy_reparent(patch: any): void;

export function apply_atome_bevy_resource(patch: any): void;

export function apply_atome_bevy_scene_effects(patch: any): void;

export function apply_atome_bevy_spawn(node: any): void;

export function apply_atome_bevy_style(patch: any): void;

export function apply_atome_bevy_surface(patch: any): void;

export function apply_atome_bevy_surface_background(patch: any): void;

export function apply_atome_bevy_text_metadata(patch: any): void;

export function apply_atome_bevy_transform(patch: any): void;

export function apply_atome_bevy_visibility(patch: any): void;

export function notify_atome_bevy_video_frame(id: string, frame_version: number): void;

export function read_atome_bevy_video_backend_capabilities(): any;

export function read_atome_bevy_video_copy_diagnostics(): any;

export function read_atome_bevy_web_diagnostics(): any;

export function request_atome_bevy_redraw(): void;

export function reset_atome_bevy_video_copy_diagnostics(): any;

export function reset_atome_bevy_web_diagnostics(): any;

export function run_atome_bevy_preview_renderer(canvas_selector: string, width: number, height: number, surface_metrics: any, initial_scene: any): void;

export function run_atome_bevy_renderer(canvas_selector: string, width: number, height: number, surface_metrics: any, initial_scene: any): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly apply_atome_bevy_despawn: (a: number, b: number, c: number) => void;
  readonly apply_atome_bevy_layer: (a: number, b: number) => void;
  readonly apply_atome_bevy_ops: (a: number, b: number) => void;
  readonly apply_atome_bevy_reparent: (a: number, b: number) => void;
  readonly apply_atome_bevy_resource: (a: number, b: number) => void;
  readonly apply_atome_bevy_scene_effects: (a: number, b: number) => void;
  readonly apply_atome_bevy_spawn: (a: number, b: number) => void;
  readonly apply_atome_bevy_style: (a: number, b: number) => void;
  readonly apply_atome_bevy_surface: (a: number, b: number) => void;
  readonly apply_atome_bevy_surface_background: (a: number, b: number) => void;
  readonly apply_atome_bevy_text_metadata: (a: number, b: number) => void;
  readonly apply_atome_bevy_transform: (a: number, b: number) => void;
  readonly apply_atome_bevy_visibility: (a: number, b: number) => void;
  readonly notify_atome_bevy_video_frame: (a: number, b: number, c: number) => void;
  readonly read_atome_bevy_video_backend_capabilities: (a: number) => void;
  readonly read_atome_bevy_video_copy_diagnostics: (a: number) => void;
  readonly read_atome_bevy_web_diagnostics: (a: number) => void;
  readonly request_atome_bevy_redraw: () => void;
  readonly reset_atome_bevy_video_copy_diagnostics: (a: number) => void;
  readonly reset_atome_bevy_web_diagnostics: (a: number) => void;
  readonly run_atome_bevy_preview_renderer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly run_atome_bevy_renderer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly __wasm_bindgen_func_elem_4997: (a: number, b: number, c: number, d: number) => void;
  readonly __wasm_bindgen_func_elem_4751: (a: number, b: number) => void;
  readonly __wasm_bindgen_func_elem_4994: (a: number, b: number, c: number) => void;
  readonly __wasm_bindgen_func_elem_4995: (a: number, b: number, c: number) => void;
  readonly __wasm_bindgen_func_elem_104006: (a: number, b: number, c: number) => void;
  readonly __wasm_bindgen_func_elem_103990: (a: number, b: number) => void;
  readonly __wasm_bindgen_func_elem_4993: (a: number, b: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number) => void;
  readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
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
