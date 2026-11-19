//! The story elements walked: an element's local time `t` lies in its parent at
//! `offset + t - start`, so on the timeline at `t + shift` with
//! `shift = parent shift + offset - start`; its span cuts its parent's to
//! `[offset, offset + duration]`. Connected items add their `lane` to their
//! parent's.

use super::{Context, Piece, time};
use crate::ImportError;
use crate::frac::Frac;
use crate::molecule_writer::ClipKind;
use crate::xml::Element;

const MAX_DEPTH: usize = 64;

/// Which of picture and sound an element lets through (`srcEnable`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Enable {
    All,
    Video,
    Audio,
}

impl Enable {
    fn within(self, element: &Element) -> Enable {
        match (self, element.attr("srcEnable")) {
            (Enable::All, Some("video")) => Enable::Video,
            (Enable::All, Some("audio")) => Enable::Audio,
            (current, _) => current,
        }
    }
}

/// An element's place: timeline time = local time + `shift`, inside `[from, to)`.
#[derive(Clone, Copy, Debug)]
pub(super) struct Span {
    pub shift: Frac,
    pub from: Frac,
    pub to: Option<Frac>,
}

impl Span {
    fn cut(self, element: &Element) -> Result<Span, ImportError> {
        let offset = time(element, "offset")?.unwrap_or(Frac::ZERO);
        let start = time(element, "start")?.unwrap_or(Frac::ZERO);
        let begin = self.shift.plus(offset);
        let shift = begin.minus(start);
        let to = match time(element, "duration")? {
            Some(duration) => {
                let end = begin.plus(duration);
                Some(self.to.map_or(end, |to| to.min(end)))
            }
            None => self.to,
        };
        Ok(Span {
            shift,
            from: self.from.max(begin),
            to,
        })
    }

    fn is_empty(&self) -> bool {
        self.to.is_some_and(|to| to <= self.from)
    }
}

fn lane_of(element: &Element) -> i64 {
    element
        .attr("lane")
        .and_then(|lane| lane.trim().parse::<i64>().ok())
        .unwrap_or(0)
}

fn gain_of(element: &Element) -> Option<f64> {
    let amount = element.child("adjust-volume")?.attr("amount")?;
    amount
        .trim()
        .trim_end_matches("dB")
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
}

/// Walks an element's children in its span.
pub(super) fn children(
    context: &mut Context<'_>,
    parent: &Element,
    span: Span,
    lane: i64,
    enable: Enable,
    depth: usize,
) -> Result<(), ImportError> {
    for child in &parent.children {
        // A connected item is not its parent's picture or sound: `srcEnable` stops there.
        let enable = if child.attr("lane").is_some() {
            Enable::All
        } else {
            enable
        };
        element(context, child, span, lane, enable, depth + 1)?;
    }
    Ok(())
}

fn media(
    context: &mut Context<'_>,
    element: &Element,
    span: Span,
    lane: i64,
    kind: ClipKind,
    sound_muted: bool,
    gain: Option<f64>,
) -> Result<(), ImportError> {
    let reference = element.attr("ref").ok_or_else(|| {
        ImportError::new(
            "fcpxml_reference_missing",
            format!("<{}> names no asset", element.name),
        )
    })?;
    let asset = context.assets.get(reference).cloned().ok_or_else(|| {
        ImportError::new("fcpxml_reference_missing", format!("no asset {reference}"))
    })?;
    // A `video` or `audio` element is named by the clip holding it.
    let name = element
        .attr("name")
        .map_or_else(|| context.name.clone(), String::from);
    let Some(to) = span.to else {
        context.report.skip("clip", &name, "clip_without_duration");
        return Ok(());
    };
    if span.is_empty() {
        return Ok(());
    }
    let kind = match kind {
        ClipKind::Video if asset.image => ClipKind::Image,
        other => other,
    };
    context.pieces.push(Piece {
        lane,
        kind,
        key: asset.src.clone(),
        name,
        start: span.from,
        end: to,
        source_in: span.from.minus(span.shift).minus(asset.start),
        sound_muted: sound_muted || !asset.has_audio,
        gain_db: gain,
        fade_in: 0.0,
        fade_out: 0.0,
        transition: None,
    });
    Ok(())
}

fn marker(context: &mut Context<'_>, element: &Element, span: Span) -> Result<(), ImportError> {
    let at = span
        .shift
        .plus(time(element, "start")?.unwrap_or(Frac::ZERO));
    if at >= span.from && span.to.is_none_or(|to| at <= to) {
        context
            .markers
            .push((element.attr("value").unwrap_or("").to_string(), at));
    }
    Ok(())
}

/// Walks one element at its place in `span` (its parent's), on `lane` (its parent's).
pub(super) fn element(
    context: &mut Context<'_>,
    element: &Element,
    parent: Span,
    parent_lane: i64,
    enable: Enable,
    depth: usize,
) -> Result<(), ImportError> {
    if depth > MAX_DEPTH {
        return Err(ImportError::new(
            "fcpxml_nesting_too_deep",
            "the story elements nest too deep",
        ));
    }
    let name = element.attr("name").unwrap_or("");
    let lane = parent_lane + lane_of(element);
    match element.name.as_str() {
        "marker" | "chapter-marker" => return marker(context, element, parent),
        "transition" => {
            let span = parent.cut(element)?;
            if let Some(to) = span.to {
                context.transitions.push((parent_lane, span.from, to));
            }
            return Ok(());
        }
        "audition" => {
            if let Some(first) = element.children.iter().find(|child| child.name != "marker") {
                context
                    .report
                    .approximate("audition", name, "the_active_pick_only");
                return self::element(context, first, parent, parent_lane, enable, depth + 1);
            }
            return Ok(());
        }
        _ => {}
    }
    let span = parent.cut(element)?;
    let enable = enable.within(element);
    let gain = gain_of(element);
    let own = if name.is_empty() {
        context.name.clone()
    } else {
        name.to_string()
    };
    let holder = std::mem::replace(&mut context.name, own);
    let walked = story(context, element, span, lane, enable, gain, depth);
    context.name = holder;
    walked
}

fn story(
    context: &mut Context<'_>,
    element: &Element,
    span: Span,
    lane: i64,
    enable: Enable,
    gain: Option<f64>,
    depth: usize,
) -> Result<(), ImportError> {
    let name = element.attr("name").unwrap_or("");
    match element.name.as_str() {
        "asset-clip" => {
            let asset = element
                .attr("ref")
                .and_then(|r| context.assets.get(r))
                .cloned();
            let audio_only = asset.as_ref().is_some_and(|asset| !asset.has_video);
            match (enable, audio_only) {
                (Enable::Audio, _) | (_, true) => {
                    media(context, element, span, lane, ClipKind::Audio, false, gain)?
                }
                (Enable::Video, false) => {
                    media(context, element, span, lane, ClipKind::Video, true, gain)?
                }
                (Enable::All, false) => {
                    media(context, element, span, lane, ClipKind::Video, false, gain)?
                }
            }
            children(context, element, span, lane, enable, depth)?;
        }
        "video" => {
            if enable != Enable::Audio {
                media(context, element, span, lane, ClipKind::Video, true, gain)?;
            }
            children(context, element, span, lane, enable, depth)?;
        }
        "audio" => {
            if enable != Enable::Video {
                media(context, element, span, lane, ClipKind::Audio, false, gain)?;
            }
            children(context, element, span, lane, enable, depth)?;
        }
        "clip" | "gap" | "spine" | "sync-clip" => {
            children(context, element, span, lane, enable, depth)?
        }
        "ref-clip" => {
            let reference = element.attr("ref").unwrap_or("");
            let sequence = context
                .media
                .get(reference)
                .and_then(|media| media.child("sequence"))
                .ok_or_else(|| {
                    ImportError::new(
                        "fcpxml_reference_missing",
                        format!("no compound clip {reference}"),
                    )
                })?;
            context.report.count("compound_clips_flattened", 1);
            for spine in sequence.children_named("spine") {
                children(context, spine, span, lane, enable, depth)?;
            }
            children(context, element, span, lane, enable, depth)?;
        }
        "title" | "generator" => {
            context
                .report
                .skip(&element.name, name, "generated_media_unsupported");
            children(context, element, span, lane, enable, depth)?;
        }
        "mc-clip" => context
            .report
            .skip("multicam_clip", name, "multicam_clips_unsupported"),
        "filter-video" | "filter-audio" => {
            context
                .report
                .skip(&element.name, name, "effects_unsupported")
        }
        "timeMap" | "conform-rate" => context.report.skip("retime", name, "retiming_unsupported"),
        _ => {}
    }
    Ok(())
}
