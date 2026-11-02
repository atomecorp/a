// How many tools one provider session may carry (the realtime voice delegation and its relay,
// server/providerRealtimeSession.js). The page sends at most this many, the most useful first;
// every other authorized tool stays reachable through the search tool (conversation_session.js).
export const PROVIDER_SESSION_TOOL_LIMIT = 96;
