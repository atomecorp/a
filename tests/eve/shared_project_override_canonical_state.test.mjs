import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FastifyAdapter } from '../../atome/src/squirrel/apis/unified/adole.js';
import { createSharedProjectOverrideRuntime } from '../../eVe/intuition/runtime/shared_project_override_runtime.js';

test('linked project overrides rebuild from the canonical active share inbox', async () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    const originalInbox = FastifyAdapter.share.inbox;
    const originalGet = FastifyAdapter.atome.get;
    const originalGetToken = FastifyAdapter.getToken;
    let localStorageReads = 0;
    let localStorageWrites = 0;

    try {
        globalThis.window = {};
        globalThis.localStorage = {
            getItem() {
                localStorageReads += 1;
                return null;
            },
            setItem() {
                localStorageWrites += 1;
            }
        };
        FastifyAdapter.getToken = () => 'qa-token';
        FastifyAdapter.share.inbox = async () => ({
            success: true,
            data: [{
                atome_id: 'gv_active_share_request',
                properties: {
                    status: 'active',
                    share_type: 'linked',
                    receiver_project_id: 'gv_receiver_project',
                    atome_ids: ['gv_shared_shape']
                }
            }]
        });
        FastifyAdapter.atome.get = async (atomeId) => ({
            success: true,
            atome: {
                atome_id: atomeId,
                type: 'shape',
                project_id: 'gv_owner_project',
                properties: { left: 42, top: 24 }
            }
        });

        const runtime = createSharedProjectOverrideRuntime({
            resolveCurrentUserId: () => 'gv_receiver',
            extractAtomeFromResult: (payload) => payload?.atome || null,
            toErrorMessage: (error) => error?.message || String(error),
            debugLog: () => {}
        });
        const records = await runtime.fetchSharedOverrideAtomes('gv_receiver_project', []);
        assert.equal(records.length, 1);
        assert.equal(records[0].atome_id, 'gv_shared_shape');
        assert.equal(records[0].project_id, 'gv_receiver_project');
        assert.equal(localStorageReads, 0);
        assert.equal(localStorageWrites, 0);
    } finally {
        FastifyAdapter.share.inbox = originalInbox;
        FastifyAdapter.atome.get = originalGet;
        FastifyAdapter.getToken = originalGetToken;
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    }
});
