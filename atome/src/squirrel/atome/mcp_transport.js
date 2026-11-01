// The transport of an MCP request: who asks and through which door. It is given by the
// caller module next to the request (`handleAtomeMCPRequestAsync(request, transport)`),
// never read from the request's params, so a caller cannot declare itself the person at
// the device (architecture §6.1).
//
// transport = { source: { type, layer, ... }, actor: { actor_id | user_id, capabilities?, sandbox_profiles? } }
//   ui      the person acting in this app (a panel, a gesture, the assistant's confirmation panel)
//   voice   a spoken request served by the assistant
//   ai      the assistant acting on its own reasoning
//   system  a scheduled duty of this device (an alarm)
//   remote  another surface through the relay (teleport/remote_command.js computes its capabilities)
import { MCP_CONTRACT_CAPABILITIES } from './mcp_contract_families.js';
import { MCP_ERROR, mcpError, normalizeStringList } from './mcp_core.js';
import { HEALTH_READ_CAPABILITY } from '../health/health_actor_gate.js';

export const MCP_TRANSPORT_TYPES = Object.freeze(['ui', 'voice', 'ai', 'system', 'remote']);
// Reading health values (heart rate, active energy) through a command of another family: only the
// person at the device (`ui`). The assistant and every other surface read them only through a
// confirmed health command (decision Q28).
// Turning a camera or a microphone on (runtime capture tools, timeline recording, capture commands).
export const MEDIA_CAPTURE_CAPABILITY = 'media.capture';
const LOCAL_SANDBOX_PROFILE = 'desktop_local_owner';

const LOCAL_OWNER_CAPABILITIES = Object.freeze([
    'mcp.read', 'mcp.security.read', 'runtime.read', 'runtime.execute', 'runtime.sensitive',
    'mail.read', 'mail.write', 'mail.send', 'contacts.read', 'contacts.write', 'calendar.read', 'calendar.write',
    'timeline.read', 'timeline.write', 'conditions.read', 'conditions.write', 'bank.read', 'voice.read',
    'ai.read', 'ai.execute', 'audit.read', 'share.write', MEDIA_CAPTURE_CAPABILITY,
    // Every command family brings its own capabilities; the commands the user must confirm stay
    // confirmed by the access policy (mcp_security_policy.js).
    ...MCP_CONTRACT_CAPABILITIES
]);

const CAPABILITIES_BY_TYPE = Object.freeze({
    ui: Object.freeze([...LOCAL_OWNER_CAPABILITIES, HEALTH_READ_CAPABILITY]),
    voice: LOCAL_OWNER_CAPABILITIES,
    ai: LOCAL_OWNER_CAPABILITIES,
    system: LOCAL_OWNER_CAPABILITIES
});

const invalid = message => mcpError(MCP_ERROR.INVALID_PARAMS, message);

/** The source recorded on every effect of the request (runtime payload, audit). */
export function transportSource(transport) {
    const type = String(transport?.source?.type || '').trim();
    if (!MCP_TRANSPORT_TYPES.includes(type)) throw invalid(`mcp_transport_type_invalid:${type || '<none>'}`);
    const layer = String(transport.source.layer || '').trim();
    if (!layer) throw invalid('mcp_transport_layer_missing');
    return { ...transport.source, type, layer };
}

/** The actor profile the policy checks: capabilities follow the transport type. A local caller may
 *  narrow them (`actor.capabilities`), never widen them; a remote caller arrives with the capabilities
 *  its surface was granted (teleport/remote_command.js). */
export function resolveTransportActor(transport) {
    const source = transportSource(transport);
    const actor = transport.actor && typeof transport.actor === 'object' ? transport.actor : {};
    const actorId = String(actor.actor_id || actor.user_id || actor.id || '').trim();
    if (source.type === 'remote') {
        if (!actorId) throw invalid('mcp_transport_remote_actor_missing');
        if (!Array.isArray(actor.capabilities) || !Array.isArray(actor.sandbox_profiles)) {
            throw invalid('mcp_transport_remote_grant_missing');
        }
        return { actor_id: actorId, role: 'remote_surface', source: source.type,
            capabilities: normalizeStringList(actor.capabilities), sandbox_profiles: normalizeStringList(actor.sandbox_profiles) };
    }
    const allowed = CAPABILITIES_BY_TYPE[source.type];
    const capabilities = Array.isArray(actor.capabilities)
        ? normalizeStringList(actor.capabilities).filter(capability => allowed.includes(capability))
        : [...allowed];
    return { actor_id: actorId || 'local_owner', role: 'local_owner', source: source.type,
        capabilities, sandbox_profiles: [LOCAL_SANDBOX_PROFILE] };
}

/** The identity a runtime effect carries: who, from where, and what it may read. */
export function runtimeActor(actor) {
    return { actor_id: actor.actor_id, role: actor.role, source: actor.source, capabilities: [...actor.capabilities],
        sandbox_profiles: [...actor.sandbox_profiles] };
}
