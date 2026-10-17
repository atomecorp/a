import { TauriAdapter } from '../adole.js';
import { isTauriRuntime } from './runtime.js';
import { getSessionState } from './session.js';
import { pendingWorkspaceEvents, refusedWorkspaceEvents } from './guest_workspace_store.js';
import { readBrowserWorkspaceSyncProgress } from './browser_workspace.js';

// Read-only, account-bound view of the existing delivery and persistence owners.
export async function getWorkspaceSyncStatus() {
    const session = getSessionState(), principal = session.user?.id;
    const environment = String(globalThis.window?.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || '');
    if (!principal || !['authenticated', 'anonymous'].includes(session.mode)) throw new Error('local_authorization_required');
    let status;
    if (isTauriRuntime()) {
        const result = await TauriAdapter.sync.getPending();
        if (result?.ok !== true && result?.success !== true) throw new Error(result?.error || 'sync_status_unavailable');
        const data = result.data || result;
        status = { ...(data.sync_status || {}), pending_delivery_count: data.pending_delivery_count };
    } else {
        const [pending, refused] = await Promise.all([pendingWorkspaceEvents(principal), refusedWorkspaceEvents(principal)]);
        const engine = globalThis.window?.Squirrel?.SyncEngine?.getState?.();
        const progress = readBrowserWorkspaceSyncProgress();
        status = { principal_id: principal, environment_fingerprint: engine?.environment_fingerprint,
            connection_state: ['authentication_expired', 'authentication_invalid'].includes(engine?.error) ? 'auth_required' : engine?.connected ? 'connected' : 'disconnected',
            restore_state: engine?.registered && engine.pending_replay_count === 0 ? progress?.restore_state || 'unknown' : 'receiving',
            pending_replay_count: engine?.pending_replay_count || 0, pending_delivery_count: pending.length + refused.length,
            last_error_code: refused.length ? 'workspace_sync_refused' : progress?.last_error_code || engine?.error || null };
    }
    if (getSessionState().user?.id !== principal || getSessionState().mode !== session.mode) throw new Error('workspace_identity_changed');
    if (String(globalThis.window?.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || '') !== environment) throw new Error('workspace_environment_changed');
    if (isTauriRuntime() && environment && status.environment_fingerprint && status.environment_fingerprint !== environment) throw new Error('sync_status_environment_mismatch');
    if (status.principal_id && status.principal_id !== principal) throw new Error('sync_status_principal_mismatch');
    return { connection_state: 'disconnected', restore_state: 'unknown', pending_replay_count: 0,
        last_error_code: null, ...status, principal_id: principal };
}
