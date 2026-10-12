export const CALL_RING_TIMEOUT_MS = 10_000;
export const CALL_MODES = Object.freeze(['audio', 'visio']);
export const COMMUNICATION_PAGE_SIZE = 30;
export const normalizeCallMode = mode => {
    if (!CALL_MODES.includes(mode)) throw new Error('communication_call_mode_invalid');
    return mode;
};

const contactId = { type: 'string', minLength: 1, maxLength: 200 };
export const CONTACT_COMMUNICATION_COMMANDS = Object.freeze([
    { name: 'contact.favorite.set', description: 'Set a personal contact favorite through the canonical profile.',
        persistent: true, required: ['contactId', 'favorite'], properties: { contactId, favorite: { type: 'boolean' }, phone: { type: 'string' } } },
    { name: 'communication.conversation.read', description: 'Read an authorized page of sent and received eVe messages.',
        required: ['contactId'], properties: { contactId, cursor: { type: 'object' }, limit: { type: 'number', minimum: 1, maximum: 100 } } },
    { name: 'communication.conversation.send', description: 'Send a text, an existing conversation recording or owned Atomes (a project, a media) to this contact. Reuse messageId when retrying.',
        persistent: true, required: ['contactId', 'messageId'], properties: { contactId, messageId: contactId,
            text: { type: 'string', maxLength: 8000 }, mediaId: contactId,
            attachmentIds: { type: 'array', items: contactId, maxItems: 10 } } }
]);
