// Windows: the driver the device thread plays through (user « Ok pour asio », 18 Nov. 2026) —
// WASAPI exclusive (wasapi_duplex.rs), or an ASIO driver installed on the PC (asio_duplex.rs,
// built with the crate's `asio` feature). One device thread, one engine rate: a change of driver
// closes the current one and opens the other on the same thread, then gives the live inputs back
// to it. A driver that cannot open refuses the change and the previous one plays on, the reason
// returned to whoever asked; nothing ever passes silently from ASIO to WASAPI.

use super::output_fill::OutputFill;
use super::output_idle;
use super::scheduled_backend::note_discontinuity;
use atome_mix_graph::shared::LiveInput;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

// A recorder's tap: an input period's interleaved samples and its host instant.
pub(crate) type Tap = Arc<dyn Fn(&[f32], i64) + Send + Sync>;
pub(crate) type SharedFill = Arc<Mutex<OutputFill>>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Driver {
    Wasapi,
    Asio(String),
}

static DRIVER: Mutex<Driver> = Mutex::new(Driver::Wasapi);
// Bumped by every change: the playing driver's loop ends when it moves.
static CHANGES: AtomicU64 = AtomicU64::new(0);
// The device thread is running (a change is opened by it, else at the next start).
static RUNNING: AtomicBool = AtomicBool::new(false);
// Whoever asked for the change, told when the new driver plays or why it cannot.
static WAITING: Mutex<Option<Sender<Result<(), String>>>> = Mutex::new(None);
// The live inputs by device, kept here so a change of driver hands them over.
static LISTENERS: Mutex<Option<HashMap<String, Vec<Arc<LiveInput>>>>> = Mutex::new(None);
static TAPS_OPEN: AtomicUsize = AtomicUsize::new(0);
static NEXT_TAP: AtomicU64 = AtomicU64::new(1);
// The last input that the new driver could not take back, said by `state`.
static HANDOVER_ERROR: Mutex<String> = Mutex::new(String::new());

pub(crate) fn current() -> Driver {
    DRIVER
        .lock()
        .map(|driver| driver.clone())
        .unwrap_or(Driver::Wasapi)
}

pub(crate) fn unchanged(generation: u64) -> bool {
    CHANGES.load(Ordering::Acquire) == generation
}

pub(crate) fn handover_error() -> String {
    HANDOVER_ERROR
        .lock()
        .map(|error| error.clone())
        .unwrap_or_default()
}

// The rate the engine renders at: the current driver's.
pub(crate) fn output_rate() -> Result<u32, String> {
    match current() {
        Driver::Wasapi => super::wasapi_duplex::output_rate(),
        Driver::Asio(name) => asio::output_rate(&name),
    }
}

pub(crate) fn input_format(device: Option<&str>) -> Result<(u32, u16), String> {
    match current() {
        Driver::Wasapi => super::wasapi_duplex::input_format(device),
        Driver::Asio(_) => asio::input_format(),
    }
}

// The live inputs (mixer strips) listening to `device` now; none closes it for them.
pub(crate) fn listen(device: &str, live: Vec<Arc<LiveInput>>) -> Result<(), String> {
    {
        let mut guard = LISTENERS
            .lock()
            .map_err(|error| format!("Lock error: {error}"))?;
        let listeners = guard.get_or_insert_with(HashMap::new);
        if live.is_empty() {
            listeners.remove(device);
        } else {
            listeners.insert(device.to_string(), live.clone());
        }
    }
    forward(device, live)
}

fn forward(device: &str, live: Vec<Arc<LiveInput>>) -> Result<(), String> {
    match current() {
        Driver::Wasapi => super::wasapi_duplex::listen(device, live),
        Driver::Asio(_) => asio::listen(device, live),
    }
}

// A take's tap on `device` (None: the default input); returns its id for `untap`.
pub(crate) fn tap(device: Option<&str>, tap: Tap) -> Result<u64, String> {
    let id = NEXT_TAP.fetch_add(1, Ordering::AcqRel);
    match current() {
        Driver::Wasapi => super::wasapi_duplex::tap(device, id, tap)?,
        Driver::Asio(_) => asio::tap(device, id, tap)?,
    }
    TAPS_OPEN.fetch_add(1, Ordering::AcqRel);
    Ok(id)
}

pub(crate) fn untap(device: Option<&str>, id: u64) -> Result<(), String> {
    let _ = TAPS_OPEN.fetch_update(Ordering::AcqRel, Ordering::Acquire, |open| {
        open.checked_sub(1)
    });
    match current() {
        Driver::Wasapi => super::wasapi_duplex::untap(device, id),
        Driver::Asio(_) => asio::untap(id),
    }
}

/// Plays through `driver` from now on. Refused while a take records (its format is the current
/// driver's); refused too, the previous driver kept, when the new one cannot open.
pub(crate) fn choose(driver: Driver) -> Result<(), String> {
    if let Driver::Asio(name) = &driver {
        asio::check(name)?;
    }
    let previous = current();
    if previous == driver {
        return Ok(());
    }
    if TAPS_OPEN.load(Ordering::Acquire) > 0 {
        return Err("audio_driver_take_recording".into());
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    set(driver, RUNNING.load(Ordering::Acquire).then_some(sender))?;
    if !RUNNING.load(Ordering::Acquire) {
        return Ok(());
    }
    let opened = receiver
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "audio_driver_open_timeout".to_string())
        .and_then(|result| result);
    if let Err(error) = opened {
        set(previous, None)?;
        return Err(error);
    }
    Ok(())
}

fn set(driver: Driver, waiting: Option<Sender<Result<(), String>>>) -> Result<(), String> {
    *WAITING
        .lock()
        .map_err(|error| format!("Lock error: {error}"))? = waiting;
    *DRIVER
        .lock()
        .map_err(|error| format!("Lock error: {error}"))? = driver;
    CHANGES.fetch_add(1, Ordering::AcqRel);
    // A resting output wakes to see the change.
    output_idle::note_activity();
    Ok(())
}

// The new driver's open told to whoever waits for it; the first one tells the engine's start.
fn report(ready: &mut Option<Sender<Result<(), String>>>, result: Result<(), String>) -> bool {
    if let Some(ready) = ready.take() {
        let failed = result.is_err();
        let _ = ready.send(result);
        return !failed;
    }
    if let Some(waiting) = WAITING.lock().ok().and_then(|mut waiting| waiting.take()) {
        let _ = waiting.send(result);
    }
    true
}

// Every live input given to the driver that just opened.
fn hand_over() {
    let listeners = LISTENERS
        .lock()
        .ok()
        .and_then(|listeners| listeners.clone())
        .unwrap_or_default();
    let failed = listeners
        .into_iter()
        .filter_map(|(device, live)| forward(&device, live).err())
        .collect::<Vec<_>>()
        .join("; ");
    if let Ok(mut error) = HANDOVER_ERROR.lock() {
        *error = failed;
    }
}

// Starts the device thread; Ok once its first stream plays.
pub(crate) fn start(
    fill: OutputFill,
    rate: u32,
    stop: Arc<AtomicBool>,
    wake: Receiver<()>,
) -> Result<(), String> {
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    crate::engine_thread::spawn(move || {
        let fill: SharedFill = Arc::new(Mutex::new(fill));
        let mut ready = Some(ready_tx);
        if let Err(error) = super::wasapi_duplex::prepare_thread() {
            report(&mut ready, Err(error));
            return;
        }
        RUNNING.store(true, Ordering::Release);
        while !stop.load(Ordering::Acquire) {
            let generation = CHANGES.load(Ordering::Acquire);
            let first = ready.is_some();
            let mut opened =
                |result: Result<(), String>| report(&mut ready, result.map(|()| hand_over()));
            let played = match current() {
                Driver::Wasapi => {
                    super::wasapi_duplex::run(&fill, &stop, &wake, generation, &mut opened)
                }
                Driver::Asio(name) => {
                    asio::run(&name, rate, &fill, &stop, &wake, generation, &mut opened)
                }
            };
            // The engine's first stream failing ends its start; a lost device or a refused
            // change (`choose` sets the previous driver back) is opened again.
            if played.is_err() {
                if first {
                    break;
                }
                if unchanged(generation) {
                    std::thread::sleep(Duration::from_millis(250));
                }
            }
            note_discontinuity();
        }
        RUNNING.store(false, Ordering::Release);
    });
    ready_rx
        .recv()
        .map_err(|_| "output_thread_failed".to_string())?
}

// The ASIO side, or its explicit absence when the build has no `asio` feature.
#[cfg(feature = "asio")]
use super::asio_duplex as asio;

#[cfg(not(feature = "asio"))]
mod asio {
    use super::{LiveInput, SharedFill, Tap};
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;
    use std::sync::mpsc::Receiver;

    const NOT_BUILT: &str = "asio_not_built";

    pub(crate) fn built() -> bool {
        false
    }
    pub(crate) fn drivers() -> Vec<String> {
        Vec::new()
    }
    pub(crate) fn check(_name: &str) -> Result<(), String> {
        Err(NOT_BUILT.into())
    }
    pub(crate) fn output_rate(_name: &str) -> Result<u32, String> {
        Err(NOT_BUILT.into())
    }
    pub(crate) fn input_format() -> Result<(u32, u16), String> {
        Err(NOT_BUILT.into())
    }
    pub(crate) fn listen(_device: &str, _live: Vec<Arc<LiveInput>>) -> Result<(), String> {
        Err(NOT_BUILT.into())
    }
    pub(crate) fn tap(_device: Option<&str>, _id: u64, _tap: Tap) -> Result<(), String> {
        Err(NOT_BUILT.into())
    }
    pub(crate) fn untap(_id: u64) -> Result<(), String> {
        Err(NOT_BUILT.into())
    }
    pub(crate) fn input_devices() -> Vec<(String, u16)> {
        Vec::new()
    }
    pub(crate) fn run(
        _name: &str,
        _rate: u32,
        _fill: &SharedFill,
        _stop: &AtomicBool,
        _wake: &Receiver<()>,
        _generation: u64,
        opened: &mut dyn FnMut(Result<(), String>) -> bool,
    ) -> Result<(), ()> {
        opened(Err(NOT_BUILT.into()));
        Err(())
    }
}

pub(crate) use asio::{
    built as asio_built, drivers as asio_drivers, input_devices as asio_input_devices,
};
