// Projections of the assembled map written next to it: the navigation tree per style and level, the search index,
// the inventory report and the audit graph. All derived from the map through the runtime's own read model.
import { createRegistryModel, unmetConditions } from '../../eVe/registry/registry_model.js';
import { eveT } from '../../eVe/i18n/i18n.js';

const STYLES = ['eve', 'eve_basic'], LEVELS = ['beginner', 'intermediate', 'advanced'];
// Dimensions a tree cannot decide without a live session: kept on the node as `when`.
const LIVE = new Set(['work_mode', 'activity', 'selection', 'armed_tool', 'types', 'capabilities', 'view', 'permissions', 'requires']);
const roots = map => Object.values(map.entries).filter(entry => entry.role === 'home' || entry.role === 'menu_slot').map(entry => entry.id).sort();
const showPlacements = map => Object.values(map.entries).filter(entry => entry.kind === 'ui_placement' && entry.effect === 'show');
const order = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.id < b.id ? -1 : 1);

export function uiTree(map) {
    const byParent = new Map();
    showPlacements(map).forEach(placement => { if (!byParent.has(placement.parent)) byParent.set(placement.parent, []); byParent.get(placement.parent).push(placement); });
    const trees = {};
    for (const style of STYLES) for (const level of LEVELS) {
        const context = { level, style, platform: 'web', facts: [] };
        const grow = (id, trail) => (byParent.get(id) || []).sort(order).flatMap(placement => {
            const scoped = { ...context, scope: placement.visible_when.scope };
            const unmet = unmetConditions(placement.visible_when, scoped);
            if (unmet.some(dimension => !LIVE.has(dimension))) return [];
            const when = Object.fromEntries(Object.entries(placement.visible_when).filter(([dimension]) => LIVE.has(dimension)));
            const node = { id: placement.target, key: placement.key, ...(Object.keys(when).length ? { when } : {}) };
            const below = trail.includes(placement.target) ? [] : grow(placement.target, [...trail, placement.target]);
            return [below.length ? { ...node, children: below } : node];
        });
        trees[`${style}/${level}`] = roots(map).map(id => ({ id, children: grow(id, [id]) }));
    }
    return { platform_note: 'No placement carries a platform condition yet; trees are computed for platform web and would note one in `when`.', trees };
}

// Every placed node with the path of its first placement chain from a root, its label and synonyms.
export function searchIndex(map) {
    const model = createRegistryModel(map);
    const firstParentPlacement = new Map();
    showPlacements(map).sort(order).forEach(placement => { if (!firstParentPlacement.has(placement.target)) firstParentPlacement.set(placement.target, placement); });
    const pathOf = (placement) => {
        const path = [placement.target];
        let parent = placement.parent;
        while (parent && !path.includes(parent)) { path.unshift(parent); parent = firstParentPlacement.get(parent)?.parent; }
        return path;
    };
    const hasChildren = new Set(showPlacements(map).map(placement => placement.parent));
    return showPlacements(map).sort((a, b) => (a.id < b.id ? -1 : 1)).map(placement => {
        const target = map.entries[placement.target];
        return { id: placement.target, placement: placement.id, key: placement.key, label_key: placement.label_key || target.label_key || null,
            label: model.labelOf(placement), synonyms: target.synonyms || [], leaf: !hasChildren.has(placement.target), path: pathOf(placement),
            visible_when: placement.visible_when };
    });
}

export function inventoryReport(map, findings, holes) {
    const entries = Object.values(map.entries), count = (list, key) => list.reduce((out, item) => ({ ...out, [key(item)]: (out[key(item)] || 0) + 1 }), {});
    const nativeOwners = new Map();
    entries.forEach(entry => { if (!nativeOwners.has(entry.native_id)) nativeOwners.set(entry.native_id, []); nativeOwners.get(entry.native_id).push(entry.id); });
    const missingLabelKeys = [...new Set(entries.flatMap(entry => [entry.label_key]).filter(key => key && eveT(key, '') === ''))].sort();
    return {
        format: 'eve-registry-inventory-1', inputs_hash: map.inputs_hash,
        counts: { entries: entries.length, relations: map.relations.length, aliases: Object.keys(map.aliases).length, archived: Object.keys(map.archived).length,
            by_kind: count(entries, entry => entry.kind), by_origin: count(entries, entry => entry.origin),
            placements_by_surface: count(entries.filter(entry => entry.kind === 'ui_placement'), entry => entry.surface),
            relations_by_type: count(map.relations, relation => relation.type),
            doc_brick_alias_status: count(entries.filter(entry => entry.kind === 'doc_brick'), entry => entry.alias_status),
            tool_family_basis: count(entries.filter(entry => entry.family_basis), entry => entry.family_basis),
            contract_risk_tiers: count(entries.filter(entry => entry.kind === 'action_contract'), entry => entry.risk_tier),
            contract_offline: count(entries.filter(entry => entry.kind === 'action_contract'), entry => entry.offline),
            tool_exposure: count(entries.filter(entry => entry.kind === 'tool_definition'), entry => entry.exposure),
            contract_exposure: count(entries.filter(entry => entry.exposure && entry.kind === 'action_contract'), entry => entry.exposure),
            blocked_on: count(entries.filter(entry => entry.exposure_blocked_on), entry => `${entry.kind}:${entry.exposure_blocked_on.join('+')}`) },
        holes,
        findings: [...findings].sort((a, b) => (`${a.type}${a.id}` < `${b.type}${b.id}` ? -1 : 1)),
        collisions: { native_id_shared_across_kinds: [...nativeOwners].filter(([, ids]) => ids.length > 1).map(([native, ids]) => ({ native_id: native, ids: ids.sort() }))
            .sort((a, b) => (a.native_id < b.native_id ? -1 : 1)) },
        label_keys_missing_in_i18n: missingLabelKeys
    };
}

export function graphMermaid(map) {
    const containers = new Set(['taxonomy_node', 'data_provider']);
    const safe = id => id.replace(/[^A-Za-z0-9_]/g, '_');
    const edges = map.relations.filter(relation => relation.type === 'contains' && containers.has(map.entries[relation.to]?.kind)
        && map.entries[relation.from]?.native_id?.startsWith('dashboard.'));
    const kindPairs = new Map();
    map.relations.forEach(relation => { const key = `${relation.from.split(':')[0]} -- ${relation.type} --> ${relation.to.split(':')[0]}`; kindPairs.set(key, (kindPairs.get(key) || 0) + 1); });
    return ['%% Generated by scripts/registry/build_registry.mjs. Do not edit.', 'flowchart LR',
        '  subgraph kinds["Relations between kinds (count)"]',
        ...[...kindPairs].sort().map(([pair, total], index) => { const [from, rest] = pair.split(' -- '); const [type, to] = rest.split(' --> ');
            return `    k${index}a["${from}"] -- "${type} (${total})" --> k${index}b["${to}"]`; }),
        '  end', '  subgraph dashboard["Dashboard levels"]',
        ...edges.map(relation => `    ${safe(relation.from)}["${map.entries[relation.from].native_id}"] --> ${safe(relation.to)}["${map.entries[relation.to].native_id}"]`),
        '  end', ''].join('\n');
}
