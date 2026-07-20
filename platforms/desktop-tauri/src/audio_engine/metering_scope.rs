use std::sync::atomic::{AtomicU16, AtomicU32, AtomicU64, Ordering};

const PAIR_COUNT: usize = 64;

static VERSION: AtomicU64 = AtomicU64::new(0);
static SAMPLE_RATE: AtomicU32 = AtomicU32::new(0);
static CHANNELS: AtomicU16 = AtomicU16::new(0);
static MIN_BITS: [AtomicU32; PAIR_COUNT] = [const { AtomicU32::new(0) }; PAIR_COUNT];
static MAX_BITS: [AtomicU32; PAIR_COUNT] = [const { AtomicU32::new(0) }; PAIR_COUNT];

#[cfg(test)]
pub(crate) static METERING_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(serde::Serialize, Clone, Debug)]
pub struct ScopeFrame {
    pub available: bool,
    pub sequence: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub pairs: Vec<[f32; 2]>,
}

pub fn configure(sample_rate: u32, channels: u16) {
    SAMPLE_RATE.store(sample_rate, Ordering::Release);
    CHANNELS.store(channels, Ordering::Release);
}

pub fn reset() {
    VERSION.store(0, Ordering::Release);
    SAMPLE_RATE.store(0, Ordering::Release);
    CHANNELS.store(0, Ordering::Release);
    for index in 0..PAIR_COUNT {
        MIN_BITS[index].store(0.0f32.to_bits(), Ordering::Relaxed);
        MAX_BITS[index].store(0.0f32.to_bits(), Ordering::Relaxed);
    }
}

pub fn publish(minimums: &[f32; PAIR_COUNT], maximums: &[f32; PAIR_COUNT]) {
    VERSION.fetch_add(1, Ordering::AcqRel);
    for index in 0..PAIR_COUNT {
        MIN_BITS[index].store(
            minimums[index].clamp(-1.0, 1.0).to_bits(),
            Ordering::Relaxed,
        );
        MAX_BITS[index].store(
            maximums[index].clamp(-1.0, 1.0).to_bits(),
            Ordering::Relaxed,
        );
    }
    VERSION.fetch_add(1, Ordering::Release);
}

pub fn snapshot() -> ScopeFrame {
    for _ in 0..4 {
        let before = VERSION.load(Ordering::Acquire);
        if before == 0 || before % 2 != 0 {
            continue;
        }
        let pairs = (0..PAIR_COUNT)
            .map(|index| {
                [
                    f32::from_bits(MIN_BITS[index].load(Ordering::Relaxed)),
                    f32::from_bits(MAX_BITS[index].load(Ordering::Relaxed)),
                ]
            })
            .collect::<Vec<_>>();
        let after = VERSION.load(Ordering::Acquire);
        if before == after && after % 2 == 0 {
            return ScopeFrame {
                available: true,
                sequence: after / 2,
                sample_rate: SAMPLE_RATE.load(Ordering::Acquire),
                channels: CHANNELS.load(Ordering::Acquire),
                pairs,
            };
        }
    }
    ScopeFrame {
        available: false,
        sequence: VERSION.load(Ordering::Acquire) / 2,
        sample_rate: SAMPLE_RATE.load(Ordering::Acquire),
        channels: CHANNELS.load(Ordering::Acquire),
        pairs: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::{configure, publish, reset, snapshot, PAIR_COUNT};

    #[test]
    fn publishes_a_bounded_lock_free_scope_snapshot() {
        let _lock = super::METERING_TEST_LOCK.lock().unwrap();
        reset();
        configure(48_000, 2);
        let mut minimums = [0.0; PAIR_COUNT];
        let mut maximums = [0.0; PAIR_COUNT];
        minimums[0] = -1.5;
        maximums[0] = 1.5;
        publish(&minimums, &maximums);

        let frame = snapshot();
        assert!(frame.available);
        assert_eq!(frame.sequence, 1);
        assert_eq!(frame.sample_rate, 48_000);
        assert_eq!(frame.channels, 2);
        assert_eq!(frame.pairs.len(), PAIR_COUNT);
        assert_eq!(frame.pairs[0], [-1.0, 1.0]);
    }
}
