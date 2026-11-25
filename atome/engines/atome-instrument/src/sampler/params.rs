// The sampler's parameters, in the engine's units (each a `set_param` id).

use atome_dsp::{ParamSpec, Unit};

pub const GAIN_DB: u32 = 0;
pub const ATTACK_MS: u32 = 1;
pub const DECAY_MS: u32 = 2;
pub const SUSTAIN: u32 = 3;
pub const RELEASE_MS: u32 = 4;
pub const VELOCITY_SENSE: u32 = 5;
pub const TUNE_CENTS: u32 = 6;
pub const GLIDE_MS: u32 = 7;
pub const POLYPHONY: u32 = 8;
pub const MODE: u32 = 9;
pub const BEND_RANGE: u32 = 10;
// DAHDSR: the wait before the attack and the hold at its peak (a bank's envelope), none by default.
pub const DELAY_MS: u32 = 11;
pub const HOLD_MS: u32 = 12;
pub const PARAMS: [ParamSpec; 13] = [
    ParamSpec::new(GAIN_DB, "gain_db", -60.0, 12.0, 0.0, Unit::Decibels),
    ParamSpec::new(
        ATTACK_MS,
        "attack_ms",
        0.1,
        10000.0,
        1.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        DECAY_MS,
        "decay_ms",
        1.0,
        10000.0,
        144.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(SUSTAIN, "sustain", 0.0, 1.0, 1.0, Unit::Percent),
    ParamSpec::new(
        RELEASE_MS,
        "release_ms",
        1.0,
        20000.0,
        89.0,
        Unit::Milliseconds,
    ),
    ParamSpec::new(
        VELOCITY_SENSE,
        "velocity_sense",
        0.0,
        1.0,
        0.89,
        Unit::Percent,
    ),
    ParamSpec::new(TUNE_CENTS, "tune_cents", -1200.0, 1200.0, 0.0, Unit::Plain),
    ParamSpec::new(GLIDE_MS, "glide_ms", 0.0, 5000.0, 55.0, Unit::Milliseconds),
    ParamSpec::new(POLYPHONY, "polyphony", 1.0, 128.0, 21.0, Unit::Plain),
    ParamSpec::new(MODE, "mode", 0.0, 2.0, 0.0, Unit::Plain),
    ParamSpec::new(BEND_RANGE, "bend_range", 0.0, 48.0, 2.0, Unit::Plain),
    ParamSpec::new(DELAY_MS, "delay_ms", 0.0, 20000.0, 0.0, Unit::Milliseconds),
    ParamSpec::new(HOLD_MS, "hold_ms", 0.0, 20000.0, 0.0, Unit::Milliseconds),
];
