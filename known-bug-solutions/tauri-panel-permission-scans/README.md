# Tauri panel timeouts caused by permission scans

## Confirmed cause

With the existing Mac account, Home first-open timed out while native stack
sampling showed SQLite permission checks holding the shared database mutex.
The state-current ACL used a correlated principal permission scan for each row.
After that scan was corrected, a second sample showed per-property write ACL
checks still scanning the principal's permission rows.

## Durable correction

Reuse local canonical state-current reads. The list query uses an equivalent
permission membership set; the shared schema indexes permissions by atome,
principal and particle key, replacing the redundant atom-only index. No cache,
account reset, remote preflight or alternative storage owner is introduced.
A remote credential check must not be added before a native local read/write.

## Evidence and regression protection

On the unchanged account, both list queries returned the same 89 IDs. Five
original reads took 3325–4146 ms; corrected reads took 14.4–26.1 ms. An in-memory
permission copy measured 100 checks at 512 ms before and 11 ms after indexing.
See tests/server/permission_query_scope.test.mjs and tests/tauri/local_atome_history.rs.
The final schema bundle opened Home and Dashboard after six relaunches without
the original timeout. Screenshot timing bounds are in FRAMEWORK_STATE.md; they
are not exact paint or background completion measurements.

## Required native acceptance

Use the real account and preserve caches. Open Home and Dashboard after relaunch,
verify populated usable content, then reopen each ten times. Open a project from
Dashboard, including the current project. Suspend the remote service with a
bounded automatic resumption, change depth using the native contextual palette,
and verify local persistence during the interruption and identical event
receipt after reconnect. Do not substitute browser timing for native timing.
