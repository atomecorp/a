//! The document itself: seconds rounded to sample frames as the kernel rounds them,
//! overlapping clips moved to sibling tracks, each section closed by its empty
//! track, then every field the kernel validates written once.

use super::mix::strip_value;
use super::spec::{ClipKind, ClipSource, ClipSpec, MediaUse, TrackRole};
use super::{MoleculeImport, TimelineBuilder, Track};
use crate::ImportError;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

/// The kernel's stretch range (`STRETCH_MIN_RATIO`, `STRETCH_MAX_RATIO`).
const STRETCH_RANGE: (f64, f64) = (0.25, 4.0);
/// The kernel's clip gain range (`CLIP_GAIN_MIN_DB`, `CLIP_GAIN_MAX_DB`).
const CLIP_GAIN_RANGE: (f64, f64) = (-60.0, 12.0);

// `Math.round(seconds * sample_rate)` for seconds >= 0 (JS rounds halves up, as
// `f64::round` does for non-negative values).
fn frame(seconds: f64, rate: f64) -> i64 {
    (seconds.max(0.0) * rate).round() as i64
}

struct Laid {
    id: String,
    track: String,
    spec: ClipSpec,
    start: i64,
    duration: i64,
    source_in: i64,
    source_out: i64,
    // Its whole occupied span (a block loop occupies all its repeats).
    occupied: i64,
}

fn lay(builder: &mut TimelineBuilder, id: String, track: String, spec: ClipSpec) -> Option<Laid> {
    let rate = f64::from(builder.sample_rate);
    let start = frame(spec.start_seconds, rate);
    let duration = frame(spec.start_seconds + spec.duration_seconds, rate) - start;
    let name = spec.name.clone().unwrap_or_default();
    if duration <= 0 {
        builder
            .report
            .skip("clip", &name, "shorter_than_one_sample");
        return None;
    }
    if spec.source_in_seconds < 0.0 {
        builder.report.approximate(
            "clip_source_start",
            &name,
            "source_start_before_media_start_clamped",
        );
    }
    let source_in = frame(spec.source_in_seconds, rate);
    let natural = spec
        .source_out_seconds
        .unwrap_or(spec.source_in_seconds + spec.duration_seconds);
    let source_out = frame(natural, rate).max(source_in + 1);
    let occupied = spec.block_loop_seconds.map_or(duration, |loop_seconds| {
        frame(loop_seconds, rate).max(duration)
    });
    Some(Laid {
        id,
        track,
        spec,
        start,
        duration,
        source_in,
        source_out,
        occupied,
    })
}

// Clips overlapping on one track go to sibling tracks laid right after it, each
// sibling a copy of the track (its kind, its strip), the first free one taken.
fn spread_overlaps(builder: &mut TimelineBuilder, laid: &mut [Laid]) {
    let mut order: Vec<usize> = (0..laid.len()).collect();
    order.sort_by_key(|&index| (laid[index].start, index));
    // track id -> [(lane track id, end of its last clip)]
    let mut lanes: BTreeMap<String, Vec<(String, i64)>> = BTreeMap::new();
    for index in order {
        let original = laid[index].track.clone();
        let entry = lanes
            .entry(original.clone())
            .or_insert_with(|| vec![(original.clone(), 0)]);
        let free = entry.iter().position(|(_, end)| *end <= laid[index].start);
        let lane = match free {
            Some(lane) => lane,
            None => {
                let base = builder
                    .tracks
                    .iter()
                    .position(|track| track.id == original)
                    .expect("a laid clip's track exists");
                let mut sibling: Track = builder.tracks[base].clone();
                builder.next += 1;
                sibling.id = format!("track_{}", builder.next);
                sibling.spec.name =
                    format!("{} {}", builder.tracks[base].spec.name, entry.len() + 1);
                let after = builder
                    .tracks
                    .iter()
                    .rposition(|track| entry.iter().any(|(id, _)| *id == track.id))
                    .unwrap_or(base);
                builder.tracks.insert(after + 1, sibling.clone());
                builder.report.approximate(
                    "overlapping_clips",
                    &builder.tracks[base].spec.name.clone(),
                    "moved_to_a_sibling_track",
                );
                entry.push((sibling.id, 0));
                entry.len() - 1
            }
        };
        entry[lane].1 = laid[index].start + laid[index].occupied;
        laid[index].track = entry[lane].0.clone();
    }
}

fn clip_value(builder: &mut TimelineBuilder, clip: &Laid) -> Value {
    let rate = f64::from(builder.sample_rate);
    let seconds = |frames: i64| frames as f64 / rate;
    let source = match &clip.spec.source {
        ClipSource::Media(key) | ClipSource::Midi(key) => {
            json!({ "type": "media_ref", "media_ref": key })
        }
        ClipSource::Atome(id) => json!({ "type": "atome", "atome_id": id }),
    };
    let mut value = json!({
        "clip_id": clip.id, "track_id": clip.track, "kind": clip.spec.kind.key(), "source": source,
        "timeline": {
            "start_frame": clip.start, "duration_frames": clip.duration,
            "source_in_frame": clip.source_in, "source_out_frame": clip.source_out,
            "start_seconds": seconds(clip.start), "duration_seconds": seconds(clip.duration),
            "source_in_seconds": seconds(clip.source_in), "source_out_seconds": seconds(clip.source_out),
            "start_time": seconds(clip.start), "source_in_time": seconds(clip.source_in),
            "source_out_time": seconds(clip.source_out)
        }
    });
    let spec = &clip.spec;
    let name = spec.name.clone().unwrap_or_default();
    if let Some(text) = spec.name.as_ref().filter(|text| !text.is_empty()) {
        value["name"] = json!(text);
    }
    let fade_in = frame(spec.fade_in_seconds, rate).min(clip.duration);
    let fade_out = frame(spec.fade_out_seconds, rate).min(clip.duration - fade_in);
    if fade_in > 0 || fade_out > 0 {
        value["fades"] = json!({ "in_frames": fade_in, "out_frames": fade_out });
    }
    if let Some(gain) = spec.gain_db.filter(|gain| gain.is_finite() && *gain != 0.0) {
        if !(CLIP_GAIN_RANGE.0..=CLIP_GAIN_RANGE.1).contains(&gain) {
            builder
                .report
                .approximate("clip_gain", &name, "clip_gain_kept_within_-60_12_db");
        }
        value["gain_db"] = json!(gain.clamp(CLIP_GAIN_RANGE.0, CLIP_GAIN_RANGE.1));
    }
    if let Some(transition) = spec.transition {
        let frames = frame(transition.seconds, rate);
        if frames > 0 {
            value["transition"] = json!({ "kind": transition.kind.key(), "frames": frames });
        }
    }
    if clip.occupied > clip.duration {
        value["block_loop"] = json!({ "enabled": true, "duration_frames": clip.occupied });
    }
    if let Some(stretch) = spec
        .stretch
        .filter(|stretch| (stretch.ratio - 1.0).abs() > 1e-9)
    {
        if (STRETCH_RANGE.0..=STRETCH_RANGE.1).contains(&stretch.ratio) {
            value["stretch"] = json!({
                "enabled": true, "ratio": stretch.ratio, "engine": "playback_rate", "pitch_lock": stretch.pitch_lock,
                "natural_duration_frames": clip.source_out - clip.source_in
            });
        } else {
            builder
                .report
                .skip("clip_stretch", &name, "stretch_ratio_outside_0.25_4");
        }
    }
    if spec.sound_muted && spec.kind == ClipKind::Video {
        value["sound_muted"] = json!(true);
    }
    value
}

fn track_value(track: &Track, order: usize, empty: bool) -> Value {
    json!({
        "track_id": track.id, "section_id": track.section, "kind": if empty { "mixed" } else { track.spec.kind.key() },
        "name": track.spec.name, "order": order * 10,
        "role": if track.spec.role == TrackRole::Group { "group" } else { "content" },
        "empty_slot": empty, "record_arm": false, "mute": track.spec.mute, "solo": track.spec.solo,
        "continue_beyond_section": false, "quantization": null,
        "loop": { "enabled": false, "start_frame": 0, "end_frame": 0, "repeat_count": null }
    })
}

fn media_uses(laid: &[Laid]) -> Vec<MediaUse> {
    let mut uses: Vec<MediaUse> = Vec::new();
    for clip in laid {
        let ClipSource::Media(key) = &clip.spec.source else {
            continue;
        };
        match uses.iter_mut().find(|entry| entry.media_key == *key) {
            Some(entry) => entry.clips += 1,
            None => uses.push(MediaUse {
                media_key: key.clone(),
                kind: clip.spec.kind.key().into(),
                clips: 1,
            }),
        }
    }
    uses
}

fn check_midi(builder: &TimelineBuilder, laid: &[Laid]) -> Result<(), ImportError> {
    for clip in laid {
        if let ClipSource::Midi(key) = &clip.spec.source
            && !builder.midi.iter().any(|media| media.media_key == *key)
        {
            return Err(ImportError::new(
                "writer_midi_media_missing",
                format!("no MIDI media {key}"),
            ));
        }
        if let ClipSource::Media(key) = &clip.spec.source
            && builder.midi.iter().any(|media| media.media_key == *key)
        {
            return Err(ImportError::new(
                "writer_media_key_shared",
                format!("{key} names both a media and MIDI notes"),
            ));
        }
    }
    Ok(())
}

pub(super) fn finish(mut builder: TimelineBuilder) -> Result<MoleculeImport, ImportError> {
    let rate = f64::from(builder.sample_rate);
    let clips = std::mem::take(&mut builder.clips);
    let mut laid: Vec<Laid> = Vec::with_capacity(clips.len());
    for (id, track, spec) in clips {
        if let Some(clip) = lay(&mut builder, id, track, spec) {
            laid.push(clip);
        }
    }
    check_midi(&builder, &laid)?;
    spread_overlaps(&mut builder, &mut laid);
    let mut extent = laid
        .iter()
        .map(|clip| clip.start + clip.occupied)
        .max()
        .unwrap_or(0);
    let mut scenes: Vec<Value> = Vec::new();
    let mut spans: Vec<(i64, i64)> = Vec::new();
    for scene in &builder.scenes {
        let start = frame(scene.start_seconds, rate);
        let duration = (frame(scene.start_seconds + scene.duration_seconds, rate) - start).max(1);
        if spans
            .iter()
            .any(|(from, to)| start < *to && *from < start + duration)
        {
            return Err(ImportError::new(
                "writer_scenes_overlap",
                format!("scene {} overlaps another", scene.name),
            ));
        }
        spans.push((start, start + duration));
        extent = extent.max(start + duration);
        scenes.push(json!({ "scene_id": scene.id, "name": scene.name, "start_frame": start, "duration_frames": duration }));
    }
    let sections: Vec<Value> = builder
        .sections
        .iter()
        .enumerate()
        .map(|(order, (id, name))| {
            let duration = if order == 0 && extent > 0 { json!(extent) } else { Value::Null };
            json!({ "section_id": id, "name": name, "order": order, "duration_frames": duration, "tempo": null, "meter": null })
        })
        .collect();
    let mut tracks: Vec<Value> = Vec::new();
    let mut strips = Map::new();
    let section_ids: Vec<String> = builder.sections.iter().map(|(id, _)| id.clone()).collect();
    for section in &section_ids {
        let members: Vec<Track> = builder
            .tracks
            .iter()
            .filter(|track| track.section == *section)
            .cloned()
            .collect();
        for track in &members {
            tracks.push(track_value(track, tracks.len(), false));
            if (track.spec.role == TrackRole::Group || track.spec.kind.has_audio_strip())
                && !track.strip.is_default()
            {
                let strip_id = format!("{}:audio", track.id);
                strips.insert(strip_id.clone(), strip_value(&strip_id, &track.strip));
            }
        }
        builder.next += 1;
        let empty = Track {
            id: format!("track_{}", builder.next),
            section: section.clone(),
            spec: super::TrackSpec::content(
                &format!("Piste {}", members.len() + 1),
                super::TrackKind::Mixed,
            ),
            strip: Default::default(),
        };
        tracks.push(track_value(&empty, tracks.len(), true));
    }
    let clip_values: Vec<Value> = laid
        .iter()
        .map(|clip| clip_value(&mut builder, clip))
        .collect();
    let automation: Vec<Value> = builder
        .lanes
        .iter()
        .map(|lane| {
            let mut keyframes = lane.keyframes.clone();
            keyframes.sort_by(|a, b| a.time_seconds.total_cmp(&b.time_seconds));
            let keyframes: Vec<Value> = keyframes
                .iter()
                .enumerate()
                .map(|(index, k)| json!({ "keyframe_id": format!("{}:k{}", lane.id, index + 1),
                    "time_seconds": k.time_seconds, "value": k.value, "curve": k.curve.key() }))
                .collect();
            json!({ "automation_id": lane.id, "target_id": lane.target, "param": lane.param, "keyframes": keyframes })
        })
        .collect();
    let first_bpm = builder.tempo_map[0].bpm;
    let mut document = json!({
        "schema": "eve.molecule.timeline", "schema_version": 2,
        "timeline_id": builder.ids.timeline_id, "project_id": builder.ids.project_id,
        "owner_atome_id": builder.ids.owner_atome_id,
        "timebase": { "fps": builder.fps, "ticks_per_second": 30000, "sample_rate": builder.sample_rate,
            "tempo_map": builder.tempo_map },
        "duration_seconds": extent as f64 / rate,
        "sections": sections, "tracks": tracks, "clips": clip_values,
        "mix": { "strips": strips, "groups": [], "detached_strip_ids": [] },
        "automation": automation, "record_regions": [],
        "transport": { "playhead_seconds": 0, "playhead_frame": 0, "playhead_time": 0,
            "loop": { "enabled": false, "start_seconds": 0, "end_seconds": 0, "start_frame": 0, "end_frame": 0,
                "start_time": 0, "end_time": 0 },
            "tempo": first_bpm, "rate": 1 },
        "settings": { "quantization": "off", "metronome_enabled": false, "pre_roll_bars": 1,
            "record_defaults": { "audio": { "fill_mode": "fixed", "bars": 4 }, "video": { "fill_mode": "fill_empty_space" },
                "screen": { "fill_mode": "fill_empty_space" }, "photo": { "fill_mode": "fixed", "bars": 1 } } },
        "view": { "x_zoom": 1, "y_zoom": 1, "focus": null },
        "meta": { "created_at": "1970-01-01T00:00:00Z", "updated_at": "1970-01-01T00:00:00Z" }
    });
    if !builder.markers.is_empty() {
        let mut markers = builder.markers.clone();
        markers.sort_by(|a, b| a.1.total_cmp(&b.1));
        document["markers"] = Value::Array(
            markers
                .iter()
                .enumerate()
                .map(|(index, (name, time))| json!({ "marker_id": format!("marker_{}", index + 1), "name": name, "time_seconds": time }))
                .collect(),
        );
    }
    if !scenes.is_empty() {
        document["scenes"] = Value::Array(scenes);
        document["cells"] = Value::Array(cell_values(&builder));
    }
    let media = media_uses(&laid);
    let notes: usize = builder.midi.iter().map(|midi| midi.notes.len()).sum();
    for (key, count) in [
        ("tracks", builder.tracks.len()),
        ("clips", laid.len()),
        ("notes", notes),
        ("markers", builder.markers.len()),
        ("scenes", builder.scenes.len()),
        ("automation_lanes", builder.lanes.len()),
        ("media", media.len()),
    ] {
        builder.report.imported.insert(key.into(), count as u64);
    }
    document["meta"]["import"] = builder.report.to_value();
    Ok(MoleculeImport {
        document,
        report: builder.report,
        media,
        midi: builder.midi,
    })
}

fn cell_values(builder: &TimelineBuilder) -> Vec<Value> {
    builder
        .cells
        .iter()
        .map(|(scene, track, cell)| {
            let track = track.clone().unwrap_or_else(|| "scene".into());
            let mut settings = Map::new();
            if let Some(mode) = &cell.play_mode {
                settings.insert("play_mode".into(), json!(mode));
            }
            if let Some(trigger) = &cell.trigger {
                settings.insert("trigger".into(), json!(trigger));
            }
            if cell.play_mode.is_some() || cell.passes.is_some() {
                settings.insert("passes".into(), cell.passes.map_or(Value::Null, |passes| json!(passes)));
            }
            json!({ "cell_id": format!("{scene}|{track}"), "scene_id": scene, "track_id": track, "settings": settings })
        })
        .collect()
}
