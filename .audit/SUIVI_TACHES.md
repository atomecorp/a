# Suivi des tâches P1/P2/P3

> Fichier maintenu par Claude à chaque avancement.
> Dernière mise à jour : 2026-06-11 ~13h00

## Restant

- **Bloc P1+P2 (court terme) : ~47 % restant** (6,2 h faites / 11,7 h estimées)
- **Global avec P3 : ~86 % restant** (P3 = découpage des géants, dominant en volume : ~4 jours)

## P1

| # | Tâche | Statut | Estim. | Preuve / note |
|---|---|---|---|---|
| P1.1 | Géométrie panneau Molecule (5 checks rouges) | ✅ FAIT | 4 h | contrat 32/32 vert, `temp/probe_reports/molecule_panel_contract_probe.json` ; cause : dock sans hôte DOM route canvas |
| P1.2 | Stores `eVe/core/*_store` (~1 500 l., 0 usage) | ⏸ DÉCISION PRODUIT (toi) | 0,5 h d'exécution | suppression ou câblage — dis-moi ; aucun impact runtime en attendant |

## P2

| # | Tâche | Statut | Estim. | Preuve / note |
|---|---|---|---|---|
| P2.1 | Convention de tests (scripts node vs vitest) | ✅ FAIT | 1,5 h | manifest + garde bidirectionnelle ; signal 309 fichiers rouges → 13 réels préexistants |
| P2.2 | `adole_commit_boundary` rouge préexistant | 🔄 EN COURS (~25 %) | 2 h | échec lu : `adole.js` n'importe plus `shared/atome_contract.js` — diagnostic en cours |
| P2.3 | 307 `console.*` en production | ⬜ À FAIRE | 2,5 h | classification puis nettoyage sans perdre le signal d'erreur |
| P2.4 | Whitelist runner molecule dans `.gitignore` | ✅ FAIT | 0,2 h | check-ignore négatif ×3, `test:molecule` 9/9, clone neuf OK |
| P2.5 | `intuition_builder` (7 700 l. pour 2 exemples) | ⏸ DÉCISION PRODUIT (toi) | 1 h d'exécution | non importé au boot (vérifié) — suppression ou conservation, dis-moi |

## P3

| # | Tâche | Statut | Estim. | Preuve / note |
|---|---|---|---|---|
| P3.1 | Réduction des géants (eVeIntuition.js 17 389 l. en tête) | ⬜ À FAIRE | ~4 j | recommandé : par tranches opportunistes, pas en big-bang |
| P3.2 | Retrait fallback `dataset.groupTimeline` | ⬜ BLOQUÉ (fin de ta migration) | 0,75 h | à déclencher quand tu confirmes la migration terminée |

## Livré hors liste (même période)

- Bug flower : menu contextuel se fermait au relâchement après reload authentifié (`stopImmediatePropagation` surface) — corrigé + 9 scénarios validés.
- Bug perf : drag texte ~300 ms/frame pendant lecture audio — corrigé (re-rasterisation texte 596 ms → 0), A/B mesuré.
- Bug picking z-order canvas Bevy : hit-test aligné sur l'ordre affiché (contrat 3/3 + probes live) ; volet « média importé dessous » déjà corrigé par l'IA tierce, validé en réel.
- Permissions : allowlist motifs réutilisables (`.claude/settings.json` + local).

## Règle de mise à jour

À chaque tâche démarrée/terminée : mise à jour des statuts, recalcul des deux pourcentages, horodatage. Les pourcentages sont pondérés par effort estimé, pas par nombre de tâches.
