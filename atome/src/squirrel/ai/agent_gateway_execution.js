import {
    TOOL_STATUS,
    POLICY_DECISION,
    RISK_TIER_ORDER,
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_TOOLCHAIN_LIMITS,
    toolRegistry,
    auditLog,
    proposals,
    idempotencyCache
} from './agent_gateway_state.js';
import {
    toIso,
    makeId,
    cloneValue,
    makeParamsHash,
    normalizeSource,
    normalizeRiskTier,
    validateParams,
    buildHumanSummary,
    buildToolchainSummary
} from './agent_gateway_normalize.js';

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
  const confirmedByRecord = !!options.confirmation?.confirmation_id;
  const stepLevelConfirmation = normalizedSteps.some((entry) => shouldConfirmForTool({
    tool: entry.tool,
    signals: options.signals || {},
    confirmed: confirmedByRecord
  }));

  const requiresConfirmation = confirmedByRecord
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

const normalizeExecutionConfirmation = (request = {}) => {
  const confirmation = request.confirmation && typeof request.confirmation === 'object'
    ? request.confirmation
    : {};
  const confirmation_id = String(confirmation.confirmation_id || confirmation.confirmationId || '').trim();
  const actor_id = String(confirmation.actor_id || confirmation.actorId || request.actor?.user_id || '').trim();
  const idempotency_key = String(
    request.idempotency_key
    || request.idempotencyKey
    || confirmation.idempotency_key
    || confirmation.idempotencyKey
    || ''
  ).trim();
  if (!confirmation_id || !actor_id || !idempotency_key) return null;
  return { confirmation_id, actor_id, idempotency_key };
};

export {
    defaultPolicyEngine,
    recordAudit,
    buildExecutionIds,
    executeTool,
    createProposal,
    validateToolchain,
    normalizeExecutionConfirmation
};
