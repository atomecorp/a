// A list sent to someone (register R-115 « Partage », cahier D25; #shared/list_share_contract.js): what the share engine
// (server/syncSharingService.js) adds when the shared root is a list. The server is the truth (AGENTS.md rule 21):
// - the recipient reads the whole list before answering (S5), from the sender's vault, through `view`;
// - validated, the list becomes theirs: the version they validated is copied into their own account (root and entries,
//   each by its domain's id rule, `list_link` naming where it comes from), and their `list_receipt` keeps that version;
// - linked, each later version is offered marked (S6) and copied only once validated — the copy validated before keeps
//   running meanwhile; refused, it is recorded; « Détacher » keeps the copies and ends the link;
// - a programme leaves as its plan only (shares.rs: what lies under it stays its maker's).
// A live collaborative share (the shopping basket with member rights, `share.send` live) is no copy: its
// recipient works in the sender's list itself, as before. A protocol template is applied by its own import on the
// recipient's profile (protocol_template_share.js): the receipt records the version, no copy is made here.
import crypto from 'node:crypto';
import { LIST_RECEIPT_ATOME_TYPE, listCopyIdOf, listCopyPropsOf, listDiff, listKindOf, listStateId, listStateParent, listVersionOf,
    listViewOf } from '../atome/src/shared/list_share_contract.js';
import { normalizeRights } from '../atome/src/shared/share_rights.js';
import { parseJson } from './syncShareHierarchy.js';

const fail = code => { throw new Error(code); };
const receiptIdOf = shareId => `list_receipt_${shareId}`;
const typeOf = state => String(state?.type || state?.atome_type || state?.properties?.type || '');
// A share only to read is a list sent; one granting more (write, create, delete) is worked on together.
const readOnly = row => Object.entries(normalizeRights(parseJson(row.permissions_json, {}))).every(([right, on]) => right === 'read' || on !== true);
const appliedByDomain = kind => kind === 'protocol';
// The unique part a copy's id was made with (#shared/list_share_contract.js#listCopyIdOf: after its last ':' or '_').
const freshOf = copyId => String(copyId).split(':').pop().split('_').pop();

export const createShareLists = ({ vaultRouter, get, revoke, notifyPrincipal, deliver }) => {
    const statesOf = async row => {
        const states = await vaultRouter.statesWithinSharedRoot(row.owner_id, row.atome_id);
        return Array.isArray(states) ? states : [];
    };
    // The list a share names, as its owner's vault holds it now (null: the root is no list).
    const sourceOf = async (row) => {
        const states = await statesOf(row);
        const root = states.find(state => listStateId(state) === String(row.atome_id));
        if (!root || !listKindOf(root)) return null;
        const readable = parseJson(row.readable_properties_json, null);
        const visible = readable?.length ? states.map(state => ({ ...state, properties: Object.fromEntries(Object.entries(state.properties || {})
            .filter(([key]) => readable.includes(key) || key === 'type')) })) : states;
        return { root, states: visible, view: listViewOf(root, visible) };
    };
    const receiptOf = async (row) => {
        const state = await vaultRouter.getState(row.principal_id, receiptIdOf(row.share_id)).catch(() => null);
        return state?.properties?.share_id ? state.properties : null;
    };
    const writeReceipt = (row, props) => vaultRouter.commit(row.principal_id, { id: crypto.randomUUID(), kind: 'set', atome_id: receiptIdOf(row.share_id),
        scope: 'global', actor: { type: 'user', id: row.principal_id }, payload: { props: { type: LIST_RECEIPT_ATOME_TYPE, share_id: row.share_id,
            source_id: row.atome_id, sender_id: row.owner_id, access: 'private', visibility: 'private', updated_at: new Date().toISOString(), ...props } } },
    { source: `share-list:${row.share_id}` });

    // The source's root and entries copied into the recipient's account; `copies` (source id → copy id) of the version
    // before is kept, so a new version updates the same copies and removes the entries gone.
    const copyInto = async (row, source, copies = {}) => {
        const recipient = String(row.principal_id), rootId = String(row.atome_id), next = {};
        const link = { share_id: row.share_id, owner_id: String(row.owner_id), source_id: rootId };
        const ordered = [source.root, ...source.states.filter(state => listStateId(state) !== rootId && listStateParent(state)
            && source.view.entries.some(entry => entry.key === listStateId(state)))];
        let root = null;
        for (const state of ordered) {
            const sourceId = listStateId(state), known = copies[sourceId];
            const fresh = known ? freshOf(known) : crypto.randomUUID();
            const copyId = known || listCopyIdOf(state, recipient, fresh);
            const parent = sourceId === rootId ? null : next[listStateParent(state)] || next[rootId];
            // A media list's revision is its copy's own write count (value N at particle version N + 1).
            const revision = typeOf(state) === 'media_list'
                ? { revision: known ? Number((await vaultRouter.getState(recipient, copyId))?.properties?.revision ?? -1) + 1 : 0 } : {};
            // A basket's items join the recipient's own basket, whose root stays theirs.
            if (sourceId === rootId && source.view.kind === 'shopping') { next[sourceId] = copyId; continue; }
            await vaultRouter.commit(recipient, { id: crypto.randomUUID(), kind: 'set', atome_id: copyId, scope: 'global', actor: { type: 'user', id: recipient },
                ...(parent ? { parent_id: parent } : {}), payload: { props: { type: typeOf(state), ...listCopyPropsOf(state, { fresh, recipient, root }), ...revision,
                    ...(parent ? { list_root: parent } : {}), list_link: { ...link, source_atome_id: sourceId } } } }, { source: `share-list:${row.share_id}` });
            next[sourceId] = copyId;
            if (sourceId === rootId) root = { copy_id: copyId, for_person: listCopyPropsOf(state, { fresh, recipient }).for_person || null };
        }
        for (const [sourceId, copyId] of Object.entries(copies)) {
            if (next[sourceId]) continue;
            await vaultRouter.commit(recipient, { id: crypto.randomUUID(), kind: 'delete', atome_id: copyId, actor: { type: 'user', id: recipient }, payload: {} },
                { source: `share-list:${row.share_id}` });
        }
        return next;
    };
    // The version shown to the recipient now validated: copied (unless worked on together or applied by its domain).
    const validate = async (row, source, receipt) => {
        const version = listVersionOf(source.view, receipt);
        const copies = readOnly(row) && !appliedByDomain(source.view.kind) ? await copyInto(row, source, receipt?.copies || {}) : (receipt?.copies || {});
        await writeReceipt(row, { list_kind: source.view.kind, name: source.view.name, status: row.share_type === 'detached' ? 'detached' : 'linked',
            accepted_version: version, refused_version: receipt?.refused_version || 0, entries: source.view.entries, copies });
        return { version, copies };
    };
    const recipientRow = async (principalId, message) => {
        const row = await get(String(message.share_id || message.request_id || '').trim());
        if (!row || String(row.principal_id) !== String(principalId)) fail('share_request_not_found');
        return row;
    };

    return {
        sourceOf,
        receiptOf,
        // Accepted (respond or a policy 'always'): a list root becomes the recipient's; any other root is left as it was.
        async accepted(row) {
            const source = await sourceOf(row);
            if (!source) return null;
            return validate(row, source, await receiptOf(row));
        },
        // What the invitation says of a list (its kind, name, count), null for any other root.
        async summary(row) {
            const source = await sourceOf(row);
            return source ? { list_kind: source.view.kind, list_name: source.view.name, list_count: source.view.entries.length } : null;
        },
        // `view`: the list a share names, for its recipient (before answering, or a new version) or its owner; `list` null for
        // a root that is no list.
        async view(principalId, message) {
            const row = await get(String(message.share_id || message.request_id || '').trim());
            if (!row || ![String(row.principal_id), String(row.owner_id)].includes(String(principalId))) fail('share_request_not_found');
            const source = await sourceOf(row);
            // Any other root (a position, a project) is shared as it is: its share alone, no list to read.
            if (!source) return { ok: true, share_id: row.share_id, status: row.status, share_type: row.share_type, owner_id: row.owner_id, list: null,
                receipt: null, pending: row.status === 'pending' };
            const receipt = await receiptOf(row);
            const version = listVersionOf(source.view, receipt);
            const diff = receipt ? listDiff(receipt.entries || [], source.view.entries) : { entries: source.view.entries, removed: [] };
            return { ok: true, share_id: row.share_id, status: row.status, share_type: row.share_type, owner_id: row.owner_id,
                list: { ...source.view, version, entries: diff.entries, removed: diff.removed },
                receipt: receipt ? { status: receipt.status, accepted_version: receipt.accepted_version, refused_version: receipt.refused_version || 0 } : null,
                pending: row.status === 'pending' || Boolean(receipt && receipt.status === 'linked' && version > receipt.accepted_version
                    && version > (receipt.refused_version || 0)) };
        },
        async acceptVersion(principalId, message) {
            const row = await recipientRow(principalId, message);
            if (!['active', 'accepted'].includes(row.status) || row.share_type !== 'linked') fail('share_list_not_linked');
            const source = await sourceOf(row);
            if (!source) fail('share_list_unknown');
            const result = await validate(row, source, await receiptOf(row));
            notifyPrincipal(row.owner_id, { type: 'share-version-decision', share_id: row.share_id, version: result.version, decision: 'accepted' });
            return { ok: true, share_id: row.share_id, version: result.version };
        },
        async refuseVersion(principalId, message) {
            const row = await recipientRow(principalId, message);
            const receipt = await receiptOf(row);
            if (!receipt) fail('share_list_not_accepted');
            const source = await sourceOf(row);
            if (!source) fail('share_list_unknown');
            const version = listVersionOf(source.view, receipt);
            await writeReceipt(row, { ...receipt, refused_version: version });
            notifyPrincipal(row.owner_id, { type: 'share-version-decision', share_id: row.share_id, version, decision: 'refused' });
            return { ok: true, share_id: row.share_id, refused_version: version };
        },
        // « Détacher » (S6): the copies of the version validated stay the recipient's, the link ends. A list worked on
        // together is copied at that moment, so the recipient keeps it too.
        async detach(principalId, message) {
            const row = await recipientRow(principalId, message);
            if (row.share_type !== 'linked' || !['active', 'accepted'].includes(row.status)) fail('share_list_not_linked');
            let receipt = await receiptOf(row);
            if (!receipt) fail('share_list_not_accepted');
            if (!readOnly(row) || !Object.keys(receipt.copies || {}).length) {
                const source = await sourceOf(row);
                if (!source) fail('share_list_unknown');
                receipt = { ...receipt, copies: await copyInto(row, source, receipt.copies || {}) };
            }
            await writeReceipt(row, { ...receipt, status: 'detached' });
            await revoke(principalId, { share_id: row.share_id });
            return { ok: true, share_id: row.share_id, copies: receipt.copies };
        },
        // A list just changed by its owner: each linked recipient whose version is behind is told (S6's bubble), once a version.
        async announce(ownerId, message, rows) {
            const atomeId = String(message.atome_id || '').trim();
            if (!atomeId) fail('share_atome_required');
            const told = [];
            for (const row of rows.filter(entry => String(entry.owner_id) === String(ownerId) && String(entry.atome_id) === atomeId)) {
                const [source, receipt] = await Promise.all([sourceOf(row), receiptOf(row)]);
                if (!source || !receipt || receipt.status !== 'linked') continue;
                const version = listVersionOf(source.view, receipt);
                if (version <= receipt.accepted_version || version <= (receipt.announced_version || 0)) continue;
                await writeReceipt(row, { ...receipt, announced_version: version });
                await deliver?.(row.principal_id, ownerId, { kind: 'share-request', id: `share_${row.share_id}_v${version}`, extra: {
                    share_id: row.share_id, atomeIds: [row.atome_id], share_type: row.share_type, status: 'pending', list_kind: source.view.kind,
                    list_name: source.view.name, list_count: source.view.entries.length, list_version: version } });
                told.push({ share_id: row.share_id, principal_id: row.principal_id, version });
            }
            return { ok: true, announced: told };
        }
    };
};
