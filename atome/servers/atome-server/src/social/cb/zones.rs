// The CB sociale's zones (temp/cb_sociale_2026-11-15/CAHIER_DES_CHARGES.md §4): a reach is a fixed
// cell, never a point nor a distance. The device turns its own position into a geohash at the level
// of the reach it chose (5 characters for 5 km, 4 for 50 km, 3 for 500 km) or `world`, and sends
// only that; the server checks its form and that its level is the reach's, and refuses anything
// that looks like a coordinate. Zones have no neighbours: a cell reaches what was left in itself or
// in a finer cell it contains (a geohash prefix), `world` reaching everything.
use serde_json::Value as JsonValue;

pub const WORLD: &str = "world";
// The geohash alphabet: no `a`, `i`, `l` or `o`.
const ALPHABET: &[u8] = b"0123456789bcdefghjkmnpqrstuvwxyz";
// What a frame must never carry: a position, under any of its usual names.
const COORDINATE_KEYS: [&str; 11] = [
    "lat",
    "lon",
    "lng",
    "latitude",
    "longitude",
    "coords",
    "coordinates",
    "position",
    "location",
    "accuracy",
    "point",
];

/// A reach, as its labels say it: 5 km, 50 km, 500 km or Monde.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Range {
    Km5,
    Km50,
    Km500,
    World,
}

impl Range {
    /// `5`, `50`, `500` (a number or its text, `km` allowed after it) or `world`.
    pub fn parse(value: Option<&JsonValue>) -> Option<Self> {
        let text = match value? {
            JsonValue::Number(number) => number.to_string(),
            JsonValue::String(text) => text.trim().to_lowercase(),
            _ => return None,
        };
        match text.trim_end_matches("km").trim() {
            "5" => Some(Self::Km5),
            "50" => Some(Self::Km50),
            "500" => Some(Self::Km500),
            WORLD => Some(Self::World),
            _ => None,
        }
    }

    /// The geohash length of this reach's cells (`world` has none).
    pub fn precision(self) -> usize {
        match self {
            Self::Km5 => 5,
            Self::Km50 => 4,
            Self::Km500 => 3,
            Self::World => 0,
        }
    }

    /// Its name in an answer.
    pub fn name(self) -> &'static str {
        match self {
            Self::Km5 => "5",
            Self::Km50 => "50",
            Self::Km500 => "500",
            Self::World => WORLD,
        }
    }
}

/// A cell of a reach. Its geohash is never shown, to the person or to anyone else.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Zone {
    range: Range,
    cell: String,
}

/// Whether `message` carries anything that looks like a position: a coordinate key at its top or
/// a zone that is not a plain text.
pub fn carries_coordinates(message: &JsonValue) -> bool {
    let keyed = message
        .as_object()
        .is_some_and(|fields| COORDINATE_KEYS.iter().any(|key| fields.contains_key(*key)));
    keyed || message.get("zone").is_some_and(|zone| !zone.is_string())
}

impl Zone {
    /// The zone a device sent for `range`: `world` for Monde, else a lowercase geohash of exactly
    /// the reach's length.
    pub fn parse(range: Range, zone: &str) -> Result<Self, &'static str> {
        if range == Range::World || zone == WORLD {
            return if range == Range::World && zone == WORLD {
                Ok(Self {
                    range,
                    cell: String::new(),
                })
            } else {
                Err("cb_zone_level_mismatch")
            };
        }
        if zone.is_empty() || !zone.bytes().all(|b| ALPHABET.contains(&b)) {
            return Err("cb_zone_invalid");
        }
        if zone.len() != range.precision() {
            return Err("cb_zone_level_mismatch");
        }
        Ok(Self {
            range,
            cell: zone.to_string(),
        })
    }

    pub fn range(&self) -> Range {
        self.range
    }

    /// Its geohash (empty for `world`): kept by the server for a bottle's life, never answered.
    pub fn cell(&self) -> &str {
        &self.cell
    }

    /// Whether this zone (where one looks) reaches what was left in `origin`: the same cell, a
    /// finer cell inside it, or anything from `world`.
    pub fn contains(&self, origin: &Zone) -> bool {
        match self.range {
            Range::World => true,
            _ => {
                origin.range != Range::World
                    && origin.range.precision() >= self.range.precision()
                    && origin.cell.starts_with(&self.cell)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn zone(range: &str, cell: &str) -> Zone {
        Zone::parse(Range::parse(Some(&json!(range))).expect("range"), cell).expect("zone")
    }

    #[test]
    fn a_reach_is_one_of_four() {
        assert_eq!(Range::parse(Some(&json!(5))), Some(Range::Km5));
        assert_eq!(Range::parse(Some(&json!("50"))), Some(Range::Km50));
        assert_eq!(Range::parse(Some(&json!("500km"))), Some(Range::Km500));
        assert_eq!(Range::parse(Some(&json!("World"))), Some(Range::World));
        for refused in [json!(10), json!("5000"), json!(""), json!(null), json!([5])] {
            assert_eq!(Range::parse(Some(&refused)), None, "{refused}");
        }
        assert_eq!(Range::parse(None), None);
    }

    // Test 8: a geohash of another level than the reach's, a malformed one, or a coordinate is refused.
    #[test]
    fn the_level_must_be_the_reach_s() {
        assert!(Zone::parse(Range::Km5, "u09tv").is_ok());
        assert!(Zone::parse(Range::Km50, "u09t").is_ok());
        assert!(Zone::parse(Range::Km500, "u09").is_ok());
        assert!(Zone::parse(Range::World, WORLD).is_ok());
        assert_eq!(
            Zone::parse(Range::Km5, "u09t"),
            Err("cb_zone_level_mismatch")
        );
        assert_eq!(
            Zone::parse(Range::Km500, "u09tv"),
            Err("cb_zone_level_mismatch")
        );
        assert_eq!(
            Zone::parse(Range::World, "u09"),
            Err("cb_zone_level_mismatch")
        );
        assert_eq!(
            Zone::parse(Range::Km50, WORLD),
            Err("cb_zone_level_mismatch")
        );
        for malformed in ["U09T", "u0at", "48.8", "2,35", "", "u09 "] {
            assert_eq!(
                Zone::parse(Range::Km50, malformed),
                Err("cb_zone_invalid"),
                "{malformed}"
            );
        }
    }

    #[test]
    fn a_coordinate_never_passes() {
        assert!(!carries_coordinates(
            &json!({ "action": "zone-set", "range": "5", "zone": "u09tv" })
        ));
        for message in [
            json!({ "range": "5", "zone": "u09tv", "lat": 48.85 }),
            json!({ "range": "5", "zone": "u09tv", "longitude": 2.35 }),
            json!({ "range": "5", "zone": "u09tv", "position": { "lat": 1, "lon": 2 } }),
            json!({ "range": "5", "zone": [48.85, 2.35] }),
            json!({ "range": "5", "zone": 48.85 }),
            json!({ "range": "5", "zone": { "lat": 48.85, "lon": 2.35 } }),
        ] {
            assert!(carries_coordinates(&message), "{message}");
        }
    }

    // Test 10: left at 5 km, reached at 5, 50 and 500 km in the zones that contain it, and from
    // the world; never from the neighbouring 5 km cell.
    #[test]
    fn a_cell_reaches_what_it_contains() {
        let left = zone("5", "u09tv");
        assert!(zone("5", "u09tv").contains(&left));
        assert!(zone("50", "u09t").contains(&left));
        assert!(zone("500", "u09").contains(&left));
        assert!(zone(WORLD, WORLD).contains(&left));
        assert!(!zone("5", "u09tw").contains(&left), "a neighbour at 5 km");
        assert!(!zone("50", "u09w").contains(&left));
        assert!(!zone("500", "u0d").contains(&left));
        // A finer cell never reaches what was left in a coarser one, nor in the world.
        assert!(!zone("5", "u09tv").contains(&zone("50", "u09t")));
        assert!(!zone("500", "u09").contains(&zone(WORLD, WORLD)));
        assert!(zone(WORLD, WORLD).contains(&zone(WORLD, WORLD)));
        assert_eq!(left.range(), Range::Km5);
    }
}
