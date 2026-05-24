# Atome Sanitization Task

## Goal

Verify that every framework file touching Atome creation, mutation, persistence, synchronization, replay, and rendering respects the normative contract defined in [atome/documentations/atome_structur_to_respect.md](../atome/documentations/atome_structur_to_respect.md).

No new feature work should be added to a touched Atome or rendering file before that file has been checked against the contract.

## Mandatory Audit Scope

Review every file that does at least one of the following:

- creates Atomes;
- formats or normalizes Atome payloads;
- validates or migrates Atome data;
- writes durable Atome state;
- rebuilds Atome state from history or projections;
- renders Atomes to DOM, canvas, WebGPU, or native views;
- handles gesture, resize, drag, placement, or selection state for Atomes.

## Required Sanitization Checks

For each file, verify all of the following:

1. The file consumes the canonical Atome description format: `id`, `type`, optional `kind`, optional `renderer`, `meta`, `traits`, `properties`.
2. The file does not introduce alternate source-of-truth aliases as a permanent contract.
3. The file does not treat DOM state, canvas state, or native view state as canonical Atome state.
4. The file writes durable changes only through the canonical commit and event pipeline.
5. The file keeps `state_current` as a projection cache, not as the source of truth.
6. The file keeps renderer selection detached from logical Atome identity.
7. The file does not mix visual-only caches with canonical Atome description data.
8. The file preserves deterministic replay and Atome history.

## Seed Findings

- Fixed: [eVe/intuition/tools/communication.js](../eVe/intuition/tools/communication.js)
  - Drag initialization now starts from the described Atome position cache in the module instead of using DOM style position as the canonical baseline.
  - Incoming position updates now synchronize the local Atome description cache before DOM projection.

- Remaining review target: [eVe/core/atome_events/placement_runtime.js](../eVe/core/atome_events/placement_runtime.js)
  - Snap candidate resolution still reads target geometry from DOM style or DOM offsets.

- Remaining review target: [server/atomeRoutes.orm.js](../server/atomeRoutes.orm.js)
  - Formatting and sync resolution still admit multiple Atome envelope aliases.

- Remaining review target: [atome/src/squirrel/apis/unified/adole_api/atomes.js](../atome/src/squirrel/apis/unified/adole_api/atomes.js)
  - Client create paths still accept multiple payload shapes instead of one strict canonical envelope.

- Remaining review target: [database/adole.js](../database/adole.js)
  - Durable property writes still behave as an open particle bag and need stronger canonical schema enforcement.

## Execution Rule

Every time a framework file touching Atomes or rendering is modified:

1. Check it against [atome/documentations/atome_structur_to_respect.md](../atome/documentations/atome_structur_to_respect.md).
2. Sanitize the file if the Atome contract is violated.
3. Validate the touched file immediately.
4. Do not extend feature scope before the contract violation is resolved at the owning layer.
