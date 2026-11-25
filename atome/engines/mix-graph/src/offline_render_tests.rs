// R-349: a project rendered offline through the real Kira host — two clips on
// two strips (a volume, a pan), a synth note on a third — compared with the mix
// computed by hand, the same at any block size, and its refusals.

use crate::offline_render::{
    ClipStore, OfflineRenderer, RenderPlan, RenderedAudio, render_offline,
};
use kira::Frame;
use kira::sound::static_sound::StaticSoundData;
use std::sync::Arc;

const RATE: u32 = 48_000;
const DURATION: u64 = 28_800;
const A_START: u64 = 2_400;
const B_START: u64 = 4_800;
const NOTE_ON: u64 = 9_600;
const NOTE_OFF: u64 = 19_200;

fn sine(index: usize, hz: f32, level: f32) -> f32 {
    level * (std::f32::consts::TAU * hz * index as f32 / RATE as f32).sin()
}

fn clip(hz: f32, level: f32) -> StaticSoundData {
    let frames: Arc<[Frame]> = (0..24_000)
        .map(|index| Frame::from_mono(sine(index, hz, level)))
        .collect();
    StaticSoundData {
        sample_rate: RATE,
        frames,
        settings: Default::default(),
        slice: None,
    }
}

pub(crate) fn store() -> ClipStore {
    let mut store = ClipStore::default();
    store.clips.insert("a".into(), clip(220.0, 0.5));
    store.clips.insert("b".into(), clip(330.0, 0.4));
    store
}

const SYNTH: &str = r#"{"id":"syn","params":{"polyphony":8},"synth":{
    "bricks":[{"id":"o","kind":"oscillator","params":{"waveform":0,"level_db":-6}},
              {"id":"e","kind":"envelope","params":{"attack_ms":1,"decay_ms":1,"sustain":1,"release_ms":21}},
              {"id":"v","kind":"vca"}],
    "routes":[{"from":"o","to":"v","input":"audio","depth":1},{"from":"e","to":"v","input":"gain","depth":1}],
    "output":"v"}}"#;

// `clips` and `notes` choose which parts of the project play.
pub(crate) fn plan(clips: bool, notes: bool) -> RenderPlan {
    let voices = r#"[{"assetId":"a","voiceId":"va","startRenderFrame":2400,"stripId":"sa"},
                     {"assetId":"b","voiceId":"vb","startRenderFrame":4800,"stripId":"sb"}]"#;
    let events = r#"[{"instrument_id":"syn","frame":19200,"event":{"kind":"note_off","note":69}},
                     {"instrument_id":"syn","frame":9600,"event":{"kind":"note_on","note":69,"velocity":127}}]"#;
    let json = format!(
        r#"{{"rate":48000,"duration_frames":{DURATION},
        "program":{{"strips":[
            {{"id":"sa","chain":[{{"id":"ga","type":"volume","params":{{"gain_db":-6}}}}],"output":{{"kind":"main"}}}},
            {{"id":"sb","chain":[{{"id":"pb","type":"pan","params":{{"pan":0.5}}}}],"output":{{"kind":"main"}}}},
            {{"id":"keys","input":{{"kind":"instrument","instrument_id":"syn"}},
              "chain":[{{"id":"gk","type":"volume","params":{{"gain_db":-6}}}}],"output":{{"kind":"main"}}}}]}},
        "instruments":[{SYNTH}],
        "voices":{},"events":{}}}"#,
        if clips { voices } else { "[]" },
        if notes { events } else { "[]" },
    );
    serde_json::from_str(&json).expect("a render plan")
}

fn render_in(plan: &RenderPlan, block: usize) -> Vec<Frame> {
    let mut renderer = OfflineRenderer::new(plan, &store()).expect("renderer");
    let mut out = Vec::new();
    let mut buffer = vec![Frame::ZERO; block];
    loop {
        let rendered = renderer.render_into(&mut buffer).expect("render");
        if rendered == 0 {
            break;
        }
        out.extend_from_slice(&buffer[..rendered]);
    }
    out
}

fn max_difference(left: &[[f32; 2]], right: &[[f32; 2]]) -> f32 {
    assert_eq!(left.len(), right.len());
    left.iter()
        .zip(right)
        .map(|(l, r)| (l[0] - r[0]).abs().max((l[1] - r[1]).abs()))
        .fold(0.0, f32::max)
}

#[test]
fn two_clips_mix_as_computed_by_hand() {
    let RenderedAudio { rate, frames } =
        render_offline(&plan(true, false), &store()).expect("render");
    assert_eq!((rate, frames.len() as u64), (RATE, DURATION));
    let gain = 10f32.powf(-6.0 / 20.0);
    let expected: Vec<[f32; 2]> = (0..DURATION as usize)
        .map(|index| {
            let a = index
                .checked_sub(A_START as usize)
                .filter(|at| *at < 24_000)
                .map_or(0.0, |at| sine(at, 220.0, 0.5) * gain);
            let b = index
                .checked_sub(B_START as usize)
                .filter(|at| *at < 24_000)
                .map_or(0.0, |at| sine(at, 330.0, 0.4));
            // A pan of 0.5 halves the left side only (dsp::apply_pan).
            [a + b * 0.5, a + b]
        })
        .collect();
    let difference = max_difference(&frames, &expected);
    assert!(difference < 1e-4, "clips mix off by {difference}");
}

#[test]
fn a_synth_note_sounds_on_its_frame_and_ends_with_its_release() {
    let frames = render_offline(&plan(false, true), &store())
        .expect("render")
        .frames;
    let peak = |range: std::ops::Range<usize>| {
        frames[range]
            .iter()
            .fold(0.0f32, |peak, frame| peak.max(frame[0].abs()))
    };
    assert_eq!(peak(0..NOTE_ON as usize), 0.0, "silent before its note");
    assert!(
        peak(NOTE_ON as usize..NOTE_ON as usize + 3) > 0.0,
        "sounds from its frame on"
    );
    // −6 dB oscillator, the strip's −6 dB volume: a quarter.
    let held = peak(NOTE_ON as usize + 480..NOTE_OFF as usize);
    assert!((held - 0.25).abs() < 0.01, "held note: {held}");
    assert_eq!(
        peak(NOTE_OFF as usize + 2_400..DURATION as usize),
        0.0,
        "released"
    );
}

#[test]
fn the_whole_project_is_its_parts_summed() {
    let all = render_offline(&plan(true, true), &store())
        .expect("render")
        .frames;
    let clips = render_offline(&plan(true, false), &store())
        .expect("render")
        .frames;
    let notes = render_offline(&plan(false, true), &store())
        .expect("render")
        .frames;
    let summed: Vec<[f32; 2]> = clips
        .iter()
        .zip(&notes)
        .map(|(c, n)| [c[0] + n[0], c[1] + n[1]])
        .collect();
    let difference = max_difference(&all, &summed);
    assert!(difference < 1e-5, "{difference}");
}

#[test]
fn the_render_does_not_depend_on_the_blocks_asked() {
    let plan = plan(true, true);
    let reference = render_in(&plan, 4_096);
    assert_eq!(reference.len() as u64, DURATION);
    for block in [64, 512, 1_000] {
        let other = render_in(&plan, block);
        let difference = reference
            .iter()
            .zip(&other)
            .map(|(r, o)| (r.left - o.left).abs().max((r.right - o.right).abs()))
            .fold(0.0f32, f32::max);
        assert_eq!(other.len(), reference.len());
        assert!(difference < 1e-6, "block {block}: {difference}");
    }
}

#[test]
fn a_plan_naming_what_is_missing_is_refused() {
    let mut missing = plan(true, false);
    missing.voices[0].asset_id = "nowhere".into();
    let error = OfflineRenderer::new(&missing, &store())
        .err()
        .expect("refused");
    assert_eq!(error, "render_asset_missing:nowhere");
    let mut stray = plan(true, false);
    stray.voices[1].strip_id = Some("ghost".into());
    let error = OfflineRenderer::new(&stray, &store())
        .err()
        .expect("refused");
    assert!(
        error.starts_with("render_plan_invalid:voice vb plays on strip ghost"),
        "{error}"
    );
    let mut empty = plan(false, false);
    empty.duration_frames = 0;
    let error = OfflineRenderer::new(&empty, &store())
        .err()
        .expect("refused");
    assert!(
        error.starts_with("render_plan_invalid:duration_frames"),
        "{error}"
    );
}

// An Ampli on a clip's strip reads its capture from the store: refused by name without it,
// heard through it once it is there (R-349 lot 3a: an offline render of a project with an amp).
#[test]
fn a_dsp_module_reads_its_asset_from_the_store() {
    let json = r#"{"rate":48000,"duration_frames":28800,
        "program":{"strips":[{"id":"sa","chain":[{"id":"amp","type":"dsp","effect":"amp","params":{"asset_id":"plexi"}}],
                              "output":{"kind":"main"}}]},
        "voices":[{"assetId":"a","voiceId":"va","startRenderFrame":2400,"stripId":"sa"}]}"#;
    let plan: RenderPlan = serde_json::from_str(json).expect("a render plan");
    let error = OfflineRenderer::new(&plan, &store())
        .err()
        .expect("refused");
    assert!(error.contains("plexi is not loaded"), "{error}");
    let mut with_asset = store();
    with_asset
        .assets
        .insert("plexi".into(), crate::dsp_tests::gain_capture(0.5));
    let frames = render_offline(&plan, &with_asset).expect("render").frames;
    let peak = frames[4_800..24_000]
        .iter()
        .fold(0.0f32, |peak, frame| peak.max(frame[0].abs()));
    assert!(peak > 0.05, "heard through the amp: {peak}");
}
