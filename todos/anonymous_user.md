## Anonymous user work summary

- **Reason / target bug:** When Fastify is connected without an authenticated user, project creation and listing were unreliable (phantom projects, duplicate projects, and atomes created right after a new project could be lost or appear/disappear in the matrix). The anonymous user is a controlled, unsynced identity that keeps local work stable and prevents Fastify from mixing unauthenticated data.
- The default anonymous project must appear in the matrix with the name **welcome**.

- Added an anonymous local mode in the unified API layer with a fixed anonymous identity (phone `0000000000`, username `anonymous`) and local-only data flow (no sync, no sharing).
- Implemented anonymous account creation helpers and retries in the unified API, plus Fastify HTTP registration fallback in browser mode.
- Ensured the anonymous user is created server-side at Fastify startup in `server/auth.js` using deterministic user ID based on phone.
- Exposed anonymous helpers in `AdoleAPI.security` and used them in project security and bootstrap flows to support anonymous workspaces.
- Kept the “Create user” action visible at all times and preserved the anonymous workspace view on logout.
- Seeded a default anonymous project with a welcome message; the default content lives in `src/application/eVe/default_data/default_project.js`.
- Wired bootstrap to create and populate the anonymous default project when the first anonymous project is created.

## Files touched

- src/squirrel/apis/unified/adole_apis.js
- server/auth.js
- src/application/eVe/core/project_security.js
- src/application/eVe/tools/project_bootstrap.js
- src/application/eVe/tools/user.js
- src/application/eVe/default_data/default_project.js
