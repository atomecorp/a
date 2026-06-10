# CODE_AUDIT_PROGRESS — squirrel-framework / eVe

Artefact d'audit temporaire. Statuts : TODO | IN_PROGRESS | DONE | BLOCKED | MANUAL_REVIEW

## Périmètre (Phase A2)

### SOURCE_CODE (audité)
- `eVe/` — application/framework eVe (sous-module git, ~231K LOC JS) — sauf sous-dossiers exclus ci-dessous
- `atome/src/squirrel/` — cœur du framework Squirrel (~53K LOC)
- `atome/src/application/` — applications (sauf `examples/`, `temp/`)
- `atome/src/utils/`, `atome/shared/`, `atome/security/`, `atome/engines/`
- `server/` — serveur Fastify (~15K LOC)
- `scripts/` — outillage build/guardrails (~5K LOC)

### TEST_CODE
- `tests/` (~66K LOC), `eVe/tests/`

### CONFIG_CODE_RELATED
- `package.json`, `scripts/rollup.config.*.js`, `check-syntax.mjs`

### EXCLUDED_DOCS
- `**/documentations/**`, `**/README*`, `eVe/concept/`, `eVe/eVe_essentials.md`, `todo/`, `done/`, `maps/`, `*.md`

### EXCLUDED_EXAMPLES
- `eVe/R&D/`, `atome/src/application/examples/`, `atome/src/help/`

### EXCLUDED_GENERATED
- `dist/`, `temp/`, `logs/`, `database_storage/`, `data/`, `Failed/`, `atome/src/wasm/`, `platforms/**/target/**`, fichiers `.o/.rlib/.rmeta` de `platforms/`

### EXCLUDED_VENDOR
- `node_modules/`, `atome/src/js/*.min.js` (gsap, leaflet, three…), `atome/renderers/` (4,2 Go), `atome/src/css/` vendored

### UNKNOWN_MANUAL_REVIEW
- `platforms/` code Swift/Rust (hors périmètre JS de cette passe — trop risqué sans toolchain native complète)
- `database/` (11 fichiers)

## Entrées runtime
- `atome/src/index.html` → `squirrel/early-init.js` → vendored libs → `squirrel/spark.js`
- `atome/src/application/index.js` → charge `eVe/eVe.js`
- `eVe/eVe.js` → chargement séquentiel des modules eVe
- `server/server.js` — Fastify
- Build npm : `rollup -c scripts/rollup.config.npm.js`

## Checklist

## Baseline B1 (2026-06-10)

| Validation | Résultat |
|---|---|
| `npm run check:syntax` | ✅ OK (700 fichiers) |
| `npm run check:m0` (no-fallbacks + tauri-fs-boundary + molecule-guardrails) | ✅ OK |
| `npm run build:npm` (rollup) | ✅ OK — dist/squirrel.js 295 993 o en 346 ms |
| `npm run test:molecule` | ❌ KO préexistant — `eVe/tests/molecule/run_molecule_tests.mjs` absent (runner supprimé, script package.json obsolète) → `check:m1`/`check:m2` KO |
| `npm run test:run` (vitest complet) | ❌ inutilisable préexistant — vitest sans config balaie `platforms/ios/**/build/**` (copies de l'app) → OOM/kill ; 107/169 `*.test.mjs` sont des scripts node directs (pas des suites vitest) → faux échecs « No test suite » / « process.exit called » |
| vitest `tests/shared` | ✅ 1/1 |
| vitest `tests/governance` | ❌ 3 échecs préexistants — chemins `todos/*` déplacés vers `todo/cleanup_architecture/` (commit e822f7e3) ; `eve_master_cleanup_findings.json` + file_tree supprimés volontairement (commit 882bb75b) |
| vitest `tests/server` (suites réelles) | ❌ 2 échecs préexistants : notification_stack, state_current_shared (assertions) |
| node direct `tests/eve` (21 scripts) | 15 ✅ / 6 ❌ dont `media_source.test.mjs` (import mort `eve/application/...`) et `capture_export_geometry` (assertion géométrie) |

## Mesures B2 (BEFORE)

| Métrique | Valeur | Méthode |
|---|---:|---|
| LOC eVe/ | 230 897 | wc -l *.js/*.mjs |
| LOC atome/src/squirrel/ | 52 925 | wc -l |
| LOC server/ | 15 019 | wc -l |
| LOC scripts/ | 5 224 | wc -l |
| LOC tests/ | 65 940 | wc -l |
| dist/squirrel.js | 295 993 o | ls -la |
| Temps build npm | 346 ms | rollup |
| Fichiers syntax-checked | 700 | check-syntax.mjs |

## Checklist

| ID | Statut | Tâche | Fichiers | Preuve / validation | Résultat | Risque |
|---|---|---|---|---|---|---|
| A1 | DONE | Identifier structure projet | racine, eVe/, atome/ | inspection | OK | Faible |
| A2 | DONE | Périmètre réel du code | ce fichier | classification ci-dessus | OK | Faible |
| A3 | IN_PROGRESS | Carte imports/exports | eVe/, squirrel/ | — | — | Faible |
| B1 | DONE | Baseline validations | tests/, check:* | voir tableau Baseline | OK (échecs préexistants documentés) | Faible |
| B2 | DONE | Mesures initiales | — | wc/ls | OK | Faible |
| C1 | TODO | Code mort (fichiers/exports jamais importés) | eVe/, squirrel/ | graphe imports | — | Moyen |
| E1 | TODO | Fix test:molecule script obsolète | package.json | npm run test:molecule | — | Faible |
| E2 | TODO | Fix vitest balaye platforms/build (OOM) | vitest.config.js | npm run test:run | — | Faible |
| E3 | TODO | Fix governance test chemins todos/ | tests/governance/ | vitest tests/governance | — | Faible |
| E4 | TODO | Investiguer échecs réels server + eve | tests/server, tests/eve | vitest/node ciblés | — | Moyen |
