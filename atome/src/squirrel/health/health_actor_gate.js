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
