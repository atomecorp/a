import { v4 as uuidv4 } from 'uuid';
import { CALL_RING_TIMEOUT_MS, normalizeCallMode } from '../atome/src/shared/communication_contract.js';

// One room command owner for canonical /ws/api, including terminal call
// arbitration. No await separates a status check from its transition.
export function createVisioCommands({ ensureRoomMeta, resolveRoomMeta, resolveUserInfo, relations,
    notify, publish, saveScheduledRoom, closeRoom, online = () => true, now = Date.now, schedule = setTimeout, unschedule = clearTimeout }) {
    const timers = new Map();
    const stopTimer = id => { if (timers.has(id)) unschedule(timers.get(id)); timers.delete(id); };
    const snapshot = meta => ({ roomId: meta.room_id, mode: meta.call_mode || 'visio', status: meta.call_status || 'live',
        expiresAt: meta.expires_at || null, targetId: meta.call_target || null });
    const announce = meta => {
        const state = snapshot(meta);
        for (const id of [meta.owner_user_id, ...meta.invites]) publish(id, { type: 'callState', ...state });
        return state;
    };
    const finishRinging = (meta, status) => {
        if (meta.call_status !== 'ringing') return snapshot(meta);
        meta.call_status = status;
        stopTimer(meta.room_id);
        return announce(meta);
    };
    const metaFor = async (userId, input) => {
        const meta = await resolveRoomMeta(input.roomId);
        if (!meta || (meta.owner_user_id !== userId && !meta.invites.has(userId))) throw new Error('visio_room_denied');
        return meta;
    };
    const invite = async (userId, meta, target, managed = false, vaultRouter = null, scheduled = false) => {
        const candidate = typeof target === 'object' ? target : { id: target };
        const user = await resolveUserInfo(candidate.id || candidate.userId || null, candidate.phone || null);
        if (!user?.id || user.id === userId) throw new Error('visio_target_unavailable');
        const verdict = await relations.canCommunicate(userId, user.id);
        if (!verdict.ok && !verdict.silent) throw new Error(verdict.error || 'contact_required');
        if (meta.invites.size >= 5 && !meta.invites.has(user.id)) throw new Error('room_full');
        if (managed) {
            meta.call_target = user.id;
            meta.call_status = 'ringing';
            meta.expires_at = now() + CALL_RING_TIMEOUT_MS;
            timers.set(meta.room_id, schedule(() => finishRinging(meta, 'recording'), CALL_RING_TIMEOUT_MS));
        }
        if (!verdict.silent) {
            meta.invites.add(user.id);
            if (managed) {
                const profileState = await vaultRouter?.getState(user.id, user.id);
                const profile = profileState?.properties?.eve_profile;
                const preferences = (typeof profile === 'string' ? JSON.parse(profile) : profile)?.preferences;
                if (!online(user.id) || preferences?.notifications?.do_not_disturb === true) return finishRinging(meta, 'recording');
            }
            if (!scheduled) await notify(user.id, userId, { kind: 'call-invitation', message: meta.name || '', extra: {
                room_id: meta.room_id, call_mode: meta.call_mode || 'visio', expires_at: meta.expires_at || null } });
        }
        return managed ? announce(meta) : snapshot(meta);
    };
    const execute = async (userId, action, input = {}, vaultRouter = null) => {
        if (action === 'create') {
            const mode = normalizeCallMode(input.mode || 'visio');
            const id = uuidv4();
            const meta = ensureRoomMeta(id, userId, input.name || 'Visio', 'private');
            meta.call_mode = mode;
            meta.call_status = input.messageOnMiss === true ? 'preparing' : 'live';
            return snapshot(meta);
        }
        if (action === 'schedule') {
            const starts = new Date(input.start), ends = input.end ? new Date(input.end) : null;
            if (!Number.isFinite(starts.getTime()) || (ends && (!Number.isFinite(ends.getTime()) || ends < starts))) throw new Error('invalid_schedule');
            if (!Array.isArray(input.participants) || !input.participants.length || input.participants.length > 5) throw new Error('participants_required');
            const meta = ensureRoomMeta(uuidv4(), userId, input.title || 'Visio', 'private');
            Object.assign(meta, { scheduled: true, starts_at: starts.toISOString(), ends_at: ends?.toISOString() || null });
            for (const target of input.participants) await invite(userId, meta, target, false, null, true);
            await saveScheduledRoom(meta);
            for (const id of meta.invites) await notify(id, userId, { kind: 'call-scheduled', message: meta.name,
                extra: { room_id: meta.room_id, starts_at: meta.starts_at, ends_at: meta.ends_at } });
            return { roomId: meta.room_id, startsAt: meta.starts_at, endsAt: meta.ends_at, invited: [...meta.invites] };
        }
        const meta = await metaFor(userId, input);
        if (action === 'invite') {
            if (meta.call_status === 'preparing' && meta.owner_user_id === userId) return invite(userId, meta, input.target, true, vaultRouter);
            if (meta.call_status !== 'live') throw new Error('visio_call_ended');
            return invite(userId, meta, input.target);
        }
        if (action === 'state') {
            if (meta.call_status === 'ringing' && now() >= meta.expires_at) finishRinging(meta, 'recording');
            return snapshot(meta);
        }
        if (action === 'accept') {
            if (meta.owner_user_id === userId) throw new Error('visio_accept_denied');
            if (meta.call_status === 'ringing' && now() >= meta.expires_at) finishRinging(meta, 'recording');
            if (meta.call_status === 'ringing') return finishRinging(meta, 'live');
            if (meta.call_status !== 'live') throw new Error('visio_call_ended');
            return snapshot(meta);
        }
        if (action === 'decline') {
            if (meta.owner_user_id === userId) throw new Error('visio_decline_denied');
            if (meta.call_status === 'ringing') return finishRinging(meta, 'recording');
            await notify(meta.owner_user_id, userId, { kind: 'call-declined', message: input.reason || 'declined',
                extra: { room_id: meta.room_id, reason: input.reason || 'declined' } });
            return snapshot(meta);
        }
        if (action === 'cancel') {
            if (meta.owner_user_id !== userId) throw new Error('visio_cancel_denied');
            stopTimer(meta.room_id);
            meta.call_status = 'cancelled';
            closeRoom(meta.room_id);
            return announce(meta);
        }
        throw new Error('visio_action_unsupported');
    };
    return { execute, dispose: () => { for (const id of timers.keys()) stopTimer(id); } };
}
