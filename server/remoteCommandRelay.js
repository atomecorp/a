// Remote commands — one-shot "run this canonical tool on that surface", carried by the
// `remote-control` family on `/ws/api` (actions `command` and `command-result`).
//
// The server never executes anything: it authorizes the pair of surfaces, forwards the
// request to the target, and hands the target's own answer back to the caller. The
// target runs the tool through its own MCP gateway, policy and command bus, so what a
// remote command may do is decided on the device that does it.
//
// Security posture, same as input relaying: the principal comes from the connection,
// never from the payload; a cross-account target needs an explicit `remote_command`
// grant (§11.3); only the target surface the command was sent to may answer it, so a
// captured `command_id` replayed from another socket settles nothing.

import crypto from 'crypto';
import { getWsApiSurface, normalizeSurfaceId, wsSendJsonToSurface } from './wsApiState.js';
import { hasSurfaceCapability, SURFACE_CAPABILITIES } from './surfaceGrants.js';

export const REMOTE_COMMAND_TIMEOUT_MS = (() => {
    const configured = Number(process.env.REMOTE_COMMAND_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : 30 * 1000;
})();

// Tool ids and actions are canonical identifiers (`tv.open_channel`, `pointer.click`).
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
// A command is an intention, not a payload transfer: anything larger is refused.
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 256 * 1024;

// commandId -> pending command
const pending = new Map();

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const byteLength = (value) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

function settle(commandId, outcome) {
    const command = pending.get(commandId);
    if (!command) return false;
    pending.delete(commandId);
    clearTimeout(command.timer);
    command.resolve(outcome);
    return true;
}

/** Caller side: forward the command and wait for the target's answer. Resolves to
 *  `{ error }` or `{ fields }` for the family response envelope. */
export async function relayRemoteCommand(message, connection, userId) {
    const callerSurfaceId = normalizeSurfaceId(connection?._wsApiSurfaceId);
    const targetSurfaceId = normalizeSurfaceId(message?.target_surface_id ?? message?.targetSurfaceId);
    if (!callerSurfaceId) return { error: 'surface_not_announced' };
    if (!targetSurfaceId) return { error: 'remote_command_target_required' };
    if (targetSurfaceId === callerSurfaceId) return { error: 'remote_command_target_is_caller' };

    const toolId = String(message?.tool_id || '').trim();
    const toolAction = String(message?.tool_action || '').trim();
    if (!IDENTIFIER_PATTERN.test(toolId)) return { error: 'remote_command_tool_invalid' };
    if (toolAction && !IDENTIFIER_PATTERN.test(toolAction)) return { error: 'remote_command_action_invalid' };
    const input = message?.input === undefined ? {} : message.input;
    if (!isPlainObject(input)) return { error: 'remote_command_input_invalid' };
    if (byteLength(input) > MAX_INPUT_BYTES) return { error: 'remote_command_input_too_large' };

    const callerUserId = String(userId);
    const targetUserId = String(message?.target_user_id || message?.targetUserId || callerUserId);
    const target = getWsApiSurface(targetUserId, targetSurfaceId);
    if (!target) return { error: 'remote_command_target_offline' };

    // Same account: trusted by default (§11.1). Another account's device only with a
    // grant its owner gave for exactly this capability.
    if (targetUserId !== callerUserId) {
        const allowed = await hasSurfaceCapability({
            ownerId: targetUserId,
            surfaceId: targetSurfaceId,
            granteeId: callerUserId,
            capability: SURFACE_CAPABILITIES.REMOTE_COMMAND
        });
        if (!allowed) return { error: 'remote_command_cross_user_not_authorized' };
    }

    const commandId = crypto.randomUUID();
    const outcome = new Promise((resolve) => {
        const timer = setTimeout(() => settle(commandId, { error: 'remote_command_timeout' }), REMOTE_COMMAND_TIMEOUT_MS);
        timer.unref?.();
        pending.set(commandId, {
            commandId,
            callerUserId,
            callerSurfaceId,
            targetUserId,
            targetSurfaceId,
            timer,
            resolve
        });
    });

    const delivery = wsSendJsonToSurface(targetUserId, targetSurfaceId, {
        type: 'remote-control-command',
        command_id: commandId,
        tool_id: toolId,
        tool_action: toolAction || null,
        input,
        confirmed: message?.confirmed === true,
        from_surface_id: callerSurfaceId,
        from_user_id: callerUserId,
        // So the target can say where the order came from (§11.1: visible, not silent).
        from_label: getWsApiSurface(callerUserId, callerSurfaceId)?.label || null,
        timestamp: new Date().toISOString()
    }, { scope: 'ws/api', op: 'remote-control-command' });
    if (!delivery.delivered) settle(commandId, { error: 'remote_command_target_offline' });

    const result = await outcome;
    if (result.error) return { error: result.error, fields: { command_id: commandId, target_surface_id: targetSurfaceId } };
    return {
        fields: {
            command_id: commandId,
            target_surface_id: targetSurfaceId,
            target_label: target.label || null,
            result: result.result
        }
    };
}

/** Target side: the answer to a command this very surface received. */
export function settleRemoteCommand(message, connection, userId) {
    const commandId = String(message?.command_id || '').trim();
    const command = pending.get(commandId);
    if (!command) return { error: 'remote_command_unknown' };
    if (String(userId) !== command.targetUserId
        || normalizeSurfaceId(connection?._wsApiSurfaceId) !== command.targetSurfaceId) {
        return { error: 'remote_command_not_target' };
    }
    const result = isPlainObject(message?.result) ? message.result : { ok: false, error: 'remote_command_result_invalid' };
    settle(commandId, byteLength(result) > MAX_RESULT_BYTES
        ? { result: { ok: result.ok === true, error: result.error || null, truncated: true } }
        : { result });
    return { fields: { command_id: commandId, settled: true } };
}

/** A surface disappeared: every command waiting on it, or sent from it, ends now
 *  instead of running out its timeout. */
export function failRemoteCommandsForSurface({ userId, surfaceId } = {}) {
    const lost = normalizeSurfaceId(surfaceId);
    const principalId = String(userId || '');
    if (!lost || !principalId) return [];
    const failed = [];
    for (const command of [...pending.values()]) {
        const isTarget = command.targetUserId === principalId && command.targetSurfaceId === lost;
        const isCaller = command.callerUserId === principalId && command.callerSurfaceId === lost;
        if (!isTarget && !isCaller) continue;
        settle(command.commandId, { error: isTarget ? 'remote_command_target_offline' : 'remote_command_caller_lost' });
        failed.push(command.commandId);
    }
    return failed;
}

// Test seam only.
export function __pendingRemoteCommandCount() {
    return pending.size;
}
