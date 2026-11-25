use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use once_cell::sync::OnceCell;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::native_midi_schedule;

const MIDI_RUNTIME: &str = "midir";
// midir tells no device plugged or unplugged: the watcher lists the ports this often (R-286, user 24 Nov. 2026: a MIDI
// device connected while the app runs must join the list).
const PORTS_WATCH_INTERVAL: Duration = Duration::from_secs(1);
const PORTS_EVENT: &str = "eve:midi-native-ports";
static PORTS_WATCHED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, PartialEq, Serialize)]
pub struct NativeMidiPort {
    id: String,
    name: String,
    runtime: &'static str,
}

#[derive(Serialize)]
pub struct NativeMidiStatus {
    ok: bool,
    source_count: usize,
    destination_count: usize,
    inputs: Vec<NativeMidiPort>,
    outputs: Vec<NativeMidiPort>,
    runtime: &'static str,
}

#[derive(Serialize)]
pub struct NativeMidiSendStatus {
    ok: bool,
    destination_count: usize,
    output_id: String,
    runtime: &'static str,
}

#[derive(Clone, Serialize)]
struct NativeMidiPortsEvent {
    inputs: Vec<NativeMidiPort>,
    outputs: Vec<NativeMidiPort>,
}

#[derive(Clone, Serialize)]
struct NativeMidiEvent {
    data: Vec<u8>,
    timestamp: u64,
    port_id: String,
    port_name: String,
}

// One open connection per output port: a take recorded from several devices,
// or played on every output, fans out without reconnecting per message.
struct NativeMidiState {
    input_connections: Vec<MidiInputConnection<()>>,
    output_connections: HashMap<String, MidiOutputConnection>,
    inputs: Vec<NativeMidiPort>,
    outputs: Vec<NativeMidiPort>,
}

impl NativeMidiState {
    fn empty() -> Self {
        Self {
            input_connections: Vec::new(),
            output_connections: HashMap::new(),
            inputs: Vec::new(),
            outputs: Vec::new(),
        }
    }
}

static MIDI_STATE: OnceCell<Mutex<NativeMidiState>> = OnceCell::new();

fn state() -> &'static Mutex<NativeMidiState> {
    MIDI_STATE.get_or_init(|| Mutex::new(NativeMidiState::empty()))
}

fn input_lister() -> Result<MidiInput, String> {
    MidiInput::new("Atome Desktop MIDI input list")
        .map_err(|error| format!("native_midi_input_init_failed:{error}"))
}

fn output_lister() -> Result<MidiOutput, String> {
    MidiOutput::new("Atome Desktop MIDI output list")
        .map_err(|error| format!("native_midi_output_init_failed:{error}"))
}

fn read_input_ports(input: &MidiInput) -> Result<Vec<NativeMidiPort>, String> {
    input
        .ports()
        .into_iter()
        .map(|port| {
            let id = port.id();
            let name = input
                .port_name(&port)
                .map_err(|error| format!("native_midi_input_name_failed:{error}"))?;
            Ok(NativeMidiPort {
                id,
                name,
                runtime: MIDI_RUNTIME,
            })
        })
        .collect()
}

fn read_output_ports(output: &MidiOutput) -> Result<Vec<NativeMidiPort>, String> {
    output
        .ports()
        .into_iter()
        .map(|port| {
            let id = port.id();
            let name = output
                .port_name(&port)
                .map_err(|error| format!("native_midi_output_name_failed:{error}"))?;
            Ok(NativeMidiPort {
                id,
                name,
                runtime: MIDI_RUNTIME,
            })
        })
        .collect()
}

fn connect_inputs(
    app: &AppHandle,
    ports: &[NativeMidiPort],
) -> Result<Vec<MidiInputConnection<()>>, String> {
    ports
        .iter()
        .map(|descriptor| {
            let mut input = MidiInput::new("Atome Desktop MIDI input")
                .map_err(|error| format!("native_midi_input_init_failed:{error}"))?;
            input.ignore(Ignore::None);
            let port = input
                .find_port_by_id(&descriptor.id)
                .ok_or_else(|| format!("native_midi_input_missing:{}", descriptor.id))?;
            let app_handle = app.clone();
            let port_id = descriptor.id.clone();
            let port_name = descriptor.name.clone();
            input
                .connect(
                    &port,
                    "Atome Desktop MIDI input connection",
                    move |timestamp, bytes, _| {
                        let payload = NativeMidiEvent {
                            data: bytes.to_vec(),
                            timestamp,
                            port_id: port_id.clone(),
                            port_name: port_name.clone(),
                        };
                        let _ = app_handle.emit("eve:midi-native", payload);
                    },
                    (),
                )
                .map_err(|error| format!("native_midi_input_connect_failed:{error}"))
        })
        .collect()
}

// The ports listed now take the state's place: the inputs connected again, an output's connection kept while its port
// remains.
fn apply_ports(
    app: &AppHandle,
    inputs: &[NativeMidiPort],
    outputs: &[NativeMidiPort],
) -> Result<(), String> {
    let connections = connect_inputs(app, inputs)?;
    let mut locked = state()
        .lock()
        .map_err(|_| "native_midi_state_poisoned".to_string())?;
    locked.input_connections = connections;
    locked
        .output_connections
        .retain(|id, _| outputs.iter().any(|port| &port.id == id));
    locked.inputs = inputs.to_vec();
    locked.outputs = outputs.to_vec();
    Ok(())
}

/// The ports listed when they differ from `known` (inputs, outputs).
fn changed_ports(
    input: &MidiInput,
    output: &MidiOutput,
    known: (&[NativeMidiPort], &[NativeMidiPort]),
) -> Result<Option<(Vec<NativeMidiPort>, Vec<NativeMidiPort>)>, String> {
    let inputs = read_input_ports(input)?;
    let outputs = read_output_ports(output)?;
    Ok((inputs != known.0 || outputs != known.1).then_some((inputs, outputs)))
}

// One watcher for the process: each change of the ports connects them and hands the page their list.
fn watch_ports(app: AppHandle) {
    if PORTS_WATCHED.swap(true, Ordering::SeqCst) {
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("atome-midi-ports".to_string())
        .spawn(move || {
            let listers = input_lister().and_then(|input| Ok((input, output_lister()?)));
            let (input, output) = match listers {
                Ok(listers) => listers,
                Err(error) => {
                    eprintln!("[native_midi] ports watcher not started: {error}");
                    return;
                }
            };
            loop {
                std::thread::sleep(PORTS_WATCH_INTERVAL);
                let known = match state().lock() {
                    Ok(locked) => (locked.inputs.clone(), locked.outputs.clone()),
                    Err(_) => {
                        eprintln!("[native_midi] state poisoned: ports watcher stopped");
                        return;
                    }
                };
                let changed =
                    changed_ports(&input, &output, (&known.0, &known.1)).and_then(|changed| {
                        match changed {
                            Some((inputs, outputs)) => {
                                apply_ports(&app, &inputs, &outputs)?;
                                Ok(Some(NativeMidiPortsEvent { inputs, outputs }))
                            }
                            None => Ok(None),
                        }
                    });
                match changed {
                    Ok(Some(event)) => {
                        if let Err(error) = app.emit(PORTS_EVENT, event) {
                            eprintln!("[native_midi] ports not published: {error}");
                        }
                    }
                    Ok(None) => {}
                    Err(error) => eprintln!("[native_midi] ports not read: {error}"),
                }
            }
        });
    if let Err(error) = spawned {
        PORTS_WATCHED.store(false, Ordering::SeqCst);
        eprintln!("[native_midi] ports watcher not spawned: {error}");
    }
}

#[tauri::command]
pub fn start_native_midi(app: AppHandle) -> Result<NativeMidiStatus, String> {
    let inputs = read_input_ports(&input_lister()?)?;
    let outputs = read_output_ports(&output_lister()?)?;
    apply_ports(&app, &inputs, &outputs)?;
    watch_ports(app);
    Ok(NativeMidiStatus {
        ok: true,
        source_count: inputs.len(),
        destination_count: outputs.len(),
        inputs,
        outputs,
        runtime: MIDI_RUNTIME,
    })
}

// The longest a message waits for its instant (`delay_ms`): a clock tick or a note scheduled a little ahead.
const MAX_DELAY_MS: f64 = 2000.0;

// `delay_ms`: the message leaves at that instant from now (native_midi_schedule.rs), as Web MIDI's timestamp does; none,
// 0 or less, it leaves now.
#[tauri::command]
pub fn send_native_midi(
    bytes: Vec<u8>,
    output_id: Option<String>,
    delay_ms: Option<f64>,
) -> Result<NativeMidiSendStatus, String> {
    if bytes.is_empty() || bytes.len() > 1024 {
        return Err("native_midi_bytes_invalid".to_string());
    }
    let mut locked = state()
        .lock()
        .map_err(|_| "native_midi_state_poisoned".to_string())?;
    if locked.outputs.is_empty() {
        return Err("native_midi_destination_missing".to_string());
    }
    let requested_id = output_id.unwrap_or_default();
    let resolved_id = if requested_id.is_empty() {
        locked.outputs[0].id.clone()
    } else if locked.outputs.iter().any(|port| port.id == requested_id) {
        requested_id
    } else {
        return Err("native_midi_destination_missing".to_string());
    };
    let destination_count = locked.outputs.len();
    let delay = delay_ms.filter(|delay| delay.is_finite() && *delay > 0.0);
    match delay {
        Some(delay) => {
            drop(locked);
            native_midi_schedule::send_at(
                Duration::from_secs_f64(delay.min(MAX_DELAY_MS) / 1000.0),
                resolved_id.clone(),
                bytes,
            )?;
        }
        None => send_now(&mut locked, &resolved_id, &bytes)?,
    }
    Ok(NativeMidiSendStatus {
        ok: true,
        destination_count,
        output_id: resolved_id,
        runtime: MIDI_RUNTIME,
    })
}

// The port's connection, opened once, sends `bytes` now.
fn send_now(locked: &mut NativeMidiState, port_id: &str, bytes: &[u8]) -> Result<(), String> {
    if !locked.output_connections.contains_key(port_id) {
        let output = MidiOutput::new("Atome Desktop MIDI output")
            .map_err(|error| format!("native_midi_output_init_failed:{error}"))?;
        let port = output
            .find_port_by_id(port_id)
            .ok_or_else(|| "native_midi_destination_missing".to_string())?;
        let connection = output
            .connect(&port, "Atome Desktop MIDI output connection")
            .map_err(|error| format!("native_midi_output_connect_failed:{error}"))?;
        locked
            .output_connections
            .insert(port_id.to_string(), connection);
    }
    locked
        .output_connections
        .get_mut(port_id)
        .ok_or_else(|| "native_midi_output_unavailable".to_string())?
        .send(bytes)
        .map_err(|error| format!("native_midi_send_failed:{error}"))
}

// A scheduled message, at its instant (native_midi_schedule.rs): the port may have gone meanwhile.
pub(crate) fn send_scheduled(port_id: &str, bytes: &[u8]) -> Result<(), String> {
    let mut locked = state()
        .lock()
        .map_err(|_| "native_midi_state_poisoned".to_string())?;
    if !locked.outputs.iter().any(|port| port.id == port_id) {
        return Err("native_midi_destination_missing".to_string());
    }
    send_now(&mut locked, port_id, bytes)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use midir::os::unix::VirtualOutput;

    // A source appearing while the listers live (a virtual one, as a device plugged in) changes the ports listed.
    #[test]
    fn a_source_plugged_in_changes_the_ports_listed() {
        let input = input_lister().expect("input lister");
        let output = output_lister().expect("output lister");
        let inputs = read_input_ports(&input).expect("inputs");
        let outputs = read_output_ports(&output).expect("outputs");
        assert!(
            changed_ports(&input, &output, (&inputs, &outputs))
                .expect("listed")
                .is_none()
        );
        let plugged = MidiOutput::new("Atome hot-plug test")
            .expect("output client")
            .create_virtual("Atome hot-plug source")
            .expect("virtual source");
        let changed = (0..30).find_map(|_| {
            std::thread::sleep(Duration::from_millis(100));
            changed_ports(&input, &output, (&inputs, &outputs)).expect("listed")
        });
        let (listed, _) = changed.expect("the source plugged in was not listed");
        assert!(
            listed
                .iter()
                .any(|port| port.name.contains("Atome hot-plug source"))
        );
        drop(plugged);
    }
}
