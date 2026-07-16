# Production SMS provider boundary

Status: Actif

## Product decision

All eVe/Atome application communication remains WebSocket-only. Authentication,
verification and recovery requests enter the canonical server through `/ws/api`; no
client or product-domain module may call an SMS provider directly or introduce an HTTP,
REST or SMPP application transport.

The production server may use the protocol imposed by the configured SMS provider at
the external infrastructure boundary. This narrow exception does not create a second
eVe/Atome communication architecture:

- the application request and result remain typed `/ws/api` messages;
- one server-owned SMS transport contract converts an authorized internal send command
  to the configured provider protocol;
- exactly one provider is active for a deployment;
- provider credentials, delivery identifiers and callbacks remain infrastructure data;
- provider unavailability returns a typed failure and must not trigger an automatic
  fallback to another provider or expose an OTP;
- development/test bypass remains forbidden in production.

OTP challenges use the existing PostgreSQL infrastructure. No Valkey/Redis service is
introduced. An OTP challenge is short-lived verification state, not durable account
state and not an Atome:

- PostgreSQL stores only a protected code verifier, opaque challenge identifier,
  principal or protected pre-auth identity reference, purpose, expiry, remaining
  attempts and consumption state;
- the plaintext OTP exists only long enough to be sent to OVHcloud and must never be
  persisted or logged;
- verification atomically consumes or invalidates the challenge;
- expired or consumed challenges are deleted;
- successful device enrollment writes only the durable authorized-device identifier,
  public verification material and audit metadata, never the OTP;
- challenges and device credentials never enter Atome events, `state_current`, sync,
  snapshots or product history.

Authentication and OTP abuse controls must not globally lock an account after a fixed
number of failures. A person who only knows the user's phone number must not be able to
deny that user access. Apply progressive, purpose-scoped throttling across the relevant
dimensions instead:

- account or stable principal when known;
- protected phone identity;
- OTP challenge and recovery transaction;
- authorized or candidate device;
- network source and broader abuse signals;
- OVHcloud sending quota and application-wide cost budget.

Delays and temporary request suppression increase with repeated failures. A successful
strong authentication may clear the appropriate risk counters, but must not erase
security audit evidence. Responses remain anti-enumeration-safe and must not reveal
whether an account, phone, device or challenge exists.

Security logging is minimized and separate from Atome history. It records the security
event type, time, result, purpose, opaque principal/device references when available,
reason category and narrowly required correlation identifiers. It must not persist a
raw IP address or full user-agent string:

- a raw network address may be held only for the short active throttling window;
- the durable security record uses a rotating keyed IP/network fingerprint that is not
  reversible without the protected key and cannot be correlated indefinitely;
- the client environment is reduced to a normalized browser/application, operating
  system and broad device family rather than the complete user-agent value;
- OTPs, complete phone numbers, provider secrets, Recovery Kit material, device private
  keys, passwords, tokens and unrestricted request payloads are forbidden;
- access is restricted to explicit security/incident roles and every access is audited;
- the retention period is explicit and automatically enforced, with an initial product
  target of six months unless a documented incident or legal obligation requires a
  narrowly scoped extension.

OVHcloud SMS is the selected initial production provider. Its API credentials, SMS
account/service name, sender configuration, credit quota and delivery reporting remain
server infrastructure data. The adapter must grant only the minimum OVHcloud API rights
required for the selected SMS account and must normalize OVHcloud job and delivery
states into the internal typed result contract.

A self-hosted gateway such as Jasmin is not the initial target because it still requires
carrier/SMS-C connectivity and adds gateway, broker, storage, routing, monitoring and
operational ownership. The internal contract remains provider-neutral so that provider
ownership does not leak into product code, but no speculative multi-provider routing or
automatic fallback may be implemented.

## Current verified gap

- `server/auth_otp.js` deliberately throws in production because no provider is
  configured.
- The current OTP store and authentication rate-limit store are process-local `Map`
  instances and therefore cannot enforce a shared multi-instance production contract.
- OTP generation currently uses `Math.random()` rather than a cryptographically secure
  random source.
- `todo/communication_social/user_auth.md` still presents historical direct provider
  snippets and REST-oriented paths that are not the canonical product transport.
- No OVHcloud adapter, `ovh` dependency, credential configuration or maintained
  provider-specific test was found in the audited repository. OVHcloud appeared only as
  an option in historical todo text; the reusable partial implementation is the
  provider-agnostic `sendSMS()` call surface, not an existing OVHcloud transport.

## Dependencies

- `todo/cleanup_architecture/websocket_only_atome_transport.md`
- `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md`
- An OVHcloud SMS account with credits, approved sender configuration, narrowly scoped
  API credentials and required regulatory configuration
- Existing PostgreSQL infrastructure with transactional row locking

## Executable scope

1. Define the minimal typed internal SMS send/result contract owned by the
   authentication infrastructure.
2. Implement and configure OVHcloud SMS as the single provider without provider fallback
   or multi-provider routing.
3. Keep the OVHcloud SDK/API handling, credentials, account/service name, callbacks and
   delivery receipts behind the server boundary.
4. Route phone-verification and recovery initiation only through authenticated or
   explicitly pre-authenticated typed `/ws/api` actions with purpose binding,
   authorization and anti-enumeration controls.
5. Replace `Math.random()` OTP generation with a cryptographically secure source.
6. Replace process-local OTP, attempt and recovery state with one minimal PostgreSQL
   challenge table. Do not add Valkey/Redis or store challenges as Atomes.
7. Store only a protected OTP verifier and the minimum transaction metadata. Bind each
   challenge to its principal or protected pre-auth identity, normalized-phone digest,
   purpose, request digest, expiry and attempt counter; consume or invalidate it
   atomically once.
8. Implement delivery-status normalization, typed provider failures, rate limits,
   quotas and cost-abuse protection without logging OTPs or full phone numbers. Use
   progressive multidimensional throttling, not a fixed global account lock.
9. Remove obsolete direct-provider and REST examples from maintained authentication
   documentation.
10. Implement the minimized security-journal schema, rotating keyed network
    fingerprint, normalized client-family fields, access controls and automatic
    six-month retention without writing security telemetry into Atome history.

## Exit criteria

- Browser, Tauri and supported iOS clients use only `/ws/api` for OTP and recovery
  requests and never possess provider credentials.
- The production server sends through exactly one configured OVHcloud SMS account.
- No automatic provider fallback, SMS simulation or OTP exposure can run in production.
- Provider failure is explicit, typed and does not create a valid orphaned recovery
  state.
- OTP generation is cryptographically secure and verification is shared,
  purpose-bound, attempt-limited, expiring and atomically single-use across instances.
- The plaintext OTP is never persisted. Expired and consumed challenge rows are removed,
  while successful device authorization persists only the device public verification
  contract and required audit metadata.
- No OTP challenge or authorized-device secret enters Atome history, `state_current`,
  synchronization or snapshots.
- Logs, events, state, sync payloads and diagnostics contain neither OTP plaintext nor
  complete phone numbers or provider secrets.
- Repeated failures trigger progressive purpose-scoped throttling without allowing a
  third party to globally lock the account by submitting failures against its phone.
- Durable security records contain no raw IP address or complete user-agent string and
  expire automatically after the approved retention period unless a documented
  incident/legal hold applies.

## Required validation

- Unit tests for the provider-neutral contract, secure OTP generation, purpose binding,
  expiry, attempt limits and atomic consumption.
- Integration tests against a restricted OVHcloud SMS test account/configuration and
  normalized job, delivery and failure callbacks without sending to arbitrary numbers.
- Multi-instance PostgreSQL concurrency, atomic consumption and shared rate-limit tests.
- Tests proving that successful verification removes the temporary challenge and writes
  only the expected durable authorized-device record.
- Abuse tests across principal, protected phone, challenge, device, network and global
  sending-cost dimensions, including proof that an attacker cannot globally lock a
  victim account by knowing its phone number.
- Log-schema, redaction, keyed-fingerprint rotation, access-control and retention tests,
  including repository/runtime scans for raw IP, full user-agent and secret leakage.
- Production-mode tests proving missing provider configuration fails closed and every
  development bypass is disabled.
- Repository scans for direct client/provider calls, provider secrets, OTP leakage,
  obsolete REST auth examples and non-cryptographic OTP generation.
- `npm run check:execution-order` and the narrowest WebSocket, authentication, recovery,
  security and supported-platform suites.
