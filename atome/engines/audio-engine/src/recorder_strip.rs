// A take of a strip's REC point (R-183): the console graph copies what passes
// at the strip's `record` module into the point's ring (atome-mix-graph
// record_tap.rs); a thread drains it into the same WAV sink a device take
// writes to (recorder.rs). The take is placed like a device take: its first
// frame's capture instant, from the clock of the input the strip hears (host
// ns, as a cpal input or the AUv3 host input notes it), less the latency of
// the modules before the point.

use super::recorder::{OutputFormat, start_session};
use super::recorder_capture::{Capture, TakeSink};
use atome_mix_graph::record_tap::RecordTap;
use kira::Frame;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

const DRAIN_PERIOD: Duration = Duration::from_millis(5);
const DRAIN_FRAMES: usize = 4096;

// The draining thread, stopped (after a last drain) when the take ends.
pub(super) struct StripTap {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for StripTap {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn drain(
    tap: &RecordTap,
    sink: &mut TakeSink,
    rate: u32,
    frames: &mut [Frame],
    samples: &mut Vec<f32>,
) {
    loop {
        let count = tap.drain(frames);
        if count == 0 {
            return;
        }
        samples.clear();
        samples.extend(
            frames[..count]
                .iter()
                .flat_map(|frame| [frame.left, frame.right]),
        );
        let first = tap
            .start()
            .and_then(|start| start.clock(1e9 / f64::from(rate.max(1))))
            .map(|ns| ns.round() as i64);
        sink.push(samples, first);
    }
}

fn open(strip_id: String, tap: Arc<RecordTap>, rate: u32, mut sink: TakeSink) -> StripTap {
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread = std::thread::spawn(move || {
        let mut frames = vec![Frame::ZERO; DRAIN_FRAMES];
        let mut samples = Vec::with_capacity(DRAIN_FRAMES * 2);
        while !thread_stop.load(Ordering::Acquire) {
            drain(&tap, &mut sink, rate, &mut frames, &mut samples);
            std::thread::sleep(DRAIN_PERIOD);
        }
        // The point stops taking, then what it took last is written.
        let _ = super::mix::disarm_record(&strip_id);
        drain(&tap, &mut sink, rate, &mut frames, &mut samples);
        sink.overruns
            .fetch_add(tap.overrun_frames(), Ordering::Relaxed);
    });
    StripTap {
        stop,
        thread: Some(thread),
    }
}

// Starts a take of `strip_id`'s REC point, the strip hearing `device_id`
// (its live input, `host` in an AUv3); the file is stereo at the graph's rate.
pub fn start(
    session_id: &str,
    abs_wav_path: &str,
    strip_id: &str,
    device_id: Option<&str>,
) -> Result<(u32, u16), String> {
    let (tap, rate) = super::mix::arm_record(strip_id, device_id)?;
    let strip = strip_id.to_string();
    let started = start_session(
        session_id,
        abs_wav_path,
        rate,
        2,
        OutputFormat::default(),
        move |sink| {
            Ok(Capture::Strip {
                _tap: open(strip, tap, rate, sink),
            })
        },
    );
    if started.is_err() {
        super::mix::disarm_record(strip_id)?;
    }
    started.map(|()| (rate, 2))
}

// `audio_record_strip_start`: answers as `audio_record_start` does; stopped by `audio_record_strip_stop`.
pub fn command(
    absolute: &std::path::Path,
    session_id: &str,
    file_path: &str,
    strip_id: Option<&str>,
    device_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    let strip_id = strip_id.ok_or("audio_record_strip_missing")?;
    super::metering::reset();
    let absolute = absolute.to_string_lossy();
    let (sample_rate, channels) = start(session_id, &absolute, strip_id, device_id)?;
    Ok(
        serde_json::json!({ "success": true, "session_id": session_id, "file_path": file_path,
        "absolute_file_path": absolute, "sample_rate": sample_rate, "channels": channels, "strip_id": strip_id }),
    )
}
