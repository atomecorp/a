import { logStructured } from './server_logger.js';
import { assessFoodHealth, readAdditiveRisks } from '../atome/src/shared/food_health_assessment.js';

// Public Open Food Facts provider (`food-facts` on /ws/api, no account):
//   lookup {barcode, source?}        → { product }
//   search {query, source?, limit?}  → { products }
//   alternatives {barcode}           → { product, alternatives }
// Sources: off = Open Food Facts, obf = Open Beauty Facts, opf = Open Products
// Facts. OFF requires an identifying User-Agent (OPEN_FOOD_FACTS_USER_AGENT)
// and caps clients at 100 product reads and 10 searches per minute: this
// server stays below with its own per-address and global windows, and keeps
// products, searches and the additives taxonomy in memory for their lifetime
// so repeated questions never reach OFF again. Data licence: ODbL.

const PRODUCT_HOSTS = Object.freeze({
  off: 'https://world.openfoodfacts.org',
  obf: 'https://world.openbeautyfacts.org',
  opf: 'https://world.openproductsfacts.org'
});
const FOOD_SEARCH_ENDPOINT = 'https://search.openfoodfacts.org/search';
const ADDITIVES_TAXONOMY = 'https://static.openfoodfacts.org/data/taxonomies/additives.json';
const PRODUCT_FIELDS = ['code', 'product_name', 'brands', 'quantity', 'image_url', 'nutriscore_grade', 'nova_group',
  'ecoscore_grade', 'additives_tags', 'allergens_tags', 'nutriments', 'categories_tags'].join(',');
const WINDOW_MS = 60_000;
const LIMITS = Object.freeze({ read: { address: 30, global: 80 }, search: { address: 5, global: 8 } });
const PRODUCT_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 30 * 60 * 1000;
const TAXONOMY_TTL_MS = 24 * 60 * 60 * 1000;
const TAXONOMY_RETRY_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;
const ALTERNATIVE_COUNT = 3;
// The product page and the search index tag categories slightly differently;
// the most specific category and its two parents are searched in one query,
// and candidates matching the most specific one rank first.
const ALTERNATIVE_DEPTH = 3;
const ALTERNATIVE_POOL = 50;
const BARCODE = /^\d{8,14}$/;
const CANONICAL_CATEGORY = /^en:[a-z0-9-]+$/;
const NUTRISCORE_GRADES = 'abcde';
const ERROR_CODES = new Set(['INVALID_ARGUMENT', 'NOT_CONFIGURED', 'RATE_LIMITED', 'PRODUCT_NOT_FOUND', 'PROVIDER_UNAVAILABLE']);

const reply = (requestId, fields) => ({
  type: 'food-facts-response', requestId, request_id: requestId,
  success: fields.ok === true, ...fields
});
const failure = (code, cause = code) => Object.assign(new Error(cause), { code });

const grade = (value) => {
  const letter = String(value || '').toLowerCase();
  return NUTRISCORE_GRADES.includes(letter) && letter.length === 1 ? letter : null;
};
const amount = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const tags = (value) => (Array.isArray(value) ? value.map(String) : []);
const firstBrand = (brands) => String((Array.isArray(brands) ? brands : String(brands || '').split(','))[0] || '').trim();

export const normalizeFoodProduct = (raw, source, additiveRisks) => {
  const nutriments = raw?.nutriments || {};
  const product = {
    barcode: String(raw?.code || ''), source,
    name: String(raw?.product_name || ''), brand: firstBrand(raw?.brands), quantity: String(raw?.quantity || ''),
    image_url: String(raw?.image_url || ''),
    nutriscore: grade(raw?.nutriscore_grade),
    nova: [1, 2, 3, 4].includes(Number(raw?.nova_group)) ? Number(raw.nova_group) : null,
    green_score: grade(raw?.ecoscore_grade),
    additives: tags(raw?.additives_tags).map((tag) => ({ tag, risk: additiveRisks.get(tag) || null })),
    allergens: tags(raw?.allergens_tags),
    nutriments_100g: {
      energy_kcal: amount(nutriments['energy-kcal_100g']), fat: amount(nutriments.fat_100g),
      saturated_fat: amount(nutriments['saturated-fat_100g']), sugars: amount(nutriments.sugars_100g),
      salt: amount(nutriments.salt_100g), fiber: amount(nutriments.fiber_100g), proteins: amount(nutriments.proteins_100g)
    },
    categories_tags: tags(raw?.categories_tags)
  };
  return { ...product, verdict: assessFoodHealth(product, additiveRisks) };
};

const createTtlCache = (ttl, now) => {
  const entries = new Map();
  return {
    get: (key) => {
      const entry = entries.get(key);
      return entry && now() - entry.at < ttl ? entry.value : undefined;
    },
    set: (key, value) => {
      if (entries.size >= MAX_CACHE_ENTRIES) entries.clear();
      entries.set(key, { value, at: now() });
    }
  };
};

const createRateWindows = (now) => {
  const windows = { read: { global: [], byAddress: new Map() }, search: { global: [], byAddress: new Map() } };
  const recent = (times) => times.filter((at) => now() - at < WINDOW_MS);
  return (kind, address) => {
    const state = windows[kind];
    const key = String(address || 'unknown');
    state.global = recent(state.global);
    const own = recent(state.byAddress.get(key) || []);
    if (state.global.length >= LIMITS[kind].global || own.length >= LIMITS[kind].address) throw failure('RATE_LIMITED');
    state.global.push(now());
    own.push(now());
    state.byAddress.set(key, own);
    if (state.byAddress.size > 10000) {
      for (const [entry, times] of state.byAddress) if (!recent(times).length) state.byAddress.delete(entry);
    }
  };
};

export const createOpenFoodFactsHandler = ({
  userAgent = () => process.env.OPEN_FOOD_FACTS_USER_AGENT,
  fetchResource = fetch,
  now = Date.now,
  log = logStructured
} = {}) => {
  const products = createTtlCache(PRODUCT_TTL_MS, now);
  const searches = createTtlCache(SEARCH_TTL_MS, now);
  const consume = createRateWindows(now);
  const taxonomy = { risks: null, at: 0, loading: null, retryAt: 0 };

  const request = async (url, agent) => {
    const response = await fetchResource(url, {
      headers: { 'user-agent': agent, accept: 'application/json' }, signal: AbortSignal.timeout(8000)
    });
    if (response.status === 429) throw failure('RATE_LIMITED', 'upstream_429');
    return response;
  };
  const json = async (url, agent) => {
    const response = await request(url, agent);
    if (!response.ok) throw failure('PROVIDER_UNAVAILABLE', `upstream_status_${response.status}`);
    return response.json();
  };

  const additiveRisks = async (agent) => {
    if (taxonomy.risks && now() - taxonomy.at < TAXONOMY_TTL_MS) return taxonomy.risks;
    if (!taxonomy.loading) {
      if (now() < taxonomy.retryAt) throw failure('PROVIDER_UNAVAILABLE', 'additives_taxonomy_retry_pending');
      taxonomy.loading = json(ADDITIVES_TAXONOMY, agent)
        .then((data) => Object.assign(taxonomy, { risks: readAdditiveRisks(data), at: now() }).risks)
        .catch((error) => { taxonomy.retryAt = now() + TAXONOMY_RETRY_MS; throw error; })
        .finally(() => { taxonomy.loading = null; });
    }
    return taxonomy.loading;
  };

  const lookup = async (barcode, source, address, agent) => {
    const key = `${source}:${barcode}`;
    const cached = products.get(key);
    if (cached) return cached;
    const risks = await additiveRisks(agent);
    consume('read', address);
    const response = await request(`${PRODUCT_HOSTS[source]}/api/v2/product/${barcode}?fields=${PRODUCT_FIELDS}`, agent);
    if (response.status === 404) throw failure('PRODUCT_NOT_FOUND');
    if (!response.ok) throw failure('PROVIDER_UNAVAILABLE', `upstream_status_${response.status}`);
    const payload = await response.json();
    if (payload?.status !== 1 || !payload.product) throw failure('PRODUCT_NOT_FOUND');
    const product = normalizeFoodProduct({ ...payload.product, code: payload.product.code || barcode }, source, risks);
    products.set(key, product);
    return product;
  };

  const search = async (url, listOf, source, address, agent) => {
    const cached = searches.get(url);
    if (cached) return cached;
    const risks = await additiveRisks(agent);
    consume('search', address);
    const found = listOf(await json(url, agent))
      .filter((raw) => BARCODE.test(String(raw?.code || '')))
      .map((raw) => normalizeFoodProduct(raw, source, risks));
    searches.set(url, found);
    return found;
  };

  const searchByText = (query, source, limit, address, agent) => {
    if (source === 'off') {
      // The search index reads Lucene syntax; a shopper's words are plain text.
      const params = new URLSearchParams({ q: query.replace(/[:"()[\]{}^~*?\\/!+&|-]+/g, ' ').replace(/\s+/g, ' ').trim(),
        page_size: String(limit), fields: PRODUCT_FIELDS });
      return search(`${FOOD_SEARCH_ENDPOINT}?${params}`, (payload) => payload?.hits || [], source, address, agent);
    }
    const params = new URLSearchParams({ search_terms: query, json: '1', page_size: String(limit), fields: PRODUCT_FIELDS });
    return search(`${PRODUCT_HOSTS[source]}/cgi/search.pl?${params}`, (payload) => payload?.products || [], source, address, agent);
  };

  const alternatives = async (barcode, address, agent) => {
    const product = await lookup(barcode, 'off', address, agent);
    const categories = product.categories_tags.filter((tag) => CANONICAL_CATEGORY.test(tag)).slice(-ALTERNATIVE_DEPTH).reverse();
    const ceiling = product.nutriscore ? NUTRISCORE_GRADES.indexOf(product.nutriscore) : 3;
    const grades = [...'abc'].filter((letter) => NUTRISCORE_GRADES.indexOf(letter) < ceiling);
    if (!categories.length || !grades.length) return { product, alternatives: [] };
    const params = new URLSearchParams({
      q: `categories_tags:(${categories.map((tag) => `"${tag}"`).join(' OR ')}) AND nutriscore_grade:(${grades.join(' OR ')})`,
      sort_by: 'nutriscore_grade', page_size: String(ALTERNATIVE_POOL), fields: PRODUCT_FIELDS
    });
    const candidates = await search(`${FOOD_SEARCH_ENDPOINT}?${params}`, (payload) => payload?.hits || [], 'off', address, agent);
    const ranked = candidates
      .filter((candidate) => candidate.barcode !== barcode && candidate.verdict === 'good' && candidate.nutriscore)
      .map((candidate) => ({ candidate, depth: categories.findIndex((tag) => candidate.categories_tags.includes(tag)) }))
      .filter(({ depth }) => depth >= 0)
      .sort((a, b) => a.depth - b.depth
        || NUTRISCORE_GRADES.indexOf(a.candidate.nutriscore) - NUTRISCORE_GRADES.indexOf(b.candidate.nutriscore)
        || a.candidate.barcode.localeCompare(b.candidate.barcode));
    return { product, alternatives: ranked.slice(0, ALTERNATIVE_COUNT).map(({ candidate }) => candidate) };
  };

  return async (message, address) => {
    if (message?.type !== 'food-facts') return null;
    const requestId = message.requestId || message.request_id || null;
    const action = String(message.action || '');
    const barcode = String(message.barcode || '').trim();
    const query = String(message.query || '').trim();
    const source = message.source === undefined ? 'off' : String(message.source);
    const limit = message.limit === undefined ? DEFAULT_LIMIT : Number(message.limit);
    const valid = action === 'lookup' ? BARCODE.test(barcode) && !!PRODUCT_HOSTS[source]
      : action === 'search' ? !!query && query.length <= 120 && !!PRODUCT_HOSTS[source]
        && Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT
        : action === 'alternatives' && BARCODE.test(barcode);
    if (!valid) return reply(requestId, { ok: false, error: 'INVALID_ARGUMENT' });
    const agent = String(userAgent() || '').trim();
    if (!agent) {
      log('warn', { component: 'open_food_facts', request_id: requestId, message: 'NOT_CONFIGURED',
        data: { missing: 'OPEN_FOOD_FACTS_USER_AGENT' } });
      return reply(requestId, { ok: false, error: 'NOT_CONFIGURED' });
    }
    try {
      if (action === 'lookup') return reply(requestId, { ok: true, product: await lookup(barcode, source, address, agent) });
      if (action === 'search') return reply(requestId, { ok: true, products: await searchByText(query, source, limit, address, agent) });
      return reply(requestId, { ok: true, ...await alternatives(barcode, address, agent) });
    } catch (error) {
      const code = ERROR_CODES.has(error?.code) ? error.code : 'PROVIDER_UNAVAILABLE';
      if (code === 'PROVIDER_UNAVAILABLE' || error?.message === 'upstream_429') {
        // The client only receives a stable code; the real cause stays in the server log.
        log('warn', { component: 'open_food_facts', request_id: requestId, message: code, data: {
          action, exception: String(error?.name || 'Error'), cause: String(error?.message || error).slice(0, 300) } });
      }
      return reply(requestId, { ok: false, error: code });
    }
  };
};

export const handleWsOpenFoodFacts = createOpenFoodFactsHandler();
