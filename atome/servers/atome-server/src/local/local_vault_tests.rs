// The vault's quiesced state: no unit without background time, quiesce waits for the units
// under way, and the sync worker leaves a quiesced vault alone until it is resumed.
use super::{BackgroundTime, LocalVault, VaultLockError};
use rusqlite::Connection;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn vault() -> LocalVault {
    LocalVault::new(Connection::open_in_memory().expect("memory db"))
}

fn counting(granted: bool, asked: Arc<AtomicUsize>, released: Arc<AtomicUsize>) -> BackgroundTime {
    Arc::new(move || {
        asked.fetch_add(1, Ordering::SeqCst);
        let released = released.clone();
        granted.then(|| {
            Box::new(move || {
                released.fetch_add(1, Ordering::SeqCst);
            }) as Box<dyn FnOnce() + Send>
        })
    })
}

#[test]
fn a_foreground_unit_asks_for_no_background_time() {
    let vault = vault();
    let db = vault.lock().expect("foreground unit");
    assert_eq!(
        db.query_row("SELECT 1", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn a_quiesced_vault_refuses_a_unit_without_background_time() {
    let vault = vault();
    let (asked, released) = (Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0)));
    vault.quiesce(counting(false, asked.clone(), released.clone()));
    assert_eq!(
        vault.lock().err(),
        Some(VaultLockError::BackgroundTimeUnavailable)
    );
    assert_eq!(
        VaultLockError::BackgroundTimeUnavailable.to_string(),
        "local_vault_background_time_unavailable"
    );
    assert_eq!(asked.load(Ordering::SeqCst), 1);
    vault.resume();
    assert!(vault.lock().is_ok());
    assert_eq!(asked.load(Ordering::SeqCst), 1);
}

#[test]
fn a_quiesced_unit_runs_under_its_background_time_released_after_the_lock() {
    let vault = Arc::new(vault());
    let order = Arc::new(Mutex::new(Vec::<&str>::new()));
    let (seen, log) = (vault.clone(), order.clone());
    vault.quiesce(Arc::new(move || {
        log.lock().unwrap().push("begin");
        let (seen, log) = (seen.clone(), log.clone());
        Some(Box::new(move || {
            // The connection is already let go when the background time ends.
            assert!(seen.connection.try_lock().is_ok());
            log.lock().unwrap().push("end");
        }) as Box<dyn FnOnce() + Send>)
    }));
    {
        let db = vault.lock().expect("unit under background time");
        db.execute_batch("CREATE TABLE t (x INTEGER)").unwrap();
        order.lock().unwrap().push("write");
    }
    assert_eq!(*order.lock().unwrap(), vec!["begin", "write", "end"]);
}

#[test]
fn quiesce_returns_only_once_the_unit_under_way_is_over() {
    let vault = Arc::new(vault());
    let (started, worker) = (Arc::new(AtomicUsize::new(0)), vault.clone());
    let flag = started.clone();
    let unit = std::thread::spawn(move || {
        let _db = worker.lock().unwrap();
        flag.store(1, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(200));
        Instant::now()
    });
    while started.load(Ordering::SeqCst) == 0 {
        std::thread::yield_now();
    }
    let none = Arc::new(AtomicUsize::new(0));
    vault.quiesce(counting(false, none.clone(), none));
    let quiesced_at = Instant::now();
    let unit_ended_at = unit.join().unwrap();
    assert!(quiesced_at >= unit_ended_at);
    assert_eq!(vault.gate.lock().unwrap().units, 0);
}

#[tokio::test]
async fn background_loops_wait_for_the_foreground() {
    let vault = Arc::new(vault());
    let none = Arc::new(AtomicUsize::new(0));
    vault.quiesce(counting(false, none.clone(), none));
    let waiting = vault.clone();
    let resumed = tokio::spawn(async move { waiting.foreground().await });
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(!resumed.is_finished());
    vault.resume();
    tokio::time::timeout(Duration::from_secs(1), resumed)
        .await
        .expect("foreground after resume")
        .unwrap();
    tokio::time::timeout(Duration::from_millis(50), vault.quiesced())
        .await
        .expect_err("not quiesced any more");
}
