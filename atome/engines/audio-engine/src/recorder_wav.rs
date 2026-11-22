use atome_audio_kernels::{peaks, wav};
use ringbuf::traits::*;
use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Output format for WAV recording.
#[derive(Clone, Copy, Debug, serde::Deserialize, Default)]
pub enum OutputFormat {
    /// 16-bit signed integer PCM (CD quality, smaller files)
    Int16,
    /// 24-bit signed integer PCM (professional quality)
    #[default]
    Int24,
    /// 32-bit IEEE float (maximum precision, larger files)
    Float32,
}

impl OutputFormat {
    /// The WAV sample size: 16 and 24 are PCM, 32 is float.
    fn bits(self) -> u16 {
        match self {
            Self::Int16 => 16,
            Self::Int24 => 24,
            Self::Float32 => 32,
        }
    }
}

/// Peaks a take's clip shows (its waveform, as `waveform_peaks` gives it for a take recorded in the page).
pub(super) const TAKE_WAVEFORM_PEAKS: usize = 256;
/// Envelope points kept at most: past it, neighbours merge and each point covers twice the samples.
const ENVELOPE_POINTS: usize = 65_536;

/// The take's envelope, built as its samples are written: each point the highest absolute sample of a
/// run of frames (a millisecond at first), so its waveform is known at the stop without reading the file.
struct TakeEnvelope {
    points: Vec<f32>,
    peak: f32,
    filled: usize,
    run: usize,
}

impl TakeEnvelope {
    fn new(sample_rate: u32, channels: u16) -> Self {
        let frames = usize::try_from(sample_rate / 1_000).unwrap_or(48).max(1);
        Self {
            points: Vec::new(),
            peak: 0.0,
            filled: 0,
            run: frames * usize::from(channels.max(1)),
        }
    }

    fn push(&mut self, samples: &[f32]) {
        for &sample in samples {
            self.peak = self.peak.max(sample.abs());
            self.filled += 1;
            if self.filled == self.run {
                self.close_point();
            }
        }
    }

    fn close_point(&mut self) {
        self.points.push(self.peak.min(1.0));
        self.peak = 0.0;
        self.filled = 0;
        if self.points.len() == ENVELOPE_POINTS {
            self.points = self
                .points
                .chunks(2)
                .map(|pair| pair.iter().fold(0f32, |peak, value| peak.max(*value)))
                .collect();
            self.run *= 2;
        }
    }

    fn waveform(mut self) -> Vec<f32> {
        if self.filled > 0 {
            self.close_point();
        }
        peaks::waveform_peaks(&[&self.points], TAKE_WAVEFORM_PEAKS)
    }
}

/// A take's WAV file written as it comes, through the kernels' WAV codec (atome-audio-kernels
/// `wav::float_header` / `push_float_sample`): the bytes are those `wav::encode` writes for the
/// same samples. The header is written with no frame first, then again once they are counted.
pub(super) struct TakeWav {
    file: BufWriter<File>,
    path: String,
    channels: u16,
    sample_rate: u32,
    bits: u16,
    samples: usize,
    bytes: Vec<u8>,
    envelope: TakeEnvelope,
}

impl TakeWav {
    fn write(&mut self, samples: &[f32]) -> Result<(), String> {
        self.bytes.clear();
        for &sample in samples {
            wav::push_float_sample(&mut self.bytes, sample, self.bits);
        }
        self.samples += samples.len();
        self.envelope.push(samples);
        self.file
            .write_all(&self.bytes)
            .map_err(|error| format!("Failed to write WAV sample: {error}"))
    }

    /// Closes the file and gives the take's waveform peaks.
    fn finalize(mut self) -> Result<Vec<f32>, String> {
        let frames = self.samples / usize::from(self.channels);
        let header = wav::float_header(
            usize::from(self.channels),
            self.sample_rate,
            self.bits,
            frames,
        )
        .map_err(|error| format!("Failed to finalize WAV {}: {error}", self.path))?;
        let finalize = |error: std::io::Error| format!("Failed to finalize WAV: {error}");
        self.file.flush().map_err(finalize)?;
        self.file.seek(SeekFrom::Start(0)).map_err(finalize)?;
        self.file.write_all(&header).map_err(finalize)?;
        self.file.flush().map_err(finalize)?;
        Ok(self.envelope.waveform())
    }
}

/// Preferred buffer size hint for CPAL.
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
#[derive(Default)]
pub enum BufferSizeHint {
    /// Let CPAL choose (usually ~2048 samples)
    #[default]
    Default,
    /// Low latency (~256 samples, higher CPU)
    Low,
    /// Medium (~512 samples, balanced)
    Medium,
    /// Custom frame count
    Frames(u32),
}

impl BufferSizeHint {
    #[cfg(not(target_os = "windows"))]
    pub(super) fn to_cpal(self) -> cpal::BufferSize {
        match self {
            Self::Default => cpal::BufferSize::Default,
            Self::Low => cpal::BufferSize::Fixed(256),
            Self::Medium => cpal::BufferSize::Fixed(512),
            Self::Frames(n) => cpal::BufferSize::Fixed(n),
        }
    }
}

// Channels written for `capture_channels` input voices. A device exposing more than two
// (the built-in microphone array of a MacBook) is mixed down to mono: decoders of the other
// platforms (iOS, Kira) only accept mono or stereo files.
pub(super) fn written_channels(capture_channels: u16) -> u16 {
    if capture_channels > 2 {
        1
    } else {
        capture_channels.max(1)
    }
}

pub(super) fn spawn_wav_writer_thread(
    mut consumer: ringbuf::HeapCons<f32>,
    mut writer: TakeWav,
    writer_stop: Arc<AtomicBool>,
    capture_channels: u16,
) -> std::thread::JoinHandle<Result<Vec<f32>, String>> {
    crate::engine_thread::spawn(move || {
        let mut buffer = vec![0.0_f32; 4096];
        let frame = usize::from(capture_channels.max(1));
        let downmix = written_channels(capture_channels) != capture_channels.max(1);
        // Interleaved samples of an incomplete frame, kept for the next read.
        let mut pending: Vec<f32> = Vec::new();
        loop {
            let count = consumer.pop_slice(&mut buffer);
            if count > 0 {
                if !downmix {
                    writer.write(&buffer[..count])?;
                    continue;
                }
                pending.extend_from_slice(&buffer[..count]);
                let whole = pending.len() / frame * frame;
                let mixed: Vec<f32> = pending[..whole]
                    .chunks_exact(frame)
                    .map(|voices| voices.iter().sum::<f32>() / frame as f32)
                    .collect();
                writer.write(&mixed)?;
                pending.drain(..whole);
                continue;
            }
            if writer_stop.load(Ordering::Acquire) && consumer.is_empty() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        writer.finalize()
    })
}

pub(super) fn create_wav_writer(
    path: &str,
    output_format: OutputFormat,
    sample_rate: u32,
    channels: u16,
) -> Result<TakeWav, String> {
    let bits = output_format.bits();
    let create = |error: String| format!("Failed to create WAV file {path}: {error}");
    let header = wav::float_header(usize::from(channels), sample_rate, bits, 0)
        .map_err(|error| create(error.to_string()))?;
    let mut file = BufWriter::new(File::create(path).map_err(|error| create(error.to_string()))?);
    file.write_all(&header)
        .map_err(|error| create(error.to_string()))?;
    Ok(TakeWav {
        file,
        path: path.to_string(),
        channels,
        sample_rate,
        bits,
        samples: 0,
        bytes: Vec::new(),
        envelope: TakeEnvelope::new(sample_rate, channels),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // A take written as it comes holds the bytes the kernels' codec writes for the same buffer,
    // at every format, a frame split across writes included.
    #[test]
    fn a_take_is_the_kernels_encoding_of_its_samples() {
        let directory = tempfile::tempdir().expect("a temporary directory");
        let rate = 48_000;
        let frames: usize = 4_801;
        let left: Vec<f32> = (0..frames)
            .map(|i| (i as f32 * 0.013).sin() * 1.2 - 0.05)
            .collect();
        let right: Vec<f32> = (0..frames)
            .map(|i| ((i % 97) as f32 / 48.0) - 1.0)
            .collect();
        let interleaved: Vec<f32> = left
            .iter()
            .zip(&right)
            .flat_map(|(l, r)| [*l, *r])
            .collect();
        for format in [
            OutputFormat::Int16,
            OutputFormat::Int24,
            OutputFormat::Float32,
        ] {
            let path = directory.path().join(format!("{format:?}.wav"));
            let path = path.to_str().expect("a UTF-8 path");
            let mut take = create_wav_writer(path, format, rate, 2).expect("the take");
            for chunk in interleaved.chunks(1_023) {
                take.write(chunk).expect("the samples");
            }
            let waveform = take.finalize().expect("the header");
            // A tenth of a second: one envelope point a millisecond, fewer than 256 peaks.
            assert_eq!(waveform.len(), frames.div_ceil(48), "{format:?}");
            let loudest = interleaved
                .iter()
                .fold(0f32, |peak, sample| peak.max(sample.abs()));
            let drawn = waveform.iter().fold(0f32, |peak, value| peak.max(*value));
            assert_eq!(drawn, loudest.min(1.0), "{format:?}");
            let expected = wav::encode(&[&left, &right], rate, format.bits()).expect("encoded");
            assert_eq!(
                std::fs::read(path).expect("the file"),
                expected,
                "{format:?}"
            );
        }
    }

    // A long take keeps a bounded envelope whose peaks still hold its loudest moment, wherever it lies.
    #[test]
    fn a_long_take_keeps_its_loudest_moment_in_a_bounded_envelope() {
        let mut envelope = TakeEnvelope::new(1_000, 1);
        let quiet = vec![0.1_f32; 4_096];
        for block in 0..40 {
            envelope.push(&quiet);
            if block == 31 {
                envelope.push(&[-0.9]);
            }
        }
        assert!(envelope.points.len() < ENVELOPE_POINTS);
        let waveform = envelope.waveform();
        assert_eq!(waveform.len(), TAKE_WAVEFORM_PEAKS);
        let loud = waveform
            .iter()
            .position(|value| *value == 0.9)
            .expect("the loud sample drawn");
        // It came after 32 of the 40 quiet blocks.
        assert!(loud.abs_diff(32 * TAKE_WAVEFORM_PEAKS / 40) <= 1, "{loud}");
        assert_eq!(waveform.iter().filter(|value| **value == 0.9).count(), 1);
    }
}
