# Atome Documentation Index

This directory contains active Atome framework contracts and platform/API references. The active Codex rules and architecture maps remain the controlling authority when they are stricter.

Primary framework contracts:

- atome_structur_to_respect.md: canonical Atome ownership and rendering separation.
- bevy_integration.md: shared Bevy/WebGPU rendering integration.
- security_architecture.md and sync_protocol.md: security and synchronization contracts.
- CRUD_apis.md, AI.md, and tools_api_and_coding.md: mutation, AI, and tool interfaces.
- AUv3_API_Reference.md, media_capture_apis.md, and the AUv3 platform guides: active platform references.

Build and release paths:

- desktop_tauri_distribution.md: macOS/Tauri production bundle, and the gap list for a signed, notarized Apple distribution.
- auv3_deployment.md: local-device AUv3 deploy for development only.
- pwa_packaging_guide_en.md: PWA packaging.
- The iOS/AUv3 TestFlight release is documented with its script at [platforms/ios/atome-auv3/README.md](../../platforms/ios/atome-auv3/README.md).

archive/ contains historical audits, incident reports, legacy UI notes, and superseded contracts. It is retained for traceability only and is not an implementation authority.

## Audit and navigation

The architecture maps are maintained at [maps/](../../maps/). The [progressive documentary audit](../../.audit/CODE_AUDIT_PROGRESS.md#documentary-audit--2026-09-08--first-bounded-pass) records section-level evidence, unresolved contradictions and the next reading slice. Inventory inclusion is not validation. UI principles and unresolved design details are organized in the [non-normative charter draft](../../maps/DESIGN_MAP.md#ui-charter-preparation--2026-09-08--non-normative-audit-draft); current UI diagnostics use [the BevyUI procedure](../../atome/documentations/how_debug_UI.md).
