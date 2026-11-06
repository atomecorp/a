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
                    if operation.starts_with("sealed:") {
                        sealed::handle(directory, operation, &payload)
                    } else {
                        vault.handle(db, operation, &payload)
                    }
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
