// The SFU's one mediasoup worker (server/visio.js `ensureWorker`, server/visio_helpers.js, ported):
// its settings read once at startup (`MEDIASOUP_LISTEN_IP`, `MEDIASOUP_ANNOUNCED_IP`,
// `MEDIASOUP_RTC_MIN_PORT`, `MEDIASOUP_RTC_MAX_PORT`), the codecs of every room's router, and the
// WebRTC transport options of a client. A worker that dies ends the process, as on Fastify.
use crate::settings::Settings;
use mediasoup::prelude::*;
use mediasoup::worker::WorkerSettings;
use std::net::IpAddr;
use std::num::{NonZeroU8, NonZeroU32};

const DEFAULT_RTC_MIN_PORT: u16 = 40000;
const DEFAULT_RTC_MAX_PORT: u16 = 49999;
const DEFAULT_LISTEN_IP: &str = "127.0.0.1";

/// Where clients reach the worker's transports.
pub(super) struct Network {
    pub listen_ip: IpAddr,
    pub announced_ip: Option<String>,
}

/// The worker and what started it (the manager runs the worker's threads).
pub(super) struct Sfu {
    pub worker: Worker,
    pub network: Network,
    _manager: WorkerManager,
}

// A port setting: absent is the default; anything but a port number is refused.
fn port(settings: &Settings, name: &str, default: u16) -> Result<u16, String> {
    match settings.get(name) {
        None => Ok(default),
        Some(value) => value
            .trim()
            .parse::<u16>()
            .ok()
            .filter(|port| *port > 0)
            .ok_or_else(|| format!("{name}_invalid")),
    }
}

/// The worker started with Fastify's settings: an explicit error when it cannot start.
pub(super) async fn start(settings: &Settings) -> Result<Sfu, String> {
    let listen_ip = settings
        .get("MEDIASOUP_LISTEN_IP")
        .unwrap_or_else(|| DEFAULT_LISTEN_IP.into());
    let listen_ip: IpAddr = listen_ip
        .trim()
        .parse()
        .map_err(|_| "MEDIASOUP_LISTEN_IP_invalid".to_string())?;
    let announced_ip = settings.get("MEDIASOUP_ANNOUNCED_IP");
    let min = port(settings, "MEDIASOUP_RTC_MIN_PORT", DEFAULT_RTC_MIN_PORT)?;
    let max = port(settings, "MEDIASOUP_RTC_MAX_PORT", DEFAULT_RTC_MAX_PORT)?;
    if min > max {
        return Err("MEDIASOUP_RTC_PORT_RANGE_invalid".into());
    }
    let manager = WorkerManager::new();
    let mut worker_settings = WorkerSettings::default();
    worker_settings.rtc_port_range = min..=max;
    let worker = manager
        .create_worker(worker_settings)
        .await
        .map_err(|error| format!("visio_worker_start_failed:{error}"))?;
    // Loopback candidates reach no remote device: calls ring and connect, then carry no media at
    // all (atome.one, 15 Oct. 2026). A public server sets both variables.
    if announced_ip.is_none() && listen_ip.is_loopback() {
        eprintln!(
            "[visio] mediasoup listens on loopback only: remote clients cannot exchange media \
             (set MEDIASOUP_LISTEN_IP=0.0.0.0 and MEDIASOUP_ANNOUNCED_IP=<public IP>)"
        );
    }
    worker
        .on_dead(|_| {
            eprintln!("[visio] mediasoup worker died");
            std::process::exit(1);
        })
        .detach();
    Ok(Sfu {
        worker,
        network: Network {
            listen_ip,
            announced_ip,
        },
        _manager: manager,
    })
}

/// `DEFAULT_MEDIA_CODECS`: Opus 48 kHz stereo and VP8 starting at 1 Mbit/s.
pub(super) fn media_codecs() -> Vec<RtpCodecCapability> {
    vec![
        RtpCodecCapability::Audio {
            mime_type: MimeTypeAudio::Opus,
            preferred_payload_type: None,
            clock_rate: NonZeroU32::new(48000).expect("clock rate"),
            channels: NonZeroU8::new(2).expect("channels"),
            parameters: RtpCodecParametersParameters::default(),
            rtcp_feedback: vec![],
        },
        RtpCodecCapability::Video {
            mime_type: MimeTypeVideo::Vp8,
            preferred_payload_type: None,
            clock_rate: NonZeroU32::new(90000).expect("clock rate"),
            parameters: RtpCodecParametersParameters::from([(
                "x-google-start-bitrate",
                1000_u32.into(),
            )]),
            rtcp_feedback: vec![],
        },
    ]
}

impl Network {
    /// `listenIps: [{ ip, announcedIp }]`, UDP and TCP, UDP preferred: what Node's deprecated
    /// `listenIps` becomes (UDP then TCP on the worker's port range).
    pub(super) fn transport_options(&self) -> WebRtcTransportOptions {
        let info = |protocol| ListenInfo {
            protocol,
            ip: self.listen_ip,
            announced_address: self.announced_ip.clone(),
            expose_internal_ip: false,
            port: None,
            port_range: None,
            flags: None,
            send_buffer_size: None,
            recv_buffer_size: None,
        };
        let mut options = WebRtcTransportOptions::new(
            WebRtcTransportListenInfos::new(info(Protocol::Udp)).insert(info(Protocol::Tcp)),
        );
        options.enable_udp = true;
        options.enable_tcp = true;
        options.prefer_udp = true;
        options
    }
}
