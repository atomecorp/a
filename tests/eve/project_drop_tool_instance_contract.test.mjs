import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const projectDrop = readFileSync(resolve(root, 'eVe/intuition/tools/project_drop.js'), 'utf8');
const finder = readFileSync(resolve(root, 'eVe/intuition/tools/finder.js'), 'utf8');

assert.ok(projectDrop.includes('data-tool-projection-host="true"'), 'project tool drops must use projection host selectors');
assert.ok(projectDrop.includes('data-tool-instance-id'), 'project tool drops must use tool instance ids');
assert.equal(projectDrop.includes('data-tool-shortcut'), false, 'project tool drops must not use legacy shortcut selectors');
assert.equal(projectDrop.includes('tool_shortcut'), false, 'project tool drops must not create legacy shortcut roles');
assert.equal(projectDrop.includes('toolShortcut'), false, 'project tool drops must not create legacy shortcut flags');
assert.ok(finder.includes('icon_key: icon || null'), 'finder drag payload must preserve tool icon keys');
assert.ok(finder.includes('canonicalByToolId'), 'finder must let canonical registry records override stale persisted tool records');
assert.equal(finder.includes('if (existingToolIds.has(normalizedToolId)) return;'), false, 'finder must not keep stale persisted tool metadata ahead of registry metadata');

console.log('project_drop_tool_instance_contract.test: PASS');
