//! The clip launcher's scenes, laid one after another after the arrangement's
//! end (each a whole number of bars), every slot's clip on its track's cell.

use super::Context;
use super::laying::{Laid, lay_collected};
use super::timeline::{self, Collected, Frame, Unit, Window};
use crate::ImportError;
use crate::molecule_writer::{CellSpec, TimelineBuilder};
use crate::xml::Element;
use std::collections::HashMap;

/// One scene of the clip launcher, flattened.
pub(super) struct SceneContent {
    pub name: String,
    pub start: f64,
    pub end: f64,
    pub slots: Vec<(String, Collected, bool)>,
}

fn slots<'a>(element: &'a Element, track: Option<&'a str>, out: &mut Vec<(&'a str, &'a Element)>) {
    for child in &element.children {
        let owner = child.attr("track").or(track);
        if child.name == "ClipSlot" {
            if let Some(owner) = owner {
                out.push((owner, child));
            }
        } else {
            slots(child, owner, out);
        }
    }
}

/// Flattens the clip launcher's scenes, laid one after another after the arrangement's end.
pub(super) fn collect_scenes(
    context: &mut Context<'_>,
    project: &Element,
    per_track: &HashMap<String, Collected>,
) -> Result<Vec<SceneContent>, ImportError> {
    let Some(scenes) = project.child("Scenes") else {
        return Ok(Vec::new());
    };
    let end = per_track
        .values()
        .flat_map(|c| {
            c.pieces
                .iter()
                .map(|p| p.end)
                .chain(c.groups.iter().map(|g| g.end))
        })
        .fold(0.0, f64::max);
    let bar = |context: &Context<'_>, beat: f64| {
        let (numerator, denominator) = context.tempo.meter_at(beat);
        f64::from(numerator) * 4.0 / f64::from(denominator)
    };
    let mut beat = context.tempo.beat_at(end);
    beat = (beat / bar(context, beat) - 1e-9).ceil().max(0.0) * bar(context, beat);
    let mut out = Vec::new();
    for scene in scenes.children_named("Scene") {
        let name = scene.attr("name").unwrap_or("").to_string();
        let mut found = Vec::new();
        slots(scene, None, &mut found);
        let start = context.tempo.seconds_at(beat);
        let mut length: f64 = 0.0;
        for (_, slot) in &found {
            for clip in slot.children_named("Clip") {
                length = length.max(
                    clip.f64_attr("duration", "dawproject_time_invalid")?
                        .unwrap_or(0.0),
                );
            }
        }
        let bar_beats = bar(context, beat);
        let beats = ((length / bar_beats) - 1e-9).ceil().max(1.0) * bar_beats;
        let end = context.tempo.seconds_at(beat + beats);
        let mut laid_slots = Vec::new();
        for (track, slot) in found {
            let mut collected = Collected::default();
            context.location = name.clone();
            let unit = Unit::of(slot, "timeUnit", Unit::Beats);
            let frame = Frame::placing(context, unit, 0.0, start);
            let looping = slot
                .children_named("Clip")
                .any(|clip| clip.attr("loopEnd").is_some());
            for clip in slot.children_named("Clip") {
                timeline::clip_at(context, clip, frame, Window { start, end }, &mut collected)?;
            }
            laid_slots.push((track.to_string(), collected, looping));
        }
        out.push(SceneContent {
            name,
            start,
            end,
            slots: laid_slots,
        });
        beat += beats;
    }
    Ok(out)
}

/// Lays the scenes and their cells.
pub(super) fn lay_scenes(
    builder: &mut TimelineBuilder,
    laid: &mut Laid,
    scenes: Vec<SceneContent>,
) -> Result<(), ImportError> {
    for scene in scenes {
        let scene_id = builder.add_scene(&scene.name, scene.start, scene.end - scene.start)?;
        for (track, collected, looping) in scene.slots {
            let mut tracks = lay_collected(builder, laid, &track, collected)?;
            tracks.sort();
            tracks.dedup();
            let play_mode = if looping { "loop" } else { "one_shot" };
            for track in tracks {
                builder.set_cell(
                    &scene_id,
                    Some(&track),
                    CellSpec {
                        play_mode: Some(play_mode.into()),
                        ..CellSpec::default()
                    },
                )?;
                builder.report_mut().count("launcher_clips", 1);
            }
        }
    }
    Ok(())
}
