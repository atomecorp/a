// The console's Scope (R-290): the signal goes through untouched, the readings carry its measures.
use atome_dsp::catalog::{ModuleAsset, ModuleKind};
use atome_dsp::scope::{BINS, COLUMNS, READINGS, READING_COUNT, VECTOR_SIDE};
use atome_dsp::{Processor, StereoBlock};

const RATE: f32 = 48000.0;
const WINDOW: usize = 2400;

fn scope() -> Box<dyn Processor> {
    let mut scope = ModuleKind::Scope.build(ModuleAsset::None).expect("the scope builds");
    scope.prepare(RATE, 512);
    scope
}

fn run(scope: &mut dyn Processor, left: &[f32], right: &[f32]) -> Vec<f32> {
    let (mut l, mut r) = (left.to_vec(), right.to_vec());
    for (a, b) in l.chunks_mut(480).zip(r.chunks_mut(480)) {
        scope.process(&mut StereoBlock::new(a, b));
    }
    assert_eq!(l, left, "the left channel goes through untouched");
    assert_eq!(r, right, "the right channel goes through untouched");
    scope.readings().to_vec()
}

fn key(name: &str) -> usize {
    READINGS.iter().position(|reading| *reading == name).expect(name)
}

#[test]
fn it_is_in_the_catalog_with_its_readings() {
    assert_eq!(ModuleKind::from_key("scope").unwrap(), ModuleKind::Scope);
    assert_eq!(ModuleKind::Scope.readings().len(), READING_COUNT);
    assert!(ModuleKind::Scope.params().is_empty());
}

#[test]
fn a_mono_sine_draws_a_vertical_line_and_fills_its_histogram() {
    let sine: Vec<f32> = (0..WINDOW).map(|i| 0.8 * (i as f32 / 12.0).sin()).collect();
    let readings = run(scope().as_mut(), &sine, &sine);
    // No side: the figure lies in the middle columns only.
    let middle = VECTOR_SIDE / 2;
    for row in 0..VECTOR_SIDE {
        for column in 0..VECTOR_SIDE {
            let density = readings[key(&format!("vecto_{}", row * VECTOR_SIDE + column))];
            if column != middle && column != middle - 1 {
                assert_eq!(density, 0.0, "cell {row},{column} must stay empty");
            }
        }
    }
    let top: f32 = (0..VECTOR_SIDE * VECTOR_SIDE).map(|i| readings[key(&format!("vecto_{i}"))]).fold(0.0, f32::max);
    assert!((top - 1.0).abs() < 1e-6, "the densest cell is 1");
    // Every column of the waveform saw the sine, both channels' histograms are the same.
    for column in 0..COLUMNS {
        assert!(readings[key(&format!("wave_max_{column}"))] >= readings[key(&format!("wave_min_{column}"))]);
    }
    for bin in 0..BINS {
        assert_eq!(readings[key(&format!("histo_left_{bin}"))], readings[key(&format!("histo_right_{bin}"))]);
    }
}

#[test]
fn a_hard_panned_signal_leaves_the_centre_column() {
    let tone: Vec<f32> = (0..WINDOW).map(|i| 0.8 * (i as f32 / 12.0).sin()).collect();
    let silent = vec![0.0; WINDOW];
    let readings = run(scope().as_mut(), &tone, &silent);
    // Left only: side = mid, so the figure runs along the diagonal and reaches columns away from the middle.
    let wide = (0..VECTOR_SIDE * VECTOR_SIDE)
        .filter(|i| readings[key(&format!("vecto_{i}"))] > 0.0)
        .map(|i| i % VECTOR_SIDE)
        .collect::<std::collections::BTreeSet<_>>();
    assert!(wide.len() > 4, "a panned signal spreads across columns, got {wide:?}");
    let right_filled = (0..BINS).filter(|bin| readings[key(&format!("histo_right_{bin}"))] > 0.0).count();
    assert_eq!(right_filled, 1, "a silent channel sits in one bin");
}

#[test]
fn silence_reads_the_centre_and_reset_clears() {
    let mut scope = scope();
    let silent = vec![0.0; WINDOW];
    let readings = run(scope.as_mut(), &silent, &silent);
    assert_eq!(readings[key("wave_min_0")], 0.5);
    assert_eq!(readings[key("wave_max_0")], 0.5);
    scope.reset();
    assert!(scope.readings().iter().all(|value| *value == 0.0));
}
