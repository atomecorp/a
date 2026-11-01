// The one answer to « may this atome type, and these properties, be written? »: a type is known when it is
// declared in CORE_ATOME_TYPE_DEFINITIONS (#shared/core_atome_types.js), and a property when its type's
// schema declares it (`allow_unknown_properties: false`, every type). The server's event commit
// (database/adole_event_log.js#appendEvent) refuses any other type or property before anything is stored,
// so a typo or an invented type or key never becomes durable truth. The native servers (Axum, Swift) apply
// the same rules from eVe/registry/generated/atome_types.json, generated from this owner.

import { CORE_ATOME_TYPE_DEFINITIONS, CORE_ATOME_TYPE_IDS } from './core_atome_types.js';
import { AtomeContractError } from './atome_contract_errors.js';
import { RESERVED_PROPERTY_KEYS } from './atome_contract.js';
import { EVENT_META_PROPERTY_KEYS } from './adole_event_contract.js';

export const ATOME_TYPE_UNKNOWN = 'atome_type_unknown';
export const ATOME_PROPERTY_UNKNOWN = 'atome_property_unknown';

// Envelope fields carried in a patch (type, parent, owner, deletion…): never properties, never gated.
export const ATOME_ENVELOPE_PROPERTY_KEYS = Object.freeze([...new Set([...EVENT_META_PROPERTY_KEYS, ...RESERVED_PROPERTY_KEYS])].sort());

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
