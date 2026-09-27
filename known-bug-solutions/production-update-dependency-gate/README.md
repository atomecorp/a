# Production update dependency gate

## Symptom

`update_server.sh` stops during `verify-source` on a missing top-level
`node_modules/@emnapi/core` or `node_modules/@emnapi/runtime` lockfile marker.
If the service is restarted afterward, Fastify repeatedly exits because
`node_modules/rubberband-wasm/dist` does not exist, and Nginx returns 502.

## Confirmed ownership and root cause

`scripts/verify_deployed_source.js` owns deployability checks and
`scripts/server_update.js` owns phase ordering. The deployed `package.json`
had removed dependencies without a matching npm 10 lockfile regeneration.
The old verifier detected the missing `@emnapi` entries through literal layout
markers and aborted before `npm ci --omit=dev`; npm 10 independently confirmed
the lockfile mismatch. A later manual restart then exposed the incomplete
pre-update `node_modules` tree.

## Durable correction

Regenerate `package-lock.json` with the npm major used by production. The
source verifier then checks the actual production dependency contract:

- `rubberband-wasm` is declared in `package.json`;
- the root lockfile request matches that declaration;
- the locked package has a version and integrity record.

`npm ci` remains the authority for whole-lockfile consistency instead of a
second partial implementation based on npm's internal package layout. After
that install, the updater verifies the ESM and WASM files that Fastify serves
before it permits a restart. The runtime gate also runs with `--no-deps`, so
that option cannot restart from an incomplete dependency tree.

## Rejected hypotheses

- Nginx is not the owner of this failure; it reports 502 because Fastify is
  unavailable.
- Literal top-level `@emnapi` markers are not a complete lockfile validator;
  npm 10's own `npm ci` result is the authoritative mismatch evidence.
- Registering an empty or alternate static directory would hide the broken
  installation and is not an acceptable runtime fallback.

## Regression checks

Run:

```sh
npm run test:run -- tests/probes/server_identity_deployment_contract.test.mjs
node scripts/verify_deployed_source.js
npm run test:server-verification
```

Production acceptance requires a successful update or dependency install,
`systemctl is-active squirrel`, a clean recent service journal, local
`/health`, and public HTTPS responses through Nginx.
