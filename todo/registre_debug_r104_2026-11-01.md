> Copie de travail du registre fourni (`03_REGISTRE_COMPLET_BUGS_ET_EVOLUTIONS.md`, mission R-104 du 2026-11-01), toutes
> entrées conservées ; chaque entrée reçoit un bloc « Résultat 2026-11-01 ». SHA : eVe main fb5aa1f0, atome main 668f7ead7
> (et suivants, voir le rapport `todo/rapport_fusion_r104_main_2026-11-01.md`).

# Débugger régression — atome

Registre des **anomalies** (BUG), **régressions confirmées** (REG) et **évolutions fonctionnelles / études** (TÂCHE) d'atome/eVe. Une nouvelle fonctionnalité ne doit pas être présentée comme un bug. Conserver toutes les entrées existantes et les identifier séparément.

## REG-001 — Numéro de série absent des réglages avancés

- **Statut :** À investiguer et corriger
- **Type :** Régression
- **Zone :** Réglages → Réglages avancés
- **Constat :** Le numéro de série d’atome n’apparaît plus dans les réglages avancés, alors qu’il était auparavant affiché.
- **Comportement attendu :** Le numéro de série d’atome doit être visible dans les réglages avancés.
- **Cause :** Inconnue ; ne pas présumer que la fonctionnalité a été supprimée.

### Enquête à mener

1. **Retrouver l'emplacement d'origine :** examiner les anciennes versions du code et l'historique Git pour identifier le composant et la logique qui affichaient le numéro de série.
2. **Comprendre sa disparition :** comparer avec l'implémentation actuelle afin d'identifier le changement précis responsable (suppression, déplacement, condition d'affichage, réorganisation des réglages, rupture de liaison aux données, etc.).
3. **Chercher un éventuel déplacement :** vérifier si le numéro de série apparaît désormais ailleurs dans l'application, notamment dans d'autres rubriques de réglages.
4. **Éviter les doublons :** avant de rétablir son affichage, vérifier qu'aucun autre emplacement ne présente déjà le même numéro de série ; si un déplacement intentionnel est avéré, le documenter et valider l'emplacement attendu.
5. **Vérifier que la donnée n'est pas perdue :** contrôler la source du numéro de série et s'assurer que sa valeur demeure accessible, sans en générer un nouveau ni écraser la valeur existante.
6. **Corriger à la source :** restaurer l'affichage dans Réglages → Réglages avancés, en réutilisant les composants et la logique existants, sans créer de fonctionnalité parallèle.

### Tests de non-régression

- Le numéro de série est visible dans Réglages → Réglages avancés.
- Il correspond à la valeur enregistrée pour l'installation / l'appareil concerné.
- Il n'est ni dupliqué dans l'interface ni remplacé par une nouvelle valeur.
- Il reste visible après fermeture et relancement de l'application.
- Les autres réglages avancés continuent de fonctionner normalement.

**À renseigner après investigation :** ancien emplacement dans le code, commit ayant introduit la régression, cause exacte, correction apportée et résultats des tests.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** NON REPRODUIT comme régression — **décision utilisateur nécessaire** (quelle valeur est « le numéro de série »).
- **Cause :** aucun numéro de série n'a jamais été affiché : `git log -S/-G` (serial, numéro de série, installation_id, device id, machine_id…) sur atome et eVe `--all` sans résultat d'affichage. « Avancé » = `eVe/intuition/runtime/bevy_panel/bevy_panel_advanced_runtime.js` (créé 601e3c38, 25 oct.), 5 commits, jamais d'identifiant. Le seul concept voisin, `AdoleAPI.machine` / `__currentMachine.id` (9a2e0c76c, déc. 2025), a été retiré (77ab0a592) et n'était pas affiché. Les versions atome/eVe/serveur sont dans À propos (`bevy_panel_about_runtime.js:32-36`) ; le nom de l'appareil dans Mon matériel.
- **Correction :** aucune (ne pas générer de nouveau numéro). Question posée : s'agit-il de la version/build (déjà dans À propos), du nom d'appareil, ou d'un nouvel identifiant à créer ?

## BUG-001 — Scanner de produits non fonctionnel

- **Statut :** À investiguer et corriger
- **Type :** Bug (non qualifié comme régression à ce stade)
- **Zone :** Produits → Scanner de produits
- **Constat :** Le scanner de produits ne fonctionne pas.
- **Comportement attendu :** Le scanner doit permettre de lire un produit et de lancer le parcours prévu dans atome.
- **Cause :** Inconnue ; déterminer si la panne concerne l'accès à la caméra, la lecture, le traitement ou la récupération de la fiche produit, sans présumer de la cause.

### Enquête et validation

1. Reproduire la panne, relever l'appareil, la plateforme, les autorisations et l'étape exacte de l'échec.
2. Vérifier l'outil de scan existant, son intégration et ses dépendances ; contrôler les erreurs visibles et les journaux pertinents.
3. Corriger le problème dans l'outil existant, sans créer de scanner parallèle.
4. Retester la lecture et l'accès à la fiche produit sur les plateformes prises en charge, ainsi que les cas d'erreur.

**À renseigner :** scénario de reproduction, cause, correction et résultats des tests.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** CORRIGÉ (défaut caméra) ; lecture native iOS non vérifiée sur appareil.
- **Reproduction Web :** le scan marche de bout en bout sur Chromium (`BarcodeDetector`, `food.lookup` 3017620422003 → Nutella, fiche en 2,5 s). Défaut reproduit : après tout usage de la caméra frontale (appel, selfie), Scan ouvrait la caméra **frontale** → sur téléphone, aucun code-barres lisible (« Aucun code-barres lu » au bout de 30 s).
- **Cause :** `capture_photo_session_runtime.js:35-36` prend « la caméra choisie en dernier » (eVe fd2e7981, 29 oct.) ; `dashboard_mystic_capture.js` démarrait le scan sans nommer de caméra.
- **Correction :** eVe 83556da1 — `cameraPosition: 'back'` pour `kind === 'scan'` (couvre aussi Prod. › Photo).
- **Preuves :** `temp/r104merge/agents/products_scan/camera_side.probe.mjs` E1 rouge avant, vert après (`sides: ["back"]`) ; `scan.probe.mjs` 7/7. Sans `BarcodeDetector` (Safari, Firefox, WKWebView, WebView2) : message explicite « Lecture de code-barres indisponible sur cet appareil » (manque de couverture, pas une régression).

## REG-002 — Ajout de produit par photo disparu

- **Statut :** À investiguer et corriger
- **Type :** Régression (fonctionnalité présente auparavant)
- **Zone :** Produits → Ajouter un produit
- **Constat :** Il n'est plus possible d'ajouter un produit à partir d'une photo ; cette possibilité, auparavant disponible, a disparu de l'interface ou du parcours.
- **Comportement attendu :** Retrouver l'ajout d'un produit par photo dans le parcours existant, avec ses fonctions et réglages habituels.
- **Cause :** Inconnue ; vérifier d'abord si l'outil a été déplacé, masqué, désactivé ou supprimé.

### Enquête et validation

1. Retrouver l'ancien emplacement et le fonctionnement exact de l'ajout par photo dans l'historique Git, les composants et les références visuelles existantes.
2. Vérifier si l'action se trouve désormais ailleurs, ou si elle est présente en double, avant toute restauration.
3. Identifier le changement à l'origine de la disparition : interface, conditions d'affichage, liaison aux outils, permissions ou logique du parcours.
4. Réutiliser la fonctionnalité et ses composants d'origine ; ne pas inventer une interface ou un traitement parallèle.
5. Retester l'ajout effectif d'un produit à partir d'une photo, puis la présence d'un seul point d'accès cohérent avec l'organisation actuelle.

**À renseigner :** ancien emplacement, éventuel nouvel emplacement, commit responsable, cause exacte, correction et tests de non-régression.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** NON REPRODUIT sur main — la fonction existe ; **emplacement à valider**.
- **Historique :** créée en outil de bande « Ajout » (fd2e7981, 29 oct.), déplacée en case « Photo » à la racine de Prod. (402f9924, 30 oct., Q29/BUG-043). Sonde : case `tile_photo` présente après les 6 catégories, un toucher lit le code-barres et propose Nutella (« Ajouter quand même ? »).
- **Cause probable du signalement :** la case n'existe qu'à la racine de Prod. (`dashboard_shopping_views.js:92`), absente dans une catégorie/un rayon et pendant une recherche ; elle héritait aussi du défaut caméra frontale (corrigé BUG-001). Le webroot Android (24 oct.) est ancien et ne l'a pas.
- **Correction :** caméra (BUG-001). Étendre la case aux catégories = nouvel emplacement → maquette/validation (règle 16), inscrit au registre des demandes.
- **Preuve :** `temp/r104merge/agents/products_scan/scan.probe.mjs` D1/D2.

## BUG-002 — Menu contextuel absent au clic long sur les objets (portée à auditer)

- **Statut :** À investiguer et corriger
- **Type :** Bug d’interaction / incohérence avec le comportement habituel d’atome (régression possible, à confirmer par l’historique)
- **Zone constatée :** Dashboard → Liste de courses → Produit ajouté
- **Portée potentielle :** Autres objets et modules d’atome ; **ne pas limiter l’enquête à la liste de courses**.
- **Constat :** Un clic long / appui prolongé sur un produit ajouté à la liste de courses ne fait pas apparaître le menu contextuel en petites dalles d’outils autour de l’objet, tel qu’il est normalement utilisé dans le dashboard. Il n’est alors pas possible d’accéder à l’action Supprimer ni à la sélection d’autres objets pour une suppression groupée depuis cette interaction.
- **Comportement attendu :** L’appui prolongé sur un objet éligible déclenche l’interaction contextuelle **existante** d’atome, avec ses dalles d’outils, notamment **Supprimer** et, lorsque prévu, la **sélection multiple** puis la suppression des objets sélectionnés. L’interface et le comportement doivent rester cohérents entre les différents modules qui partagent cette interaction.
- **Cause :** Inconnue. Il faut distinguer absence de menu, mauvaise gestion de l’appui long, défaut d’activation des outils, problème de sélection ou impossibilité de suppression.

### Enquête transversale à mener

1. Reproduire le défaut dans la **liste de courses** sur un produit créé par l’utilisateur : appui prolongé, apparition des dalles, action Supprimer, sélection d’autres objets et suppression groupée.
2. **Étendre l’audit** aux autres types d’objets, listes, vues et modules où l’appui long est censé ouvrir les outils contextuels. Comparer les parcours qui fonctionnent avec ceux qui échouent ; ne pas présumer que tous les objets doivent proposer toutes les actions.
3. Retrouver dans les composants actuels et l’historique Git l’**outil contextuel natif d’atome**, sa gestion des événements (clic, appui prolongé, tactile), ses règles d’activation, ainsi que la logique de sélection et de suppression. Déterminer si un comportement auparavant fonctionnel a régressé.
4. Identifier si le défaut est **local** (produits / liste de courses) ou **transversal** (composant partagé, routage d’événements, état de sélection, droits, hit testing, etc.) ; chercher la cause exacte avant toute modification.
5. Corriger **à la source** et réutiliser le vrai menu en dalles et les outils existants, avec leurs comportements et options habituels. Ne pas créer de menu générique, de nouvelles dalles décoratives ou de système parallèle.
6. Vérifier que la suppression simple et la suppression multiple agissent uniquement sur les objets ciblés, avec les confirmations éventuelles déjà prévues par atome, et que les autres interactions ne sont pas dégradées.

### Tests de non-régression

- Un appui prolongé sur un produit ajouté déclenche les dalles contextuelles prévues dans le dashboard.
- L’action Supprimer permet de supprimer ce produit avec le comportement natif d’atome.
- La sélection d’autres objets et leur suppression groupée sont possibles là où cette fonctionnalité est normalement prise en charge.
- Les interactions contextuelles sont vérifiées sur les **autres modules / objets concernés**, y compris les cas où le menu fonctionne déjà.
- Les comportements souris et tactile sont testés sur les plateformes pertinentes, sans déclenchement intempestif ni duplication des outils.

**À renseigner :** étendue réelle du défaut, modules touchés/non touchés, ancien comportement, cause exacte, éventuel commit responsable, correction et résultats des tests.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** NON REPRODUIT sur Web ; sélection multiple = **nouvelle fonction** (maquette requise).
- **Essais (gestes réels souris + toucher CDP) :** Mon panier tuiles/liste, Récent, Produits › Lessive, tremblement ±7 px, recherche en cours, appui juste après ajout, tuile Contacts : l'appui long ouvre toujours les dalles d'outils (fiche, scan, favori, prix, photo, supprimer, éviter). JS identique à la build 43 pour ces fichiers ; aucun reconnaisseur d'appui long natif iOS (`WKWebViewFactory.swift`).
- **Ce qui manque réellement :** sélection multiple + suppression groupée n'ont jamais existé pour les plaques du Dashboard (`shopping.remove` à un seul article) → nouvelle fonction ; Santé › Compléments n'a pas d'appui long (`health_products_screens.js:36-38`) → à décider ; en vue Liste, l'appui long ne transmet pas sa case (`dashboard_stage_collection.js` rows) : la ligne n'a pas d'équivalent de case de grille → question de mise en page, non codée.
- **Preuves :** `temp/r104merge/agents/bug002/{hold,touch,edge}.probe.mjs`, captures `temp/probe_reports/dashboard_enhancement/bug002_*`.

## TÂCHE-001 — Santé : corriger ou saisir manuellement une mesure manquante ou erronée (sommeil en priorité)

- **Statut :** À étudier, concevoir et tester.
- **Type :** Enquête fonctionnelle / amélioration du traitement des données Santé (ne pas classer comme régression sans preuve).
- **Zone :** Santé → Mesures et historique → Sommeil ; étendre ensuite aux autres mesures compatibles.
- **Constat :** Les données issues d'une montre ou d'une autre source peuvent être absentes, incomplètes ou incorrectes : montre arrêtée, suivi interrompu, sommeil partiellement enregistré, début/fin ou durée erronés. L'utilisateur doit pouvoir corriger ce qui est faux ou **renseigner manuellement ce qui manque**, sans être bloqué par la capture automatique.
- **Objectif :** Permettre à l'utilisateur de rectifier la mesure ou de saisir une période de sommeil manuellement, tout en conservant une traçabilité et en évitant les doublons.

### Étude et enquête à mener

1. **Auditer l'existant :** identifier les outils Santé, les sources de données (montre, Apple Santé / HealthKit, entrées manuelles et autres intégrations), les permissions disponibles, les mécanismes de synchronisation et les fonctions de saisie ou correction déjà présentes. Ne pas créer d'éditeur parallèle.
2. **Vérifier la faisabilité côté Apple :** examiner les possibilités réelles dans Apple Santé et HealthKit pour ajouter, supprimer, remplacer ou corriger des mesures de sommeil, notamment celles enregistrées par l'Apple Watch. Distinguer correction par l'utilisateur dans l'app Santé, écriture autorisée par atome et modification de données provenant d'une autre source ; documenter les limites et les autorisations nécessaires. Ne rien promettre sans vérification.
3. **Prévoir une solution dans atome même si Apple n'autorise pas la rectification :** permettre une entrée manuelle ou une correction locale utilisable pour les calculs, bilans et affichages d'atome, sans altérer silencieusement la donnée d'origine.
4. **Distinguer les cas :** mesure totalement manquante, nuit partiellement enregistrée, mauvais horaire, durée fausse, période en double et données contradictoires entre sources. Prendre en compte les nuits franchissant minuit, les fuseaux horaires et les changements d'heure.
5. **Définir les règles de priorité et de provenance :** distinguer clairement données automatiques et corrections manuelles ; éviter que la prochaine synchronisation n'écrase la correction ou ne compte deux fois le sommeil. Prévoir retour à la valeur initiale et historique des modifications si pertinent.
6. **Réutiliser l'interface Santé native d'atome :** accès simple à la modification depuis la mesure concernée, commandes et outils existants ; aucun panneau générique ou workflow parallèle.

### Tests d'acceptation

- Une nuit non enregistrée peut être **ajoutée manuellement** avec les heures de début et de fin.
- Une nuit tronquée ou mal mesurée peut être **corrigée** dans atome ; le total et les bilans Santé utilisent la valeur effective choisie.
- L'utilisateur peut distinguer mesure originale, correction manuelle et source de la donnée.
- Les synchronisations ultérieures avec Apple Santé n'effacent pas une correction et ne créent pas de doublon dans les calculs.
- Si une modification directe dans Apple Santé est impossible, le parcours alternatif dans atome reste fonctionnel ; la limitation est documentée.
- Les actions demandant une permission Apple suivent les autorisations explicites et ne modifient aucune donnée sans action volontaire de l'utilisateur.

**À renseigner après étude :** capacités Apple vérifiées et références, outils existants retrouvés, architecture de correction retenue, contraintes de synchronisation, tests et plateformes validées.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** ÉTUDE (nouvelle fonction, non codée).
- **Existant :** déclarations Santé (`atome/src/squirrel/health/health_declarations.js`, MCP `health_declaration.add/withdraw`) ; seule l'hydratation est déclarable dans le catalogue ; `sleep_page.js` sans édition. Manque : une déclaration de sommeil (intervalle), la correction locale d'une valeur HealthKit, l'outil d'édition.

## BUG-003 — Biométrie : saisie de la date de naissance par rouleaux et activation de Rencontre

- **Statut :** À investiguer, corriger et valider.
- **Type :** Bug d'ergonomie et de validation, avec condition fonctionnelle d'accès à vérifier. Ne qualifier de régression qu'après consultation de l'historique.
- **Zone :** Biométrie → Date de naissance ; Contacts → Rencontre.
- **Constat :** La saisie actuelle de la date de naissance ne permet pas de la renseigner de manière suffisamment fiable. La validation de cette donnée conditionne l'apparition et l'accès à la brique **Rencontre** dans **Contacts**.
- **Comportement attendu :** Saisie de la date de naissance **au moyen de rouleaux jour / mois / année**, avec contrôle strict de validité, enregistrement correct et apparition de la brique Rencontre **si et seulement si la date est valide et indique au moins 18 ans révolus**, sous réserve des autres conditions d'accès déjà prévues.

### Enquête et modifications à mener

1. Examiner les composants de sélection de dates et de rouleaux **déjà existants** dans atome/eVe et les réutiliser dans la biométrie. Respecter l'apparence et les interactions natives du projet, sans créer d'éditeur de réglages parallèle.
2. Rendre impossible la validation d'une date incohérente : jour compatible avec le mois et l'année (dont années bissextiles), date future interdite, date incomplète rejetée. Ajuster correctement le jour lorsque mois ou année change.
3. Garantir la **normalisation de la date** lors de l'enregistrement (par exemple `YYYY-MM-DD` en interne, sans ambiguïté jour/mois ni décalage lié au fuseau horaire), indépendamment de son format d'affichage local.
4. Vérifier le parcours complet : lecture et persistance de la date biométrique, calcul de l'âge à la date courante, condition d'affichage de **Contacts → Rencontre**, et vérifications d'autorisation à l'ouverture du module. Ne pas se limiter à masquer l'icône si le parcours reste accessible autrement.
5. Vérifier qu'un utilisateur ayant **18 ans révolus** voit la brique Rencontre et peut ouvrir le module, tandis qu'une date absente, invalide ou indiquant moins de 18 ans empêche l'accès. Ne pas ajouter des restrictions différentes de celles déjà prévues sans justification.
6. Rechercher un éventuel dysfonctionnement de liaison entre la biométrie et Contacts, ou un déplacement de Rencontre ; restaurer les composants et parcours existants plutôt que dupliquer la fonction.
7. Protéger la confidentialité de la date de naissance : limiter son exposition et réutiliser les contrôles d'accès et de données personnelles existants. Une date saisie est une **déclaration d'âge**, pas une preuve d'identité ni une vérification indépendante de majorité.

### Tests d'acceptation / non-régression

- Les trois rouleaux jour, mois, année permettent une sélection claire et stable sur tactile comme sur les autres plateformes pertinentes.
- Les dates impossibles, futures ou partielles ne peuvent pas être enregistrées comme valides ; le 29 février est traité correctement.
- La valeur enregistrée est restituée exactement après fermeture et réouverture, sans inversion jour/mois ni décalage de date.
- **18 ans exactement** : la brique Rencontre apparaît dans Contacts et le module s'ouvre, sous réserve des autres prérequis existants.
- **17 ans et 364 jours**, date absente ou invalide : la brique n'est pas accessible et aucun autre chemin ne contourne la condition d'âge.
- La disponibilité de Rencontre est recalculée correctement après correction de la date et après passage du dix-huitième anniversaire.
- Aucun doublon de la brique Rencontre ni aucune régression des autres champs de biométrie.

**À renseigner après investigation :** sélecteur natif réutilisé, format réel de stockage vérifié, emplacement du contrôle d'âge et de Rencontre, cause du défaut, correction et résultats des tests.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** CORRIGÉ (rouleaux de date, normalisation, lecture d'âge Sport, contrôle Rencontre) ; appareil iOS non vérifié.
- **Constat :** date, poids, taille = champs texte libres (depuis 567bc51b, pas une régression) ; stockage brut (« 29/02/2001 » accepté). Contrôle Rencontre correct (`meeting_contract.js#ageFromBirth`, plaque, fiche, serveur `meeting_adult_required`).
- **Défauts trouvés :** (1) Sport lisait l'âge par `new Date(text)` (mois d'abord) : 12/03/1990 → 35, 02/11/2008 → 18 ; (2) aucune validation ni normalisation ; (4) les textes Rencontre écrits en `home.field.*` échappaient au contrôle d'âge.
- **Corrections :** eVe fb5aa1f0 + atome 668f7ead7 — rouleaux jour/mois/année du calendrier (brique validée m1, règle 14) dans Bio (`bevy_panel_home_birth.js`), stockage `YYYY-MM-DD` (`normalizeBirthDate`), jour futur ramené à aujourd'hui, anciennes saisies JJ/MM/AAAA normalisées au chargement ; Sport lit `ageFromBirth` ; `isMeetingIntent` couvre `home.field.*` `meeting.*`.
- **Preuves :** `temp/r104merge/probes/birth_rollers.probe.mjs` 4/4 (12/03/1990 affiché sur les rouleaux, glisser l'année → `1989-03-12`, Rencontre adulte oui / mineur non) ; contrat Node (29/02/2001 refusé, 29/02/2000 accepté, futur refusé, ISO) ; captures `r104merge_birth_rollers_run/`.
- **À valider :** le rouleau du jour affiche le jour de semaine (brique calendrier) ; sans date, les rouleaux montrent le 1er janvier d'il y a 30 ans, rien n'est enregistré avant un geste.

## BUG-004 — Biométrie : saisie du poids et de la taille par rouleaux

- **Statut :** À investiguer, corriger et tester.
- **Type :** Bug d’ergonomie et de fiabilité de la saisie ; qualifier de régression uniquement si l’historique le confirme.
- **Zone :** Biométrie → Poids et Taille.
- **Constat :** La saisie actuelle du poids et de la taille manque de fiabilité ou de cohérence de format. Elle doit être harmonisée avec les rouleaux demandés pour la date de naissance (BUG-003).
- **Comportement attendu :** Remplacer les modes de saisie concernés par des **rouleaux de sélection** adaptés au poids et à la taille, intégrés directement dans l’outil Biométrie existant, pour enregistrer des **valeurs numériques valides, correctement formatées et accompagnées de leur unité**.

### Enquête et modifications à mener

1. Identifier les champs, formats, unités, contrôles et composants de rouleaux réellement employés par la biométrie et les autres modules d’atome/eVe. Réutiliser les composants et les conventions existants sans créer de système de réglages parallèle.
2. Mettre en place un rouleau pour le **poids** et un rouleau pour la **taille**, avec le niveau de précision nécessaire (partie entière/décimale ou sous-rouleaux, selon les capacités natives). Préserver les valeurs déjà enregistrées.
3. Utiliser des unités explicites et cohérentes avec les préférences existantes (par exemple kg pour le poids et cm pour la taille si ce sont les unités réellement retenues par le projet). Vérifier les éventuelles conversions, sans pertes de précision ni changements involontaires de valeur.
4. Normaliser les valeurs en stockage : véritables nombres, séparateur décimal non ambigu, unités connues, sans confusion entre affichage français (virgule) et format interne. Contrôler les valeurs manquantes, invalides, hors plages admises et les erreurs d’arrondi.
5. Vérifier la propagation de ces valeurs à tous les outils qui consomment la biométrie, notamment les calculs Santé/Activités lorsqu’ils existent : aucune valeur obsolète, inversée ou mal convertie.
6. Harmoniser l’interaction et l’apparence des rouleaux **date de naissance, poids et taille**, sans modifier inutilement la logique de l’interface atome/eVe.

### Tests d’acceptation / non-régression

- Poids et taille peuvent être choisis précisément avec les rouleaux, sur tactile et sur les autres plateformes pertinentes.
- Les valeurs sélectionnées sont enregistrées et relues à l’identique après fermeture/réouverture, sans arrondi inattendu ni changement d’unité.
- Les valeurs invalides ou incomplètes ne sont pas acceptées ; le passage entre affichage localisé et stockage ne corrompt jamais les nombres.
- Les données biométriques déjà présentes sont correctement reprises à l’ouverture des rouleaux, sans remise à zéro.
- Les dépendances éventuelles (calculs, indicateurs et modules Santé/Activités) exploitent la valeur validée, et les autres champs de biométrie continuent de fonctionner.

**À renseigner après investigation :** composants natifs réutilisés, unités/précision/règles réelles confirmées dans le code, formats de stockage, correction et résultats des tests.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** PARTIEL — **décision de design** (charte).
- **Constat :** poids/taille stockés en texte avec unité (« 72,5 kg ») ; Sport s'en accommode (`parseFloat` après virgule) ; la taille n'est lue nulle part.
- **Conflit :** la règle 14 met une valeur du Dashboard sur une ligne-curseur (« every value on the one tool slider ») et réserve le rouleau aux dates, heures, durées et choix d'une série ; la demande veut des rouleaux. Proposition prête : `createNumericFieldRuntime` `presentation:'roller'` (kg pas 0,1, cm pas 1) stocké en nombre. Non codé avant arbitrage.

## BUG-005 — Activité sportive impossible à arrêter après un retour au dashboard

- **Priorité :** Haute — activité potentiellement bloquée en cours.
- **Statut :** Signalement intermittent à reproduire ; cause inconnue.
- **Type :** Bug fonctionnel ; régression à confirmer par l'historique.
- **Zone :** Activités → Sport → activité en cours ; Dashboard → raccourci au-dessus de l'Assistant.
- **Constat utilisateur :** Dans certains scénarios, une activité sportive est lancée, laissée active, puis l'utilisateur revient au dashboard. En touchant le raccourci d'activité au-dessus de l'Assistant, il retrouve bien son activité, mais **ne peut plus l'arrêter**. Le scénario exact est encore incertain et devra être reproduit.
- **Comportement attendu :** Toute activité en cours doit rester consultable, contrôlable et surtout **arrêtable** après toute navigation ou reprise de l'application, sans créer une deuxième session ni perdre les données de la session existante.

### Enquête et tests

1. Reproduire : démarrer une activité → retourner au dashboard en laissant l'activité active → toucher le raccourci → tenter l'arrêt. Tester aussi pause/reprise, changement d'outil, changement de page, verrouillage/déverrouillage, mise en arrière-plan, retour après délai prolongé et synchronisation éventuelle avec une montre.
2. Vérifier l'état réel de la session, l'identifiant de l'activité, les contrôles démarrer / pause / reprendre / arrêter, le routage dashboard → session active, les abonnements aux événements et la persistance de l'état entre les vues.
3. Rechercher les cas où l'arrêt est masqué, désactivé, déconnecté de la session ou reçoit un état obsolète. Comparer une session ouverte directement avec la même session après retour par le dashboard.
4. Corriger dans les composants et gestionnaires de session **existants**, sans dupliquer le moteur d'activité ni ajouter un écran parallèle.
5. Vérifier qu'un arrêt confirme effectivement la fin de la session, clôt proprement l'enregistrement, répercute l'état dans le dashboard/la montre et conserve les données acquises. Prévoir un comportement de récupération fiable si la session est coincée.

**Acceptation :** chaque session sportive active est arrêtable depuis son outil, y compris après retour depuis le dashboard ; une session clôturée ne reste pas faussement active. Documenter scénario reproduit, plateformes concernées, cause et tests.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** CAUSE TROUVÉE — **choix de design** (règle 16).
- **Essais Web (11 sondes, gestes réels) :** session, outil « en cours », retour par Retour/Dashboard, reprise après rechargement, arrêt : le moteur fonctionne.
- **Cause :** l'écran « En direct » (ouvert par l'outil ▶) n'a que ✕ et ▶ (pause/reprise) (`dashboard_ongoing_scene.js:99-101`) ; l'arrêt est sur la fiche, qu'on rouvre en touchant le nom ou le disque (maquette L3-A validée). D'où « je retrouve l'activité mais ne peux pas l'arrêter ».
- **Options à valider :** (a) outil Stop dans le pied de « En direct » ; (b) l'outil ▶ ouvre directement la fiche quand une seule activité tourne.
- **Preuves :** `temp/r104merge/agents/sport_ongoing/*.probe.mjs`, rapports `r104merge_sport_ongoing_*`.

## BUG-006 — Indicateur d'activité sportive en cours absent ou incohérent dans le dashboard

- **Priorité :** Haute — l'utilisateur peut perdre l'accès visible à une session active.
- **Statut :** Intermittent, à reproduire et caractériser.
- **Type :** Bug d'affichage / synchronisation d'état.
- **Zone :** Dashboard → zone du raccourci d'activité au-dessus de l'Assistant.
- **Constat utilisateur :** Une activité peut continuer **en tâche de fond** alors que l'indicateur permettant d'y revenir n'est pas visible. Dans d'autres cas, l'indicateur existe et renvoie bien à la session.
- **Comportement attendu :** Lorsqu'une activité est réellement en cours, un accès cohérent, visible et utilisable doit être disponible dans le dashboard pour ouvrir l'activité et l'arrêter. Une fois terminée, l'indicateur doit disparaître ou adopter l'état normalement prévu.

### Enquête et tests

1. Auditer les règles d'affichage de l'indicateur par rapport à l'état véritable d'une ou plusieurs sessions et aux événements de navigation, de mise en arrière-plan et de reprise.
2. Tester différents sports, lancement depuis des points d'entrée différents, navigation, interruptions, veille et retour au dashboard ; noter à quel moment le raccourci est perdu.
3. Vérifier la source d'état partagée et les mécanismes de notification entre activité, dashboard et montre lorsqu'ils existent ; éviter les états divergents.
4. Restaurer l'indicateur **natif** d'atome/eVe dans tous les cas requis, sans ajouter de doublon ni recréer des panneaux génériques.

**Acceptation :** une session active reste accessible depuis le dashboard de manière fiable et son raccourci revient vers **la bonne session**, dont l'arrêt est disponible (cf. BUG-005).


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** CORRIGÉ (2 causes d'état) ; 1 cause de mise en page à arbitrer.
- **Causes corrigées (eVe 70c845cf) :** (3) l'état « en cours » était figé à la construction de la bande, l'observateur ajouté après un import asynchrone → une session démarrée/terminée entre-temps était ignorée ; (4) la reprise des sessions marquait le compte « fait » avant de lister → un échec au démarrage (socket pas prête, hors ligne) n'était jamais retenté, la session tournait sans outil.
- **Cause à arbitrer :** l'outil ▶ (au-dessus de l'Assistant) est recouvert par tout panneau ouvert sur téléphone (`readStageRect` ignore `keepFree`) — perçu comme « intermittent ». Changement de mise en page → validation.
- **Preuves :** `a_home_and_back.probe.mjs` 9/9 et `d_variants.probe.mjs RELOAD=1` 8/8 après correctif.

## BUG-007 — Lancement d'une activité sportive parfois impossible sur la montre

- **Priorité :** Haute.
- **Statut :** Intermittent, à reproduire.
- **Type :** Bug fonctionnel sur montre.
- **Zone :** Module Sport / Activités sur montre → choix puis lancement d'une activité.
- **Constat utilisateur :** Les dalles de sélection d'activité sont présentes sur la montre, mais parfois le lancement ne produit aucun effet et il devient impossible de démarrer une activité.
- **Comportement attendu :** La sélection d'un sport puis sa validation démarre **une** session et fournit immédiatement un retour visuel fiable de son état.

### Enquête et tests

1. Recenser appareils, OS, scénarios et états (premier lancement, lancements successifs, activité précédente terminée/non terminée, connectivité éventuelle avec le téléphone, permissions, verrouillage).
2. Examiner les événements des dalles, l'initialisation de la session, les permissions et dépendances réellement utilisées ; vérifier si le démarrage échoue silencieusement ou si la session démarre sans retour d'interface.
3. Retester démarrage, affichage de l'état actif, navigation et arrêt sur la montre, ainsi que la synchronisation avec atome si elle existe. Ne pas créer de deuxième session sur appuis répétés.

**Acceptation :** les activités sélectionnées démarrent de manière reproductible ou signalent clairement un échec actionnable ; plus de blocage silencieux.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** REVUE DE CODE (aucun test montre possible ici) ; protocole appareil fourni : `temp/r104merge/agents/watch/protocole_montre.md`.
- **Causes probables :** les échecs côté téléphone n'atteignent jamais la montre (`watch_link.js:102`) — `PRESENTATION_UNAVAILABLE` si le Dashboard n'est pas monté (`training_runtime.js:254`), `start()` renvoie ok avant la fin de `session.start` (`dashboard_training_card.js:245-250`) ; l'écran de consentement n'a pas de bande (impasse, `WatchScreens.swift:18-19`) ; une session en cours masque la carte touchée (`watch_link.js:43`) ; requêtes perdues en silence quand l'iPhone est hors de portée.
- **Correctifs proposés (non appliqués : Swift non compilable ici sans build, disque 12 Gio) :** voir protocole et rapport.

## BUG-008 — Activité impossible à arrêter sur la montre et interface bloquée

- **Priorité :** Critique — aucun moyen d'arrêt accessible selon le signalement.
- **Statut :** À investiguer et corriger en priorité.
- **Type :** Bug fonctionnel / contrôle de session sur montre.
- **Zone :** Activité sportive en cours sur montre.
- **Constat utilisateur :** Lorsqu'une activité finit par démarrer sur la montre, elle peut rester en cours sans **aucune commande accessible pour l'arrêter** ; l'utilisateur décrit une montre bloquée par la session.
- **Comportement attendu :** Depuis l'activité active sur la montre, les contrôles existants doivent permettre au minimum de **terminer** la session en toute fiabilité, indépendamment d'un retour au téléphone ou au dashboard, sauf contrainte technique réelle à documenter.

### Enquête et tests

1. Vérifier le parcours natif de l'activité en cours sur montre : commandes réellement disponibles, gestes, événements tactiles, navigation, états masqués et blocages d'interaction.
2. Distinguer commande d'arrêt absente, commande non visible, commande inactive, session impossible à clôturer et écran ne se rafraîchissant pas.
3. Réutiliser les composants et la logique de contrôle des activités existants ; assurer l'accès permanent à l'arrêt sans créer de logique indépendante ou incohérente.
4. Tester démarrage → pause/reprise si prévu → arrêt, navigation/reprise, perte de liaison avec le téléphone, écran verrouillé/déverrouillé et longues sessions. Vérifier l'arrêt réel des mesures et le retour de la montre à un état utilisable.
5. Examiner un **mécanisme de récupération** en cas de blocage persistant, basé sur les capacités réellement disponibles, sans inventer une API ni effacer les données.

**Acceptation :** aucune activité sportive lancée sur la montre ne peut rester sans moyen opérationnel d'arrêt ; la montre reste navigable après clôture.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** REVUE DE CODE — causes identifiées, correctifs à appliquer avec une build et un test montre.
- **Causes :** (E1) séance montre orpheline si l'app iPhone est tuée (`AppNativeHealthWorkout.swift:53` en mémoire seulement ; `WatchSensorSession.swift:80-90` rejoue le départ jusqu'à 6 h) ; (E2) iPhone hors de portée : écran remplacé, arrêt perdu en silence mais vibration « arrêt » (`WatchCardScreen.swift:111`) ; (E3) le curseur d'arrêt lutte avec le défilement horizontal (`:207` / `:26-36`) ; (E4) séance terminée/échouée jamais remise à zéro (`WatchSensorSession.swift:285-288`), tout départ suivant ignoré (`:241`).
- **Protocole :** `temp/r104merge/agents/watch/protocole_montre.md` (11 étapes, journaux à collecter).

## TÂCHE-002 — Revoir l'indicateur de session sportive active dans le dashboard

- **Statut :** Étude de design à valider **avant implémentation**.
- **Zone :** Dashboard → indicateur de session au-dessus de l'Assistant.
- **Constat :** L'actuel symbole **Play** suggère un démarrage de lecture plutôt qu'une activité sportive déjà en cours.
- **Demande :** Étudier un indicateur **petit, circulaire et explicite**, qui signale qu'une activité continue en arrière-plan et ouvre la session d'un toucher. Ne pas modifier prématurément les autres boutons ni la disposition existante.
- **Travail attendu :** retrouver les composants, l'icône active, les teintes et les proportions effectivement utilisés dans le dashboard ; comparer des variantes légères par maquettes fidèles ; faire **valider le visuel** avant modification. Vérifier la lisibilité de l'état « activité en cours », le toucher et l'accessibilité. Le comportement fonctionnel relève des BUG-005 et BUG-006.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** ÉTUDE DE DESIGN à valider. Propriétaire : `dashboard_communication_input.js#ongoingNode` (glyphe `play2`, allumé), scène `dashboard_ongoing_scene.js`. Lié au choix BUG-005.

## TÂCHE-003 — Maquettes du module Activités sur montre, à valider avant refonte

- **Statut :** Maquettes à préparer après collecte des références visuelles réelles ; **ne pas implémenter avant validation**.
- **Zone :** Montre → sélection, démarrage et activité sportive en cours.
- **Constat :** Les **cartes grises** actuelles de sélection d'activité ne conviennent pas visuellement ; le démarrage et l'arrêt sont par ailleurs défaillants (BUG-007 et BUG-008).
- **Travail attendu :** examiner les captures et composants existants de la montre, puis produire des **mockups consultables** reproduisant le style natif minimaliste d'atome/eVe, pour la sélection des sports, l'état actif et un moyen d'arrêt clairement accessible. Prévoir une validation explicite du design avant toute modification du code.
- **Contraintes :** privilégier les dalles/outils réels et les conventions atome/eVe ; éviter les cartes génériques, contrôles factices ou nouvelles API inventées. Les mockups ne doivent pas être présentés comme une implémentation fonctionnelle.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** MAQUETTES à produire au format montre réel ; brouillons HTML existants `temp/watch_companion/mockups/w0_*.html` ; écrans `platforms/ios/atome-auv3/watch/WatchScreens.swift`, `WatchCardScreen.swift`. Non codé.

## BUG-009 — Outil Web : aucune page affichée à l'ouverture

- **Priorité :** Haute — outil inutilisable selon le signalement.
- **Statut :** À reproduire, investiguer et corriger.
- **Type :** Bug fonctionnel ; régression éventuelle à confirmer.
- **Zone :** Outil Web d'atome/eVe, affichage et navigation WebView.
- **Constat :** Lorsqu'on ouvre l'outil Web, rien ne s'affiche et aucune page utilisable ne s'ouvre. Le comportement est à vérifier sur les plateformes concernées.
- **Comportement attendu :** L'outil Web charge et affiche correctement une page de démarrage, puis les URL et navigations demandées, à l'intérieur de l'interface native prévue.
- **Ne pas confondre :** le **défaut de chargement** est ce bug. Le **choix de la page d'accueil** est une évolution distincte (TÂCHE-004).

### Enquête et correction

1. Reproduire l'ouverture de l'outil Web ; relever plateforme, version, connexion, état des permissions et résultat à l'écran. Distinguer fenêtre/vue absente, vue vide, page non chargée, échec réseau, problème d'URL et erreur d'affichage.
2. Retrouver la vraie implémentation de l'outil Web et son moteur de rendu WebView selon les plateformes (Web, macOS, iOS, etc. **uniquement si réellement prises en charge**). Vérifier la création, le montage, la dimension, la visibilité, le chargement et les événements de navigation.
3. Examiner les journaux et erreurs réellement remontés ; vérifier les restrictions de sécurité, permissions réseau et politiques de contenu **sans désactiver les protections** pour masquer le problème.
4. Corriger l'outil existant, sans nouveau navigateur parallèle et sans inventer de composant ou de bridge.
5. Valider l'ouverture d'une page HTTP(S) de test, le changement de page, la navigation et la gestion explicite des URL invalides, de l'absence de réseau et des pages refusant l'intégration.

**Acceptation :** une ouverture de Web affiche effectivement du contenu sur les plateformes concernées, une navigation charge la page demandée, et toute erreur est compréhensible plutôt qu'un écran vide.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** REPRODUIT sur Web, pas une régression — **décision nécessaire**.
- **Constat (sonde `temp/r104merge/agents/bug009_reg001/web.probe.mjs`) :** ouverture sans URL = seulement les favoris Web (aucun → écran vide) (`dashboard_web.js:40-55,106`) ; une adresse (example.com) se charge ; des mots partent vers DuckDuckGo qui refuse l'encadrement (`frame-ancestors`) → rectangle noir, et le lecteur ne signale aucune erreur (`web_page_player.js:36-42,73` ; le commentaire `:12-13` est faux).
- **Hôtes natifs (iOS, Tauri, Android) :** vue web native (pas de règle d'encadrement), non testés ici.
- **Options :** page de départ = TÂCHE-004 ; détection d'un refus d'encadrement côté serveur avant d'encadrer (`web_page_frame_refused`) ou moteur encadrable → à choisir.

## TÂCHE-004 — Outil Web : moteur de recherche / page de démarrage configurable

- **Statut :** Évolution fonctionnelle à étudier et implémenter après validation du comportement existant.
- **Type :** Nouvelle fonctionnalité, **pas un bug**.
- **Zone :** Préférences utilisateur → Web ; outil Web.
- **Objectif :** À l'ouverture de Web sans URL explicite, afficher automatiquement une page de recherche choisie par l'utilisateur.
- **Choix proposés :** **Ecosia, DuckDuckGo, Google et Yahoo**, sous réserve de la possibilité réelle de les afficher dans la WebView sur chaque plateforme. Définir le choix initial par défaut lors de l'étude, puis conserver le choix de l'utilisateur.

### Étude et réalisation

1. Rechercher les préférences utilisateur, sélecteurs et outils Web existants. Ajouter le réglage **Moteur de recherche** dans les préférences natives, sans panneau générique supplémentaire.
2. Associer chaque option à une URL officielle adaptée ; vérifier réellement l'accès, les éventuelles restrictions d'intégration, les redirections, le consentement et le comportement sur les plateformes visées. En cas de site incompatible avec la WebView, documenter le problème et proposer une alternative compatible sans prétendre que le moteur fonctionne.
3. À l'ouverture de Web **sans URL ni document à ouvrir**, charger la page choisie. Lorsqu'une URL ou un document est explicitement demandé, celui-ci prime sur la page d'accueil.
4. Conserver la préférence après redémarrage, permettre son changement, gérer le mode hors connexion et éviter de charger plusieurs pages en double.
5. Vérifier que le moteur choisi s'affiche réellement dans l'outil Web (BUG-009) et qu'une recherche peut être effectuée.

**Acceptation :** le moteur sélectionné apparaît à chaque ouverture standard de Web, et le réglage est mémorisé ; une URL explicitement ouverte garde la priorité.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** FONCTION NOUVELLE. `web_runtime.js` : `SEARCH_ENGINE` DuckDuckGo en dur, aucune préférence ; modèle de préférence existant `createProfilePreferenceList`.

## TÂCHE-005 — Importer un fichier HTML dans l'outil Web

- **Statut :** Étude comparative des parcours, puis choix à valider avant implémentation.
- **Type :** Nouvelle fonctionnalité, **pas un bug**.
- **Zone :** Import / Finder / fichiers → outil Web.
- **Objectif :** Permettre d'importer un fichier `.html` / `.htm` et de l'ouvrir dans atome/eVe, en réutilisant les actions et sources d'import existantes.

### Options à challenger

- **Option A — Affichage direct :** importer le fichier HTML et l'ouvrir dans la WebView existante. Examiner les ressources associées (CSS, images, scripts, chemins relatifs), l'affichage local et les restrictions de sécurité. **Piste privilégiée pour une première ouverture fiable**, à confirmer par les tests.
- **Option B — Import structuré :** analyser le document et convertir les éléments compatibles en objets/modules natifs d'atome, selon les capacités réelles établies dans TÂCHE-006. Définir ce qui est conservé, approximé ou non pris en charge.
- **Option éventuelle combinée :** ouvrir d'abord le document dans Web, puis proposer une action **Convertir en atome** si un convertisseur fiable a été validé. Ne pas imposer de conversion lors d'une simple ouverture.

### Critères de comparaison

1. Fidélité d'affichage (texte, CSS, images, liens, mise en page, scripts), temps de chargement, performance et consommation mémoire.
2. Compatibilité avec les outils, composants et formats existants d'atome/eVe ; éventuelle réutilisabilité et éditabilité du résultat.
3. Sécurité des fichiers importés : scripts et contenus actifs, accès aux fichiers locaux, origine, ressources distantes et permissions. Ne pas exécuter arbitrairement du code avec des privilèges d'atome.
4. Gestion des ressources absentes, erreurs d'import, encodages, liens relatifs, archivage éventuel des dépendances et fonctionnement hors ligne.
5. Expérience utilisateur conforme à l'organisation actuelle des briques et des outils ; pas d'interface d'import parallèle.

**Acceptation :** un HTML importé s'ouvre effectivement dans le parcours retenu, avec indication honnête des limitations ; l'option de conversion n'est activée que lorsqu'elle fonctionne.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** ÉTUDE. `web_page_player.js` refuse les pages de même origine ; `html_import.js#importHtml` importe en document. Option A (blob / origine séparée) à concevoir.

## TÂCHE-006 — Étudier la conversion d'une page Web vers le format natif atome

- **Statut :** Exploration / faisabilité technique ; **aucune promesse de conversion complète** avant audit du code.
- **Type :** Nouvelle fonctionnalité prospective, **pas un bug**.
- **Zone :** WebView / document importé → objets atome.
- **Objectif :** Étudier comment transformer une page HTML ou une page Web affichée en une composition réutilisable d'objets et d'outils d'atome, au lieu de n'en conserver qu'un rendu WebView.

### Investigation

1. Inventorier d'abord les types d'objets, primitives graphiques, outils d'import, moteurs d'affichage, formats et APIs **réellement présents** dans le dépôt ; respecter la frontière JavaScript/Rust/Bevy lorsqu'elle s'applique.
2. Construire un tableau de correspondance **HTML/CSS/DOM → capacités natives atome** (texte, images, liens, disposition, styles, médias, événements). Signaler explicitement les éléments non convertibles ou qui exigent de rester dans WebView.
3. Comparer les approches : capture/rendu embarqué, extraction structurée partielle, conversion native hybride. Évaluer l'éditabilité, la fidélité, les performances, la maintenance et les limites, y compris scripts dynamiques, composants web, CSS complexe, iframes et protections de sites tiers.
4. Conserver les liens et ressources uniquement selon les autorisations et contraintes techniques réelles ; garantir que la conversion n'accorde pas des privilèges excessifs au contenu d'origine.
5. Définir une preuve de concept sur un HTML local simple, puis un document plus complexe ; produire mesures, limites et recommandation **avant toute généralisation**.
6. Si validée, intégrer la conversion comme **action d'un outil réel** liée au document Web, sans inventer un éditeur générique ou un système de modules parallèle.

**Livrables de l'étude :** comparaison documentée des stratégies, périmètre réellement convertible, maquettes uniquement si nécessaires et fondées sur les composants existants, prototype testé, décision de mise en œuvre ou de report.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** ÉTUDE. Base `html_import.js` ; les contrats Web disent que les pages ne sont jamais lues ; un iframe d'une autre origine est illisible → récupération serveur nécessaire.

## TÂCHE-007 — Vidéos en ligne : dates de publication visibles et résultats les plus récents par défaut

- **Type :** Évolution fonctionnelle et amélioration du classement.
- **Statut :** À auditer, spécifier et tester.
- **Zone :** Médias → Vidéos ; contenus en ligne (YouTube et autres services réellement intégrés) ; fiches et résultats vidéo.
- **Demande :** Présenter **les vidéos les plus récentes d'abord** lorsque la liste dispose de dates exploitables ; afficher sur les fiches la **date de publication** disponible ; permettre de changer le classement.
- **Précision :** Une plateforme fournit souvent une **date de publication / mise en ligne**, pas la date de création initiale de la vidéo. Afficher le libellé exact correspondant à la donnée réelle, et ne pas inventer de date si elle est absente.

### Analyse et implémentation

1. Recenser les fournisseurs vidéo réellement branchés et leurs métadonnées accessibles ; contrôler la présence de la date de publication ou de mise en ligne, le fuseau/format et les conditions d'accès aux données. Pour YouTube, vérifier les champs et critères disponibles via l'intégration existante, sans supposer qu'une API ou un endpoint est déjà connecté.
2. Normaliser, quand elles existent, les dates en interne tout en conservant les informations de provenance et le type de date. Présenter la date lisiblement dans la fiche ou dans la liste, là où le design existant le permet.
3. Trier **par défaut par date décroissante (plus récent en premier)** les résultats et listes vidéo disposant d'une date fiable. Pour les contenus sans date, définir un comportement explicite et stable ; ne pas les présenter comme récents.
4. Proposer, dans les **outils de tri existants**, les ordres **plus récent**, **plus ancien** et **alphabétique** ; éviter de dupliquer les options si le framework possède déjà une fonction de tri.
5. Vérifier les implications des API : recherche par pertinence ou récence, pagination, données agrégées, limites de quota et résultats mis en cache. Quand seul le tri des résultats déjà chargés est possible, distinguer clairement cela du tri de l'ensemble du catalogue.
6. Garantir la cohérence avec la recherche dans les vidéos : les modes de tri doivent également s'appliquer aux résultats de recherche quand les métadonnées le permettent.

### Tests d'acceptation

- Une liste YouTube avec dates disponibles affiche les vidéos les plus récemment publiées en premier par défaut.
- Les fiches indiquent la date de publication/mise en ligne véritablement retournée ; aucune date factice si le champ n'existe pas.
- Le passage entre récent, ancien et ordre alphabétique fonctionne et garde une cohérence à travers pagination et rechargement.
- Le classement après recherche ne confond pas fraîcheur et pertinence ; le traitement des dates manquantes est explicite.
- Tester plusieurs fournisseurs existants sans supposer qu'ils ont les mêmes métadonnées ou capacités.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** FONCTION NOUVELLE. `server/ws_youtube_search.js` ne remonte ni `publishedAt` ni `order` ; option `sort` déjà dans `dashboard_stage_list.js`.

## TÂCHE-008 — Framework : tri par date et ordre alphabétique réutilisable dans les recherches

- **Type :** Évolution transversale, **distincte du bug de chargement Web**.
- **Statut :** À auditer et concevoir à partir des briques existantes.
- **Zone :** Moteur de recherche partagé, Finder et modules affichant des listes de résultats locaux ou en ligne.
- **Demande :** Rendre accessible, là où les données s'y prêtent, un tri **plus récent**, **plus ancien** ou **alphabétique**, en complément du tri par pertinence s'il est déjà disponible.

### Étude et réalisation

1. Recenser les recherches effectivement présentes dans atome/eVe, leurs briques de tri et leurs critères existants. Centraliser la logique **uniquement si un composant partagé réel existe ou peut être factorisé dans l'architecture actuelle**.
2. Définir pour chaque source les champs disponibles : création, modification, publication, import, découverte. Ne pas mélanger ces dates dans un classement sans expliciter le critère retenu.
3. Exposer les critères au moyen de l'outil de tri natif et dans ses options habituelles, sans multiplier les panneaux, champs ou boutons permanents.
4. Fournir un tri alphabétique stable tenant compte des accents et de la langue, des valeurs manquantes et de la pagination. Conserver le comportement prévu des recherches qui n'ont ni date ni titre exploitable.
5. Vérifier les possibilités réelles de tri côté source, côté application et sur les résultats paginés. Ne pas promettre le tri exhaustif si seuls les éléments chargés peuvent être classés.
6. Préserver les réglages ou choix de l'utilisateur si le framework prévoit déjà cette persistance ; éviter d'imposer la récence par défaut à des catégories qui nécessitent plutôt la pertinence.

**Acceptation :** les modules compatibles partagent des choix de tri cohérents sans briser leurs filtres, classements spécialisés ou règles de pertinence.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** FONCTION NOUVELLE. `bevy_panel_finder_model.js` (`FINDER_SORTS` récents / A→Z / type) à partager ; recherche du Dashboard sans tri.

## TÂCHE-009 — Recherche globale / locale : remplacer la sphère par deux dalles à partir de la loupe

- **Type :** Modification de design et d'interaction.
- **Statut :** À préparer et valider visuellement avant toute modification.
- **Zone :** Dashboard → input box de recherche, loupe à gauche ; commande actuelle de portée de recherche.
- **Constat :** Le sélecteur séparé de recherche locale/globale occupe trop d'espace et sa **sphère** ressemble à un accès Internet, ce qui est ambigu.
- **Comportement demandé :** Ne plus montrer en permanence cette sphère. Un **clic/toucher sur la petite loupe** à gauche de l'input box révèle **deux dalles contextuelles d'outils au-dessus de la loupe** : **Local** et **Tout le framework** (recherche globale), sans modifier les recherches elles-mêmes.

### Enquête et design

1. Retrouver la loupe, le sélecteur de portée actuel, les vraies dalles contextuelles et les comportements natifs du dashboard. Vérifier où la portée est actuellement décidée et conservée.
2. Réutiliser les **deux vraies actions** locale et globale : les déplacer/rendre accessibles dans les dalles contextuelles, sans créer un nouveau moteur de recherche.
3. Pour la recherche dans **tout le framework**, utiliser le **petit symbole eVe réel** s'il existe et convient. Pour **Local**, chercher un pictogramme de la bibliothèque d'icônes existante, distinct d'Internet, et **faire valider** sa lisibilité ; ne pas inventer une icône décorative substituée à une action.
4. Déterminer le périmètre exact que recouvre « Local » dans le code (par exemple la portée de recherche actuellement prévue par l'outil) plutôt que d'en changer arbitrairement le sens.
5. Préparer une proposition fidèle à l'input box et aux dalles réelles. Respecter le positionnement, les proportions, la zone vide prévue en mode droitier et les interactions tactiles ; ne pas recréer de pop-up ou panneau générique.
6. Tester clic sur loupe, choix de la portée, fermeture du petit menu, état de portée sélectionnée, lancement de la recherche et visibilité du champ sur les différentes tailles d'écran.

**Acceptation :** la sphère permanente est retirée ; les deux portées réelles sont accessibles depuis la loupe, et chaque choix exécute la même recherche locale/globale qu'auparavant. Design à valider avant implémentation.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** DESIGN à valider. Sphère = outil `search_global` (`dashboard_footer_navigation.js#everywhereNode`) ; portées `dashboard_search_source.js`.

## TÂCHE-010 — Lecteur vidéo : clic simple pour les contrôles, double clic pour le plein écran

- **Type :** Modification d'interaction, à évaluer sur les lecteurs et plateformes réellement disponibles.
- **Statut :** À auditer, prototyper puis tester.
- **Zone :** Vidéos, notamment intégrations YouTube et autres sources en ligne, et lecteurs internes applicables.
- **Constat :** Un clic simple ouvre actuellement certaines vidéos directement en plein écran, comportement à remplacer.
- **Comportement demandé :**
  - **Clic ou toucher simple :** afficher / rendre disponibles les commandes de lecture (pause, reprise, etc.), sans provoquer le plein écran. L'action pause/reprise reste sur la vraie commande prévue, sauf règle native existante à examiner.
  - **Double clic / double toucher sur la vidéo :** basculer **vers le plein écran** et, si déjà en plein écran, **revenir au mode précédent**.
  - **Commande Plein écran dans les contrôles :** offrir également entrée et sortie du plein écran sans nécessiter de double clic.

### Enquête et validations

1. Examiner l'intégration réelle des lecteurs, les restrictions des fournisseurs, les lecteurs embarqués et les API autorisées. Ne pas forcer les comportements lorsqu'un lecteur tiers impose ses interactions.
2. Réutiliser les vrais contrôles vidéo d'atome/eVe et les capacités plein écran déjà existantes, sans overlay factice.
3. Gérer les conflits entre clic simple, double clic, double toucher, gestes du fournisseur, navigation et commande de pause ; éviter lecture/arrêt intempestifs, zoom du navigateur ou déclenchement double.
4. Vérifier souris, écran tactile, mobile, affichage intégré, mode plein écran, reprise après sortie et comportements d'accessibilité.
5. Si le double clic ne peut pas être intercepté sur certains lecteurs tiers, le documenter et maintenir la commande Plein écran accessible.

**Acceptation :** un simple toucher n'ouvre plus inopinément le plein écran ; les contrôles sont accessibles ; double toucher (lorsque possible) et commande dédiée activent/désactivent le plein écran de façon fiable.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** CHANGEMENT D'INTERACTION à valider. `dashboard_media_scrub.js#handlers` : appui long = contrôles, toucher = plein écran ; double toucher déjà disponible (`bevy_ui_pointer_runtime.js:398`).

## TÂCHE-011 — Contrôles vidéo : placer la timeline sous la rangée des outils

- **Type :** Ajustement de disposition du lecteur vidéo.
- **Statut :** À vérifier sur l'UI réelle avant modification.
- **Zone :** Surcouche de lecture vidéo.
- **Demande :** Inverser la disposition actuelle : la **rangée d'outils/commandes** de lecture doit se trouver **au-dessus**, et la **barre de progression temporelle (timeline)** **en dessous**.
- **Contraintes :** Garder les fonctionnalités de lecture, pause, réglage de la position temporelle, indicateurs de durée et plein écran ; conserver les proportions natives et la surface tactile suffisante.
- **Enquête :** identifier le composant et l'ordre de disposition actuels, y compris les variantes de lecteur. Déterminer si le changement s'effectue dans un composant commun ou nécessite des adaptations vérifiées ; ne pas recopier la logique du lecteur.
- **Tests :** position de la timeline, progression et déplacement temporel, affichage des commandes, masquage/affichage, petit écran et plein écran.

**Acceptation :** les outils sont au-dessus de la timeline et toutes les commandes restent utilisables sans chevauchement.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** MISE EN PAGE à valider. `dashboard_media_scrub.js#geometry` (`rowTop` / `toolsTop`).

## TÂCHE-012 — Style atome/eVe : transparence et flou d'arrière-plan cohérents pour les surcouches d'outils

- **Type :** Audit de style transversal + correction de cohérence visuelle.
- **Statut :** À investiguer sur les composants réels puis proposer une correction factorisée.
- **Zone constatée :** Fond des contrôles vidéo ; **portée potentielle :** autres outils, panneaux et surcouches concernés par le style partagé d'atome/eVe.
- **Constat :** Le fond des commandes du lecteur vidéo n'a pas l'apparence légèrement translucide et floutée attendue du reste de l'interface.
- **Objectif :** Obtenir un fond **discrètement transparent** avec **background blur** (flou de ce qui se trouve derrière), selon les valeurs et règles graphiques habituelles du projet, et exposer des valeurs par défaut cohérentes pour les composants concernés.

### Enquête et modifications

1. Repérer les véritables styles, tokens, primitives et mécanismes de composition/effet de fond utilisés dans atome/eVe sur les plateformes concernées (incluant la couche graphique réelle si Bevy intervient) ; **ne pas présumer** du nom d'une variable CSS ou d'une API.
2. Vérifier si un **style commun existe déjà**. Si oui, comprendre pourquoi la surcouche vidéo ne l'utilise pas et restaurer sa réutilisation. Sinon, proposer une factorisation fondée sur les composants effectivement présents, avec validation de l'architecture.
3. Définir ou réutiliser deux réglages de style : **niveau de transparence/opacité** et **intensité du flou d'arrière-plan**, avec des **valeurs par défaut** issues des conventions existantes plutôt que de nombres arbitraires. Éviter une interface de réglages séparée.
4. Étudier la portée du style partagé **uniquement** sur les surfaces qui doivent l'utiliser, sans imposer du flou à l'ensemble du framework.
5. Contrôler la lisibilité des outils au-dessus des vidéos claires ou sombres, les transitions, la surcharge GPU/CPU, les plateformes sans blur natif et le comportement de repli.
6. Tester la cohérence visuelle entre lecteur vidéo et autres surcouches réelles ; ne pas réinventer couleurs, teintes, icônes ni dimensions.

**Acceptation :** le fond des commandes vidéo est translucide et légèrement flouté, cohérent avec l'interface existante ; le style est réutilisable et les paramètres par défaut ne dégradent ni la lisibilité ni les performances.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** STYLE à valider. Fond des contrôles vidéo = rectangle plat `rgba(0,0,0,0.35)` (`dashboard_media_scrub.js:39,173`) ; matériau verre existant `dashboard_glass_material.js` (risque : la découpe média efface ce qui est dessous).

## BUG-010 — Panneaux d'outils trop étroits : six outils ne tiennent pas sur une ligne

- **Type :** Bug de disposition / incohérence visuelle potentiellement transversale.
- **Statut :** À investiguer et corriger sur le composant commun si celui-ci existe.
- **Zone constatée :** Traitement / retouche d'image, Capture photo et Capture vidéo ; **périmètre demandé : tous les panneaux du framework utilisant cette disposition**, et non uniquement ces trois modules.
- **Constat :** Certains panneaux s'ouvrent sans utiliser toute la largeur disponible de leur cadre. Une rangée prévue pour **six outils** ne peut en montrer correctement que cinq : le sixième déborde, se superpose ou se trouve tronqué.
- **Comportement attendu :** Le panneau exploite la largeur réellement disponible jusqu'aux limites prévues par le design atome/eVe. **Les six outils tiennent dans la rangée**, visibles, alignés et utilisables, sans débordement ni perte de fonctionnalité.

### Enquête et corrections

1. Retrouver les panneaux existants, leurs conteneurs, contraintes et tailles de briques/outils réelles ; comparer la largeur du cadre disponible à la largeur effectivement attribuée au panneau.
2. Vérifier si le défaut est partagé par un composant de panneau ou s'il dépend de modules particuliers. **Auditer les autres panneaux du framework** qui affichent des outils en rangées de six.
3. Corriger à la source la largeur utilisable, les marges, espacements, bordures, règles de dimensionnement et éventuels problèmes d'overflow ; éviter de réduire arbitrairement les outils ou d'introduire des copies de composants.
4. Respecter les dimensions, teintes, dispositions et conventions natives. Si six outils ne tiennent pas physiquement sur certains écrans, documenter une adaptation compatible et réellement testée plutôt que masquer ou superposer le dernier outil.
5. Vérifier les configurations portrait/paysage, petites et grandes largeurs, panneau ouvert/replié, et les différences de plateforme.

**Acceptation :** les six outils restent accessibles sur une même ligne dès que les dimensions prévues par le framework le permettent ; aucun outil ne sort du cadre. La correction ne rétrécit pas inutilement le preview ni les autres outils.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** RÉGRESSION confirmée (042f50bf, 29 oct., bande dans le pied du panneau) — **décision de design** : 6 outils sont physiquement impossibles à 402/393 pt sous les règles 12–14.
- **Mesures :** 430 pt → bande 394 px, 6 outils par ligne ; 402 pt → 366 px, 5 par ligne, le premier outil seul sur sa ligne (Filtre « Orig. », Ajust. « Auto », bande Retouche, Médias, Capture Photo) ; 6 outils + marges = 405 px.
- **Options :** (1) bande hors pied sur téléphone (contredit la règle 13 du 29 oct.) ; (2) panneau bord à bord, marge 8 (contredit la règle 14) ; (3) 5 par ligne, débordement réparti (3+3). Commentaire périmé `dashboard_mystic_geometry.js:277-279`.
- **Preuves :** `temp/r104merge/agents/panels_retouche/out_phone_402/*.png`.

## BUG-011 — Retouche photo : panneau initial vide malgré la présence de photos locales

- **Type :** Bug d'état initial / initialisation du contenu, à confirmer sur l'implémentation actuelle.
- **Statut :** À investiguer et corriger.
- **Zone :** Médias / Retouche photo → ouverture du module.
- **Constat :** À l'ouverture, le panneau Retouche peut être vide au lieu de présenter des photos utilisables.
- **Comportement attendu :** **Afficher par défaut au moins les photos locales de l'utilisateur** disponibles via la source locale / le Finder / les outils Médias réellement connectés, sans obliger à sélectionner d'abord un filtre ou à relancer une recherche.

### Enquête et corrections

1. Recenser les sources locales déjà intégrées, la sélection active, les filtres sauvegardés, permissions et mécanismes de chargement de la galerie. Réutiliser les vues et outils existants, sans galerie parallèle.
2. Vérifier le chargement initial des médias, les cas de cache vide, les autorisations manquantes et le retour dans le module après navigation.
3. Faire apparaître les **photos locales** à l'ouverture lorsque rien d'autre n'est explicitement sélectionné ; respecter toutefois une sélection ou un fichier déjà ouvert par l'utilisateur, qui doit garder la priorité.
4. Si aucune photo locale n'est disponible, afficher l'état vide natif approprié ; ne pas remplir artificiellement la liste. Vérifier l'ouverture d'une photo dans le véritable outil Retouche.
5. Contrôler la cohérence avec les outils Finder, Recherche et Médias existants, en évitant les doublons et les régressions de permissions.

**Acceptation :** à l'ouverture normale de Retouche, les photos locales réellement disponibles apparaissent et peuvent être choisies. Un cas sans média ou sans autorisation est géré explicitement.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** COMPORTEMENT DE LA CHARTE, pas un bug — **décision de design**.
- **Constat :** Créer › Retouche ouvre une création vierge (validé 26 oct.) ; le panneau d'import n'affiche les médias qu'avec Médias déplié **et** un filtre allumé (règle 18 mot pour mot). La photo apparaît dès « Images » allumé.
- **Option :** Retouche ouvre l'import avec Médias déplié et Images allumé par l'appelant (option `filters` de `requestMediaSelection`) — modifie la règle 18.
- **Vérifié :** le « défaut » signalé par l'enquête (filtre allumé avec Médias replié) n'existe pas : les puces ne sont dessinées qu'une fois Médias déplié (`bevy_panel_media_view.js`).

## TÂCHE-013 — Capture photo/vidéo : grand aperçu par défaut et outil Liste pour changer de vue

- **Type :** Évolution de design et du parcours de Capture.
- **Statut :** À étudier sur les composants et captures réels, à faire valider visuellement avant implémentation.
- **Zone :** Capture → Photo et Vidéo, prévisualisation et liste des prises.
- **Constat :** La prévisualisation actuelle est **trop petite** ; une liste de médias occupe en permanence de l'espace sous le preview alors qu'elle n'est pas utile pendant la prise de vue.
- **Comportement demandé :** À l'ouverture de l'enregistrement **photo ou vidéo**, montrer **l'aperçu seul**, agrandi pour **occuper au maximum l'espace de prévisualisation disponible dans le panneau**, sans afficher la liste par défaut. Il s'agit de la surface de Capture, **pas nécessairement du mode plein écran du système**.

### Structure d'interaction à vérifier et proposer

1. Réutiliser **le véritable outil Liste** déjà présent dans atome/eVe ou le composant équivalent vérifié dans le dépôt : une **petite dalle/commande Liste sous le preview** permet d'accéder aux prises et de les manipuler. Ne pas créer un bouton purement décoratif.
2. Étudier les **trois présentations** demandées : **Aperçu seul** (défaut), **Liste seule**, et **Aperçu + Liste** si cette troisième présentation s'intègre à la logique et aux dimensions du composant réel. La sélection de vue doit être claire, réversible et cohérente avec les outils existants.
3. L'aperçu doit prendre tout l'espace rendu disponible par la disparition de la liste et par la correction de largeur des panneaux (BUG-010), en conservant les proportions et le fonctionnement de la capture vidéo/photo.
4. Dans les vues incluant la liste, l'utilisateur peut retrouver et manipuler les éléments réellement capturés avec les outils natifs ; en revenant à l'aperçu, il retrouve la session de capture et ses commandes, sans perdre l'état actif.
5. Vérifier avant maquette les dimensions, la disposition, les icônes et le comportement des panneaux Capture existants. Présenter des variantes fidèles **à valider**, puis seulement modifier le code.

### Tests d'acceptation

- L'ouverture de Capture photo ou vidéo montre **le preview seul et nettement plus grand** ; aucune liste ne réduit l'aperçu par défaut.
- La petite commande Liste permet de retrouver les prises ; l'aperçu reste accessible après bascule et l'état de la capture n'est pas perdu.
- Si le mode mixte Aperçu + Liste est retenu après validation, les deux restent utilisables et ne débordent pas.
- Capture, enregistrement, aperçu et accès aux médias existants restent fonctionnels sur les plateformes pertinentes.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** DESIGN à valider. `dashboard_takes_list.js` (`previewing` par défaut), `dashboard_takes_band.js` (outil Aperçu bascule), `dashboard_takes_view.js#previewListBoxes`.

## TÂCHE-014 — Capture : barre d'outils sur une ligne et commandes adaptées à la vue

- **Type :** Correction de disposition et de pertinence des commandes de Capture ; dépend de BUG-010 et TÂCHE-013.
- **Statut :** À analyser et faire valider sur l'interface réelle avant implémentation.
- **Zone :** Outils Capture photo/vidéo, contrôle des prises et de leur liste.
- **Constat :** La disposition utilise trop d'espace et peut afficher **Effacer** même lorsque la liste sur laquelle agir est masquée, ce qui n'est pas pertinent selon le parcours décrit.
- **Comportement demandé :** Disposer les outils de Capture pertinents **sur une seule rangée**, en bénéficiant de la largeur corrigée du panneau. **Masquer ou désactiver proprement l'action Effacer lorsqu'aucune liste / sélection correspondante n'est affichée** ; la rendre disponible dans le contexte réel où elle agit sur des éléments sélectionnés.

### Investigation et validations

1. Inventorier les véritables outils de Capture et la fonction précise d'**Effacer** : ne pas masquer une action qui aurait une utilité indépendante de la liste (par exemple effacement d'une prise active) sans vérifier son comportement réel.
2. Préserver les outils existants et leurs options natives ; éviter de créer une seconde barre d'outils ou un panneau de réglages séparé.
3. Harmoniser la barre selon la vue **Aperçu**, **Liste** ou **Aperçu + Liste** choisie. Garder les commandes de prise et d'enregistrement indispensables toujours accessibles.
4. Vérifier l'alignement, la lisibilité, les zones tactiles et l'absence de chevauchement avec l'outil Liste placé sous le preview.
5. Tester les actions réelles, y compris la sélection et la suppression depuis la liste, après changement de vue et après enregistrement de nouveaux médias.

**Acceptation :** les outils utiles tiennent sur une ligne sans débordement ; les outils sans objet pour la vue active ne consomment plus inutilement de place ; le preview est maximisé et aucune fonction de suppression existante n'est perdue.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** DESIGN à valider ; dépend de BUG-010. Bande `dashboard_takes_band.js#takesBandItems` (« Suppr. », pas « Effacer »).

## BUG-012 — Ouverture d'un projet existant : retour immédiat au dashboard

- **Priorité :** Critique — projets inaccessibles.
- **Statut :** Signalement confirmé par essai utilisateur sur iOS, version 1.45 build 43 ; cause technique non déterminée.
- **Zone :** Dashboard → Projets → ouverture d'un projet ; moteur de rendu et workspace eVe.
- **Constat :** Une sélection de projet n'ouvre plus son contenu et ramène l'utilisateur au dashboard. Le reste des rubriques s'ouvre normalement.
- **Attendu :** Le projet sélectionné s'ouvre dans sa vraie vue, conserve ses données, rend ses outils utilisables et reste accessible après rechargement.
- **Enquête :** Tracer action sur dalle → identifiant et permissions → chargement des données → activation du workspace → rendu Bevy → navigation. Examiner les erreurs silencieuses, les courses asynchrones et les divergences éventuelles entre client OTA R-104 et serveur. Comparer aux composants d'ouverture de projet déjà existants et à l'historique du correctif moteur de rendu cité en phase E. Aucun écran ou routeur parallèle.
- **Tests :** Plusieurs projets, vides/non vides, Basic/Pro, mode hors ligne, après rechargement ; ouverture réelle sans rebond dashboard, intégrité des données et outils disponibles.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** CAUSE ÉTABLIE ET CORRIGÉE SUR main (Web) ; **à vérifier sur appareil** avec une build > 43.
- **Cause :** la build 1.45 (43) embarque le moteur de rendu `cb26d7cb7ccc980b` (md5 756941e5…) : `platforms/web/bevy-renderer/src/lib.rs#queue_web_ops` réveille le rendu sans lever `WEB_REDRAW_PENDING` → `redraw_applied` reste figé → `waitForBevyDiffPresentation` lève `bevy_renderer_diff_present_timeout` → `project_workspace_activation_runtime.js` remet le Dashboard. main l'avait corrigé (05e58963d, `request_web_redraw()`, paire `56e875eee68a1239`, md5 b64dea1c…) ; la build 42 l'avait, la 43 (faite depuis la base R-104) non. La fusion garde le correctif (renderer identique à 515a50b05).
- **Preuves :** D11 sur l'arbre R-104 : échec après rechargement (`diff_present_timeout`, file 107/107) ; main fusionné 6/6 ; `temp/r104merge/probes/project_open_real.probe.mjs` (création, forme, rechargement, deux réouvertures par touchers) 0 échec.

## BUG-013 — Création d'un projet vide impossible

- **Priorité :** Critique — création bloquée.
- **Statut :** Signalement utilisateur sur iOS, version 1.45 build 43 ; régression à confirmer par l'historique.
- **Zone :** Dashboard → Créer → Projet vide.
- **Constat :** La création d'un projet vide ne fonctionne plus.
- **Attendu :** Créer un véritable projet vide, obtenir un identifiant valide, l'enregistrer et l'ouvrir immédiatement, puis le retrouver après fermeture et réouverture.
- **Enquête :** Distinguer échec d'écriture, erreur d'autorisations/contrats, erreur de création, rendu vide normal et retour dashboard causé par BUG-012. Réutiliser les outils de création et de workspace existants, ne pas fabriquer de modèle parallèle.
- **Tests :** Créer → ouvrir → sauvegarder → fermer → rouvrir ; vérifier absence de doublons, persistance et sélection correcte.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** MÊME CAUSE que BUG-012 (création = `ui.project.open` puis activation) ; corrigé sur main (Web), à vérifier sur appareil.
- **Preuves :** `project_open_real.probe.mjs` 1a–1d (Créer › Projet vide par touchers → projet créé, enregistré, ouvert, sans retour au Dashboard).

## BUG-014 — Sport : le décompte d'un exercice ne démarre plus

- **Priorité :** Haute — séance non pilotable normalement.
- **Statut :** Signalement utilisateur sur iOS, version 1.45 build 43.
- **Zone :** Activités → Sport → Exercice / étape / repos chronométrés.
- **Constat :** Démarrer un exercice ne déclenche plus le décompte attendu.
- **Attendu :** Le temps commence, s'actualise et finit l'étape selon les réglages natifs, avec pause/reprise et arrêt fonctionnels ; distinguer les exercices en durée des séries en répétitions et des chronomètres libres.
- **Enquête :** Tracer l'action sur le vrai outil, l'identifiant de session, l'horloge basée sur les horodatages partagés, les événements et la projection d'affichage. Vérifier la transition de pas et de repos. Ne pas dupliquer le moteur de temps.
- **Tests :** Séance chronométrée, repos, navigation dashboard et retour, pause/reprise, expiration, mise en veille/réveil, clôture et absence de doublons.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** NON REPRODUIT sur Web (main et R-104) — **test appareil requis**.
- **Essais :** `temp/r104merge/probes/sport_countdown_real.probe.mjs` (Pompes, Développé couché, Gainage chronométré 0:21→0:14 ; 3-2-1, repos, pause, arrêt, une seule session) : 0 échec sur main et sur R-104. Code de lancement identique base / R-104 / main ; moteur à horodatages inchangé.
- **Hypothèses iOS :** le même moteur de rendu de la build 43 (BUG-012 : l'anneau du disque est un enregistrement de surcouche) ; `workout().prepare()` (autorisation HealthKit) qui ne rend pas la main ; `beeps.ready()` natif ; refus de la porte de types Swift sur d'anciennes données. Une build > 43 tranche la première.

## BUG-015 — Outils dans un projet : audit d'exécution et d'interaction après la réouverture

- **Priorité :** Haute — complément transversal de BUG-012 et BUG-013.
- **Statut :** Audit et tests à effectuer ; ne pas présumer que tous les outils sont défectueux.
- **Zone :** Projets → outils de création, sélection, édition, Liste, Finder et outils contextuels existants.
- **Demande :** Vérifier l'utilisation effective des outils lorsque le projet est ouvert, au-delà de leur simple affichage.
- **Attendu :** Chaque action proposée déclenche sa vraie commande, agit uniquement sur les objets autorisés, avec les options natives au bon emplacement et une persistance cohérente. Ne pas inventer d'outils ou d'interface parallèle.
- **Enquête :** Identifier les composants et commandes réels ; suivre événements tactiles, sélection, focus, dispatcher, contrats, réponse du modèle, rendu et sauvegarde. Vérifier les cas Basic/Pro et sans/avec sélection.
- **Tests :** Créer un objet via l'outil natif, le sélectionner, modifier une propriété, ouvrir la Liste/Finder si disponibles, vérifier le résultat et sa persistance après retour au dashboard et réouverture. Ne pas tester une option qui n'existe pas dans le module réel.


### Résultat 2026-11-01 (fusion R-104 → main, Claude)

- **Statut :** AUDIT FAIT sur Web — aucun outil défaillant trouvé.
- **Sonde :** `temp/r104merge/probes/project_tools_real.probe.mjs` 18/18 (bureau 1280) : Créer › Forme + glisser → forme ; un toucher sur Créer éteint l'outil verrouillé (la racine porte l'outil actif, voulu) ; Créer › Texte + toucher + frappe → texte enregistré après un toucher ailleurs (Échap annule, voulu) ; toucher la forme → sélectionnée, outils contextuels (Annuler, Taille, Forme, Plan, Arrondi, Ombre, Masque, Téléport, Liaison, Fond) ; Arrondi → rayon 60 enregistré ; Vue → Naturel / Tableau / Liste ; Trouver → Finder listé ; Organiser → Dashboard ; réouverture et rechargement : forme et texte présents, Forme crée encore. `project_shape_color.probe.mjs` : Couleur change la forme (stockée et rendue).
- **Observation non corrigée :** une forme naît bleue (`genesis.js` preset `color #3b7bff`) alors que `shape_creation_runtime.js` voulait le blanc (`background`) — pas une régression (depuis le 30 sept.), pas bloquant.
- **Non couvert :** Basic vs Pro (niveau) ; appareil iOS.

<!-- Ajouter ici les prochaines entrées BUG-016, REG-003, TÂCHE-015, etc., sans effacer les précédentes. -->
