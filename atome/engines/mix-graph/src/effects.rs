// Kira 0.12 effects hosted by the mixer: built from a module spec, tuned
// through their native handles, processed by the graph with Kira's own Info.

use crate::program::ModuleSpec;
use kira::effect::compressor::{CompressorBuilder, CompressorHandle};
use kira::effect::delay::{DelayBuilder, DelayHandle};
use kira::effect::distortion::{DistortionBuilder, DistortionHandle, DistortionKind};
use kira::effect::eq_filter::{EqFilterBuilder, EqFilterHandle, EqFilterKind};
use kira::effect::filter::{FilterBuilder, FilterHandle, FilterMode};
use kira::effect::reverb::{ReverbBuilder, ReverbHandle};
use kira::effect::{Effect, EffectBuilder};
use kira::{Decibels, Mix, Tween};
use std::time::Duration;

pub enum EffectHandle {
    Reverb(ReverbHandle),
    Delay(DelayHandle),
    Compressor(CompressorHandle),
    Eq(Vec<EqFilterHandle>),
    Filter(FilterHandle),
    Distortion(DistortionHandle),
}

pub struct BuiltEffect {
    pub effects: Vec<Box<dyn Effect>>,
    pub handle: EffectHandle,
    // Effects whose output outlives their input (reverb and delay tails).
    pub has_tail: bool,
}

const PARAM_TWEEN: Tween = Tween {
    start_time: kira::StartTime::Immediate,
    duration: Duration::from_millis(10),
    easing: kira::Easing::Linear,
};

fn ms(value: f64) -> Duration {
    Duration::from_secs_f64((value.max(0.0)) / 1000.0)
}

fn filter_mode(name: Option<&str>) -> FilterMode {
    match name {
        Some("band_pass") => FilterMode::BandPass,
        Some("high_pass") => FilterMode::HighPass,
        Some("notch") => FilterMode::Notch,
        _ => FilterMode::LowPass,
    }
}

fn distortion_kind(name: Option<&str>) -> DistortionKind {
    match name {
        Some("hard_clip") => DistortionKind::HardClip,
        _ => DistortionKind::SoftClip,
    }
}

fn mix(spec: &ModuleSpec, default: f64) -> Mix {
    Mix(spec.number("mix", default) as f32)
}

fn boxed<B: EffectBuilder>(builder: B) -> (Box<dyn Effect>, B::Handle) {
    builder.build()
}

pub fn build_effect(spec: &ModuleSpec, sample_rate: u32, block_size: usize) -> Result<BuiltEffect, String> {
    let name = spec.effect.as_deref().ok_or_else(|| format!("fx module {} has no effect", spec.id))?;
    let mut built = match name {
        "reverb" => {
            let (effect, handle) = boxed(ReverbBuilder::new()
                .feedback(spec.number("feedback", 0.9))
                .damping(spec.number("damping", 0.1))
                .stereo_width(spec.number("stereo_width", 1.0))
                .mix(mix(spec, 0.35)));
            BuiltEffect { effects: vec![effect], handle: EffectHandle::Reverb(handle), has_tail: true }
        }
        "delay" => {
            let (effect, handle) = boxed(DelayBuilder::new()
                .delay_time(Duration::from_secs_f64(spec.number("time", 0.375).max(0.001)))
                .feedback(Decibels(spec.number("feedback_db", -6.0) as f32))
                .mix(mix(spec, 0.35)));
            BuiltEffect { effects: vec![effect], handle: EffectHandle::Delay(handle), has_tail: true }
        }
        "compressor" => {
            let (effect, handle) = boxed(CompressorBuilder::new()
                .threshold(spec.number("threshold_db", -18.0))
                .ratio(spec.number("ratio", 4.0))
                .attack_duration(ms(spec.number("attack_ms", 10.0)))
                .release_duration(ms(spec.number("release_ms", 150.0)))
                .makeup_gain(Decibels(spec.number("makeup_db", 0.0) as f32))
                .mix(mix(spec, 1.0)));
            BuiltEffect { effects: vec![effect], handle: EffectHandle::Compressor(handle), has_tail: false }
        }
        "eq" => {
            let bands = [
                (EqFilterKind::LowShelf, spec.number("low_freq", 120.0), spec.number("low_gain_db", 0.0), 0.7),
                (EqFilterKind::Bell, spec.number("mid_freq", 1000.0), spec.number("mid_gain_db", 0.0), spec.number("mid_q", 1.0)),
                (EqFilterKind::HighShelf, spec.number("high_freq", 8000.0), spec.number("high_gain_db", 0.0), 0.7),
            ];
            let mut effects = Vec::new();
            let mut handles = Vec::new();
            for (kind, frequency, gain, q) in bands {
                let (effect, handle) = boxed(EqFilterBuilder::new(kind, frequency, Decibels(gain as f32), q));
                effects.push(effect);
                handles.push(handle);
            }
            BuiltEffect { effects, handle: EffectHandle::Eq(handles), has_tail: false }
        }
        "filter" => {
            let (effect, handle) = boxed(FilterBuilder::new()
                .mode(filter_mode(spec.text("mode")))
                .cutoff(spec.number("cutoff", 1000.0))
                .resonance(spec.number("resonance", 0.1))
                .mix(mix(spec, 1.0)));
            BuiltEffect { effects: vec![effect], handle: EffectHandle::Filter(handle), has_tail: false }
        }
        "distortion" => {
            let (effect, handle) = boxed(DistortionBuilder::new()
                .kind(distortion_kind(spec.text("kind")))
                .drive(Decibels(spec.number("drive_db", 12.0) as f32))
                .mix(mix(spec, 1.0)));
            BuiltEffect { effects: vec![effect], handle: EffectHandle::Distortion(handle), has_tail: false }
        }
        other => return Err(format!("unsupported effect {other}")),
    };
    for effect in &mut built.effects {
        effect.init(sample_rate, block_size);
    }
    Ok(built)
}

// Parameters that cannot be tweened require a new instance (delay buffer length).
pub fn requires_rebuild(previous: &ModuleSpec, next: &ModuleSpec) -> bool {
    previous.effect != next.effect || (next.effect.as_deref() == Some("delay") && previous.number("time", 0.375) != next.number("time", 0.375))
}

pub fn retune(handle: &mut EffectHandle, spec: &ModuleSpec) {
    match handle {
        EffectHandle::Reverb(handle) => {
            handle.set_feedback(spec.number("feedback", 0.9), PARAM_TWEEN);
            handle.set_damping(spec.number("damping", 0.1), PARAM_TWEEN);
            handle.set_stereo_width(spec.number("stereo_width", 1.0), PARAM_TWEEN);
            handle.set_mix(mix(spec, 0.35), PARAM_TWEEN);
        }
        EffectHandle::Delay(handle) => {
            handle.set_feedback(Decibels(spec.number("feedback_db", -6.0) as f32), PARAM_TWEEN);
            handle.set_mix(mix(spec, 0.35), PARAM_TWEEN);
        }
        EffectHandle::Compressor(handle) => {
            handle.set_threshold(spec.number("threshold_db", -18.0), PARAM_TWEEN);
            handle.set_ratio(spec.number("ratio", 4.0), PARAM_TWEEN);
            handle.set_attack_duration(ms(spec.number("attack_ms", 10.0)), PARAM_TWEEN);
            handle.set_release_duration(ms(spec.number("release_ms", 150.0)), PARAM_TWEEN);
            handle.set_makeup_gain(Decibels(spec.number("makeup_db", 0.0) as f32), PARAM_TWEEN);
            handle.set_mix(mix(spec, 1.0), PARAM_TWEEN);
        }
        EffectHandle::Eq(handles) => {
            let bands = [("low", 0.7), ("mid", spec.number("mid_q", 1.0)), ("high", 0.7)];
            for (handle, (band, q)) in handles.iter_mut().zip(bands) {
                handle.set_frequency(spec.number(&format!("{band}_freq"), 1000.0), PARAM_TWEEN);
                handle.set_gain(Decibels(spec.number(&format!("{band}_gain_db"), 0.0) as f32), PARAM_TWEEN);
                handle.set_q(q, PARAM_TWEEN);
            }
        }
        EffectHandle::Filter(handle) => {
            handle.set_mode(filter_mode(spec.text("mode")));
            handle.set_cutoff(spec.number("cutoff", 1000.0), PARAM_TWEEN);
            handle.set_resonance(spec.number("resonance", 0.1), PARAM_TWEEN);
            handle.set_mix(mix(spec, 1.0), PARAM_TWEEN);
        }
        EffectHandle::Distortion(handle) => {
            handle.set_kind(distortion_kind(spec.text("kind")));
            handle.set_drive(Decibels(spec.number("drive_db", 12.0) as f32), PARAM_TWEEN);
            handle.set_mix(mix(spec, 1.0), PARAM_TWEEN);
        }
    }
}
