import { test, expect, vi, beforeEach } from 'vitest';
import { handleWsCommunication } from '../../server/wsCommunicationOperations.js';

const state = vi.hoisted(() => ({ messages: new Map(), stacked: [], favorites: new Map(), blocked: false }));
vi.mock('../../database/adole.js', () => ({ default: { getDataSourceAdapter: () => ({}) } }));
vi.mock('../../server/auth_users.js', () => ({ findUserById: async (_source, id) => ({ user_id: id, username: id, phone: id === 'alice' ? '+33612345678' : '+33687654321' }), findUserByPhone: async () => null }));
vi.mock('../../server/wsApiIdentity.js', () => ({ resolveWsApiPrincipal: connection => connection.userId, isWsApiPrincipalProvisioned: async id => !!id }));
vi.mock('../../server/communication_messages.js', () => ({
    readPersistedCommunicationMessage: async (_router, owner, id) => state.messages.get(owner + ':' + id),
    persistCommunicationMessage: async (_router, owner, props) => { state.messages.set(owner + ':' + props.message_id, props); },
    readConversation: vi.fn()
}));
vi.mock('../../server/notificationStack.js', () => ({ pushNotificationToUserStack: async input => {
    state.stacked.push(input); return { ok: true, deliverPush: async () => ({ ok: true }) };
} }));
beforeEach(() => { state.messages.clear(); state.stacked = []; state.favorites = new Map([['bob', [{ id: 'alice' }]]]); state.blocked = false; });

const send = async ({ target = 'bob', id = 'one', priority = 'normal', ...extra } = {}) => {
    const replies = [], delivered = vi.fn(() => ({ delivered: true }));
    const vault = { getState: vi.fn(async owner => ({ properties: { eve_profile: { preferences: { contacts: { favorites: state.favorites.get(owner) || [] } } } } })) };
    await handleWsCommunication({ data: { type: 'direct-message', toUserId: target,
        message: JSON.stringify({ command: 'eve-comm-share', params: { id, priority, message: 'Hello', ...extra } }) },
        connection: { userId: 'alice', _wsApiVaultRouter: vault }, safeSend: reply => replies.push(reply),
        relations: { canCommunicate: async () => state.blocked ? { ok: false, error: 'contact_blocked' } : { ok: true } },
        rateAllowed: () => true, deliver: delivered, enqueue: vi.fn(), visio: {} });
    return { reply: replies[0], delivered, vault };
};

test('each recipient independently authorizes priority, blocks still apply, and the outgoing payload is server-owned', async () => {
    const accepted = await send({ priority: 'urgent', fromId: 'administrator', severity: 'critical',
        action: { kind: 'command', toolId: 'ui.project.open', input: {} } });
    expect(accepted.reply.success).toBe(true);
    const payload = JSON.parse(accepted.delivered.mock.calls[0][1].message).params;
    expect(payload).toMatchObject({ fromId: 'alice', priority: 'urgent', action: { kind: 'conversation', contactId: 'alice', messageId: 'one' } });
    expect(payload).not.toHaveProperty('severity');
    expect((await send({ target: 'eve', id: 'two', priority: 'urgent' })).reply).toMatchObject({ success: false, error: 'communication_priority_forbidden' });
    expect(state.messages.has('eve:two')).toBe(false);
    state.blocked = true;
    const blocked = await send({ id: 'blocked', priority: 'urgent' });
    expect(blocked.reply.error).toBe('contact_blocked'); expect(blocked.vault.getState).not.toHaveBeenCalled();
});

test('replay is idempotent, cannot change priority, and revoked VIP rights take effect immediately', async () => {
    expect((await send({ priority: 'urgent' })).reply.success).toBe(true);
    const replay = await send({ priority: 'urgent' });
    expect(replay.reply).toMatchObject({ success: true, duplicate: true }); expect(replay.delivered).not.toHaveBeenCalled();
    expect((await send({ priority: 'normal' })).reply.error).toBe('direct_message_id_conflict');
    state.favorites.set('bob', []);
    expect((await send({ id: 'revoked', priority: 'priority' })).reply.error).toBe('communication_priority_forbidden');
    expect((await send({ id: 'normal', priority: 'normal' })).reply.success).toBe(true);
});
