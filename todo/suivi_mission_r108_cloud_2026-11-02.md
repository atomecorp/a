# Suivi de mission — R-104 / R-108 en session cloud (2026-11-02)

Relié au registre canonique : `todo/REGISTRE_DEMANDES.md` (R-107, R-108) et au registre de débogage
`todo/registre_debug_r104_2026-11-01.md` (31 entrées du dossier d'origine + BUG-016). Ce fichier est le suivi de la
mission cloud du 2 novembre ; il ne remplace aucun des deux.

Source des demandes : dossier `R104_MAIN_PACKAGE_2026-11-01/mission/03_REGISTRE_COMPLET_BUGS_ET_EVOLUTIONS.md`
(31 titres `##`, recomptés depuis le fichier ; SHA-256 `04b4508c…`), BUG-016 ajouté le 1er novembre au soir
(`todo/rapport_incident_ios_build44.md`), décisions V5 D1–D6 (`AUDIT_DESIGN_V5.md`). Total suivi : 32 entrées + 6 décisions.

## 1. Base et branches

| Dépôt | Base (origin/main, inchangée sur GitHub le 2 nov.) | Branche de session |
|---|---|---|
| atomecorp/a | `9c8f11af8` | `claude/magical-ptolemy-x4b0re` |
| atomecorp/eVe | `29a07f03` | `claude/magical-ptolemy-x4b0re` |

La fusion `refonte-r104` est déjà dans les deux `main` (vérifié : `89905ebc` ancêtre de eVe `main`, `49aac0d22` ancêtre
de a `main`). Le sous-module eVe est initialisé au chemin `a/eVe` par HTTPS (configuration locale du clone cloud
seulement : `.gitmodules` inchangé) ; tous les tests ci-dessous chargent eVe à ce chemin.

## 2. Légende

- **Code** : CORRIGÉ (cette mission) · CORRIGÉ-ANTÉRIEUR (commit antérieur, vérifié ici) · INCHANGÉ (aucun défaut démontré)
  · À DÉCIDER (nouvelle apparence, interaction ou conflit de charte : règle 16) · ÉTUDE (fonction nouvelle à concevoir).
- **Tests cloud** : type de preuve — *Vitest* (test du dépôt), *Web réel* (app complète dans Chromium/WebGPU, serveur de
  test isolé, gestes ou commandes canoniques), *Node* (sonde de logique), *Revue* (lecture de code), *Syntaxe* (swiftc -parse).
- **Appareil** : aucun essai iPhone, iPad ou montre n'a été fait dans cette mission. « NON FAIT » partout ; le scénario
  attendu est au § 5. Aucun correctif iOS n'est déclaré validé.

## 3. Les 32 entrées

| ID | Demande (doc. 03) | Reproduction / limite | Cause et propriétaire | Correction (fichiers) | Code | Tests cloud | Commit | Appareil | Décision requise |
|---|---|---|---|---|---|---|---|---|---|
| REG-001 | N° de série absent des réglages avancés | Non reproduit comme régression (jamais affiché, `git -S`, 1er nov.) | — | — | INCHANGÉ | Revue (antérieure) | — | NON FAIT | Oui : quelle valeur est « le numéro de série » |
| BUG-001 | Scanner de produits | Caméra frontale au scan (1er nov.) ; lecteur iOS natif `AppNativeBarcodeScanner.swift` (EAN-13/8, UPC-E) câblé (3 commandes déclarées et routées, revu ici) | `dashboard_mystic_capture.js#start` | `cameraPosition: 'back'` (eVe `83556da1`) | CORRIGÉ-ANTÉRIEUR | Revue ; Web 7/7 (Mac, 1er nov., non rejoué) | eVe `83556da1` | NON FAIT | Non |
| REG-002 | Ajout de produit par photo | Non reproduit : case Photo à la racine | — | — | INCHANGÉ | Revue (antérieure) | — | NON FAIT | Oui : case aussi dans catégories / recherche ? |
| BUG-002 | Appui long sans menu | Non reproduit sur Web (1er nov.) | — | — | INCHANGÉ | — (non rejoué) | — | NON FAIT | Oui : sélection multiple = fonction nouvelle (maquette) |
| TÂCHE-001 | Corriger une mesure Santé (sommeil) | Fonction nouvelle | — | — | ÉTUDE | — | — | — | Oui : maquette de saisie |
| BUG-003 | Date de naissance en rouleaux, Rencontre | Corrigé le 1er nov. | `bevy_panel_home_birth.js`, `meeting_contract.js#normalizeBirthDate` | eVe `fb5aa1f0`, a `668f7ead7` | CORRIGÉ-ANTÉRIEUR | Vitest `bevy_panel_home_lifecycle` (désormais suivi par Git) vert | antérieurs | NON FAIT | Non |
| BUG-004 | Poids/taille en rouleaux | Conflit avec la règle 14 (ligne-curseur) | `bevy_panel_home_*` | — | À DÉCIDER | — | — | — | Oui : rouleau ou ligne-curseur |
| BUG-005 | Sport impossible à arrêter après un retour | Web réel : lancement → Dashboard → réouverture → **Stop OK 3/3** ; « En direct » (ouvert par ▶) n'a que ✕ et ▶ ; aucun Stop dans son historique (fichier créé le 29 oct. ainsi) | `dashboard_ongoing_scene.js` (pied), arrêt sur la carte | — | À DÉCIDER | Web réel `r108_sport_session_web` 11/11 ; capture « En direct » | — | NON FAIT | Oui : (a) Stop au pied de « En direct » ou (b) ▶ ouvre la carte quand une seule activité tourne |
| BUG-006 | Indicateur « en cours » | 2 causes d'état corrigées le 1er nov. ; Web réel : séance listée « en cours » après retour, entrée rouvrant la même séance | `dashboard_communication_input.js`, `dashboard_ongoing_resume.js` | eVe `70c845cf` | CORRIGÉ-ANTÉRIEUR (+1 cause à décider) | Web réel 11/11 | antérieur | NON FAIT | Oui : ▶ recouvert par un panneau sur téléphone (`readStageRect` ignore `keepFree`) |
| BUG-007 | Lancement montre parfois impossible | Revue (E4 corrigé le 1er nov.) | `WatchSensorSession.swift` | E4 a `b4d6cac5` | CORRIGÉ-ANTÉRIEUR (partiel) | Revue | antérieur | NON FAIT | Non (E1 : essai montre + iPhone tué) |
| BUG-008 | Arrêt impossible sur la montre | **E1 démontré au code** : l'iPhone ne garde la séance de la montre qu'en mémoire ; tué, rien ne l'arrêtait plus et la montre rejouait son départ depuis le contexte pendant 6 h — corrigé : l'iPhone publie « aucune séance » à son démarrage, la montre termine la sienne (l'enregistrement est fermé et transmis). **E3** : le curseur d'arrêt (`DragGesture` dans la `ScrollView` horizontale à pages) perdait le geste au profit du défilement — priorité donnée au curseur quand le doigt part du disque, geste et apparence inchangés. **E2 démontré au code** : `WatchLink.send` abandonnait toute requête sans iPhone joignable (arrêt perdu, vibration « arrêt » jouée) | `WatchLink.swift#send`, `AppWatchSensorBridge.swift` | Action de carte confiée à `transferUserInfo` (file garantie), reçue par `didReceiveUserInfo` | CORRIGÉ (E1, E2, E3) | Syntaxe (`swiftc -parse`) ; pas de build Apple | a `9503d7e1` (E2), commit E1 ci-dessous | NON FAIT | Retour visuel quand l'iPhone est absent (seule question restante) |
| TÂCHE-002 | Revoir l'indicateur de session | Design | `dashboard_communication_input.js#ongoingNode` | — | À DÉCIDER | — | — | — | Oui (lié à BUG-005) |
| TÂCHE-003 | Maquettes Activités montre | Maquettes à produire au format montre | `WatchScreens.swift`, `WatchCardScreen.swift` | — | À DÉCIDER | — | — | — | Oui |
| BUG-009 | Outil Web sans page | Reproduit le 1er nov. : refus d'encadrement de la page | `web_page_player.js` | — | À DÉCIDER | — | — | — | Oui : contrôle serveur ou autre moteur |
| TÂCHE-004 | Moteur / page de départ configurable | Fonction nouvelle (`SEARCH_ENGINE` en dur) | `web_runtime.js` | — | ÉTUDE | — | — | — | Oui : préférence + maquette |
| TÂCHE-005 | Importer un HTML dans Web | Étude | `html_import.js`, `web_page_player.js` | — | ÉTUDE | — | — | — | Oui |
| TÂCHE-006 | Page Web → format natif | Étude (récupération serveur nécessaire) | `html_import.js` | — | ÉTUDE | — | — | — | Oui |
| TÂCHE-007 | Vidéos : date, plus récents d'abord | Serveur fait le 1er nov. (`order`, `publishedAt`) | `server/ws_youtube_search.js` | a `7608f417` | CORRIGÉ-ANTÉRIEUR (serveur) | Node 5/5 (clone propre, `logs/` créé par le logger) | antérieur | — | Oui : affichage de la date (maquette) ; déploiement serveur sur accord |
| TÂCHE-008 | Tri date/alpha réutilisable | Fonction nouvelle (`FINDER_SORTS` à partager) | `bevy_panel_finder_model.js` | — | ÉTUDE | — | — | — | Oui (UI du tri) |
| TÂCHE-009 | Loupe → deux dalles | Design | `dashboard_footer_navigation.js` | — | À DÉCIDER | — | — | — | Oui |
| TÂCHE-010 | Vidéo : clic contrôles, double clic plein écran | Inversion d'interaction | `dashboard_media_scrub.js#handlers` | — | À DÉCIDER | — | — | — | Oui |
| TÂCHE-011 | Timeline sous les outils | Mise en page | `dashboard_media_scrub.js#geometry` | — | À DÉCIDER | — | — | — | Oui |
| TÂCHE-012 | Transparence / flou des surcouches | Style | `dashboard_media_scrub.js`, `dashboard_glass_material.js` | — | À DÉCIDER | — | — | — | Oui |
| BUG-010 | 6 outils sur une ligne | Régression confirmée (042f50bf, 29 oct.) mais impossible à 402/393 pt sous les règles 12–14 | `bevy_panel_band.js` / pied de panneau | — | À DÉCIDER | — | — | — | Oui : (1) bande hors pied, (2) bord à bord, (3) 3+3 |
| BUG-011 | Retouche : panneau vide | Comportement de la règle 18 | `media.js#requestMediaSelection` | — | À DÉCIDER | — | — | — | Oui : Images allumé par l'appelant ? |
| TÂCHE-013 | Capture : grand aperçu + Liste | Design | `dashboard_takes_*` | — | À DÉCIDER | — | — | — | Oui |
| TÂCHE-014 | Capture : bande sur une ligne | Design (dépend de BUG-010) | `dashboard_takes_band.js` | — | À DÉCIDER | — | — | — | Oui |
| BUG-012 | Ouverture projet → Dashboard | Cause sur l'iPhone (44) : quota `localStorage` plein (66 295 flux). Reproduit ici (Vitest, quota 5 M car. ; Chromium réel, quota saturé). Cas limites démontrés : id d'appareil absent → le constructeur levait, aucune libération ; libération après les premières écritures du démarrage ; clé illisible → migration rejetée pour la session, quota plein ; échec IndexedDB → jamais retenté | `sync_scope_store.js`, `sync_engine.js`, `spark.js` | IndexedDB (a `c95afeb4`, antérieur) + libération au démarrage, id d'appareil après libération, clé illisible gardée telle quelle (`unreadable_legacy:<clé>`) et signalée, échec signalé et retenté | CORRIGÉ (cas limites) + ANTÉRIEUR | Vitest `sync_scope_quota` 7/7 (4 rouges avant), `sync_engine` 12/12 ; Web réel `r108_project_quota_web` 26/26 (5 créations, 5 ouvertures sous quota saturé) | a `136c922e` | NON FAIT | Non |
| BUG-013 | Créer › Projet vide → Dashboard | Même chemin (`ui.new_project` → activation → `setCurrent`) | idem | idem | CORRIGÉ | Web réel : 5 créations par `ui.new_project` restées dans leur projet | a `136c922e` | NON FAIT | Non (5 projets `TEST-B44-n` sur l'iPhone, sur accord) |
| BUG-014 | Le décompte ne démarre plus | Non reproduit : Web réel 3-2-1 puis séance en cours, compteur qui avance (3 exécutions sur 3) | `dashboard_training_session.js` | — | INCHANGÉ | Web réel 11/11 | — | NON FAIT | Non |
| BUG-015 | Outils dans un projet | Web réel : forme créée par Créer › Forme › Cercle + toucher, outil désarmé par son emplacement de palette, sélection par toucher, couleur, Liste et retour, Dashboard, réouverture : forme gardée avec sa couleur. Aucun défaut trouvé | — | — | INCHANGÉ | Web réel `r108_project_tools_web` 13/13 | — | NON FAIT | Non |
| BUG-016 | Cadence des bips (44) | Simulation de pont asymétrique : premier bip 124 ms d'erreur, ancrage recréé à chaque séance, remplacé de force après 60 s | `training_sound.js` (horloge native) | Intersection des intervalles des lectures (élargis de la dérive 1e-4), ancrage par fenêtre partagé entre séances, 3 lectures dans `ready()` ; moteur et horloge natifs inchangés | CORRIGÉ | Vitest `training_beep_clock` 4/4 (3 rouges sur l'ancienne version) : premier bip 41 ms, ≤ 3 ms dès le 5e, séance suivante 0–1 ms | eVe `d364671f` | NON FAIT | Non (mesure audio sur l'iPhone) |

## 4. Design V5 (décisions, rien n'est codé)

| ID | Question | Référence | Statut |
|---|---|---|---|
| D1 | Libellé des tuiles 120 : centré (actuel) ou en haut à gauche 14 px + trait rose | `mockups/m1_tuiles_v5.png` ligne B | À DÉCIDER |
| D2 | Surface : verre teinté par rubrique ou dégradé commun | ligne C | À DÉCIDER |
| D3 | Libellé des outils 60 : 12 px ou 9 px | ligne D | À DÉCIDER |
| D4 | Rayon d'un outil 60 : 6 px (règle 14) ou 12 px | ligne D | À DÉCIDER (modifie la règle 14) |
| D5 | Heure/météo : en-tête validé ou tuiles | `ref/v5_a_portrait.png` | À DÉCIDER |
| D6 | iPhone Duo | aucun appareil ni API dans le dépôt | BLOQUÉ |

## 4 bis. Non résolu, à faire par l'agent

- Maquettes aux vrais jetons : BUG-005 (a) faite (rendue par l'app réelle, page des décisions) ; restent BUG-006 (capture du défaut faite), BUG-010, BUG-011, BUG-004 et les TÂCHE de design.
- (BUG-008 E1 et E3 corrigés en code le 2026-11-02 ; essai montre requis.)

## 5. Essais appareil à faire (scénario et preuve attendue)

1. **Identité du runtime** (iPhone) : installer une build contenant a `≥ 136c922e` / eVe `≥ d364671f` ; preuve : version JS lue
   dans l'app (le numéro de build seul ne suffit pas : le paquet de test et la build installée portaient tous deux 44).
2. **BUG-012/013** : au premier lancement, `localStorage` ne contient plus `squirrel_sync_streams_v1` / `…cursors_v1`
   (copie en lecture seule) ; 5 ouvertures de projets existants et 5 créations `TEST-B44-n` restent dans leur projet ;
   console sans `QuotaExceededError` ni `sync_scope_*_failed`.
3. **BUG-015** : dans un projet rouvert, forme par Créer › Forme, sélection, couleur, Liste/Finder, réouverture.
4. **BUG-014/016** : séance Sport enregistrée au micro du Mac (volume haut, iPhone près du micro) ; intervalles mesurés
   entre bips de répétition (attendu 2 000 ms ± 20 ms), y compris les trois premiers de la séance et ceux d'une deuxième séance.
5. **BUG-005/006** : lancer, revenir au Dashboard, ▶ visible (aussi avec un panneau ouvert), rouvrir, arrêter.
6. **Montre (BUG-007/008)** : protocole `temp/r104merge/agents/watch/protocole_montre.md` (Mac) ; en plus pour E2 : iPhone
   hors de portée (mode avion), arrêter sur la montre, revenir à portée : la séance de l'iPhone s'arrête.
7. **BUG-001** : scan d'un code EAN avec la caméra arrière ; **BUG-003** : rouleaux de date de naissance, âge du Sport.

## 6. Tests du clone propre

- Corrigés : `tests/vitest.setup.mjs` (polyfill `localStorage` en mémoire seulement si le runtime n'en a pas) et
  `tests/eve/bevy_panel_home_lifecycle.test.mjs` étaient ignorés par Git (règle `tests/*`) : désormais suivis ;
  `server/server_logger.js` crée `logs/` (le serveur et ses tests plantaient sans) ; le contrat iOS de sync lit aussi
  `FastifySyncSubscriptions.swift` ; manifeste trié comme son garde l'exige (a `213a2e00`).
- Toujours absents du dépôt (présents seulement sur le Mac) : 209 suites du manifeste et `tests/fixtures/molecule/…`.
  Le garde `vitest_manifest_guard` reste rouge sur un clone propre pour cette raison (environnement, pas un défaut du code).
- Échecs Vitest restants sur le clone propre : voir le compte rendu de mission (§ 7) ; classés environnement
  (WebGPU / renderer absent sous jsdom, fichiers locaux manquants) ou préexistants, aucun introduit.
- Web réel : serveur Fastify de test isolé (`SQUIRREL_AUTH_SMS_MOCK=1`, mode test, SQLite sous `temp/`), Chromium sous
  Xvfb (SwiftShader headless perd son périphérique WebGPU dans ce conteneur : pas d'image partagée pour la swapchain).
  Sondes : `tests/probes/r108_project_quota_web.probe.mjs`, `r108_project_tools_web.probe.mjs`, `r108_sport_session_web.probe.mjs`.

## 7. Compte rendu des échecs de la suite complète

Exécution `npx vitest run` sur la branche de session (a `694f4fa7`, eVe `1293fc09`), clone propre, setup réel :
250 fichiers présents sur 457 listés, **1 829 tests verts, 335 rouges**, 7 ignorés. Référence (a `c441bef` / eVe
`8dfc88ed`, même environnement mais sans setup) : 353 rouges.

- **Introduits par la mission : 0.** Un seul test rouge ici et vert sur la référence (`background_default_wallpaper_contract` :
  « a partial preference publication at launch… ») passe 3 fois sur 3 lancé seul : instable sous charge, préexistant.
- **20 tests rouges sur la référence sont verts ici** (setup réel, contrat iOS de sync, manifeste, `logs/`).
- **Environnement (clone propre / jsdom)** : renderer Bevy et WebGPU absents sous jsdom (`bevy_renderer_export_required`,
  `buildFixedContent is not a function` sur des doubles incomplets), `HTMLMediaElement` non implémenté, 209 suites et des
  helpers de test (`tests/eve/bevy_ui_main_menu_test_helpers.mjs`, `project_view_regression_test_helpers.mjs`) présents
  seulement sur le Mac.
- **Préexistants (tests périmés)** : des tests importent des modules supprimés de l'historique d'eVe
  (`elements/design/panel_chrome_tokens.js`, `bevy_panel_notification_table.js`, `panel_layout_geometry.js`).
- Gardes du dépôt (état final) : `check:syntax` (3 406 fichiers), `check:no-fallbacks`, `check:component-reuse-guardrails`,
  `check:browser-shared-contract-imports`, `check:mutation-ownership-guardrails`, `check:dom-projection-guardrails`,
  `check:empty-catch-budget` (357, inchangé), `registry:check` : tous à 0. `check:map-paths` : rouge, uniquement sur des
  tests cités par les cartes et absents du clone (environnement).

Ces échecs ne prouvent pas le bon fonctionnement : l'acceptation des correctifs repose sur les tests ciblés (§ 3) et sur
les sondes Web réelles ; l'acceptation iOS reste à faire (§ 5).

Page des décisions (captures de l'app réelle, maquette V5) : https://claude.ai/artifact/A64AyZo1pEgeidZJm8qJmC (privée).

## 8. Retours iPhone du 2 nov. 2026 (après la build de main)

- **Assistante muette pendant son ouverture (« Attends, je prépare tes documents », puis plus rien)** — journal Xcode :
  la phrase est jouée, aucune session de conversation ne se connecte, aucune erreur n'est remontée. L'ouverture n'avait
  aucun délai maximal. Correctif (eVe `voice/assistant/assistant_runtime.js`, `assistant_voice_announcer.js`,
  `domains/dashboard/dashboard_eve_atom.js`) :
  - toujours pas connectée à 8 s : elle dit « Encore un instant, je me connecte. » ;
  - à 25 s : l'ouverture échoue, dit et affiché (« Je n'arrive pas à me connecter. Réessaie dans un moment, ou
    écris-moi. »), cette ouverture est abandonnée (une connexion tardive est ignorée), et l'accueil se ferme de
    lui-même : le disque part dans son coin, les tuiles arrivent ;
  - pendant l'ouverture, sa phrase en cours s'affiche dans ses sous-titres existants (aucun nouvel élément d'interface) ;
  - une connexion réussie la range déjà d'elle-même dans son coin (inchangé).
  Tests : `tests/eve/assistant_startup.test.mjs` (2 nouveaux cas). Deux répliques Siwis rendues (`lines_fr/`).
  La **barre de progression** demandée est un nouvel élément d'interface : maquette à valider avant (règle 16).
  La cause de la connexion qui n'aboutit pas reste à trouver avec le journal `voice.assistant.open.timeout`.
- **Micro coupé pour écrire à l'assistante : le champ passe en recherche** — le champ ne s'adressait à elle que dans son
  coin (`engaged = present && isDocked()`) ; au centre il restait la recherche. Correctif : avec elle présente, le champ
  lui écrit, au centre comme dans son coin (`dashboard_eve_atom.js#engaged`).
- Ni l'un ni l'autre n'est validé sur appareil.
- Audit MCP (R-109) : en attente du feu vert explicite de l'utilisateur, après ces corrections et leur vérification.
