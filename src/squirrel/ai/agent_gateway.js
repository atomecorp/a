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

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_TIMEOUT_MS = 8000;

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

const stableStringify = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
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

const normalizeToolDefinition = (tool) => ({
  name: tool.name,
  description: tool.description || '',
  capabilities: Array.isArray(tool.capabilities) ? tool.capabilities : [],
  risk_level: tool.risk_level || 'LOW',
  params_schema: tool.params_schema || null,
  timeout_ms: Number.isFinite(tool.timeout_ms) ? tool.timeout_ms : DEFAULT_TIMEOUT_MS,
  handler: tool.handler,
  summary: tool.summary || null,
  policy: tool.policy || null
});

const defaultPolicyEngine = {
  evaluate({ tool, params, signals, actor }) {
    let decision = POLICY_DECISION.ALLOW;
    const reasons = [];

    if (tool.risk_level === 'HIGH' || tool.risk_level === 'CRITICAL') {
      decision = POLICY_DECISION.REQUIRE_CONFIRM;
      reasons.push('risk_level');
    }

    const confidence = signals?.overall_confidence;
    if (typeof confidence === 'number' && confidence < DEFAULT_CONFIDENCE_THRESHOLD) {
      decision = POLICY_DECISION.REQUIRE_CONFIRM;
      reasons.push('low_confidence');
    }

    if (typeof tool.policy === 'function') {
      const override = tool.policy({ params, signals, actor, decision });
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

  if (idempotency_key) {
    idempotencyCache.set(idempotency_key, output);
  }

  recordAudit({
    timestamp: toIso(),
    tool_name: tool.name,
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
    params: params || {},
    params_hash: makeParamsHash(params),
    summary_human: buildHumanSummary(tool, params),
    risk_report: policy?.reasons || [],
    required_confirmation: {
      method: 'user_confirm',
      level: tool.risk_level || 'LOW'
    },
    status: 'NEEDS_CONFIRMATION',
    trace_id,
    intent_id,
    source: normalizeSource(source)
  };
  proposals.set(proposal_id, proposal);
  return proposal;
};

const AgentGateway = {
  registerTool(tool) {
    if (!tool || typeof tool.name !== 'string' || typeof tool.handler !== 'function') {
      throw new Error('Invalid tool definition');
    }
    const normalized = normalizeToolDefinition(tool);
    toolRegistry.set(normalized.name, normalized);
    return normalized;
  },

  unregisterTool(name) {
    toolRegistry.delete(name);
  },

  listTools() {
    return Array.from(toolRegistry.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      capabilities: tool.capabilities,
      risk_level: tool.risk_level,
      params_schema: tool.params_schema
    }));
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

    const validation = validateParams(tool.params_schema, params);
    if (!validation.ok) {
      recordAudit({
        timestamp: toIso(),
        tool_name: tool.name,
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

    const policy = policyEngine.evaluate({ tool, params, signals, actor });
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
  description: 'Return the most recent audit log entries',
  capabilities: ['audit.read'],
  risk_level: 'LOW',
  params_schema: {
    properties: {
      limit: { type: 'number' }
    }
  },
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

export { AgentGateway, TOOL_STATUS, POLICY_DECISION };
export default AgentGateway;
