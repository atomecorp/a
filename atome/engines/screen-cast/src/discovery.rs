//! Screens found by Bonjour. A record (service type, instance name, address, port, TXT entries) becomes a
//! `ScreenTarget` here, wherever it was read: by `browse` (mDNS, desktop) or by the iOS system browser, which hands
//! its records over (an iOS app may not open multicast sockets of its own).
//!
//! The Atome apps nearby (R-248 « à proximité ») are heard the same way: each announces `_atome._tcp` under an opaque
//! instance name, the nearby token its server gave its seat (`announce`), and the tokens heard go to the server, which
//! says which seats they are.

use std::collections::HashMap;

use crate::{ScreenKind, ScreenTarget};

pub const CAST_SERVICE: &str = "_googlecast._tcp";
pub const AIRPLAY_SERVICE: &str = "_airplay._tcp";
pub const ATOME_SERVICE: &str = "_atome._tcp";

/// What a browse heard: the screens, and the nearby tokens of the Atome apps around.
#[derive(Debug, Default, PartialEq)]
pub struct Heard {
    pub screens: Vec<ScreenTarget>,
    pub atome: Vec<String>,
}

impl Heard {
    /// One Bonjour record taken in, each screen and token once; `own` (this app's token) is not another app.
    pub fn take(
        &mut self,
        own: &str,
        service: &str,
        instance: &str,
        host: &str,
        port: u16,
        txt: &HashMap<String, String>,
    ) {
        if service
            .trim_end_matches('.')
            .trim_end_matches(".local")
            .starts_with(ATOME_SERVICE)
        {
            if is_nearby_token(instance)
                && instance != own
                && !self.atome.iter().any(|t| t == instance)
            {
                self.atome.push(instance.to_string());
            }
            return;
        }
        if let Some(target) = target_from_record(service, instance, host, port, txt)
            && !self.screens.iter().any(|known| known.id == target.id)
        {
            self.screens.push(target);
        }
    }
}

/// A nearby token as the server makes it: 16 lowercase hex characters. Any other name under `_atome._tcp` is no app's.
pub fn is_nearby_token(name: &str) -> bool {
    name.len() == 16
        && name
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

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

/// The screens and the Atome apps answering on the local network within `wait` (mDNS; not on iOS).
#[cfg(not(target_os = "ios"))]
pub async fn browse(wait: std::time::Duration) -> Result<Heard, crate::ScreenError> {
    use mdns_sd::{ServiceDaemon, ServiceEvent};
    let daemon = ServiceDaemon::new().map_err(|error| crate::ScreenError::Io(error.to_string()))?;
    let receivers = [CAST_SERVICE, AIRPLAY_SERVICE, ATOME_SERVICE]
        .map(|service| daemon.browse(&format!("{service}.local.")));
    let own = announced_token();
    let mut heard = Heard::default();
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
            heard.take(
                &own,
                info.get_type(),
                &instance,
                &address.to_string(),
                info.get_port(),
                &txt,
            );
        }
    }
    let _ = daemon.shutdown();
    Ok(heard)
}

// The one daemon announcing this app, and the full name of what it announces.
#[cfg(not(target_os = "ios"))]
struct Announcer {
    daemon: mdns_sd::ServiceDaemon,
    fullname: String,
    token: String,
}

#[cfg(not(target_os = "ios"))]
static ANNOUNCER: std::sync::Mutex<Option<Announcer>> = std::sync::Mutex::new(None);

// The port the record names: nothing is served on it, the record carries only its name.
#[cfg(not(target_os = "ios"))]
const ANNOUNCE_PORT: u16 = 9;

/// The token this app announces, empty when none.
#[cfg(not(target_os = "ios"))]
pub fn announced_token() -> String {
    ANNOUNCER
        .lock()
        .expect("announcer")
        .as_ref()
        .map(|announcer| announcer.token.clone())
        .unwrap_or_default()
}

/// This app announced as `_atome._tcp` under `token` (TXT `v=1`), replacing what it announced before; an empty token
/// takes the announce away. One daemon serves every announce (mDNS; not on iOS, whose app announces natively).
#[cfg(not(target_os = "ios"))]
pub fn announce(token: &str) -> Result<(), crate::ScreenError> {
    use mdns_sd::{ServiceDaemon, ServiceInfo};
    let io = |error: mdns_sd::Error| crate::ScreenError::Io(error.to_string());
    if !token.is_empty() && !is_nearby_token(token) {
        return Err(crate::ScreenError::Refused("nearby_token_invalid".into()));
    }
    let mut announcer = ANNOUNCER.lock().expect("announcer");
    if let Some(previous) = announcer.as_mut()
        && !previous.fullname.is_empty()
    {
        previous.daemon.unregister(&previous.fullname).map_err(io)?;
        previous.fullname.clear();
        previous.token.clear();
    }
    if token.is_empty() {
        return Ok(());
    }
    if announcer.is_none() {
        *announcer = Some(Announcer {
            daemon: ServiceDaemon::new().map_err(io)?,
            fullname: String::new(),
            token: String::new(),
        });
    }
    let current = announcer.as_mut().expect("announcer made");
    let service = ServiceInfo::new(
        &format!("{ATOME_SERVICE}.local."),
        token,
        &format!("atome-{token}.local."),
        (),
        ANNOUNCE_PORT,
        &[("v", "1")][..],
    )
    .map_err(io)?
    .enable_addr_auto();
    current.fullname = service.get_fullname().to_string();
    current.daemon.register(service).map_err(io)?;
    current.token = token.to_string();
    Ok(())
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

    #[test]
    fn atome_records_become_nearby_tokens() {
        let mut heard = Heard::default();
        let none = txt(&[("v", "1")]);
        heard.take(
            "",
            "_atome._tcp.local.",
            "0123456789abcdef",
            "192.168.1.50",
            9,
            &none,
        );
        heard.take(
            "",
            "_atome._tcp",
            "0123456789abcdef",
            "192.168.1.51",
            9,
            &none,
        );
        heard.take(
            "",
            "_atome._tcp",
            "fedcba9876543210",
            "192.168.1.52",
            9,
            &none,
        );
        // This app's own announce, and a name no server makes, are not apps nearby.
        heard.take(
            "aaaaaaaaaaaaaaaa",
            "_atome._tcp",
            "aaaaaaaaaaaaaaaa",
            "192.168.1.53",
            9,
            &none,
        );
        heard.take("", "_atome._tcp", "Mon iPhone", "192.168.1.54", 9, &none);
        heard.take(
            "",
            "_atome._tcp",
            "0123456789ABCDEF",
            "192.168.1.55",
            9,
            &none,
        );
        assert_eq!(heard.atome, ["0123456789abcdef", "fedcba9876543210"]);
        assert!(heard.screens.is_empty());
        let tv = txt(&[("deviceid", "AA:BB"), ("features", "0x4A7FDFD5,0xBC177FDE")]);
        heard.take("", "_airplay._tcp", "Salon", "192.168.1.40", 7000, &tv);
        heard.take("", "_airplay._tcp", "Salon", "192.168.1.40", 7000, &tv);
        assert_eq!(heard.screens.len(), 1);
        assert_eq!(heard.atome.len(), 2);
    }

    #[cfg(not(target_os = "ios"))]
    #[test]
    fn announce_replaces_and_takes_away_one_record() {
        assert!(announce("not a token").is_err());
        announce("0123456789abcdef").expect("announced");
        announce("fedcba9876543210").expect("replaced");
        assert_eq!(announced_token(), "fedcba9876543210");
        announce("").expect("taken away");
        assert_eq!(announced_token(), "");
    }
}
