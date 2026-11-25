// The records of R-104 D8, private to their owner:
// - `mcp_program_grant`: one program the person accepted by its number and the families it may use
//   (#squirrel/atome/mcp_surface_grants.js; Réglages › Mon matériel › Programmes);
// - `objective_visibility`: whether others may find the person for one objective, and what they then see
//   (eVe/domains/objectives/objective_network_runtime.js; the « Visib. » switch and its panel);
// - `objective_network`: the person's whole objectives network on or off (Réglages › Confidentialité);
// - `script_trust`: one document script the person enabled, by the digest of the source they saw
//   (eVe/domains/script/script_commands.js): a script runs only for whoever enabled that very source.
// The server projects only what a lit « Visib. » shows into the objectives network (atome/servers/atome-server/src/social/objective_network.rs).
// `owner_only`: only their owner ever writes them, never a co-editor through a share (a create under a shared document
// lands in its owner's vault, owned by them: a forged trust or grant would be theirs; vault_router/owner_only.rs).
const PRIVATE = Object.freeze({ access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] },
    source_domain: { type: 'string', maxLength: 80 } });
const SHORT = { type: 'string', maxLength: 80 };
const owned = (type, writer, schema) => Object.freeze({ type, kind: 'data_model', traits: ['data'], writer, default_policy: { visibility: 'private' },
    owner_only: true, schema: { ...PRIVATE, ...schema } });

export const MCP_PROGRAM_GRANT_TYPE = 'mcp_program_grant';
export const OBJECTIVE_VISIBILITY_TYPE = 'objective_visibility';
export const OBJECTIVE_NETWORK_TYPE = 'objective_network';
export const SCRIPT_TRUST_TYPE = 'script_trust';

export const ACCESS_SOCIAL_ATOME_TYPES = Object.freeze([
    owned(MCP_PROGRAM_GRANT_TYPE, 'atome/src/squirrel/atome/mcp_surface_grants.js', { program_id: SHORT, label: { type: 'string', maxLength: 64 },
        host: { type: 'string', maxLength: 64 }, paired_at: { type: 'string', maxLength: 40 }, families: { type: 'array', maxItems: 16, items: SHORT } }),
    owned(OBJECTIVE_VISIBILITY_TYPE, 'eVe/domains/objectives/objective_network_runtime.js', { objective_id: { type: 'string', maxLength: 200 },
        objective_key: SHORT, visible: { type: 'boolean' }, shown_name: SHORT, moments: { type: 'array', maxItems: 3, items: SHORT },
        language: { type: 'string', maxLength: 16 }, zone: SHORT }),
    owned(OBJECTIVE_NETWORK_TYPE, 'eVe/domains/objectives/objective_network_runtime.js', { enabled: { type: 'boolean' } }),
    owned(SCRIPT_TRUST_TYPE, 'eVe/domains/script/script_commands.js', { document_id: { type: 'string', maxLength: 200 }, script_id: SHORT,
        source_sha256: { type: 'string', maxLength: 64 } })
]);
