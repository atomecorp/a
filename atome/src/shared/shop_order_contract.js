// A shop order and its escrow (user decisions of 28 Oct. 2026): the buyer's money is held — neither the seller
// nor Atome touches it — until the good is received, then released to the seller less Atome's 3 %
// (atome/src/shared/shop_contract.js#shopSplit). Payment is SIMULATED for now on every platform; the real
// marketplace provider (payouts, seller checks, Apple's in-app purchase for digital goods) comes later.
// One owner for the order's states and the moves allowed between them, server and client: `shopOrderStep`
// is pure, the server applies it and keeps every step (server/shop_orders.js).
import { SHOP_DIGITAL_KINDS } from './shop_contract.js';

const HOUR_MS = 3600 * 1000, DAY_MS = 24 * HOUR_MS;
// Without the buyer's confirmation, the money goes to the seller this long after the delivery, unless disputed.
export const SHOP_AUTO_RELEASE_MS = 2 * DAY_MS;
// A ticket or an appointment cancelled by its buyer is refunded until this long before it begins.
export const SHOP_CANCEL_NOTICE_MS = 48 * HOUR_MS;
// A pre-order this late past its announced date may be cancelled and refunded.
export const SHOP_PREORDER_LATE_MS = 30 * DAY_MS;

// requested: a registration waiting for the organiser (nothing paid); held: paid, in escrow; shipped: sent with its
// tracking; delivered: received (or handed over, or a digital good given); released: paid to the seller;
// disputed: the buyer contests, the money stays held; refunded / cancelled: over, the buyer owes nothing.
export const SHOP_ORDER_STATES = Object.freeze(['requested', 'held', 'shipped', 'delivered', 'released', 'disputed', 'refunded', 'cancelled']);
export const SHOP_ORDER_FINAL_STATES = Object.freeze(['released', 'refunded', 'cancelled']);
export const SHOP_ORDER_ACTIONS = Object.freeze(['validate', 'refuse', 'ship', 'handover', 'confirm', 'dispute', 'cancel', 'release', 'refund', 'expire']);

// What the buyer receives at once once paid: a digital good is given on payment (a project copied, an access opened).
const deliveredOnPayment = kind => SHOP_DIGITAL_KINDS.includes(kind) || kind === 'free_price';
// What ends at a known time (`ends_at`: the event's end, the appointment's end): released then, never confirmed by hand.
const dated = kind => kind === 'ticket' || kind === 'service';

// The first state of a new order: a registration to validate waits unpaid; anything else is paid into escrow.
export const shopOrderOpening = ({ kind, registration = 'auto' }) => (kind === 'ticket' && registration === 'validated' ? 'requested'
    : deliveredOnPayment(kind) ? 'delivered' : 'held');

const time = value => new Date(value || 0).getTime();
const cancellable = (order, at) => {
    if (dated(order.kind)) return Number.isFinite(time(order.starts_at)) && at <= time(order.starts_at) - SHOP_CANCEL_NOTICE_MS;
    if (order.kind === 'preorder') return Number.isFinite(time(order.delivery_date)) && at >= time(order.delivery_date) + SHOP_PREORDER_LATE_MS;
    return false;
};

// Who may do what, from which states. `role`: 'buyer', 'seller', 'atome' (a dispute's decision) or 'clock' (time passing).
const MOVES = Object.freeze({
    validate: { role: 'seller', from: ['requested'], to: 'held' },
    refuse: { role: 'seller', from: ['requested'], to: 'cancelled' },
    ship: { role: 'seller', from: ['held'], to: 'shipped', when: order => order.delivery === 'shipping' },
    handover: { role: 'seller', from: ['held', 'shipped'], to: 'delivered', when: order => !dated(order.kind) },
    confirm: { role: 'buyer', from: ['held', 'shipped', 'delivered'], to: 'released', when: order => !dated(order.kind) },
    dispute: { role: 'buyer', from: ['held', 'shipped', 'delivered'], to: 'disputed' },
    cancel: { role: 'buyer', from: ['requested', 'held'], to: order => (order.state === 'requested' ? 'cancelled' : 'refunded'),
        when: (order, at) => order.state === 'requested' || cancellable(order, at) },
    // The organiser cancels the event (or the seller the appointment): every buyer is refunded.
    refund: { role: ['seller', 'atome'], from: ['requested', 'held', 'shipped', 'delivered', 'disputed'], to: order => (order.state === 'requested' ? 'cancelled' : 'refunded') },
    release: { role: 'atome', from: ['disputed'], to: 'released' },
    // Time passing: two days after the delivery without a dispute, or the event / appointment over.
    expire: { role: 'clock', from: ['held', 'delivered'], to: 'released',
        when: (order, at) => (dated(order.kind) ? order.state === 'held' && Number.isFinite(time(order.ends_at)) && at >= time(order.ends_at)
            : order.state === 'delivered' && at >= time(order.delivered_at) + SHOP_AUTO_RELEASE_MS) }
});

// One move of an order: `{ ok: true, state }` (the state it reaches) or `{ ok: false, error }`. Pure.
export const shopOrderStep = (order, action, { role, at = Date.now() } = {}) => {
    const move = MOVES[action];
    if (!move) return { ok: false, error: 'shop_order_action_invalid' };
    if (![].concat(move.role).includes(role)) return { ok: false, error: 'shop_order_forbidden' };
    if (!move.from.includes(order?.state)) return { ok: false, error: 'shop_order_state_invalid' };
    if (move.when && !move.when(order, at)) return { ok: false, error: `shop_order_${action}_not_allowed` };
    return { ok: true, state: typeof move.to === 'function' ? move.to(order) : move.to };
};
