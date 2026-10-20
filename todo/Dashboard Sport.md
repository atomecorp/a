# Dashboard Sport — Activité › Sport (musculation, gainage, cardio minutés)

Tâche créée le 2026-10-20. Plan validé par l'utilisateur. Maquette v1 présentée en conversation (plaques Sport, fiche exercice, séance minutée).

## Avancement

| Lot | État |
|---|---|
| L0 contrat + catalogue + MCP | fait le 2026-10-20 — sondes `temp/training/*.probe.mjs` vertes, 4 tests Programme (75) verts |
| L1 navigation Sport | fait le 2026-10-20 — sonde clics réels `temp/training/l1_navigation.probe.mjs` 11/11, captures `temp/training/l1_shots/` |
| L2 fiche exercice (design maître) | fait le 2026-10-20, option B choisie par l'utilisateur — sonde clics réels `temp/training/l2_card.probe.mjs` 15/15, captures téléphone `temp/training/l2_phone_shots/` |
| L3 séance minutée | fait le 2026-10-20 — `temp/training/l3_session.probe.mjs` 21/21, captures `temp/training/l3_shots/` |
| L4 pouls | codé le 2026-10-20 (saisie, Santé, zones, récupération) — saisie vérifiée sur Web ; lecture Santé non vérifiée sur appareil |
| L5 bilan + journal | fait le 2026-10-20 — bilan avec consentement (L3), fiche Journal, `l56_journal_week.probe.mjs` vert |
| L6 plan de la semaine | fait le 2026-10-20 — fiche Semaine + Agenda (`training.schedule_week`), aucun doublon |
| L7 refonte fiches santé des projets | fait le 2026-10-20 (en-tête + onglets du design maître) — contenu à valider |
| L8 i18n, maps, FRAMEWORK_STATE | fait le 2026-10-20 |


## Livré au lot L0 (2026-10-20)

- Catalogue figé : `atome/src/shared/training_catalog.js` (12 exercices × 4 niveaux, ratios de charge, pas de matériel).
- Contrat MCP : `atome/src/squirrel/training/contracts.js` (9 commandes `training.*`, capacités `training.read` / `training.write`).
- Domaine : `eVe/domains/training/` — `training_session_builder.js` (séries numérotées, repos, intervalles), `training_progression.js` (double progression, gainage +5 s/semaine, série test au poids du corps, zones Tanaka/Karvonen), `training_week_plan.js` (semaine dans le budget, OMS, force 2-5 j selon niveau, HIIT ≤ 2 non consécutifs), `training_runtime.js` (commandes → `invokeProjectProgram`, seul écrivain).
- Séance étendue : pas `kind` work/rest, `planned_measures` (reps + kg), `zone` ; actions `elapse` (fin de minuteur enregistrée, provenance `session_timer`) et `measure` (pouls 20-250 bpm, `manual`/`health`) ; `step_clock` du pas courant (pauses exclues) ; `heart_rate_summary`. Les séances sans ces champs gardent exactement leur forme.
- Brique `sport` dans `PROGRAM_BRICKS`, champ `program_activity.training {exercise_id, level, load_kg}`.
- Chaîne MCP : outils runtime (`tool_runtime_service_commands.js`), handlers MCP directs (`mcp_handlers_contracts.js` + `mcp_handlers.js`), capacités (`mcp_security.js`), ACL + politique (`mcp_security_policy.js`), hors Édition (`project_work_mode_state.js`).
- Constat de la sonde : avec 150 min/semaine, l'équivalent OMS aérobie plafonne vers 108 min (force + échauffements en zone 1 non comptés) ; `meets_who` le dit honnêtement.
- Corrections d'intégration (charte `temp/life_integration/CHARTER.md`, 2026-10-20) :
  - `TRAINING_ASSISTANT_INSTRUCTIONS` + préchargement de `training.prepare_session` / `session_transition` / `get_session` dans `conversation_session.js`.
  - Objectifs lus **uniquement** par `dashboard.objectives.list`. `plan_week` sans `goal` prend l'objectif santé de l'utilisateur, sinon `TRAINING_GOAL_REQUIRED`.
  - Chaque `prepare_session` écrit le lien `program_objective:<activityId>:<objectiveId>` (`activity_link`) vers les objectifs actifs de sa famille : gainage et force → muscle + weight, cardio → movement + weight (`TRAINING_OBJECTIVE_GOALS`).
  - Pouls réservé à l'utilisateur dans l'app (`source.type === 'ui'` et `healthAccessAllowedNow`). Les appelants MCP/IA reçoivent le journal sans `heart_rate`, et `measure` avec `source: 'health'` leur répond `health_access_denied_for_actor`.
  - `core_atome_types.js` ramené à 476 lignes : les schémas d'activité Programme sont sortis dans `atome/src/shared/program_activity_contract.js` (mêmes clés, même ordre).
  - `training_runtime.js` reçoit maintenant ses dépendances (`createTrainingRuntime`), sur le modèle de `createProjectProgramRuntime`.
- Vérifié dans l'app réelle (`PROBE_ISOLATED=1 node temp/training/real_app.probe.mjs`, 10/10) : 9 outils listés par `runtime.tools.list` avec leurs schémas, appel MCP direct, `runtime.tools.call`, séance complète par la passerelle UI, journal sans pouls côté MCP, +1 kg proposé, journal conservé après rechargement.
- Sonde croisée Déblocage (`PROBE_ISOLATED=1 node temp/training/progression_cross.probe.mjs`, 6/6) : objectif santé « muscle » créé par `ui.new_project`, 3 séances `training.*` terminées avec `use_in_followup: true`, liées à l'objectif → `dashboard.progression.read` donne le palier 2 et la brique `activity_sport` débloquée.
- **Règle pour L3/L5** : une séance ne compte pour le Déblocage que si `finish` porte `use_in_followup: true`. C'est un choix de confidentialité de l'utilisateur : le bilan le propose par le composant existant `toggleableRowNode`, sans texte non demandé, et ne le pose jamais à sa place. Fenêtres comptées (fin de séance seulement) : P2 = 3 séances en 14 j, P3 = 8 en 14 j, P4 = 20 en 28 j.
- Reste : L6 passera par `calendar.create` + `program_link` ; L1 n'ajoutera que l'entrée `sport` dans la table des briques posée par la session Déblocage.

## Livré au lot L1 (2026-10-20)

- Activité › Sport ouvre un sous-niveau natif du Mystic (retour natif niveau par niveau) : Musculation (7 exercices), Cardio (5), Semaine, Journal. Les exercices viennent de `training.list_exercises`, la même commande que l'assistant et MCP.
- Fichiers : `eVe/domains/dashboard/dashboard_training.js` (plaques), `eVe/i18n/languages_training.js` (libellés FR/EN, enregistrés dans `languages.js`). Dans la table partagée `dashboard_mystic_sources.js`, ajout de `ACTIVITY_LEVELS` (une brique qui ouvre un niveau de plaques) avec la seule entrée `sport`. Le filtre du Déblocage et `ACTIVITY_OPENERS` sont inchangés.
- Écart avec la proposition faite à l'utilisateur : pas de commande `training.open`. Une commande qui remplace les plaques n'aurait pas eu le retour natif du Mystic, le sous-niveau (modèle Rencontre) est la mécanique canonique. Ouvrir Sport à la voix reste à faire si l'utilisateur le demande.
- Design : plaques existantes du Dashboard (verre vert Activité, bande de libellé, coin plié des sous-niveaux), glyphes existants uniquement (`movement` pour force et gainage, `goal_health` pour le cardio, `calendar` pour Semaine, `journal` pour Journal). Tous les exercices de force ont donc le même glyphe, faute d'icône dédiée.
- Les plaques d'exercice, Semaine et Journal sont nommées seulement : leurs fiches arrivent aux lots L2, L5 et L6.

## Livré au lot L2 (2026-10-20) — design maître des fiches Sport

- Fiche exercice : `eVe/domains/dashboard/dashboard_training_card.js` (surface `training_exercise_card`, état, événements) et `dashboard_training_card_view.js` (contenu). Elle grandit depuis la plaque d'exercice (`openOnSurface`) ou s'ouvre par la nouvelle commande MCP `training.open_exercise` (présentation enregistrée par `dashboard_mystic_stage.js`, comme `shopping.open`).
- Lecture et écriture uniquement par `training.get_exercise`, `training.suggest_load`, `training.set_profile`. `get_exercise` rend les zones cardiaques depuis l'âge de la fiche personnelle (Tanaka).
- **Option B validée par l'utilisateur** : l'apparence réelle du Dashboard (texte blanc, niveau entouré de blanc, champ kg − / +, outils « Lancer », « Suivi », « Fermer », 6 lettres maximum). Seul ajout : les cases des séries sont la case à cocher canonique des panneaux (`toggleableRowNode`, `indicatorOnly`).
- Composant étendu : `historyGraphNode` reçoit `axes: false` (barres seules, sans heure ni échelle). Les appelants existants sont inchangés. Le graphe de la fiche : une barre par séance terminée, vert Activité (`dashboardMysticRubricColor('activity')`), 8 séances au plus.
- Compte neuf sans poids : la colonne Charge reste, avec « — », jusqu'à ce que la personne tape une charge.
- Outils « Lancer » et « Suivi » nommés seulement : ils s'ouvriront aux lots L3 et L5.
- Leçon : une maquette doit employer les vrais jetons, sinon elle n'est pas tenable (mémoire `feedback_mockups_use_real_tokens`).

## Livré aux lots L3 à L8 (2026-10-20)

- **L3 séance minutée** sur la fiche exercice (`dashboard_training_session.js` + `_session_view.js`) : décompte et piste de progression (`bevy_panel_progress_track.js`, extraite du prompteur), cases cochées au fil des pas, outils Fait / Pause / Suite / Passer / Stop, puis bilan (durée active, séries, volume, pouls, récupération) et le choix « Compter pour mes objectifs » (case canonique, jamais cochée à la place de la personne), Finir, Retour. Chaque action est un `training.session_transition` ; une tenue, un repos ou un intervalle se termine par un `elapse` enregistré.
- **L4 pouls** : saisie dans le champ « Pouls » (`measure` source manual), lecture du dernier pouls Santé pendant la séance et enregistrement à la fin de chaque pas (source health), zone (Tanaka depuis l'âge de la fiche personnelle), récupération après la séance (`cardiacRecovery`). La lecture Santé reste à vérifier sur iPhone.
- **L5 Journal** (`dashboard_training_journal.js`) : plaque Journal et outil Suivi de la fiche (filtré sur l'exercice, Retour vers la fiche), graphe des séances et liste qui défile.
- **L6 Semaine** (`dashboard_training_week.js`) : objectif (segmenté, lu depuis l'objectif santé), minutes par semaine, séances par jour (liste qui défile), équivalent OMS et jours de force ; Agenda place la semaine suivante dans l'agenda personnel (`training.schedule_week`, événements liés au programme, jamais doublés). Planificateur équilibré par minutes par jour.
- **L7** : panneau Programme des projets santé avec l'en-tête du design maître (« Mieux dormir », « Santé · Programme · Proposition ») et les onglets en contrôle segmenté (Plan, Journal, Suivi, Partage). **À valider par l'utilisateur : le contenu**, notamment les phrases explicatives (« Indique les minutes disponibles, même zéro. », « Observations volontaires. Aucune donnée absente n'est interprétée comme un résultat. », « Pas de données consenties pour le suivi. ») que la règle zen voudrait retirer mais qui touchent au consentement santé.
- **L8** : libellés FR/EN (`languages_training.js`, `languages_programs.js`), entrées datées de CODEMAP, API_MAP, ARCHITECTURE_MAP, FRAMEWORK_STATE §5, note dans `atome/documentations/health_monitors.md`.
- Restes : pouls Santé sur appareil ; minutes par semaine non mémorisées (aperçu) ; glyphes d'exercice partagés ; corrections de séances dans le Journal (`program_execution_correction`) non exposées dans la fiche.

## Contexte

La tuile **Activité** du Dashboard eVe existe déjà. Elle contient trois briques vides : Sport, Spectacles et Liste des courses (`eVe/domains/dashboard/dashboard_mystic_sources.js:84,257`, avec `onSelect → {ok:true, empty:true}`).
Le besoin est de remplir **Sport** avec un vrai suivi d'entraînement :
- musculation (gainage, triceps à la corde, biceps…) et cardio (marche, tapis, sprint HIIT, elliptique, vélo) ;
- quatre niveaux, des séries numérotées, des temps de travail et de repos minutés ;
- un journal append-only, le relevé du rythme cardiaque, une charge adaptée à la personne ;
- un plan de la semaine qui respecte le temps que la personne y consacre.

Les fiches santé des projets (panneau Programme : Plan / Journal / Moniteur) doivent aussi prendre le design du Dashboard.

Règles imposées par l'utilisateur :
1. **Rien de nouveau visuellement.** Uniquement les éléments graphiques existants du Dashboard et de BevyUI.
2. **Chaque fonctionnalité passe par une API typée exposée en MCP.**
3. **Validation graphique par lot.** Une fois le design d'une fiche validé, il vaut pour toutes les fiches ; ensuite, seul le contenu des activités est à valider.

Décisions de l'utilisateur (20 oct.) :
- **Pouls** : lecture Santé (derniers échantillons pendant et après la séance) + saisie manuelle au repos. Pas de ceinture BLE ni d'app Watch.
- **Accès** : Sport seulement dans eVe Pro (tuile Activité + recherche « activités »). eVe Basic reste tel quel.

## Briques existantes réutilisées (audit fait)

| Besoin | Propriétaire canonique réutilisé |
|---|---|
| Navigation Activité › Sport › … | `dashboard_mystic_sources.js` (`sources.activity`, `dashboardMysticLabelItem`, palettes `type:'palette'` + `children`/`loadChildren`). Modèle de navigation imbriquée : `dashboard_meeting.js` |
| Fiche qui grandit depuis la plaque | `stage.openPanel({surfaceKey, rect, tools, context, compose})` (`dashboard_mystic_stage.js:223`), `createPanelCellPresentation`, `registerBevyPanelSurface` (`bevy_panel_runtime.js:223`). Modèle de fiche : `dashboard_meeting_card.js`, `bevy_panel_health_detail_view.js` |
| Bande d'outils sous la fiche | `dashboard_surface_tools.js` (`{key,label,icon,family,lit,onSelect}`) |
| Niveaux 1-4 | `bevy_panel_segmented_control.js` / `scope_chips` |
| Séries numérotées, journal | `hierarchicalSelectableListNode` (`rowDensity:'tall'`), `bevy_panel_virtual_list.js` |
| Charge, répétitions, pouls | `bevy_panel_numeric_field_runtime.js`, `buildBevyToolSliderNode` (déjà utilisé dans le Programme) |
| Courbes (volume, durée, pouls) | `historyGraphNode` (`bevy_panel_history_graph.js`) |
| Barre de progression du minuteur | La piste + remplissage de `bevy_panel_prompter_operator_view.js:74`. Elle sera **extraite** en composant partagé dans `bevy_panel/`, car deux appelants justifient le propriétaire unique. |
| Segments des séries (comme les photos) | `SEGMENT` de `dashboard_meeting_card.js` (extraction partagée, même règle) |
| Format du temps | `formatReadingTimes` (`bevy_panel_prompter_reading_view.js:80`) |
| Séance, transitions, log | `#shared/program_session_contract.js`, `program_session_model.js` (rejeu déterministe), `program_session_runtime.js` (écrivain append-only, `program_occurrence`/`program_execution`) |
| Activité globale du compte, budget | `project_program_model.js` (`validateActivity`, `buildTimeBudgetPreview`, `TIME_BUDGET_PARTS` dont `rest`), `involvement {minutes, basis, days, rhythm}` |
| Pouls, pouls de repos, poids | `#squirrel/health/health_owner.js` (`readHistory`, `reading`, `subscribe`), `health_catalog.js` (`heart_rate`, `resting_heart_rate`, `workout_duration`, `weight`), `cardiacRecovery` (`health_history.js:81`) |
| Profil (poids, naissance) | `bio.weight` / `bio.birth` (`bevy_panel_home_actions.js:77`) |
| Objectifs santé | `DASHBOARD_OBJECTIVES` `muscle` / `movement` / `weight` (`dashboard_creation_catalog.js:15`) |
| Jetons visuels | `EVE_DASHBOARD_SKIN_TOKENS`, `dashboardContentGlassStyle`, `RUBRIC_FAMILIES.activity = green`, `BEVY_PANEL_TOKENS`, Roboto embarquée |
| Chaîne MCP | Contrat partagé `*_COMMANDS` (modèle `#squirrel/tv/contracts.js`), définitions d'outils (`tool_runtime_bootstrap_defs_a.js` / `tool_runtime_service_commands.js`), handlers (`tool_runtime_bootstrap.js` `contractHandlers`), MCP `createContractHandlers` (`mcp_handlers_contracts.js`) + `mcp_handlers.js`, politique `mcp_security_policy.js:127,282` |

**Briques manquantes, à créer ou étendre dans les propriétaires canoniques** (autorisation permanente, sans substitut) :
- un contrat d'entraînement partagé, avec son catalogue ;
- des pas de séance multi-mesures et des pas de repos ;
- une action de séance `elapse` (fin de minuteur enregistrée) et une action `measure` (pouls) ;
- les clés de préférence niveau et charges ;
- l'extraction de la piste de progression et des segments ;
- le câblage de la brique Sport.

## Contrat et API (tout passe par MCP)

Nouveau contrat `atome/src/shared/training_contract.js`. Il porte le catalogue figé des exercices, le schéma des prescriptions par niveau, `TRAINING_COMMANDS` et `validateTrainingInput`, sur le modèle de `TV_COMMANDS`.

Commandes, toutes exposées en outil runtime V2, en MCP direct et dans la découverte IA :

| Commande | Effet | Écrit ? |
|---|---|---|
| `training.list_exercises` | Catalogue (filtre `kind: strength/core/cardio`) | non |
| `training.get_exercise` | Prescription des 4 niveaux + niveau et charges de l'utilisateur | non |
| `training.set_profile` | Niveau par exercice, charges de travail, matériel (`program_preference`) | oui |
| `training.suggest_load` | Charge proposée (poids corporel × ratio du niveau, puis double progression) | non |
| `training.plan_week` | Plan de la semaine depuis `involvement` + niveau + objectif | non (aperçu) |
| `training.prepare_session` | Crée la séance immuable (pas travail/repos) depuis exercice + niveau | oui |
| `training.session_transition` | start / pause / resume / confirm / elapse / measure / skip / correct / undo / finish / stop | oui |
| `training.read_log` | Journal projeté (séances, volumes, pouls, records) sur une période | non |

Chaque handler délègue à `project.program.*` (`invokeProjectProgram`) quand l'effet existe déjà. Il n'y a qu'un écrivain : `program_session_runtime.js` / `immutableActivity`. Aucun REST, tout passe par `/ws/api`. L'UI appelle ces mêmes outils par `invokeToolGateway`, jamais un chemin parallèle.

Extensions de `program_session_contract.js` et `program_session_model.js` :
- Pas : `kind: 'work'|'rest'`, `planned_measures: [{value, unit}]` (reps, kg, s, min, km/h, %, bpm cible), `zone` optionnelle.
- Le pas actuel `planned` reste valide pour sommeil et nutrition. Les autres consommateurs (sommeil, nutrition) restent valides sans modification.
- `elapse` : la fin d'un minuteur est un événement enregistré. Le rejeu ne déduit donc jamais une confirmation du temps écoulé, conformément à l'en-tête du modèle.
- `measure` : `actual {value, unit:'bpm'}`, saisi à la main ou lu depuis Santé.
- `finish` ajoute un résumé de pouls `{avg, max, min, recovery_60s, source}`.

## Catalogue des activités (contenu à valider)

Sources : OMS 2020, ACSM 2009 (débutant 8-12 RM, 1-2 min de repos en hypertrophie), consensus des entraîneurs pour le gainage et le HIIT. Fréquence cardiaque max : Tanaka `208 − 0,7 × âge`. Zones de Karvonen si le pouls de repos Santé est disponible.

### Musculation et gainage (7)

| Exercice | N1 | N2 | N3 | N4 | Progression |
|---|---|---|---|---|---|
| **Gainage** (planche ventrale + latérales) | 3 × 20 s ventrale, repos 40 s | 3 × 30 s ventrale + 2 × 20 s latérales, repos 30 s | 2 tours × (45 s ventrale, 30 s lat. G, 30 s lat. D), repos 30 s | 3 tours × (60 s ventrale, 45 s lat. G/D, 30 s bras-jambe levés), repos 20 s | +5 s par semaine. Arrivé à 60 s, on change de variante plutôt que d'allonger. |
| **Triceps poulie corde** (tirer vers le bas) | 2 × 12, repos 90 s | 3 × 12, repos 75 s | 3 × 10-12, repos 60 s | 4 × 8-12, repos 60 s | Double progression. Plafond atteint sur toutes les séries : +2,5 kg (pas de la poulie). |
| **Biceps curl haltères** (séries numérotées) | 2 × 12, repos 90 s | 3 × 12, repos 75 s | 3 × 10-12, repos 60 s | 4 × 8-12, repos 60 s | Double progression : +1 kg par haltère |
| **Pompes** | 3 × 8 sur genoux, repos 60 s | 3 × 10, repos 60 s | 4 × 12, repos 60 s | 4 × 15 tempo 3-1-1, repos 45 s | +1 rép. par séance, puis variante |
| **Squat** | 3 × 12 au poids du corps, repos 60 s | 3 × 10 goblet, repos 90 s | 4 × 10 goblet, repos 90 s | 4 × 8 lourd, repos 120 s | Double progression : +2 kg |
| **Fentes** | 2 × 8 par jambe, repos 60 s | 3 × 10 par jambe, repos 60 s | 3 × 12 haltères, repos 75 s | 4 × 12 haltères, repos 75 s | Double progression |
| **Rowing** (tirage horizontal) | 2 × 12, repos 90 s | 3 × 12, repos 75 s | 3 × 10-12, repos 60 s | 4 × 8-12, repos 60 s | Double progression : +2,5 kg |

Charge de départ :
- Première séance d'un exercice chargé : une **série test** propose une charge, puis la personne corrige jusqu'à faire 12 répétitions propres.
- La proposition vient de **ratios estimés, à valider** : poids corporel × ratio du niveau, arrondi au matériel.
- Biceps (par haltère) : 6 / 9 / 12 / 15 %.
- Triceps corde : 15 / 22 / 30 / 38 %.
- Rowing : 25 / 35 / 45 / 55 %.
- Squat goblet : 15 / 25 / 35 / 50 %.
- Ensuite, seule la double progression et le journal font évoluer la charge.

### Cardio (5)

| Activité | N1 | N2 | N3 | N4 |
|---|---|---|---|---|
| **Marche à pied** | 20 min Z2 (~100 pas/min) | 30 min Z2 | 45 min dont 3 × 3 min rapides (~130 pas/min) | 60 min ou marche inclinée 40 min |
| **Course sur tapis** | 8 × (1 min course / 2 min marche) = 24 min | 8 × (2 min / 1 min) | 30 min continu Z2 | 40 min dont 10 min au seuil Z4 |
| **Course + sprint HIIT** (tapis) | 5 min d'échauffement + 8 × (20 s / 60 s) + 5 min de retour au calme | 10 × (30 s / 60 s) | 10 × (30 s / 30 s) | 10 × (40 s / 20 s) |
| **Elliptique** | 20 min Z2 | 30 min Z2 | 30 min dont 6 × (1 min Z4 / 2 min) | 40 min dont 8 × (1 min / 1 min) |
| **Vélo** | 20 min Z2 | 35 min Z2 | 45 min dont 5 × (3 min Z4 / 2 min) | 60 min ou 6 × (4 min Z4 / 3 min) |

Le HIIT est limité à 2 séances par semaine, jamais deux jours de suite. Un échauffement et un retour au calme sont toujours inclus.

## Plan de la semaine (`training.plan_week`)

Entrées :
- `involvement` (minutes par semaine, jours, rythme), déjà existant ;
- l'objectif (`muscle` / `movement` / `weight`) ;
- le niveau par exercice ;
- l'historique de la semaine.

Règles :
- Viser OMS 150-300 min modérées (1 min vigoureuse compte pour 2).
- Musculation au moins 2 jours par semaine.
- Pas deux jours de suite pour le même groupe musculaire.
- HIIT au maximum 2 fois.
- Pondération selon l'objectif : muscle 60/40 force/cardio, movement 30/70, weight 40/60.
- Le temps de repos compte dans `TIME_BUDGET_PARTS.rest`.

Si le budget est trop court, le plan propose le minimum utile plutôt qu'un plan qui le dépasse, avec `buildTimeBudgetPreview` (défer/réduire). Chaque séance planifiée peut aller à l'agenda par le `calendar_event.program_link` existant.

## Déroulement d'une séance

1. Plaque de l'exercice : la fiche grandit depuis la plaque.
2. Choix du niveau (1-4).
3. Les séries numérotées s'affichent avec la charge proposée.
4. **Commencer** lance `start`.
5. **Pas de travail** :
   - exercice minuté (gainage, cardio) : décompte, puis `elapse` ;
   - exercice en répétitions : la personne valide avec `confirm` + reps et charge réelles (préremplies).
6. **Pas de repos** : décompte automatique, puis `elapse`. Le pas suivant s'enchaîne.
7. Le pouls s'affiche quand Santé en fournit un. Sinon, saisie au repos par `measure`.
8. **Fin** (`finish`) : bilan (durée active, volume, pouls moyen et max, récupération à 60 s), écrit en `program_execution`. Le journal se met à jour.

Le minuteur repeint à 1 s, comme `bevy_panel_contact_conversation_runtime.js:150`. Sa vérité reste les horodatages de transitions, jamais l'état de la vue.

## Lots (validation à chaque lot)

Pour chaque lot :
1. Maquette dans la conversation, que tu valides.
2. Implémentation.
3. Sonde ciblée dans `temp/training/`.
4. Captures Playwright réelles du canevas (`how_debug_UI.md`, `HEADLESS=0`).
5. Tu valides visuellement.

| Lot | Contenu | Validation |
|---|---|---|
| **L0** | `training_contract.js` + catalogue + extensions de séance (multi-mesures, `elapse`, `measure`) + chaîne MCP complète + clés de préférence. Sonde : appel MCP direct → séance préparée → transitions → rejeu identique. | Contenu des activités (tableaux ci-dessus) |
| **L1** | Brique Sport → palettes Musculation / Cardio / Semaine / Journal → plaques d'exercice (vert Activité, `dashboardMysticLabelItem`). Gestes conservés : appui long, dwell, retour. | Aucune (design Dashboard existant) |
| **L2** | **Fiche exercice** (maquette 2) : niveau segmenté, séries numérotées, charge, mini-courbe `historyGraphNode`, bande d'outils Commencer / Journal / Réglages / Retour. | **Design maître des fiches** (vaut ensuite partout) |
| **L3** | **Séance minutée** (maquette 3) : décompte, piste de progression extraite, segments des séries, travail/repos enchaînés, validation des reps et de la charge, pause / passer / arrêter. | Contenu uniquement |
| **L4** | Pouls : lecture Santé pendant et après la fenêtre de séance, saisie manuelle, zones Tanaka/Karvonen, récupération `cardiacRecovery`. | Contenu |
| **L5** | Bilan de séance + fiche Journal (courbes volume / durée / pouls, liste des séances, corrections via `program_execution_correction`). | Contenu |
| **L6** | Plan de la semaine depuis le temps disponible + lien agenda. | Contenu |
| **L7** | Refonte des fiches santé des projets (`bevy_panel_program_runtime.js` : onglets → bande d'outils, surface ¾ du Dashboard, même design que L2). | Contenu |
| **L8** | i18n FR/EN (`eveT`), maps (CODEMAP/API_MAP/ARCHITECTURE_MAP), `FRAMEWORK_STATE` §5, `health_monitors.md`. | — |

Fichiers principaux touchés :
- `dashboard_mystic_sources.js` : la brique Sport délègue à un nouveau `dashboard_training.js`, sur le modèle de `dashboard_meeting.js` ;
- nouveaux `dashboard_training_card.js` et `dashboard_training_session_card.js` ;
- `program_session_contract.js` et `program_session_model.js` ;
- `program_collection_contract.js` (clés de préférence) ;
- la chaîne MCP citée plus haut ;
- `eVe/i18n/languages_dashboard_mystic.js` et `languages_{fr,en}_health.js`.

Chaque fichier de code reste sous 300 lignes. `dashboard_mystic_runtime.js` (707 lignes) ne grossit pas.

## Vérification

- Sonde Node `temp/training/contract.probe.mjs` :
  - validation du catalogue et des 4 niveaux ;
  - `plan_week` sur 3 budgets (60, 150, 300 min) ;
  - `suggest_load` avec double progression ;
  - rejeu déterministe d'une séance avec `elapse` et `measure` ;
  - les séances sommeil et nutrition restent valides.
- Sonde MCP : appel direct de chaque `training.*` → même résultat que l'outil runtime, et entrée dans la politique de sécurité.
- Sonde Playwright `temp/training/ui.probe.mjs` (serveur 3001), avec de vrais clics sur le canevas : Activité → Sport → Biceps → niveau 2 → Commencer → 1 série → repos → fin. Captures + lecture du coffre (pas de la page) pour la persistance.
- iOS : lecture du pouls vérifiée par le WS local (Santé réelle sur l'iPhone).
