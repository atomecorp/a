import {
    CONDITION_SCHEMA_VERSION,
    isSecurityConditionDomain,
    normalizeConditionBinding,
    normalizeConditionSet
} from './contract.js';
import { createConditionEngine } from './engine.js';
import { createConditionRegistry } from './registry.js';
import { createComputedPropertyService } from './computed_properties.js';
import { createConditionListService } from './lists.js';
import { discoverConditionProperties } from './property_catalog.js';
import { createConditionQueryService } from './query.js';

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const setProps = (conditionSet) => ({
    name: conditionSet.name,
    schema_version: conditionSet.schemaVersion,
    revision: conditionSet.revision,
    root: conditionSet.root,
    created_by: conditionSet.createdBy,
    created_at: conditionSet.createdAt,
    updated_at: conditionSet.updatedAt
});

const bindingProps = (binding) => ({
    condition_set_id: binding.conditionSetId,
    condition_set_revision: binding.conditionSetRevision,
    domain: binding.domain,
    target: binding.target,
    unknown_policy: binding.unknownPolicy,
    enabled: binding.enabled,
    authorized_revision: binding.authorizedRevision
});

export function createConditionService({
    registry = createConditionRegistry(),
    commit = null,
    read = null,
    list = null,
    loadCandidates = null,
    subscribeDependencies = null,
    liveSources = null,
    executeQueryOnce = null,
    discoverProperties = null
} = {}) {
    const engine = createConditionEngine({ registry });
    const setCache = new Map();
    const bindingCache = new Map();
    let bindingsHydrated = false;

    const persist = async (type, id, props, options = {}) => {
        if (typeof commit !== 'function') throw new Error('condition_commit_unavailable');
        const response = await commit({
            kind: 'set',
            type,
            atome_id: id,
            ...(options.projectId ? { project_id: options.projectId } : { scope: 'global' }),
            props
        }, { refreshState: false });
        if (response?.ok !== true) throw new Error('condition_commit_failed');
        return response;
    };

    const removePersisted = async (id, options = {}) => {
        if (typeof commit !== 'function') throw new Error('condition_commit_unavailable');
        const response = await commit({ kind: 'delete', atome_id: id, scope: 'global', payload: {} }, {
            refreshState: false,
            ...options
        });
        if (response?.ok !== true) throw new Error('condition_commit_failed');
        return true;
    };

    const getSet = async (id) => {
        if (setCache.has(id)) return clone(setCache.get(id));
        if (typeof read !== 'function') return null;
        const state = await read(id);
        const props = state?.properties || state?.props || {};
        if (!state || (state.type || state.atome_type || props.type) !== 'condition_set') return null;
        const conditionSet = normalizeConditionSet({
            id,
            name: props.name,
            schemaVersion: props.schema_version,
            revision: props.revision,
            root: props.root,
            createdBy: props.created_by,
            createdAt: props.created_at,
            updatedAt: props.updated_at
        });
        setCache.set(id, conditionSet);
        return clone(conditionSet);
    };

    const parseBindingState = (state, fallbackId = null) => {
        const props = state?.properties || state?.props || {};
        const type = state?.type || state?.atome_type || props.type || null;
        if (!state || type !== 'condition_binding') return null;
        return normalizeConditionBinding({
            id: state.atome_id || state.id || fallbackId,
            conditionSetId: props.condition_set_id,
            conditionSetRevision: props.condition_set_revision,
            domain: props.domain,
            target: props.target,
            unknownPolicy: props.unknown_policy,
            enabled: props.enabled,
            authorizedRevision: props.authorized_revision
        });
    };

    const getBinding = async (id) => {
        if (bindingCache.has(id)) return clone(bindingCache.get(id));
        if (typeof read !== 'function') return null;
        const binding = parseBindingState(await read(id), id);
        if (!binding) return null;
        bindingCache.set(binding.id, binding);
        return clone(binding);
    };

    const hydrateBindings = async () => {
        if (bindingsHydrated || typeof list !== 'function') return;
        const rows = await list({ type: 'condition_binding', includeTotal: false });
        for (const row of rows || []) {
            const binding = parseBindingState(row);
            if (binding) bindingCache.set(binding.id, binding);
        }
        bindingsHydrated = true;
    };

    const saveSet = async (input, options = {}) => {
        const current = input.id ? await getSet(input.id) : null;
        const conditionSet = normalizeConditionSet({
            ...current,
            ...input,
            schemaVersion: CONDITION_SCHEMA_VERSION,
            revision: current ? current.revision + 1 : (input.revision || 1),
            createdAt: current?.createdAt || input.createdAt,
            updatedAt: new Date().toISOString()
        });
        const validation = engine.validate(conditionSet);
        if (!validation.ok) {
            const error = new Error('condition_set_invalid');
            error.details = validation.errors;
            throw error;
        }
        await hydrateBindings();
        const securityBindings = Array.from(bindingCache.values()).filter((binding) => (
            binding.conditionSetId === conditionSet.id && isSecurityConditionDomain(binding.domain)
        ));
        if (current && securityBindings.length && options.authorized !== true) {
            throw new Error('condition_set_reauthorization_required');
        }
        await persist('condition_set', conditionSet.id, setProps(conditionSet), options);
        setCache.set(conditionSet.id, conditionSet);
        if (securityBindings.length) {
            for (const binding of securityBindings) {
                const updated = {
                    ...binding,
                    conditionSetRevision: conditionSet.revision,
                    authorizedRevision: conditionSet.revision
                };
                await persist('condition_binding', binding.id, bindingProps(updated), options);
                bindingCache.set(binding.id, updated);
            }
        }
        return clone(conditionSet);
    };

    const attachBinding = async (input, options = {}) => {
        const conditionSet = await getSet(input.conditionSetId);
        if (!conditionSet) throw new Error('condition_set_not_found');
        const binding = normalizeConditionBinding({
            ...input,
            conditionSetRevision: conditionSet.revision,
            authorizedRevision: isSecurityConditionDomain(input.domain)
                ? (options.authorized === true ? conditionSet.revision : 0)
                : conditionSet.revision
        });
        if (isSecurityConditionDomain(binding.domain) && binding.authorizedRevision !== conditionSet.revision) {
            throw new Error('condition_binding_authorization_required');
        }
        await persist('condition_binding', binding.id, bindingProps(binding), options);
        bindingCache.set(binding.id, binding);
        return clone(binding);
    };

    const computedProperties = createComputedPropertyService({
        registry,
        persist,
        remove: removePersisted,
        read,
        list
    });
    const query = createConditionQueryService({
        registry,
        engine,
        loadCandidates,
        subscribeDependencies,
        executeOnce: executeQueryOnce,
        prepare: async (request, scope, candidates) => {
            await computedProperties.hydrate();
            await discoverConditionProperties({
                registry,
                candidates,
                scope,
                source: scope.candidateSource,
                preferred: request.preferredProperties || [],
                canReadProperty: request.canReadProperty
            });
        }
    });
    const conditionLists = createConditionListService({
        query,
        getSet,
        invalidateSet: (id) => setCache.delete(String(id || '')),
        subscribeChanges: subscribeDependencies,
        persist,
        remove: removePersisted,
        read,
        list
    });

    return Object.freeze({
        registry,
        engine,
        liveSources,
        evaluate: (...args) => engine.evaluate(...args),
        evaluateSync: (...args) => engine.evaluateSync(...args),
        match: (...args) => engine.match(...args),
        matchSync: (...args) => engine.matchSync(...args),
        filter: engine.filter,
        watch: engine.watch,
        unwatch: engine.unwatch,
        properties: Object.freeze({
            async discover(options = {}) {
                if (!Array.isArray(options.candidates) && options.authority !== 'local' && typeof discoverProperties === 'function') {
                    const remote = await discoverProperties(options);
                    if (remote) return remote;
                }
                const scope = options.scope || {};
                const candidates = Array.isArray(options.candidates)
                    ? options.candidates
                    : (typeof loadCandidates === 'function' ? await loadCandidates(scope, options) : []);
                // Computed properties are one discovery provider among
                // others. If their persistence authority is unavailable,
                // omit them (fail closed) without hiding schema, runtime and
                // live properties supplied by independent authorities.
                try {
                    await computedProperties.hydrate();
                } catch (error) {
                    options.onProviderError?.({ provider: 'computed', error });
                }
                return discoverConditionProperties({ registry, ...options, candidates, scope });
            }
        }),
        sources: Object.freeze({
            register: registry.registerSource,
            list: registry.sources
        }),
        computedProperties,
        query,
        lists: conditionLists,
        sets: Object.freeze({
            get: getSet,
            save: saveSet,
            async list(options = {}) {
                if (typeof list !== 'function') return Array.from(setCache.values()).map(clone);
                const rows = await list({ type: 'condition_set', ...options });
                return Promise.all((rows || []).map((row) => getSet(row.atome_id || row.id)));
            },
            async duplicate(id, { id: duplicateId, name, ...options } = {}) {
                const source = await getSet(id);
                if (!source) throw new Error('condition_set_not_found');
                return saveSet({ ...source, id: duplicateId, name: name || `${source.name} copy`, revision: 1, createdAt: null }, options);
            },
            async remove(id, options = {}) {
                await hydrateBindings();
                if (Array.from(bindingCache.values()).some((binding) => binding.conditionSetId === id)) {
                    throw new Error('condition_set_in_use');
                }
                await removePersisted(id, options);
                return setCache.delete(id);
            }
        }),
        bindings: Object.freeze({
            attach: attachBinding,
            async detach(id, options = {}) {
                if (!await getBinding(id)) return false;
                await removePersisted(id, options);
                return bindingCache.delete(id);
            },
            list(conditionSetId = null) {
                return Array.from(bindingCache.values())
                    .filter((binding) => !conditionSetId || binding.conditionSetId === conditionSetId)
                    .map(clone);
            },
            async load(conditionSetId = null) {
                await hydrateBindings();
                return Array.from(bindingCache.values())
                    .filter((binding) => !conditionSetId || binding.conditionSetId === conditionSetId)
                    .map(clone);
            },
            async evaluate(id, context = {}) {
                const binding = await getBinding(id);
                if (!binding || binding.enabled !== true) {
                    return { state: 'unknown', matched: false, decision: 'deny', reasonCode: 'condition_binding_unavailable' };
                }
                const conditionSet = await getSet(binding.conditionSetId);
                if (!conditionSet) {
                    return { state: 'unknown', matched: false, decision: 'deny', reasonCode: 'condition_set_unavailable' };
                }
                if (binding.conditionSetRevision !== conditionSet.revision
                    || (isSecurityConditionDomain(binding.domain) && binding.authorizedRevision !== conditionSet.revision)) {
                    return { state: 'unknown', matched: false, decision: 'deny', reasonCode: 'condition_binding_reauthorization_required' };
                }
                return engine.match(conditionSet, context, {
                    domain: binding.domain,
                    unknownPolicy: binding.unknownPolicy
                });
            }
        })
    });
}
