export const CALL_RING_TIMEOUT_MS = 10_000;
export const CALL_MODES = Object.freeze(['audio', 'visio']);
export const COMMUNICATION_PAGE_SIZE = 30;
export const COMMUNICATION_PRIORITIES = Object.freeze(['normal', 'priority', 'urgent']);
export const normalizeCommunicationPriority = value => {
    if (value == null) return 'normal';
    if (!COMMUNICATION_PRIORITIES.includes(value)) throw new Error('communication_priority_invalid');
    return value;
};
export const COMMUNICATION_ACTION_SCHEMA = Object.freeze({ type: 'object', properties: {
    kind: { type: 'string', enum: ['conversation', 'command'] }, contactId: { type: 'string' }, messageId: { type: 'string' },
    toolId: { type: 'string' }, input: { type: 'object' }
} });
export const COMMUNICATION_MESSAGE_TYPE = Object.freeze({ type: 'message', kind: 'data_model', traits: ['data', 'nonvisual'], schema: {
    message_id: { type: 'string' }, from_id: { type: 'string' }, from_name: { type: 'string' }, from_phone: { type: 'string' },
    to_user_id: { type: 'string' }, timestamp: { type: 'string' }, subject: { type: 'string' }, message: { type: 'string' },
    atome_ids: { type: 'array', items: { type: 'string' } }, kind: { type: 'string' }, request_atome_id: { type: 'string' },
    request_id: { type: 'string' }, mode: { type: 'string' }, share_type: { type: 'string' }, unread: { type: 'boolean' },
    box: { type: 'string', enum: ['inbox', 'sent'] }, priority: { type: 'string', enum: COMMUNICATION_PRIORITIES, default: 'normal' },
    action: COMMUNICATION_ACTION_SCHEMA
} });

// A notification carries a reference, never executable code or a URL. Commands
// still go through the registered tool gateway and its current policy.
export const normalizeCommunicationAction = action => {
    if (action == null) return null;
    if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('communication_action_invalid');
    const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
    if (action.kind === 'conversation' && id(action.contactId) && id(action.messageId))
        return { kind: 'conversation', contactId: action.contactId, messageId: action.messageId };
    if (action.kind === 'command' && id(action.toolId) && action.input && typeof action.input === 'object' && !Array.isArray(action.input)) {
        const seen = new Set(); let count = 0;
        const data = (value, depth = 0) => {
            if (++count > 2000 || depth > 16) throw new Error('communication_action_invalid');
            if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return value;
            if (!value || typeof value !== 'object' || seen.has(value)) throw new Error('communication_action_invalid');
            if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('communication_action_invalid');
            seen.add(value);
            const result = Array.isArray(value) ? value.map(item => data(item, depth + 1))
                : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, data(item, depth + 1)]));
            seen.delete(value); return result;
        };
        return { kind: 'command', toolId: action.toolId, input: data(action.input) };
    }
    throw new Error('communication_action_invalid');
};
export const normalizeCallMode = mode => {
    if (!CALL_MODES.includes(mode)) throw new Error('communication_call_mode_invalid');
    return mode;
};

// A recording addressed to a contact conversation: account-global, owned by no project.
export const isConversationDestination = destination => destination?.scope === 'global'
    && !!String(destination.contactId || '').trim();

const contactId = { type: 'string', minLength: 1, maxLength: 200 };
export const CONTACT_COMMUNICATION_COMMANDS = Object.freeze([
    { name: 'communication.notification.open', description: 'Read a notification from the current account stack, in the standard panel or its active Dashboard host.',
        required: ['notificationId'], properties: { notificationId: contactId,
            presentation: { type: 'string', enum: ['panel', 'dashboard'] },
            rect: { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: {
                x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } } } } },
    { name: 'communication.notification.publish', description: 'Publish a local calendar or system notice into the current account notification stack. No recipient or elevated priority.',
        persistent: true, required: ['id', 'kind', 'message'], properties: { id: contactId,
            kind: { type: 'string', enum: ['calendar', 'system'] }, message: { type: 'string', maxLength: 8000 },
            subject: { type: 'string', maxLength: 200 }, timestamp: { type: 'string' }, action: COMMUNICATION_ACTION_SCHEMA } },
    { name: 'communication.conversation.open', description: 'Open the existing conversation for a verified peer.',
        required: ['contactId'], properties: { contactId, messageId: contactId } },
    { name: 'communication.call.respond', description: 'Answer or end an authorized incoming call through the canonical signaling owner.',
        required: ['roomId', 'response'], properties: { roomId: contactId, response: { type: 'string', enum: ['accept', 'end'] } } },
    { name: 'contact.favorite.set', description: 'Set a personal contact favorite through the canonical profile.',
        persistent: true, required: ['contactId', 'favorite'], properties: { contactId, favorite: { type: 'boolean' }, phone: { type: 'string' } } },
    { name: 'communication.conversation.read', description: 'Read an authorized page of sent and received eVe messages.',
        required: ['contactId'], properties: { contactId, messageId: contactId, cursor: { type: 'object' }, limit: { type: 'number', minimum: 1, maximum: 100 } } },
    { name: 'communication.conversation.send', description: 'Send a text, an existing conversation recording or owned Atomes (a project, a media) to this contact. Reuse messageId when retrying.',
        persistent: true, required: ['contactId', 'messageId'], properties: { contactId, messageId: contactId,
            text: { type: 'string', maxLength: 8000 }, mediaId: contactId, priority: { type: 'string', enum: COMMUNICATION_PRIORITIES },
            attachmentIds: { type: 'array', items: contactId, maxItems: 10 } } },
    { name: 'communication.conversation.delete', description: 'Delete messages of a conversation for the current account only (the other participant keeps theirs): the messageIds read from communication.conversation.read, or all of it.',
        persistent: true, required: ['contactId'], properties: { contactId, messageIds: { type: 'array', items: contactId, maxItems: 500 },
            all: { type: 'boolean' } } }
]);
// Communicating with a contact never edits a project: these commands run in every work mode.
export const isContactCommunicationCommand = id => CONTACT_COMMUNICATION_COMMANDS.some(command => command.name === id);
