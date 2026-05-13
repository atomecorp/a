# eVe / Atome — Master Cleanup & Architectural Governance Plan

Version: 2.0  
Status: Working Document  
Format: Markdown  
Scope: Full framework cleanup, AI-generated debt removal, architecture stabilization, codebase reduction, security verification, naming governance, performance optimization, debugging cleanup, and recurring maintenance.

---

# 0. Purpose

This document defines the complete cleanup and stabilization chantier for the Atome/eVe framework.

The goal is to transform the framework into a cleaner, smaller, safer, more deterministic, more maintainable, and more architecturally coherent system.

This document addresses:

- AI-generated technical debt;
- hidden heuristics;
- uncontrolled patching;
- code bloat;
- long files;
- dead code;
- duplicated code;
- deprecated systems;
- unstable runtime flows;
- architecture drift;
- security risks;
- unclear file naming;
- inconsistent folder organization;
- performance degradation;
- bootstrap inflation;
- debug pollution;
- hidden side effects;
- weak observability;
- recurring cleanup discipline.

---

# 1. Global Rules

## 1.1 Absolute cleanup principles

### [ ] No hidden fallback

### [ ] No silent catch

### [ ] No temporary patch

### [ ] No duplicate runtime

### [ ] No uncontrolled dependency

### [ ] No direct filesystem access outside approved APIs

### [ ] No direct network access outside approved transport layer

### [ ] No architecture mutation without explicit validation

### [ ] No oversized file without justified split plan

### [ ] No deprecated code kept without migration deadline

### [ ] No dead code kept for comfort

### [ ] No AI-generated code merged without review

### [ ] No implicit behavior hidden inside utility functions

### [ ] No duplicate naming for different concepts

### [ ] No mixed responsibility inside one module

### [ ] No security-sensitive bridge without validation

---

# 2. Initial Inventory

## 2.1 Codebase inventory

### [ ] Generate full file tree

### [ ] Count total files

### [ ] Count total lines of code

### [ ] Count total JavaScript files

### [ ] Count total TypeScript files

### [ ] Count total Rust files

### [ ] Count total Ruby files

### [ ] Count total CSS files

### [ ] Count total assets

### [ ] Count total generated files

### [ ] Identify oversized files

### [ ] Identify empty files

### [ ] Identify orphan files

### [ ] Identify duplicate filenames

### [ ] Identify inconsistent casing

### [ ] Identify unused assets

### [ ] Identify files created only to patch another file

### [ ] Identify files with unclear ownership

---

## 2.2 Runtime inventory

### [ ] List all runtime layers

### [ ] List all bootstrap files

### [ ] List all bridges

### [ ] List all facades

### [ ] List all gateways

### [ ] List all registries

### [ ] List all loaders

### [ ] List all dispatchers

### [ ] List all event buses

### [ ] List all state stores

### [ ] List all transport mechanisms

### [ ] List all native invoke commands

### [ ] List all MCP tools

### [ ] List all WebGPU entry points

### [ ] List all audio entry points

### [ ] List all media loaders

### [ ] List all filesystem access points

### [ ] List all network access points

### [ ] List all permission request points

### [ ] List all persistence access points

### [ ] List all synchronization flows

---

# 3. AI-Generated Debt Detection

## 3.1 AI debt indicators

### [ ] Detect over-defensive code

### [ ] Detect unexplained fallbacks

### [ ] Detect excessive try/catch

### [ ] Detect duplicated helper functions

### [ ] Detect vague utility names

### [ ] Detect generic wrappers without ownership

### [ ] Detect repeated compatibility layers

### [ ] Detect feature-specific hacks hidden in generic modules

### [ ] Detect inconsistent naming caused by iterative AI edits

### [ ] Detect large files grown by repeated AI additions

### [ ] Detect dead branches created during failed AI attempts

### [ ] Detect multiple solutions to the same problem

---

## 3.2 AI cleanup policy

### [ ] Every AI-generated module must have clear ownership

### [ ] Every AI-generated fallback must be either justified or removed

### [ ] Every AI-generated wrapper must be proven necessary

### [ ] Every AI-generated retry must have bounded policy

### [ ] Every AI-generated abstraction must have one defined responsibility

### [ ] Every AI-generated security-sensitive change must be reviewed

### [ ] Every AI-generated API must be documented and typed

### [ ] Every AI-generated side effect must be traceable

---

# 4. Code Size Reduction

## 4.1 Codebase reduction targets

### [ ] Reduce duplicated utilities

### [ ] Remove unused modules

### [ ] Remove obsolete wrappers

### [ ] Remove compatibility shims

### [ ] Remove unused constants

### [ ] Remove unused CSS

### [ ] Remove unused icons

### [ ] Remove unused test helpers

### [ ] Remove unused debug helpers

### [ ] Remove abandoned experiments

### [ ] Remove old migration layers

### [ ] Remove temporary AI-generated abstractions

### [ ] Reduce bootstrap payload

### [ ] Reduce initial module load count

### [ ] Reduce unnecessary runtime layers

### [ ] Reduce bundle size

### [ ] Reduce memory footprint

---

## 4.2 File size policy

Recommended limits:

- Ideal file: under 300 lines
- Warning threshold: 500 lines
- Critical threshold: 800 lines
- Forbidden without justification: 1000+ lines

Checklist:

### [ ] Identify files over 300 lines

### [ ] Identify files over 500 lines

### [ ] Identify files over 800 lines

### [ ] Identify files over 1000 lines

### [ ] Split files with multiple responsibilities

### [ ] Extract pure helpers only when reused

### [ ] Avoid creating useless micro-files

### [ ] Keep domain ownership explicit

### [ ] Add split plan for every critical file

### [ ] Verify that splitting does not create more architectural noise

---

## 4.3 Function size policy

Recommended limits:

- Ideal function: under 40 lines
- Warning threshold: 80 lines
- Critical threshold: 150 lines

Checklist:

### [ ] Identify long functions

### [ ] Identify deeply nested functions

### [ ] Identify functions with multiple responsibilities

### [ ] Identify functions mixing UI, state, network, and persistence

### [ ] Split functions by responsibility

### [ ] Replace unclear branching with explicit typed flows

### [ ] Remove defensive branches that hide real errors

### [ ] Replace magic behavior with explicit contracts

---

# 5. Dead Code Cleanup

## 5.1 Dead code detection

### [ ] Detect unused exports

### [ ] Detect unused imports

### [ ] Detect unreachable branches

### [ ] Detect unused classes

### [ ] Detect unused functions

### [ ] Detect unused constants

### [ ] Detect unused CSS selectors

### [ ] Detect unused image assets

### [ ] Detect unused audio assets

### [ ] Detect unused video assets

### [ ] Detect unused config files

### [ ] Detect unused build scripts

### [ ] Detect unused test fixtures

### [ ] Detect unused runtime flags

### [ ] Detect unused feature flags

### [ ] Detect unused event names

---

## 5.2 Dead code removal rules

### [ ] Delete confirmed unused code

### [ ] Do not comment out dead code

### [ ] Do not move dead code into backup files

### [ ] Preserve history through Git, not source pollution

### [ ] Remove references from docs when code is deleted

### [ ] Remove associated tests if feature is deleted

### [ ] Remove associated assets if feature is deleted

### [ ] Remove associated configuration if feature is deleted

### [ ] Verify build after removal

### [ ] Verify runtime after removal

---

# 6. Deprecated Code Cleanup

## 6.1 Deprecated system inventory

### [ ] List deprecated APIs

### [ ] List deprecated modules

### [ ] List deprecated runtime flows

### [ ] List deprecated bridges

### [ ] List deprecated naming conventions

### [ ] List deprecated file locations

### [ ] List deprecated config keys

### [ ] List deprecated media paths

### [ ] List deprecated event names

### [ ] List deprecated MCP tools

### [ ] List deprecated UI components

### [ ] List deprecated audio commands

### [ ] List deprecated native invoke commands

---

## 6.2 Migration policy

Every deprecated element must have:

### [ ] Replacement target

### [ ] Migration owner

### [ ] Migration deadline

### [ ] Compatibility window

### [ ] Removal date

### [ ] Test coverage

### [ ] Documentation update

### [ ] Runtime warning if still used

### [ ] Final deletion commit

---

# 7. Duplicate Code Cleanup

## 7.1 Duplication categories

### [ ] Duplicate utilities

### [ ] Duplicate runtime helpers

### [ ] Duplicate event buses

### [ ] Duplicate registries

### [ ] Duplicate loaders

### [ ] Duplicate state stores

### [ ] Duplicate UI builders

### [ ] Duplicate bridge logic

### [ ] Duplicate transport logic

### [ ] Duplicate media path handling

### [ ] Duplicate permission handling

### [ ] Duplicate error handling

### [ ] Duplicate logging logic

### [ ] Duplicate validation logic

### [ ] Duplicate MCP tool definitions

---

## 7.2 Deduplication policy

### [ ] Keep the simplest implementation

### [ ] Keep the most deterministic implementation

### [ ] Remove weaker duplicate implementation

### [ ] Avoid creating an over-generic abstraction

### [ ] Keep domain-specific code when generic code would hide behavior

### [ ] Document the retained implementation

### [ ] Remove all obsolete imports

### [ ] Add regression tests before removing duplicates

---

# 8. Refactor Strategy

## 8.1 Refactor priorities

### [ ] Refactor files with mixed responsibilities

### [ ] Refactor modules with hidden side effects

### [ ] Refactor modules with unclear ownership

### [ ] Refactor modules with unstable naming

### [ ] Refactor modules with excessive branching

### [ ] Refactor modules with runtime-specific hacks

### [ ] Refactor modules with circular dependencies

### [ ] Refactor modules with duplicated logic

### [ ] Refactor modules with unsafe bridge access

### [ ] Refactor modules with performance bottlenecks

---

## 8.2 Refactor rules

### [ ] Refactor one subsystem at a time

### [ ] Do not refactor and add features in the same commit

### [ ] Do not change public API silently

### [ ] Keep behavior identical unless explicitly changing contract

### [ ] Add tests before high-risk refactor

### [ ] Add traces before high-risk refactor

### [ ] Document architectural changes

### [ ] Remove obsolete code immediately after migration

### [ ] Do not keep parallel systems indefinitely

---

# 9. Architecture Restructuring

## 9.1 Layering review

### [ ] Identify current layers

### [ ] Identify duplicated layers

### [ ] Identify unnecessary intermediary layers

### [ ] Identify circular layer dependencies

### [ ] Identify domain leakage

### [ ] Identify UI logic inside runtime

### [ ] Identify runtime logic inside UI

### [ ] Identify backend logic inside frontend

### [ ] Identify platform-specific logic inside generic modules

### [ ] Identify generic logic inside platform-specific modules

---

## 9.2 Target architecture principles

### [ ] One responsibility per layer

### [ ] One owner per state

### [ ] One dispatcher per action family

### [ ] One registry per domain

### [ ] One bootstrap flow per runtime mode

### [ ] One official transport abstraction

### [ ] One official media loading policy

### [ ] One official permission policy

### [ ] One official error policy

### [ ] One official logging policy

### [ ] One official tracing policy

---

## 9.3 Runtime modes to audit

### [ ] Web browser mode

### [ ] Tauri desktop mode

### [ ] iOS mode

### [ ] AUv3 mode

### [ ] FreeBSD server mode

### [ ] FreeBSD local client mode

### [ ] Offline mode

### [ ] Online mode

### [ ] Hybrid sync mode

---

# 10. File Naming and Folder Nomenclature

## 10.1 Naming audit

### [ ] Detect inconsistent casing

### [ ] Detect unclear abbreviations

### [ ] Detect duplicate names with different roles

### [ ] Detect same concept with multiple names

### [ ] Detect vague names such as utils, helpers, misc

### [ ] Detect files named by implementation instead of domain

### [ ] Detect files named by patch history instead of purpose

### [ ] Detect AI-generated generic names

### [ ] Detect legacy names that no longer match behavior

---

## 10.2 Naming policy

### [ ] File names must describe responsibility

### [ ] Directory names must describe domain

### [ ] Runtime-specific files must be explicit

### [ ] Platform-specific files must be explicit

### [ ] Deprecated names must be migrated

### [ ] No vague generic folder unless strictly controlled

### [ ] No duplicate concept naming

### [ ] No hidden meaning in abbreviations

### [ ] No misleading historical names

---

## 10.3 Folder structure audit

### [ ] Validate domain boundaries

### [ ] Validate platform boundaries

### [ ] Validate runtime boundaries

### [ ] Validate shared folder purpose

### [ ] Validate utils folder purpose

### [ ] Validate bridge folder purpose

### [ ] Validate core folder purpose

### [ ] Validate application folder purpose

### [ ] Validate audio folder purpose

### [ ] Validate media folder purpose

### [ ] Validate AI folder purpose

### [ ] Validate MCP folder purpose

### [ ] Validate security folder purpose

---

# 11. Debugging Cleanup

## 11.1 Debug pollution detection

### [ ] Detect console.log pollution

### [ ] Detect temporary debug prints

### [ ] Detect emoji logs

### [ ] Detect unstructured logs

### [ ] Detect verbose native logs

### [ ] Detect repeated error logs

### [ ] Detect swallowed errors

### [ ] Detect debug-only branches

### [ ] Detect test-only runtime paths

### [ ] Detect hardcoded debug flags

---

## 11.2 Logging policy

### [ ] Replace console logs with structured logger

### [ ] Add log levels

### [ ] Add domain tags

### [ ] Add runtime tags

### [ ] Add request IDs

### [ ] Add action IDs

### [ ] Add trace IDs

### [ ] Add rate limiting for repeated logs

### [ ] Avoid logging sensitive data

### [ ] Make debug logs removable in production

---

# 12. Security Verification

## 12.1 General security audit

### [ ] Audit filesystem access

### [ ] Audit network access

### [ ] Audit websocket payload validation

### [ ] Audit native bridge commands

### [ ] Audit JavaScript bridge exposure

### [ ] Audit token storage

### [ ] Audit secret leakage

### [ ] Audit local storage usage

### [ ] Audit permissions model

### [ ] Audit sandbox boundaries

### [ ] Audit AUv3 isolation

### [ ] Audit iOS entitlements

### [ ] Audit Tauri permissions

### [ ] Audit FreeBSD jail isolation

### [ ] Audit user data separation

### [ ] Audit path traversal risks

### [ ] Audit command injection risks

### [ ] Audit unsafe eval usage

### [ ] Audit dynamic import risks

### [ ] Audit CORS policy

### [ ] Audit CSP policy

---

## 12.2 Security cleanup rules

### [ ] No unvalidated native invoke command

### [ ] No untyped websocket payload

### [ ] No direct file path trust

### [ ] No user-controlled path without sanitization

### [ ] No token in logs

### [ ] No secrets in source

### [ ] No permissive bridge by default

### [ ] No broad entitlements without justification

### [ ] No insecure fallback server

### [ ] No silent permission escalation

---

# 13. Performance Optimization

## 13.1 Startup performance

### [ ] Measure startup duration

### [ ] Measure bootstrap duration

### [ ] Count initial loaded modules

### [ ] Identify slow modules

### [ ] Identify blocking synchronous work

### [ ] Identify expensive imports

### [ ] Identify unnecessary startup media loads

### [ ] Identify unnecessary AI startup loads

### [ ] Identify unnecessary UI startup loads

### [ ] Lazy-load non-critical modules

### [ ] Split critical path from optional path

### [ ] Reduce startup cascade

---

## 13.2 Runtime performance

### [ ] Measure frame pacing

### [ ] Measure main thread blocking

### [ ] Measure memory growth

### [ ] Measure GPU upload cost

### [ ] Measure audio underruns

### [ ] Measure media decode stalls

### [ ] Measure websocket throughput

### [ ] Measure native bridge latency

### [ ] Measure AI tool latency

### [ ] Measure event storm risks

---

## 13.3 Optimization policy

### [ ] Optimize only measured bottlenecks

### [ ] Remove accidental complexity before micro-optimizing

### [ ] Prefer simpler runtime flow over clever cache

### [ ] Avoid hidden performance fallbacks

### [ ] Avoid uncontrolled retry loops

### [ ] Avoid excessive observers

### [ ] Avoid excessive event listeners

### [ ] Avoid excessive DOM mutation

### [ ] Avoid unnecessary object allocations in realtime paths

---

# 14. WebGPU and Rendering Cleanup

### [ ] Audit all rendering entry points

### [ ] Audit DOM rendering leaks

### [ ] Audit canvas ownership

### [ ] Audit WebGPU resource lifecycle

### [ ] Audit texture allocation

### [ ] Audit buffer allocation

### [ ] Audit frame scheduling

### [ ] Audit render batching

### [ ] Audit text rendering strategy

### [ ] Audit fallback rendering paths

### [ ] Remove hidden DOM mutation

### [ ] Remove duplicate rendering paths

### [ ] Ensure deterministic visual state updates

### [ ] Ensure rendering does not depend on hidden timers

---

# 15. Audio and Realtime Cleanup

### [ ] Audit audio initialization

### [ ] Audit sample rate handling

### [ ] Audit buffer size policy

### [ ] Audit native audio bridge

### [ ] Audit Kira integration

### [ ] Audit AUv3 command support

### [ ] Audit unsupported commands

### [ ] Audit realtime-safe code

### [ ] Audit allocations in audio path

### [ ] Audit locks in audio path

### [ ] Audit logging in audio path

### [ ] Audit MIDI startup

### [ ] Audit MIDI event routing

### [ ] Audit transport sync

### [ ] Audit audio/video sync

### [ ] Remove non-realtime-safe operations

### [ ] Remove hidden audio fallbacks

### [ ] Add explicit unsupported command errors

---

# 16. Media and Streaming Cleanup

### [ ] Audit media path resolver

### [ ] Audit file URL handling

### [ ] Audit atome:// scheme handler

### [ ] Audit range request support

### [ ] Audit 404 behavior

### [ ] Audit media permission flow

### [ ] Audit local file access

### [ ] Audit remote media access

### [ ] Audit streaming strategy

### [ ] Audit video decode pipeline

### [ ] Audit audio decode pipeline

### [ ] Audit media cache policy

### [ ] Remove duplicate media loaders

### [ ] Remove hidden media fallback paths

### [ ] Ensure deterministic error when media is missing

---

# 17. MCP, Tools, and AI Runtime Cleanup

### [ ] Audit all MCP tools

### [ ] Validate MCP schema for each tool

### [ ] Validate tool side effects

### [ ] Validate tool permissions

### [ ] Validate tool idempotency

### [ ] Validate tool undoability

### [ ] Validate tool supported environments

### [ ] Remove duplicate tool definitions

### [ ] Remove undocumented tools

### [ ] Remove hidden AI actions

### [ ] Remove heuristic pre-routing where avoidable

### [ ] Ensure intent maps to typed action

### [ ] Ensure typed action maps to dispatcher

### [ ] Ensure dispatcher maps to deterministic execution

### [ ] Ensure execution maps to trace

### [ ] Ensure trace maps to history

---

# 18. ADOLE and History Cleanup

### [ ] Audit object history model

### [ ] Audit property versioning

### [ ] Audit mutation traceability

### [ ] Audit rollback behavior

### [ ] Audit fork behavior

### [ ] Audit permission granularity

### [ ] Audit synchronization consistency

### [ ] Audit offline mutation queue

### [ ] Audit conflict handling

### [ ] Remove hidden state mutation

### [ ] Ensure every mutation has explicit origin

### [ ] Ensure every mutation has timestamp

### [ ] Ensure every mutation has actor

### [ ] Ensure every mutation has reversible context when possible

---

# 19. Testing and Validation

## 19.1 Automated tests

### [ ] Add unit tests for core utilities

### [ ] Add integration tests for runtime flows

### [ ] Add security tests for bridges

### [ ] Add media tests for path resolution

### [ ] Add audio tests for command validation

### [ ] Add WebGPU tests where possible

### [ ] Add MCP schema validation tests

### [ ] Add ADOLE mutation tests

### [ ] Add offline/online sync tests

### [ ] Add regression tests for removed bugs

---

## 19.2 Manual validation

### [ ] Validate Web mode

### [ ] Validate Tauri mode

### [ ] Validate iOS mode

### [ ] Validate AUv3 mode

### [ ] Validate FreeBSD server mode

### [ ] Validate audio playback

### [ ] Validate audio recording

### [ ] Validate video playback

### [ ] Validate media import

### [ ] Validate MIDI

### [ ] Validate project load

### [ ] Validate project save

### [ ] Validate offline behavior

### [ ] Validate online sync

---

# 20. CI/CD and Automated Governance

### [ ] Add linting

### [ ] Add formatting

### [ ] Add type checking

### [ ] Add dead code detection

### [ ] Add dependency audit

### [ ] Add security audit

### [ ] Add bundle size check

### [ ] Add file size check

### [ ] Add circular dependency check

### [ ] Add forbidden API check

### [ ] Add architecture boundary check

### [ ] Add MCP schema check

### [ ] Add native bridge command check

### [ ] Add test coverage report

### [ ] Add performance budget check

---

# 21. Recurring Cleanup Tasks

## 21.1 Daily end-of-day cleanup

### [ ] Remove temporary debug code

### [ ] Remove console pollution

### [ ] Remove experimental dead paths

### [ ] Validate runtime logs

### [ ] Validate startup timing

### [ ] Validate frame pacing

### [ ] Validate audio stability

### [ ] Validate memory growth

### [ ] Validate no new fallback logic

### [ ] Validate no duplicated utilities added

### [ ] Validate no new oversized file

### [ ] Validate no unreviewed AI-generated architecture change

---

## 21.2 Weekly cleanup

### [ ] Dependency audit

### [ ] Duplicate code scan

### [ ] Circular dependency scan

### [ ] Runtime performance audit

### [ ] WebGPU performance audit

### [ ] Audio latency audit

### [ ] Dead code cleanup

### [ ] Contract validation

### [ ] MCP registration validation

### [ ] Architectural drift analysis

### [ ] Security-sensitive bridge review

### [ ] File naming consistency review

### [ ] Folder structure review

---

## 21.3 Monthly cleanup

### [ ] Full architecture review

### [ ] Runtime simplification review

### [ ] Remove obsolete abstractions

### [ ] Validate synchronization consistency

### [ ] Validate deterministic execution

### [ ] Review AI-generated code quality

### [ ] Review hidden heuristic risks

### [ ] Review dependency strategy

### [ ] Review startup cost evolution

### [ ] Review memory model consistency

### [ ] Review file size limits

### [ ] Review security posture

### [ ] Review platform-specific drift

---

## 21.4 Quarterly cleanup

### [ ] Large-scale simplification pass

### [ ] Remove abandoned systems

### [ ] Rewrite unstable subsystems

### [ ] Re-evaluate architecture assumptions

### [ ] Evaluate AI workflow safety

### [ ] Re-profile entire runtime

### [ ] Re-evaluate cross-platform strategy

### [ ] Re-evaluate rendering architecture

### [ ] Re-evaluate audio engine structure

### [ ] Re-evaluate MCP action model

### [ ] Re-evaluate ADOLE history model

### [ ] Re-evaluate security model

---

# 22. Cleanup Execution Order

Recommended order:

1. Inventory
2. Observability
3. Dead code removal
4. Debug cleanup
5. Duplicate removal
6. Deprecated system migration
7. File size reduction
8. Naming cleanup
9. Architecture boundary cleanup
10. Security audit
11. Performance optimization
12. Runtime simplification
13. MCP/tool validation
14. ADOLE/history validation
15. Recurring governance automation

---

# 23. Definition of Done

A cleanup phase is complete only when:

### [ ] Code is smaller or simpler

### [ ] Runtime behavior is more deterministic

### [ ] No hidden fallback was added

### [ ] No new duplicate abstraction was added

### [ ] No security risk was introduced

### [ ] No oversized file was created

### [ ] Tests pass

### [ ] Build passes

### [ ] Startup still works

### [ ] Logs are clean

### [ ] Architecture is documented

### [ ] Deleted code is not kept as comments

### [ ] Migration notes are written

### [ ] Git history preserves removed code

---

# 24. Final Principle

The objective is not to make Atome/eVe merely functional.

The objective is to keep Atome/eVe coherent, deterministic, secure, small enough, understandable, and evolvable despite heavy AI-assisted development.

AI can accelerate implementation.

AI must not be allowed to silently govern architecture.

# Authoritative Governance Documents

All cleanup operations MUST comply with:

- ./.codex/AGENTS.md
- eVe / Atome architecture rules
- MCP / API / history requirements

# Completed Cleanup Phases

This section records already completed cleanup operations, including previous hard cleanup phases, removed files, deprecated systems, and migration decisions.
