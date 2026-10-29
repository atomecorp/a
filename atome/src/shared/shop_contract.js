// The shop (user decisions of 28 Oct. 2026): one shop per person, many sales in it. A sale is its seller's
// `shop_listing` Atome; `listing` (written by the seller's devices) says what the public reads of it,
// `listing_status` (written by the server only) whether it is live. The server projects every live listing
// into the shared base everyone browses, visitor and guest included (server/shop_listings.js); buying,
// writing to the seller and a favourite need an account. One owner for the listing's shape, the price split
// and the escrow's rules, client and server.
import { normalizePlace, PUBLIC_EVENT_POSTER_MAX_CHARS } from './public_event_contract.js';

export const SHOP_LISTING_TYPE = 'shop_listing';
// What a sale can be; what the buyer receives differs, the page and the conversations do not.
export const SHOP_SALE_KINDS = Object.freeze(['project', 'physical', 'ticket', 'service', 'content', 'template', 'rental',
    'free_price', 'preorder', 'subscription']);
// The sales whose good is digital (what Apple's in-app purchase will govern once payment is real).
export const SHOP_DIGITAL_KINDS = Object.freeze(['project', 'content', 'template', 'subscription']);
export const SHOP_LISTING_STATUSES = Object.freeze(['live', 'refused', 'hidden', 'sold_out']);
// `event`: a ticket whose event is not live (refused, hidden, cancelled, deleted, made private).
export const SHOP_LISTING_REASONS = Object.freeze(['invalid', 'quota', 'suspended', 'reported', 'event']);
// Atome's share of every sale, taken from the seller (the buyer pays the price shown).
export const SHOP_COMMISSION_RATE = 0.03;
export const SHOP_TITLE_MAX_CHARS = 80;
export const SHOP_COMMENT_MAX_CHARS = 600;
// The photos are small pictures carried by the listing itself (JPEG data URLs, the poster's size), cycled by a sideways drag.
export const SHOP_MAX_IMAGES = 6;
export const SHOP_MAX_PRICE = 100_000;
export const SHOP_PLACE_KINDS = Object.freeze(['seller', 'buyer', 'visio']);
export const SHOP_REGISTRATION_MODES = Object.freeze(['auto', 'validated']);

const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
const object = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
// A sum in euros, to the cent, within [min, SHOP_MAX_PRICE]; anything else is null.
export const shopAmount = (value, min = 0.01) => {
    const amount = Math.round(Number(value) * 100) / 100;
    return Number.isFinite(amount) && amount >= min && amount <= SHOP_MAX_PRICE ? amount : null;
};
const whole = (value, min, max) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
};
const isoDate = (value) => {
    const time = new Date(text(value, 40)).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : '';
};
const image = value => (typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    && value.length <= PUBLIC_EVENT_POSTER_MAX_CHARS ? value : '');

// What each kind adds to the common fields (title, comment, images, price).
const KIND_FIELDS = Object.freeze({
    project: source => ({ project_id: text(source.project_id) }),
    template: source => ({ project_id: text(source.project_id) }),
    content: source => ({ content_ids: [...new Set((Array.isArray(source.content_ids) ? source.content_ids : []).map(id => text(id)).filter(Boolean))].slice(0, 200) }),
    physical: source => ({ quantity: whole(source.quantity, 1, 9999) ?? 1, delivery: normalizeDelivery(source.delivery) }),
    preorder: source => ({ quantity: whole(source.quantity, 1, 9999) ?? 1, delivery: normalizeDelivery(source.delivery), delivery_date: isoDate(source.delivery_date) }),
    rental: source => ({ delivery: normalizeDelivery(source.delivery), deposit: shopAmount(source.deposit, 0) ?? 0 }),
    ticket: source => ({ event_id: text(source.event_id), places: whole(source.places, 1, 100_000) ?? 1,
        registration: SHOP_REGISTRATION_MODES.includes(source.registration) ? source.registration : 'auto' }),
    service: source => ({ duration_minutes: whole(source.duration_minutes, 15, 24 * 60) ?? 60,
        place_kind: SHOP_PLACE_KINDS.includes(source.place_kind) ? source.place_kind : 'seller' }),
    free_price: () => ({}),
    subscription: () => ({})
});
// How a physical good reaches its buyer, chosen by the seller per listing: shipping at the seller's cost, a hand-over, or both.
const normalizeDelivery = (value) => {
    const source = object(value);
    const shipping = source.shipping === true, handover = source.handover === true || !shipping;
    return { shipping, shipping_cost: shipping ? shopAmount(source.shipping_cost, 0) ?? 0 : 0, handover };
};

// The listing as stored (`listing` property, JSON): what the seller chose, never a status. `price` is the price shown:
// per unit, per day (rental), per month (subscription), the minimum (free price, 0 allowed); a ticket may be free (a registration).
export const normalizeListing = (value) => {
    const source = object(parse(value));
    const kind = SHOP_SALE_KINDS.includes(source.kind) ? source.kind : null;
    if (!kind) return null;
    const images = (Array.isArray(source.images) ? source.images : []).map(image).filter(Boolean).slice(0, SHOP_MAX_IMAGES);
    return { kind, visibility: source.visibility === 'public' ? 'public' : 'private', title: text(source.title, SHOP_TITLE_MAX_CHARS),
        comment: text(source.comment, SHOP_COMMENT_MAX_CHARS), images, price: shopAmount(source.price, kind === 'free_price' || kind === 'ticket' ? 0 : 0.01),
        currency: 'EUR', place: normalizePlace(source.place), ...KIND_FIELDS[kind](object(source)) };
};

// The server's word on a listing (`listing_status` property, JSON).
export const normalizeListingStatus = (value) => {
    const source = object(parse(value));
    const status = SHOP_LISTING_STATUSES.includes(source.status) ? source.status : null;
    return status ? { status, reason: SHOP_LISTING_REASONS.includes(source.reason) ? source.reason : null, at: text(source.at, 40) } : null;
};

// What keeps a public listing from going live, the first one found: its error code.
export const listingError = (listing) => {
    if (!listing || listing.visibility !== 'public') return null;
    if (!listing.title) return 'shop_title_required';
    if (listing.price == null) return 'shop_price_required';
    if (!listing.images.length && listing.kind !== 'ticket') return 'shop_image_required';
    if ((listing.kind === 'project' || listing.kind === 'template') && !listing.project_id) return 'shop_project_required';
    if (listing.kind === 'content' && !listing.content_ids.length) return 'shop_content_required';
    if (listing.kind === 'ticket' && !listing.event_id) return 'shop_event_required';
    if (listing.kind === 'preorder' && !listing.delivery_date) return 'shop_delivery_date_required';
    return null;
};

// A sale's money: what the buyer pays, Atome's 3 %, what the seller receives — in cents, so no rounding drifts.
export const shopSplit = (amount) => {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 0) return null;
    const commission = Math.round(cents * SHOP_COMMISSION_RATE);
    return { amount: cents / 100, commission: commission / 100, net: (cents - commission) / 100 };
};
