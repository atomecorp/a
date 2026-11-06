// The two DNS readings a personal domain's proof needs (`dns.promises.resolveTxt` and
// `resolveCname` of server/site_domains.js): one query over UDP to the system's resolver
// (`/etc/resolv.conf`, as c-ares reads it), its answers of the asked type only.
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::net::UdpSocket;

const TXT: u16 = 16;
const CNAME: u16 = 5;
// c-ares' defaults: 5 s a try, the next server or try after.
const TRY: Duration = Duration::from_secs(5);
const TRIES: usize = 2;

fn resolvers() -> Vec<SocketAddr> {
    let listed: Vec<SocketAddr> = std::fs::read_to_string("/etc/resolv.conf")
        .unwrap_or_default()
        .lines()
        .filter_map(|line| line.trim().strip_prefix("nameserver"))
        .filter_map(|address| address.trim().split('%').next()?.parse::<IpAddr>().ok())
        .map(|ip| SocketAddr::new(ip, 53))
        .collect();
    if listed.is_empty() {
        vec![SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 53)]
    } else {
        listed
    }
}

fn question(id: u16, name: &str, kind: u16) -> Result<Vec<u8>, String> {
    let mut packet = Vec::with_capacity(64);
    packet.extend_from_slice(&id.to_be_bytes());
    // A standard query, recursion desired, one question.
    packet.extend_from_slice(&[0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]);
    for label in name.trim_end_matches('.').split('.') {
        if label.is_empty() || label.len() > 63 {
            return Err("dns_name_invalid".into());
        }
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.push(0);
    packet.extend_from_slice(&kind.to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes());
    Ok(packet)
}

// A name at `at` (compression pointers followed), and where the record goes on.
fn name(packet: &[u8], mut at: usize) -> Result<(String, usize), String> {
    let (mut labels, mut next, mut jumps) = (Vec::new(), None, 0);
    loop {
        let length = *packet.get(at).ok_or("dns_answer_short")? as usize;
        if length & 0xc0 == 0xc0 {
            let low = *packet.get(at + 1).ok_or("dns_answer_short")? as usize;
            next.get_or_insert(at + 2);
            at = ((length & 0x3f) << 8) | low;
            jumps += 1;
            if jumps > 32 {
                return Err("dns_answer_loop".into());
            }
            continue;
        }
        if length == 0 {
            return Ok((labels.join("."), next.unwrap_or(at + 1)));
        }
        let label = packet
            .get(at + 1..at + 1 + length)
            .ok_or("dns_answer_short")?;
        labels.push(String::from_utf8_lossy(label).into_owned());
        at += 1 + length;
    }
}

fn read_u16(packet: &[u8], at: usize) -> Result<u16, String> {
    packet
        .get(at..at + 2)
        .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]]))
        .ok_or_else(|| "dns_answer_short".into())
}

// The records of `kind` in an answer: a TXT record's strings, a CNAME's name.
fn answers(packet: &[u8], id: u16, kind: u16) -> Result<Vec<Vec<String>>, String> {
    if read_u16(packet, 0)? != id {
        return Err("dns_answer_foreign".into());
    }
    let flags = read_u16(packet, 2)?;
    if flags & 0x0200 != 0 {
        return Err("dns_answer_truncated".into());
    }
    if flags & 0x000f != 0 {
        return Err(format!("dns_rcode_{}", flags & 0x000f));
    }
    let (questions, records) = (read_u16(packet, 4)?, read_u16(packet, 6)?);
    let mut at = 12;
    for _ in 0..questions {
        at = name(packet, at)?.1 + 4;
    }
    let mut found = Vec::new();
    for _ in 0..records {
        at = name(packet, at)?.1;
        let (record, length) = (read_u16(packet, at)?, read_u16(packet, at + 8)? as usize);
        let data = at + 10;
        let rdata = packet.get(data..data + length).ok_or("dns_answer_short")?;
        if record == kind && kind == TXT {
            let (mut strings, mut cursor) = (Vec::new(), 0);
            while cursor < rdata.len() {
                let size = rdata[cursor] as usize;
                let text = rdata
                    .get(cursor + 1..cursor + 1 + size)
                    .ok_or("dns_answer_short")?;
                strings.push(String::from_utf8_lossy(text).into_owned());
                cursor += 1 + size;
            }
            found.push(strings);
        } else if record == kind {
            found.push(vec![name(packet, data)?.0]);
        }
        at = data + length;
    }
    if found.is_empty() {
        return Err("dns_no_data".into());
    }
    Ok(found)
}

async fn resolve(name: &str, kind: u16) -> Result<Vec<Vec<String>>, String> {
    let id = rand_id();
    let packet = question(id, name, kind)?;
    let mut last = String::from("dns_unreachable");
    for _ in 0..TRIES {
        for server in resolvers() {
            let local: SocketAddr = if server.is_ipv4() {
                "0.0.0.0:0".parse().expect("address")
            } else {
                "[::]:0".parse().expect("address")
            };
            let socket = UdpSocket::bind(local).await.map_err(|e| e.to_string())?;
            if let Err(error) = socket.send_to(&packet, server).await {
                last = error.to_string();
                continue;
            }
            let mut buffer = vec![0u8; 4096];
            match tokio::time::timeout(TRY, socket.recv(&mut buffer)).await {
                Ok(Ok(size)) => return answers(&buffer[..size], id, kind),
                Ok(Err(error)) => last = error.to_string(),
                Err(_) => last = "dns_timeout".into(),
            }
        }
    }
    Err(last)
}

fn rand_id() -> u16 {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    u16::from_be_bytes([bytes[0], bytes[1]])
}

/// `resolveTxt(name)`, each record's strings joined.
pub async fn txt(name: &str) -> Result<Vec<String>, String> {
    Ok(resolve(name, TXT)
        .await?
        .into_iter()
        .map(|parts| parts.concat())
        .collect())
}

/// `resolveCname(name)`.
pub async fn cname(name: &str) -> Result<Vec<String>, String> {
    Ok(resolve(name, CNAME).await?.into_iter().flatten().collect())
}
