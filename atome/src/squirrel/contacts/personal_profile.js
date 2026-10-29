import { createCanonicalImport, importIdentity, importRecordId, importRecordProps, IMPORT_ORIGIN_TYPE } from '../shared/canonical_import.js';
import { reconcileImport, sameImportValue } from '../shared/import_reconciliation.js';
import { mergeGuestProfileProperties, personalProfileFromProperties } from '../../shared/profile_sharing.js';
import { contactBookPhone } from '../../shared/contact_book_hash.js';
import { isE164Phone, phoneRegionFromE164 } from '../../shared/phone_number.js';
import { persistContactPhoto } from './photo_media.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

const sourceKey = 'ios_personal_contact';
const fields = ['name', 'first_name', 'nickname', 'email', 'user_face'];
const externalId = contact => String(contact.source_contact_id || contact.id || '');
const profileInput = contact => {
    const raw = contact.raw || contact;
    return Object.fromEntries(fields.map(key => [key, key === 'user_face' ? contact.user_face || raw.user_face || raw.photo : contact[key] || raw[key]])
        .filter(([, value]) => typeof value === 'string' && value.trim()));
};

/** Native contact data fills the existing account profile; it never creates an account.
 * `loadProfile` is the eVe profile owner (profile_api.js#installUserProfileRuntimeBridge). */
export function createPersonalContactImport({ api, session = getSessionState, loadProfile } = {}) {
    const store = createCanonicalImport({ type: 'user', api, session });
    // Inside an import pass, the origins come from its snapshot: read alone, they were the whole table, twice.
    const readOrigin = async (context, snapshot = null) => (await store.list(IMPORT_ORIGIN_TYPE, context, snapshot))
        .find(row => importRecordProps(row).source_key === sourceKey && importRecordProps(row).canonical_id === context.owner);
    async function apply(contact, { signal, checkSession, selected = false, snapshot = null } = {}) {
        if (typeof loadProfile !== 'function') throw new Error('personal_profile_loader_required');
        const context = store.capture();
        const check = () => { context.check(); checkSession?.(); if (signal?.aborted) throw new Error('import_cancelled'); };
        check();
        const original = await readOrigin(context, snapshot); check();
        const old = importRecordProps(original);
        const id = externalId(contact);
        if (!id) throw new Error('import_external_identity_required');
        // A device that joined the account (recovery, pairing, a reinstall) holds a bare user
        // record until the account's profile arrives. Filled from the card, that record became
        // the profile: newer, it replaced the account's name, photo and preferences (contact
        // favourites included) here and on every device. The card waits for a later pass.
        const here = await loadProfile(context.owner, { repair: false }); check();
        if (here?.ok !== true) {
            if (here?.error !== 'atome_not_available_locally') throw new Error(here?.error || 'personal_profile_unavailable');
            return { ok: true, external_id: id, principal_id: context.owner, changed: false, deferred: 'account_profile_arriving' };
        }
        const prepared = await persistContactPhoto(contact, { ...context, check }); check();
        const incoming = profileInput(prepared);
        const row = await context.store.getStateCurrent(context.owner); check();
        if (!row) throw new Error('personal_profile_missing');
        const properties = importRecordProps(row);
        const current = personalProfileFromProperties(properties);
        // Unread/empty values are omitted. A later manual clear remains a local edit.
        const merged = original ? reconcileImport(current, old.baseline || {}, incoming, old.conflicts)
            : { properties: incoming, conflicts: {} };
        let patch;
        if (!original) patch = mergeGuestProfileProperties(properties, incoming);
        else {
            const storedProfile = typeof properties.eve_profile === 'string' ? JSON.parse(properties.eve_profile) : properties.eve_profile || {};
            patch = {};
            const profile = { ...storedProfile };
            for (const key of fields) if (Object.hasOwn(incoming, key) && !sameImportValue(current[key], merged.properties[key])) {
                const value = merged.properties[key];
                patch[key] = value;
                if (key !== 'user_face') profile[key] = value;
                if (key === 'first_name') Object.assign(patch, { firstname: value, firstName: value });
            }
            if (Object.keys(patch).length) patch.eve_profile = profile;
        }
        if (patch && Object.keys(patch).length) {
            check();
            if (!row.property_versions) throw new Error('personal_profile_versions_required');
            const result = await context.store.commit({ kind: 'set', type: 'user', atome_id: context.owner,
                scope: 'global', payload: { props: patch, expected_versions: Object.fromEntries(Object.keys(patch)
                    .map(key => [key, row.property_versions[key] || 0])) } });
            check();
            if (!result?.ok) throw new Error(result?.error || 'personal_profile_commit_failed');
        }
        const origin = { canonical_id: context.owner, domain_type: 'user', source_key: sourceKey, external_id: id,
            baseline: { ...old.baseline, ...incoming }, conflicts: merged.conflicts || {},
            // Explicit selection is retained independently of the authentication phone.
            ...(selected || old.source_collection === 'selected' ? { source_collection: 'selected' } : {}) };
        const originId = original ? importRecordId(original) : `origin_${await importIdentity([context.owner, sourceKey])}`;
        if (!sameImportValue(old, { ...origin, access: 'private', visibility: 'private' })) await store.write(originId, IMPORT_ORIGIN_TYPE, origin, context, 'set', snapshot);
        check();
        await loadProfile(context.owner, { repair: false, eventSource: 'ios_personal_import' }); check();
        return { ok: true, external_id: id, principal_id: context.owner, changed: !!patch && !!Object.keys(patch).length };
    }
    async function collect(items, candidates = [], options = {}) {
        const context = store.capture(), old = importRecordProps(await readOrigin(context, options.snapshot));
        const state = session?.();
        const phone = state?.user?.phone;
        let contact = old.source_collection === 'selected' ? items.find(item => externalId(item) === old.external_id) : null;
        if (!contact && isE164Phone(phone)) {
            const matches = candidates.filter(item => [item.phone, ...(item.phones || item.raw?.phones || []).map(entry => entry?.value)]
                .some(value => contactBookPhone(value, { region: phoneRegionFromE164(phone) }) === phone));
            if (matches.length === 1) contact = items.find(item => externalId(item) === externalId(matches[0]));
        }
        if (!contact) return { ok: true, selection_required: !old.canonical_id, external_id: old.external_id || '' };
        return apply(contact, options);
    }
    return { collect, select: (contact, options) => apply(contact, { ...options, selected: true }) };
}
