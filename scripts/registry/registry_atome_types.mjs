// eVe/registry/generated/atome_types.json — the atome types and their property schemas, generated from their JS owner
// (atome/src/shared/core_atome_types.js, read through #shared/atome_type_gate.js) for the servers that cannot import it:
// Axum (platforms/desktop-tauri/src/server/local_atome_type_gate.rs, compiled in) and Swift
// (platforms/ios/atome-auv3/Common/AiSRuntimeTypeGate.swift, read from the app bundle). They apply the Fastify gate's
// rules with its error codes: an undeclared type is `atome_type_unknown`, an undeclared property `atome_property_unknown`.
import fs from 'node:fs';
import { generatedFile, stable } from './registry_paths.mjs';

export const ATOME_TYPES_FILE = 'atome_types.json';

export async function atomeTypesDocument() {
    const { CORE_ATOME_TYPE_DEFINITIONS } = await import('../../atome/src/shared/core_atome_types.js');
    const gate = await import('../../atome/src/shared/atome_type_gate.js');
    const types = Object.fromEntries(CORE_ATOME_TYPE_DEFINITIONS.map(definition => [definition.type, {
        kind: definition.kind || null,
        allow_unknown_properties: definition.allow_unknown_properties !== false,
        properties: Object.keys(definition.schema).sort(),
        schema: definition.schema
    }]));
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
