# Entrées contextuelles iOS (eVe général / eVe Musique) — audit et faisabilité (R-192, 2026-11-16)

Source : prompt collé le 16 nov. 2026 (« entrées contextuelles iOS, TestFlight et App Store »). Le prompt demande
l'audit et la faisabilité du premier lancement **avant** toute modification structurelle : ce document est ce
livrable, complété le même jour par le code (§4 à §9).

## 1. Audit de l'existant (vérifié dans le code)

### Universal Links : déjà en place, pour l'authentification seulement
- Entitlement `applinks:atome.one` (`platforms/ios/atome-auv3/application/atome.entitlements:15-17`, idem Release et CarPlay).
- AASA servi par les deux serveurs, identique : appID `2W25PVZ57F.one.atome.app`, chemins `['/auth/v/*']`
  (Node `server/auth_routes_server.js:10-13` ; Rust `atome/servers/atome-server/src/status.rs:88,418-428`).
- Réception native : `AppDelegate.swift:32,37` (SwiftUI `onOpenURL` / `onContinueUserActivity`) et
  `SceneDelegate.swift:6-39` (démarrage à froid `connectionOptions`, reprise `continue userActivity`, `openURLContexts`).
  Tout passe par **une seule boîte** : `Common/AuthLinkInbox.swift` (n'accepte que `https://atome.one/auth/v/<43>#t=<43>`,
  garde 300 s, une seule livraison, émet `atome:auth-link-available`, commande native `auth_link_take`,
  `WebViewManagerIPC.swift:77-79`).
- Consommateur JS : `atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js#initializePhoneLinks` (`:301`,
  tirage initial `:409-411`, écoute `:406`), appelé pendant `tryAutoLogin`, donc **avant** `squirrel:auth-checked`.
- La page iOS est toujours `atome:///src/index.html` : le chemin du lien n'atteint jamais `location` ; seul le pont natif le porte.
- Schéma `atomeapp://` déclaré (`Info.plist:52-62`).

### Démarrage et premier écran
- Web : `early-init.js` (script classique, avant tout module) → `spark.js` → `application/index.js` → `eVe.js#startEve`.
  `early-init.js` retire déjà `#auth-link=` et `#invite=` de l'URL dans des valeurs à usage unique.
- Le premier écran est décidé par `eVe/intuition/runtime/eve_intuition/boot_runtime.js` (`:251-263`, `:321-332`) :
  connexion si non authentifié, sinon `openWorkspaceDashboardWithProjectBootstrap`.
- Le Dashboard n'est peint qu'après `waitForHomePreferences()` (`user_workspace_bootstrap_runtime.js:10-16`,
  `workspace_surface_preference.js:222-261`) puis `openWorkspaceHomeProjection({templateKey:'dashboard_eve'})`.
  **C'est le point unique où un contexte de démarrage peut être lu sans affichage intermédiaire.**
- **eVe n'affiche jamais de Dashboard avant l'authentification.** Conséquence décisive pour le premier lancement (§3).

### Variantes du Dashboard
- Seules variantes existantes : le style `eve` (Pro) / `eve_basic` (Basic), `user_visual_preferences_model.js:40-45`,
  résolu dans `dashboard_home_style.js:25-34`.
- Tuiles de l'accueil **codées en dur par style** (`dashboard_mystic_grid.js:17-24,54-58`, places `dashboard_home_matrix.js:28-99`).
- Contenu des rubriques **piloté par le registre** (`eVe/registry/registry_model.js:17-35` : dimensions `scope`,
  `profile.style`, `requires`, `activity`, `work_mode`… ; `registry/source/placements.json`).
- Profils de vie : filtrent des éléments de liste, pas des rubriques ni des outils. Aucun profil « musique ».
- Aucun routeur, aucune « intention de lancement », aucun profil « Musique » n'existe.

### Outils musicaux réels
- Capture › Audio, MIDI, Instruments (`instrument_*`, sampler), Effets (`fx_dsp_*`, chaînes) — `dashboard_instruments.js`,
  `dashboard_instrument_*.js`, `dashboard_effect_*.js`, `dashboard_sample_editor*.js`.
- Médiathèque › Musique (`fun_music`, requiert `music:provider`), `media_audio`, `media_lists`.
- Objectifs › famille musique (album, titre, concert, podcast) ; programme `music_title`.
- Création › générateur audio IA.
- Dans un projet : Molécule (console/mix), Timeline, édition audio, audio→MIDI, piano roll.
- Projets : pas de type « musique » dans le filtre (santé, code, création, site).

### Persistance
- Par utilisateur, synchronisé serveur : `preferences` du profil (`profile_api.js:180,360`), section `workspace`
  normalisée (`workspace_surface_preference.js:44-52`). → lieu naturel de « dernier environnement » (règle 21).
- Par appareil et par personne : `localStorage` clé par principal (`visual_level_cache.js`, `dashboard_home_return.js`).
- Précédent d'intention qui survit à la connexion : `?event=` (`public_event_link.js:21-31`, consommé après présentation
  du Dashboard). Aucun magasin générique d'intention en attente.

### Chargement du code sur iOS
- `platforms/ios/package_ios_runtime.mjs` : esbuild (bundle, splitting, ESM), registre embarqué
  `__ATOME_PACKAGED_MODULES__`, tout servi par le schéma `atome://` depuis le bundle ; WASM et workers copiés dans le
  bundle ; aucune URL distante de code ou de WASM trouvée dans le JS.
- `server/http_ios_ota_routes.js` = distribution développeur de l'**application entière** (installation ad hoc), pas un
  téléchargement de code exécuté par l'app.
- Sites publiés : `atome.one/<slug>` (`server/site_http.js:113-125`). `eve` est un slug réservé, `music` ne l'est pas.

## 2. Liens proposés

`atome.one` est déjà associé à l'app (entitlement + AASA) ; `atome.app` exigerait un nouveau domaine, son certificat,
son AASA et une nouvelle signature d'entitlement. Proposition : `https://atome.one/eve` et `https://atome.one/music`
(réserver `music` comme `eve` dans `site_contract.js` / `contract.rs`, ajouter les deux chemins à l'AASA).
Sans l'app installée, ces mêmes adresses ouvrent la page Web d'eVe, qui garde le contexte et propose l'installation.

## 3. Faisabilité du premier lancement — conclusion

| Mécanisme | Ce qu'Apple transmet réellement | TestFlight | Verdict |
| --- | --- | --- | --- |
| Universal Link, app non installée | Rien : Safari ouvre la page Web | — | Ne transmet pas le contexte |
| « Obtenir » sur l'App Store puis ouverture par l'icône | Rien | — | Ne transmet pas le contexte |
| Custom Product Page + deep link | Le lien, **seulement** par le bouton « Ouvrir » de la page, iOS 18+, après revue Apple ; signalé non exécuté si « Ouvrir » est touché juste après l'installation | Non (App Store seulement) | Partiel, jamais par l'icône |
| App Clip → app complète (conteneur partagé du groupe d'apps) | Ce que le Clip a écrit | Oui (invocations TestFlight) | Fiable mais lourd : 2ᵉ cible, Clip devant offrir une vraie fonction (risque de revue) |
| Presse-papiers | Lecture = alerte système « Autoriser le collage » | Oui | Fiable mais une alerte à chaque fois, peu zen |
| Empreinte (IP, appareil) | — | — | Interdit, écarté |
| **Le compte porte le contexte** | eVe exige la connexion avant tout Dashboard ; le contexte est lié côté serveur à l'invitation ou à l'inscription faite depuis le lien | Oui | **Déterministe et conforme** |

**Conclusion.** Apple ne garantit **aucun** passage du contexte pour « lien → Obtenir → installation → icône » d'une
personne anonyme. Le critère « premier lancement sans seconde action » est donc **impossible par les seuls mécanismes
Apple** dans ce parcours, et sera signalé non satisfait s'il reste anonyme.

Il devient satisfaisable de façon déterministe parce qu'eVe impose la connexion avant tout Dashboard : l'inscription
est sur invitation ; si le lien musical porte (ou crée) l'invitation, le serveur enregistre `start_environment = music`
dans l'invitation puis dans les préférences du compte créé. Au premier lancement, la personne se connecte (étape
obligatoire de toute façon), le profil arrive avec le contexte, et le premier Dashboard peint est le Dashboard musical,
sans aucun Dashboard général intermédiaire et sans retoucher le lien. Pour une personne déjà inscrite, le contexte
du dernier lien vit dans ses préférences : le premier lancement sur un nouvel iPhone l'ouvre aussi. En complément,
pour la future distribution App Store : une Custom Product Page « Musique » avec deep link `https://atome.one/music`
(cas « Ouvrir » depuis la page).

## 4. Ce qui est codé (16 nov. 2026)

Le Dashboard complet (eVe tout en un) est inchangé : c'est le domaine racine `eve`, ouvert par `/eve` et par toute
ouverture sans lien d'un compte qui n'a jamais eu de domaine.

| Couche | Fichier | Rôle |
| --- | --- | --- |
| Lecture du domaine | `eVe/domains/dashboard/dashboard_home_style.js#readDashboardDomain` | publié (`preferences.workspace.domain`), sinon le dernier connu de ce compte sur l'appareil |
| Mémoire par personne | `eVe/intuition/menu/visual_level_cache.js#rememberKnownDashboardDomain` | cache local par principal (aucun mélange entre personnes du même appareil) |
| Propriétaire | `eVe/domains/dashboard/dashboard_domain.js` (nouveau) | prise du lien (Web/iOS), priorités, publication, sauvegarde dans le compte, bascule app ouverte, invitation iOS |
| Avant le 1er affichage | `user_workspace_bootstrap_runtime.js` (`settleDashboardDomain`) | l'accueil n'est peint qu'une fois le domaine réglé |
| Registre | `eVe/registry/registry_model.js#domainNarrows`, schéma `visible_when.domain`, 36 placements marqués | un niveau où un placement nomme le domaine n'en montre que ceux-là ; sinon il reste entier |
| Rubriques | `dashboard_registry_levels.js` | contexte du registre avec le domaine (rubriques, niveaux, recherche) |
| Accueil | `dashboard_mystic_grid.js`, `dashboard_home_matrix.js` (`DOMAIN_SWAPS`) | tuiles du domaine seulement ; Capture dans la case de Contact (M1) |
| Web | `atome/src/squirrel/early-init.js` | `/?domain=` gardé pour l'onglet (survit à la connexion et à son rechargement) |
| iOS natif | `Common/AuthLinkInbox.swift` (`DomainLinkInbox`), `WebViewManagerIPC.swift` (`domain_link_take`) | même boîte unique des liens atome.one ; démarrage à froid, reprise, app active |
| Serveurs | `server/auth_routes_server.js`, `atome-server/src/status.rs` | AASA `/eve` `/music` ; `/eve`, `/music` → `/?domain=…` (le `#invite=` suit) |
| Slug réservé | `site_contract.js`, `atome-server/src/site/contract.rs` | `music` comme `eve` (aucun site publié ne peut le prendre) |
| Invitation | `server/auth_invites.js`, `atome-server/src/auth/invites.rs` | champ facultatif `domain: 'music'` → lien `https://atome.one/music#invite=…` |
| Packaging iOS | `platforms/ios/package_ios_runtime.mjs` | refuse tout import de module distant (2.5.2) |

Contenu du domaine Musique (registre) : accueil = Réalisations (projets et objectifs, entiers ; Nouv. › familles :
Musique seulement), Médiathèque (Musique, Audio, Listes), Capture (Audio, MIDI, Effets, Instruments, leurs niveaux
entiers) ; le bandeau du haut et la bande du bas inchangés ; la recherche ne trouve plus les autres univers.

Priorités : lien explicite > domaine du compte (dernier utilisé, sur le serveur) > domaine racine. Un lien de domaine
inconnu est refusé explicitement (`dashboard_domain_link_unknown`), jamais lu comme le domaine racine.

## 5. Les deux liens

- Général : **https://atome.one/eve**
- Musique : **https://atome.one/music**
- Invitation Musique : `https://atome.one/music#invite=<jeton>` (créée par l'API d'invitation avec `domain: 'music'`).

## 6. Configuration Apple et serveur

Serveur (rien à configurer à la main, mais il faut **déployer** ce code sur atome.one) :
- `https://atome.one/.well-known/apple-app-site-association` doit répondre `paths: ["/auth/v/*", "/eve", "/music"]`
  (vérifier : `curl -s https://atome.one/.well-known/apple-app-site-association`).
- `curl -sI https://atome.one/music` doit répondre `302` vers `/?domain=music`.
- iOS met en cache l'AASA via le CDN d'Apple : après déploiement, compter jusqu'à 24 h, ou réinstaller l'app ; en
  développement, `applinks:atome.one?mode=developer` + Réglages › Développeur › Associated Domains Development.
- Si un site publié porte déjà le slug `music`, il n'est plus servi à cette adresse (à vérifier en base avant déploiement).

App (rien à changer) : l'entitlement `applinks:atome.one` existe déjà dans les trois fichiers d'entitlements ; une
seule app, un seul bundle (`one.atome.app`).

App Store Connect, pour la future distribution App Store (pas TestFlight) :
1. Fiche principale : eVe (le domaine racine).
2. App Store Connect › l'app › Custom Product Pages › « + » : page « eVe Musique » (captures de l'accueil Musique,
   texte orienté musique).
3. Sur cette page, champ « Deep Link » : `https://atome.one/music` (iOS 18+ ; soumis à revue avec la page).
4. Lien de la page à diffuser : l'URL App Store suivie de `?ppid=<id de la page>`.
5. Rappel : ce deep link ne sert qu'au bouton « Ouvrir » de cette page ; après « Obtenir », l'ouverture par l'icône ne
   reçoit rien. Le premier lancement repose donc sur le compte (§3).

TestFlight : les deux liens fonctionnent dès que la build contient ce code et que l'AASA est déployée. Deux liens
TestFlight ne sont pas deux Custom Product Pages : TestFlight ne transmet aucun deep link.

## 7. Procédure de test sur iPhone

Prérequis : serveur déployé (§6), build TestFlight contenant ce code, un compte de test. Les liens se touchent depuis
**une autre origine** que atome.one (Notes, Messages, Mail, une page d'un autre domaine) : iOS garde dans Safari un lien
touché depuis une page d'atome.one même.

1. **Première installation, lien Musique** : app absente. Sur le Mac, créer une invitation Musique pour l'adresse de
   test. Sur l'iPhone, ouvrir le mail et toucher le lien : Safari ouvre eVe Web sur `/music` ; créer le compte avec
   l'invitation. Installer eVe depuis TestFlight, l'ouvrir par son icône, se connecter avec ce compte.
   Attendu : le premier accueil peint est l'accueil Musique, sans aucune nouvelle pression sur le lien.
2. **Première installation, lien général** : même chose avec une invitation sans domaine (ou `/eve`) : eVe complet.
3. **Test A (Safari)** : app installée et connectée ; dans Notes, toucher `https://atome.one/music` → eVe s'ouvre sur Musique.
4. **Test B (Messages, Mail)** : s'envoyer `https://atome.one/eve` et `…/music`, les toucher → bon accueil.
5. **Test C (app active)** : eVe ouverte sur l'accueil complet (et une fois dans un projet) ; toucher le lien Musique →
   bascule sans redémarrage, projet quitté proprement, rien de perdu.
6. **Test D (inverse)** : sur Musique, toucher `/eve` → eVe complet.
7. **Test E (app fermée)** : la fermer dans le sélecteur d'apps, toucher un lien → le bon accueil dès le démarrage.
8. **Test F (redémarrage)** : redémarrer l'iPhone, toucher un lien → idem.
9. **Test G (navigateurs)** : Chrome iOS, Firefox iOS ; un appui long sur le lien montre « Ouvrir dans eVe ».
10. **Sans lien** : rouvrir eVe par l'icône → le dernier domaine utilisé.
11. **Déconnecté** : se déconnecter, toucher le lien Musique, se reconnecter → accueil Musique.

Journaux utiles (Console.app, filtre `atome`) : `[DOMAIN_LINK_INBOX] accepted music`, `rejected` ; côté page, une
erreur `dashboard:domain_link` ou `dashboard:domain_save` dans les erreurs d'exécution.

## 8. Matrice des résultats

| # | Appareil / iOS | Installation | Lien | Auth | Attendu | Observé | Résultat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | Chromium (sonde Web, 430×932) | — | aucun, compte neuf | connecté | eVe complet | eVe complet | ✅ |
| W2 | idem | — | `/music` | connecté | Musique, jamais d'accueil complet affiché (26 relevés) | idem | ✅ |
| W3 | idem | — | `/music` | connecté | domaine gardé dans le compte (profil) | `music` | ✅ |
| W4 | idem | — | Capture (Musique) | connecté | Audio, MIDI, Effets, Instruments | idem | ✅ |
| W5 | idem | — | aucun, ensuite | connecté | reste Musique | idem | ✅ |
| W6 | idem | — | `/eve` | connecté | eVe complet, jamais Musique affiché ; compte = `eve` | idem | ✅ |
| I1–I11 | iPhone réel | §7 | §7 | §7 | §7 | **non testé** | — |

Preuves Web : `temp/music_env_2026-11-16/web.probe.mjs`, captures `temp/music_env_2026-11-16/web_shots/`,
rapport `temp/probe_reports/dashboard_enhancement/music_env_web_2026-11-16/report.json` ; modèle :
`temp/music_env_2026-11-16/model.probe.mjs` (36 vérifications) ; refus d'import distant :
`temp/music_env_2026-11-16/remote_import.probe.mjs`.

## 9. Limites du premier lancement

- Personne anonyme qui touche le lien Musique, installe depuis l'App Store ou TestFlight et crée son compte **dans
  l'app** sans être passée par la page Web : le contexte est perdu (Apple ne le transmet pas) → eVe complet.
  **Critère « premier lancement » non satisfait dans ce parcours-là.** Satisfait quand le compte est créé depuis le lien
  (invitation Musique ou page Web `/music`) ou que l'app est déjà installée.
- Custom Product Page : seulement « Ouvrir » sur la page, iOS 18+, App Store seulement ; un forum Apple signale un
  lien non exécuté si « Ouvrir » est touché juste après l'installation.
- Un lien touché depuis une page d'atome.one reste dans Safari (règle iOS).

## 10. Conformité Apple

- 2.5.2 : tout le code (JS, WASM, workers) est dans le bundle et servi par `atome://` ; le packaging refuse désormais
  tout import de module distant. **Point à surveiller** : eVe exécute des scripts écrits par la personne (moteur Ruby
  Opal dans un worker, `eVe/domains/script/script_worker.js`) — admis s'ils restent locaux, sans télécharger de code
  qui change les fonctions de l'app ; à expliquer dans les notes de revue. Le lecteur YouTube charge l'API d'intégration
  officielle de YouTube (contenu Web, pas du code de l'app).
- 2.5.8 : le Dashboard organise les outils internes d'eVe et ne lance pas d'autres apps : ce n'est pas un écran
  d'accueil alternatif. Ne pas le décrire comme « écran d'accueil » dans la fiche.
- 4.2 / 4.3 : une seule app ; Musique est une configuration de la même app. Ne jamais publier d'app « eVe Musique » séparée.
- 4.7 : concerne le code tiers non embarqué ; les scripts personnels d'eVe relèvent du point 2.5.2 ci-dessus.
- 5.2.5 : eVe a son apparence propre ; Apple Music passe par MusicKit. Conforme.
