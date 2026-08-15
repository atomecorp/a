import { createGlobalConditionsApi } from '../conditions/bootstrap.js';

const conditionsApi = () => globalThis.atome?.conditions
    || globalThis.window?.atome?.conditions
    || createGlobalConditionsApi({ env: globalThis.window || globalThis });

const authorizedOptions = (params = {}) => ({
    authorized: params?.__mcp?.access?.confirmation_required === true,
    ...(params.projectId ? { projectId: String(params.projectId) } : {})
});

export function createMcpConditionHandlers() {
    return {
        async 'conditions.evaluate'(params = {}) {
            const api = conditionsApi();
            return api.match(params.conditionSet || params.condition || params.root, params.context || {}, {
                domain: params.domain,
                unknownPolicy: params.unknownPolicy
            });
        },
        async 'conditions.properties.discover'(params = {}) {
            return { ok: true, items: await conditionsApi().properties.discover(params) };
        },
        async 'conditions.query.once'(params = {}) {
            return { ok: true, ...(await conditionsApi().query.once(params)) };
        },
        async 'conditions.computed.list'() {
            return { ok: true, items: await conditionsApi().computedProperties.list() };
        },
        async 'conditions.computed.save'(params = {}) {
            const item = await conditionsApi().computedProperties.save(
                params.computedProperty || params.property || {},
                authorizedOptions(params)
            );
            return { ok: true, item };
        },
        async 'conditions.computed.remove'(params = {}) {
            return { ok: await conditionsApi().computedProperties.remove(String(params.id || ''), authorizedOptions(params)) };
        },
        async 'conditions.lists.list'() {
            return { ok: true, items: await conditionsApi().lists.list() };
        },
        async 'conditions.lists.get'(params = {}) {
            const item = await conditionsApi().lists.get(String(params.id || ''));
            return item ? { ok: true, item } : { ok: false, error: 'condition_list_not_found' };
        },
        async 'conditions.lists.create'(params = {}) {
            const item = await conditionsApi().lists.create(params.list || {}, authorizedOptions(params));
            return { ok: true, item };
        },
        async 'conditions.lists.resolve'(params = {}) {
            return { ok: true, ...(await conditionsApi().lists.resolve(String(params.id || ''), params.query || {})) };
        },
        async 'conditions.lists.freeze'(params = {}) {
            const item = await conditionsApi().lists.freeze(
                String(params.id || ''),
                params.list || {},
                authorizedOptions(params)
            );
            return { ok: true, item };
        },
        async 'conditions.lists.remove'(params = {}) {
            return { ok: await conditionsApi().lists.remove(String(params.id || ''), authorizedOptions(params)) };
        },
        async 'conditions.sets.list'(params = {}) {
            return { ok: true, items: await conditionsApi().sets.list(params) };
        },
        async 'conditions.sets.get'(params = {}) {
            const item = await conditionsApi().sets.get(String(params.id || ''));
            return item ? { ok: true, item } : { ok: false, error: 'condition_set_not_found' };
        },
        async 'conditions.sets.save'(params = {}) {
            const item = await conditionsApi().sets.save(params.conditionSet || params.set || {}, authorizedOptions(params));
            return { ok: true, item };
        },
        async 'conditions.sets.duplicate'(params = {}) {
            const item = await conditionsApi().sets.duplicate(String(params.id || ''), {
                id: String(params.duplicateId || ''),
                name: params.name,
                ...authorizedOptions(params)
            });
            return { ok: true, item };
        },
        async 'conditions.sets.remove'(params = {}) {
            return { ok: await conditionsApi().sets.remove(String(params.id || ''), authorizedOptions(params)) };
        },
        async 'conditions.bindings.attach'(params = {}) {
            const item = await conditionsApi().bindings.attach(params.binding || {}, authorizedOptions(params));
            return { ok: true, item };
        },
        async 'conditions.bindings.detach'(params = {}) {
            return { ok: await conditionsApi().bindings.detach(String(params.id || ''), authorizedOptions(params)) };
        },
        async 'conditions.bindings.list'(params = {}) {
            return { ok: true, items: await conditionsApi().bindings.load(params.conditionSetId || null) };
        },
        async 'conditions.bindings.evaluate'(params = {}) {
            return conditionsApi().bindings.evaluate(String(params.id || ''), params.context || {});
        }
    };
}
