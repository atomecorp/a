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
