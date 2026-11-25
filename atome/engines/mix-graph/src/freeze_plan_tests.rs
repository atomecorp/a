// R-370: a strip's stem plan and key (freeze_plan.rs), and the null test — a timeline rendered with a strip frozen
// sounds as the same timeline rendered live, through the real graph (offline_render.rs), the instrument resting.

use super::stem_plan;
use crate::freeze::Stem;
use crate::offline_render::{ClipStore, OfflineRenderer, RenderPlan, render_offline};
use kira::Frame;
use kira::sound::static_sound::StaticSoundData;
use std::sync::Arc;

const RATE: u32 = 48_000;
const DURATION: u64 = 3 * 48_000;

const SYNTH: &str = r#"{"id":"syn","params":{"polyphony":8},"synth":{
    "bricks":[{"id":"o","kind":"oscillator","params":{"waveform":0,"level_db":-6}},
              {"id":"e","kind":"envelope","params":{"attack_ms":1,"decay_ms":1,"sustain":1,"release_ms":21}},
              {"id":"v","kind":"vca"}],
    "routes":[{"from":"o","to":"v","input":"audio","depth":1},{"from":"e","to":"v","input":"gain","depth":1}],
    "output":"v"}}"#;

fn sine_clip() -> StaticSoundData {
    let frames: Arc<[Frame]> = (0..48_000)
        .map(|index| {
            Frame::from_mono(
                0.4 * (std::f32::consts::TAU * 220.0 * index as f32 / RATE as f32).sin(),
            )
        })
        .collect();
    StaticSoundData {
        sample_rate: RATE,
        frames,
        settings: Default::default(),
        slice: None,
    }
}

fn store() -> ClipStore {
    let mut store = ClipStore::default();
    store.clips.insert("a".into(), sine_clip());
    store
}

// A synth on « keys » (a saturator then a volume), a clip on « audio » (a saturator then a pan); `drive` the
// saturators' drive; `voice` the clip voice's id (a compile gives new ones).
fn plan_json(drive: f64, voice: &str) -> String {
    let saturator = format!(
        r#"{{"id":"MOD","type":"dsp","effect":"saturator","params":{{"drive_db":{drive}}}}}"#
    );
    format!(
        r#"{{"rate":48000,"duration_frames":{DURATION},
        "program":{{
          "transports":[{{"id":"t","epoch":7,"playing":true,"seconds":0}}],
          "strips":[
            {{"id":"keys","transport":"t","input":{{"kind":"instrument","instrument_id":"syn"}},
              "chain":[{},{{"id":"gk","type":"volume","params":{{"gain_db":-6}}}}],"output":{{"kind":"main"}}}},
            {{"id":"audio","transport":"t",
              "chain":[{},{{"id":"pa","type":"pan","params":{{"pan":0.5}}}}],"output":{{"kind":"main"}}}}]}},
        "instruments":[{SYNTH}],
        "voices":[{{"assetId":"a","voiceId":"{voice}","startRenderFrame":4800,"stripId":"audio"}}],
        "events":[
          {{"instrument_id":"syn","frame":4800,"event":{{"kind":"note_on","note":57,"velocity":100}}}},
          {{"instrument_id":"syn","frame":19200,"event":{{"kind":"note_off","note":57}}}},
          {{"instrument_id":"syn","frame":96000,"event":{{"kind":"note_on","note":64,"velocity":100}}}},
          {{"instrument_id":"syn","frame":120000,"event":{{"kind":"note_off","note":64}}}}]}}"#,
        saturator.replace("MOD", "sk"),
        saturator.replace("MOD", "sa"),
    )
}

fn plan(json: &str) -> RenderPlan {
    serde_json::from_str(json).expect("a render plan")
}

fn render(renderer: &mut OfflineRenderer, frames: usize) -> Vec<Frame> {
    let mut out = vec![Frame::ZERO; frames];
    let mut done = 0;
    while done < frames {
        let rendered = renderer
            .render_into(&mut out[done..(done + 512).min(frames)])
            .expect("render");
        assert!(rendered > 0);
        done += rendered;
    }
    out
}

fn stem_of(json: &str, strip: &str) -> Stem {
    let mut renderer = OfflineRenderer::new(&plan(json), &store()).expect("renderer");
    let steps = renderer
        .graph_mut()
        .freezable_steps(strip)
        .expect("freezable");
    let stem = stem_plan(json, strip, steps).expect("stem plan");
    let rendered = render_offline(&stem.plan, &store()).expect("stem render");
    let frames: Vec<Frame> = rendered
        .frames
        .iter()
        .map(|pair| Frame::new(pair[0], pair[1]))
        .collect();
    Stem::new(&stem.key, rendered.rate, steps, &frames)
}

fn largest_difference(left: &[Frame], right: &[Frame]) -> f32 {
    left.iter()
        .zip(right)
        .map(|(l, r)| (l.left - r.left).abs().max((l.right - r.right).abs()))
        .fold(0.0, f32::max)
}

#[test]
fn a_stem_plan_keeps_the_strip_its_voices_and_its_instrument() {
    let keys = stem_plan(&plan_json(3.0, "v1"), "keys", 1).expect("keys");
    assert_eq!(keys.plan.program.strips.len(), 1);
    assert_eq!(keys.plan.program.strips[0].chain.len(), 1);
    assert!(keys.plan.voices.is_empty());
    assert_eq!(
        (keys.plan.instruments.len(), keys.plan.events.len()),
        (1, 4)
    );
    let audio = stem_plan(&plan_json(3.0, "v1"), "audio", 1).expect("audio");
    assert_eq!(audio.plan.voices.len(), 1);
    assert!(audio.plan.instruments.is_empty() && audio.plan.events.is_empty());
    assert!(
        matches!(stem_plan(&plan_json(3.0, "v1"), "keys", 3), Err(error) if error.starts_with("freeze_stem_stale"))
    );
}

#[test]
fn a_key_changes_with_the_sound_only() {
    let key = |drive: f64, voice: &str, strip: &str| {
        stem_plan(&plan_json(drive, voice), strip, 1)
            .expect("plan")
            .key
    };
    assert_eq!(
        key(3.0, "v1", "audio"),
        key(3.0, "v2", "audio"),
        "a voice's id is no part of the sound"
    );
    assert_ne!(key(3.0, "v1", "audio"), key(5.0, "v1", "audio"));
    assert_ne!(key(3.0, "v1", "audio"), key(3.0, "v1", "keys"));
    let played = plan_json(3.0, "v1").replace(r#""epoch":7"#, r#""epoch":8"#);
    assert_eq!(
        stem_plan(&played, "audio", 1).expect("plan").key,
        key(3.0, "v1", "audio"),
        "a transport's new playback is no part of the sound"
    );
}

#[test]
fn a_frozen_strip_sounds_as_it_does_live() {
    let json = plan_json(3.0, "v1");
    let live = render(
        &mut OfflineRenderer::new(&plan(&json), &store()).expect("live"),
        DURATION as usize,
    );
    let mut frozen = OfflineRenderer::new(&plan(&json), &store()).expect("frozen");
    for strip in ["keys", "audio"] {
        let stem = stem_of(&json, strip);
        frozen
            .graph_mut()
            .freeze_strip(strip, Arc::new(stem))
            .expect("freeze");
    }
    let heard = render(&mut frozen, DURATION as usize);
    // Both strips are frozen from the first chunk: the fade in mixes two equal sounds.
    let difference = largest_difference(&live, &heard);
    assert!(
        difference < 1e-4,
        "frozen differs from live by {difference}"
    );
    let states = frozen.graph_mut().frozen_strips();
    assert_eq!(states.len(), 2);
    assert!(states.iter().all(|state| state.mix == 1.0));
}

#[test]
fn a_thawed_strip_plays_live_again_after_its_fade() {
    let json = plan_json(3.0, "v1");
    let live = render(
        &mut OfflineRenderer::new(&plan(&json), &store()).expect("live"),
        DURATION as usize,
    );
    let mut frozen = OfflineRenderer::new(&plan(&json), &store()).expect("frozen");
    frozen
        .graph_mut()
        .freeze_strip("keys", Arc::new(stem_of(&json, "keys")))
        .expect("freeze");
    // Frozen through the first note; thawed at 0.5 s, before the second (at 2 s), once the fade (1 s) is over.
    let mut heard = render(&mut frozen, 24_000);
    frozen.graph_mut().thaw_strip("keys").expect("thaw");
    heard.extend(render(&mut frozen, DURATION as usize - 24_000));
    // Exact through the freeze and the thaw's fade; the second note, played by the instrument after its rest, is
    // the same note at another phase of its free-running oscillator: the same level, not the same samples.
    let exact = largest_difference(&live[..96_000], &heard[..96_000]);
    assert!(exact < 1e-4, "thawed differs from live by {exact}");
    let rms = |frames: &[Frame]| {
        (frames.iter().map(|f| f.left * f.left).sum::<f32>() / frames.len() as f32).sqrt()
    };
    let (live_note, heard_note) = (rms(&live[96_000..120_000]), rms(&heard[96_000..120_000]));
    assert!(live_note > 0.01, "the second note sounds");
    assert!(
        (live_note - heard_note).abs() / live_note < 0.01,
        "{live_note} vs {heard_note}"
    );
    assert!(frozen.graph_mut().frozen_strips().is_empty());
}

#[test]
fn a_stale_stem_is_refused() {
    let json = plan_json(3.0, "v1");
    let mut renderer = OfflineRenderer::new(&plan(&json), &store()).expect("renderer");
    let stem = Stem::new("k", RATE, 2, &[Frame::ZERO; 8]);
    assert!(
        matches!(renderer.graph_mut().freeze_strip("keys", Arc::new(stem)), Err(error) if error.starts_with("freeze_stem_stale"))
    );
}

#[test]
fn a_reverb_and_what_follows_stay_live() {
    let json = plan_json(3.0, "v1").replace(
        r#"{"id":"sk","type":"dsp","effect":"saturator","params":{"drive_db":3}}"#,
        r#"{"id":"sk","type":"dsp","effect":"saturator","params":{"drive_db":3}},{"id":"rv","type":"dsp","effect":"reverb"}"#,
    );
    let mut renderer = OfflineRenderer::new(&plan(&json), &store()).expect("renderer");
    assert_eq!(renderer.graph_mut().freezable_steps("keys"), Ok(1));
}

#[test]
fn a_job_renders_a_stem_slice_by_slice() {
    use crate::freeze_store::StemJob;
    let json = plan_json(3.0, "v1");
    let whole = stem_of(&json, "audio");
    let mut job = StemJob::new(&json, "audio", 1, |_| Ok(store())).expect("job");
    assert_eq!(job.key(), &*whole.key);
    assert_eq!(job.bytes(), whole.bytes());
    while !job.advance(1_000).expect("advance") {}
    let stem = job.finish();
    assert_eq!(stem.frames(), whole.frames());
    assert_eq!(stem.bytes(), whole.bytes());
}

#[test]
fn renders_queue_a_stem_once_and_keep_it_when_whole() {
    use crate::freeze_store::{Renders, offer_strip, status};
    let json = plan_json(3.0, "v1");
    let mut renderer = OfflineRenderer::new(&plan(&json), &store()).expect("renderer");
    let mut renders = Renders::default();
    assert_eq!(renderer.graph_mut().freezable_steps("audio"), Ok(1));
    let offered = offer_strip(&mut renders, 1, &json, "audio", |_| Ok(store())).expect("offer");
    let key = offered["key"].as_str().expect("key").to_string();
    assert_eq!(offered["ready"], false);
    let again = offer_strip(&mut renders, 1, &json, "audio", |_| Ok(store())).expect("again");
    assert_eq!(again["key"], key.as_str());
    assert_eq!(
        renders.reports().len(),
        1,
        "a render under way is not queued twice"
    );
    while let Some((taken, mut job)) = renders.take_next() {
        let whole = job.advance(24_000).expect("advance");
        renders.put_back(&taken, job, whole);
    }
    assert!(renders.reports()[0].ready);
    let stem = renders.stem(&key).expect("kept");
    renderer
        .graph_mut()
        .freeze_strip("audio", stem)
        .expect("freeze");
    // The render thread takes the stem at its next block.
    render(&mut renderer, 512);
    let report = status(renderer.graph_mut(), &renders);
    assert_eq!(report["frozen"][0]["strip_id"], "audio");
    assert_eq!(report["renders"][0]["ready"], true);
    let ready = offer_strip(&mut renders, 1, &json, "audio", |_| Ok(store())).expect("ready");
    assert_eq!(ready["ready"], true);
    renders.retain(&[]);
    assert!(renders.stem(&key).is_err() && renders.reports().is_empty());
}

#[test]
fn a_frozen_strip_whose_frozen_part_changes_plays_live_again() {
    let json = plan_json(3.0, "v1");
    let mut renderer = OfflineRenderer::new(&plan(&json), &store()).expect("renderer");
    for strip in ["keys", "audio"] {
        renderer
            .graph_mut()
            .freeze_strip(strip, Arc::new(stem_of(&json, strip)))
            .expect("freeze");
    }
    render(&mut renderer, 512);
    // The audio strip's saturator is driven harder; the keys strip's volume, after its frozen part, changes too.
    let changed = plan(
        &plan_json(5.0, "v1")
            .replace(
                r#""id":"sk","type":"dsp","effect":"saturator","params":{"drive_db":5}"#,
                r#""id":"sk","type":"dsp","effect":"saturator","params":{"drive_db":3}"#,
            )
            .replace(r#""gain_db":-6"#, r#""gain_db":-3"#),
    );
    renderer.graph_mut().apply(changed.program).expect("apply");
    render(&mut renderer, 512);
    let frozen = renderer.graph_mut().frozen_strips();
    let keys = frozen
        .iter()
        .find(|strip| strip.strip_id == "keys")
        .expect("keys stays frozen");
    assert_eq!(keys.mix, 1.0);
    let audio = frozen
        .iter()
        .find(|strip| strip.strip_id == "audio")
        .expect("audio fades out");
    assert!(
        audio.mix < 1.0,
        "the changed strip fades back to live: {}",
        audio.mix
    );
}
