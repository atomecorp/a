//! DAWproject (`.dawproject`, Bitwig's open format, MIT) read into the Molecule
//! timeline. The archive's `project.xml` gives the structure (tracks, folders,
//! effect returns, channels with their volume, pan, mute, solo, sends and
//! devices), the transport (tempo, time signature), the arrangement (lanes of
//! clips, notes, audio, warps, automation points, markers, tempo and meter
//! automation) and the scenes (clip launcher). Each channel becomes one Molecule
//! track per kind of content it holds (audio, MIDI, video), a folder or an effect
//! return a group track, its members routed to it; the four built-in devices
//! become catalogue effects ([`devices`]), external plug-ins stay out (counted in
//! the report only). Scenes are laid after the arrangement, a bar-rounded span each.

mod devices;
mod lanes;
mod laying;
mod mixing;
mod scenes;
mod structure;
mod timeline;

use crate::ImportError;
use crate::molecule_writer::{DEFAULT_SAMPLE_RATE, DocumentIds, MoleculeImport, TimelineBuilder};
use crate::report::ImportReport;
use crate::tempo::{MeterPoint, TempoMap, TempoPoint};
use crate::xml::{self, Element};
use std::collections::{BTreeSet, HashMap};
use timeline::{Collected, Frame, Unit, Window};

/// What the timeline walk shares: the tempo map, the report, the element ids
/// (for clip references) and the media paths named.
pub(super) struct Context<'a> {
    pub tempo: TempoMap,
    pub report: ImportReport,
    pub location: String,
    ids: HashMap<&'a str, &'a Element>,
    media: BTreeSet<String>,
}

impl<'a> Context<'a> {
    /// The element of id `id` (a clip's `reference`).
    pub fn referenced(&self, id: &str) -> Result<&'a Element, ImportError> {
        self.ids.get(id).copied().ok_or_else(|| {
            ImportError::new(
                "dawproject_reference_missing",
                format!("no element of id {id}"),
            )
        })
    }

    /// Records a media path a clip plays.
    pub fn media(&mut self, path: &str) {
        self.media.insert(path.to_string());
    }
}

fn index_ids<'a>(element: &'a Element, ids: &mut HashMap<&'a str, &'a Element>) {
    if let Some(id) = element.attr("id") {
        ids.insert(id, element);
    }
    for child in &element.children {
        index_ids(child, ids);
    }
}

fn integer(element: &Element, name: &str) -> Option<u32> {
    element
        .attr(name)
        .and_then(|text| text.trim().parse::<u32>().ok())
        .filter(|value| *value > 0)
}

// The arrangement's tempo and meter changes; the transport's when it has none.
fn tempo_map(project: &Element, report: &mut ImportReport) -> Result<TempoMap, ImportError> {
    let transport = project.child("Transport");
    let tempo = transport.and_then(|transport| transport.child("Tempo"));
    let bpm = match tempo {
        Some(tempo) => tempo
            .f64_attr("value", "dawproject_tempo_invalid")?
            .unwrap_or(120.0),
        None => 120.0,
    };
    let signature = transport.and_then(|transport| transport.child("TimeSignature"));
    let numerator = signature.and_then(|s| integer(s, "numerator")).unwrap_or(4);
    let denominator = signature
        .and_then(|s| integer(s, "denominator"))
        .unwrap_or(4);
    let arrangement = project.child("Arrangement");
    let mut tempos = vec![TempoPoint {
        beat: 0.0,
        bpm,
        ramp: false,
    }];
    if let Some(points) = arrangement.and_then(|a| a.child("TempoAutomation")) {
        let (low, high) = match tempo {
            Some(tempo) => (
                tempo.f64_attr("min", "dawproject_tempo_invalid")?,
                tempo.f64_attr("max", "dawproject_tempo_invalid")?,
            ),
            None => (None, None),
        };
        let normalized = points.attr("unit") == Some("normalized");
        let seconds = points.attr("timeUnit") == Some("seconds");
        let mut read = Vec::new();
        for point in points.children_named("RealPoint") {
            let time = point
                .f64_attr("time", "dawproject_tempo_invalid")?
                .unwrap_or(0.0);
            let mut value = point
                .f64_attr("value", "dawproject_tempo_invalid")?
                .unwrap_or(bpm);
            if normalized {
                let (low, high) = (low.unwrap_or(20.0), high.unwrap_or(666.0));
                value = low + value * (high - low);
            }
            read.push((time, value, point.attr("interpolation") != Some("hold")));
        }
        read.sort_by(|a, b| a.0.total_cmp(&b.0));
        if seconds {
            // Seconds give each change's beat through the changes before it, held.
            report.approximate(
                "tempo_automation",
                "Arrangement",
                "seconds_tempo_changes_placed_as_held",
            );
            let mut placed: Vec<TempoPoint> = Vec::new();
            for (time, value, ramp) in read {
                let beat = if placed.is_empty() {
                    0.0
                } else {
                    TempoMap::new(placed.clone(), Vec::new())?.beat_at(time)
                };
                placed.push(TempoPoint {
                    beat,
                    bpm: value,
                    ramp,
                });
            }
            tempos = placed;
        } else if !read.is_empty() {
            tempos = read
                .into_iter()
                .map(|(beat, bpm, ramp)| TempoPoint {
                    beat: beat.max(0.0),
                    bpm,
                    ramp,
                })
                .collect();
        }
        if tempos.iter().any(|point| point.ramp) {
            report.approximate("tempo_ramp", "Arrangement", "tempo_glides_evenly_in_time");
        }
    }
    let mut meters = vec![MeterPoint {
        beat: 0.0,
        numerator,
        denominator,
    }];
    if let Some(points) = arrangement.and_then(|a| a.child("TimeSignatureAutomation")) {
        let seconds = points.attr("timeUnit") == Some("seconds");
        let held = TempoMap::new(tempos.clone(), Vec::new())?;
        for point in points.children_named("TimeSignaturePoint") {
            let time = point
                .f64_attr("time", "dawproject_meter_invalid")?
                .unwrap_or(0.0);
            let (Some(numerator), Some(denominator)) =
                (integer(point, "numerator"), integer(point, "denominator"))
            else {
                return Err(ImportError::new(
                    "dawproject_meter_invalid",
                    "a time signature point is not positive",
                ));
            };
            let beat = if seconds { held.beat_at(time) } else { time };
            meters.push(MeterPoint {
                beat: beat.max(0.0),
                numerator,
                denominator,
            });
        }
        meters.sort_by(|a, b| a.beat.total_cmp(&b.beat));
        meters.reverse();
        meters.dedup_by(|later, earlier| later.beat == earlier.beat);
        meters.reverse();
    }
    TempoMap::new(tempos, meters)
}

fn metadata(text: &str, report: &mut ImportReport) -> Result<Option<String>, ImportError> {
    if text.trim().is_empty() {
        return Ok(None);
    }
    let root = xml::parse(text, "dawproject_metadata_invalid")?;
    let mut facts = serde_json::Map::new();
    for child in &root.children {
        let value = child.text.trim();
        if !value.is_empty() {
            facts.insert(
                child.name.to_lowercase(),
                serde_json::Value::String(value.to_string()),
            );
        }
    }
    let title = root
        .child("Title")
        .map(|title| title.text.trim().to_string())
        .filter(|title| !title.is_empty());
    if !facts.is_empty() {
        report.source_fact("metadata", serde_json::Value::Object(facts));
    }
    Ok(title)
}

/// Reads a DAWproject: its `project.xml`, its `metadata.xml` (empty when the
/// archive has none) and the archive's entry names (to tell which media it holds).
pub fn read(
    project_xml: &str,
    metadata_xml: &str,
    entries: &[String],
) -> Result<MoleculeImport, ImportError> {
    let project = xml::parse(project_xml, "dawproject_xml_invalid")?;
    if project.name != "Project" {
        return Err(ImportError::new(
            "dawproject_not_a_project",
            format!("the root element is <{}>, not <Project>", project.name),
        ));
    }
    let mut report = ImportReport::new("dawproject", "DAWproject");
    if let Some(application) = project.child("Application") {
        let name = application.attr("name").unwrap_or("");
        let version = application.attr("version").unwrap_or("");
        report.application = Some(format!("{name} {version}").trim().to_string());
    }
    if let Some(version) = project.attr("version") {
        report.source_fact("version", serde_json::Value::String(version.into()));
    }
    if let Some(title) = metadata(metadata_xml, &mut report)? {
        report.source_name = title;
    }
    let tempo = tempo_map(&project, &mut report)?;
    let mut ids = HashMap::new();
    index_ids(&project, &mut ids);
    let mut context = Context {
        tempo,
        report,
        location: "Arrangement".into(),
        ids,
        media: BTreeSet::new(),
    };

    // The arrangement, flattened per track (`Lanes track=`).
    let mut per_track: HashMap<String, Collected> = HashMap::new();
    let mut unbound = Collected::default();
    let mut arrangement_unit = Unit::Beats;
    if let Some(lanes) = project
        .child("Arrangement")
        .and_then(|arrangement| arrangement.child("Lanes"))
    {
        arrangement_unit = Unit::of(lanes, "timeUnit", Unit::Beats);
        let frame = Frame {
            unit: arrangement_unit,
            origin: 0.0,
        };
        bind(
            &mut context,
            lanes,
            frame,
            None,
            &mut per_track,
            &mut unbound,
        )?;
    }
    let scenes = scenes::collect_scenes(&mut context, &project, &per_track)?;

    let tempo_events = context.tempo.molecule_events();
    let tempo_changes = context.tempo.tempo_changes();
    let meter_changes = context.tempo.meter_changes();
    let missing: Vec<serde_json::Value> = context
        .media
        .iter()
        .filter(|path| !entries.iter().any(|entry| entry == *path))
        .map(|path| serde_json::Value::String(path.clone()))
        .collect();
    if !missing.is_empty() {
        context
            .report
            .source_fact("media_outside_archive", serde_json::Value::Array(missing));
    }
    context.report.count("tempo_changes", tempo_changes as u64);
    context.report.count("meter_changes", meter_changes as u64);
    let report = std::mem::take(&mut context.report);
    let mut builder =
        TimelineBuilder::new(DocumentIds::placeholder(), DEFAULT_SAMPLE_RATE, report)?;
    builder.set_tempo_map(tempo_events)?;
    let mut laid = structure::lay_structure(&mut builder, &project, &mut per_track, &scenes)?;
    if !unbound.pieces.is_empty() || !unbound.groups.is_empty() {
        builder
            .report_mut()
            .skip("clips_without_track", "Arrangement", "lanes_name_no_track");
    }
    if let Some(markers) = project
        .child("Arrangement")
        .and_then(|a| a.child("Markers"))
    {
        let frame = Frame {
            unit: Unit::of(markers, "timeUnit", arrangement_unit),
            origin: 0.0,
        };
        for marker in markers.children_named("Marker") {
            let time = marker
                .f64_attr("time", "dawproject_marker_invalid")?
                .unwrap_or(0.0);
            builder.add_marker(
                marker.attr("name").unwrap_or(""),
                frame.seconds(&context, time).max(0.0),
            )?;
        }
    }
    scenes::lay_scenes(&mut builder, &mut laid, scenes)?;
    laying::lay_points(&mut builder, &mut laid, unbound.points)?;
    builder.finish()
}

// Walks lanes, binding each content to the track its nearest `Lanes track=` names.
fn bind(
    context: &mut Context<'_>,
    lanes: &Element,
    frame: Frame,
    track: Option<&str>,
    per_track: &mut HashMap<String, Collected>,
    unbound: &mut Collected,
) -> Result<(), ImportError> {
    for child in &lanes.children {
        if child.name == "Lanes" || child.name == "Timeline" {
            let inner = frame.in_unit(context, Unit::of(child, "timeUnit", frame.unit));
            bind(
                context,
                child,
                inner,
                child.attr("track").or(track),
                per_track,
                unbound,
            )?;
            continue;
        }
        let owner = child.attr("track").or(track);
        let out = match owner {
            Some(id) => per_track.entry(id.to_string()).or_default(),
            None => &mut *unbound,
        };
        let name = owner
            .and_then(|id| context.ids.get(id))
            .and_then(|track| track.attr("name"));
        context.location = name.or(owner).unwrap_or("Arrangement").to_string();
        timeline::content(context, child, frame, Window::ALL, out)?;
    }
    Ok(())
}
