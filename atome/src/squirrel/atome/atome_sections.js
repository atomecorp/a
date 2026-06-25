// Extracted from atome.js: section/style model + input parsing + proxies.
import {
    hasOwn,
    GLOBAL_STYLE_ALIASES
} from './atome_const.js';

const SECTION_DEFINITIONS = {
    geometry: {
        alias: {
            width: 'width',
            height: 'height',
            depth: 'depth',
            minWidth: 'minWidth',
            minHeight: 'minHeight',
            maxWidth: 'maxWidth',
            maxHeight: 'maxHeight'
        },
        styleKeys: new Set(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'])
    },
    spatial: {
        alias: {
            left: 'left',
            top: 'top',
            right: 'right',
            bottom: 'bottom',
            x: 'left',
            y: 'top',
            z: 'zIndex',
            zIndex: 'zIndex'
        },
        styleKeys: new Set(['left', 'top', 'right', 'bottom', 'zIndex'])
    },
    visual: {
        alias: {
            background: 'background',
            backgroundColor: 'background',
            color: 'background',
            fg: 'color',
            foreground: 'color',
            fontColor: 'color',
            textColor: 'color',
            fill: 'background',
            smooth: 'borderRadius',
            smmooth: 'borderRadius',
            borderRadius: 'borderRadius',
            border: 'border',
            borderColor: 'borderColor',
            borderWidth: 'borderWidth',
            borderStyle: 'borderStyle',
            opacity: 'opacity',
            shadow: 'boxShadow',
            boxShadow: 'boxShadow'
        },
        styleKeys: new Set([
            'background',
            'color',
            'borderRadius',
            'border',
            'borderColor',
            'borderWidth',
            'borderStyle',
            'opacity',
            'boxShadow'
        ])
    },
    layout: {
        alias: {
            display: 'display',
            position: 'position',
            align: 'alignItems',
            alignItems: 'alignItems',
            alignment: 'alignItems',
            justify: 'justifyContent',
            justifyContent: 'justifyContent',
            justif: 'justifyContent',
            justification: 'justifyContent',
            direction: 'flexDirection',
            flexDirection: 'flexDirection',
            wrap: 'flexWrap',
            flexWrap: 'flexWrap',
            gap: 'gap'
        },
        styleKeys: new Set([
            'display',
            'position',
            'alignItems',
            'justifyContent',
            'flexDirection',
            'flexWrap',
            'gap'
        ])
    },
    typography: {
        alias: {
            color: 'color',
            textColor: 'color',
            size: 'fontSize',
            fontSize: 'fontSize',
            weight: 'fontWeight',
            fontWeight: 'fontWeight',
            align: 'textAlign',
            textAlign: 'textAlign',
            line: 'lineHeight',
            lineHeight: 'lineHeight',
            spacing: 'letterSpacing',
            letterSpacing: 'letterSpacing'
        },
        styleKeys: new Set([
            'color',
            'fontSize',
            'fontWeight',
            'textAlign',
            'lineHeight',
            'letterSpacing'
        ])
    }
};

for (const sectionName in SECTION_DEFINITIONS) {
    if (!hasOwn.call(SECTION_DEFINITIONS, sectionName)) continue;
    const aliasMap = SECTION_DEFINITIONS[sectionName].alias;
    const identityKeys = new Set(Object.values(aliasMap));
    identityKeys.forEach((canonicalKey) => {
        if (!hasOwn.call(aliasMap, canonicalKey)) aliasMap[canonicalKey] = canonicalKey;
    });
}

const SECTION_NAMES = Object.keys(SECTION_DEFINITIONS);

const STYLE_TO_SECTION = {
    width: 'geometry',
    height: 'geometry',
    minWidth: 'geometry',
    minHeight: 'geometry',
    maxWidth: 'geometry',
    maxHeight: 'geometry',
    left: 'spatial',
    top: 'spatial',
    right: 'spatial',
    bottom: 'spatial',
    zIndex: 'spatial',
    background: 'visual',
    color: 'visual',
    borderRadius: 'visual',
    border: 'visual',
    borderColor: 'visual',
    borderWidth: 'visual',
    borderStyle: 'visual',
    opacity: 'visual',
    boxShadow: 'visual',
    display: 'layout',
    position: 'layout',
    alignItems: 'layout',
    justifyContent: 'layout',
    flexDirection: 'layout',
    flexWrap: 'layout',
    gap: 'layout',
    fontSize: 'typography',
    fontWeight: 'typography',
    textAlign: 'typography',
    lineHeight: 'typography',
    letterSpacing: 'typography'
};

const KNOWN_CONFIG_KEYS = new Set(['id', 'parent', 'tag', 'text', 'content', 'type', 'name', 'data', 'meta', 'role']);
const STYLE_KEY_CACHE = new Map();

function resolveStyleKey(sectionName, rawKey) {
    if (rawKey === null || rawKey === undefined) return null;
    let key = rawKey;
    let cacheToken = null;

    if (typeof rawKey === 'string') {
        key = rawKey.trim();
        if (key === '') return null;
        cacheToken = `${sectionName || ''}|${key}`;
        if (STYLE_KEY_CACHE.has(cacheToken)) return STYLE_KEY_CACHE.get(cacheToken);
    }

    if (sectionName && hasOwn.call(SECTION_DEFINITIONS, sectionName)) {
        const aliasMap = SECTION_DEFINITIONS[sectionName].alias;
        if (hasOwn.call(aliasMap, key)) {
            const canonical = aliasMap[key];
            if (cacheToken) STYLE_KEY_CACHE.set(cacheToken, canonical);
            return canonical;
        }
    }
    if (hasOwn.call(GLOBAL_STYLE_ALIASES, key)) {
        const canonical = GLOBAL_STYLE_ALIASES[key];
        if (cacheToken) STYLE_KEY_CACHE.set(cacheToken, canonical);
        return canonical;
    }
    if (cacheToken) STYLE_KEY_CACHE.set(cacheToken, key);
    return key;
}

function trimUnitValue(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    }
    return value;
}

function mergeUnitsInto(target, source) {
    if (!source) return;
    for (const key in source) {
        if (!hasOwn.call(source, key)) continue;
        const value = source[key];
        const trimmed = trimUnitValue(value);
        if (trimmed === undefined) {
            delete target[key];
        } else {
            target[key] = trimmed;
        }
    }
}

function mergeUnitsFromSection(sectionName, unitsSource, target) {
    if (!unitsSource || typeof unitsSource !== 'object') return;
    const mapped = {};
    for (const unitKey in unitsSource) {
        if (!hasOwn.call(unitsSource, unitKey)) continue;
        const canonical = resolveStyleKey(sectionName, unitKey);
        if (!canonical) continue;
        const trimmed = trimUnitValue(unitsSource[unitKey]);
        if (trimmed !== undefined) mapped[canonical] = trimmed;
    }
    mergeUnitsInto(target, mapped);
}

function ensureSectionEntry(context, sectionName) {
    if (!sectionName) return null;
    if (!context.sections[sectionName]) {
        context.sections[sectionName] = { values: {}, meta: {} };
    }
    return context.sections[sectionName];
}

function recordAppliedEntry(context, originalKey, canonicalKey, sectionName, value) {
    context.applied.push({ originalKey, canonicalKey, sectionName, value });
}

function applyStyleEntry(context, key, value, sectionHint) {
    const canonicalKey = resolveStyleKey(sectionHint, key);
    if (!canonicalKey) return;
    const sectionName = sectionHint || STYLE_TO_SECTION[canonicalKey] || null;
    const isStyle = sectionName !== null && (
        (STYLE_TO_SECTION[canonicalKey] !== undefined) ||
        (sectionHint && SECTION_DEFINITIONS[sectionHint]?.styleKeys?.has(canonicalKey))
    );

    if (!isStyle) {
        const sectionEntry = ensureSectionEntry(context, sectionName || sectionHint);
        if (sectionEntry) sectionEntry.meta[canonicalKey] = value;
        else context.config[canonicalKey] = value;
        return;
    }

    context.styles[canonicalKey] = value;
    recordAppliedEntry(context, key, canonicalKey, sectionName, value);

    if (sectionName) {
        const sectionEntry = ensureSectionEntry(context, sectionName);
        sectionEntry.values[canonicalKey] = value;
    }
}

function parseSection(sectionName, sectionValue, context) {
    if (!sectionValue || typeof sectionValue !== 'object') return;
    for (const key in sectionValue) {
        if (!hasOwn.call(sectionValue, key)) continue;
        if (key === 'units') {
            mergeUnitsFromSection(sectionName, sectionValue.units, context.units);
            continue;
        }
        if (key === 'children' && Array.isArray(sectionValue.children)) {
            context.children.push(...sectionValue.children);
            continue;
        }
        const value = sectionValue[key];
        applyStyleEntry(context, key, value, sectionName);
    }
}

function parseAtomeInput(rawParams = {}, { forUpdate = false } = {}) {
    const context = {
        config: {},
        styles: {},
        units: {},
        sections: {},
        children: [],
        applied: [],
        meta: {}
    };

    if (!rawParams || typeof rawParams !== 'object') return context;

    for (const key in rawParams) {
        if (!hasOwn.call(rawParams, key)) continue;
        const value = rawParams[key];
        if (value === undefined) continue;

        if (key === 'children' && Array.isArray(value)) {
            context.children.push(...value);
            continue;
        }

        if (key === 'units' && value && typeof value === 'object') {
            mergeUnitsFromSection(null, value, context.units);
            continue;
        }

        if (hasOwn.call(SECTION_DEFINITIONS, key) && value && typeof value === 'object') {
            parseSection(key, value, context);
            continue;
        }

        if (KNOWN_CONFIG_KEYS.has(key)) {
            context.config[key] = value;
            continue;
        }

        if (key === 'mergeDefaults') continue;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            context.config[key] = value;
            continue;
        }

        applyStyleEntry(context, key, value, null);
    }

    return context;
}

function normalizeUnitsMap(units = {}) {
    const trimmed = {};
    mergeUnitsInto(trimmed, units);
    return trimmed;
}

function initializeSectionState(sections = {}) {
    const state = {};
    const meta = {};
    SECTION_NAMES.forEach((name) => {
        const entry = sections[name];
        state[name] = entry && entry.values ? { ...entry.values } : {};
        meta[name] = entry && entry.meta ? { ...entry.meta } : {};
    });
    return { state, meta };
}

function createUnitsProxy(instance, sectionName) {
    return new Proxy({}, {
        get(_, key) {
            const canonical = resolveStyleKey(sectionName, key);
            if (!canonical) return undefined;
            return instance.units[canonical];
        },
        set(_, key, value) {
            const canonical = resolveStyleKey(sectionName, key);
            if (!canonical) return false;
            const trimmed = trimUnitValue(value);
            if (trimmed === undefined) {
                delete instance.units[canonical];
            } else {
                instance.units[canonical] = trimmed;
            }
            const sectionState = instance._sections?.[sectionName];
            if (sectionState && hasOwn.call(sectionState, canonical)) {
                instance.set({ [sectionName]: { [key]: sectionState[canonical] } });
            }
            return true;
        },
        ownKeys() {
            return Object.keys(instance._sections?.[sectionName] || {});
        },
        getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true };
        }
    });
}

function createSectionProxy(instance, sectionName) {
    const target = instance._sections[sectionName];
    const metaTarget = instance._sectionMeta[sectionName];
    const unitsProxy = createUnitsProxy(instance, sectionName);
    return new Proxy(target, {
        get(obj, key) {
            if (key === 'units') return unitsProxy;
            const canonical = resolveStyleKey(sectionName, key);
            if (!canonical) return undefined;
            if (hasOwn.call(obj, canonical)) return obj[canonical];
            if (metaTarget && hasOwn.call(metaTarget, canonical)) return metaTarget[canonical];
            return undefined;
        },
        set(_, key, value) {
            if (key === 'units') {
                if (value && typeof value === 'object') {
                    Object.keys(value).forEach((unitKey) => {
                        unitsProxy[unitKey] = value[unitKey];
                    });
                }
                return true;
            }
            instance.set({ [sectionName]: { [key]: value } });
            return true;
        },
        deleteProperty(_, key) {
            instance.set({ [sectionName]: { [key]: null } });
            return true;
        },
        ownKeys(obj) {
            const styleKeys = Reflect.ownKeys(obj);
            const metaKeys = metaTarget ? Reflect.ownKeys(metaTarget) : [];
            return Array.from(new Set([...styleKeys, ...metaKeys]));
        },
        getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true };
        }
    });
}

function mergeDeep(base = {}, extension = {}) {
    const output = Array.isArray(base) ? [...base] : { ...base };
    for (const key in extension) {
        if (!hasOwn.call(extension, key)) continue;
        const value = extension[key];
        if (
            value && typeof value === 'object' && !Array.isArray(value) &&
            hasOwn.call(output, key) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])
        ) {
            output[key] = mergeDeep(output[key], value);
        } else {
            output[key] = value;
        }
    }
    return output;
}


export {
    SECTION_DEFINITIONS, SECTION_NAMES, STYLE_TO_SECTION, KNOWN_CONFIG_KEYS, STYLE_KEY_CACHE, resolveStyleKey, trimUnitValue, mergeUnitsInto, mergeUnitsFromSection, ensureSectionEntry, recordAppliedEntry, applyStyleEntry, parseSection, parseAtomeInput, normalizeUnitsMap, initializeSectionState, createUnitsProxy, createSectionProxy, mergeDeep
};
