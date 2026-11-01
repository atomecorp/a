// Fail-closed gate for actors that must never read health values (MCP / AI
// requests). While such a request is being served, the Conditions `health`
// source answers "denied" — including through condition sets, bindings or
// computed properties referenced indirectly. A legitimate read racing with an
// MCP request transiently sees "denied" too, which is the safe direction.

let deniedDepth = 0;

export const healthAccessAllowedNow = () => deniedDepth === 0;

export async function runWithoutHealthAccess(task) {
    deniedDepth += 1;
    try {
        return await task();
    } finally {
        deniedDepth -= 1;
    }
}

// The capability a delegated actor needs to read health values through a command of another family
// (Sport's heart rate and active energy, the objectives' measures). An MCP request always carries its
// transport's actor (atome/mcp_transport.js: only the `ui` transport holds it); a call made in the app
// through the tool gateway carries none and is the person's own.
export const HEALTH_READ_CAPABILITY = 'health.read';

/** Whether health values may reach the caller of one runtime command (`payload`: its invocation). */
export const invocationReadsHealth = (payload = {}) => {
    if (!healthAccessAllowedNow()) return false;
    const actor = payload?.actor;
    if (actor) return Array.isArray(actor.capabilities) && actor.capabilities.includes(HEALTH_READ_CAPABILITY);
    return payload?.source?.type === 'ui';
};
