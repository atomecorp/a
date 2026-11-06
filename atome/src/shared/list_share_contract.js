// Every list of eVe, seen as one list to send (register R-115 « Partage », cahier D25; validated mockups
// temp/d18_plan/share_mockups/out/ s1–s7): a list ROOT, its kind, its name, the person it is kept for, and its entries —
// each existing model read as it is, never copied into a parallel one:
// - `item_list` (this contract): a named list of atomes lying under it (their event `parent_id`, mirrored in `list_root`):
//   Médicaments, Compléments, « Traitement de maman » kept for a third party (`for_person`), any list of atomes. An
//   assistant's draft (S7) carries its lines inline (`entries`, `draft`) until the person validates it;
// - `media_list` (#shared/media_list_contract.js): a playlist, its `entries` inline;
// - `shopping_list` (#shared/shopping_list_contract.js): a basket, its `shopping_item` children;
// - `protocol_template` (#shared/health_protocol_contract.js): its ticked `lines`, its own `version`;
// - a programme (`project` holding `project_program`): its plan only — its sessions and measures stay their maker's.
// The server (server/sync_share_lists.js) reads the same view to show a list before it is accepted, to copy the version the
// recipient validates into their own account and to tell a new version from the one running; the app lays it (S2, S5, S6).
// `list_receipt`: the recipient's own trace of a list received (the version validated, its copies, linked or detached).

export const ITEM_LIST_ATOME_TYPE = 'item_list';
export const LIST_RECEIPT_ATOME_TYPE = 'list_receipt';
export const LIST_KINDS = Object.freeze(['medications', 'supplements', 'playlist', 'shopping', 'programme', 'protocol', 'atome_list']);
// The kinds an `item_list` root names; the other kinds are their domain's own root.
export const ITEM_LIST_KINDS = Object.freeze(['medications', 'supplements', 'atome_list']);
export const LIST_RECEIPT_STATES = Object.freeze(['linked', 'detached']);
export const LIST_NAME_MAX = 80;
export const LIST_ENTRIES_MAX = 500;

const S = Object.freeze({ type: 'string' }), N = Object.freeze({ type: 'number' }), B = Object.freeze({ type: 'boolean' });
const PERSON_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['name'], properties: {
    contact_id: { type: 'string', maxLength: 200 }, account_id: { type: 'string', maxLength: 200 }, name: { type: 'string', minLength: 1, maxLength: 120 } } });
const ENTRY_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['key', 'label'], properties: {
    key: { type: 'string', minLength: 1, maxLength: 400 }, label: { type: 'string', minLength: 1, maxLength: 400 }, data: { type: 'object' } } });
export const LIST_ENTRY_SCHEMA = ENTRY_SCHEMA;

// What a sealed list's recipient may read of anything under its root (the share's readable properties): its root's seal
// and kind, never a property of an atome under it (a medication's name, a doctor's tip), which travels inside the seal only.
export const SEALED_LIST_READABLE = Object.freeze(['type', 'list_kind', 'for_person', 'sealed', 'sealed_digest', 'access', 'visibility']);
export const ITEM_LIST_TYPE = Object.freeze({ type: ITEM_LIST_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: LIST_NAME_MAX }, list_kind: { type: 'string', enum: ITEM_LIST_KINDS },
    // The person it is kept for (« Pour un tiers », S3/S4): absent, the list is its owner's own.
    for_person: PERSON_SCHEMA,
    // An assistant's draft (S7): its lines inline, waiting for the person's validation, her words and the picture they came from.
    draft: B, entries: { type: 'array', maxItems: LIST_ENTRIES_MAX, items: ENTRY_SCHEMA }, draft_from: S, draft_note: { type: 'string', maxLength: 1000 },
    photo_atome_id: S,
    // A health list as it leaves (eVe/domains/sharing/list_share_sealed.js): its lines sealed for its author and each recipient
    // (#shared/share_key_contract.js#validateSealedBox), and a keyed name of them telling one version from the next.
    sealed: { type: 'object' }, sealed_digest: S,
    created_at: S, access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } } });
export const LIST_RECEIPT_TYPE = Object.freeze({ type: LIST_RECEIPT_ATOME_TYPE, kind: 'data_model', traits: ['data'], schema: {
    share_id: S, source_id: S, sender_id: S, list_kind: { type: 'string', enum: LIST_KINDS }, name: S,
    status: { type: 'string', enum: LIST_RECEIPT_STATES }, accepted_version: N, refused_version: N, announced_version: N,
    entries: { type: 'array', maxItems: LIST_ENTRIES_MAX, items: ENTRY_SCHEMA },
    // Source atome id → its copy in the recipient's account.
    copies: { type: 'object' }, updated_at: S, access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } } });

const propsOf = state => state?.properties || state?.particles || {};
const typeOf = state => String(state?.type || state?.atome_type || propsOf(state).type || '');
export const listStateId = state => String(state?.atome_id || state?.atomeId || state?.id || '');
export const listStateParent = state => String(state?.meta?.parent_id || state?.parent_id || propsOf(state).parent_id || propsOf(state).list_root || '');
const live = state => state && !state.deleted && !state.deleted_at && !state.meta?.deleted_at && state.kind !== 'delete';
const text = value => (typeof value === 'string' ? value.trim() : '');

// The list kind of a root, or null when the atome is no list.
export const listKindOf = (root) => {
    const type = typeOf(root), props = propsOf(root);
    if (type === ITEM_LIST_ATOME_TYPE) return ITEM_LIST_KINDS.includes(props.list_kind) ? props.list_kind : null;
    if (type === 'media_list') return 'playlist';
    if (type === 'shopping_list') return 'shopping';
    if (type === 'protocol_template') return 'protocol';
    if (type === 'project' && props.project_program && typeof props.project_program === 'object') return 'programme';
    return null;
};

const productEntry = (state) => {
    const product = propsOf(state).health_product || {};
    return { key: listStateId(state), label: text(product.name) || listStateId(state), data: { item_kind: product.item_kind || '', form: product.form || '',
        per_intake: product.per_intake || null, hours: Array.isArray(product.hours) ? product.hours : [], status: product.status || '' } };
};
const childEntry = (state) => {
    if (typeOf(state) === 'health_product') return productEntry(state);
    const props = propsOf(state);
    if (typeOf(state) === 'shopping_item') return { key: listStateId(state), label: text(props.label) || listStateId(state),
        data: { category: props.category || '', quantity: props.quantity || null } };
    return { key: listStateId(state), label: text(props.name) || text(props.label) || text(props.title) || listStateId(state), data: { type: typeOf(state) } };
};
const childrenOf = (rootId, states) => states.filter(state => live(state) && listStateId(state) !== rootId && listStateParent(state) === rootId)
    .filter(state => typeOf(state) !== 'health_product' || propsOf(state).health_product?.status !== 'declared_historical');
const programEntries = (program) => {
    const actions = (program.accepted?.actions || program.actions || []).map(action => ({ key: `action:${action.key}`, label: text(action.title) || action.key,
        data: { tool: action.tool || '', start: action.start || '', end: action.end || '' } }));
    const bricks = (program.bricks || []).map(brick => ({ key: `brick:${brick}`, label: brick, data: { brick } }));
    return [...bricks, ...actions];
};

/**
 * The list a root holds, from the root and the states around it (its descendants, as a share's stream or the owner's
 * vault reads them): `{ kind, name, version, for_person, draft, entries: [{ key, label, data }] }`; null for no list.
 * `version`: the root's own (a protocol template's) or null — a list without one counts its versions by what changed.
 */
export const listViewOf = (root, states = []) => {
    const kind = listKindOf(root);
    if (!kind) return null;
    const props = propsOf(root), id = listStateId(root);
    const base = { kind, root_id: id, version: Number.isInteger(props.version) && props.version > 0 ? props.version : null };
    if (kind === 'playlist') return { ...base, name: text(props.name), entries: (props.entries || []).map(entry => ({ key: String(entry.id), label: text(entry.label) || String(entry.id),
        data: { media: entry.media || '', detail: entry.detail || '', duration: Number(entry.duration) || 0 } })) };
    if (kind === 'protocol') return { ...base, name: text(props.title), entries: (props.lines || []).filter(line => line.include)
        .map(line => ({ key: String(line.ref), label: text(line.label) || String(line.ref), data: { section: line.section || '' } })) };
    if (kind === 'programme') return { ...base, name: text(props.name) || text(props.project_program.definition?.name) || id, entries: programEntries(props.project_program) };
    if (kind === 'shopping') return { ...base, name: text(props.name), entries: childrenOf(id, states).map(childEntry) };
    // A sealed list shows its server and its stream one line only, the keyed name of its lines: only its recipients open them.
    if (props.sealed) return { ...base, name: text(props.name), for_person: props.for_person || null, draft: false, sealed: props.sealed,
        entries: [{ key: 'sealed', label: String(props.sealed_digest) }] };
    const entries = props.draft === true ? (props.entries || []) : childrenOf(id, states).map(childEntry);
    return { ...base, name: text(props.name), for_person: props.for_person || null, draft: props.draft === true, entries };
};

const signature = entry => JSON.stringify([entry.label, entry.data || {}]);
export const sameListEntries = (a = [], b = []) => a.length === b.length && a.every((entry, index) => entry.key === b[index].key && signature(entry) === signature(b[index]));
/**
 * The version a recipient is offered: the root's own, else the one they validated, plus one when the list changed since.
 * `receipt`: their `list_receipt` properties (null before any validation).
 */
export const listVersionOf = (view, receipt) => {
    if (view.version) return view.version;
    if (!receipt) return 1;
    return sameListEntries(receipt.entries || [], view.entries) ? receipt.accepted_version : receipt.accepted_version + 1;
};
/** The entries of `current` against those validated (S6): each `changed` (its line marked) with what it was, `added`, and the ones `removed`. */
export const listDiff = (accepted = [], current = []) => {
    const before = new Map(accepted.map(entry => [entry.key, entry]));
    const now = new Set(current.map(entry => entry.key));
    return { entries: current.map((entry) => {
        const previous = before.get(entry.key);
        if (!previous) return { ...entry, added: true };
        return signature(previous) === signature(entry) ? entry : { ...entry, changed: true, before: previous };
    }), removed: accepted.filter(entry => !now.has(entry.key)) };
};

// A copy's own id in the recipient's account, by its domain's id rule; `fresh`: a new unique part.
export const listCopyIdOf = (state, recipient, fresh) => {
    const type = typeOf(state);
    if (type === 'health_product') return `health_product:${encodeURIComponent(recipient)}:${fresh}`;
    if (type === 'shopping_list') return `shopping_list_${recipient}`;
    if (type === 'protocol_template') return `protocol_template:${recipient}:${fresh}`;
    return `${type}_${fresh}`;
};
/**
 * The properties a copy keeps in the recipient's account: the source's, minus what only means something in the sender's
 * (a product's reminders in their calendar, a programme's acceptance and sessions); `fresh` as in listCopyIdOf; `root`: the
 * copied list's `{ copy_id, for_person }` (its person as the recipient keeps it).
 */
export const listCopyPropsOf = (state, { fresh, recipient, root = null }) => {
    const props = { ...propsOf(state) };
    // A media list's `revision` counts its own writes (its particle's version): a copy keeps its own count.
    for (const key of ['owner_id', 'type', 'parent_id', 'list_root', 'list_link', 'detached_from', 'detached_share_id', 'revision']) delete props[key];
    const type = typeOf(state);
    // A product joins the recipient's own medications or supplements, or the copied list when it is kept for a third party.
    if (type === 'health_product') return { ...props, product_id: fresh, health_product: { ...props.health_product, reminder: false, calendar: [],
        list_id: root?.for_person ? root.copy_id : null, person_id: '' } };
    if (type === 'project' && props.project_program) return { ...props, project_program: { ...props.project_program, status: 'draft', accepted: null } };
    if (type === ITEM_LIST_ATOME_TYPE && props.for_person?.account_id === recipient) delete props.for_person;
    return props;
};
