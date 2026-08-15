# Atome / eVe — Debugging, Optimization, Cleanup, Security & Production Hardening

## Objective

This phase starts **only after the functional MVP is complete**.

The goal is no longer to add basic product functionality.

The goal is to transform the functionally complete MVP into a system that is:

- stable;
- clean;
- performant;
- maintainable;
- secure;
- robust;
- testable;
- ready for production validation.

Do not use this phase to expand product scope.

---

# 1. Entry condition

Before starting this phase, confirm that the functional MVP has already passed its completion criteria:

- essential tools work;
- audio editing works;
- Creation/Generator is integrated;
- save/reload works;
- core workflows are usable;
- no essential MVP control is an unexplained placeholder.

If a missing feature is discovered, classify it separately as a functional blocker rather than hiding it inside optimization work.

---

# 2. Systematic debugging

Perform a deep functional and technical debugging pass.

Cover:

- startup;
- project creation;
- project opening;
- project closing;
- project deletion;
- object creation;
- object modification;
- object deletion;
- undo/redo;
- media import;
- media playback;
- drawing;
- audio editing;
- timeline;
- list/matrix navigation where implemented;
- Generator;
- persistence;
- reopening;
- crashes;
- freezes;
- race conditions;
- invalid states;
- error handling.

For every bug:

1. reproduce;
2. isolate;
3. identify root cause;
4. fix root cause rather than masking symptoms where practical;
5. add regression coverage;
6. verify no related behavior regressed.

---

# 3. Performance optimization

Profile before optimizing.

Investigate:

- CPU usage;
- GPU usage;
- idle rendering;
- frame rate;
- unnecessary redraws;
- event storms;
- memory usage;
- memory leaks;
- media decoding;
- waveform rendering;
- timeline rendering;
- large projects;
- list/matrix rendering;
- object creation overhead;
- startup time;
- project opening time;
- project saving time;
- assistant/panel rendering;
- background tasks.

Prioritize measurable bottlenecks.

Do not perform speculative micro-optimization without evidence.

---

# 4. Idle consumption

A major objective is to avoid unnecessary work when nothing is changing.

Audit:

- render loops;
- timers;
- animation loops;
- polling;
- media clocks;
- event listeners;
- background services;
- state propagation.

Ensure idle behavior is appropriate for the architecture and platform.

Where compatible with the current rendering model, minimize frame generation when the UI is static.

---

# 5. Memory and resource management

Audit:

- object lifetimes;
- media buffers;
- decoded audio/video;
- textures;
- waveform caches;
- temporary files;
- event listeners;
- subscriptions;
- WebSocket lifecycle;
- timers;
- workers;
- DOM/native resources where applicable.

Verify that:

- closed projects release resources;
- deleted objects release resources;
- repeated open/close cycles do not accumulate memory;
- temporary media is cleaned correctly;
- crashes do not leave corrupted persistent state.

---

# 6. Code cleanup

After behavior is stable, clean the codebase.

Tasks may include:

- remove dead code;
- remove obsolete experiments;
- remove duplicate implementations;
- remove unused imports/dependencies;
- remove abandoned compatibility layers;
- resolve TODO/FIXME items that belong to the MVP/hardening scope;
- standardize naming;
- simplify overly complex code;
- reduce unnecessary coupling;
- centralize duplicated logic;
- improve module boundaries;
- document non-obvious architecture decisions.

Do not refactor working code merely for aesthetics.

Every significant cleanup must preserve behavior and pass tests.

---

# 7. Refactoring

Refactor only where it improves:

- correctness;
- maintainability;
- testability;
- performance;
- security;
- architectural consistency.

Focus especially on:

- duplicated state;
- duplicated object logic;
- media ownership;
- timeline state;
- persistence boundaries;
- UI-to-model coupling;
- asynchronous flows;
- error propagation;
- lifecycle management.

Use small, verifiable steps.

---

# 8. Error handling

Audit all significant failure paths.

Avoid:

- silent failures;
- swallowed exceptions;
- corrupted state;
- infinite retries;
- unclear user feedback;
- half-completed destructive operations.

Introduce coherent handling for:

- failed file import;
- invalid media;
- storage failure;
- permission failure;
- network failure;
- service failure;
- generation failure;
- corrupted project data;
- unsupported format;
- interrupted save;
- interrupted load.

---

# 9. Persistence robustness

Stress the save/reload architecture.

Verify:

- atomicity where needed;
- interrupted saves;
- partial writes;
- schema evolution;
- backward compatibility where required;
- recovery behavior;
- invalid/corrupted records;
- missing media;
- duplicate IDs;
- stale references;
- orphaned resources.

Projects should fail safely rather than become silently corrupted.

---

# 10. Security audit

Perform a dedicated security review after core functionality is stable.

Cover at minimum:

- authentication;
- authorization;
- permissions;
- session handling;
- token handling;
- local storage of secrets;
- network transport;
- WebSocket security;
- API access;
- file access;
- media uploads;
- external URLs;
- generated content;
- assistant integration;
- user-controlled text;
- user-controlled files;
- inter-process/native bridges where applicable.

---

# 11. Attack surface review

Inventory all external entry points:

- HTTP;
- WebSocket;
- IPC/native bridge;
- file import;
- URL import;
- drag-and-drop;
- clipboard;
- media decoders;
- authentication;
- OTP;
- external services;
- AI/generator providers;
- plugin/extension interfaces if present.

For each entry point, document:

- trusted/untrusted data;
- validation;
- permissions;
- error handling;
- rate limits where relevant;
- privilege boundaries.

---

# 12. Input validation

Validate all untrusted data at the correct boundary.

Cover:

- file names;
- paths;
- MIME/type;
- project data;
- object properties;
- IDs;
- URLs;
- network payloads;
- generated metadata;
- imported metadata;
- user text;
- numeric ranges;
- time ranges;
- media boundaries.

Do not rely only on UI validation.

---

# 13. Authentication and authorization hardening

Where authentication exists, review:

- login;
- logout;
- session invalidation;
- token expiration;
- token storage;
- refresh flows;
- OTP flows;
- account recovery;
- guest mode;
- role/permission checks;
- resource ownership;
- cross-user access.

Authorization must be enforced at the appropriate data/service boundary, not only hidden in the UI.

---

# 14. Transport security

Review:

- HTTPS;
- secure WebSockets;
- certificate handling;
- token transmission;
- sensitive query parameters;
- external service calls;
- redirect handling;
- mixed-content issues.

Sensitive information must not be sent through insecure channels.

---

# 15. Dependency security

Audit dependencies for:

- known vulnerabilities;
- abandoned packages;
- duplicate packages;
- excessive privileges;
- unnecessary packages;
- unsafe build scripts;
- outdated critical dependencies.

Do not automatically update everything at once.

Prioritize updates according to:

- severity;
- exploitability;
- compatibility;
- impact.

---

# 16. File and media security

Imported/generated files are untrusted input.

Review:

- file type detection;
- extension spoofing;
- malformed media;
- oversized files;
- decompression/resource bombs;
- path traversal;
- temporary files;
- executable content;
- metadata parsing;
- embedded external references.

Apply limits appropriate to Atome/eVe.

---

# 17. Generator / external service security

For Generator and AI/external generation services, audit:

- API key storage;
- secret exposure;
- request validation;
- result validation;
- remote URLs;
- downloaded/generated files;
- provider failures;
- timeouts;
- quotas;
- billing-related failure modes;
- user attribution/ownership metadata.

Generated content must enter the same validation pipeline as imported content.

---

# 18. Logging

Ensure logs are useful without leaking sensitive information.

Avoid logging:

- passwords;
- OTP codes;
- full authentication tokens;
- private keys;
- unnecessary personal data;
- confidential project content unless explicitly required.

Logs should help diagnose:

- crashes;
- failed actions;
- performance regressions;
- network failures;
- persistence failures.

---

# 19. Automated tests

Build or complete regression coverage for critical workflows.

Include:

- unit tests where useful;
- integration tests;
- end-to-end tests;
- persistence tests;
- media tests;
- failure-path tests;
- permission/security tests;
- regression tests for every significant bug fixed.

Prioritize critical user workflows over superficial coverage percentages.

---

# 20. Stress testing

Test beyond normal use.

Examples:

- many Atomes;
- long timelines;
- many media files;
- large audio/video files;
- repeated create/delete;
- repeated project open/close;
- repeated save/reload;
- repeated Generator use;
- slow network;
- interrupted network;
- limited storage;
- service errors.

Measure failures and resource usage.

---

# 21. Fuzz / malformed-input testing

Where appropriate, test parsers and boundaries against:

- malformed JSON/data;
- unexpected property types;
- invalid IDs;
- invalid timing values;
- corrupted project files;
- malformed media metadata;
- unexpected network payloads.

The objective is safe failure, not undefined behavior.

---

# 22. Concurrency and race conditions

Audit asynchronous operations such as:

- saving during edits;
- loading while UI state changes;
- deleting while media is active;
- simultaneous generation;
- network updates;
- real-time collaboration where present;
- timeline/transport state changes.

Prevent stale state from overwriting newer state.

---

# 23. Cross-platform validation

Validate the supported targets relevant to Atome/eVe.

Check differences in:

- file access;
- media playback;
- audio input/output;
- graphics;
- touch;
- pointer;
- keyboard;
- permissions;
- storage;
- lifecycle;
- background behavior;
- memory pressure.

Do not assume behavior on one platform guarantees behavior on another.

---

# 24. Production robustness

Review:

- startup recovery;
- failed initialization;
- missing configuration;
- unavailable service;
- offline mode where applicable;
- disk-full conditions;
- permission denial;
- corrupted cache;
- cache invalidation;
- update/migration failure;
- graceful degradation.

The product should remain understandable and recoverable when dependencies fail.

---

# 25. Performance acceptance report

Produce measured results for important operations.

At minimum document:

- startup;
- project open;
- project save;
- idle CPU/GPU behavior;
- memory after repeated open/close;
- interaction latency in representative projects;
- timeline/audio responsiveness.

Keep before/after measurements for important optimizations.

---

# 26. Security report

Produce a security report containing:

- reviewed surfaces;
- vulnerabilities found;
- severity;
- fix applied;
- remaining risks;
- intentionally accepted risks;
- follow-up recommendations.

Do not claim the application is “secure” merely because no obvious issue was found.

---

# 27. Cleanup report

Provide:

- dead code removed;
- duplicate systems removed;
- dependencies removed;
- modules simplified;
- architecture changes;
- migrations performed;
- remaining technical debt.

---

# 28. Final regression pass

After optimization, cleanup and security changes, rerun all core functional workflows.

Confirm that hardening did not break:

- creation;
- drawing;
- audio editing;
- time stretch;
- loops;
- Generator;
- project persistence;
- navigation;
- media handling.

---

# 29. Final deliverables

At the end of this phase provide:

## A. Bugs fixed
List root causes and regression coverage.

## B. Performance improvements
Provide measurable before/after results where possible.

## C. Cleanup/refactoring
List important structural changes.

## D. Security changes
List vulnerabilities addressed and remaining risks.

## E. Tests
List automated and manual validation performed.

## F. Remaining blockers
Only concrete unresolved issues.

## G. Production-readiness verdict

Return one of:

### `HARDENING COMPLETE — READY FOR FINAL PRODUCTION VALIDATION`

or

### `HARDENING INCOMPLETE`

If incomplete, list the exact blockers.

---

# 30. Final instruction

This phase is about **quality**, not scope expansion.

Proceed in this order:

> reproduce → fix → test → measure → optimize → clean → secure → stress → regress → validate.

Do not mix feature invention into hardening.

The final result should preserve the completed MVP while making it substantially more reliable, maintainable, performant and secure.
