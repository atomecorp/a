//! Final Cut Pro XML (`.fcpxml` 1.8–1.11, a `.fcpxmld` bundle's `Info.fcpxml`)
//! read into the Molecule timeline. The first project's sequence is laid: its
//! primary storyline on lane 0, connected clips and storylines on their lanes
//! (above 0 video, below 0 audio), compound clips (`ref-clip`) flattened in place,
//! every time an exact rational (`N/Ds`) until the writer rounds it to samples.
//! A `video` element is picture only (its sound muted), an `audio` element an
//! audio clip, an `asset-clip` its asset's picture with its sound (`srcEnable`
//! choosing). A document holding browser clips and no project lays them end to
//! end. Titles, generators, multicam clips and filters stay out (reported).

mod walk;

use crate::ImportError;
use crate::frac::Frac;
use crate::molecule_writer::{
    ClipKind, ClipSource, ClipSpec, DEFAULT_SAMPLE_RATE, DocumentIds, MoleculeImport,
    TimelineBuilder, TrackKind, TrackSpec, TransitionKind, TransitionSpec,
};
use crate::report::ImportReport;
use crate::xml::{self, Element};
use serde_json::json;
use std::collections::HashMap;
use walk::{Enable, Span};

/// One asset of the resources.
#[derive(Clone, Debug)]
pub(super) struct Asset {
    pub src: String,
    pub start: Frac,
    pub has_video: bool,
    pub has_audio: bool,
    pub image: bool,
}

/// One clip laid, in absolute seconds (exact).
#[derive(Clone, Debug)]
pub(super) struct Piece {
    pub lane: i64,
    pub kind: ClipKind,
    pub key: String,
    pub name: String,
    pub start: Frac,
    pub end: Frac,
    pub source_in: Frac,
    pub sound_muted: bool,
    pub gain_db: Option<f64>,
    pub fade_in: f64,
    pub fade_out: f64,
    pub transition: Option<f64>,
}

/// What the walk shares.
pub(super) struct Context<'a> {
    pub assets: HashMap<String, Asset>,
    pub media: HashMap<String, &'a Element>,
    pub report: ImportReport,
    pub pieces: Vec<Piece>,
    pub transitions: Vec<(i64, Frac, Frac)>,
    pub markers: Vec<(String, Frac)>,
    /// The name of the clip being walked (its `video` and `audio` take it).
    pub name: String,
}

fn time(element: &Element, name: &str) -> Result<Option<Frac>, ImportError> {
    element.attr(name).map(Frac::parse_fcp).transpose()
}

fn flag(element: &Element, name: &str) -> bool {
    element.attr(name) == Some("1")
}

fn asset_of(asset: &Element) -> Result<Asset, ImportError> {
    let src = match asset.attr("src") {
        Some(src) => src.to_string(),
        None => asset
            .children_named("media-rep")
            .find(|rep| rep.attr("kind").is_none_or(|kind| kind == "original-media"))
            .and_then(|rep| rep.attr("src"))
            .unwrap_or("")
            .to_string(),
    };
    let lower = src.to_lowercase();
    let image = [
        ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".heic", ".psd", ".bmp", ".webp",
    ]
    .iter()
    .any(|ext| lower.ends_with(ext));
    Ok(Asset {
        src,
        start: time(asset, "start")?.unwrap_or(Frac::ZERO),
        has_video: flag(asset, "hasVideo"),
        has_audio: flag(asset, "hasAudio"),
        image,
    })
}

fn find<'a>(element: &'a Element, name: &str, out: &mut Vec<&'a Element>) {
    for child in &element.children {
        if child.name == name {
            out.push(child);
        } else if child.name != "resources" {
            find(child, name, out);
        }
    }
}

/// Reads a Final Cut Pro XML document.
pub fn read(text: &str) -> Result<MoleculeImport, ImportError> {
    let root = xml::parse(text, "fcpxml_xml_invalid")?;
    if root.name != "fcpxml" {
        return Err(ImportError::new(
            "fcpxml_not_fcpxml",
            format!("the root element is <{}>, not <fcpxml>", root.name),
        ));
    }
    let version = root.attr("version").unwrap_or("");
    let mut report = ImportReport::new("fcpxml", "Final Cut Pro");
    report.source_fact("version", json!(version));
    let known = version
        .split('.')
        .nth(1)
        .and_then(|minor| minor.parse::<u32>().ok());
    if !version.starts_with("1.") || known.is_none_or(|minor| !(8..=11).contains(&minor)) {
        report.approximate("version", version, "read_as_fcpxml_1_8_to_1_11");
    }
    let mut assets = HashMap::new();
    let mut media = HashMap::new();
    let mut formats: HashMap<String, Frac> = HashMap::new();
    for resources in root.children_named("resources") {
        for resource in &resources.children {
            let Some(id) = resource.attr("id") else {
                continue;
            };
            match resource.name.as_str() {
                "asset" => {
                    assets.insert(id.to_string(), asset_of(resource)?);
                }
                "media" => {
                    media.insert(id.to_string(), resource);
                }
                "format" => {
                    if let Some(frame) =
                        time(resource, "frameDuration")?.filter(|frame| !frame.is_zero())
                    {
                        formats.insert(id.to_string(), Frac::int(1).over(frame)?);
                    }
                }
                _ => {}
            }
        }
    }
    let mut projects = Vec::new();
    find(&root, "project", &mut projects);
    let mut context = Context {
        assets,
        media,
        report,
        pieces: Vec::new(),
        transitions: Vec::new(),
        markers: Vec::new(),
        name: String::new(),
    };
    let mut fps = None;
    match projects.first() {
        Some(project) => {
            if let Some(name) = project.attr("name") {
                context.report.source_name = name.to_string();
            }
            for other in &projects[1..] {
                context.report.skip(
                    "project",
                    other.attr("name").unwrap_or(""),
                    "only_the_first_project_is_read",
                );
            }
            let sequence = project.child("sequence").ok_or_else(|| {
                ImportError::new("fcpxml_sequence_missing", "the project has no sequence")
            })?;
            fps = sequence
                .attr("format")
                .and_then(|format| formats.get(format))
                .copied();
            let tc_start = time(sequence, "tcStart")?.unwrap_or(Frac::ZERO);
            context
                .report
                .source_fact("tc_start_seconds", json!(tc_start.to_f64()));
            let span = Span {
                shift: Frac::ZERO.minus(tc_start),
                from: Frac::ZERO,
                to: None,
            };
            for spine in sequence.children_named("spine") {
                walk::children(&mut context, spine, span, 0, Enable::All, 0)?;
            }
        }
        None => {
            // Browser clips (an event or the document itself): laid end to end.
            let mut clips: Vec<&Element> = Vec::new();
            for holder in std::iter::once(&root).chain(
                root.children
                    .iter()
                    .filter(|c| c.name == "event" || c.name == "library"),
            ) {
                for child in &holder.children {
                    match child.name.as_str() {
                        "asset-clip" | "clip" | "ref-clip" | "sync-clip" | "mc-clip"
                        | "audition" => clips.push(child),
                        "event" => clips.extend(child.children.iter().filter(|c| {
                            matches!(
                                c.name.as_str(),
                                "asset-clip"
                                    | "clip"
                                    | "ref-clip"
                                    | "sync-clip"
                                    | "mc-clip"
                                    | "audition"
                            )
                        })),
                        _ => {}
                    }
                }
            }
            if clips.is_empty() {
                return Err(ImportError::new(
                    "fcpxml_nothing_to_import",
                    "the document holds no project and no clip",
                ));
            }
            context
                .report
                .approximate("browser_clips", "fcpxml", "browser_clips_laid_end_to_end");
            let mut position = Frac::ZERO;
            for clip in clips {
                let duration = time(clip, "duration")?.unwrap_or(Frac::ZERO);
                let offset = time(clip, "offset")?.unwrap_or(Frac::ZERO);
                let span = Span {
                    shift: position.minus(offset),
                    from: position,
                    to: None,
                };
                walk::element(&mut context, clip, span, 0, Enable::All, 0)?;
                position = position.plus(duration);
            }
        }
    }
    write(context, fps)
}

fn apply_transitions(context: &mut Context<'_>) {
    let transitions = std::mem::take(&mut context.transitions);
    for (lane, from, to) in transitions {
        let seconds = to.minus(from).to_f64();
        let inside = |t: Frac| t >= from && t <= to;
        let left: Vec<usize> = (0..context.pieces.len())
            .filter(|&i| context.pieces[i].lane == lane && inside(context.pieces[i].end))
            .collect();
        let right: Vec<usize> = (0..context.pieces.len())
            .filter(|&i| context.pieces[i].lane == lane && inside(context.pieces[i].start))
            .collect();
        match (left.is_empty(), right.is_empty()) {
            (false, false) => {
                for index in left {
                    context.pieces[index].transition = Some(seconds);
                }
                context.report.count("transitions", 1);
            }
            (true, false) => {
                context.report.approximate(
                    "transition",
                    "spine",
                    "transition_from_a_gap_laid_as_a_fade_in",
                );
                for index in right {
                    context.pieces[index].fade_in = seconds;
                }
            }
            (false, true) => {
                context.report.approximate(
                    "transition",
                    "spine",
                    "transition_to_a_gap_laid_as_a_fade_out",
                );
                for index in left {
                    context.pieces[index].fade_out = seconds;
                }
            }
            (true, true) => context
                .report
                .skip("transition", "spine", "transition_between_gaps"),
        }
    }
}

fn write(mut context: Context<'_>, fps: Option<Frac>) -> Result<MoleculeImport, ImportError> {
    apply_transitions(&mut context);
    if let Some(fps) = fps {
        context.report.source_fact(
            "frame_rate",
            json!({ "num": fps.num() as i64, "den": fps.den() as i64 }),
        );
    }
    let mut lanes: Vec<(i64, bool)> = context
        .pieces
        .iter()
        .map(|piece| (piece.lane, piece.kind == ClipKind::Audio))
        .collect();
    // Video lanes from the top down, then the audio lanes from the primary storyline down.
    lanes.sort_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0)));
    lanes.dedup();
    let pieces = std::mem::take(&mut context.pieces);
    let markers = std::mem::take(&mut context.markers);
    let mut builder = TimelineBuilder::new(
        DocumentIds::placeholder(),
        DEFAULT_SAMPLE_RATE,
        context.report,
    )?;
    if let Some(fps) = fps {
        builder.set_frame_rate(fps.to_f64())?;
    }
    let mut tracks: HashMap<(i64, bool), String> = HashMap::new();
    for (lane, audio) in lanes {
        let name = match (audio, lane) {
            (false, 0) => "Vidéo".to_string(),
            (false, lane) => format!("Vidéo {lane:+}"),
            (true, 0) => "Audio".to_string(),
            (true, lane) => format!("Audio {lane:+}"),
        };
        let kind = if audio {
            TrackKind::Audio
        } else {
            TrackKind::Video
        };
        tracks.insert(
            (lane, audio),
            builder.add_track(TrackSpec::content(&name, kind)),
        );
    }
    for piece in pieces {
        let track = &tracks[&(piece.lane, piece.kind == ClipKind::Audio)];
        let start = piece.start.to_f64();
        let duration = piece.end.minus(piece.start).to_f64();
        let mut spec = ClipSpec::new(
            piece.kind,
            ClipSource::Media(piece.key),
            start,
            duration,
            piece.source_in.to_f64(),
        );
        spec.name = (!piece.name.is_empty()).then_some(piece.name);
        spec.sound_muted = piece.sound_muted;
        spec.gain_db = piece.gain_db;
        spec.fade_in_seconds = piece.fade_in;
        spec.fade_out_seconds = piece.fade_out;
        spec.transition = piece.transition.map(|seconds| TransitionSpec {
            kind: TransitionKind::Fade,
            seconds,
        });
        builder.add_clip(track, spec)?;
    }
    for (name, at) in markers {
        builder.add_marker(&name, at.to_f64().max(0.0))?;
    }
    builder.finish()
}
