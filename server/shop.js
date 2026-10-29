// The shop's services, assembled once for the server (server/server_services.js): the shared base of sales,
// the orders and their escrow, a sale's private conversations. The clock releases what is due (two days after a
// delivery without dispute, an event or appointment over) every few minutes, and on every orders read.
import { createShopStore } from './shop_store.js';
import { createShopListings } from './shop_listings.js';
import { createShopDelivery } from './shop_delivery.js';
import { createShopOrders } from './shop_orders.js';
import { createShopMessages } from './shop_messages.js';

const TICK_MS = 5 * 60 * 1000;

export function createShop({ query, vaultRouter, syncRuntime, relations, findUserName, notify, broadcast }) {
    const store = createShopStore({ query });
    // A ticket's event over for good (deleted, cancelled, made private) refunds its buyers (user decision Q10).
    const eventOver = (sellerId, listingId) => orders.refundAll(sellerId, listingId);
    const listings = createShopListings({ store, vaultRouter, syncRuntime, relations, findUserName, broadcast, eventOver });
    const orders = createShopOrders({ store, listings, delivery: createShopDelivery({ vaultRouter }), vaultRouter, notify });
    const messages = createShopMessages({ listings, vaultRouter, relations, findUserName, notify });
    const clock = setInterval(() => { orders.tick().catch(error => console.error('[shop] release clock failed', error)); }, TICK_MS);
    clock.unref?.();
    return { listings, orders, messages };
}
