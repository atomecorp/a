export const registerMailDefaultTools = ({ Agent, safeString, prepareMailApi }) => {
    Agent.registerTool({
        name: 'mail.list',
        description: 'List locally indexed mail items.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                mailbox: { type: 'string' },
                unread_only: { type: 'boolean' },
                limit: { type: 'number' },
                after_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            return api.list(params || {});
        },
        summary: () => 'List mail'
    });

    Agent.registerTool({
        name: 'mail.read',
        description: 'Read one locally indexed mail item by message id.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.read(messageId);
        },
        summary: (params) => `Read mail ${params?.message_id || params?.messageId || ''}`
    });

    Agent.registerTool({
        name: 'mail.search',
        description: 'Search the local mail index.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['query'],
            properties: {
                query: { type: 'string' },
                mailbox: { type: 'string' },
                unread_only: { type: 'boolean' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.search(query, params || {});
        },
        summary: (params) => `Search mail ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'mail.next_unread',
        description: 'Return the next unread mail from the local index.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                mailbox: { type: 'string' },
                after_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            return api.nextUnread(params || {});
        },
        summary: () => 'Next unread mail'
    });

    Agent.registerTool({
        name: 'mail.summarize',
        description: 'Summarize the local mail index.',
        capabilities: ['mail.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                mailbox: { type: 'string' },
                unread_only: { type: 'boolean' },
                limit: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            return api.summarize(params || {});
        },
        summary: () => 'Summarize mail'
    });

    Agent.registerTool({
        name: 'mail.reply_draft',
        description: 'Create a local reply draft for a mail item.',
        capabilities: ['mail.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' },
                reply_text: { type: 'string' },
                signature: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.replyDraft(messageId, {
                reply_text: params?.reply_text || params?.replyText || '',
                signature: params?.signature || ''
            });
        },
        summary: () => 'Draft mail reply'
    });

    Agent.registerTool({
        name: 'mail.mark_read',
        description: 'Mark one mail item as read.',
        capabilities: ['mail.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.markRead(messageId, { read: true });
        },
        summary: (params) => `Mark mail read ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.mark_unread',
        description: 'Mark one mail item as unread.',
        capabilities: ['mail.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.markUnread(messageId, { read: false });
        },
        summary: (params) => `Mark mail unread ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.archive',
        description: 'Archive one mail item.',
        capabilities: ['mail.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.archive(messageId, {});
        },
        summary: (params) => `Archive mail ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.delete',
        description: 'Delete one mail item.',
        capabilities: ['mail.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['message_id'],
            properties: {
                message_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const messageId = safeString(params?.message_id || params?.messageId || params?.id);
            if (!messageId) throw new Error('Missing message_id');
            return api.delete(messageId, {});
        },
        summary: (params) => `Delete mail ${params?.message_id || params?.messageId || params?.id || ''}`
    });

    Agent.registerTool({
        name: 'mail.send',
        description: 'Queue a locally prepared draft for send after explicit confirmation.',
        capabilities: ['mail.send'],
        risk_tier: 'HIGH',
        parameters: {
            required: ['draft_id'],
            properties: {
                draft_id: { type: 'string' },
                confirmed: { type: 'boolean' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareMailApi(params || {});
            const draftId = safeString(params?.draft_id || params?.draftId || params?.id);
            if (!draftId) throw new Error('Missing draft_id');
            return api.send(draftId, {
                confirmed: params?.confirmed === true
            });
        },
        summary: () => 'Send mail draft'
    });
};
