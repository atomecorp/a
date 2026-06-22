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

export {
    TOOL_STATUS,
    POLICY_DECISION,
    RISK_TIERS,
    RISK_TIER_ORDER,
    DEFAULT_CONFIDENCE_THRESHOLD,
    DEFAULT_TIMEOUT_MS,
    DEFAULT_TOOLCHAIN_LIMITS,
    DEFAULT_OUTPUT_SCHEMA,
    toolRegistry,
    auditLog,
    proposals,
    idempotencyCache
};
