# Secure authentication token storage

Status: Actif

## Confirmed contract

Browser and WebView JavaScript must not persist readable authentication bearer tokens in
`localStorage` or `sessionStorage`.

- Browser authentication uses HttpOnly secure cookies and server-side refresh sessions.
- Native runtimes use a platform credential store or an encrypted vault whose secret is
  not readable from ordinary product JavaScript.
- Authentication material must not enter Atome properties, `state_current`, events,
  synchronization payloads, exports, URLs, logs, or diagnostics.
- Compatibility migration may delete legacy browser-storage keys but must never restore
  them as an active token source.

## Current gap

Maintained Adole and eVe transport modules still contain reads or writes for
`local_auth_token`, `cloud_auth_token`, or legacy `auth_token` browser-storage keys,
despite the security audit recording the browser token-storage remediation as complete.

## Executable scope

1. Inventory every maintained authentication-token read, write, migration and deletion
   in browser, Tauri WebView and iOS WebView code.
2. Distinguish non-secret device identifiers and login hints from bearer material.
3. Route browser sessions through HttpOnly cookies and native bearer material through
   the approved credential-store or encrypted-vault boundary.
4. Remove active bearer-token reads and writes from Web Storage.
5. Keep a bounded one-way cleanup for legacy token keys without treating their values as
   valid credentials.
6. Revalidate reconnect, logout, refresh rotation, revocation and cross-runtime account
   synchronization without introducing an authentication fallback.

## Exit criteria

- No maintained product code stores or retrieves readable bearer tokens from
  `localStorage` or `sessionStorage`.
- Browser login, reload, refresh, reconnect and logout work through the HttpOnly session
  contract.
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
