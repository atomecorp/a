//! Blackmagic camera control (R-375 L6, mockup M4 validated on 25 Nov. 2026): every setting of a
//! Multicam camera's panel — Iris, Point, ISO, Obturation, Balance and Teinte, ND, Lift, Gamma,
//! Gain, Saturation, Contraste and Pivot — written two ways, the transport chosen per camera and
//! never switched by itself:
//! - a Camera Control Protocol packet (`ccp_packet`), written to the camera's « Outgoing Camera
//!   Control » characteristic over Bluetooth LE (`BLE_SERVICE`, `BLE_OUTGOING`);
//! - the REST requests of the camera's network API (`rest_requests`, `PUT /control/api/v1/…`).
//!
//! A setting is read from `{ "name": …, <its values> }` (`Setting::from_json`); a wrong name or a
//! value out of its range is refused with an explicit error, never clamped.
use serde_json::{Value as JsonValue, json};

/// The camera's Bluetooth LE service and the characteristic packets are written to.
pub const BLE_SERVICE: &str = "291d567a-6d75-11e6-8b77-86f30ca893d3";
pub const BLE_OUTGOING: &str = "5dd3465f-1aee-4299-8493-d2eca2f8e1bb";
/// Where the network API lies on the camera.
pub const REST_ROOT: &str = "/control/api/v1";
/// Every camera at once (the protocol's broadcast destination).
pub const BROADCAST: u8 = 255;

/// One setting of the panel, in the camera's own units.
#[derive(Clone, Debug, PartialEq)]
pub enum Setting {
    /// Iris: the f-number (f/4 → 4.0).
    Iris {
        f_number: f32,
    },
    /// Point (focus): 0 near … 1 far.
    Focus {
        normalised: f32,
    },
    Iso {
        iso: i32,
    },
    /// Obturation: the shutter angle in degrees (180°).
    Shutter {
        degrees: f32,
    },
    /// Balance and Teinte go together (one command on the protocol).
    WhiteBalance {
        kelvin: i16,
        tint: i16,
    },
    /// ND: the filter's stops.
    Nd {
        stops: f32,
    },
    /// Lift, Gamma, Gain: the master (luma) value of the primary correction.
    Lift {
        luma: f32,
    },
    Gamma {
        luma: f32,
    },
    Gain {
        luma: f32,
    },
    Saturation {
        saturation: f32,
    },
    /// Contraste and Pivot go together (one command on the protocol).
    Contrast {
        pivot: f32,
        adjust: f32,
    },
}

fn number(value: &JsonValue, key: &str, min: f64, max: f64) -> Result<f64, String> {
    let number = value
        .get(key)
        .and_then(JsonValue::as_f64)
        .ok_or_else(|| format!("blackmagic_setting_value_missing:{key}"))?;
    if !(min..=max).contains(&number) {
        return Err(format!("blackmagic_setting_value_out_of_range:{key}"));
    }
    Ok(number)
}

impl Setting {
    /// The setting `{ name, … }` sent by the panel, its values checked against the protocol's ranges.
    pub fn from_json(value: &JsonValue) -> Result<Self, String> {
        let name = value.get("name").and_then(JsonValue::as_str).unwrap_or("");
        let n = |key: &str, min: f64, max: f64| number(value, key, min, max);
        Ok(match name {
            "iris" => Self::Iris {
                f_number: n("f_number", 0.7, 64.0)? as f32,
            },
            "focus" => Self::Focus {
                normalised: n("normalised", 0.0, 1.0)? as f32,
            },
            "iso" => Self::Iso {
                iso: n("iso", 50.0, 51_200.0)? as i32,
            },
            "shutter" => Self::Shutter {
                degrees: n("degrees", 1.0, 360.0)? as f32,
            },
            "white_balance" => Self::WhiteBalance {
                kelvin: n("kelvin", 2_500.0, 10_000.0)? as i16,
                tint: n("tint", -50.0, 50.0)? as i16,
            },
            "nd" => Self::Nd {
                stops: n("stops", 0.0, 15.0)? as f32,
            },
            "lift" => Self::Lift {
                luma: n("luma", -2.0, 2.0)? as f32,
            },
            "gamma" => Self::Gamma {
                luma: n("luma", -4.0, 4.0)? as f32,
            },
            "gain" => Self::Gain {
                luma: n("luma", 0.0, 15.0)? as f32,
            },
            "saturation" => Self::Saturation {
                saturation: n("saturation", 0.0, 2.0)? as f32,
            },
            "contrast" => Self::Contrast {
                pivot: n("pivot", 0.0, 1.0)? as f32,
                adjust: n("adjust", 0.0, 2.0)? as f32,
            },
            other => return Err(format!("blackmagic_setting_unknown:{other}")),
        })
    }
}

// The protocol's data types.
const INT16: u8 = 2;
const INT32: u8 = 3;
const FIXED16: u8 = 128;

/// A fixed16 (5.11 signed fixed point), little-endian.
fn fixed16(value: f32) -> [u8; 2] {
    ((value * 2048.0).round() as i16).to_le_bytes()
}

/// (category, parameter, data type, data) of a setting on the protocol.
fn command(setting: &Setting) -> (u8, u8, u8, Vec<u8>) {
    let fixed = |values: &[f32]| {
        values
            .iter()
            .flat_map(|value| fixed16(*value))
            .collect::<Vec<u8>>()
    };
    // The master value of a primary correction: red, green and blue at their neutral, luma set.
    let luma = |neutral: f32, value: f32| fixed(&[neutral, neutral, neutral, value]);
    match setting {
        // The aperture value: f-number = √(2^AV).
        Setting::Iris { f_number } => (0, 2, FIXED16, fixed(&[2.0 * f_number.log2()])),
        Setting::Focus { normalised } => (0, 0, FIXED16, fixed(&[*normalised])),
        Setting::Iso { iso } => (1, 14, INT32, iso.to_le_bytes().to_vec()),
        Setting::Shutter { degrees } => (
            1,
            11,
            INT32,
            ((degrees * 100.0).round() as i32).to_le_bytes().to_vec(),
        ),
        Setting::WhiteBalance { kelvin, tint } => (
            1,
            2,
            INT16,
            [kelvin.to_le_bytes(), tint.to_le_bytes()].concat(),
        ),
        // [stops, display mode 0 = stops].
        Setting::Nd { stops } => (1, 16, FIXED16, fixed(&[*stops, 0.0])),
        Setting::Lift { luma: value } => (8, 0, FIXED16, luma(0.0, *value)),
        Setting::Gamma { luma: value } => (8, 1, FIXED16, luma(0.0, *value)),
        Setting::Gain { luma: value } => (8, 2, FIXED16, luma(1.0, *value)),
        // [hue, saturation], the hue left at its neutral.
        Setting::Saturation { saturation } => (8, 6, FIXED16, fixed(&[0.0, *saturation])),
        Setting::Contrast { pivot, adjust } => (8, 4, FIXED16, fixed(&[*pivot, *adjust])),
    }
}

/// The Camera Control Protocol packet assigning `setting` on the camera `destination` (1–254, or
/// `BROADCAST`): the header (destination, command length, command 0 « change configuration »,
/// reserved), the command (category, parameter, data type, operation 0 « assign », data), padded
/// to a whole number of 32-bit words.
pub fn ccp_packet(destination: u8, setting: &Setting) -> Vec<u8> {
    let (category, parameter, data_type, data) = command(setting);
    let length = 4 + data.len();
    let mut packet = vec![
        destination,
        length as u8,
        0,
        0,
        category,
        parameter,
        data_type,
        0,
    ];
    packet.extend(data);
    packet.resize(packet.len().div_ceil(4) * 4, 0);
    packet
}

/// The REST requests (`PUT`, path, JSON body) setting `setting` on a camera of the network.
pub fn rest_requests(setting: &Setting) -> Vec<(String, JsonValue)> {
    let at = |path: &str, body: JsonValue| (format!("{REST_ROOT}{path}"), body);
    let primary = |path: &str, neutral: f32, luma: f32| {
        at(
            path,
            json!({ "red": neutral, "green": neutral, "blue": neutral, "luma": luma }),
        )
    };
    match setting {
        Setting::Iris { f_number } => vec![at("/lens/iris", json!({ "apertureStop": f_number }))],
        Setting::Focus { normalised } => {
            vec![at("/lens/focus", json!({ "normalised": normalised }))]
        }
        Setting::Iso { iso } => vec![at("/video/iso", json!({ "iso": iso }))],
        // The angle in hundredths of a degree, as on the protocol.
        Setting::Shutter { degrees } => {
            vec![at(
                "/video/shutter",
                json!({ "shutterAngle": (degrees * 100.0).round() as i32 }),
            )]
        }
        Setting::WhiteBalance { kelvin, tint } => vec![
            at("/video/whiteBalance", json!({ "whiteBalance": kelvin })),
            at(
                "/video/whiteBalanceTint",
                json!({ "whiteBalanceTint": tint }),
            ),
        ],
        Setting::Nd { stops } => vec![at("/video/ndFilter", json!({ "stop": stops }))],
        Setting::Lift { luma } => vec![primary("/colorCorrection/lift", 0.0, *luma)],
        Setting::Gamma { luma } => vec![primary("/colorCorrection/gamma", 0.0, *luma)],
        Setting::Gain { luma } => vec![primary("/colorCorrection/gain", 1.0, *luma)],
        Setting::Saturation { saturation } => {
            vec![at(
                "/colorCorrection/color",
                json!({ "hue": 0.0, "saturation": saturation }),
            )]
        }
        Setting::Contrast { pivot, adjust } => {
            vec![at(
                "/colorCorrection/contrast",
                json!({ "pivot": pivot, "adjust": adjust }),
            )]
        }
    }
}

#[cfg(test)]
mod tests;
