import assert from 'node:assert/strict';

const commits = [];
const storage = new Map();

globalThis.localStorage = {
    getItem: (key) => storage.get(String(key)) || null,
    setItem: (key, value) => storage.set(String(key), String(value)),
    removeItem: (key) => storage.delete(String(key))
};
globalThis.window = {
    __currentProject: { id: 'project_a' },
    Atome: {
        commit: async (event) => {
            commits.push(event);
            return { ok: true };
        }
    },
    AdoleAPI: {
        atomes: {
            list: async () => []
        }
    },
    addEventListener() { },
    dispatchEvent() { }
};
globalThis.CustomEvent = class {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
    }
};

await import('../../eVe/intuition/tools/copy.js');

const result = await window.eveClipboardStore.persist([{
    id: 'group_a',
    createdAt: '2026-05-24T00:00:00.000Z',
    count: 1,
    items: [{ kind: 'text', text: 'hello' }]
}]);

assert.equal(result.ok, true);
assert.equal(commits.length, 1);
assert.equal(commits[0].atome_id, 'atome_copy_project_a');
assert.equal(commits[0].project_id, 'project_a');
assert.equal(commits[0].parent_id, 'project_a');
assert.equal(commits[0].props.kind, 'clipboard');
[
    'type',
    'project_id',
    'projectId',
    'parent_id',
    'parentId'
].forEach((key) => assert.equal(Object.hasOwn(commits[0].props, key), false, key));

console.log('copy_clipboard_sanitization: ok');
