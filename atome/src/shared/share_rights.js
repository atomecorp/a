// Share rights model — shared by the client (Communication panel) and the server
// (sync sharing). todo/communication_news_broadcast_2026-09-30.md, D8–D10.
//
// A share carries atomic CAPABILITIES; a ROLE is only a readable name for a known set of
// them. The server stores and enforces capabilities, never roles.

export const SHARE_CAPABILITIES = Object.freeze(['read', 'write', 'create', 'delete', 'reshare', 'manage']);

export const SHARE_ROLES = Object.freeze({
    viewer: Object.freeze(['read']),
    contributor: Object.freeze(['read', 'create']),
    editor: Object.freeze(['read', 'write', 'create', 'delete']),
    coowner: Object.freeze(['read', 'write', 'create', 'delete', 'reshare', 'manage'])
});
export const SHARE_ROLE_ORDER = Object.freeze(['viewer', 'contributor', 'editor', 'coowner']);
export const DEFAULT_SHARE_ROLE = 'viewer';
export const CUSTOM_SHARE_ROLE = 'custom';

// Accepts the canonical capability names and every historical spelling
// (`alter`, `can_write`, `share`, `can_share`…).
const LEGACY_KEYS = Object.freeze({
    read: ['read', 'can_read'],
    write: ['write', 'can_write', 'alter'],
    create: ['create', 'can_create'],
    delete: ['delete', 'can_delete'],
    reshare: ['reshare', 'share', 'can_share', 'can_reshare'],
    manage: ['manage', 'can_manage']
});

export const normalizeRights = (value = {}) => {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(SHARE_CAPABILITIES.map((capability) => [
        capability,
        LEGACY_KEYS[capability].some((key) => source[key] === true || source[key] === 1)
    ]));
};

export const rightsOfRole = (role = DEFAULT_SHARE_ROLE) => {
    const granted = SHARE_ROLES[role] || SHARE_ROLES[DEFAULT_SHARE_ROLE];
    return Object.fromEntries(SHARE_CAPABILITIES.map((capability) => [capability, granted.includes(capability)]));
};

export const roleOfRights = (rights = {}) => {
    const normalized = normalizeRights(rights);
    return SHARE_ROLE_ORDER.find((role) => SHARE_CAPABILITIES.every((capability) => (
        normalized[capability] === SHARE_ROLES[role].includes(capability)
    ))) || CUSTOM_SHARE_ROLE;
};

// Never grant more than one holds: the intersection.
export const attenuateRights = (granter = {}, requested = {}) => {
    const held = normalizeRights(granter);
    const wanted = normalizeRights(requested);
    return Object.fromEntries(SHARE_CAPABILITIES.map((capability) => [capability, held[capability] && wanted[capability]]));
};

export const OWNER_RIGHTS = Object.freeze(rightsOfRole('coowner'));

// Property lists: `null` means "every property". The granted list is always within the
// granter's list.
export const normalizePropertyList = (value) => (Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)))
    : null);
export const attenuatePropertyList = (granter, requested) => {
    const held = normalizePropertyList(granter);
    const wanted = normalizePropertyList(requested);
    if (!held) return wanted;
    if (!wanted) return held;
    return wanted.filter((key) => held.includes(key));
};

// Stored form (server columns keep the historical `can_*` names).
export const toStoredPermissions = (rights = {}) => {
    const normalized = normalizeRights(rights);
    return {
        can_read: normalized.read,
        can_write: normalized.write,
        can_create: normalized.create,
        can_delete: normalized.delete,
        can_share: normalized.reshare,
        can_manage: normalized.manage
    };
};

// D10 — three modes, each one a (server mode, share type) pair.
export const SHARE_MODES = Object.freeze({
    direct: Object.freeze({ serverMode: 'real-time', shareType: 'linked' }),
    frozen: Object.freeze({ serverMode: 'manual', shareType: 'detached' }),
    curated: Object.freeze({ serverMode: 'manual', shareType: 'linked' })
});
export const SHARE_MODE_ORDER = Object.freeze(['direct', 'frozen', 'curated']);
export const DEFAULT_SHARE_MODE = 'direct';

export const normalizeShareMode = (value = '') => {
    const mode = String(value || '').trim().toLowerCase();
    if (SHARE_MODES[mode]) return mode;
    if (['realtime', 'real-time', 'real time', 'live'].includes(mode)) return 'direct';
    if (['oneshot', 'one-shot', 'one shot', 'copy', 'detached', 'send a copy', 'snapshot'].includes(mode)) return 'frozen';
    if (['manual', 'persistent', 'validation-based', 'non-real-time', 'publish'].includes(mode)) return 'curated';
    return DEFAULT_SHARE_MODE;
};
