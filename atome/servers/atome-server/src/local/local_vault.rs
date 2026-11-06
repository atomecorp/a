// The local vault's one connection and its one quiesced state. Every unit of work on the
// vault (a request, a native controller's frame, the sync worker, the remote projection)
// goes through `lock()`. While the platform has quiesced the vault (iOS on its way to the
// background), a unit only starts under background time the platform grants it, else it is
// refused (`local_vault_background_time_unavailable`): a suspended process must never hold a
// lock on the app group's database (0xDEAD10CC). The background loops wait for `foreground()`.
use rusqlite::Connection;
use std::fmt;
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use tokio::sync::watch;

/// Background time granted for one unit: its release, or `None` when none is left.
pub type BackgroundTime = Arc<dyn Fn() -> Option<Box<dyn FnOnce() + Send>> + Send + Sync>;

pub struct LocalVault {
    connection: Mutex<Connection>,
    gate: Mutex<Gate>,
    idle: Condvar,
    quiesced: watch::Sender<bool>,
}

struct Gate {
    background: Option<BackgroundTime>,
    units: usize,
}

#[derive(Debug, PartialEq, Eq)]
pub enum VaultLockError {
    Poisoned,
    BackgroundTimeUnavailable,
}

impl fmt::Display for VaultLockError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Poisoned => "local_database_unavailable",
            Self::BackgroundTimeUnavailable => "local_vault_background_time_unavailable",
        })
    }
}

impl std::error::Error for VaultLockError {}

struct Unit<'a> {
    vault: &'a LocalVault,
    release: Option<Box<dyn FnOnce() + Send>>,
}

impl Drop for Unit<'_> {
    fn drop(&mut self) {
        if let Ok(mut gate) = self.vault.gate.lock() {
            gate.units -= 1;
        }
        self.vault.idle.notify_all();
        if let Some(release) = self.release.take() {
            release();
        }
    }
}

/// The connection for one unit of work; the lock is let go before the unit's background time.
pub struct VaultGuard<'a> {
    connection: MutexGuard<'a, Connection>,
    _unit: Unit<'a>,
}

impl Deref for VaultGuard<'_> {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        &self.connection
    }
}

impl DerefMut for VaultGuard<'_> {
    fn deref_mut(&mut self) -> &mut Connection {
        &mut self.connection
    }
}

impl LocalVault {
    pub fn new(connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
            gate: Mutex::new(Gate {
                background: None,
                units: 0,
            }),
            idle: Condvar::new(),
            quiesced: watch::Sender::new(false),
        }
    }

    pub fn lock(&self) -> Result<VaultGuard<'_>, VaultLockError> {
        let unit = {
            let mut gate = self.gate.lock().map_err(|_| VaultLockError::Poisoned)?;
            let release = match &gate.background {
                None => None,
                Some(time) => Some(time().ok_or(VaultLockError::BackgroundTimeUnavailable)?),
            };
            gate.units += 1;
            Unit {
                vault: self,
                release,
            }
        };
        let connection = self
            .connection
            .lock()
            .map_err(|_| VaultLockError::Poisoned)?;
        Ok(VaultGuard {
            connection,
            _unit: unit,
        })
    }

    /// From now on a unit starts only under background time from `time`; returns once the
    /// units already under way are over. Blocking: called under the platform's own assertion.
    pub fn quiesce(&self, time: BackgroundTime) {
        let Ok(mut gate) = self.gate.lock() else {
            return;
        };
        gate.background = Some(time);
        self.quiesced.send_replace(true);
        while gate.units > 0 {
            gate = match self.idle.wait(gate) {
                Ok(gate) => gate,
                Err(_) => return,
            };
        }
    }

    pub fn resume(&self) {
        if let Ok(mut gate) = self.gate.lock() {
            gate.background = None;
        }
        self.quiesced.send_replace(false);
    }

    /// Returns at once in the foreground, else when the platform resumes the vault.
    pub async fn foreground(&self) {
        let mut quiesced = self.quiesced.subscribe();
        let _ = quiesced.wait_for(|quiesced| !*quiesced).await;
    }

    /// Returns when the platform quiesces the vault.
    pub async fn quiesced(&self) {
        let mut quiesced = self.quiesced.subscribe();
        let _ = quiesced.wait_for(|quiesced| *quiesced).await;
    }
}

#[cfg(test)]
#[path = "local_vault_tests.rs"]
mod tests;
