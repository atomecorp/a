// Writes go through the one mutation pipeline (window.Atome.commit), never a direct store write.
const requireAtomeCommit = (requireGlobal) => {
    const atome = requireGlobal('Atome', globalThis.window?.Atome);
    if (typeof atome.commit !== 'function') throw new Error('Atome.commit is not available');
    return atome;
};

export const registerAdoleDefaultTools = ({ Agent, requireGlobal, safeString, getAdoleAPI, invokeRuntimeDefaultTool }) => {
    Agent.registerTool({
        name: 'adole.auth.current',
        description: 'Return current authenticated user info (tauri/fastify).',
        capabilities: ['auth.read'],
        risk_tier: 'low',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
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
        risk_tier: 'low',
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
        description: 'List a bounded metadata index of atomes (id, name, type and hierarchy). No text, image or project contents are returned. Use atomes.get with a known id for an explicitly needed object; prefer get when verifying a created object.',
        capabilities: ['atome.read'],
        risk_tier: 'low',
        parameters: {
            properties: {
                type: { type: 'string' },
                projectId: { type: 'string' },
                ownerId: { type: 'string' },
                includeShared: { type: 'boolean' },
                limit: { type: 'integer', minimum: 1, maximum: 100 },
                offset: { type: 'integer', minimum: 0 }
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
                limit: Math.max(1, Math.min(100, Math.trunc(Number(params?.limit) || 25))),
                ...(Number.isFinite(params?.offset) ? { offset: params.offset } : {})
            };

            const result = await fn(payload);
            const index = records => (records || []).slice(0, payload.limit).map(record => ({
                id: record.id || record.atome_id,
                type: record.type || record.properties?.kind,
                name: record.name || record.properties?.name || null,
                project_id: record.project_id || record.meta?.project_id || null,
                parent_id: record.parent_id || record.meta?.parent_id || null
            }));
            return Object.fromEntries(Object.entries(result).map(([backend, value]) => [backend,
                value && Array.isArray(value.atomes) ? { ...value, atomes: index(value.atomes) } : value]));
        },
        summary: () => 'List atomes'
    });

    Agent.registerTool({
        name: 'adole.atomes.create',
        description: 'Create a nonvisual storage record (type/properties/parentId). For visible drawings, SVG, text, images or project objects use the eVe runtime creation tools instead; this storage operation alone does not render a project object.',
        capabilities: ['atome.write'],
        risk_tier: 'moderate',
        parameters: {
            required: ['type'],
            properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                parentId: { type: 'string' },
                color: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const atome = requireAtomeCommit(requireGlobal);
            const type = safeString(params?.type);
            if (!type) throw new Error('Missing atome type');
            const props = {
                ...(params?.properties && typeof params.properties === 'object' ? params.properties
                    : (params?.particles && typeof params.particles === 'object' ? params.particles : {})),
                ...(params?.color ? { color: String(params.color) } : {})
            };
            // The owner is the authenticated session's, never a parameter.
            return atome.commit({
                kind: 'set',
                atome_id: safeString(params?.id) || globalThis.crypto.randomUUID(),
                type,
                ...(params?.parentId ? { project_id: String(params.parentId) } : {}),
                props
            });
        },
        summary: () => 'Create atome'
    });

    Agent.registerTool({
        name: 'adole.atomes.alter',
        description: 'Alter/patch atome properties by id.',
        capabilities: ['atome.write'],
        risk_tier: 'moderate',
        parameters: {
            required: ['id'],
            properties: {
                id: { type: 'string' },
                properties: { type: 'object' },
                particles: { type: 'object' }
            }
        },
        handler: async ({ params }) => {
            const atome = requireAtomeCommit(requireGlobal);
            const id = safeString(params?.id);
            if (!id) throw new Error('Missing atome id');
            const payload = params?.properties || params?.particles;
            if (!payload || typeof payload !== 'object' || !Object.keys(payload).length) {
                throw new Error('Missing properties payload');
            }
            return atome.commit({ kind: 'set', atome_id: id, props: payload });
        },
        summary: (params) => `Alter atome ${params?.id || ''}`
    });

    Agent.registerTool({
        name: 'eve.mtrack.clip.move',
        description: 'Move one or more MTrack clips (time and/or track) through the mtrack tool action pipeline.',
        capabilities: ['timeline.write', 'ui.write'],
        risk_tier: 'moderate',
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
        risk_tier: 'moderate',
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
