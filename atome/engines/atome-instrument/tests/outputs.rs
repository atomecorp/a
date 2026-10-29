// Outputs (D-S2): each zone sounds on its own output, side by side in one
// planar buffer; played as a plain processor, every output is summed.

mod support;
use atome_dsp::{Processor, StereoBlock};
use atome_instrument::{Keymap, NoteEvent, SampleData, Segment, Zone};
use support::*;

// Notes 60 (0.25) and 72 (0.5) on outputs 0 and 2: three outputs, the middle one silent.
fn kit() -> atome_instrument::Sampler {
    let data = vec![SampleData::mono(level(0.25, 0.05), RATE), SampleData::mono(level(0.5, 0.05), RATE)];
    let zones = vec![Zone::new(60, 60, vec![Segment::whole(0, data[0].frames(), 60)]),
        Zone::new(72, 72, vec![Segment::whole(1, data[1].frames(), 72)]).output(2)];
    sampler(zones, bank(data))
}

#[test]
fn each_zone_sounds_on_its_output_only() {
    let mut sampler = kit();
    assert_eq!(sampler.outputs(), 3, "one past the highest output a zone names");
    sampler.schedule(NoteEvent::note_on(0, 60, 1.0));
    sampler.schedule(NoteEvent::note_on(100, 72, 1.0));
    let (mut left, mut right) = (vec![0.0; BLOCK * 3], vec![0.0; BLOCK * 3]);
    sampler.process_outputs(&mut left, &mut right, BLOCK);
    let bus = |at: usize| &left[at * BLOCK..(at + 1) * BLOCK];
    assert!((bus(0)[BLOCK - 1] - 0.25).abs() < 0.02, "note 60 on output 1: {}", bus(0)[BLOCK - 1]);
    assert!(bus(1).iter().all(|sample| *sample == 0.0), "output 2 stays silent");
    assert!(bus(2)[..100].iter().all(|sample| *sample == 0.0), "note 72 starts on its frame");
    assert!((bus(2)[BLOCK - 1] - 0.5).abs() < 0.02, "note 72 on output 3: {}", bus(2)[BLOCK - 1]);
    assert_eq!(left, right, "a mono take sits in the middle of every output");
}

#[test]
fn played_as_one_block_every_output_is_summed() {
    let mut sampler = kit();
    sampler.schedule(NoteEvent::note_on(0, 60, 1.0));
    sampler.schedule(NoteEvent::note_on(0, 72, 1.0));
    let (mut left, mut right) = (vec![0.0; BLOCK], vec![0.0; BLOCK]);
    sampler.process(&mut StereoBlock::new(&mut left, &mut right));
    assert!((left[BLOCK - 1] - 0.75).abs() < 0.03, "both zones in the one block: {}", left[BLOCK - 1]);
}

#[test]
fn an_output_past_sixteen_is_refused() {
    let data = vec![SampleData::mono(level(0.25, 0.05), RATE)];
    let bank = bank(data);
    let zone = Zone::new(60, 60, vec![Segment::whole(0, 2400, 60)]).output(16);
    let error = Keymap::new(vec![zone], &bank, 89).err().expect("refused");
    assert!(error.contains("output 16 past the 16"), "{error}");
}
