// The shop's shared base (user decisions of 28 Oct. 2026): the sales everyone browses, visitor and guest included.
// The truth is the seller's `shop_listing` Atome in their vault (its `listing` property); this service only
// PROJECTS it into `shop_listings` after every commit that touches it (server/ws_api_commit_effects.js), and writes
// its word back on the Atome (`listing_status`: live, refused with a reason, hidden, sold out). The base can be
// rebuilt from the vaults; nothing a client sends is believed without reading the vault.
import { SHOP_LISTING_TYPE, listingError, normalizeListing, normalizeListingStatus } from '../atome/src/shared/shop_contract.js';
import { normalizePublication, normalizePublicationStatus } from '../atome/src/shared/public_event_contract.js';

const PAGE_SIZE = 25;
const REPORTS_TO_HIDE = 3;
const REPORT_REASONS = Object.freeze(['spam', 'false', 'offensive', 'forbidden', 'other']);
const EVENT_TYPE = 'calendar_event';
// What a commit on a calendar event changes that a ticket follows: its publication, its status, its deletion.
const EVENT_KEYS = Object.freeze(['publication', 'publication_status', 'status', '__deleted']);

const text = (value, max = 500) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};

// `eventOver(sellerId, listingId)`: the event of a ticket is over for good (deleted, cancelled, made private): its buyers are refunded.
export function createShopListings({ store, vaultRouter, syncRuntime = null, relations = null, findUserName = async () => null,
    broadcast = () => {}, eventOver = async () => {}, now = () => Date.now() }) {
    const writeStatus = async (sellerId, listingId, properties, status, reason = null) => {
        const previous = normalizeListingStatus(properties.listing_status);
        if (previous?.status === status && (previous.reason || null) === reason) return;
        const entry = await vaultRouter.commit(sellerId, { kind: 'set', atome_id: listingId,
            payload: { props: { listing_status: JSON.stringify({ status, reason, at: new Date(now()).toISOString() }) } },
            actor: { type: 'user', id: sellerId } }, { source: 'shop' });
        if (entry.inserted) await syncRuntime?.publish?.(entry.event);
    };
    const changed = sellerId => broadcast({ sellerId });

    const leave = async (listingId) => {
        const existing = await store.listing(listingId);
        if (!existing) return;
        await store.remove(listingId);
        changed(String(existing.seller_id));
    };

    // A ticket's event, in its seller's own vault: `live` (public and in the shared base), `over` (deleted, cancelled, made
    // private: for good) or `waiting` (public but not live: refused for now, hidden).
    const ticketEvent = async (sellerId, eventId) => {
        const state = await vaultRouter.getState(sellerId, eventId);
        const properties = state?.properties || {};
        if (!state || String(state.vault_principal_id) !== String(sellerId) || String(state.type || '').toLowerCase() !== EVENT_TYPE
            || properties.__deleted === true || text(properties.status, 20) === 'cancelled'
            || normalizePublication(properties.publication)?.visibility !== 'public') return 'over';
        return normalizePublicationStatus(properties.publication_status)?.status === 'live' ? 'live' : 'waiting';
    };

    // After a commit touching `listingId` (in `sellerId`'s vault): the base follows the Atome.
    const project = async (sellerId, listingId) => {
        const state = await vaultRouter.getState(sellerId, listingId);
        const properties = state?.properties || {};
        if (!state || String(state.type || '').toLowerCase() !== SHOP_LISTING_TYPE || properties.__deleted === true) return leave(listingId);
        const listing = normalizeListing(properties.listing);
        if (!listing || listing.visibility !== 'public') return leave(listingId);
        // The seller's screens read again once the status is written back (`shop-changed`).
        if (listingError(listing)) {
            await leave(listingId);
            await writeStatus(sellerId, listingId, properties, 'refused', 'invalid');
            return changed(sellerId);
        }
        // A ticket sells while its event is live; an event over for good refunds whoever paid, before the sale leaves.
        const event = listing.kind === 'ticket' ? await ticketEvent(sellerId, listing.event_id) : 'live';
        if (event !== 'live') {
            if (event === 'over') await eventOver(sellerId, listingId);
            await leave(listingId);
            await writeStatus(sellerId, listingId, properties, 'refused', 'event');
            return changed(sellerId);
        }
        const existing = await store.listing(listingId);
        if (existing?.hidden_at) return writeStatus(sellerId, listingId, properties, 'hidden', 'reported');
        await store.put({ listingId, sellerId, sellerName: text(await findUserName(sellerId), 80), listing });
        await writeStatus(sellerId, listingId, properties, 'live', null);
        return changed(sellerId);
    };

    // A calendar event changed: the tickets its organiser sells for it follow it.
    const followEvent = async (ownerId, eventId) => {
        const state = await vaultRouter.getState(ownerId, eventId);
        if (state && String(state.type || '').toLowerCase() !== EVENT_TYPE) return;
        const listings = await vaultRouter.listStates(ownerId, { atomeType: SHOP_LISTING_TYPE, limit: 1000 });
        for (const item of listings || []) {
            const listing = normalizeListing(item.properties?.listing);
            if (listing?.kind === 'ticket' && listing.event_id === eventId) await project(ownerId, String(item.atome_id || item.id));
        }
    };

    // The commits of one request: each one carrying a `listing`, or already in the base; each touching an event's publication.
    const afterCommit = async (events = []) => {
        for (const event of events) {
            const atomeId = text(event?.atome_id, 200);
            if (!atomeId) continue;
            const props = event?.payload?.props || event?.payload || {};
            const sale = Object.hasOwn(props, 'listing') || await store.listing(atomeId);
            const eventChange = !sale && (String(event?.kind || '').toLowerCase() === 'delete' || EVENT_KEYS.some(key => Object.hasOwn(props, key)));
            if (!sale && !eventChange) continue;
            const ownerId = await vaultRouter.vaultPrincipalForAtome(atomeId, null);
            if (!ownerId) continue;
            if (sale) await project(String(ownerId), atomeId);
            else await followEvent(String(ownerId), atomeId);
        }
    };

    // A row of the base as the reader receives it: the public fields only.
    const entryOf = (row) => {
        const listing = parse(row.payload_json) || {};
        return { id: row.listing_id, sellerId: String(row.seller_id), seller: text(row.seller_name, 80), kind: listing.kind, title: listing.title,
            comment: listing.comment, images: listing.images || [], price: listing.price, currency: listing.currency,
            delivery: listing.delivery || null, quantity: listing.quantity ?? null, deposit: listing.deposit ?? null,
            deliveryDate: listing.delivery_date || '', durationMinutes: listing.duration_minutes ?? null, placeKind: listing.place_kind || '',
            place: listing.place?.city || listing.place?.label || '', eventId: listing.event_id || '', places: listing.places ?? null,
            registration: listing.registration || '', updatedAt: row.updated_at };
    };
    const blocked = async (viewerId, sellerId) => !!(viewerId && relations && String(viewerId) !== String(sellerId)
        && await relations.blockedEitherWay(viewerId, sellerId));
    const visible = async (rows, viewerId) => {
        const kept = [];
        for (const row of rows) if (!await blocked(viewerId, row.seller_id)) kept.push(entryOf(row));
        return kept;
    };

    // Browsing: the newest sales first, narrowed to a seller's shop, a kind, or words; a page at a time.
    const browse = async ({ sellerId = '', kind = '', query = '', offset = 0, viewerId = null } = {}) => {
        const rows = await store.browse({ sellerId: text(sellerId, 200), kind: text(kind, 40), query: text(query, 80).toLowerCase(),
            limit: PAGE_SIZE + 1, offset: Math.max(0, Math.round(Number(offset)) || 0) }) || [];
        const entries = await visible(rows.slice(0, PAGE_SIZE), viewerId);
        return { entries, next: rows.length > PAGE_SIZE ? String((Number(offset) || 0) + PAGE_SIZE) : '' };
    };
    // One sale by its id (a link, a notification): none when withdrawn, hidden, or of someone the reader blocked.
    const one = async ({ listingId, viewerId = null }) => {
        const row = await store.listing(text(listingId, 200));
        if (!row || row.hidden_at) return { entries: [], next: '' };
        return { entries: await visible([row], viewerId), next: '' };
    };

    // A report by an account (never on their own sale); three distinct ones hide the sale.
    const report = async (viewerId, listingId, reason) => {
        const existing = await store.listing(text(listingId, 200));
        if (!existing) return { ok: false, error: 'shop_not_found' };
        if (String(existing.seller_id) === String(viewerId)) return { ok: false, error: 'shop_own_listing' };
        const total = await store.report(existing.listing_id, String(viewerId), REPORT_REASONS.includes(reason) ? reason : 'other');
        if (total >= REPORTS_TO_HIDE && !existing.hidden_at) {
            await store.hide(existing.listing_id);
            const state = await vaultRouter.getState(String(existing.seller_id), existing.listing_id);
            if (state) await writeStatus(String(existing.seller_id), existing.listing_id, state.properties || {}, 'hidden', 'reported');
            changed(String(existing.seller_id));
        }
        return { ok: true };
    };

    return { project, afterCommit, browse, one, report, read: listingId => store.listing(text(listingId, 200)) };
}
