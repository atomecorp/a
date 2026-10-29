// Reads a mixer asset from disk: a Neural Amp Modeler capture (`.nam`, JSON)
// or an impulse response (`.wav`, its first two channels).

use atome_mix_graph::dsp_module::StoredAsset;
use std::path::Path;
use std::sync::Arc;

pub fn read(path: &Path) -> Result<StoredAsset, String> {
    let extension = path.extension().and_then(|extension| extension.to_str()).map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("nam") => std::fs::read_to_string(path)
            .map(|json| StoredAsset::AmpCapture(Arc::new(json)))
            .map_err(|error| format!("mix asset {}: {error}", path.display())),
        Some("wav") => read_impulse(path),
        _ => Err(format!("mix asset {} is neither a .nam capture nor a .wav impulse", path.display())),
    }
}

fn read_impulse(path: &Path) -> Result<StoredAsset, String> {
    let mut reader = hound::WavReader::open(path).map_err(|error| format!("mix asset {}: {error}", path.display()))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<Result<_, _>>(),
        hound::SampleFormat::Int => {
            let scale = 1.0 / (1u64 << (spec.bits_per_sample - 1)) as f32;
            reader.samples::<i32>().map(|sample| sample.map(|value| value as f32 * scale)).collect::<Result<_, _>>()
        }
    }
    .map_err(|error| format!("mix asset {}: {error}", path.display()))?;
    let left: Vec<f32> = samples.iter().step_by(channels).copied().collect();
    let right = (channels > 1).then(|| samples.iter().skip(1).step_by(channels).copied().collect());
    Ok(StoredAsset::Impulse { left: Arc::new(left), right: right.map(Arc::new), sample_rate: spec.sample_rate as f64 })
}
