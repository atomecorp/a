// MIDI messages sent at their instant (R-379): a clock tick, a Start or a note given ahead of time, as Web MIDI's
// timestamped `send` does. One thread holds them in time order and sends each when it falls due; the sender
// (native_midi.rs#send_scheduled) finds the port's connection at that moment.
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::native_midi;

struct Due {
    at: Instant,
    order: u64,
    port_id: String,
    bytes: Vec<u8>,
}

// The earliest first; two at the same instant in the order they were given.
impl Ord for Due {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .at
            .cmp(&self.at)
            .then_with(|| other.order.cmp(&self.order))
    }
}
impl PartialOrd for Due {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
impl PartialEq for Due {
    fn eq(&self, other: &Self) -> bool {
        self.at == other.at && self.order == other.order
    }
}
impl Eq for Due {}

// None when the thread could not start.
static QUEUE: OnceLock<Mutex<Option<Sender<Due>>>> = OnceLock::new();

fn run(receiver: &Receiver<Due>) {
    let mut pending = BinaryHeap::new();
    loop {
        let wait = pending
            .peek()
            .map(|due: &Due| due.at.saturating_duration_since(Instant::now()));
        let received = match wait {
            Some(wait) => receiver.recv_timeout(wait),
            None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
        };
        match received {
            Ok(due) => pending.push(due),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let now = Instant::now();
        while pending.peek().is_some_and(|due| due.at <= now) {
            if let Some(due) = pending.pop() {
                // A port gone before its message fell due: the message goes nowhere, as a send to it now would.
                let _ = native_midi::send_scheduled(&due.port_id, &due.bytes);
            }
        }
    }
}

// `bytes` leaves for `port_id` after `delay`.
pub fn send_at(delay: Duration, port_id: String, bytes: Vec<u8>) -> Result<(), String> {
    static ORDER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let queue = QUEUE.get_or_init(|| {
        let (sender, receiver) = mpsc::channel();
        let started = std::thread::Builder::new()
            .name("atome-midi-schedule".to_string())
            .spawn(move || run(&receiver))
            .is_ok();
        Mutex::new(started.then_some(sender))
    });
    let due = Due {
        at: Instant::now() + delay,
        order: ORDER.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
        port_id,
        bytes,
    };
    queue
        .lock()
        .map_err(|_| "native_midi_schedule_poisoned".to_string())?
        .as_ref()
        .ok_or_else(|| "native_midi_schedule_unavailable".to_string())?
        .send(due)
        .map_err(|_| "native_midi_schedule_stopped".to_string())
}
