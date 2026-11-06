use crate::linear_lens::*;
use crate::linear_lens_band::LinearLensBand;

fn band(count: usize, bounds: Option<[f64; 2]>, viewport: Option<[f64; 2]>) -> LinearLensSpec {
    LinearLensSpec {
        tiles: (0..count)
            .map(|index| LinearLensTileSpec {
                rest: [100.0 + index as f64 * 65.0, 800.0, 60.0],
                parent_clip: None,
                records: Vec::new(),
            })
            .collect(),
        vertical: false,
        inward: -1.0,
        gap: 5.0,
        bounds,
        viewport,
        factor: 2.0,
        settle_ms: 260.0,
        grow_damping: 0.55,
        shrink_damping: 0.8,
    }
}

#[test]
fn the_grown_tool_stays_whole_inside_the_visible_span_of_a_band_that_scrolls() {
    let sizes = [60.0, 60.0, 60.0, 120.0];
    let free = solve_linear_lens_layout(&band(4, None, None), &sizes, None);
    assert!(free[3].x + free[3].size > 355.0);
    let spec = band(4, None, Some([100.0, 355.0]));
    let kept = solve_linear_lens_layout(&spec, &sizes, spec.viewport);
    assert_eq!(kept[3].x + kept[3].size, 355.0);
    assert!(kept[2].x + kept[2].size <= kept[3].x - 5.0 + 0.001);
    // Across the band the grown tool rises toward the inside, its outer edge kept.
    assert_eq!(kept[3].y + kept[3].size, 860.0);
    let rest = solve_linear_lens_layout(&spec, &[60.0; 4], spec.viewport);
    assert_eq!(
        rest.iter().map(|cell| cell.x).collect::<Vec<_>>(),
        [100.0, 165.0, 230.0, 295.0]
    );
}

#[test]
fn a_bounded_band_shrinks_the_growth_by_steps_until_it_fits() {
    let spec = band(4, Some([100.0, 400.0]), None);
    let sizes = linear_lens_target_sizes(&spec, Some(1));
    // 4 tools of 60 and 3 seams of 5 leave 45 px: the hovered tool grows 1.75×, not 2×.
    assert_eq!(sizes, [60.0, 105.0, 60.0, 60.0]);
    assert_eq!(linear_lens_target_sizes(&spec, None), [60.0; 4]);
}

#[test]
fn the_spring_settles_on_its_target() {
    let omega = linear_lens_omega(260.0, 0.55);
    let (mut value, mut velocity, mut rest) = (60.0, 0.0, false);
    let mut steps = 0;
    while !rest {
        (value, velocity, rest) =
            step_linear_lens_spring(value, velocity, 120.0, 16.0, omega, 0.55);
        steps += 1;
        assert!(steps < 200);
    }
    assert_eq!((value, velocity), (120.0, 0.0));
}

#[test]
fn hovering_keeps_the_grown_tool_on_a_seam_and_the_end_tool_past_the_ends() {
    let mut lens = LinearLensBand::new(band(4, None, None));
    assert_eq!(lens.hover_at(170.0), Some(1));
    assert!(lens.set_target(Some(1), true));
    assert!(!lens.set_target(Some(1), true));
    let grown = lens.centre_of(1).expect("cell");
    assert_eq!(grown.size, 120.0);
    // Just past the grown tool's end, the next tool is taken only once IT would be grown under the point.
    assert_eq!(lens.hover_at(grown.x + grown.size + 4.0), Some(2));
    assert_eq!(lens.hover_at(0.0), Some(0));
    assert_eq!(lens.hover_at(10_000.0), Some(3));
    lens.snap_to_rest();
    assert!(lens.is_at_rest());
    assert_eq!(lens.hovered(), None);
}

#[test]
fn a_vertical_band_grows_along_y_and_toward_its_inside_across() {
    let mut spec = band(3, None, None);
    spec.vertical = true;
    spec.inward = 1.0;
    spec.tiles
        .iter_mut()
        .enumerate()
        .for_each(|(index, tile)| tile.rest = [10.0, 100.0 + index as f64 * 65.0, 60.0]);
    let cells = solve_linear_lens_layout(&spec, &[60.0, 120.0, 60.0], None);
    // The outer edge (x = 10) stays; the grown tool is centred on its rest square along y and pushes its neighbours.
    assert_eq!(
        (cells[1].x, cells[1].y, cells[1].size),
        (10.0, 135.0, 120.0)
    );
    assert_eq!(cells[0].y + cells[0].size, 130.0);
    assert_eq!(cells[2].y, 260.0);
    assert_eq!(hit_linear_lens_cell(140.0, &cells, true, 5.0), Some(1));
}
