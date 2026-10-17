import { test, expect, vi } from 'vitest';
import { authorizeCommunicationPriority } from '../../server/communication_priority.js';
import { guardDirectMessage } from '../../server/communication_delivery.js';
import { normalizeCommunicationAction } from '../../atome/src/shared/communication_contract.js';
import { normalizeOwnNotification } from '../../server/wsNotificationOperations.js';
import { registerCoreAtomeTypes, CORE_ATOME_TYPE_DEFINITIONS } from '../../atome/src/shared/core_atome_types.js';
import { sanitizeAtomeProperties } from '../../atome/src/shared/atome_contract.js';

test('the recipient alone grants priority; normal messages require no private profile read', async () => {
    const vaultRouter = { getState: vi.fn(async () => ({ properties: { eve_profile: { preferences: { contacts: { favorites: [{ id: 'alice' }] } } } } })) };
    const input = { vaultRouter, recipientId: 'bob', sender: { userId: 'alice' } };
    expect(await authorizeCommunicationPriority(input)).toBe('normal'); expect(vaultRouter.getState).not.toHaveBeenCalled();
    expect(await authorizeCommunicationPriority({ ...input, priority: 'urgent' })).toBe('urgent');
    expect(vaultRouter.getState).toHaveBeenCalledWith('bob', 'bob');
    await expect(authorizeCommunicationPriority({ ...input, sender: { userId: 'mallory' }, priority: 'urgent' })).rejects.toThrow('communication_priority_forbidden');
    vaultRouter.getState.mockResolvedValue({ properties: { eve_profile: { preferences: { contacts: { favorites: [] } } } } });
    await expect(authorizeCommunicationPriority({ ...input, priority: 'priority' })).rejects.toThrow('communication_priority_forbidden');
});

test('favorite card identities resolve only inside the recipient vault, using authenticated phone evidence', async () => {
    const vaultRouter = { getState: async (_principal, id) => id === 'bob'
        ? { properties: { eve_profile: { preferences: { contacts: { favorites: [{ id: 'local_card' }] } } } } }
        : { vault_principal_id: 'bob', properties: { phone: '+33612345678' } } };
    expect(await authorizeCommunicationPriority({ vaultRouter, recipientId: 'bob', sender: { userId: 'alice', phone: '+33612345678' }, priority: 'urgent' })).toBe('urgent');
    await expect(authorizeCommunicationPriority({ vaultRouter, recipientId: 'bob', sender: { userId: 'alice', phone: '+33687654321' }, priority: 'urgent' })).rejects.toThrow('forbidden');
});

test('editing a favorite card revokes its old number; only a missing card uses the saved phone', async () => {
    const favorite = { id: 'card', phone: '+33612345678' };
    const profile = { properties: { eve_profile: { preferences: { contacts: { favorites: [favorite] } } } } };
    const vaultRouter = { getState: vi.fn(async (_owner, id) => id === 'bob' ? profile : { owner_id: 'bob', properties: { phone: '+33687654321' } }) };
    const input = { vaultRouter, recipientId: 'bob', sender: { userId: 'alice', phone: '+33612345678' }, priority: 'urgent' };
    await expect(authorizeCommunicationPriority(input)).rejects.toThrow('communication_priority_forbidden');
    vaultRouter.getState.mockImplementation(async (_owner, id) => id === 'bob' ? profile : null);
    expect(await authorizeCommunicationPriority(input)).toBe('urgent');
});

test('a direct sender cannot forge identity, a system command or critical status', () => {
    const raw = JSON.stringify({ command: 'eve-comm-share', params: { id: 'message', priority: 'urgent', fromId: 'trusted',
        severity: 'critical', priority_authorized: true, action: { kind: 'command', toolId: 'ui.project.open', input: {} } } });
    const result = guardDirectMessage(raw, { userId: 'mallory' });
    expect(result.params.fromId).toBe('mallory');
    for (const key of ['severity', 'priority_authorized', 'action']) expect(result.params).not.toHaveProperty(key);
    expect(guardDirectMessage(JSON.stringify({ command: 'eve-comm-share', params: { priority: 'root' } }))).toMatchObject({ ok: false, error: 'communication_priority_invalid' });
    expect(() => normalizeCommunicationAction({ kind: 'url', url: 'javascript:evil()' })).toThrow('communication_action_invalid');
    expect(() => normalizeCommunicationAction({ kind: 'command', toolId: 'ui.project.open', input: { execute() {} } })).toThrow('communication_action_invalid');
    expect(() => normalizeCommunicationAction({ kind: 'command', toolId: 'ui.project.open', input: { value: new Date() } })).toThrow('communication_action_invalid');
});

test('self notices cannot target a different recipient or promote themselves to VIP urgency or critical status', () => {
    const result = normalizeOwnNotification({ id: 'own', kind: 'system', message: 'Local notice', from_id: 'admin',
        to_user_id: 'foreign', priority: 'urgent', severity: 'critical' }, 'owner');
    expect(result).toMatchObject({ from_id: 'owner', to_user_id: 'owner', priority: 'normal', severity: 'info' });
    expect(() => normalizeOwnNotification({ id: 'fake', kind: 'message', message: 'Impersonated message' }, 'owner')).toThrow('notification_payload_invalid');
});

test('persisted correspondence keeps its priority and contextual reference in the canonical typed schema', () => {
    registerCoreAtomeTypes();
    const schema = CORE_ATOME_TYPE_DEFINITIONS.find(type => type.type === 'message').schema;
    const input = { message_id: 'one', from_id: 'alice', to_user_id: 'bob', message: 'Hello', priority: 'urgent',
        action: { kind: 'conversation', contactId: 'alice', messageId: 'one' } };
    expect(sanitizeAtomeProperties(input, { schema, allowUnknownProperties: false })).toEqual(input);
    expect(() => sanitizeAtomeProperties({ ...input, priority: 'root' }, { schema, allowUnknownProperties: false })).toThrow();
});
