# Avancement — clôture des tâches 1, 2, 3

Journal tenu au fil des intégrations. Mis à jour à chaque étape.

## État au démarrage (vérifié contre le code, pas contre les notes)

| Tâche | État réel |
| --- | --- |
| `3 - teleport.md` | intégrée, 15 probes vertes, audit de complétude sans remontée |
| `1- condition.md` | intégrée **sauf §12.5** (profil / confidentialité) |
| `2- Granularity_Validation.md` | rapport d'audit **absent** — c'est le livrable |

Avertissement retenu : **certaines tâches sont plus avancées que ce que disent les
notes.** Tout ce qui suit est donc conclu depuis le code, et chaque conclusion porte sa
preuve (fichier + ligne).

## Étapes

- [x] **E1 — inventaire des mécanismes de granularité.** Fait. Découverte majeure :
      la tâche 2 était **bien plus avancée que ses notes** — huit fichiers de tests de
      granularité existaient déjà dans `tests/server/`, non recensés dans le cahier des
      charges. Et l'undo est déjà par propriété (`propertyStateByTarget`), ce qui est le
      critère le plus dur du §15.
- [x] **E2 — rapport d'audit.** `todo/audits/granularity_validation_report.md` :
      architecture, trois parcours (mutation / partage / undo), matrice de 20 lignes,
      preuves fichier+ligne, verdict `GRANULARITY VALIDATION: PASS`, risques.
      **Aucun correctif nécessaire** — la granularité est réelle au stockage, pas
      seulement exposée par l'API (§17.1).
- [x] **E3 — mécanisme serveur pour §12.5.** Le blocage documenté était réel :
      `permissions.principal_id` est `NOT NULL` avec clé étrangère, donc aucune ligne ne
      peut dire « pour qui que ce soit ». D'où une table dédiée
      `property_privacy_rules`, consultée par `canRead` **après** que la permission a
      déjà dit oui. Invariant : une règle **restreint uniquement**, elle ne peut jamais
      accorder — sinon une fonction de confidentialité deviendrait un chemin
      d'élévation de privilège. Fichiers : `database/adole_privacy_rules.js`,
      migration, `adole_permissions.js`, actions `share/privacy-rule-*`.
- [x] **E4 — UI Conditions dans le profil.** Section « Règles de confidentialité » dans
      le panneau Home, réutilisant le composant Conditions partagé (aucun second
      éditeur, §9.1). Sélection de la propriété protégée, application, retrait, et un
      point marquant les propriétés déjà protégées. Invités exclus : sans principal
      distant la règle n'aurait rien à quoi s'attacher.
- [x] **E5 — journaux et maps.** Rapport d'audit, ce journal, `API_MAP` et `CODEMAP`.

## Résultat

| Tâche | État final |
| --- | --- |
| `1- condition.md` | **complète** — §12.5 livré, plus rien en attente hors tests |
| `2- Granularity_Validation.md` | **complète** — rapport livré, verdict `PASS` |
| `3 - teleport.md` | **complète** |

16 probes vertes (15 téléportation + 1 confidentialité). Rien commité ni poussé.
