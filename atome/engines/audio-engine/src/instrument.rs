// Instruments of the native engine (todo/sampler_cahier_des_charges §14): a
// sample is decoded once from its file and shared by the timeline's mix graph
// and the direct path's (an `Arc`, never a copy); every other command
// (atome_mix_graph::instrument_command) reaches both graphs, a note the graphs
// where a strip plays the instrument.

use super::playback::{self, ENGINE};
use atome_mix_graph::instrument_command::{self, InstrumentAnswer, InstrumentCommand};
use atome_mix_graph::{MixGraph, SampleData};
use std::path::Path;

fn with_timeline<T>(action: impl FnOnce(&mut MixGraph) -> Result<T, String>) -> Result<T, String> {
    let mut guard = ENGINE.write().map_err(|error| format!("Lock error: {error}"))?;
    action(guard.as_mut().ok_or("Audio engine not initialized")?.mix.graph_mut())
}

// A sample's planar channels at its own rate (a multichannel file keeps its first two).
pub fn decode(path: &Path) -> Result<SampleData, String> {
    let label = path.to_string_lossy();
    let bytes = std::fs::read(path).map_err(|error| format!("instrument sample {label}: {error}"))?;
    let data = playback::decode_static_sound_data(bytes, playback::clip_extension_hint(&label).as_deref(), &label)?;
    let left = data.frames.iter().map(|frame| frame.left).collect();
    let right = data.frames.iter().map(|frame| frame.right).collect();
    Ok(SampleData::stereo(left, right, data.sample_rate as f32))
}

// Its length and rate, which the instrument's description records.
pub fn load_sample(sample_id: &str, path: &Path) -> Result<(usize, f32), String> {
    let data = decode(path)?;
    let shape = (data.frames(), data.sample_rate);
    super::direct::with_graph(|graph| {
        graph.instruments().load_sample(sample_id, data.clone());
        Ok(())
    })?;
    with_timeline(|graph| {
        graph.instruments().load_sample(sample_id, data);
        Ok(())
    })?;
    Ok(shape)
}

// A description, a removal or an unload reaches both graphs; a note, a setting
// or a clock the graphs that play the instrument (an error when none does); the
// fired command markers of both graphs are drained together.
pub fn run(command: InstrumentCommand) -> Result<InstrumentAnswer, String> {
    let shared = matches!(command, InstrumentCommand::Set { .. } | InstrumentCommand::Remove { .. } | InstrumentCommand::UnloadSample { .. });
    let direct = super::direct::with_graph(|graph| instrument_command::run(graph, command.clone()));
    let timeline = with_timeline(|graph| instrument_command::run(graph, command));
    match (direct, timeline) {
        (Ok(InstrumentAnswer::Actions(mut direct)), Ok(InstrumentAnswer::Actions(timeline))) => {
            direct.actions.extend(timeline.actions);
            direct.actions.sort_by_key(|fired| fired.frame);
            direct.dropped += timeline.dropped;
            direct.stale += timeline.stale;
            Ok(InstrumentAnswer::Actions(direct))
        }
        (Err(error), _) | (_, Err(error)) if shared => Err(error),
        (Ok(answer), _) | (_, Ok(answer)) => Ok(answer),
        (Err(error), Err(_)) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_wav_sample_decodes_to_its_two_channels_at_its_rate() {
        let path = std::env::temp_dir().join(format!("atome_instrument_sample_{}.wav", std::process::id()));
        let spec = hound::WavSpec { channels: 2, sample_rate: 44_100, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for index in 0..4410 {
            writer.write_sample(if index % 2 == 0 { 8192i16 } else { -8192 }).unwrap();
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();
        let data = super::decode(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert_eq!((data.frames(), data.sample_rate), (4410, 44_100.0));
        assert!((data.left[0] - 0.25).abs() < 1.0e-3 && (data.left[1] + 0.25).abs() < 1.0e-3, "left keeps its samples");
        assert!(data.right.iter().all(|sample| sample.abs() < 1.0e-6), "right is its own channel");
    }
}
