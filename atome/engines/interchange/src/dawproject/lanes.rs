//! A clip's warp map, piece by piece (each piece one stretch ratio), and its
//! automation points.

use super::Context;
use super::timeline::{Collected, EPSILON, Frame, Point, Unit, Window, media_piece, number};
use crate::ImportError;
use crate::molecule_writer::Curve;
use crate::xml::Element;

pub(super) fn warps(
    context: &mut Context<'_>,
    element: &Element,
    frame: Frame,
    window: Window,
    out: &mut Collected,
) -> Result<(), ImportError> {
    let warp_frame = frame.in_unit(context, Unit::of(element, "timeUnit", frame.unit));
    let mut marks: Vec<(f64, f64)> = Vec::new();
    for warp in element.children_named("Warp") {
        let time = number(warp, "time")?
            .ok_or_else(|| ImportError::new("dawproject_warp_invalid", "a Warp has no time"))?;
        let content = number(warp, "contentTime")?.ok_or_else(|| {
            ImportError::new("dawproject_warp_invalid", "a Warp has no contentTime")
        })?;
        marks.push((warp_frame.seconds(context, time), content));
    }
    marks.sort_by(|a, b| a.0.total_cmp(&b.0));
    let Some(media) = element
        .children
        .iter()
        .find(|child| child.name == "Audio" || child.name == "Video")
    else {
        context.report.skip(
            "warped_content",
            &context.location,
            "only_audio_and_video_are_warped",
        );
        return Ok(());
    };
    if Unit::of(element, "contentTimeUnit", Unit::Seconds) != Unit::Seconds || marks.len() < 2 {
        context
            .report
            .approximate("warp", &context.location, "warp_map_read_as_real_time");
        let zero = marks
            .first()
            .map_or(frame.seconds(context, 0.0), |(at, content)| at - content);
        if let Some(cut) = window.cut(zero, f64::INFINITY) {
            media_piece(context, media, cut, cut.start - zero, 1.0, out)?;
        }
        return Ok(());
    }
    let duration = number(media, "duration")?.unwrap_or(f64::INFINITY);
    // One piece per run of warp marks sharing one ratio; the ends extend the first and last ratio.
    let mut index = 0;
    while index + 1 < marks.len() {
        let ratio_of = |i: usize| (marks[i + 1].0 - marks[i].0) / (marks[i + 1].1 - marks[i].1);
        let ratio = ratio_of(index);
        let mut last = index + 1;
        while last + 1 < marks.len() && (ratio_of(last) - ratio).abs() < 1e-9 * ratio.abs().max(1.0)
        {
            last += 1;
        }
        if !(ratio.is_finite() && ratio > 0.0) {
            context
                .report
                .skip("warp_piece", &context.location, "warp_runs_backwards");
            index = last;
            continue;
        }
        let from = if index == 0 {
            marks[0].0 - marks[0].1 * ratio
        } else {
            marks[index].0
        };
        let to = if last + 1 == marks.len() {
            marks[last].0 + (duration - marks[last].1) * ratio
        } else {
            marks[last].0
        };
        if let Some(cut) = window.cut(from, to) {
            let source_in = marks[index].1 + (cut.start - marks[index].0) / ratio;
            media_piece(context, media, cut, source_in, ratio, out)?;
            if (ratio - 1.0).abs() > 1e-9 {
                context.report.count("warped_pieces", 1);
            }
        }
        index = last;
    }
    Ok(())
}

pub(super) fn points(
    context: &mut Context<'_>,
    element: &Element,
    frame: Frame,
    window: Window,
    out: &mut Collected,
) -> Result<(), ImportError> {
    let inner = frame.in_unit(context, Unit::of(element, "timeUnit", frame.unit));
    let target = element.child("Target");
    let Some(parameter) = target.and_then(|target| target.attr("parameter")) else {
        context.report.skip(
            "automation",
            &context.location,
            "expression_automation_unsupported",
        );
        return Ok(());
    };
    for point in &element.children {
        if point.name == "Target" {
            continue;
        }
        if point.name != "RealPoint" {
            context.report.skip(
                "automation_point",
                &context.location,
                "non_real_points_unsupported",
            );
            continue;
        }
        let time = number(point, "time")?
            .ok_or_else(|| ImportError::new("dawproject_point_invalid", "a point has no time"))?;
        let value = number(point, "value")?
            .ok_or_else(|| ImportError::new("dawproject_point_invalid", "a point has no value"))?;
        let at = inner.seconds(context, time);
        if at < window.start - EPSILON || at > window.end + EPSILON {
            continue;
        }
        let curve = if point.attr("interpolation") == Some("hold") {
            Curve::Hold
        } else {
            Curve::Linear
        };
        out.points.push(Point {
            parameter: parameter.to_string(),
            unit: element.attr("unit").map(String::from),
            time: at.max(0.0),
            value,
            curve,
        });
    }
    Ok(())
}
