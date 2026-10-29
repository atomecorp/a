// The shop's orders (user decisions of 28 Oct. 2026): a purchase pays into escrow (payment SIMULATED for now, the
// methods of atome/src/shared/billing_contract.js; nothing is charged), the money released to the seller less
// Atome's 3 % once the good is received, refunded when the rules say so. The moves are the shared contract's
// (atome/src/shared/shop_order_contract.js); this service applies them, keeps every step (append-only
// `shop_order_steps`), gives a digital good at payment (server/shop_delivery.js) and tells the other side.
import crypto from 'node:crypto';
import { BILLING_SIMULATED_METHODS } from '../atome/src/shared/billing_contract.js';
import { shopAmount, shopSplit } from '../atome/src/shared/shop_contract.js';
import { SHOP_ORDER_FINAL_STATES, shopOrderOpening, shopOrderStep } from '../atome/src/shared/shop_order_contract.js';

const DAY_MS = 24 * 3600 * 1000;
const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
const iso = (value) => {
    const time = new Date(value || NaN).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

export function createShopOrders({ store, listings, delivery, vaultRouter, notify, now = () => Date.now() }) {
    const fail = error => ({ ok: false, error });
    const tell = (targetId, senderId, order, message) => notify(String(targetId), senderId ? String(senderId) : null, {
        kind: 'shop-order', subject: text(parse(order.snapshot_json)?.title, 80), message, id: `shop_order_${order.order_id}_${order.state}`,
        extra: { action: { kind: 'command', toolId: 'shop.open', input: { listing_id: order.listing_id, order_id: order.order_id } }, order_state: order.state } });

    // The dates a ticket or an appointment holds: the event's own (read in the organiser's vault) or the slot chosen.
    const datesOf = async (row, listing, input) => {
        if (listing.kind === 'ticket') {
            const event = await vaultRouter.getState(String(row.seller_id), listing.event_id).catch(() => null);
            const startsAt = iso(event?.properties?.start), endsAt = iso(event?.properties?.end) || startsAt;
            return startsAt ? { startsAt, endsAt } : null;
        }
        if (listing.kind === 'service') {
            const startsAt = iso(input.starts_at);
            return startsAt ? { startsAt, endsAt: new Date(new Date(startsAt).getTime() + listing.duration_minutes * 60000).toISOString() } : null;
        }
        if (listing.kind === 'rental') {
            const startsAt = iso(input.starts_at), endsAt = iso(input.ends_at);
            return startsAt && endsAt && endsAt > startsAt ? { startsAt, endsAt } : null;
        }
        return {};
    };
    // What the buyer pays (the deposit of a rental apart: held, never commissioned, given back at the return).
    const priceOf = (listing, input, quantity, dates) => {
        if (listing.kind === 'free_price') {
            const amount = shopAmount(input.amount, 0);
            return amount != null && amount >= listing.price ? amount : null;
        }
        if (listing.kind === 'rental') return Math.round(listing.price * Math.ceil((new Date(dates.endsAt) - new Date(dates.startsAt)) / DAY_MS) * 100) / 100;
        const shipping = input.delivery === 'shipping' ? listing.delivery?.shipping_cost || 0 : 0;
        return Math.round((listing.price * quantity + shipping) * 100) / 100;
    };
    const deliveryOf = (listing, wanted) => {
        if (!listing.delivery) return '';
        if (wanted === 'shipping' && listing.delivery.shipping) return 'shipping';
        if (wanted === 'handover' && listing.delivery.handover) return 'handover';
        return listing.delivery.shipping && !listing.delivery.handover ? 'shipping' : listing.delivery.handover && !listing.delivery.shipping ? 'handover' : null;
    };

    // A purchase (or a registration to validate): the sale read from the base, never from the client.
    const buy = async (buyerId, input = {}) => {
        const row = await listings.read(text(input.listing_id));
        if (!row || row.hidden_at) return fail('shop_not_found');
        if (String(row.seller_id) === String(buyerId)) return fail('shop_own_listing');
        const listing = parse(row.payload_json);
        // A free ticket (a registration) is taken without paying: no method.
        const free = listing.kind === 'ticket' && listing.price === 0;
        if (!free && !BILLING_SIMULATED_METHODS.includes(input.method)) return fail('shop_payment_method_invalid');
        const quantity = ['physical', 'preorder', 'ticket'].includes(listing.kind) ? Math.max(1, Math.min(99, Math.round(Number(input.quantity) || 1))) : 1;
        const stock = listing.kind === 'ticket' ? listing.places : ['physical', 'preorder'].includes(listing.kind) ? listing.quantity : null;
        if (stock != null && await store.taken(row.listing_id) + quantity > stock) return fail('shop_sold_out');
        const deliveryMode = deliveryOf(listing, input.delivery);
        if (deliveryMode === null) return fail('shop_delivery_required');
        const dates = await datesOf(row, listing, input);
        if (!dates) return fail('shop_dates_required');
        const amount = priceOf(listing, input, quantity, dates);
        if (amount == null) return fail('shop_amount_invalid');
        const split = shopSplit(amount), at = now();
        const state = shopOrderOpening({ kind: listing.kind, registration: listing.registration });
        const order = { order_id: crypto.randomUUID(), listing_id: row.listing_id, buyer_id: String(buyerId), seller_id: String(row.seller_id),
            kind: listing.kind, state, quantity, amount: split.amount, commission: split.commission, net: split.net,
            deposit: listing.kind === 'rental' ? listing.deposit : 0, method: free ? '' : input.method, delivery: deliveryMode || '',
            starts_at: dates.startsAt || null, ends_at: dates.endsAt || null, delivery_date: listing.delivery_date || null,
            delivered_at: state === 'delivered' ? new Date(at).toISOString() : null,
            snapshot_json: JSON.stringify({ title: listing.title, price: listing.price, image: listing.images?.[0] || '', seller: row.seller_name }) };
        await store.insertOrder(order);
        await store.step({ orderId: order.order_id, action: 'open', role: 'buyer', actorId: String(buyerId), from: '', to: state,
            detail: { simulated: true, method: free ? '' : input.method, amount: split.amount, deposit: order.deposit } });
        if (state === 'delivered' && ['project', 'template'].includes(listing.kind)) {
            const copy = await delivery.copyProject({ sellerId: order.seller_id, buyerId: order.buyer_id, projectId: listing.project_id, orderId: order.order_id });
            await store.step({ orderId: order.order_id, action: 'deliver', role: 'atome', from: state, to: state, detail: copy });
            order.copy_project_id = copy.projectId;
        }
        await tell(order.seller_id, buyerId, order, state === 'requested' ? 'registration' : 'sold');
        return { ok: true, order: view(order, buyerId) };
    };

    // One move by its buyer, its seller, Atome (a dispute's decision) or the clock.
    const move = async (actorId, { order_id: orderId, action, tracking = '' }, { role: forced = null } = {}) => {
        const order = await store.order(text(orderId));
        if (!order) return fail('shop_order_not_found');
        const role = forced || (String(order.buyer_id) === String(actorId) ? 'buyer' : String(order.seller_id) === String(actorId) ? 'seller' : null);
        if (!role) return fail('shop_order_forbidden');
        const at = now(), step = shopOrderStep(order, text(action, 40), { role, at });
        if (!step.ok) return step;
        const fields = {};
        if (action === 'ship') fields.tracking = text(tracking, 120);
        if (step.state === 'delivered') fields.delivered_at = new Date(at).toISOString();
        await store.step({ orderId: order.order_id, action, role, actorId: actorId ? String(actorId) : '', from: order.state, to: step.state,
            detail: { simulated: true, ...(step.state === 'released' ? { net: order.net, commission: order.commission, deposit_returned: order.deposit } : {}),
                ...(step.state === 'refunded' ? { refunded: order.amount + order.deposit } : {}) }, fields });
        const moved = { ...order, ...fields, state: step.state };
        if (role !== 'clock' || step.state === 'released') {
            await tell(role === 'buyer' ? order.seller_id : order.buyer_id, role === 'clock' || role === 'atome' ? null : actorId, moved, action);
        }
        return { ok: true, order: view(moved, actorId) };
    };

    // The organiser cancels the event, the seller withdraws the sale: every buyer still waiting is refunded.
    // Read from the orders themselves: a sale already out of the base (refused, withdrawn) still refunds its buyers.
    const refundAll = async (sellerId, listingId) => {
        let refunded = 0;
        for (const order of await store.openOrders(text(listingId), String(sellerId)) || []) {
            if ((await move(sellerId, { order_id: order.order_id, action: 'refund' })).ok) refunded += 1;
        }
        return { ok: true, refunded };
    };

    // Time passing: what is due is released (two days after a delivery without dispute, the event or slot over).
    const tick = async () => {
        let released = 0;
        for (const order of await store.due() || []) {
            if ((await move(null, { order_id: order.order_id, action: 'expire' }, { role: 'clock' })).ok) released += 1;
        }
        return { ok: true, released };
    };

    // An order as one of its sides reads it (the other side's money details stay theirs).
    const view = (order, readerId) => {
        const snapshot = parse(order.snapshot_json) || {}, seller = String(order.seller_id) === String(readerId);
        return { id: order.order_id, listingId: order.listing_id, side: seller ? 'seller' : 'buyer', peerId: seller ? order.buyer_id : order.seller_id,
            kind: order.kind, state: order.state, final: SHOP_ORDER_FINAL_STATES.includes(order.state), quantity: order.quantity, amount: order.amount,
            deposit: order.deposit, ...(seller ? { commission: order.commission, net: order.net } : {}), delivery: order.delivery, tracking: order.tracking || '',
            startsAt: order.starts_at, endsAt: order.ends_at, deliveryDate: order.delivery_date, deliveredAt: order.delivered_at,
            title: snapshot.title || '', image: snapshot.image || '', seller: snapshot.seller || '', simulated: true,
            ...(order.copy_project_id ? { projectId: order.copy_project_id } : {}) };
    };
    const orders = async (userId, { side = 'buyer' } = {}) => ({ ok: true,
        items: (await store.ordersOf(String(userId), side === 'seller' ? 'seller' : 'buyer') || []).map(order => view(order, userId)) });
    // Paid content and a subscription read by their buyer while the order stands (never refunded or cancelled).
    const hasAccess = async (userId, listingId) => (await store.ordersOf(String(userId), 'buyer') || [])
        .some(order => order.listing_id === listingId && ['delivered', 'released'].includes(order.state));

    return { buy, move, refundAll, tick, orders, hasAccess };
}
