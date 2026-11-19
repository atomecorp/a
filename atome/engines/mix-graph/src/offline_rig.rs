// An offline rig for the R-191 tests: the real capture and graph effects,
// driven at any block size and sample rate, each strip fed by a signal
// computed per frame, so a render can be compared across block sizes.

use crate::shared::StripCapture;
use crate::{MixGraph, MixGraphEffect, Program};
use kira::Frame;
use kira::effect::Effect;
use kira::info::MockInfoBuilder;

pub(crate) struct Offline {
    pub(crate) graph: MixGraph,
    effect: MixGraphEffect,
    captures: Vec<(String, StripCapture)>,
    pub(crate) rate: u32,
    rendered: usize,
}

// `before` runs ahead of the apply (device channels, instruments, assets).
pub(crate) fn offline(json: &str, rate: u32, before: impl FnOnce(&mut MixGraph)) -> Offline {
    try_offline(json, rate, before).expect("apply")
}

pub(crate) fn try_offline(
    json: &str,
    rate: u32,
    before: impl FnOnce(&mut MixGraph),
) -> Result<Offline, String> {
    let mut graph = MixGraph::new(rate);
    before(&mut graph);
    let program: Program = serde_json::from_str(json).map_err(|error| error.to_string())?;
    let captures = program
        .strips
        .iter()
        .map(|strip| {
            (
                strip.id.clone(),
                StripCapture::new(graph.capture_slot(&strip.id)),
            )
        })
        .collect();
    graph.apply(program)?;
    let mut effect = graph.effect_builder().into_effect();
    effect.init(rate, 4096);
    Ok(Offline {
        graph,
        effect,
        captures,
        rate,
        rendered: 0,
    })
}

impl Offline {
    // Renders `frames` frames in blocks of `block`; `input(strip, frame)` feeds each strip's track.
    pub(crate) fn render(
        &mut self,
        frames: usize,
        block: usize,
        input: &dyn Fn(&str, usize) -> Frame,
    ) -> Vec<Frame> {
        let info = MockInfoBuilder::new().build();
        let mut out = Vec::with_capacity(frames);
        let mut done = 0;
        while done < frames {
            let length = block.min(frames - done);
            for (strip, capture) in &mut self.captures {
                let mut buffer: Vec<Frame> = (0..length)
                    .map(|index| input(strip, self.rendered + done + index))
                    .collect();
                capture.process(&mut buffer, 1.0 / f64::from(self.rate), &info);
            }
            let mut mix = vec![Frame::ZERO; length];
            self.effect.render(&mut mix);
            out.extend_from_slice(&mix);
            done += length;
        }
        self.rendered += frames;
        out
    }
}

// A reproducible noise in −1..1.
pub(crate) fn noise(index: usize, seed: u32) -> f32 {
    let mut x = (index as u32).wrapping_mul(2_654_435_761) ^ seed.wrapping_mul(40_503);
    x ^= x >> 15;
    x = x.wrapping_mul(2_246_822_519);
    x ^= x >> 13;
    (x >> 8) as f32 / 8_388_608.0 - 1.0
}
