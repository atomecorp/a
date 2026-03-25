const TOOL_STATUS = {
  OK: 'OK',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  DENIED: 'DENIED',
  ERROR: 'ERROR'
};

const POLICY_DECISION = {
  ALLOW: 'ALLOW',
  REQUIRE_CONFIRM: 'REQUIRE_CONFIRM',
  DENY: 'DENY'
};

const RISK_TIERS = ['read', 'low', 'moderate', 'high', 'irreversible'];
const RISK_TIER_ORDER = Object.freeze({
  read: 0,
  low: 1,
  moderate: 2,
  high: 3,
  irreversible: 4
});

const LEGACY_RISK_LEVEL_MAP = Object.freeze({
  LOW: 'low',
  MEDIUM: 'moderate',
  HIGH: 'high',
  CRITICAL: 'irreversible'
});

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_TOOLCHAIN_LIMITS = Object.freeze({
  max_auto_steps: 5,
  max_mutating_steps: 3,
  max_mutating_domains: 3
});
const DEFAULT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {}
});

const toolRegistry = new Map();
const auditLog = [];
const proposals = new Map();
const idempotencyCache = new Map();

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
  const legacy = LEGACY_RISK_LEVEL_MAP[raw.toUpperCase()];
  if (legacy) return legacy;
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
  capabilities: [...tool.capabilities],
  risk_level: tool.risk_level,
  params_schema: cloneValue(tool.params_schema)
});

const normalizeToolDefinition = (tool) => {
  const name = String(tool?.name || '').trim();
  const domain = normalizeDomain(tool?.domain, name);
  const riskTier = normalizeRiskTier(tool?.risk_tier || tool?.risk_level || tool?.riskLevel);
  const riskSource = tool?.risk_tier ? 'spec' : (tool?.risk_level || tool?.riskLevel ? 'legacy' : 'default');
  const parameters = normalizeSchema(tool?.parameters || tool?.params_schema);
  const outputSchema = normalizeSchema(tool?.output_schema || tool?.outputSchema || DEFAULT_OUTPUT_SCHEMA);
  const riskLevel = String(
    tool?.risk_level
    || tool?.riskLevel
    || (riskTier === 'moderate'
      ? 'MEDIUM'
      : riskTier === 'high'
        ? 'HIGH'
        : riskTier === 'irreversible'
          ? 'CRITICAL'
          : 'LOW')
  ).trim().toUpperCase() || 'LOW';

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
    risk_level: riskLevel,
    params_schema: parameters,
    _risk_source: riskSource
  };
};

const shouldConfirmForTool = ({ tool, signals, confirmed }) => {
  if (confirmed === true) return false;
  if (!tool) return false;
  if (tool.confirmation_policy === 'always') return true;
  if (tool.confirmation_policy === 'never') return false;
  if (tool.risk_tier === 'high' || tool.risk_tier === 'irreversible') return true;
  if (tool._risk_source === 'spec' && tool.risk_tier === 'moderate') return true;
  const confidence = signals?.overall_confidence;
  if (typeof confidence === 'number' && confidence < DEFAULT_CONFIDENCE_THRESHOLD) {
    return true;
  }
  return false;
};

const defaultPolicyEngine = {
  evaluate({ tool, params, signals, actor, confirmed }) {
    let decision = POLICY_DECISION.ALLOW;
    const reasons = [];

    if (shouldConfirmForTool({ tool, signals, confirmed })) {
      decision = POLICY_DECISION.REQUIRE_CONFIRM;
      reasons.push(tool?.risk_tier === 'moderate' ? 'moderate_risk' : 'risk_tier');
    }

    if (typeof tool.policy === 'function') {
      const override = tool.policy({ params, signals, actor, decision, confirmed });
      if (override && override.decision) {
        decision = override.decision;
        if (override.reason) reasons.push(override.reason);
      }
    }

    return { decision, reasons };
  }
};

let policyEngine = defaultPolicyEngine;

const recordAudit = (entry) => {
  auditLog.push(entry);
  return entry;
};

const normalizeToolResult = (result) => {
  if (result && typeof result === 'object' && Object.values(TOOL_STATUS).includes(result.status)) {
    return result;
  }
  return {
    status: TOOL_STATUS.OK,
    result
  };
};

const buildExecutionIds = (request = {}) => ({
  trace_id: String(request?.trace_id || '').trim() || makeId('trace'),
  intent_id: String(request?.intent_id || '').trim() || makeId('intent'),
  source: normalizeSource(request?.source)
});

const runWithTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    reject(new Error('TOOL_TIMEOUT'));
  }, timeoutMs);

  promise
    .then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    })
    .catch((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
});

const executeTool = async ({
  tool,
  params,
  actor,
  signals,
  idempotency_key,
  dry_run,
  trace_id = null,
  intent_id = null,
  source = null
}) => {
  if (idempotency_key && idempotencyCache.has(idempotency_key)) {
    return idempotencyCache.get(idempotency_key);
  }

  const context = {
    tool_name: tool.name,
    actor,
    signals,
    idempotency_key,
    trace_id,
    intent_id,
    dry_run,
    source: normalizeSource(source)
  };

  if (tool.preconditions.length && typeof tool.precondition_check === 'function') {
    const precheck = await Promise.resolve(tool.precondition_check({ params, context, tool }));
    if (precheck?.ok === false) {
      const output = {
        status: TOOL_STATUS.ERROR,
        error: precheck.error || 'PRECONDITION_FAILED',
        human_summary: precheck.human_summary || buildHumanSummary(tool, params),
        trace_id,
        intent_id,
        precondition_failed: true,
        details: cloneValue(precheck.details || null)
      };
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
        domain: tool.domain,
        risk_tier: tool.risk_tier,
        actor,
        params_hash: makeParamsHash(params),
        status: output.status,
        error: output.error,
        trace_id,
        intent_id,
        source: context.source?.type || null,
        source_layer: context.source?.layer || null
      });
      return output;
    }
  }

  const handlerPromise = Promise.resolve(tool.handler({ params, context }));
  const handlerResult = await runWithTimeout(handlerPromise, tool.timeout_ms);
  const normalized = normalizeToolResult(handlerResult);
  const output = {
    ...normalized,
    human_summary: normalized.human_summary || buildHumanSummary(tool, params),
    machine_events: normalized.machine_events || [],
    trace_id,
    intent_id
  };

  if (tool.postconditions.length && typeof tool.postcondition_check === 'function' && output.status === TOOL_STATUS.OK) {
    const postcheck = await Promise.resolve(tool.postcondition_check({
      params,
      context,
      result: cloneValue(output.result),
      tool
    }));
    if (postcheck?.ok === false) {
      if (typeof tool.rollback === 'function') {
        try {
          await Promise.resolve(tool.rollback({
            params,
            context,
            result: cloneValue(output.result),
            tool,
            reason: postcheck.error || 'POSTCONDITION_FAILED'
          }));
        } catch (_) {
          // Keep original postcondition failure as primary error.
        }
      }
      output.status = TOOL_STATUS.ERROR;
      output.error = postcheck.error || 'POSTCONDITION_FAILED';
      output.postcondition_failed = true;
      output.details = cloneValue(postcheck.details || null);
    }
  }

  if (idempotency_key) {
    idempotencyCache.set(idempotency_key, output);
  }

  recordAudit({
    timestamp: toIso(),
    tool_name: tool.name,
    domain: tool.domain,
    risk_tier: tool.risk_tier,
    actor,
    params_hash: makeParamsHash(params),
    status: output.status,
    trace_id,
    intent_id,
    source: context.source?.type || null,
    source_layer: context.source?.layer || null
  });

  return output;
};

const createProposal = ({ tool, params, actor, signals, policy, trace_id, intent_id, source }) => {
  const proposal_id = makeId('proposal');
  const proposal = {
    proposal_id,
    created_at: toIso(),
    expires_at: null,
    requested_by: actor || null,
    tool_name: tool.name,
    domain: tool.domain,
    params: params || {},
    params_hash: makeParamsHash(params),
    summary_human: buildHumanSummary(tool, params),
    risk_report: policy?.reasons || [],
    required_confirmation: {
      method: 'user_confirm',
      level: tool.risk_tier || 'low'
    },
    status: 'NEEDS_CONFIRMATION',
    trace_id,
    intent_id,
    source: normalizeSource(source)
  };
  proposals.set(proposal_id, proposal);
  return proposal;
};

const normalizeToolchainStep = (step = {}) => {
  if (!step || typeof step !== 'object') return null;
  const toolName = String(step.tool_name || step.name || step.tool || '').trim();
  if (!toolName) return null;
  return {
    tool_name: toolName,
    params: step.params && typeof step.params === 'object' ? { ...step.params } : {}
  };
};

const compareRiskTiers = (left, right) => {
  const leftRank = RISK_TIER_ORDER[normalizeRiskTier(left)] ?? 0;
  const rightRank = RISK_TIER_ORDER[normalizeRiskTier(right)] ?? 0;
  if (leftRank === rightRank) return 0;
  return leftRank > rightRank ? 1 : -1;
};

const computeAggregateRisk = (steps = []) => {
  let highest = 'read';
  let moderateCount = 0;
  let mutatingDomainCount = 0;
  const mutatingDomains = new Set();

  steps.forEach((entry) => {
    const riskTier = normalizeRiskTier(entry?.tool?.risk_tier);
    if (compareRiskTiers(riskTier, highest) > 0) highest = riskTier;
    if (riskTier === 'moderate') moderateCount += 1;
    if (riskTier !== 'read') {
      const domain = String(entry?.tool?.domain || '').trim();
      if (domain) mutatingDomains.add(domain);
    }
  });

  mutatingDomainCount = mutatingDomains.size;

  if (highest === 'irreversible') return 'irreversible';
  if (moderateCount >= 3 || mutatingDomainCount >= 3) return 'high';
  return highest;
};

const validateToolchain = (steps = [], options = {}) => {
  const list = Array.isArray(steps) ? steps : [];
  const normalizedSteps = [];

  for (let index = 0; index < list.length; index += 1) {
    const step = normalizeToolchainStep(list[index]);
    if (!step) {
      return {
        ok: false,
        error: 'INVALID_TOOLCHAIN_STEP',
        invalid_step_index: index
      };
    }
    const tool = toolRegistry.get(step.tool_name);
    if (!tool) {
      return {
        ok: false,
        error: 'UNKNOWN_TOOL',
        invalid_step_index: index,
        tool_name: step.tool_name
      };
    }
    const validation = validateParams(tool.parameters, step.params);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        invalid_step_index: index,
        tool_name: step.tool_name
      };
    }
    normalizedSteps.push({
      tool,
      tool_name: tool.name,
      params: step.params
    });
  }

  const mutatingSteps = normalizedSteps.filter((entry) => entry.tool.risk_tier !== 'read');
  const mutatingDomains = new Set(mutatingSteps.map((entry) => entry.tool.domain).filter(Boolean));
  const aggregateRisk = computeAggregateRisk(normalizedSteps);
  const limits = {
    ...DEFAULT_TOOLCHAIN_LIMITS,
    ...(options.limits && typeof options.limits === 'object' ? options.limits : {})
  };
  const stepLevelConfirmation = normalizedSteps.some((entry) => shouldConfirmForTool({
    tool: entry.tool,
    signals: options.signals || {},
    confirmed: options.confirmed === true
  }));

  const requiresConfirmation = options.confirmed === true
    ? false
    : (
      stepLevelConfirmation
      ||
      normalizedSteps.length > limits.max_auto_steps
      || mutatingSteps.length > limits.max_mutating_steps
      || mutatingDomains.size > limits.max_mutating_domains
      || aggregateRisk === 'high'
      || aggregateRisk === 'irreversible'
    );

  return {
    ok: true,
    steps: normalizedSteps,
    aggregate_risk: aggregateRisk,
    requires_confirmation: requiresConfirmation,
    step_count: normalizedSteps.length,
    mutating_step_count: mutatingSteps.length,
    mutating_domains: Array.from(mutatingDomains),
    summary_human: buildToolchainSummary(normalizedSteps)
  };
};

const AgentGateway = {
  registerTool(tool) {
    if (!tool || typeof tool.name !== 'string' || typeof tool.handler !== 'function') {
      throw new Error('Invalid tool definition');
    }
    const normalized = normalizeToolDefinition(tool);
    toolRegistry.set(normalized.name, normalized);
    return publicToolDefinition(normalized);
  },

  unregisterTool(name) {
    toolRegistry.delete(name);
  },

  getTool(name) {
    const tool = toolRegistry.get(String(name || '').trim());
    return tool ? publicToolDefinition(tool) : null;
  },

  listTools() {
    return Array.from(toolRegistry.values()).map((tool) => publicToolDefinition(tool));
  },

  validateToolchain(steps = [], options = {}) {
    return validateToolchain(steps, options);
  },

  async callTool(request = {}) {
    const toolName = request.tool_name || request.name || request.tool;
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return { status: TOOL_STATUS.ERROR, error: 'UNKNOWN_TOOL' };
    }

    const params = request.params || {};
    const actor = request.actor || {};
    const signals = request.signals || {};
    const idempotency_key = request.idempotency_key || null;
    const dry_run = request.dry_run === true;
    const executionIds = buildExecutionIds(request);
    const confirmed = request.confirmed === true;

    const validation = validateParams(tool.parameters, params);
    if (!validation.ok) {
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
        domain: tool.domain,
        risk_tier: tool.risk_tier,
        actor,
        params_hash: makeParamsHash(params),
        status: TOOL_STATUS.ERROR,
        error: validation.error,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source.type || null,
        source_layer: executionIds.source.layer || null
      });
      return { status: TOOL_STATUS.ERROR, error: validation.error, ...executionIds };
    }

    const policy = policyEngine.evaluate({ tool, params, signals, actor, confirmed });
    if (policy.decision === POLICY_DECISION.DENY) {
      const denied = {
        status: TOOL_STATUS.DENIED,
        human_summary: buildHumanSummary(tool, params),
        reason: policy.reasons,
        ...executionIds
      };
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
        domain: tool.domain,
        risk_tier: tool.risk_tier,
        actor,
        params_hash: makeParamsHash(params),
        status: denied.status,
        decision: policy.decision,
        reason: policy.reasons,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source.type || null,
        source_layer: executionIds.source.layer || null
      });
      return denied;
    }

    if (policy.decision === POLICY_DECISION.REQUIRE_CONFIRM) {
      const proposal = createProposal({
        tool,
        params,
        actor,
        signals,
        policy,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source
      });
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
        domain: tool.domain,
        risk_tier: tool.risk_tier,
        actor,
        params_hash: proposal.params_hash,
        status: TOOL_STATUS.CONFIRMATION_REQUIRED,
        decision: policy.decision,
        proposal_id: proposal.proposal_id,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source.type || null,
        source_layer: executionIds.source.layer || null
      });
      return {
        status: TOOL_STATUS.CONFIRMATION_REQUIRED,
        proposal_id: proposal.proposal_id,
        human_summary: proposal.summary_human,
        ...executionIds
      };
    }

    try {
      return await executeTool({
        tool,
        params,
        actor,
        signals,
        idempotency_key,
        dry_run,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source
      });
    } catch (error) {
      const message = error && error.message ? error.message : 'TOOL_ERROR';
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
        domain: tool.domain,
        risk_tier: tool.risk_tier,
        actor,
        params_hash: makeParamsHash(params),
        status: TOOL_STATUS.ERROR,
        error: message,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source.type || null,
        source_layer: executionIds.source.layer || null
      });
      return { status: TOOL_STATUS.ERROR, error: message, ...executionIds };
    }
  },

  async executeToolchain(request = {}) {
    const executionIds = buildExecutionIds(request);
    const actor = request.actor || {};
    const signals = request.signals || {};
    const steps = request.steps || request.toolchain || [];
    const validated = validateToolchain(steps, {
      confirmed: request.confirmed === true,
      limits: request.limits,
      signals
    });

    if (!validated.ok) {
      return {
        status: TOOL_STATUS.ERROR,
        error: validated.error,
        invalid_step_index: validated.invalid_step_index ?? null,
        tool_name: validated.tool_name || null,
        ...executionIds
      };
    }

    if (validated.requires_confirmation && request.confirmed !== true) {
      return {
        status: TOOL_STATUS.CONFIRMATION_REQUIRED,
        human_summary: validated.summary_human,
        aggregate_risk: validated.aggregate_risk,
        step_count: validated.step_count,
        mutating_step_count: validated.mutating_step_count,
        mutating_domains: cloneValue(validated.mutating_domains),
        ...executionIds
      };
    }

    const results = [];
    for (const step of validated.steps) {
      const result = await this.callTool({
        tool_name: step.tool_name,
        params: step.params,
        actor,
        signals,
        idempotency_key: request.idempotency_key
          ? `${request.idempotency_key}:${step.tool_name}:${makeParamsHash(step.params)}`
          : null,
        dry_run: request.dry_run === true,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source,
        confirmed: request.confirmed === true
      });
      results.push({
        tool_name: step.tool_name,
        status: result?.status || TOOL_STATUS.ERROR,
        result: cloneValue(result)
      });
      if (result?.status !== TOOL_STATUS.OK) {
        return {
          status: result?.status || TOOL_STATUS.ERROR,
          error: result?.error || result?.status || 'TOOLCHAIN_STEP_FAILED',
          aggregate_risk: validated.aggregate_risk,
          completed_steps: results.length - 1,
          result: { results },
          ...executionIds
        };
      }
    }

    return {
      status: TOOL_STATUS.OK,
      human_summary: validated.summary_human,
      aggregate_risk: validated.aggregate_risk,
      result: {
        results
      },
      ...executionIds
    };
  },

  setPolicyEngine(engine) {
    if (!engine || typeof engine.evaluate !== 'function') {
      throw new Error('Policy engine must provide evaluate()');
    }
    policyEngine = engine;
  },

  proposal: {
    create({ tool_name, params, actor, signals, source, trace_id, intent_id }) {
      const tool = toolRegistry.get(tool_name);
      if (!tool) return null;
      const policy = { reasons: ['manual'] };
      const proposal = createProposal({
        tool,
        params,
        actor,
        signals,
        policy,
        trace_id: String(trace_id || '').trim() || makeId('trace'),
        intent_id: String(intent_id || '').trim() || makeId('intent'),
        source: normalizeSource(source)
      });
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
        domain: tool.domain,
        risk_tier: tool.risk_tier,
        actor,
        params_hash: proposal.params_hash,
        status: TOOL_STATUS.CONFIRMATION_REQUIRED,
        proposal_id: proposal.proposal_id,
        trace_id: proposal.trace_id,
        intent_id: proposal.intent_id,
        source: proposal.source?.type || null,
        source_layer: proposal.source?.layer || null
      });
      return proposal;
    },
    get(proposal_id) {
      return proposals.get(proposal_id) || null;
    },
    approve(proposal_id, confirmation_token) {
      const proposal = proposals.get(proposal_id);
      if (!proposal) return null;
      proposal.status = 'APPROVED';
      proposal.confirmation_token = confirmation_token || null;
      proposal.approved_at = toIso();
      recordAudit({
        timestamp: toIso(),
        tool_name: proposal.tool_name,
        domain: proposal.domain || null,
        actor: proposal.requested_by,
        params_hash: proposal.params_hash,
        status: 'APPROVED',
        proposal_id: proposal.proposal_id,
        trace_id: proposal.trace_id,
        intent_id: proposal.intent_id,
        source: proposal.source?.type || null,
        source_layer: proposal.source?.layer || null
      });
      return proposal;
    },
    reject(proposal_id) {
      const proposal = proposals.get(proposal_id);
      if (!proposal) return null;
      proposal.status = 'REJECTED';
      proposal.rejected_at = toIso();
      recordAudit({
        timestamp: toIso(),
        tool_name: proposal.tool_name,
        domain: proposal.domain || null,
        actor: proposal.requested_by,
        params_hash: proposal.params_hash,
        status: 'REJECTED',
        proposal_id: proposal.proposal_id,
        trace_id: proposal.trace_id,
        intent_id: proposal.intent_id,
        source: proposal.source?.type || null,
        source_layer: proposal.source?.layer || null
      });
      return proposal;
    },
    async execute(proposal_id) {
      const proposal = proposals.get(proposal_id);
      if (!proposal) {
        return { status: TOOL_STATUS.ERROR, error: 'PROPOSAL_NOT_FOUND' };
      }
      if (proposal.status !== 'APPROVED') {
        return { status: TOOL_STATUS.ERROR, error: 'PROPOSAL_NOT_APPROVED' };
      }
      const tool = toolRegistry.get(proposal.tool_name);
      if (!tool) {
        return { status: TOOL_STATUS.ERROR, error: 'UNKNOWN_TOOL' };
      }
      const result = await executeTool({
        tool,
        params: proposal.params,
        actor: proposal.requested_by,
        signals: {},
        idempotency_key: proposal.params_hash,
        dry_run: false,
        trace_id: proposal.trace_id,
        intent_id: proposal.intent_id,
        source: proposal.source
      });
      proposal.status = result.status === TOOL_STATUS.OK ? 'EXECUTED' : 'FAILED';
      proposal.executed_at = toIso();
      return result;
    }
  },

  audit: {
    list({ limit = 20, trace_id = null, status = null, source = null } = {}) {
      const normalizedTrace = String(trace_id || '').trim();
      const normalizedStatus = String(status || '').trim();
      const normalizedSource = String(source || '').trim();
      return auditLog
        .filter((entry) => (normalizedTrace ? String(entry?.trace_id || '').trim() === normalizedTrace : true))
        .filter((entry) => (normalizedStatus ? String(entry?.status || '').trim() === normalizedStatus : true))
        .filter((entry) => (normalizedSource ? String(entry?.source || '').trim() === normalizedSource : true))
        .slice(-limit);
    }
  }
};

AgentGateway.registerTool({
  name: 'audit.get_recent_actions',
  domain: 'audit',
  description: 'Return the most recent audit log entries',
  capabilities: ['audit.read'],
  risk_tier: 'read',
  latency_class: 'instant',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number' }
    }
  },
  output_schema: {
    type: 'object',
    properties: {
      items: { type: 'array' }
    }
  },
  side_effects: [],
  idempotent: true,
  undoable: false,
  handler: async ({ params }) => {
    const limit = Number.isFinite(params?.limit) ? params.limit : 20;
    return {
      status: TOOL_STATUS.OK,
      result: auditLog.slice(-limit)
    };
  },
  summary: () => 'Read recent audit actions'
});

if (typeof globalThis !== 'undefined') {
  globalThis.AtomeAI = AgentGateway;
}

export { AgentGateway, TOOL_STATUS, POLICY_DECISION, RISK_TIERS };
export default AgentGateway;
