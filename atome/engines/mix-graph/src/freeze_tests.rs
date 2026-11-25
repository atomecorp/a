// R-370: a stem's 24-bit packing and the render thread's fades (freeze.rs).

use super::{FADE_IN_SECONDS, FreezeSlot, Stem};
use kira::Frame;
use std::sync::Arc;

const RATE: u32 = 48_000;

fn ramp(frames: usize) -> Vec<Frame> {
    (0..frames)
        .map(|index| {
            Frame::new(
                index as f32 / frames as f32,
                -(index as f32) / frames as f32,
            )
        })
        .collect()
}

#[test]
fn a_stem_keeps_its_samples_to_24_bits() {
    let source = ramp(4_096);
    let stem = Stem::new("k", RATE, 1, &source);
    assert_eq!(stem.frames(), 4_096);
    assert_eq!(stem.bytes(), 4_096 * 6);
    for (index, frame) in source.iter().enumerate() {
        let read = stem.frame(index);
        assert!((read.left - frame.left).abs() < 2e-7, "{index}");
        assert!((read.right - frame.right).abs() < 2e-7, "{index}");
    }
    assert_eq!(stem.frame(4_096), Frame::ZERO);
}

// Where the timeline stands: frame `i` of the chunk is `base + i` frames from its start.
fn at(base: usize) -> impl Fn(usize) -> Option<f64> {
    move |index| Some((base + index) as f64 / f64::from(RATE))
}

#[test]
fn a_stem_fades_in_then_replaces_the_live_sound() {
    let slot = FreezeSlot::default();
    let constant = vec![Frame::new(0.5, 0.5); 48_000];
    slot.offer_freeze(Arc::new(Stem::new("k", RATE, 2, &constant)))
        .expect("offer");
    let chunk = slot.begin();
    // Not yet skipped: the live steps still run while it fades in.
    assert_eq!((chunk.skipped, chunk.replaced), (None, Some(2)));
    let fade = (FADE_IN_SECONDS * f64::from(RATE)) as usize + 1;
    let mut work = vec![Frame::ZERO; 512];
    slot.blend(&mut work, at(0));
    assert!(work[0].left < 0.01 && work[511].left > 0.2);
    let mut done = 512;
    while done < fade {
        let mut work = vec![Frame::ZERO; 512];
        slot.begin();
        slot.blend(&mut work, at(done));
        done += 512;
    }
    assert_eq!(slot.mix(), 1.0);
    assert_eq!(slot.begin().skipped, Some(2));
    assert_eq!(slot.heard().as_deref(), Some("k"));
}

#[test]
fn a_thaw_fades_out_over_a_second_then_forgets_the_stem() {
    let slot = FreezeSlot::default();
    slot.offer_freeze(Arc::new(Stem::new(
        "k",
        RATE,
        1,
        &vec![Frame::new(0.5, 0.5); 96_000],
    )))
    .expect("offer");
    let mut done = 0;
    for _ in 0..4 {
        slot.begin();
        slot.blend(&mut vec![Frame::ZERO; 512], at(done));
        done += 512;
    }
    slot.offer_thaw().expect("thaw");
    assert_eq!(
        slot.begin().skipped,
        None,
        "the live steps run again at once"
    );
    // Half a second in, half the stem is heard: the live sound (silence here) takes the rest.
    let mut work = vec![Frame::ZERO; 24_000];
    for chunk in work.chunks_mut(512) {
        slot.begin();
        slot.blend(chunk, at(done));
        done += chunk.len();
    }
    assert!((slot.mix() - 0.5).abs() < 0.01, "{}", slot.mix());
    let mut rest = vec![Frame::ZERO; 25_000];
    for chunk in rest.chunks_mut(512) {
        slot.begin();
        slot.blend(chunk, at(done));
        done += chunk.len();
    }
    assert_eq!(slot.mix(), 0.0);
    assert_eq!(slot.heard(), None);
    assert_eq!(slot.begin(), Default::default());
}

#[test]
fn a_stopped_timeline_silences_the_stem() {
    let slot = FreezeSlot::default();
    slot.offer_freeze(Arc::new(Stem::new(
        "k",
        RATE,
        1,
        &vec![Frame::new(0.5, 0.5); 4_096],
    )))
    .expect("offer");
    slot.begin();
    let mut work = vec![Frame::new(0.25, 0.25); 512];
    slot.blend(&mut work, |_| None);
    // The live sound fades out as the (silent) stem fades in.
    assert!(work[511].left < 0.25);
    assert!(
        work.iter()
            .all(|frame| frame.left >= 0.0 && frame.left <= 0.25)
    );
}
