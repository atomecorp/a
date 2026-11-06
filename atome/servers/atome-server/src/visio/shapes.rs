// The mediasoup objects as JSON, in the shapes Node's mediasoup gives them and mediasoup-client
// reads (server/visio_ws_handler.js `roomJoined`, `transportCreated`, `consumerCreated`): the crate
// leaves out two fields Node writes, a candidate's `ip` and a header extension's `parameters`.
use mediasoup::prelude::*;
use serde_json::{Value as JsonValue, json};

/// A mediasoup value as its own serde shape (the camelCase of Node's).
pub(super) fn value<T: serde::Serialize>(of: &T) -> JsonValue {
    serde_json::to_value(of).expect("mediasoup values serialize")
}

/// `router.rtpCapabilities`.
pub(super) fn rtp_capabilities(router: &Router) -> JsonValue {
    value(&router.rtp_capabilities())
}

/// `{ id, iceParameters, iceCandidates, dtlsParameters }`; each candidate also carries Node's
/// `ip` beside its `address`.
pub(super) fn transport_options(transport: &WebRtcTransport) -> JsonValue {
    let mut candidates = value(transport.ice_candidates());
    for candidate in candidates.as_array_mut().into_iter().flatten() {
        candidate["ip"] = candidate["address"].clone();
    }
    json!({
        "id": transport.id().to_string(),
        "iceParameters": value(transport.ice_parameters()),
        "iceCandidates": candidates,
        "dtlsParameters": value(&transport.dtls_parameters()),
    })
}

/// `consumer.rtpParameters`; each header extension also carries Node's empty `parameters`.
pub(super) fn consumer_rtp_parameters(consumer: &Consumer) -> JsonValue {
    let mut parameters = value(consumer.rtp_parameters());
    for extension in parameters["headerExtensions"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        extension["parameters"] = json!({});
    }
    parameters
}
