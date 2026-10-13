# Secure authentication token storage

Status: Specification — residual security acceptance belongs to
[ATM-2001/ATM-2002](../execution_order.md).

User decision, 2026-10-13 (ARB-0001): retain the recent SMS/device-bound session
flow with access tokens in memory. The former unconditional HttpOnly-cookie
migration requirement is historical and is removed from active implementation
scope. This documentary decision is not a new runtime/security validation.

## Confirmed contract

Browser and WebView JavaScript must not persist readable authentication bearer tokens in
`localStorage` or `sessionStorage`.

- Browser authentication retains the SMS/device-proof flow: access tokens remain
  in memory and persistent resumption descriptors require the device key.
  A migration to HttpOnly cookies is not required by this backlog. Existing
  cookie-using surfaces remain governed by their own security contracts.
- Native runtimes use a platform credential store or an encrypted vault whose secret is
  not readable from ordinary product JavaScript.
- Authentication material must not enter Atome properties, `state_current`, events,
  synchronization payloads, exports, URLs, logs, or diagnostics.
- Compatibility migration may delete legacy browser-storage keys but must never restore
  them as an active token source.

## Historical gap — current presence to verify

The earlier inventory reported Adole and eVe transport reads or writes for
`local_auth_token`, `cloud_auth_token`, or legacy `auth_token` browser-storage keys,
despite the security audit recording the browser token-storage remediation as complete.
That inventory predates the phone-link migration. Verify the current owners
before treating any legacy-token cleanup as unfinished implementation.

## Executable scope

1. Inventory every maintained authentication-token read, write, migration and deletion
   in browser, Tauri WebView and iOS WebView code.
2. Distinguish non-secret device identifiers and login hints from bearer material.
3. Verify the retained browser device-proof/in-memory session and native bearer
   material through the approved credential-store or encrypted-vault boundary.
4. Remove active bearer-token reads and writes from Web Storage.
5. Keep a bounded one-way cleanup for legacy token keys without treating their values as
   valid credentials.
6. Revalidate reconnect, logout, refresh rotation, revocation and cross-runtime account
   synchronization without introducing an authentication fallback.

## Exit criteria

- No maintained product code stores or retrieves readable bearer tokens from
  `localStorage` or `sessionStorage`.
- Browser login, reload, refresh, reconnect, revocation and logout satisfy the
  retained SMS/device-bound session contract without persistent readable bearer
  tokens. Their actual runtime validation remains separate from this decision.
- Tauri and supported iOS runtimes use only the approved native credential boundary.
- Legacy stored tokens are removed and cannot authenticate or be migrated into another
  browser-readable key.
- A permanent repository guard rejects new browser-storage bearer-token usage.

## Required validation

- Focused browser, Tauri and supported iOS authentication/session tests.
- Refresh rotation, replay, revocation, logout and reconnect tests.
- Repository scans and a permanent negative guardrail for bearer-token Web Storage.
- `npm run check:execution-order`, security tests and the narrowest relevant WebSocket
  transport suites.

## Historical prescription

The former requirement was: "Browser authentication uses HttpOnly secure cookies
and server-side refresh sessions." It is retained here as provenance only,
superseded by the user's ARB-0001 decision. The future optional password/SMS
choice for an already verified account remains in the existing auth workstream.
