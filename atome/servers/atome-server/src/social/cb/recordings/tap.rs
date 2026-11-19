// The server's own ear on a room (cahier §3.1, third rule; §7.2): a mediasoup consumer on a DirectTransport of the room's
// router (mediasoup 0.21 `Router::create_direct_transport`, `Consumer::on_rtp`), attached to each audio producer of a `cb`
// room (visio/streams.rs `produce`; an Appel's room, lot L5, attaches it the same way). Its RTP packets reach one task of
// their own, which writes the take (ogg_opus.rs): a take opens at the first packet, closes when the producer is paused
// (the floor ended: the SFU pauses it, visio::cb_floor_lost; or the device paused it), closed, or when it outlasts
// `max_take_ms`; then it is kept (Recordings::keep). Nothing is decoded, nothing is sent anywhere but the file and the
// live translation's branch point.
// An Appel's voice, in duplex, is never paused: its takes are cut at the silence instead (lot L5, decision Q4;
// live_translate/segments.rs `PacketCut`), read on each packet's level (`ssrc-audio-level`) or, without one, its size,
// and on the time no packet came; so each piece reaches the translation while its speaker goes on talking. Silence
// alone makes no take.
use super::ogg_opus::TakeWriter;
use super::{Recordings, Take};
use crate::social::cb::live_translate::RoomKind;
use crate::social::cb::live_translate::segments::{self, Cue, PacketCut};
use mediasoup::prelude::*;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;

// Shorter than this, a take is a stray packet's.
const MIN_TAKE_MS: u64 = 200;

enum Heard {
    Packet(Vec<u8>),
    // An Appel's take open, no packet came for this long.
    Quiet(u64),
    Paused,
    Closed,
}

fn now_ms() -> u64 {
    u64::try_from(atome_js_values::dates::now_ms()).unwrap_or_default()
}

/// The recording consumer of `producer` (an audio producer of `room` on `router`, spoken by `handle`): it lives until
/// the producer or its room closes.
pub async fn attach(
    recordings: Arc<Recordings>,
    router: &Router,
    producer: &Producer,
    room: &str,
    kind: RoomKind,
    handle: &str,
    max_take_ms: u64,
) -> Result<(), String> {
    if producer.kind() != MediaKind::Audio {
        return Ok(());
    }
    // No key to seal it: the voice is refused before its first packet, never carried unrecorded nor kept in the clear.
    recordings.ready()?;
    let transport = router
        .create_direct_transport(DirectTransportOptions::default())
        .await
        .map_err(|e| e.to_string())?;
    let capabilities: RtpCapabilities = serde_json::to_value(router.rtp_capabilities())
        .and_then(serde_json::from_value)
        .map_err(|e| e.to_string())?;
    let consumer = transport
        .consume(ConsumerOptions::new(producer.id(), capabilities))
        .await
        .map_err(|e| e.to_string())?;
    let payload_type = consumer
        .rtp_parameters()
        .codecs
        .first()
        .map(RtpCodecParameters::payload_type);
    // An Appel's cut, and the id its packets' level arrives under (this consumer's own).
    let call_cut = segments::call_cut();
    let mut cut = (kind == RoomKind::Call).then(|| PacketCut::new(call_cut));
    let level_id = consumer
        .rtp_parameters()
        .header_extensions
        .iter()
        .find(|extension| extension.uri == RtpHeaderExtensionUri::SsrcAudioLevel)
        .and_then(|extension| u8::try_from(extension.id).ok());
    let (heard, mut ears) = mpsc::unbounded_channel();
    let packets = heard.clone();
    consumer
        .on_rtp(move |packet| {
            let _ = packets.send(Heard::Packet(packet.to_vec()));
        })
        .detach();
    let paused = heard.clone();
    consumer
        .on_producer_pause(move || {
            let _ = paused.send(Heard::Paused);
        })
        .detach();
    let closed = heard.clone();
    consumer
        .on_producer_close(move || {
            let _ = closed.send(Heard::Closed);
        })
        .detach();
    consumer
        .on_transport_close(move || {
            let _ = heard.send(Heard::Closed);
        })
        .detach();
    let (room, handle) = (room.to_string(), handle.to_string());
    tokio::spawn(async move {
        // The consumer and its transport live as long as this task: dropping them closes them.
        let _held = (transport, consumer);
        let mut take: Option<(TakeWriter, u64)> = None;
        let close = |take: Option<(TakeWriter, u64)>| {
            let (recordings, room, handle) = (recordings.clone(), room.clone(), handle.clone());
            async move {
                let Some((writer, started_ms)) = take else {
                    return;
                };
                // A packet still in flight when the floor ended makes no take of its own.
                let Some(written) = writer.finish().filter(|w| w.duration_ms >= MIN_TAKE_MS) else {
                    return;
                };
                let take = Take {
                    room,
                    kind,
                    handle,
                    started_ms,
                    ended_ms: now_ms(),
                    written,
                };
                if let Err(error) = recordings.keep(take).await {
                    eprintln!("[cb] take not kept: {error}");
                }
            }
        };
        loop {
            // An Appel's take open: no packet for the silence's length is silence too (a device's DTX, a muted line).
            let quiet = cut
                .as_ref()
                .filter(|_| take.is_some())
                .map(PacketCut::silence_ms);
            let event = match quiet {
                Some(ms) => tokio::time::timeout(Duration::from_millis(ms), ears.recv())
                    .await
                    .unwrap_or(Some(Heard::Quiet(ms))),
                None => ears.recv().await,
            };
            let Some(event) = event else {
                break;
            };
            // The stretch an Appel's cut reads: its length, and whether it was voice.
            let mut stretch = None;
            match event {
                Heard::Packet(packet) => {
                    let (writer, _) =
                        take.get_or_insert_with(|| (TakeWriter::new(payload_type), now_ms()));
                    let before = writer.duration_ms();
                    writer.push_rtp(&packet);
                    let after = writer.duration_ms();
                    if after >= max_take_ms {
                        close(take.take()).await;
                        if let Some(cut) = cut.as_mut() {
                            cut.reset();
                        }
                    } else if cut.is_some() {
                        stretch = Some((
                            after.saturating_sub(before),
                            segments::packet_voiced(&packet, level_id, call_cut),
                        ));
                    }
                }
                Heard::Quiet(ms) => stretch = Some((ms, false)),
                Heard::Paused => {
                    // An Appel's piece of silence alone is dropped, never kept.
                    if cut.as_ref().is_some_and(|cut| !cut.holds_voice()) {
                        take = None;
                    }
                    close(take.take()).await;
                    if let Some(cut) = cut.as_mut() {
                        cut.reset();
                    }
                }
                Heard::Closed => break,
            }
            if let (Some(cut), Some((ms, voiced))) = (cut.as_mut(), stretch) {
                match cut.heard(ms, voiced) {
                    Cue::Go => {}
                    Cue::Cut => close(take.take()).await,
                    // Silence alone: never kept, never translated.
                    Cue::Drop => take = None,
                }
            }
        }
        if cut.as_ref().is_some_and(|cut| !cut.holds_voice()) {
            take = None;
        }
        close(take.take()).await;
    });
    Ok(())
}
