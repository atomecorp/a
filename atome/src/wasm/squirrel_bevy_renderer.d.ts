/* tslint:disable */
/* eslint-disable */

/**
 * Aims the lens at `index` (none: back to rest); the target sizes when the aim changed.
 */
export function aim_atome_bevy_linear_lens(tree_id: string, index: number | null | undefined, reduced_motion: boolean): Float64Array | undefined;

export function apply_atome_bevy_despawn(id: string): void;

export function apply_atome_bevy_layer(patch: any): void;

export function apply_atome_bevy_ops(ops: any): void;

export function apply_atome_bevy_project_view(patch: any): void;

export function apply_atome_bevy_reparent(patch: any): void;

export function apply_atome_bevy_resource(patch: any): void;

export function apply_atome_bevy_scene_effects(patch: any): void;

export function apply_atome_bevy_spawn(node: any): void;

export function apply_atome_bevy_style(patch: any): void;

export function apply_atome_bevy_surface(patch: any): void;

export function apply_atome_bevy_surface_background(patch: any): void;

export function apply_atome_bevy_text_metadata(patch: any): void;

export function apply_atome_bevy_transform(patch: any): void;

export function apply_atome_bevy_ui_ops(ops: any): void;

export function apply_atome_bevy_visibility(patch: any): void;

export function attach_atome_bevy_linear_lens(tree_id: string, spec: any): void;

/**
 * A press on a list still gliding: true, and a glide stops where it shows.
 */
export function catch_atome_bevy_scroll(tree_id: string, area: string): boolean;

/**
 * A tool's cell `[x, y, size]` on the geometry aimed at.
 */
export function cell_atome_bevy_linear_lens(tree_id: string, index: number): Float64Array | undefined;

/**
 * The tree described (again) at rest: its lists and the records each one moves.
 */
export function describe_atome_bevy_scroll_tree(tree_id: string, spec: any): void;

export function detach_atome_bevy_linear_lens(tree_id: string): void;

export function detach_atome_bevy_scroll_tree(tree_id: string): void;

export function drag_atome_bevy_scroll(tree_id: string, area: string, y: number, at: number): void;

export function drain_atome_bevy_ui_events(): any;

export function hover_atome_bevy_linear_lens(tree_id: string, value: number): number | undefined;

export function measure_atome_bevy_linear_lens(tree_id: string): any;

export function notify_atome_bevy_video_frame(id: string, frame_version: number): void;

/**
 * Every list of the tree: the offset it shows and whether it still moves.
 */
export function poll_atome_bevy_scroll(tree_id: string): any;

/**
 * `at`: the pointer event's time (ms), the drag's own clock.
 */
export function press_atome_bevy_scroll(tree_id: string, area: string, y: number, at: number): void;

export function queue_atome_bevy_ui_events(events: any): void;

export function read_atome_bevy_ui_diagnostics(): any;

export function read_atome_bevy_video_backend_capabilities(): any;

export function read_atome_bevy_video_copy_diagnostics(): any;

export function read_atome_bevy_web_diagnostics(): any;

export function rebase_atome_bevy_linear_lens(tree_id: string, delta: number): void;

/**
 * The band's records described again at rest: each tool's records with their new rest boxes.
 */
export function refresh_atome_bevy_linear_lens(tree_id: string, records: any): void;

export function register_atome_bevy_font(weight: number, bytes: Uint8Array): void;

export function release_atome_bevy_scroll(tree_id: string, area: string, at: number): void;

export function request_atome_bevy_redraw(): void;

export function reset_atome_bevy_video_copy_diagnostics(): any;

export function reset_atome_bevy_web_diagnostics(): any;

export function rest_atome_bevy_linear_lens(tree_id: string): void;

export function run_atome_bevy_preview_renderer(canvas_selector: string, width: number, height: number, surface_metrics: any, initial_scene: any): void;

export function run_atome_bevy_renderer(canvas_selector: string, width: number, height: number, surface_metrics: any, initial_scene: any): void;

export function wheel_atome_bevy_scroll(tree_id: string, area: string, delta: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly aim_atome_bevy_linear_lens: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly apply_atome_bevy_despawn: (a: number, b: number, c: number) => void;
    readonly apply_atome_bevy_layer: (a: number, b: number) => void;
    readonly apply_atome_bevy_ops: (a: number, b: number) => void;
    readonly apply_atome_bevy_project_view: (a: number, b: number) => void;
    readonly apply_atome_bevy_reparent: (a: number, b: number) => void;
    readonly apply_atome_bevy_resource: (a: number, b: number) => void;
    readonly apply_atome_bevy_scene_effects: (a: number, b: number) => void;
    readonly apply_atome_bevy_spawn: (a: number, b: number) => void;
    readonly apply_atome_bevy_style: (a: number, b: number) => void;
    readonly apply_atome_bevy_surface: (a: number, b: number) => void;
    readonly apply_atome_bevy_surface_background: (a: number, b: number) => void;
    readonly apply_atome_bevy_text_metadata: (a: number, b: number) => void;
    readonly apply_atome_bevy_transform: (a: number, b: number) => void;
    readonly apply_atome_bevy_ui_ops: (a: number, b: number) => void;
    readonly apply_atome_bevy_visibility: (a: number, b: number) => void;
    readonly attach_atome_bevy_linear_lens: (a: number, b: number, c: number, d: number) => void;
    readonly catch_atome_bevy_scroll: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly cell_atome_bevy_linear_lens: (a: number, b: number, c: number, d: number) => void;
    readonly describe_atome_bevy_scroll_tree: (a: number, b: number, c: number, d: number) => void;
    readonly detach_atome_bevy_linear_lens: (a: number, b: number) => void;
    readonly detach_atome_bevy_scroll_tree: (a: number, b: number) => void;
    readonly drag_atome_bevy_scroll: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly drain_atome_bevy_ui_events: (a: number) => void;
    readonly hover_atome_bevy_linear_lens: (a: number, b: number, c: number, d: number) => void;
    readonly measure_atome_bevy_linear_lens: (a: number, b: number, c: number) => void;
    readonly notify_atome_bevy_video_frame: (a: number, b: number, c: number) => void;
    readonly poll_atome_bevy_scroll: (a: number, b: number, c: number) => void;
    readonly press_atome_bevy_scroll: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly queue_atome_bevy_ui_events: (a: number, b: number) => void;
    readonly read_atome_bevy_ui_diagnostics: (a: number) => void;
    readonly read_atome_bevy_video_backend_capabilities: (a: number) => void;
    readonly read_atome_bevy_video_copy_diagnostics: (a: number) => void;
    readonly read_atome_bevy_web_diagnostics: (a: number) => void;
    readonly rebase_atome_bevy_linear_lens: (a: number, b: number, c: number, d: number) => void;
    readonly refresh_atome_bevy_linear_lens: (a: number, b: number, c: number, d: number) => void;
    readonly register_atome_bevy_font: (a: number, b: number, c: number) => void;
    readonly release_atome_bevy_scroll: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly request_atome_bevy_redraw: () => void;
    readonly reset_atome_bevy_video_copy_diagnostics: (a: number) => void;
    readonly reset_atome_bevy_web_diagnostics: (a: number) => void;
    readonly rest_atome_bevy_linear_lens: (a: number, b: number, c: number) => void;
    readonly run_atome_bevy_preview_renderer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly wheel_atome_bevy_scroll: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly run_atome_bevy_renderer: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly __wasm_bindgen_func_elem_145328: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_13674: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_70859: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_131269: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_5: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_6: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_7: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_70859_8: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_9: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_10: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_11: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13673_12: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_13672: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export5: (a: number, b: number) => void;
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
