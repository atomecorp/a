import { RISK_TIERS, DEFAULT_OUTPUT_SCHEMA, DEFAULT_TIMEOUT_MS } from './agent_gateway_state.js';

const toIso = () => new Date().toISOString();

const makeId = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const stableStringify = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const hashString = (input) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${(hash >>> 0).toString(16)}`;
};

const makeParamsHash = (params) => hashString(stableStringify(params || {}));

const normalizeSource = (value) => {
  if (value && typeof value === 'object') {
    const type = String(value.type || '').trim() || 'ai';
    const layer = String(value.layer || '').trim() || null;
    return layer ? { type, layer } : { type };
  }
  const type = String(value || '').trim();
  return type ? { type } : { type: 'ai' };
};

const normalizeStringArray = (value) => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
};

const normalizeDomain = (value, name = '') => {
  const explicit = String(value || '').trim().toLowerCase();
  if (explicit) return explicit;
  const fromName = String(name || '').trim().split('.')[0];
  return fromName || 'runtime';
};

const normalizeLatencyClass = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['instant', 'fast', 'moderate', 'slow'].includes(normalized)) return normalized;
  return 'moderate';
};

const normalizeFreshnessRequirements = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['realtime', 'recent', 'cached'].includes(normalized)) return normalized;
  return 'recent';
};

const normalizeRollbackStrategy = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['adole_undo', 'compensating_action', 'none'].includes(normalized)) return normalized;
  return 'none';
};

const normalizeRiskTier = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'read';
  const normalized = raw.toLowerCase();
  if (RISK_TIERS.includes(normalized)) return normalized;
  return 'read';
};

const inferSideEffects = ({ name = '', domain = '', riskTier = 'read', explicit = null }) => {
  const normalizedExplicit = normalizeStringArray(explicit);
  if (normalizedExplicit.length) return normalizedExplicit;
  if (riskTier === 'read') return [];
  const normalizedName = String(name || '').trim().toLowerCase();
  if (normalizedName.includes('send')) return ['sends_external_message'];
  if (normalizedName.includes('delete')) return [`deletes_${domain || 'resource'}`];
  if (normalizedName.includes('archive')) return [`archives_${domain || 'resource'}`];
  if (normalizedName.includes('update')) return [`modifies_${domain || 'resource'}`];
  if (normalizedName.includes('create')) return [`creates_${domain || 'resource'}`];
  if (normalizedName.includes('mark')) return [`updates_${domain || 'resource'}_state`];
  return [`modifies_${domain || 'resource'}`];
};

const inferIdempotent = ({ explicit, riskTier = 'read', name = '' }) => {
  if (typeof explicit === 'boolean') return explicit;
  if (riskTier === 'read') return true;
  const normalizedName = String(name || '').trim().toLowerCase();
  if (normalizedName.includes('mark_read') || normalizedName.includes('mark_unread') || normalizedName.includes('update')) {
    return true;
  }
  return false;
};

const inferUndoable = ({ explicit, riskTier = 'read', name = '' }) => {
  if (typeof explicit === 'boolean') return explicit;
  if (riskTier === 'read') return false;
  const normalizedName = String(name || '').trim().toLowerCase();
  if (normalizedName.includes('send') || normalizedName.includes('delete')) return false;
  if (normalizedName.startsWith('runtime.') || normalizedName.startsWith('ui.')) return true;
  if (normalizedName.includes('archive') || normalizedName.includes('update') || normalizedName.includes('create')) return true;
  return false;
};

const normalizeSchema = (schema) => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return {
      type: 'object',
      properties: {},
      required: []
    };
  }
  return {
    ...cloneValue(schema),
    type: schema.type || 'object',
    properties: schema.properties && typeof schema.properties === 'object' ? cloneValue(schema.properties) : {},
    required: Array.isArray(schema.required) ? [...schema.required] : []
  };
};

const validateType = (value, type) => {
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  return typeof value === type;
};

const validateParams = (schema, params) => {
  if (!schema) return { ok: true };
  const value = params || {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  for (const key of required) {
    if (!(key in value)) {
      return { ok: false, error: `Missing required param: ${key}` };
    }
  }

  const properties = schema.properties || {};
  for (const [key, rules] of Object.entries(properties)) {
    if (!(key in value)) continue;
    if (rules.type && !validateType(value[key], rules.type)) {
      return { ok: false, error: `Invalid type for ${key}` };
    }
    if (Array.isArray(rules.enum) && !rules.enum.includes(value[key])) {
      return { ok: false, error: `Invalid enum value for ${key}` };
    }
  }

  return { ok: true };
};

const buildHumanSummary = (tool, params) => {
  if (typeof tool.summary === 'function') {
    return tool.summary(params || {});
  }
  return `${tool.name} executed`;
};

const buildToolchainSummary = (steps = []) => {
  const labels = steps.map((step) => step?.tool?.name || step?.tool_name || '').filter(Boolean);
  if (!labels.length) return 'No actions to execute';
  if (labels.length === 1) return `Execute ${labels[0]}`;
  return `Execute ${labels.length} actions: ${labels.join(', ')}`;
};

const publicToolDefinition = (tool) => ({
  name: tool.name,
  domain: tool.domain,
  description: tool.description,
  parameters: cloneValue(tool.parameters),
  output_schema: cloneValue(tool.output_schema),
  risk_tier: tool.risk_tier,
  side_effects: [...tool.side_effects],
  idempotent: tool.idempotent,
  undoable: tool.undoable,
  supported_environments: [...tool.supported_environments],
  permissions_required: [...tool.permissions_required],
  preconditions: [...tool.preconditions],
  postconditions: [...tool.postconditions],
  rollback_strategy: tool.rollback_strategy,
  latency_class: tool.latency_class,
  requires_user_presence: tool.requires_user_presence,
  freshness_requirements: tool.freshness_requirements,
  capabilities: [...tool.capabilities]
});

const normalizeToolDefinition = (tool) => {
  const name = String(tool?.name || '').trim();
  const domain = normalizeDomain(tool?.domain, name);
  const riskTier = normalizeRiskTier(tool?.risk_tier);
  const riskSource = tool?.risk_tier ? 'spec' : 'default';
  const parameters = normalizeSchema(tool?.parameters);
  const outputSchema = normalizeSchema(tool?.output_schema || tool?.outputSchema || DEFAULT_OUTPUT_SCHEMA);

  return {
    name,
    domain,
    description: tool.description || '',
    parameters,
    output_schema: outputSchema,
    risk_tier: riskTier,
    side_effects: inferSideEffects({
      name,
      domain,
      riskTier,
      explicit: tool.side_effects
    }),
    idempotent: inferIdempotent({
      explicit: tool.idempotent,
      riskTier,
      name
    }),
    undoable: inferUndoable({
      explicit: tool.undoable,
      riskTier,
      name
    }),
    supported_environments: normalizeStringArray(tool.supported_environments),
    permissions_required: normalizeStringArray(tool.permissions_required),
    preconditions: normalizeStringArray(tool.preconditions),
    postconditions: normalizeStringArray(tool.postconditions),
    rollback_strategy: normalizeRollbackStrategy(tool.rollback_strategy),
    latency_class: normalizeLatencyClass(tool.latency_class),
    requires_user_presence: tool.requires_user_presence === true,
    freshness_requirements: normalizeFreshnessRequirements(tool.freshness_requirements),
    capabilities: normalizeStringArray(tool.capabilities),
    timeout_ms: Number.isFinite(tool.timeout_ms) ? tool.timeout_ms : DEFAULT_TIMEOUT_MS,
    handler: tool.handler,
    summary: tool.summary || null,
    policy: tool.policy || null,
    precondition_check: typeof tool.precondition_check === 'function' ? tool.precondition_check : null,
    postcondition_check: typeof tool.postcondition_check === 'function' ? tool.postcondition_check : null,
    rollback: typeof tool.rollback === 'function' ? tool.rollback : null,
    confirmation_policy: String(tool.confirmation_policy || '').trim().toLowerCase()
      || (riskSource === 'spec' && ['moderate', 'high', 'irreversible'].includes(riskTier) ? 'always' : 'auto'),
    _risk_source: riskSource
  };
};

export {
    toIso,
    makeId,
    cloneValue,
    makeParamsHash,
    normalizeSource,
    normalizeRiskTier,
    validateParams,
    buildHumanSummary,
    buildToolchainSummary,
    publicToolDefinition,
    normalizeToolDefinition
};
