# Plan — Santé, Activités et Objectifs (volet métier de la tâche commune, 30 oct. 2026)

Statut : **plan proposé, à valider. Rien ne démarre avant ton signal** (registre R-104).
Ce fichier est le détail Santé de la section 4 du plan commun
`todo/plan_refonte_mcp_et_sante_activites_2026-10-30.md` (session « Plan de conversion MCP »). Il garde ses phases
A à F. Chaque session écrit seulement dans son propre fichier.

## 1. Sources lues

| Source | Ce qu'elle apporte |
| --- | --- |
| `~/Downloads/01_CAHIER_COMPLET_SANTE_ACTIVITES_OBJECTIFS_atome_eVe.md` (13 288 l.) | 89 briques documentaires (annexes A–B), 13 objectifs (C, §51–52), réseau (§53), carnet (§54), moteur Santé du 30 oct. (annexe F), 45 briques `BR-*` (F bis), Nutrition (G), précisions Activités (H), règles de pilotage, 80 tâches P001–P080 |
| `~/Downloads/02_PROTOCOLes_PERSONNELS_TEST_atome_eVe.md` (1 123 l.) | Recette sur ton compte : 2 protocoles (compléments/sport/sommeil, visage), versions du 5 et du 6 oct. et tableur V8, règles SEC-01 à SEC-10, sortie attendue A à I |
| `todo/refonte_globale_architecture_mcp_offline_v1_2_2026-10-30.md` | Cadre d'architecture : registre central, MCP en accès, offline sans IA, une seule bascule ; son §11 fait du cahier Santé le document métier directeur |

## 2. Ce que le code a déjà (à rapprocher en phase A, pas à refaire)

Inventaire en lecture seule du 30 oct. (aucun fichier touché). Chemins : `#squirrel` = `atome/src/squirrel`,
`#shared` = `atome/src/shared`.

| Domaine | Déjà là | Manque |
| --- | --- | --- |
| Briques et objectifs | `eVe/domains/programs/program_brick_catalog.js` : 45 `BR-*` (4 supported, 20 limited, 12 candidate, 9 review_required) et compositions des 13 objectifs ; ids `OBJ-01..13` dans `#shared/core_atome_types.js` ; `dashboard_creation_catalog.js` | Alias des 89 IDs documentaires (décision D1 du 28 oct.), fiches éditoriales (preuves, sécurité, médias), `binding_status` vers les outils |
| Programme et préparation | `project_program_runtime.js` (seul écrivain du programme), `project_program_model.js` (6 actions `PROGRAM_BRICKS`, budget de temps, aperçu d'engagement), `objective_preparation.js`, `objective_followup_model.js`, `program_collection_runtime.js` (questions progressives en atomes privés), `program_routine_calendar.js` | Paliers d'effort du §51.3, aperçu des conflits entre objectifs, occurrence unique partagée entre objectifs à vérifier |
| Sommeil | `sleep_page*.js`, `sleep_routine_model.js`, cercle `domains/community/sleep_circle.js` | Briques Sommeil « refaites » (P034), orientation TCC-I, politique de notifications de nuit |
| Sport | `eVe/domains/training/` (14 fichiers), `training.*` (~32 actions), `#shared/training_catalog.js`, 29 fichiers `dashboard_training*.js` ; cahier Activités R-005 : 98/138 faits, 38 partiels | Machines personnelles, charges par série (annexe H), autres disciplines du §51.20 |
| Séances de briques | `brick_session.*`, `activity_session_store.js` (séances minutées partagées), outil « en cours » | — |
| Santé (lectures, capteurs) | `#squirrel/health/health_owner.js` (seule autorité de lecture), `health_catalog.js` (~41 moniteurs), déclarations, ressenti, capteurs, `body_data.*`, garde `health_actor_gate.js` fermée par défaut pour l'IA et MCP | Carnet transversal (P026–P029) |
| Résultats et Moniteur | `dashboard_results_*`, panneaux `bevy_panel_results_*`, `health_detail_*`, `results_send` ; R-016 en cours | Import d'un compte-rendu avec original conservé et extraction vérifiée (P018) |
| Nutrition | Ciqual 3 484 aliments, totaux de repas, allergènes UE, Nutri-Score/NOVA, `food.*` ; maquettes M1–M2 validées | Moteur de menus (NUT-MENU), diététiciens, compléments (P033) |
| Calendrier et alarmes | `calendar_api.js`, alarmes natives iOS, lancement d'un outil à l'heure, pile unique `communication_notifications.js` | — (réutilisé tel quel) |
| Montre | App compagnon `platforms/ios/atome-auv3/watch/` (cartes, rouleaux, voix, fréquence cardiaque en séance) | Lecture du sommeil HealthKit, `WKExtendedRuntimeSession` (réveil intelligent) |
| MCP | `mcp_contract_families.js` (catalogue central des commandes, Santé et Sport compris), projeté en outils Runtime V2 par `tool_runtime_service_commands.js` ; politique `mcp_security_policy.js` | Protocole MCP standard (travail du plan commun) |
| **Import de protocoles, médicaments, interactions, veille** | **Rien.** Seuls existent l'import de contacts et d'agenda, et les allergènes alimentaires | Tout le moteur de l'annexe B : c'est le plus gros morceau neuf du volet |

**Pièges notés :** `eVe/intuition/tools/activities*.js` désigne les activités de *travail* d'un projet (PAO, texte,
vidéo, DAW), pas les activités de santé ; ne pas confondre. La décision D2 du 28 oct. (pas de règles construites
sur les briques `review_required` faute de relecteur clinique) reste en vigueur et rejoint le blocage « revue
clinique » de la section 4.

**Propriétaires à réutiliser, jamais à doubler :** `program_brick_catalog.js`, `project_program_runtime.js`,
`dashboard_progression_runtime.js` et ses contrats, `activity_session_store.js`, `health_owner.js`,
`program_collection_runtime.js` (lieu naturel des déclarations de traitements et de compléments),
`calendar_api.js`, `mcp_contract_families.js`, `mcp_security_policy.js` et `health_actor_gate.js`.

## 3. Le challenge : quel ordre, ensemble ou séparé

**Verdict : une seule tâche, et la Santé ne peut pas passer avant la refonte.** Le plan commun le démontre (§2).
Trois arguments en plus, vus du côté Santé :

1. **Le cahier Santé interdit lui-même d'avancer seul.** « Les identifiants des briques et outils eVe doivent être
   résolus depuis la cartographie canonique de la refonte globale ; une référence manquante reste `unmapped` »
   (annexe B.5). Coder la Santé d'abord, c'est inventer des liens `tool_id` qu'on devra recâbler à la bascule.
2. **La refonte seule n'a pas de cas réel.** Son ontologie (`health_brick`, `objective_scenario`,
   `activity_definition`) resterait théorique. La Santé est le domaine le plus exigeant (consentement par finalité,
   données privées, provenance, versions figées) : si le registre la porte, il porte le reste.
3. **La recette du document 2 est la meilleure preuve de bout en bout de la refonte.** Elle traverse import,
   registre, sécurité, calendrier, alarmes, Moniteur, MCP et offline sans IA. Elle sert de test de bascule.

**Ce que je conteste dans les cahiers** (questions de la phase C, section 6) :

- **Le cahier Santé a été écrit avant la charte de design (règles 11 à 20).** Il prescrit un « carré qui s'élargit
  sur 2–3 unités », des boutons « Accepter / Modifier / Refuser / Reporter » par brique et des pas de 5 min. La
  charte, absolue (règle 16), dit autre chose : une tuile garde sa taille (règle 12), se retourne en panneau sous un
  glisser vertical (règle 20), une valeur se règle sur une ligne de curseur ou un rouleau (règle 14), et tout outil
  est dans la bande du bas (règle 13). **Je recommande que la charte gagne partout.** Le fond du cahier (ce qu'on
  règle et dans quel ordre) est gardé, mais pas sa mise en page.
- **« Une seule tâche visible active à la fois, validée écran par écran » (Plan_execution, §55)** contre la bascule
  unique : réglé par la phase C commune (toutes les maquettes validées avant le code).
- **Ampleur.** 80 tâches, plus la refonte, en une passe. C'est faisable seulement parce que la plupart des 13 objectifs
  sont des **assemblages de données** (§51.26, lot 5) et non des écrans nouveaux. Le vrai code neuf tient en une
  dizaine de propriétaires (section 5). Le contenu (fiches, sources, catalogue sportif) est préparé en parallèle par
  des agents pendant les phases A et B.

## 4. Blocages par nature, connus dès maintenant

Ils sont nommés en phase C et ne bloquent pas le reste. Tout ce qui en dépend est livré à l'état
« proposé / non activé ».

| Blocage | Pourquoi aucune session ne peut le lever | Ce qui est livré quand même |
| --- | --- | --- |
| Revue clinique (P078, annexe F lot A7) | Il faut un professionnel de santé | Fiches, règles et scénarios sourcés, marqués `review_required` ; aucune prise, dose ni rappel de soin activés |
| Raccordement officiel du carnet (P030 : Mon Espace Santé, DMP) | Conventions et agréments externes | Carnet local complet, statut « non officiel », export et partage choisis (P029) |
| Réveil intelligent sur la montre (annexe F §7, niveau P2) | Montre réelle, nuits réelles | Réveil à heure ferme (P0) et mode nuit (P1) ; banc de mesure P2 prêt, à lancer par toi |
| Veille scientifique dans eVe (annexe B.4) | Réseau et IA facultative ; la tâche ChatGPT du lundi existe déjà hors eVe | Chaîne locale complète (collecte reprise au retour du réseau, diff de preuves, revue, version figée) ; testée sur des études fictives |
| Réseau social par objectif (P022–P025) | Il faut d'autres comptes réels pour la recette | Code et sondes à deux comptes de test ; recette réelle par toi |
| Tests sur appareils (iPad, montre, Tauri) | C'est toi qui testes les appareils | Validation Web par moi ; liste de recette par appareil |

## 5. Déroulé Santé, phase par phase

### A-Santé — Audit (avec la refonte P0 ; tâche P001, annexe F lot A0)

- Table d'identités **89 IDs documentaires ↔ 45 `BR-*` ↔ IDs runtime** (actions `PROGRAM_BRICKS`, exercices de
  `training_catalog`, outils Bien-être, Activité), par alias et propriétaire unique, jamais par ressemblance de nom.
  Livrée dans le registre de la refonte, pas dans un fichier Santé à part.
- État réel de P001–P080 et des lots du cahier Activités R-005 : `fait / partiel / absent`, avec la preuve.
- Inventaire `réutilisable / à adapter / absent` des briques du §51.26 (lot 0) : matrice, tuile qui se retourne,
  curseur, rouleau, séance, calendrier, alarmes, Dashboard, Finder, Moniteur, capteurs, import et export, montre.
- En parallèle (agents, sans code) : contenu des 45 fiches (annexe F §4.2), sources datées, catalogue sportif
  (§51.20), base de règles de sécurité (voir D-Santé 6).

### B-Santé — Conception (avec la refonte P1 ; P002, P003, annexes F §4–5 et B)

Le modèle Santé entre dans l'ontologie commune ; rien n'est un « moteur santé » à côté :

| Entité (§51.25) | Où elle vit |
| --- | --- |
| Projet-objectif, brique, activité configurée, séance | Atomes canoniques et entrées du registre (`objective_scenario`, `health_brick`, `activity_definition`) |
| Occurrence planifiée | Calendrier commun ; une occurrence partagée par deux objectifs est comptée une fois |
| Événement d'exécution, observation, document original | Historique append-only par `Atome.commit` ; provenance obligatoire |
| Produit, substance, prise déclarée | Atomes privés ; ingrédients actifs dédoublonnés |
| Règle de sécurité, source, version du corpus | Données versionnées et figées (contenu générique, jamais de donnée personnelle) |
| Proposition importée | Atome `import` qui garde le texte original intact et le statut de chaque ligne |

Plus : consentement par finalité et refus d'exposition à l'IA par défaut ; capacités MCP Santé (lecture, proposition,
jamais d'activation sans ta confirmation) ; règles « hors ligne sans IA » pour chaque capacité.

### C-Santé — Maquettes et questions (commune)

Écrans nouveaux, une maquette aux vrais jetons chacun (les autres suivent un motif déjà validé) :

1. Entrée des 13 objectifs et de l'objectif libre (grille de tuiles, règle 12).
2. Effort et temps disponible : deux tuiles qui se retournent en panneau ; effort en 5 paliers, temps en
   min/jour ou min/semaine.
3. Proposition de briques (2 à 4 expliquées) et choix brique par brique, avec les outils de la bande.
4. Aperçu du programme : minutes par semaine, conflits, réduction proposée.
5. Import d'un protocole et vue de conciliation (source → interprétation → confiance → ta validation → effet).
6. Alertes de sécurité S0–S5 et questions bloquantes.
7. Planning proposé (jours et types, heures relatives aux repas et au sommeil), à confirmer.
8. Carnet de santé (rubriques, documents originaux, résultats et courbes).
9. Fiche d'une brique (but, pratique, durée, preuve, sécurité, sources, médias).

Les questions sont dans la section 6.

### D-Santé — Réalisation (sur le registre, après le registre et la couche MCP du plan commun)

L'ordre interne reprend le Plan_execution d'origine. Une seule bascule n'empêche pas de bâtir dans l'ordre des
dépendances :

1. **Socle** (P003–P012) : entrée des objectifs, effort, temps, collecte minimale, Activités comme bibliothèque
   commune, composition, aperçu du programme, projet Dashboard « Aujourd'hui / À venir / Bilan ».
2. **Calendrier, alarmes, exécution, capteurs** (P013–P016) : réutilisation du calendrier et des alarmes existants ;
   un moteur d'exécution commun à toutes les activités ; saisie manuelle quand il n'y a pas de capteur.
3. **Résultats et carnet** (P017–P021, P026–P029) : observations et originaux, import de résultats, courbes et CSV,
   Moniteur avec provenance, adaptation, pause et reprise ; carnet transversal.
4. **Pilote Sommeil** (P034 + P056, parcours A du §51.24) ; réveil P0/P1 et politique de notifications de nuit.
5. **Démonstrateur Sport** (P040–P044 + P057, parcours B) : machines personnelles, séance détaillée, séries au
   toucher ; puis les autres sports par données (P045–P053), pictogrammes manquants (P054), parcours C.
6. **Import de protocoles et sécurité** (annexe B, recette du document 2) : `protocol_importer`, `ingredient_index`,
   `clinical_safety_rules` S0–S5, `constraint_planner` sans IA, `protocol_review_workflow`. Ce sont des **rôles** à
   poser sur les propriétaires réels trouvés en A, pas de nouveaux modules a priori. Les règles sont amorcées avec
   SEC-01 à SEC-10 et le thésaurus des interactions médicamenteuses de l'ANSM pour les substances de la recette,
   plus des cas fictifs pour chaque niveau. Tout reste « proposé » jusqu'à la revue. Les déclarations de
   traitements et de compléments passent par `program_collection_runtime.js` (atomes privés) ; l'accès IA/MCP reste
   fermé par `health_actor_gate.js`.
7. **Nutrition et compléments** (P031–P033, annexe G) : repas, repères sourcés, compléments par saisie ou catalogue
   facultatif, prises déclarées ; jamais de dose proposée.
8. **Autres briques et objectifs** (P035–P039, P055, P058–P067) : par assemblage du registre, sans écran propre.
9. **Réseau** (P022–P025), **objectif libre et scénarios historiques** (P068–P074), **veille** (annexe B.4).
10. **Accessibilité, persistance, sécurité** (P075–P076).

### E-Santé — Qualification (avant la bascule)

- Les 18 cas du §51.27, les 3 parcours du §51.24, les tests de l'annexe F §11 et de l'annexe B.6.
- **Recette du document 2 sur ton compte** : import intégral hors ligne et sans IA par l'outil réel, puis
  sortie A à I. Elle est rejouée en E, puis après la bascule en F.
- Sondes Playwright sur le vrai canevas ; aucune réussite annoncée depuis une simulation.

### F-Santé — Bascule, corrections, clôture

Tests après bascule, cahier coché tâche par tâche (P001–P080), registre à jour, FRAMEWORK_STATE et cartes mis à jour.

## 6. Questions Santé de la phase C

Elles s'ajoutent aux 6 questions du plan commun. Chaque question vient avec ma recommandation (en gras).

1. **Charte contre cahier** : la mise en page du cahier (carré qui s'élargit, boutons par brique, pas de 5 min)
   cède-t-elle partout à la charte 11–20 ? **Oui.** — Réponse : **oui, la charte l’emporte partout** (toi, 30 oct.).
2. **Place de la Santé** : rubrique propre au Dashboard, ou sous Activité ? Le cahier passe par
   `Projets → Créer → Objectif`, avec Activités comme bibliothèque commune. **Objectifs sous Projets, briques
   sous Activité, carnet comme rubrique propre.** — Réponse : **partagée en trois, comme recommandé** (toi, 30 oct.).
3. **Mise en relation (P022)** : le cahier la propose au début de chaque objectif ; la règle zen l'interdit si tu ne
   l'as pas demandée. **Un outil de la bande, jamais une étape.**  — Réponse : **outil de la bande** (toi, 30 oct.).
4. **Référentiel des briques** : la décision D1 du 28 oct. (45 `BR-*` comme cible, 89 IDs en alias) est-elle
   confirmée ? **Oui.** — Déjà validée par toi le 28 oct. (audit lot A) : non reposée.
5. **Thermalisme** : il n'est pas parmi les 13 objectifs. **Dossier de candidats `THERM-CAND-*`, sans objectif
   nouveau.** — Tranchée par ton cahier lui-même (§3.3 de l’annexe : candidats `THERM-CAND-*`, jamais de faux `BR-46+`) : non reposée.
6. **Données nutrition hors ligne** (Ciqual, Open Food Facts) : embarquer une base réduite ou consulter en ligne avec
   cache ? **Ciqual embarqué, Open Food Facts en ligne avec cache.**  — Réponse : **Ciqual embarqué + chaque produit Open Food Facts déjà vu gardé sur l’appareil** (toi, 30 oct.).
7. **Ton document 2** : il reste dans Téléchargements et n'entre jamais dans le dépôt (le dépôt est poussé sur
   GitHub). Les fixtures de `tests/` sont fictives. **Oui.** — Réponse : **autre règle, ton document sert de base et d’exemple** (toi, 30 oct.) : il devient la référence du format d’import et des sorties attendues A–I, et la donnée des tests de l’import et de la sécurité, au lieu de fixtures fictives. Il vit dans un dossier ignoré par Git (`tests/health_protocols/`, couvert par `tests/*`), jamais poussé : `atomecorp/a` est public sur GitHub (vérifié le 30 oct.), `atomecorp/eVe` privé. La recette se joue sur ton compte. Aucune IA ni service extérieur ne le lit sans ton accord. Précision (toi, 30 oct.) : **il sert de modèle (template) et il y en aura d’autres.** L’import est donc bâti pour la forme du modèle, jamais pour ce seul document ; chaque nouveau document déposé dans `tests/health_protocols/` est importé et testé sans changer le code. La forme du modèle (sections, types de lignes, sans tes valeurs) peut être décrite dans le dépôt ; tes valeurs, jamais. Proposer ces modèles dans eVe lui-même serait un nouvel écran : maquette en phase C d’abord (règle 16). **Certains modèles sont partageables** (toi, 30 oct.) : un modèle est privé par défaut et son auteur choisit lui-même de le partager, par les partages liés canoniques D8–D10 (aucune nouvelle route). Le partage se fait entre comptes eVe, jamais par GitHub. Celui qui reçoit un modèle passe par le même import et la même sécurité S0–S5, jugée sur son propre profil : un modèle reçu n’est jamais appliqué tel quel ni présenté comme un conseil médical. Ce qui part (la forme seule ou aussi les valeurs) est le choix de l’auteur, montré avant l’envoi.

## 7. Règles de sécurité qui gouvernent tout le volet

- Aucune prise, dose, rappel de soin, rendez-vous ni notification activés sans ta confirmation explicite ; revue
  professionnelle pour toute modification thérapeutique.
- Une contre-indication ne se règle jamais en décalant un horaire. Une donnée inconnue reste `null` ou devient une
  question ; une interaction inconnue n'est pas une absence de risque.
- Tes données de santé ne sont jamais envoyées à une IA ni à un service externe sans ton accord explicite pour
  cette finalité. Diagnostics et journaux génériques sans donnée de santé.
- Tout marche hors ligne et sans IA ; l'IA explique et propose, dans tes droits.
