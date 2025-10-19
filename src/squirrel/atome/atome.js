const atomeDefaultsParams = {
    left: '0',
    top: '0',
    width: '69',
    height: '69',
    content: '',
    text: '',
    tag: 'default',
    background: '#272727',
    color: 'lightgray',
    units: { left: 'px', top: 'px', width: 'px', height: 'px' }
};
const hasOwn = Object.prototype.hasOwnProperty;
const DEFAULT_UNIT_PROPS = new Set([
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderRadius',
    'borderWidth',
    'fontSize',
    'lineHeight',
    'letterSpacing',
    'gap'
]);

const GLOBAL_STYLE_ALIASES = {
    align: 'alignItems',
    alignItems: 'alignItems',
    alignment: 'alignItems',
    justify: 'justifyContent',
    justifyContent: 'justifyContent',
    justification: 'justifyContent',
    justif: 'justifyContent',
    smooth: 'borderRadius',
    smmooth: 'borderRadius',
    radius: 'borderRadius',
    round: 'borderRadius',
    backgroundColor: 'background',
    bg: 'background',
    shadow: 'boxShadow',
    boxShadow: 'boxShadow',
    glow: 'boxShadow',
    color: 'background'
};

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
let atomeIdCounter = 0;

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

function coerceNumeric(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length) {
            const numeric = Number(trimmed);
            if (!Number.isNaN(numeric)) return numeric;
        }
    }
    return value;
}

function convertDefaultsToAODL(defaults = {}) {
    const result = {};
    const geometry = {};
    const geometryUnits = {};
    const spatial = {};
    const spatialUnits = {};
    const visual = {};

    if (defaults.width !== undefined) geometry.width = coerceNumeric(defaults.width);
    if (defaults.height !== undefined) geometry.height = coerceNumeric(defaults.height);

    if (defaults.units && typeof defaults.units === 'object') {
        if (defaults.units.width) geometryUnits.width = defaults.units.width;
        if (defaults.units.height) geometryUnits.height = defaults.units.height;
        if (defaults.units.left) spatialUnits.left = defaults.units.left;
        if (defaults.units.top) spatialUnits.top = defaults.units.top;
    }

    if (defaults.left !== undefined) spatial.left = coerceNumeric(defaults.left);
    if (defaults.top !== undefined) spatial.top = coerceNumeric(defaults.top);

    if (defaults.background !== undefined) visual.background = defaults.background;
    if (defaults.color !== undefined) visual.textColor = defaults.color;

    if (Object.keys(geometry).length) {
        if (Object.keys(geometryUnits).length) geometry.units = geometryUnits;
        result.geometry = geometry;
    }

    if (Object.keys(spatial).length) {
        if (Object.keys(spatialUnits).length) spatial.units = spatialUnits;
        result.spatial = spatial;
    }

    if (Object.keys(visual).length) {
        result.visual = visual;
    }

    const nonSectionKeys = ['content', 'text', 'tag', 'type'];
    nonSectionKeys.forEach((key) => {
        if (defaults[key] !== undefined) result[key] = defaults[key];
    });

    return result;
}

function resolveParent(candidate) {
    const selector = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '#view';
    if (typeof document !== 'undefined' && document.querySelector(selector)) return selector;
    return 'body';
}

function normalizeStyleValue(key, value, units) {
    if (value === null || value === undefined) return undefined;

    const resolveUnit = () => {
        if (units && hasOwn.call(units, key)) {
            const unit = units[key];
            if (typeof unit === 'string') {
                const trimmed = unit.trim();
                if (trimmed.length) return trimmed;
            }
        }
        return DEFAULT_UNIT_PROPS.has(key) ? 'px' : '';
    };

    if (typeof value === 'number') {
        const unit = resolveUnit();
        return unit ? `${value}${unit}` : `${value}`;
    }

    if (typeof value === 'string') {
        const trimmedValue = value.trim();
        if (!trimmedValue.length) return undefined;
        if (DEFAULT_UNIT_PROPS.has(key)) {
            const numeric = Number(trimmedValue);
            if (!Number.isNaN(numeric)) {
                const unit = resolveUnit();
                return unit ? `${numeric}${unit}` : `${numeric}`;
            }
        }
        return trimmedValue;
    }

    return value;
}

function Atome(params = {}) {
    if (!(this instanceof Atome)) return new Atome(params);

    const parsed = parseAtomeInput(params);
    const trimmedUnits = normalizeUnitsMap(parsed.units);
    const incomingId = parsed.config.id;
    const elementId = incomingId !== undefined ? String(incomingId) : `atome_${++atomeIdCounter}`;
    const parentSelector = resolveParent(parsed.config.parent);
    const displayText = parsed.config.text ?? parsed.config.content ?? '';

    const cssStyles = {};
    for (const key in parsed.styles) {
        if (!hasOwn.call(parsed.styles, key)) continue;
        const normalized = normalizeStyleValue(key, parsed.styles[key], trimmedUnits);
        if (normalized !== undefined) cssStyles[key] = normalized;
    }

    const element = $('div', {
        id: elementId,
        parent: parentSelector,
        css: cssStyles,
        text: displayText
    });

    if (element && element.dataset && parsed.config.tag !== undefined) {
        element.dataset.tag = parsed.config.tag;
    }

    this.element = element;
    this.units = { ...trimmedUnits };
    this._styles = { ...parsed.styles };
    this.styles = this._styles;

    Object.assign(this, parsed.config);
    this.id = elementId;
    this.parent = parsed.config.parent !== undefined ? parsed.config.parent : parentSelector;
    this.text = parsed.config.text;
    this.content = parsed.config.content;
    this.tag = parsed.config.tag;
    this.type = parsed.config.type;

    parsed.applied.forEach(({ canonicalKey, originalKey, value }) => {
        if (value === undefined || value === null) {
            delete this[canonicalKey];
            if (originalKey !== canonicalKey) delete this[originalKey];
        } else {
            this[canonicalKey] = value;
            if (originalKey !== canonicalKey) this[originalKey] = value;
        }
    });

    const sectionState = initializeSectionState(parsed.sections);
    this._sections = sectionState.state;
    this._sectionMeta = sectionState.meta;
    SECTION_NAMES.forEach((sectionName) => {
        if (!this._sections[sectionName]) this._sections[sectionName] = {};
        this[sectionName] = createSectionProxy(this, sectionName);
    });

    if (parsed.children.length) {
        this.children = parsed.children.map((childParams) => {
            const childConfig = { ...childParams };
            if (!childConfig.parent) childConfig.parent = `#${elementId}`;
            return new Atome(childConfig);
        });
    } else {
        this.children = [];
    }

    return this;
}

Atome.prototype.set = function setAtome(next = {}) {
    if (!next || typeof next !== 'object') return this;
    if (!this.element) return this;

    const parsed = parseAtomeInput(next, { forUpdate: true });

    mergeUnitsInto(this.units, parsed.units);

    for (const key in parsed.styles) {
        if (!hasOwn.call(parsed.styles, key)) continue;
        const normalized = normalizeStyleValue(key, parsed.styles[key], this.units);
        if (normalized !== undefined) {
            this.element.style[key] = normalized;
            this._styles[key] = parsed.styles[key];
            this[key] = parsed.styles[key];
        } else {
            this.element.style[key] = '';
            delete this._styles[key];
            delete this[key];
        }
    }

    parsed.applied.forEach(({ canonicalKey, originalKey, value }) => {
        this[canonicalKey] = value;
        if (originalKey !== canonicalKey) this[originalKey] = value;
    });

    if (parsed.config.text !== undefined || parsed.config.content !== undefined) {
        const displayText = parsed.config.text ?? parsed.config.content ?? '';
        this.element.textContent = displayText;
        if (parsed.config.text !== undefined) this.text = parsed.config.text;
        if (parsed.config.content !== undefined) this.content = parsed.config.content;
    }

    if (parsed.config.tag !== undefined) {
        this.tag = parsed.config.tag;
        if (this.element.dataset) {
            if (parsed.config.tag === null || parsed.config.tag === '') {
                delete this.element.dataset.tag;
            } else {
                this.element.dataset.tag = parsed.config.tag;
            }
        }
    }

    if (parsed.config.type !== undefined) this.type = parsed.config.type;
    if (parsed.config.parent !== undefined) this.parent = parsed.config.parent;

    for (const configKey in parsed.config) {
        if (!hasOwn.call(parsed.config, configKey)) continue;
        if (configKey === 'text' || configKey === 'content' || configKey === 'tag' || configKey === 'type' || configKey === 'parent' || configKey === 'id') continue;
        this[configKey] = parsed.config[configKey];
    }

    for (const sectionName in parsed.sections) {
        if (!hasOwn.call(parsed.sections, sectionName)) continue;
        const entry = parsed.sections[sectionName];
        if (!entry) continue;
        if (entry.values && typeof entry.values === 'object') {
            const valuesTarget = this._sections[sectionName] || (this._sections[sectionName] = {});
            for (const cssKey in entry.values) {
                if (!hasOwn.call(entry.values, cssKey)) continue;
                const incoming = entry.values[cssKey];
                if (incoming === undefined || incoming === null) delete valuesTarget[cssKey];
                else valuesTarget[cssKey] = incoming;
            }
        }
        if (entry.meta && typeof entry.meta === 'object') {
            const metaTarget = this._sectionMeta[sectionName] || (this._sectionMeta[sectionName] = {});
            for (const metaKey in entry.meta) {
                if (!hasOwn.call(entry.meta, metaKey)) continue;
                const incomingMeta = entry.meta[metaKey];
                if (incomingMeta === undefined || incomingMeta === null) delete metaTarget[metaKey];
                else metaTarget[metaKey] = incomingMeta;
            }
        }
    }

    if (parsed.children.length) {
        if (!Array.isArray(this.children)) this.children = [];
        parsed.children.forEach((childParams) => {
            const childConfig = { ...childParams };
            if (!childConfig.parent) childConfig.parent = `#${this.id}`;
            const child = new Atome(childConfig);
            this.children.push(child);
        });
    }

    return this;
};

Atome.box = function box(params = {}) {
    const { mergeDefaults = true, ...rest } = params || {};
    if (!mergeDefaults) return new Atome(rest);
    const defaultsSource = (typeof globalThis !== 'undefined' && globalThis.atomeDefaultsParams)
        ? globalThis.atomeDefaultsParams
        : atomeDefaultsParams;
    const mergedPayload = mergeDeep(convertDefaultsToAODL(defaultsSource), rest);
    return new Atome(mergedPayload);
};

if (typeof globalThis !== 'undefined') {
    globalThis.Atome = Atome;
    globalThis.atomeDefaultsParams = atomeDefaultsParams;
    globalThis.Atome.box = Atome.box;
}
