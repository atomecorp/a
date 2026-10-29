// Kira host integration shared by the native (Tauri/iOS) and Web engines:
// one sub-track per strip, voices routed to their strip, programs applied.

use crate::{MixGraph, Program, StripLevel};
use kira::backend::Backend;
use crate::voice::VoiceSound;
use kira::sound::static_sound::StaticSoundHandle;
use kira::track::{MainTrackBuilder, TrackBuilder, TrackHandle};
use kira::AudioManager;
use std::collections::HashMap;

pub struct MixHost {
    graph: MixGraph,
    strips: HashMap<String, TrackHandle>,
    voice_strips: HashMap<String, String>,
}

impl Default for MixHost {
    fn default() -> Self {
        Self::new()
    }
}

impl MixHost {
    pub fn new() -> Self {
        Self { graph: MixGraph::new(48_000), strips: HashMap::new(), voice_strips: HashMap::new() }
    }

    // The main track carries the graph; pass it to `AudioManagerSettings`.
    pub fn main_track_builder(&self) -> MainTrackBuilder {
        MainTrackBuilder::new().with_effect(self.graph.effect_builder())
    }

    pub fn apply<B: Backend>(&mut self, manager: &mut AudioManager<B>, program: Program) -> Result<usize, String> {
        for strip in &program.strips {
            if self.strips.contains_key(&strip.id) {
                continue;
            }
            let track = manager
                .add_sub_track(TrackBuilder::new().with_effect(self.graph.capture_builder(&strip.id)))
                .map_err(|error| format!("mix strip track limit: {error}"))?;
            self.strips.insert(strip.id.clone(), track);
        }
        let count = program.strips.len();
        let live: Vec<String> = program.strips.iter().map(|strip| strip.id.clone()).collect();
        self.graph.apply(program)?;
        // Dropping a Kira track handle removes the sub-track.
        self.strips.retain(|id, _| live.contains(id));
        Ok(count)
    }

    // Records which strip a voice plays on; `None` plays on the main track.
    pub fn route_voice(&mut self, voice_id: &str, strip_id: Option<&str>) {
        match strip_id.filter(|id| !id.is_empty()) {
            Some(strip_id) => {
                self.voice_strips.insert(voice_id.to_string(), strip_id.to_string());
            }
            None => {
                self.voice_strips.remove(voice_id);
            }
        }
    }

    pub fn forget_voice(&mut self, voice_id: &str) {
        self.voice_strips.remove(voice_id);
    }

    // Starts the voice on its routed strip; the routing is consumed at start.
    pub fn play<B: Backend>(&mut self, manager: &mut AudioManager<B>, voice_id: &str, sound: VoiceSound) -> Result<StaticSoundHandle, String> {
        let strip = self.voice_strips.remove(voice_id).and_then(|strip_id| self.strips.get_mut(&strip_id));
        match strip {
            Some(track) => track.play(sound).map_err(|error| format!("mix strip play: {error}")),
            None => manager.play(sound).map_err(|error| format!("play: {error}")),
        }
    }

    pub fn levels(&self) -> Vec<StripLevel> {
        self.graph.levels()
    }

    pub fn cut_tail(&mut self, module_id: &str) -> Result<(), String> {
        self.graph.cut_tail(module_id)
    }

    pub fn module_state(&self, module_id: &str) -> Option<u8> {
        self.graph.module_state(module_id)
    }

    pub fn load_asset(&mut self, asset_id: &str, asset: crate::dsp_module::StoredAsset) {
        self.graph.load_asset(asset_id, asset);
    }

    pub fn unload_asset(&mut self, asset_id: &str) -> Result<(), String> {
        self.graph.unload_asset(asset_id)
    }

    pub fn graph_mut(&mut self) -> &mut MixGraph {
        &mut self.graph
    }

    pub fn graph(&self) -> &MixGraph {
        &self.graph
    }

    // Extra device channel pairs, drained by the backend after each block.
    pub fn aux_outputs(&self) -> std::sync::Arc<crate::AuxOutputs> {
        self.graph.aux_outputs()
    }
}
