// The shop's /ws/api frames (user decisions of 28 Oct. 2026). `shop-public` is browsing, open to everyone, visitor and
// guest included (`browse`, `one`): the native local servers relay it to Fastify like the other public frames
// (platforms/desktop-tauri/src/server/public_relay.rs, platforms/ios/atome-auv3/Common/FastifySyncPublicRelay.swift).
// `shop` needs an account: buying, an order's moves, writing to a seller, a report. The services are
// server/shop_listings.js, server/shop_orders.js, server/shop_messages.js.
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

const PUBLIC = Object.freeze({
    browse: (shop, data, viewerId) => shop.listings.browse({ sellerId: data.sellerId, kind: data.kind, query: data.query, offset: data.offset, viewerId }),
    one: (shop, data, viewerId) => shop.listings.one({ listingId: data.listingId, viewerId })
});
const ACCOUNT = Object.freeze({
    report: (shop, data, userId) => shop.listings.report(userId, data.listingId, String(data.reason || '')),
    buy: (shop, data, userId) => shop.orders.buy(userId, data.order || {}),
    move: (shop, data, userId) => shop.orders.move(userId, { order_id: data.orderId, action: data.move, tracking: data.tracking }),
    refund_all: (shop, data, userId) => shop.orders.refundAll(userId, data.listingId),
    orders: async (shop, data, userId) => { await shop.orders.tick(); return shop.orders.orders(userId, { side: data.side }); },
    send: (shop, data, userId) => shop.messages.send(userId, { listingId: data.listingId, peerId: data.peerId, message: data.message }),
    thread: (shop, data, userId) => shop.messages.thread(userId, { listingId: data.listingId, peerId: data.peerId, cursor: data.cursor || null }),
    threads: (shop, data, userId) => shop.messages.threads(userId, { listingId: data.listingId })
});

export async function handleWsShop(data, connection) {
    if (data?.type !== 'shop' && data?.type !== 'shop-public') return null;
    const shop = connection?._wsApiShop;
    if (!shop) return wsResponse(data.type, data, false, { error: 'shop_unavailable' });
    const action = String(data.action || ''), userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (data.type === 'shop-public') {
        return Object.hasOwn(PUBLIC, action) ? wsResponse('shop-public', data, true, await PUBLIC[action](shop, data, userId))
            : wsResponse('shop-public', data, false, { error: 'shop_action_invalid' });
    }
    if (!Object.hasOwn(ACCOUNT, action)) return wsResponse('shop', data, false, { error: 'shop_action_invalid' });
    if (!userId || !await isWsApiPrincipalProvisioned(userId)) return wsResponse('shop', data, false, { error: 'shop_auth_required' });
    const result = await ACCOUNT[action](shop, data, userId);
    return wsResponse('shop', data, result.ok !== false, result);
}
