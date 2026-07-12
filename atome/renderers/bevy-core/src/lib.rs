pub mod backdrop_blur;
pub mod background;
pub mod components;
pub mod plugin;
pub mod procedural_sdf;
pub mod render_math;
pub mod render_ops;
pub mod resource_ops;
pub mod selection_overlay;
pub mod shape_shadow_overlay;
pub mod spawn;
pub mod texture;
pub mod types;
pub mod ui;
pub mod video_diagnostics;
pub mod video_external_texture;
#[cfg(target_arch = "wasm32")]
pub mod video_external_web;
pub mod waveform_playback_overlay;
pub mod workspace_backdrop;
pub mod workspace_blur;

pub use plugin::{apply_render_ops, AtomeBevyRendererPlugin};
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
mod shape_shadow_overlay_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod texture_sprite_color_tests;
#[cfg(test)]
mod video_external_texture_tests;
#[cfg(test)]
mod workspace_blur_tests;
