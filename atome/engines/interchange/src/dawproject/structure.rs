//! The DAWproject structure laid as Molecule tracks: a channel becomes one track
//! per kind of content it plays (audio, MIDI, video), a folder or an effect return
//! a group track; volume, pan, mute, solo, sends, routing and devices go to the
//! track holding the audio strip; then the flattened clips, notes, automation
//! points and the clip launcher's scenes are laid on them.

use super::devices::plugin;
use super::laying::{Laid, Placed, lay_collected};
use super::mixing::{mix_channel, sends};
use super::scenes::SceneContent;
use super::timeline::Collected;
use crate::ImportError;
use crate::molecule_writer::ClipKind;
use crate::molecule_writer::{TimelineBuilder, TrackKind, TrackSpec};
use crate::xml::Element;
use std::collections::HashMap;

struct Route {
    strip: Option<String>,
    location: String,
    destination: Option<String>,
    group: Option<String>,
    sends: Vec<(String, f64, bool)>,
}

fn needs(collected: Option<&Collected>, scenes: &[SceneContent], id: &str) -> (bool, bool, bool) {
    let mut sources: Vec<&Collected> = collected.into_iter().collect();
    for scene in scenes {
        sources.extend(
            scene
                .slots
                .iter()
                .filter(|(track, _, _)| track == id)
                .map(|(_, slot, _)| slot),
        );
    }
    let audio = sources
        .iter()
        .any(|c| c.pieces.iter().any(|piece| piece.kind == ClipKind::Audio));
    let video = sources
        .iter()
        .any(|c| c.pieces.iter().any(|piece| piece.kind == ClipKind::Video));
    let midi = sources.iter().any(|c| !c.groups.is_empty());
    (audio, video, midi)
}

struct Walk<'s> {
    per_track: &'s mut HashMap<String, Collected>,
    scenes: &'s [SceneContent],
    laid: Laid,
    routes: Vec<Route>,
    groups: HashMap<String, String>,
    master: Option<String>,
}

fn lay_track(
    builder: &mut TimelineBuilder,
    walk: &mut Walk<'_>,
    track: &Element,
    parent: Option<&str>,
) -> Result<(), ImportError> {
    let name = track.attr("name").unwrap_or("").to_string();
    let id = track.attr("id").unwrap_or("").to_string();
    let channel = track.child("Channel");
    let role = channel.and_then(|c| c.attr("role")).unwrap_or("regular");
    let content = track.attr("contentType").unwrap_or("");
    let children: Vec<&Element> = track.children_named("Track").collect();
    let mute = channel
        .and_then(|c| c.child("Mute"))
        .and_then(|m| m.bool_attr("value"))
        .unwrap_or(false);
    let solo = channel.and_then(|c| c.bool_attr("solo")).unwrap_or(false);
    if role == "master" {
        walk.master = channel.and_then(|c| c.attr("id")).map(String::from);
        for device in channel
            .and_then(|c| c.child("Devices"))
            .into_iter()
            .flat_map(|devices| devices.children.iter())
        {
            match plugin(device) {
                Some(what) => {
                    builder
                        .report_mut()
                        .skip(&what, &name, "external_plugins_unsupported")
                }
                None => {
                    builder
                        .report_mut()
                        .skip("master_device", &name, "main_output_has_no_strip")
                }
            }
        }
        for child in children {
            lay_track(builder, walk, child, parent)?;
        }
        return Ok(());
    }
    let is_group = !children.is_empty()
        || role == "effect"
        || role == "submix"
        || content.split_whitespace().any(|c| c == "tracks");
    let mut placed = Placed {
        name: name.clone(),
        ..Placed::default()
    };
    let strip: Option<String>;
    if is_group {
        let group = builder.add_track(TrackSpec {
            mute,
            solo,
            ..TrackSpec::group(&name)
        });
        if let Some(channel_id) = channel.and_then(|c| c.attr("id")) {
            walk.groups.insert(channel_id.into(), group.clone());
        }
        walk.groups.insert(id.clone(), group.clone());
        placed.audio = Some(group.clone());
        strip = Some(group);
    } else {
        let (mut audio, video, midi) = needs(walk.per_track.get(&id), walk.scenes, &id);
        let kinds: Vec<&str> = content.split_whitespace().collect();
        if !audio && !video && !midi {
            audio = !kinds.contains(&"notes") && !kinds.contains(&"video");
        }
        let lay = |builder: &mut TimelineBuilder, kind| {
            builder.add_track(TrackSpec {
                mute,
                solo,
                ..TrackSpec::content(&name, kind)
            })
        };
        let only_midi = !audio && !video && (midi || kinds.contains(&"notes"));
        placed.audio = audio.then(|| lay(builder, TrackKind::Audio));
        placed.video = (video || (!audio && !only_midi && kinds.contains(&"video")))
            .then(|| lay(builder, TrackKind::Video));
        placed.midi = (midi || only_midi).then(|| lay(builder, TrackKind::Midi));
        strip = placed.audio.clone().or_else(|| placed.video.clone());
    }
    if let Some(channel) = channel {
        mix_channel(
            builder,
            &mut walk.laid.params,
            channel,
            strip.as_deref(),
            &name,
        )?;
        walk.routes.push(Route {
            strip: strip.clone(),
            location: name.clone(),
            destination: channel.attr("destination").map(String::from),
            group: parent.map(String::from),
            sends: sends(channel, &mut walk.laid.params, &name)?,
        });
    } else if let Some(parent) = parent {
        walk.routes.push(Route {
            strip: strip.clone(),
            location: name.clone(),
            destination: None,
            group: Some(parent.into()),
            sends: Vec::new(),
        });
    }
    walk.laid.tracks.insert(id, placed);
    let group = if is_group { strip } else { None };
    for child in children {
        lay_track(builder, walk, child, group.as_deref().or(parent))?;
    }
    Ok(())
}

fn route(builder: &mut TimelineBuilder, walk: &Walk<'_>, route: &Route) -> Result<(), ImportError> {
    let destination = match &route.destination {
        Some(id) if walk.master.as_deref() == Some(id.as_str()) => None,
        Some(id) => match walk.groups.get(id) {
            Some(group) => Some(group.clone()),
            None => {
                builder.report_mut().skip(
                    "routing",
                    &route.location,
                    "destination_without_equivalent",
                );
                None
            }
        },
        None => route.group.clone(),
    };
    let Some(strip) = &route.strip else {
        if destination.is_some() || !route.sends.is_empty() {
            builder
                .report_mut()
                .skip("routing", &route.location, "track_has_no_audio_strip");
        }
        return Ok(());
    };
    if let Some(group) = destination.filter(|group| group != strip) {
        builder.route_to_group(strip, &group)?;
    }
    for (destination, level, pre) in &route.sends {
        match walk.groups.get(destination) {
            Some(group) if group != strip => {
                builder.send_to_group(strip, group, *level, 1.0)?;
                builder.report_mut().count("sends", 1);
                if *pre {
                    builder.report_mut().approximate(
                        "send",
                        &route.location,
                        "pre_fader_send_laid_after_the_fader",
                    );
                }
            }
            _ => {
                builder
                    .report_mut()
                    .skip("send", &route.location, "destination_without_equivalent")
            }
        }
    }
    Ok(())
}

/// Lays the structure, then each track's arrangement content.
pub(super) fn lay_structure(
    builder: &mut TimelineBuilder,
    project: &Element,
    per_track: &mut HashMap<String, Collected>,
    scenes: &[SceneContent],
) -> Result<Laid, ImportError> {
    let laid = Laid {
        tracks: HashMap::new(),
        params: HashMap::new(),
        points: Vec::new(),
        next_midi: 0,
    };
    let mut walk = Walk {
        per_track,
        scenes,
        laid,
        routes: Vec::new(),
        groups: HashMap::new(),
        master: None,
    };
    for element in project
        .child("Structure")
        .into_iter()
        .flat_map(|s| s.children.iter())
    {
        match element.name.as_str() {
            "Track" => lay_track(builder, &mut walk, element, None)?,
            "Channel" => {
                // A bare channel (an effect return or a submix without a track).
                let wrapper = Element {
                    name: "Track".into(),
                    attributes: vec![
                        ("name".into(), element.attr("name").unwrap_or("").into()),
                        ("id".into(), element.attr("id").unwrap_or("").into()),
                    ],
                    children: vec![element.clone()],
                    text: String::new(),
                };
                lay_track(builder, &mut walk, &wrapper, None)?;
            }
            other => builder.report_mut().skip(
                &other.to_lowercase(),
                "Structure",
                "unsupported_structure_element",
            ),
        }
    }
    let routes = std::mem::take(&mut walk.routes);
    for item in &routes {
        route(builder, &walk, item)?;
    }
    let mut laid = walk.laid;
    let ids: Vec<String> = walk.per_track.keys().cloned().collect();
    for id in ids {
        let collected = walk.per_track.remove(&id).unwrap_or_default();
        lay_collected(builder, &mut laid, &id, collected)?;
    }
    Ok(laid)
}
