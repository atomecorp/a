import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import * as adole from '../../atome/src/squirrel/apis/unified/adole.js';
import { setGuestWorkspace, getGuestWorkspace, setSessionState } from '../../atome/src/squirrel/apis/unified/adole_api/session.js';
import { transferGuestWorkspace } from '../../atome/src/squirrel/apis/unified/adole_api/auth_workspace.js';
import { installUserProfileRuntimeBridge, loadUserProfile, upsertUserProfile } from '../../eVe/domains/user/profile_api.js';

const guestId = '660e8400-e29b-41d4-a716-446655440000';
const accountId = '550e8400-e29b-41d4-a716-446655440000';
const operationId = '770e8400-e29b-41d4-a716-446655440000';
let before, source, current, commit, sync, transferred;
beforeEach(() => {
    before = globalThis.window;
    const win = new EventTarget();
    current = { logged: true, anonymous: false, user: { id: accountId }, source: 'tauri' };
    commit = vi.fn(async () => ({ ok: true }));
    Object.assign(win, { CustomEvent, __SQUIRREL_FORCE_TAURI_RUNTIME__: true, __SQUIRREL_AUTH_SOURCE__: 'tauri',
        __SQUIRREL_PROFILE_SOURCE__: 'fastify', Atome: { commit },
        AdoleAPI: { atomes: {}, security: { isAnonymous: () => current.anonymous },
            auth: { current: async () => current, ensureFastifyToken: vi.fn(async () => ({ ok: true })) } } });
    installUserProfileRuntimeBridge(win);
    globalThis.window = win;
    setSessionState({ mode: 'authenticated', user: { id: accountId }, backend: 'tauri' });
    setGuestWorkspace({ user: { id: guestId }, adoptionOperationId: operationId, adoptionAccountId: accountId });
    source = { auth: { startGuest: vi.fn(async () => ({ ok: true })) },
        atome: { list: vi.fn(async () => ({ ok: true, atomes: [] })), getStateCurrent: vi.fn(async () => ({ ok: true, state: { properties: { user_face: 'data:image/png;base64,AAAA', eve_profile: { name: 'Guest', first_name: 'Ada' } } } })) },
        clearToken: vi.fn() };
    vi.spyOn(adole, 'createWebSocketAdapter').mockReturnValue(source);
    vi.spyOn(adole.TauriAdapter.atome, 'getStateCurrent').mockResolvedValue({ ok: true, state: { properties: { eve_profile: { name: 'Account' } } } });
    transferred = vi.spyOn(adole.TauriAdapter.atome, 'transferOwner').mockResolvedValue({ ok: true });
    sync = vi.spyOn(adole.TauriAdapter.sync, 'getPending').mockResolvedValue({ ok: false, error: 'offline' });
    vi.spyOn(adole.FastifyAdapter.auth, 'me').mockResolvedValue({ ok: true, user: { id: accountId } });
    vi.spyOn(adole.FastifyAdapter.atome, 'getStateCurrent').mockResolvedValue({ ok: true, state: { properties: { eve_profile: { name: 'Account' } } } });
    vi.spyOn(adole.FastifyAdapter.ws, 'send').mockImplementation(async message => message.type === 'state-current'
        ? { ok: true, state: { properties: { user_face: 'data:image/png;base64,AAAA', eve_profile: { name: 'Account', first_name: 'Ada' } } } }
        : { ok: true, status: message.action === 'finalize' ? 'completed' : 'importing' });
});
afterEach(() => { setSessionState({ mode: 'logged_out', user: null }); globalThis.window = before; vi.restoreAllMocks(); });

it('pins a native guest profile to the local adapter even when cloud profile source is configured', async () => {
    current = { logged: true, anonymous: true, user: { id: guestId }, source: 'local_guest' };
    setSessionState({ mode: 'anonymous', user: { id: guestId }, backend: 'local_guest' });
    expect((await upsertUserProfile({ name: 'Local' }, { allowCreate: false })).ok).toBe(true);
    expect(commit.mock.calls[0][1].backend).toBe('tauri');
    expect(commit.mock.calls[0][0]).toMatchObject({ type: 'guest_workspace', scope: 'global', actor: { type: 'guest', id: guestId } });
    expect((await loadUserProfile()).ok).toBe(true);
    expect(window.AdoleAPI.auth.ensureFastifyToken).not.toHaveBeenCalled();
    expect(adole.FastifyAdapter.auth.me).not.toHaveBeenCalled();
});

it('refuses the adoption, untouched, while the account profile has not reached this device', async () => {
    // A phone's own profile source (the local server), holding the bare record of a new sign-in.
    window.__SQUIRREL_PROFILE_SOURCE__ = 'tauri';
    adole.TauriAdapter.atome.getStateCurrent.mockResolvedValue({ ok: true, state: { properties: { username: 'account' } } });
    const result = await transferGuestWorkspace(guestId, accountId, { operationId });
    expect(result).toMatchObject({ ok: false, reason: 'transfer_failed', error: 'atome_not_available_locally' });
    expect(commit).not.toHaveBeenCalled(); expect(transferred).not.toHaveBeenCalled(); expect(source.auth.startGuest).not.toHaveBeenCalled();
    expect(Object.hasOwn(getGuestWorkspace(), 'adoptionProfileEvent')).toBe(false);
});

it('journals an immutable native adoption intent and retains it while remote sync is incomplete', async () => {
    const first = await transferGuestWorkspace(guestId, accountId, { operationId });
    expect(first.ok).toBe(false); expect(first.reason).toBe('offline');
    expect(source.auth.startGuest).toHaveBeenCalledWith({ guestId }); expect(source.clearToken).toHaveBeenCalledOnce();
    const event = getGuestWorkspace().adoptionProfileEvent;
    expect(event).toMatchObject({ scope: 'global', atome_id: accountId, payload: { props: { first_name: 'Ada', user_face: 'data:image/png;base64,AAAA', eve_profile: { name: 'Account', first_name: 'Ada' } } } });
    expect(commit).toHaveBeenCalledWith(event, { backend: 'tauri' });
    expect(transferred).toHaveBeenCalledOnce();
    sync.mockResolvedValue({ ok: true, pending_delivery_count: 0 });
    const second = await transferGuestWorkspace(guestId, accountId, { operationId });
    expect(second.ok).toBe(true); expect(source.auth.startGuest).toHaveBeenCalledOnce();
    expect(commit.mock.calls[1][0]).toEqual(event);
});

it('does not transfer projects after a profile save failure, and keeps the guest source', async () => {
    commit.mockResolvedValue({ ok: false, error: 'local_storage_failure' });
    expect((await transferGuestWorkspace(guestId, accountId, { operationId })).ok).toBe(false);
    expect(transferred).not.toHaveBeenCalled(); expect(sync).not.toHaveBeenCalled();
    expect(getGuestWorkspace().user.id).toBe(guestId);
    expect(getGuestWorkspace().adoptionProfileEvent).toBeDefined();
});

it('releases a failed detached authorization without altering the account session', async () => {
    source.auth.startGuest.mockResolvedValue({ ok: false, error: 'guest_principal_invalid' });
    const result = await transferGuestWorkspace(guestId, accountId, { operationId });
    expect(result.ok).toBe(false); expect(source.clearToken).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled(); expect(transferred).not.toHaveBeenCalled();
});

it('keeps the guest source and does not transfer locally when remote profile adoption fails', async () => {
    adole.FastifyAdapter.ws.send.mockResolvedValue({ ok: false, error: 'remote_offline' });
    expect((await transferGuestWorkspace(guestId, accountId, { operationId })).ok).toBe(false);
    expect(commit).not.toHaveBeenCalled(); expect(transferred).not.toHaveBeenCalled();
    expect(getGuestWorkspace().adoptionPersonalProfile.first_name).toBe('Ada');
});

it('journals project events and waits for native media delivery before completing', async () => {
    source.atome.list.mockResolvedValue({ ok: true, atomes: [{ atome_id: 'local-image', atome_type: 'image', project_id: 'local-project',
        properties: { file_path: 'data/users/' + guestId + '/Downloads/image.png', media_user_id: guestId } }] });
    const profileRead = source.atome.getStateCurrent.getMockImplementation();
    source.atome.getStateCurrent.mockImplementation(async id => id === 'local-image'
        ? { ok: true, state: { project_id: 'local-project', properties: { file_path: 'data/users/' + guestId + '/Downloads/image.png', media_user_id: guestId } } }
        : profileRead(id));
    sync.mockResolvedValue({ ok: true, pending_delivery_count: 1 });
    expect((await transferGuestWorkspace(guestId, accountId, { operationId })).ok).toBe(false);
    const event = getGuestWorkspace().adoptionProjectEvents[0];
    expect(event.payload.props.file_path).toBe('data/users/' + accountId + '/Downloads/image.png');
    expect(event.actor.id).toBe(accountId); expect(commit).toHaveBeenCalledWith(event, { backend: 'tauri' });
    sync.mockResolvedValue({ ok: true, pending_delivery_count: 0 });
    expect((await transferGuestWorkspace(guestId, accountId, { operationId })).ok).toBe(true);
    expect(source.atome.list).toHaveBeenCalledOnce();
    expect(commit.mock.calls.filter(([candidate]) => candidate.id === event.id)).toHaveLength(2);
});
