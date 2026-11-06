// The registry-owned facts laid on projected entries (annotations.json): risk tier and offline class of every
// command, risk tier of every tool, rule-20 family of every visible tool. A command or a family the annotations do not cover is an error:
// the registry never guesses a value.
import { EXPOSURE_SURFACES } from './registry_project_exposure.mjs';

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

// A tool's exposure (cahier V1.2 §5.3), from the facts of registry_project_exposure.mjs, the way the MCP door treats its
// name (mcp_discovery.js#listUnifiedMcpTools lists, mcp_protocol.js#toolRequest routes: a method of the entry first, then
// a runtime tool, then an assistant's tool):
// - UI_only: held by no registry discovery reads (the runtime's `runtime.listTools`, the assistant's `listTools`);
// - needs_adapter: a runtime tool whose registering module neither the boot nor the MCP loader imports;
// - runtime_only: an assistant's tool whose name the door routes to a method or a runtime tool: never listed as itself;
// - blocked_by_policy: reached, but the access policy closes it on `exposure_blocked_on` (ai, person, program);
// - MCP_exposed: reached and open on every surface.
// A method of the entry is reached by its name; an infrastructure method (`infrastructure`, mcp_core.js) is the door's own
// machinery, judged by what it carries, never a tool: it has no exposure. A fact the projection lacks for an entry is an
// error: the registry never guesses an exposure.
const DISCOVERED_REGISTRIES = Object.freeze({ bootstrap_v2: 'runtime', runtime_ui_action: 'runtime', runtime_atome_tool: 'runtime', agent_gateway: 'ai' });
const REACHED_LOADS = ['boot', 'mcp_loader'];

const doorOf = (entry, { loads }, doors) => {
    if (entry.kind === 'action_contract') return { door: `method:${entry.native_id}` };
    const source = DISCOVERED_REGISTRIES[entry.registry];
    if (!source) return { exposure: 'UI_only' };
    if (source === 'ai') {
        const name = entry.native_id.slice('ai_tool:'.length);
        const routed = doors.methods.has(name) || doors.runtime.has(name);
        return routed ? { exposure: 'runtime_only' } : { door: `ai:${name}` };
    }
    const load = loads[entry.owner];
    if (!load) throw new Error(`registry_tool_load_unprojected:${entry.id}:${entry.owner}`);
    if (!REACHED_LOADS.includes(load)) return { exposure: 'needs_adapter' };
    return { door: doors.methods.has(entry.native_id) ? `method:${entry.native_id}` : `runtime:${entry.native_id}` };
};

export function annotateExposure(entry, facts, doors) {
    if (entry.infrastructure) return entry;
    const { exposure, door } = doorOf(entry, facts, doors);
    if (exposure) return { ...entry, exposure };
    const open = facts.surfaces[door];
    if (!open) throw new Error(`registry_exposure_surfaces_unprojected:${entry.id}:${door}`);
    const blocked = EXPOSURE_SURFACES.filter(surface => !open.includes(surface));
    return blocked.length ? { ...entry, exposure: 'blocked_by_policy', exposure_blocked_on: blocked } : { ...entry, exposure: 'MCP_exposed' };
}
