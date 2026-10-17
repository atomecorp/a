/** Native OS tokens/inbox feed the existing authenticated WebSocket and tools. */
export function installCommunicationPushClient({ env, send, ensureSession, readRemoteSession, execute,
    invoke = env?.__ATOME_IOS_NATIVE_INVOKE } = {}) {
    if (typeof invoke !== 'function') return null;
    let running = null, stopped = false, pendingRun = false;
    const listeners = new AbortController();
    const report = error => env.dispatchEvent(new env.CustomEvent('squirrel:push-error', { detail: { code: error.message } }));
    const run = () => {
        if (stopped) return running;
        if (running) { pendingRun = true; return running; }
        running = (async () => {
            await ensureSession();
            const account = await readRemoteSession();
            if (!account?.userId) return;
            const pending = await invoke('notifications_take', {});
            for (const item of pending.items || []) {
                if (item.principal_id !== account.userId) continue;
                const current = await readRemoteSession();
                if (current?.userId !== account.userId || current.session?.id !== account.session?.id) throw new Error('push_account_changed');
                let result;
                try { result = await execute(item); }
                catch (error) { result = { ok: false, error: error.message }; }
                if (item.action === 'answer') await invoke('notifications_call_result', { room_id: item.room_id, ok: result?.ok === true });
                if (result?.ok || item.action !== 'open') await invoke('notifications_ack', { id: item.notification_id, action: item.action });
            }
            // A token refresh failure must not prevent a user answering a real call.
            const installation = await invoke('notifications_tokens', {});
            for (const [kind, deviceToken] of Object.entries(installation.tokens || {})) {
                const response = await send({ type: 'auth', action: 'push-register', installationId: installation.installationId,
                    kind, deviceToken, provider: installation.provider || 'apns', environment: installation.environment });
                if (!response?.ok) throw new Error(response?.error || 'push_registration_failed');
            }
            const pruned = await send({ type: 'auth', action: 'push-prune', installationId: installation.installationId, kinds: Object.keys(installation.tokens || {}) });
            if (!pruned?.ok) throw new Error(pruned?.error || 'push_registration_failed');
        })().catch(report)
            .finally(() => { running = null; if (pendingRun) { pendingRun = false; void run(); } });
        return running;
    };
    const logout = () => { void invoke('notifications_logout', {}).catch(report); };
    env.addEventListener('squirrel:remote-session-ready', run, { signal: listeners.signal });
    env.addEventListener('atome:notifications-available', run, { signal: listeners.signal });
    env.addEventListener('squirrel:user-logged-out', logout, { signal: listeners.signal });
    const callEvent = async event => {
        const data = event.detail?.event;
        if (data?.type === 'callState' && ['recording', 'cancelled'].includes(data.status)) {
            await invoke('notifications_call_end', { room_id: data.roomId });
        }
        if (data?.type === 'callState' && data.status === 'live' && data.acceptedPrincipalId) {
            const account = await readRemoteSession();
            if (data.acceptedPrincipalId === account?.userId && data.acceptedKeyId !== account.session?.keyId)
                await invoke('notifications_call_end', { room_id: data.roomId });
        }
    };
    env.addEventListener('squirrel:visio-event', event => { void callEvent(event).catch(report); }, { signal: listeners.signal });
    return { run, async enable() { const result = await invoke('notifications_enable', {}); await run(); return result; },
        dispose() { stopped = true; listeners.abort(); } };
}
