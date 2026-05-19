import assert from 'node:assert/strict';

import { createPersistentMemoryStore } from './persistent_memory.js';

const storage = new Map();
const env = {
    localStorage: {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        }
    }
};

const memory = createPersistentMemoryStore({ env, storageKey: 'persistent_memory_test' });
memory.setPreference('assistant.confirm_send', false);
memory.recordWorkflowPattern({ domain: 'mail', action: 'list' });
memory.recordWorkflowPattern({ domain: 'mail', action: 'list' });
memory.recordContactAffinity({ contact_id: 'contact_pm_1', label: 'Regis', channel: 'mail' });

const summary = memory.getSummary();

assert.equal(summary.preference_overrides['assistant.confirm_send'], false, 'persistent memory should store preference overrides');
assert.equal(summary.workflow_patterns[0]?.key, 'mail:list', 'persistent memory should summarize workflow patterns');
assert.equal(summary.contact_affinity[0]?.contact_id, 'contact_pm_1', 'persistent memory should summarize contact affinity');

console.log('persistent_memory.test: PASS');
process.exit(0);
