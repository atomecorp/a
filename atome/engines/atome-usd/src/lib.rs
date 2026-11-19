//! OpenUSD scenes for the `scene3d` atome. `scene` is what a file describes and `codec` its bytes between the
//! reader's WASM module (`platforms/web/usd-wasm`) and the renderer (bevy-core `scene3d/`), which needs only these
//! two. The feature `reader` adds the reader itself (openusd: usda, usdc, usdz), kept out of the renderer's module.

pub mod codec;
pub mod scene;

#[cfg(feature = "reader")]
mod load;
#[cfg(feature = "reader")]
mod mesh;
#[cfg(feature = "reader")]
mod resolver;
#[cfg(feature = "reader")]
mod shade;

#[cfg(feature = "reader")]
pub use load::{detect_format, load_usd};
