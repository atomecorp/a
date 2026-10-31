use super::*;
use std::time::Duration;
use std::sync::atomic::AtomicUsize;

static TEST_LOCK: Mutex<()> = Mutex::new(());

struct TrackedResource(Arc<AtomicUsize>, std::thread::ThreadId);
impl Drop for TrackedResource {
    fn drop(&mut self) {
        assert_eq!(self.1, std::thread::current().id(), "device disposal must stay on its creating thread");
        self.0.fetch_add(1, Ordering::SeqCst);
    }
}

#[test]
fn foreground_transition_does_not_wait_for_device_initialization() {
    let _serial = TEST_LOCK.lock().unwrap();
    set_foreground(true).unwrap();
    stop().unwrap();
    let (entered, opening) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let initializing = std::thread::spawn(move || start_with(16000, move |_| {
        entered.send(()).unwrap();
        released.recv().unwrap();
        Ok(())
    }));
    opening.recv_timeout(Duration::from_secs(3)).unwrap();
    let (done, completion) = mpsc::channel();
    let background = std::thread::spawn(move || {
        let result = set_foreground(false);
        done.send(result).unwrap();
    });
    let responsive = completion.recv_timeout(Duration::from_secs(1)).is_ok();
    // Release the simulated driver before asserting so the red test cannot
    // leave a blocked worker or poison shared capture state.
    release.send(()).unwrap();
    let _ = initializing.join().unwrap();
    background.join().unwrap();
    stop().unwrap();
    set_foreground(true).unwrap();
    assert!(responsive, "a delayed microphone driver must not freeze the native foreground event");
}

#[test]
fn repeated_start_stop_releases_every_owned_resource() {
    let _serial = TEST_LOCK.lock().unwrap();
    set_foreground(true).unwrap();
    stop().unwrap();
    let released = Arc::new(AtomicUsize::new(0));
    for cycle in 1..=100 {
        let count = released.clone();
        assert_eq!(start_with(16000, move |_| Ok(TrackedResource(count, std::thread::current().id()))).unwrap()["active"], true);
        assert_eq!(stop().unwrap()["active"], false);
        assert!(CAPTURE.lock().unwrap().is_none());
        assert_eq!(released.load(Ordering::SeqCst), cycle);
    }
}

#[test]
fn slow_disposal_keeps_its_reservation_without_blocking_foreground() {
    let _serial = TEST_LOCK.lock().unwrap();
    set_foreground(true).unwrap();
    stop().unwrap();
    struct SlowDrop(mpsc::Sender<()>, mpsc::Receiver<()>);
    impl Drop for SlowDrop {
        fn drop(&mut self) { self.0.send(()).unwrap(); self.1.recv().unwrap(); }
    }
    let (dropping, disposing) = mpsc::channel();
    let (release, released) = mpsc::channel();
    start_with(16000, move |_| Ok(SlowDrop(dropping, released))).unwrap();
    let stopping = std::thread::spawn(stop);
    disposing.recv_timeout(Duration::from_secs(3)).unwrap();
    let (done, completion) = mpsc::channel();
    let foreground = std::thread::spawn(move || done.send(set_foreground(false)).unwrap());
    let responsive = completion.recv_timeout(Duration::from_secs(1)).is_ok();
    let read = read();
    set_foreground(true).unwrap();
    let competing = start_with(16000, |_| Ok(()));
    release.send(()).unwrap();
    stopping.join().unwrap().unwrap();
    foreground.join().unwrap();
    assert!(responsive, "foreground events must not join a device destructor");
    assert_eq!(read.unwrap()["active"], false);
    assert_eq!(competing.unwrap_err(), "wake_capture_busy");
    assert!(CAPTURE.lock().unwrap().is_none());
}

#[test]
fn failed_acquisition_releases_the_reservation_for_a_later_start() {
    let _serial = TEST_LOCK.lock().unwrap();
    set_foreground(true).unwrap();
    stop().unwrap();
    assert_eq!(start_with::<()>(16000, |_| Err("microphone_unavailable".into())).unwrap_err(), "microphone_unavailable");
    assert!(CAPTURE.lock().unwrap().is_none());
    start_with(16000, |_| Ok(())).unwrap();
    stop().unwrap();
}
