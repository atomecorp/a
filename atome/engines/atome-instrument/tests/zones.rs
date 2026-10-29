// Zones: the takes of a pile alternate by their rule, mix at their levels or
// share the velocity range; a zone cuts the zones it ticks, one way.

mod support;
use atome_instrument::{Draw, NoteEvent, SampleData, Segment, Stack, Zone};
use support::*;

// Three takes told apart by their level: 0.1, 0.2, 0.3.
fn three_levels() -> (Vec<Segment>, Vec<SampleData>) {
    let data: Vec<SampleData> = [0.1, 0.2, 0.3].iter().map(|value| SampleData::mono(level(*value, 0.05), RATE)).collect();
    let takes = data.iter().enumerate().map(|(index, sample)| Segment::whole(index, sample.frames(), 60)).collect();
    (takes, data)
}

fn played_levels(zone: Zone, data: Vec<SampleData>, notes: usize) -> Vec<u32> {
    let mut sampler = sampler(vec![zone], bank(data));
    let events: Vec<NoteEvent> = (0..notes).map(|i| NoteEvent::note_on((i * 4800) as u32, 60, 1.0)).collect();
    let (left, _) = render(&mut sampler, notes * 4800, &events);
    (0..notes).map(|i| (left[i * 4800 + 480] * 10.0).round() as u32).collect()
}

#[test]
fn a_cycle_takes_turns_in_order() {
    let (takes, data) = three_levels();
    let zone = Zone::new(60, 60, takes).stack(Stack::Alternate(Draw::Cycle));
    assert_eq!(played_levels(zone, data, 6), vec![1, 2, 3, 1, 2, 3]);
}

#[test]
fn random_without_repeat_never_plays_a_take_twice_in_a_row_and_replays_from_its_seed() {
    let (takes, data) = three_levels();
    let zone = Zone::new(60, 60, takes).stack(Stack::Alternate(Draw::RandomNoRepeat));
    let first = played_levels(zone.clone(), data.clone(), 34);
    assert!(first.windows(2).all(|pair| pair[0] != pair[1]), "{first:?}");
    assert!([1, 2, 3].iter().all(|take| first.contains(take)), "every take comes up");
    assert_eq!(first, played_levels(zone, data, 34), "same seed, same draw");
}

#[test]
fn a_zone_with_few_takes_borrows_its_neighbours() {
    let (takes, data) = three_levels();
    let mut own = Zone::new(60, 60, vec![takes[0]]);
    own.borrow_neighbours = true;
    let below = Zone::new(59, 59, vec![Segment { root: 59, ..takes[1] }]);
    let above = Zone::new(61, 61, vec![Segment { root: 61, ..takes[2] }]);
    let mut sampler = sampler(vec![own, below, above], bank(data));
    let events: Vec<NoteEvent> = (0..3).map(|i| NoteEvent::note_on(i * 4800, 60, 1.0)).collect();
    let (left, _) = render(&mut sampler, 14_400, &events);
    let levels: Vec<u32> = (0..3).map(|i| (left[i * 4800 + 480] * 10.0).round() as u32).collect();
    assert_eq!(levels, vec![1, 2, 3], "its own take, then each neighbour's");
}

#[test]
fn a_mix_plays_every_take_at_its_level() {
    let one = SampleData::mono(level(0.5, 0.2), RATE);
    let zone = Zone::new(60, 60, vec![Segment::whole(0, one.frames(), 60), Segment::whole(1, one.frames(), 60)]).stack(Stack::Mix(vec![0.89, 0.55]));
    let mut sampler = sampler(vec![zone], bank(vec![one.clone(), one]));
    let (left, _) = render(&mut sampler, 4800, &[NoteEvent::note_on(0, 60, 1.0)]);
    assert!((left[480] - 0.5 * (0.89 + 0.55)).abs() < 1.0e-3, "{}", left[480]);
}

#[test]
fn layers_share_the_velocity_range_and_crossfade_at_the_seam() {
    let (takes, data) = three_levels();
    let zone = Zone::new(60, 60, takes[..2].to_vec()).stack(Stack::Layers { crossfade: 8 });
    let at = |velocity: f32| {
        let mut sampler = sampler(vec![zone.clone()], bank(data.clone()));
        let (left, _) = render(&mut sampler, 1024, &[NoteEvent::note_on(0, 60, velocity)]);
        left[480]
    };
    assert!((at(0.1) - 0.1).abs() < 1.0e-3, "soft: the first layer");
    assert!((at(1.0) - 0.2).abs() < 1.0e-3, "hard: the second layer");
    let seam = at(64.0 / 127.0);
    let expected = 0.1 * (std::f32::consts::FRAC_PI_4).cos() + 0.2 * (std::f32::consts::FRAC_PI_4).sin();
    assert!((seam - expected).abs() < 0.02, "on the seam both, equal power: {seam} vs {expected}");
}

#[test]
fn a_zone_cuts_the_zones_it_ticks_one_way() {
    let data = SampleData::mono(level(0.5, 2.0), RATE);
    let mut closed = Segment::whole(0, data.frames(), 42);
    closed.pan = 1.0;
    let mut open = Segment::whole(0, data.frames(), 46);
    open.pan = -1.0;
    let mut closed_zone = Zone::new(42, 42, vec![closed]);
    closed_zone.cuts = vec![1];
    let zones = vec![closed_zone, Zone::new(46, 46, vec![open])];
    let mut sampler = sampler(zones.clone(), bank(vec![data.clone()]));
    let (left, right) = render(&mut sampler, 9600, &[NoteEvent::note_on(0, 46, 1.0), NoteEvent::note_on(4800, 42, 1.0)]);
    assert!(left[4000] > 0.6, "the open hat sounds");
    assert!(left[4800 + 480].abs() < 1.0e-4, "the closed hat cut it within 10 ms");
    assert!(right[4800 + 480] > 0.6, "the closed hat sounds");
    let mut sampler = support::sampler(zones, bank(vec![data]));
    let (left, right) = render(&mut sampler, 9600, &[NoteEvent::note_on(0, 42, 1.0), NoteEvent::note_on(4800, 46, 1.0)]);
    assert!(right[4800 + 480] > 0.6, "the open hat does not cut the closed one");
    assert!(left[4800 + 480] > 0.6);
}
