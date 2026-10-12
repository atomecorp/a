# Authentication Security — Passwordless Phone-Link Authentication for atome

## Purpose

Implement a production-grade, passwordless authentication system for **atome** whose normal user experience remains deliberately minimal:

1. The user opens atome.
2. The user enters a phone number.
3. atome sends a validation request through the authentication backend.
4. The user receives an SMS containing a validation link.
5. The user taps the link.
6. Authentication completes automatically.
7. No password is created, entered, transmitted, recovered, or displayed.

The implementation may be technically sophisticated internally, but **must not add another normal authentication step for the user**.

This document is an implementation task/prompt for Codex. The security target is: **maximize security inside the constraint “phone number + one SMS-link validation”**, while being explicit about the residual security limit of SMS/PSTN.

---

# Non-negotiable UX invariant

For a normal authentication attempt, the user must perform only:

```text
Enter phone number
        ↓
Receive SMS
        ↓
Tap validation link
        ↓
Authenticated
```

Do not add:

- a password;
- a PIN typed by the user;
- a security question;
- a recovery phrase;
- a manually copied OTP;
- a CAPTCHA in the normal flow unless an abuse threshold has been reached;
- a second confirmation button after the SMS link if the app can complete the validation securely and automatically;
- an additional authenticator prompt during normal low-risk use.

All additional protections should be automatic and invisible whenever possible.

For high-risk recovery cases where the original trusted device and original phone binding are both unavailable, do not weaken security merely to preserve zero friction. If strong recovery cannot be achieved without another trusted proof, **fail safely and document the limitation** rather than pretending SMS alone provides phishing-resistant or SIM-swap-resistant identity proofing.

---

# Security truth that must remain explicit

SMS/PSTN authentication is a **restricted authenticator** in current NIST SP 800-63B guidance because of risks including SIM swap, number porting, reassignment, forwarding, and interception.

Therefore:

- Do not claim that SMS alone is equivalent to a phishing-resistant hardware-backed authenticator.
- Do not claim that software can eliminate SIM-swap risk.
- Treat SMS primarily as the user's visible bootstrap / out-of-band validation step.
- Bind successful authentication to a cryptographic application/device identity whenever the platform permits it.
- Use risk signals and protective policy for first use on a new/untrusted device.
- Make the architecture capable of migrating away from SMS later without rewriting the identity model.

The internal atome account identity must **not** be the phone number itself. Use an opaque random internal subject/user ID. The phone number is a verified, replaceable authenticator/contact binding.

---

# First task: inspect the existing atome authentication architecture

Before changing code:

1. Read the repository instructions, including `Agent.md`, `Work Method.md`, the applicable Task Guard / Code Relation Alignment rules, and any authentication/security documentation.
2. Locate the existing identity/authentication stack.
3. Determine whether Keycloak, OIDC/OAuth, Matrix identity, Jasmin/OVH SMS delivery, or another provider is currently active.
4. Reuse mature existing identity/session capabilities where they already solve the requirement securely.
5. Do not build a parallel authentication universe if the repository already has an authoritative identity provider.
6. Do not silently replace existing authentication infrastructure.
7. Produce a short architecture map before implementation:
   - client entry point;
   - identity provider;
   - atome backend;
   - SMS provider;
   - session/token issuer;
   - device key storage;
   - database tables/state;
   - recovery path.
8. Apply the smallest architectural change that satisfies this specification.

Do not modify unrelated atome subsystems.

---

# Required security architecture

## 1. Stable internal identity

Create/use an opaque internal account identifier such as a CSPRNG-generated UUID-equivalent or equivalent high-entropy subject ID.

Rules:

- Never use the phone number as the immutable primary key.
- Normalize phone numbers server-side to a canonical E.164 representation.
- Treat phone numbers as personal data.
- Store the phone number encrypted at rest where practical.
- If deterministic lookup is required, use a keyed lookup index such as HMAC over the normalized number with a protected server-side key rather than a plain unsalted hash.
- Never place the phone number in authentication URLs.
- Mask phone numbers in logs and administrative displays unless full display is strictly necessary.

---

## 2. Application/device cryptographic identity

On an atome installation, generate an application/device signing key pair.

Requirements:

- Generate the key locally with a cryptographically secure platform API.
- The private key must be non-exportable whenever the platform supports it.
- Prefer hardware-backed / platform-protected storage where available:
  - Apple platforms: Secure Enclave / Keychain-backed mechanisms where compatible;
  - Android: Android Keystore / hardware-backed key where compatible;
  - Browser: WebCrypto non-exportable key material and the strongest available protected persistence;
  - Tauri/desktop: OS secure credential/key storage or a native Rust bridge to platform secure storage.
- Never transmit the private key to the server.
- Server stores only the public key, key identifier, metadata needed for rotation, and trust state.
- Abstract this behind a platform-neutral atome interface so authentication logic is not hard-coded around one OS.

Example conceptual interface:

```text
DeviceKeyProvider
  createKey()
  getPublicKey()
  sign(challenge)
  rotateKey()
  deleteKey()
  getKeyId()
```

Do not invent custom cryptographic algorithms. Use established platform cryptography and standard signature primitives supported by the existing stack.

---

## 3. Start-authentication transaction

Create an authentication transaction before sending the SMS.

Conceptual endpoint:

```text
POST /auth/start
```

Input should include only what is necessary, for example:

```text
phone_number
client_nonce
device_public_key or registered device_key_id
client/platform metadata needed for security policy
```

Server responsibilities:

1. Normalize and validate the phone number.
2. Apply abuse controls before sending an SMS.
3. Create a cryptographically random `attempt_id`.
4. Create a high-entropy random validation token using a CSPRNG.
5. Recommended token entropy: at least 128 bits; prefer 256-bit random material before encoding.
6. Store only a cryptographic hash/HMAC of the raw SMS token, not the raw token itself.
7. Bind the attempt to:
   - `attempt_id`;
   - intended internal subject if already known;
   - normalized phone binding;
   - originating device public-key fingerprint / key ID;
   - client nonce;
   - creation timestamp;
   - expiry timestamp;
   - status;
   - risk state.
8. Set a short expiration window. Start with approximately 5 minutes unless repository/product constraints justify another value.
9. Make the token single-use.
10. Return only an opaque attempt handle to the client.
11. Do not reveal through the API whether the number already belongs to an account.

The database state transition for consuming a token must be atomic to prevent race-condition replay.

Example state machine:

```text
CREATED
  ↓
SMS_SENT
  ↓
PHONE_PROOF_RECEIVED
  ↓
DEVICE_PROOF_VERIFIED
  ↓
AUTHENTICATED

Any state may transition to:
EXPIRED
CANCELLED
BLOCKED
```

A consumed, expired, cancelled or superseded token must never become valid again.

---

## 4. SMS validation link

Send a standard HTTPS URL on an atome-controlled authentication domain.

Conceptual form:

```text
https://auth.<atome-domain>/v/<opaque-attempt>?t=<opaque-token>
```

Exact path is implementation-defined.

Requirements:

- HTTPS only.
- No phone number, user ID, email address, session token, access token, refresh token, private key, or sensitive profile data in the URL.
- Use a dedicated, tightly controlled authentication origin where practical.
- No third-party advertising, analytics, tag managers, or unnecessary external scripts on the validation page.
- Use strict security headers.
- Use `Referrer-Policy: no-referrer`.
- Use `Cache-Control: no-store`.
- Use HSTS.
- Apply a restrictive CSP.
- Prevent framing with CSP `frame-ancestors 'none'` or equivalent.
- Validate the host/domain server-side; never construct the link from an untrusted `Host` header.
- SMS content should be minimal and should make unexpected authentication attempts recognizable.

Do not send a password by SMS.

Do not create a hidden password and send it by SMS.

There is no password in this design.

---

# 5. Verified app linking

For native Apple targets, use verified **Universal Links / Associated Domains** rather than relying only on a custom URL scheme.

For Android targets, use verified **App Links**.

For desktop/browser targets, use the strongest platform-appropriate verified origin/callback mechanism.

Rules:

- Do not trust arbitrary deep-link parameters.
- Validate every received parameter.
- Use an allowlist for accepted hosts, paths, schemes and parameter formats.
- Never let a deep link itself directly perform unrelated destructive or privileged actions.
- Do not accept a validation link from an untrusted domain even if the token format appears valid.
- A custom URL scheme may exist as a compatibility fallback only if the threat model and routing protection are explicit; it must not be the only trust mechanism on platforms that support verified links.

---

# 6. Link click must NOT directly mint a session

This is a core rule.

A raw HTTP `GET` of the SMS URL must **not** be sufficient to authenticate the account or mint a reusable session.

Reason:

- SMS applications and security products may prefetch or preview URLs.
- Link scanners may issue automated GET requests.
- Browser history, proxy logs, crash logs and referrers can leak URLs.
- A copied link must not automatically authenticate an unrelated client.

Required behavior:

1. `GET` may validate syntax, load the minimal handoff page, or trigger the verified app link.
2. The originating atome client must perform the authenticated token-consumption request.
3. The server verifies the SMS token and then requires proof that the client controls the private key associated with the authentication attempt.
4. Only after both proofs succeed may the server issue an authenticated session.

The user still performs only one visible action: tapping the SMS link.

---

# 7. Bind the SMS proof to the originating atome instance

The authentication attempt must be cryptographically bound to the atome instance that initiated it.

Conceptual sequence:

```text
atome client
    |
    | generate/retrieve device key
    | generate client nonce
    v
POST /auth/start
    |
    | attempt_id + server state
    v
SMS provider
    |
    | HTTPS one-time link
    v
user taps link
    |
    v
verified atome app / controlled auth page
    |
    | token + attempt_id
    | signed proof of server challenge
    v
authentication server
    |
    | verify:
    | - token
    | - expiry
    | - unused state
    | - attempt binding
    | - device key binding
    | - nonce/challenge
    | - risk policy
    v
session issued
```

The signature/challenge must include enough transaction context to prevent reuse in another attempt.

For example, sign a canonical message containing:

```text
protocol_version
attempt_id
server_nonce
client_nonce
issued_at
audience/origin
```

Never sign ambiguous concatenated strings. Use a canonical serialized structure and domain separation.

---

# 8. Important limit of device binding

Device binding prevents many stolen-link and replay scenarios, but it does **not** magically defeat SIM swap if an attacker can:

1. start a brand-new authentication attempt on their own device using the victim's number; and
2. receive the victim's SMS because they control the number.

Therefore implement explicit **new-device / recovery risk policy**.

---

# 9. New or untrusted device policy

The visible flow must remain:

```text
phone number → SMS link → tap
```

but server policy may apply additional invisible controls.

At minimum evaluate available risk signals:

- known vs new device key;
- recent device-key replacement;
- recent SIM change signal if a trustworthy provider offers it;
- recent number porting signal if available;
- number reassignment / line-type intelligence if reliable and legally usable;
- impossible or highly abnormal geovelocity at a coarse security-signal level;
- IP reputation;
- ASN / hosting / proxy / Tor risk as a signal, never as sole identity proof;
- repeated attempts across many phone numbers;
- repeated attempts for one number across many devices;
- SMS send velocity;
- previously trusted device presence;
- account age;
- recent recovery/change operations.

Do not silently deny legitimate users solely because one heuristic is unusual. Use a risk engine with auditable reasons.

For a first authentication from a new device, consider:

- registering the new public key only after the SMS proof succeeds;
- marking the new key as recently enrolled;
- placing high-impact account actions behind a temporary cooling-off period when risk is elevated;
- sending a security notification to existing trusted channels/devices when possible;
- silently obtaining cryptographic confirmation from an already trusted device when technically available and safe, without adding user interaction;
- revoking or limiting the new device if later fraud signals appear.

Any cooling-off rule must be product-configurable and documented.

---

# 10. Phone-number change and account recovery

Treat a phone-number change as **authenticator replacement**, not profile editing.

Preferred secure path when a trusted device still exists:

```text
trusted device key proof
        +
new phone SMS validation
        ↓
phone binding changed
```

This can still be nearly invisible to the user if the trusted-device proof occurs automatically.

If no trusted device exists and the old number is unavailable, SMS to a new number alone cannot prove continuity of identity with high assurance.

In that case:

- do not silently transfer the old account to a new number based only on an untrusted request;
- use a deliberately designed recovery procedure;
- apply delay/notification/manual recovery where the account sensitivity requires it;
- document the residual trade-off.

Never weaken the normal protocol by creating an administrative backdoor that bypasses the authentication guarantees.

---

# 11. Phone-number recycling

Phone numbers can be reassigned.

Required design:

- phone number is not the internal identity;
- keep binding timestamps and verification history;
- support revocation of a number binding;
- treat long-inactive accounts and reactivated numbers cautiously;
- make re-binding policy explicit;
- never assume permanent ownership of a phone number.

---

# 12. Enumeration resistance

An attacker must not be able to discover whether a phone number has an atome account through obvious response differences.

Use generic client responses such as a single equivalent state for:

- existing account;
- eligible new account;
- rate-limited or policy-controlled cases where disclosure would be dangerous.

Keep response timing and payload differences from becoming an easy enumeration oracle.

Internal logs may preserve the real reason.

---

# 13. SMS abuse and denial-of-wallet protection

SMS sending costs money and can be abused.

Implement layered rate limits and quotas over:

- phone number;
- IP;
- device/application instance;
- account;
- subnet / ASN where appropriate;
- global provider budget;
- time windows;
- number of unique numbers attempted by one source.

Requirements:

- progressive backoff;
- server-side enforcement;
- avoid a single global lock that attackers can exploit to deny access to victims;
- configurable provider cost/volume guardrails;
- alerting on spikes;
- safe provider failover if multiple providers are supported;
- do not expose provider credentials to the client.

A CAPTCHA or other interactive anti-bot challenge may be introduced **only after abuse/risk thresholds**, not as a permanent normal-flow step.

---

# 14. Token replay and race protection

The SMS token must be:

- high entropy;
- short-lived;
- single-use;
- stored hashed/HMACed;
- bound to one authentication attempt;
- consumed atomically;
- invalidated immediately after successful consumption;
- invalidated when a newer attempt supersedes it if policy requires;
- invalid after expiration;
- invalid after account/phone binding changes that make the attempt stale.

Test simultaneous requests against the same token. Exactly one may succeed.

---

# 15. Session security

After authentication, do not let the SMS link itself become the long-lived credential.

Issue a normal secure application session.

Prefer the existing standard identity/session stack if available.

Requirements:

- short-lived access tokens;
- rotating refresh tokens or equivalent secure server sessions;
- refresh-token reuse detection where supported;
- session revocation;
- per-device session tracking;
- ability to revoke one device without revoking every device;
- explicit token audience and issuer validation;
- cryptographically unpredictable identifiers;
- no session token in URLs;
- no sensitive token in client logs;
- no access/refresh token in insecure browser storage if a safer architecture is available;
- secure, `HttpOnly`, `Secure`, appropriately `SameSite` cookies for browser sessions when the architecture uses cookies;
- CSRF protection when cookies are used for authenticated state-changing requests;
- session fixation prevention;
- session rotation after authentication and privilege changes.

Where compatible with the existing identity stack, use proof-of-possession/device-bound session techniques rather than bearer-only credentials for high-value operations.

Do not invent a proprietary alternative to OIDC/OAuth session security when the existing stack already provides a mature implementation.

---

# 16. Authentication domain hardening

The authentication service/domain should have:

- TLS 1.2 minimum if compatibility requires it, with TLS 1.3 preferred;
- HSTS;
- restrictive CSP;
- `Referrer-Policy: no-referrer`;
- `Cache-Control: no-store`;
- no unnecessary third-party JavaScript;
- no mixed content;
- no open redirects;
- strict input validation;
- strict output encoding;
- protection against XSS;
- CSRF protection where applicable;
- minimal CORS policy;
- explicit trusted-origin allowlist;
- security headers tested automatically.

Do not build callback URLs from untrusted request headers.

---

# 17. Secrets and cryptographic material

Store server secrets using the existing secure secret-management mechanism.

Protect:

- SMS provider credentials;
- HMAC/lookup keys;
- signing keys;
- encryption keys;
- OIDC client secrets where applicable;
- database credentials.

Requirements:

- no secrets committed to Git;
- no secrets embedded in JS shipped to clients;
- environment separation;
- least privilege;
- key rotation plan;
- revocation plan;
- auditable access;
- production and development keys must be different.

Prefer KMS/HSM-backed signing/encryption where the deployment environment already provides it.

---

# 18. Logging and audit

Create security events for at least:

- authentication started;
- SMS requested;
- SMS provider accepted/rejected;
- link proof received;
- token rejected and reason category;
- token replay attempt;
- token expired;
- device proof succeeded/failed;
- new device key enrolled;
- device key revoked;
- session created;
- session refreshed;
- session revoked;
- phone binding changed;
- recovery started/completed;
- abuse/rate-limit trigger;
- elevated-risk decision.

Never log:

- raw SMS tokens;
- private keys;
- access tokens;
- refresh tokens;
- full authorization headers;
- unnecessary full phone numbers.

Logs must be useful for incident investigation without becoming a credential database.

---

# 19. Privacy and data minimization

Collect only authentication data that is actually needed.

For risk telemetry:

- document each signal;
- define retention;
- define purpose;
- avoid precise location unless genuinely required and legally justified;
- minimize persistent device fingerprinting;
- do not repurpose authentication telemetry for advertising;
- respect applicable privacy requirements.

Security risk signals must not silently become general tracking infrastructure.

---

# 20. Failure behavior

Fail closed for authentication uncertainty.

Examples:

- expired token → reject;
- unknown attempt → reject;
- mismatched device proof → reject;
- already consumed token → reject;
- malformed link → reject;
- wrong audience/origin → reject;
- missing cryptographic proof when required → reject;
- database state conflict → reject safely;
- SMS provider uncertainty → do not mark authentication complete;
- risk engine unavailable → use a defined conservative fallback policy.

Never convert infrastructure errors into successful authentication.

---

# 21. Security notifications

Without adding normal login friction, notify the user when appropriate about:

- a new device registered;
- phone number changed;
- recovery started;
- suspicious authentication;
- all sessions revoked;
- security-sensitive account changes.

Notifications must not contain reusable authentication credentials.

---

# 22. Recommended protocol separation

Keep these concepts separate in the implementation:

```text
Identity
    opaque atome subject ID

Phone binding
    verified replaceable phone authenticator/contact

Authentication attempt
    short-lived transaction

SMS proof
    one-time proof that the current attempt received the link

Device proof
    signature proving possession of the attempt-bound private key

Session
    post-authentication credential with independent lifecycle

Recovery
    exceptional continuity-of-identity process
```

Do not collapse these into one `users.phone + token` table.

---

# 23. Suggested data model

Adapt names to the existing stack. Do not create duplicate tables if equivalent authoritative models already exist.

Conceptually:

```text
users
  id
  status
  created_at

phone_bindings
  id
  user_id
  encrypted_phone
  phone_lookup_hmac
  verified_at
  revoked_at
  last_reverified_at

device_keys
  id
  user_id
  public_key
  key_fingerprint
  platform
  trust_state
  enrolled_at
  last_used_at
  revoked_at

auth_attempts
  id
  phone_lookup_hmac
  candidate_user_id
  device_key_id / proposed_public_key
  client_nonce
  server_nonce
  token_hash
  created_at
  expires_at
  consumed_at
  state
  risk_state

sessions
  id
  user_id
  device_key_id
  created_at
  expires_at
  revoked_at
  security_metadata

security_events
  id
  user_id
  device_key_id
  event_type
  timestamp
  reason_category
  non-secret metadata
```

Apply appropriate uniqueness constraints and indexes.

---

# 24. API behavior

Design exact endpoints after inspecting the current backend.

A possible conceptual API:

```text
POST /auth/start
GET  /auth/link/:attempt_id
POST /auth/verify-link
POST /auth/device-proof
GET  /auth/status/:attempt_id
POST /auth/refresh
POST /auth/logout
POST /auth/logout-device
POST /auth/logout-all
POST /auth/phone-change/start
POST /auth/phone-change/confirm
```

This list is conceptual, not mandatory.

Prefer fewer clean state transitions over many redundant endpoints.

Every endpoint must define:

- authentication requirement;
- authorization requirement;
- input schema;
- output schema;
- errors;
- rate limits;
- replay rules;
- idempotency/race behavior;
- logging;
- privacy exposure;
- tests.

---

# 25. Polling / completion without extra user action

After the user taps the SMS link, the originating atome instance should complete authentication automatically.

Possible mechanisms:

- short-lived polling using an opaque attempt capability;
- SSE;
- WebSocket;
- push/IPC mechanism already present in atome;
- direct Universal Link callback to the originating app.

Choose the simplest mechanism compatible with the current architecture.

The polling/status capability must itself be unguessable and scoped only to that authentication attempt. It must not expose account data before authentication.

Do not require the user to manually return and press “Continue” if the platform can complete the flow automatically.

---

# 26. Provider independence

Do not couple atome identity to one SMS vendor.

Create a small provider abstraction, for example:

```text
SmsProvider
  sendValidationLink(phone, message)
  getDeliveryStatus(messageId)
```

Provider-specific implementation may support the current SMS infrastructure, but authentication semantics must remain provider-independent.

Switching SMS provider must not change account identity, device keys, token semantics or sessions.

---

# 27. No custom cryptography

Forbidden:

- home-made encryption;
- reversible obfuscation presented as encryption;
- predictable tokens;
- `Math.random()` for security;
- custom signature algorithms;
- static shared secrets embedded in the app;
- raw private-key export to JavaScript if a protected native key can sign on behalf of the app;
- token equality based on insecure string generation;
- trusting client timestamps or client risk decisions.

Use established libraries and platform cryptographic APIs.

---

# 28. Security tests — mandatory

Implement automated tests covering at minimum:

## Happy path

- new user;
- existing user;
- existing trusted device;
- valid new device;
- expired session refresh;
- logout one device;
- logout all devices.

## SMS/token tests

- valid token succeeds once;
- second use fails;
- expired token fails;
- malformed token fails;
- wrong attempt fails;
- token from attempt A cannot authenticate attempt B;
- simultaneous token consumption allows exactly one success;
- URL prefetch/GET does not authenticate;
- token does not appear in logs;
- token does not appear in referrer data;
- token does not remain usable after phone binding changes.

## Device-binding tests

- correct signature succeeds;
- wrong device key fails;
- copied link on unrelated device does not complete the originating attempt;
- replayed device signature fails;
- signature for another audience/origin fails;
- revoked key fails;
- rotated key behavior is correct.

## Enumeration tests

- unknown and known phone numbers do not expose obvious account-existence differences;
- rate-limit behavior does not trivially expose account existence.

## Abuse tests

- repeated sends to one number;
- one source attacking many numbers;
- many sources attacking one number;
- provider error;
- provider timeout;
- global send surge;
- rate limiter unavailable.

## Session tests

- session fixation attempt;
- stolen/replayed refresh token;
- refresh-token reuse detection;
- revoked session;
- revoked device;
- wrong issuer;
- wrong audience;
- expired token;
- privilege/session rotation.

## Deep-link tests

- wrong host;
- wrong scheme;
- malformed parameters;
- extra unexpected parameters;
- open redirect attempt;
- custom-scheme hijack scenario where applicable;
- Universal Link/App Link association failure fallback.

## Recovery tests

- trusted-device phone change;
- new-device recovery;
- old number unavailable;
- number recently ported;
- elevated-risk recovery;
- notification delivery failure.

---

# 29. Adversarial review

Before declaring the implementation complete, perform a focused abuse-case review for:

- SIM swap;
- number port fraud;
- SS7/SMS interception;
- stolen unlocked phone;
- malicious app attempting deep-link interception;
- phishing page imitating atome;
- copied/forwarded SMS;
- URL-preview bots;
- replay;
- race conditions;
- credential/token leakage through logs;
- browser history leakage;
- referrer leakage;
- XSS on auth domain;
- CSRF where cookie sessions exist;
- open redirects;
- account enumeration;
- SMS bombing;
- denial-of-wallet;
- session theft;
- database theft;
- SMS provider compromise;
- secret leakage;
- compromised admin/support account;
- phone-number recycling;
- recovery-process abuse.

For each threat, record:

```text
threat
attack path
current mitigation
residual risk
test covering it
operational detection
```

Do not mark a threat “solved” when it is only reduced.

---

# 30. Acceptance criteria

The task is complete only when all applicable criteria below are true.

## User experience

- [ ] Normal user enters only a phone number.
- [ ] User receives one SMS validation link.
- [ ] User taps the link once.
- [ ] User is authenticated automatically.
- [ ] No password exists in the workflow.
- [ ] No OTP must be copied manually.
- [ ] No normal second-factor screen is added.

## Protocol

- [ ] Each authentication attempt has a unique high-entropy ID/token.
- [ ] Raw SMS token is not stored server-side.
- [ ] Token is short-lived.
- [ ] Token is one-time.
- [ ] Consumption is atomic.
- [ ] Plain `GET`/prefetch cannot create a session.
- [ ] Attempt is bound to the originating device/app cryptographic identity where supported.
- [ ] Device private key never leaves protected client storage.
- [ ] Server verifies a fresh signed challenge before session issuance when device binding is required.
- [ ] Replays fail.
- [ ] Wrong-device proofs fail.

## Platform linking

- [ ] Apple uses verified Universal Links/Associated Domains where applicable.
- [ ] Android uses verified App Links where applicable.
- [ ] Parameters and origins are strictly validated.
- [ ] No open redirect exists.

## Sessions

- [ ] Authentication link is not the long-lived session.
- [ ] Access/session credentials have bounded lifetime.
- [ ] Refresh/session rotation is implemented according to the existing auth stack.
- [ ] Revocation works.
- [ ] Per-device revocation works where supported.
- [ ] Session credentials never appear in URLs.

## Abuse/privacy

- [ ] SMS rate limiting is implemented.
- [ ] Account enumeration is mitigated.
- [ ] Secrets/tokens are redacted from logs.
- [ ] Phone numbers are handled as personal data.
- [ ] Provider credentials remain server-side.
- [ ] Security events are auditable.

## Recovery

- [ ] Phone number is not the immutable atome identity.
- [ ] New-device enrollment has an explicit risk policy.
- [ ] Phone-number change is treated as authenticator replacement.
- [ ] SIM-swap residual risk is documented.
- [ ] High-risk recovery does not silently bypass the protocol.

## Verification

- [ ] Automated tests cover the cases in this document.
- [ ] Security-critical state transitions have concurrency tests.
- [ ] No skipped security test is reported as passed.
- [ ] Any unavailable platform-specific protection is reported as `not verified`, not `validated`.
- [ ] Existing unrelated atome behavior remains unchanged.

---

# 31. Deliverables

Codex must provide:

1. **Architecture note**
   - existing auth stack found;
   - chosen integration path;
   - protocol/state diagram;
   - trust boundaries;
   - residual risks.

2. **Implementation**
   - server/backend changes;
   - client changes;
   - device-key abstraction;
   - SMS-provider adapter;
   - verified-link handling;
   - session integration;
   - risk/rate-limit controls.

3. **Data/storage changes**
   - migrations;
   - indexes;
   - constraints;
   - secret handling.

4. **Configuration**
   - development;
   - test;
   - production;
   - SMS provider;
   - auth domain;
   - Universal Links/App Links association files where applicable.

5. **Automated tests**
   - unit;
   - integration;
   - concurrency;
   - end-to-end;
   - abuse cases.

6. **Operational documentation**
   - key rotation;
   - SMS provider outage;
   - compromised provider credentials;
   - session revocation;
   - device-key revocation;
   - suspected SIM swap;
   - incident-response logging.

7. **Final report**
   - exact files changed;
   - tests run;
   - passed / failed / not verified;
   - known limitations;
   - residual risks;
   - no unsupported claims of “100% secure”.

---

# 32. Implementation constraints for atome

- Preserve atome's architecture and naming.
- Keep the security engine modular and platform-agnostic.
- Prefer vanilla JavaScript on the front end.
- Rust/native code is acceptable for secure platform integration where needed.
- Do not introduce TypeScript merely for this task.
- Do not introduce Python into the atome runtime/build solely for this feature.
- Reuse existing proven libraries/protocols instead of reproducing security primitives.
- Keep SMS delivery behind an adapter.
- Keep device-key storage behind an adapter.
- Keep risk evaluation behind an adapter.
- Keep identity/session issuance behind the existing authoritative identity layer when one exists.
- Do not entangle authentication with UI menus or unrelated atome components.
- Follow Task Guard / approved-scope rules.
- Do not revert unrelated user changes.

---

# 33. Reference standards and guidance

Use the current versions applicable at implementation time, not copied assumptions from this file.

Primary references:

- NIST SP 800-63B-4 — Authentication and Authenticator Management  
  https://pages.nist.gov/800-63-4/sp800-63b.html

- NIST SP 800-63B-4 — Authenticators / Restricted Authenticators  
  https://pages.nist.gov/800-63-4/sp800-63b/authenticators/

- OWASP Authentication Cheat Sheet  
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

- OWASP Session Management Cheat Sheet  
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

- OWASP Forgot Password Cheat Sheet — apply its one-time URL-token handling principles to the SMS magic-link transaction  
  https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html

- Apple — Supporting Universal Links / Associated Domains  
  https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app  
  https://developer.apple.com/documentation/xcode/supporting-associated-domains

Also consult the current Android Verified App Links guidance when implementing Android support, and the current security guidance for the identity/session framework actually present in the repository.

---

# 34. Final instruction to Codex

Implement this as a **real security protocol**, not as “send a link and set `logged_in = true`”.

The user's required normal experience is fixed:

```text
phone number → SMS link → one tap → authenticated
```

Everything else should happen securely behind the scenes.

Prioritize, in this order:

1. no authentication bypass;
2. correct trust boundaries;
3. one-time transaction binding;
4. device/application proof;
5. secure session lifecycle;
6. SIM-swap/new-device risk mitigation;
7. abuse resistance;
8. privacy;
9. maintainability and provider independence;
10. preservation of the minimal UX.

If a security property cannot be guaranteed under the “SMS + one tap” constraint, document the exact residual risk instead of weakening the system or making a false claim.

---

# 35. OVHcloud SMS integration profile for atome

This section fixes the concrete SMS provider implementation currently selected for atome.

## Known OVHcloud account information

```text
Provider: OVHcloud SMS
Region/API endpoint family: OVH Europe (ovh-eu)
SMS serviceName: sms-uh8326-1
Initial pack information supplied by owner: 100 SMS credits
Use case: transactional authentication SMS containing a one-time HTTPS validation link
```

The initial credit count is informational only. Never hard-code `100` as an operational limit or assume it is still current. Query/monitor current balance through OVHcloud or the OVHcloud manager.

The `serviceName` (`sms-uh8326-1`) is configuration, not an authentication secret. It may be stored server-side in normal configuration, but there is no reason to expose it to the browser/mobile client.

## Important OVHcloud constraint for this workflow

The authentication SMS contains an HTTPS URL.

OVHcloud documents that its French **short-number sender with replies (`senderForResponse`) cannot be used for SMS containing a URL**. Therefore the atome authentication flow must use an **approved alphanumeric sender**, not `senderForResponse`.

Target sender name:

```text
ATOME
```

If `ATOME` is not already approved in the OVHcloud SMS account, the project owner must create/request this sender in the OVHcloud control panel. OVHcloud states that an alphanumeric sender is limited to 11 alphanumeric characters and may require supporting documentation/validation.

Implementation rule:

```text
senderForResponse = false
sender = approved OVHcloud alphanumeric sender (prefer "ATOME")
```

Do not silently fall back to the reply-enabled short number because authentication messages contain a URL and such sends may be blocked by OVHcloud.

---

# 36. OVHcloud API authentication — secrets required

For the REST API selected here, **do not use the OVHcloud account password** and do not use the legacy SMS-user password flow.

OVHcloud REST API access requires three API credentials:

```text
OVH Application Key
OVH Application Secret
OVH Consumer Key
```

Create a dedicated credential set for the atome authentication service. Apply least privilege and restrict it to this SMS account when possible.

Recommended rights for the production sender service:

```text
GET  /sms/sms-uh8326-1
GET  /sms/sms-uh8326-1/jobs
POST /sms/sms-uh8326-1/jobs
GET  /sms/sms-uh8326-1/outgoing
GET  /sms/sms-uh8326-1/outgoing/*
```

If only sending is initially implemented, the minimum essential permission is:

```text
POST /sms/sms-uh8326-1/jobs
```

Add read permissions only when needed for balance/status/diagnostics. Do not grant `/sms/*` across all SMS accounts if this specific account is sufficient.

OVHcloud token creation entry point documented by OVHcloud:

```text
https://auth.eu.ovhcloud.com/api/createToken
```

The owner must generate the credentials interactively if they do not already exist. Codex must never request or store the OVHcloud manager/account password.

---

# 37. Local secret storage on the owner's Mac

The owner has a dedicated `private` directory on the Mac for sensitive files.

Codex must first locate the existing intended `private` directory from the repository/workspace configuration. If more than one candidate exists, or its exact path cannot be determined safely, ask the owner for the exact absolute path before writing secrets.

For local development, create/use a file conceptually named:

```text
<OWNER_PRIVATE_DIR>/ovh_sms.env
```

Recommended contents:

```dotenv
OVH_API_ENDPOINT=ovh-eu
OVH_SMS_SERVICE_NAME=sms-uh8326-1
OVH_SMS_SENDER=ATOME
OVH_API_APPLICATION_KEY=
OVH_API_APPLICATION_SECRET=
OVH_API_CONSUMER_KEY=
```

Rules:

- The three credential values remain empty placeholders until supplied/generated by the owner.
- Never put real values in this Roadmap document.
- Never put real values in source code, JavaScript bundles, Tauri web assets, Git commits, issues, logs, screenshots or test fixtures.
- Never expose these credentials to browser JavaScript, WKWebView, WebView, mobile app code or any downloadable client.
- SMS sending must happen from the trusted server/authentication backend only.
- Restrict the local secret file to the owner account (for example mode `0600` on Unix/macOS filesystems where applicable).
- If the private directory is inside a Git working tree, ensure the directory/file is ignored before writing any credential.
- Add a safe template such as `ovh_sms.env.example` containing names only, never values, if the repository's conventions allow it.
- Development/staging/production must use separate API credentials.

The local Mac `private` directory is a **development secret source only**. Production credentials must be injected into the server through the existing production secret mechanism/environment or a dedicated secret manager. Do not design production so that it depends on a file located on the owner's Mac.

If the deployment does not already provide a secure secret store, document the production secret-injection choice before going live. OVHcloud Secret Manager is an optional candidate, not a requirement for the first implementation.

---

# 38. OVHcloud REST API integration

Use the OVHcloud REST SMS API from the backend provider adapter.

Primary send endpoint:

```text
POST /sms/{serviceName}/jobs
```

For atome:

```text
POST /sms/sms-uh8326-1/jobs
```

OVHcloud also exposes:

```text
GET /sms
GET /sms/{serviceName}
GET /sms/{serviceName}/jobs
GET /sms/{serviceName}/outgoing
GET /sms/{serviceName}/outgoing/{id}
```

If the authentication backend is Node.js-compatible, the OVHcloud-documented Node.js wrapper may be used (`ovh` npm package) provided it remains maintained/compatible at implementation time. If another backend language/runtime is authoritative in atome, use OVHcloud's supported API mechanism for that runtime rather than introducing a separate Node service solely for SMS.

Do not use the legacy `http2sms` URL/password mechanism for this authentication system unless the REST API becomes unavailable and a separate security review explicitly approves the fallback.

Provider adapter remains conceptually:

```text
SmsProvider
  sendValidationLink(phoneE164, message, metadata)
  getDeliveryStatus(providerMessageId)
  getBalanceOrAccountStatus()
```

The rest of atome authentication must not depend on OVH-specific response structures.

---

# 39. OVHcloud send payload for authentication messages

Build an OVHcloud job using the approved sender and the normalized E.164 receiver.

Conceptual payload:

```json
{
  "charset": "UTF-8",
  "class": "phoneDisplay",
  "message": "atome - Validez votre connexion : https://auth.example/v/<opaque>",
  "noStopClause": true,
  "priority": "high",
  "receivers": ["+336XXXXXXXX"],
  "sender": "ATOME",
  "senderForResponse": false
}
```

This is conceptual: before implementation, Codex must check the current OVHcloud API schema and the actual approved sender value in the account.

Authentication SMS is transactional, not marketing. OVHcloud documents `noStopClause` for non-commercial messages; use it for this authentication message if current OVHcloud policy/API schema still supports it.

Do not use Unicode characters, decorative emoji or unnecessarily long text in the authentication SMS. Keep it in GSM-7-compatible text where practical so one login normally consumes one SMS credit.

Recommended message form:

```text
atome - Validez votre connexion : https://<AUTH_DOMAIN>/v/<TOKEN>
```

Optionally include a very short anti-phishing warning while remaining within one SMS segment, for example:

```text
atome - Connexion demandee. Validez : <URL>. Si ce n'est pas vous, ignorez ce SMS.
```

Do not put in the SMS:

- the phone number;
- account/user ID;
- a password;
- an access token;
- refresh token;
- private device key;
- unnecessary personal data.

The URL token remains the one-time authentication transaction token defined earlier in this document.

---

# 40. OVHcloud result handling and delivery tracking

OVHcloud job creation returns provider information including valid/invalid receivers, provider message IDs and credits removed.

The adapter must map the provider response into an internal neutral result, for example:

```text
accepted: boolean
provider: "ovhcloud"
provider_message_ids: [...]
receiver_status: valid | invalid | unknown
credits_removed: number | unknown
```

Never interpret “OVHcloud accepted the job” as proof that the user received the SMS.

Authentication state remains:

```text
AUTH_ATTEMPT_CREATED
    ↓
SMS_PROVIDER_ACCEPTED
    ↓
USER_CLICKED_VALID_LINK
    ↓
DEVICE_PROOF_VERIFIED
    ↓
AUTHENTICATED
```

A delivery receipt may improve telemetry, but only the actual one-time-link proof + device proof may authenticate the user.

Store provider message/job IDs only for operational diagnostics and delivery correlation. They are not authentication credentials.

Implement monitoring for:

- send accepted/rejected;
- invalid receiver;
- insufficient credit;
- provider timeout;
- provider rate limiting;
- delivery failure if status is available;
- abnormal credit consumption;
- repeated sends to one number/device/IP;
- account credit running low.

Do not log the raw magic-link token or complete SMS body if it contains the raw token.

---

# 41. Automatic end-to-end atome + OVHcloud flow

The complete target behavior is:

```text
1. User opens atome.
2. User enters phone number.
3. Client normalizes/submits number to atome auth backend.
4. Backend creates auth attempt + one-time token + device binding.
5. Backend constructs HTTPS magic link.
6. Backend invokes OvhSmsProvider.
7. OvhSmsProvider authenticates to OVHcloud with AK/AS/CK from server secret storage.
8. OvhSmsProvider calls POST /sms/sms-uh8326-1/jobs.
9. OVHcloud sends the transactional SMS using approved sender ATOME.
10. User taps the link.
11. Link is consumed only through the secure transaction protocol described above.
12. Device/application proof is verified.
13. Server creates the authenticated session.
14. Client becomes connected automatically.
```

Visible user workflow remains exactly:

```text
phone number → SMS → one tap → authenticated
```

OVHcloud integration must not add any extra normal user step.

---

# 42. Codex implementation checklist specific to OVHcloud

Before coding:

- [ ] Confirm `sms-uh8326-1` exists and is the intended SMS account.
- [ ] Confirm REST API is the selected transport.
- [ ] Confirm an alphanumeric sender is approved for URL-bearing authentication SMS; prefer `ATOME`.
- [ ] Confirm `senderForResponse` is disabled.
- [ ] Confirm the production authentication domain that will appear in the SMS.
- [ ] Confirm where the owner's local `private` directory is located if it cannot be discovered unambiguously.
- [ ] Confirm that AK/AS/CK credentials exist; if not, stop at the secret-creation step and tell the owner exactly which three values are required.
- [ ] Restrict OVH API rights to `sms-uh8326-1` and only required operations.
- [ ] Confirm no OVH secret is present in Git history or client code.

Implementation:

- [ ] Implement `OvhSmsProvider` behind the generic `SmsProvider` interface.
- [ ] Load credentials server-side only.
- [ ] Normalize receivers to E.164.
- [ ] Send `sender=ATOME` (or actual approved value).
- [ ] Set `senderForResponse=false`.
- [ ] Use `noStopClause=true` only for transactional auth SMS and verify this against current provider policy.
- [ ] Capture provider message IDs without logging secrets/tokens.
- [ ] Map OVH errors to internal provider-independent errors.
- [ ] Add retries only for safe transient failures; retries must not create uncontrolled duplicate SMS sends.
- [ ] Add idempotency/deduplication at the atome layer.
- [ ] Add rate limiting and cost controls from the earlier sections.
- [ ] Add low-credit warning/monitoring.

Tests:

- [ ] Mock OVHcloud API for normal CI tests; never spend real SMS credits in ordinary unit tests.
- [ ] Add a manually enabled integration test using a dedicated test destination number.
- [ ] Validate correct serviceName.
- [ ] Validate missing AK/AS/CK fails closed.
- [ ] Validate invalid credentials fail closed.
- [ ] Validate insufficient credits fails cleanly.
- [ ] Validate invalid receiver does not authenticate.
- [ ] Validate provider timeout cannot authenticate.
- [ ] Validate URL-bearing SMS never uses `senderForResponse=true`.
- [ ] Validate the magic-link token never appears in application logs.

---

# 43. Owner actions still required before a live OVHcloud test

The implementation can be prepared without exposing secrets, but a real SMS cannot be sent until these provider-side prerequisites are complete:

1. Generate a dedicated OVHcloud API credential set for the atome authentication sender:
   - Application Key;
   - Application Secret;
   - Consumer Key.
2. Put those three values only in the approved local secret file / production secret store.
3. Verify or create the approved alphanumeric sender `ATOME` in the OVHcloud SMS account.
4. Provide/configure the final atome authentication domain used by the SMS magic link.

No OVHcloud account password is required in the atome implementation when using the REST API described here.

If Codex reaches one of these missing external prerequisites, it must stop only that dependent step, report exactly what is missing, and continue implementing/testing everything that can be completed safely without the secret.

---

# 44. OVHcloud references verified for this integration

The implementation should re-check the live documentation at coding time. As of the preparation of this section, the relevant OVHcloud documentation is:

- Node.js REST SMS guide:
  `https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/send-sms-api-nodejs`
- SMS API cookbook:
  `https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/api-sms-cookbook`
- SMS sender rules:
  `https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/sms-senders`
- SMS FAQ:
  `https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/faq-sms`
- API token creation:
  `https://auth.eu.ovhcloud.com/api/createToken`

Critical provider facts to re-verify before deployment:

- the exact REST payload schema;
- API credential permission syntax;
- sender approval status;
- sender constraints for URLs;
- transactional `noStopClause` behavior;
- delivery/status endpoints;
- pricing/credit behavior.
