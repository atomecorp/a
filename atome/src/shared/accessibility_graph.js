import { buildAtomGraph } from './atom_graph.js';
import { sanitizeAccessibleAtomNode } from './accessible_atom_node.js';

export const ACCESSIBILITY_GRAPH_VERSION = 1;

const ROLE_BY_ATOME_TYPE = Object.freeze({
    audio_waveform: 'waveform',
    waveform: 'waveform',
    audio_recording: 'audio',
    video_recording: 'video',
    project: 'project',
    group: 'group',
    text: 'text',
    shape: 'shape',
    image: 'image',
    video: 'video',
    audio: 'audio'
});

const toKey = (value) => String(value == null ? '' : value).trim();

const pushUniqueRelation = (relations, relation) => {
    if (!relation?.type || !relation?.target_id) return;
    if (relations.some((entry) => entry.type === relation.type && entry.target_id === relation.target_id)) return;
    relations.push(relation);
};

const accessibleRoleForNode = (node = {}) => {
    const explicit = node.properties?.accessibility?.role || node.accessibility?.role || node.role;
    if (explicit) return explicit;
    return ROLE_BY_ATOME_TYPE[node.type] || ROLE_BY_ATOME_TYPE[node.kind] || node.type || 'generic';
};

const accessibleRecordForNode = (node = {}) => ({
    id: node.id,
    type: accessibleRoleForNode(node),
    kind: node.kind,
    meta: node.meta,
    properties: node.properties
});

const graphFromInput = (input = {}, options = {}) => {
    if (input?.byId instanceof Map && Array.isArray(input.nodes)) return input;
    if (input?.atomGraph?.byId instanceof Map && Array.isArray(input.atomGraph.nodes)) return input.atomGraph;
    if (input?.graph?.byId instanceof Map && Array.isArray(input.graph.nodes)) return input.graph;
    return buildAtomGraph(input, options.atomGraphOptions || {});
};

const normalizeNodes = (atomGraph) => {
    const diagnostics = [];
    const byId = new Map();
    const omittedInaccessibleIds = [];

    atomGraph.nodes.forEach((graphNode) => {
        const result = sanitizeAccessibleAtomNode(accessibleRecordForNode(graphNode));
        if (!result.ok) {
            diagnostics.push({ id: graphNode.id, diagnostics: result.diagnostics });
            return;
        }
        if (result.node.visible_to_accessibility === false || result.node.role === 'none') {
            omittedInaccessibleIds.push(graphNode.id);
            return;
        }
        byId.set(graphNode.id, {
            ...result.node,
            atom_id: graphNode.id,
            parent_id: graphNode.parent_id,
            children: [],
            visual_order: graphNode.visual_order,
            semantic_order: graphNode.sort?.semantic_order ?? graphNode.semantic_order,
            focus_order: graphNode.sort?.focus_order ?? graphNode.focus_order
        });
    });

    return { byId, diagnostics, omittedInaccessibleIds };
};

const wireHierarchy = (atomGraph, byId) => {
    const roots = [];
    const links = [];
    atomGraph.nodes.forEach((graphNode) => {
        const node = byId.get(graphNode.id);
        if (!node) return;
        const parent = graphNode.parent_id ? byId.get(graphNode.parent_id) : null;
        if (!parent) {
            roots.push(node.id);
            return;
        }
        parent.children.push(node.id);
        links.push({ parent_id: parent.id, child_id: node.id });
        pushUniqueRelation(node.relations, { type: 'child_of', target_id: parent.id });
        pushUniqueRelation(parent.relations, { type: 'contains', target_id: node.id });
    });
    return { roots, links };
};

const orderedIds = (ids = [], byId) => ids.filter((id) => byId.has(id));

const sortIdsByOrderField = (ids = [], byId, field, fallbackField = 'semantic_order') => (
    orderedIds(ids, byId).sort((leftId, rightId) => {
        const left = byId.get(leftId);
        const right = byId.get(rightId);
        const leftOrder = Number.isFinite(Number(left?.[field])) ? Number(left[field]) : Number(left?.[fallbackField] || 0);
        const rightOrder = Number.isFinite(Number(right?.[field])) ? Number(right[field]) : Number(right?.[fallbackField] || 0);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return String(leftId).localeCompare(String(rightId));
    })
);

export function buildAccessibilityGraph(input = {}, options = {}) {
    const atomGraph = graphFromInput(input, options);
    const { byId, diagnostics, omittedInaccessibleIds } = normalizeNodes(atomGraph);
    const { roots, links } = wireHierarchy(atomGraph, byId);
    const graphIds = atomGraph.nodes.map((node) => node.id);
    const semantic = sortIdsByOrderField(graphIds, byId, 'semantic_order');
    const focus = sortIdsByOrderField(graphIds, byId, 'focus_order', 'semantic_order')
        .filter((id) => byId.get(id)?.focusable === true);
    const nodes = semantic.map((id) => byId.get(id));
    return {
        id: toKey(options.id || input.id) || `${atomGraph.id || 'atom'}_accessibility_graph`,
        version: ACCESSIBILITY_GRAPH_VERSION,
        atom_graph_id: atomGraph.id,
        roots: orderedIds(roots, byId),
        nodes,
        byId,
        links,
        orders: {
            reading: semantic,
            focus
        },
        diagnostics: {
            atom_graph: atomGraph.diagnostics || {},
            invalid_nodes: diagnostics,
            omitted_inaccessible_ids: omittedInaccessibleIds
        }
    };
}
