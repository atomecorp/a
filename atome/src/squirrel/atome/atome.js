import {
    atomeDefaultsParams,
    hasOwn,
    DEFAULT_UNIT_PROPS
} from './atome_const.js';
import {
    SECTION_NAMES,
    mergeUnitsInto,
    parseAtomeInput,
    normalizeUnitsMap,
    initializeSectionState,
    createSectionProxy,
    mergeDeep
} from './atome_sections.js';
import {
    teardownEventBinding,
    clearAllEvents
} from './atome_events.js';
import {
    bindGenericEventGroup,
    bindDraggableEvents,
    bindTouchableEvents
} from './atome_drag_binder.js';
import {
    bindResizableEvents
} from './atome_resize_binder.js';

let atomeIdCounter = 0;

const EVENT_BINDERS = {
    draggable: bindDraggableEvents,
    touchable: bindTouchableEvents,
    resizable: bindResizableEvents
};

function applyEvents(instance, eventsConfig) {
    if (!instance) return;
    if (eventsConfig === null) {
        clearAllEvents(instance);
        return;
    }
    if (!eventsConfig || typeof eventsConfig !== 'object') return;

    if (!instance._eventBindings) instance._eventBindings = {};
    if (!instance.events) instance.events = {};

    const nextEvents = mergeDeep({}, instance.events || {});

    for (const groupName in eventsConfig) {
        if (!hasOwn.call(eventsConfig, groupName)) continue;
        const groupConfig = eventsConfig[groupName];
        if (instance._eventBindings[groupName]) {
            teardownEventBinding(instance._eventBindings[groupName]);
            delete instance._eventBindings[groupName];
        }

        if (groupConfig === null || groupConfig === false) {
            delete nextEvents[groupName];
            continue;
        }

        if (!groupConfig || typeof groupConfig !== 'object') continue;

        const clonedConfig = mergeDeep({}, groupConfig);
        const binder = EVENT_BINDERS[groupName] || bindGenericEventGroup;
        const binding = binder(instance, groupName, clonedConfig);

        if (!binding) {
            delete nextEvents[groupName];
            continue;
        }

        instance._eventBindings[groupName] = binding;
        nextEvents[groupName] = clonedConfig;
    }

    instance.events = nextEvents;
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
    const eventsConfig = parsed.config.events;
    if (eventsConfig !== undefined) delete parsed.config.events;
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

    this._eventBindings = {};
    this.events = {};
    applyEvents(this, eventsConfig);

    return this;
}

Atome.prototype.set = function setAtome(next = {}) {
    if (!next || typeof next !== 'object') return this;
    if (!this.element) return this;

    const parsed = parseAtomeInput(next, { forUpdate: true });
    const eventsConfig = parsed.config.events;
    if (eventsConfig !== undefined) delete parsed.config.events;

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
        if (value === undefined || value === null) {
            delete this[canonicalKey];
            if (originalKey !== canonicalKey) delete this[originalKey];
        } else {
            this[canonicalKey] = value;
            if (originalKey !== canonicalKey) this[originalKey] = value;
        }
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
        if (configKey === 'text' || configKey === 'content' || configKey === 'tag' || configKey === 'type' || configKey === 'parent' || configKey === 'id' || configKey === 'events') continue;
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

    if (eventsConfig !== undefined) {
        if (!this._eventBindings) this._eventBindings = {};
        if (!this.events) this.events = {};
        applyEvents(this, eventsConfig);
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

