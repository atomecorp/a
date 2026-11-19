// A zone's own envelope (a bank region's ampeg_*) shapes its voices instead of
// the instrument's settings; a zone without one keeps the instrument's.

mod support;
use atome_instrument::{Keymap, NoteEvent, SampleData, Segment, Zone, ZoneEnvelope};
use support::*;

const SLOW: ZoneEnvelope = ZoneEnvelope {
    attack_ms: 89.0,
    decay_ms: 1.0,
    sustain: 1.0,
    release_ms: 89.0,
};

// Two zones on one constant-level sample: key 60 its own slow attack, key 62 the instrument's.
fn two_zones() -> (Vec<Zone>, Vec<SampleData>) {
    let data = vec![SampleData::mono(level(0.5, 1.0), RATE)];
    let take = Segment::whole(0, data[0].frames(), 60);
    let mut slow = Zone::new(60, 60, vec![take]);
    slow.envelope = Some(SLOW);
    let plain = Zone::new(62, 62, vec![Segment { root: 62, ..take }]);
    (vec![slow, plain], data)
}

// Frames from the note until the output first reaches 90 % of its steady level.
fn onset(note: u8) -> usize {
    let (zones, data) = two_zones();
    let mut sampler = sampler(zones, bank(data));
    let (left, _) = render(&mut sampler, 24_000, &[NoteEvent::note_on(0, note, 1.0)]);
    let steady = left[20_000].abs();
    assert!(steady > 0.1, "note {note} sounds ({steady})");
    left.iter()
        .position(|value| value.abs() >= 0.9 * steady)
        .expect("the note reaches its level")
}

#[test]
fn a_zone_envelope_sets_its_own_onset_and_the_other_keeps_the_instruments() {
    let (slow, fast) = (onset(60), onset(62));
    // 90 % of an 89 ms linear attack is about 3845 frames at 48 kHz; the instrument's 0.1 ms, a few.
    assert!((3_700..4_000).contains(&slow), "zone onset {slow}");
    assert!(fast < 64, "instrument onset {fast}");
}

#[test]
fn a_zone_envelope_out_of_range_is_refused() {
    let (mut zones, data) = two_zones();
    zones[0].envelope = Some(ZoneEnvelope {
        sustain: 1.5,
        ..SLOW
    });
    let error = Keymap::new(zones, &bank(data), 89).err().expect("refused");
    assert!(error.contains("sustain"), "{error}");
}

#[test]
fn the_tail_covers_the_longest_zone_release() {
    use atome_dsp::Processor;
    let (mut zones, data) = two_zones();
    zones[0].envelope = Some(ZoneEnvelope {
        release_ms: 2_000.0,
        ..SLOW
    });
    let sampler = sampler(zones, bank(data));
    assert_eq!(sampler.tail_frames(), 96_000);
}
