// The assistant's AI engine switch (D18 item 7, user request 2026-11-03): off unless the person
// turned it on in Réglages › Assistant (`preferences.assistant.engine`, kept with the account,
// #voice/wake_preferences.js). Off, nothing reaches an AI provider on its own — not at launch,
// on a page change, in the background or at a relaunch. A request the person makes (a session
// they open with eVe, a prompt sent to a generator, a tool they call, a key they save) is let
// through while it runs, and leaves the switch as it was. eVe's glyph shown is not a request.
import { normalizeAssistantPreferences } from '../voice/wake_preferences.js';

// The person's requests running now (sessions, generations, tool calls).
let explicitRequests = 0;

export const assistantEngineOn = (env = globalThis) => normalizeAssistantPreferences(env?.__eveProfilePreferences?.assistant).engine;

// Held from the request's start to its end; `release` is idempotent.
export const openExplicitAssistantRequest = () => {
    explicitRequests += 1;
    let open = true;
    return () => { if (open) { open = false; explicitRequests -= 1; } };
};

export const runExplicitAssistantRequest = async (run) => {
    const release = openExplicitAssistantRequest();
    try { return await run(); } finally { release(); }
};

// The one rule every provider call obeys (provider_broker.js, provider_client.js).
export const requireAssistantEngine = (env = globalThis) => {
    if (!assistantEngineOn(env) && explicitRequests === 0) throw new Error('assistant_engine_off');
};
