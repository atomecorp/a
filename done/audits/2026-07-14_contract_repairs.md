# Contract Repairs — 2026-07-14

## Completed

- The strict core Atome registry now represents generic records as the existing universal `data_model` kind. The registry remains strict and idempotent; `node --test tests/shared/core_atome_types.test.mjs` passes 5/5.
- The mutation-ownership scanner now has an explicit, narrow canonical commit-leaf allowance and testable scan API. `npm run check:mutation-ownership-guardrails` and `node --test tests/scripts/check_mutation_ownership_guardrails.test.mjs` pass; the test confirms a non-owner domain transport remains rejected.

## Related maintenance record

The active critical file-size register is `todo/cleanup_architecture/file_size_inventory_2026-07-14.md`. It is intentionally not moved: its 23 reduction plans remain open.
