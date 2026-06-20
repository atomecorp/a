export const registerContactsDefaultTools = ({ Agent, safeString, prepareContactsApi, requireContactsApi }) => {
    Agent.registerTool({
        name: 'contacts.sources',
        description: 'List contact sources currently bridged into eVe.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = await prepareContactsApi();
            return api.sources();
        },
        summary: () => 'List contact sources'
    });

    Agent.registerTool({
        name: 'contacts.list',
        description: 'List synchronized contacts available in eVe.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                limit: { type: 'number' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareContactsApi();
            return api.list(params || {});
        },
        summary: () => 'List contacts'
    });

    Agent.registerTool({
        name: 'contacts.search',
        description: 'Search synchronized contacts by name, email or phone.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['query'],
            properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
                source_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareContactsApi();
            const query = safeString(params?.query || params?.q);
            if (!query) throw new Error('Missing query');
            return api.search(query, params || {});
        },
        summary: (params) => `Search contacts ${params?.query || params?.q || ''}`
    });

    Agent.registerTool({
        name: 'contacts.read',
        description: 'Read one synchronized contact by contact id or source contact id.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['contact_id'],
            properties: {
                contact_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await prepareContactsApi();
            const contactId = safeString(params?.contact_id || params?.contactId || params?.id);
            if (!contactId) throw new Error('Missing contact_id');
            return api.read(contactId);
        },
        summary: (params) => `Read contact ${params?.contact_id || params?.contactId || ''}`
    });

    Agent.registerTool({
        name: 'contacts.create',
        description: 'Create one local eVe contact.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                contact: { type: 'object' },
                name: { type: 'string' },
                first_name: { type: 'string' },
                nickname: { type: 'string' },
                phone: { type: 'string' },
                email: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.createLocalContact !== 'function') {
                throw new Error('Contacts create API is not available');
            }
            const contact = params?.contact && typeof params.contact === 'object'
                ? { ...params.contact }
                : { ...(params || {}) };
            delete contact.contact;
            return api.createLocalContact(contact, params || {});
        },
        summary: (params) => `Create contact ${params?.contact?.name || params?.name || ''}`
    });

    Agent.registerTool({
        name: 'contacts.update',
        description: 'Update one local eVe contact.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['contact_id'],
            properties: {
                contact_id: { type: 'string' },
                changes: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.updateLocalContact !== 'function') {
                throw new Error('Contacts update API is not available');
            }
            const contactId = safeString(params?.contact_id || params?.contactId || params?.id);
            if (!contactId) throw new Error('Missing contact_id');
            const changes = params?.changes && typeof params.changes === 'object'
                ? { ...params.changes }
                : params?.contact && typeof params.contact === 'object'
                    ? { ...params.contact }
                    : { ...(params || {}) };
            delete changes.contact_id;
            delete changes.contactId;
            delete changes.id;
            delete changes.changes;
            delete changes.contact;
            return api.updateLocalContact(contactId, changes, params || {});
        },
        summary: (params) => `Update contact ${params?.contact_id || params?.contactId || ''}`
    });

    Agent.registerTool({
        name: 'contacts.delete',
        description: 'Delete one local eVe contact.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        parameters: {
            required: ['contact_id'],
            properties: {
                contact_id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.deleteLocalContact !== 'function') {
                throw new Error('Contacts delete API is not available');
            }
            const contactId = safeString(params?.contact_id || params?.contactId || params?.id);
            if (!contactId) throw new Error('Missing contact_id');
            return api.deleteLocalContact(contactId, params || {});
        },
        summary: (params) => `Delete contact ${params?.contact_id || params?.contactId || ''}`
    });

    Agent.registerTool({
        name: 'contacts.import_macos',
        description: 'Import contacts from the local macOS Contacts snapshot into the eVe local contacts store.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.importMacosContacts !== 'function') {
                throw new Error('Contacts import API is not available');
            }
            return api.importMacosContacts(params || {});
        },
        summary: () => 'Import Mac contacts'
    });

    Agent.registerTool({
        name: 'contacts.import_icloud',
        description: 'Import contacts from iCloud CardDAV into the eVe local contacts store.',
        capabilities: ['contacts.write'],
        risk_tier: 'LOW',
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.importIcloudContacts !== 'function') {
                throw new Error('iCloud contacts import API is not available');
            }
            return api.importIcloudContacts(params || {});
        },
        summary: () => 'Import iCloud contacts'
    });

    Agent.registerTool({
        name: 'contacts.push_icloud',
        description: 'Push one eVe contact to iCloud Contacts after explicit confirmation.',
        capabilities: ['contacts.write'],
        risk_tier: 'HIGH',
        parameters: {
            properties: {
                contact_id: { type: 'string' },
                contact: { type: 'object' },
                confirmed: { type: 'boolean' }
            }
        },
        handler: async ({ params }) => {
            const api = await requireContactsApi();
            if (!api || typeof api.pushContactToIcloud !== 'function') {
                throw new Error('iCloud contacts write API is not available');
            }
            return api.pushContactToIcloud(params || {});
        },
        summary: (params) => `Push contact to iCloud ${params?.contact_id || params?.contact?.name || ''}`
    });

    Agent.registerTool({
        name: 'contacts.open_panel',
        description: 'Open the existing eVe contact panel.',
        capabilities: ['contacts.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = await prepareContactsApi();
            return api.openPanel();
        },
        summary: () => 'Open contact panel'
    });
};
