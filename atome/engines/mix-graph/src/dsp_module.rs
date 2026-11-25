// Mixer modules of type `dsp`: an atome-dsp processor (amp, room, cabinet,
// echo, filters, dynamics, band splits) run inside the graph. `effect` names
// its catalog kind; every parameter is written by its key into a lock-free
// slot the render thread reads, and an amp or a convolution takes its capture
// or impulse response from the assets loaded beforehand by id. A keyed kind
// listens to the key the graph hands it; a split kind keeps its extra ports
// for the graph to route.

use crate::dsp::AtomicParam;
use crate::modulation::{ParamMod, Target};
use crate::program::ModuleSpec;
use atome_dsp::catalog::{ModuleAsset, ModuleKind};
use atome_dsp::convolution::Impulse;
use atome_dsp::delay::DelayLine;
use atome_dsp::oversample::Oversampled;
use atome_dsp::{KeyBlock, ParamBuffer, Processor as DspProcessor, StereoBlock};
use kira::Frame;
use std::collections::HashMap;
use std::sync::Arc;

pub const MODULE_TYPE: &str = "dsp";
pub const ASSET_PARAM: &str = "asset_id";
// Audio-rate parameters one module may take at once (a filter's cutoff and resonance…).
const MAX_RATED: usize = 8;

// The decoded asset as loaded by its owner (a `.nam` capture, an impulse
// response); each module built from it gets its own copy.
#[derive(Clone)]
pub enum StoredAsset {
    AmpCapture(Arc<String>),
    Impulse {
        left: Arc<Vec<f32>>,
        right: Option<Arc<Vec<f32>>>,
        sample_rate: f64,
    },
}

pub type AssetStore = HashMap<String, StoredAsset>;

pub fn kind_of(spec: &ModuleSpec) -> Result<ModuleKind, String> {
    let key = spec
        .effect
        .as_deref()
        .ok_or_else(|| format!("dsp module {} has no kind", spec.id))?;
    ModuleKind::from_key(key).map_err(|error| error.to_string())
}

fn asset_for(
    kind: ModuleKind,
    spec: &ModuleSpec,
    assets: &AssetStore,
) -> Result<ModuleAsset, String> {
    if !matches!(kind, ModuleKind::Amp | ModuleKind::Convolution) {
        return Ok(ModuleAsset::None);
    }
    let asset_id = spec
        .text(ASSET_PARAM)
        .ok_or_else(|| format!("dsp module {} needs `{ASSET_PARAM}`", spec.id))?;
    let stored = assets
        .get(asset_id)
        .ok_or_else(|| format!("dsp asset {asset_id} is not loaded"))?;
    match (kind, stored) {
        (ModuleKind::Amp, StoredAsset::AmpCapture(json)) => {
            Ok(ModuleAsset::AmpCapture(json.as_ref().clone()))
        }
        (
            ModuleKind::Convolution,
            StoredAsset::Impulse {
                left,
                right,
                sample_rate,
            },
        ) => {
            let impulse = Impulse::new(
                left.as_ref().clone(),
                right.as_ref().map(|right| right.as_ref().clone()),
                *sample_rate,
            )
            .map_err(|error| format!("dsp asset {asset_id}: {error:?}"))?;
            Ok(ModuleAsset::Impulse(impulse))
        }
        _ => Err(format!(
            "dsp asset {asset_id} does not suit a {} module",
            kind.key()
        )),
    }
}

// One slot per parameter of the kind, in its table order.
pub fn parameter_slots(kind: ModuleKind) -> Vec<AtomicParam> {
    kind.params()
        .iter()
        .map(|spec| AtomicParam::new(spec.default))
        .collect()
}

// One slot per live measurement of the kind, in its `readings` order.
pub fn reading_slots(kind: ModuleKind) -> Vec<AtomicParam> {
    kind.readings()
        .iter()
        .map(|_| AtomicParam::new(0.0))
        .collect()
}

pub fn write_parameters(kind: ModuleKind, slots: &[AtomicParam], spec: &ModuleSpec) {
    for (slot, param) in slots.iter().zip(kind.params()) {
        slot.set(param.clamp(spec.number(param.key, param.default as f64) as f32));
    }
}

pub struct DspRuntime {
    processor: Box<dyn DspProcessor>,
    applied: Vec<f32>,
    left: Vec<f32>,
    right: Vec<f32>,
    // Ports 1.. of the last split block, and the key as planar samples.
    extra: Vec<(Vec<f32>, Vec<f32>)>,
    key: Option<(Vec<f32>, Vec<f32>)>,
    latency: usize,
    // While bypassed, a module with latency keeps the timing it promised.
    compensation: Option<[DelayLine; 2]>,
    pub has_tail: bool,
    // How long it rings as built (a frozen stem never stands for a long one, R-370).
    pub tail_frames: u32,
}

// The 2× or 4× a module asks for (R-191): any kind but a generator, a keyed
// kind, a split or a modulator, whose extra signals would not cross the rates.
fn oversampled(
    kind: ModuleKind,
    spec: &ModuleSpec,
    processor: Box<dyn DspProcessor>,
) -> Result<Box<dyn DspProcessor>, String> {
    let factor = match spec.oversample {
        None | Some(1) => return Ok(processor),
        Some(factor @ (2 | 4)) => factor as usize,
        Some(other) => {
            return Err(format!(
                "dsp module {}: oversampling is 2× or 4×, not {other}×",
                spec.id
            ));
        }
    };
    if spec.key.is_some() || kind.outputs() > 1 || kind.control_outputs() > 0 {
        return Err(format!(
            "dsp module {}: a {} module is not oversampled (its key, ports or control stay at the device rate)",
            spec.id,
            kind.key()
        ));
    }
    Ok(Box::new(Oversampled::new(processor, factor)?))
}

impl DspRuntime {
    // Starts at the described values, not ramping toward them from the defaults.
    pub fn build(
        spec: &ModuleSpec,
        slots: &[AtomicParam],
        assets: &AssetStore,
        sample_rate: u32,
        block: usize,
    ) -> Result<Self, String> {
        let kind = kind_of(spec)?;
        if kind.is_generator() {
            return Err(format!(
                "dsp module {}: a generator is a strip input, not a chain module",
                spec.id
            ));
        }
        let built = kind
            .build(asset_for(kind, spec, assets)?)
            .map_err(|error| error.to_string())?;
        let mut processor = oversampled(kind, spec, built)?;
        processor.prepare(sample_rate as f32, block);
        let latency = processor.latency_frames() as usize;
        let compensation = (latency > 0).then(|| {
            let mut lines = [DelayLine::new(), DelayLine::new()];
            for line in &mut lines {
                line.allocate(latency + 1);
            }
            lines
        });
        let extra = (0..processor.extra_outputs())
            .map(|_| (vec![0.0; block], vec![0.0; block]))
            .collect();
        let key = processor
            .takes_key()
            .then(|| (vec![0.0; block], vec![0.0; block]));
        let mut runtime = Self {
            has_tail: processor.tail_frames() > 0,
            tail_frames: processor.tail_frames(),
            extra,
            key,
            processor,
            applied: vec![f32::NAN; kind.params().len()],
            left: vec![0.0; block],
            right: vec![0.0; block],
            latency,
            compensation,
        };
        runtime.follow(slots);
        runtime.reset();
        Ok(runtime)
    }

    pub fn latency(&self) -> usize {
        self.latency
    }

    // Hands the processor only the values that changed since the last block.
    fn follow(&mut self, slots: &[AtomicParam]) {
        for (index, (slot, applied)) in slots.iter().zip(self.applied.iter_mut()).enumerate() {
            let value = slot.get();
            if value != *applied {
                *applied = value;
                self.processor.set_param(index as u32, value);
            }
        }
    }

    // Publishes the processor's measurements of the block just processed.
    pub fn publish(&self, slots: &[AtomicParam]) {
        for (slot, value) in slots.iter().zip(self.processor.readings()) {
            slot.set(*value);
        }
    }

    pub fn ports(&self) -> usize {
        self.extra.len() + 1
    }

    pub fn control(&self, output: usize) -> &[f32] {
        self.processor.control(output)
    }

    // The modulated parameters of this step: an audio-rate one is handed
    // every frame (returned), any other its first value; both are re-read
    // from their slot once the modulation is gone.
    fn modulate<'a>(&mut self, mods: &'a [ParamMod], rated: &mut [ParamBuffer<'a>]) -> usize {
        let mut count = 0;
        for read in mods {
            let Target::Parameter(index) = read.target else {
                continue;
            };
            self.applied[index] = f32::NAN;
            let id = index as u32;
            if self.processor.audio_rate(id) && count < rated.len() {
                rated[count] = ParamBuffer {
                    id,
                    values: &read.values,
                };
                count += 1;
            } else if let Some(value) = read.values.first() {
                self.processor.set_param(id, *value);
            }
        }
        count
    }

    fn run(&mut self, frames: usize) {
        let mut block = StereoBlock::new(&mut self.left[..frames], &mut self.right[..frames]);
        self.processor.process(&mut block);
    }

    // `key`, when wired, drives a keyed kind; `split` keeps ports 1.. apart
    // instead of folding them back into `buffer`.
    pub fn process(
        &mut self,
        buffer: &mut [Frame],
        slots: &[AtomicParam],
        key: Option<&[Frame]>,
        split: bool,
        mods: &[ParamMod],
    ) {
        self.follow(slots);
        let frames = buffer.len();
        let mut rated = [ParamBuffer { id: 0, values: &[] }; MAX_RATED];
        let count = self.modulate(mods, &mut rated);
        for buffer in &mut rated[..count] {
            buffer.values = &buffer.values[..frames];
        }
        for (index, frame) in buffer.iter().enumerate() {
            self.left[index] = frame.left;
            self.right[index] = frame.right;
        }
        let mut block = StereoBlock::new(&mut self.left[..frames], &mut self.right[..frames]);
        match (key, self.key.as_mut()) {
            (Some(key), Some((key_left, key_right))) => {
                for (index, frame) in key.iter().take(frames).enumerate() {
                    key_left[index] = frame.left;
                    key_right[index] = frame.right;
                }
                self.processor.process_keyed(
                    &mut block,
                    KeyBlock {
                        left: &key_left[..frames],
                        right: &key_right[..frames],
                    },
                );
            }
            _ if split && !self.extra.is_empty() => {
                let count = self.extra.len();
                let mut ports: [StereoBlock; atome_dsp::crossover::MAX_BANDS - 1] =
                    std::array::from_fn(|_| StereoBlock::new(&mut [], &mut []));
                for (slot, (left, right)) in ports.iter_mut().zip(self.extra.iter_mut()) {
                    *slot = StereoBlock::new(&mut left[..frames], &mut right[..frames]);
                }
                self.processor
                    .process_ports(&mut block, &mut ports[..count]);
            }
            _ if count > 0 => self
                .processor
                .process_modulated(&mut block, &rated[..count]),
            _ => self.processor.process(&mut block),
        }
        for (index, frame) in buffer.iter_mut().enumerate() {
            *frame = Frame::new(self.left[index], self.right[index]);
        }
    }

    pub fn add_port(&self, port: usize, out: &mut [Frame]) {
        let Some((left, right)) = self.extra.get(port.wrapping_sub(1)) else {
            return;
        };
        for (index, frame) in out.iter_mut().enumerate() {
            *frame += Frame::new(left[index], right[index]);
        }
    }

    // Bypassed: the dry signal, delayed by the latency the graph compensates.
    pub fn pass(&mut self, buffer: &mut [Frame]) {
        let Some([left, right]) = self.compensation.as_mut() else {
            return;
        };
        let delay = self.latency as f32;
        for frame in buffer.iter_mut() {
            let out = Frame::new(left.read(delay), right.read(delay));
            left.push(frame.left);
            right.push(frame.right);
            *frame = out;
        }
    }

    // Draining: silence in, the ring added over the dry signal; returns the
    // tail's peak so the caller can tell when it has died out.
    pub fn drain(&mut self, buffer: &mut [Frame], slots: &[AtomicParam]) -> f32 {
        self.follow(slots);
        let frames = buffer.len();
        self.left[..frames].fill(0.0);
        self.right[..frames].fill(0.0);
        self.run(frames);
        self.pass(buffer);
        let mut peak = 0.0f32;
        for (index, frame) in buffer.iter_mut().enumerate() {
            let ring = Frame::new(self.left[index], self.right[index]);
            peak = peak.max(ring.left.abs()).max(ring.right.abs());
            *frame += ring;
        }
        peak
    }

    pub fn set_transport(&mut self, transport: &atome_dsp::Transport) {
        self.processor.set_transport(transport);
    }

    pub fn reset(&mut self) {
        self.processor.reset();
        if let Some(lines) = self.compensation.as_mut() {
            for line in lines {
                line.clear();
            }
        }
    }
}
