pub mod background;
pub mod plugin;
pub mod render_math;
pub mod render_ops;
pub mod selection_overlay;
pub mod spawn;
pub mod texture;
pub mod types;
pub mod video_texture;
pub mod waveform_playback_overlay;

pub use plugin::{apply_render_ops, AtomeBevyRendererPlugin};
pub use render_math::{atome_rect_transform, color_from_rgba, depth_for_layer};
pub use render_ops::*;
pub use types::*;

#[cfg(test)]
mod tests;
