// The engine's own threads (render, device, input streams, WAV writer). The
// hosts call the engine from high-QoS queues (iOS `.userInitiated`) and wait on
// these threads (stream readiness, shared locks): on Apple platforms a plain
// `std::thread` runs at Default QoS, a priority inversion, and too low for audio.

/// Spawns an engine thread at the audio QoS (user-interactive on Apple platforms).
pub(crate) fn spawn<F, T>(body: F) -> std::thread::JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    std::thread::spawn(move || {
        raise_qos();
        body()
    })
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn raise_qos() {
    // <sys/qos.h>: QOS_CLASS_USER_INTERACTIVE; libSystem is always linked.
    const QOS_CLASS_USER_INTERACTIVE: u32 = 0x21;
    extern "C" {
        fn pthread_set_qos_class_self_np(qos_class: u32, relative_priority: i32) -> i32;
    }
    // SAFETY: only changes the calling thread's own scheduling class.
    unsafe { pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0) };
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
fn raise_qos() {}
