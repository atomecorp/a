//! A Lottie atome played: its stored file read once by `atome-lottie`, its clock (`time_seconds`, `playing`,
//! `loop`, from the atome's description) giving the frame of a time, and each new frame encoded by velato and drawn
//! on the module's device (`gpu.rs`). The page's clock (`performance.now()`, in seconds) is passed in by the glue.
use std::collections::HashMap;

use velato::vello::kurbo::Affine;
use wasm_bindgen::prelude::*;

use crate::gpu::{LottieCanvas, gpu, now};

fn js_error(error: String) -> JsValue {
    JsValue::from_str(&error)
}

#[wasm_bindgen]
pub struct LottiePlayer {
    lottie: atome_lottie::LoadedLottie,
    renderer: velato::Renderer,
    canvas: LottieCanvas,
    transform: Affine,
    source_time: f64,
    playing: bool,
    looping: bool,
    /// The page second its clock started from `source_time`.
    started_at: f64,
    shown: Option<u64>,
}

#[wasm_bindgen]
impl LottiePlayer {
    /// `width × height`: the atome's texture; `destination_rect`: where the composition lies in it, in its pixels
    /// (`x, y, width, height`: the media fit).
    #[wasm_bindgen(constructor)]
    pub fn new(
        bytes: &[u8],
        width: u32,
        height: u32,
        destination_rect: &[f32],
    ) -> Result<LottiePlayer, JsValue> {
        let &[x, y, rect_width, rect_height] = destination_rect else {
            return Err(js_error("lottie_geometry_invalid".into()));
        };
        if [x, y, rect_width, rect_height]
            .iter()
            .any(|value| !value.is_finite())
            || rect_width <= 0.0
            || rect_height <= 0.0
            || width == 0
            || height == 0
        {
            return Err(js_error("lottie_geometry_invalid".into()));
        }
        let lottie = atome_lottie::load(bytes).map_err(js_error)?;
        let scale_x = f64::from(rect_width) / lottie.report.width as f64;
        let scale_y = f64::from(rect_height) / lottie.report.height as f64;
        let gpu = gpu().map_err(js_error)?;
        let canvas = LottieCanvas::new(&gpu, [width, height]).map_err(js_error)?;
        crate::diagnostics::record(|diagnostics| diagnostics.players += 1);
        Ok(LottiePlayer {
            lottie,
            renderer: velato::Renderer::new(),
            canvas,
            transform: Affine::translate((f64::from(x), f64::from(y)))
                * Affine::scale_non_uniform(scale_x, scale_y),
            source_time: 0.0,
            playing: false,
            looping: true,
            started_at: 0.0,
            shown: None,
        })
    }

    /// The atome's clock as its description holds it, from the page second `now`; the next `frame` draws again.
    pub fn set_clock(
        &mut self,
        time_seconds: f64,
        playing: bool,
        looping: bool,
        now: f64,
    ) -> Result<(), JsValue> {
        if !time_seconds.is_finite() || !now.is_finite() {
            return Err(js_error("lottie_clock_invalid".into()));
        }
        self.source_time = time_seconds;
        self.playing = playing;
        self.looping = looping;
        self.started_at = now;
        self.shown = None;
        Ok(())
    }

    pub fn playing(&self) -> bool {
        self.playing
    }

    fn seconds(&self, now: f64) -> f64 {
        if self.playing {
            self.source_time + (now - self.started_at)
        } else {
            self.source_time
        }
    }

    /// The frame of the page second `now` as a bitmap, or nothing when it is the frame already shown.
    pub fn frame(&mut self, now_seconds: f64) -> Result<Option<web_sys::ImageBitmap>, JsValue> {
        let seconds = self.seconds(now_seconds);
        let clock = self.lottie.clock;
        let index = clock.frame_index(seconds, self.looping);
        if self.shown == Some(index) {
            return Ok(None);
        }
        let started = now();
        let scene = self.renderer.render_to_vello_scene(
            &self.lottie.composition,
            &HashMap::new(),
            clock.frame_at(seconds, self.looping),
            self.transform,
            1.0,
        );
        let build_ms = now() - started;
        crate::diagnostics::record(|diagnostics| {
            diagnostics.scene_build_ms = build_ms;
            diagnostics.scene_build_max_ms = diagnostics.scene_build_max_ms.max(build_ms);
            diagnostics.frames_built = diagnostics.frames_built.saturating_add(1);
            diagnostics.last_frame = index;
        });
        let gpu = gpu().map_err(js_error)?;
        let bitmap = self
            .canvas
            .draw(&gpu, &scene)
            .inspect_err(|error| {
                crate::diagnostics::record(|diagnostics| {
                    diagnostics.last_error = Some(error.clone())
                })
            })
            .map_err(js_error)?;
        self.shown = Some(index);
        Ok(Some(bitmap))
    }

    /// The page second the next frame starts, or nothing when the atome is paused or a non-looping animation shows
    /// its last frame.
    pub fn next_frame_at(&self, now_seconds: f64) -> Option<f64> {
        if !self.playing {
            return None;
        }
        self.lottie
            .clock
            .next_frame_seconds(self.seconds(now_seconds), self.looping)
            .map(|at| self.started_at + (at - self.source_time))
    }
}

impl Drop for LottiePlayer {
    /// A player freed by the glue (`free()`): its atome left the scene or took another file.
    fn drop(&mut self) {
        crate::diagnostics::record(|diagnostics| diagnostics.players -= 1);
    }
}
