import { beforeEach, expect, test, vi } from 'vitest';
const owner = vi.hoisted(() => ({ session: null, pending: vi.fn() }));
vi.mock('../../atome/src/squirrel/apis/unified/adole.js', () => ({ TauriAdapter: { sync: { getPending: owner.pending } } }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/runtime.js', () => ({ isTauriRuntime: () => true }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/session.js', () => ({ getSessionState: () => owner.session }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js', () => ({ pendingWorkspaceEvents: vi.fn(), refusedWorkspaceEvents: vi.fn() }));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/browser_workspace.js', () => ({ readBrowserWorkspaceSyncProgress: vi.fn() }));
import { getWorkspaceSyncStatus } from '../../atome/src/squirrel/apis/unified/adole_api/sync_status.js';
import { workspaceSyncMessageKey } from '../../eVe/domains/dashboard/dashboard_sync_status.js';

beforeEach(() => {
    owner.session = { mode: 'authenticated', user: { id: 'account-a' } };
    owner.pending.mockReset();
});
test('reads pending delivery and restoration from the canonical native owner', async () => {
    owner.pending.mockResolvedValue({ ok: true, data: { pending_delivery_count: 2,
        sync_status: { principal_id: 'account-a', connection_state: 'connected', restore_state: 'ready' } } });
    const status = await getWorkspaceSyncStatus();
    expect(status.pending_delivery_count).toBe(2);
    expect(workspaceSyncMessageKey(status)).toBe('');
});
test('rejects an obsolete account response after an account switch', async () => {
    let resolve;
    owner.pending.mockReturnValue(new Promise(done => { resolve = done; }));
    const reading = getWorkspaceSyncStatus();
    owner.session = { mode: 'authenticated', user: { id: 'account-b' } };
    resolve({ ok: true, data: { sync_status: { principal_id: 'account-a' } } });
    await expect(reading).rejects.toThrow('workspace_identity_changed');
});
test('rejects a status belonging to another locally authenticated principal', async () => {
    owner.pending.mockResolvedValue({ ok: true, data: { sync_status: { principal_id: 'account-b' } } });
    await expect(getWorkspaceSyncStatus()).rejects.toThrow('sync_status_principal_mismatch');
});
test('distinguishes retrieval, local offline work, remote authorization, recovery error and settled metadata', () => {
    const ready = { connection_state: 'connected', restore_state: 'ready', pending_delivery_count: 0 };
    expect(workspaceSyncMessageKey(ready)).toBe('');
    expect(workspaceSyncMessageKey({ ...ready, restore_state: 'receiving' })).toBe('');
    expect(workspaceSyncMessageKey({ ...ready, connection_state: 'disconnected' })).toBe('eve.sync.offline');
    expect(workspaceSyncMessageKey({ ...ready, connection_state: 'auth_required' })).toBe('eve.sync.reconnect');
    expect(workspaceSyncMessageKey({ ...ready, restore_state: 'error' })).toBe('eve.sync.recovery_failed');
});
