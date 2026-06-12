# Suivi des tâches P1/P2/P3

> Fichier maintenu par Claude à chaque avancement.
> Dernière mise à jour : 2026-06-11 ~16h40

## Restant

- **Bloc P1+P2 : ✅ 0 % restant — TERMINÉ** (8 items sur 8)
- **Global avec P3 : ~61 % restant** — P3.2 ✅ ; P3.1 : plan ✅ + tranche A ✅ (panneaux settle, −247 l., module 304 l.) ; restent B footer (~1,5 j), C bridge mtrack (~1 j), D+suite (~1 j) — voir `.audit/PLAN_DECOUPAGE_EVEINTUITION.md`

## P1

| # | Tâche | Statut | Estim. | Preuve / note |
|---|---|---|---|---|
| P1.1 | Géométrie panneau Molecule (5 checks rouges) | ✅ FAIT | 4 h | contrat 32/32 vert, `temp/probe_reports/molecule_panel_contract_probe.json` ; cause : dock sans hôte DOM route canvas |
| P1.2 | Stores `eVe/core/*_store` (~1 500 l., 0 usage) | ✅ FAIT (supprimés) | 0,5 h | contraires à atome_concepts.md §7.5/§21.1 (persistance = serveur local Axum/AiS via commit, pas de couche store côté WebView = dual path interdit) ; 1 221 l. retirées, 0 référence résiduelle, maps purgées, syntax 693 ✓, m0 ✓, m1 ✓ |

## P2

| # | Tâche | Statut | Estim. | Preuve / note |
|---|---|---|---|---|
| P2.1 | Convention de tests (scripts node vs vitest) | ✅ FAIT | 1,5 h | manifest + garde bidirectionnelle ; signal 309 fichiers rouges → 13 réels préexistants |
| P2.2 | `adole_commit_boundary` rouge préexistant | ✅ FAIT | 2 h | vraie frontière cassée : sanitizer local divergent réintroduit dans `adole.js` — supprimé, import canonique rétabli, `mediaType` ajouté au RESERVED du contrat partagé ; test rouge→vert, contrat partagé ✓, commits réels app ✓ |
| P2.3 | 307 `console.*` en production | ✅ FAIT (déjà soldé) | 2,5 h | périmètre eVe : 4 restantes, toutes légitimes (2 erreurs critiques boot, 1 debug opt-in derrière flag, 1 méta-erreur du bridge de log) ; hors périmètre : atome/src 718 + server 347 = chantier séparé à décider |
| P2.4 | Whitelist runner molecule dans `.gitignore` | ✅ FAIT | 0,2 h | check-ignore négatif ×3, `test:molecule` 9/9, clone neuf OK |
| P2.5 | `intuition_builder` (7 700 l. pour 2 exemples) | ✅ FAIT (supprimé sur ta décision) | 1 h | 13 127 l. retirées (builder 7 761 + 2 exemples orphelins 5 366) ; 0 référence résiduelle, syntax 693 OK, m0 ✓, CODEMAP purgé |

## P3

| # | Tâche | Statut | Estim. | Preuve / note |
|---|---|---|---|---|
| P3.1 | Réduction des géants (eVeIntuition.js) | 🔄 TRANCHE A FAITE (~16 %) | ~4 j | plan vérifié + tranche A : `panel_open_settle_runtime.js` extrait (11 fonctions, factory 8 deps, 17 485→17 238 l.) ; validation complète : contrat molecule 32/32, flower reload + matrix 6/6, vitest baseline exacte, m0/m1/syntax ✓ ; prochaines : B footer (~3 500 l.), C bridge mtrack, D transport |
| P3.2 | Retrait fallback `dataset.groupTimeline` | ✅ FAIT | 0,75 h | migration prouvée finie (0 écrivain dans tout le repo) ; test contractuel inversé rouge→vert, dom_teardown ✓, m1 ✓, contrat molecule 32/32 ✓ |

## Livré hors liste (même période)

- RÉGRESSION SON/CURSEUR (12/06) : deadlock de la file de textures différées (`bevy_web_renderer_runtime.js`) — le `finally` du drain sautait le nettoyage de `deferred_texture_running` si la surface redémarrait pendant une résolution en vol, et la reprise d'état par sélecteur adoptait le flag figé → plus aucune waveform résolue de la session → durée inconnue → pas de curseur, atomes audio sans forme d'onde, lecture sans repère. Fix : nettoyage inconditionnel + réarmement du drain à l'adoption. Validé : file 35→0, durée mémorisée 24,6 s, son réel entendu + RMS 0.10, curseur progresse, contrat molecule 32/32, vitest baseline.

- Bug flower : menu contextuel se fermait au relâchement après reload authentifié (`stopImmediatePropagation` surface) — corrigé + 9 scénarios validés.
- Bug perf : drag texte ~300 ms/frame pendant lecture audio — corrigé (re-rasterisation texte 596 ms → 0), A/B mesuré.
- Bug picking z-order canvas Bevy : hit-test aligné sur l'ordre affiché (contrat 3/3 + probes live) ; volet « média importé dessous » déjà corrigé par l'IA tierce, validé en réel.
- Permissions : allowlist motifs réutilisables (`.claude/settings.json` + local).

## Règle de mise à jour

À chaque tâche démarrée/terminée : mise à jour des statuts, recalcul des deux pourcentages, horodatage. Les pourcentages sont pondérés par effort estimé, pas par nombre de tâches.
