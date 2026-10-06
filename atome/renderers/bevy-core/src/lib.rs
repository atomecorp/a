pub mod mystic_capture;
pub mod backdrop_blur;
pub mod backdrop_surface;
pub mod background;
pub mod clip;
pub mod clip_polygon;
pub mod components;
pub mod plugin;
pub mod procedural_sdf;
pub mod project_view;
pub mod render_math;
pub mod render_ops;
pub mod resource_ops;
pub mod selection_overlay;
pub mod shadow_texture;
pub mod shape_sdf;
mod shape_texture;
pub mod surface_paint;
mod render_style_ops;
pub mod shape_shadow_overlay;
pub mod spawn;
pub mod texture;
pub mod types;
mod types_procedural;
mod types_ops;
pub mod ui;
pub mod video_diagnostics;
pub mod video_external_texture;
#[cfg(target_arch = "wasm32")]
pub mod video_external_web;
pub mod waveform_playback_overlay;
pub mod workspace_backdrop;
pub mod workspace_blur;

pub use plugin::{apply_render_ops, AtomeBevyRendererPlugin};
pub use project_view::{AtomeProjectSpacePatch, AtomeProjectView, AtomeProjectViewPatch};
pub use render_math::{atome_rect_transform, color_from_rgba, depth_for_layer};
pub use render_ops::*;
pub use types::*;
pub use ui::*;
pub use video_diagnostics::*;

#[cfg(test)]
mod backdrop_blur_tests;
#[cfg(test)]
mod procedural_sdf_tests;
#[cfg(test)]
mod mask_rounding_live_tests;
#[cfg(test)]
mod shadow_style_tests;
#[cfg(test)]
mod shape_sdf_tests;
#[cfg(test)]
mod shape_shadow_overlay_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod texture_sprite_color_tests;
#[cfg(test)]
mod video_external_texture_tests;
#[cfg(test)]
mod workspace_blur_tests;
pub mod animated_png;
mod animated_png_pixels;

#[cfg(test)]
#[path = "../../../../tests/rendering/panel_surface_paint.rs"]
mod panel_surface_paint_tests;

#[cfg(test)]
#[path = "../../../../tests/rendering/shadow_outer_knockout.rs"]
mod shadow_outer_knockout_tests;

#[cfg(test)]
#[path = "../../../../tests/rendering/persistent_wallpaper.rs"]
mod persistent_wallpaper_tests;
