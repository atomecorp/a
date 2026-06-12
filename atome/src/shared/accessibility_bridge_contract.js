import { buildAccessibilityGraph } from './accessibility_graph.js';

export const ACCESSIBILITY_BRIDGE_CONTRACT_VERSION = 1;

const toKey = (value) => String(value == null ? '' : value).trim();

const cloneAction = (action = {}) => ({
    type: toKey(action.type),
    label: toKey(action.label) || null,
    disabled: action.disabled === true
});

const cloneRelation = (relation = {}) => ({
    type: toKey(relation.type),
    target_id: toKey(relation.target_id)
});

const graphFromInput = (input = {}, options = {}) => {
    if (input?.byId instanceof Map && Array.isArray(input.nodes) && input.orders?.reading) return input;
    if (input?.accessibilityGraph?.byId instanceof Map && Array.isArray(input.accessibilityGraph.nodes)) {
        return input.accessibilityGraph;
    }
    return buildAccessibilityGraph(input, options.accessibilityGraphOptions || {});
};

const bridgeNodeFromAccessibleNode = (node = {}) => ({
    id: node.id,
    atom_id: node.atom_id || node.id,
    role: node.role,
    label: node.label,
    description: node.description,
    alt_text: node.alt_text,
    focusable: node.focusable === true,
    visible_to_accessibility: node.visible_to_accessibility !== false,
    actions: (Array.isArray(node.actions) ? node.actions : []).map(cloneAction),
    relations: (Array.isArray(node.relations) ? node.relations : []).map(cloneRelation),
    reading_order: node.semantic_order,
    focus_order: node.focus_order
});

export function buildAccessibilityBridgeProjection(input = {}, options = {}) {
    const accessibilityGraph = graphFromInput(input, options);
    const nodes = accessibilityGraph.nodes.map(bridgeNodeFromAccessibleNode);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return {
        id: toKey(options.id || input.id) || `${accessibilityGraph.id || 'accessibility'}_bridge`,
        version: ACCESSIBILITY_BRIDGE_CONTRACT_VERSION,
        kind: 'semantic_accessibility_bridge_projection',
        disposable: true,
        source_graph_id: accessibilityGraph.id,
        nodes,
        byId,
        orders: {
            reading: (accessibilityGraph.orders?.reading || []).filter((id) => byId.has(id)),
            focus: (accessibilityGraph.orders?.focus || []).filter((id) => byId.has(id))
        },
        diagnostics: accessibilityGraph.diagnostics || {}
    };
}
