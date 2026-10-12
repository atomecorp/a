// Remote commands — renderer side of the `remote-control` command relay.
//
// Caller: `runRemoteCommand` asks another surface to run one canonical runtime tool and
// waits for that surface's own answer. Target: every authenticated surface answers a
// `remote-control-command` by running the tool through its OWN MCP gateway (policy,
// capabilities, command bus, audit) as a restricted remote actor. Nothing is executed
// here on another device's behalf, and nothing reaches the target but an intention.
//
// The server relays only (server/remoteCommandRelay.js); like the rest of teleport this
// is a separate brick that meets the others through the surface registry.

import { FastifyAdapter } from '../apis/unified/adole.js';
import { ensureRemoteSurfacePrincipal, ensureSurfaceAnnounced, listSurfaces } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';

// The server gives up at 30 s; the client waits a little longer so the server's
// explicit `remote_command_timeout` is what the caller hears, not a transport timeout.
const COMMAND_REPLY_TIMEOUT_MS = 35000;

// What a command coming from another seat may do here. Deliberately narrower than the
// local owner: no `runtime.sensitive` (camera, microphone, screen capture, automation),
// no mail, social, bank, contact or calendar writes, and not the `desktop_local_owner`
// sandbox — those stay with the person holding this device.
const REMOTE_ACTOR_CAPABILITIES = Object.freeze([
    'mcp.read', 'runtime.read', 'runtime.execute', 'timeline.read', 'timeline.write', 'conditions.read',
    'ai.read', 'ai.execute', 'tv.read', 'tv.control', 'youtube.read', 'youtube.control'
]);
const REMOTE_SANDBOX_PROFILE = 'remote_surface';

// The person giving the order cannot see this screen: deleting here needs their
// explicit spoken yes, relayed as `confirmed`. Opening the delete panel is not deleting.
const CONFIRM_TOOL_PATTERN = /(^|[._])delete([._]|$)/;
// A command never relays a further command, so two devices cannot bounce orders.
const NON_RELAYABLE_PATTERN = /^surfaces?\./;

const isAuthenticated = () => getSessionState()?.mode === 'authenticated';
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const state = { executorInstalled: false };

const send = async (action, fields = {}, options = {}) => {
    if (!isAuthenticated()) return { ok: false, success: false, error: 'not_authenticated' };
    const principal = await ensureRemoteSurfacePrincipal();
    if (!principal.ok) return { ok: false, success: false, error: principal.error };
    await ensureSurfaceAnnounced();
    try {
        return await FastifyAdapter.ws.send({ type: 'remote-control', action, ...fields }, options);
    } catch (error) {
        return { ok: false, success: false, error: error?.message || String(error) };
    }
};

// ---------------------------------------------------------------------------
// Naming a device by voice
// ---------------------------------------------------------------------------

const FILLER_WORDS = new Set(['sur', 'le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'mon', 'ma', 'mes',
    'a', 'au', 'aux', 'son', 'sa', 'the', 'on', 'my']);
// Default labels say little ("Desktop", "Navigateur"); the words people use for a
// device of that platform still find it while it is the only one.
const PLATFORM_WORDS = Object.freeze({
    ios: ['iphone', 'ipad', 'telephone', 'portable', 'mobile', 'tablette', 'phone'],
    tauri: ['mac', 'macbook', 'ordinateur', 'ordi', 'desktop', 'pc', 'bureau', 'computer'],
    browser: ['navigateur', 'browser', 'web']
});

export const normalizeSurfaceName = (value) => String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((word) => word && !FILLER_WORDS.has(word)).join(' ');

const outcomeOf = (candidates) => (candidates.length === 1
    ? { surface: candidates[0] }
    : { error: 'remote_command_surface_ambiguous', candidates });

/** Resolve a device from the words the user said. Exact label first, then a label
 *  containing (or contained in) the words, then the platform those words name. */
export const resolveSurfaceByName = (surfaces = [], spoken = '') => {
    const list = Array.isArray(surfaces) ? surfaces.filter(Boolean) : [];
    const raw = String(spoken ?? '').trim();
    const byId = list.find((surface) => surface.surface_id === raw);
    if (byId) return { surface: byId };
    const name = normalizeSurfaceName(raw);
    if (!name) return { error: 'remote_command_surface_not_found', candidates: list };

    const labelled = list.map((surface) => ({ surface, label: normalizeSurfaceName(surface.label) }));
    const exact = labelled.filter((entry) => entry.label === name).map((entry) => entry.surface);
    if (exact.length) return outcomeOf(exact);
    const partial = labelled.filter((entry) => entry.label && (entry.label.includes(name) || name.includes(entry.label)))
        .map((entry) => entry.surface);
    if (partial.length) return outcomeOf(partial);
    const words = new Set(name.split(' '));
    const byPlatform = list.filter((surface) => (PLATFORM_WORDS[surface.platform] || []).some((word) => words.has(word)));
    if (byPlatform.length) return outcomeOf(byPlatform);
    return { error: 'remote_command_surface_not_found', candidates: list };
};

/** The other devices that can receive a command right now: this account's own seats,
 *  then other accounts' seats their owners shared. */
export const listRemoteSurfaces = async () => {
    const listed = await listSurfaces({ excludeSelf: true, includeShared: true });
    return { ok: listed.ok, error: listed.error, surfaces: listed.surfaces };
};

// ---------------------------------------------------------------------------
// Caller
// ---------------------------------------------------------------------------

/** Ask `surfaceId` to run `toolId` with `input`. Resolves with the target's own tool
 *  result, or with the relay's refusal (`remote_command_target_offline`, …). */
export const runRemoteCommand = async ({ surfaceId, userId = null, toolId, input = {}, toolAction = '', confirmed = false } = {}) => {
    const target = String(surfaceId || '').trim();
    const tool = String(toolId || '').trim();
    if (!target) return { ok: false, error: 'remote_command_target_required' };
    if (!tool) return { ok: false, error: 'remote_command_tool_invalid' };
    if (!isPlainObject(input)) return { ok: false, error: 'remote_command_input_invalid' };
    const reply = await send('command', {
        target_surface_id: target,
        ...(userId ? { target_user_id: String(userId) } : {}),
        tool_id: tool,
        ...(toolAction ? { tool_action: String(toolAction) } : {}),
        input,
        confirmed: confirmed === true
    }, { timeoutMs: COMMAND_REPLY_TIMEOUT_MS });
    if (reply?.success !== true) {
        return { ok: false, error: reply?.error || 'remote_command_failed', commandId: reply?.commandId || null };
    }
    return { ok: true, commandId: reply.commandId, targetLabel: reply.targetLabel || null, result: reply.result || null };
};

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

const remoteActor = ({ fromUserId, fromSurfaceId }) => ({
    actor_id: `remote_surface:${fromUserId || 'unknown'}:${fromSurfaceId || 'unknown'}`,
    role: 'remote_surface',
    source: 'remote_command',
    capabilities: [...REMOTE_ACTOR_CAPABILITIES],
    sandbox_profiles: [REMOTE_SANDBOX_PROFILE]
});

// JSON is the wire: functions, cycles and DOM handles in a local result do not travel.
const wireResult = (value) => {
    try {
        const copy = JSON.parse(JSON.stringify(value ?? null));
        return isPlainObject(copy) ? copy : { ok: true, value: copy };
    } catch (error) {
        return { ok: false, error: 'remote_command_result_unserializable' };
    }
};

/** Run one received command through this device's own gateway. Exported for tests;
 *  the lifecycle below is its only production caller. */
export const executeRemoteCommand = async (detail = {}) => {
    const toolId = String(detail.toolId || '').trim();
    if (!toolId || NON_RELAYABLE_PATTERN.test(toolId)) return { ok: false, error: 'remote_command_tool_not_relayable' };
    if (CONFIRM_TOOL_PATTERN.test(toolId) && !toolId.endsWith('.panel') && detail.confirmed !== true) {
        return { ok: false, status: 'SPOKEN_CONFIRMATION_REQUIRED', needs_confirmation: true, tool_id: toolId };
    }
    const gateway = globalThis.handleAtomeMCPRequestAsync;
    if (typeof gateway !== 'function') return { ok: false, error: 'remote_command_gateway_unavailable' };
    const response = await gateway({
        jsonrpc: '2.0',
        id: detail.commandId || null,
        method: 'runtime.tools.call',
        params: {
            tool_id: toolId,
            input: isPlainObject(detail.input) ? detail.input : {},
            action: detail.toolAction || 'pointer.click',
            actor: remoteActor(detail),
            source: { type: 'remote_command', layer: 'surface_remote_command', from_surface_id: detail.fromSurfaceId || null },
            trace_id: detail.commandId || null,
            idempotency_key: detail.commandId ? `remote_command:${detail.commandId}` : null
        }
    });
    if (response?.error) return { ok: false, error: response.error.message || 'remote_command_failed' };
    const result = response?.result;
    // A local confirmation gate cannot be answered from another room: the action has
    // to be done on this device by the person holding it.
    if (result?.confirmation_required === true || result?.status === 'CONFIRMATION_REQUIRED') {
        return { ok: false, error: 'remote_command_requires_local_confirmation' };
    }
    return wireResult(result);
};

export const installRemoteCommandExecutor = () => {
    if (typeof window === 'undefined' || state.executorInstalled) return false;
    state.executorInstalled = true;
    window.addEventListener('squirrel:remote-control-command', (event) => {
        const detail = event?.detail || {};
        if (!detail.commandId) return;
        void (async () => {
            let result;
            try {
                result = await executeRemoteCommand(detail);
            } catch (error) {
                result = { ok: false, error: error?.message || String(error) };
            }
            // Shown on this device: an order from elsewhere is never silent (§11.1).
            window.dispatchEvent(new CustomEvent('squirrel:remote-command-received', {
                detail: { toolId: detail.toolId, fromLabel: detail.fromLabel, fromSurfaceId: detail.fromSurfaceId, ok: result?.ok !== false }
            }));
            await send('command-result', { command_id: detail.commandId, result });
        })();
    });
    return true;
};

installRemoteCommandExecutor();
