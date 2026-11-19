// The five spaces of the reverb: each its own tank (line lengths, density,
// motion, brightness) and its own early reflections, the pattern of the
// first walls the sound meets before the tail builds up.

pub const LINES: usize = 8;
pub const MAX_TAPS: usize = 24;

pub struct Space {
    // Tank lines and their in-loop all-pass at full size (ms).
    pub lines_ms: [f32; LINES],
    pub allpass_ms: [f32; LINES],
    // All-pass coefficients at full diffusion: in the loop, and before it.
    pub tank_diffusion: f32,
    pub input_diffusion: f32,
    // Early reflections: how many, between which times (ms at full size),
    // their total level and how wide they spread.
    pub taps: usize,
    pub first_ms: f32,
    pub last_ms: f32,
    pub early_level: f32,
    pub early_spread: f32,
    pub tail_level: f32,
    // Line motion at full modulation (ms of excursion) and its rate.
    pub modulation_ms: f32,
    pub modulation_hz: f32,
    // How much of the damping frequency the space keeps (a plate is brighter).
    pub damping_scale: f32,
    // Level of the dispersive spring loops (0: none).
    pub spring_level: f32,
}

pub const SPACES: [Space; 5] = [
    // Room: short lines, a quick cluster of close walls.
    Space {
        lines_ms: [11.3, 13.7, 16.1, 18.7, 21.1, 23.9, 26.3, 29.3],
        allpass_ms: [1.3, 1.7, 1.9, 2.3, 2.9, 3.1, 3.7, 4.1],
        tank_diffusion: 0.5,
        input_diffusion: 0.7,
        taps: 13,
        first_ms: 1.9,
        last_ms: 23.0,
        early_level: 0.55,
        early_spread: 0.6,
        tail_level: 0.8,
        modulation_ms: 0.21,
        modulation_hz: 0.8,
        damping_scale: 0.9,
        spring_level: 0.0,
    },
    // Hall: long lines, far walls spread wide, a slow sway.
    Space {
        lines_ms: [53.1, 61.3, 70.1, 78.7, 87.1, 95.9, 104.3, 113.9],
        allpass_ms: [3.1, 3.7, 4.3, 5.3, 6.1, 6.7, 7.9, 8.9],
        tank_diffusion: 0.6,
        input_diffusion: 0.75,
        taps: 13,
        first_ms: 8.9,
        last_ms: 89.0,
        early_level: 0.34,
        early_spread: 1.0,
        tail_level: 1.0,
        modulation_ms: 0.55,
        modulation_hz: 0.5,
        damping_scale: 1.0,
        spring_level: 0.0,
    },
    // Plate: no walls, an instantly dense and bright metal sheet.
    Space {
        lines_ms: [17.3, 21.1, 24.7, 28.1, 31.9, 35.3, 38.9, 42.7],
        allpass_ms: [4.1, 4.7, 5.3, 5.9, 6.7, 7.3, 7.9, 8.3],
        tank_diffusion: 0.7,
        input_diffusion: 0.8,
        taps: 0,
        first_ms: 0.0,
        last_ms: 0.0,
        early_level: 0.0,
        early_spread: 0.0,
        tail_level: 1.0,
        modulation_ms: 0.34,
        modulation_hz: 1.3,
        damping_scale: 1.5,
        spring_level: 0.0,
    },
    // Chamber: a hard-walled room, dense early reflections, a warmer tail.
    Space {
        lines_ms: [23.3, 27.1, 30.7, 34.3, 38.3, 41.9, 45.7, 49.3],
        allpass_ms: [2.3, 2.9, 3.1, 3.7, 4.3, 4.7, 5.3, 5.9],
        tank_diffusion: 0.65,
        input_diffusion: 0.75,
        taps: MAX_TAPS,
        first_ms: 2.9,
        last_ms: 55.0,
        early_level: 0.55,
        early_spread: 0.8,
        tail_level: 0.9,
        modulation_ms: 0.21,
        modulation_hz: 0.8,
        damping_scale: 0.8,
        spring_level: 0.0,
    },
    // Spring: two dispersive springs (chirps, a little boing) over a thin tank.
    Space {
        lines_ms: [29.3, 33.1, 37.9, 41.3, 45.7, 49.1, 53.9, 57.7],
        allpass_ms: [1.1, 1.3, 1.7, 1.9, 2.3, 2.9, 3.1, 3.7],
        tank_diffusion: 0.5,
        input_diffusion: 0.6,
        taps: 0,
        first_ms: 0.0,
        last_ms: 0.0,
        early_level: 0.0,
        early_spread: 0.0,
        tail_level: 0.3,
        modulation_ms: 0.13,
        modulation_hz: 0.8,
        damping_scale: 0.6,
        spring_level: 0.9,
    },
];

pub const HALL: usize = 1;

// The longest line, all-pass and reflection any space asks for (ms).
pub fn longest_line_ms() -> f32 {
    SPACES
        .iter()
        .flat_map(|space| space.lines_ms)
        .fold(0.0, f32::max)
}

pub fn longest_allpass_ms() -> f32 {
    SPACES
        .iter()
        .flat_map(|space| space.allpass_ms)
        .fold(0.0, f32::max)
}

pub fn longest_reflection_ms() -> f32 {
    SPACES.iter().map(|space| space.last_ms).fold(0.0, f32::max)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Tap {
    pub ms: f32,
    pub left: f32,
    pub right: f32,
}

// A reproducible pattern of reflections: denser toward the end (as walls
// multiply), quieter with distance, of either polarity, spread over the
// stereo field, its energy summing to the space's early level.
pub fn early_pattern(space: &Space) -> [Tap; MAX_TAPS] {
    let mut taps = [Tap::default(); MAX_TAPS];
    let mut seed = 0x2545_f491u32 ^ (space.taps as u32 * 7919);
    let mut random = || {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (seed >> 8) as f32 / 16_777_216.0
    };
    let count = space.taps.min(MAX_TAPS);
    let mut energy = 0.0;
    for (k, tap) in taps.iter_mut().take(count).enumerate() {
        let place = ((k as f32 + 0.2 + 0.6 * random()) / count as f32).sqrt();
        tap.ms = space.first_ms + (space.last_ms - space.first_ms) * place;
        let sign = if random() < 0.5 { -1.0 } else { 1.0 };
        let gain = sign * space.first_ms / tap.ms;
        let side = space.early_spread * (2.0 * random() - 1.0);
        let angle = (side + 1.0) * std::f32::consts::FRAC_PI_4;
        tap.left = gain * angle.cos();
        tap.right = gain * angle.sin();
        energy += gain * gain;
    }
    if energy > 0.0 {
        let norm = space.early_level / energy.sqrt();
        for tap in taps.iter_mut().take(count) {
            tap.left *= norm;
            tap.right *= norm;
        }
    }
    taps
}
