use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use once_cell::sync::OnceCell;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

const MIDI_RUNTIME: &str = "midir";

#[derive(Clone, Serialize)]
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
struct NativeMidiEvent {
    data: Vec<u8>,
    timestamp: u64,
    port_id: String,
    port_name: String,
}

struct NativeMidiState {
    input_connections: Vec<MidiInputConnection<()>>,
    output_connection: Option<MidiOutputConnection>,
    output_id: String,
    inputs: Vec<NativeMidiPort>,
    outputs: Vec<NativeMidiPort>,
}

impl NativeMidiState {
    fn empty() -> Self {
        Self {
            input_connections: Vec::new(),
            output_connection: None,
            output_id: String::new(),
            inputs: Vec::new(),
            outputs: Vec::new(),
        }
    }
}

static MIDI_STATE: OnceCell<Mutex<NativeMidiState>> = OnceCell::new();

fn state() -> &'static Mutex<NativeMidiState> {
    MIDI_STATE.get_or_init(|| Mutex::new(NativeMidiState::empty()))
}

fn read_input_ports() -> Result<Vec<NativeMidiPort>, String> {
    let input = MidiInput::new("Atome Desktop MIDI input list")
        .map_err(|error| format!("native_midi_input_init_failed:{error}"))?;
    input
        .ports()
        .into_iter()
        .map(|port| {
            let id = port.id();
            let name = input
                .port_name(&port)
                .map_err(|error| format!("native_midi_input_name_failed:{error}"))?;
            Ok(NativeMidiPort { id, name, runtime: MIDI_RUNTIME })
        })
        .collect()
}

fn read_output_ports() -> Result<Vec<NativeMidiPort>, String> {
    let output = MidiOutput::new("Atome Desktop MIDI output list")
        .map_err(|error| format!("native_midi_output_init_failed:{error}"))?;
    output
        .ports()
        .into_iter()
        .map(|port| {
            let id = port.id();
            let name = output
                .port_name(&port)
                .map_err(|error| format!("native_midi_output_name_failed:{error}"))?;
            Ok(NativeMidiPort { id, name, runtime: MIDI_RUNTIME })
        })
        .collect()
}

fn connect_inputs(app: &AppHandle, ports: &[NativeMidiPort]) -> Result<Vec<MidiInputConnection<()>>, String> {
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

#[tauri::command]
pub fn start_native_midi(app: AppHandle) -> Result<NativeMidiStatus, String> {
    let inputs = read_input_ports()?;
    let outputs = read_output_ports()?;
    let connections = connect_inputs(&app, &inputs)?;
    let mut locked = state()
        .lock()
        .map_err(|_| "native_midi_state_poisoned".to_string())?;
    locked.input_connections = connections;
    locked.output_connection = None;
    locked.output_id.clear();
    locked.inputs = inputs.clone();
    locked.outputs = outputs.clone();
    Ok(NativeMidiStatus {
        ok: true,
        source_count: inputs.len(),
        destination_count: outputs.len(),
        inputs,
        outputs,
        runtime: MIDI_RUNTIME,
    })
}

#[tauri::command]
pub fn send_native_midi(bytes: Vec<u8>, output_id: Option<String>) -> Result<NativeMidiSendStatus, String> {
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
    if locked.output_connection.is_none() || locked.output_id != resolved_id {
        let output = MidiOutput::new("Atome Desktop MIDI output")
            .map_err(|error| format!("native_midi_output_init_failed:{error}"))?;
        let port = output
            .find_port_by_id(&resolved_id)
            .ok_or_else(|| "native_midi_destination_missing".to_string())?;
        let connection = output
            .connect(&port, "Atome Desktop MIDI output connection")
            .map_err(|error| format!("native_midi_output_connect_failed:{error}"))?;
        locked.output_connection = Some(connection);
        locked.output_id = resolved_id.clone();
    }
    locked
        .output_connection
        .as_mut()
        .ok_or_else(|| "native_midi_output_unavailable".to_string())?
        .send(&bytes)
        .map_err(|error| format!("native_midi_send_failed:{error}"))?;
    Ok(NativeMidiSendStatus {
        ok: true,
        destination_count: locked.outputs.len(),
        output_id: resolved_id,
        runtime: MIDI_RUNTIME,
    })
}
