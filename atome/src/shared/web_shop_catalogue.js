// The web shops of Boutiques (register R-119, decision Q2 A, list validated on 5 Nov. 2026): a shop of the web is paid on its
// own site, never in eVe. Each entry is kept by us and its cart link tested on the real site before it fills a cart
// (`cart`); untested, it is a reminder and a link (N0). Proofs: temp/achats_recurrents/cart_chain.probe.mjs (Nutri&Co),
// nutripure_cart.probe.mjs (Nutripure), shopify_cart.probe.mjs (Wanimo: one link, three items); Nutrimuscle's Shopify
// link left its cart empty (nutrimuscle_cart.probe.mjs): N0 until it does. Amazon's one-link cart needs Atome's Partners
// tag (`affiliate`), which the company opens (decision Q4): N0 until then. `subscription`: the shop sells its own
// subscription, which eVe follows (decision Q1 B). `delivery_days`: the delivery the shop announces, when read on its site.
// A shop the person adds outside this list is theirs alone: a reminder and a link.
const shop = (id, name, home, categories, extra = {}) => Object.freeze({ id, name, home, categories: Object.freeze(categories), cart: null,
    subscription: false, delivery_days: null, free_shipping_eur: null, affiliate: null, ...extra });

export const WEB_SHOP_CATALOGUE = Object.freeze([
    shop('nutriandco', 'Nutri&Co', 'https://nutriandco.com/fr/', ['supplements'], { cart: 'prestashop', subscription: true, delivery_days: 3, free_shipping_eur: 69 }),
    shop('nutripure', 'Nutripure', 'https://www.nutripure.fr/fr/', ['supplements'], { cart: 'prestashop' }),
    shop('nutrimuscle', 'Nutrimuscle', 'https://www.nutrimuscle.com', ['supplements', 'sport'], { subscription: true }),
    shop('myprotein', 'Myprotein', 'https://fr.myprotein.com', ['supplements', 'sport']),
    shop('amazon', 'Amazon', 'https://www.amazon.fr', ['all'], { subscription: true }),
    shop('cdiscount', 'Cdiscount', 'https://www.cdiscount.com', ['all']),
    shop('carrefour', 'Carrefour', 'https://www.carrefour.fr', ['groceries', 'household']),
    shop('leclerc', 'E.Leclerc', 'https://www.e.leclerc', ['groceries', 'household']),
    shop('auchan', 'Auchan', 'https://www.auchan.fr', ['groceries', 'household']),
    shop('intermarche', 'Intermarché', 'https://www.intermarche.com', ['groceries', 'household']),
    shop('monoprix', 'Monoprix', 'https://www.monoprix.fr', ['groceries', 'household']),
    shop('picard', 'Picard', 'https://www.picard.fr', ['groceries']),
    shop('nespresso', 'Nespresso', 'https://www.nespresso.com/fr/fr', ['coffee'], { subscription: true }),
    shop('zooplus', 'Zooplus', 'https://www.zooplus.fr', ['pets'], { subscription: true }),
    shop('wanimo', 'Wanimo', 'https://www.wanimo.com', ['pets'], { cart: 'shopify' }),
    shop('pharmagdd', 'Pharma GDD', 'https://www.pharma-gdd.com', ['pharmacy']),
    shop('newpharma', 'Newpharma', 'https://www.newpharma.fr', ['pharmacy']),
    shop('cocooncenter', 'Cocooncenter', 'https://www.cocooncenter.com', ['pharmacy', 'beauty']),
    shop('sephora', 'Sephora', 'https://www.sephora.fr', ['beauty']),
    shop('nocibe', 'Nocibé', 'https://www.nocibe.fr', ['beauty']),
    shop('decathlon', 'Decathlon', 'https://www.decathlon.fr', ['sport']),
    shop('boulanger', 'Boulanger', 'https://www.boulanger.com', ['equipment']),
    shop('fnac', 'Fnac', 'https://www.fnac.com', ['equipment']),
    shop('darty', 'Darty', 'https://www.darty.com', ['equipment']),
    shop('leroymerlin', 'Leroy Merlin', 'https://www.leroymerlin.fr', ['home']),
    shop('castorama', 'Castorama', 'https://www.castorama.fr', ['home']),
    shop('manomano', 'ManoMano', 'https://www.manomano.fr', ['home']),
    shop('ikea', 'IKEA', 'https://www.ikea.com/fr/fr/', ['home'])
]);

export const webShopOf = id => WEB_SHOP_CATALOGUE.find(entry => entry.id === id) || null;
const urlOf = (value) => { try { return new URL(value); } catch { return null; } };
const sameSite = (url, home) => url.hostname.replace(/^www\./u, '') === new URL(home).hostname.replace(/^www\./u, '');

/** The shop's own reference of a product read from its page's address (`ref`), or null when it holds none:
 *  PrestaShop `…/<id_product>-slug.html`, Shopify `…/products/<handle>?variant=<id>`, Amazon `…/dp/<ASIN>`. */
export const webShopProductRef = (shopEntry, address) => {
    const url = urlOf(address);
    if (!url || url.protocol !== 'https:' || !shopEntry || !sameSite(url, shopEntry.home)) return null;
    if (shopEntry.cart === 'prestashop') return /\/(\d+)-[^/]+\.html$/u.exec(url.pathname)?.[1] || null;
    if (shopEntry.cart === 'shopify') return /^\d+$/u.test(url.searchParams.get('variant') || '') ? url.searchParams.get('variant') : null;
    if (shopEntry.id === 'amazon') return /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/u.exec(url.pathname)?.[1] || null;
    return null;
};

/** The addresses that fill the shop's cart with `items` ({ ref, quantity }), opened one after the other in one window; null
 *  when the shop has no tested cart link, or an item no reference (then each product's own page is the way). PrestaShop:
 *  its home first (the first add is lost without its session), one add per product, then its cart. */
export const webShopCartLinks = (shopEntry, items) => {
    if (!shopEntry?.cart || !items.length || items.some(item => !item.ref || !Number.isInteger(item.quantity) || item.quantity < 1)) return null;
    const home = shopEntry.home.replace(/\/$/u, '');
    if (shopEntry.cart === 'prestashop') {
        return [shopEntry.home, ...items.map(item => `${home}/panier?add=1&id_product=${encodeURIComponent(item.ref)}&qty=${item.quantity}`), `${home}/panier?action=show`];
    }
    if (shopEntry.cart === 'shopify') return [`${home}/cart/${items.map(item => `${encodeURIComponent(item.ref)}:${item.quantity}`).join(',')}?storefront=true`];
    return null;
};
