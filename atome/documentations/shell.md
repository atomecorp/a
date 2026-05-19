# Shell API (WS)

This project exposes a restricted shell API over WebSocket. It is **disabled by default** and must be explicitly enabled.

## How it works
- Client sends `{ type: "shell", payload: { command, scope, cwd, token, timeoutMs } }`.
- Server validates the user, checks the allowlist, validates the command, and runs it with `spawn` (no shell).
- By default, commands run inside the per-user sandbox: `data/users/<userId>`.

## .env is required
The `.env` file controls who can use the shell and what is allowed. Without it, the shell is disabled or blocked.

Minimal config:

```env
SQUIRREL_SHELL_ENABLED=1
SQUIRREL_SHELL_ALLOWED_USERS=<user-id-1>,<user-id-2>
SQUIRREL_SHELL_USER_ROOT=data/users
```

Optional hardening:

```env
SQUIRREL_SHELL_ALLOWED_COMMANDS=ls,pwd,whoami,mkdir,touch,cat,echo,stat
SQUIRREL_SHELL_REQUIRE_TOKEN=1
SQUIRREL_SHELL_TOKEN=<sandbox-token>
SQUIRREL_SHELL_ALLOW_INSTALL=0
SQUIRREL_SHELL_ALLOW_ROOT=0
```

Per-user policies (JSON map, keyed by `user.id`):

```env
SQUIRREL_SHELL_USER_POLICIES='{"<user-id>":{"allowedCommands":["*"],"allowInstall":true,"allowRoot":true}}'
SQUIRREL_SHELL_ELEVATED_TOKEN=<elevated-token>
SQUIRREL_SHELL_ROOT_TOKEN=<root-token>
```

Notes on per-user policies:
- `allowedCommands: ["*"]` lets that user run any command that passes the safety checks.
- Per-user policies override the global shell settings.
- A user is allowed if they appear in `SQUIRREL_SHELL_ALLOWED_USERS` **or** have a per-user policy entry.

## Notes
- Use `user.id` for the allowlist to guarantee uniqueness.
- Do not add real credentials or secrets to `.env` in production.
