//! The uniform buffers a draw rewrites every frame, made once per drawn key.
//!
//! A buffer made per frame with its contents is mapped at creation: two of them per video or
//! effect image, sixty times a second, ran WebKit out of mappings under a project of many videos,
//! and `get_mapped_range` panicked the renderer (R-295 défaut 50). The buffers of a draw are kept
//! and their contents written through the queue.

use std::hash::Hash;

use bevy::{
    platform::collections::{HashMap, HashSet},
    render::{
        render_resource::{Buffer, BufferDescriptor, BufferUsages},
        renderer::{RenderDevice, RenderQueue},
    },
};

pub(crate) struct FrameUniforms<K> {
    buffers: HashMap<K, Vec<Buffer>>,
    written: HashSet<K>,
}

impl<K> Default for FrameUniforms<K> {
    fn default() -> Self {
        Self {
            buffers: HashMap::default(),
            written: HashSet::default(),
        }
    }
}

impl<K: Copy + Eq + Hash> FrameUniforms<K> {
    /// The buffers of `key`, one per slot of `contents`, holding those contents.
    pub(crate) fn write(
        &mut self,
        device: &RenderDevice,
        queue: &RenderQueue,
        key: K,
        label: &'static str,
        contents: &[&[u8]],
    ) -> &[Buffer] {
        self.written.insert(key);
        let buffers = self.buffers.entry(key).or_default();
        let fits = buffers.len() == contents.len()
            && buffers
                .iter()
                .zip(contents)
                .all(|(buffer, bytes)| buffer.size() == bytes.len() as u64);
        if !fits {
            *buffers = contents
                .iter()
                .map(|bytes| {
                    device.create_buffer(&BufferDescriptor {
                        label: Some(label),
                        size: bytes.len() as u64,
                        usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
                        mapped_at_creation: false,
                    })
                })
                .collect();
        }
        for (buffer, bytes) in buffers.iter().zip(contents) {
            queue.write_buffer(buffer, 0, bytes);
        }
        buffers
    }

    /// Ends a frame: the buffers of the keys not written since the last call are released.
    pub(crate) fn release_unwritten(&mut self) {
        let written = &self.written;
        self.buffers.retain(|key, _| written.contains(key));
        self.written.clear();
    }
}
