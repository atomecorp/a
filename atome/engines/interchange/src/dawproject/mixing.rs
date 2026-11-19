//! A channel's mix: its volume, pan and devices on the track holding its audio
//! strip, its sends, and the parameter ids automation points name.

use super::devices::{lay_devices, plugin, real};
use crate::ImportError;
use crate::molecule_writer::{TimelineBuilder, linear_to_gain_db};
use crate::xml::Element;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ParamKind {
    Volume,
    Pan,
    Other,
}

#[derive(Clone, Debug)]
pub(super) struct Param {
    pub kind: ParamKind,
    pub strip: Option<String>,
    pub location: String,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

pub(super) fn register(
    params: &mut HashMap<String, Param>,
    element: Option<&Element>,
    kind: ParamKind,
    strip: Option<&str>,
    location: &str,
) -> Result<(), ImportError> {
    let Some(element) = element else {
        return Ok(());
    };
    let Some(id) = element.attr("id") else {
        return Ok(());
    };
    let min = element.f64_attr("min", "dawproject_parameter_invalid")?;
    let max = element.f64_attr("max", "dawproject_parameter_invalid")?;
    params.insert(
        id.into(),
        Param {
            kind,
            strip: strip.map(String::from),
            location: location.into(),
            min,
            max,
        },
    );
    Ok(())
}

pub(super) fn volume_db(value: f64, unit: &str, min: Option<f64>, max: Option<f64>) -> f64 {
    match unit {
        "decibel" => value,
        "normalized" => linear_to_gain_db(
            min.unwrap_or(0.0) + value * (max.unwrap_or(2.0) - min.unwrap_or(0.0)),
        ),
        _ => linear_to_gain_db(value),
    }
}

pub(super) fn pan_value(value: f64, unit: &str, min: Option<f64>, max: Option<f64>) -> f64 {
    let (low, high) = match unit {
        "normalized" => (0.0, 1.0),
        _ => (min.unwrap_or(-1.0), max.unwrap_or(1.0)),
    };
    if high - low <= 0.0 {
        0.0
    } else {
        (value - low) / (high - low) * 2.0 - 1.0
    }
}

pub(super) fn mix_channel(
    builder: &mut TimelineBuilder,
    params: &mut HashMap<String, Param>,
    channel: &Element,
    strip: Option<&str>,
    location: &str,
) -> Result<(), ImportError> {
    register(
        params,
        channel.child("Volume"),
        ParamKind::Volume,
        strip,
        location,
    )?;
    register(
        params,
        channel.child("Pan"),
        ParamKind::Pan,
        strip,
        location,
    )?;
    register(
        params,
        channel.child("Mute"),
        ParamKind::Other,
        strip,
        location,
    )?;
    let volume = real(channel.child("Volume"))?;
    let pan = real(channel.child("Pan"))?;
    let range = |name: &str| -> Result<(Option<f64>, Option<f64>), ImportError> {
        match channel.child(name) {
            Some(e) => Ok((
                e.f64_attr("min", "dawproject_parameter_invalid")?,
                e.f64_attr("max", "dawproject_parameter_invalid")?,
            )),
            None => Ok((None, None)),
        }
    };
    let (volume_range, pan_range) = (range("Volume")?, range("Pan")?);
    let Some(strip) = strip else {
        let unity = volume.as_ref().is_none_or(|(v, unit)| {
            volume_db(*v, unit, volume_range.0, volume_range.1).abs() < 1e-6
        });
        let centred = pan
            .as_ref()
            .is_none_or(|(v, unit)| pan_value(*v, unit, pan_range.0, pan_range.1).abs() < 1e-6);
        if !unity || !centred {
            builder
                .report_mut()
                .skip("channel_mix", location, "track_has_no_audio_strip");
        }
        for device in channel
            .child("Devices")
            .into_iter()
            .flat_map(|devices| devices.children.iter())
        {
            match plugin(device) {
                Some(what) => {
                    builder
                        .report_mut()
                        .skip(&what, location, "external_plugins_unsupported")
                }
                None => builder
                    .report_mut()
                    .skip("device", location, "track_has_no_audio_strip"),
            }
        }
        return Ok(());
    };
    if let Some((value, unit)) = volume {
        builder.set_gain_db(
            strip,
            volume_db(value, &unit, volume_range.0, volume_range.1),
        )?;
    }
    if let Some((value, unit)) = pan {
        builder.set_pan(strip, pan_value(value, &unit, pan_range.0, pan_range.1))?;
    }
    if let Some(devices) = channel.child("Devices") {
        lay_devices(builder, devices, strip, location)?;
    }
    Ok(())
}

pub(super) fn sends(
    channel: &Element,
    params: &mut HashMap<String, Param>,
    location: &str,
) -> Result<Vec<(String, f64, bool)>, ImportError> {
    let mut out = Vec::new();
    for send in channel
        .child("Sends")
        .into_iter()
        .flat_map(|sends| sends.children_named("Send"))
    {
        if send
            .child("Enable")
            .and_then(|flag| flag.bool_attr("value"))
            == Some(false)
        {
            continue;
        }
        register(
            params,
            send.child("Volume"),
            ParamKind::Other,
            None,
            location,
        )?;
        let level = real(send.child("Volume"))?.map_or(1.0, |(value, unit)| {
            if unit == "decibel" {
                10f64.powf(value / 20.0)
            } else {
                value
            }
        });
        if let Some(destination) = send.attr("destination") {
            out.push((
                destination.to_string(),
                level,
                send.attr("type") == Some("pre"),
            ));
        }
    }
    Ok(out)
}
