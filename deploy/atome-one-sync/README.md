# atome.one sync deployment package

Status: prepared, not executed. Production deployment is blocked until the
local Web/Tauri/iOS user acceptance campaign is approved.

## What this package installs

- one Fastify orchestrator bound to `127.0.0.1:3001`;
- authenticated WebSocket upgrades for `/ws/api` and `/ws/sync`;
- one private child vault process, SQLite database, file root, and Unix socket
  per explicitly provisioned principal;
- device-initiated outbound sync only. Fastify never connects to a client.

The macOS/Debian process vault is the current jail substitute. FreeBSD can
replace the provider later; it is not required for this deployment.

## Hard gates

Do not continue unless all are true:

1. local two-account and same-account acceptance is signed off;
2. Web, Tauri, iOS/simulator, offline recovery, manual publish, detached copy,
   revocation, and environment switching have been exercised;
3. a maintenance window and rollback owner exist;
4. DNS and TLS for `atome.one` are valid;
5. the old service, environment, identity keys, database, uploads, and vaults
   have two verified backups on distinct storage.

## Backup and reset gate

The reset is intentionally manual and destructive. Resolve every path before
running it. A suitable backup set contains:

- `/etc/squirrel/squirrel.env` and `/etc/squirrel/identity/`;
- the existing systemd unit and Nginx virtual host;
- the configured `SQLITE_PATH`, uploads, monitored data, and vault root;
- the deployed source revision and `package-lock.json` checksum.

Stop the old service only inside the maintenance window. Create an archive,
store its SHA-256 separately, restore it into a temporary location, and open
the restored SQLite database before removing any production data. Do not reuse
old accounts: after the approved reset, provision the new QA accounts through
the explicit account-provisioning workflow.

## Debian preparation

Expected paths:

```text
/opt/a                              application checkout
/etc/squirrel/squirrel.env          root-owned environment, mode 0600
/etc/squirrel/identity/             persistent signing identity
/var/lib/atome/orchestrator/         Fastify registry SQLite
/var/lib/atome/vaults/               per-principal vault roots
/run/atome-vault/                    private Unix sockets
```

Create a locked `atome` service account and give it write access only to the
three data roots. Copy `environment.example` to
`/etc/squirrel/squirrel.env`, replace every placeholder, generate/preserve the
server identity outside the checkout, then install `atome-sync.service` and the
Nginx virtual host. Use `npm ci`, never an unconstrained production install.

Before the first start, run the repository schema and focused sync checks in a
staging copy. Starting Fastify applies idempotent orchestrator schema changes;
vault schema is applied inside each explicitly provisioned coffre.

## Post-start verification

1. `GET /health` and `/api/server-info` answer through TLS.
2. Anonymous `/ws/sync` receives no `welcome` or application data.
3. Authenticated clients receive `welcome`, then `registered` with only their
   opaque stream ids.
4. `/ws/sync` rejects mutations and `/ws/api sync:push` accepts an authorized
   offline event idempotently.
5. A linked move reaches another user and another same-account session; the
   source session receives no echo.
6. Manual publish exposes only the authorized delta; detached copy never moves.
7. Revocation removes the active stream immediately and replay remains denied.
8. `directory.public` carries redacted invalidations only.
9. Restart one vault and Fastify; replay converges from persisted ACK cursors.
10. Record p95 live-property and create/delete/restore latency before release.

Keep production on the QA accounts until the full matrix is green. Physical
iPhone touch/pixels and real WAN latency cannot be inferred from build checks.

## Rollback

Stop the new service, preserve its logs and new data roots for diagnosis,
restore the verified environment/identity/data backup, reinstall the preceding
unit and virtual host, then verify its identity fingerprint before reopening
traffic. Never merge new vault data into the old service during emergency
rollback.

