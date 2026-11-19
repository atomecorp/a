// R-191 measurement protocol (todo/moteur_audio_universel_2026-11-16.md §6):
// 10 s rendered offline at 48 kHz, blocks of 128 and 512 frames, per
// configuration: mean and p99 time per block and their ratio to the block's
// deadline. Ignored by default; run in release:
// `cargo test --release -p atome-mix-graph --test engine_bench -- --ignored --nocapture`

use atome_mix_graph::{EventKind, InstrumentSpec, MixGraph, Program, StripCapture};
use kira::Frame;
use kira::effect::Effect;
use kira::info::MockInfoBuilder;
use std::time::Instant;

const RATE: u32 = 48_000;
const SECONDS: usize = 10;

fn strips(count: usize, chain: &dyn Fn(usize) -> String) -> String {
    let mut strips: Vec<String> = (0..count)
        .map(|k| {
            format!(
                r#"{{"id":"s{k}","transport":"t","chain":[{}],"output":{{"kind":"strip","id":"bus"}}}}"#,
                chain(k)
            )
        })
        .collect();
    strips.push(
        r#"{"id":"bus","chain":[{"id":"room","type":"dsp","effect":"reverb"},{"id":"bc","type":"dsp","effect":"compressor"}],"output":{"kind":"main"}}"#.into(),
    );
    format!(
        r#"{{"transports":[{{"id":"t","epoch":1,"playing":true,"seconds":0}}],"strips":[{}]}}"#,
        strips.join(",")
    )
}

// (a) eight strips: an equalizer band, a compressor, an echo, a volume, into a reverb bus.
fn reference(automated: bool, modulated: bool) -> String {
    strips(8, &|k| {
        let automation = match automated {
            true => {
                r#","automation":[{"param":"gain_db","points":[{"at":0,"value":-24},{"at":5,"value":0,"curve":"smooth"},{"at":10,"value":-12}]}]"#
            }
            false => "",
        };
        let lfo = match modulated {
            true => format!(
                r#"{{"id":"l{k}","type":"dsp","effect":"lfo","params":{{"rate_hz":{}}},"modulations":[{{"module_id":"f{k}","param":"cutoff_hz","depth":2}},{{"module_id":"v{k}","param":"gain_db","depth":3}}]}},"#,
                k + 1
            ),
            false => String::new(),
        };
        let filter = match modulated {
            true => format!(
                r#"{{"id":"f{k}","type":"dsp","effect":"svf","params":{{"cutoff_hz":987}}}},"#
            ),
            false => {
                format!(r#"{{"id":"f{k}","type":"dsp","effect":"bell","params":{{"gain_db":3}}}},"#)
            }
        };
        format!(
            r#"{lfo}{filter}{{"id":"c{k}","type":"dsp","effect":"compressor"}},{{"id":"e{k}","type":"dsp","effect":"echo"}},{{"id":"v{k}","type":"volume","params":{{"gain_db":-6}}{automation}}}"#
        )
    })
}

// (d) eight mono strips into an eight-channel reverb bus out to physical outputs 1–8.
fn eight_channels() -> String {
    let mut strips: Vec<String> = (0..8)
        .map(|k| format!(r#"{{"id":"s{k}","channels":1,"chain":[{{"id":"c{k}","type":"dsp","effect":"compressor"}}],"output":{{"kind":"strip","id":"bus","channels":[{k}]}}}}"#))
        .collect();
    strips.push(r#"{"id":"bus","channels":8,"chain":[{"id":"room","type":"dsp","effect":"reverb"}],"output":{"kind":"outputs","channels":[0,1,2,3,4,5,6,7]}}"#.into());
    format!(r#"{{"strips":[{}]}}"#, strips.join(","))
}

// (f) eight strips of saturation at 1×, 2× or 4×.
fn saturation(factor: u8) -> String {
    let oversample = match factor {
        1 => String::new(),
        factor => format!(r#","oversample":{factor}"#),
    };
    strips(8, &|k| {
        format!(r#"{{"id":"d{k}","type":"dsp","effect":"soft_clip"{oversample}}}"#)
    })
}

// (e) a two-oscillator synth with a swept filter, a 16-note chord held.
const SYNTH: &str = r#"{"id":"syn","params":{"polyphony":16},"synth":{
    "bricks":[{"id":"lfo","kind":"lfo","params":{"rate_hz":5}},{"id":"o1","kind":"oscillator"},
              {"id":"o2","kind":"oscillator","params":{"waveform":2,"detune_cents":7}},
              {"id":"fe","kind":"envelope"},{"id":"f","kind":"svf","params":{"cutoff_hz":610,"resonance":2}},
              {"id":"ae","kind":"envelope"},{"id":"v","kind":"vca"}],
    "routes":[{"from":"lfo","to":"o1","input":"pitch","depth":0.1},
              {"from":"o1","to":"f","input":"audio","depth":1},{"from":"o2","to":"f","input":"audio","depth":1},
              {"from":"fe","to":"f","input":"cutoff","depth":3},{"from":"lfo","to":"f","input":"cutoff","depth":0.5},
              {"from":"f","to":"v","input":"audio","depth":1},{"from":"ae","to":"v","input":"gain","depth":1}],
    "output":"v"}}"#;
const SYNTH_STRIP: &str = r#"{"strips":[{"id":"keys","input":{"kind":"instrument","instrument_id":"syn"},"chain":[{"id":"g","type":"volume","params":{"gain_db":-18}}],"output":{"kind":"main"}}]}"#;

fn measure(name: &str, json: &str, synth: bool, block: usize) {
    let mut graph = MixGraph::new(RATE);
    graph.aux_outputs().configure(3, 4096);
    if synth {
        graph
            .set_instrument(serde_json::from_str::<InstrumentSpec>(SYNTH).unwrap())
            .unwrap();
    }
    let program: Program = serde_json::from_str(json).unwrap();
    let mut captures: Vec<StripCapture> = program
        .strips
        .iter()
        .map(|strip| StripCapture::new(graph.capture_slot(&strip.id)))
        .collect();
    graph.apply(program).unwrap();
    let mut effect = graph.effect_builder().into_effect();
    effect.init(RATE, block);
    if synth {
        for note in 0..16u8 {
            graph
                .instruments_ref()
                .event(
                    "syn",
                    EventKind::NoteOn {
                        note: 41 + note * 2,
                        velocity: 0.8,
                    },
                    None,
                )
                .unwrap();
        }
    }
    let info = MockInfoBuilder::new().build();
    let aux = graph.aux_outputs();
    let (mut input, mut out, mut pair) = (
        vec![Frame::ZERO; block],
        vec![Frame::ZERO; block],
        vec![Frame::ZERO; block],
    );
    let blocks = RATE as usize * SECONDS / block;
    let mut times = Vec::with_capacity(blocks);
    let mut seed = 1u32;
    for _ in 0..blocks {
        for capture in captures.iter_mut() {
            for frame in input.iter_mut() {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let value = (seed >> 9) as f32 / 4_194_304.0 - 1.0;
                *frame = Frame::new(0.3 * value, 0.3 * value);
            }
            capture.process(&mut input, 1.0 / f64::from(RATE), &info);
        }
        out.fill(Frame::ZERO);
        let start = Instant::now();
        effect.render(&mut out);
        times.push(start.elapsed().as_secs_f64());
        for index in 1..4 {
            aux.drain_pair(index, &mut pair);
        }
    }
    times.sort_by(f64::total_cmp);
    let mean = times.iter().sum::<f64>() / times.len() as f64;
    let p99 = times[(times.len() * 99) / 100];
    let deadline = block as f64 / f64::from(RATE);
    println!(
        "BENCH {name:<24} block {block:>3}: mean {:>8.1} µs ({:>5.2} % of the deadline), p99 {:>8.1} µs ({:>5.2} %)",
        mean * 1e6,
        100.0 * mean / deadline,
        p99 * 1e6,
        100.0 * p99 / deadline
    );
}

#[test]
#[ignore = "a measurement, run in release on demand"]
fn engine_bench() {
    for block in [128, 512] {
        measure("a reference", &reference(false, false), false, block);
        measure("b + automation", &reference(true, false), false, block);
        measure("c + modulation", &reference(true, true), false, block);
        measure("d 8 channels", &eight_channels(), false, block);
        measure("e synth 16 voices", SYNTH_STRIP, true, block);
        for factor in [1, 2, 4] {
            measure(
                &format!("f saturation {factor}x"),
                &saturation(factor),
                false,
                block,
            );
        }
    }
}
