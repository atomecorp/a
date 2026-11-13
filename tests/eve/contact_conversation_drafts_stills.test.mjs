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
