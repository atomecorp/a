import { JSDOM } from 'jsdom';

export const makeRecord = (id, kind, index = 0) => ({
    id,
    type: kind,
    revision: index,
    properties: {
        kind,
        left: index * 4,
        top: index * 3,
        width: 40,
        height: 30,
        z_index: index,
        media_url: `/media/${id}`,
        text: `Text ${index}`
    }
});

export const makeMixedRecords = (count, prefix = 'atom') => (
    Array.from({ length: count }, (_, index) => {
        const kinds = ['text', 'image', 'video', 'audio_recording'];
        return makeRecord(`${prefix}_${index}`, kinds[index % kinds.length], index);
    })
);

export const createTestCompositor = (calls = []) => ({
    default: async () => calls.push({ type: 'init' }),
    resolve_bevy_media_texture: async () => ({ width: 1, height: 1, rgba: [255, 0, 0, 255] }),
    run_atome_bevy_renderer: (canvasSelector, width, height, surfaceMetrics, initialNodes) => {
        calls.push({ type: 'run', canvasSelector, width, height, surfaceMetrics, initialNodes });
    },
    apply_atome_bevy_ops: (ops) => calls.push({ type: 'ops', ops }),
    apply_atome_bevy_spawn: (payload) => calls.push({ type: 'spawn', payload }),
    apply_atome_bevy_despawn: (id) => calls.push({ type: 'despawn', id }),
    apply_atome_bevy_transform: (payload) => calls.push({ type: 'transform', payload }),
    apply_atome_bevy_style: (payload) => calls.push({ type: 'style', payload }),
    apply_atome_bevy_reparent: (payload) => calls.push({ type: 'reparent', payload }),
    apply_atome_bevy_layer: (payload) => calls.push({ type: 'layer', payload }),
    apply_atome_bevy_visibility: (payload) => calls.push({ type: 'visibility', payload }),
    apply_atome_bevy_resource: (payload) => calls.push({ type: 'resource', payload }),
    apply_atome_bevy_text_metadata: (payload) => calls.push({ type: 'text', payload }),
    apply_atome_bevy_surface: (payload) => calls.push({ type: 'surface', payload })
});

export const installDom = (html) => {
    const dom = new JSDOM(html);
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    return dom;
};

export const nextTick = (delayMs = 0) => new Promise((resolve) => setTimeout(resolve, delayMs));

export const visibleProjectVideos = (documentRef) => (
    Array.from(documentRef.querySelectorAll('video'))
        .filter((video) => !video.closest('#eve_bevy_video_decode_root'))
);

export const finalSetCommit = (commits) => (
    commits.flat().filter((event) => event?.kind === 'set').at(-1)
);
