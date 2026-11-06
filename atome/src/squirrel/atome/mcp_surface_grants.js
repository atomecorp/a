// What a program reaching this device through the relay (an MCP client behind the stdio bridge,
// scripts/mcp/atome_mcp_stdio.mjs) may do here: the families the person granted to it in
// Réglages › Mon matériel › Programmes (validated mockup MD1b). A program is its paired key's seat
// (`program_id`, the device id the pairing enrolled, named by the relay); its grant is a private
// Atome `mcp_program_grant` written through the one commit pipeline, read again at every boot.
//
// At pairing only « Lire » is open; Health is never opened by itself (user decisions, phase C list B).
// « Lire »: discovery, the navigation tree and every `*.read` capability of the non-health families.
// A ticked family: its capabilities, each command still under its own policy (confirmations included);
// a Health call of a program is always held for the person's yes on this device (`programAccessPolicy`).
import { MCP_CONTRACT_FAMILIES } from './mcp_contract_families.js';
import { MCP_ERROR, mcpError, pushMcpEvent } from './mcp_core.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { MCP_PROGRAM_GRANT_TYPE } from '../../shared/access_social_atome_types.js';

export { MCP_PROGRAM_GRANT_TYPE };

export const MCP_READ_GRANT = 'read';
// Families never granted with « Lire » or « Modifier »: every `health_*` family and the families that carry body
// or health measures. They open only through the « Santé » family.
const HEALTH_FAMILY_IDS = Object.freeze(['thalasso', 'sensors', 'body_data', 'strava']);
export const isMcpHealthFamily = familyId => familyId.startsWith('health_') || HEALTH_FAMILY_IDS.includes(familyId);
const PURCHASE_FAMILY_IDS = Object.freeze(['shop']);
// The person's own controls over programs and requests, and the lists they send and receive (health ones among
// them): never a program's, whatever it was granted.
const PERSON_ONLY_FAMILY_IDS = Object.freeze(['mcp_access', 'share']);
const PROGRAM_SANDBOX_PROFILE = 'remote_program';
const LOCAL_SANDBOX_PROFILE = 'desktop_local_owner';
const DISCOVERY_CAPABILITIES = Object.freeze(['mcp.read', 'runtime.read']);
const capabilitiesOf = families => [...new Set(families.flatMap(family => family.commands.map(command => command.capability)))];
const common = MCP_CONTRACT_FAMILIES.filter(family => !isMcpHealthFamily(family.id) && !PURCHASE_FAMILY_IDS.includes(family.id)
    && !PERSON_ONLY_FAMILY_IDS.includes(family.id));
const READ_CAPABILITIES = Object.freeze([...DISCOVERY_CAPABILITIES, ...capabilitiesOf(common).filter(capability => capability.endsWith('.read'))]);
const HEALTH_CAPABILITIES = capabilitiesOf(MCP_CONTRACT_FAMILIES.filter(family => isMcpHealthFamily(family.id)));

// The eight families of MD1b, in their tiles' order (« Lire » first). `sandbox`: the profile the family adds.
const PROGRAM_FAMILIES = Object.freeze({
    [MCP_READ_GRANT]: { capabilities: READ_CAPABILITIES },
    modify: { capabilities: ['runtime.execute', 'timeline.read', 'timeline.write', ...capabilitiesOf(common).filter(capability => !capability.endsWith('.read'))] },
    calendar: { capabilities: ['calendar.read', 'calendar.write'] },
    contacts: { capabilities: ['contacts.read', 'contacts.write'] },
    mail: { capabilities: ['mail.read', 'mail.write', 'mail.send'] },
    capture: { capabilities: ['runtime.execute', 'runtime.sensitive', 'media.capture'], sandbox: LOCAL_SANDBOX_PROFILE },
    health: { capabilities: HEALTH_CAPABILITIES },
    purchases: { capabilities: [...capabilitiesOf(MCP_CONTRACT_FAMILIES.filter(family => PURCHASE_FAMILY_IDS.includes(family.id))), 'bank.read'] }
});

const programs = new Map();
let loaded = { owner: null, promise: null };
const owner = () => String(getSessionState().user?.id || '');
const atome = () => {
    const api = globalThis.window?.Atome;
    if (typeof api?.commit !== 'function' || typeof api?.listStateCurrent !== 'function') throw mcpError(MCP_ERROR.INTERNAL, 'mcp_program_store_unavailable');
    return api;
};
const grantAtomeId = (account, programId) => `${MCP_PROGRAM_GRANT_TYPE}:${encodeURIComponent(account)}:${programId}`;
const live = record => record && !record.deleted && !record.deleted_at && !record.meta?.deleted_at && record.kind !== 'delete';
const propsOf = record => record?.properties || record?.props || {};
const requireUi = (transport) => { if (transport?.source?.type !== 'ui') throw mcpError(MCP_ERROR.ACCESS_DENIED, 'mcp_grant_decider_not_local'); };
const requireProgram = (programId) => {
    const entry = programs.get(String(programId || '').trim());
    if (!entry) throw mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_program_unknown');
    return entry;
};
const grantableFamilies = families => {
    const list = [...new Set((Array.isArray(families) ? families : []).map(String).filter(family => family !== MCP_READ_GRANT))];
    const refused = list.find(family => !PROGRAM_FAMILIES[family]);
    if (refused) throw mcpError(MCP_ERROR.INVALID_PARAMS, `mcp_grant_family_not_grantable:${refused}`);
    return Object.keys(PROGRAM_FAMILIES).filter(family => list.includes(family));
};
const write = async (entry) => {
    const account = owner();
    if (!account) throw mcpError(MCP_ERROR.ACCESS_DENIED, 'mcp_program_account_required');
    const result = await atome().commit({ kind: 'set', atome_id: grantAtomeId(account, entry.program_id), type: MCP_PROGRAM_GRANT_TYPE, actor: account,
        scope: 'global', props: { source_domain: MCP_PROGRAM_GRANT_TYPE, access: 'private', visibility: 'private', ...entry } }, { refreshState: true });
    if (result?.ok === false) throw mcpError(MCP_ERROR.INTERNAL, String(result.error || 'mcp_program_grant_write_failed'));
    programs.set(entry.program_id, entry);
    // The program's tools change with its grant: its bridge relays a tools/list_changed.
    pushMcpEvent('mcp.tools.list_changed', { surface_id: entry.program_id });
    return entry;
};

/** The account's programs, read once per account from their private grants (at boot, before a relayed request); then as they are now. */
export function loadMcpProgramGrants() {
    const account = owner();
    if (loaded.owner !== account || !loaded.promise) {
        programs.clear();
        const promise = !account ? Promise.resolve() : atome().listStateCurrent(null, { atomeType: MCP_PROGRAM_GRANT_TYPE, limit: 500, excludeSystem: true })
            .then((listed) => {
                (Array.isArray(listed) ? listed : listed?.records || []).filter(live).map(propsOf).filter(entry => entry.program_id)
                    .forEach(entry => programs.set(entry.program_id, { program_id: entry.program_id, label: String(entry.label || ''),
                        host: String(entry.host || ''), paired_at: String(entry.paired_at || ''), families: grantableFamilies(entry.families) }));
            });
        loaded = { owner: account, promise };
        promise.catch(() => { if (loaded.promise === promise) loaded = { owner: null, promise: null }; });
    }
    return loaded.promise.then(() => listMcpPrograms());
}

export const listMcpGrantFamilies = () => Object.keys(PROGRAM_FAMILIES);
export const listMcpPrograms = () => [...programs.values()].map(entry => ({ ...entry, families: [...entry.families] }));
export const mcpSurfaceGrant = programId => [MCP_READ_GRANT, ...(programs.get(String(programId || ''))?.families || [])];

/** A program the person just accepted by its number (MD1c): « Lire » alone. */
export async function recordMcpProgram({ programId, label = '', host = '' }, transport) {
    requireUi(transport);
    const id = String(programId || '').trim();
    if (!id) throw mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_grant_surface_missing');
    await loadMcpProgramGrants();
    return write({ program_id: id, label: String(label).slice(0, 64), host: String(host).slice(0, 64),
        paired_at: new Date().toISOString(), families: [] });
}

/** The person's grant for one program (`families`: family ids beyond « Lire »). */
export async function setMcpSurfaceGrant(programId, families, transport) {
    requireUi(transport);
    await loadMcpProgramGrants();
    const entry = requireProgram(programId);
    await write({ ...entry, families: grantableFamilies(families) });
    return mcpSurfaceGrant(entry.program_id);
}

/** The program withdrawn (« Retir. »): its grant leaves with it; its key is revoked by the account's device owner. */
export async function forgetMcpProgram(programId, transport) {
    requireUi(transport);
    await loadMcpProgramGrants();
    const entry = requireProgram(programId);
    const result = await atome().commit({ id: globalThis.crypto.randomUUID(), kind: 'delete', atome_id: grantAtomeId(owner(), entry.program_id),
        scope: 'global', payload: {} });
    if (result?.ok === false) throw mcpError(MCP_ERROR.INTERNAL, String(result.error || 'mcp_program_grant_delete_failed'));
    programs.delete(entry.program_id);
    pushMcpEvent('mcp.tools.list_changed', { surface_id: entry.program_id });
    return { ok: true };
}

/** The actor of a program holding `grants` (family ids of `listMcpGrantFamilies`). With every family, it is the most
 *  a program can ever do: the registry's `program` surface (scripts/registry/registry_project_exposure.mjs). */
export function programGrantActor(actorId, grants) {
    const families = grants.map((family) => {
        if (!PROGRAM_FAMILIES[family]) throw mcpError(MCP_ERROR.INVALID_PARAMS, `mcp_grant_family_not_grantable:${family}`);
        return PROGRAM_FAMILIES[family];
    });
    return {
        actor_id: actorId,
        capabilities: [...new Set(families.flatMap(family => family.capabilities))],
        sandbox_profiles: [PROGRAM_SANDBOX_PROFILE, ...new Set(families.map(family => family.sandbox).filter(Boolean))]
    };
}

/** The actor of a request relayed from a program seat (the relay names `fromProgramId`). */
export const programActor = ({ fromUserId, fromProgramId }) => programGrantActor(`remote_program:${fromUserId}:${fromProgramId}`,
    mcpSurfaceGrant(fromProgramId));

/** A program's Health call waits for the person's yes on this device, even with « Santé » ticked. */
export function programAccessPolicy(actor, access) {
    if (!actor?.sandbox_profiles?.includes(PROGRAM_SANDBOX_PROFILE) || access?.confirmation_required === true) return access;
    if (!(access?.required_capabilities || []).some(capability => HEALTH_CAPABILITIES.includes(capability))) return access;
    return { ...access, access: 'confirm', confirmation_required: true, proposal_required: true, sensitive: true, idempotent: true };
}
