// Assembles the registry map: runs every owner projection, merges the owned sources (eVe/registry/source/*.json)
// and records the hash of each projected input. One id has one owner: a second claim is a `duplicate_owner`.
import { entryId, hashOf, byId, relationKey, readSources } from './registry_paths.mjs';
import { projectContracts, projectMcpMethods, projectBootstrapTools, projectAgentTools, projectRuntimeUiActions, projectActivityTools, projectToolAccess,
    contractToolRelations } from './registry_project_commands.mjs';
import { projectPanels, projectMenus } from './registry_project_ui.mjs';
import { projectTypes, projectHealth, projectActivities, projectMonitorsAndCategories } from './registry_project_domain.mjs';
import { projectToolExposure } from './registry_project_exposure.mjs';
import { annotateContract, annotateMcpMethod, annotateTool, annotateExposure } from './registry_annotate.mjs';

export async function runProjections(sources) {
    const contracts = await projectContracts();
    const contractIds = new Set(contracts.entries.map(entry => entry.id));
    const tools = await projectBootstrapTools();
    const toolIds = new Set(tools.entries.map(entry => entry.id));
    const projections = {
        contracts, mcp_methods: await projectMcpMethods(contractIds), bootstrap_tools: tools, agent_tools: await projectAgentTools(toolIds), runtime_ui_actions: await projectRuntimeUiActions(),
        panels: await projectPanels(), menus: await projectMenus(), types: await projectTypes(),
        health: await projectHealth(contractIds), activities: await projectActivities(),
        monitors_categories: await projectMonitorsAndCategories(), activity_tools: await projectActivityTools()
    };
    projections.bootstrap_tools.relations.push(...contractToolRelations(toolIds, contracts.entries));
    // Every runtime tool the MCP door can call (the assistant's own tools carry their gateway tier): its access facts.
    const toolEntries = [...Object.values(projections).flatMap(projection => [...projection.entries, ...(projection.bindings || [])]),
        ...sources.annotations.declared_entries.map(entry => ({ ...entry, native_id: entry.id.slice(entry.kind.length + 1) }))]
        .filter(entry => entry.kind === 'tool_definition');
    projections.tool_access = await projectToolAccess(new Set(toolEntries.filter(entry => entry.registry !== 'agent_gateway').map(entry => entry.native_id)));
    // What the MCP door reaches of every tool and method: the facts of each entry's exposure (annotateExposure).
    projections.tool_exposure = await projectToolExposure({ tools: toolEntries,
        methods: new Set([...projections.contracts.entries, ...projections.mcp_methods.entries].filter(entry => !entry.infrastructure).map(entry => entry.native_id)) });
    return projections;
}

export function assemble(projections, sources) {
    const entries = new Map(), relations = new Map(), findings = [];
    const claim = (entry, origin) => {
        if (entries.has(entry.id)) { findings.push({ type: 'duplicate_owner', id: entry.id, owners: [entries.get(entry.id).owner, entry.owner] }); return; }
        entries.set(entry.id, { ...entry, origin });
    };
    const relate = relation => relations.set(relationKey(relation), relation);
    for (const projection of Object.values(projections)) {
        projection.entries.forEach(entry => claim(entry, 'projected'));
        projection.relations.forEach(relate);
        findings.push(...projection.findings);
    }
    const { taxonomy, placements, aliases, annotations, health } = sources;
    taxonomy.nodes.forEach(node => {
        claim({ ...node, kind: 'taxonomy_node', native_id: node.id.slice('taxonomy_node:'.length), owner: node.owner || 'eVe/registry/source/taxonomy.json' }, 'owned');
        (node.refers_to || []).forEach(to => relate({ from: node.id, type: 'refers_to', to }));
    });
    placements.providers.forEach(provider => claim({ ...provider, kind: 'data_provider', native_id: provider.id.slice('data_provider:'.length),
        owner: 'eVe/registry/source/placements.json' }, 'owned'));
    placements.placements.forEach(placement => claim({ ...placement, kind: 'ui_placement', native_id: placement.id.slice('ui_placement:'.length),
        owner: 'eVe/registry/source/placements.json', effect: 'show' }, 'owned'));
    annotations.declared_entries.forEach(entry => claim({ ...entry, native_id: entry.id.slice(entry.kind.length + 1) }, 'declared'));
    health.doc_bricks.forEach(brick => claim({ ...brick, id: entryId('doc_brick', brick.id), kind: 'doc_brick', native_id: brick.id,
        owner: 'eVe/registry/source/health.json' }, 'owned'));
    health.links.forEach(relate);
    // A menu handler bound to a tool that has its owner adds the binding to that entry; otherwise it is the owner.
    projections.menus.bindings.forEach(binding => {
        const owned = entries.get(binding.id);
        if (owned) entries.set(binding.id, { ...owned, menu_handler: { owner: binding.owner, visibility: binding.visibility } });
        else claim(binding, 'projected');
    });

    for (const [id, entry] of entries) {
        if (entry.kind === 'action_contract') entries.set(id, entry.surface === 'contract_family' ? annotateContract(entry, annotations) : annotateMcpMethod(entry, annotations));
        if (entry.kind === 'tool_definition') entries.set(id, annotateTool(entry, annotations, projections.tool_access.access[entry.native_id]));
        if (entry.kind === 'objective_scenario') entries.set(id, { ...entry, status: entry.scenario === 'objective' ? health.objective_status[entry.native_id] : entry.scenario });
    }
    const doors = {
        methods: new Set([...entries.values()].filter(entry => entry.kind === 'action_contract' && !entry.infrastructure).map(entry => entry.native_id)),
        runtime: new Set([...entries.values()].filter(entry => entry.kind === 'tool_definition' && entry.registry !== 'agent_gateway').map(entry => entry.native_id))
    };
    for (const [id, entry] of entries) {
        if (entry.kind === 'action_contract' || entry.kind === 'tool_definition') entries.set(id, annotateExposure(entry, projections.tool_exposure.exposure, doors));
    }
    for (const placement of [...entries.values()].filter(entry => entry.kind === 'ui_placement' && entry.effect === 'show')) {
        relate({ from: placement.parent, type: 'contains', to: placement.target });
    }
    // A relation whose end is not an entry: an owned one is an error (check), a projected one is a finding of the code.
    const ownedRelationKeys = new Set([...taxonomy.nodes.flatMap(node => (node.refers_to || []).map(to => relationKey({ from: node.id, type: 'refers_to', to }))),
        ...health.links.map(relationKey)]);
    const kept = [];
    for (const [key, relation] of relations) {
        if (entries.has(relation.from) && entries.has(relation.to)) kept.push(relation);
        else if (ownedRelationKeys.has(key) || relation.type === 'contains') kept.push(relation);
        else findings.push({ type: 'unresolved_projected_relation', id: key });
    }
    const inputs = {
        ...Object.fromEntries(Object.entries(projections).map(([name, projection]) => [`owner:${name}`, hashOf({ entries: projection.entries, relations: projection.relations, bindings: projection.bindings || [],
            ...(projection.access ? { access: projection.access } : {}), ...(projection.exposure ? { exposure: projection.exposure } : {}) })])),
        ...Object.fromEntries(Object.entries(sources).map(([name, source]) => [`source:${name}`, hashOf(source)]))
    };
    const map = {
        format: 'eve-registry-1', inputs_hash: hashOf(inputs), inputs,
        entries: Object.fromEntries([...entries.values()].sort(byId).map(entry => [entry.id, entry])),
        relations: kept.sort((a, b) => (relationKey(a) < relationKey(b) ? -1 : 1)),
        aliases: Object.fromEntries([...aliases.aliases].sort((a, b) => (a.alias < b.alias ? -1 : 1)).map(({ alias, ...target }) => [alias, target])),
        archived: Object.fromEntries([...aliases.archived].sort((a, b) => (a.id < b.id ? -1 : 1)).map(({ id, reason }) => [id, { reason }])),
        archived_classes: aliases.archived_classes
    };
    return { map, findings };
}

export async function assembleRegistry() {
    const sources = readSources();
    const projections = await runProjections(sources);
    return { sources, projections, ...assemble(projections, sources) };
}
