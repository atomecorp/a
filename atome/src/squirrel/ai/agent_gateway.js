import {
    TOOL_STATUS,
    POLICY_DECISION,
    RISK_TIERS,
    toolRegistry,
    auditLog,
    proposals
} from './agent_gateway_state.js';
import {
    toIso,
    makeId,
    cloneValue,
    makeParamsHash,
    normalizeSource,
    validateParams,
    buildHumanSummary,
    publicToolDefinition,
    normalizeToolDefinition
} from './agent_gateway_normalize.js';
import {
    defaultPolicyEngine,
    recordAudit,
    buildExecutionIds,
    executeTool,
    createProposal,
    validateToolchain,
    normalizeExecutionConfirmation
} from './agent_gateway_execution.js';

let policyEngine = defaultPolicyEngine;

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
    const confirmation = normalizeExecutionConfirmation(request);
    const confirmed = !!confirmation;

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
        source_layer: executionIds.source.layer || null,
        confirmation_id: confirmation?.confirmation_id || null
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
        source_layer: executionIds.source.layer || null,
        confirmation_id: confirmation?.confirmation_id || null
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
        source_layer: executionIds.source.layer || null,
        confirmation_id: confirmation?.confirmation_id || null
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
        idempotency_key: confirmation?.idempotency_key || idempotency_key,
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
        source_layer: executionIds.source.layer || null,
        confirmation_id: confirmation?.confirmation_id || null
      });
      return { status: TOOL_STATUS.ERROR, error: message, ...executionIds };
    }
  },

  async executeToolchain(request = {}) {
    const executionIds = buildExecutionIds(request);
    const actor = request.actor || {};
    const signals = request.signals || {};
    const steps = request.steps || request.toolchain || [];
    const confirmation = normalizeExecutionConfirmation(request);
    const validated = validateToolchain(steps, {
      confirmation,
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

    if (validated.requires_confirmation && !confirmation) {
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
        idempotency_key: confirmation?.idempotency_key || request.idempotency_key
          ? `${confirmation?.idempotency_key || request.idempotency_key}:${step.tool_name}:${makeParamsHash(step.params)}`
          : null,
        dry_run: request.dry_run === true,
        trace_id: executionIds.trace_id,
        intent_id: executionIds.intent_id,
        source: executionIds.source,
        confirmation
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
