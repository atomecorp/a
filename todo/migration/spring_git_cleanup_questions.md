# Decision record — 2026-10-13

This file preserves documentary arbitration provenance. [execution_order.md](../execution_order.md) owns all live task state. ARB-0001 is resolved; no documentary question remains pending for this triage. No application/session change or new runtime validation is made here.

## ARB-0001 — Browser-session contract — resolved

User decision, 2026-10-13: **retain the recent flow; archive the former unconditional cookie requirement**. Keep SMS/device-proof authentication and access tokens in memory, with device-key-bound resumption. The optional password/SMS choice previously approved for an already verified account is unchanged.

Older source: [secure_auth_token_storage.md](../cleanup_architecture/secure_auth_token_storage.md), now updated, formerly prescribed:

> Browser authentication uses HttpOnly secure cookies and server-side refresh sessions.

Recent source: [Authentication security](../atome_chat_GPT_Archives/Roadmap/Authentication%20security.md), line 531, describes cookies conditionally, **when the architecture uses cookies**, and device-proof techniques. [Phone-link implementation status](../auth_phone_link_implementation.md) describes access tokens in memory with persistent device-key resumption descriptors. Source inspection does not establish complete browser security acceptance.

Effect: the former unconditional browser-cookie migration is removed from the active auth backlog and retained as historical provenance. Security requirements against readable bearer-token persistence, replay, unauthorized resumption, revocation and cross-runtime session defects remain in ATM-2001/ATM-2002. Existing cookie-using surfaces retain their own contracts. No implementation, security setting, provider configuration or credential was changed.

Other easy decisions are settled: iPad priority replaces the earlier generic iPhone priority; Issues/Projects are optional; automatic canonical snapshots, parallel renderers, ECS-owned business truth and imported execution instructions cannot override AGENTS.md; Android exact duplicates are one specification; the current objectives master supplies ordering and new requirements while older packages remain references. Provider/platform/component creation proposals remain deferred specifications, not granted authorization. Differences between fulfilled code and future targets remain explicit remainders.
