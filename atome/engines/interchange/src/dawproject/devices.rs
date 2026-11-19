//! A channel's devices: the four built-in DAWproject devices become the atome-dsp
//! catalogue's effects (Equalizer → `eq`, Compressor → `compressor`, NoiseGate →
//! `gate`, Limiter → `limiter`); external plug-ins (VST2, VST3, CLAP, AU) and the
//! other devices are never imported, only counted in the report.

use crate::ImportError;
use crate::molecule_writer::{DspSpec, TimelineBuilder, linear_to_gain_db};
use crate::xml::Element;

const EQ_BANDS: usize = 8;

/// A real parameter's value in its own unit (`None` when absent or unreadable as such).
pub(super) fn real(element: Option<&Element>) -> Result<Option<(f64, String)>, ImportError> {
    let Some(element) = element else {
        return Ok(None);
    };
    let Some(value) = element.f64_attr("value", "dawproject_parameter_invalid")? else {
        return Ok(None);
    };
    Ok(Some((
        value,
        element.attr("unit").unwrap_or("linear").to_string(),
    )))
}

fn decibels(element: Option<&Element>) -> Result<Option<f64>, ImportError> {
    Ok(real(element)?.map(|(value, unit)| {
        if unit == "decibel" {
            value
        } else {
            linear_to_gain_db(value)
        }
    }))
}

fn milliseconds(element: Option<&Element>) -> Result<Option<f64>, ImportError> {
    Ok(real(element)?.map(|(value, unit)| {
        if unit == "seconds" {
            value * 1000.0
        } else {
            value
        }
    }))
}

fn plain(element: Option<&Element>) -> Result<Option<f64>, ImportError> {
    Ok(real(element)?.map(|(value, _)| value))
}

fn enabled(device: &Element) -> bool {
    device
        .child("Enabled")
        .and_then(|flag| flag.bool_attr("value"))
        .unwrap_or(true)
}

fn push(params: &mut Vec<(String, f64)>, key: &str, value: Option<f64>) {
    if let Some(value) = value {
        params.push((key.into(), value));
    }
}

// What a device sets that its catalogue effect has no place for.
fn leftover(builder: &mut TimelineBuilder, device: &Element, children: &[&str], location: &str) {
    for name in children {
        if device.child(name).is_some() {
            builder.report_mut().skip(
                &format!("{}_{}", device.name.to_lowercase(), name.to_lowercase()),
                location,
                "no_equivalent_parameter",
            );
        }
    }
}

fn band_type(kind: &str) -> Option<f64> {
    // The order of the catalogue's `bandN_type` choices.
    [
        "bell",
        "lowShelf",
        "highShelf",
        "highPass",
        "lowPass",
        "notch",
    ]
    .iter()
    .position(|name| *name == kind)
    .map(|index| index as f64)
}

fn equalizer(
    builder: &mut TimelineBuilder,
    device: &Element,
    location: &str,
) -> Result<DspSpec, ImportError> {
    let mut bands: Vec<&Element> = device.children_named("Band").collect();
    bands.sort_by_key(|band| {
        band.attr("order")
            .and_then(|order| order.parse::<i64>().ok())
            .unwrap_or(i64::MAX)
    });
    let mut params = Vec::new();
    let mut slot = 0usize;
    for band in bands {
        let kind = band.attr("type").unwrap_or("");
        let Some(type_index) = band_type(kind) else {
            builder
                .report_mut()
                .skip("equalizer_band", location, "band_type_without_equivalent");
            continue;
        };
        if slot == EQ_BANDS {
            builder
                .report_mut()
                .skip("equalizer_band", location, "more_than_eight_bands");
            continue;
        }
        slot += 1;
        let on = band
            .child("Enabled")
            .and_then(|flag| flag.bool_attr("value"))
            .unwrap_or(true);
        params.push((format!("band{slot}_on"), if on { 1.0 } else { 0.0 }));
        params.push((format!("band{slot}_type"), type_index));
        push(
            &mut params,
            &format!("band{slot}_freq_hz"),
            plain(band.child("Freq"))?,
        );
        push(
            &mut params,
            &format!("band{slot}_gain_db"),
            decibels(band.child("Gain"))?,
        );
        push(
            &mut params,
            &format!("band{slot}_q"),
            plain(band.child("Q"))?,
        );
    }
    for unused in slot + 1..=EQ_BANDS {
        params.push((format!("band{unused}_on"), 0.0));
    }
    push(
        &mut params,
        "output_db",
        decibels(device.child("OutputGain"))?,
    );
    leftover(builder, device, &["InputGain"], location);
    Ok(DspSpec {
        effect: "eq".into(),
        params,
        bypass: !enabled(device),
    })
}

fn compressor(
    builder: &mut TimelineBuilder,
    device: &Element,
    location: &str,
) -> Result<DspSpec, ImportError> {
    let mut params = Vec::new();
    push(
        &mut params,
        "threshold_db",
        decibels(device.child("Threshold"))?,
    );
    push(&mut params, "ratio", plain(device.child("Ratio"))?);
    push(
        &mut params,
        "attack_ms",
        milliseconds(device.child("Attack"))?,
    );
    push(
        &mut params,
        "release_ms",
        milliseconds(device.child("Release"))?,
    );
    push(
        &mut params,
        "makeup_db",
        decibels(device.child("OutputGain"))?,
    );
    leftover(builder, device, &["InputGain", "AutoMakeup"], location);
    Ok(DspSpec {
        effect: "compressor".into(),
        params,
        bypass: !enabled(device),
    })
}

fn gate(
    builder: &mut TimelineBuilder,
    device: &Element,
    location: &str,
) -> Result<DspSpec, ImportError> {
    let mut params = Vec::new();
    push(
        &mut params,
        "threshold_db",
        decibels(device.child("Threshold"))?,
    );
    push(&mut params, "range_db", decibels(device.child("Range"))?);
    push(
        &mut params,
        "attack_ms",
        milliseconds(device.child("Attack"))?,
    );
    push(
        &mut params,
        "release_ms",
        milliseconds(device.child("Release"))?,
    );
    leftover(builder, device, &["Ratio"], location);
    Ok(DspSpec {
        effect: "gate".into(),
        params,
        bypass: !enabled(device),
    })
}

fn limiter(
    builder: &mut TimelineBuilder,
    device: &Element,
    location: &str,
) -> Result<DspSpec, ImportError> {
    let mut params = Vec::new();
    push(
        &mut params,
        "ceiling_db",
        decibels(device.child("Threshold"))?,
    );
    leftover(
        builder,
        device,
        &["Attack", "Release", "InputGain", "OutputGain"],
        location,
    );
    Ok(DspSpec {
        effect: "limiter".into(),
        params,
        bypass: !enabled(device),
    })
}

/// The report name of an external plug-in (`vst3_plugin`…), `None` for any other device.
pub(super) fn plugin(device: &Element) -> Option<String> {
    matches!(
        device.name.as_str(),
        "Vst2Plugin" | "Vst3Plugin" | "ClapPlugin" | "AuPlugin"
    )
    .then(|| device.name.to_lowercase().replace("plugin", "_plugin"))
}

/// Lays a channel's devices on `track_id` (when it has an audio strip).
pub(super) fn lay_devices(
    builder: &mut TimelineBuilder,
    devices: &Element,
    track_id: &str,
    location: &str,
) -> Result<(), ImportError> {
    for device in &devices.children {
        let spec = match device.name.as_str() {
            "Equalizer" => equalizer(builder, device, location)?,
            "Compressor" => compressor(builder, device, location)?,
            "NoiseGate" => gate(builder, device, location)?,
            "Limiter" => limiter(builder, device, location)?,
            _ if plugin(device).is_some() => {
                let what = plugin(device).expect("a plug-in");
                builder
                    .report_mut()
                    .skip(&what, location, "external_plugins_unsupported");
                continue;
            }
            _ => {
                builder
                    .report_mut()
                    .skip("device", location, "no_equivalent");
                continue;
            }
        };
        if !builder.has_audio_strip(track_id) {
            builder
                .report_mut()
                .skip("device", location, "track_has_no_audio_strip");
            continue;
        }
        builder.add_dsp(track_id, &spec)?;
        builder.report_mut().count("effects", 1);
    }
    Ok(())
}
