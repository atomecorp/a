// Every module kind by its stable key: the one place hosts (mixer graph, Web
// worklet, MCP, presets) turn a described module into a running processor.
// A key never changes once shipped; saved chains refer to it.

use crate::biquad::{Biquad, Shape};
use crate::convolution::{Convolution, Impulse};
use crate::crossover::Bands;
use crate::delay::Echo;
use crate::drive::{Clip, Drive};
use crate::dynamics::{Compressor, Limiter};
use crate::envelope::Envelope;
use crate::gain::{Pan, Volume};
use crate::gate::{Ducker, Gate};
use crate::nam::{AmpModel, AmpModelError};
use crate::oscillator::{Oscillator, Waveform};
use crate::reverb::Reverb;
use crate::split::{Split, Splitter};
use crate::{ParamSpec, Processor};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleKind {
    Volume,
    Pan,
    Filter(Shape),
    Compressor,
    Limiter,
    Gate,
    Ducker,
    // A Linkwitz-Riley split into 2, 3 or 4 bands, one port each.
    Bands(u8),
    Split(Split),
    Drive(Clip),
    Echo,
    Reverb,
    Convolution,
    Amp,
    Oscillator,
    Envelope,
}

pub const KINDS: [ModuleKind; 26] = [
    ModuleKind::Volume,
    ModuleKind::Pan,
    ModuleKind::Filter(Shape::LowPass),
    ModuleKind::Filter(Shape::HighPass),
    ModuleKind::Filter(Shape::BandPass),
    ModuleKind::Filter(Shape::Notch),
    ModuleKind::Filter(Shape::Bell),
    ModuleKind::Filter(Shape::LowShelf),
    ModuleKind::Filter(Shape::HighShelf),
    ModuleKind::Compressor,
    ModuleKind::Limiter,
    ModuleKind::Gate,
    ModuleKind::Ducker,
    ModuleKind::Bands(2),
    ModuleKind::Bands(3),
    ModuleKind::Bands(4),
    ModuleKind::Split(Split::MidSide),
    ModuleKind::Split(Split::LeftRight),
    ModuleKind::Drive(Clip::Soft),
    ModuleKind::Drive(Clip::Hard),
    ModuleKind::Echo,
    ModuleKind::Reverb,
    ModuleKind::Convolution,
    ModuleKind::Amp,
    ModuleKind::Oscillator,
    ModuleKind::Envelope,
];

// What a kind needs beyond its parameters to exist.
pub enum ModuleAsset {
    None,
    // A `.nam` capture, as its JSON text.
    AmpCapture(String),
    Impulse(Impulse),
}

#[derive(Debug)]
pub enum CatalogError {
    UnknownKind(String),
    AssetRequired(ModuleKind),
    AssetNotExpected(ModuleKind),
    AmpCapture(AmpModelError),
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownKind(key) => write!(f, "unknown module kind `{key}`"),
            Self::AssetRequired(kind) => write!(f, "module `{}` needs its asset", kind.key()),
            Self::AssetNotExpected(kind) => write!(f, "module `{}` takes no asset", kind.key()),
            Self::AmpCapture(error) => write!(f, "amp capture: {error}"),
        }
    }
}

impl std::error::Error for CatalogError {}

impl ModuleKind {
    pub fn key(self) -> &'static str {
        match self {
            Self::Volume => "volume",
            Self::Pan => "pan",
            Self::Filter(Shape::LowPass) => "low_pass",
            Self::Filter(Shape::HighPass) => "high_pass",
            Self::Filter(Shape::BandPass) => "band_pass",
            Self::Filter(Shape::Notch) => "notch",
            Self::Filter(Shape::Bell) => "bell",
            Self::Filter(Shape::LowShelf) => "low_shelf",
            Self::Filter(Shape::HighShelf) => "high_shelf",
            Self::Compressor => "compressor",
            Self::Limiter => "limiter",
            Self::Gate => "gate",
            Self::Ducker => "ducker",
            Self::Bands(2) => "bands_2",
            Self::Bands(3) => "bands_3",
            Self::Bands(_) => "bands_4",
            Self::Split(Split::MidSide) => "mid_side",
            Self::Split(Split::LeftRight) => "left_right",
            Self::Drive(Clip::Soft) => "soft_clip",
            Self::Drive(Clip::Hard) => "hard_clip",
            Self::Echo => "echo",
            Self::Reverb => "reverb",
            Self::Convolution => "convolution",
            Self::Amp => "amp",
            Self::Oscillator => "oscillator",
            Self::Envelope => "envelope",
        }
    }

    pub fn from_key(key: &str) -> Result<Self, CatalogError> {
        KINDS.iter().copied().find(|kind| kind.key() == key).ok_or_else(|| CatalogError::UnknownKind(key.to_string()))
    }

    // A generator writes its block instead of processing it: an input node.
    pub fn is_generator(self) -> bool {
        self == Self::Oscillator
    }

    // Signals it writes: 1, or one per band of a split (port 0 continues the chain).
    pub fn outputs(self) -> usize {
        match self {
            Self::Bands(bands) => bands as usize,
            Self::Split(_) => 2,
            _ => 1,
        }
    }

    // Whether a sidechain key may drive it.
    pub fn takes_key(self) -> bool {
        matches!(self, Self::Compressor | Self::Gate | Self::Ducker)
    }

    // The full parameter table; an amp lists `size` even though only an A2
    // capture exposes it once built.
    pub fn params(self) -> &'static [ParamSpec] {
        match self {
            Self::Volume => &crate::gain::VOLUME_PARAMS,
            Self::Pan => &crate::gain::PAN_PARAMS,
            Self::Filter(shape) => crate::biquad::params_for(shape),
            Self::Compressor => &crate::dynamics::COMPRESSOR_PARAMS,
            Self::Limiter => &crate::dynamics::LIMITER_PARAMS,
            Self::Gate => &crate::gate::GATE_PARAMS,
            Self::Ducker => &crate::gate::DUCKER_PARAMS,
            Self::Bands(bands) => crate::crossover::params_for(bands as usize),
            Self::Split(_) => &[],
            Self::Drive(_) => &crate::drive::PARAMS,
            Self::Echo => &crate::delay::PARAMS,
            Self::Reverb => &crate::reverb::PARAMS,
            Self::Convolution => &crate::convolution::PARAMS,
            Self::Amp => &crate::nam::PARAMS,
            Self::Oscillator => &crate::oscillator::PARAMS,
            Self::Envelope => &crate::envelope::PARAMS,
        }
    }

    // Built at the parameters' defaults; allocates, never on the audio thread.
    pub fn build(self, asset: ModuleAsset) -> Result<Box<dyn Processor>, CatalogError> {
        let defaults = |id: usize| self.params()[id].default;
        let processor: Box<dyn Processor> = match (self, asset) {
            (Self::Amp, ModuleAsset::AmpCapture(json)) => {
                Box::new(AmpModel::from_json_str(&json).map_err(CatalogError::AmpCapture)?)
            }
            (Self::Convolution, ModuleAsset::Impulse(impulse)) => Box::new(Convolution::new(impulse)),
            (Self::Amp | Self::Convolution, _) => return Err(CatalogError::AssetRequired(self)),
            (_, ModuleAsset::AmpCapture(_) | ModuleAsset::Impulse(_)) => return Err(CatalogError::AssetNotExpected(self)),
            (Self::Volume, ModuleAsset::None) => Box::new(Volume::new(defaults(0))),
            (Self::Pan, ModuleAsset::None) => Box::new(Pan::new(defaults(0))),
            (Self::Filter(shape), ModuleAsset::None) => Box::new(Biquad::new(shape, defaults(0), defaults(1), crate::biquad::PARAMS[2].default)),
            (Self::Compressor, ModuleAsset::None) => Box::new(Compressor::new()),
            (Self::Limiter, ModuleAsset::None) => Box::new(Limiter::new()),
            (Self::Gate, ModuleAsset::None) => Box::new(Gate::new()),
            (Self::Ducker, ModuleAsset::None) => Box::new(Ducker::new()),
            (Self::Bands(bands), ModuleAsset::None) => Box::new(Bands::new(bands as usize)),
            (Self::Split(split), ModuleAsset::None) => Box::new(Splitter::new(split)),
            (Self::Drive(clip), ModuleAsset::None) => Box::new(Drive::new(clip)),
            (Self::Echo, ModuleAsset::None) => Box::new(Echo::new()),
            (Self::Reverb, ModuleAsset::None) => Box::new(Reverb::new()),
            (Self::Oscillator, ModuleAsset::None) => Box::new(Oscillator::new(Waveform::Saw, defaults(0))),
            (Self::Envelope, ModuleAsset::None) => Box::new(Envelope::new()),
        };
        Ok(processor)
    }
}
