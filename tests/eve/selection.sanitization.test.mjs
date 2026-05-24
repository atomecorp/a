import assert from 'node:assert/strict';

globalThis.window = {
    SelectionAPI: null,
    __EVE_SELECTION_DEBUG__: false,
    __selectedAtomeIds: [],
    __selectedAtomeId: null,
    addEventListener() { },
    removeEventListener() { },
    dispatchEvent() { }
};
globalThis.CustomEvent = class {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};

const {
    configureSelection,
    selectionState,
    syncSelectionState
} = await import('../../eVe/intuition/runtime/selection.js');

let persisted = 0;
configureSelection({
    updateAtomeProperties: () => {
        persisted += 1;
    }
});

selectionState.ids = new Set();
selectionState.lastId = null;
syncSelectionState(['shape_a'], 'shape_a');
syncSelectionState([], null);

assert.equal(persisted, 0);

console.log('selection_sanitization: ok');
