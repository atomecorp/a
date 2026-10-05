use super::*;

#[cfg(test)]
mod video_clip_tests {
    use super::*;
    use crate::types::AtomeColorFilters;

    fn world_with_video(uv: [f32; 4]) -> (World, Entity) {
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world
            .spawn(AtomeVideoExternalTexture {
                id: "v1".to_string(),
                layer: 0,
                opacity: 1.0,
                uv_rect: uv,
                filters: AtomeColorFilters::identity(),
                transition: crate::types::AtomeTransition::none(),
                mask_texture: None,
            })
            .id();
        (world, entity)
    }

    #[test]
    fn a_video_outside_any_page_keeps_its_whole_quad() {
        let (mut world, entity) = world_with_video([0.0, 0.0, 1.0, 1.0]);
        let original = [10.0, 20.0, 200.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, original).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [200.0, 100.0, 0.0, 0.0, 1.0, 1.0]);
    }

    #[test]
    fn a_video_cut_by_a_page_shrinks_its_quad_and_its_uv() {
        let (mut world, entity) = world_with_video([0.0, 0.0, 1.0, 1.0]);
        let original = [0.0, 0.0, 200.0, 100.0];
        // La page ne laisse voir que la moitie droite, moitie basse.
        let visible = [100.0, 50.0, 100.0, 50.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [100.0, 50.0, 0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn a_cropped_source_stays_inside_its_own_uv_window() {
        let (mut world, entity) = world_with_video([0.25, 0.0, 0.5, 1.0]);
        let original = [0.0, 0.0, 100.0, 100.0];
        let visible = [50.0, 0.0, 50.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [50.0, 100.0, 0.5, 0.0, 0.25, 1.0]);
    }

    #[test]
    fn the_same_clip_twice_does_not_rebuild_the_mesh() {
        let (mut world, entity) = world_with_video([0.0, 0.0, 1.0, 1.0]);
        let original = [0.0, 0.0, 200.0, 100.0];
        let visible = [0.0, 0.0, 120.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        let first = world.resource::<Assets<Mesh>>().len();
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        assert_eq!(world.resource::<Assets<Mesh>>().len(), first,
            "une image de geste ne doit pas re-televerser le maillage");
    }

    #[test]
    fn a_video_quad_is_clipped_even_without_its_external_texture_component() {
        // Le cas reel qui echouait : le quad existe, le composant de texture
        // externe non — la video traversait alors la page sans etre coupee.
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn(crate::video_external_texture::AtomeVideoQuad([0.0, 0.0, 1.0, 1.0])).id();
        apply_video_clip_mesh(&mut world, entity, [0.0, 0.0, 200.0, 100.0], [0.0, 0.0, 120.0, 100.0]).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [120.0, 100.0, 0.0, 0.0, 0.6, 1.0]);
    }

    #[test]
    fn clipping_twice_never_crops_its_own_crop() {
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn(crate::video_external_texture::AtomeVideoQuad([0.0, 0.0, 1.0, 1.0])).id();
        let original = [0.0, 0.0, 200.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, [0.0, 0.0, 100.0, 100.0]).expect("clip");
        apply_video_clip_mesh(&mut world, entity, original, [0.0, 0.0, 50.0, 100.0]).expect("clip");
        let applied = world.get::<AtomeVideoClipMesh>(entity).copied().expect("mesh state");
        assert_eq!(applied.0, [50.0, 100.0, 0.0, 0.0, 0.25, 1.0], "le rectangle d origine reste la reference");
    }

    #[test]
    fn a_quad_rebuilt_at_full_size_forgets_its_clip_and_can_be_cut_again() {
        // Une mise a jour de ressource (source, lecture, filtres) refait le quad en
        // entier : la decoupe doit pouvoir etre reappliquee, sinon la video ressort
        // de sa page.
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn_empty().id();
        crate::video_external_texture::insert_video_quad_mesh(&mut world, entity, [200.0, 100.0], [0.0, 0.0, 1.0, 1.0]).expect("quad");
        let original = [0.0, 0.0, 200.0, 100.0];
        let visible = [0.0, 0.0, 140.0, 100.0];
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip");
        assert!(world.get::<AtomeVideoClipMesh>(entity).is_some());
        crate::video_external_texture::insert_video_quad_mesh(&mut world, entity, [200.0, 100.0], [0.0, 0.0, 1.0, 1.0]).expect("rebuild");
        assert!(world.get::<AtomeVideoClipMesh>(entity).is_none(), "le quad refait oublie sa decoupe");
        let before = world.resource::<Assets<Mesh>>().len();
        apply_video_clip_mesh(&mut world, entity, original, visible).expect("clip again");
        assert_eq!(world.get::<AtomeVideoClipMesh>(entity).copied().map(|state| state.0), Some([140.0, 100.0, 0.0, 0.0, 0.7, 1.0]));
        assert!(world.resource::<Assets<Mesh>>().len() > before, "la decoupe est bien reposee");
    }

    #[test]
    fn an_entity_without_video_is_left_alone() {
        let mut world = World::new();
        world.insert_resource(Assets::<Mesh>::default());
        let entity = world.spawn_empty().id();
        apply_video_clip_mesh(&mut world, entity, [0.0, 0.0, 10.0, 10.0], [0.0, 0.0, 5.0, 5.0]).expect("clip");
        assert!(world.get::<AtomeVideoClipMesh>(entity).is_none());
    }
}

#[cfg(test)]
mod rounded_clip_tests {
    use super::*;
    use bevy::sprite_render::ColorMaterial;
    use crate::clip_polygon::AtomeClipPolygonProxy;

    #[test]
    fn rounded_rail_stays_inside_both_corners_at_one_and_two_times_scale() {
        for scale in [1.0, 2.0] {
            let rect = [0.0, 0.0, 200.0 * scale, 180.0 * scale, 15.0 * scale, 15.0 * scale, 0.0, 0.0];
            for x in [4.0 * scale, 192.5 * scale] {
                let position = [x, -80.0 * scale];
                let points = visible_polygon_for_rounded_clips(position, [3.5 * scale, 280.0 * scale],
                    AtomeLocalTransform::default(), Some([0.0, 0.0, rect[2], rect[3]]), 0.0, &[rect]);
                assert!(points.len() > 4, "corner must cut the straight rail");
                for p in points {
                    let distance = crate::texture::rounded_rect_signed_distance(p.x + x, p.y + position[1],
                        rect[2], rect[3], [rect[4], rect[5], 0.0, 0.0]);
                    assert!(distance <= 0.001, "rail outside rounded viewport: {distance}");
                    assert!(p.y + position[1] <= rect[3] + 0.001, "rail crosses fixed action band");
                }
            }
            let outline = rounded_clip_outline(rect);
            for i in 0..outline.len() {
                let midpoint = (outline[i] + outline[(i + 1) % outline.len()]) / 2.0;
                let distance = crate::texture::rounded_rect_signed_distance(midpoint.x, midpoint.y,
                    rect[2], rect[3], [rect[4], rect[5], 0.0, 0.0]);
                assert!(distance >= -0.051, "chord exceeds the 0.05 pixel tolerance");
            }
        }
    }

    #[test]
    fn nested_rounded_clips_intersect_without_moving_the_outer_arc() {
        let points = visible_polygon_for_rounded_clips([0.0, 0.0], [200.0, 180.0], AtomeLocalTransform::default(),
            Some([0.0, 0.0, 200.0, 180.0]), 0.0,
            &[[0.0, 0.0, 200.0, 180.0, 15.0, 15.0, 0.0, 0.0], [2.0, 0.0, 196.0, 160.0, 5.0, 5.0, 0.0, 0.0]]);
        assert!(points.len() > 4);
        for p in points {
            assert!(crate::texture::rounded_rect_signed_distance(p.x, p.y, 200.0, 180.0, [15.0, 15.0, 0.0, 0.0]) <= 0.001);
            assert!(p.x >= 1.999 && p.x <= 198.001 && p.y <= 160.001);
        }
    }

    #[test]
    fn rounded_scroll_reuses_and_hides_the_resident_proxy_then_clears_the_clip() {
        let mut app = App::new();
        app.add_plugins(crate::AtomeBevyRendererPlugin::new(crate::AtomeBevyRendererConfig::empty(640.0, 480.0)));
        app.world_mut().init_resource::<Assets<ColorMaterial>>();
        app.update();
        let node: crate::AtomeRenderNode = serde_json::from_value(serde_json::json!({
            "id":"rounded_rail", "kind":"shape", "logical_position":[192.5,-80.0], "logical_size":[3.5,280.0],
            "layer":3, "color":[0.0,0.5,1.0,1.0], "clip_rect":[0.0,0.0,200.0,180.0],
            "clip_rounded_rects":[[0.0,0.0,200.0,180.0,15.0,15.0,0.0,0.0]]
        })).unwrap();
        let entity = crate::apply_spawn(app.world_mut(), node).unwrap();
        let proxy = app.world().get::<AtomeClipPolygonProxy>(entity).unwrap().0;
        let mesh = app.world().get::<Mesh2d>(proxy).unwrap().0.clone();
        let patch = |y, rounded| serde_json::from_value::<crate::AtomeTransformPatch>(serde_json::json!({
            "id":"rounded_rail", "logical_position":[192.5,y], "logical_size":[3.5,280.0],
            "clip_rect":[0.0,0.0,200.0,180.0], "clip_rounded_rects":rounded
        })).unwrap();
        let rounded = vec![[0.0,0.0,200.0,180.0,15.0,15.0,0.0,0.0]];
        for y in [-90.0, -100.0] {
            crate::apply_transform(app.world_mut(), patch(y, rounded.clone())).unwrap();
            assert_eq!(app.world().get::<AtomeClipPolygonProxy>(entity).unwrap().0, proxy);
            assert_eq!(app.world().get::<Mesh2d>(proxy).unwrap().0, mesh);
        }
        crate::apply_transform(app.world_mut(), patch(-300.0, rounded.clone())).unwrap();
        assert_eq!(app.world().get::<Visibility>(proxy), Some(&Visibility::Hidden));
        crate::apply_transform(app.world_mut(), patch(-80.0, rounded)).unwrap();
        assert_eq!(app.world().get::<Visibility>(proxy), Some(&Visibility::Visible));
        crate::apply_transform(app.world_mut(), patch(-80.0, Vec::<[f32;8]>::new())).unwrap();
        assert!(app.world().get::<AtomeClipPolygonProxy>(entity).is_none());
        assert!(app.world().get_entity(proxy).is_err());
        // A rounded boundary also works without the optional rectangular clip.
        let inside: crate::AtomeRenderNode = serde_json::from_value(serde_json::json!({
            "id":"rounded_inside", "kind":"shape", "logical_position":[40.0,40.0], "logical_size":[20.0,20.0],
            "layer":3, "color":[0.0,0.5,1.0,1.0],
            "clip_rounded_rects":[[0.0,0.0,200.0,180.0,15.0,15.0,0.0,0.0]]
        })).unwrap();
        let inside_entity = crate::apply_spawn(app.world_mut(), inside).unwrap();
        assert_eq!(app.world().get::<Visibility>(inside_entity), Some(&Visibility::Visible));
    }
}
