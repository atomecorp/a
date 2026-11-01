// The registry-owned facts laid on projected entries (annotations.json): risk tier and offline class of every
// command, risk tier of every tool, rule-20 family of every visible tool. A command or a family the annotations do not cover is an error:
// the registry never guesses a value.
const TIERS = ['read', 'low', 'moderate', 'high', 'irreversible'];
const atLeast = (tier, minimum) => (TIERS.indexOf(tier) >= TIERS.indexOf(minimum) ? tier : minimum);

export function annotateContract(entry, annotations) {
    const { contract_risk: risk, contract_offline: offline } = annotations;
    const verb = String(entry.capability || '').split('.').pop();
    const base = risk.overrides[entry.native_id] || risk.by_capability_verb[verb];
    if (!base) throw new Error(`registry_contract_risk_unannotated:${entry.native_id}:${verb}`);
    const offlineClass = offline.overrides[entry.native_id] || offline.by_family[entry.family];
    if (!offlineClass) throw new Error(`registry_contract_offline_unannotated:${entry.native_id}`);
    return { ...entry, risk_tier: entry.confirmed ? atLeast(base, risk.confirmed_minimum) : base, offline: offlineClass };
}

export function annotateMcpMethod(entry, annotations) {
    const methods = annotations.mcp_method_annotations;
    const family = methods.by_family[entry.family];
    if (!family) throw new Error(`registry_mcp_method_unannotated:${entry.native_id}`);
    const override = methods.overrides[entry.native_id] || {};
    const reads = methods.read_verbs.includes(entry.native_id.split('.').pop());
    const base = override.risk_tier || (reads ? 'read' : family.risk_tier);
    return { ...entry, risk_tier: entry.confirmed ? atLeast(base, annotations.contract_risk.confirmed_minimum) : base,
        offline: override.offline || family.offline };
}

// A tool's risk tier (what MCP discovery shows): the assistant's tools keep their gateway tier; a runtime tool takes the
// tier of what its call requires (`access`, projected from the MCP access policy), by the commands' own rule.
const toolRiskTier = (entry, annotations, access) => {
    if (entry.registry === 'agent_gateway') {
        if (!TIERS.includes(entry.risk_tier)) throw new Error(`registry_tool_risk_unannotated:${entry.native_id}:${entry.risk_tier}`);
        return entry.risk_tier;
    }
    if (!access) throw new Error(`registry_tool_access_missing:${entry.native_id}`);
    const risk = annotations.contract_risk;
    const verb = access.capability.split('.').pop();
    const base = risk.overrides[entry.native_id] || risk.by_capability_verb[verb];
    if (!base) throw new Error(`registry_tool_risk_unannotated:${entry.native_id}:${verb}`);
    return access.confirmed ? atLeast(base, risk.confirmed_minimum) : base;
};

export function annotateTool(entry, annotations, access) {
    const tiered = { ...entry, risk_tier: toolRiskTier(entry, annotations, access) };
    if (tiered.visibility !== 'visible' || tiered.family) return tiered;
    const family = annotations.tool_families[tiered.native_id];
    if (!family) throw new Error(`registry_tool_family_unannotated:${tiered.native_id}`);
    return { ...tiered, family, family_basis: 'registry_annotation' };
}
