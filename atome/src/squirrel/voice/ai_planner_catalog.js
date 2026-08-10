const toText = (value, limit = 240) => String(value == null ? '' : value).trim().slice(0, limit);

const searchWords = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);

const rankCatalog = (entries = [], utterance = '', limit = 24) => {
    const words = searchWords(utterance);
    return (Array.isArray(entries) ? entries : [])
        .map((entry, index) => {
            const searchable = searchWords(JSON.stringify({
                id: entry?.tool_id || entry?.name || entry?.id,
                description: entry?.description || entry?.meta?.description,
                domain: entry?.domain,
                actions: entry?.actions || entry?.behavior?.actions
            }));
            const score = words.reduce((total, word) => total + (searchable.includes(word) ? 1 : 0), 0);
            return { entry, index, score };
        })
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, limit)
        .map(({ entry }) => entry);
};

const compactSchemaProperty = (property = {}) => {
    if (!property || typeof property !== 'object') return {};
    return {
        ...(property.type != null ? { type: property.type } : {}),
        ...(property.description ? { description: toText(property.description, 80) } : {}),
        ...(Array.isArray(property.enum) ? { enum: property.enum.slice(0, 12) } : {}),
        ...(property.items && typeof property.items === 'object'
            ? { items: compactSchemaProperty(property.items) }
            : {})
    };
};

export const compactPlannerSchema = (schema = null) => {
    if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const propertyLimit = Math.min(12, Math.max(6, required.size));
    const properties = Object.entries(schema.properties || {})
        .sort(([left], [right]) => Number(required.has(right)) - Number(required.has(left)))
        .slice(0, propertyLimit)
        .reduce((acc, [key, value]) => {
            acc[key] = compactSchemaProperty(value);
            return acc;
        }, {});
    return {
        type: schema.type || 'object',
        properties,
        ...(Array.isArray(schema.required) ? { required: schema.required.slice(0, propertyLimit) } : {}),
        ...(typeof schema.additionalProperties === 'boolean'
            ? { additionalProperties: schema.additionalProperties }
            : {})
    };
};

export const compactPlannerRuntimeTools = (tools = [], { utterance = '' } = {}) => rankCatalog(tools, utterance, 10)
    .map((tool) => ({
        tool_id: toText(tool?.tool_id || tool?.name || tool?.id),
        description: toText(tool?.description || tool?.meta?.description || tool?.meta?.name, 120),
        actions: (Array.isArray(tool?.actions) ? tool.actions : tool?.behavior?.actions || [])
            .map((entry) => toText(entry, 80)).filter(Boolean).slice(0, 12),
        input_schema: compactPlannerSchema(tool?.parameters || tool?.input_schema)
    }))
    .filter((tool) => tool.tool_id);

export const compactPlannerAtomeAiTools = (tools = [], { utterance = '' } = {}) => rankCatalog(tools, utterance, 8)
    .map((tool) => ({
        name: toText(tool?.name),
        description: toText(tool?.description, 120),
        domain: toText(tool?.domain, 80),
        input_schema: compactPlannerSchema(tool?.parameters || tool?.input_schema)
    }))
    .filter((tool) => tool.name);
