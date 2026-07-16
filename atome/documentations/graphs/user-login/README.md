# Graphs - user-login

## Status

Point traite: user-login.

## Purpose

Ce dossier cartographie le bloc user-login pour faciliter le debug auth UI, session state, anonymous mode, login/logout, cookies/tokens et impact sur project loading.

## Files analyzed

- eVe/intuition/tools/user.js
- atome/src/squirrel/apis/unified/adole_apis.js
- atome/src/squirrel/apis/unified/adole_api/auth.js
- atome/src/squirrel/apis/unified/adole_api/session.js
- atome/src/squirrel/apis/unified/adole.js
- eVe/intuition/tools/project_bootstrap.js
- server/auth.js
- server/userHome.js

## Main entry points

The HTTP entries below are historical code-path observations from the audited snapshot,
not supported target transport. Canonical maintained authentication uses typed `/ws/api`
actions.

- `auth.login` - atome/src/squirrel/apis/unified/adole_api/auth.js:502
- `auth.logout` - atome/src/squirrel/apis/unified/adole_api/auth.js:592
- `auth.current` - atome/src/squirrel/apis/unified/adole_api/auth.js:606
- `setSessionState` - atome/src/squirrel/apis/unified/adole_api/session.js:145
- `waitForAuthCheck` - atome/src/squirrel/apis/unified/adole_api/session.js:236
- `waitForAuthCheck` - eVe/intuition/tools/project_bootstrap.js:93
- Historical `POST /api/auth/register` - server/auth.js:1106
- Historical `POST /api/auth/login` - server/auth.js:1318

## Main risks found

- RISK-001: `MULTI_SOURCE_OF_TRUTH` entre session localStorage, window globals, backend tokens/cookies, adapters et project bootstrap cache.
- RISK-002: `ASYNC_RISK` sur login multi-backend et sync locale detachee.
- RISK-003: `CONFLICT` entre anonymous restore, login reel et project bootstrap.
- RISK-004: `PARTIAL_LIFECYCLE` possible si logout arrive pendant project load.

## Graphs

- 01-call-graph.md
- 02-event-graph.md
- 03-state-graph.md
- 04-source-of-truth-graph.md
- 05-async-graph.md
- 06-lifecycle-graph.md
- 07-risk-map.md
- 08-open-questions.md
