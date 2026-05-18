# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Apple Mail IMAP and CalDAV Authentication Notes

## Verified status - 14 March 2026

The earlier `LOGIN deprecated` diagnosis was wrong.

Direct probes against `imap.mail.me.com` on 14 March 2026 showed:

- `CAPABILITY` advertises `AUTH=PLAIN`, `AUTH=XOAUTH2`, and related SASL methods.
- `CAPABILITY` does not advertise `LOGINDISABLED`.
- A deliberately wrong `LOGIN` returns `NO [AUTHENTICATIONFAILED] Authentication Failed`.

Conclusion:

- Apple has not disabled the IMAP `LOGIN` command on `imap.mail.me.com`.
- The current blocker is an authentication credential problem, not a `LOGIN` vs `AUTHENTICATE PLAIN` protocol problem.

## What Apple requires

1. Manual iCloud Mail IMAP access uses:
   - server `imap.mail.me.com`
   - port `993`
   - SSL/TLS
   - an app-specific password
2. Modern third-party apps may use the Apple Account authorization flow.
3. If an app does not support that Apple authorization flow, an app-specific password is required for mail, contacts, and calendars.

## Current project diagnosis

- Our IMAP/CalDAV transport path is wired correctly enough to reach Apple and receive authoritative auth failures.
- The live blocker is still a valid credential accepted by Apple for this transport path.
- Recent failed live runs also showed a captured secret length of 9 characters in one attempt, which is inconsistent with a valid 16-character app-specific password once hyphens are removed.

## Strict validation path

1. Confirm 2FA is enabled on the Apple Account in [account.apple.com](https://account.apple.com/).
2. Generate a fresh app-specific password in `Sign-In and Security` -> `App-Specific Passwords`.
3. Remove hyphens before using it in terminal or code.
4. Verify the resulting secret length is exactly 16 characters.
5. Test manually:

```bash
openssl s_client -crlf -quiet -connect imap.mail.me.com:993
```

Then:

```text
A001 LOGIN "jeezs@icloud.com" "abcdefghijklmnop"
A002 SELECT INBOX
A003 LOGOUT
```

Expected:

- `A001 OK` means the credentials are valid for IMAP.
- `NO [AUTHENTICATIONFAILED]` means the credentials are still not accepted by Apple.

## Project implication

The final two Phase 9 tasks can only be closed after a real live IMAP and CalDAV smoke test succeeds with a validated app-specific password or with a future Apple Account authorization-flow implementation replacing the raw IMAP/CalDAV path.
