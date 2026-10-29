import { validateParams } from '../ai/agent_gateway_normalize.js';
import { SHOP_COMMENT_MAX_CHARS, SHOP_MAX_PRICE, SHOP_PLACE_KINDS, SHOP_REGISTRATION_MODES, SHOP_SALE_KINDS, SHOP_TITLE_MAX_CHARS }
    from '../../shared/shop_contract.js';
import { BILLING_SIMULATED_METHODS } from '../../shared/billing_contract.js';

// The shop (user decisions of 28 Oct. 2026): one shop per person, many sales in it; everyone browses, an account buys,
// writes to a seller, keeps favourites. One contract for runtime V2, AI discovery and direct MCP calls, run by
// eVe/domains/shop/shop_runtime.js. A sale of the user is their `shop_listing` Atome (`listing_id`, shop.mine gives them);
// a sale found is named by the same `listing_id` (shop.browse gives them); an order by its `order_id` (shop.orders).
// Payment is simulated for now (nothing is charged); the money waits in escrow until the good is received.
export const SHOP_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'AUTH_REQUIRED', 'OWN_LISTING', 'SOLD_OUT', 'NOT_ALLOWED',
    'PRESENTATION_UNAVAILABLE', 'SOURCE_UNAVAILABLE', 'WRITE_FAILED']);
export const SHOP_ORDER_MOVES = Object.freeze(['validate', 'refuse', 'ship', 'handover', 'confirm', 'dispute', 'cancel', 'refund']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const isoDate = { type: 'string', minLength: 10, maxLength: 40, description: 'ISO 8601 date-time' };
const euros = { type: 'number', minimum: 0, maximum: SHOP_MAX_PRICE };
const fields = {
    title: { type: 'string', minLength: 1, maxLength: SHOP_TITLE_MAX_CHARS }, comment: { type: 'string', maxLength: SHOP_COMMENT_MAX_CHARS },
    price_eur: { ...euros, description: 'The price shown: per unit, per day for a rental, per month for a subscription, the minimum for a free price.' },
    creation_ids: { type: 'array', maxItems: 6, items: id, description: 'Photos: creations of Créer (creation.list), cycled on the sale\'s page.' },
    images: { type: 'array', maxItems: 6, items: { type: 'string', pattern: '^data:image/(jpeg|png|webp);base64,', maxLength: 120000 },
        description: 'Photos already laid small (the screens\' import panel).' },
    project_id: { ...id, description: 'A project of the user (projects.list) sold as a copy, or as a template.' },
    content_ids: { type: 'array', maxItems: 200, items: id, description: 'Media of the user read by its buyers (paid content).' },
    quantity: { type: 'integer', minimum: 1, maximum: 9999 }, shipping: { type: 'boolean' }, shipping_cost_eur: euros, handover: { type: 'boolean' },
    deposit_eur: { ...euros, description: 'A rental\'s deposit, held and given back at the return.' }, delivery_date: isoDate,
    duration_minutes: { type: 'integer', minimum: 15, maximum: 1440 }, place_kind: { type: 'string', enum: SHOP_PLACE_KINDS },
    event_id: { ...id, description: 'A public event of the user (events.mine) whose entry is sold.' }, places: { type: 'integer', minimum: 1, maximum: 100000 },
    registration: { type: 'string', enum: SHOP_REGISTRATION_MODES, description: 'auto: accepted until full; validated: the organiser accepts each person, paid then.' }
};
const definitions = {
    browse: [{ query: { type: 'string', maxLength: 80 }, kind: { type: 'string', enum: SHOP_SALE_KINDS }, seller_id: id }, [],
        'The sales of every shop, newest first (narrowed by words, a kind, or one seller\'s shop), with their seller and price.', false, 'read'],
    sell: [{ kind: { type: 'string', enum: SHOP_SALE_KINDS }, ...fields }, ['kind', 'title', 'price_eur'],
        'Nouvelle vente: put a sale in the user\'s shop for everyone (a project, an object, a ticket, a service, a content, a template, a rental, a free price, a pre-order, a subscription). Say back what is sold and its price and wait for the user\'s yes.', true, 'write'],
    update: [{ listing_id: id, ...fields }, ['listing_id'], 'Change a sale of the user (title, comment, price, photos, delivery…).', true, 'write'],
    withdraw: [{ listing_id: id }, ['listing_id'], 'Take a sale of the user out of their shop; whoever paid and waits is refunded.', true, 'write'],
    mine: [{}, [], 'The user\'s sales with their status: live, refused (invalid), hidden (reported).', false, 'read'],
    buy: [{ listing_id: id, method: { type: 'string', enum: BILLING_SIMULATED_METHODS, description: 'How the user pays; none for a free ticket (a registration).' }, delivery: { type: 'string', enum: ['shipping', 'handover'] },
        quantity: fields.quantity, amount_eur: { ...euros, description: 'A free price: the amount the user gives.' }, starts_at: isoDate, ends_at: isoDate },
    ['listing_id'], 'Buy a sale (simulated payment: nothing is charged yet); the money waits in escrow until received. Say back the item and the total and wait for the user\'s yes.', true, 'write'],
    orders: [{ side: { type: 'string', enum: ['buyer', 'seller'] } }, [], 'The user\'s purchases (buyer) or sales made (seller) and where each stands.', false, 'read'],
    order: [{ order_id: id, move: { type: 'string', enum: SHOP_ORDER_MOVES }, tracking: { type: 'string', maxLength: 120 } }, ['order_id', 'move'],
        'Move an order: the seller validates or refuses a registration, ships (with tracking) or hands over; the buyer confirms the reception (the money goes to the seller), disputes, or cancels (a ticket or an appointment until 48 h before).', true, 'write'],
    write: [{ listing_id: id, peer_id: id, text: { type: 'string', minLength: 1, maxLength: 2000 } }, ['listing_id', 'text'],
        'Write about a sale: a buyer to its seller; the seller to one person who wrote (peer_id).', true, 'send'],
    conversation: [{ listing_id: id, peer_id: id }, ['listing_id'], 'Read the conversation about a sale (the seller: with peer_id).', false, 'read'],
    conversations: [{ listing_id: id }, ['listing_id'], 'The seller: everyone who wrote about one sale, each one\'s last message.', false, 'read'],
    report: [{ listing_id: id, reason: { type: 'string', enum: ['spam', 'false', 'offensive', 'forbidden', 'other'] } }, ['listing_id', 'reason'],
        'Report a sale; three reports hide it.', true, 'write'],
    favorite: [{ listing_id: id, favorite: { type: 'boolean' } }, ['listing_id'], 'Keep a sale among the user\'s favourites, or take it out.', true, 'write'],
    favorites: [{}, [], 'The sales the user keeps as favourites.', false, 'read'],
    open: [{ listing_id: id, peer_id: id, order_id: id, seller_id: id, mine: { type: 'boolean' },
        sell: { type: 'boolean', description: 'Nouvelle vente, its card already holding title and content_ids (an instrument of the user and its sounds).' },
        title: fields.title, content_ids: fields.content_ids }, [],
        'Show Boutiques: a sale\'s page (on the conversation with peer_id), a seller\'s shop, the user\'s own shop (mine), every shop, or Nouvelle vente (sell).', false, 'control']
};
const listingSchema = { type: 'object', properties: { listing_id: { type: 'string' }, kind: { type: 'string' }, title: { type: 'string' },
    price_eur: { type: 'number' }, seller: { type: 'string' }, seller_id: { type: 'string' }, status: { type: 'string' }, reason: { type: 'string' } } };
export const SHOP_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `shop.${action}`, action, description, persistent, capability: `shop.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SHOP_ERRORS },
        listing_id: { type: 'string' }, listing: listingSchema, listings: { type: 'array', items: listingSchema }, order: { type: 'object' },
        orders: { type: 'array', items: { type: 'object' } }, messages: { type: 'array', items: { type: 'object' } },
        conversations: { type: 'array', items: { type: 'object' } }, sent: { type: 'boolean' }, favorite: { type: 'boolean' } } }
})));
export const SHOP_CONFIRMED_COMMANDS = Object.freeze(['shop.sell', 'shop.buy', 'shop.withdraw']);
export const validateShopInput = (action, input) => {
    const contract = SHOP_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const SHOP_ASSISTANT_INSTRUCTIONS = 'Boutiques (one shop per person, many sales): « vends mon projet Clip à 9 euros » calls shop.sell kind project with its project_id (projects.list), « je vends mes baskets 45 euros, envoi 6 euros ou en main propre, avec la photo » kind physical with creation_ids, shipping, shipping_cost_eur, handover; a ticket of an event of theirs (events.mine) kind ticket with event_id, places and registration; also service (duration_minutes, place_kind), content (content_ids), template, rental (price per day, deposit_eur), free_price (the minimum), preorder (delivery_date), subscription (per month). Always say back what is sold and its price and wait for the yes before shop.sell. « qu\'est-ce qu\'on vend ? », « cherche des vélos » shop.browse; « montre la boutique de Marie » shop.open with seller_id; « ma boutique » shop.open mine; « mes ventes » shop.mine; « achète-le » shop.buy after saying back the item and the total (payment is simulated, nothing is charged; the money waits until the user confirms the reception); « je l\'ai reçu » shop.order move confirm; « expédié, numéro LP123 » shop.order move ship with tracking; « écris au vendeur » shop.write; « réponds à Thomas » shop.write with peer_id (shop.conversations gives them); « mets-le en favori » shop.favorite. Never invent a listing_id, order_id or peer_id.';
