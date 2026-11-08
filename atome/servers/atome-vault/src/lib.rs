//! One person's vault process. The supervisor (atome-server) starts one per
//! signed-in person, hands it a connected socket as its standard input and
//! output, and stops it once idle; it opens that person's database only, and
//! answers each request with the atome-store vault engine, its sealed records
//! (provider keys, the account's secrets) with `sealed`.

pub mod frame;
pub mod sealed;

use atome_store::vault::Vault;
use frame::Frame;
use std::io::{self, Read, Write};
use std::path::Path;
use std::time::{Duration, Instant};

// The supervisor gives a request 10 s, queue included.
const SLOW_OPERATION: Duration = Duration::from_secs(1);

// Answers every request until the supervisor closes the connection.
pub fn serve(
    vault: &Vault<'_>,
    db: &rusqlite::Connection,
    directory: &Path,
    reader: &mut impl Read,
    writer: &mut impl Write,
) -> io::Result<()> {
    while let Some(request) = frame::read(reader, frame::MAX_REQUEST_BYTES)? {
        let answer = match request.tag {
            frame::REQUEST => frame::parse_request(&request.body)
                .and_then(|(operation, payload)| {
                    let started = Instant::now();
                    let result = if operation.starts_with("sealed:") {
                        sealed::handle(directory, operation, &payload)
                    } else {
                        vault.handle(db, operation, &payload)
                    };
                    // Every request waits behind the one in progress: a slow one is named.
                    let elapsed = started.elapsed();
                    if elapsed >= SLOW_OPERATION {
                        eprintln!(
                            "{}",
                            serde_json::json!({ "component": "vault", "message": "vault_operation_slow",
                                "data": { "principal_id": vault.principal_id, "operation": operation,
                                    "ms": elapsed.as_millis() as u64 } })
                        );
                    }
                    result
                })
                .and_then(|result| serde_json::to_vec(&result).map_err(|e| e.to_string())),
            _ => Err("vault_frame_invalid".into()),
        };
        let reply = match answer {
            Ok(body) => Frame {
                id: request.id,
                tag: frame::RESULT,
                body,
            },
            Err(error) => Frame {
                id: request.id,
                tag: frame::FAILURE,
                body: error.into_bytes(),
            },
        };
        frame::write(writer, &reply)?;
    }
    Ok(())
}
