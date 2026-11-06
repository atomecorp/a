// The kernels on known sounds; their equality with the JS they replaced is
// checked once by temp/step7_compute/ (same inputs, same outputs).
use atome_audio_kernels::{analysis, flac, onsets, peaks, render, takes, tones, wav};
use symphonia::core::audio::GenericAudioBufferRef;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

fn sine(frames: usize, hz: f64, rate: f64) -> Vec<f32> {
    (0..frames)
        .map(|i| ((2.0 * std::f64::consts::PI * hz * i as f64 / rate).sin() * 0.5) as f32)
        .collect()
}

// Interleaved i32 samples decoded by Symphonia, the engines' decoder.
fn decoded(bytes: Vec<u8>) -> Vec<i32> {
    let source = MediaSourceStream::new(Box::new(std::io::Cursor::new(bytes)), Default::default());
    let mut format = symphonia::default::get_probe()
        .probe(
            &Hint::new(),
            source,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .unwrap();
    let track = format.default_track(TrackType::Audio).unwrap();
    let id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .unwrap()
        .audio()
        .unwrap()
        .clone();
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&params, &AudioDecoderOptions::default())
        .unwrap();
    let mut out = Vec::new();
    while let Ok(Some(packet)) = format.next_packet() {
        if packet.track_id != id {
            continue;
        }
        let buffer: GenericAudioBufferRef = decoder.decode(&packet).unwrap();
        let mut chunk: Vec<i32> = Vec::new();
        buffer.copy_to_vec_interleaved(&mut chunk);
        out.extend(chunk);
    }
    out
}

#[test]
fn wav_round_trips_float_and_integers_with_smpl() {
    let left = sine(4800, 440.0, 48000.0);
    let right = sine(4800, 660.0, 48000.0);
    for bits in [16u16, 24, 32] {
        let bytes = wav::encode(&[&left, &right], 48000, bits).unwrap();
        let info = wav::read_info(&bytes).unwrap();
        assert_eq!(
            (info.channels, info.sample_rate, info.bits, info.frames),
            (2, 48000, bits, 4800)
        );
        let back = wav::decode(&bytes, &info).unwrap();
        let step = if bits == 32 {
            0.0
        } else {
            1.0 / f32::powi(2.0, i32::from(bits) - 1)
        };
        assert!(
            back[1]
                .iter()
                .zip(&right)
                .all(|(a, b)| (a - b).abs() <= step)
        );
    }
    let ints: Vec<i32> = (0..1000).map(|i| (i * 7919 % 65536) - 32768).collect();
    let loops = [wav::LoopOut {
        start: 10,
        end: 900,
        ping_pong: true,
    }];
    let bytes = wav::encode_integers(&[&ints], 44100, 16, Some((57, &loops))).unwrap();
    let info = wav::read_info(&bytes).unwrap();
    assert_eq!(wav::decode_integers(&bytes, &info).unwrap()[0], ints);
    let smpl = info.smpl.unwrap();
    assert_eq!(
        (
            smpl.root,
            smpl.loops[0].start,
            smpl.loops[0].end,
            smpl.loops[0].ping_pong
        ),
        (Some(57), 10, 900, true)
    );
    assert_eq!(wav::source_rate(&bytes).unwrap(), Some(44100));
    assert_eq!(
        wav::read_info(b"RIFF....AVI ").unwrap_err().code,
        "bank/unreadable"
    );
}

#[test]
fn flac_is_lossless_through_the_engines_decoder() {
    for bits in [16u32, 24] {
        let scale = f64::from(1u32 << (bits - 1)) - 1.0;
        let a: Vec<i32> = sine(10_000, 220.0, 48000.0)
            .iter()
            .map(|v| (f64::from(*v) * scale) as i32)
            .collect();
        let b: Vec<i32> = (0..10_000)
            .map(|i| {
                if i < 5000 {
                    0
                } else {
                    ((i * 31) % 2000) - 1000
                }
            })
            .collect();
        let bytes = flac::encode_flac(&[&a, &b], 48000, bits).unwrap();
        assert_eq!(wav::source_rate(&bytes).unwrap(), Some(48000));
        let shift = 32 - bits;
        let out: Vec<i32> = decoded(bytes).into_iter().map(|v| v >> shift).collect();
        let interleaved: Vec<i32> = a.iter().zip(&b).flat_map(|(x, y)| [*x, *y]).collect();
        assert_eq!(out, interleaved, "{bits}-bit");
    }
}

#[test]
fn analysis_finds_attacks_loops_ends_and_crossings() {
    let rate = 48000.0;
    let mut hits = vec![0f32; 48000];
    for start in [6000usize, 18000, 30000] {
        for i in 0..2000 {
            hits[start + i] = (((i * 7) % 13) as f32 / 13.0 - 0.5) * (1.0 - i as f32 / 2000.0);
        }
    }
    let settings = onsets::OnsetSettings {
        sensitivity: 0.5,
        min_gap_ms: 55.0,
        start: 0,
        end: hits.len(),
    };
    let found = onsets::detect_onsets(&[&hits], rate, &settings).unwrap();
    assert_eq!(found.len(), 3);
    assert!(
        found
            .iter()
            .zip([6000, 18000, 30000])
            .all(|(f, e)| f.abs_diff(e) <= 2),
        "{found:?}"
    );
    let end = analysis::end_of_sound(&[&hits], -60.0, 0).unwrap();
    assert!(
        hits[end - 1].abs() > 0.001 && hits[end..].iter().all(|v| v.abs() <= 0.001),
        "{end}"
    );
    let tone = sine(48000, 100.0, rate);
    assert!((480..=481).contains(&analysis::nearest_zero_crossing(&[&tone], 470, 512).unwrap()));
    let search = analysis::LoopSearch {
        start: 9000,
        end: 40000,
        radius: 2048,
        window: 1024,
        candidates: 34,
    };
    let found = analysis::find_loop(&[&tone], &search).unwrap();
    assert!(
        found.score > 0.999_999 && (found.end - found.start).is_multiple_of(480),
        "{found:?}"
    );
    assert_eq!(
        analysis::end_of_sound(&[&[0f32; 8][..]], -60.0, 0)
            .unwrap_err()
            .code,
        "EMPTY_RANGE"
    );
}

#[test]
fn peaks_render_takes_and_tones() {
    let ramp: Vec<f32> = (0..1000).map(|i| i as f32 / 1000.0).collect();
    let p = peaks::waveform_peaks(&[&ramp], 10);
    assert_eq!(p.len(), 10);
    assert_eq!(p[9], 0.999);
    let window = render::read_window(&ramp, 0, 4, true, true);
    assert!(
        window
            .iter()
            .zip([0.0015, 0.0005, -0.0005, -0.0015])
            .all(|(a, b)| (a - b).abs() < 1e-7),
        "{window:?}"
    );
    assert_eq!(
        render::lay_piece(&[1.0; 4], 4, 0.5, &[(0.0, 1.0)]),
        vec![0.0, 0.125, 0.25, 0.375]
    );
    let mut recording = vec![0f32; 3000];
    recording[1100..1500].fill(0.5);
    let windows = [
        takes::TakeWindow {
            from: 1000,
            hold_end: 1600,
            to: 2000,
        },
        takes::TakeWindow {
            from: 2000,
            hold_end: 2600,
            to: 3000,
        },
    ];
    let cut = takes::cut_takes(&[&recording], -55.0, 10, &windows).unwrap();
    assert_eq!(
        cut[0],
        Some(takes::Take {
            start: 1090,
            end: 1500,
            truncated: false
        })
    );
    assert_eq!(cut[1], None);
    let beep = tones::tone(1320.0, 0.12, 48000.0, 0.008, 0.5);
    assert_eq!(beep.len(), 5760);
    assert!(beep[0] == 0.0 && beep.iter().all(|v| v.abs() <= 0.5));
    let bar = tones::click_bar(&tones::ClickBar {
        rate: 48000.0,
        bpm: 120.0,
        beats: 4,
        click_seconds: 0.03,
        accent_hz: 1760.0,
        beat_hz: 1320.0,
    });
    assert_eq!(bar.len(), 96000);
}
