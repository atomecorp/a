// The engine's final stereo output, copied for a television while a view is cast to it (R-248, user 25 Nov. 2026:
// « le son… tout passe »): the local server reads it into the live stream's sound track (atome-screen-cast `hls`).
// The device callback (output_fill.rs) and the host's render block (host_output.rs) write each quantum here once it is
// final; nothing is copied while no stream reads. Real-time safe: no allocation, no blocking lock (a busy tap drops
// the quantum, the stream filling the gap with silence).

use ringbuf::traits::{Consumer, Observer, Producer, Split};
use ringbuf::{HeapCons, HeapProd, HeapRb};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

// Two seconds of stereo at 48 kHz: what the stream may leave unread between two of its pictures, and more.
const TAP_FRAMES: usize = 96_000;
const CHANNELS: usize = 2;

static ACTIVE: AtomicBool = AtomicBool::new(false);
// The rate the open tap was promised: an output at another rate is not copied.
static TAP_RATE: AtomicU32 = AtomicU32::new(0);
static TAP: Mutex<Option<HeapProd<f32>>> = Mutex::new(None);
// The latest tap opened: a newer stream's tap replaces an older one, whose drop then leaves it alone.
static OPENED: AtomicU64 = AtomicU64::new(0);

/// The engine's output as a stream reads it: its rate and the frames heard since the previous read. One at a time:
/// the latest opened is copied; dropped, the copy stops.
pub struct CastTap {
    consumer: HeapCons<f32>,
    rate: u32,
    opened: u64,
}

/// Starts copying the engine's output. Its rate is the started output's, else the one the device will start at.
pub fn open() -> Result<CastTap, String> {
    let rate = match super::direct::output_rate() {
        Some(rate) => rate,
        None => device_rate()?,
    };
    let (producer, consumer) = HeapRb::<f32>::new(TAP_FRAMES * CHANNELS).split();
    let mut tap = TAP.lock().map_err(|_| "cast_tap_poisoned".to_string())?;
    *tap = Some(producer);
    let opened = OPENED.fetch_add(1, Ordering::AcqRel) + 1;
    TAP_RATE.store(rate, Ordering::Release);
    ACTIVE.store(true, Ordering::Release);
    Ok(CastTap {
        consumer,
        rate,
        opened,
    })
}

// The rate a device start would take (scheduled_backend.rs#setup): the plugin host's, else the default device's.
#[cfg(not(target_os = "windows"))]
fn device_rate() -> Result<u32, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    if let Some(rate) = super::host_output::host_rate() {
        return Ok(rate);
    }
    let device = cpal::default_host()
        .default_output_device()
        .ok_or("cast_tap_no_output_device")?;
    let config = device
        .default_output_config()
        .map_err(|error| format!("cast_tap_output_config: {error}"))?;
    Ok(config.sample_rate())
}

#[cfg(target_os = "windows")]
fn device_rate() -> Result<u32, String> {
    super::windows_driver::output_rate()
}

impl CastTap {
    pub fn rate(&self) -> u32 {
        self.rate
    }

    /// The interleaved stereo frames heard since the previous read, appended to `out`. An output started at another
    /// rate than the tap's (a device changed while casting) is not copied: the stream hears silence.
    pub fn read(&mut self, out: &mut Vec<f32>) {
        let available = self.consumer.occupied_len() / CHANNELS * CHANNELS;
        let from = out.len();
        out.resize(from + available, 0.0);
        let got = self.consumer.pop_slice(&mut out[from..]);
        out.truncate(from + got);
    }
}

impl Drop for CastTap {
    fn drop(&mut self) {
        let Ok(mut tap) = TAP.lock() else {
            return;
        };
        if OPENED.load(Ordering::Acquire) == self.opened {
            ACTIVE.store(false, Ordering::Release);
            *tap = None;
        }
    }
}

fn copying() -> bool {
    ACTIVE.load(Ordering::Acquire)
        && super::direct::output_rate() == Some(TAP_RATE.load(Ordering::Acquire))
}

// The device callback's final quantum, interleaved over `device_channels` (the first pair is the main output).
pub(crate) fn write_interleaved(data: &[f32], device_channels: usize) {
    if !copying() || device_channels == 0 {
        return;
    }
    let Ok(mut tap) = TAP.try_lock() else {
        return;
    };
    let Some(producer) = tap.as_mut() else {
        return;
    };
    if device_channels == CHANNELS {
        producer.push_slice(data);
        return;
    }
    let pairs = data.chunks_exact(device_channels).map(|frame| {
        let left = frame[0];
        [left, frame.get(1).copied().unwrap_or(left)]
    });
    producer.push_iter(pairs.flatten());
}

// The host's render block's final quantum, one slice per side.
pub(crate) fn write_planar(left: &[f32], right: &[f32]) {
    if !copying() {
        return;
    }
    let Ok(mut tap) = TAP.try_lock() else {
        return;
    };
    if let Some(producer) = tap.as_mut() {
        producer.push_iter(
            left.iter()
                .zip(right)
                .flat_map(|(left, right)| [*left, *right]),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_output_is_copied_while_a_tap_reads_and_an_older_tap_leaves_a_newer_one() {
        super::super::direct::install(48_000);
        let older = open().expect("tap opened");
        assert_eq!(older.rate(), 48_000);
        let mut tap = open().expect("newer tap opened");
        drop(older);
        // A four-channel device: its first pair is the main output.
        write_interleaved(&[0.1, 0.2, 9.0, 9.0, 0.3, 0.4, 9.0, 9.0], 4);
        write_planar(&[0.5], &[0.6]);
        let mut heard = Vec::new();
        tap.read(&mut heard);
        assert_eq!(heard, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
        drop(tap);
        write_interleaved(&[0.7, 0.8], 2);
        assert!(!copying());
    }
}
