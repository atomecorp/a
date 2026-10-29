// WASAPI exclusive endpoints (todo/effets_generateurs_audio D23-1, plan "jeu en direct" step 2): on
// Windows the engine takes the interface for itself, at its smallest period, event driven, at the
// interface's own rate (blocking the card for other apps is accepted, D23-1). This file opens one
// endpoint — the default output, an input by its name — in its exclusive format; wasapi_duplex.rs
// runs the output and the inputs on one thread. A device that refuses the exclusive mode is an
// explicit error, never a shared stream in its place.

use windows::core::{w, HRESULT};
use windows::Win32::Devices::Properties::DEVPKEY_Device_FriendlyName;
use windows::Win32::Foundation::{CloseHandle, HANDLE, RPC_E_CHANGED_MODE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, EDataFlow, IAudioCaptureClient, IAudioClient, IAudioRenderClient, IMMDevice,
    IMMDeviceEnumerator, MMDeviceEnumerator, AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED, AUDCLNT_SHAREMODE_EXCLUSIVE,
    AUDCLNT_STREAMFLAGS_EVENTCALLBACK, DEVICE_STATE_ACTIVE, WAVEFORMATEX, WAVEFORMATEXTENSIBLE, WAVEFORMATEXTENSIBLE_0,
};
use windows::Win32::Media::KernelStreaming::{KSAUDIO_SPEAKER_DIRECTOUT, KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE};
use windows::Win32::Media::Multimedia::KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};
use windows::Win32::System::Threading::{AvSetMmThreadCharacteristicsW, CreateEventW, WaitForSingleObject};

// The sample layouts an interface may take in exclusive mode, the richest first:
// (container bits, valid bits, float).
const LAYOUTS: [(u16, u16, bool); 5] = [(32, 32, true), (32, 32, false), (32, 24, false), (24, 24, false), (16, 16, false)];

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ExclusiveFormat {
    pub rate: u32,
    pub channels: u16,
    container: u16,
    valid: u16,
    float: bool,
}

impl ExclusiveFormat {
    fn bytes(&self) -> usize {
        usize::from(self.container / 8)
    }

    fn wave(&self) -> WAVEFORMATEXTENSIBLE {
        let block = self.channels * (self.container / 8);
        WAVEFORMATEXTENSIBLE {
            Format: WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_EXTENSIBLE as u16,
                nChannels: self.channels,
                nSamplesPerSec: self.rate,
                nAvgBytesPerSec: self.rate * u32::from(block),
                nBlockAlign: block,
                wBitsPerSample: self.container,
                cbSize: (std::mem::size_of::<WAVEFORMATEXTENSIBLE>() - std::mem::size_of::<WAVEFORMATEX>()) as u16,
            },
            Samples: WAVEFORMATEXTENSIBLE_0 { wValidBitsPerSample: self.valid },
            dwChannelMask: KSAUDIO_SPEAKER_DIRECTOUT,
            SubFormat: if self.float { KSDATAFORMAT_SUBTYPE_IEEE_FLOAT } else { KSDATAFORMAT_SUBTYPE_PCM },
        }
    }

    // Sample `index` of an interleaved device buffer, as f32.
    pub unsafe fn read(&self, data: *const u8, index: usize) -> f32 {
        let at = data.add(index * self.bytes());
        match (self.container, self.float) {
            (32, true) => (at as *const f32).read_unaligned(),
            (32, false) => (at as *const i32).read_unaligned() as f32 / 2_147_483_648.0,
            (24, _) => ((i32::from(*at) | i32::from(*at.add(1)) << 8 | i32::from(*at.add(2)) << 16) << 8 >> 8) as f32 / 8_388_608.0,
            _ => (at as *const i16).read_unaligned() as f32 / 32_768.0,
        }
    }

    pub unsafe fn write(&self, data: *mut u8, index: usize, value: f32) {
        let at = data.add(index * self.bytes());
        let value = value.clamp(-1.0, 1.0);
        match (self.container, self.float) {
            (32, true) => (at as *mut f32).write_unaligned(value),
            (32, false) => (at as *mut i32).write_unaligned((f64::from(value) * 2_147_483_647.0) as i32),
            (24, _) => {
                let sample = (value * 8_388_607.0) as i32;
                *at = sample as u8;
                *at.add(1) = (sample >> 8) as u8;
                *at.add(2) = (sample >> 16) as u8;
            }
            _ => (at as *mut i16).write_unaligned((value * 32_767.0) as i16),
        }
    }
}

// COM on the calling thread (each endpoint thread calls it once).
pub(crate) fn com() -> Result<(), String> {
    let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if result.is_ok() || result == RPC_E_CHANGED_MODE { Ok(()) } else { Err(format!("wasapi_com_init: {result:?}")) }
}

fn enumerator() -> Result<IMMDeviceEnumerator, String> {
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }.map_err(|error| format!("wasapi_enumerator: {error}"))
}

// The endpoint's name, the one cpal lists (the Input tool chooses inputs by it).
pub(crate) fn friendly_name(device: &IMMDevice) -> Result<String, String> {
    unsafe {
        let store = device.OpenPropertyStore(STGM_READ).map_err(|error| format!("wasapi_property_store: {error}"))?;
        let value = store.GetValue(&DEVPKEY_Device_FriendlyName as *const _ as *const _).map_err(|error| format!("wasapi_device_name: {error}"))?;
        Ok(value.to_string())
    }
}

pub(crate) fn default_output() -> Result<IMMDevice, String> {
    unsafe { enumerator()?.GetDefaultAudioEndpoint(eRender, eConsole) }.map_err(|error| format!("wasapi_no_default_output: {error}"))
}

// An input by its name, else the default one; a chosen input that is gone is an error.
pub(crate) fn input(name: Option<&str>) -> Result<IMMDevice, String> {
    let enumerator = enumerator()?;
    let Some(wanted) = name.map(str::trim).filter(|value| !value.is_empty()) else {
        return unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, eConsole) }.map_err(|error| format!("wasapi_no_default_input: {error}"));
    };
    let devices = unsafe { enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE) }.map_err(|error| format!("wasapi_inputs: {error}"))?;
    for index in 0..unsafe { devices.GetCount() }.map_err(|error| format!("wasapi_inputs: {error}"))? {
        let device = unsafe { devices.Item(index) }.map_err(|error| format!("wasapi_inputs: {error}"))?;
        if friendly_name(&device)? == wanted {
            return Ok(device);
        }
    }
    Err(format!("audio_input_device_not_found: {wanted}"))
}

fn activate(device: &IMMDevice) -> Result<IAudioClient, String> {
    unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }.map_err(|error| format!("wasapi_activate: {error}"))
}

// The device's channels and rate in shared mode: the exclusive format keeps its channels.
fn mix_channels_and_rate(client: &IAudioClient) -> Result<(u16, u32), String> {
    unsafe {
        let mix = client.GetMixFormat().map_err(|error| format!("wasapi_mix_format: {error}"))?;
        let found = ((*mix).nChannels, (*mix).nSamplesPerSec);
        CoTaskMemFree(Some(mix as *const _));
        Ok(found)
    }
}

// The exclusive format at `rate` (the output's, so an input plays without resampling) when the
// interface takes it, else at its own rate.
pub(crate) fn exclusive_format(device: &IMMDevice, rate: Option<u32>) -> Result<ExclusiveFormat, String> {
    let client = activate(device)?;
    let (channels, own_rate) = mix_channels_and_rate(&client)?;
    let rates = rate.into_iter().chain(std::iter::once(own_rate));
    for rate in rates {
        for (container, valid, float) in LAYOUTS {
            let format = ExclusiveFormat { rate, channels, container, valid, float };
            let wave = format.wave();
            if unsafe { client.IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, &wave.Format, None) } == HRESULT(0) {
                return Ok(format);
            }
        }
    }
    Err(format!("wasapi_exclusive_refused: {} (Windows sound settings: allow applications to take exclusive control)", friendly_name(device)?))
}

pub(crate) enum Endpoint {
    Render(IAudioRenderClient),
    Capture(IAudioCaptureClient),
}

// One exclusive, event-driven stream: its client, its period's frames and the event it signals.
pub(crate) struct Exclusive {
    pub client: IAudioClient,
    pub endpoint: Endpoint,
    pub format: ExclusiveFormat,
    pub frames: u32,
    pub event: HANDLE,
}

impl Exclusive {
    pub(crate) fn open(device: &IMMDevice, format: ExclusiveFormat, flow: EDataFlow) -> Result<Self, String> {
        let wave = format.wave();
        let mut client = activate(device)?;
        let mut minimum = 0i64;
        unsafe { client.GetDevicePeriod(None, Some(&mut minimum)) }.map_err(|error| format!("wasapi_device_period: {error}"))?;
        let mut period = minimum;
        let mut initialized = unsafe { client.Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, period, period, &wave.Format, None) };
        // The interface wants a period aligned on its own buffer: the aligned one, on a new client.
        if initialized.as_ref().err().map(|error| error.code()) == Some(AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED) {
            let aligned = unsafe { client.GetBufferSize() }.map_err(|error| format!("wasapi_buffer_size: {error}"))?;
            period = (10_000_000.0 * f64::from(aligned) / f64::from(format.rate) + 0.5) as i64;
            client = activate(device)?;
            initialized = unsafe { client.Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, period, period, &wave.Format, None) };
        }
        initialized.map_err(|error| format!("wasapi_exclusive_initialize: {error}"))?;
        let frames = unsafe { client.GetBufferSize() }.map_err(|error| format!("wasapi_buffer_size: {error}"))?;
        let event = unsafe { CreateEventW(None, false, false, None) }.map_err(|error| format!("wasapi_event: {error}"))?;
        unsafe { client.SetEventHandle(event) }.map_err(|error| format!("wasapi_event_handle: {error}"))?;
        let endpoint = if flow == eRender {
            Endpoint::Render(unsafe { client.GetService::<IAudioRenderClient>() }.map_err(|error| format!("wasapi_render_client: {error}"))?)
        } else {
            Endpoint::Capture(unsafe { client.GetService::<IAudioCaptureClient>() }.map_err(|error| format!("wasapi_capture_client: {error}"))?)
        };
        Ok(Self { client, endpoint, format, frames, event })
    }

    pub(crate) fn start(&self) -> Result<(), String> {
        unsafe { self.client.Start() }.map_err(|error| format!("wasapi_start: {error}"))
    }

    pub(crate) fn stop(&self) {
        unsafe {
            let _ = self.client.Stop();
            let _ = self.client.Reset();
        }
    }

    // Waits for the period's event; false when it did not come in time.
    pub(crate) fn wait(&self, millis: u32) -> bool {
        let signalled = unsafe { WaitForSingleObject(self.event, millis) };
        signalled == WAIT_OBJECT_0
    }
}

impl Drop for Exclusive {
    fn drop(&mut self) {
        self.stop();
        unsafe {
            let _ = CloseHandle(self.event);
        }
    }
}

// The audio thread runs in the "Pro Audio" class of the multimedia scheduler (plan step 5).
pub(crate) fn pro_audio_thread() {
    let mut index = 0u32;
    let _ = unsafe { AvSetMmThreadCharacteristicsW(w!("Pro Audio"), &mut index) };
}

#[cfg(test)]
mod tests {
    use super::{ExclusiveFormat, LAYOUTS};

    #[test]
    fn every_exclusive_layout_carries_a_sample_through() {
        for (container, valid, float) in LAYOUTS {
            let format = ExclusiveFormat { rate: 48_000, channels: 2, container, valid, float };
            let mut buffer = vec![0u8; 4 * format.bytes()];
            let values = [0.5f32, -0.25, 0.999, -1.0];
            for (index, value) in values.iter().enumerate() {
                unsafe { format.write(buffer.as_mut_ptr(), index, *value) };
            }
            for (index, value) in values.iter().enumerate() {
                let read = unsafe { format.read(buffer.as_ptr(), index) };
                assert!((read - value).abs() < 1.0e-3, "{container}/{valid}/{float}: {value} → {read}");
            }
        }
    }
}
