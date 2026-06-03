/* tslint:disable */
/* eslint-disable */

export function apply_atome_bevy_despawn(id: string): void;

export function apply_atome_bevy_layer(patch: any): void;

export function apply_atome_bevy_reparent(patch: any): void;

export function apply_atome_bevy_resource(patch: any): void;

export function apply_atome_bevy_spawn(node: any): void;

export function apply_atome_bevy_style(patch: any): void;

export function apply_atome_bevy_surface(patch: any): void;

export function apply_atome_bevy_text_metadata(patch: any): void;

export function apply_atome_bevy_transform(patch: any): void;

export function apply_atome_bevy_visibility(patch: any): void;

export function run_atome_bevy_renderer(canvas_selector: string, width: number, height: number, initial_scene: any): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly apply_atome_bevy_despawn: (a: number, b: number) => [number, number];
  readonly apply_atome_bevy_layer: (a: any) => [number, number];
  readonly apply_atome_bevy_reparent: (a: any) => [number, number];
  readonly apply_atome_bevy_resource: (a: any) => [number, number];
  readonly apply_atome_bevy_spawn: (a: any) => [number, number];
  readonly apply_atome_bevy_style: (a: any) => [number, number];
  readonly apply_atome_bevy_surface: (a: any) => [number, number];
  readonly apply_atome_bevy_text_metadata: (a: any) => [number, number];
  readonly apply_atome_bevy_transform: (a: any) => [number, number];
  readonly apply_atome_bevy_visibility: (a: any) => [number, number];
  readonly run_atome_bevy_renderer: (a: number, b: number, c: number, d: number, e: any) => [number, number];
  readonly wasm_bindgen__convert__closures_____invoke__h35bfebd84f6c108c: (a: number, b: number) => void;
  readonly wasm_bindgen__closure__destroy__h0aba2fb1a3850afa: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h04caba32a0af2bd1: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h394380805492be99: (a: number, b: number, c: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h5ca707e6c08eb6c7: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__h9761e79704d05d65: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h0f2406f0952c411f: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
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
