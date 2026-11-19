import { test, expect } from 'vitest';
import { normalizeCommunicationAction } from '../../atome/src/shared/communication_contract.js';
import { registerCoreAtomeTypes, CORE_ATOME_TYPE_DEFINITIONS } from '../../atome/src/shared/core_atome_types.js';
import { sanitizeAtomeProperties } from '../../atome/src/shared/atome_contract.js';

// The direct messages' guard and priority, and a self notice kept to its own principal, are the Rust front's
// (tests/atome_server/direct_messages.rs, src/ws_api/notification_ops.rs).
test('a notification action is a reference, never code or a URL', () => {
    expect(() => normalizeCommunicationAction({ kind: 'url', url: 'javascript:evil()' })).toThrow('communication_action_invalid');
    expect(() => normalizeCommunicationAction({ kind: 'command', toolId: 'ui.project.open', input: { execute() {} } })).toThrow('communication_action_invalid');
    expect(() => normalizeCommunicationAction({ kind: 'command', toolId: 'ui.project.open', input: { value: new Date() } })).toThrow('communication_action_invalid');
});

test('persisted correspondence keeps its priority and contextual reference in the canonical typed schema', () => {
    registerCoreAtomeTypes();
    const schema = CORE_ATOME_TYPE_DEFINITIONS.find(type => type.type === 'message').schema;
    const input = { message_id: 'one', from_id: 'alice', to_user_id: 'bob', message: 'Hello', priority: 'urgent',
        action: { kind: 'conversation', contactId: 'alice', messageId: 'one' } };
    expect(sanitizeAtomeProperties(input, { schema, allowUnknownProperties: false })).toEqual(input);
    expect(() => sanitizeAtomeProperties({ ...input, priority: 'root' }, { schema, allowUnknownProperties: false })).toThrow();
});
