# Granularity Validation Report

Livrable exigé par `todo/2- Granularity_Validation.md` §19 et §20.
Date : 2026-08-15. Conclusions tirées du code, chacune avec sa preuve.

## Verdict

```text
GRANULARITY VALIDATION: PASS
```

Raisons, en cinq points :

1. Une propriété est **adressable seule** — `particles` a une contrainte
   `UNIQUE(atome_id, particle_key)` et sa propre colonne `version`.
2. Toute mutation traverse **un seul pipeline** (`commitAtomeEvent`), et l'autorisation
   y est prise **clé par clé**.
3. Le partage, la lecture, l'historique, le temps réel et la reconnexion **conservent
   tous** l'échelle de la propriété — aucune couche ne retombe sur l'atome entier.
4. La sécurité est appliquée dans la **couche autoritaire**, pas dans l'UI, et les
   propriétés refusées sont retirées par projection avant émission.
5. Les scénarios critiques sont couverts par des tests permanents déjà présents.

Réserve honnête : ce verdict porte sur l'architecture et les tests existants. La
campagne de validation manuelle des 24 scénarios du §7 n'a pas été rejouée ici.

---

## Résumé

L'audit devait répondre à une question : la granularité est-elle **réelle** ou
seulement exposée par l'API en surface (§17.1) ? Elle est réelle. Le stockage lui-même
est par propriété, pas seulement l'API : une modification écrit une ligne `particles`
et une ligne `particles_versions`, pas un blob d'atome réécrit.

Le point qui l'établit le plus nettement est l'undo : `executeAtomeHistoryCommand`
reconstruit un état **par propriété** (`propertyStateByTarget`) et n'incrémente la
version que des clés réellement touchées. Un undo ne peut donc pas écraser une
propriété voisine modifiée entre-temps — c'est le critère §15 le plus difficile à tenir
et il est tenu par construction, pas par précaution.

---

## Architecture observée

| Couche | Propriétaire | Échelle |
| --- | --- | --- |
| Stockage | `particles` (`database/schema.sql:74`) | **propriété** — `UNIQUE(atome_id, particle_key)`, `version` par ligne |
| Historique | `particles_versions` (`schema.sql:97`) | **propriété** — `old_value`/`new_value` par clé |
| Journal | `events` (`schema.sql:144`) | patch de propriétés dans `payload` |
| Projection | `state_current` (`schema.sql:165`) | cache matérialisé, reconstruit |
| Permissions | `permissions` (`schema.sql:183`) | **propriété** — `particle_key` (NULL = atome entier) |
| Commit | `commitAtomeEvent` (`server/atomeRoutes.orm.js:98`) | transactionnel |
| Autorisation écriture | `authorizeAtomeEventWrite` (`server/atomePropertySecurity.js:25`) | **propriété** |
| Projection lecture | `projectAtomePropertiesForRead` (`atomePropertySecurity.js:132`) | **propriété** |
| Temps réel | `server/atomeRealtime.js` | **propriété** |
| Undo/Redo | `server/atomeHistoryCommands.js:47` | **propriété** |

---

## Chemin d'une mutation de propriété

1. Client → `events:commit` sur `/ws/api`.
2. `commitAtomeEvent` ouvre **une transaction** (`atomeRoutes.orm.js:115`).
3. `authorizeAtomeEventWrite` extrait les clés touchées (`eventTouchedPropertyKeys`)
   puis appelle `db.canWrite(atomeId, principalId, key)` **pour chaque clé**
   (`atomePropertySecurity.js:92-94`). Le refus renvoie `deniedKeys` : on sait
   *laquelle* est refusée, pas seulement que l'écriture a échoué.
4. `db.appendEvent` écrit l'événement, met à jour `particles` et empile
   `particles_versions`.
5. Conflit de version : `property_version_conflict` est levé et remonté tel quel
   (`adole_event_mutation.js:19`, `atomeRoutes.orm.js:128`).
6. Diffusion via `broadcastCommittedAtomeEvent`, avec projection par destinataire.

**Rien n'écrit l'atome entier.** Une propriété non mentionnée n'est pas touchée.

## Chemin d'un partage de propriété

`permissions.particle_key` porte la clé ; `NULL` signifie « tout l'atome ». `canRead` /
`canWrite` prennent `particleKey` en troisième argument
(`database/adole_permissions.js:116-122`). Une révocation cible donc une propriété sans
toucher aux autres droits — critère §15 tenu.

Côté sortie, `projectAtomePropertiesForRead` **retire** les clés non autorisées avant
émission. La donnée refusée ne quitte jamais le serveur ; elle n'est pas masquée côté
client.

## Chemin d'un undo

`executeAtomeHistoryCommand` (`atomeHistoryCommands.js:47`) :

- inverse l'ordre des événements pour un undo ;
- maintient `propertyStateByTarget` — un état **par propriété**, pas par atome ;
- n'incrémente `version` que si la valeur change réellement (`:100-107`) ;
- traite suppression et restauration comme des transitions de propriété.

Conséquence : *Test 4/5* et *Test 14* du §7 sont satisfaits par construction — deux
propriétés modifiées indépendamment ne se réécrasent pas lors d'un undo.

## Fonctionnement des conditions

Les conditions ACL sont évaluées **dans la couche autoritaire** :
`checkPermissionFlag` lit `permission.conditions` et délègue à
`evaluatePermissionConditions` du propriétaire canonique
(`database/adole_permissions.js:2-4`, `:81`). Une condition invalide **refuse**, elle
n'ouvre pas. Le §17.5 (ne pas confondre permission et condition) est respecté : la
permission est le drapeau, la condition le restreint.

## Temps réel

`atomeRealtime.js` transporte `props`, `delete_keys` et `property_versions` — l'échelle
de la propriété est préservée jusqu'au client. La projection par destinataire est
appliquée **avant** l'envoi (`:223-226`), et un patch vide n'est pas émis. L'émetteur
est exclu de sa propre diffusion (`wsSendJsonToUserExcept`).

## Persistence

`particles` est la source ; `state_current` est un cache explicitement documenté comme
projection. Une suppression est un `value_type = 'deleted'` filtré à la lecture
(`adole.js:674`), pas une ligne effacée : l'historique de la propriété survit à sa
suppression.

## Concurrence

Deux propriétés différentes : pas de conflit possible, les lignes sont distinctes.
Même propriété : `property_version_conflict`, remonté au client sans réécriture.
*Test 15* satisfait.

## Sécurité

Appliquée serveur, jamais seulement UI : autorisation par clé à l'écriture, projection
par clé à la lecture, et `wsApiIdentity` vérifie que le principal est un utilisateur
réellement provisionné avant tout événement. Les propriétés privées utilisées pour
décider ne sont **pas** renvoyées (`conditionsQueryAuthority`).

## Propriétés custom et structures complexes

Les propriétés personnalisées passent par le même mécanisme : `particle_key` est libre,
`value_type` porte le type (`string`/`number`/`boolean`/`json`/`binary`). Une structure
imbriquée est stockée en `json` sous une clé — la frontière de granularité est donc la
clé de premier niveau, ce qui est une décision explicite et non un défaut (§4.2).

---

## Matrice de conformité

| Zone | Exigence | État | Preuve |
| --- | --- | --- | --- |
| Modèle | propriété adressable seule | conforme | `schema.sql:74` `UNIQUE(atome_id, particle_key)` |
| Mutation | pipeline unique et identifiable | conforme | `atomeRoutes.orm.js:98` |
| Mutation | autorisation par propriété | conforme | `atomePropertySecurity.js:92` |
| Lecture | projection par propriété | conforme | `atomePropertySecurity.js:132` |
| Partage | ciblage d'une propriété | conforme | `schema.sql:186` `particle_key` |
| Révocation | granulaire, sans casser le reste | conforme | `adole_permissions.js:116` |
| Conditions | agissent à cette granularité | conforme | `adole_permissions.js:81` |
| Temps réel | information de propriété préservée | conforme | `atomeRealtime.js:223` |
| Persistence | changements partiels conservés | conforme | `particles` + `particles_versions` |
| Historique | modification de propriété identifiable | conforme | `schema.sql:97` |
| Undo/Redo | restauration sans écrasement | conforme | `atomeHistoryCommands.js:87-107` |
| Concurrence | propriétés différentes sans écrasement | conforme | lignes distinctes |
| Concurrence | même propriété détectée | conforme | `property_version_conflict` |
| Propriétés custom | même mécanisme | conforme | `particle_key` libre |
| Sécurité | couche autoritaire | conforme | serveur, pas UI |
| Tests | scénarios critiques couverts | conforme | 8 fichiers, voir ci-dessous |
| Réseau | patchs fins | conforme | `props` / `delete_keys` |
| Batch | haute fréquence | conforme | `commitAtomeEvents` |
| Transactions multi-propriétés | possibles | conforme | `tx_id` + `withTransaction` |
| Structures imbriquées | frontière définie | conforme (décision) | clé de premier niveau, `value_type: json` |

Aucune zone non conforme. Une zone « décision » : la frontière des structures
imbriquées, assumée et documentée plutôt que corrigée (§17.3 : ne pas sur-concevoir).

---

## Liste des preuves — tests existants

La tâche était **plus avancée que ses notes ne le disaient** : huit fichiers de tests de
granularité existaient déjà, non recensés dans le cahier des charges.

| Test | Ce qu'il prouve |
| --- | --- |
| `tests/server/atome_property_security.probe.mjs` (6 cas) | autorisation et projection par propriété |
| `granularity_lifecycle_contract.probe.mjs` | suppression de propriétés et rejet atomique des versions périmées |
| `granularity_protocol_defects.probe.mjs` | le temps réel exclut l'émetteur et autorise **chaque** propriété |
| `granularity_consumer_projection.probe.mjs` | recherche, export, propriétés custom et collections préservent la portée exacte |
| `granularity_reconnect_projection.probe.mjs` | reconnexion et événements retardés réautorisent la portée courante |
| `granularity_resilience.probe.mjs` | rollback, idempotence, ordre et conflits de révision restent atomiques |
| `granularity_qa_fixtures.test.mjs` | jeux de données de validation |
| `granularity_lan_config.probe.mjs` (3 cas) | configuration multi-postes |

Ces tests couvrent les scénarios §7 n° 1, 2, 3, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19,
20, 21, 22, 23.

## Correctifs minimaux

**Aucun.** L'audit n'a pas trouvé de défaut de granularité justifiant un changement.
C'est le résultat attendu du §17.3 : ne pas sur-concevoir ce qui fonctionne.

Un seul manque a été relevé pendant l'audit, et il concernait la tâche 1 et non la
granularité : l'absence d'un mécanisme de règle de confidentialité s'appliquant à
**tout lecteur**. **Livré depuis** — `database/adole_privacy_rules.js`, table
`property_privacy_rules`, consultée dans `canRead` et restrictive uniquement. Il étend
la granularité sans la modifier : la règle porte sur une `particle_key`, à la même
échelle que le reste.

## Risques restants

1. Les 24 scénarios manuels du §7 n'ont pas été rejoués ; les tests automatisés en
   couvrent 18. Les six restants — 4 et 5 (undo/redo local), 9 (condition temporelle),
   10 (condition de profil/relation), 13 (reload), 24 (condition modifiée
   dynamiquement) — **manquent de tests, pas de code** : les mécanismes ont été
   exercés directement et répondent correctement (temporel avant/pendant/après,
   relation contact/non-contact, recalcul après changement de condition, propriétaire
   d'historique par propriété).
2. La frontière de granularité des structures imbriquées est la clé de premier niveau :
   modifier un champ profond réécrit le JSON de cette clé. Acceptable et documenté,
   mais à revoir si un module manipule de gros objets imbriqués à haute fréquence.
3. `state_current` étant un cache, toute divergence avec `particles` serait invisible à
   la lecture rapide ; la reconstruction reste la référence.

## Conclusion

La granularité basse est réelle à toutes les couches auditées : stockage, mutation,
lecture, partage, permissions, conditions, temps réel, persistence, historique, undo et
concurrence. Le verdict est `PASS`, avec la réserve explicite que la campagne manuelle
du §7 reste à rejouer.
