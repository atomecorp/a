// The page's offline audio kernels (atome-audio-kernels), reached from JS: planar
// channels come as an Array of Float32Array (or Int32Array), results go back as
// typed arrays or plain objects, a refusal as an Error carrying its `code`.
use atome_audio_kernels::{KernelError, analysis, flac, onsets, peaks, render, takes, tones, wav};
use js_sys::{Array, Float32Array, Int32Array, Object, Reflect, Uint8Array};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

fn refusal(error: KernelError) -> JsValue {
    let out = js_sys::Error::new(&error.to_string());
    // A property set on a fresh Error object always lands.
    let _ = Reflect::set(&out, &"code".into(), &error.code.into());
    out.into()
}

// Each channel a Float32Array, else an explicit refusal (never a conversion).
fn floats(channels: &Array) -> Result<Vec<Vec<f32>>, JsValue> {
    channels
        .iter()
        .map(|channel| {
            channel
                .dyn_into::<Float32Array>()
                .map(|channel| channel.to_vec())
        })
        .collect::<Result<_, _>>()
        .map_err(|_| {
            refusal(KernelError::new(
                atome_audio_kernels::INVALID_ARGUMENT,
                "channels must be Float32Array",
            ))
        })
}
fn integers(channels: &Array) -> Result<Vec<Vec<i32>>, JsValue> {
    channels
        .iter()
        .map(|channel| {
            channel
                .dyn_into::<Int32Array>()
                .map(|channel| channel.to_vec())
        })
        .collect::<Result<_, _>>()
        .map_err(|_| {
            refusal(KernelError::new(
                atome_audio_kernels::INVALID_ARGUMENT,
                "channels must be Int32Array",
            ))
        })
}
fn slices<T>(channels: &[Vec<T>]) -> Vec<&[T]> {
    channels.iter().map(Vec::as_slice).collect()
}
fn float_array(channels: Vec<Vec<f32>>) -> Array {
    channels
        .iter()
        .map(|channel| JsValue::from(Float32Array::from(channel.as_slice())))
        .collect()
}
// A plain object, a missing value written null as the JS owners wrote it.
fn serialized<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true))
        .map_err(JsValue::from)
}

#[wasm_bindgen(js_name = waveformPeaks)]
pub fn waveform_peaks(channels: &Array, max_peaks: u32) -> Result<Vec<f32>, JsValue> {
    Ok(peaks::waveform_peaks(
        &slices(&floats(channels)?),
        max_peaks as usize,
    ))
}

#[wasm_bindgen(js_name = detectOnsets)]
pub fn detect_onsets(
    channels: &Array,
    sample_rate: f64,
    sensitivity: f64,
    min_gap_ms: f64,
    start: u32,
    end: u32,
) -> Result<Vec<u32>, JsValue> {
    let settings = onsets::OnsetSettings {
        sensitivity,
        min_gap_ms,
        start: start as usize,
        end: end as usize,
    };
    onsets::detect_onsets(&slices(&floats(channels)?), sample_rate, &settings)
        .map(|found| found.into_iter().map(|frame| frame as u32).collect())
        .map_err(refusal)
}

#[wasm_bindgen(js_name = endOfSound)]
pub fn end_of_sound(channels: &Array, threshold_db: f64, tail_frames: u32) -> Result<u32, JsValue> {
    analysis::end_of_sound(
        &slices(&floats(channels)?),
        threshold_db,
        tail_frames as usize,
    )
    .map(|end| end as u32)
    .map_err(refusal)
}

// Only the frames around `frame` are copied in: the search reads no further.
#[wasm_bindgen(js_name = nearestZeroCrossing)]
pub fn nearest_zero_crossing(channels: &Array, frame: u32, radius: u32) -> Result<u32, JsValue> {
    let length = channels
        .get(0)
        .dyn_into::<Float32Array>()
        .map_or(0, |channel| channel.length());
    if frame > length {
        return Err(refusal(KernelError::new(
            atome_audio_kernels::INVALID_ARGUMENT,
            format!("frame must be a whole frame within 0..{length}"),
        )));
    }
    let from = frame.saturating_sub(radius + 1);
    let to = length.min(frame.saturating_add(radius + 1));
    let window = Array::new();
    for channel in channels.iter() {
        window.push(
            &channel
                .dyn_into::<Float32Array>()
                .map_err(|_| {
                    refusal(KernelError::new(
                        atome_audio_kernels::INVALID_ARGUMENT,
                        "channels must be Float32Array",
                    ))
                })?
                .subarray(from, to),
        );
    }
    // Outside the window lies the sound's own edge or beyond the radius: the frame stays a frame of the window.
    let found = analysis::nearest_zero_crossing(
        &slices(&floats(&window)?),
        (frame - from) as usize,
        radius as usize,
    )
    .map_err(refusal)?;
    Ok(found as u32 + from)
}

#[wasm_bindgen(js_name = findLoop)]
pub fn find_loop(
    channels: &Array,
    start: u32,
    end: u32,
    radius: u32,
    window: u32,
    candidates: u32,
) -> Result<JsValue, JsValue> {
    let search = analysis::LoopSearch {
        start: start as usize,
        end: end as usize,
        radius: radius as usize,
        window: window as usize,
        candidates: candidates as usize,
    };
    serialized(&analysis::find_loop(&slices(&floats(channels)?), &search).map_err(refusal)?)
}

/// `windows`: `[from, hold_end, to]` per planned note; each answer a `{ start, end, truncated }` or null.
#[wasm_bindgen(js_name = cutTakes)]
pub fn cut_takes(
    channels: &Array,
    threshold_db: f64,
    pre_roll: u32,
    windows: &[u32],
) -> Result<JsValue, JsValue> {
    let windows: Vec<takes::TakeWindow> = windows
        .chunks_exact(3)
        .map(|w| takes::TakeWindow {
            from: w[0] as usize,
            hold_end: w[1] as usize,
            to: w[2] as usize,
        })
        .collect();
    serialized(
        &takes::cut_takes(
            &slices(&floats(channels)?),
            threshold_db,
            pre_roll as usize,
            &windows,
        )
        .map_err(refusal)?,
    )
}

#[wasm_bindgen(js_name = readEditWindow)]
pub fn read_edit_window(
    channels: &Array,
    start: u32,
    end: u32,
    dc: bool,
    reverse: bool,
) -> Result<Array, JsValue> {
    Ok(float_array(
        floats(channels)?
            .iter()
            .map(|channel| render::read_window(channel, start as usize, end as usize, dc, reverse))
            .collect(),
    ))
}

/// `ramps`: `[from, to]` per ramp.
#[wasm_bindgen(js_name = layEditPiece)]
pub fn lay_edit_piece(
    channels: &Array,
    length: u32,
    gain: f64,
    ramps: &[f64],
) -> Result<Array, JsValue> {
    let ramps: Vec<(f64, f64)> = ramps.chunks_exact(2).map(|r| (r[0], r[1])).collect();
    Ok(float_array(
        floats(channels)?
            .iter()
            .map(|channel| render::lay_piece(channel, length as usize, gain, &ramps))
            .collect(),
    ))
}

// A file's parts, read where they lie: a header is read without copying the sound in.
fn part_of(bytes: &Uint8Array) -> impl Fn(usize, usize) -> Vec<u8> + '_ {
    move |at, count| {
        let total = bytes.length() as usize;
        bytes
            .subarray(at.min(total) as u32, (at + count).min(total) as u32)
            .to_vec()
    }
}

#[wasm_bindgen(js_name = isWav)]
pub fn is_wav(bytes: &Uint8Array) -> bool {
    wav::is_wav(&part_of(bytes)(0, 12))
}

#[wasm_bindgen(js_name = wavInfo)]
pub fn wav_info(bytes: &Uint8Array) -> Result<JsValue, JsValue> {
    serialized(&wav::read_info_from(bytes.length() as usize, &part_of(bytes)).map_err(refusal)?)
}

#[wasm_bindgen(js_name = decodeWav)]
pub fn decode_wav(bytes: &[u8]) -> Result<Array, JsValue> {
    let info = wav::read_info(bytes).map_err(refusal)?;
    Ok(float_array(wav::decode(bytes, &info).map_err(refusal)?))
}

/// `{ bits, channels: Int32Array[] }` of an 8/16/24-bit PCM WAV.
#[wasm_bindgen(js_name = decodeWavIntegers)]
pub fn decode_wav_integers(bytes: &[u8]) -> Result<Object, JsValue> {
    let info = wav::read_info(bytes).map_err(refusal)?;
    let channels: Array = wav::decode_integers(bytes, &info)
        .map_err(refusal)?
        .iter()
        .map(|channel| JsValue::from(Int32Array::from(channel.as_slice())))
        .collect();
    let out = Object::new();
    Reflect::set(&out, &"bits".into(), &info.bits.into())?;
    Reflect::set(&out, &"channels".into(), &channels)?;
    Ok(out)
}

#[wasm_bindgen(js_name = encodeWav)]
pub fn encode_wav(channels: &Array, sample_rate: u32, bits: u16) -> Result<Vec<u8>, JsValue> {
    wav::encode(&slices(&floats(channels)?), sample_rate, bits).map_err(refusal)
}

/// `loops`: `[start, end, ping_pong]` per loop, written with `smpl_root` when it is given.
#[wasm_bindgen(js_name = encodeWavIntegers)]
pub fn encode_wav_integers(
    channels: &Array,
    sample_rate: u32,
    bits: u16,
    smpl_root: Option<u32>,
    loops: &[u32],
) -> Result<Vec<u8>, JsValue> {
    let loops: Vec<wav::LoopOut> = loops
        .chunks_exact(3)
        .map(|l| wav::LoopOut {
            start: l[0],
            end: l[1],
            ping_pong: l[2] != 0,
        })
        .collect();
    let channels = integers(channels)?;
    wav::encode_integers(
        &slices(&channels),
        sample_rate,
        bits,
        smpl_root.map(|root| (root, loops.as_slice())),
    )
    .map_err(refusal)
}

#[wasm_bindgen(js_name = encodeFlac)]
pub fn encode_flac(channels: &Array, sample_rate: u32, bits: u32) -> Result<Vec<u8>, JsValue> {
    flac::encode_flac(&slices(&integers(channels)?), sample_rate, bits).map_err(refusal)
}

#[wasm_bindgen(js_name = sourceRate)]
pub fn source_rate(bytes: &Uint8Array) -> Result<Option<u32>, JsValue> {
    wav::source_rate_from(bytes.length() as usize, &part_of(bytes)).map_err(refusal)
}

#[wasm_bindgen(js_name = toneSamples)]
pub fn tone_samples(hz: f64, seconds: f64, rate: f64, edge_seconds: f64, gain: f64) -> Vec<f32> {
    tones::tone(hz, seconds, rate, edge_seconds, gain)
}

#[wasm_bindgen(js_name = clickBar)]
pub fn click_bar(
    rate: f64,
    bpm: f64,
    beats: u32,
    click_seconds: f64,
    accent_hz: f64,
    beat_hz: f64,
) -> Vec<f32> {
    tones::click_bar(&tones::ClickBar {
        rate,
        bpm,
        beats: beats as usize,
        click_seconds,
        accent_hz,
        beat_hz,
    })
}
