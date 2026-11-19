// R-191: modulation at the frame, control steps aligned on the clock, the
// same render whatever the block size, and the refusals of the typed contract.

use crate::modulation::CONTROL_FRAMES;
use crate::offline_rig::{noise, offline, try_offline};
use kira::Frame;
use std::f32::consts::TAU;

const RATE: u32 = 48_000;

fn ones(_: &str, _: usize) -> Frame {
    Frame::new(1.0, 1.0)
}

fn db(value: f32) -> f32 {
    10f32.powf(value / 20.0)
}

// An LFO at 3 Hz moves the strip's volume by ±6 dB at every frame.
const TREMOLO: &str = r#"{"strips":[{"id":"a","output":{"kind":"main"},"chain":[
    {"id":"lfo","type":"dsp","effect":"lfo","params":{"rate_hz":3},
     "modulations":[{"module_id":"v","param":"gain_db","depth":6}]},
    {"id":"v","type":"volume","params":{"gain_db":-6}}]}]}"#;

#[test]
fn a_modulator_moves_a_parameter_at_every_frame() {
    let mut rig = offline(TREMOLO, RATE, |_| {});
    let out = rig.render(9600, 128, &ones);
    for (index, frame) in out.iter().enumerate() {
        let lfo = (TAU * 3.0 * index as f32 / RATE as f32).sin();
        let expected = db(-6.0 + 6.0 * lfo);
        assert!(
            (frame.left - expected).abs() < 1e-4,
            "frame {index}: {} against {expected}",
            frame.left
        );
    }
}

#[test]
fn a_modulation_reaching_back_lands_one_control_step_later() {
    // The same tremolo, the LFO after the volume: it reads the control CONTROL_FRAMES later.
    let backward = r#"{"strips":[{"id":"a","output":{"kind":"main"},"chain":[
        {"id":"v","type":"volume","params":{"gain_db":-6}},
        {"id":"lfo","type":"dsp","effect":"lfo","params":{"rate_hz":3},
         "modulations":[{"module_id":"v","param":"gain_db","depth":6}]}]}]}"#;
    let forward = offline(TREMOLO, RATE, |_| {}).render(4800, 100, &ones);
    let late = offline(backward, RATE, |_| {}).render(4800, 100, &ones);
    for index in CONTROL_FRAMES..4800 {
        assert!((late[index].left - forward[index - CONTROL_FRAMES].left).abs() < 1e-5);
    }
    // Before the first control arrives the parameter stays at its own value.
    assert!((late[0].left - db(-6.0)).abs() < 1e-5);
}

#[test]
fn a_bypassed_modulator_leaves_the_parameter_where_it_is_set() {
    let bypassed = TREMOLO.replace(r#""effect":"lfo","#, r#""effect":"lfo","bypass":true,"#);
    let out = offline(&bypassed, RATE, |_| {}).render(4096, 256, &ones);
    assert!(out.iter().all(|frame| (frame.left - db(-6.0)).abs() < 1e-5));
}

// A dense program: LFO on a filter's cutoff and on a send, a follower on a
// volume, automation, a compressor, an echo, and a loop through a bus.
const DENSE: &str = r#"{"transports":[{"id":"t","epoch":1,"playing":true,"seconds":0}],
 "strips":[
  {"id":"a","transport":"t","output":{"kind":"main"},"chain":[
    {"id":"lfo","type":"dsp","effect":"lfo","params":{"rate_hz":5},
     "modulations":[{"module_id":"cut","param":"cutoff_hz","depth":2},
                    {"module_id":"s","param":"level_db","depth":-9}]},
    {"id":"cut","type":"dsp","effect":"svf","params":{"cutoff_hz":800,"resonance":3}},
    {"id":"comp","type":"dsp","effect":"compressor"},
    {"id":"echo","type":"dsp","effect":"echo"},
    {"id":"s","type":"send","params":{"level_db":-6},"target":{"kind":"strip","id":"bus"}},
    {"id":"v","type":"volume","params":{"gain_db":0},
     "automation":[{"param":"gain_db","points":[{"at":0,"value":-24},{"at":0.2,"value":0,"curve":"smooth"},{"at":0.3,"value":-6,"curve":"hold"},{"at":0.4,"value":0}]}]}]},
  {"id":"bus","output":{"kind":"main"},"chain":[
    {"id":"follow","type":"dsp","effect":"follower",
     "modulations":[{"module_id":"bv","param":"gain_db","depth":-12}]},
    {"id":"low","type":"dsp","effect":"low_pass","params":{"frequency":3000}},
    {"id":"bv","type":"volume","params":{"gain_db":-3}},
    {"id":"back","type":"send","params":{"level_db":-18},"target":{"kind":"strip","id":"a"}}]}]}"#;

fn dense_input(strip: &str, index: usize) -> Frame {
    match strip {
        "a" => {
            let tone = 0.4 * (TAU * 220.0 * index as f32 / RATE as f32).sin();
            Frame::new(tone + 0.1 * noise(index, 1), tone + 0.1 * noise(index, 2))
        }
        _ => Frame::ZERO,
    }
}

#[test]
fn the_render_is_the_same_whatever_the_block_size() {
    let frames = 24_000;
    let reference = offline(DENSE, RATE, |_| {}).render(frames, 128, &dense_input);
    assert!(reference.iter().any(|frame| frame.left.abs() > 0.05));
    for block in [17, 64, 500, 4096] {
        let other = offline(DENSE, RATE, |_| {}).render(frames, block, &dense_input);
        let worst = reference
            .iter()
            .zip(other.iter())
            .map(|(a, b)| (a.left - b.left).abs().max((a.right - b.right).abs()))
            .fold(0.0f32, f32::max);
        assert!(worst < 1e-6, "block {block}: differs by {worst}");
    }
}

#[test]
fn an_automation_switch_inside_a_block_lands_on_its_control_step_without_a_click() {
    // A hold from −60 dB to 0 dB at 0.1 s (frame 4800, a control step), inside a 4096-frame block.
    let json = r#"{"transports":[{"id":"t","epoch":1,"playing":true,"seconds":0}],
     "strips":[{"id":"a","transport":"t","output":{"kind":"main"},"chain":[
      {"id":"v","type":"volume","params":{"gain_db":-60},
       "automation":[{"param":"gain_db","points":[{"at":0,"value":-60,"curve":"hold"},{"at":0.1,"value":0}]}]}]}]}"#;
    for block in [4096, 333] {
        let out = offline(json, RATE, |_| {}).render(9600, block, &ones);
        assert!((out[4799].left - db(-60.0)).abs() < 1e-5, "block {block}");
        assert!(
            (out[4800 + CONTROL_FRAMES - 1].left - 1.0).abs() < 1e-5,
            "block {block}"
        );
        let jump = out
            .windows(2)
            .map(|pair| (pair[1].left - pair[0].left).abs())
            .fold(0.0f32, f32::max);
        assert!(
            jump <= 1.0 / CONTROL_FRAMES as f32 + 1e-4,
            "block {block}: step {jump}"
        );
    }
}

#[test]
fn modulation_stays_stable_and_on_time_at_every_rate() {
    for rate in [44_100u32, 48_000, 96_000] {
        let mut rig = offline(TREMOLO, rate, |_| {});
        let out = rig.render(rate as usize, 256, &ones);
        assert!(out.iter().all(|frame| frame.left.is_finite()));
        // The tremolo keeps its 3 Hz phase over a whole second, at every rate.
        for (index, frame) in out.iter().enumerate().step_by(97) {
            let lfo = (TAU * 3.0 * index as f32 / rate as f32).sin();
            let expected = db(-6.0 + 6.0 * lfo);
            // The shared Lfo steps its phase in f32: about 0.01° after a second.
            assert!(
                (frame.left - expected).abs() < 3e-3,
                "{rate} Hz, frame {index}"
            );
        }
    }
}

#[test]
fn the_typed_contract_refuses_what_it_cannot_render() {
    let refused = |json: &str, words: &str| {
        let error = try_offline(json, RATE, |_| {})
            .err()
            .unwrap_or_else(|| panic!("accepted: {json}"));
        assert!(error.contains(words), "{error} (expected «{words}»)");
    };
    let strip = |chain: &str| {
        format!(r#"{{"strips":[{{"id":"a","output":{{"kind":"main"}},"chain":[{chain}]}}]}}"#)
    };
    refused(
        &strip(
            r#"{"id":"v","type":"volume","modulations":[{"module_id":"v","param":"gain_db","depth":1}]}"#,
        ),
        "writes no control signal",
    );
    refused(
        &strip(
            r#"{"id":"l","type":"dsp","effect":"lfo","modulations":[{"module_id":"ghost","param":"gain_db","depth":1}]}"#,
        ),
        "not in the program",
    );
    refused(
        &strip(
            r#"{"id":"l","type":"dsp","effect":"lfo","modulations":[{"module_id":"f","param":"mode","depth":1}]},{"id":"f","type":"dsp","effect":"svf"}"#,
        ),
        "moves in steps",
    );
    refused(
        &strip(
            r#"{"id":"l","type":"dsp","effect":"lfo","modulations":[{"module_id":"f","param":"nothing","depth":1}]},{"id":"f","type":"dsp","effect":"svf"}"#,
        ),
        "is not a parameter",
    );
    refused(
        &strip(
            r#"{"id":"l","type":"dsp","effect":"lfo","modulations":[{"module_id":"f","param":"cutoff_hz","depth":1,"output":1}]},{"id":"f","type":"dsp","effect":"svf"}"#,
        ),
        "no control output 1",
    );
    refused(
        &strip(r#"{"id":"d","type":"dsp","effect":"soft_clip","oversample":3}"#),
        "2× or 4×",
    );
    refused(
        &strip(r#"{"id":"l","type":"dsp","effect":"lfo","oversample":2}"#),
        "is not oversampled",
    );
}

#[test]
fn a_modulation_loop_through_itself_is_allowed() {
    // A follower moving its own gain: read one control step late, it settles instead of failing.
    let json = r#"{"strips":[{"id":"a","output":{"kind":"main"},"chain":[
        {"id":"f","type":"dsp","effect":"follower",
         "modulations":[{"module_id":"f","param":"gain_db","depth":-12}]}]}]}"#;
    let out = offline(json, RATE, |_| {}).render(9600, 128, &ones);
    assert!(
        out.iter().all(|frame| frame.left == 1.0),
        "audio passes through"
    );
}

#[test]
fn oversampling_declares_its_latency_to_the_graph() {
    let json = r#"{"strips":[{"id":"a","output":{"kind":"main"},"chain":[
        {"id":"d","type":"dsp","effect":"soft_clip","oversample":2}]}]}"#;
    let rig = offline(json, RATE, |_| {});
    assert_eq!(rig.graph.output_latency_frames(), 23);
    let four = json.replace(r#""oversample":2"#, r#""oversample":4"#);
    assert_eq!(
        offline(&four, RATE, |_| {}).graph.output_latency_frames(),
        35
    );
}
