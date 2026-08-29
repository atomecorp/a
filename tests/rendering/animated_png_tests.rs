use super::*;
use crate::texture::image_handle_from_texture;

fn texture() -> AtomeTexture {
    AtomeTexture {
        width: 100,
        height: 100,
        rgba: vec![],
        animation: Some(PngAnimationSource {
            bytes: include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../src/assets/images/ballanim.png"
            ))
            .to_vec(),
            source_rect: [0.0, 0.0, 100.0, 100.0],
            destination_rect: [0.0, 0.0, 100.0, 100.0],
            corner_radius: 0.0,
            tint: None,
            opacity: None,
        }),
    }
}

#[test]
fn apng_frame_timing_alpha_disposal_and_infinite_loops() {
    let (mut playback, first) = PngPlayback::new(&texture(), 0.0).unwrap();
    assert!((playback.deadline - 0.075).abs() < 1e-8);
    assert!(playback.advance(0.074).unwrap().is_none());
    let mut frames = vec![first];
    for index in 1..40 {
        let frame = playback
            .advance(index as f64 * 0.075 + 1e-8)
            .unwrap()
            .unwrap();
        assert!(frame.chunks_exact(4).any(|pixel| pixel[3] == 0));
        assert!(frame.chunks_exact(4).any(|pixel| pixel[3] > 0));
        frames.push(frame);
    }
    assert_ne!(frames[0], frames[1]);
    for index in 0..20 {
        assert_eq!(frames[index], frames[index + 20], "loop frame {index}");
    }
    // A moving ball must erase previously occupied pixels instead of retaining trails.
    assert!(frames.windows(2).any(|pair| pair[0]
        .chunks_exact(4)
        .zip(pair[1].chunks_exact(4))
        .any(|(before, after)| before[3] > 0 && after[3] == 0)));
}

#[test]
fn apng_infinite_playback_skips_elapsed_loops_without_a_catch_up_storm() {
    let (mut playback, _) = PngPlayback::new(&texture(), 0.0).unwrap();
    let frame = playback.advance(150.075 + 1e-8).unwrap();
    assert!(frame.is_some());
    assert!(playback.deadline > 150.075);
}

#[test]
fn apng_finite_loop_keeps_last_frame_and_stops() {
    let mut source = texture();
    let bytes = &mut source.animation.as_mut().unwrap().bytes;
    let chunk = bytes.windows(4).position(|chunk| chunk == b"acTL").unwrap();
    bytes[chunk + 8..chunk + 12].copy_from_slice(&1u32.to_be_bytes());
    let mut crc = !0u32;
    for byte in &bytes[chunk..chunk + 12] {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320u32 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    bytes[chunk + 12..chunk + 16].copy_from_slice(&(!crc).to_be_bytes());
    let (mut playback, _) = PngPlayback::new(&source, 0.0).unwrap();
    for index in 1..20 {
        assert!(playback
            .advance(index as f64 * 0.075 + 1e-8)
            .unwrap()
            .is_some());
    }
    assert!(playback.advance(1.5 + 1e-8).unwrap().is_none());
    assert!(playback.finished);
    assert!(playback.advance(99.0).unwrap().is_none());
}

#[test]
fn apng_invalid_geometry_corruption_and_memory_limit_are_explicit() {
    let mut invalid = texture();
    invalid.animation.as_mut().unwrap().bytes.truncate(20);
    assert!(PngPlayback::new(&invalid, 0.0).is_err());
    invalid = texture();
    invalid.width = u32::MAX;
    assert!(PngPlayback::new(&invalid, 0.0).is_err());
    invalid = texture();
    invalid.animation.as_mut().unwrap().source_rect = [100.0, 0.0, 0.1, 1.0];
    assert!(PngPlayback::new(&invalid, 0.0).is_err());
}

#[test]
fn apng_updates_same_image_pauses_hidden_and_releases_on_replacement_or_despawn() {
    let texture = texture();
    let mut app = App::new();
    app.init_resource::<Assets<Image>>()
        .init_resource::<Time<Real>>()
        .init_resource::<AtomeRendererDiagnostics>()
        .init_non_send::<PngAnimations>()
        .add_systems(Update, advance_animations);
    let handle = image_handle_from_texture(
        &mut app.world_mut().resource_mut::<Assets<Image>>(),
        &Some(texture.clone()),
        "apng",
    )
    .unwrap();
    let entity = app
        .world_mut()
        .spawn((Sprite::from_image(handle.clone()), Visibility::Visible))
        .id();
    install_animation(app.world_mut(), entity, &texture).unwrap();
    let first = app
        .world()
        .resource::<Assets<Image>>()
        .get(&handle)
        .unwrap()
        .data
        .clone();
    app.world_mut()
        .resource_mut::<Time<Real>>()
        .advance_by(Duration::from_millis(76));
    app.update();
    assert_eq!(app.world().get::<Sprite>(entity).unwrap().image, handle);
    assert_ne!(
        app.world()
            .resource::<Assets<Image>>()
            .get(&handle)
            .unwrap()
            .data,
        first
    );
    app.world_mut()
        .get_mut::<Visibility>(entity)
        .map(|mut visibility| *visibility = Visibility::Hidden);
    app.update();
    let hidden = app
        .world()
        .resource::<Assets<Image>>()
        .get(&handle)
        .unwrap()
        .data
        .clone();
    app.world_mut()
        .resource_mut::<Time<Real>>()
        .advance_by(Duration::from_secs(2));
    app.update();
    assert_eq!(
        app.world()
            .resource::<Assets<Image>>()
            .get(&handle)
            .unwrap()
            .data,
        hidden
    );
    let still = AtomeTexture {
        width: 1,
        height: 1,
        rgba: vec![255; 4],
        animation: None,
    };
    install_animation(app.world_mut(), entity, &still).unwrap();
    assert!(app.world().non_send::<PngAnimations>().entries.is_empty());
    install_animation(app.world_mut(), entity, &texture).unwrap();
    app.world_mut().despawn(entity);
    app.update();
    assert!(app.world().non_send::<PngAnimations>().entries.is_empty());
}

#[test]
fn apng_deadline_preserves_faster_existing_render_cadence() {
    assert!(matches!(
        with_frame_deadline(UpdateMode::Continuous, Duration::from_millis(75)),
        UpdateMode::Continuous
    ));
    let mode = with_frame_deadline(
        UpdateMode::reactive(Duration::from_millis(16)),
        Duration::from_millis(75),
    );
    assert!(matches!(mode, UpdateMode::Reactive { wait, .. } if wait == Duration::from_millis(16)));
    let mode = with_frame_deadline(
        UpdateMode::reactive(Duration::from_secs(5)),
        Duration::from_millis(75),
    );
    assert!(matches!(mode, UpdateMode::Reactive { wait, .. } if wait == Duration::from_millis(75)));
}
