# Étude — Santé, plaisir, récupération et Thalasso (H-01 à H-07) — 2026-10-22

Lots L08, L09, L10 de `todo/!!!!!!_Urgent_big _task_to implement.md` (§1.6, questions 11 et 12 du §2.2, ligne « Santé et
images » du §4.2, recettes du §6.2). Statut : **ÉTUDE**. Rien n'a été implémenté ni maquetté, aucun runtime n'a été lancé,
personne n'a été contacté. L'audit repose sur une lecture du code faite le 2026-10-22. Les sources externes ont été
consultées le même jour.

Légende utilisée partout :
- **[Fait]** : lu dans le code (chemin:ligne) ou dans une source citée.
- **[Inférence]** : ma conclusion, à confirmer.
- **[Pro]** : un professionnel compétent (médecin, juriste RGPD/santé, DPO) doit valider avant toute réalisation.

## 0. Ce qu'il faut retenir

1. Le cadre existe déjà en grande partie. Les briques `nap` et `meditation` existent comme activités globales du compte. Un
   moteur de séance minuté générique fonctionne pour toute brique. Il existe déjà un stockage privé des allergies et
   intolérances, avec une permission par finalité. Enfin, des commandes typées sont exposées à l'assistant et au MCP selon
   un patron unique. Il manque surtout du **contenu** (le « i », les soins, le guidage) et quelques **extensions de contrat**.
   Il ne manque aucun moteur.
2. Il n'existe rien pour Thalasso, Plaisir, Pranayama, Sophrologie, le bilan unique, ni pour une recherche de lieux par
   catégorie (restaurants, spectacles) avec horaires.
3. Le panneau « Infos » actuel inspecte des enregistrements. Il ne peut pas porter le « i » explicatif.
4. Pour la Thalasso, les preuves sont faibles à modérées et portent sur des **pathologies** (arthrose, fibromyalgie,
   psoriasis), pas sur des personnes en bonne santé. Rien ne permet de promettre un bénéfice thérapeutique.
5. Le profil santé relève de l'article 9 du RGPD. La question de l'hébergement HDS reste ouverte et doit être tranchée par
   un juriste ([Pro]).

## 1. Audit des briques existantes

| Brique | Preuve | Statut | Remarque |
| --- | --- | --- | --- |
| Briques de programme `nap`, `meditation`, `nutrition`, `sport` | `eVe/domains/programs/project_program_model.js:7-13` | Disponible et compatible | `nap` = icône `sleep`, libellé `eve.first_launch.brick.nap`. Choix offert dans la configuration d'activité (`program_activity_configuration_control.js:83`). |
| Activité globale du compte (brick_id, involvement, exécutions avec `note` et `use_in_followup`) | `atome/src/shared/program_activity_contract.js:4-8, 12-37` | Disponible et compatible | Une activité n'appartient à aucun projet. Les liens vers les objectifs sont séparés (`program_activity_link`). |
| Moteur de séance générique (étapes `work`/`rest`, unités `s`/`min`, Pause/Reprise, fin → `program_execution`) | `eVe/domains/programs/program_session_runtime.js:8-19, 33`; `atome/src/shared/program_session_contract.js:8-9` | Disponible et compatible | Il accepte toute brique de `PROGRAM_BRICKS`. Le Sport l'utilise déjà (`training_runtime.js:237`). |
| Bips et voix locale | `eVe/domains/training/training_sound.js:28, 43-55` (`engine: 'local_onnx'`, sans réseau) | Existant, mais propre au domaine Sport | On peut le réutiliser par import pour un guidage. Il porte le nom `training`. Une extension de portée est à décider (voir §2, H-02). |
| Routine Sommeil : Sieste 13:30, 20 min ; Méditation 10 min avant le coucher | `eVe/domains/programs/sleep_routine_model.js:36, 41`; textes `eVe/i18n/languages_sleep_routine.js:6, 11` | Disponible, mais limité | Un « détail » d'une ligne par item (`sleep_routine_model.js:45`). C'est l'embryon d'un « i ». |
| Outil « relaxation » d'un programme | `project_program_runtime.js:198-201`; `project_program_model.js:105, 117` | Existant, mais inadapté au guidage | Il exige une ressource `sound`/`audio` **possédée** par l'utilisateur. Il n'y a aucun contenu guidé fourni. |
| Moniteur « minutes de pleine conscience » | `atome/src/squirrel/health/health_catalog.js:230-232` (HKMindfulSession) ; cible 10 min `dashboard_progression_catalog.js:52` | Disponible (lecture iOS) | Il lit seulement. Aucune écriture de séance de méditation vers Santé n'a été trouvée. |
| Pranayama, Sophrologie, cohérence cardiaque, respiration guidée | grep `pranayama\|sophro\|coherence\|breath` sur `eVe/`, `atome/src` | Introuvable après recherche | Le seul résultat « breath » est le halo animé du Mystic (`bevy_ui_mystic_model.js:102`). |
| Objectifs officiels (13) | `eVe/domains/dashboard/dashboard_creation_catalog.js:15-22` | Disponible | Aucun objectif « Se faire plaisir » ni « Thalasso ». Les plus proches : `balance` (« Preserve time for yourself »), `wellbeing`, `meditation`, `mental_health`. Seul `sleep` est `pilot`, les autres sont `preview` (l.21). |
| Progression du Dashboard (paliers par jours ou séances, briques gagnées) | `dashboard_progression_catalog.js:17-41` | Existant, en tension avec H-01 | C'est un mécanisme de déblocage, donc une forme de récompense. H-01 interdit score, récompense et culpabilisation pour le Plaisir. |
| Activités du Dashboard : `sport`, `shows`, `shopping_list` | `dashboard_mystic_sources.js:88`; `activity_shows` gagné tôt par `wellbeing`, `mental_health`, `balance`, `meditation` (`dashboard_progression_catalog.js:34`) | Disponible | [Inférence] Pour les objectifs « bien-être », la seule activité qui se débloque tôt est la vidéo. C'est exactement le biais « télévision par défaut » que H-01 refuse. |
| Panneau « Infos » | `eVe/intuition/tools/infos.js:1-23` → `bevy_panel_info_runtime.js:1-20, 470` (hiérarchie, propriétés éditables, copie) | Existant, mais inadapté | C'est un inspecteur d'Atomes, pas une explication de pratique. `project_view_molecule_info.js` porte les outils contextuels de Molécule et n'a pas de rapport avec ce besoin. |
| Exposition assistant/MCP d'un domaine | `training/contracts.js:27-58, 71` → `tool_runtime_service_commands.js:16, 40` → `mcp_handlers_contracts.js:44` → `mcp_security_policy.js:134` | Disponible et compatible (patron) | C'est le patron canonique : contrat typé, gestionnaire de service, MCP et politique de sécurité. |
| Outils `project.program.read/preview/commit` | `tool_runtime_bootstrap_defs_a.js:40-43` (`visibility: 'hidden'`) | Non vérifiable sans exécution | Aucune occurrence dans les listes de contrats MCP de `atome/src/squirrel`. Exposition assistant non démontrée. |
| Profil « préférences » de programme : `allergies`, `intolerances`, `food_*`, `equipment`, `starting_state` | `atome/src/shared/program_collection_contract.js:2-14`; `program_collection_runtime.js:1-141` | Disponible et compatible, extension nécessaire | Valeur en texte libre (4000 caractères au plus), avec `provenance`, `uncertain` et `review_after`. Le fait est **partagé** entre usages et la lecture est **autorisée par finalité** (`program_data_permission`). « Non / plus tard » ne remplace pas un fait existant (l.87-88). Aucune opération d'effacement dédiée (`COLLECTION_OPERATIONS`, l.7). |
| Verrou santé pour l'IA et le MCP | `atome/src/squirrel/health/health_actor_gate.js:1-18`; appliqué aux conditions MCP (`mcp_handlers_conditions.js:16`) et à la collecte (`program_collection_runtime.js:61`) | Disponible et compatible | Fermé par défaut : l'IA ne lit pas les préférences santé. |
| Bio et biométrie de la fiche (naissance, poids, taille, mesures libres) | `bevy_panel_home_view.js:12-16`; règles de visibilité `bevy_panel_home_privacy.js:16-23` | Existant, mais inadapté au profil santé | La fiche se partage avec des contacts selon des règles. Y placer allergies ou pathologies exposerait ces données. |
| Nutrition : allergènes Open Food Facts | `server/ws_open_food_facts.js:68`; commandes `atome/src/squirrel/food/contracts.js:12-21` | Disponible, sans liaison | Les allergènes du produit sont lus, mais jamais comparés aux `allergies` déclarées (aucune occurrence de `allergens` dans `eVe/domains`). |
| Position ponctuelle, recherche d'adresse | `atome/src/squirrel/gps/contracts.js:16-17` (« explicit submission », « Does not retain or share fixes ») ; `server/gps_provider.js:54-76` | Disponible, mais limité | Le géocodeur est de type Nominatim, couvre **la France seulement** et renvoie 8 libellés sans catégorie, horaires ni distance. L'URL vient de la configuration (`ATOME_GPS_GEOCODER_URL`). |
| Lieux par catégorie, événements, spectacles, réservation | grep `places`, `nearby`, `MKLocalSearch`, `pointOfInterest` (Web, serveur, iOS) | Introuvable après recherche | Aucune source de lieux, d'événements ou de réservations n'est branchée. |
| Recherche Web sourcée | `atome/src/squirrel/ai/default_tools.js:192-199` (`openai.web.search`) | Existant, mais inadapté seul | Réponse d'un LLM avec annotations de sources. Pas de données structurées. Une fraîcheur ou une disponibilité inventée reste possible. |
| Thalasso, balnéothérapie, Plaisir, bilan/ressenti | grep `thalasso\|balneo\|plaisir\|pleasure\|check_in\|mood` | Introuvable après recherche | Le seul « ressenti » trouvé est `feeling` = observation `declaration` consentie (`program_monitor_sources.js:16`). |
| Observations de programme (`declaration`, `measurement`, `hypothesis`, `completion`, `benefit`) | `project_program_model.js:149-155`; écriture `project_program_runtime.js:436-448` | Existant, à étendre | Liée à un **projet-objectif**. Elle crée un Atome texte visible dans le projet (`ui.text.create`, x 40, y 400). |

Aucun statut « Non vérifiable faute d'accès » au sens strict. Deux points ne sont simplement pas vérifiés à la lecture :
l'exposition réelle des outils `project.program.*` à l'assistant, et l'hébergement effectif du géocodeur configuré
(variables d'environnement non lues, par règle).

## 2. Exigences H-01 à H-07 : existant, manque, plus petit propriétaire

### H-01 — « Se faire plaisir »

- **Existant [Fait]** : 13 objectifs, dont `balance` et `wellbeing`. L'activité `shows` (vidéo) se débloque tôt pour ces
  objectifs. Il n'existe aucune notion d'activité « libre », de journée sans programme, ni de suggestion de plaisir hors écran.
- **Manque** : une intention « Se faire plaisir », un catalogue de suggestions variées (repos, flânerie, restaurant,
  spectacle, cinéma, pâtisserie, sieste, déconnexion) et le choix explicite de « ne rien faire » sans conséquence.
- **Plus petit propriétaire [Inférence]** : ajouter une 14ᵉ entrée à `DASHBOARD_OBJECTIVES` (identité dans
  `ATOME_OBJECTIVE_IDS`) **ou** réinterpréter `balance`. Les suggestions deviennent des **activités** (`program_activity`)
  de briques existantes ou nouvelles (`nap`, `outing`, `meal_out`, `show`, `offline`). Il ne faut pas créer de module
  Plaisir. Les activités Plaisir doivent être **exclues** du comptage de progression (`DASHBOARD_PROGRESSION_TIERS`),
  sinon le plaisir devient une performance. Ce point est à valider.

### H-02 — Pranayama, Sophrologie, Sieste dans Méditation/Santé mentale

- **Existant [Fait]** : brique `meditation` sans contenu, avec un texte « Dix minutes de respiration lente ou de balayage du
  corps ». Moteur de séance minuté générique, bips, voix locale `local_onnx`. Outil relaxation limité aux fichiers
  audio de l'utilisateur.
- **Manque** : protocoles guidés (étapes minutées avec consignes), réglages de durée et de rythme, précautions
  respiratoires, guidage audio fourni par eVe.
- **Plus petit propriétaire [Inférence]** : **une seule brique Sieste** (`PROGRAM_BRICKS.nap`). La routine Sommeil, le
  Plaisir, la Récupération et la Thalasso la référencent par son id, sans copie. Pranayama et Sophrologie ne sont **pas**
  des briques séparées. Ce sont des **variantes** de `meditation`, définies chacune par une suite d'étapes
  (`session_steps` : `work` = inspirer/expirer ou consigne, `rest` = pause). Le guidage réutilise `speakTraining` et
  `playTrainingBeep`. Il faudrait les déplacer vers un propriétaire neutre (par exemple `domains/programs/session_sound.js`)
  plutôt que de les dupliquer, parce que leur nom est aujourd'hui propre au Sport. Ce déplacement est une décision
  d'implémentation.
- **Sécurité respiratoire [Fait + Pro]** : la respiration lente (environ 6 cycles/min) a un effet modeste sur la tension
  (méta-analyse de 17 essais : −5,6/−3,0 mmHg, hétérogénéité élevée). L'hyperventilation suivie d'apnée provoque des
  syncopes hypoxiques, quelle que soit la profondeur d'eau (Red Cross/YMCA/USA Swimming 2022). eVe ne doit donc proposer
  **ni hyperventilation cyclique, ni apnée prolongée**, et **jamais** dans l'eau ou près de l'eau (bassin Thalasso). Il ne
  faut pas présenter de bénéfice médical. Le rythme par défaut reste confortable (expiration plus longue que
  l'inspiration, sans rétention). La liste des contre-indications (grossesse, épilepsie, troubles cardiaques ou
  respiratoires, troubles anxieux avec attaques de panique) doit être validée par un médecin ([Pro]). La recherche n'a
  trouvé aucune revue d'événements indésirables du breathwork intense.
- **Sophrologie [Fait]** : le rapport Inserm pour la DGS (déc. 2020) relève très peu d'études. Il y voit un intérêt relatif
  pour le stress de l'adulte, la fibromyalgie et l'asthme de l'enfant, avec des résultats trop hétérogènes pour conclure.
  La profession n'est pas réglementée en France. Il faut la présenter comme une pratique de relaxation dont la preuve est
  faible.

### H-03 — Bilan facultatif unique

- **Existant [Fait]** : deux supports. (a) `program_execution.note` + `use_in_followup` à la fin d'une séance
  (`program_activity_contract.js:4-8`; `program_session_model.js:51`). (b) `program_observation` (`declaration` =
  « ressenti ») liée à un projet-objectif et matérialisée en Atome texte.
- **Manque** : un bilan de journée ou de semaine, l'option « ignorer » ou « ne plus proposer », une règle de fréquence.
  Les deux supports se recouvrent.
- **Plus petit propriétaire [Inférence]** : **un seul propriétaire**, `program_observation`. Il faut étendre son contrat
  (`validateObservation`, `project_program_model.js:150`) avec un sujet optionnel `{ kind: 'execution' | 'day' | 'week' |
  'objective', ref }` et le rendre global au compte, comme les activités, pour qu'un bilan de journée n'exige pas de
  projet. La `note` d'exécution reste lisible pour l'historique, mais une nouvelle saisie passe par l'observation.
  `use_in_followup` reste le consentement de réemploi pour les recommandations. Une préférence de sollicitation
  (`never` / `after_session` / `weekly`) vit dans les préférences de profil existantes, pas dans un nouveau registre.

### H-04 — Objectif « Thalasso »

- **Existant** : rien de spécifique. Les briques à composer existent (nap, meditation, nutrition, sport). Le calendrier, les
  alarmes et les occurrences existent aussi (CAL-01 partiel, voir le suivi).
- **Manque** : les soins comme activités, la notion de séjour (période), un catalogue sourcé et des précautions par soin.
- **Plus petit propriétaire [Inférence]** : une entrée `PROGRAM_DEFINITIONS.thalasso` (famille `health`) qui liste des
  briques et rien d'autre. Chaque soin devient une **activité** `program_activity` d'une brique `care` nouvelle, avec
  un `care_id` issu d'un catalogue figé, sur le même modèle que `training` avec `exercise_id`. La période du séjour
  réutilise `period` (déjà présent dans les aperçus de programme). Pas de panneau Thalasso. Le catalogue est au §4.

### H-05 — « i » universel et assistant

- **Existant** : des détails d'une ligne (routine Sommeil), des conseils fixes (`SLEEP_ROUTINE_TIPS`) et des descriptions de
  contrats lisibles par l'assistant (`training.*`). Aucun modèle d'information structuré.
- **Manque** : le contenu, un modèle commun, la provenance et le niveau de preuve, une commande de lecture pour
  l'assistant, le « i » sur repos et inactivité.
- **Plus petit propriétaire [Inférence]** : un **catalogue pur figé** (par exemple `atome/src/shared/practice_info_catalog.js`)
  indexé par `brick_id`, `care_id` ou `exercise_id`, avec des clés i18n (textes servis par `eveT`) et des métadonnées de
  sources. Il s'expose par **une** commande en lecture seule `program.practice_info` qui suit le patron `training/contracts.js`
  et la chaîne MCP de la ligne « Exposition » du §1. La présentation se fait dans l'espace de l'outil existant, selon une
  disposition à valider. Pas de nouveau moteur, pas de second assistant.

### H-06 — Profil santé unique

- **Existant [Fait]** : `program_preference` (fait partagé, texte libre, provenance, incertitude, date de révision) et
  `program_data_permission` (lecture autorisée par finalité, refus « inconnu / plus tard » mémorisé). Verrou IA fermé
  par défaut. Les données sont écrites par `commitBatch` en portée `global`, donc synchronisées vers le serveur.
- **Manque** : les catégories au-delà de l'alimentaire, la distinction déclaré / confirmé médicalement / suggéré par l'IA
  (seule `provenance: 'manual'` est écrite), une opération d'effacement explicite, une vue de consultation et de
  correction, la base légale.
- **Plus petit propriétaire [Inférence]** : étendre `PROGRAM_PREFERENCE_KEYS` et `PROGRAM_PREFERENCE_SCHEMA`
  (catégories du §5), ajouter `confirmation: 'declared' | 'medically_confirmed' | 'ai_suggested'` et une opération
  `collection_erase`. Ne rien mettre dans la bio de la fiche. Détails au §5.

### H-07 — Plaisir à proximité

- **Existant [Fait]** : position ponctuelle sur action explicite, géocodage d'adresse France, itinéraire Valhalla,
  recherche Web LLM.
- **Manque** : une source structurée de lieux (catégorie, distance, horaires, accessibilité, lien) et d'événements, un
  périmètre modifiable, la provenance par résultat.
- **Plus petit propriétaire [Inférence]** : étendre `gps.search_places` (ou ajouter `gps.search_nearby`) dans
  `atome/src/squirrel/gps/contracts.js`, avec catégorie, centre et rayon, sur un fournisseur à choisir (§6). Pas de module
  « découverte » concurrent.

## 3. Modèle structuré du « i » (8 rubriques de H-05)

Chaque fiche du catalogue porte :
`{ id, applies_to: [brick_id|care_id|exercise_id], sections: { definition, conduct, nature, purpose, benefits, program,
precautions, faq }, context_roles: { [objective goal]: role_key }, evidence: { level: 'demontre' | 'plausible' |
'consensus' | 'non_etabli', sources: [{ title, url, accessed }] }, reviewed_by: null | 'professional', reviewed_at }`.

Règles :
- l'essentiel (une ou deux phrases par rubrique) s'affiche d'abord, l'approfondissement ensuite ;
- `context_roles` adapte la rubrique 4 à l'objectif courant sans dupliquer la fiche ;
- une rubrique sans contenu vérifié est **absente**, jamais remplie artificiellement ;
- `reviewed_by: null` reste visible pour l'assistant, qui doit dire que le contenu n'est pas validé médicalement.

### 3.1 Exemple complet — Sieste

1. **Définition.** Un court sommeil en journée, choisi, en position allongée ou assise.
2. **Déroulement.** Un endroit calme, peu éclairé, une température agréable. Un minuteur de 10 à 20 minutes. Un réveil
   doux (son bas, puis voix ou bips). Au réveil, se lever lentement, boire un peu d'eau, s'exposer à la lumière. La
   sensation d'engourdissement peut durer quelques minutes. Matériel : aucun, un masque ou des bouchons si besoin. Fin :
   le minuteur. Il n'y a rien à valider.
3. **Nature.** Une pratique de repos, pas un soin ni un traitement. Elle ne remplace pas la prise en charge d'une
   somnolence anormale.
4. **But et lien à l'objectif.** Plaisir : un moment pour soi, sans résultat attendu. Sommeil : un apport court qui ne
   « vole » pas la nuit. Thalasso et récupération : un repos entre deux soins ou après l'effort.
5. **Bénéfices, limites, preuve.** [Fait] Une sieste de 10 minutes améliore la vigilance et les temps de réaction par
   rapport à l'absence de sieste. Une sieste de 30 minutes laisse plus souvent une inertie de sommeil (Brooks & Lack 2006,
   cité dans une table de revue ; Hilditch et al. 2016). Dans une étude de 2019, l'inertie se dissipait en 15 minutes au
   plus après des siestes de 20 à 60 minutes. Les siestes habituelles de **60 minutes ou plus** sont **associées** à une
   mortalité plus élevée (RR 1,22) et à plus de maladies cardiovasculaires (RR 1,37) dans une méta-analyse de cohortes
   (21 études, 371 306 personnes, PLOS ONE 2024). C'est une association observationnelle : la maladie peut provoquer les
   longues siestes. Niveau : **plausible** pour la vigilance, **non établi** pour un bénéfice de santé à long terme.
   L'effet varie selon la dette de sommeil et le chronotype.
6. **Programme.** Une fois par jour au plus, en début d'après-midi, 10 à 20 minutes. La règle « avant 15 h » de la
   routine actuelle (`languages_sleep_routine.js:6`) relève du **consensus**, sans essai cité ici. Elle se combine bien
   avec une marche ou une respiration lente au réveil. Elle peut être sautée sans aucune conséquence.
7. **Précautions.** Ne pas conduire ni utiliser de machine dans les minutes qui suivent. En cas de besoin de siestes
   longues et répétées, de somnolence irrépressible, de ronflements avec pauses respiratoires ou d'insomnie la nuit :
   en parler à un médecin ([Pro]). Pour une personne insomniaque, la sieste peut aggraver la nuit. L'alternative est un
   repos éveillé de 10 minutes.
8. **Questions fréquentes.** « Je n'arrive pas à dormir, est-ce raté ? » Non : un repos éveillé compte aussi. « Puis-je
   dormir plus longtemps ? » Oui, c'est votre choix, avec l'inertie possible. Question libre : vers l'assistant, avec le
   contexte de la fiche.

### 3.2 Exemple complet — Bain d'eau de mer (soin candidat Thalasso)

1. **Définition.** L'immersion dans de l'eau de mer chauffée, en baignoire individuelle ou en bassin collectif. En France,
   la norme volontaire AFNOR XP X50-844 décrit la thalassothérapie comme l'usage combiné du milieu marin : climat, eau de
   mer, boues, algues, sables. La balnéothérapie et le spa utilisent en général de l'eau du robinet (Que Choisir). Le
   thermalisme utilise des eaux minérales aux indications reconnues.
2. **Déroulement.** Il est fixé par l'établissement : température, durée, jets éventuels. eVe ne fournit aucun chiffre non
   sourcé. Préparation : s'hydrater, éviter un repas copieux juste avant. Après le soin : une douche, du repos, et une
   sieste possible (même brique Sieste). Matériel : maillot, sandales. Fin : le soignant ou le minuteur de la cabine.
3. **Nature.** Un soin de bien-être, pas un traitement. Les centres de thalassothérapie n'ont pas d'agrément de
   l'Assurance maladie, contrairement aux cures thermales (Que Choisir). La variante « bain hydromassant à jets » est
   décrite au §4.
4. **But et lien à l'objectif.** Thalasso et détente : une sensation de relâchement. Récupération après l'effort : un
   confort subjectif. Douleur : voir la rubrique 5, sans promesse.
5. **Bénéfices, limites, preuve.** [Fait] Chez des personnes **en bonne santé**, aucun bénéfice démontré n'a été trouvé.
   Pour des pathologies : la revue Cochrane sur l'arthrose (Verhagen, mise à jour 2007) trouve une amélioration possible
   de la douleur et de la qualité de vie avec les bains minéraux, mais juge la preuve faible. Pour la fibromyalgie, une
   méta-analyse publiée en 2024 (eau à 36-38 °C) rapporte un effet sur la douleur et le handicap jusqu'à 6 mois. Pour le
   psoriasis, le bain salé associé aux UVB donne une amélioration de faible certitude (Cochrane 2020). La revue narrative
   la plus citée sur la thalassothérapie (Antonelli & Donelli 2021, 14 études) parle d'« améliorations symptomatiques »
   dans quelques affections et réclame d'autres études. Niveau : **plausible** pour la détente (subjectif), **non établi**
   pour un effet propre à l'eau de mer par rapport à l'eau douce chauffée.
6. **Programme.** Selon la cure, souvent un soin par jour pendant le séjour, alterné avec du repos (Sieste), une
   respiration lente **hors de l'eau**, une marche et des repas adaptés. La fréquence suit le programme de
   l'établissement. eVe l'inscrit dans le calendrier seulement sur demande.
7. **Précautions et contre-indications [Pro].** Elles sont citées par des sources d'établissements, sans recommandation
   clinique de référence : maladie cardiaque sévère ou instable, insuffisance cardiaque, hypertension non contrôlée,
   accident cardiaque ou cérébral récent, fièvre, infection, plaie ouverte, grossesse (pour l'eau chaude), trouble de la
   coagulation. Une petite étude (15 hommes, coronariens stables, 40 °C pendant 15 min) n'a pas observé de complication.
   Elle ne suffit pas à généraliser. Une sensibilité cutanée ou une dermatose active demande l'avis du dermatologue.
   Alternatives : une douche chaude, un bassin moins chaud, un repos. Avant le premier soin, eVe demande **seulement** les
   catégories manquantes utiles (§5) et renvoie vers le médecin du centre.
8. **Questions fréquentes.** « Est-ce que ça soigne mes douleurs ? » Peut-être un peu, pour certaines pathologies, et la
   preuve est faible. « Eau de mer ou piscine chauffée, quelle différence ? » Aucune différence propre n'est démontrée. La
   question libre part vers l'assistant.

## 4. Catalogue candidat des soins Thalasso (non validé)

| Soin candidat | Catégorie | Preuve trouvée (2026-10-22) | Démontré | Plausible | Précautions principales |
| --- | --- | --- | --- | --- | --- |
| Bain d'eau de mer chauffée / bassin | Thalasso (eau de mer) | Balnéothérapie : Cochrane arthrose faible ; fibromyalgie modeste (2014, 2024) ; aucune revue systématique propre à l'eau de mer | Rien chez la personne en bonne santé | Détente, confort, douleur ressentie dans certaines pathologies | Cœur, tension, grossesse, fièvre, plaie, peau |
| Bain hydromassant à jets, douche à jet | Hydrothérapie | Lombalgie : revues de petits essais à risque de biais ; pas supérieur à l'exercice à sec ; aucun essai trouvé sur les jets eux-mêmes | Non | Relâchement musculaire subjectif | Idem, plus fragilité cutanée et vasculaire (varices, phlébite : [Pro]) |
| Enveloppement d'algues, boues marines | Thalasso (dérivés marins) | Un bain d'algues *Fucus serratus* augmente l'iode urinaire, surtout par **inhalation** (Westby et al. 2018, n = 30). Bains d'algues : 808 à 13 734 µg/L d'iode contre 22 à 105 µg/L pour l'eau de mer | Non | Confort cutané | **Thyroïde** (hyper/hypo, traitement, nodules), allergie ou sensibilité à l'iode et aux produits marins, peau lésée, grossesse : [Pro] |
| Soins aquatiques collectifs, gymnastique en bassin | Hydrothérapie et exercice | L'exercice aquatique aide comme l'exercice à sec (lombalgie, fibromyalgie) | Partiel (pathologies) | Mobilité, plaisir | Même avis que le Sport (cœur, respiratoire), surveillance |
| Relaxation marine, climat, aérosol | Bien-être connexe | Citée comme composante de la thalassothérapie, sans essai trouvé | Non | Détente | Asthme ou BPCO pour les aérosols : [Pro] |
| Respiration lente (hors de l'eau) | Méditation, variante | BP −5,6/−3,0 mmHg (17 essais, hétérogènes) | Modeste, chez les hypertendus | Calme, sommeil | Jamais d'apnée ni d'hyperventilation, jamais dans ou près de l'eau |
| Sieste, repos | Plaisir, récupération | §3.1 | Vigilance (court terme) | Bien-être | §3.1 |
| Sophrologie | Méditation, variante | Inserm 2020 : preuve faible, intérêt relatif (stress, fibromyalgie) | Non | Détente | Ne remplace pas un soin psychiatrique |
| Massages, soins du visage, du corps | Spa | **Non étudiés dans cette étude** | — | — | À instruire avant toute inscription |

Distinctions à afficher dans le « i » [Fait] : thalassothérapie = milieu marin (norme XP X50-844, expérimentale jusqu'en
2017, statut actuel non vérifié). Balnéothérapie et spa = eau en général du robinet. Thermalisme = eaux minérales,
prescription médicale et prise en charge possible.

## 5. Profil santé : catégories, minimisation, accès par brique

Catégories proposées ([Pro] pour la liste finale), dans le schéma existant `program_preference` :

| Clé proposée | Contenu | Existe déjà |
| --- | --- | --- |
| `allergies` | Alimentaires, médicaments, latex, produits de soin, iode ou produits marins, autres | Oui (texte libre) |
| `intolerances` | Intolérances et sensibilités distinctes d'une allergie diagnostiquée | Oui |
| `cardiovascular` | Cœur, rythme, tension, restriction d'effort ou de chaleur | Non |
| `respiratory` | Asthme, difficulté respiratoire | Non |
| `musculoskeletal` | Douleurs, blessures, mobilité, gestes interdits | Non |
| `metabolic_digestive` | Diabète, thyroïde, troubles digestifs | Non |
| `skin` | Dermatose, sensibilité aux produits, exposition au soleil | Non |
| `special_situations` | Grossesse, traitements, implants, limités aux précautions nécessaires | Non |
| `other` | Texte libre | Non |

Champs ajoutés au schéma : `confirmation` (`declared` par défaut, `medically_confirmed` seulement si la personne le dit,
`ai_suggested` jamais retenu sans validation explicite). L'opération `collection_erase` supprime le fait **et** les
permissions associées par une mutation canonique, avec le passé conservé dans l'historique, ce qu'il faut expliquer.
L'option « Rien à déclarer » réutilise `answer_state` `unknown` ou `later`.

Accès minimal par finalité (la permission existe par `purpose_id`) :

| Brique ou usage | Champs lisibles |
| --- | --- |
| Nutrition, courses, Open Food Facts | `allergies` (partie alimentaire), `intolerances`, `metabolic_digestive` si la personne l'accepte |
| Sport | `cardiovascular`, `respiratory`, `musculoskeletal`, `special_situations` |
| Soin Thalasso (par `care_id`) | Seulement les catégories citées dans la rubrique 7 de sa fiche (exemple : algues → `allergies` produits marins, `metabolic_digestive` thyroïde, `skin`, `special_situations`) |
| Respiration, Méditation | `respiratory`, `cardiovascular`, `special_situations` |
| Sieste | Aucun |
| Découverte locale | `allergies` alimentaires seulement si la personne demande un filtre. Jamais transmis à un tiers |
| Assistant / MCP | Aucun par défaut (verrou `health_actor_gate`). Une lecture ponctuelle exigerait un consentement explicite par question, ce qui est à décider |

Règles : on demande à la première utilisation **utile**, une seule fois. On ne redemande que la catégorie manquante pour
le soin visé. Une brique adapte ses propres propositions (alternative, intensité moindre). Elle ne bloque pas tout le
programme. Le profil rempli ne garantit jamais la sécurité, et le « i » le dit.

**Réglementation [Fait + Pro].** Les données concernant la santé relèvent de l'**art. 9 RGPD**, qui exige une exception de
l'art. 9(2), en pratique le consentement explicite, **en plus** d'une base de l'art. 6. La CJUE en retient une lecture large
(C-21/23, 2024). En France, l'**art. L.1111-8 CSP** et le référentiel HDS v2 (arrêté du 26 avril 2024) imposent un
hébergeur certifié quand on héberge des données de santé **pour le compte d'un tiers** dans un contexte de prévention, de
diagnostic, de soin ou de suivi. Une application de bien-être n'est pas automatiquement concernée. La qualification
dépend du contexte et doit être tranchée par un juriste. [Inférence] Les préférences sont synchronisées vers le serveur
eVe (`commitBatch`, portée globale), donc la question HDS se pose au moins pour atome.one. L'option « local seulement »
de la ligne §4.2 serait la réponse la plus sûre en attendant. Enfin, selon MDCG 2019-11 rév. 1 (juin 2025), la finalité
annoncée décide de la qualification en **dispositif médical** : des recommandations personnalisées de soins à partir de
pathologies déclarées pourraient y basculer ([Pro]).

## 6. Localisation et découverte locale : contraintes de conception

[Fait] La position est ponctuelle et demandée sur action explicite (`gps.locate`). La recherche couvre la France seulement,
avec des libellés sans catégorie. La politique d'usage de Nominatim interdit l'usage intensif du service public et exige
une identification : il faut une instance propre ou un fournisseur. MapKit (iOS/macOS) offre une recherche par catégorie
de point d'intérêt (`MKPointOfInterestFilter`), mais ses conditions et quotas n'ont pas été vérifiés, et un tri par
catégorie peut renvoyer des résultats d'une autre catégorie. Rien n'a été trouvé pour les spectacles et les réservations.

Contraintes à respecter :
1. Le lieu vient d'un de trois choix explicites : position du moment, destination du séjour (le lieu de la Thalasso), ou
   saisie manuelle. Pas de suivi continu (`watchPosition`) pour cette fonction.
2. La position n'est pas conservée au-delà de la requête. Elle ne part jamais dans une URL. Le périmètre est réglable et
   affiché comme valeur.
3. Chaque proposition identifiable porte sa source, sa date de lecture et uniquement les informations fournies par la
   source. Aucune disponibilité, table ou place n'est affirmée. Il faut écrire « horaires selon [source] au [date] ».
4. `openai.web.search` peut compléter, mais ses réponses sont des données non fiables. Une proposition sans URL de source
   n'est pas montrée comme un lieu.
5. Aucune donnée de santé n'est envoyée au fournisseur ni à l'établissement. Un filtre « sans gluten » est une requête
   textuelle choisie par la personne, pas une lecture du profil.
6. Aucun ajout automatique au calendrier. Le retour à l'activité d'origine se fait sans perte (pile de navigation
   existante).
7. Couverture : Valhalla et le géocodeur sont limités à la France (`gps_provider.js:54, 72`). Une Thalasso à l'étranger
   échoue avec `OUT_OF_COVERAGE`, et cet échec doit rester visible.

## 7. Décisions d'interface à faire valider (aucune maquette produite)

1. Où vit « Se faire plaisir » : nouvel objectif officiel, ou extension de `balance` ?
2. Exclure les activités Plaisir de la progression du Dashboard : oui ou non ? Et faut-il retirer le déblocage précoce
   de `shows` pour les objectifs bien-être ?
3. Les suggestions spontanées : lieu, moment, fréquence maximale, et geste pour les écarter durablement.
4. Le point d'accès du « i » dans chaque outil : glyphe, appui long ou commande vocale. Disposition « essentiel puis
   approfondissement » dans l'espace de l'outil.
5. Le bilan unique : moment de proposition (fin de séance, soir, dimanche), forme (mot libre, échelle courte, rien) et
   réglage « ne plus proposer ».
6. Le guidage de la respiration et de la sophrologie : voix locale, bips, ou fichier audio fourni. Choix des rythmes.
7. La Sieste : alarme de réveil (son, voix, vibration) et durées proposées (10, 15, 20 min, libre).
8. La première déclaration du profil santé : catégories en puces ou texte libre, « rien à déclarer », et lieu de
   consultation et de correction (fiche Santé ou page d'objectif).
9. Le séjour Thalasso : comment la période et le lieu sont saisis, et comment un soin s'ajoute à une journée.
10. La découverte locale : choix du lieu (position, séjour, saisie), réglage du périmètre, présentation des résultats et
    de leur source.
11. L'assistant et la santé : rester totalement aveugle (état actuel), ou recevoir un consentement par question ?
12. Stockage du profil santé : local seulement, ou synchronisé (dépend de l'avis juridique sur HDS).

## 8. Risques

| Risque | Gravité | Mesure |
| --- | --- | --- |
| Promesse thérapeutique implicite (Thalasso, respiration, sophrologie) | Élevée (santé, droit de la consommation, qualification en dispositif médical) | Niveau de preuve affiché, formulation « plausible / non établi », relecture [Pro] |
| Syncope liée à la respiration près de l'eau | Élevée | Aucun protocole d'apnée ni d'hyperventilation. Avertissement dans le « i » des soins aquatiques |
| Fuite du profil santé (fiche partagée, MCP, établissement) | Élevée | Hors de la bio, permission par finalité, verrou IA, rien d'envoyé aux tiers, journal d'accès |
| Doublons (deux Siestes, deux bilans, deux profils) | Moyenne | Un id de brique, un propriétaire d'observation, `program_preference` comme seul profil |
| Culpabilisation (progression, rappels répétés) | Moyenne | Plaisir exclu des paliers, sollicitation plafonnée, « ne plus proposer » |
| Lieux inventés, horaires faux | Moyenne | Source par élément, aucune disponibilité affirmée |
| Bascule HDS ou art. 9 non traitée | Élevée (juridique) | Avis juridique avant toute synchronisation de catégories médicales |
| Collecte plafonnée à 4 000 enregistrements (risque déjà relevé au suivi) | Moyenne | Correctif `source_domain` côté serveur, à faire avant d'ajouter des activités Thalasso |
| Atome texte créé dans le projet par une observation | Faible à moyenne | Le rendre facultatif dans l'extension H-03 |

## 9. Tests à prévoir (si la réalisation est demandée)

- **Sieste unique** : la même `brick_id: 'nap'` est vue depuis la routine Sommeil, un objectif Plaisir et un séjour
  Thalasso. Une seule fiche « i ». Séance d'une étape `rest` de 20 min → `program_execution` écrit une seule fois.
  Le minuteur sonne. La séance peut être sautée sans trace d'échec.
- **Respiration** : un protocole de pas plus de 10 min, sans étape de rétention. La voix locale fonctionne sans réseau
  (sonde hors ligne). Les bips peuvent être coupés.
- **Bilan** : le même formulaire et le même enregistrement après exercice, soin, journée et semaine. « Ignorer » n'écrit
  rien. « Ne plus proposer » est respecté pendant 7 jours simulés. `use_in_followup: false` exclut l'entrée des
  recommandations.
- **Profil** : première déclaration, puis réemploi par une deuxième brique sans nouvelle question. Seule la catégorie
  manquante est demandée pour un soin aux algues. Correction, puis effacement : `collection_read` renvoie `missing` et la
  permission disparaît. Lecture refusée pendant une requête MCP (verrou).
- **Allergènes** : un produit Open Food Facts avec `en:gluten` et une déclaration « gluten » donne un avertissement. Sans
  permission de finalité, rien.
- **« i »** : présent sur Sieste, repos, journée sans sport, activité reportée et « ne rien faire ». L'assistant lit
  `program.practice_info` et cite la source. Le retour au contexte se fait sans perte.
- **Découverte** : position refusée → saisie manuelle possible. Rayon modifié → résultats recalculés. Hors de France →
  erreur visible. Aucune requête ne contient de donnée de santé (inspection réseau). Aucun événement de calendrier créé.

## 10. Sources consultées le 2026-10-22

Les sources lues à travers un résumé de recherche sans ouverture du texte intégral sont marquées (résumé).

- Verhagen et al., *Balneotherapy for osteoarthritis*, Cochrane CD006864 (mise à jour 2007) — https://www.cochrane.org/evidence/CD006864_balneotherapy-or-spa-therapy-osteoarthritis
- Naumann & Sadaghiani, balnéo/hydrothérapie et fibromyalgie, Arthritis Res Ther 2014;16:R141 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4227103/
- García-López et al., balnéothérapie et fibromyalgie, méta-analyse, Int J Biometeorol 2024 — https://link.springer.com/article/10.1007/s00484-024-02732-3 (résumé)
- Cochrane, *Indoor balneophototherapy for chronic plaque psoriasis* (abrégé 2020) — https://pubmed.ncbi.nlm.nih.gov/33236826/
- Katz et al., *Scientific evidence of the therapeutic effects of Dead Sea treatments*, 2012 — https://pubmed.ncbi.nlm.nih.gov/22503590/ (résumé)
- Antonelli & Donelli 2021 (revue narrative) et revue *Water* 2024, 16(24):3650 sur les bassins d'eau de mer — https://www.mdpi.com/2073-4441/16/24/3650 (résumé)
- Westby, Cadogan, Duignan, iode d'un bain d'algues *Fucus serratus*, 2018 — https://pure.atu.ie/en/publications/in-vivo-uptake-of-iodine-from-a-fucus-serratus-linnaeus-seaweed-b-3/ (résumé)
- Que Choisir, *Thalassothérapie : du bon usage de l'eau de mer* — https://www.quechoisir.org/conseils-thalassotherapie-du-bon-usage-de-l-eau-de-mer-n42424 ; norme AFNOR XP X50-844 — https://www.tourmag.com/La-Thalassotherapie-dispose-desormais-de-sa-norme-AFNOR_a71595.html
- Bain chaud et coronariens stables (Mayo, 1993) — https://mayoclinic.elsevierpure.com/en/publications/cardiovascular-responses-to-immersion-in-a-hot-tub-in-comparison- (résumé)
- Hydrothérapie et lombalgie, revue systématique (IIUM) — https://journals.iium.edu.my/ijahs/index.php/IJAHS/article/view/884 (résumé)
- Chaddha et al., respiration lente et tension, méta-analyse 2019 — https://pubmed.ncbi.nlm.nih.gov/31331557/ ; Zaccaro et al. 2018 — https://www.frontiersin.org/articles/10.3389/fnhum.2018.00353/full
- American Red Cross / YMCA / USA Swimming, *Joint Statement on Hypoxic Blackout*, 2022 — https://www.redcross.org/content/dam/redcross/training-services/scientific-advisory-council/2022%20Hypoxic%20Blackout%20-%20Joint%20Statement%20-%20Red%20Cross%20Y%20USA%20Swimming%2010-31-2022.pdf
- Cochrane CD009041, exercices respiratoires et hyperventilation — https://www.cochrane.org/evidence/CD009041_breathing-exercises-dysfunctional-breathinghyperventilation-syndrome (résumé)
- Inserm pour la DGS, *Évaluation de l'efficacité et de la sécurité de la sophrologie*, déc. 2020, via FRM — https://www.frm.org/fr/actualites/efficacite-sophrologie (texte intégral non lu)
- Hilditch et al. 2016 et table de revue citant Brooks & Lack 2006 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5337178/table/T3 ; Sleep/Wake Research Centre — https://sleepwake.ac.nz/projects/sleep-inertia-after-naps
- Méta-analyse sieste, MCV et mortalité, PLOS ONE 2024 — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11482734/
- RGPD art. 9 — https://eur-lex.europa.eu/eli/reg/2016/679/oj ; avis conjoint EDPB/EDPS 03/2022 sur l'EHDS — https://www.edpb.europa.eu/system/files/2022-07/edpb_edps_jointopinion_202203_europeanhealthdataspace_en.pdf
- Référentiel HDS v2.1 (ANS) — https://esante.gouv.fr/sites/default/files/media/document/R%C3%A9f%C3%A9rentiel_certification_HDS%20-%20FR%20-%20V2.1%20-%20post%20concertation.pdf ; analyse CMS — https://cms.law/en/fra/news-information/nouveau-referentiel-de-certification-des-hebergeurs-de-donnees-de-sante-hds
- MDCG 2019-11 rév. 1 (juin 2025), synthèse — https://openregulatory.com/mdcg/mdcg-2019-11 (texte primaire non relu)
- CNIL, priorités santé et géolocalisation (presse) — https://www.lemondeinformatique.fr/actualites/lire-sante-geolocalisation-cookies-les-points-de-vigilance-de-la-cnil-en-2020-78418.html (résumé)
- Politique d'usage Nominatim (OSMF) — https://operations.osmfoundation.org/policies/nominatim/ ; Apple `MKPointOfInterestFilter` — https://developer.apple.com/documentation/mapkit/mkpointofinterestfilter

Limites : aucune recommandation clinique de référence n'a été trouvée sur les contre-indications de la thalassothérapie.
Les listes viennent d'établissements. Les dates de mise à jour Cochrane n'ont pas été revérifiées sur la Cochrane Library.
Le texte intégral de l'Inserm, de MDCG 2019-11 rév. 1 et du référentiel HDS n'a pas été relu. Toute réalisation doit
d'abord obtenir l'avis d'un médecin sur les §3, §4 et §5, et d'un juriste sur le §5 (réglementation) et le §6.
