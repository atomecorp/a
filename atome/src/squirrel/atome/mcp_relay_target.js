// The target side of a program's MCP request carried by the `remote-control` relay
// (server/remoteCommandRelay.js, field `mcp`): this device answers it through its own standard
// MCP layer (mcp_protocol.js) and single entry, as the program surface's actor (mcp_surface_grants.js).
//
// Relay adapters (architecture §6.3):
// - discovery (tools/list, resources/*, prompts/*) is an ordinary relayed request;
// - a call held for the person's yes answers « pending » at once; the bridge then asks
//   `atome/confirmation/await` until the person decides here (5 minutes at most), and gets the result;
// - `notifications/cancelled` withdraws a held call or stops a running one;
// - `atome/notifications/await` hands the bridge this device's `notifications/tools/list_changed`.
import { handleMcpProtocolMessage } from './mcp_protocol.js';
import { awaitMcpConfirmation, readConfirmation, withdrawMcpConfirmation } from './mcp_confirmation_gate.js';
import { loadMcpProgramGrants, programActor } from './mcp_surface_grants.js';
import { MCP_ERROR } from './mcp_core.js';

// One relayed answer must come back before the relay's own 30 s timeout.
const RELAY_WAIT_MS = 20 * 1000;
const CONFIRMATION_META = 'atome/confirmation';
const heldCalls = new Map();

const answer = (id, result) => ({ mcp: { jsonrpc: '2.0', id, result } });
const failure = (id, code, message) => ({ mcp: { jsonrpc: '2.0', id, error: { code, message } } });

const programOf = (detail) => {
    const actor = programActor(detail);
    return {
        actor,
        namespace: actor.actor_id,
        transport: { source: { type: 'remote', layer: 'mcp_program_relay', from_surface_id: detail.fromSurfaceId,
            from_program_id: detail.fromProgramId }, actor }
    };
};

// Waits for `subscribe(resolve)` to settle, at most RELAY_WAIT_MS; resolves `idle` value otherwise.
const waitBounded = (subscribe, idle) => new Promise((resolve) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => { unsubscribe(); resolve(idle); }, RELAY_WAIT_MS);
    unsubscribe = subscribe((value) => { clearTimeout(timer); unsubscribe(); resolve(value); });
});

async function awaitHeldCall(message, program) {
    const confirmationId = String(message.params?.confirmation_id || '');
    const held = heldCalls.get(confirmationId);
    if (!held || held.namespace !== program.namespace) return failure(message.id, MCP_ERROR.INVALID_PARAMS, 'mcp_confirmation_not_held');
    const status = await waitBounded((settle) => {
        const controller = new AbortController();
        // Aborted when the relay's wait ends first: the bridge asks again.
        awaitMcpConfirmation(confirmationId, { signal: controller.signal }).then(settle, () => {});
        return () => controller.abort();
    }, 'pending');
    if (status === 'pending') {
        return answer(message.id, { status: 'pending', confirmation_id: confirmationId, expires_at: readConfirmation(confirmationId)?.expires_at });
    }
    heldCalls.delete(confirmationId);
    if (status !== 'approved') {
        const error = `mcp_confirmation_${status}`;
        return answer(message.id, { content: [{ type: 'text', text: error }], structuredContent: { ok: false, error }, isError: true });
    }
    const call = held.message;
    const response = await handleMcpProtocolMessage({ ...call, params: { ...call.params,
        _meta: { ...(call.params?._meta || {}), 'atome/confirmation_id': confirmationId } } }, program.transport, program.namespace);
    return { mcp: { ...response, id: message.id } };
}

function awaitNotifications(message, detail) {
    return waitBounded((settle) => {
        const listener = (event) => {
            const { type, payload } = event?.detail || {};
            if (type === 'mcp.tools.list_changed' && (!payload?.surface_id || payload.surface_id === detail.fromProgramId)) {
                settle([{ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }]);
            }
        };
        globalThis.addEventListener('squirrel:mcp', listener);
        return () => globalThis.removeEventListener('squirrel:mcp', listener);
    }, []).then(notifications => answer(message.id, { notifications }));
}

/** Answers one relayed MCP message (`detail.mcp`) for the program seat that sent it (`detail.fromProgramId`). */
export async function answerRelayedMcpRequest(detail) {
    const message = detail.mcp;
    // Its grant is the person's, kept as a private Atome: read before the first answer.
    await loadMcpProgramGrants();
    const program = programOf(detail);
    if (message.method === 'atome/confirmation/await') return awaitHeldCall(message, program);
    if (message.method === 'atome/notifications/await') return awaitNotifications(message, detail);
    if (message.method === 'notifications/cancelled') {
        const requestId = message.params?.requestId;
        heldCalls.forEach((held, confirmationId) => {
            if (held.namespace !== program.namespace || held.message.id !== requestId) return;
            heldCalls.delete(confirmationId);
            withdrawMcpConfirmation(confirmationId, program.actor.actor_id);
        });
    }
    const response = await handleMcpProtocolMessage(message, program.transport, program.namespace);
    const held = response?.result?._meta?.[CONFIRMATION_META];
    if (held?.status === 'pending') {
        // A call the bridge stopped asking about leaves with its expired request.
        heldCalls.forEach((entry, id) => { if (readConfirmation(id)?.status !== 'pending') heldCalls.delete(id); });
        heldCalls.set(held.confirmation_id, { namespace: program.namespace, message });
    }
    return response ? { mcp: response } : { mcp: null };
}
