// What banks (SFZ) ask of a zone: a one-shot plays to its end whatever the key
// does; keyswitches choose which zones sound and play nothing themselves; a
// zone's filter colours its voices, its cutoff following the key; a controller's
// value chooses the zones waiting for it.

mod support;
use atome_dsp::Processor;
use atome_dsp::biquad::Shape;
use atome_instrument::{
    EventKind, Keymap, NoteEvent, SampleData, Sampler, Segment, Switches, Zone, ZoneController,
    ZoneFilter,
};
use support::*;

fn switched(zones: Vec<Zone>, bank: atome_instrument::SampleBank, switches: Switches) -> Sampler {
    let keymap = Keymap::new(zones, &bank, 89)
        .unwrap()
        .with_switches(Some(switches))
        .unwrap();
    let mut sampler = Sampler::new(keymap, bank, 16);
    sampler.prepare(RATE, 512);
    sampler
}

#[test]
fn a_one_shot_zone_plays_to_its_end_after_the_key_is_let_go() {
    let data = SampleData::mono(level(0.5, 0.5), RATE);
    let mut zone = Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 60)]);
    zone.one_shot = true;
    let mut sampler = sampler(vec![zone], bank(vec![data]));
    let (left, _) = render(
        &mut sampler,
        36_000,
        &[
            NoteEvent::note_on(0, 60, 1.0),
            NoteEvent::note_off(2400, 60),
        ],
    );
    assert!(
        left[20_000] > 0.45,
        "still sounding long after the key went up: {}",
        left[20_000]
    );
    assert!(left[30_000].abs() < 1.0e-4, "silent once its take ended");
    assert_eq!(
        sampler.sounding_voices(),
        0,
        "the take's end frees the voice"
    );
}

#[test]
fn a_plain_zone_stops_at_the_key_release() {
    let data = SampleData::mono(level(0.5, 0.5), RATE);
    let mut sampler = sampler(
        vec![Zone::new(
            0,
            127,
            vec![Segment::whole(0, data.frames(), 60)],
        )],
        bank(vec![data]),
    );
    let (left, _) = render(
        &mut sampler,
        36_000,
        &[
            NoteEvent::note_on(0, 60, 1.0),
            NoteEvent::note_off(2400, 60),
        ],
    );
    assert!(left[20_000].abs() < 1.0e-4, "released: {}", left[20_000]);
}

#[test]
fn keyswitches_choose_the_zone_that_sounds_and_play_nothing() {
    let quiet = SampleData::mono(level(0.25, 1.0), RATE);
    let loud = SampleData::mono(level(0.75, 1.0), RATE);
    let mut legato = Zone::new(48, 72, vec![Segment::whole(0, quiet.frames(), 60)]);
    legato.switch = Some(24);
    let mut staccato = Zone::new(48, 72, vec![Segment::whole(1, loud.frames(), 60)]);
    staccato.switch = Some(25);
    let mut sampler = switched(
        vec![legato, staccato],
        bank(vec![quiet, loud]),
        Switches {
            low: 24,
            high: 25,
            default: 24,
        },
    );
    let events = [
        NoteEvent::note_on(0, 60, 1.0),
        NoteEvent::note_off(4800, 60),
        NoteEvent::note_on(12_000, 25, 1.0),
        NoteEvent::note_off(12_100, 25),
        NoteEvent::note_on(14_400, 60, 1.0),
        NoteEvent::note_off(19_200, 60),
    ];
    let (left, _) = render(&mut sampler, 26_000, &events);
    assert!(
        (left[2400] - 0.25).abs() < 0.02,
        "the default switch plays the first zone: {}",
        left[2400]
    );
    assert!(
        left[12_050].abs() < 1.0e-4,
        "a keyswitch sounds nothing: {}",
        left[12_050]
    );
    assert!(
        (left[16_800] - 0.75).abs() < 0.02,
        "the second switch plays the other zone alone: {}",
        left[16_800]
    );
}

#[test]
fn a_switch_outside_the_range_is_refused() {
    let data = SampleData::mono(level(0.5, 0.1), RATE);
    let mut zone = Zone::new(48, 72, vec![Segment::whole(0, data.frames(), 60)]);
    zone.switch = Some(30);
    let bank = bank(vec![data]);
    let refused = Keymap::new(vec![zone.clone()], &bank, 89)
        .unwrap()
        .with_switches(Some(Switches {
            low: 24,
            high: 25,
            default: 24,
        }));
    assert!(refused.is_err());
    assert!(
        Keymap::new(vec![zone], &bank, 89)
            .unwrap()
            .with_switches(None)
            .is_err(),
        "a switch needs a range"
    );
}

fn filtered(cutoff: f32, note: u8) -> f32 {
    let data = SampleData::mono(sine(4000.0, 1.0), RATE);
    let mut zone = Zone::new(0, 127, vec![Segment::whole(0, data.frames(), note)]);
    zone.filter = Some(ZoneFilter {
        shape: Shape::LowPass,
        cutoff_hz: cutoff,
        q: std::f32::consts::FRAC_1_SQRT_2,
        key_track_cents: 100.0,
        key_center: 60,
        velocity_track_cents: 0.0,
    });
    let mut sampler = sampler(vec![zone], bank(vec![data]));
    let (left, _) = render(&mut sampler, 24_000, &[NoteEvent::note_on(0, note, 1.0)]);
    peak(&left[12_000..24_000])
}

#[test]
fn a_zone_filter_cuts_above_its_cutoff_and_follows_the_key() {
    // The source sine peaks at 0.5.
    let open = filtered(20_000.0, 60);
    assert!(open > 0.47, "far below the cutoff: untouched ({open})");
    let low = filtered(500.0, 60);
    assert!(
        low < 0.015,
        "4 kHz through a 500 Hz low-pass, three octaves (−36 dB): {low}"
    );
    // A key tracking of 100 cents per key: three octaves up opens the cutoff to 4 kHz (−3 dB there).
    let tracked = filtered(500.0, 96);
    assert!(
        (tracked - 0.5 * std::f32::consts::FRAC_1_SQRT_2).abs() < 0.04,
        "the cutoff followed the key: {tracked}"
    );
}

// A take that does not follow the key (an EXS zone's « Pitch » off): the same pitch on every key.
// The crossings are counted over 0.4 s: a resolution of 2.5 Hz.
fn heard_on(note: u8, key_track: bool) -> f32 {
    let data = SampleData::mono(sine(440.0, 1.0), RATE);
    let take = Segment {
        key_track,
        ..Segment::whole(0, data.frames(), 69)
    };
    let mut sampler = sampler(vec![Zone::new(0, 127, vec![take])], bank(vec![data]));
    let (left, _) = render(&mut sampler, 24_000, &[NoteEvent::note_on(0, note, 1.0)]);
    frequency(&left[2_400..21_600])
}

#[test]
fn a_take_off_the_key_plays_at_its_own_pitch_on_every_key() {
    for note in [45, 69, 93] {
        let heard = heard_on(note, false);
        assert!((heard - 440.0).abs() < 3.0, "key {note}: {heard} Hz");
    }
    let followed = heard_on(81, true);
    assert!(
        (followed - 880.0).abs() < 3.0,
        "a take on the key follows it: {followed} Hz"
    );
}

// Zones chosen by a controller (an EXS group by the sustain pedal, SFZ locc/hicc): the controller's value at
// each note chooses which sounds; before any is sent it is MIDI's resting value (CC 64 at 0, CC 7 at 100).
fn chosen_by(number: u8, ranges: [[u8; 2]; 2]) -> Sampler {
    let data = vec![
        SampleData::mono(sine(440.0, 1.0), RATE),
        SampleData::mono(sine(880.0, 1.0), RATE),
    ];
    let zones = ranges
        .iter()
        .enumerate()
        .map(|(sample, range)| {
            let mut zone = Zone::new(
                0,
                127,
                vec![Segment::whole(sample, data[sample].frames(), 69)],
            );
            zone.controller = Some(ZoneController {
                number,
                low: range[0],
                high: range[1],
            });
            zone
        })
        .collect();
    sampler(zones, bank(data))
}

fn controller(number: u8, value: f32) -> NoteEvent {
    NoteEvent {
        offset: 0,
        kind: EventKind::Controller { number, value },
    }
}

#[test]
fn a_controller_chooses_the_zone_each_note_plays() {
    let mut pedal = chosen_by(64, [[0, 63], [64, 127]]);
    let (up, _) = render(&mut pedal, 24_000, &[NoteEvent::note_on(0, 69, 1.0)]);
    assert!(
        (frequency(&up[2_400..21_600]) - 440.0).abs() < 3.0,
        "pedal up at rest"
    );
    let (down, _) = render(
        &mut pedal,
        24_000,
        &[
            NoteEvent::note_off(0, 69),
            controller(64, 1.0),
            NoteEvent::note_on(12_000, 69, 1.0),
        ],
    );
    assert!(
        (frequency(&down[14_400..23_000]) - 880.0).abs() < 4.0,
        "pedal down: the other zone"
    );
    // CC 7 rests at 100: the zone of 100..127 sounds before any is sent.
    let mut volume = chosen_by(7, [[0, 99], [100, 127]]);
    let (rest, _) = render(&mut volume, 24_000, &[NoteEvent::note_on(0, 69, 1.0)]);
    assert!(
        (frequency(&rest[2_400..21_600]) - 880.0).abs() < 3.0,
        "volume at rest"
    );
}

#[test]
fn a_controller_range_that_is_empty_is_refused() {
    let data = SampleData::mono(level(0.5, 0.1), RATE);
    let mut zone = Zone::new(0, 127, vec![Segment::whole(0, data.frames(), 60)]);
    zone.controller = Some(ZoneController {
        number: 1,
        low: 90,
        high: 10,
    });
    let error = Keymap::new(vec![zone], &bank(vec![data]), 89)
        .err()
        .expect("refused");
    assert!(error.contains("controller"), "{error}");
}
