// What a bought digital good gives its buyer (user decisions of 28 Oct. 2026). A project or a template: a copy of the
// seller's project, every object of it, committed into the buyer's own vault (the buyer may change it, never resell it:
// the copy keeps `shop_order_id` and its origin). Paid content and a subscription give a reading access, held by the
// order itself (server/shop_orders.js#hasAccess), never a copy.
import crypto from 'node:crypto';
import { stateAtomeId, stateParentId, statesWithinSharedRoot } from './syncShareHierarchy.js';

const RESERVED = new Set(['_pending_owner_id', '_pending_parent_id', 'listing', 'listing_status']);

// Depth of each state under the root, so a parent is always copied before its children.
const depthOf = (state, byId, rootId) => {
    let depth = 0, cursor = String(stateAtomeId(state));
    while (cursor && cursor !== rootId && depth < 1000) { cursor = String(stateParentId(byId.get(cursor)) || ''); depth += 1; }
    return depth;
};

export function createShopDelivery({ vaultRouter }) {
    const copyProject = async ({ sellerId, buyerId, projectId, orderId }) => {
        const states = await statesWithinSharedRoot({ provider: vaultRouter.provider, ownerId: sellerId, rootAtomeId: projectId });
        if (!states.some(state => String(stateAtomeId(state)) === String(projectId))) throw new Error('shop_project_not_found');
        const byId = new Map(states.map(state => [String(stateAtomeId(state)), state]));
        const mapping = new Map(states.map(state => [String(stateAtomeId(state)), crypto.randomUUID()]));
        // Every property naming a copied object names its copy (parent, project, links between objects).
        const remap = value => (typeof value === 'string' && mapping.has(value) ? mapping.get(value)
            : Array.isArray(value) ? value.map(remap) : value);
        const ordered = [...states].sort((a, b) => depthOf(a, byId, String(projectId)) - depthOf(b, byId, String(projectId)));
        for (const state of ordered) {
            const originalId = String(stateAtomeId(state));
            const properties = {};
            for (const [key, value] of Object.entries(state.properties || {})) if (!RESERVED.has(key)) properties[key] = remap(value);
            if (originalId === String(projectId)) delete properties.parent_id;
            Object.assign(properties, { type: state.type || state.atome_type || properties.type, shared_from: sellerId, original_atome_id: originalId,
                share_type: 'copy', shop_order_id: orderId });
            await vaultRouter.commit(buyerId, { kind: 'set', atome_id: mapping.get(originalId), payload: { props: properties },
                actor: { type: 'user', id: buyerId } }, { source: 'shop' });
        }
        return { projectId: mapping.get(String(projectId)), objects: states.length };
    };
    return { copyProject };
}
