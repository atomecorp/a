//! Screens found by Bonjour. A record (service type, instance name, address, port, TXT entries) becomes a
//! `ScreenTarget` here, wherever it was read: by `browse` (mDNS, desktop) or by the iOS system browser, which hands
//! its records over (an iOS app may not open multicast sockets of its own).

use std::collections::HashMap;

use crate::{ScreenKind, ScreenTarget};

pub const CAST_SERVICE: &str = "_googlecast._tcp";
pub const AIRPLAY_SERVICE: &str = "_airplay._tcp";

/// AirPlay `features`: "0x…" or "0x<low>,0x<high>".
fn airplay_features(text: &str) -> u64 {
    let part = |value: &str| {
        u64::from_str_radix(
            value
                .trim()
                .trim_start_matches("0x")
                .trim_start_matches("0X"),
            16,
        )
        .unwrap_or(0)
    };
    match text.split_once(',') {
        Some((low, high)) => (part(high) << 32) | part(low),
        None => part(text),
    }
}

/// The screen a Bonjour record names; a service that is not a screen (an AirPlay speaker, a Cast audio group) is none.
pub fn target_from_record(
    service: &str,
    instance: &str,
    host: &str,
    port: u16,
    txt: &HashMap<String, String>,
) -> Option<ScreenTarget> {
    let service = service.trim_end_matches('.').trim_end_matches(".local");
    if service.starts_with(CAST_SERVICE) {
        // `ca` (capabilities) bit 0 is video out; an audio-only Cast device has none.
        let capabilities: u32 = txt
            .get("ca")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        if capabilities & 1 == 0 {
            return None;
        }
        let name = txt
            .get("fn")
            .cloned()
            .unwrap_or_else(|| instance.to_string());
        let id = txt
            .get("id")
            .cloned()
            .unwrap_or_else(|| instance.to_string());
        return Some(ScreenTarget {
            id: format!("cast:{id}"),
            name,
            kind: ScreenKind::Chromecast,
            host: host.to_string(),
            port,
            pairing_required: false,
            model: txt.get("md").cloned().unwrap_or_default(),
        });
    }
    if service.starts_with(AIRPLAY_SERVICE) {
        let features = airplay_features(
            txt.get("features")
                .or_else(|| txt.get("ft"))
                .map(String::as_str)
                .unwrap_or("0"),
        );
        // Bit 0: the receiver plays video. A HomePod or an AirPlay speaker has none.
        if features & 1 == 0 {
            return None;
        }
        let flags = u64::from_str_radix(
            txt.get("flags")
                .or_else(|| txt.get("sf"))
                .map(String::as_str)
                .unwrap_or("0")
                .trim_start_matches("0x"),
            16,
        )
        .unwrap_or(0);
        let id = txt
            .get("deviceid")
            .cloned()
            .unwrap_or_else(|| instance.to_string());
        return Some(ScreenTarget {
            id: format!("airplay:{id}"),
            name: instance.to_string(),
            kind: ScreenKind::Airplay,
            host: host.to_string(),
            port,
            pairing_required: flags & 0x208 != 0,
            model: txt.get("model").cloned().unwrap_or_default(),
        });
    }
    None
}

/// The screens answering on the local network within `wait` (mDNS; not on iOS).
#[cfg(not(target_os = "ios"))]
pub async fn browse(wait: std::time::Duration) -> Result<Vec<ScreenTarget>, crate::ScreenError> {
    use mdns_sd::{ServiceDaemon, ServiceEvent};
    let daemon = ServiceDaemon::new().map_err(|error| crate::ScreenError::Io(error.to_string()))?;
    let receivers =
        [CAST_SERVICE, AIRPLAY_SERVICE].map(|service| daemon.browse(&format!("{service}.local.")));
    let mut found: Vec<ScreenTarget> = Vec::new();
    let deadline = tokio::time::Instant::now() + wait;
    for receiver in receivers {
        let receiver = receiver.map_err(|error| crate::ScreenError::Io(error.to_string()))?;
        while let Ok(Ok(event)) = tokio::time::timeout_at(deadline, receiver.recv_async()).await {
            let ServiceEvent::ServiceResolved(info) = event else {
                continue;
            };
            // This device's own receiver (a Mac takes AirPlay too) answers on loopback only: it is no other screen.
            let Some(address) = info
                .get_addresses_v4()
                .into_iter()
                .find(|address| !address.is_loopback())
            else {
                continue;
            };
            let txt: HashMap<String, String> = info
                .get_properties()
                .iter()
                .map(|entry| (entry.key().to_string(), entry.val_str().to_string()))
                .collect();
            let instance = info
                .get_fullname()
                .split("._")
                .next()
                .unwrap_or_default()
                .to_string();
            if let Some(target) = target_from_record(
                info.get_type(),
                &instance,
                &address.to_string(),
                info.get_port(),
                &txt,
            ) && !found.iter().any(|known| known.id == target.id)
            {
                found.push(target);
            }
        }
    }
    let _ = daemon.shutdown();
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn txt(entries: &[(&str, &str)]) -> HashMap<String, String> {
        entries
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn records_become_named_screens() {
        let cast = target_from_record(
            "_googlecast._tcp.local.",
            "Chromecast-abc",
            "192.168.1.30",
            8009,
            &txt(&[
                ("fn", "Cuisine"),
                ("id", "abc"),
                ("ca", "201221"),
                ("md", "Chromecast"),
            ]),
        )
        .unwrap();
        assert_eq!(
            (cast.name.as_str(), cast.kind, cast.id.as_str()),
            ("Cuisine", ScreenKind::Chromecast, "cast:abc")
        );
        let speaker = target_from_record(
            "_googlecast._tcp",
            "Nest",
            "192.168.1.31",
            8009,
            &txt(&[("fn", "Nest"), ("ca", "199172")]),
        );
        assert!(speaker.is_none());
        let tv = target_from_record(
            "_airplay._tcp",
            "Apple TV du salon",
            "192.168.1.40",
            7000,
            &txt(&[
                ("deviceid", "AA:BB"),
                ("features", "0x4A7FDFD5,0xBC177FDE"),
                ("flags", "0x244"),
                ("model", "AppleTV14,1"),
            ]),
        )
        .unwrap();
        assert_eq!(
            (tv.name.as_str(), tv.kind, tv.pairing_required),
            ("Apple TV du salon", ScreenKind::Airplay, true)
        );
        let homepod = target_from_record(
            "_airplay._tcp",
            "HomePod",
            "192.168.1.41",
            7000,
            &txt(&[("features", "0x4A7FCA00,0xBC354BD0")]),
        );
        assert!(homepod.is_none());
    }
}
