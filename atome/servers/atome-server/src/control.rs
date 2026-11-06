// The supervisor's control socket: Fastify, until each of its vault routes is
// ported, reaches a person's vault through it, never through the vault file, and
// asks through SERVICE frames the vault router (`router:*`) which vault holds what
// and who may see it, and the `/ws/sync` runtime (`sync:*`) to deliver events.
// The socket lies in a directory only this account can enter, and a connection
// from another account is closed unread. Requests are ROUTED frames, many at once
// on one connection; each reply names its request.
use crate::vault_router::VaultRouter;
use crate::vaults::Vaults;
use crate::ws_sync::SyncRuntime;
use atome_vault::frame::{self, Frame};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::mpsc;

// A routed request: its principal and the vault request it carries.
const MAX_ROUTED_BYTES: usize = frame::MAX_REQUEST_BYTES + 2 + u16::MAX as usize;

/// What SERVICE frames reach.
pub struct Services {
    pub router: Arc<VaultRouter>,
    pub sync: Arc<SyncRuntime>,
    pub social: Arc<crate::social::Social>,
}

impl Services {
    async fn answer(
        &self,
        operation: &str,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        if operation.starts_with("sync:") {
            self.sync.service(operation, payload).await
        } else if let Some(answer) = self.social.service(operation, payload).await {
            answer
        } else {
            self.router.service(operation, payload).await
        }
    }
}

pub struct ControlSocket {
    pub path: PathBuf,
    listener: UnixListener,
    owner_uid: u32,
}

// The socket `name` in `directory`, a directory this call creates (so no other
// account made it first) for this account alone (0700, the socket 0600).
pub fn bind(directory: &Path, name: &str) -> Result<ControlSocket, String> {
    std::fs::DirBuilder::new()
        .mode(0o700)
        .create(directory)
        .map_err(|e| format!("vault_supervisor_directory_failed:{e}"))?;
    let metadata = std::fs::metadata(directory).map_err(|e| e.to_string())?;
    let path = directory.join(name);
    let listener =
        UnixListener::bind(&path).map_err(|e| format!("vault_supervisor_bind_failed:{e}"))?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    Ok(ControlSocket {
        path,
        listener,
        owner_uid: metadata.uid(),
    })
}

impl ControlSocket {
    pub async fn serve(self, vaults: Arc<Vaults>, services: Arc<Services>) {
        loop {
            let Ok((stream, _)) = self.listener.accept().await else {
                continue;
            };
            let same_account = stream
                .peer_cred()
                .is_ok_and(|peer| peer.uid() == self.owner_uid);
            if same_account {
                tokio::spawn(connection(stream, vaults.clone(), services.clone()));
            }
        }
    }
}

async fn connection(stream: UnixStream, vaults: Arc<Vaults>, services: Arc<Services>) {
    let (mut reader, mut writer) = stream.into_split();
    let (replies, mut outgoing) = mpsc::unbounded_channel::<Frame>();
    let writing = tokio::spawn(async move {
        while let Some(reply) = outgoing.recv().await {
            if writer.write_all(&reply.encode()).await.is_err() {
                return;
            }
        }
    });
    loop {
        let mut prefix = [0u8; 4];
        if reader.read_exact(&mut prefix).await.is_err() {
            break;
        }
        let Ok(length) = frame::content_length(prefix, MAX_ROUTED_BYTES) else {
            break;
        };
        let mut content = vec![0u8; length];
        if reader.read_exact(&mut content).await.is_err() {
            break;
        }
        let Ok(request) = Frame::decode(content) else {
            break;
        };
        let vaults = vaults.clone();
        let services = services.clone();
        let replies = replies.clone();
        tokio::spawn(async move {
            let answer = match request.tag {
                frame::ROUTED => match frame::parse_routed(&request.body) {
                    Ok((principal, body)) => vaults.request(principal, body.to_vec()).await,
                    Err(error) => Err(error),
                },
                frame::SERVICE => match frame::parse_request(&request.body) {
                    Ok((operation, payload)) => services
                        .answer(operation, &payload)
                        .await
                        .and_then(|result| serde_json::to_vec(&result).map_err(|e| e.to_string())),
                    Err(error) => Err(error),
                },
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
            let _ = replies.send(reply);
        });
    }
    drop(replies);
    let _ = writing.await;
}
