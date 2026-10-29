# Étude — Nutrition, produits et menus (NUT-*) — 2026-10-27

Source : `~/Downloads/Cahier_des_charges_Nutrition_atome_eVe.md` (version du 27 oct. 2026), adossé au cahier Activités
(`~/Downloads/cahier_des_charges_activites_atome_eVe.md` : ARCH-001, FEAT-009, FEAT-010, FEAT-012).
Statut : **PHASE A faite (audit), PHASE B faite sur papier, PHASE C proposée — rien n'est validé, aucun code n'est modifié.**
Aucune maquette n'est encore produite (voir §9 pour la raison). Aucun runtime n'a été lancé, aucun fournisseur n'a été
appelé avec une clé, aucun professionnel n'a été contacté.

Légende :
- **[Fait]** : lu dans le code (chemin:ligne) ou dans une source citée, consultée le 27 oct. 2026.
- **[Inférence]** : ma conclusion, à confirmer.
- **[Pro]** : un professionnel compétent (diététicien, médecin, juriste RGPD/santé) doit valider avant réalisation.
- **[Jeezs]** : arbitrage de l'utilisateur.

## 0. Ce qu'il faut retenir

1. **La moitié du socle existe déjà.** Il y a une brique Programme `nutrition` : repas composés, types de repas, groupes
   d'aliments, portions, états `proposed`/`planned`, et repas consommés immuables. Ses écrans ont été validés le 14 oct.
   S'y ajoutent une liste de courses alimentée par les repas planifiés, un proxy Open Food Facts (Nutri-Score, NOVA, risque
   EFSA des additifs, allergènes, nutriments), un scanner de code-barres (iOS, navigateur), la table Ciqual 2025 embarquée
   hors ligne, une estimation d'énergie des séances (MET), des objectifs santé reliés aux activités sans copie, et des
   allergies/intolérances stockées en privé avec une permission par finalité.
2. **Ce qui manque, c'est le chaînage et le calcul.** Un aliment de repas est un texte libre, relié à aucun code Ciqual
   ni code-barres : aucun total nutritionnel n'est calculable. Les allergies ne sont jamais comparées aux produits. Il
   n'existe ni recette avec portions, ni menu sur plusieurs jours, ni moteur de génération, ni politique de sélection
   versionnée, ni annuaire de professionnels.
3. **Quatre défauts de l'existant contredisent le cahier** (§3). Ils sont à corriger en premier : un produit sans liste
   d'additifs reçoit le verdict « bon » ; un risque additifs inconnu est stocké comme « aucun » ; le proxy OFF dépasse le
   quota publié aujourd'hui ; la licence ODbL n'est créditée nulle part.
4. **Recommandation de moteur : interne, déterministe, en JavaScript partagé**, nourri par Ciqual (local) et Open Food
   Facts (produits de marque). Edamam et Spoonacular ne sont pas retenus au départ : ils sont payants en production, en
   anglais et restrictifs sur la conservation des données, et il faudrait leur envoyer des contraintes de santé. Ils
   restent des options documentées.
5. **Diététiciens : la source vérifiable existe, l'annuaire non.** L'Annuaire Santé de l'ANS (RPPS, données en libre accès
   et API FHIR) recense les diététiciens. Rien dans le dépôt ne gère de professionnel ; FEAT-010 et FEAT-012 ne sont pas
   commencés. Ce volet vient en dernier.

## 1. Méthode et limites de l'audit

- Lus : AGENTS.md, le brief `.claude/rules`, les deux cahiers, `todo/execution_order.md` (ATM-2017, journal Nutrition du
  14 oct.), `todo/etude_sante_plaisir_thalasso_2026-10-22.md` (§5 profil santé). Le code est cité ci-dessous.
- Non fait : aucun test de l'existant n'a été exécuté. Les fournisseurs à clé (Edamam, Spoonacular, USDA) n'ont pas été
  essayés, car il faudrait créer des comptes, et ce n'est pas à moi de le faire. Aucune capture de l'app réelle n'a été prise.
- Plateformes réelles : Web (Fastify) d'abord, Tauri et iOS relaient les appels produits vers Fastify, Android non audité.

## 2. Inventaire vérifié de l'existant

### 2.1 Brique Programme Nutrition [Fait]

| Élément | Où | Ce qu'il fait |
| --- | --- | --- |
| Contrat | `atome/src/shared/program_nutrition_contract.js` | `NUTRITION_MEAL_TYPES` (breakfast, lunch, dinner, snack, before_activity, after_activity, other), `NUTRITION_FOOD_GROUPS` (8), unités `g ml portion piece` ; schéma `{mode habit\|meal, meal_type, planning_state proposed\|planned, components[1..50]{id, group, food (texte ≤400), portion?}, preparation_minutes?, shopping_notes?, recipe_source?}` ; « quantities and nutritional advice are never inferred » |
| Consommation | même contrat + `project_program_runtime.js:74-90` | `nutrition_consume` → record immuable `program_nutrition_consumption:<id>` `{activity_id, activity_version, date, meal}`, date non future (`program_nutrition_control.js:93`) |
| Validation | `eVe/domains/programs/program_nutrition_model.js:11-55` | portion absente = inconnue, zéro explicite conservé (test `tests/eve/program_nutrition.test.mjs:168`) |
| Écrans | `program_nutrition_control.js`, `program_nutrition_presentation.js`, hôte `bevy_panel_program_runtime.js:136` | Repas/Action → type de repas → composition → aliment → options ; validés par l'utilisateur le 14 oct. (`todo/execution_order.md:84-104`) |
| Préférences | `project_program_model.js:10-11`, `program_collection_runtime.js:70-95`, `atome/src/shared/program_collection_contract.js` | questions `allergies, intolerances, food_preferences, food_access, food_budget` → records privés `program_preference:<actor>:<key>` (texte libre), permission `program_data_permission:<actor>:<purpose>:<source>` |
| Courses | `project_program_runtime.js:61`, `eVe/domains/shopping/shopping_list_model.js:34-54` | un repas `planned` non refusé alimente la liste ; chaque quantité garde sa provenance (`contributions[]`) |

### 2.2 Objectifs et activités (ARCH-001) [Fait]

- Un objectif est un atome `project` avec `project_intent {family:'health', goal, objective_id?, target?}` (`core_atome_types.js:122-140`).
  Le but `nutrition` existe (`dashboard_creation_catalog.js:23`) hors des 13 `OBJ-*`. Sa préparation est l'écran
  générique `first_launch_objective`, et sa cible par défaut est l'**hydratation** 1 500 mL (`dashboard_progression_catalog.js:50-54`).
- Activité ↔ objectif : plusieurs-à-plusieurs par des liens immuables `program_objective:<act>:<obj>`
  (`project_program_model.js:177-178`), sans copie. C'est exactement le principe ARCH-001.
- Anti-double comptage déjà codé : le temps est dédoublonné par `calendar_event_id` (`project_program_model.js:257-283`), et
  une exécution compte une fois par objectif.
- **Écart** : la progression lit les `execution_ids` et jamais les `consumption_ids` (`dashboard_progression_runtime.js:86-91`).
  Un repas consommé ne fait donc progresser aucun objectif. Aucun lien automatique n'existe pour les activités nutrition
  (le sport en a un : `training_runtime.js:20`).
- Énergie dépensée : `eVe/domains/training/training_energy.js` (Compendium 2024, `MET × kg × h`), marquée `estimate:true`,
  jamais écrite dans Santé, `null` sans poids. Elle n'est reliée à aucun apport.
- Santé OS : seule l'hydratation est lue côté alimentation, et aucune écriture alimentaire n'existe
  (`tests/probes/native_health_authorization_contract.test.mjs`).
- Calendrier : `eVe/intuition/tools/calendar_api.js` gère plusieurs calendriers, la récurrence, les alarmes, le partage par
  numéro et les droits. `activity_bind` refuse un événement récurrent, alors que les routines en créent ; une
  consommation ne référence aucun événement.

### 2.3 Produits, aliments, scanner [Fait]

| Élément | Où | Constat |
| --- | --- | --- |
| Proxy OFF | `server/ws_open_food_facts.js` (dispatch `server/wsExternalResourceOperations.js:23`) | hôtes fixes OFF/OBF/OPF, aucune clé, User-Agent par `OPEN_FOOD_FACTS_USER_AGENT` sinon `NOT_CONFIGURED` ; caches mémoire (produit 6 h, recherche 30 min, taxonomie additifs 24 h) ; valeur manquante → `null` (l.54) |
| Champs lus | même fichier l.22-23 | `nutriscore_grade, nova_group, ecoscore_grade, additives_tags, allergens_tags, nutriments, categories_tags`. **Ne lit pas** `traces_tags`, `ingredients_text`, glucides, complétude, date de modification |
| Verdict | `atome/src/shared/food_health_assessment.js:26-36` | `avoid` / `limit` / `good` à partir du Nutri-Score, du NOVA et du risque EFSA de surexposition ; `null` sans grade |
| Commandes | `atome/src/squirrel/food/contracts.js` | `food.lookup\|search\|alternatives\|attach\|scan`, MCP + assistant |
| Client / owner | `eVe/domains/shopping/food_facts_client.js`, `food_runtime.js` | ce qu'un article garde du produit : identité, scores, verdict, `fetched_at`. **Allergènes et nutriments ne sont pas gardés** |
| Natif | `platforms/desktop-tauri/src/server/public_relay.rs:15`, `platforms/ios/atome-auv3/Common/FastifySyncPublicRelay.swift:13` | relaient vers Fastify, donc pas de produit hors ligne |
| Ciqual | `atome/src/assets/food/ciqual_2025.json` (55 Ko, 1 210 aliments), `scripts/generate_food_catalogue.mjs`, `eVe/domains/shopping/food_catalogue.js` | n'extrait que l'énergie (constituant 328), et `readFoodCatalogue` **jette le kcal** ; crédité dans `THIRD_PARTY_LICENSES.md:113-119` |
| Scanner | `eVe/domains/media/api/barcode_scan.js`, `AppNativeBarcodeScanner.swift` | iOS natif (EAN-13/8, UPC-E), navigateur `BarcodeDetector` ; Tauri macOS et Safari desktop → `HOST_UNSUPPORTED` |
| Courses Dashboard | `eVe/domains/dashboard/dashboard_shopping*.js` | fiche produit : verdict, Nutri-Score, NOVA (`dashboard_shopping_views.js:147-163`) ; devise figée EUR |
| Tests | — | aucun test permanent sur food/shopping/OFF/verdict/scanner, seulement des sondes `temp/shopping/` |

### 2.4 Recherche, professionnels, partage, secrets [Fait]

- Recherche complète : `dashboard_search_source.js:16`. Les portées sont figées (contacts, calendar, projects, activities,
  videos, music, places). Le seul point d'extension est le `find(text)` d'une plaque d'activité (`ACTIVITY_FINDS`,
  `dashboard_mystic_sources.js:101`), utilisé aujourd'hui par la liste de courses.
- Professionnels : **aucune entité coach, diététicien ou spécialiste**. Les plus proches sont l'annuaire public
  (`server/directoryPublicService.js:260`, recherche par nom, sans géolocalisation) et Rencontre
  (`atome/src/shared/meeting_contract.js:12-27` : but `professional`, thème `health`, zone `area` saisie, « never a position
  read from the device »).
- Lieux proches : `server/ws_shows.js` (OSM via OpenDataSoft, dont `restaurants`).
- Patron d'API externe canonique : une trame WS `/ws/api`, un handler `server/ws_*.js` (hôtes fixes, quotas, cache TTL,
  timeout, erreurs stables), une clé serveur via `server/auth_secret_config.js`, et le type ajouté aux deux listes de
  relais natifs. `server/public_source_fetch.js` interdit l'open proxy. Aucune clé dans le client.
- Partage : `atome/src/shared/share_rights.js` (capacités `read…manage`, propriétés lisibles et écrivables, révocation en
  cascade) via `AdoleAPI.sharing`. Les records Programme ne portent pas d'`access/visibility` explicite.
- Profil : `eve_profile.bio` (naissance, poids, taille) se partage **en un bloc** (`atome/src/shared/profile_sharing.js:10-13`).
  Les allergies ne sont pas dans le profil (c'est bien), mais dans `program_preference`.

## 3. Défauts de l'existant qui contredisent le cahier

| # | Défaut | Preuve | Règle du cahier touchée | Correction proposée |
| --- | --- | --- | --- | --- |
| D1 | Un produit noté Nutri-Score A sans aucune donnée d'additifs reçoit « good » | `food_health_assessment.js:35` (`grade \|\| nova ? 'good'`) | NUT-QUAL-01 : l'inconnu ne passe pas pour conforme | Remplacer le verdict unique par l'évaluation à trois états du §6.3, avec raison par règle |
| D2 | Une liste d'additifs vide est stockée « none » | `food_runtime.js:8` (`[].every(...)` vaut vrai) | inconnu ≠ zéro | Distinguer « liste d'ingrédients absente » et « aucun additif déclaré » (`ingredients_n`, complétude OFF) |
| D3 | Le proxy accepte 30 lectures/min par adresse et 80 au total ; la doc OFF publie aujourd'hui **15 lectures/min et 10 recherches/min par IP**, avec risque de bannissement de l'IP. Pour OFF, tout passe par la seule IP du serveur | `ws_open_food_facts.js:10-11,25` ; doc OFF consultée le 27 oct. | NUT-DATA-02 : quotas et règles d'accès | Caler les fenêtres globales sous le quota publié. Au-delà, passer à l'export quotidien OFF (JSONL/CSV) dans une base locale serveur, comme OFF le recommande |
| D4 | Licence ODbL d'OFF créditée nulle part (ni interface ni `THIRD_PARTY_LICENSES.md`) ; images CC BY-SA affichées (`image_url`) | grep | NUT-DATA-02 : attribution, droits des images | Ajouter le crédit dans `THIRD_PARTY_LICENSES.md` et la mention exigée [Jeezs : où, dans le respect du zen] |
| D5 | Production sans `OPEN_FOOD_FACTS_USER_AGENT` le 23 oct. | `FRAMEWORK_STATE.md:2148-2150` | disponibilité | À vérifier sur atome.one (déploiement, hors de mon autorisation) |
| D6 | Les allergies déclarées ne sont jamais comparées aux `allergens_tags` | aucune occurrence dans `eVe/domains` (étude thalasso l.49) | NUT-QUAL-02 | §6.3 |

## 4. Matrice existant / commun / spécifique / manquant

| Besoin du cahier | Existant vérifié | Commun (à étendre) | Spécifique nutrition | Manquant |
| --- | --- | --- | --- | --- |
| Objectif nutrition, usage sans objectif | but `nutrition`, activités autonomes | progression : compter les consommations | cible par défaut adaptée | lien automatique repas → objectif |
| Repas proposé / accepté / consommé / révisé | `proposed`, `planned`, `nutrition_consume`, versions `activity_revise` | — | — | « accepté » = `planned` (à confirmer [Jeezs]) |
| Composition des aliments | Ciqual embarqué (énergie seule) | générateur Ciqual | macros et constituants clés, valeurs « traces » et « < x » | lien composant → code Ciqual |
| Produits de marque | proxy OFF, scanner, fiche | patron `ws_*.js` | — | traces, ingrédients, complétude, date ; garder allergènes et nutriments sur l'article |
| Recettes | `recipe_source` (texte) | — | portions (`servings`), étapes | source de recettes [Jeezs] |
| Calcul par portion, inconnu ≠ 0 | règle portion inconnue | — | calcul nutritionnel partagé | tout le calcul |
| Politique qualité versionnée, 3 états | verdict unique (D1, D2) | évaluation partagée | règles et sources | politique écrite [Jeezs + Pro] |
| Allergies | `program_preference` (texte libre) | — | allergènes structurés (taxonomie OFF / règlement UE 1169/2011, 14 allergènes) | comparaison produit ↔ personne |
| Génération de menus | — | — | moteur déterministe | tout |
| Liste de courses | complète | — | — | — |
| Calendrier | calendriers, récurrence, alarmes | `activity_bind` vs routines récurrentes | — | — |
| Énergie des activités | estimation MET | — | affichage côte à côte, jamais soustraite | — |
| Diététiciens | annuaire public, Rencontre, partage par propriétés | FEAT-010 transversal | — | source RPPS, fiche professionnelle, vérification |
| Réservation | — | FEAT-012 | — | tout (chantier transversal) |
| Hors ligne | Ciqual local | — | menus calculés en local | produits OFF hors ligne |

## 5. Sources externes (vérifiées le 27 oct. 2026)

| Source | Licence | Accès, quota, coût | Couverture | Verdict |
| --- | --- | --- | --- | --- |
| **Ciqual 2025 (ANSES)** | **Etalab 2.0** (API Dataverse : `license.name = "etalab 2.0"`, publiée le 2025-11-19) | fichiers XML (compo 69 Mo) et XLSX 1,5 Mo, gratuit | 3 484 aliments, 74 constituants, France | **Retenu, socle local** |
| **Open Food Facts** | base ODbL, contenus DbCL, images CC BY-SA (tiers possibles) | lecture sans compte, User-Agent `App/Version (contact)` obligatoire ; 15 lectures et 10 recherches par minute et par IP ; export quotidien conseillé au-delà de quelques centaines de produits ; API v3 recommandée, v2 dépréciée | produits de marque, forte en France | **Retenu (existant), à mettre en conformité D3/D4** |
| USDA FoodData Central | CC0 | clé api.data.gov, 1 000 requêtes/h par IP ; téléchargement complet possible | États-Unis | Option secondaire ; inutile au départ pour des aliments français |
| Edamam Meal Planner | propriétaire | plan Developer gratuit, Enterprise Core **300 $/mois** ; identifiant d'utilisateur final exigé ; cache seulement selon le plan ; attribution obligatoire | recettes anglophones ; contraintes kcal, nutriments, labels (Soy-Free…), pas d'allergène propre | Non retenu au départ |
| Spoonacular | propriétaire | gratuit 50 points/jour (sources secondaires), payant 29 à 149 $/mois | recettes anglophones | Non retenu au départ |
| diet-app (whiteravens20) | **AGPL-3.0** + attribution imposée | « Early development — not production ready », aucune revue de sécurité ; Next.js/NestJS/PostgreSQL | — | Piste d'idées seulement : moteur déterministe (Mifflin-St Jeor, déficit plafonné, réemploi des paquets ouverts, IA dont les chiffres sont recalculés). Aucune reprise de code (AGPL et TypeScript) |
| Wikibooks Cookbook | CC BY-SA | — | anglais, quantités hétérogènes | Option pour recettes, coût de normalisation élevé |
| **Annuaire Santé (ANS, RPPS)** | données publiques en libre accès | extractions et API FHIR, mise à jour quotidienne ou hebdomadaire | les diététiciens y figurent (profession réglementée) | **Source proposée pour vérifier l'identité et la profession** (pas la disponibilité ni le partenariat) |

Sources : [Ciqual 2025](https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi%3A10.57745%2FRDMHWY),
[OFF API](https://openfoodfacts.github.io/openfoodfacts-server/api/), [FDC](https://fdc.nal.usda.gov/api-guide),
[Edamam](https://developer.edamam.com/edamam-docs-meal-planner-api), [plans Edamam](https://apis.io/plans/edamam/edamam-plans-pricing/),
[plans Spoonacular](https://apis.io/plans/spoonacular/spoonacular-plans-pricing/), [diet-app](https://github.com/whiteravens20/diet-app),
[Annuaire Santé](https://esante.gouv.fr/produits-services/annuaire-sante). Les prix des fournisseurs viennent en partie
d'agrégateurs : ils sont à reconfirmer sur l'offre réelle avant toute décision.

## 6. Architecture proposée (aucun second moteur)

### 6.1 Aliments : étendre Ciqual, ne rien ajouter à côté

- `scripts/generate_food_catalogue.mjs` extrait en plus : énergie, protéines, glucides, sucres, lipides, AG saturés,
  fibres et sel, plus d'autres constituants si [Pro] les juge utiles. Il garde le code Ciqual, la version, l'unité, et les
  marques « traces », « < x » et « - » comme des états distincts, jamais 0. Il couvre les 3 484 aliments, plats composés
  inclus, et plus seulement les rayons de courses.
- Poids estimé : 400 à 600 Ko non compressés [Inférence, à mesurer]. On sépare donc le catalogue « courses » actuel de la
  table nutritionnelle, chargée seulement quand on compose un repas.
- Cru et cuit : Ciqual distingue souvent les deux formes (« cru », « cuit »). Le composant choisit la forme, et aucune
  conversion de cuisson n'est inventée. Les facteurs de rendement n'entrent qu'avec une source [Pro].

### 6.2 Repas, recettes et menus : la brique Programme reste la seule

- **Composant** (contrat `program_nutrition_contract.js`) : ajout facultatif de `ref {source: 'ciqual'|'off', code, version}`.
  Sans `ref`, le composant reste un texte : il compte « non calculé », jamais zéro.
- **Recette** = activité `nutrition` en mode `meal` avec `servings` et `steps` en plus. Le repas composé est déjà
  réutilisable et versionné. `recipe_source` reste la provenance, et `reviewed_by` n'apparaît qu'avec une validation
  réelle d'un professionnel (NUT-PRO-02).
- **Menu** = des occurrences des activités repas sur des jours (`program_occurrence`), posées au calendrier par le
  mécanisme des routines. Les états : proposé = `proposed`, accepté = `planned`, consommé = `nutrition_consume`
  (déjà immuable), révisé = nouvelle version d'activité (déjà conservée).
- **Calcul** : une fonction partagée pure (même place que `food_health_assessment.js`) calcule par composant, par
  portion, par repas et par jour. Elle rend `{valeur, inconnus[], sources[]}` : un total avec un inconnu est marqué
  « partiel » et n'est jamais complété.
- **Objectifs** : `dashboard_progression_runtime` compte aussi les consommations liées à un objectif (une fois par
  objectif, par `consumption_id`). L'énergie des séances s'affiche à côté, comme estimation, et n'est jamais soustraite.

### 6.3 Politique de sélection versionnée (NUT-QUAL-01/02)

- Un module partagé remplace le verdict unique : `evaluateFoodSelection(product|food, policy, person)` rend, **par règle**,
  `{rule_id, état: conforme | exclu | à_vérifier, raison, champ lu, source, date de la règle}`. L'état global découle des
  règles obligatoires : un « à_vérifier » ne devient jamais « conforme ».
- La politique est une donnée versionnée (`policy_version`) avec, pour chaque règle, son motif, sa source, son seuil, son
  niveau de preuve et son responsable. La première version reprend les règles actuelles (Nutri-Score, NOVA, risque EFSA),
  déclarées comme telles, sans aucune liste noire inventée [Jeezs + Pro].
- Allergies : `program_preference.allergies` gagne une partie structurée, la liste des 14 allergènes réglementaires (tags
  OFF `en:gluten`, …), en plus du texte libre. Pour un produit OFF, `allergens_tags` est comparé à cette liste, et aussi
  `traces_tags` si la personne le demande. Sans liste d'ingrédients, le produit est « à_vérifier ». Pour un aliment Ciqual
  générique, il n'y a aucune donnée d'allergène : « à_vérifier » sauf règle [Pro] (par exemple « lait » contient le lait).
- Le produit garde sur l'article ses allergènes, traces, nutriments, `last_modified_t` et sa complétude. Quand ils
  changent, les menus concernés sont réévalués et on le signale, sans jamais remplacer silencieusement.

### 6.4 Moteur de menus (NUT-MENU-02/03)

- Déterministe, en JavaScript partagé (client, et serveur si besoin), sans dépendance :
  1. filtre obligatoire du §6.3 ;
  2. candidats : repas et recettes de la personne, puis recettes de la source retenue ;
  3. ajustement des portions vers des cibles saisies par la personne ou un pro, dans des bornes réalistes (pas de 0,2
     portion) ;
  4. diversité (pas deux fois le même repas sur N jours) et réemploi des ingrédients.
- Sortie : la proposition, ses écarts aux cibles, ses inconnus. **En cas d'échec**, les contraintes en conflit sont nommées
  et une piste est proposée, sans jamais en relâcher une silencieusement.
- Cibles : saisies par la personne ou un pro. Un calcul automatique (Mifflin-St Jeor par exemple) n'arrive que si
  [Jeezs + Pro] le veulent ; il est montré comme estimation, avec ses entrées, et ne fait pas de déficit extrême.
- IA : elle peut suggérer un plat ou une substitution, mais toute valeur affichée est recalculée par le moteur, et une
  suggestion non vérifiée reste marquée.
- Comparatif NUT-MENU-03 : six profils (perte, maintien, sportif, végétarien, allergie arachide, données manquantes),
  mesurés sur la conformité, la variété, la transparence, le temps et le coût. Je le joue sur le moteur interne. Pour
  Edamam et Spoonacular, il faut que Jeezs crée les comptes et me confie une clé de test.

### 6.5 Diététiciens (NUT-PRO-01/02) — dépend de FEAT-010 / FEAT-012

- Recherche : nouvelle portée de la recherche complète (pros), alimentée côté serveur par l'extraction RPPS (profession
  diététicien, commune ou département saisi, jamais la position par défaut). On affiche le nom, la profession et le lieu
  d'exercice selon le RPPS. Jamais « vérifié », « partenaire » ni disponibilité sans preuve.
- Collaboration : le pro a un compte atome/eVe. La personne partage, par `share_rights`, seulement les propriétés
  choisies (menus, cibles, pas le poids par défaut), pour une durée donnée, avec révocation. Les commentaires et
  suggestions du pro sont des versions attribuées. Rien n'est appliqué sans action de la personne.
- Réservation : FEAT-012, chantier séparé, non commencé.

### 6.6 Confidentialité [Pro]

- Poids, allergies et habitudes alimentaires sont des données de santé (art. 9 RGPD). L'hébergement HDS est à examiner
  dès qu'un tiers ou un pro y accède (étude thalasso §5).
- Rien ne part vers un fournisseur de menus. Seuls les codes-barres et mots cherchés vont vers OFF, via notre serveur.
- L'assistant n'a aucun accès aux préférences santé par défaut (`health_actor_gate`).

## 7. Plan proposé (Phase D, après validation)

| Lot | Contenu | Dépend de | Maquette ? | Acceptation |
| --- | --- | --- | --- | --- |
| N0 | Corriger D1, D2, D3, D4 ; tests permanents food et verdict | — | non (crédit D4 : à arbitrer) | inconnu jamais « bon » ; quotas sous la doc ; licence créditée |
| N1 | Table Ciqual nutritionnelle (générateur, chargement à la demande, mesure du poids) | — | non | 3 484 aliments, inconnus conservés, poids mesuré |
| N2 | Lien composant → Ciqual / OFF ; calcul par repas et par portion, « partiel » si inconnu | N1 | **oui** : composant avec aliment référencé, totaux du repas | critère 3 du cahier |
| N3 | Politique versionnée, 3 états, allergènes structurés, réévaluation | N0, politique [Jeezs + Pro] | **oui** : raison d'exclusion, « à vérifier » | critère 2 |
| N4 | Recettes (`servings`, `steps`), source de recettes | N2, choix de source | **oui** | recette par portion traçable |
| N5 | Moteur de menus, échec explicite, comparatif six profils | N2, N3, N4 | **oui** : proposition, remplacement, échec | critères 1 et 4 |
| N6 | Objectifs : consommations comptées, lien repas → objectif, cible nutrition | N2 | **oui** si visible | critère 5 |
| N7 | Diététiciens : portée RPPS, partage consenti | FEAT-010 | **oui** | critères 6 et 7 |
| N8 | Réservation | FEAT-012 | **oui** | — |

Chaque lot : sonde ciblée sous `temp/nutrition/`, Web d'abord ; iOS, Android et Tauri sont testés par Jeezs. Mesure du
poids et de la latence avant/après pour N1 et N5.

## 8. Arbitrages ouverts (à poser un par un)

1. **Produits « à vérifier »** — **DÉCIDÉ [Jeezs, 2026-10-28]** : ils sont montrés à part, jamais dans un menu généré.
2. **Politique de départ** — **DÉCIDÉ [Jeezs, 2026-10-28]** : la v1 reprend seulement les règles déjà codées (Nutri-Score E,
   D + NOVA 4, additif à risque EFSA élevé), présentées comme telles, en attendant la liste établie avec des
   professionnels. Les règles « limiter » actuelles (D seul, NOVA 4 seul, additif à risque modéré) n'excluent rien : elles
   restent une information de la fiche [Inférence de la décision].
3. **Source de recettes** — **DÉCIDÉ [Jeezs, 2026-10-28]** : recettes propres et recettes ajoutées par les utilisateurs,
   aucune source importée au départ.
4. **« Accepté »** — **DÉCIDÉ [Jeezs, 2026-10-28]** : accepté = `planned`, l'état existant qui alimente déjà la liste de courses.
5. **Cibles** — **DÉCIDÉ [Jeezs, 2026-10-28]** : cibles saisies, plus un calcul automatique proposé comme estimation
   (méthode, entrées et limites montrées, correction possible, aucun déficit extrême). Entrées lues dans le profil
   existant (`bio.birth`, `bio.weight`, `bio.height`, comme `objective_preparation.js:37-57` et `training_energy.js`),
   demandées seulement si la personne choisit l'estimation. Méthode et plafond de déficit : [Pro].
6. **Crédit ODbL / Ciqual** — **DÉCIDÉ [Jeezs, 2026-10-28]** : crédit dans `THIRD_PARTY_LICENSES.md` et une page
   « À propos / Sources », rien sur la fiche produit. [Fait] aucune page À propos ou Sources n'existe dans l'app (grep i18n
   du 28 oct.) : c'est un écran nouveau, donc maquette et emplacement à valider avant code (règle 16). Le crédit de
   `THIRD_PARTY_LICENSES.md` reste dans N0.
7. **Diététiciens** — **DÉCIDÉ [Jeezs, 2026-10-28]** : d'abord une simple recherche de diététiciens (Annuaire Santé RPPS)
   dans une zone saisie ; la collaboration et le partage viennent ensuite. Cette recherche est construite comme la
   recherche transversale de professionnels (FEAT-010), réutilisable pour les coachs, jamais propre à Nutrition.
   Région de départ : **Auvergne** [Jeezs, 2026-10-28] (Allier 03, Cantal 15, Haute-Loire 43, Puy-de-Dôme 63, au sein
   d'Auvergne-Rhône-Alpes). **Zone par défaut [Jeezs, 2026-10-28]** : la zone détectée depuis la position de
   l'appareil ; si elle n'est pas disponible (refus, échec, hôte sans position), Auvergne. La personne peut toujours
   saisir une autre zone. Brique réutilisée : `gps.locate` (`atome/src/squirrel/gps/contracts.js` : « on an explicit user
   action. Does not retain or share fixes »), appelée à l'ouverture de la recherche (geste explicite, autorisation de
   l'OS). Seule une zone grossière part au serveur (cellule d'environ 11 km de `publicEventCellsAround`,
   `atome/src/shared/public_event_contract.js:80-96`), jamais la position exacte [Inférence, à confirmer au plan N7].
   Écart à noter : Rencontre (`meeting_contract.js`) refuse la position de l'appareil ; ce choix ne vaut que pour la
   recherche de professionnels.
8. **Edamam / Spoonacular** — **DÉCIDÉ [Jeezs, 2026-10-28]** : on reste sur le moteur interne ; Edamam et Spoonacular
   restent documentés comme options (§5), sans compte de test. Le comparatif NUT-MENU-03 se joue sur le moteur interne
   seul, avec les six profils.

**Tous les arbitrages sont rendus (2026-10-28).** Reste : validation du plan d'ensemble (§7), puis maquettes une par une.

## 9. Maquettes

Aucune maquette n'est encore produite. Elles se font **une par une**, en PNG aux vrais jetons (verre `rgba(4,9,26,.69)`,
sélection `rgba(29,51,124,.8)`, rayon 15, outil 60, libellés de 6 lettres maximum), à partir de captures des écrans
Nutrition validés le 14 oct. Chacune attend son « validé » avant le code de son écran. Ordre proposé :

| # | Écran | Lot |
| --- | --- | --- |
| M1 | Repas composé : aliment relié à Ciqual / produit, totaux du repas, « partiel » si inconnu | N2 |
| M2 | Raison d'une exclusion et produits « à vérifier » montrés à part (arbitrage 1) | N3 |
| M3 | Page À propos / Sources et son emplacement (arbitrage 6) | N0 |
| M4 | Recette : portions et étapes | N4 |
| M5 | Cibles : saisie et estimation (méthode, entrées, limites ; arbitrage 5) | N5 |
| M6 | Menu proposé sur des jours : remplacer, régénérer, échec explicite | N5 |
| M7 | Repas consommé qui fait progresser l'objectif | N6 |
| M8 | Recherche de diététiciens : zone détectée, sinon Auvergne (arbitrage 7) | N7 |

## 10. Suivi

| ID | État |
| --- | --- |
| N0 | **testé Web (2026-10-28)** : D1 (aussi : un produit sans Nutri-Score n'est plus « bon »), D2, D3 (14 lectures/min au total, 10 par adresse), D4 (`THIRD_PARTY_LICENSES.md`) ; D5 non vérifié (production) ; page À propos = M3 |
| N1 | **testé (2026-10-28)** : `ciqual_2025_composition.json`, 3 484 aliments × 8 nutriments, 490 Ko / 134 Ko gzip, 27 872 valeurs recoupées avec le XML, 0 écart |
| M1 | maquettes `temp/nutrition/mockups/M1_A_composition.png`, `M1_B_food_search.png` → **validées (2026-10-28)** |
| M1-C | Scan (décision de l'utilisateur : la caméra prend la place du contenu du panneau, la bande reste) : `temp/nutrition/mockups/M1_C1_scan.png`, `M1_C2_product.png` → **validées (2026-10-28)** |
| M2 | fiche produit de Courses, moteur réel (`temp/nutrition/m2_capture.probe.mjs`) : `temp/nutrition/mockups/M2_A_excluded.png` (« Exclu » + raison), `M2_B_to_check.png` (« À vérifier » + ce qui manque) ; état actuel `M2_0_today_*.png` → **validées (2026-10-28)** |
| M2-C | allergènes déclarés (D6), panneau Programme › question Allergies, moteur réel (`temp/nutrition/m2c_allergens.probe.mjs`) : `temp/nutrition/mockups/M2C_A_chips.png` (puces, la brique des questions), `M2C_B_rows.png` (cases) ; état actuel `M2C_0_today.png`. Jugées trop austères (28 oct.) → v2 « plus sexy », même contenu, chaque allergène en pastille pastel des tuiles d'accueil (14 pictogrammes `temp/nutrition/allergen_glyphs.mjs`) : `M2C_C_tiles.png` + `M2C_C_scrolled.png` (tuiles 120×90, nom en haut, pastille dessous, choisie = aspect sélectionné + ✓), `M2C_D_disc_chips.png` (puces menées par leur pastille) → **C validée (28 oct.) et codée** : catalogue `food_allergen_contract.js`, brique `bevy_panel_disc_tiles.js`, préférence `allergens`/`traces`, `allergens_read`, politique v2 règle `allergen_declared` ; sonde réelle 13/13 |
| N3 | **testé Web (2026-10-28)** : politique v1 provisoire, `evaluateFoodSelection` par règle, `selection` sur chaque produit OFF, alternatives « à vérifier » à part, fiche Exclu / À vérifier ; tests 32/32, sonde réelle 12/13 (l'échec vient de l'aide d'accueil partagée) ; plusieurs raisons [Jeezs, 2026-10-28] : la première sur la case + « règle provisoire », à la taille fixe, toutes dans le libellé parlé et le MCP. Reste : allergènes structurés (D6, maquette de l'écran de préférences à faire), réévaluation des menus (N5) |
| Scan | **testé Web (2026-10-28)** : `food.identify`, lien `ref` produit (OFF) avec ses valeurs pour 100 g, caméra à la place du panneau sur le fond `cameraGround`, Retour seul ; tests 21/21, sonde réelle 23/23 (3 passes sur 4, la 4ᵉ sans trace : probablement la lecture OFF en ligne), sans code-barres 8/8. iOS, Android, Tauri non vérifiés |
| N2 | **testé Web (2026-10-28)** : `ref` Ciqual sur le composant, `computeMealNutrition`, recherche Ciqual sous le champ, kcal par ligne, « Total partiel · n aliments sur N » ; tests 18/18, sonde réelle 27/27. Scan fait (ligne Scan) |
| NUT-DATA-01 | N1 et N2 faits (lien composant → Ciqual, totaux du repas) ; produit scanné (OFF) lié par l'outil Scan |
| NUT-DATA-02 | N0 fait ; D5 et D6 restent (D6 = N3) |
| NUT-DATA-03 | décidé (arbitrage 3) → à concevoir (N4, M4) |
| NUT-QUAL-01/02 | N3 fait sur la fiche produit (M2) ; allergènes (D6) et liste finale [Jeezs + Pro] restent |
| NUT-MENU-01/02 | décidé (arbitrages 4, 5) → à concevoir (N5, M5, M6) |
| NUT-MENU-03 | décidé (arbitrage 8) : moteur interne seul, six profils |
| NUT-PRO-01 | décidé (arbitrage 7) : recherche RPPS, zone détectée sinon Auvergne → N7, M8 |
| NUT-PRO-02 | après NUT-PRO-01 |
| Plan d'ensemble §7 | **à valider** |
| §8 Confidentialité | cartographie faite (§6.6) ; [Pro] |
