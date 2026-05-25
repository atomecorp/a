use hound::{WavSpec, WavWriter};
use ringbuf::traits::*;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Output format for WAV recording.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub enum OutputFormat {
    /// 16-bit signed integer PCM (CD quality, smaller files)
    Int16,
    /// 24-bit signed integer PCM (professional quality)
    Int24,
    /// 32-bit IEEE float (maximum precision, larger files)
    Float32,
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Int24
    }
}

impl OutputFormat {
    pub(super) fn wav_spec(&self, sample_rate: u32, channels: u16) -> WavSpec {
        match self {
            Self::Int16 => WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
            Self::Int24 => WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 24,
                sample_format: hound::SampleFormat::Int,
            },
            Self::Float32 => WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        }
    }

    fn write_f32_sample<W: std::io::Write + std::io::Seek>(
        &self,
        writer: &mut WavWriter<W>,
        sample: f32,
    ) -> Result<(), hound::Error> {
        match self {
            Self::Int16 => {
                let s = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                writer.write_sample(s)
            }
            Self::Int24 => {
                let s = (sample * 8_388_607.0).clamp(-8_388_608.0, 8_388_607.0) as i32;
                writer.write_sample(s)
            }
            Self::Float32 => writer.write_sample(sample),
        }
    }
}

/// Preferred buffer size hint for CPAL.
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub enum BufferSizeHint {
    /// Let CPAL choose (usually ~2048 samples)
    Default,
    /// Low latency (~256 samples, higher CPU)
    Low,
    /// Medium (~512 samples, balanced)
    Medium,
    /// Custom frame count
    Frames(u32),
}

impl BufferSizeHint {
    pub(super) fn to_cpal(self) -> cpal::BufferSize {
        match self {
            Self::Default => cpal::BufferSize::Default,
            Self::Low => cpal::BufferSize::Fixed(256),
            Self::Medium => cpal::BufferSize::Fixed(512),
            Self::Frames(n) => cpal::BufferSize::Fixed(n),
        }
    }
}

impl Default for BufferSizeHint {
    fn default() -> Self {
        Self::Default
    }
}

fn write_f32_buffer<W: std::io::Write + std::io::Seek>(
    writer: &mut WavWriter<W>,
    format: OutputFormat,
    samples: &[f32],
) -> Result<(), String> {
    for &sample in samples {
        format
            .write_f32_sample(writer, sample)
            .map_err(|error| format!("Failed to write WAV sample: {error}"))?;
    }
    Ok(())
}

pub(super) fn spawn_wav_writer_thread(
    mut consumer: ringbuf::HeapCons<f32>,
    mut writer: WavWriter<std::io::BufWriter<std::fs::File>>,
    output_format: OutputFormat,
    writer_stop: Arc<AtomicBool>,
) -> std::thread::JoinHandle<Result<(), String>> {
    std::thread::spawn(move || {
        let mut buffer = vec![0.0_f32; 4096];
        loop {
            let count = consumer.pop_slice(&mut buffer);
            if count > 0 {
                write_f32_buffer(&mut writer, output_format, &buffer[..count])?;
                continue;
            }
            if writer_stop.load(Ordering::Acquire) && consumer.is_empty() {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        writer
            .finalize()
            .map_err(|error| format!("Failed to finalize WAV: {error}"))?;
        Ok(())
    })
}

pub(super) fn create_wav_writer(
    path: &str,
    output_format: OutputFormat,
    sample_rate: u32,
    channels: u16,
) -> Result<WavWriter<std::io::BufWriter<std::fs::File>>, String> {
    let wav_spec = output_format.wav_spec(sample_rate, channels);
    WavWriter::create(path, wav_spec)
        .map_err(|error| format!("Failed to create WAV file {path}: {error}"))
}
