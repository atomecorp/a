// eVe/registry/generated/atome_types.json — the atome types, their property schemas and the defaults a read
// projection gives every atome of the type (traits, capabilities, policy), generated from their JS owner
// (atome/src/shared/core_atome_types.js, read through #shared/atome_type_gate.js) for the servers that cannot import it:
// atome-store (atome/engines/atome-store/src/type_gate.rs, compiled in), the store of the one local host
// `atome-server::local` that Tauri and the iOS app run. It applies the Fastify gate's
// rules with its error codes: an undeclared type is `atome_type_unknown`, an undeclared property `atome_property_unknown`.
import fs from 'node:fs';
import { generatedFile, stable } from './registry_paths.mjs';

export const ATOME_TYPES_FILE = 'atome_types.json';

export async function atomeTypesDocument() {
    const { CORE_ATOME_TYPE_DEFINITIONS } = await import('../../atome/src/shared/core_atome_types.js');
    const gate = await import('../../atome/src/shared/atome_type_gate.js');
    const { registerAtomeType } = await import('../../atome/src/shared/atome_universal_contract.js');
    const types = Object.fromEntries(CORE_ATOME_TYPE_DEFINITIONS.map((definition) => {
        // The registered form is what `normalizeCanonicalAtome` reads (atome_contract.js).
        const registered = registerAtomeType(definition);
        return [definition.type, {
            kind: definition.kind || null,
            allow_unknown_properties: definition.allow_unknown_properties !== false,
            properties: Object.keys(definition.schema).sort(),
            schema: definition.schema,
            traits: registered.traits,
            default_capabilities: registered.default_capabilities,
            default_policy: registered.default_policy
        }];
    }));
    return stable({
        format: 'atome_types/1',
        owner: 'atome/src/shared/core_atome_types.js',
        errors: { type_unknown: gate.ATOME_TYPE_UNKNOWN, property_unknown: gate.ATOME_PROPERTY_UNKNOWN },
        envelope_keys: gate.ATOME_ENVELOPE_PROPERTY_KEYS,
        ungated_kinds: gate.ATOME_UNGATED_EVENT_KINDS,
        types
    });
}

// One type per line: compact for the bundles, still diff-friendly.
export const atomeTypesText = document => {
    const { types, ...head } = document;
    const lines = Object.entries(types).map(([type, entry]) => `${JSON.stringify(type)}:${JSON.stringify(entry)}`);
    return `${JSON.stringify(head).slice(0, -1)},\n"types":{\n${lines.join(',\n')}\n}}\n`;
};

export const writeAtomeTypes = async () => {
    const text = atomeTypesText(await atomeTypesDocument());
    fs.writeFileSync(generatedFile(ATOME_TYPES_FILE), text);
    return text;
};

// registry:check — the generated file must be what the owner produces now.
export const atomeTypesErrors = async () => {
    const file = generatedFile(ATOME_TYPES_FILE);
    if (!fs.existsSync(file)) return [`atome_types_not_built: eVe/registry/generated/${ATOME_TYPES_FILE} is missing (npm run registry:build)`];
    return fs.readFileSync(file, 'utf8') === atomeTypesText(await atomeTypesDocument())
        ? [] : [`stale_atome_types: atome/src/shared/core_atome_types.js changed since the last build (npm run registry:build)`];
};
