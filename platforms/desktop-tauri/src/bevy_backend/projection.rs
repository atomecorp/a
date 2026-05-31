#[cfg(feature = "bevy_backend")]
use bevy::prelude::{Component, Entity, Resource, Transform, Vec3, World};

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(feature = "bevy_backend", derive(Component))]
pub struct AtomeBevyNode {
    pub atome_id: String,
    pub parent_atome_id: Option<String>,
    pub logical_position: [f32; 2],
    pub logical_size: [f32; 2],
    pub layer: i32,
}

impl AtomeBevyNode {
    pub fn new(
        atome_id: impl Into<String>,
        parent_atome_id: Option<String>,
        logical_position: [f32; 2],
        logical_size: [f32; 2],
        layer: i32,
    ) -> Self {
        Self {
            atome_id: atome_id.into(),
            parent_atome_id,
            logical_position,
            logical_size,
            layer,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(feature = "bevy_backend", derive(Component))]
pub struct AtomeBevyLayer(pub i32);

#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg_attr(feature = "bevy_backend", derive(Component))]
pub struct AtomeBevyLogicalSize {
    pub width: f32,
    pub height: f32,
}

#[cfg(feature = "bevy_backend")]
#[derive(Default, Resource)]
pub struct AtomeBevyProjection {
    mappings: Vec<AtomeBevyMapping>,
}

#[cfg(feature = "bevy_backend")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AtomeBevyMapping {
    pub entity: Entity,
    pub atome_id_index: usize,
}

#[cfg(feature = "bevy_backend")]
impl AtomeBevyProjection {
    pub fn remember(&mut self, entity: Entity, atome_id_index: usize) {
        self.mappings.push(AtomeBevyMapping {
            entity,
            atome_id_index,
        });
    }

    pub fn mappings(&self) -> &[AtomeBevyMapping] {
        &self.mappings
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_transform_for_node(node: &AtomeBevyNode) -> Transform {
    Transform::from_translation(Vec3::new(
        node.logical_position[0],
        node.logical_position[1],
        node.layer as f32,
    ))
}

#[cfg(feature = "bevy_backend")]
pub fn atome_size_for_node(node: &AtomeBevyNode) -> AtomeBevyLogicalSize {
    AtomeBevyLogicalSize {
        width: node.logical_size[0],
        height: node.logical_size[1],
    }
}

#[cfg(feature = "bevy_backend")]
pub fn atome_layer_for_node(node: &AtomeBevyNode) -> AtomeBevyLayer {
    AtomeBevyLayer(node.layer)
}

#[cfg(feature = "bevy_backend")]
pub fn spawn_atome_node(world: &mut World, node: AtomeBevyNode) -> Entity {
    let transform = atome_transform_for_node(&node);
    let size = atome_size_for_node(&node);
    let layer = atome_layer_for_node(&node);

    world.spawn((node, transform, size, layer)).id()
}

#[cfg(all(test, feature = "bevy_backend"))]
mod tests {
    use super::*;

    #[test]
    fn bevy_backend_spawns_node_from_atome_projection_data() {
        let mut world = World::new();
        let node = AtomeBevyNode::new(
            "shape_1",
            Some("project_1".to_string()),
            [12.0, 24.0],
            [96.0, 64.0],
            3,
        );

        let entity = spawn_atome_node(&mut world, node);
        let stored = world
            .get::<AtomeBevyNode>(entity)
            .expect("node component must exist");
        let transform = world
            .get::<Transform>(entity)
            .expect("transform component must exist");
        let size = world
            .get::<AtomeBevyLogicalSize>(entity)
            .expect("logical size component must exist");
        let layer = world
            .get::<AtomeBevyLayer>(entity)
            .expect("layer component must exist");

        assert_eq!(stored.atome_id, "shape_1");
        assert_eq!(stored.parent_atome_id.as_deref(), Some("project_1"));
        assert_eq!(transform.translation, Vec3::new(12.0, 24.0, 3.0));
        assert_eq!(size.width, 96.0);
        assert_eq!(size.height, 64.0);
        assert_eq!(layer.0, 3);
    }

    #[test]
    fn projection_resource_keeps_explicit_mapping_without_owning_state() {
        let mut world = World::new();
        world.insert_resource(AtomeBevyProjection::default());
        let entity = spawn_atome_node(
            &mut world,
            AtomeBevyNode::new("text_1", None, [0.0, 0.0], [20.0, 10.0], 0),
        );

        let mut projection = world.resource_mut::<AtomeBevyProjection>();
        projection.remember(entity, 0);

        assert_eq!(
            projection.mappings(),
            &[AtomeBevyMapping {
                entity,
                atome_id_index: 0
            }]
        );
    }
}
