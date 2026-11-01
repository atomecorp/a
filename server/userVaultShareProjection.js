// A vault state seen by another principal through an active share: the readable and writable
// property sets of the share, the owner credentials stripped from media URLs, and the list scope
// the owner side applies (split out of server/userVaultRouter.js, which routes to the vaults).
import { normalizeRights } from '../atome/src/shared/share_rights.js';
import { parseJson, sharePermissions, stateAtomeId } from './syncShareHierarchy.js';

// Deux listes distinctes (D8) : ce que le destinataire VOIT et ce qu'il peut MODIFIER.
// `allowed_properties_json` (historique) sert de repli aux deux.
const propertySet = (share, column) => {
    const value = parseJson(share?.[column], null) ?? parseJson(share?.allowed_properties_json, null);
    return Array.isArray(value) && value.length ? new Set(value.map(String)) : null;
};
export const allowedProperties = (share) => propertySet(share, 'readable_properties_json');
export const writableProperties = (share) => propertySet(share, 'writable_properties_json');

// A media URL written by its owner may carry the owner's session capability
// (`media_token`). A recipient never receives it: its client signs the same file route
// with its own session, and the file read resolvers decide what it may read.
const OWNER_CREDENTIAL_PARAMS = ['media_token', 'token', 'access_token'];
const withoutOwnerCredentials = (value) => {
    if (typeof value !== 'string' || !OWNER_CREDENTIAL_PARAMS.some((name) => value.includes(`${name}=`))) return value;
    try {
        const relative = value.startsWith('/');
        const url = new URL(value, 'http://relative.invalid');
        OWNER_CREDENTIAL_PARAMS.forEach((name) => url.searchParams.delete(name));
        return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
    } catch (_) { return value; }
};

export const filterProperties = (properties, share) => {
    const allowed = allowedProperties(share);
    return Object.fromEntries(Object.entries(properties || {})
        .filter(([key]) => !allowed || allowed.has(key))
        .map(([key, value]) => [key, withoutOwnerCredentials(value)]));
};

const SYSTEM_STATE_TYPES = new Set(['project', 'user', 'blackhole', 'tool', 'tool_macro', 'toolbox', 'tool_block', 'panel', 'system']);
const stateType = (state) => String(state?.type || state?.atome_type || state?.properties?.type || state?.properties?.kind || '').toLowerCase();
const stateProjectId = (state) => state?.meta?.project_id || state?.project_id || state?.properties?.project_id || null;

// Memes criteres que `listStateCurrent` (database/adole.js) cote proprietaire.
export const matchesListScope = (state, options = {}) => {
    const projectId = options.project_id || options.projectId || null;
    if (projectId && String(stateProjectId(state) || '') !== String(projectId)) return false;
    const atomeType = String(options.atome_type || options.atomeType || '').trim().toLowerCase();
    if (atomeType && stateType(state) !== atomeType && String(state?.kind || '').toLowerCase() !== atomeType) return false;
    if (options.exclude_system === true || options.excludeSystem === true) {
        const id = String(stateAtomeId(state) || '').toLowerCase();
        if (SYSTEM_STATE_TYPES.has(stateType(state)) || id.startsWith('tool.ui.') || id.startsWith('tool_ui.')) return false;
    }
    return true;
};

// Etat d'un autre coffre vu au travers d'un partage actif : proprietes lisibles seulement,
// et capacites = celles du partage (et non celles de l'ancien modele de permissions central).
export const projectSharedState = (state, share) => {
    const rights = normalizeRights(sharePermissions(share));
    return {
        ...state,
        properties: filterProperties(state.properties, share),
        vault_principal_id: share.owner_id,
        sync_share_id: share.share_id,
        capabilities: {
            read: rights.read,
            write: rights.write,
            create: rights.create,
            delete: rights.delete,
            share: rights.reshare
        }
    };
};
