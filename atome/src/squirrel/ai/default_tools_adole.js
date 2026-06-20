export const registerAdoleDefaultTools = ({ Agent, requireGlobal, safeString, getAdoleAPI }) => {
    Agent.registerTool({
        name: 'adole.auth.current',
        description: 'Return current authenticated user info (tauri/fastify).',
        capabilities: ['auth.read'],
        risk_tier: 'LOW',
        handler: async () => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.auth?.current;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.auth.current is not available');
            return fn();
        },
        summary: () => 'Read current user'
    });

    Agent.registerTool({
        name: 'adole.atomes.get',
        description: 'Get one atome by id.',
        capabilities: ['atome.read'],
        risk_tier: 'LOW',
        parameters: {
            required: ['id'],
            properties: {
                id: { type: 'string' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.atomes?.get;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.get is not available');
            const id = safeString(params?.id);
            if (!id) throw new Error('Missing atome id');
            return fn(id);
        },
        summary: (params) => `Read atome ${params?.id || ''}`
    });

    Agent.registerTool({
        name: 'adole.atomes.list',
        description: 'List atomes (optional type/projectId/ownerId/includeShared).',
        capabilities: ['atome.read'],
        risk_tier: 'LOW',
        parameters: {
            properties: {
                type: { type: 'string' },
                projectId: { type: 'string' },
                ownerId: { type: 'string' },
                includeShared: { type: 'boolean' },
                limit: { type: 'number' },
                offset: { type: 'number' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.atomes?.list;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.list is not available');

            const payload = {
                ...(params?.type ? { type: String(params.type) } : {}),
                ...(params?.projectId ? { projectId: String(params.projectId) } : {}),
                ...(params?.ownerId ? { ownerId: String(params.ownerId) } : {}),
                ...(typeof params?.includeShared === 'boolean' ? { includeShared: params.includeShared } : {}),
                ...(Number.isFinite(params?.limit) ? { limit: params.limit } : {}),
                ...(Number.isFinite(params?.offset) ? { offset: params.offset } : {})
            };

            return fn(payload);
        },
        summary: () => 'List atomes'
    });

    Agent.registerTool({
        name: 'adole.atomes.create',
        description: 'Create an atome (type/properties/parentId/ownerId). Useful for messages, documents, shapes, etc.',
        capabilities: ['atome.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                parentId: { type: 'string' },
                ownerId: { type: 'string' },
                color: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.atomes?.create;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.create is not available');

            const payload = {
                ...(params?.id ? { id: String(params.id) } : {}),
                ...(params?.type ? { type: String(params.type) } : {}),
                ...(params?.color ? { color: String(params.color) } : {}),
                ...(params?.parentId ? { projectId: String(params.parentId) } : {}),
                ...(params?.ownerId ? { ownerId: String(params.ownerId) } : {}),
                ...(params?.properties && typeof params.properties === 'object' ? { properties: params.properties } : {}),
                ...(params?.particles && typeof params.particles === 'object' && !params?.properties ? { particles: params.particles } : {})
            };

            return fn(payload);
        },
        summary: () => 'Create atome'
    });

    Agent.registerTool({
        name: 'adole.atomes.alter',
        description: 'Alter/patch atome properties by id.',
        capabilities: ['atome.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            required: ['id'],
            properties: {
                id: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const api = requireGlobal('AdoleAPI', getAdoleAPI());
            const fn = api?.atomes?.alter;
            if (typeof fn !== 'function') throw new Error('AdoleAPI.atomes.alter is not available');
            const id = safeString(params?.id);
            if (!id) throw new Error('Missing atome id');
            const payload = params?.properties || params?.particles;
            if (!payload || typeof payload !== 'object') {
                throw new Error('Missing properties payload');
            }
            return fn(id, payload);
        },
        summary: (params) => `Alter atome ${params?.id || ''}`
    });

    Agent.registerTool({
        name: 'eve.mtrack.clip.move',
        description: 'Move one or more MTrack clips (time and/or track) through the mtrack tool action pipeline.',
        capabilities: ['timeline.write', 'ui.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            properties: {
                clip_ids: { type: 'array' },
                clip_id: { type: 'string' },
                atome_ids: { type: 'array' },
                atome_id: { type: 'string' },
                start_seconds: { type: 'number' },
                delta_seconds: { type: 'number' },
                track_id: { type: 'number' },
                track_key: { type: 'string' },
                track_delta: { type: 'number' },
                snap: { type: 'boolean' },
                scope: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            return invokeRuntimeDefaultTool({
                tool_id: 'ui.move',
                source_tool: 'eve.mtrack.clip.move',
                params,
                context,
                action: 'on_apply'
            });
        },
        summary: () => 'Move MTrack clip(s)'
    });

    Agent.registerTool({
        name: 'eve.mtrack.clip.crop',
        description: 'Crop one or more MTrack clips (trim in/out) through the mtrack tool action pipeline.',
        capabilities: ['timeline.write', 'ui.write'],
        risk_tier: 'MEDIUM',
        parameters: {
            properties: {
                clip_ids: { type: 'array' },
                clip_id: { type: 'string' },
                atome_ids: { type: 'array' },
                atome_id: { type: 'string' },
                in_seconds: { type: 'number' },
                in_delta_seconds: { type: 'number' },
                out_seconds: { type: 'number' },
                out_delta_seconds: { type: 'number' },
                snap: { type: 'boolean' },
                scope: { type: 'string' }
            }
        },
        handler: async ({ params, context }) => {
            return invokeRuntimeDefaultTool({
                tool_id: 'ui.crop',
                source_tool: 'eve.mtrack.clip.crop',
                params,
                context,
                action: 'on_apply'
            });
        },
        summary: () => 'Crop MTrack clip(s)'
    });
};
