// A Sampler's sample file as the instrument reads it (cahier sampler §2, V1.2).
// A PCM or float WAV is read in place, at any frame: a short one whole, a long
// one from the heads its instruments start at, the rest streamed by the worker
// (atome-instrument stream.rs), so a bank of several GB is never all in memory.
// Another format (compressed) has no exact random access here: it is decoded
// whole (instrument.rs).

use atome_mix_graph::{FrameSource, SampleData};
use hound::{SampleFormat, WavReader};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct WavSource {
    // Read by the stream worker (and the control thread for heads), never by the render.
    reader: Mutex<WavReader<BufReader<File>>>,
    label: String,
    frames: usize,
    sample_rate: f32,
    channels: usize,
    float: bool,
    scale: f32,
}

impl WavSource {
    // None: the file is not a WAV hound reads in place (another format, or a WAV codec).
    pub fn open(path: &Path) -> Result<Option<Self>, String> {
        let label = path.to_string_lossy().into_owned();
        let reader = match WavReader::open(path) {
            Ok(reader) => reader,
            Err(hound::Error::FormatError(_) | hound::Error::Unsupported) => return Ok(None),
            Err(error) => return Err(format!("instrument sample {label}: {error}")),
        };
        let spec = reader.spec();
        let float = spec.sample_format == SampleFormat::Float;
        if float && spec.bits_per_sample != 32 || !float && !(8..=32).contains(&spec.bits_per_sample) || spec.channels == 0 {
            return Ok(None);
        }
        Ok(Some(Self {
            frames: reader.duration() as usize,
            sample_rate: spec.sample_rate as f32,
            channels: spec.channels as usize,
            float,
            scale: if float { 1.0 } else { 1.0 / (1u64 << (spec.bits_per_sample - 1)) as f32 },
            reader: Mutex::new(reader),
            label,
        }))
    }

    fn read_samples<T: hound::Sample>(&self, reader: &mut WavReader<BufReader<File>>, left: &mut [f32], right: &mut [f32], value: impl Fn(T) -> f32) -> Result<(), String> {
        let mut samples = reader.samples::<T>();
        for frame in 0..left.len() {
            for channel in 0..self.channels {
                let sample = samples.next().ok_or_else(|| format!("instrument sample {}: ends before frame {frame}", self.label))?;
                let sample = value(sample.map_err(|error| format!("instrument sample {}: {error}", self.label))?);
                match channel {
                    0 => left[frame] = sample,
                    1 => right[frame] = sample,
                    _ => {}
                }
            }
        }
        Ok(())
    }
}

impl FrameSource for WavSource {
    fn frames(&self) -> usize {
        self.frames
    }

    fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    // A multichannel file keeps its first two, as a decoded one does.
    fn channels(&self) -> usize {
        self.channels.min(2)
    }

    fn read(&self, at: usize, left: &mut [f32], right: &mut [f32]) -> Result<(), String> {
        let mut reader = self.reader.lock().map_err(|error| format!("instrument sample {}: {error}", self.label))?;
        let frame = u32::try_from(at).map_err(|_| format!("instrument sample {}: frame {at} beyond a WAV", self.label))?;
        reader.seek(frame).map_err(|error| format!("instrument sample {}: {error}", self.label))?;
        let scale = self.scale;
        if self.float {
            self.read_samples::<f32>(&mut reader, left, right, |sample| sample)
        } else {
            self.read_samples::<i32>(&mut reader, left, right, |sample| sample as f32 * scale)
        }
    }
}

// The sample at `path` read in place when it can be: whole or streamed (SampleData::load).
pub fn open(path: &Path) -> Result<Option<SampleData>, String> {
    let Some(source) = WavSource::open(path)? else { return Ok(None) };
    SampleData::load(Arc::new(source)).map(Some)
}

#[cfg(test)]
mod tests {
    use atome_mix_graph::FrameSource;

    fn write(name: &str, frames: usize, bits: u16) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("atome_instrument_source_{name}_{}.wav", std::process::id()));
        let spec = hound::WavSpec { channels: 2, sample_rate: 48_000, bits_per_sample: bits, sample_format: hound::SampleFormat::Int };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        let top = (1i64 << (bits - 1)) - 1;
        for index in 0..frames as i64 {
            writer.write_sample(((index * 7919) % top - top / 2) as i32).unwrap();
            writer.write_sample((-((index * 104_729) % top) + top / 3) as i32).unwrap();
        }
        writer.finalize().unwrap();
        path
    }

    // Read in place, a WAV gives the very samples the whole decode gives.
    #[test]
    fn a_wav_read_in_place_matches_its_decode_short_whole_long_streamed() {
        for (name, frames, bits, streamed) in [("short16", 4_800, 16, false), ("long24", 96_000, 24, true)] {
            let path = write(name, frames, bits);
            let decoded = super::super::instrument::decode(&path).unwrap();
            let data = super::open(&path).unwrap().expect("a PCM WAV is read in place");
            assert_eq!((data.frames(), data.sample_rate, data.is_streamed()), (frames, 48_000.0, streamed), "{name}");
            let source = super::WavSource::open(&path).unwrap().unwrap();
            let (mut left, mut right) = (vec![0.0; 2_048], vec![0.0; 2_048]);
            let at = frames - 2_048 - 13;
            source.read(at, &mut left, &mut right).unwrap();
            std::fs::remove_file(&path).unwrap();
            for index in 0..2_048 {
                let expected = decoded.frame(at + index).unwrap();
                assert_eq!((left[index].to_bits(), right[index].to_bits()), (expected.0.to_bits(), expected.1.to_bits()), "{name} frame {}", at + index);
            }
            if !streamed {
                assert!((0..frames).all(|index| data.frame(index) == decoded.frame(index)), "{name}: whole in memory, the same");
            }
        }
    }
}
