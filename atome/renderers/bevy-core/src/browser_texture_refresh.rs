//! A browser texture filled again by a new `ImageBitmap` (a Lottie's frames, drawn by the Lottie module on its own
//! WebGPU device): the bitmap goes into the image the atome already shows, through the same GPU copy and
//! conversion as its first one (`browser_texture_web.rs`), so no image is made per frame.
//!
//! A refresh names the atome (`AtomeEntityTable`, else `AtomeUiEntityTable`). It waits while the atome or an image
//! of the bitmap's size is not there yet (its spawn or its texture patch is still queued); only the latest bitmap of
//! an atome waits. An atome despawned while a frame hook is set is reported once (`take_gone_browser_textures`), so
//! the glue frees what it kept for it (a Lottie player), playing or paused; its waiting bitmap is dropped.
//!
//! The frame hook (`set_browser_texture_frame_hook`) is the glue function the renderer calls at the start of each of
//! its frames (`First`): a player draws there, so its bitmap is taken in the same frame (`PostUpdate`) and copied
//! before the cameras draw — one frame per renderer frame, never one drawn and dropped.
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
};

use bevy::prelude::*;
use wasm_bindgen::{JsCast, JsValue};

use crate::{components::AtomeEntityTable, types::AtomeTexture, ui::AtomeUiEntityTable};

thread_local! {
    static WAITING: RefCell<HashMap<String, wgpu::ExternalImageSource>> = RefCell::new(HashMap::new());
    static GONE: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    static FRAME_HOOK: RefCell<Option<js_sys::Function>> = const { RefCell::new(None) };
    /// The spatial mask of a browser image, applied again to each new bitmap.
    static MASKS: RefCell<HashMap<AssetId<Image>, AtomeTexture>> = RefCell::new(HashMap::new());
    static REFRESHED: Cell<u64> = const { Cell::new(0) };
}

/// Queues `bitmap` for the atome `id`.
pub fn queue_browser_texture_refresh(id: String, bitmap: JsValue) -> Result<(), String> {
    let bitmap = bitmap
        .dyn_into::<web_sys::ImageBitmap>()
        .map_err(|_| format!("bevy_texture_refresh_source_invalid:{id}"))?;
    WAITING.with(|waiting| {
        waiting
            .borrow_mut()
            .insert(id, wgpu::ExternalImageSource::ImageBitmap(bitmap))
    });
    Ok(())
}

/// The atomes despawned since the last call (while a frame hook was set).
pub fn take_gone_browser_textures() -> Vec<String> {
    GONE.with(|gone| std::mem::take(&mut *gone.borrow_mut()))
}

/// An atome left the scene: its waiting bitmap goes, and the glue hears of it when it listens (a frame hook set).
pub(crate) fn forget_atome(id: &str) {
    WAITING.with(|waiting| waiting.borrow_mut().remove(id));
    if FRAME_HOOK.with(|slot| slot.borrow().is_some()) {
        GONE.with(|gone| gone.borrow_mut().push(id.to_string()));
    }
}

/// Bitmaps the render world copied into an atome's image by a refresh, since the start.
pub fn browser_texture_refreshes() -> u64 {
    REFRESHED.with(Cell::get)
}

pub(crate) fn count_refresh() {
    REFRESHED.with(|count| count.set(count.get() + 1));
}

/// The function called at the start of each renderer frame (a function, or `null` to stop).
pub fn set_browser_texture_frame_hook(hook: JsValue) -> Result<(), String> {
    let hook = if hook.is_null() {
        None
    } else {
        Some(
            hook.dyn_into::<js_sys::Function>()
                .map_err(|_| "bevy_frame_hook_invalid".to_string())?,
        )
    };
    FRAME_HOOK.with(|slot| *slot.borrow_mut() = hook);
    Ok(())
}

pub(crate) fn run_frame_hook(mut diagnostics: ResMut<crate::types::AtomeRendererDiagnostics>) {
    let hook = FRAME_HOOK.with(|slot| slot.borrow().clone());
    if let Some(Err(error)) = hook.map(|hook| hook.call0(&JsValue::NULL)) {
        diagnostics.last_error = Some(format!(
            "bevy_frame_hook_failed:{}",
            error.as_string().unwrap_or_else(|| format!("{error:?}"))
        ));
    }
}

pub(crate) fn remember_mask(image: AssetId<Image>, mask: Option<&AtomeTexture>) {
    if let Some(mask) = mask {
        MASKS.with(|masks| masks.borrow_mut().insert(image, mask.clone()));
    }
}

pub(crate) fn forget_dropped_masks(images: &Assets<Image>) {
    MASKS.with(|masks| {
        masks
            .borrow_mut()
            .retain(|image, _| images.contains(*image))
    });
}

fn image_of(world: &World, id: &str) -> Option<AssetId<Image>> {
    let entity = world
        .resource::<AtomeEntityTable>()
        .by_id
        .get(id)
        .or_else(|| world.get_resource::<AtomeUiEntityTable>()?.by_id.get(id))
        .copied()?;
    world
        .get::<Sprite>(entity)
        .map(|sprite| sprite.image.id())
        .or_else(|| world.get::<ImageNode>(entity).map(|node| node.image.id()))
}

/// Gives each waiting bitmap to the image of its atome (after the frame's ops: `PostUpdate`).
pub(crate) fn apply_browser_texture_refreshes(world: &mut World) {
    let waiting = WAITING.with(|waiting| std::mem::take(&mut *waiting.borrow_mut()));
    if waiting.is_empty() {
        return;
    }
    let mut still = HashMap::new();
    for (id, source) in waiting {
        let Some(image) = image_of(world, &id) else {
            still.insert(id, source);
            continue;
        };
        let size = world
            .resource::<Assets<Image>>()
            .get(image)
            .map(|image| [image.width(), image.height()]);
        if size != Some([source.width(), source.height()]) {
            still.insert(id, source);
            continue;
        }
        let mask = MASKS.with(|masks| masks.borrow().get(&image).cloned());
        crate::browser_texture_web::queue_refresh_job(image, source, mask);
    }
    WAITING.with(|waiting| {
        let mut waiting = waiting.borrow_mut();
        for (id, source) in still {
            waiting.entry(id).or_insert(source);
        }
    });
}
