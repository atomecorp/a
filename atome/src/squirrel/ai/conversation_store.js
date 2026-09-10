import { FastifyAdapter, TauriAdapter } from '../apis/unified/adole.js';
import { isTauriRuntime } from '../apis/unified/adole_api/runtime.js';
import { mapStateCurrentToAtome } from '../apis/unified/adole_api/atome_record_projection.js';
import { create_atome, list_atomes, alter_atome, delete_atome } from '../apis/unified/adole_api/atomes.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

// Conversations use the same authenticated event commit and state_current
// projection as all other Atomes. No transcript database or local storage.
export const createConversationStore = ({
    retainAttachments = null, create = create_atome, list = list_atomes,
    get = id => (isTauriRuntime() ? TauriAdapter : FastifyAdapter).atome.getStateCurrent(id),
    alter = alter_atome, remove = delete_atome, session = getSessionState, backend = () => isTauriRuntime() ? 'tauri' : 'fastify'
} = {}) => {
    let pendingSave = Promise.resolve();
    const principal = () => {
        const current = session();
        if (current?.mode !== 'authenticated' || !current.user?.id) throw new Error('not_authenticated');
        return { ...current, backend: backend() };
    };
    const resultOf = (result, backend) => {
        const resolved = result?.[backend];
        if (!resolved || resolved.error || resolved.success === false) {
            throw new Error(resolved?.error || 'conversation_storage_failed');
        }
        return resolved;
    };
    return Object.freeze({
        actor: () => ({ user_id: principal().user.id }),
        save(snapshot) {
            snapshot = structuredClone(snapshot);
            const queuedPrincipal = principal().user.id;
            const save = async () => {
                const current = principal();
                if (current.user.id !== queuedPrincipal) throw new Error('conversation_principal_changed');
                const turns = (snapshot.turns || []).map(turn => {
                    if (turn.role === 'tool') return { id: turn.id, role: turn.role, name: turn.name, result: turn.result,
                        call_id: turn.call_id, idempotency_key: turn.idempotency_key };
                    return { id: turn.id, role: turn.role, text: turn.text, model: turn.model,
                        annotations: turn.annotations || [], modality: turn.modality, heard: turn.heard, interrupted: turn.interrupted, attachments: turn.attachments || [] };
                });
                const first = turns.find(turn => turn.role === 'user')?.text || '';
                const existing = await get(snapshot.id);
                if (principal().user.id !== current.user.id) throw new Error('conversation_principal_changed');
                if (existing?.ok === false && !['State not found', 'state_not_found'].includes(existing.error)) throw new Error(existing.error || 'conversation_storage_failed');
                const record = mapStateCurrentToAtome(existing?.state);
                if (record?.properties?.__deleted === true || (snapshot.saved && !record)) throw new Error('conversation_deleted');
                if (record && (record.type || record.properties?.kind) !== 'conversation') throw new Error('conversation_type_mismatch');
                const properties = record?.properties || {};
                const update = {
                    title: properties.name || properties.title || first.slice(0, 100),
                    model: snapshot.model, level: snapshot.level, effort: snapshot.effort, turns,
                    transcript: turns.filter(turn => turn.text).map(turn => turn.text).join('\n'),
                    updated_iso: new Date().toISOString()
                };
                resultOf(await (record ? alter(snapshot.id, update) : create({ id: snapshot.id, type: 'conversation', properties: update })), current.backend);
                if (principal().user.id !== current.user.id) throw new Error('conversation_principal_changed');
                if (retainAttachments && snapshot.turns?.some(turn => turn.attachments?.some(item => !item.asset_id))) {
                    const retained = await retainAttachments(snapshot);
                    if (principal().user.id !== current.user.id) throw new Error('conversation_principal_changed');
                    const latest = await get(snapshot.id);
                    if (!latest?.state || latest.state.properties?.__deleted === true) throw new Error('conversation_deleted');
                    resultOf(await alter(snapshot.id, { turns: retained.turns }), current.backend);
                    return retained;
                }
                return snapshot;
            };
            const operation = pendingSave.then(save);
            // A failed save is returned to its caller; later explicit saves can retry.
            pendingSave = operation.catch(() => {});
            return operation;
        },
        async list(options = {}) {
            const current = principal();
            const result = resultOf(await list({ ...options, type: 'conversation', ownerId: current.user.id }), current.backend);
            if (principal().user.id !== current.user.id) throw new Error('conversation_principal_changed');
            return result.atomes || [];
        },
        async load(id) {
            const current = principal();
            const found = await get(id);
            if (found?.ok === false) throw new Error(found.error || 'conversation_storage_failed');
            if (principal().user.id !== current.user.id) throw new Error('conversation_principal_changed');
            const record = mapStateCurrentToAtome(found.state);
            if (!record || record.properties?.__deleted === true || (record.type || record.properties?.kind) !== 'conversation') throw new Error('conversation_not_found');
            const props = record.properties || {};
            return { id, model: props.model, level: props.level, effort: props.effort, turns: props.turns || [] };
        },
        async rename(id, title) {
            const current = principal();
            resultOf(await alter(id, { title: String(title).trim(), name: String(title).trim() }), current.backend);
        },
        async classify(id, categoryId) {
            const current = principal();
            resultOf(await alter(id, { category_id: String(categoryId) }), current.backend);
        },
        async remove(id) {
            const current = principal();
            resultOf(await remove(id), current.backend);
        }
    });
};
