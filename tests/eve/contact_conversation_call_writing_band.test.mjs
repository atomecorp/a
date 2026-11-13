import { describe, it, expect } from 'vitest';

const { buildContactConversationBandItems } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_conversation_view.js');

const state = phase => ({ call: { phase, mode: 'audio' }, contact: { id: 'ana' }, memo: { phase: 'idle', kind: '' }, video: { phase: 'idle' }, ticked: [], takes: [], attachments: [], text: '', composed: false });
const band = (phase, writing) => buildContactConversationBandItems(state(phase), () => ({ ok: true }), {
    writing, field: null, choice: { bandItems: () => null, chooseTool: () => ({ key: 'choice' }) }, when: { tool: () => ({ key: 'when' }) } });
const keys = items => items.map(item => item.key);

describe('« Écrire » during an answered call (R-135)', () => {
    it('lays the conversation tools, Joint on, no take recorded while the call holds the micro', () => {
        const items = band('live', true);
        expect(keys(items)).not.toContain('contact_conversation_hangup');
        const attach = items.find(item => item.key === 'contact_conversation_attach');
        expect(attach?.disabled).toBe(false);
        expect(items.some(item => item.icon === 'video' || item.icon === 'microphone')).toBe(false);
        expect(band('idle', false).some(item => item.icon === 'microphone')).toBe(true);
        expect(keys(items)).toContain('contact_conversation_send');
    });
    it('keeps the call band while the call screen shows', () => {
        expect(keys(band('live', false))).toContain('contact_conversation_hangup');
    });
});
