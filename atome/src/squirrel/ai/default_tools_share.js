export const registerShareDefaultTools = ({ Agent, requireGlobal, safeString, getAdoleAPI }) => {
    Agent.registerTool({
        name: 'adole.share.atomes',
        description: 'Share one or more atomes with a user (by phone number).',
        capabilities: ['share.write'],
        risk_tier: 'HIGH',
        parameters: {
            required: ['phoneNumber', 'atomeIds', 'permissions'],
            properties: {
                phoneNumber: { type: 'string' },
                atomeIds: { type: 'array' },
                permissions: { type: 'object' },
                mode: { type: 'string', enum: ['real-time', 'validation-based'] }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.share?.shareAtome || api?.share?.share_atome;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.share_atome is not available');

            const phoneNumber = safeString(params?.phoneNumber);
            if (!phoneNumber) throw new Error('Missing phoneNumber');

            const atomeIds = Array.isArray(params?.atomeIds)
                ? params.atomeIds.map(String)
                : [String(params?.atomeIds || '')].filter(Boolean);
            if (!atomeIds.length) throw new Error('Missing atomeIds');

            const permissions = params?.permissions;
            if (!permissions || typeof permissions !== 'object') throw new Error('Missing permissions');

            const mode = safeString(params?.mode) || 'real-time';
            return fn(phoneNumber, atomeIds, permissions, mode);
        },
        summary: () => 'Share atomes'
    });

    Agent.registerTool({
        name: 'adole.share.grant_permission',
        description: 'Grant share permissions (Fastify) without creating share_request atomes.',
        capabilities: ['share.write'],
        risk_tier: 'HIGH',
        parameters: {
            required: ['atomeId', 'principalId', 'permissions'],
            properties: {
                atomeId: { type: 'string' },
                principalId: { type: 'string' },
                permissions: { type: 'object' },
                particleKey: { type: 'string' },
                expiresAt: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.share?.grantSharePermission || api?.share?.grant_share_permission;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.grant_share_permission is not available');

            const atomeId = safeString(params?.atomeId);
            const principalId = safeString(params?.principalId);
            if (!atomeId || !principalId) throw new Error('Missing atomeId/principalId');
            const permissions = params?.permissions;
            if (!permissions || typeof permissions !== 'object') throw new Error('Missing permissions');

            const options = {
                ...(params?.particleKey ? { particleKey: String(params.particleKey) } : {}),
                ...(params?.expiresAt ? { expiresAt: String(params.expiresAt) } : {})
            };

            return fn(atomeId, principalId, permissions, options);
        },
        summary: () => 'Grant share permission'
    });

    Agent.registerTool({
        name: 'adole.share.publish',
        description: 'Publish/share payload via Fastify share.publish.',
        capabilities: ['share.write'],
        risk_tier: 'HIGH',
        parameters: {
            properties: {
                payload: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.share?.publish || api?.share?.share_publish;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.share.publish is not available');
            return fn(params?.payload || {});
        },
        summary: () => 'Publish share payload'
    });
};
