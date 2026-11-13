use std::collections::HashMap;

use crate::components::AtomeLocalTransform;
use crate::record_pose::RecordPose;
use crate::scroll_area::*;
use crate::scroll_motion::*;

const MOTION: ScrollMotionSpec = ScrollMotionSpec {
    velocity_blend: 0.5,
    min_velocity_px_per_ms: 0.02,
    max_velocity_px_per_ms: 6.0,
    friction_per16_ms: 0.968_475_3,
    release_window_ms: 80.0,
    rubber: 0.55,
    bounce_spring_per_ms: 0.012,
};

fn list(offset: f64) -> ScrollMotion {
    ScrollMotion::new(MOTION, 400.0, 1000.0, offset)
}

fn run(motion: &mut ScrollMotion, from: f64) -> (f64, u32) {
    let mut now = from;
    let mut frames = 0;
    while motion.step(now) {
        now += 16.0;
        frames += 1;
        assert!(frames < 2000, "the list never comes to rest");
    }
    (now, frames)
}

#[test]
fn a_dragged_list_follows_the_finger_and_less_and_less_past_its_top() {
    let mut motion = list(100.0);
    motion.press(300.0, 0.0);
    motion.drag(260.0, 16.0);
    assert_eq!(motion.offset(), 140.0);
    assert_eq!(motion.stretch(), 0.0);
    motion.drag(500.0, 32.0);
    assert_eq!(motion.offset(), 0.0);
    // 100 px past the top: (1 - 1 / (100·0.55/400 + 1))·400 ≈ 48.4 px shown.
    assert!(
        (motion.stretch() - 48.35).abs() < 0.05,
        "{}",
        motion.stretch()
    );
    assert!((motion.shown() + 48.35).abs() < 0.05);
}

#[test]
fn released_stretched_it_springs_back_to_its_end() {
    let mut motion = list(0.0);
    motion.press(300.0, 0.0);
    motion.drag(500.0, 400.0);
    motion.release(500.0);
    let (_, frames) = run(&mut motion, 1000.0);
    assert_eq!(motion.stretch(), 0.0);
    assert_eq!(motion.offset(), 0.0);
    // Settled in about half a second (critically damped, ω = 0.012/ms).
    assert!((20..60).contains(&frames), "{frames}");
}

#[test]
fn a_flick_glides_on_slowing_down_and_a_rested_finger_throws_nothing() {
    let mut motion = list(100.0);
    motion.press(300.0, 0.0);
    for step in 1..=5 {
        motion.drag(300.0 - f64::from(step) * 16.0, f64::from(step) * 16.0);
    }
    motion.release(85.0);
    assert!(motion.is_gliding());
    let start = motion.offset();
    let (_, frames) = run(&mut motion, 1000.0);
    assert!(motion.offset() > start + 100.0);
    assert!(frames > 60, "a glide lasts {frames} frames");

    let mut rested = list(100.0);
    rested.press(300.0, 0.0);
    rested.drag(200.0, 16.0);
    rested.release(200.0);
    assert!(!rested.is_moving());
    assert_eq!(rested.offset(), 200.0);
}

#[test]
fn a_glide_reaching_an_end_runs_into_it_and_comes_back() {
    let mut motion = list(950.0);
    motion.press(300.0, 0.0);
    motion.drag(250.0, 16.0);
    motion.drag(200.0, 32.0);
    motion.release(40.0);
    let mut peak: f64 = 0.0;
    let mut now = 1000.0;
    while motion.step(now) {
        peak = peak.min(motion.stretch());
        now += 16.0;
    }
    assert!(peak < -1.0, "the glide ran past the end by {peak}");
    assert_eq!(motion.offset(), 1000.0);
    assert_eq!(motion.stretch(), 0.0);
}

#[test]
fn a_wheel_moves_within_the_range_and_settles_when_it_stops() {
    let mut motion = list(990.0);
    motion.wheel(53.0);
    assert_eq!(motion.offset(), 1000.0);
    assert!(motion.step(0.0));
    assert!(motion.step(50.0));
    assert!(!motion.step(100.0));
}

#[test]
fn a_press_catches_a_glide_and_a_jump_takes_the_described_offset() {
    let mut motion = list(100.0);
    motion.press(300.0, 0.0);
    motion.drag(200.0, 16.0);
    motion.release(20.0);
    assert!(motion.catch_glide());
    assert!(!motion.is_moving());
    motion.describe(MOTION, 400.0, 1000.0, 600.0, false);
    assert_eq!(motion.offset(), 200.0);
    motion.describe(MOTION, 400.0, 1000.0, 600.0, true);
    assert_eq!(motion.offset(), 600.0);
}

#[test]
fn a_press_on_a_glide_that_looks_still_stops_it_and_is_a_tap() {
    let mut motion = list(100.0);
    motion.press(300.0, 0.0);
    motion.drag(296.0, 100.0);
    motion.release(104.0);
    assert!(motion.is_gliding());
    assert!(!motion.catch_glide());
    assert!(!motion.is_moving());
}

fn pose(y: f32, clip: [f32; 4]) -> RecordPose {
    RecordPose {
        position: [10.0, y],
        size: [100.0, 40.0],
        local: AtomeLocalTransform::new([1.0, 1.0], 0.0, [0.5, 0.5]),
        clip: Some(clip),
        clip_rotation: 0.0,
        rounded: vec![[0.0, 100.0, 300.0, 400.0, 3.0, 3.0, 3.0, 3.0]],
        fades: Vec::new(),
    }
}

#[test]
fn a_record_moves_with_its_list_and_keeps_the_clips_it_lies_in() {
    let viewport = ScrollClip {
        rect: Some([0.0, 100.0, 300.0, 400.0]),
        rounded: vec![[0.0, 100.0, 300.0, 400.0, 3.0, 3.0, 3.0, 3.0]],
        fades: Vec::new(),
    };
    let card = ScrollClip {
        rect: Some([0.0, 180.0, 300.0, 100.0]),
        ..ScrollClip::default()
    };
    let spec = ScrollRecordSpec {
        id: "row".into(),
        opacity: 0.8,
        role: ScrollRecordRole::Content,
        area: None,
        chain: vec![
            ScrollChainLink {
                area: None,
                clip: Some(viewport),
            },
            ScrollChainLink {
                area: Some("list".into()),
                clip: Some(card),
            },
        ],
    };
    let mut areas = HashMap::new();
    let mut area = AreaState::new(ScrollAreaSpec {
        id: "list".into(),
        motion: MOTION,
        area_box: [0.0, 100.0, 300.0, 400.0],
        max: 1000.0,
        offset: 0.0,
        jump: false,
        edge_mask: Some([60.0, 2.2]),
        thumb_travel: 0.0,
    });
    area.motion_mut().wheel(50.0);
    areas.insert("list".to_string(), area);
    let base = pose(200.0, [0.0, 180.0, 300.0, 100.0]);
    let (shown, opacity) =
        present_record(&spec, &base, &[("list".to_string(), 0.0)], &areas).unwrap();
    assert_eq!(shown.position, [10.0, 150.0]);
    // The card's clip moved with the content, cut by the list's viewport.
    assert_eq!(shown.clip, Some([0.0, 130.0, 300.0, 100.0]));
    assert_eq!(shown.rounded.len(), 1);
    // Scrolled from its top, the list's top edge now fades, its bottom one too.
    assert_eq!(
        shown.fades,
        vec![[0.0, 100.0, 300.0, 400.0, 60.0, 60.0, 2.2]]
    );
    assert_eq!(opacity, 0.8);
}

// User, 12 Nov. 2026: a row's waveform stood still while its list moved. Its base had been read with the list at
// its top (offset 0); the tree was then described with the list revealed at 256, its clips laid there. Moved from
// the base's offset, those clips missed the record a whole jump away: judged out of view, it was never laid again.
#[test]
fn a_base_kept_from_an_earlier_description_is_cut_by_the_clips_where_they_now_lie() {
    let card = ScrollClip {
        rect: Some([0.0, 487.0, 300.0, 40.0]),
        ..ScrollClip::default()
    };
    let spec = ScrollRecordSpec {
        id: "thumbnail".into(),
        opacity: 1.0,
        role: ScrollRecordRole::Content,
        area: None,
        chain: vec![
            ScrollChainLink {
                area: None,
                clip: Some(ScrollClip {
                    rect: Some([0.0, 480.0, 300.0, 210.0]),
                    ..ScrollClip::default()
                }),
            },
            ScrollChainLink {
                area: Some("list".into()),
                clip: Some(card),
            },
        ],
    };
    let mut areas = HashMap::new();
    let mut area = AreaState::new(ScrollAreaSpec {
        id: "list".into(),
        motion: MOTION,
        area_box: [0.0, 480.0, 300.0, 210.0],
        max: 1000.0,
        offset: 256.0,
        jump: false,
        edge_mask: None,
        thumb_travel: 0.0,
    });
    area.motion_mut().wheel(-108.0);
    areas.insert("list".to_string(), area);
    // Read at offset 0: 256 px lower than where the description lays it.
    let base = pose(743.0, [0.0, 743.0, 300.0, 40.0]);
    let (shown, _) = present_record(&spec, &base, &[("list".to_string(), 0.0)], &areas).unwrap();
    // Shown at offset 148 from either description: 743 − 148 = 487 + (256 − 148) = 595.
    assert_eq!(shown.position, [10.0, 595.0]);
    assert_eq!(shown.clip, Some([0.0, 595.0, 300.0, 40.0]));
}
