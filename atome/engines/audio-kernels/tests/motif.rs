// The slice Motif compiled to an edit's pieces (todo/slicer_cahier_2026-11-15.md): lengths exact to the frame,
// gate, roll, reverse, force, chance and every order rejouable from the seed.
use atome_audio_kernels::motif::{Motif, Piece, SliceRange, compile};

const STEP: u64 = 6000;
const FADE: u64 = 144;

fn eight() -> Vec<SliceRange> {
    (0..8)
        .map(|i| SliceRange {
            start: i * 12_000,
            end: (i + 1) * 12_000,
        })
        .collect()
}
fn motif(json: &str) -> Motif {
    serde_json::from_str(json).expect("motif json")
}
fn length(pieces: &[Piece]) -> u64 {
    pieces
        .iter()
        .map(|piece| match piece {
            Piece::Source { start, end, .. } => end - start,
            Piece::Silence { frames } => *frames,
        })
        .sum()
}
// The first source frame each step plays (None for a rest), reading the pieces step by step.
fn heads(pieces: &[Piece], steps: usize) -> Vec<Option<u64>> {
    let mut out = Vec::new();
    let mut at = 0;
    let mut cursor = 0;
    for index in 0..steps as u64 {
        let end = (index + 1) * STEP;
        let mut first = None;
        while at < pieces.len() && cursor < end {
            match &pieces[at] {
                Piece::Source {
                    start,
                    end: stop,
                    reverse,
                    ..
                } => {
                    if first.is_none() {
                        first = Some(if *reverse { *stop } else { *start });
                    }
                    cursor += stop - start;
                }
                Piece::Silence { frames } => cursor += frames,
            }
            at += 1;
        }
        out.push(first);
    }
    out
}

#[test]
fn free_order_plays_each_steps_slice_cut_at_the_step() {
    let m = motif(r#"{"steps":[{"slice":2},{"slice":0},{},{"slice":7}]}"#);
    let pieces = compile(&m, &eight(), 96_000, STEP, FADE).unwrap();
    assert_eq!(length(&pieces), 4 * STEP);
    assert_eq!(
        heads(&pieces, 4),
        vec![Some(24_000), Some(0), None, Some(84_000)]
    );
    // A slice longer than its step is cut there (gate): fade-in, body, fade-out, no silence.
    assert!(
        matches!(pieces[0], Piece::Source { start: 24_000, end: 24_144, ref ramps, .. } if ramps == &vec![[0.0, 1.0]])
    );
    assert!(
        matches!(pieces[2], Piece::Source { start: 29_856, end: 30_000, ref ramps, .. } if ramps == &vec![[1.0, 0.0]])
    );
}

#[test]
fn a_short_slice_is_followed_by_silence_to_the_steps_end() {
    let slices = vec![SliceRange {
        start: 0,
        end: 1000,
    }];
    let pieces = compile(
        &motif(r#"{"steps":[{"slice":0}]}"#),
        &slices,
        96_000,
        STEP,
        FADE,
    )
    .unwrap();
    assert_eq!(length(&pieces), STEP);
    assert_eq!(
        pieces.last(),
        Some(&Piece::Silence {
            frames: STEP - 1000
        })
    );
}

#[test]
fn roll_replays_the_slice_n_times_within_its_step() {
    let pieces = compile(
        &motif(r#"{"steps":[{"slice":1,"roll":3}]}"#),
        &eight(),
        96_000,
        STEP,
        FADE,
    )
    .unwrap();
    assert_eq!(length(&pieces), STEP);
    let starts: Vec<u64> = pieces
        .iter()
        .filter_map(|piece| match piece {
            Piece::Source { start, ramps, .. } if ramps == &vec![[0.0, 1.0]] => Some(*start),
            _ => None,
        })
        .collect();
    assert_eq!(starts, vec![12_000, 12_000, 12_000]);
}

#[test]
fn reverse_plays_the_slices_end_first_and_force_is_a_gain() {
    let pieces = compile(
        &motif(r#"{"steps":[{"slice":0,"reverse":true,"force":64,"pitch":5}]}"#),
        &eight(),
        96_000,
        STEP,
        FADE,
    )
    .unwrap();
    // Pitched: one piece, the slice's last step-length of frames, turned.
    assert_eq!(pieces.len(), 1);
    let Piece::Source {
        start,
        end,
        reverse,
        gain_db,
        pitch,
        ..
    } = &pieces[0]
    else {
        panic!("source piece")
    };
    assert_eq!((*start, *end, *reverse, *pitch), (6000, 12_000, true, 5.0));
    assert!((gain_db - 20.0 * (64.0_f64 / 127.0).log10()).abs() < 1e-9);
}

#[test]
fn swing_delays_odd_steps_and_keeps_the_motifs_length() {
    let pieces = compile(
        &motif(r#"{"steps":[{"slice":0},{"slice":1},{"slice":2},{"slice":3}],"swing":50}"#),
        &eight(),
        96_000,
        STEP,
        FADE,
    )
    .unwrap();
    assert_eq!(length(&pieces), 4 * STEP);
    // Step 0 lasts 1.5 steps, step 1 half a step.
    let first_step: u64 = pieces
        .iter()
        .take(3)
        .map(|p| {
            if let Piece::Source { start, end, .. } = p {
                end - start
            } else {
                0
            }
        })
        .sum();
    assert_eq!(first_step, 9000);
}

#[test]
fn chance_and_random_orders_replay_identically_from_the_seed() {
    for order in ["random", "random_no_repeat", "follow"] {
        let json = format!(
            r#"{{"steps":[{{"chance":55}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}},{{}}],"order":"{order}","seed":13,"follows":[{{"type":"random"}}]}}"#
        );
        let a = compile(&motif(&json), &eight(), 96_000, STEP, FADE).unwrap();
        let b = compile(&motif(&json), &eight(), 96_000, STEP, FADE).unwrap();
        assert_eq!(a, b, "{order}: same seed, same pieces");
        let other = compile(
            &motif(&json.replace("\"seed\":13", "\"seed\":21")),
            &eight(),
            96_000,
            STEP,
            FADE,
        )
        .unwrap();
        assert_ne!(a, other, "{order}: another seed, another draw");
    }
}

#[test]
fn random_no_repeat_plays_every_slice_once_per_round() {
    let json = r#"{"steps":[{},{},{},{},{},{},{},{}],"order":"random_no_repeat","seed":3}"#;
    let pieces = compile(&motif(json), &eight(), 96_000, STEP, FADE).unwrap();
    let mut seen: Vec<u64> = heads(&pieces, 8).into_iter().flatten().collect();
    seen.sort_unstable();
    assert_eq!(seen, (0..8).map(|i| i * 12_000).collect::<Vec<_>>());
}

#[test]
fn original_reverse_and_follow_orders() {
    let steps = r#"[{},{},{},{}]"#;
    let at = |order: &str, extra: &str| {
        let json = format!(r#"{{"steps":{steps},"order":"{order}"{extra}}}"#);
        heads(
            &compile(&motif(&json), &eight(), 96_000, STEP, FADE).unwrap(),
            4,
        )
    };
    assert_eq!(
        at("original", ""),
        vec![Some(0), Some(12_000), Some(24_000), Some(36_000)]
    );
    assert_eq!(
        at("reverse", ""),
        vec![Some(84_000), Some(72_000), Some(60_000), Some(48_000)]
    );
    // Slice 0 goes to 5, 5 repeats once then stops… (5 → stop): 0, 5, rest, rest.
    let follows =
        r#","follows":[{"type":"target","target":5},null,null,null,null,{"type":"stop"}]"#;
    assert_eq!(
        at("follow", follows),
        vec![Some(0), Some(60_000), None, None]
    );
}

#[test]
fn refusals_are_explicit() {
    let slices = eight();
    for json in [
        r#"{"steps":[]}"#,
        r#"{"steps":[{"slice":8}]}"#,
        r#"{"steps":[{"roll":9}]}"#,
        r#"{"steps":[{"pitch":25}]}"#,
        r#"{"steps":[{}],"swing":80}"#,
    ] {
        let error = compile(&motif(json), &slices, 96_000, STEP, FADE).unwrap_err();
        assert_eq!(error.code, "INVALID_ARGUMENT", "{json}");
    }
    assert!(compile(&motif(r#"{"steps":[{}]}"#), &[], 96_000, STEP, FADE).is_err());
    assert!(compile(&motif(r#"{"steps":[{}]}"#), &slices, 96_000, 16, FADE).is_err());
}
