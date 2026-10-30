# Plan commun — Refonte globale / MCP et Santé–Activités–Objectifs (30 oct. 2026)

Statut : **plan validé par toi le 2026-10-30, avec le plan Santé `todo/plan_sante_activites_objectifs_2026-10-30.md`.
Rien ne démarre avant ton signal de départ** (registre R-104).
Cette tâche combine deux sessions : « Cahier MCP » (celle-ci) et « Plan de gestion des activités ». Le volet Santé
est écrit dans son propre fichier, cité en section 4.

## 1. Sources

| Cahier | Fichier | Rôle |
| --- | --- | --- |
| Refonte globale V1.2 | `todo/refonte_globale_architecture_mcp_offline_v1_2_2026-10-30.md` | Architecture : cartographie, ontologie, MCP universel en accès, offline/sans IA, une seule bascule |
| Santé–Activités–Objectifs (1/2) | `~/Downloads/01_CAHIER_COMPLET_SANTE_ACTIVITES_OBJECTIFS_atome_eVe.md` (13 288 lignes) | Métier : 89 briques documentaires, 45 briques `BR-*`, 13 objectifs, 80 tâches P001–P080, sécurité, veille, nutrition |
| Protocoles personnels (2/2) | `~/Downloads/02_PROTOCOLes_PERSONNELS_TEST_atome_eVe.md` | Recette : import de tes deux protocoles sur ton compte |
| Taxonomie | `~/Desktop/taxonomie.md` | Proposition de taxonomie citée par la refonte |
| Cahier Activités (en cours) | `todo/cahier_des_charges_activites_atome_eVe.md` (R-005, 98/138 cochés) | Déjà exécuté par la session du registre ; à rapprocher, pas à refaire |

Le cahier MCP du 28 oct. et le plan `todo/mcp_universal_access_plan_2026-10-28.md` sont périmés.

## 2. Challenge : séparément ou ensemble ?

**Verdict : ensemble, en une seule tâche.** Les deux cahiers le disent eux-mêmes : la refonte (§11) fait du cahier
Santé son « document métier directeur », et le cahier Santé renvoie à la refonte pour « les liens d'exécution et de
taxonomie ». Les recouvrements sont concrets :

| Recouvrement | Refonte | Santé | Si on les sépare |
| --- | --- | --- | --- |
| Inventaire de l'existant | P0, §6.3 (9 inventaires) | P001 « inventorier les références et composants réels » | Même audit fait deux fois, avec deux résultats divergents |
| Identités et alias | §1.2.2, §6.1.5 ; cite déjà `BR-01..45` et les 89 | Critère n° 1 : 89 ↔ 45 ↔ IDs runtime, fusion par alias | Deux tables d'alias concurrentes |
| Ontologie | `activity_definition`, `health_brick`, `objective_scenario`, `taxonomy_node`, `ui_placement` | Modèle d'objectif, briques, scénarios, P002 « contrats et migrations » | Santé d'abord = catalogues propres à migrer ensuite (deux propriétaires, interdit). Refonte d'abord = ontologie sans les besoins réels de la Santé |
| Navigation | Cartes sémantique et de navigation projetées du registre (§3.3, §7) | P003 « matrice commune et navigation profonde », §50 interface matricielle unique | Deux constructeurs de menus |
| MCP, IA, offline | Accès universel, transport libre, offline bloquant | Même décision, écrite à l'identique | Aucun conflit, mais une seule couche à bâtir |
| Calendrier, alarmes, exécution | Propriétaires à cartographier | P013–P015 moteur commun | Le moteur Santé doit appeler les vrais outils du registre |

**Ce qui reste indépendant à l'intérieur de la tâche commune** (préparable en parallèle par des agents, sans rien
coder hors du plan) : le contenu des 89 fiches et des 13 scénarios, les règles de sécurité médicale, les sources de
veille, le jeu de test de tes protocoles.

## 3. Points à trancher avant le départ

Recommandation en gras ; je te les poserai une à une, avec le décompte, quand tu valideras ce plan.

1. **Une seule bascule ou une validation écran par écran ?** La refonte impose une seule bascule. Le cahier Santé
   garde la validation visuelle de P001–P080 et une « intégration progressive » (§55). **Toutes les maquettes et
   toutes les questions sont faites et validées en phase C, avant la moindre ligne de code. Ensuite, tout est codé
   en une passe, puis une seule bascule.** C'est aussi ton ordre habituel : maquettes, puis questions, puis tout coder.
2. **Branche Git (§1.2 bis de la refonte)** : branche dédiée ou `main` ? Le cahier veut que la question soit posée
   avant le code ; je la pose avec les autres en phase C. **Recommandation : branche dédiée**, car une seule bascule
   sur `main`, parmi d'autres sessions qui écrivent, n'a pas de filet de sécurité.
3. **Nom du cahier Santé** : le fichier `CAHIER_DES_CHARGES_SANTE_ATOME_EVE_2026-10-30.md` cité par la refonte est
   introuvable. **On prend `01_CAHIER_COMPLET_SANTE_ACTIVITES_OBJECTIFS_atome_eVe.md`.**
4. **Validation clinique et veille** : le cahier exige une « validation avant activation » des briques, des
   interactions et des protocoles. **Tout est livré à l'état « proposé / non activé »** jusqu'à ta validation.
   Aucune prise, aucun rappel de soin activé par eVe.
5. **Recette sur ton compte** (document 2) : tes données de santé réelles. **Import sur ton compte, Web d'abord,
   données jamais envoyées à l'IA sans ton accord explicite.** iOS : c'est toi qui testes.
6. **Transport MCP externe** : **MCP standard par stdio**, via un petit pont qui passe par le WebSocket `/ws/api`
   et le relais distant existant (aucune route HTTP ajoutée). L'UI locale appelle directement les contrats, comme
   l'impose la refonte.
7. à 13. **Les 7 questions Santé** sont au §6 de `todo/plan_sante_activites_objectifs_2026-10-30.md` :
   - la charte gagne sur la mise en page du cahier ;
   - la place de la Santé (objectifs sous Projets, briques sous Activité, carnet en rubrique propre) ;
   - la mise en relation P022 en outil de la bande, jamais en étape ;
   - les 45 `BR-*` comme cible, les 89 en alias ;
   - le thermalisme en candidats ;
   - Ciqual embarqué, Open Food Facts en ligne avec cache ;
   - le document 2 hors du dépôt.

**Total : 13 questions**, posées une à une avec le décompte en phase C. Les questions 6 (transport MCP) et 13
(document 2) sont déjà appliquées comme règles ; tu peux les confirmer en bloc.

## 4. Déroulé proposé (une seule tâche, de bout en bout)

Le détail du volet Santé est dans `todo/plan_sante_activites_objectifs_2026-10-30.md` (sections « A-Santé » à
« F-Santé », mêmes phases), tenu par la session Santé–Activités ; les deux fichiers ne sont jamais écrits par la même
session. Points communs déjà retenus :

- **Données personnelles.** Le document 2 contient tes données de santé réelles : il n'est JAMAIS copié dans le dépôt
  (qui part sur GitHub). Les fixtures de `tests/` sont fictives. Le document réel ne sert qu'à la recette : il est
  importé par l'outil réel sur ton compte, depuis `~/Downloads`.
- **Acquis à rapprocher en phase A, pas à refaire** : R-005 (cahier Activités, 98/138), `program_brick_catalog.js`
  (45 `BR-*`), compagnon montre W1–W7.
- **Ordre interne de la phase D côté Santé** (avant la bascule unique, selon le `Plan_execution` d'origine) :
  socle (matrice, carré, curseurs, composition) → pilote Sommeil (P034 + P056) → démonstrateur Sport (P040–P044 +
  P057) → import de protocoles, moteur de sécurité S0–S5 et planificateur (recette du document 2) → le reste.
- **Règles de sécurité** amorcées avec SEC-01..10 et le thésaurus des interactions de l'ANSM pour les substances de
  la recette, plus des cas fictifs pour chaque niveau. Tout reste à l'état « proposé » jusqu'à la revue.

**Étape 0 — Départ, à ton signal seulement**
- Commit de tout l'état local (eVe, puis le parent), push de `main` (eVe d'abord), build TestFlight
  (`./scripts/XCode_testflight_generator`). C'est ton autorisation du 28 oct.
- Lire les entrées du registre des domaines touchés (R-005, R-104, entrées Santé, Sport, Calendrier).

**Phase A — Audit unique** (refonte P0 + Santé P001)
- Inventaire statique (registres, `tool_id`, surfaces, contrats, catalogues `BR-*`, `training_catalog`, 89 IDs
  documentaires) et dynamique (Playwright : chaque rubrique jusqu'aux feuilles, Basic et Pro, projet).
- Rapprochement `code ∪ runtime ∪ historique` par identifiant canonique.
- Livrables : les 9 `baseline_*.json`, plus la table 89 ↔ 45 ↔ runtime et l'état réel de P001–P080.
- Mesures de référence avant changement : démarrage, Dashboard, profondeur des menus, recherche, gestes, audio.
- Matrice offline/sans IA et matrice de parité MCP : la passerelle actuelle n'est pas du MCP standard, et son
  entrée synchrone saute les contrôles de droits.

**Phase B — Conception unique** (refonte P1 + Santé P002, P003, annexe F)
- Ontologie complète, Santé comprise : briques, scénarios, protocoles importés, observations, consentement par finalité.
- Registre central et générateurs (`generated/` : carte, arbre UI, graphe, index).
- Propriétaires définitifs, couche MCP standard (cycle `initialize` / `tools/*` / `resources/*`), politiques
  unifiées, client de référence sans IA, plan de données audio/vidéo hors MCP.
- Plan technique complet, implémentable en un seul ensemble.

**Phase C — Maquettes et questions, puis validation**
- Une maquette aux vrais jetons, en PNG, pour chaque écran nouveau ou modifié (règle 16). On ne fait pas de
  maquette pour ce qui suit un motif déjà validé.
- Toutes les questions en une série, une par une, avec le décompte. Aucune ligne de code avant que tout soit validé.

**Phase D — Réalisation intégrale** (sur la branche choisie)
1. Registre, schémas, générateurs ; alias de toutes les identités historiques.
2. Couche MCP standard, pont stdio et client de référence ; contrôles avant effet sur toutes les entrées.
3. Dashboard, menus, recherche et panneaux recâblés sur le registre (aucun nouveau constructeur).
4. Moteur Santé–Activités–Objectifs sur ce même registre : briques, 13 scénarios, composition, programme,
   calendrier, alarmes, exécution, capteurs, résultats, nutrition, import de protocoles, graphe de sécurité, veille.
5. Garanties offline : rien de local ne dépend du réseau, de l'IA ni d'un CDN.

**Phase E — Qualification avant bascule**
- Identités avant = après, aucune référence orpheline, comptes concordants.
- Parité UI / script / MCP / voix.
- Client MCP indépendant sans IA.
- Démarrage hors ligne et sans IA.
- Benchmarks avant/après.
- Recette de tes deux protocoles (document 2).
- Captures comparées aux écrans validés.

**Phase F — Bascule unique, tests, corrections, audit de clôture.** Rapport final et carte consultable.
- Je valide sur Web ; Tauri et iOS sont testés par toi.
- Les cahiers sont cochés au fil de l'eau et le registre est tenu à jour.

## 5. Ampleur et limites (honnêtement)

- C'est de loin la plus grosse tâche du projet : refonte transverse + 80 tâches Santé. Je la mènerai jusqu'au bout
  en une seule exécution, avec des agents pour l'audit et la préparation du contenu. Elle prendra plusieurs jours de
  travail continu, pas une session courte.
- **Blocages par nature, nommés dès la phase C, pas à la fin** (le reste est codé) :
  - revue clinique (P078) ;
  - raccordement officiel du carnet (P030 : Mon Espace Santé / DMP, conventions externes) ;
  - réveil intelligent sur la montre (appareil réel) ;
  - veille scientifique dans eVe (réseau + IA) ;
  - réseau social P022–P025 (d'autres comptes sont nécessaires pour le recetter) ;
  - tests sur appareil (toi).

  Ce qui en dépend reste à l'état « proposé / non activé ».
- Les sessions qui écrivent en parallèle sur `main` pendant la tâche sont le principal risque pour une seule
  bascule (d'où la recommandation de branche dédiée).

## 6. Après validation de ce plan

- Les deux sessions (« Cahier MCP » et « Plan de gestion des activités ») sont fusionnées en une seule nouvelle
  tâche dont ce fichier est le brief. Les deux anciennes peuvent ensuite être archivées ou supprimées sur ton accord.
- La nouvelle tâche ne démarre qu'à ton signal.
