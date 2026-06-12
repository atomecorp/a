export const ATOM_GRAPH_VERSION = 1;

const STRUCTURAL_PROPERTY_KEYS = new Set([
    'id', 'type', 'atome_type', 'parent', 'parent_id', 'parentId', 'project_id',
    'projectId', 'owner', 'owner_id', 'ownerId', '__deleted', 'deleted_at', 'deletedAt'
]);

const hasObjectShape = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const hasAnyOwn = (object, keys) => keys.some((key) => hasOwn(object, key));

const toKey = (value) => String(value == null ? '' : value).trim();

const firstKey = (...values) => {
    for (const value of values) {
        const key = toKey(value);
        if (key) return key;
    }
    return null;
};

const firstFinite = (fallback, ...values) => {
    for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
};

const safeParseJson = (value) => {
    if (hasObjectShape(value)) return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const cloneProperties = (properties = {}) => {
    const result = {};
    if (!hasObjectShape(properties)) return result;
    for (const [key, value] of Object.entries(properties)) {
        if (STRUCTURAL_PROPERTY_KEYS.has(key)) continue;
        result[key] = value;
    }
    return result;
};

const readRecordProperties = (record = {}) => {
    const direct = record.properties ?? record.props ?? record.data ?? null;
    const parsed = typeof direct === 'string' ? safeParseJson(direct) : direct;
    return hasObjectShape(parsed) ? parsed : {};
};

const readAccessibility = (properties = {}) => (
    hasObjectShape(properties.accessibility) ? properties.accessibility : {}
);

const readEventPayload = (event = {}) => {
    const payload = typeof event.payload === 'string' ? safeParseJson(event.payload) : event.payload;
    if (hasObjectShape(payload)) return payload;
    const props = event.props || event.properties || event.patch || event.delta || null;
    return hasObjectShape(props) ? { props } : {};
};

const readEventPatch = (event = {}) => {
    if (event.kind === 'delete') {
        return { __deleted: true, deleted_at: event.ts || event.timestamp || null };
    }
    const payload = readEventPayload(event);
    const patch = payload.props || payload.properties || payload.patch || payload.delta || {};
    return hasObjectShape(patch) ? patch : {};
};

const isDeleted = (record = {}, properties = {}) => (
    record.deleted === true
    || properties.__deleted === true
    || !!(record.deleted_at || record.deletedAt || properties.deleted_at || properties.deletedAt)
);

const resolveDeletedAt = (record = {}, properties = {}) => (
    firstKey(record.deleted_at, record.deletedAt, properties.deleted_at, properties.deletedAt)
);

const compareNodes = (left, right) => {
    if (left.sort.z_index !== right.sort.z_index) return left.sort.z_index - right.sort.z_index;
    if (left.sort.order !== right.sort.order) return left.sort.order - right.sort.order;
    if (left.sort.source_index !== right.sort.source_index) return left.sort.source_index - right.sort.source_index;
    return left.id.localeCompare(right.id);
};

const compareBySortKey = (key, fallbackCompare) => (left, right) => {
    if (left.sort[key] !== right.sort[key]) return left.sort[key] - right.sort[key];
    return fallbackCompare(left, right);
};

const compareSemanticNodes = compareBySortKey('semantic_order', compareNodes);
const compareFocusNodes = compareBySortKey('focus_order', compareSemanticNodes);

const createNode = (record = {}, sourceIndex = 0, source = 'record') => {
    const properties = readRecordProperties(record);
    const accessibility = readAccessibility(properties);
    const meta = hasObjectShape(record.meta) ? { ...record.meta } : {};
    const id = firstKey(record.id, record.atome_id, record.atomeId, properties.id);
    if (!id) return null;
    const typeHint = firstKey(record.type, record.atome_type, record.atomeType, properties.type, properties.atome_type);
    const parentProvided = hasAnyOwn(meta, ['parent_id', 'parentId']) || hasAnyOwn(record, ['parent_id', 'parentId', 'parent']) || hasAnyOwn(properties, ['parent_id', 'parentId', 'parent']);
    const projectProvided = hasAnyOwn(meta, ['project_id', 'projectId']) || hasAnyOwn(record, ['project_id', 'projectId']) || hasAnyOwn(properties, ['project_id', 'projectId']);
    const ownerProvided = hasAnyOwn(meta, ['owner_id', 'ownerId']) || hasAnyOwn(record, ['owner_id', 'ownerId', 'owner']) || hasAnyOwn(properties, ['owner_id', 'ownerId', 'owner']);
    const sortProvided = hasAnyOwn(properties, ['z_index', 'zIndex', 'z', 'visual_order', 'visualOrder', 'order', 'render_order', 'renderOrder'])
        || hasAnyOwn(properties, ['semantic_order', 'semanticOrder', 'reading_order', 'readingOrder', 'focus_order', 'focusOrder', 'tab_index', 'tabIndex', 'accessibility'])
        || hasAnyOwn(record, ['z_index', 'zIndex', 'visual_order', 'visualOrder', 'order']);
    const parentId = parentProvided ? firstKey(meta.parent_id, meta.parentId, record.parent_id, record.parentId, record.parent, properties.parent_id, properties.parentId, properties.parent) : null;
    const projectId = projectProvided ? firstKey(meta.project_id, meta.projectId, record.project_id, record.projectId, properties.project_id, properties.projectId) : null;
    const ownerId = ownerProvided ? firstKey(meta.owner_id, meta.ownerId, record.owner_id, record.ownerId, record.owner, properties.owner_id, properties.ownerId, properties.owner) : null;
    const deleted = isDeleted(record, properties);
    const zIndex = firstFinite(0, properties.z_index, properties.zIndex, properties.z, record.z_index, record.zIndex);
    const order = firstFinite(sourceIndex, properties.visual_order, properties.visualOrder, properties.order, properties.render_order, properties.renderOrder, record.visual_order, record.visualOrder, record.order);
    const semanticOrder = firstFinite(order, properties.semantic_order, properties.semanticOrder, properties.reading_order, properties.readingOrder, accessibility.semantic_order, accessibility.semanticOrder, accessibility.reading_order, accessibility.readingOrder, accessibility.order);
    const focusOrder = firstFinite(semanticOrder, properties.focus_order, properties.focusOrder, properties.tab_index, properties.tabIndex, accessibility.focus_order, accessibility.focusOrder, accessibility.tab_index, accessibility.tabIndex);
    return {
        id,
        type: typeHint || 'generic',
        kind: firstKey(record.kind, properties.kind),
        parent_id: parentId,
        project_id: projectId,
        owner_id: ownerId,
        meta,
        properties: cloneProperties(properties),
        deleted,
        deleted_at: resolveDeletedAt(record, properties),
        children: [],
        visual_order: null,
        semantic_order: null,
        focus_order: null,
        source,
        source_index: sourceIndex,
        sort: { z_index: zIndex, order, semantic_order: semanticOrder, focus_order: focusOrder, source_index: sourceIndex },
        _merge: { type: !!typeHint, parent: parentProvided, project: projectProvided, owner: ownerProvided, sort: sortProvided }
    };
};

const eventToRecord = (event = {}, index = 0) => {
    const atomeId = firstKey(event.atome_id, event.atomeId);
    if (!atomeId) return null;
    const patch = readEventPatch(event);
    const record = {
        id: atomeId,
        deleted: patch.__deleted === true || event.kind === 'delete',
        deleted_at: patch.deleted_at || patch.deletedAt || (event.kind === 'delete' ? event.ts : null),
        properties: patch,
        source_index: index
    };
    const typeHint = firstKey(patch.type, patch.atome_type, event.atome_type, event.type);
    const kindHint = firstKey(patch.kind, event.kind_hint);
    if (typeHint) record.type = typeHint;
    if (kindHint) record.kind = kindHint;
    if (hasAnyOwn(patch, ['parent_id', 'parentId']) || hasAnyOwn(event, ['parent_id', 'parentId'])) {
        record.parent_id = firstKey(patch.parent_id, patch.parentId, event.parent_id, event.parentId);
    }
    if (hasAnyOwn(patch, ['project_id', 'projectId']) || hasAnyOwn(event, ['project_id', 'projectId'])) {
        record.project_id = firstKey(patch.project_id, patch.projectId, event.project_id, event.projectId);
    }
    if (hasAnyOwn(patch, ['owner_id', 'ownerId']) || hasAnyOwn(event, ['owner_id', 'ownerId'])) {
        record.owner_id = firstKey(patch.owner_id, patch.ownerId, event.owner_id, event.ownerId);
    }
    return record;
};

const mergeNode = (current, next) => {
    if (!current) return next;
    const merge = next._merge || {};
    return {
        ...current,
        type: merge.type ? next.type : current.type,
        kind: next.kind || current.kind,
        parent_id: merge.parent ? next.parent_id : current.parent_id,
        project_id: merge.project ? next.project_id : current.project_id,
        owner_id: merge.owner ? next.owner_id : current.owner_id,
        meta: { ...current.meta, ...next.meta },
        properties: { ...current.properties, ...next.properties },
        deleted: next.deleted,
        deleted_at: next.deleted ? (next.deleted_at || current.deleted_at) : null,
        source: next.source,
        source_index: next.source_index,
        sort: merge.sort ? next.sort : current.sort,
        _merge: next._merge
    };
};

const sortedEventRecords = (events = []) => (
    (Array.isArray(events) ? events : [])
        .map((event, index) => ({ event, index }))
        .sort((left, right) => {
            const leftTime = Date.parse(left.event?.ts || left.event?.timestamp || '') || 0;
            const rightTime = Date.parse(right.event?.ts || right.event?.timestamp || '') || 0;
            if (leftTime !== rightTime) return leftTime - rightTime;
            return left.index - right.index;
        })
        .map(({ event, index }) => eventToRecord(event, index))
        .filter(Boolean)
);

const wouldCreateCycle = (byId, childId, parentId) => {
    const visited = new Set([childId]);
    let current = byId.get(parentId);
    while (current) {
        if (visited.has(current.id)) return true;
        visited.add(current.id);
        current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return false;
};

const flattenTree = (byId, roots, compare = compareNodes, orderField = 'visual_order') => {
    const ordered = [];
    const visit = (id) => {
        const node = byId.get(id);
        if (!node) return;
        ordered.push(node);
        node.children
            .map((childId) => byId.get(childId))
            .filter(Boolean)
            .sort(compare)
            .map((child) => child.id)
            .forEach(visit);
    };
    roots
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort(compare)
        .map((node) => node.id)
        .forEach(visit);
    ordered.forEach((node, index) => {
        node[orderField] = index;
    });
    return ordered;
};

export function normalizeAtomGraphRecord(record = {}, options = {}) {
    const node = createNode(record, Number(options.sourceIndex || 0), options.source || 'record');
    if (!node) return null;
    const { _merge, ...publicNode } = node;
    return publicNode;
}

export function buildAtomGraph(input = {}, options = {}) {
    const records = Array.isArray(input) ? input : (input.records || input.stateRows || input.states || []);
    const sourceRecords = Array.isArray(records) ? records : [];
    const events = Array.isArray(input) ? [] : (input.events || []);
    const includeDeleted = options.includeDeleted === true || input.includeDeleted === true;
    const draftById = new Map();
    const seenRecordIds = new Set();
    const duplicateIds = [];

    sourceRecords.forEach((record, index) => {
        const node = createNode(record, index, 'record');
        if (!node) return;
        if (seenRecordIds.has(node.id) && !duplicateIds.includes(node.id)) duplicateIds.push(node.id);
        seenRecordIds.add(node.id);
        draftById.set(node.id, mergeNode(draftById.get(node.id), node));
    });
    sortedEventRecords(events).forEach((record, index) => {
        const node = createNode(record, sourceRecords.length + index, 'event');
        if (!node) return;
        draftById.set(node.id, mergeNode(draftById.get(node.id), node));
    });

    const diagnostics = { omitted_deleted_ids: [], orphan_links: [], cycle_links: [], duplicate_ids: duplicateIds };
    const nodes = [...draftById.values()]
        .filter((node) => {
            if (includeDeleted || !node.deleted) return true;
            diagnostics.omitted_deleted_ids.push(node.id);
            return false;
        })
        .sort(compareNodes)
        .map((node) => {
            const { _merge, ...publicNode } = node;
            return { ...publicNode, children: [] };
        });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots = [];
    const links = [];

    nodes.forEach((node) => {
        if (!node.parent_id || !byId.has(node.parent_id)) {
            if (node.parent_id) diagnostics.orphan_links.push({ child_id: node.id, parent_id: node.parent_id });
            roots.push(node.id);
            return;
        }
        if (wouldCreateCycle(byId, node.id, node.parent_id)) {
            diagnostics.cycle_links.push({ child_id: node.id, parent_id: node.parent_id });
            roots.push(node.id);
            return;
        }
        byId.get(node.parent_id).children.push(node.id);
        links.push({ parent_id: node.parent_id, child_id: node.id });
    });
    byId.forEach((node) => {
        node.children = node.children
            .map((id) => byId.get(id))
            .filter(Boolean)
            .sort(compareNodes)
            .map((child) => child.id);
    });
    const root_ids = roots
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort(compareNodes)
        .map((node) => node.id);
    const orderedNodes = flattenTree(byId, root_ids);
    const semanticNodes = flattenTree(byId, root_ids, compareSemanticNodes, 'semantic_order');
    const focusNodes = flattenTree(byId, root_ids, compareFocusNodes, 'focus_order');
    return {
        id: toKey(options.id || input.id) || 'atom_graph',
        version: ATOM_GRAPH_VERSION,
        roots: root_ids,
        nodes: orderedNodes,
        byId,
        links,
        orders: {
            visual: orderedNodes.map((node) => node.id),
            semantic: semanticNodes.map((node) => node.id),
            focus: focusNodes.map((node) => node.id)
        },
        diagnostics
    };
}
