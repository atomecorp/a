# Objectif.md — Maître de réalisation progressive pour atome/eVe

**Version : 12 octobre 2026 · Destination prévue : `/atome/objectives` dans la bibliothèque.**

Ce dossier transforme le cahier complet en **80 prompts de travail**, avec **13 scénarios santé/bien-être/Esthétique**, **89 briques de spécification** et un moteur extensible aux objectifs généraux. Il conserve les textes antérieurs et ajoute la mise en relation optionnelle par objectif et le carnet de santé transversal.

**Statut réel : documentation préparée ; application non modifiée. Aucun panneau, test applicatif, accord visuel ou agrément n’est réputé validé par cette livraison.**

## 1. Commencer ici

Donner ce fichier à Codex avec le dossier complet. Codex commence par **P001 — audit de l’existant**, puis s’arrête sur les références et le périmètre avant tout développement. Il ne doit pas ingérer tout l’ancien cahier comme une instruction à tout implémenter d’un coup.

### Prompt maître à copier dans Codex

> Travaille sur le dossier `objectives` d’atome/eVe. Lis `Objectif.md`, `pilotage/Regles_validation.md`, `pilotage/Plan_execution.md`, `pilotage/Suivi_taches.md` et les décisions `specifications/sections/52.md` à `55.md`. Respecte les consignes du dépôt réellement ouvert.
>
> Commence uniquement P001. Pour toute tâche ultérieure, vérifie ses dépendances et attends mon autorisation explicite de démarrage. Lis ensuite seulement son prompt et les passages source référencés ; consulte le cahier consolidé quand un point de contexte l’exige.
>
> Avant du code ou une maquette, identifie les vraies références visuelles, composants, outils et connexions disponibles. Décris brièvement l’assemblage concret : outils affichés, sélection, emplacement des options natives, données lues/écrites. N’invente aucune API ni interface parallèle. JavaScript et architecture réelle d’eVe ; pas de TypeScript sans demande.
>
> Procède écran par écran : proposition isolée et fonctionnelle avec les vrais composants → tes tests techniques → affichage interactif et capture de la version → ARRÊT pour ma validation visuelle. Ne commence pas l’écran suivant pendant cette attente. Après mon accord, intègre seulement cette version, teste techniquement et vérifie la conformité visuelle intégrée. Toute différence visible requiert un nouvel accord.
>
> À la fin de la tâche entière, après tes tests intégrés, laisse-moi effectuer la recette fonctionnelle. Ne déduis jamais ma validation de mon silence, d’un test réussi, d’un avis IA ou de l’accord sur le concept. Consigne uniquement les validations réellement exprimées et leurs versions.
>
> Si la tâche est trop grande, propose des sous-prompts atomiques suivant `validation/Gabarit_sous_tache.md`, avec un arrêt par écran, puis attends mon accord sur le découpage avant de les exécuter. N’élargis pas le périmètre et ne retire aucune exigence du cahier.
>
> Après une tâche acceptée, mets à jour les preuves et le suivi, propose une seule tâche suivante admissible et arrête-toi. Aucun déploiement, envoi, achat, partage de données ou raccordement externe implicite. Les conseils médicaux et le statut officiel du carnet ont leurs gates de revue distincts : les tests de code ne les certifient pas.

### Reprendre une tâche déjà commencée

> Reprends uniquement Pxxx au dernier jalon explicitement autorisé dans le suivi. Vérifie build, preuves, dernière validation de Jeezs et différences de code. Ne suppose aucune approbation absente. Arrête-toi au prochain écran non validé ; ne repars pas sur une réécriture générale.

## 2. Fichiers qui font autorité

- [Cahier consolidé complet](objectives.md) : source antérieure normalisée typographiquement et ajouts 52–55.
- [Contrat des validations successives](pilotage/Regles_validation.md), [ordre/dépendances](pilotage/Plan_execution.md) et [suivi initialement non commencé](pilotage/Suivi_taches.md).
- [Catalogue des 89 briques](pilotage/Catalogue_briques.md), [correspondance des objectifs](pilotage/Matrice_objectifs_briques.md) et [traçabilité complète des passages source](pilotage/Correspondance_sources.md).
- [Politique des valeurs](pilotage/Politique_des_valeurs.md), [sources/revues](pilotage/Sources_et_revue.md), [inventaire réel à remplir](pilotage/Inventaire_composants_a_remplir.md).
- [Archive exacte et provenance](sources/PROVENANCE.md), [gabarit de preuves](validation/Gabarit_preuves.md), [recette de fin](validation/Plan_recette_finale.md).

**Priorité en cas de conflit :** consignes de sécurité et contraintes réelles → décisions utilisateur 52–55 et ce maître → spécification ciblée actuelle → passages hérités. Les sections anciennes gardent leur intérêt historique mais n’autorisent jamais à sauter un arrêt visuel. Ne pas effacer un conflit non résolu : le remonter avec les deux références et une question ciblée.

## 3. Concept à conserver

L’interface utilise la **matrice d’atome, physiquement constituée de carrés**. Choisir un carré mène à une matrice plus profonde ; un carré portant un réglage s’étend temporairement sur deux ou trois cellules, expose le vrai contrôle natif, mémorise puis se referme. Projets, nouveaux projets, objectifs et Activités partagent ce langage. Pas de fenêtres flottantes, formulaires, cartes ou panneaux de logiciel de gestion plaqués sur le concept.

Une brique est une fonction réutilisable, pas une icône simulant un outil. Une activité a la même identité dans un programme et dans Activités. Le calendrier gère les occurrences ; les outils exécutent ; Résultats conserve les observations/originaux ; le Moniteur présente les tendances ; le carnet organise le suivi de santé autorisé. **Un lien vers plusieurs objectifs ne crée pas plusieurs réalisations.**

Effort décrit l’engagement accepté. Temps décrit un budget unique jour/semaine. Capacités, contraintes et intensité sportive restent distinctes, révélées selon besoin, sans troisième slider obligatoire inventé. L’utilisateur valide ou refuse chaque brique ; le programme ne se remplit pas en silence.

Les trois ajouts à ne pas oublier : **Esthétique — visage/corps/peau** ; **mise en relation facultative au début de chaque objectif** ; **carnet de santé transversal**, avec qualification explicite de toute prétention à un statut officiel.

## 4. Gates de réalisation

**Proposition isolée → test Codex → écran montré → accord visuel Jeezs → intégration de cette version → tests intégrés Codex → recette finale Jeezs → tâche suivante seulement sur autorisation.**

Chaque panneau, nouvelle proposition visible, état inédit ou étape a son arrêt. Lorsqu’un prompt cite plusieurs écrans dans un jalon, les scinder en sous-jalons successifs. Une capture seule n’est pas un outil fonctionnel. Pour un travail de données sans nouvelle UI, montrer le comportement dans les outils existants plutôt que fabriquer un panneau technique.

Le registre de tâches et le manifeste sont des fichiers documentaires de ce dossier, pas une nouvelle interface à installer dans atome. Aucun compteur, panneau de pilotage ou workflow de gestion interne ne doit être ajouté à l’application pour reproduire ces tableaux.

## 5. Portée du découpage

Les **treize scénarios actuels** ont chacun leur prompt complet et leur fiche. Les pratiques sportives sont réparties par familles avec paramètres, machines extensibles, mouvements/positions et suivi réel. Une famille contenant plusieurs nouveaux écrans exige des sous-jalons ou sous-prompts validés, jamais une intégration massive.

Le document initial dépasse la santé : le **catalogue hors santé est intégralement conservé**. Album, film, entreprise, randonnée, marathon et objectif libre ont des prompts dédiés. P074 gère la déclinaison contrôlée des autres entrées ; il ne prétend pas qu’un catalogue de possibilités équivaut à autant de scénarios déjà implémentés.

P030 traite la qualification du carnet officiel et les interfaces externes ; le carnet local/export peut fonctionner sans connexion nationale, avec un statut honnête. P078 isole la revue des conseils médicaux et obligations applicables. Un dossier de fichiers, un test réussi ou une case ne constituent pas un agrément ni une validation médicale.

## 6. Plan complet des prompts

L’ordre de démarrage recommandé est dans [Plan_execution.md](pilotage/Plan_execution.md). Le premier pilote est Sommeil ; le second met en jeu musculation, machine personnelle et séries interactives. La liste suivante est classée par module pour retrouver rapidement les tâches.

### Socle commun et interface

| Prompt | Tâche |
| --- | --- |
| P001 | [Inventorier les références et les composants réels](prompts/01_socle/P001_audit_existant.md) |
| P002 | [Raccorder les objets, les identifiants et l’historique](prompts/01_socle/P002_contrats_et_migrations.md) |
| P003 | [Matrice commune de carrés et navigation profonde](prompts/01_socle/P003_matrice_navigation.md) |
| P004 | [Carré extensible et réglage natif intégré](prompts/01_socle/P004_carre_reglage.md) |
| P005 | [Présenter les treize objectifs et l’objectif libre](prompts/01_socle/P005_entree_objectifs.md) |
| P006 | [Curseur Effort : cinq niveaux d’engagement](prompts/01_socle/P006_effort.md) |
| P007 | [Curseur Temps et budget jour/semaine](prompts/01_socle/P007_temps.md) |
| P008 | [Collecte minimale, préférences et autorisations](prompts/01_socle/P008_collecte_progressive.md) |
| P009 | [Panneau Activités : bibliothèque commune de briques](prompts/01_socle/P009_activites.md) |
| P010 | [Composer et valider les briques une par une](prompts/01_socle/P010_composition.md) |
| P011 | [Prévisualiser le programme, sa charge et les conflits](prompts/01_socle/P011_apercu_programme.md) |
| P012 | [Projet Dashboard : activités du jour et suivi](prompts/01_socle/P012_dashboard_projet.md) |
| P013 | [Calendrier commun et occurrences planifiées](prompts/01_socle/P013_calendrier.md) |
| P014 | [Alarmes et ouverture du bon contexte](prompts/01_socle/P014_alarmes.md) |
| P015 | [Moteur commun d’exécution des activités](prompts/01_socle/P015_execution.md) |
| P016 | [Capteurs disponibles, permissions et suivi manuel](prompts/01_socle/P016_capteurs.md) |

### Résultats, Moniteur et adaptation

| Prompt | Tâche |
| --- | --- |
| P017 | [Stockage commun des observations et originaux](prompts/02_resultats/P017_stockage_observations.md) |
| P018 | [Importer un résultat et vérifier l’extraction](prompts/02_resultats/P018_import_resultats.md) |
| P019 | [Évolutions comparables et export CSV](prompts/02_resultats/P019_evolutions_csv.md) |
| P020 | [Moniteur commun : bilan et provenance](prompts/02_resultats/P020_moniteur.md) |
| P021 | [Adapter, suspendre et reprendre un programme](prompts/02_resultats/P021_adaptation.md) |

### Réseau optionnel par objectif

| Prompt | Tâche |
| --- | --- |
| P022 | [Proposer la mise en relation au début de chaque objectif](prompts/03_reseau/P022_option_initiale.md) |
| P023 | [Trouver et demander un contact partageant l’objectif](prompts/03_reseau/P023_mise_en_relation.md) |
| P024 | [Échanger et organiser une activité commune](prompts/03_reseau/P024_echanges_activites.md) |
| P025 | [Blocage, signalement, départ et confidentialité sociale](prompts/03_reseau/P025_confidentialite_moderation.md) |

### Carnet de santé transversal

| Prompt | Tâche |
| --- | --- |
| P026 | [Créer le carnet de santé transversal](prompts/04_carnet_sante/P026_carnet_transversal.md) |
| P027 | [Structurer les rubriques du carnet](prompts/04_carnet_sante/P027_rubriques_medicales.md) |
| P028 | [Consultations, examens, ordonnances et suivis](prompts/04_carnet_sante/P028_parcours_soins.md) |
| P029 | [Exporter et partager une sélection du carnet](prompts/04_carnet_sante/P029_export_partage_carnet.md) |
| P030 | [Qualifier le statut officiel et les raccordements santé](prompts/04_carnet_sante/P030_statut_officiel.md) |

### Briques santé, nutrition, sommeil et Esthétique

| Prompt | Tâche |
| --- | --- |
| P031 | [Nutrition : habitudes, repas et préparation](prompts/05_briques_sante/P031_nutrition_repas.md) |
| P032 | [Repères nutritionnels et cibles documentées](prompts/05_briques_sante/P032_nutrition_reperes.md) |
| P033 | [Compléments : catalogue, saisie, dose et prises](prompts/05_briques_sante/P033_complements.md) |
| P034 | [Briques Sommeil refaites et orientation appropriée](prompts/05_briques_sante/P034_sommeil.md) |
| P035 | [Calme, émotions et soutien en santé mentale](prompts/05_briques_sante/P035_calme_sante_mentale.md) |
| P036 | [Temps pour soi, loisirs et journal privé](prompts/05_briques_sante/P036_vie_journal.md) |
| P037 | [Douleur, symptômes et orientation vers les soins](prompts/05_briques_sante/P037_douleur_orientation.md) |
| P038 | [Prévention, capacités et vieillissement en bonne santé](prompts/05_briques_sante/P038_prevention_vieillissement.md) |
| P039 | [Briques Esthétique : visage, corps, peau et soins](prompts/05_briques_sante/P039_esthetique.md) |

### Sports, mouvements, appareils et pictogrammes

| Prompt | Tâche |
| --- | --- |
| P040 | [Catalogue sportif et contrats de discipline extensibles](prompts/06_sport/P040_catalogue_sports.md) |
| P041 | [Groupes musculaires, mouvements, positions et variantes](prompts/06_sport/P041_mouvements.md) |
| P042 | [Ajouter et modifier une machine personnelle](prompts/06_sport/P042_machines.md) |
| P043 | [Configurer une séance de musculation détaillée](prompts/06_sport/P043_seance_musculation.md) |
| P044 | [Exécuter et enregistrer les séries au toucher](prompts/06_sport/P044_series_interactives.md) |
| P045 | [Natation : bassin, nages, longueurs et intervalles](prompts/06_sport/P045_natation.md) |
| P046 | [Course, marche et tapis : distance, temps et allure](prompts/06_sport/P046_course_marche.md) |
| P047 | [Rameur intérieur et aviron : cadence et allure](prompts/06_sport/P047_rameur.md) |
| P048 | [Vélo extérieur, VTT et vélo d’intérieur](prompts/06_sport/P048_cyclisme.md) |
| P049 | [Cardio intérieur, fitness et circuits](prompts/06_sport/P049_cardio_circuits.md) |
| P050 | [Mobilité, postures, yoga, Pilates et équilibre](prompts/06_sport/P050_mobilite_postures.md) |
| P051 | [Sports de plein air et environnements](prompts/06_sport/P051_plein_air.md) |
| P052 | [Danse, raquettes, collectifs et combat](prompts/06_sport/P052_sports_standard.md) |
| P053 | [Sport adapté et activité non cataloguée](prompts/06_sport/P053_adaptation_sport_libre.md) |
| P054 | [Pictogrammes : produire seulement les références manquantes](prompts/06_sport/P054_pictogrammes.md) |

### Treize scénarios d’objectifs

| Prompt | Tâche |
| --- | --- |
| P055 | [OBJ-01 — Perdre du poids](prompts/07_scenarios/P055_obj-01_perdre_poids.md) |
| P056 | [OBJ-02 — Mieux dormir et retrouver de l’énergie](prompts/07_scenarios/P056_obj-02_mieux_dormir.md) |
| P057 | [OBJ-03 — Prendre de la masse musculaire](prompts/07_scenarios/P057_obj-03_masse_musculaire.md) |
| P058 | [OBJ-04 — Gérer une douleur](prompts/07_scenarios/P058_obj-04_gerer_douleur.md) |
| P059 | [OBJ-05 — Repérer un trouble et être orienté](prompts/07_scenarios/P059_obj-05_reperer_trouble.md) |
| P060 | [OBJ-06 — Préserver du temps pour soi](prompts/07_scenarios/P060_obj-06_temps_pour_soi.md) |
| P061 | [OBJ-07 — Retrouver le calme intérieur](prompts/07_scenarios/P061_obj-07_calme_interieur.md) |
| P062 | [OBJ-08 — Tenir un journal personnel](prompts/07_scenarios/P062_obj-08_journal_personnel.md) |
| P063 | [OBJ-09 — Améliorer sa condition physique](prompts/07_scenarios/P063_obj-09_condition_physique.md) |
| P064 | [OBJ-10 — Rajeunissement / vieillir en bonne santé](prompts/07_scenarios/P064_obj-10_vieillir_sante.md) |
| P065 | [OBJ-11 — Améliorer son bien-être](prompts/07_scenarios/P065_obj-11_bien_etre.md) |
| P066 | [OBJ-12 — Prendre soin de sa santé mentale](prompts/07_scenarios/P066_obj-12_sante_mentale.md) |
| P067 | [OBJ-13 — Esthétique — visage, corps et peau](prompts/07_scenarios/P067_obj-13_esthetique.md) |

### Moteur libre et catalogue général historique

| Prompt | Tâche |
| --- | --- |
| P068 | [Objectif libre, sous-objectifs et parcours composables](prompts/08_extension_generale/P068_objectif_libre.md) |
| P069 | [Scénario historique : créer un album](prompts/08_extension_generale/P069_scenario_album.md) |
| P070 | [Scénario historique : réaliser un film](prompts/08_extension_generale/P070_scenario_film.md) |
| P071 | [Scénario historique : entreprise, équipe et financement](prompts/08_extension_generale/P071_entreprise_financement.md) |
| P072 | [Scénario historique : organiser une randonnée](prompts/08_extension_generale/P072_scenario_randonnee.md) |
| P073 | [Scénario historique : objectif marathon](prompts/08_extension_generale/P073_scenario_marathon.md) |
| P074 | [Préserver le catalogue historique et créer les prochaines tâches](prompts/08_extension_generale/P074_catalogue_et_decoupage.md) |

### Recette, sécurité, revue et livraison

| Prompt | Tâche |
| --- | --- |
| P075 | [Accessibilité, tailles d’écran et modes d’usage](prompts/09_validation/P075_accessibilite_modes.md) |
| P076 | [Persistance, synchronisation, permissions et récupération](prompts/09_validation/P076_persistance_securite.md) |
| P077 | [Tests de bout en bout : treize objectifs, activités et carnet](prompts/09_validation/P077_parcours_integres.md) |
| P078 | [Revue clinique, juridique et éditoriale avant activation](prompts/09_validation/P078_revue_contenus.md) |
| P079 | [Recette fonctionnelle finale par Jeezs](prompts/09_validation/P079_recette_utilisateur.md) |
| P080 | [Clôturer le lot et préparer la suite sans l’exécuter](prompts/09_validation/P080_livraison_progressive.md) |

## 7. Livrable demandé à Codex en fin de chaque tâche

Version intégrée et accès à sa démonstration ; captures avant/proposition/après ; tests effectués et résultats exacts ; validations visuelles de Jeezs réellement recueillies ; migrations/rollback si concernés ; limites ou blocages ; résultat de la recette finale ; traçabilité des exigences ; proposition de prochaine tâche **non démarrée**.

Ne pas remplacer ces éléments par « c’est fait » ou un simple diff. Ne jamais affirmer que l’utilisateur a approuvé une interface en son absence.
