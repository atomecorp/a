// Registry projection of the command owners: the contract families (`MCP_CONTRACT_FAMILIES`), the MCP direct
// methods (`atomeMCPHandlers` + their access policy), the runtime tool definitions (ToolRegistryV2 bootstrap defs)
// and the assistant's gateway tools (AgentGateway). Each function imports the real owner and returns
// `{ owner, entries, relations, findings }`; nothing here is copied by hand.
import { ROOT, entryId } from './registry_paths.mjs';

const at = (path) => import(`${ROOT}/${path}`);
const MCP_FAMILIES_FILE = 'atome/src/squirrel/atome/mcp_contract_families.js';
const SERVICE_DEFS_FILE = 'eVe/intuition/tools/core/tool_runtime_service_command_defs.js';

export async function projectContracts() {
    const { MCP_CONTRACT_FAMILIES, MCP_CONFIRMED_CONTRACT_COMMANDS } = await at(MCP_FAMILIES_FILE);
    const { isPersistentContractCommand } = await at(SERVICE_DEFS_FILE);
    const confirmed = new Set(MCP_CONFIRMED_CONTRACT_COMMANDS);
    const entries = MCP_CONTRACT_FAMILIES.flatMap(family => family.commands.map(command => ({
        id: entryId('action_contract', command.name), kind: 'action_contract', native_id: command.name, origin: 'projected',
        owner: MCP_FAMILIES_FILE, surface: 'contract_family', family: family.id, layer: family.layer || null,
        capability: command.capability, effect: isPersistentContractCommand(command) ? 'persistent' : 'ephemeral',
        confirmed: confirmed.has(command.name), description: command.description || null
    })));
    return { owner: MCP_FAMILIES_FILE, entries, relations: [], findings: [] };
}

export async function projectMcpMethods(contractIds) {
    const owner = 'atome/src/squirrel/atome/mcp_handlers.js';
    const { atomeMCPHandlers } = await at(owner);
    const { isMcpInfrastructureMethod } = await at('atome/src/squirrel/atome/mcp_core.js');
    const { resolveAccessPolicy } = await at('atome/src/squirrel/atome/mcp_security_policy.js');
    const { PERSONAL_IMPORT_TOOLS } = await at('atome/src/shared/personal_import_tools.js');
    const entries = [];
    for (const name of Object.keys(atomeMCPHandlers)) {
        if (contractIds.has(entryId('action_contract', name))) continue;
        const policy = resolveAccessPolicy(name, {});
        entries.push({ id: entryId('action_contract', name), kind: 'action_contract', native_id: name, origin: 'projected', owner,
            surface: 'mcp_method', infrastructure: isMcpInfrastructureMethod(name), family: name.split('.').slice(0, -1).join('.') || name, capability: policy.required_capabilities?.[0] || null,
            access: policy.access, effect: null, confirmed: policy.confirmation_required === true,
            description: PERSONAL_IMPORT_TOOLS.find(tool => tool.name === name)?.description || null });
    }
    return { owner, entries, relations: [], findings: [] };
}

const BOOTSTRAP_FILES = ['eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js', 'eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js'];

// The bootstrap builders need a label-key rule and the execution-mode names; the label key belongs to
// tool_runtime.js#buildLabelKey, which runs the whole runtime bootstrap at import (not loadable in Node), so the
// registry does not project tool label keys (inventory hole) and passes a rule that leaves them out.
export async function projectBootstrapTools() {
    const { createBootstrapDefinitionBuilders } = await at('eVe/intuition/tools/core/tool_runtime_bootstrap_definition.js');
    const { buildBootstrapDefsA } = await at(BOOTSTRAP_FILES[0]);
    const { buildBootstrapDefsB } = await at(BOOTSTRAP_FILES[1]);
    const { toolGesture } = await at('eVe/intuition/shared/tool_gesture.js');
    const mode = 'v2_registered_handler';
    const builders = createBootstrapDefinitionBuilders({ buildLabelKey: () => null, V2_REGISTERED_HANDLER_EXECUTION_MODE: mode });
    const defs = [
        ...buildBootstrapDefsA(builders.buildDefaultToolDef, builders.buildRegisteredToggleToolDef, 'v2_calendar_api', mode).map(def => [def, BOOTSTRAP_FILES[0]]),
        ...buildBootstrapDefsB(builders.buildDefaultToolDef, builders.buildRegisteredToggleToolDef, 'v2_calendar_api', mode).map(def => [def, BOOTSTRAP_FILES[1]])
    ];
    const entries = [], findings = [], seen = new Map();
    for (const [def, file] of defs) {
        const id = entryId('tool_definition', def.id);
        if (seen.has(id)) { findings.push({ type: 'duplicate_bootstrap_definition', id, owners: [seen.get(id), file] }); continue; }
        seen.set(id, file);
        const gesture = toolGesture({ key: def.tool_key, definition: def });
        entries.push({ id, kind: 'tool_definition', native_id: def.id, origin: 'projected', owner: file, registry: 'bootstrap_v2',
            tool_key: def.tool_key, visibility: def.visibility, button_type: def.behavior?.button_type || null,
            execution_mode: def.runtime?.execution_mode || null, selection_required: def.capabilities?.selection_required === true,
            label: def.ui?.label_fallback || null, description: def.meta?.description || null,
            ...(gesture.classified ? { family: gesture.family, family_basis: 'tool_gesture' } : {}) });
    }
    return { owner: BOOTSTRAP_FILES.join(' + '), entries, relations: [], findings };
}

// A tool definition built from a contract command runs that contract.
export const contractToolRelations = (toolIds, contractEntries) => contractEntries
    .filter(entry => toolIds.has(entryId('tool_definition', entry.native_id)))
    .map(entry => ({ from: entryId('tool_definition', entry.native_id), type: 'executes', to: entry.id }));

export async function projectAgentTools(toolIds) {
    const owner = 'atome/src/squirrel/ai/default_tools.js';
    const gateway = await at('atome/src/squirrel/ai/agent_gateway.js');
    await at(owner);
    const AgentGateway = gateway.AgentGateway;
    const entries = [], relations = [];
    for (const tool of AgentGateway.listTools()) {
        const id = entryId('tool_definition', `ai_tool:${tool.name}`);
        entries.push({ id, kind: 'tool_definition', native_id: `ai_tool:${tool.name}`, origin: 'projected', owner, registry: 'agent_gateway',
            visibility: 'hidden', domain: tool.domain || null, risk_tier: tool.risk_tier || null, description: tool.description || null,
            capabilities: [...(tool.capabilities || [])].sort() });
        const same = entryId('tool_definition', tool.name);
        if (toolIds.has(same)) relations.push({ from: id, type: 'refers_to', to: same });
    }
    return { owner, entries, relations, findings: [] };
}

// Runtime UI actions whose ids are computed (`ui.timeline.${verb}`) cannot be declared by name: the owner module is
// imported and the tools it registers are read from the runtime tool registry (registration persists nothing in Node:
// tool_persistence.js defers it until a login). The assistant's twins (timeline_tool_ids.js) run these tools.
const TIMELINE_ACTIONS_FILE = 'eVe/intuition/tools/timeline_actions.js';
export async function projectRuntimeUiActions() {
    const { TOOL_REGISTRY } = await at('eVe/intuition/runtime/tool_state.js');
    const before = new Set(TOOL_REGISTRY.keys());
    await at(TIMELINE_ACTIONS_FILE);
    const added = [...TOOL_REGISTRY.values()].filter(tool => !before.has(tool.tool_id));
    if (!added.length) throw new Error(`registry_runtime_owner_registered_nothing:${TIMELINE_ACTIONS_FILE}`);
    const entries = added.map(tool => ({ id: entryId('tool_definition', tool.tool_id), kind: 'tool_definition', native_id: tool.tool_id,
        origin: 'projected', owner: TIMELINE_ACTIONS_FILE, registry: 'runtime_ui_action', visibility: tool.finder_visible ? 'visible' : 'hidden',
        label: tool.tool_name, capabilities: [...tool.capabilities].sort(), risk_level: tool.risk_level }));
    const { TIMELINE_AI_RUNTIME_TOOL_IDS } = await at('atome/src/squirrel/ai/timeline_tool_ids.js');
    const relations = Object.entries(TIMELINE_AI_RUNTIME_TOOL_IDS)
        .map(([aiName, toolId]) => ({ from: entryId('tool_definition', `ai_tool:${aiName}`), type: 'executes', to: entryId('tool_definition', toolId) }));
    return { owner: TIMELINE_ACTIONS_FILE, entries, relations, findings: [] };
}

// One runtime tool per activity of the person (activities_runtime.js#registerActivityTool, ids from
// activities_model.js#activityToolId): data, not definitions; the registry declares their family once, by its prefix.
const ACTIVITY_RUNTIME_FILE = 'eVe/intuition/tools/activities_runtime.js';
export async function projectActivityTools() {
    const { ACTIVITY_TOOL_ID_PREFIX } = await at('eVe/intuition/tools/activities_model.js');
    const { ACTIVITY_TOOL_CAPABILITIES } = await at(ACTIVITY_RUNTIME_FILE);
    const native = `${ACTIVITY_TOOL_ID_PREFIX}\${activity_id}`;
    return { owner: ACTIVITY_RUNTIME_FILE, relations: [], findings: [], entries: [{ id: entryId('tool_definition', native), kind: 'tool_definition',
        native_id: native, origin: 'projected', owner: ACTIVITY_RUNTIME_FILE, registry: 'runtime_atome_tool', visibility: 'hidden',
        instance_prefix: ACTIVITY_TOOL_ID_PREFIX, capabilities: [...ACTIVITY_TOOL_CAPABILITIES].sort() }] };
}

// What a call of each runtime tool requires through the MCP door (mcp_security_policy.js, `runtime.tools.call`): its
// first capability and whether it waits for the person. The registry's risk tier of the tool is annotated from it
// (registry_annotate.mjs#annotateTool); the facts are hashed so a policy change makes the registry stale.
const POLICY_FILE = 'atome/src/squirrel/atome/mcp_security_policy.js';
export async function projectToolAccess(nativeIds) {
    const { resolveAccessPolicy } = await at(POLICY_FILE);
    const access = Object.fromEntries([...nativeIds].sort().map((toolId) => {
        const policy = resolveAccessPolicy('runtime.tools.call', { tool_id: toolId });
        if (policy.allowed !== true) throw new Error(`registry_tool_policy_denied:${toolId}:${policy.error}`);
        return [toolId, { capability: policy.required_capabilities[0], confirmed: policy.confirmation_required === true }];
    }));
    return { owner: POLICY_FILE, entries: [], relations: [], findings: [], access };
}
