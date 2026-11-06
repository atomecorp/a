// Who a request comes from as Fastify read it behind nginx (`trustProxy: '127.0.0.1'`), and
// whether it asks for a WebSocket.
use axum::http::{HeaderMap, HeaderName, header};
use std::net::SocketAddr;

/// Fastify's `request.ip` (proxy-addr, `trustProxy: '127.0.0.1'`): from the peer leftward along
/// X-Forwarded-For, the first address it does not trust.
pub fn client_network(peer: SocketAddr, headers: &HeaderMap) -> String {
    let loopback = |address: &str| match address.parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V4(v4)) => v4 == std::net::Ipv4Addr::LOCALHOST,
        Ok(std::net::IpAddr::V6(v6)) => v6.to_ipv4_mapped() == Some(std::net::Ipv4Addr::LOCALHOST),
        Err(_) => false,
    };
    let mut chain = vec![peer.ip().to_string()];
    if let Some(forwarded) = headers
        .get(HeaderName::from_static("x-forwarded-for"))
        .and_then(|value| value.to_str().ok())
    {
        chain.extend(
            forwarded
                .split(',')
                .map(|entry| entry.trim().to_string())
                .rev(),
        );
    }
    let last = chain.len() - 1;
    chain
        .into_iter()
        .enumerate()
        .find(|(index, address)| *index == last || !loopback(address))
        .map(|(_, address)| address)
        .unwrap_or_default()
}

/// A WebSocket upgrade: an `Upgrade` header and `upgrade` among the `Connection` tokens.
pub fn is_upgrade(headers: &HeaderMap) -> bool {
    headers.get(header::UPGRADE).is_some()
        && headers
            .get_all(header::CONNECTION)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .any(|value| {
                value
                    .split(',')
                    .any(|token| token.trim().eq_ignore_ascii_case("upgrade"))
            })
}
