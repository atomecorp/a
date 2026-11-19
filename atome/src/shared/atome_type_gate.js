// The one answer to « may this atome type, and these properties, be written? »: a type is known when it is
// declared in CORE_ATOME_TYPE_DEFINITIONS (#shared/core_atome_types.js), and a property when its type's
// schema declares it (`allow_unknown_properties: false`, every type). The server's event commit
// (atome/engines/atome-store/src/type_gate.rs) refuses any other type or property before anything is stored,
// so a typo or an invented type or key never becomes durable truth, nor does a project `set` that would
// create an atome without saying what it is (`assertSetTargetDeclared`). The native servers (Axum, Swift) apply
// the same rules from eVe/registry/generated/atome_types.json, generated from this owner.

import { CORE_ATOME_TYPE_DEFINITIONS, CORE_ATOME_TYPE_IDS } from './core_atome_types.js';
import { AtomeContractError } from './atome_contract_errors.js';
import { RESERVED_PROPERTY_KEYS } from './atome_contract.js';
import { EVENT_META_PROPERTY_KEYS } from './adole_event_contract.js';

export const ATOME_TYPE_UNKNOWN = 'atome_type_unknown';
export const ATOME_PROPERTY_UNKNOWN = 'atome_property_unknown';
export const ATOME_SET_TARGET_MISSING = 'atome_set_target_missing';

// A copy's provenance, carried by the copy of an atome of any type (atome/servers/atome-server/src/social/shop/delivery.rs).
const COPY_PROVENANCE_PROPERTY_KEYS = ['shared_from', 'original_atome_id', 'share_type', 'shop_order_id'];

// Envelope fields carried in a patch (type, parent, owner, deletion, a copy's provenance…): never gated.
export const ATOME_ENVELOPE_PROPERTY_KEYS = Object.freeze([...new Set([...EVENT_META_PROPERTY_KEYS, ...RESERVED_PROPERTY_KEYS,
    ...COPY_PROVENANCE_PROPERTY_KEYS])].sort());

// Kinds that write no new property: a deletion, a restore of stored truth, a snapshot, an ownership transfer.
export const ATOME_UNGATED_EVENT_KINDS = Object.freeze(['delete', 'restore', 'snapshot', 'transfer-owner']);

const KNOWN_ATOME_TYPES = new Set(CORE_ATOME_TYPE_IDS);
const DEFINITIONS = new Map(CORE_ATOME_TYPE_DEFINITIONS.map(definition => [definition.type, definition]));
const ENVELOPE = new Set(ATOME_ENVELOPE_PROPERTY_KEYS);

export const isKnownAtomeType = type => KNOWN_ATOME_TYPES.has(String(type));

const refuse = (code, details) => {
    const error = new AtomeContractError(code, details);
    error.code = code;
    throw error;
};

export function assertKnownAtomeType(type) {
    if (!isKnownAtomeType(type)) refuse(ATOME_TYPE_UNKNOWN, { type: String(type) });
}

// The keys of `patch` the declared `type` does not declare (envelope fields excluded).
export function unknownAtomeProperties(type, patch) {
    const definition = DEFINITIONS.get(String(type));
    if (!definition || definition.allow_unknown_properties !== false || !patch || typeof patch !== 'object') return [];
    return Object.keys(patch).filter(key => !ENVELOPE.has(key) && !Object.hasOwn(definition.schema, key)).sort();
}

export function assertKnownAtomeProperties(type, patch) {
    const keys = unknownAtomeProperties(type, patch);
    if (keys.length) refuse(ATOME_PROPERTY_UNKNOWN, { type: String(type), keys });
}

const declares = value => value !== undefined && value !== null && String(value).trim() !== '';

// A `set` creates its atome only when it says what the atome is: its type, else its kind. A partial
// write (a position, a colour, an order) aimed at an id the store does not hold — a selection gone
// stale, a clip id, a creation still waiting on the device — would otherwise create an atome of
// that fragment alone: a typeless frame in the project, selectable and drawing nothing. The write
// is refused (`atome_set_target_missing`) and nothing is stored; the device's queue tries it again
// once the creation has arrived. Only a write into a project (`projectId`) is held to it: account-global
// records (preferences, profile) and project-less records keep their own rules.
export function assertSetTargetDeclared({ kind, patch, declaredType = null, targetExists = false, projectId = null } = {}) {
    if (targetExists || !declares(projectId) || String(kind || '').toLowerCase() !== 'set') return;
    if (!patch || typeof patch !== 'object') return;
    if (declares(declaredType) || declares(patch.type) || declares(patch.atome_type) || declares(patch.kind)) return;
    refuse(ATOME_SET_TARGET_MISSING, { keys: Object.keys(patch).sort() });
}
