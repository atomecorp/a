import { describe, it, expect, vi } from 'vitest';

vi.mock('../../eVe/domains/rendering/project_preview_video_posters.js', () => ({
    isVideoPreviewRecord: record => /video/.test(String(record?.type)),
    withProjectPreviewVideoPosters: async records => records.map(record => ({
        ...record, properties: { ...(record.properties || {}), media_poster_data_url: `data:image/jpeg;base64,${record.id}` } }))
}));

const { conversationDrafts } = await import('../../eVe/intuition/tools/contact_conversation.js');
const { createConversationStills } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_conversation_stills.js');

const take = (id, type, props, created) => ({ id, type, meta: { created_at: created }, properties: { conversation_contact_id: 'ana', conversation_message_id: `m_${id}`, conversation_send_status: 'draft', ...props } });

describe('the takes left waiting when the app closed', () => {
    it('come back for their contact alone, oldest first, never the sent, removed or deleted ones', () => {
        const states = [
            take('v2', 'video_recording', {}, '2026-11-13T10:02:00Z'),
            take('a1', 'audio_recording', {}, '2026-11-13T10:01:00Z'),
            take('sent', 'audio_recording', { conversation_send_status: 'sent' }, '2026-11-13T10:00:00Z'),
            take('removed', 'video_recording', { conversation_send_status: 'removed' }, '2026-11-13T10:00:00Z'),
            take('gone', 'video_recording', { __deleted: true }, '2026-11-13T10:00:00Z'),
            take('other', 'video_recording', { conversation_contact_id: 'bob' }, '2026-11-13T10:00:00Z'),
            take('image', 'image', {}, '2026-11-13T10:00:00Z')
        ];
        expect(conversationDrafts(states, 'ana')).toEqual([
            { kind: 'audio', mediaId: 'a1', messageId: 'm_a1', camera: 'front', record: states[1] },
            { kind: 'video', mediaId: 'v2', messageId: 'm_v2', camera: 'front', record: states[0] }
        ]);
        expect(conversationDrafts(states, '')).toEqual([]);
    });
});

describe('the stills of a conversation\'s videos', () => {
    it('are made once each, for videos without one, and the rows are laid again', async () => {
        const changed = vi.fn();
        const stills = createConversationStills({ changed });
        const records = [{ id: 'v1', type: 'video_recording', properties: {} },
            { id: 'v2', type: 'video_recording', properties: { media_poster_data_url: 'data:image/jpeg;base64,kept' } },
            { id: 's1', type: 'audio_recording', properties: {} }];
        await stills.ensure(records);
        await stills.ensure(records);
        expect(stills.posterOf('v1')).toBe('data:image/jpeg;base64,v1');
        expect(stills.posterOf('v2')).toBe('');
        expect(stills.posterOf('s1')).toBe('');
        expect(changed).toHaveBeenCalledTimes(1);
    });
});

describe('a video take waiting in the conversation', () => {
    it('shows its still in its row, not a decoder of its first frame', async () => {
        const { buildConversationHistoryNodes } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_conversation_history.js');
        const record = { atome_id: 'v1', atome_type: 'video_recording', type: 'video_recording',
            properties: { kind: 'video_recording', media_kind: 'video', media_url: '/api/recordings/v1.mov', media_width: 1920, media_height: 1080, duration: 2 } };
        const poster = 'data:image/jpeg;base64,still';
        const nodes = buildConversationHistoryNodes({ history: { items: [] }, width: 600, emit: () => {},
            takes: [{ mediaId: 'v1', kind: 'video', record }], posterOf: id => (id === 'v1' ? poster : '') });
        const overlays = [];
        const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.overlayRecord) overlays.push(n.overlayRecord); (n.children || []).forEach(walk); };
        (Array.isArray(nodes) ? nodes : [nodes]).forEach(walk);
        expect(overlays.some(o => o.type === 'image' && o.properties?.source === poster)).toBe(true);
    }, 20000);
});

describe('a received video whose local copy gives no frame', () => {
    it('is fetched again once, and its still made from the fresh copy', async () => {
        const make = vi.fn(async record => (record.properties.media_url === '/api/recordings/fresh.mov' ? 'data:image/jpeg;base64,fresh' : ''));
        const repair = vi.fn(async record => ({ ...record, properties: { ...record.properties, media_url: '/api/recordings/fresh.mov' } }));
        const stills = createConversationStills({ make, repair });
        await stills.ensure([{ id: 'rx', type: 'video_recording', properties: { media_url: 'https://server/api/uploads/rx.mov' } }]);
        expect(stills.posterOf('rx')).toBe('data:image/jpeg;base64,fresh');
        expect(repair).toHaveBeenCalledTimes(1);
        expect(stills.report().failed).toEqual({});
        const none = createConversationStills({ make: async () => '', repair: async () => null });
        await none.ensure([{ id: 'v', type: 'video_recording', properties: {} }]);
        expect(none.report().failed).toEqual({ v: 'no_frame' });
    });
});

describe('the video playing in the thread', () => {
    it('slides sideways only: a finger going up or down on it scrolls the thread', async () => {
        const { buildContactConversationContent } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_conversation_view.js');
        const record = { atome_id: 'v1', atome_type: 'video_recording', properties: { kind: 'video_recording', media_kind: 'video', media_url: '/api/recordings/v1.mov', media_width: 1920, media_height: 1080, duration: 2 } };
        const scrub = { nodes: () => [], handlers: () => ({ press() {}, drag() {}, release() {} }) };
        const selection = { has: () => false, isPressed: () => false, setRanges() {} };
        const state = { contact: { id: 'ana', name: 'Ana' }, contactId: 'ana', history: { items: [{ message_id: 'm1', box: 'inbox', from_id: 'ana', timestamp: '2026-11-13T07:00:00Z', media: [{ id: 'v1', type: 'video_recording', media_kind: 'video', media_url: '/api/recordings/v1.mov', duration: 2 }] }] },
            takes: [], attachItems: [], attachPicked: [], call: { phase: 'idle' }, memo: { phase: 'idle' }, playing: { id: 'm1', kind: 'video', record }, now: Date.now() };
        const content = buildContactConversationContent(state, { emit: () => {}, bodyWidth: 600, bodyHeight: 800, selections: { attach: selection, takes: selection }, scrub, treeId: 't', collection: null });
        const found = [];
        const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.id === 'contact_conversation_review_touch' || String(n.id || '').endsWith('_touch')) found.push(n); (n.children || []).forEach(walk); };
        (Array.isArray(content) ? content : [content]).forEach(walk);
        const touch = found.find(n => n.on?.drag);
        expect(touch?.on.drag.sideways).toBe(true);
    }, 20000);
});

describe('a video opened under the last row', () => {
    it('is brought into view by its first repaint only, its row kept in place', async () => {
        const { createConversationMedia } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_conversation_media.js');
        const record = { atome_id: 'v1', atome_type: 'video_recording', properties: { media_kind: 'video', media_url: '/api/recordings/v1.mov' } };
        const state = { history: { items: [] }, takes: [{ mediaId: 'v1', kind: 'video', record }], call: { phase: 'idle' }, playing: null, access: '' };
        let options = [];
        const playEntry = async (entry) => { state.playing = entry; options.push(media.kept()); options.push(media.kept()); return { ok: true }; };
        const media = createConversationMedia({ state, playEntry, stopPlayback: async () => {}, recordingMemo: () => false, setNotice() {}, repaint() {}, errorText: String, treeId: 'eve_bevy_panel_test', refresh() {}, scrub: {} });
        await media.playRow('v1');
        expect(options[0]?.revealNodeId).toBe('contact_conversation_review_frame');
        expect(options[0]?.preserveNodeId).toBeTruthy();
        expect(options[1]?.revealNodeId).toBeUndefined();
    }, 20000);
});

describe('the title of a conversation whose card holds a number alone', () => {
    it('is the name their newest message carries, never a number, an id or a handle', async () => {
        const { conversationHeardName, conversationTitleIsNumber } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_conversation_title.js');
        expect(conversationTitleIsNumber('+33663694055')).toBe(true);
        expect(conversationTitleIsNumber('Ana')).toBe(false);
        expect(conversationHeardName([
            { fromName: 'Old', date: '2026-11-12T10:00:00Z' },
            { fromName: '+33663694055', date: '2026-11-13T10:00:00Z' },
            { fromName: 'cf98e858-8634-4585-aae8-5ab8e9bab631', date: '2026-11-13T09:00:00Z' },
            { fromName: 'Godard', date: '2026-11-13T08:00:00Z' }
        ])).toBe('Godard');
        expect(conversationHeardName([{ fromName: '@ana' }, { fromName: 'user_ebc65737-7801-40f1-b2b4-83299619ac91' }])).toBe('');
        expect(conversationHeardName([{ fromId: 'u1', fromName: 'user_ebc65737-7801-40f1-b2b4-83299619ac91' }], n => (n.fromId === 'u1' ? 'Godard' : ''))).toBe('Godard');
    });
});
