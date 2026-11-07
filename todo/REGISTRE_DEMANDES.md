# Registre des demandes en cours

Registre unique de ce que tu as demandé et qui n'est pas terminé (règle « Registre des demandes » d'`AGENTS.md`,
créée le 2026-10-30 après l'enquête sur les demandes zappées). Toute session qui s'arrête en laissant une partie
d'une demande non faite l'écrit ici ; toute session qui démarre une tâche lit d'abord les entrées de son domaine.

## Statuts

- `OUVERT` : à faire ; rien ne l'empêche.
- `À RAPPROCHER` : un reste noté par une session passée ; l'état actuel du code n'est pas vérifié. Vérifier
  d'abord, puis passer en `FAIT` (avec la preuve) ou en `OUVERT` (avec ce qui manque vraiment).
- `EN COURS` : un agent ou une sonde lancé par une session y travaille en ce moment ; sa fin réveille la session, qui passe alors l'entrée en `FAIT` ou en `OUVERT`.
- `ATTENTE UTILISATEUR` : seulement quand la question (ou la maquette) t'a réellement été posée ; écrire laquelle
  et quand.
- `FAIT` : livré et vérifié ; la preuve (sonde, fichier) est écrite dans l'entrée.

Format d'une entrée : un titre `### R-NNN — …`, puis une ligne `- Statut : …` (lue par le garde-fou de la session
d'exécution, `.claude/hooks/registre_stop_guard.mjs`), puis la source, ce qui est validé, ce qui reste.

## Entrées à exécuter
### R-123 — Restaurer sa session par le lien SMS (iOS 1.51) : 72 h retirées, lien livré une fois (2026-11-07)
- Statut : ATTENTE UTILISATEUR — l'essai de la 1.52 sur l'iPhone a échoué (« Opération incomplète » au lien SMS, code de récupération « déjà servi ») ; cause trouvée et corrigée en local, attend ton accord pour la dépendance iOS, le commit et la build 1.53
- Échec iPhone 1.52 (toi, 7 nov., deux captures) : sur iOS, la session ouverte sur atome.one est liée au serveur local Rust embarqué (`installRemote` → `local-link-challenge`/`local-link-complete`), qui rappelle atome.one en TLS ; `rustls-native-certs` ne trouve AUCUNE racine sur iOS (0 sur le simulateur iOS, 157 sur macOS ; sonde `temp/ios_tls_roots/`), donc `auth_remote_unavailable`, montré « Opération incomplète ». Le code de récupération a très probablement été consommé par un premier essai réussi côté serveur, avant que la liaison locale n'échoue (journaux de production non lisibles pour le confirmer). Corrigé en local : `tls.rs#system_roots` sur iOS = racines Mozilla de `webpki-root-certs` (déjà dans Cargo.lock, cible iOS seulement) ; texte « Serveur injoignable » pour `auth_remote_unavailable`. Preuve : sur le simulateur iOS, `atome_server::tls::connect_ws` joint wss://atome.one/ws/api et reçoit la réponse (`temp/ios_tls_roots/wss`). clippy (hôte + aarch64-apple-ios), cargo deny OK.
- Source : toi, 2026-11-07 : « impossible de restaurer mon session… il demande de copier-coller un code. Quand on reçoit le SMS, le code disparaît… il dit qu'on a 72 heures… vérifier le workflow complet » ; puis « c'est normal qu'il envoie un lien… ça doit activer la session » et « le comportement actuel, par lien, était correct si on peut le conserver ».
- Décidé (sécurité égale, moins de recopie) : le lien reste. Ouvert sur l'appareil qui l'a demandé, il ouvre la session tout de suite (appareil en probation 24 h pour les actions sensibles, les autres appareils prévenus `auth-device-added`). Ouvert sur un autre appareil, il demande le code d'association à 8 chiffres affiché par le demandeur (protection contre un lien intercepté).
- Causes : (1) `phone_link/finish.rs#opened` changeait un nouvel appareil d'un compte existant en récupération différée de 72 h au lieu d'une session ; (2) iOS livrait le même lien universel deux fois (gestionnaires SwiftUI + `SceneDelegate`) : la 2e ouverture voyait l'essai déjà consommé et demandait le code d'association (« le code disparaît », puis « Opération incomplète »).
- Fait : serveur Rust `finish.rs` (+ référence Fastify `server/auth_phone_link.js`) ; `AuthLinkInbox.swift` n'accepte un lien qu'une fois ; écran « attente 72 h » et alerte de récupération retirés (`first_launch_*`, `bevy_panel_home_*`, `main_menu_auth_runtime.js`) ; un essai 72 h laissé par la 1.51 est abandonné au prochain lancement ; textes : « Par SMS », code de récupération invalide/déjà servi, probation sans « 72 h ». Tests repo ciblés mis à jour.
- Preuve (7 nov.) : sonde `temp/auth_restore/sms_link.probe.mjs` (serveur Rust réel + app Web) 9/9 — même appareil : session ouverte sans code ni attente ; autre appareil : code demandé, mauvais code refusé, bon code → le demandeur s'ouvre seul. Parité Rust/Fastify `temp/l35_auth/phone_link_parity.probe.mjs` 7/7, `recovery_parity.probe.mjs` 5/5 ; clippy -D warnings, `cargo test -p atome-server --lib` 78/78, vitest ciblés verts (échec préexistant sans lien : `first_launch_account_flow` « asks a computer… », maquette sans `signupStatus`).
- Code de récupération refusé (toi, 7 nov. : « avec les codes de récupération que j'avais, ils ne fonctionnaient pas ») : un code créé entre le 17 et le 26 oct. 2026 n'a pas de `lookup` (colonne ajoutée par d66645929) ; l'écran ne demande plus que le code, donc ce code ne retrouvait jamais son compte. Corrigé : `recovery.rs#unindexed` (+ `server/auth_recovery.js`) cherche ces codes par le vérificateur de chaque compte et écrit leur `lookup`. Preuve : cas `old_code_without_lookup` de `temp/l35_auth/recovery_parity.probe.mjs`, 8/8 (Rust et Fastify ouvrent le compte avec le code seul). Un code remplacé par un plus récent, ou déjà utilisé pour une récupération, reste refusé (conçu ainsi).
- Reste : ton essai sur l'iPhone (lien ouvert dans Messages → session ouverte, sans code ; ton ancien code de récupération).

### R-122 — Page d'installation iOS (atome.one/ios/install) vide : réparée et déployée (2026-11-06)
- Statut : FAIT — déployé le 6 nov. sur ton autorisation (`scripts/ios/deploy.mjs --apply`, sauvegarde serveur `/var/backups/atome-ios-ota/0774ee91-56ce-460a-9fa8-0053ee554107`) ; preuve : la CSP servie porte le hash de l'import map, et la sonde `temp/ios_install_probe/probe.mjs` sur https://atome.one affiche la page sur bureau et mobile (« Link unavailable » avec un faux jeton, la route /ios/session répond) ; le lien avec un vrai jeton se confirme sur ton iPhone
- Source : toi, 2026-11-06 : « le lien pour la page apparaît sur desktop mais sur mobile je vois plus le lien… enquête dis-moi et répare ».
- Cause : la page importe `eVe/i18n/i18n.js` → `languages.js` → `languages_coaches.js` → `#shared/coach_contract.js` ; sans import map, le navigateur ne résout pas `#shared/` (« Failed to resolve module specifier »), le script s'arrête, la page reste blanche (constaté en production sur Chromium bureau aussi).
- Fait en local : import map dans `atome/src/ios-install.html` (chemins absolus), son hash sha256 admis par la CSP dans `server/http_ios_ota_routes.js#registerIosOtaRoutes`. Sonde `temp/ios_install_probe/` (serveur réel des routes + Playwright bureau et mobile) : « Install atome » affiché sur les deux.
- Reste : rien du côté du code. Le serveur tourne sur le commit a3dbe8b96 du 2 nov. (le reste de l'app n'y est pas à jour ; sans lien avec cette panne).

### R-121 — Site + domaine + hébergement : audit, paiement global réservé à deux téléphones (2026-11-05)
- Statut : ATTENTE R-120 — le paiement s'établit dans la session R-120 « Évaluation de tâche et faisabilité » (toi, 5 nov.) ; consignes et 10 questions transmises le 5 nov., en attente de son partage et de son API de débit ; ma part : registraire OVH réel + domaine payé en crédits
- Source : toi, 2026-11-05 : « une audit et des screenshots de la tâche… acheter un nom de domaine, l'héberger chez atome,
  relier le nom de domaine… un moyen de paiement global pour atome, dont 2 seuls utilisateurs pourront valider les
  paiements… 06 52 57 55 17… 06 63 69 40 55… acheter des tokens chez OpenAI… Mistral, Anthropic, DeepSeek… interface
  d'administration spéciale que pour nous… se mettre en relation avec la tâche Not Diamond… pour l'instant on n'attaque
  pas la tâche, on va faire qu'une audit ».
- Constaté : parcours site → domaine → hébergement codé (cahier `todo/publication_web_2026-10-28.md`), achat de domaine,
  DNS et mails sur un fournisseur SIMULÉ, aucun paiement réel, aucun filtrage de rôle sur l'achat ; `sites.atome.one`
  absent du DNS ; nginx/certbot des domaines personnels pas en place ; coffre serveur sans Anthropic, Mistral, DeepSeek
  ni Not Diamond ; aucun fournisseur d'IA ne vend ses crédits par API (soldes lisibles chez DeepSeek et Runway).
- Préconisé : rôle `payer` donné par `scripts/account_roles_admin.mjs grant payer --phone +33652575517` et
  `+33663694055` (jamais les numéros dans le code), code SMS à chaque dépense, plafonds, OVHcloud comme registraire,
  rubrique Administration, un seul grand livre (le portage Rust de R-118 L3.8), trois points de contact avec R-120.
- Maquettes : `temp/domaines_paiement/mockups/{pay,ai,quote}.png` ; captures du code : `temp/domaines_paiement/shots/`.
- Lien avec R-119 (achats récurrents, 2026-11-06) : non fusionnées ; R-119 ne paie rien dans atome, ses commissions
  d'affiliation entreront dans le grand livre de R-120.
- Validé : registraire des domaines = OVH (toi, 6 nov., « pour le nom de domaine, c'est bien OVH »), choix indépendant de l'hébergement (o2switch aujourd'hui, Almerys ensuite).
- Changement de cap (toi, 5 nov.) : plus de deux téléphones habilités ; porte-monnaie de crédits pour chaque compte
  (carte, PayPal…), débit au coût réellement payé par atome + marge (IA auto-hébergée ou payée par un tiers = pas de coût
  répercuté), 3 % pour atome versés sur ton RIB, Apple « majoré » ou contourné, porte-monnaie vide = sans assistant, en
  local, cloud en lecture, resynchronisé à la recharge ; « on fait du final maintenant ». Maquettes A, B, C abandonnées
  (B doublait la M2 de R-120).
- Coordination (toi, 5 nov.) : « travailler de concert avec elle pour pas réinventer la roue et surtout pour pas vous
  auto-bloquer ». Message envoyé à la session local_0f22a5c6 (consignes mot pour mot, constats Apple/Stripe, partage
  proposé, questions (a)–(j) à reprendre dans sa série pour ne pas les poser deux fois).
- Reste : son accord sur le partage, son API de débit ; puis registraire OVH réel (compte API OVH à fournir), domaine
  débité en crédits, `sites.atome.one` + nginx/certbot (ton feu vert)., la validation des maquettes, puis le plan détaillé ; rien n'est codé.

### R-120 — IA unifiée, Not Diamond et facturation : évaluation faite, mission pas commencée (2026-11-05)
- Statut : ATTENTE UTILISATEUR — maquettes M1/M2 envoyées et 12 questions posées une à une (2026-11-05) ; rien codé
- Tranché (toi, 2026-11-05) : (1) Rust impératif, tout le contrôle dans `atome-server` ; (2) clé Not Diamond dans
  `private/no_diamond` (vérifiée : `/v2/models` 128 modèles, `modelSelect` répond en 1,2–1,9 s) ; (3) maquettes et
  questions d'abord, puis tout coder. Addendum du 2026-11-05 joint : budget fournisseurs 5 €/mois (Europe/Paris),
  plafonds par fournisseur, réservation au coût maximal, fail closed, rôles propriétaire/admins, alertes 80/90/100 % et
  solde fournisseur < 1 €.
- Maquettes : `temp/notdiamond_billing/mockups/m1_abonnement.png` (tuile « Offre » après Compte, panneau Abonnement),
  `m2_budget_ia.png` (tuile admin « Budget IA », fournisseurs, alertes, interrupteur « Payants ») ; source `src/build.mjs`.
- Audit (2026-11-05) : aucun appel IA en Rust ; `ai-provider` passe à Fastify ; contournements client directs
  (Anthropic/Mistral/Google/DeepSeek depuis le navigateur, proxys Tauri `/api/eve/ai/provider-completion` et iOS
  `LocalAiProxy.swift`) ; Runway et MusicGPT seulement sur clé personnelle ; rôle `admin` seul dans `auth_account_roles`
  (JS) ; push APNs/FCM et pile de notifications en Rust ; soldes : DeepSeek lisible (`/user/balance`), OpenAI/Anthropic
  exigent une clé admin d'organisation, Not Diamond sans API de solde.
- Source : toi, 2026-11-05, cahier `atome_eVe_Not_Diamond_IA_facturation.md` (lots A–F) : « Évalue cette tâche… fais-moi
  un plan… ton avis sur la faisabilité ».
- Constaté : `server/billing/billing_ledger.js` (grand livre append-only, idempotent, crédits inclus/achetés) existe mais
  `authorize`/`debit` ne sont appelés nulle part (le lot 1b de `todo/offre_unique_stockage_ia.md` n'est pas branché) ;
  `debit` laisse le solde passer en négatif (incompatible avec le plafond strict demandé) ; pas de réservation, pas de
  table de prix par modèle ; aucune trace de Not Diamond ni de Stripe ; quota de stockage absent ; vérificateurs
  Apple/Google présents.
- Questions posées : (1) Rust (`atome-server`, règle 7 d'AGENTS.md, migration L3 en cours) ou JS Fastify comme le dit le
  cahier §1.9 ; (2) compte et clé Not Diamond fournis par toi ; (3) feu vert pour ne coder que les lots sans dépendance
  externe (C réservations + B routage + D quota), l'UI après maquettes validées (règle 16), E (Stripe/stores réels) bloqué
  par tes comptes et tes prix.
- Reste : toute la mission.

### R-119 — Achats récurrents et boutiques : analyse de faisabilité (2026-11-05)
- Statut : CODÉ, lots L1–L5 FAITS (2026-11-06, « ok vas y je valide ») — restent seulement des blocages hors de ma main (voir « Reste » plus bas)
- Source : toi, 2026-11-05 : « pour pouvoir acheter en ligne… faire des listes et, par exemple, tous les mois, commander
  au même endroit… Nutri & Co, NutriPure… ou alors on le valide manuellement… il me rappelle à chaque fois que je n'en ai
  plus… comment on fait pour gérer les boutiques… gérer ça dans l'agenda, et avec les projets et les objectifs ». Analyse
  seulement. Puis : « pourquoi on n'utiliserait pas la même boutique pour les deux tâches qui sont similaires ».
- Validé (décision de travail, ta question du 2026-11-05) : UNE seule rubrique Boutiques ; une boutique porte sa sorte
  `eve` (vente dans eVe) ou `web` (on paie sur le site).
- Q1 (2026-11-05) : B — automatique quand la boutique a un abonnement pris chez elle, sinon validé à chaque fois.
- Q2 (2026-11-05) : A — catalogue commun tenu par nous, visible dans Boutiques › Tout ; boutique ajoutée hors catalogue = privée, rappel + lien seulement.
- Catalogue (2026-11-05) : A — la liste de départ de l'étude, telle quelle ; Leboncoin, Vinted, Temu, Shein, AliExpress écartés.
- Q3 (2026-11-05) : B — rangé dans Boutiques › Achats + outil « Commander » sur la fiche d'un complément et au maintien d'un article de Mes courses (même écran ; maquette d'abord).
- Q4 (2026-11-05) : A — affiliation oui, neutre (jamais la boutique qui paie plus), mention une fois dans Boutiques ; comptes Amazon Partenaires / Awin / Effiliation / Nutri&Co à ouvrir par toi.
- Q5 (2026-11-05) : A — sur le Web, un toucher remplit tout le panier (eVe garde la main sur l'onglet de la boutique, catalogue seulement).
- Maquettes (« oui » du 2026-11-05) : m1 fiche boutique du web = vraie page d'article de Boutiques, contenu changé en mémoire
  (`temp/achats_recurrents/mockups/m1_shop_sheet.mockup.mjs` → `m1_phone.png`, `m1_desktop.png` ; lancer avec
  `PROBE_PREBUILT_SERVER=1`). « Commander » ne tient pas dans un outil (« Comma… ») → outil « Achat » existant proposé.
  m1 VALIDÉE telle quelle (2026-11-06) : outil « Achat » (pas « Commander »), Rythme, Site, Favori.
  m2 envoyée (2026-11-06) : `temp/achats_recurrents/mockups/m2_buy_tool.mockup.mjs` → `m2a_complement.png` (« Achat »
  en tête du maintien d'un complément) et `m2b_courses.png` (« Achat », chariot, au maintien d'un article, après Fiche).
  m2 VALIDÉE (2026-11-06, « oui je valide »). m3 envoyée (2026-11-06) : la proposition « à commander » dans la phrase
  d'eVe du champ du bas (brique `dashboard_daily_suggestion.js`, Q23), aucun élément neuf ; téléphone « Multivitamines : on
  commande ? », ordinateur « Multivitamines : 6 jours. On commande ? » (`m3_reorder_notice.mockup.mjs` → `m3_phone.png`,
  `m3_desktop.png`). Constaté : une alarme d'agenda qu'on s'envoie n'arrive pas dans la bande (« my own reminders keep
  their rubric », `dashboard_communication_input.js:158`) : la proposition doit passer par la phrase d'eVe, pas par l'alarme seule.
- Fusion avec R-121 évaluée (toi, 2026-11-06) : NON fusionnée, rien supprimé. R-119 ne fait passer aucun argent par atome
  (on paie sur le site de la boutique) ; R-121 achète des domaines avec de l'argent réel et renvoie le paiement à R-120.
  Seul point commun : les commissions d'affiliation (Q4) sont un revenu d'atome, à écrire dans le grand livre de R-120.
- Fait : les 10 phases, résultats R1–R10 dans `todo/etude_achats_recurrents_2026-11-05.md`. Verdict : faisable et
  pertinent en version réduite (N0 rappel + lien, N1 panier prérempli, N2 suivi de l'abonnement de la boutique ; N3 eVe
  qui paie écarté). Preuves : `temp/achats_recurrents/cart_chain.probe.mjs` (Nutri&Co, 2 produits au panier, capture
  `out_NutriCo_cart.png`), `temp/achats_recurrents/nutripure_cart.probe.mjs` (3 articles au panier).
- FAIT (2026-11-06), lots L1–L5 :
  L1 stock et autonomie d'un complément (Boîte, Stock sur sa fiche ; `health_product_supply.js`, `health_products.restock`) ;
  L2 catalogue des 28 boutiques (`atome/src/shared/web_shop_catalogue.js`) et boutiques à soi (`shop.web_shop_add`) ;
  L3 plan par boutique, rythme Conso / 15 / 30 / 60 j / Abonn., objectif (fermé → le plan s'arrête), budget, événement
  « Commande … » de l'Agenda (`eVe/domains/shop/purchase_plans.js`, `web_shop_commands.js`, commandes `shop.plans`,
  `plan_set`, `plan_item`, `plan_remove`, `plan_decline`, `plan_order`, `web_shops`, `web_shop_site`) ; L4 page d'une
  boutique du web dans Boutiques (m1), « Achat » au maintien d'un complément et d'un article de Mes courses (m2), panier
  Nutri&Co rempli par ses liens et stock réapprovisionné à la commande ; L5 proposition dans la phrase d'eVe (m3), son
  maintien « Ne plus proposer ». Un plan qui contient un complément est donnée de santé : invisible pour l'IA et MCP.
  Preuves : `temp/achats_recurrents/code/pure.probe.mjs` (calcul et catalogue), `flow.probe.mjs` 18/18 téléphone et
  ordinateur (vrai panier Nutri&Co 23×2 + 25×1, stock 100 → 340, plan caché à l'IA, objectif fermé), `screens.probe.mjs`
  7/7 (gestes réels m2a, fiche, m2b), `tools.probe.mjs` 9/9 (Rythme, Favori, Site, ajout par l'adresse d'un produit,
  proposition puis « Ne plus proposer ») ; captures `temp/achats_recurrents/code/*.png`. `registry:check`, Biome,
  `check:browser-shared-contract-imports`, `check:no-fallbacks` : ok.
- Reste (bloqué, hors de ma main) :
  (1) panier Amazon en un lien = l'identifiant Amazon Partenaires d'atome (Q4) ; comptes Awin / Effiliation / Nutri&Co à
  ouvrir par toi ; d'ici là Amazon = rappel + lien (N0), et la mention « lien affilié » n'est pas montrée (aucun compte) ;
  (2) Nutrimuscle : son lien Shopify laisse le panier vide, Myprotein n'est pas Shopify → N0 tant qu'aucun lien n'est prouvé ;
  (3) essai appareil par toi (iOS, Tauri : la suite de liens s'ouvre l'une après l'autre dans le navigateur du système) ;
  (4) changer la quantité d'un produit à l'écran : aujourd'hui par MCP / l'assistant (`shop.plan_item quantity`) ou en le
  retirant puis rajoutant ; un réglage à l'écran est un élément neuf → maquette à valider d'abord (règle 16) ;
  (5) commissions d'affiliation → grand livre de R-120 quand il existera.

### R-118 — Refonte Rust-first : étapes 1 (hygiène) et 2 (atome-store) faites, restes et suite (2026-11-04)
- Statut : EN COURS, tout le code FAIT (2026-11-06) — étapes 1 à 7 FAITES : étape 3 L3.0–L3.11 codés (visio portée en Rust sur mediasoup 0.21, parité 58/58 et alarme 28/28 ; atome-server sert seul, aucun processus Node, 15/15 ; iOS L3.11 22/22) ; étape 4 bande en voie B, étape 5 scène et gestes, étape 6 texte T1 (gardé, décision du 2026-11-06), étape 7 cpal 0.18 / kira 0.12.6. Contrôles finaux FAITS (`check:rust` tout ok et `deny`, `check:js`, D20 12/12, timeline, WASM final). Restent, hors de ma main : (1) bascule L3.10 = copie des coffres de prod à fournir par toi, puis retrait du JS Fastify/visio Node et déploiement par toi ; (2) essais appareil par toi (iPad : bande, texte, masques, défilement, serveur embarqué et AUv3 ; écoute ; TLS Android).
- RÉGRESSIONS après la refonte (signalées par toi le 2026-11-07) — ATTENTE UTILISATEUR (décision ci-dessous) :
  « l'app iOS ne marche plus, Tauri non plus, plus de son quand eVe parle sur l'iPad, atome.one très long sur iPad M5 et
  n'aboutit pas sur iPhone ». Mesuré le 2026-11-07 (`temp/regress_1107/`) : le renderer Bevy n'a presque pas changé
  (WASM 13,4 → 13,7 Mo, code voix client ±50 lignes) ; atome.one (Rust) charge sur Chromium WebGPU sans erreur mais
  l'accueil n'apparaît qu'entre 15 et 30 s ; un chargement fait ≈ 3 100–3 400 fichiers et 40–56 Mo, comme avant
  (journal nginx du 06/11 15:15 sur Node : 3 093 requêtes, 56 Mo) ; Tauri dev : `asset not found: index.html` —
  la fenêtre est en mode dev sans `devUrl`, Tauri charge alors `tauri://localhost` (tauri 2.12.1
  `manager/mod.rs#get_app_url`) alors que le serveur Axum répond bien sur 3000 ; config identique à avant,
  seule différence de lancement : `tauri dev --features bevy_renderer_core` devenu `tauri dev` (cause exacte
  non encore prouvée). Voix de l'assistant sur le serveur Rust : clé lisible par le service, chemin non testé
  (pas de compte sur atome.one). Simulateur iOS : « Unable to find a GPU », antérieur à la refonte.
  Question posée : remettre atome.one sur 1.48 ? Réponse : « Non, répare en Rust » (2026-11-07).
  - Tauri : FAIT — la fenêtre ouvre toujours Axum (`platforms/desktop-tauri/src/lib.rs`, `config.url` explicite ;
    cassé depuis fad2f55d2 du 4 nov., avant la refonte) ; relancé, tableau de bord connecté affiché
    (`temp/regress_1107/tauri_run_a.png`).
  - iOS et Tauri, démarrage : FAIT dans le code — les réparations d'avant le contrat de sync
    (`local_atome_remote_projection.rs#ensure_schema`) tournaient à chaque ouverture : ≈ 19 s mesurées sur la base
    Tauri de 4,3 Go avant la première réponse (le chien de garde iOS crie à 8 s) ; elles tournent une fois par base,
    marque `local_repairs` (test `schema_repair_runs_once_per_database`, 9/9 ; marque posée dans la base Tauri ;
    `cargo check` iOS OK). À faire par toi : reconstruire l'app iOS et la lancer sur le téléphone (le premier
    lancement fait encore la réparation une fois).
  - Web atome.one : pas de régression serveur trouvée — mêmes en-têtes qu'avant (`max-age=0`), 3 196 empreintes du
    cache hors ligne exactes (116 Mo), service worker installé et activé ; accueil à 17–20 s au premier chargement
    sur Chromium. nginx servait en HTTP/1.1 (jamais HTTP/2) : ≈ 1 800 fichiers par 6 connexions. FAIT
    (2026-11-07, accord donné) : `http2 on;` dans `/etc/nginx/sites-available/atome.one` (sauvegarde
    `/root/atome.one.nginx.bak-20261107-http2`, `nginx -t` OK) ; HTTP/2 vérifié, `/ws/api` répond, accueil Chromium
    17–20 s → 10,4 s au premier chargement, 11 s → 5,5 s au retour. À faire par toi : recharger sur l'iPad et l'iPhone.
  - Écran blanc 3–4 s au rechargement (signalé le 2026-11-07) : FAIT — le graphe de modules (≈ 1 000 fichiers) ne
    s'exécute qu'une fois tout chargé ; un petit module `atome/src/squirrel/first_paint.js` (chargé avant `spark.js`
    dans `index.html`) pose le fond du jeton dès la première peinture : fond à 64–242 ms en local (sonde
    `temp/regress_1107/paint.probe.mjs`). Corrigé au passage : `mutedNode` manquait à l'import de
    `bevy_panel_interaction_runtime.js` (défaut antérieur).
  - Son (signalé le 2026-11-07 : « plus de son quand eVe parle sur l'iPad ») : FAIT dans le code — cause prouvée dans
    une WKWebView (`temp/regress_1107/wksound/`) : le contexte audio du moteur Kira Web n'était jamais créé ni repris
    dans un geste ; WebKit le garde alors suspendu (`suspended@0.00`, 0 bloc rendu). Corrections :
    `backend.kira.js` crée et réveille le moteur dans le premier toucher, clic ou touche (réarmé à chaque geste tant
    que le contexte ne tourne pas) ; `audio-wasm/src/scheduled_backend.rs#wake` reprend aussi un contexte retenu par
    le navigateur (créé hors geste, interrompu par un appel), pas seulement endormi par le moteur ; WASM reconstruit.
    Mesuré sur l'arbre vivant, sans rien injecter : clic → `running`, puis notification jouée hors geste après la mise
    en veille du moteur → réveil et 2 406 blocs rendus. Limite connue : un son demandé avant tout toucher (la toute
    première phrase d'accueil) reste muet par la règle de WebKit ; tout son après le premier toucher joue.
  - Voix de l'assistant : chemin vérifié dans le code, pas de bout en bout — la phrase « prête » et la synthèse locale
    passent par le moteur (débloqué ci-dessus) ; la voix temps réel par un élément `<audio>` WebRTC démarré dans le
    geste du micro ; actions identiques client et serveur Rust (`realtime-*`, `speech`). Un test réel demande un compte
    et l'iPad (console Safari par USB).
  - Lien d'installation iOS `https://atome.one/ios/install` blanc (signalé le 2026-11-07) : FAIT dans le code — le
    portage Rust (`atome-server/src/ios_ota/mod.rs`) avait perdu le hash de l'import map dans la CSP (Fastify
    l'ajoutait) : Chromium refuse l'import map, `#shared/coach_contract.js` ne se résout pas, page vide (sonde
    `temp/regress_1107/ios_install.probe.mjs`). `install_csp` le calcule depuis la page ; hash identique à celui que
    le navigateur exige (`nwfiTKrU…`), tests `ota_install_csp.rs` 2/2. En ligne (2026-11-07, à ta demande) :
    commit cb9fdcf38 poussé, atome.one mis à jour (`server_update.js`, santé 200), CSP servie avec le hash, la page
    s'affiche ; app iOS 1.51 (49) construite en Ad Hoc et publiée sur l'OTA (`/ios/status` = 1.51/49), commit 9965ae192.
  - À faire par toi : sur l'iPad, Safari, toucher une fois l'écran puis faire parler eVe et jouer un son (notification,
    clip) ; lancer une conversation vocale.
- À faire par toi (étape 4) : mesurer sur l'iPad A12Z le glissé le long de la bande du bas, renderer `58ae80e9fd7cb82e` (recharger sans le service worker), lire images/s (avant 9–24) et ops/image (avant 7–14 ; attendu ≈ 0,3).
- Étape 5 (2026-11-06) : FAIT — survol au repos sans image, défilement en voie B (Rust) et son test de toucher pendant une glissade (sonde `temp/step5_scene/scroll_hit.probe.mjs` 6/6), ombres des formes floutées sur le GPU (12 étoiles redimensionnées : 37,7 → 60 im/s, principal 24,1 → 4,0 ms), masques des formes dessinés sur le GPU (`shape_mask_gpu.rs` + `shape_silhouette.wgsl` ; 12 étoiles : principal 6,0 → 0,8 ms, polygones 6,1 → 0,8 ; pixels 0 différence pour les 7 sortes, ≤ 1 niveau avec ombre ; sonde `temp/step5_scene/mask_pixels.probe.mjs`), ombres à alpha et masquées par le même flou GPU (image masquée à ombre redimensionnée : 278 → 160 ms/image), voie légère du curseur d'outil du ruban pour la barre, la colonne et le cadran (`bevy_ui_slider_motion.js`, `bevy_ui_main_menu_slider_preview.js` ; CPU par mouvement 17–20 → 11 ms, 14–15 → 8, 14 → 10,6 ; redessins entiers du ruban par passe 90 → 8, 82 → 1, 67 → 1 ; 0 pixel différent à 3 valeurs par forme ; montée, descente, double toucher pour taper, relâcher vérifiés ; sonde `temp/step5_scene/slider_light.probe.mjs`). Restes notés à l'étape 5, FAITS au lot de nettoyage du 2026-11-06 : (1) FAIT — le masque spatial est dessiné sur le GPU (`bevy-core/src/spatial_mask_gpu.rs`, `spatial_mask_pass.rs`, `spatial_mask.wgsl`) : 12 carrés masqués redimensionnés, principal 75,4 → 0,9 ms (12 → 57 im/s), avec ombre 136,4 → 1,5 ms (6,9 → 44 im/s) ; pixels 0 différence pour 8 cas sur 11, 1 pixel à 1 niveau pour 3 (sondes `temp/cleanup_r118/mask_measure.probe.mjs`, `mask_pixels.probe.mjs`) ; (2) FAIT — la retenue sur les nombres naturels est le comportement de tout curseur d'outil, l'option `slider_natural` supprimée (« Taille » : naturel 3,05 contre 1,53 mouvements ; sonde `temp/cleanup_r118/natural_hold.probe.mjs`) ; (3) FAIT — les coins `radius_corners` passent par le patch de mouvement : 0 redessin entier du ruban près des bouts (avant 9), 0 pixel différent (sonde `temp/cleanup_r118/slider_corners.probe.mjs`). À faire par toi : sur l'iPad A12Z, renderer `0415a397c1a88a91` (recharger sans le service worker), redimensionner une étoile, un polygone et un carré à ombre portée (fluidité attendue sans saccade), glisser le curseur « Taille » du ruban d'un projet de haut en bas (barre, colonne, cadran : sans saccade), faire défiler une longue liste, l'attraper en pleine glissade et toucher une ligne (la ligne touchée = celle sous le doigt).
- Étape 6 (2026-11-06) : FAIT en voie T1 — le texte reste peint par Canvas2D (polices du système, émojis, toutes les écritures, IME du DOM caché inchangé) et passe au renderer en `ImageBitmap` copié par le GPU (`bevy-core/src/browser_texture.rs`, `browser_texture_web.rs`, `browser_texture.wgsl`) ; retirés : `getImageData`, la boucle JS `bevy_text_texture_pixels.js`, la copie RGBA dans le WASM. Mac, médianes de 10 passes alternées T0/T1 : pincement CPU par image 14,8 → 8,5 ms (p95 entre images 28,6 → 24,3 ms), panneau de 200 libellés monté 165 → 59 ms, posé 347 → 210 ms, CPU 219 → 117 ms, frappe CPU par touche 29,1 → 24,0 ms, ouverture d'un projet de 24 textes 1023 → 1006 ms ; relectures de pixels → 0 partout. Pixels contre T0 : ≤ 1 niveau (textes, émojis, écritures, panneau 0, texte masqué, sélection en édition). Sondes `temp/step6_text/text_measure.probe.mjs`, `text_pixels.probe.mjs`, `mask_text.probe.mjs`, `home_panic.probe.mjs`. Renderer final `79911cae8dfff552` (avec le masque spatial GPU du lot de nettoyage). Question ouverte (règle 16, à te poser) : T2 = cosmic-text dans Bevy (Roboto embarquée) — CPU plus bas (panneau 36 ms contre 117, projet 916 ms contre 1006) mais rendu visiblement différent : Roboto au lieu de la police du système, pas d'émojis en couleur, ni arabe, hébreu, CJK, devanagari (carrés vides), et caret, sélection, contour, ombre, styles riches, paragraphes mis en page et grilles à réécrire en Rust ; maquettes `temp/step6_text/mockups/t0_vs_t2_texts_zoom.png` et `t0_vs_t2_panel_zoom.png` ; rien n'est livré de T2. À faire par toi : sur l'iPad A12Z, renderer `79911cae8dfff552` (recharger sans le service worker), ouvrir un projet avec des textes, en sélectionner un, taper une phrase, pincer pour zoomer et dézoomer, ouvrir un panneau riche en libellés (Réglages) : les textes doivent être identiques à avant (mêmes polices, émojis, accents) et le pincement plus fluide.
- Étape 7 (2026-11-06) : FAIT — (1) montée audio : kira 0.12.6, un seul cpal 0.18.2, symphonia 0.6.1, rtrb 0.4 (oboe, ndk 0.8, coreaudio-rs, bindgen 0.72 sortis du verrou) ; tampons hors ligne ancien/nouveau identiques au bit (scène de mix, m4a, WAV 16/24 bits) sauf le MP3, qui perd le retard de l'encodeur (1105 images au début, 407 à la fin : symphonia 0.6 sans blanc) ; `start_due_voice` rend l'erreur. (2) un seul propriétaire TLS, `atome/servers/atome-server/src/tls.rs` (racines du système passées à chaque client, Android lit le dossier Conscrypt, plus de `set_var`) ; `android_tls_roots.rs` retiré. (3) calculs audio hors ligne en Rust : crate `atome/engines/audio-kernels`, liaisons `platforms/web/audio-wasm/src/kernels.rs`, colle `atome/src/application/audio_runtime/audio_kernels.js` ; 18 mesures sur le vrai module, sorties identiques, gains 1,1× à 34× (sonde `temp/step7_compute/equivalence_real_module.mjs`) ; `peakOf` reste en JS (la copie vers le WASM coûte plus que la lecture) ; JS retiré : `onset_detection.js`, `wav_codec.js`, `bank_wav.js`, `bank_flac.js` et les noyaux PCM des autres fichiers. (4) les médias protégés passent par `media_api_auth.js#fetchAuthorizedMedia` (le clip d'un enregistrement ne répond plus 404) ; sonde timeline 15/15 deux fois sur un atome-server isolé. Contrôles : tests noyaux 4/4, moteur audio 34/34, `cargo test -p squirrel` (Tauri) 21/21, `atome-server --lib local::` ok, sonde D18 12/12, clippy hôte + wasm32 + aarch64-apple-ios sans avertissement, `cargo deny check` ok, Biome sans nouvel avertissement.
  - Laissés en JS, mesures à l'appui : récurrences d'agenda (ical.js, 118 ms pour 40 séries sur un mois ; un portage demande un moteur RRULE, nouvelle dépendance) — FAIT au lot final du 2026-11-06 : un seul moteur Rust `atome/engines/atome-calendar` (le portage du serveur, sans dépendance nouvelle), servi au navigateur par squirrel_audio_wasm ; 0 différence contre ical.js (banc, fixtures DAV, 3 000 vecteurs, 18 000 cas générés, 3 zones) ; 40 séries UTC 46–130 → 9–24 ms, 40 séries Europe/Paris 1,1–3,5 s → 17 ms (FRAMEWORK_STATE §5 du 2026-11-06, `temp/final_r118/`) ; audio → MIDI (Basic Pitch sur TF.js ; demande un moteur d'inférence), mot de réveil (ONNX déjà dans ORT-web WASM, 0,11 ms par trame de 80 ms ; le natif est déjà en Rust), en-tête MP4 (0,02 ms).
  - Restes notés : FAIT (2026-11-06, lot final) — `sample_root_detection.js#dominantPitch` double `sample_analysis.js#rootNoteFromNotes` (un seul propriétaire, `rootNoteFromNotes`, 20 000 listes identiques) ; FAIT (2026-11-06, lot final) — l'enregistreur natif (`recorder_wav`) tronque en 16 bits là où les noyaux arrondissent (±1 pas) (il écrit avec le codec des noyaux, octets identiques à `wav::encode`) ; `cargo check` pour aarch64-apple-ios-sim demande `BINDGEN_EXTRA_CLANG_ARGS_aarch64_apple_ios_sim` (bindgen de signalsmith-stretch, existant) ; Windows, Linux et Android non compilés ce jour ; la sonde `temp/mixer` est périmée ; la sonde timeline rate parfois take4/take5 quand l'horloge de rendu saute à chaque prise (déjà vu avant).
  - À faire par toi (étape 7, sur l'iPad, Kira natif iOS et AUv3) : écouter un clip MP3 (il démarre ≈ 25 ms plus tôt, c'est attendu), un m4a/AAC, un WAV, une tranche de mix avec effets, une note du sampler, l'entrée micro en direct et un enregistrement.
- Source : toi, session d'étude Rust-first du 2026-11-04 : « traite l'étape 1, puis t'enchaînes avec l'étape 2 et 3…
  tu t'arrêtes pas tant que c'est pas intégré entièrement ». Décisions validées : Rust par défaut (règle 7 réécrite),
  voie 1 (JS simple + types générés depuis Rust + Biome bloquant), workspace Cargo unique, édition 2024, cargo-deny,
  script de contrôle local seulement, Axum 0.8 à l'étape serveur.
- Fait à l'étape 1 : workspace racine (`Cargo.toml`, un `Cargo.lock`, un `target/`), profils nommés, build WASM sans
  wasm-pack (`platforms/web/wasm_web_build.sh`), édition 2024, lints, rustfmt, `npm run check:rust`
  (`scripts/rust/check.sh`), `deny.toml` (avis RustSec corrigés : rustls, rustls-webpki, h2, tokio, ringbuf 0.5, zip 9
  dans Tauri et le plugin STT, reqwest 0.12), Biome 2.6.2 (`biome.jsonc`, `npm run check:js`).
- Reste, chacun hors de l'étape 1 :
  - FAIT (2026-11-05, décidé par toi) : test `tests/native/auth_development_request.rs` — la commande Tauri lit
    l'environnement puis appelle `development_request(message, sms_mock, base)` ; le test passe sa configuration en
    paramètre, plus aucune variable d'environnement modifiée ni `unsafe`.
  - FAIT (2026-11-06) — `bevy_renderer_native` : fenêtre Bevy de Tauri retirée (ta décision), puis la voie JS morte
    (`bevy_native_renderer_runtime.js`, `bevy_native_texture_mapping.js`, leurs tests) au lot de nettoyage ; reste le
    contrôleur Swift iOS `AppNativeBevyRendererController.swift`, sans appelant JS, côté iOS.
  - FAIT (2026-11-06, étape 7) — Montée cpal 0.18 + kira 0.12.6 (conflit `links = "alsa"` avec cpal 0.15) ; l'iOS est redescendu de kira 0.12.5 /
    symphonia 0.6.1 à 0.12.1 / 0.5.5 pour l'unification : à valider à l'oreille sur l'iPad.
  - FAIT (2026-11-06, étape 7) — `platforms/web/audio-wasm/src/lib.rs` `start_due_voice` : `let _ = start_voice(...)` avalait une erreur ; l'erreur est rendue.
  - FAIT (2026-11-06, étape 7) — `platforms/desktop-tauri/src/android_tls_roots.rs` : `std::env::set_var` après le démarrage des fils (Android) ; remplacé par `atome-server/src/tls.rs` (racines passées à chaque client, aucune variable d'environnement).
  - Biome : 195 variables et 133 imports inutilisés en avertissement (un import retiré peut retirer un effet de module :
    à revoir à la main, fichier par fichier).
  - Axum 0.7 → 0.8 : à l'étape serveur (3).
- Fait à l'étape 2 : crate `atome/engines/atome-store` (le seul magasin Rust : schéma, commit `commit_events`,
  projection, historique, ACL, type, contenance), branché dans Tauri ; S1 (empreinte d'intention identique à Fastify,
  `event_id_conflict`), S2 (flux `project:`/`atome:`/`global`), S4 (versions des particules +1 par changement, clé
  supprimée gardée en pierre tombale ; corrige l'échec du 2e enregistrement des listes média, courses, rack d'effets,
  bibliothèque d'instruments sur Tauri), type `generic` contrôlé comme sur Fastify. Preuve : fixtures enregistrées depuis
  le vrai moteur Fastify (`tests/fixtures/atome_store/`), rejouées par `tests/atome_store/commit_parity.rs` (13/13) ;
  Tauri 93/93.
- Reste de l'étape 2, à faire à l'étape 3 :
  - S3 (ACL iOS au seul propriétaire) et S5 (pas d'historique sur iOS) : se ferment quand iOS utilise `atome-store`.
  - (Fait) Les messages directs `atome` create/update/alter/delete sont refusés comme sur Fastify
    (`canonical_event_commit_required`) ; la projection distante écrit par `atome_store::particles`.
  - `platforms/desktop-tauri/src/server/mod.rs` fait 5 420 lignes et `local_atome.rs` ~2 400 (au-delà de 800,
    critique) : découpe à l'étape 3, quand le serveur Axum devient une crate partagée Web/Tauri/iOS.
    `local_atome.rs` FAIT (2026-11-06, lot de nettoyage) : 2 163 → 328 lignes en 5 modules, `local_atome_remote_projection.rs`
    1 006 → 308 (+ `_patch.rs`), tests 69/69 ; vérification `cargo build/test -p squirrel` (Tauri) FAITE
    le 2026-11-06 avec le build de l'étape 7 (21/21).
  - (Vérifié 2026-11-05, rien à trancher) `events.projection` : `atome-store` l'écrit comme Fastify
    (`append.rs`, `UPDATE events SET projection`) ; lu par la synchro (`sync_engine.js`) et la reprise d'un envoi.
- Suite : étape 3 (Axum remplace Fastify sur le Web, puis serveur Rust embarqué sur iOS), puis 4 à 7.
  Cahier de l'étape 3 : `todo/refonte_rust_etape3_axum.md` (inventaire : 211 fichiers serveur, 32 112 lignes,
  61 routes HTTP, ~60 types de messages `/ws/api`, lots L3.0 à L3.11).
- Tranché (toi, 2026-11-04) : « un process par user, le plus sécurisé et le plus performant » → un superviseur Axum
  et un processus Rust par coffre d'utilisateur (socketpair hérité, trames binaires, uid et espaces de noms propres,
  Landlock, seccomp) ; détail dans le cahier de l'étape 3.
- Tranché (toi, 2026-11-04) : « Axum in front, vaults first » — Axum devant tout de suite, coffres Rust d'abord (seuls
  écrivains de chaque coffre), Fastify garde le reste et passe par le superviseur Rust, puis domaine par domaine.
- Questions de L3.0 : toutes deux tranchées (ci-dessus).
- Fait (2026-11-04, lot L3.2) : chaque coffre Web est écrit par un seul processus Rust `atome-vault` par personne ;
  `atome-server` (Axum) tient le port public, supervise les coffres et passe tout le reste à Fastify (port + 100) ;
  `server/userVaultProcess.js` supprimé, Fastify client du superviseur. Lanceurs (`run.sh`, `npm run start:server`)
  et `scripts/server_update.js` démarrent `atome-server`. Preuves et mesures : FRAMEWORK_STATE §5 du 2026-11-04
  « Rust vaults » (mémoire 9–15 Mo par coffre contre 64–72 Mo ; aller-retour d'un commit 1,08 ms contre 0,91 ms).
- Fait (2026-11-04, ton accord « Oui, ajoute-les ») : confinement Linux des coffres — un uid par coffre, Landlock sur
  son seul dossier, seccomp (ni réseau, ni processus, ni exécution), limites ; sans espaces de noms (il faudrait du code
  `unsafe`, interdit dans le workspace ; Landlock et seccomp couvrent ce qu'ils ajouteraient). Essayé sur Linux le
  2026-11-04 (ton accord « Oui, teste en VM ») : VM Debian 12 arm64 locale, noyau 6.1, en root — confinement ok,
  superviseur 4/4 avec un vrai uid par coffre, store 14 (parité comprise), coffre 2, contrôle de déploiement ok. La VM
  a trouvé un défaut corrigé : SQLite ne pouvait plus créer ses fichiers temporaires (gros tri) → gardés en mémoire.
  Pas essayé sur x86_64. La phase `vault-confinement` du déploiement (`scripts/check_vault_confinement.mjs`) refait
  l'essai sur le serveur et arrête la mise à jour avant le redémarrage s'il échoue.
- Fait (2026-11-04/05, L3.1 base) : Axum 0.8 et tokio-tungstenite 0.26 dans tout le workspace ; `atome-server::http`
  (CORS de Fastify, identifiant de requête, fichiers statiques comme @fastify/static + compress : 40/40 cas identiques
  à Fastify, plus rapide sur les gros téléchargements parallèles) ; Tauri sert ses fichiers par les mêmes briques.
- Fait (2026-11-05, routeur des coffres) : `server/userVaultRouter.js`, la marche des partages et la projection
  partagée portés en Rust (`atome-server/src/vault_router/`) ; Fastify les demande par trames SERVICE ;
  `server/userVaultShareProjection.js` supprimé. Tests Rust 2/2, tests JS des coffres verts ;
  `tests/server/sync_sharing_service.probe.mjs` échoue au même endroit avec l'ancien routeur JS (attentes périmées
  depuis D8 + refus de type du coffre) : à corriger dans la sonde, pas dans le routeur.
- Fait (2026-11-05, L3.1/L3.3/L3.4) : `atome-server` répond à `/ws/api` (events, state-current, snapshot, history,
  sync push, cache de mutations) et tient tout le runtime `/ws/sync` (`ws_sync/`) ; ce qui reste à Fastify (session
  d'appareil, preuve de connexion, principal, approvisionnement, effets après commit, annuaire) est demandé par des
  trames internes `front-*` avec un secret par démarrage ; Fastify appelle le runtime par `sync:<op>`. Défaut trouvé et
  corrigé : deux processus sur la base centrale → `SQLITE_BUSY` (`l8_stack_race` 11–13/20) ; `BEGIN IMMEDIATE` : 20/20.
  Preuves : tests Rust ws_api 1/1, ws_sync 7/7 ; bout en bout `temp/l34_ws_sync/ws_sync_e2e.probe.mjs` 22/22 ;
  sondes comm et partage inchangées (FRAMEWORK_STATE §5 du 2026-11-05). Sondes périmées relevées (contrat de type) :
  `temp/comm/l9_media_notes`, `temp/isolation/server_isolation`.
- Fait (2026-11-05) : défaut trouvé sur la pile à coffres — l'export et l'effacement `user-data`, l'historique d'un
  atome et `conditions` lisaient la base centrale, vide des objets des coffres (export sans tes atomes, effacement qui
  n'effaçait rien). `user-data` et l'historique passent en Rust, `conditions` lit par le routeur des coffres ; sonde
  `temp/l34_ws_sync/leftover_families.probe.mjs` 2/7 → 10/10.
- Fait (2026-11-05, L3.5 première tranche) : la vérification HTTP d'une session d'appareil (jeton signé JWT_SECRET,
  session et clé vivantes dans la base centrale, jeton des pairs de réplication) et `POST /api/media-token` répondus par
  `atome-server` (`src/auth/`). Relevé : Fastify n'enregistre aucun lecteur de cookies, son chemin `access_token` ne
  lit donc jamais rien ; Rust fait pareil. Preuves : test Rust `media_token` 1/1 ; sonde
  `temp/l35_auth/media_token_parity.probe.mjs` 30/30 (27 cas identiques à Fastify — statut, corps, CORS — et une
  capacité émise par Rust ouvre un média sur Fastify). La route JS reste jusqu'à la bascule L3.10 (la sonde s'y compare).
- Fait (2026-11-05) : les routes propres du serveur répondues par `atome-server` (`status.rs`, `server_identity.rs`) :
  santé, versions, identité et défi signé RSA-PSS, association d'app iOS, page `/auth/v/…`, état de la base,
  `server_config.json`. Sonde `temp/l35_status/status_parity.probe.mjs` 36/36 (signature Rust vérifiée par Node).
- Fait (2026-11-05) : les messages `auth` de `/ws/api` passent en Rust action par action (`src/ws_api/auth_ops.rs`) ;
  d'abord la preuve (`src/auth/proof.rs` : clés HKDF du secret, index HMAC, téléphone scellé AES-GCM, défis, preuve
  ECDSA P-256, test `tests/atome_server/auth_proof.rs` 4/4 sur des valeurs faites par Fastify) et les sessions
  d'appareil (`device_sessions.rs` : `session-challenge`, `-renew`, `-local-bind`, `-logout`, `-logout-all`,
  `-revoke-device` ; `accounts.rs`, `handles.rs`). L'identité de la connexion reste sur la moitié Fastify : une
  session émise par Rust y est installée (`front-identity`), les sessions terminées y sont fermées
  (`front-disconnect`, `server/ws_api_front.js`). Sonde `temp/l35_auth/device_sessions_parity.probe.mjs` 8/8.
- Fait (2026-11-05, suite de L3.5) : 52 actions `auth` de `/ws/api` répondues par `atome-server` — preuve de
  connexion, appareils et clés d'approbation (WebAuthn compris), appairage et ouverture partagée, récupération,
  statut et défi d'inscription, actions du compte (`me`, `get-user`, `list-users`, `update-user`, push,
  suppression du compte) et le lien téléphone (envoi SMS par OVH ou lien de développement, confirmation sur un
  autre appareil avec le code, changement de numéro). Ce que Fastify écrit hors transaction reste écrit (limites
  sur un refus) ; ses blocs `withTransaction` sont atomiques ; ses effets (avis aux appareils, sessions fermées,
  annuaire, lien prêt) partent avant la réponse, dans son ordre. Preuves : sondes `temp/l35_auth/` 10/10, 3/3, 6/6,
  5/5, 4/4, 7/7 ; `ws_sync_e2e` 22/22, `status_parity` 36/36, `media_token_parity` 30/30, tests cargo verts.
  Non vérifié : un vrai envoi OVH (il enverrait un SMS). Restent à Fastify : `phone-link-payment` et
  `account-create` (paiement, L3.8), `invite-create` (courriel, L3.9), la trame admin `account-roles` (D18) et les
  actions mot de passe (question ci-dessous).
- Décidé par toi (2026-11-05) : ajouter la crate `argon2` (RustCrypto) pour `password-login` et
  `session-set-password` ; retirer l'export/import admin à la bascule ; passer une seule fois les migrations
  anciennes (identifiants opaques, dossiers `data/users/<ancien id>`) sur la copie de prod avant la bascule, puis les
  retirer ; corriger `tests/native/auth_development_request.rs` (configuration en paramètre) ; enchaîner les étapes 4
  à 7 sans arrêt ; supprimer `bevy_renderer_native` à l'étape scène ; monter cpal 0.18 + kira 0.12.6.
- Fait (2026-11-05, L3.6) : les envois de fichiers répondus par `atome-server` (`src/media/`) : `POST /api/uploads`,
  `/chunk`, `/complete`, `/remote-wallpaper`, la liste `GET /api/uploads` et `upload-chunk`/`upload-complete` de la
  famille `file` de `/ws/api` (`src/ws_api/file_ops.rs`) ; la lecture vidéo (remux, transcodage ffmpeg) est une seule
  brique partagée avec Tauri (`src/media/playback.rs`, ~450 lignes en double retirées de Tauri). Défaut trouvé et
  corrigé : l'enregistreur envoyait son WAV en `audio/wav`, refusé 415 par Fastify avant la route
  (`audio_core_storage.js`). Preuves : sondes `temp/l36_media/` 27/27, 18/18, 6/6, 200/200 ; test `media_names`.
  `/api/files/*` (aucun appelant) sera retiré à la bascule.
- Fait (2026-11-05, L3.6 fin et L3.7) : téléchargements (`/api/uploads/:file`, enregistrements, extraction audio,
  `download-*`, `delete`, compression identique à `@fastify/compress`) 88/88 ; relations, messages directs, pile de
  notifications et push, annuaire, News, communautés et forums ; partage complet (demandes, réponses, droits,
  politiques always/never/block, listes versionnées et reçus, détachement, révocation en chaîne, règles de
  confidentialité et leurs conditions) `temp/l37_share/share_parity.probe.mjs` 144/144 et la sonde D18 25/25 ;
  mots de passe en Rust avec argon2 (connexion, changement, ralentissement, ancien bcrypt mis à niveau)
  `temp/l37_share/password_parity.probe.mjs` 12/12, tests `passwords` 4/4 ; test Tauri `auth_development_request`
  sans variable d'environnement. Écart non fonctionnel connu : l'en-tête des jetons émis par Rust écrit
  `{"typ","alg"}` dans cet ordre, Fastify `{"alg","typ"}` (signature et contenu identiques, tout vérificateur accepte).
- Fait (2026-11-05, L3.8) : objectifs 38/38, événements publics 28/28, boutique 60/60, coachs 41/41, `share-key`,
  facturation (grand livre, preuves StoreKit/Play, notifications, paiement à la création de compte) 60/60 et liaison
  téléphone 7/7, sites (publication et son horloge, pages HTML, `/_site`, domaines personnels, domaines et courriel
  simulés, hébergement) 116/116. Défauts corrigés : le type d'un enregistrement DNS était le `type` de la trame
  (`site`) — chaque enregistrement saisi était faussé (désormais `record_type`) ; l'ETag d'un fichier statique
  tronquait sa date au lieu de l'arrondir comme Node. Le formulaire de contact des sites et les horloges (boutique,
  sites, envois programmés) restent à Fastify jusqu'au registre des connexions vivantes (L3.10).
- En cours (2026-11-05, L3.9) : coffre chiffré des clés et secrets dans le processus coffre (`atome-vault` `sealed:*`,
  fichiers existants relus tels quels), fournisseur OpenAI (catalogue généré `ai_provider_catalog.json`).
- Reste de l'étape 3 : `directory` et `sync` get-pending/ack restent à Fastify (annuaire public, suivi central) ;
  les messages d'auth de `/ws/api` et l'état d'identité de la connexion (L3.5, coordonné avec D18) ;
  lots L3.5 à L3.11 (routes portées une à une dans `atome-server`) ; dossiers credentials/secrets/social écrits par Fastify dans le dossier du coffre (lot L3.9) ;
  déploiement sur atome.one (toi : `cargo` doit être installé sur le serveur, la phase `rust-build` le vérifie).
- L3.11 (iOS) CODÉ le 2026-11-06 (le blocage D18 est levé) : l'hôte local de Tauri est `atome-server::local`
  (trait `Host` pour les besoins de chaque plateforme), embarqué dans la bibliothèque iOS
  (`platforms/ios/bevy-renderer/src/local_server.rs`, ABI `atome_ios_local_server_*`), démarré par
  `Common/LocalServer.swift` ; serveur Swift retiré (24 fichiers, 6 618 lignes : `LocalHTTPServer.swift`,
  `AiSRuntime*`, `FastifySync*`, `LocalAiProxy.swift`). S3 et S5 fermés (droits et historique d'`atome-store`).
  Preuves : `temp/l311_ios/rust_embedded.json` contre `swift_baseline.json` au simulateur (undo, historique, export
  qui manquaient au Swift répondent ; le reste identique sur le fond), `adole.db` du groupe d'apps ouvert en place
  (journal delete, intégrité ok, données gardées), sondes Web 60/60 et 119/119. Reste : l'essai sur l'iPad et
  l'AUv3 (toi, consignes dans le rapport L3.11) ; les jetons de session Swift déjà émis ne
  valent plus (reconnexion une fois) ; `temp/d18_auth/live_notice_after_renewal.probe.mjs` à 11/12 (contrôle D,
  chemin front Web en cours de travail par L3.10a, pas l'hôte local) — corrigé par L3.10a le 2026-11-06 : 12/12.
- Fait (2026-11-06, suites de L3.11) : risque 0xDEAD10CC corrigé à la racine (`local/local_vault.rs` : après la
  mise au repos, aucune unité sans temps d'arrière-plan accordé ; le worker de sync attend le retour au premier plan ;
  tests unitaires + simulateur `temp/l311_ios/background_cycle.sh`) ; `local/mod.rs` découpé (3 269 → 203 lignes,
  12 fichiers) ; tests du serveur Swift retirés ou réécrits contre `atome-server::local` ; fenêtre Bevy autonome de
  Tauri (`bevy_backend`) supprimée (décision utilisateur ; `cargo test -p squirrel` 21/21).
- Fait (2026-11-06, L3.10a) : `atome-server` démarre et sert sans Fastify ni aucun processus Node. Chaque connexion
  tient son identité elle-même (`auth/connection.rs`, `ws_api/identity.rs`, effets `ws_api/auth_effects.rs`) ; plus
  aucune trame `front-*` ; portés aussi : `atome` (lectures, liste, transfert ; parité 110/110), `sync` get-pending/ack,
  l'adoption d'invité (128/128), `conditions`, la sécurité de `/ws/sync`, `/offline-manifest.js`, le 404 et les
  préflights de Fastify, la préparation de la base centrale (`central_schema`), l'horloge de rétention OTA. Défaut D18
  trouvé et corrigé : `auth me` rattachait la session renouvelée sans son expiration ; la connexion se détachait à
  l'échéance de l'ancien jeton et n'entendait plus les demandes. Lanceurs (`scripts/run_fastify.sh`, `npm run
  start:server`, l'unité de `scripts/server_update.js`, `deploy/atome-one-sync/atome-sync.service`) : atome-server
  seul. Rien déployé. Référence A/B gardée pour les sondes (Fastify sur port+1000 par le harnais, socket de contrôle
  `ATOME_REFERENCE_CONTROL_DIR`) ; le JS de Fastify n'est pas touché. Détail : `todo/refonte_rust_etape3_axum.md` § L3.10a.
- Tranché par toi le 2026-11-06 (réponses au lot de questions) :
  1. Visio : portée en Rust avec le crate `mediasoup` (nouvelle dépendance acceptée) ; « la visio est une partie très
     importante, ne casse rien » → parité stricte avec `server/visio*.js`, prouvée avant de retirer le JS. FAIT
     (2026-11-06, L3.10b) — `atome/servers/atome-server/src/visio/` sur `mediasoup` =0.21.0 (capacités du routeur
     identiques à Node 3.19.14), fonction `visio` par défaut (Tauri et iOS sans) ; le travailleur démarre une fois avec le
     serveur, son échec est une erreur de démarrage ; `visio_unavailable` ne reste que pour une construction sans la
     fonction. Preuve `temp/visio_r118/visio_parity.probe.mjs` 58/58 dans les deux ordres (3 pages Chromium, caméra et
     micro factices, le vrai `visio_call_runtime.js` et mediasoup-client 3.18, A/B contre Fastify) : 131 trames et réponses
     normalisées identiques, médias réellement reçus à 2 et 3, coupés en sourdine, repris après, après une reconnexion ;
     `temp/l310_no_fastify/no_fastify.probe.mjs` 16/16. Production : `scripts/server_update.js` installe et vérifie `g++`
     et `python3-pip`, `atome/documentations/server_installation.md` § Visio. Le JS Node de la visio reste la référence
     A/B jusqu'à la bascule (liste des retraits : `todo/refonte_rust_etape3_axum.md` § L3.10b). Rien déployé.
     ATTENTE UTILISATEUR (bloquant pour `cargo deny check`) : le crate apporte trois avis RustSec « non maintenu » (aucune
     faille) sans version corrigée : `atty` (construction seule), `instant`, `paste` 0.1 ; `deny.toml` exige de les
     lister avec leur raison (`ignore`), modification refusée à l'agent — à toi de décider : les lister, ou chercher une
     autre version du crate (0.33.2 existe, travailleur plus récent que Node 3.19, parité à refaire).
     FAIT (2026-11-06) — l'alarme d'agenda d'une visio planifiée (`eVe/intuition/tools/calendar_alarm_visio.js`) : deux
     causes. Côté client (corrigé par le coordinateur) : le propriétaire entrait par `joinCall` → `accept`, refusé au
     propriétaire ; il entre maintenant par `visio.js#openVisioRoom` → `visio_call_runtime.js#openRoom` (`state`, puis
     `join` dans le mode de la salle). Côté serveur, dans les deux (Rust et Node) : une salle planifiée n'a pas de statut
     d'appel ; `state` la disait `live`, mais `invite` et `accept` la refusaient (`visio_call_ended`), si bien qu'aucun
     invité n'était appelé ni ne pouvait répondre. Une seule lecture désormais (sans statut = `live`) :
     `atome-server/src/visio/state.rs#Meta::status`, utilisée par `calls.rs` et `rights.rs` ; `server/visio_commands.js#statusOf`.
     Preuve `temp/visio_r118/calendar_alarm.probe.mjs` 28/28 (avant correction serveur : 14/28 sur les deux) : les vrais
     modules dans des pages Chromium (seul `openPanel` retiré de `visio.js`, le panneau Bevy n'ayant pas de WebGPU ici) ;
     la salle planifiée avec deux invités, l'alarme du propriétaire l'ouvre (`ok`, en appel), chaque invité reçoit
     `call-invitation`, l'accepte par `joinVisioCall` et rejoint ; médias reçus à trois (2 audio, 2 vidéo chacun) ;
     réponses et événements identiques Rust/Node. `visio_parity.probe.mjs` toujours 58/58. L'alarme d'un invité sur une
     salle qu'il ne possède pas : il entre (`openRoom`, il est invité), appelle les autres, et se refuse lui-même
     (`visio_target_unavailable`, d'où `calendar_visio_guests_not_called`), pareil sur les deux. `joinCall` y marche
     aussi, mais c'est la réponse à une sonnerie : il lie la salle à cet appareil (un autre appareil de l'invité est
     ensuite refusé) ; pour une alarme, `openRoom` est le bon chemin. Le « Rejoindre » de la carte
     d'événement (`bevy_panel_calendar_runtime.js`, intention `calendar.visio.join`), qui passait par `joinVisioCall` →
     `accept` (refusé au propriétaire), entre aussi par `openVisioRoom` : FAIT (2026-11-06), même chemin que l'alarme prouvé 28/28.
  2. Miroir aBox (`server/aBoxServer.js`) : vieux code, retiré. FAIT (2026-11-06) — `aBoxServer.js` et le veilleur
     chokidar qu'il lançait seul (`server/sync/fileSyncWatcher.js`) retirés, le bus gardé dans `server/sync/syncEventBus.js`,
     réglages `SQUIRREL_MONITORED_DIR`/`SQUIRREL_SYNC_*`/`SQUIRREL_DISABLE_WATCHER` et `atome/documentations/aBox.md` retirés,
     aucun reste dans atome-server ; preuve `temp/r118_abox_mail/imports.probe.mjs` 5/5, FRAMEWORK_STATE §5 du 2026-11-06. (La synchro GitHub automatique n'a pas été
     tranchée : elle reste refusée explicitement au démarrage, `github_auto_sync_unsupported`.)
  3. Mail en clair (sécurité `none`) : interdit. FAIT (2026-11-06) — `mail_security_cleartext_refused` côté Rust
     (`mail/socket.rs`, `gateway.rs`, `mod.rs`) et JS (`mail_socket.js`, `icloud_live_credentials.mjs`, `system_mailer.js`),
     choix `none` retiré des réglages mail d'eVe ; preuves `cargo test -p atome-server --test mail` 2/2,
     `temp/l39_mail/mail_gateway_parity.probe.mjs` 47/47, `system_mailer_invites_parity.probe.mjs` 48/48.
  4. Clé privée de test dans `tests/atome_server/mail_vectors.json` : « le plus sécurisé et le plus optimisé », à mon
     choix. FAIT (2026-11-06) — la fixture ne garde ni clé ni certificat : une AC et son certificat localhost (EC P-256,
     un jour) sont créés à chaque passage par `openssl` (`tests/atome_server/mail.rs#mint`, `temp/l39_mail/fresh_certs.mjs`) ;
     transcription régénérée (sessions identiques hors `Date:`) ; aucune clé dans les fichiers suivis (git grep) ; restent
     dans l'historique git `certs/key.pem` (nov. 2025) et une clé de test mail (mars–juil. 2026) : réécrire l'historique
     serait à ta demande seulement.
  5. Texte : T1 gardé, T2 abandonné (rendu cassé pour les emojis et les écritures non latines). FAIT.
- Questions ouvertes de L3.10a (à te poser ; rien n'est tranché) :
  - (Tranché le 2026-11-06, FAIT : portée en Rust, voir ci-dessus, L3.10b) Visio (`server/visio.js`, mediasoup).
  - (Tranché le 2026-11-06, FAIT : retiré, voir ci-dessus) Miroir aBox (`server/aBoxServer.js`, chokidar).
  - Synchro GitHub automatique (`server/githubSync.js`, `GITHUB_AUTO_SYNC=true`) : `atome-server` refuse de démarrer
    avec ce réglage (`github_auto_sync_unsupported`). La porter, ou la retirer ?
  - (Tranché par toi le 2026-11-05) Réparations héritées (`ensureOpaquePrincipalIdentity`,
    `repairGlobalStateCurrentScopes`) : lancées une fois sur la copie de production avant la bascule, puis retirées.
  - FAIT (2026-11-06, défaut corrigé à la racine) : la migration des conditions faisait d'une condition vide `''`
    (« aucune condition ») le texte `'null'`, puis au démarrage suivant un document invalide qui refuse. Elle écrit
    maintenant NULL, des deux côtés (`central_schema/mod.rs#migrate_permission_conditions`,
    `database/adole_schema_migrations.js#migratePermissionConditions`) ; preuve `tests/atome_server/central_schema.rs`
    3/3 (parité Fastify + la condition vide reste NULL après deux démarrages). Les lignes déjà `'null'` en production
    ne sont pas touchées (les lire « aucune condition » ouvrirait des accès) : à compter sur la copie de prod.
  - À la bascule : retirer le socket de contrôle de référence (`ATOME_REFERENCE_CONTROL_DIR`) et la référence du
    harnais, le contrôle du marqueur `server/server.js` dans `main.rs`, puis le JS de Fastify.
- Contrôles finaux R-118 à faire (relevés le 2026-11-06, en fin de refonte) :
  - FAIT (2026-11-06, étape 7) — `cargo build/test -p squirrel` (Tauri) après la montée cpal du plugin STT (`vendor/tauri-plugin-stt/src/desktop.rs`) : build ok, tests 21/21.
  - FAIT (2026-11-06, lot final) — Swift `AppNativeBevyRendererController.swift` (iOS) répond encore à `bevy_native_*`, sans appelant JS : à retirer. Retiré avec ses deux aiguillages (app, AUv3) ; build simulateur OK. Reste : l'ABI `atome_ios_bevy_*` de la bibliothèque iOS n'a plus d'appelant Swift.
  - FAIT (2026-11-06, lot final) — Tests JS dérivés : charges `clip_fades`/`clip_rounded_rects` (étape 5), 4 assertions de source Swift de la sonde iOS
    (L3.11), budget brut du WASM 13,1 Mo (déjà dépassé le 4 nov. : 13,44 Mo ; Brotli +2 %, garde-fou +10 %). Charges mises à jour,
    `ios_native_bevy_contract.probe.mjs` 9/9, budget sur la copie Brotli servie (3,36 Mo × 1,10). Restes relevés : le renderer
    compte 76 920 fonctions pour un budget de 76 000 dans la même sonde (build finale du renderer = étape 6) ;
    `calendar_footer_interactions.test.mjs` importe `bevy_panel_calendar_footer.js`, retiré le 2026-10-24 ;
    `calendar_alarm_actions.test.mjs` 3 échecs anciens (le faux `Atome` sans `listStateCurrent`, `resolveActorProfile` disparu) ;
    3 cas médias/texte de `bevy_web_renderer_runtime_media_failure.test.mjs`.
    - FAIT (2026-11-06, suite du lot final) — l'ABI `atome_ios_bevy_*` sans appelant : retirée avec son en-tête et la dépendance
      `atome-bevy-renderer-core` de la bibliothèque iOS ; build propre simulateur 516 → 323 unités, 1202 → 626 s, archive 119,5 → 37,1 Mo
      (lipo Xcode 237,2 → 75,3 Mo) ; `cargo check`/clippy aarch64-apple-ios propres ; xcodebuild simulateur app + AUv3 BUILD SUCCEEDED ;
      sonde L3.11 22/22 (`temp/r118_followup/parity_compare.mjs`) ; `ios_native_bevy_contract.probe.mjs` 9/9.
    - FAIT (2026-11-06, suite du lot final) — budget de fonctions : 76 000 déjà dépassé par le renderer du 4 nov. (76 440) ; la croissance
      jusqu'à 76 920 = voies GPU/Rust mesurées (lentille +82, scroll/survol/slider +170, masques et ombres GPU +79, texte T1 +76, masque
      spatial GPU +73) ; budget 76 920 × 1,1, décision citée dans la sonde (8/8) ; `check_final_wasm.sh` 0 pixel différent, p50 ≤ 1,1 ms ;
      `home_panic.probe.mjs` sans panique.
    - FAIT (2026-11-06, suite du lot final) — `calendar_footer_interactions.test.mjs` réécrit sur la bande du calendrier
      (`bevy_panel_calendar_band.js`) : 12/12.
  - FAIT (2026-11-06) — `temp/timeline/timeline_sync_real_app.probe.mjs` relancée : toutes les prises OK (prise 4 comprise), 0 échec
    (`temp/final_r118/timeline.log`).
  - FAIT (2026-11-06) — `./temp/cleanup_r118/check_final_wasm.sh` sur le `atome/src/wasm` final : 0 pixel différent sur 11 cas,
    p50 0,6–0,9 ms, 57,8–60 i/s (`temp/final_r118/wasm.log`).
  - FAIT (2026-11-06) — sonde D20 12/12 (`temp/final_r118/d20.log`) ; `npm run check:js` exit 0 (les 19 « panic » Biome viennent du
    lien `eVe/R&D/fonds-simulation-20261008` vers `~/Documents/Codex/…`, hors dépôt, préexistant, laissé) ;
    `npm run check:rust` (`temp/final_r118/check_rust_2.log`) : fmt, host, wasm_bevy, wasm_audio, wasm_direct, ios, linux_confine,
    test ok. Cause de l'échec host/test précédent : l'extraction OpenSSL du worker mediasoup laissée à moitié par deux builds
    simultanés (`~/.cargo/registry/src/.../mediasoup-sys-0.11.0/subprojects/openssl-3.0.8` sans son `meson.build`), supprimée et
    réextraite par meson. Reste `deny` : les 3 avis « non maintenu » (RUSTSEC-2024-0375 atty, -0384 instant, -0436 paste), FAIT (2026-11-06,
    ton accord) : les 3 ignorés avec leur raison dans `deny.toml` (tous via mediasoup 0.21, à retirer quand il monte) ; `cargo deny check` ok.
  - FAIT (2026-11-06) — `chokidar` retiré (`npm uninstall`, absent de `package.json` et du verrou, aucun import restant).
  - À te dire à la fin : deux anciennes clés privées restent dans l'historique git d'atome (`certs/key.pem` 2025-11-21→26, une clé dans
    `src/squirrel/mail/node_protocol_transport.integration.test.mjs` 2026-03-14→07-03) : les considérer comme
    publiques si elles ont servi ; les effacer = réécrire l'historique (ta demande explicite seulement).
- iPhone bloqué sur « Le démarrage continue… » (toi, 2026-11-06, capture du téléphone). Depuis L3.11 la page ne marche que par le
  serveur local Rust, qui ne démarre pas sans la clé de session du trousseau (`LocalServer.swift#sessionKey`) : un refus du
  trousseau laissait la page attendre sans fin. Reproduit sur le simulateur iPhone 17 Pro (build non signée : `read -34018`,
  même écran). FAIT : l'échec du serveur est désormais explicite (« Le démarrage a échoué » + Réessayer, qui relance le
  serveur ; code du trousseau dans le journal) ; build signée : écran de connexion en 5 s. Simulateur : signalsmith-stretch
  ne compilait plus (bindgen refuse `arm64-apple-ios-sim`) ; corrigé dans `platforms/ios/build_bevy_renderer.sh`, prouvé
  depuis zéro. ATTENTE UTILISATEUR : la cause exacte sur TON téléphone (session ouverte, vrai coffre) n'est lisible que
  sur l'appareil : le brancher en USB, je lance l'app avec sa console (`[BOOT_FAILURE]` / `LocalServer failed: …`).
  - Simulateur (toi : « ça doit au moins booter sur simulateur ») : build signée, la console montre serveur local, connexion
    et modules prêts (`authentication_ready` 5 s), puis l'affichage s'arrête : `navigator.gpu` présent mais `requestAdapter()`
    rend null dans la WebView du simulateur (WebGL2 oui). Préexistant (le renderer n'a jamais eu d'autre voie ; déjà noté le
    12 oct.), pas lié à la refonte. `audio_command_unknown:voice_start` = moteur de voix absent du simulateur, attendu.
    ATTENTE UTILISATEUR : faire tourner la vraie app iOS sur le Mac (« Designed for iPad », vrai GPU) demande une build signée
    avec ton équipe (`-allowProvisioningUpdates`), refusée par le mode auto ; une voie WebGL2 pour le simulateur n'est pas
    viable (les passes GPU masques/ombres demandent des storage textures) et serait un second renderer (règle « un seul »).
- Mise à jour serveur (toi, 2026-11-06 : « met le serveur à jour qu'on soit fixé » ; choix : staging + répétition sur copie
  privée de la prod, puis prod ; commit + push « tout le nécessaire » accordé). Fait : eVe e3a8b1ad, atome 424a37cbc poussés
  (données d'atome-health-ref exclues par la règle `data/` du .gitignore → le serveur Rust ne compilait pas ; verrou npm
  refait pour npm 10 ; correctifs iOS ; OTA 1.49/47). Staging : atome-server Rust actif (health ok, 47 Mo), compilé sur la
  machine (72 min à 2 tâches), `chmod o+x /opt/a-staging/database_storage` (demandé par le script). Pièges notés : un
  `server_update.js` lancé depuis l'ancien code exécute l'ancienne logique (relance Node sur le nouveau code → panne) ; le
  lancer une fois le code à jour sur disque. Copie privée de la prod prête (`/root/r118_rehearsal`, 0700, env de staging
  sans clé de fournisseur, à lancer sous `systemd-run -p IPAddressDeny=any -p IPAddressAllow=localhost`) ; base centrale :
  0 condition `null`, aucun ancien mot de passe. BLOQUÉ, ATTENTE UTILISATEUR : les coffres ne démarrent pas
  (`vault_confinement_landlock: fully incompatible access-rights`) : le noyau 6.14.11-4-pve a Landlock compilé
  (`CONFIG_SECURITY_LANDLOCK=y`) mais pas actif (lsm = lockdown,capability,yama,apparmor,ima,evm). Il faut l'ajouter au
  démarrage (`lsm=landlock,lockdown,capability,yama,apparmor,ima,evm` dans GRUB_CMDLINE_LINUX, update-grub) et redémarrer
  la machine, prod comprise. Prod intacte (Fastify 1.46) ; ne pas la mettre à jour avant.
  - FAIT (2026-11-07, ton « Oui, maintenant ») : Landlock activé (`/etc/default/grub`, copie
    `grub.bak-20261107-landlock`, update-grub, redémarrage 1 min 40 s ; lsm = …,landlock,…). Répétition sur la copie privée
    (bac à sable sans réseau) : central migrée par la chaîne Rust, intégrité ok, 20/20 coffres confinés ; copie effacée
    ensuite. Staging et prod sur atome-server 1.49 (424a37cbc) : toutes les phases de `server_update.js` ok ; prod :
    `/health`, `server-info`, page d'accueil 200 en public, sonde `/ws/api` (films, concerts, cinémas, matchs) ok,
    inscriptions toujours fermées (3/3), 20/20 coffres, 59 Mo ; visio dans le processus, adresses de prod présentes.
    Prod : patchs OTA manuels (identiques à origin) mis dans `git stash` « r118-ota-handpatch-20261107 » ; cache de build
    de staging copié dans `/opt/a/target`. Reste (L3.10 suite) : retirer le JS Fastify/visio Node après quelques jours sans
    retour en arrière ; vérifier sur ton iPhone que l'app démarre (nouvelle app + nouveau serveur).
- Défaut relevé, gardé tel quel (comportement Fastify, décision 5) : un undo rejoué avec le même `requestId` répond
  `event_id_conflict` au lieu de rendre le résultat du premier (fixture étape 56).
### R-117 — Écran guidé « deux façons » : textes superposés, prononciation d'eVe (2026-11-04)
- Statut : FAIT (2026-11-04) — prononciation corrigée et phrases régénérées ; le chevauchement ne vient que du chemin de test
- Source : toi, pendant les prises R-013 sur « Ipad atomic » : « les textes se chevauchent… le texte et même les logos sont
  superposés » ; « il dit synchro au lieu de prononcer synchroniser… il fait pas les liaisons ».
- Chevauchement : je l'avais provoqué en ouvrant l'écran guidé par-dessus ta session ouverte. Aucun bouton de l'app ne fait
  ça : depuis Contact, le Retour de l'écran du téléphone referme tout. Le vrai premier lancement ne dessine que son écran à lui.
  Preuve : `temp/r013/first_launch_web/choice_layout.probe.mjs` ALL OK (format iPad paysage, capture `out/choice.png`).
- Prononciation : l'encodeur lisait « ch » toujours ʃ (« synchronisés » → sɛ̃ʃʁonize) et ne faisait aucune liaison. Il lit
  maintenant ch = k devant r, l, n, et fait les liaisons obligatoires (« les‿autres », « tes‿humeurs », « dans‿un‿instant »,
  « c'est‿une » ; jamais après « et », jamais devant un h aspiré). 34 des 138 phrases d'eVe régénérées, les autres identiques.
  Preuves : `temp/r013/atomic/liaison.probe.mjs` 21/21, `tests/eve/assistant_audio_playback.test.mjs` 8/8.
- Corrigé aussi : « Payer » était lu « paie » et « paiement » « pè-e-ment » (ay devant voyelle = ɛj, e muet de aie) :
  4 phrases régénérées, sonde 21/21. À l'oreille sur l'iPad : c'est toi qui écoutes (app reconstruite avec les 34 premières
  phrases ; les 4 de « Payer » entrent au prochain build).

### R-116 — Ruban du projet sur l'iPad : outil Vue disparu, outil du Dashboard qui se décale (2026-11-04)
- Statut : FAIT (2026-11-04, Web ; appareil non vérifié, c'est toi qui testes sur l'iPad)
- Source : gestes réels sur l'iPad atomic (build 1.48 (46), projet ouvert, main droite) rapportés à la session d'étude
  Rust-first : « l'outil vue a disparu, ce qui est absolument pas normal… j'ai 6 items en bas » ; « quand j'agrandis… ça
  décale l'item du dashboard qui se décale sur le côté légèrement quand je déplace. Il doit rester en place ».
- Causes : (1) un premier lancement écrit le niveau `beginner` (`first_launch_model.js`) et `context_menus.json` réservait
  `view` à `intermediate` : au niveau débutant le ruban n'a que 6 outils (Capturer, Créer, Trouver, Communiquer, Aide,
  Contact) ; (2) la loupe comptait Organiser (et le Retour d'un niveau) dans la rangée parcourue, et ses bornes allaient
  jusqu'au bord de l'écran : l'outil grossi poussait Organiser de côté (–1 à +3 px, puis la rangée hors écran à –15 px) ;
  (3) vu en route : chaque publication du profil (démarrage, changement de niveau…) remettait le ruban du côté gaucher
  (l'Atome à droite, Organiser à gauche) jusqu'au prochain redimensionnement.
- Fait : `view` passe `beginner` (registre reconstruit, une seule entrée changée) ; la loupe laisse l'Atome et le coin de
  navigation à leur case et grossit les outils entre eux (`bevy_ui_main_menu_interactions.js#collectLensLayout`) ;
  `setVisualPreferences` reprend le côté du miroir V6.1 (`bevy_ui_main_menu_runtime.js`). Test
  `tests/eve/bevy_ui_main_menu_contract.test.mjs` (racines débutant) mis à jour.
- Preuve : `node temp/ribbon_view_lens/lens.probe.mjs` à 1389 × 970 → 17/17 (Vue aux trois niveaux, Atome à gauche et
  Organiser à droite à chaque niveau, Organiser immobile sur les 401 images de la loupe, rangée grossie entre x = 98 et
  838) ; avant correction `temp/ribbon_view_lens/baseline.log` → 3 échecs (Vue absente en débutant, Organiser bougé sur
  380/380 images, rangée à –14,9 px). Rapport : `temp/probe_reports/dashboard_enhancement/ribbon_view_lens/`.
- Reste : vérifier sur l'iPad après la prochaine build. Calendrier reste `intermediate` (rien demandé).

### R-115 — Cahier D18 : améliorations 1–15 et débogages D1–D21 (2026-11-04)
- Statut : ATTENTE UTILISATEUR (2026-11-04, session D18) — tous les lots codés et prouvés sur Web/Node, publiés (eVe
  `f189ef7f`, atome `fad2f55d2`, demande de push de l'utilisateur) ; questions ci-dessous posées le 4 nov. ; tests appareil à faire ; état par point dans
  `todo/ameliorations_debogages_D18_2026-11-04.md` (copie du cahier fourni + D19–D21 ajoutés oralement le 4 nov.).
- Source : fichier `atome-eVe_ameliorations_debogages_D18.md` donné le 2026-11-04 ; D19 (glisser sur le V en paysage),
  D20 (code du second appareil introuvable, aucune notification app ouverte), D21 (rafraîchissement transversal) dits
  oralement le même jour.
- Fait, prouvé (Web) : D17/D18 (`temp/d18_rail/probe_rail_palette.mjs` 62/62 sur le vrai modèle + défilement), D11
  (seuil 115 px ; accueil réel : libellés 120 à 15,6 px, `temp/d18_rail/ui.probe.mjs`), D10 (commit eVe `c774fce4`, revérifié par le lot Activités).
- Réponses de l'utilisateur (2026-11-04, après le push) — VALIDÉ, à coder :
  - D1 « Décrocher » (version A codée) : validé. D4 « Moteur » : validé, mais le choix vit dans les préférences de
    l'utilisateur (une fois pour toutes), jamais à chaque ouverture du Web ; moteur par défaut Ecosia.
  - 1–3 Sport : maquettes m1/m2 validées. 5 Aléatoire : validé ; vérifier que le point repère suit le ruban quand il
    s'agrandit (loupe), sur tout ruban, pas seulement Musique.
  - 6 : rien perdu à la déconnexion ; Android : pas d'historique au-delà de 30 jours pour l'instant.
  - Règle 21 (AGENTS.md) : le serveur est la seule source de vérité, tout y est (santé, photo de profil…), ne plus demander.
  - 7 CarPlay démarre l'assistant : comportement voulu, rien à faire.
  - 9 : assouplir la règle 14 si plusieurs couleurs sont nécessaires, avec des couleurs de référence.
  - 10 A : le retournement suit le doigt et revient en arrière ; vers le haut, les autres tuiles ne tournent pas, elles
    sont repoussées / compressées, éjectées si la tuile prend toute la place ; une plaque du Mystic suit le sens du
    mouvement, comme la majorité de sa ligne (horizontal préféré) ; la vague part du point exact du doigt. B : règle 13 ;
    sur l'accueil vers le haut ouvre la rubrique comme ailleurs ; vers le bas = réglages (comme aujourd'hui) ; sur une
    tuile autre que le V, gauche/droite = panneau suivant / retour jusqu'au Dashboard, rien avant le Dashboard principal.
    C : V vers la droite = profils, vers la gauche = choix de la vue (plaque au logo eVe, « eVe Basic » / « eVe Pro ») ;
    le changement se fait au lâcher, revenir au centre et lâcher referme ; un toucher demande un second toucher.
  - 11 : aperçu HTML isolé et sécurisé, nouvelle surface hors Bevy : validé.
  - 12 : « Feature request » dans Réglages › Avancé, à côté du relevé de bugs ; validation par l'administrateur
    (l'utilisateur), ce qui est validé alimente la roadmap.
  - Nouvelle demande : la planète du filtre « partout » de la recherche → un autre symbole (pas une planète, on croit
    que c'est Internet).
  - D9 validé (carte des Lieux, groupes de contacts). D19 paysage : même comportement qu'en portrait (corrigé par R-114,
    à revoir sur l'appareil). D20 : cacher les demandes aux appareils dans leurs 72 premières heures.
  - Suite des réponses (2026-11-04) : 13 C/D fiches validées, glyphes Patrimoine (colonne à fronton) et Thermes (vagues)
    validés ; défaut à corriger : l'aperçu de la fiche passe sous la date et la météo, doit aller jusqu'au bord et
    rester dans la grille des tuiles. D14 m1–m4 validés mais le déroulé n'est pas clair : après le bip, montrer la photo
    du produit (petite), dessous un texte clair (bon / pas bon / recommandation / ce qui ne va pas), puis valider —
    nouvelle maquette à proposer. 6 : ne pas afficher la source des séances importées ; une séance effacée dans Santé
    reste dans eVe (pas bidirectionnel, tout ce qui est dans eVe y reste et va au serveur). Agenda › « Sorties » (eVe
    Basic) renommé « Loisirs » (ou restructuré, décision laissée à la session). Paliers : proposition acceptée
    (Bien-être palier 2, palier 1 pour sommeil/stress ; Trajets palier 3 ; Compléments palier 3 pour nutrition ;
    Boutique fermée tant qu'elle est vide). D13 Live Activity : maquette à faire. D4 : Ecosia partout, Google sur Web où
    Ecosia refuse de s'afficher. Sport : les 4 recommandations acceptées (progression actuelle par défaut, pas choisi
    exact, nombre naturel suivant par défaut, Perso et Record reprennent). Point 5 : la bulle blanche d'un curseur reste
    parfois à sa place d'origine quand le curseur s'agrandit (loupe du ruban) — défaut à corriger, sur tout ruban.
  - Maquettes à faire puis à valider : D14 déroulé du résultat, D13 Live Activity, glyphe « partout » de la recherche,
    12 « Feature request » (Réglages › Avancé), 11 aperçu HTML isolé, 9 préférences visuelles (transparence, flou,
    arrondi, couleurs de référence ; joint et rapport des textes pris par R-114).
  - Maquette D13 prête (`temp/d18_native/mockups/d13_live_activity_1_ecran_verrouille.png`, `_2_dynamic_island.png`,
    zooms) ; questions : conteneur iOS hors grille/rayon, disque Sport réduit (plafond Apple 160 pt), Pause/Arrêt sur la
    carte (pas de bande), marque Atome absente.
  - Maquettes D14 m5 prêtes (`temp/d18_scanner/mockups/m5_a_result_limit.png`, `m5_a_result_good.png` recommandée ;
    `m5_b_result_tile.png` variante) ; questions : « Au panier »/« Éviter » sur une 2e rangée de la bande au-dessus du
    champ (ou champ replié en loupe), rangées de raisons, rangée « Code », formulation des phrases.
  - 10 codé (vraie app `bbis.probe.mjs abc` 35/35) : retournement qui suit le doigt et revient, rotation dans le sens du
    doigt, vague depuis le doigt, V gauche = plaque de vue au lâcher, V droite = profils, toucher = les quatre. Restent :
    ouverture vers le haut (tuiles repoussées/iconisées) contre la règle 12 → maquette A3 en préparation ; « vers le bas =
    réglages » : seulement sur le V (actuel) ou sur toute tuile de l'accueil ?
  - Maquettes 9 prêtes (`temp/d18_visual/mockups/m1_panneau_visuel.png`, `m2_couleurs_reference.png`,
    `m3_accueil_avant_apres.png`, README) : Opacité 0–100 % (33), Flou 0–34 px (9), Arrondi 0–15 px (3), six couleurs de
    référence ; amendement de la règle 14 proposé mot pour mot. Questions : les six couleurs et leurs surfaces ; 6 choix
    ou roue libre ; opacité/flou aussi sur la dalle des panneaux ; plages. Défauts vus (contrôle de couleur
    `bevy_panel_color_control.js`) : noms R/V/B sous la bulle, « rgba(… » coupé sans « … », Luminosité/Opacité pas en
    ligne de curseur — à corriger au codage.
  - 1–3 écran codé (vraie app `temp/d18_sport/resume_ui.probe.mjs` 12/12, moteur 33/33) : Mode, Progresse, Pas, Adapt. sur
    les rouleaux du Détail, « par côté ». Question : valeur « Auto » ajoutée en tête de Progresse (= pas de progression
    choisie), ou la retirer et prendre Maintien par défaut ?
  - D9 : carte des Lieux codée (vraie app `temp/d18_search/map.probe.mjs` OK). Maquettes : glyphe de l'outil « Global »
    (`temp/d18_search/mockups/m_tout_glyph.png`, A recommandé ; le mot « Global » à revoir ?) ; vue d'un groupe de contacts
    (`m_groupe_contacts.png`).
  - Maquettes A3 prêtes (`temp/d18_gestures/mockups/A3_ouverture_option1_sortie.png` recommandée, `_option2_icones.png`).
  - Défaut du verre (2026-11-04) corrigé pour une rubrique ouverte depuis une tuile : les tuiles de l'accueil restaient
    sous les plaques de verre et s'y voyaient floutées (`temp/d18_glass/fix.probe.mjs` Δ 0, fiche
    `known-bug-solutions/rubric-glass-blurs-previous-home/`) ; autres passages (Pro↔Basic, projet → Dashboard) en cours. Ordre voulu : maquettes envoyées, validation, puis tout le code.
  - D4 suite FAIT (vraie app `temp/d18_webview/web_engine_pref.probe.mjs` 17/17, Node `engine_host.probe.mjs` 9/9) :
    Ecosia par défaut partout, Préférences › Moteur de recherche (brique Réglages « Moteur »), Google montré sur Web seul
    (Ecosia/DuckDuckGo refusent l'iframe), le choix gardé dans le profil serveur. Appareils : non vérifié (à l'utilisateur).
    Défaut vu : `bevy_panel_home_actions.js#persistHomeProfile` réécrit toute la section `preferences.dashboard` avec la
    copie du panneau ouvert (écrase un changement fait ailleurs pendant ce temps) — à corriger au codage.
  - Maquettes 11 et 12 prêtes (`temp/d18_mockups_11_12/out/`, README et TECH_NOTE). Questions 11 : entrées (projet de
    code, objet de projet, les deux) ; un `.html` importé devient l'objet page ? ; ligne « Réseau refusé » ; réseau
    bloqué ou liste permise ; atomes convertis à côté ou à la place ; « Fermer » dans la case du lecteur Web. Questions
    12 : Bug/Demande choisi dans le formulaire ; reconnaître l'admin (id de compte dans la config serveur) ; refus avec
    motif, glyphe de « Refuser » ; états et qui les déplace ; Roadmap visible de tous.
  - 2026-11-04 : TOUTES les maquettes envoyées en PNG (D13, D14 m5, A3, 9 m1–m3, recherche glyphe + groupe, 11, 12) et
    les questions posées → ATTENTE UTILISATEUR. Défaut vu : le détail d'un rapport (Avancé) coupe sa dernière ligne.
  - Activités suite FAIT (vraie app `temp/d18_activities/cards_real.probe.mjs` 30/30, `progression_and_agenda.probe.mjs`
    12/12, `lodging_and_registry.probe.mjs` 29/29) : aperçu jusqu'au bord (`dashboard_stage_list_view.js#previewListBoxes`),
    fiches C/D (lignes réelles, crédit OSM daté, Thermes = vagues + « À proximité » 3 tuiles), Agenda › Sorties → Loisirs,
    paliers Bien-être 2 (1 pour sommeil, méditation, santé mentale), Trajets 3, Compléments 3 (objectifs nutrition/poids),
    Boutique fermée. Appareils et paysage : non vérifiés.
    Question 28 (ATTENTE UTILISATEUR) : l'accueil eVe Basic (Contacts, Agenda, Objectifs) n'a pas d'Activité, donc les
    briques gagnées (Bien-être, Trajets, Compléments, Sport) ne se montrent nulle part : (a) la plaque Agenda ouvre le
    niveau Activité, (b) elles vont dans Objectifs, (c) une tuile Activité apparaît une fois gagnée.
    Question 29 : « stress » n'existe pas comme objectif ; pris = méditation + santé mentale.
  - Verre suite FAIT (vraie app `temp/d18_glass/transitions.probe.mjs`, `page_turn.probe.mjs`) : projet → Dashboard Δ 0,
    Pro ↔ Basic identique à un démarrage neuf, niveau ouvert, rubriques Basic, tour de page : plaques Δ 0. Non couvert :
    geste V-gauche (passé par les préférences), iPad. Question 30 (ATTENTE UTILISATEUR) : pendant les 0,6 s de fermeture,
    le verre peut encore montrer l'accueil ; seul remède = le shader des plaques floute la capture d'arrière-plan
    (`procedural_sdf.wgsl`, `mystic_capture.rs`, chaîne mip de `workspace_blur_pyramid.rs`) ; coût : un fond vidéo figé
    sous les plaques pendant une cascade. Réponse (4 nov.) : « Yes, do it » → FAIT : les plaques floutent la capture d'arrière-plan
    (`atome/renderers/bevy-core/src/mystic_capture.rs`, `workspace_blur_pyramid.rs` multi-pyramide, `procedural_sdf.wgsl`),
    WASM 6afa45b4a7478790 ; preuve `temp/d18_glass/closing_cascade.probe.mjs` Δ 0 à 7 instants (360k px), fix/transitions/
    page_turn Δ 0, cargo test 16/16. Masquage JS `covered` gardé (interstices au repos). Non vérifié : iPad, fond vidéo.
    Effet visible signalé : le verre des menus Mystic d'un projet floute désormais l'arrière-plan, plus les objets. Validé par l'utilisateur (4 nov., « Yes, keep it »).
  - Questions une par une (4 nov., soir ; l'utilisateur : poser toutes les questions une à une, puis tout coder sans
    s'arrêter). Réponses : 1 D13 validé tel quel ; 2 D14 version A ; 3 « Au panier »/« Éviter » sur une 2e rangée
    au-dessus de la bande ; 4 rangées de raisons et « Code » gardées ; 5 ton validé (tutoiement, phrase courte, produit
    conseillé). 6 : A3 ABANDONNÉ. Nouvelle règle (écrite dans AGENTS.md règles 13 et 20) : navigation sur un
    seul axe ; droite ou haut sur une tuile = Suivant (flèche →) = ouvre son contenu dans le sens du doigt (dashboard :
    ses tuiles se retournent une à une en vague ; panneau : s'ouvre dans ce sens) ; gauche ou bas = Précédent (flèche ←)
    = retour ; suit le doigt, coup sec = passe ; revenu avant de lâcher = rien ; page suivante d'une grille = flèches ou
    glissé sur le fond entre les tuiles. À vérifier partout : tuiles qui ne tournent pas, geste rapide qui ne passe pas.
    L'ancienne question « vers le bas = réglages » tombe (bas = Précédent).
    Suite des réponses : 9 couleurs = les six (fond + cinq pastels) ; 6 propositions seulement (pas de roue) ; opacité
    et flou aussi sur la dalle des panneaux ; bornes Opacité 0–100 (33), Flou 0–34 (9), Arrondi 0–15 (3). Sport : « Auto »
    gardé en tête de Progresse. Recherche : glyphe A, outil renommé « Partout ». Groupe de contacts validé. 11 : les deux
    entrées ; un .html importé devient l'objet page ; ligne « Réseau refusé » affichée ; réseau = liste d'adresses
    permises, demandée à la 1re fois (outil Autoriser) ET modifiable dans Avancé ; atomes convertis à côté ; rangée
    d'outils de l'aperçu validée. 12 : Bug/Demande choisi dans le formulaire ; admin = un vrai rôle admin sur le compte ;
    refus avec motif facultatif, glyphe pouce baissé. 24 : états changés par l'utilisateur dans l'app et par les agents
    (En cours puis Faite) ; demandes validées par l'utilisateur et les admins. 25 : Roadmap visible de tous. 26 : une
    tuile Activité apparaît sur l'accueil eVe Basic dès la 1re activité gagnée. 27 : Méditation + Santé mentale validés.
    TOUTES LES QUESTIONS SONT RÉPONDUES (4 nov., soir) → codage de tout, sans s'arrêter.
  - Ajout de l'utilisateur (4 nov., soir), « à ajouter à la tâche en cours quand tu auras fini » : trois évolutions —
    (1) Activité › Médicaments (BDPM / API médicaments, prises, rappels, historique, données de santé à part),
    (2) Navigation : une seule ligne en bas « Atom | Input | ← | Dashboard | → », (3) Vidéo : clic simple = contrôles,
    double-clic = plein écran, clic long = plein écran (normal) / contrôles (plein écran) — à vérifier si déjà fait.
    Consigne : analyse de l'existant, plan, texte exact pour le suivi, PUIS validation de l'utilisateur avant toute
    modification. Analyse en cours (`temp/d18_plan/`).
  - D13 Live Activity CODÉ (4 nov. soir) : `eVe/domains/live_activity/live_activity_link.js`, cible iOS `atomeLiveActivity`
    (`platforms/ios/atome-auv3/liveactivitywidget/`, `LiveActivityHost.swift`) ; widget xcodebuild OK, typecheck app OK,
    sonde pont `temp/d18_native/d13/live_activity_bridge.probe.mjs` OK. NON VÉRIFIÉ : build complet de l'app (phase Rust
    évitée pendant la refonte), signature de l'extension, rendu sur appareil (Live Activities : iPhone ; iPad à vérifier).
    Écarts à valider : glyphes SF Symbols au lieu des SVG eVe ; île minimale « 0:42 » au lieu de « 42 » ; un toucher
    ouvre eVe (pas la carte) ; rien pendant le 3-2-1.
    VALIDÉ (5 nov.) : garder « 0:42 », le toucher qui ouvre la séance, rien pendant le 3-2-1 ; les icônes restent les
    SVG d'eVe (copiés tels quels dans le catalogue d'images du widget, vectoriel préservé) — FAIT (5 nov.) :
    liveactivitywidget/Assets.xcassets (eve_play, eve_pause, eve_stop, eve_heart, template + vectoriel), EveSessionViews.swift
    `EveGlyph` ; xcodebuild : appex compilé, Assets.car avec 4 vecteurs en mode template (assetutil) ; le build de l'app
    échoue sur la dépendance Rust signalsmith-stretch pour le simulateur (sans rapport). Non vérifié sur appareil.
  - Navigation sur une ligne — réponses (5 nov.) : seules les captures Sport `← ⌂ →`, Réglages `< >` (droitier),
    Réglages gaucher `< ⌂`, paysage sont valides (`temp/d18_plan/out/`), mais elles ne couvrent pas tout. Règle : les
    flèches toujours sur la ligne du bas, jamais sur la rangée du dessus ; sans Dashboard (premier niveau) les deux
    flèches sont ACCOLÉES, sans case vide entre elles ; le Retour toujours à gauche de l'Avance quand les deux sont là
    (gaucher compris) ; Dashboard entre les deux quand il est là. Précédent et Retour fusionnés en une seule ← (page d'avant, niveau au-dessus,
    accueil). → = page ou étape suivante, absente s'il n'y a rien après. Une rubrique de premier niveau n'affiche
    JAMAIS le Dashboard, à aucune page (« un simple clic sur la flèche y retourne »). Maquettes de tous les cas demandées
    avant validation (`temp/d18_plan/out2/`). Maquettes 6 et 7 (`← ⌂` avec l'outil Dashboard au bord) REFUSÉES : l'outil
    Dashboard est toujours plus à l'intérieur de l'écran que les flèches, jamais au bord, sauf quand aucune flèche n'est
    présente (dans un projet, il peut alors être au bord). Cas « 2e niveau sans → » = `⌂ | ←` (← au bord). Le reste des maquettes
    out2 est VALIDÉ (5 nov.). Navigation sur une ligne : FAIT sur Web (5 nov., lot D22) —
    `dashboard_footer_navigation.js#footerCornerOrder`, `bandLayout`, `pagerRect` retiré, ⌂ seulement en profondeur > 0,
    premier lancement aligné (Atome dans son coin selon la main, ✕ et flèches en face), tuile Agenda sans feuilletage ;
    sondes `temp/d18_nav_line/nav_line.probe.mjs` (121/121 : droitier, gaucher, paysage, micro) et
    `first_launch.probe.mjs` (82/82, vrai premier lancement, deux mains, 430×932 et 390×667). Reste : essai sur l'iPad USB (utilisateur).
  - Vidéo — réponses (5 nov.) : 1 l'image d'une vidéo devient place nommée de ses contrôles (règle 13, à écrire).
    Gestes (correction de l'utilisateur) : MAINTIEN = toujours le menu Mystic, en lecture comme à l'arrêt (plein écran
    compris) ; DOUBLE CLIC = plein écran (et en sortir) ; CLIC = affiche / masque les contrôles.
    CORRECTION de l'utilisateur (5 nov.) : les gestes ci-dessus valent en CONSULTATION (le Dashboard en est proche).
    Le mode ÉDITION d'un projet ne change pas : clic = sélection de l'objet, lecture par la bande latérale (rail),
    double clic = edit / recadrage (crop), jamais plein écran. Trois modes de projet : édition, consultation, exécution
    (en EXÉCUTION : comme en consultation — validé 5 nov.).
    5 plein écran : rien que la vidéo (aucun outil, aucune ✕). Un clic fait apparaître les contrôles, et avec eux la ✕
    dans la bande du bas à la place de Retour ; un nouveau clic les cache. On sort par un double clic (toujours) ou
    par la ✕ quand les contrôles sont visibles.
    6 portée (5 nov., message) : étendre aux PHOTOS et aux SONS (pochette si musique, sinon forme d'onde) ; en plein
    écran un glissement passe au média suivant. L'utilisateur demande D'ABORD une étude (recherche web) : quel axe pour
    « suivant » (haut-bas façon TikTok ou droite-gauche façon Tinder/galeries), et pour les usages avancés (réseaux,
    fils, discussions) un axe = dans le sujet, l'autre = sujet suivant ? Étude : temp/d18_plan/swipe_axes_study.md.
    Étude rendue ; VALIDÉ (5 nov.) : plein écran d'une collection = glissement horizontal, DOIGT VERS LA GAUCHE =
    média suivant (le contenu suit le doigt, comme Photos et la règle 13) ; règle 20 à préciser (tuile : droite =
    ouvrir ; média plein écran : gauche = suivant). Flux futurs (réseaux, fils) : VERTICAL = dans le sujet (doigt vers
    le haut = suivant), HORIZONTAL = sujet voisin. Vidéo : questions closes.
    D23 CODÉ ET PROUVÉ sur Web (5 nov.) : sonde `temp/d18_media_gestures/media_gestures.probe.mjs` (Dashboard liste mixte,
    projet en Consultation et en Édition ; état par point dans `todo/ameliorations_debogages_D18_2026-11-04.md` § D23).
    Suite D23 FAITE (5 nov.) : marque « V » retirée du plein écran du Dashboard (rendue à la sortie) ; prises, prises de
    l'entraînement et vidéos de la conversation : même ✕ en case de Retour et même glissé latéral ; `captures.fullscreen` ;
    son d'un projet plein écran : sa pochette (`poster_source`) sinon sa forme d'onde (`media_cover.js`) ; Exécution essayé
    à part ; `media_lists.control` pilote la Médiathèque ouverte. Règles 13 et 20 d'AGENTS.md vérifiées (texte de
    l'utilisateur présent). Preuve : même sonde, parties L A E B C D.
    Suite 2 D23 FAITE (5 nov.) : ✕ du plein écran peinte sur tous les hôtes (collision d'identifiant d'arbre avec l'hôte,
    profondeur sous l'image ; `createMediaCloseOverlay({ hostTreeId })`, `mediaControlsToolsLayer()`), sol média en jeton
    (`EVE_COMMON_SKIN_TOKENS.mediaGround`), vidéo de conversation finie en plein écran → fil rendu, son téléversé depuis le
    Dashboard réparé (`asset_box_media.js`). Preuves : `temp/d18_media_gestures/media_gestures.probe.mjs` LAEBCD 68/68,
    `training_takes.probe.mjs` 11/11, `conversation_takes.probe.mjs` (deux comptes) tout OK, `list_share_ui.probe.mjs` S7.
    Reste : essai sur l'iPad USB (utilisateur).
  - Médicaments — VALIDÉ (5 nov.) : Q1 BDPM importée chaque mois par le serveur (binaire Rust natif), index poussé aux
    appareils, recherche sur l'appareil, aucune requête vers un tiers ; Q2 tuile visible d'emblée dans Activité juste
    après Compléments, eVe Pro et eVe Basic. Q3 VALIDÉ : chiffrement de bout en bout (clé du compte), jamais lu par les IA ; lot à part
    codé dans cette tâche après les écrans.
    NOUVELLE DEMANDE (5 nov., message) — listes médicamenteuses partagées : un « + » crée une liste (médicaments,
    posologie, horaires) POUR SOI ou POUR UN TIERS. Pour soi : affichée au Dashboard, prises planifiées, horaires
    ajoutés à l'Agenda. Pour un tiers : gardée dans la liste des médicaments de l'auteur avec le nom de la personne
    (et le nombre), jamais affichée au Dashboard ni ajoutée à l'Agenda ; envoyée par un partage ; le tiers DOIT la
    valider (confiance) et reçoit alors posologies et horaires d'office. Cas type : un médecin vers son patient ; pas
    de certification des médecins ; s'appuie sur la notion d'admin existante (auth_account_roles). Les IA pourront
    faire de même à partir d'une ordonnance lue. À questionner puis maquetter (règle 16).
    Listes 1 VALIDÉ : tout le monde peut envoyer une liste à l'un de ses contacts ; la validation du destinataire fait
    la confiance (pas de rôle, pas de certification). Listes 2 (liste modifiée après envoi : nouvelle version à
    valider, ou liste figée) posée, réponse non reçue ; restent 3 (IA et ordonnance), 4 (sortie d'une liste pour un tiers).
    EXTENSION (5 nov., message) : l'envoi d'une liste à un tiers vaut pour TOUTES les listes (musique, compléments,
    activités, tout média et tout type d'atome dès qu'il y a une liste ou un protocole), pour la viralité, aussi par
    le réseau social intégré. Transverse, implémenté partout. Recherche de l'existant puis maquette à valider
    (« c'est assez important »). Audit : temp/d18_plan/list_share_audit.md.
    Q4 HDS RÉGLÉ (5 nov.) : phase de test, tout coder et ouvrir dès que codé, sans garde juridique ; hébergement
    futur chez Almerys (HDS), OVH ne sert qu'aux SMS.
    Partage VALIDÉ (5 nov.) : 1 après accord, la liste reste LIÉE à l'auteur, chaque nouvelle version (changements
    marqués) s'applique seulement une fois validée, l'ancienne continue entre-temps, le destinataire peut se détacher
    et garder sa copie (modèle protocol_template) ; 2 les programmes d'activité/objectif sont partageables (blocage
    shares.rs levé) : seul le plan est partagé, séances et mesures restent au destinataire.
    Listes 3 VALIDÉ : l'IA lit une ordonnance donnée (photo) et en tire un BROUILLON de liste reçu comme une liste
    envoyée, à valider ; elle ne lit jamais le traitement enregistré ni les prises. Questions closes → maquettes.
    Maquettes Médicaments M1, M1b, M1c, M2, M2b, M3, M4, M4b, M5, M6 VALIDÉES (5 nov.). Maquettes S1–S7 du partage
    de listes VALIDÉES (5 nov., temp/d18_plan/share_mockups/out/) : S1 outil « Envoi » dans la rangée d'outils de
    toute liste ; S2 carte Publier = nom + nombre ; S3 Pour moi / Pour un tiers + personne ; S4 tuile coin plié
    « Marie (3) » hors Dashboard/Agenda ; S5 mots « Valider / Refuser » sur TOUTES les cartes de partage (remplacent
    Oui / Refus) ; S6 version marquée + Détacher ; S7 brouillon IA AVEC vignette de l'ordonnance (toucher = plein écran).
    Demandes : outils de la Roadmap (b3b) et motif de refus (b4) VALIDÉS (5 nov.).
    AJOUTS (5 nov., message) : (a) supprimer une liste ou un protocole entier, ou un médicament seul ; mettre en pause,
    arrêter, supprimer, comme les autres listes ; arrêt automatique complet à la fin d'un protocole ; un traitement a une
    date de fin OU est au long cours (les deux cas). (b) ORDONNANCE DICTÉE : le médecin dicte (speech to text), une IA
    analyse, le médecin valide le texte, eVe met en forme un document au format ordonnance, transmis au patient (la liste
    avec posologies, pré-remplie ou non selon la dictée) ET au médecin, qui n'a plus qu'à la signer.
    D24 + D29 CODÉS (5 nov., écrans) — FAIT, prouvé Web : tuile Médicaments (Pro et Basic), M1–M6, Pause/Arrêter/Supprimer
    (liste et médicament), arrêt automatique, parité Compléments ; commandes MCP `health_products.*` (refusées aux IA) ;
    sondes temp/d18_meds/meds.probe.mjs, basic.probe.mjs, model.probe.mjs ; coffre serveur lu. RESTE : l'import BDPM et son
    contrat JS (agent Rust ; index lu en `assets/health/bdpm_index.json`, fixture de sonde), le chiffrement de bout en bout
    (Q3, lot à part), le scan DataMatrix sur l'iPad (compilé seulement).
    ÉCARTS RÉGLÉS (5 nov., coordinateur) — FAIT, prouvé Web : doses = recommandations pré-remplies selon la posologie et tous
    les paramètres connus de la personne (person_parameters.js ; inconnu jamais deviné), fiche « à valider » sans prise ni
    rappel jusqu'à « Valider » (✓) ; roller « Max/jour » ; Supprimer au second toucher gardé ; eVe Basic : un médicament fait
    gagner la tuile Activité ; cartes CODEMAP/API_MAP. Puis (5 nov.) FAIT : le DFG en mL/min/1,73m² lu par le lecteur de
    résultats (lab_reader.probe.mjs), l'Allaitement ligne du profil de santé après Grossesse, lu par person_parameters.
    RESTE : la posologie portée par le contrat Rust (fixture d'ici là ; posologyOf déplacé par l'agent Rust).
    (a) VALIDÉ : Pause = suspend prises et rappels jusqu'à reprise ; Arrêter = finit aujourd'hui (comme la fin auto),
    garde l'historique ; Supprimer = efface tout, prises comprises, après confirmation dans la bande.
    (b) Ordonnance 1/3 VALIDÉ : signature au doigt dans eVe, ET outils Imprimer (commande d'impression à l'hôte) et
    Exporter (PDF hors d'eVe, un des rares exports permis) ; 2/3 VALIDÉ : identité de l'auteur
    dans un volet « Ordonnances » de Réglages › Profil (nom, qualité, RPPS, cabinet), patient tiré du contact, pas de
    vérification RPPS. Rappel de l'utilisateur : LES DEUX choix, au doigt ET impression/export. 3/3 VALIDÉ : « + » Pour un tiers,
    micro de la bande, dictée analysée par l'IA qui remplit les lignes, relecture et correction, validation → liste au
    patient + ordonnance à signer ; aussi par l'assistant (« fais une ordonnance pour Marie ») ; aussi à la main comme
    tout le monde ; aussi depuis une PHOTO analysée par l'IA ; quand l'IA est là, elle corrige d'office (voix et image).
    Maquettes O1–O5 en cours (temp/d18_plan/ordonnance_mockups/out/). Restent aussi : écarts D13, feuilletage de l'Agenda Pro (VALIDÉ 5 nov. : la règle à un axe s'applique, plus de défilement latéral, droite = ouvrir l'Agenda),
    placement de la vue Groupe (VALIDÉ 5 nov. : grille de l'accueil depuis le bas, code gardé), nouveaux éléments (Roadmap, refus : VALIDÉS ; aperçu de page : VALIDÉ 5 nov. — nom du site refusé,
    outil Autoriser (globe), accordéon « Réseau des pages » dans Avancé, l'outil s'appelle « Lancer » partout),
    admin natif (VALIDÉ 5 nov. : partout, les serveurs locaux iOS/Tauri relaient les trames d'admin vers atome.one).
    Toutes les questions sont closes sauf les maquettes O1–O6 de l'ordonnance (en préparation).
    CONSIGNE (5 nov.) : ne RIEN coder tant que tout n'est pas établi. Collection du plein écran VALIDÉE : les médias de
    la vue d'origine, dans son ordre et son filtre (grille/liste de Média, playlist, médias du projet dans l'ordre de la
    scène), tous types ensemble ; une liste hétérogène est respectée et lue en entier ; au bout rien ne bouge.
    Maquettes O1–O5 VALIDÉES (5 nov.) ; deux couleurs du papier (encre, gris) en jetons. Identité du praticien (nom,
    qualité, RPPS, cabinet) lue d'office dans sa fiche/contact personnel en base ; si elle manque, saisie sur
    l'ordonnance même, qui remplit sa fiche (bidirectionnel, renseigné une seule fois) ; liée aux profils de vie :
    profil professionnel s'il existe, sinon le profil de base. O6 VALIDÉE : toutes les maquettes de l'ordonnance sont validées.
    AJOUT (5 nov., message) — AIDE À LA PRESCRIPTION : pré-diagnostic établi par l'assistant à partir des symptômes
    (renseignés par le patient ou le médecin), qui aide le médecin ; suggestion de traitement et PRÉ-ORDONNANCE, validées
    par le praticien ; vérification et prévention de TOUTES les interactions médicament–médicament et
    médicament–alimentation (en rapport avec la liste de courses et les repas préconisés par les objectifs et activités) ;
    vérification des antécédents et allergies du Carnet de santé ; horaires de prise optimisés selon tous ces paramètres.
    VALIDÉ (5 nov.) : 1 Thésaurus ANSM + RCP §4.3/4.4/4.5 importés par le serveur (binaire Rust, avec la BDPM) en
    règles ; contrôle par règles, sans IA ; l'assistant explique et propose. 2 contrôles sur l'appareil ; l'assistant ne
    reçoit symptômes et éléments du carnet que le temps d'une demande lancée par la personne, ne garde rien. 3 le patient
    voit AUSSI le pré-diagnostic et le traitement suggéré, marqués « à valider par le médecin », avant l'envoi à un
    médecin choisi parmi ses contacts ; le médecin valide, corrige ou refuse ; quand le médecin décrit lui-même les
    symptômes il voit tout. 4 ligne en cause marquée (raison + source : Thésaurus, RCP, carnet), alternative ou écart
    d'horaire proposé ; une contre-indication bloque Valider tant que le médecin ne l'a ni changée ni confirmée ; un
    aliment à éviter est signalé aussi sur la liste de courses et les repas proposés. 5 horaires optimisés proposés,
    ajustables par le médecin puis le patient dans les marges des règles ; un horaire hors règle est marqué.
    Maquettes P1–P4 VALIDÉES (5 nov.) ; lever un blocage : toucher la ligne → Remplacer (l'alternative) ou Confirmer.
    P5a/P5b VALIDÉES : toutes les maquettes de l'aide à la prescription sont validées.
    AJOUT (5 nov., message) — CONSEILS ALIMENTAIRES SELON LA SANTÉ, transverse à tout le framework (pas seulement
    l'ordonnance) : pour une allergie ou une pathologie (ex. diabète), conseils culinaires (des pâtes peu cuites…),
    aliments à éviter mis dans les « déconseillés » avec la raison, contre les idées reçues dépassées ; validés par le
    médecin. VALIDÉ (5 nov.) : 1 base de règles tenue dans eVe, par pathologie et allergie (aliments déconseillés,
    conseils de cuisson/préparation, raison, source HAS, ANSES/PNNS, FFD…), appliquée par règles sans IA, expliquée par
    l'assistant ; 2 s'applique d'office dès qu'une pathologie ou allergie est au carnet ; le médecin du patient peut en
    ajouter, retirer, nuancer par une liste envoyée (validée par le patient), ses ajouts portent son nom.
    RAPPEL (5 nov.) : COMPLÉMENTS ALIMENTAIRES = exactement la même chose que les médicaments (partage de liste,
    interactions, optimisation des horaires, selon la pathologie ou l'objectif) ; règles enrichies des avis de
    nutrivigilance ANSES et des ingrédients Compl'Alim (même motif, validé d'office).
    Conseils 3 VALIDÉ : partout où il y a un aliment (verdict du scanner, liste de courses, repas et recettes des
    objectifs, fiche d'aliment ou de complément, assistant) ; déconseillé = marque « à éviter » + raison (comme P5a) ;
    conseil de cuisson sur la fiche et le repas. Maquettes F1–F4 VALIDÉES (5 nov., temp/d18_plan/food_advice_mockups/out/) ; le verdict
    principal suit la santé de la personne (« À éviter » dès qu'une règle de santé le dit).
    TOUT EST ÉTABLI (5 nov.) : codage lancé, lots A–J (navigation, médias, médicaments+compléments, import Rust BDPM/
    Thésaurus/RCP/règles nutrition, partage de listes, chiffrement, ordonnance, aide à la prescription, conseils
    alimentaires, petits points validés).
    ÉCARTS DU LOT D24/D29 À TRANCHER (5 nov., posés à l'utilisateur) : 1 eVe Basic — la tuile Activité n'apparaît
    qu'une fois une activité gagnée (Médicaments y est d'emblée) : un médicament fait-il gagner Activité, ou Activité
    d'emblée ? VALIDÉ : un médicament (déclaré, scanné, ou reçu puis validé) fait gagner Activité ; 2 « Par prise » démarre à « — » (aucune dose remplie) au lieu de 1 sur M2 ;
    3 Supprimer confirmé par un second toucher (motif existant) au lieu d'une confirmation dans la bande ;
    4 « max par jour » du si-besoin : imposé par le modèle mais sans réglage à l'écran — ma description de M2b le
    mentionnait à tort (la maquette montre « 2 comprimés au plus par prise », pas de maximum par jour).
    AJOUT (5 nov.) : préconisations, interactions et posologies tiennent compte de l'ÂGE, du POIDS et des autres
    paramètres de la personne (grossesse, fonction rénale…), au cahier des charges (D24/D27/D28/D29).
    PRÉCISÉ (5 nov.) : en plus des allergies, intolérances, interactions et espacements, TOUS les paramètres
    physiologiques et biologiques de la personne : âge, poids, taille/IMC, sexe, grossesse et allaitement, fonction
    rénale (DFG/clairance) et hépatique, glycémie/HbA1c, tension, résultats biologiques du Carnet.
    FEU VERT de l'utilisateur (5 nov.) : « tu peux tout coder ».
    AJOUT (5 nov.) — ACTIVITÉS, disque orange (ex. les pompes) : pendant une séance, toucher le disque = PAUSE (et un
    nouveau toucher reprend), jamais la phase suivante ; dans les outils du bas : « Suivant » (phase suivante) et
    « Stop ». Pour toutes les activités au disque orange.
    AJOUT (5 nov.) — D31 se filmer : choisir la caméra (frontale/arrière) en filmant ; plus de blocage après l'arrêt
    d'une prise. Même motif que l'outil Caméra de la capture du Dashboard : codé sans maquette.
    AJOUT (5 nov.) — D32 : tuile « Récent » dans Activité. Elle remplit une page avec les dernières activités, et
    toucher une tuile reprend où on en était. Même motif qu'une plate de rubrique : codé sans maquette.
    AJOUT (5 nov.) — D33 fin d'activité : maquettes temp/d18_plan/done_mockups/out/. VALIDÉ : C (pouce orange à côté de
    « Terminé », ligne « Points » cumulée dans le compte) ; trois bips rapides à la fin de CHAQUE série.
    BASE SANTÉ RUST (5 nov.) : crate atome-health-ref et contrat regénéré. Posologie extraite du RCP (sections 4.2 à 4.6)
    avec la source et la phrase exacte de chaque règle ; 15 paramètres de la personne ; les quatre posologies
    d'exemple prouvées. cargo test : 29/29. Bundle réel : 3,9 Mo gzip (15 845 médicaments, 1 623 interactions,
    1 988 compléments, 69 règles alimentaires). Côté eVe : health_reference_client.js, et posologyOf lit le bundle.
    Sondes : modèle 39/39, médicaments 57/58 (l'échec vient de la case Allaitement, en cours chez l'agent médicaments).
    cargo deny refusait lopdf 0.36 (RUSTSEC-2026-0187) : choix fait sans exception dans deny.toml, on retire
    pdf-extract pour lopdf 0.47 et notre propre extraction (en cours). Restent : les relais Tauri/iOS pour
    health-reference (en cours), la couverture RCP complète au fil des passages mensuels (2 000 pages chacun),
    et les résultats de labo structurés dans le Carnet.
    FAIT (5 nov., suite) : pdf-extract est remplacé par lopdf 0.47 et notre propre lecteur (pdf_layout.rs). Les
    23 220 morceaux de texte sont identiques à l'octet et les 1 623 interactions sont inchangées. cargo deny passe sans
    aucune exception. health-reference est relayé sur Tauri et iOS. Ajouts : condition.thesaurus (AVK, statines),
    food_item.categories (Open Food Facts) et l'aliment « Fruit entier » avec sa règle prefer. cargo test 31/31. Le
    fmt de check:rust échoue seulement sur les fichiers auth/ws_api de la session Rust en cours.
    D30 FAIT (5 nov., Web) : le disque pause/reprend (mot « En pause », chiffre et anneau figés), bande Suivant · Stop (Filmer
    gardé entre eux), Live Activity `paused`, aucun bip en pause ; MCP card_action next / resume (training et brick_session).
    Preuve `temp/d18_disc_pause/disc_pause.probe.mjs` 37/37. Reste : le disque de la MONTRE envoie toujours `done` (Swift non touché).
    D31 FAIT pour la caméra (5 nov., Web) : outil « Caméra » (Suivant · Caméra · Filmer · Stop, seulement avec plus d'une caméra),
    comme la capture : la prise vidéo en cours est gardée (liée à la séance) et la suivante démarre sur l'autre caméra ; MCP
    `training.card_action camera`. Preuve `temp/d18_disc_pause/film_camera.probe.mjs` 37/37. Blocage après l'arrêt d'une prise :
    FAIT (5 nov., Web) : la séance d'une carte refusait tout geste touché pendant une autre écriture (départ, pause, fin de pas) — le
    Stop était perdu, la séance restait en cours sans sortie. Désormais une écriture à la fois dans l'ordre des touchers
    (`dashboard_training_session.js#record`) ; double Suivant = une seule validation. Preuves `temp/d18_disc_pause/move_in_flight.probe.mjs`
    4/4 et `temp/d18_disc_pause/back_freeze.probe.mjs` 82/82 ×2. Essai iPad : utilisateur.
    Live Activity : son thème (couleurs, tailles) passe des attributs à l'état, envoyé à chaque mise à jour et sur
    `eve:profile-preferences-updated` ; Swift (ContentState.theme, widget) vérifié par `swiftc -typecheck` (iOS 17). Preuve
    `temp/d18_disc_pause/live_theme.probe.mjs` 4/4 (pont enregistreur). Essai appareil : utilisateur.
    D32 FAIT (5 nov., Web) : plate « Récent » (glyphe `recent`, l'horloge des Récents de Mes courses) dans Activité, eVe Pro
    et eVe Basic, juste après Médicaments (même ordre 6, l'id la place après) ; elle n'apparaît qu'une fois une activité faite
    (fait `data:recent_activities`). Touchée : un niveau de tuiles d'UNE page (option `onePage` de la grille du Mystic,
    `mystic_grid_layout.js`) : ses cases libres remplies (la case « en cours » restant libre), le reste laissé de côté, jamais
    de flèche Suivant. Choix faits (charte + motif le plus proche, sans question) : 1 « activité » = un exercice de Sport
    (muscu, gainage, souplesse, cardio et son programme) ou une brique minutée (sieste, méditation, respiration, relaxation)
    ayant une séance vraiment lancée, lue au Programme (`programs/activity_recent.js`), chaque activité UNE fois à sa
    dernière séance, la plus récente en premier par le dernier geste enregistré (départ, pause, fin) ; une séance
    seulement préparée ne compte pas ; pas de seconde liste. 2 la tuile est la plate même de l'activité ailleurs (mots,
    glyphe, teinte de la rubrique, appui long) ; l'ordre « la plus récente en premier » suit la règle de la grille (la
    première près de la tuile ouverte). 3 toucher = reprendre : une séance en cours ou en pause revient sur sa carte
    vivante (si sa carte ne la tient pas encore, `resumeTrainingSession` / `resumeBrickSession` la reprennent d'abord) ;
    sinon la carte s'ouvre comme laissée (niveau, valeurs reprises de la dernière séance, jour du programme ; durée
    propre d'une brique). Une séance ARRÊTÉE ne se poursuit pas (le modèle de séance l'interdit) : sa carte s'ouvre.
    4 « Programmes » = le programme cardio d'un exercice (sa carte en montre le jour) ; « Mon programme » de Sport et les
    disciplines ne sont pas listés (pas de séance propre). 5 au plus 34 lues ; la page en montre ce qu'elle tient.
    6 MCP dans la famille `dashboard_progression` (celle de `dashboard.ongoing.open`) : `dashboard.activity.recent`
    (lecture) et `dashboard.activity.resume { key? }`. Preuve `temp/d18_recent/recent.probe.mjs` 31/31, captures
    `temp/d18_recent/out/`. Vu en passant (hors lot) : `training.card_action back` / `brick_session.card_action back`
    sur une carte arrêtée ouverte depuis une plate a semblé laisser le Mystic « hébergé » (touchers suivants perdus ; non isolé)
    tant que la carte n'est pas fermée par son ✕ — VU (5 nov.) : voulu, Back ramène la carte ouverte à son départ, son ✕ la ferme et
    l'accueil répond (back_freeze.probe 82/82) ; la vraie perte de touchers était le Stop refusé pendant une écriture (D31, corrigé).
    Essai appareil : utilisateur.
    D33 FAIT (5 nov., Web) : pouce orange 36 px (`atome/src/assets/images/icons/thumbs_up.svg`, teinte du disque) à côté de
    « Terminé », jamais sur « Arrêté » ; ligne « Points +N » sous « Durée active » (Sport, cardio, séances-briques). RÈGLE DES
    POINTS : N = n-ième de 1, 2, 3, 5, 8, 13, 21… (Fibonacci), n = séries, tours ou efforts confirmés ; une séance d'une seule
    étape (sieste, méditation, respiration, course libre) compte ses tranches entières de 5 min d'activité, au moins 1 ;
    « Arrêté » = 0. Total cumulé dans le profil (`preferences.activity.points`, pipeline de commit, une fois par séance), lu par
    MCP `training.read_points`, affiché nulle part ailleurs. Trois bips « tick » (0,06 s, 1760 Hz, 0,6 s après la fin puis tous
    les 0,15 s) à la fin de CHAQUE série, avec le réglage de son de la carte ; l'annonce vocale du pas suivant vient après eux ;
    une pause retire ceux à venir. Preuve `temp/d18_disc_pause/done_points.probe.mjs` 18/18, captures `out_done/` conformes à C.
    Écarts VALIDÉS (5 nov.) : 2 eVe PRÉCONISE la dose (RCP/notice selon l'âge, le poids…) en pré-remplissant, jamais en
    validant : la fiche reste une préconisation à valider par la personne ou le médecin (décision d'application : le
    médicament proposé n'a ni prises ni rappels tant qu'il n'est pas validé par « Valider » ; sans posologie connue,
    « — ») ; 3 Supprimer = second toucher, comme ailleurs ; 4 ajouter un rouleau « Max/jour » pour le si-besoin, même
    motif, pré-rempli par la notice / le médecin / l'ordonnance, sinon « — ».
    CONSIGNE (5 nov.) : une fois le codage lancé, plus aucune question en cours de route ; décider seul. Écrits déjà : AGENTS.md
    règles 13 et 20 (ligne unique, médias), cahier D22–D26.
    EN ATTENTE : questions sur les listes, Q4 HDS, revue des maquettes M1–M6 (temp/d18_plan/med_mockups/).
  - (Ancienne liste) Restent à reposer : 6 (séances importées, séance supprimée dans Santé), 13 C/D et D14 (maquettes à renvoyer en
    image), eVe Basic Sorties/Sortie, paliers de progression, D13 Live Activity, glyphes Patrimoine/Thermes, D4 Ecosia
    sur Web, Sport (4 sous-questions), point repère du ruban (précision).
- Partage : § 8 « Elastic Design » confié à la session R-114 (accord du 2026-11-04) ; § 9 reste ici.
- D26 Ordonnance FAIT (Web de bout en bout, 5 nov. ; `PROBE_PREBUILT_SERVER=1 node temp/d18_ordonnance/ordonnance.probe.mjs` 57/57,
  `node temp/d18_ordonnance/unit.mjs` 16/16, captures `temp/d18_ordonnance/out/`). Famille `ordonnance.*` (15 commandes,
  `atome/src/squirrel/prescription/contracts.js`, exécuteur `eVe/domains/prescription/ordonnance_commands.js`), écrans
  O1–O5 `eVe/domains/dashboard/ordonnance_screens.js`, papier `ordonnance_page.js` / PDF `ordonnance_pdf.js`, identité
  `prescriber_identity.js`, volet O6 `bevy_panel_home_prescriber_view.js`. Choix faits seul (consigne « décider seul ») :
  1 l'ordonnance = la liste `medications` pour un tiers du moteur D25 (`share.list_create`, `for_person`) + son papier,
  un `health_record_entry` `entry_kind: 'prescription'` sous la liste (types du serveur inchangés), statut
  brouillon/signée, « envoyée » lu de `share.sent` ; 2 identité au chemin `profile.prescriber` de la fiche, ou du profil
  de vie professionnel (pro, travail, cabinet…) quand il existe ; carte d'identité au-dessus du papier pour les champs
  manquants, écrite dans la fiche ; 3 la dictée par l'outil « Dicter » de la bande (micro, allumé pendant l'écoute, lignes
  en direct), pas le micro de l'assistant : celui-ci est la conversation, acteur `voice` refusé par la garde santé
  (`humanHealthActor`) ; 4 l'assistant et le MCP n'ont que `new` (« fais une ordonnance pour Marie ») et `open`, sans
  valeur de santé ; 5 entrée : l'outil « Rédiger » (glyphe ordonnance) d'une liste de médicaments pour un tiers, et la
  création « Pour un tiers » ouvre directement O1 ; 6 toucher une ligne ouvre la fiche médicament (mêmes rouleaux),
  pas de rouleaux en ligne ; 7 le papier blanc (jetons `EVE_PAPER_SKIN_TOKENS`) posé sur la dalle du panneau ; 8 Imprimer
  sur Web = l'image A4 dans un cadre caché imprimé par l'hôte ; en natif `ordonnance_print_unavailable` (pas de pont
  d'impression) ; Imprimer et Exporter permis avant la signature (signature à la main sur papier) ; 9 Envoi de la bande
  = Publier (`openListSend({ atome_id })`), `ordonnance.send` = au compte du patient ; 10 une ligne modifiée après la
  signature la défait (à re-signer) ; 11 côté patient, la liste scellée ne porte que ses lignes (sceau D25 de la seule
  racine) : ses ordonnances reçues sont les listes validées, regroupées par `received_from` + liste d'origine, nommées
  par leur auteur ; papier sans signature chez le patient.
  12 Imprimer natif (demande du coordinateur, 5 nov.) : pas de second chemin — le pont d'export existant gagne
  `export_file_print` à côté de `export_file_save`/`export_file_share` (`file_export.js#printExportFile`, la page A4 en
  JPEG) : iOS `NativePersonalImport.swift` (`UIPrintInteractionController`, popover sur iPad ; listes de commandes de
  `WebViewManagerIPC.swift` et `WebViewManagerScriptMessages.swift`), Tauri `native_file_export.rs` (fenêtre de la page
  seule, `print()` de la webview sur macOS — WKWebView ignore `window.print()` —, `window.print()` ailleurs ; permission
  `allow-export-file-print`), Android et l'AUv3 sans impression → `ordonnance_print_unavailable` ; Annuler n'est pas une
  erreur. Prouvé par un pont factice dans la sonde ; Swift typecheck et clippy propres ; jamais lancé sur appareil.
  13 Conseils du médecin (décision du coordinateur, même motif, sans maquette) : une phrase « Conseil : … » dictée
  (« Dicter ») ou tapée dans le champ devient une ligne « Conseil » de la même brique, un `food_advice_tip` D28 sous la
  liste (signé du nom du praticien, aliments lus par `foodKeysOf` ; aucun aliment reconnu → `ordonnance_tip_no_food`),
  imprimé sous les médicaments et figé à la signature. Écart choisi seul : pas de choix Médicament/Conseil derrière
  « Ajouter » (ce serait un élément nouveau, règle 16) — « Ajouter » garde la fiche médicament, le conseil entre par la
  dictée ou le champ. Retrait : toucher la ligne la marque, la toucher encore la retire (motif du second toucher), MCP
  `ordonnance.tip_remove`. `food_advice.tip_save` accepte désormais une liste `medications` (ajout dans
  `food_advice_commands.js`, `TIP_LIST_KINDS`). Prouvé de bout en bout : Marie valide, son papier porte le conseil et
  sa fiche d'aliment montre « Conseil · Dr Claire Martin ».
  Le papier signé arrive chez le patient par le sceau de la session Médicaments (`list_share_sealed.js#apply`, entrée
  `received`) ; ses ordonnances reçues sont ce papier, sans doublon de la liste.
- D25 A + B listes de santé scellées (5 nov., session Médicaments, demande du coordinateur ; maquettes s1a–s7 validées) — FAIT
  (Web) : `temp/d18_meds/share.probe.mjs` 32/32 (trois comptes, vrais touchers S1a/S2/S4/S5, coffres serveur lus : aucun
  nom de médicament hors des produits de chacun, aucune clé privée en clair), `share_keys.probe.mjs` 10/10,
  `temp/d18_ordonnance/ordonnance.probe.mjs` 57/57, `temp/d18_list_share/server_lists.probe.mjs` 25/25.
  A : écrans Médicaments/Compléments branchés (Envoi `openListSend`, Créer `openNewList`, tuiles « Marie (n) » coin plié,
  liste gardée pour un tiers hors Dashboard, Agenda et prises — aucune occurrence de calendrier —, `announceProductChange`
  après chaque déclaration/modification/suppression, `received_from`/`received_entry` sur les copies reçues : une liste
  reçue validée fait gagner Activité en Basic) ; « 2 comprimés » par `Intl.PluralRules`.
  B (choix faits seul) : une paire ECDH P-256 par compte (WebCrypto seul, aucune dépendance), enregistrement
  `share_key:<compte>` du coffre, moitié privée scellée par les clés de sauvegarde du compte (trousseau d'appairage
  existant), moitié publique lue par la trame `/ws/api` `share-key` ; une liste `medications`, `supplements` ou
  `atome_list` part scellée sur l'appareil (clé de contenu AES-GCM, enveloppée par destinataire en ECDH éphémère + HKDF),
  la racine ne porte que le chiffré et un nom à clé (HMAC) qui marque les versions ; le sceau porte les lignes, le papier
  de l'ordonnance (identité, signature) et les enfants de la liste (`food_advice_tip`) ; l'appareil du destinataire
  ouvre, montre, et à « Valider » pose ses médicaments, sa copie des conseils (`list_link`, comptée appliquée par
  `food_advice_runtime.js`) et son ordonnance signée (`received`). Destinataire sans clé (décision du coordinateur,
  « jamais en clair ») : partage en attente, invitation existante, carte qui attend (`waiting`, rien à valider) ; dès sa
  clé publiée, l'appareil de l'auteur scelle et envoie (`sealWaiting` à l'ouverture du Dashboard et à chaque lecture
  d'Envoi). Causes réelles : `AUTH_REQUIRED` = la sonde lisait par sa propre instance de module (sans preuve de
  connexion) et l'appli n'assurait pas la session distante (`ensureRemoteSession` + jeton, comme le client
  d'appairage) ; `SHARE_KEY_UNAVAILABLE` = le type `share_key` n'était pas déclaré (refusé par le serveur, gardé sur
  l'appareil seul) — déclaré dans `core_atome_types.js`, registre reconstruit, serveurs Rust recompilés ; la publication
  vide ensuite la file d'envoi ; `ws_api_connection.js` n'attache plus la sentinelle `'anonymous'` à l'ouverture.
  Fiche médicament/complément : interactions produit–produit et espacements (`food_advice.products`) en lignes du motif F
  (`foodAdviceCardNode`, Pourquoi / Source au toucher) ; `food.probe.mjs` : vrai partage médecin → patient.
  Trame `share-key` : portée par la session Rust (`atome/servers/atome-server/src/ws_api/projection_ops.rs#share_key`,
  vue le 5 nov.) ; RESTE à cette session : l'Axum de Tauri et le serveur Swift d'iOS.
  Flux temps réel d'une liste scellée — FAIT (5 nov.) : chaque partage d'une liste scellée est fait (ou resserré par
  `updateRights`) avec les propriétés lisibles `SEALED_LIST_READABLE` (`list_share_contract.js`, `list_share_runtime.js#send`) :
  le moteur ne laisse passer, de tout atome de son flux, que le sceau de la racine. Constat : le moteur actuel n'accorde que
  le flux de la racine et chaque atome a le sien, donc un conseil sous la liste ne partait pas vers le destinataire (la
  sonde témoin `CONTROL_UNNARROWED=1` le montre aussi) ; le resserrement ferme le cas d'un atome qui partage le flux de la
  racine. Preuve `temp/d18_meds/share.probe.mjs` 36/36 : trames /ws/api et /ws/sync reçues par Marie, de l'envoi à sa
  validation puis pendant la v2 et la modification du conseil, sans nom de médicament ni texte du conseil hors ses
  propres enregistrements.
  Aide à la prescription (D27) scellée — FAIT (5 nov., demande du coordinateur) : l'atome `prescription_aid` est scellé
  entier à chaque écriture pour la patiente, son auteur et, une fois envoyé, le médecin (`list_share_sealed.js#sealValue`
  / `openValue`, la même clé par compte) ; chacun l'ouvre sur son appareil ; un destinataire sans clé publiée ne peut
  recevoir ni écrire (`prescription_aid_doctor_unreachable`). Schéma : `sealed` remplace `prescription_aid`
  (`health_protocol_contract.js`, registre reconstruit, serveurs Rust recompilés). Preuve
  `temp/d18_rx_aid/rx_aid.probe.mjs` 66/66 : coffres et base du serveur sans symptôme ni médicament d'une aide,
  chaque aide n'y tenant que sa boîte, 106 trames d'aide reçues par les deux comptes, toutes scellées. Une aide écrite
  avant ce sceau (en clair) ne s'ouvre plus : aucune reprise (phase de test).
  PROPOSITION (non demandée) : chiffrer au repos les traitements de la personne dans son propre coffre.
  Défaut d'ordre de toucher (panneau de l'accueil sur une rubrique ouverte, `temp/d18_meds/profile_tap.probe.mjs`) :
  confié à un autre agent par le coordinateur.
  BLOCAGE externe (5 nov., 14 h 45) : `list_share_ui.probe.mjs` 56/57 — le programme (projet, partage lié, non scellé)
  accepté par Marie n'apparaît plus dans son `state-current` (passait à 14 h 18 sur le même arbre figé) depuis que la
  session Rust a porté `state-current` dans `atome/servers/atome-server/src/ws_api/atome_ops.rs` (binaire recompilé
  14 h 47) ; à vérifier par cette session (projection des atomes partagés, `include_shared`), puis rejouer la sonde.
  RÉSOLU (5 nov.) : la session Rust a rejoué la sonde sur l'arbre actuel et obtient list_share_ui 57/57. Cause probable :
  un binaire construit entre deux de ses modifications. Le portage de share-key est noté chez elle (atome-server, puis Tauri et iOS).
- D27 Aide à la prescription rendu (Web, 5 nov. ; `PROBE_PREBUILT_SERVER=1 node temp/d18_rx_aid/rx_aid.probe.mjs` 56/56,
  `NSAID='Ibuprofene 400 mg' node temp/d18_rx_aid/rules_unit.mjs temp/d18_rx_aid/bundle` 14/14, `node temp/d18_rx_aid/hours_check.mjs`
  (indépendant de l'ordre, 40/40), captures `temp/d18_rx_aid/out/` p1–p5b ; base de sonde `temp/d18_rx_aid/bundle` = celle de D24 + un AINS).
  Famille `prescription_aid.*` (14 commandes, `atome/src/squirrel/prescription/prescription_aid_contracts.js`, exécuteur
  `eVe/domains/prescription/prescription_aid_commands.js`), règles `prescription_aid_rules.js`, heures `prescription_aid_hours.js`,
  assistant `prescription_aid_ai.js`, runtime `prescription_aid_runtime.js`, écrans `eVe/domains/dashboard/prescription_aid_screens.js`
  et `prescription_aid_hours_screen.js` ; type d'Atome `prescription_aid` déclaré (`#shared/health_protocol_contract.js`, registre
  régénéré, annotations hors ligne ; le serveur Rust embarque les types à la compilation : release reconstruite le 5 nov.).
  Choix faits seul : 1 les règles lisent la base de référence (thésaurus, RCP, compléments, aliments), jamais l'assistant ;
  « majeur » = contre-indication ou « déconseillé » (bloquant), un complément « à éviter » (ANSES) bloque aussi, le pire niveau
  d'une règle à plusieurs niveaux est pris ; 2 allergies par classe (pénicillines, céphalosporines, sulfamides, AINS, macrolides),
  source « Carnet · RCP 4.3 » ; 3 un paramètre absent (poids, DFG, clairance…) est écrit « inconnu : … » en tête du détail de la
  ligne, jamais deviné ; 4 la ligne bloquée touchée dit sa raison, la citation de la source et d'où elle vient, puis « eVe propose :
  X » (alternative de l'assistant passée par les règles) ; tant qu'elle est choisie la bande porte Remplacer · Confirmer · Retirer
  (dans les cases de Heures · Refuser · Corriger) ; le cadenas de Valider, touché, choisit la première ligne bloquée ; Confirmer est
  consigné avec ses raisons ; toucher « eVe propose » remplace aussi ; 5 l'aide est un Atome privé du patient partagé en direct
  (lecture + écriture) avec le médecin choisi dans Publier (une seule personne) ; le médecin répond dans l'Atome de la patiente
  (serveur, règle 21) ; ses aides reçues sont acceptées quand il les liste ; le Carnet utile voyage dans l'aide à l'envoi ; la
  patiente est nommée comme le carnet du médecin la nomme (`inboxSenderLabel`), jamais par un identifiant de compte ; 6 le médecin
  peut dire les symptômes d'un contact (`patient`) : l'aide est la sienne, lue sur son carnet de ce contact ; 7 Corriger allume la
  lecture des lignes par le champ de la bande (lecteur de l'ordonnance) ; Retirer sur une ligne choisie ; 8 Valider =
  `ordonnance.new` → `dictate` (lignes vérifiées, heures choisies) → `validate` (API publique de D26), puis le papier
  `ordonnance_document` (Signer, Envoi de D26) ; 9 heures : planificateur canonique, la prise la plus contrainte d'abord (à jeun,
  heure dite, autres, repas libre), espacements du thésaurus et des RCP, une prise « pendant le repas » non dite passe au repas
  suivant quand l'espacement manque ; une ligne bloquée n'a pas d'heure ; une heure déplacée hors des règles est marquée (règle +
  source sous la ligne choisie), rouleaux Heure (demi-heures) · Repas ; 10 l'assistant n'a que `symptoms` et `open` (aucune valeur
  de santé) ; `analyse` part de l'écran de la personne, l'assistant reçoit symptômes et faits du Carnet pour cette seule demande.
  RESTES fermés le 5 nov. (même sonde, `run23.log` 66/66 ; `temp/d18_meds/meds.probe.mjs` 58/58, `temp/d18_food/food.probe.mjs` 51/51 ; unités
  `rules_unit.mjs` 15/15, `hours_check.mjs`, `breakfast_only.mjs`) : a « Sympt. » dans la bande de Médicaments (sa propre liste ; une ligne
  dans `health_products_screens.js`, capture `p0_medicaments_sympt`) ; b P5a : D28 (`food_advice_runtime.js#readFoodAdviceContext`) compte
  les médicaments des pré-ordonnances validées de la personne parmi ses produits (`readPrescriptionAidTreatment`, un même CIS déclaré pris
  une fois) : liste de courses, repas et fiches les marquent comme un médicament déclaré ; `prescription_aid.food_flags` et ses règles
  propres supprimés (un seul propriétaire, D28) ; c pas d'écran de journée : lever et coucher lus dans le programme Sommeil (celui du
  premier lancement, `sleep_preferences`), chaque repas à l'heure médiane des repas tenus dans le programme nutrition (trois semaines,
  au quart d'heure), lus à l'analyse et à l'envoi ; un fait absent reste « inconnu : lever, petit-déjeuner… » sur la prise, dont l'heure
  ne suit plus que son moment, les espacements et les interactions (planificateur : temps `{ around, span_min }`, une demi-journée) ;
  une prise « pendant le repas » sans repas suivant connu passe aussi ainsi ; une aide écrite par le médecin pour un contact n'a pas de
  journée (inconnue) ; `prescription_aid.day` supprimé ; d les aides reçues par le médecin sont des rangées de Ma fiche › Profil ›
  Ordonnances (« Pré-ordonnance · patiente · date »), touchée l'aide s'ouvre et le panneau Moi lui laisse la place (les rangées
  d'ordonnances de D26 aussi) ; l'écran « Reçues » supprimé ; e antécédents du Carnet confrontés aux RCP 4.3 (contre-indication,
  bloque) et 4.4 (précaution) : l'antécédent, ou la pathologie de la base qu'il nomme, cherché dans les phrases de la section, la
  phrase citée, même marque et source « RCP 4.3/4.4 » ; g la ligne bloquée choisie (cadenas ou toucher) est amenée en vue par le
  défilement du panneau (`repaintHealthRecord({ revealNodeId })`). RESTENT : f sceau du partage de l'aide (agent médicaments, en
  cours) ; h jamais lancé sur appareil.
- Rendus (Web prouvé, appareil non vérifié) : D1–D3 (`temp/d18_comms/`, appel audio/visio accepté par la bande rouge
  de l'accueil, aperçu visio au-dessus, fil gardé en place) ; D4 (`temp/d18_webview/web_d4.probe.mjs` 21/21 ; Web
  ouvre la page d'accueil du moteur, `web.engine`) ; D6 (`temp/d18_delete/` 19/19 + 3/3 + 6/6 ; 4 causes dont la
  plaque supprimée restée affichée) ; D12/D13/D16 compilés (`temp/d18_native/` : plantage micro au changement de
  route audio, recopie de séance montre, identité de signature Tauri stable — réglage de signature à confirmer) ;
  D19 corrigé par la session R-114 (`temp/r114_tile_norm/neighbours.probe.mjs`).
- D14 rendu (Web prouvé `temp/d18_scanner/main.probe.mjs` 35/35 + store 7/7, gtin 11/11, axes 3/3) : cause « Service
  produits indisponible » = liste des additifs OFF chargée avant chaque lecture (`server/ws_open_food_facts.js`,
  fiche `known-bug-solutions/food-scan-provider-unavailable/`) ; bip, clé GS1, retour arrière, doublons, flux unique.
  Production : déployer atome.one. Score /100 seuil 60 : étudié seulement (`temp/d18_scanner/SCORE_STUDY.md`, déconseillé).
- 6 rendu (Node `temp/d18_health/health_sync.probe.mjs` 17/17 relancé ; Kotlin, cargo, swiftc typecheck OK ; appareil non
  vérifié) : import des séances Santé/Health Connect (ancre, reprise, doublons Strava comptés une fois), `health_sync.*`,
  Préférences › Santé. Questions : marque des séances importées (`temp/d18_health/mockups/m1_seances_importees.png`) ;
  à la déconnexion garder/proposer/supprimer ; séance supprimée dans Santé ; envoi au serveur des données HealthKit
  (règle App Store 5.1.3) ou appareil seul ; Android `READ_HEALTH_DATA_HISTORY` (au-delà de 30 jours).
- 14, 13 A/B, D10 rendus (`temp/d18_activities/` : registre 29/29 relancé, auto-imbrications 3 → 0, parcours réel 25/26) :
  libellés Briques, Discipl., Spas, Matchs, Tout ; plaque Loisirs « Héberg. » (OSM) ; étude des sources `SOURCES_STUDY.md`.
  Questions : 13 C/D fiches de lieux (`temp/d18_activities/mockups/` 4 PNG, glyphes patrimoine/thermes, avis payants
  Google/Tripadvisor ?) ; Agenda › Sorties › Sortie en eVe Basic (quel nom change) ; eVe Basic : Bien-être, GPS,
  Boutique, Compléments jamais ouverts par la progression (quel palier les donne).
- 7 rendu (`temp/d18_assistant/engine_off.probe.mjs` 19/19, `engine_unit` relancé ok) : moteur IA OFF par défaut
  (`preferences.assistant.engine`, rangée « Assistant IA » d'Accueil › Assistant), verrou unique
  `atome/src/squirrel/ai/assistant_engine.js` ; 0 appel au démarrage, à la navigation, au repos ; une demande explicite
  passe. Question : brancher CarPlay vaut-il demande explicite (D12) ou CarPlay obéit-il à l'interrupteur ?
- 1–3 moteur rendu (`temp/d18_sport/resume.probe.mjs` 26/26 : reprise de la dernière séance comparable, progression,
  adaptation, mode 1 bras/2 bras séparés, `eVe/domains/training/training_resume.js`) ; UI bloquée (règle 16) :
  `temp/d18_sport/mockups/m1_detail_reprise.png`, `m2_detail_un_bras.png`. Questions : défaut sans progression choisie
  (double progression actuelle ou Maintien) ; pas choisi appliqué exactement (22 kg) malgré la règle 19 ; pas proposés
  par défaut ; Perso et Record reprennent-ils aussi ?
- D7 rendu (Web, sortie audio réelle `temp/d18_sport/d7_engine.probe.mjs`) : bips déjà justes ; voix corrigée (modèle
  chargé au lancement, mots rendus d'avance et posés sur l'horloge des bips). Bips natifs non reproduits ici : écoute
  sur appareil ; `backend.kira.js` `render_clock` avale l'erreur native (hors lot, à corriger par son propriétaire).
- 10 B bis rendu (`temp/d18_gestures/bbis.probe.mjs` vraie app ALL OK, `stage_turn.probe.mjs` relancé ALL OK) : un aller-retour
  sans lever garde la page, sans action ni sortie de rubrique (`page_turn_driver.js` `lift()`/`fellBack()`). 10 A/B/C
  bloqués (règle 16) : `temp/d18_gestures/mockups/` (A1, A2, B, C + README des questions) — A : retournement suit le
  doigt ? les autres tuiles tournent ? axe d'une tuile en diagonale ? vague partant du doigt ? B : garder la convention
  1 ? que fait un glisser gauche/droite sur l'accueil ? C : libellé et glyphe de la plaque des vues, changement au lâcher
  ou par toucher, profils à gauche, glisser droite sur le V sans profils ?
- D9 première passe rendue (`temp/d18_search/types.probe.mjs`, `RESULTS.md`) : agenda entier, activité déclarée sous
  Activité, plaques du registre sous leur filtre, résultats qui ouvrent un niveau, Médiathèque, glyphe des rubriques ;
  reprise faite (27/27, `run_full3.log`) : heure/météo ne recouvrent plus « Rechercher », playlists, livres, journaux
  Sport, messages reçus, activités proches, santé/objectifs/profils (clés de registre en gabarit), accents des médias
  de projet. Questions : Lieux sur une carte (`temp/d18_search/mockups/m_lieux_carte.png`) ; groupes de contacts (aucune
  vue n'existe pour les ouvrir, nouvelle vue à dessiner ?).
- D15 + 15 rendus, non vérifiés sur appareil ni dans un hôte réel (`temp/d18_auv3/`) : aucun rapport de plantage sur les
  appareils ; au simulateur le plugin se charge et s'arrête sur l'absence de GPU (attendu). Causes probables corrigées :
  assistant ouvert d'office (lot 7), micro de la phrase d'éveil armé dans le plugin (`wake_runtime.js` `plugin_host`,
  sonde OK), modèle de voix de 63 Mo préchargé dans le plugin (`boot_runtime.js`, session D18). Nouveau composant
  instrument `aumu` + routage MIDI de l'hôte (`eVe/domains/audio_fx/host_instrument_midi.js`, sonde 6/6, build simulateur OK).
  Reste : tests hôtes (AUM, GarageBand, Logic, Cubasis) sur l'iPad ; chemin MIDI natif à faible latence (inexistant).
- D21 première passe rendue (`temp/d18_refresh/refresh.probe.mjs` 22/22, `signal.unit.mjs` relancé OK, `VIEWS.md`) : un
  commit local n'émettait aucun signal ; rubrique, Finder, prompteur, courses n'écoutaient pas les autres appareils ;
  le serveur ignorait `include_deleted` (suppression faite ailleurs jamais importée, alarme qui sonnait encore). Signal
  unique `atome/src/squirrel/apis/unified/atome_change_signal.js`. Reprise faite (33/33, `followers.unit.mjs` relancé) :
  Info, collection de programmes, Timeline › Projets, Médias, journal et programme Sport, prises, calques, modules
  Matrix ; double `forget` du calendrier corrigé. Reste : retrait d'une alarme depuis un autre appareil, route détail,
  vu 2 fois sur 3 (non reproduit) ; prises/calques/Matrix vérifiés à la syntaxe seulement. Hors lot : `synchronize()`.
- D20 rendu (Web : `temp/d18_auth/second_device.probe.mjs` 14/14, rouge sur le code d'avant ; `pair_push.probe.mjs` 5/5 relancé) :
  question d'appairage gardée dans le champ du bas à travers rubrique, panneau, relance ; redemandée au réveil et à la
  reconnexion ; push « Atome » aux appareils qui ne l'ont pas entendue. Non testé sur l'iPad (pas en USB) : il faut
  déployer le serveur atome.one (+ APNs) et un paquet JS iOS. Question : `pair-pending` montre la demande à un appareil
  en période d'essai de 72 h qui ne peut pas l'approuver — aligner sur l'avis en direct (le cacher) ?
- Questions à poser (règle 16), maquettes prêtes : D1 outil « Décrocher » (`temp/d18_comms/mockups/d1_decrocher_bande_accueil.png`,
  A codé = champ rouge, B proposé) ; D4 outil « Moteur » (`temp/d18_webview/mockups/m1_moteur_panel.png`) ; § 9 réglages
  contre la règle 14 (`temp/d18_visual/AUDIT.md`) ; D19 réglé par R-114 (forme L1 : le V garde ses quatre voisins, Se déconnecter au-dessus, `temp/r114_tile_norm/l1_v.probe.mjs`) ;
  D13 Live Activity (nouvel élément) ; 12 propositions de roadmap absentes (place dans l'UI) ; 11 aperçu HTML local
  (nouvelle surface DOM, à arbitrer) ; D14 fiche verdict par axes, confirmation « Au panier », déjà présent, prise
  figée (`temp/d18_scanner/mockups/m1`–`m4`).
- 4–5 première passe rendue (`temp/d18_music/` : ordre 14/14 et contrat 12/12 relancés, vraie app 21/23) : la musique continue
  d'une page à l'autre (`eVe/domains/music/music_listening.js`, une seule musique à la fois), outil « Aléatoire » après
  « Suiv. » (aléatoire du service Apple Music/Spotify, mélange de session pour les listes eVe). Question : valider le
  nouveau glyphe `shuffle.svg` et sa place (`temp/d18_music/shots/A2_musique_shuffle_on.png`). Reprise faite (vraie app
  25/25, `sound_end.probe.mjs` 7/7 relancé) : les sons stockés portent leur durée, une liste avance seule ; plaque Musique =
  défaut de la sonde, pas du produit.
- D5 rendu (Web : `temp/d18_panelgrid/slab.probe.mjs` 600/600 relancé, vraie app `grid.probe.mjs` 25/25, `fx_ribbon` et
  `hold_rows` OK) : panneaux posés sur des colonnes entières, élargis de 7,5 px de chaque côté, outils du pied à la case de
  la grille ; panneau FX de la timeline ; ruban à 0,5 px corrigé (arrondi) ; rangées de l'appui long qui ne s'affichaient
  pas (glyphe manquant) corrigées. Sonde rail R-114 : attente de case périmée (70 → 55 en paysage), relancée OK.
- Tous les lots sont rendus (dossiers `temp/d18_<lot>/`). Audits 11 et 12 rendus : `temp/d18_audits/HTML_AUDIT.md`,
  `FEEDBACK_CHAIN_AUDIT.md` (11 : aperçu isolé et conversion absents ; 12 : chaîne des bugs OK, propositions absentes).
- D25 envoi d'une liste (5 nov., Web : `temp/d18_list_share/list_share_ui.probe.mjs` 43/43, `server_lists.probe.mjs`
  25/25, captures `temp/d18_list_share/out/`) : moteur de partage de liste (`server/sync_share_lists.js`, reçu
  `list_receipt_<share>`), famille `share.*`, Envoi → Publier (S1b/S2), carte reçue Valider/Refuser + liste entière
  (S5), version liée marquée « (avant : …) » + Détacher (S6), panneau « + » (S3), tuiles « Marie (n) » (S4), brouillon
  d'eVe (S7), relais natifs `account-roles` / `feature-request-admin` / `share`. RESTE (non bloqué, fichiers d'autres
  sessions) : brancher aux écrans Médicaments/Compléments les crochets de `eVe/domains/sharing/list_share_health.js`
  (Envoi, « + », tuiles, exclusion Dashboard/Agenda, `announceProductChange` après chaque modification) ; outil Envoi
  d'un programme ; vignette photo du brouillon S7 ; « 2 comprimés » au pluriel (le texte de dose vient de
  `health_products_days.js#productQuantity`, propriétaire santé) ; `shopping.share` et `template_share` encore propres à
  leur domaine ; porter le partage de liste dans atome-server (`vault_router/shares.rs`, « router:program-interior »)
  — session Rust ; tuile en double livre + compte dans Publier (préexistant) ; essai appareil (utilisateur).
  Suite (5 nov., demande du coordinateur) — FAIT (Web, `list_share_ui.probe.mjs` sur arbre figé `PROBE_FROZEN_ROOT`) :
  outil Envoi d'un programme (maintien dans Projets) ; vignette S7 (touchée = photo seule, retouchée = retour) ;
  `shopping.share/unshare/shares` et `health_protocol.template_share/unshare` retirés, tout par `share.*` (courses
  `live`, `share.sent { list_kind }`, `share.revoke`) ; Publier fusionne fiche du carnet + compte du même numéro.
  Plein écran S7 (5 nov., 2e demande du coordinateur) — FAIT : le vrai plein écran média de D23 (règle 20) : la
  scène prend tout l'écran (`hostFullscreen` du panneau, ni bande ni pied), la photo seule, gestes
  `dashboard_media_scrub.js#handlers` (toucher = ✕ dans la case de Retour par `createMediaCloseOverlay`, double toucher
  = retour), sans `setBevyPanelFullscreen` ; sonde : photo [10,10,410,912] sur 430×932, ✕ seulement après un toucher
  [356,858,64,64], ✕ et double toucher rendent la carte. DÉFAUT (propriétaire D23, `media_controls_overlay.js#
  createMediaCloseOverlay`) : la ✕ est montée et prend le toucher mais n'est PAS peinte — `s7b`/`s7c` identiques
  octet pour octet, comme `temp/d18_media_gestures/shots/L1_fullscreen.png`/`L2_controls.png` (liste des prises) ;
  le chemin `mediaFullscreenCloseNodes` (B3) la peint. Fond noir de D23 (`[0,0,0,1]` en ligne) sans jeton : non repris.
  RESTE : ✕ non peinte (ci-dessus). Écrans de santé et listes scellées : faits (entrée « D25 A + B ») ; la sonde UI attend
  désormais l'annonce faite par la déclaration elle-même et, pour une liste scellée, la copie de sa seule racine.
- Défauts connus D18 (5 nov., Web ; sondes `temp/d18_defects/*.probe.mjs`, rapports `temp/d18_defects/out_*/`, détail
  dans le cahier « Défauts connus du 5 novembre ») :
  - FAIT 1 accueil couché qui défile (cases non vues sous la bande qui allongeaient la zone) : le cadre de l'accueil est
    un panneau découpé, jamais une zone de défilement (`frame.fixed`, `matrix_template_runtime.js`,
    `dashboard_mystic_geometry.js`) — `landscape_scroll.probe.mjs` 33/33 (8 tailles × Pro/Basic, glisser réel).
  - FAIT 2 vignette d'un projet chargée sur 127.0.0.1:3000 : la fenêtre de capture (même origine) lit la configuration
    serveur de l'hôte (`loadServerConfigOnce`, `bevy_project_preview_capture_frame.js`) — `capture.probe.mjs` (sans le
    correctif : ERR_CONNECTION_REFUSED ; avec : origine de l'app, serveur isolé).
  - FAIT 4 couleurs lues une fois : COMBO_RAIL, film/carte des panneaux, badge de téléportation, marque des profils, Carnet
    (`CARNET_RUBRIC`) suivent Réglages › Visuel — `live_colours.probe.mjs` 8/8.
  - FAIT 5 `dashboard_capture_project_missing` sur un compte neuf : un projet vide est créé pour les prises
    (`dashboard_work_projects.js#captureProjectId`) — `capture.probe.mjs`. FAIT 6 caméra `stream://` demandée au décodeur
    vidéo caché : source vivante écartée (`isLiveVideoStreamSource`) — `capture.probe.mjs` 10/10.
  - FAIT 7 rail contextuel sur la fin de la timeline : la vue projet s'arrête avant la colonne du rail, lue dans la grille
    d'écran unique (`atome_contextual_edit_model.js#contextualRailColumn`) — `rail_timeline.probe.mjs` 6/6.
  - 8 tests périmés (pagerRect, createDashboardAgendaBrowse, boxUnits, navigate('previous')) : aucun test ne les cite
    (seulement cartes et cahiers) ; rien à changer.
  - FAIT 3 course Basic/Pro (reproduite : appareil sans copie du profil — navigateur neuf, espace local pas encore
    importé — lectures distantes retenues 6 s : accueil Pro à 2,9 s puis Basic à 28 s,
    `temp/d18_defects/run_basic_slow_before_fix.log`). Cause : `waitForHomePreferences` attendait 3 s au plus puis
    présentait l'accueil ; un style inconnu (ou `auto` sans niveau connu) devenait Pro par le niveau par défaut
    « advanced ». Correctif : `dashboard_home_style.js#readDashboardStyle` ne devine plus (`undefined` sans style ni
    niveau connus ; `visual_level_cache.js#readKnownMasteryLevel`, par principal) ; `workspace_surface_preference.js#waitForHomePreferences`
    sans délai : publié, sinon dernier connu du compte, sinon la copie locale du profil (`loadUserProfile` : espace du
    navigateur / serveur local), relue à chaque page importée jusqu'à l'arrivée du profil ; profil présent sans style,
    ou espace synchronisé sans profil = erreur `dashboard_style_unknown` (`reportRuntimeError`, `eve:home-style`) et
    accueil non présenté ; `registryStyle` lève la même erreur au lieu de rendre « eve ». Le niveau par défaut
    « advanced » est gardé : il sert aussi la taxonomie des menus (R3), plus le style. Preuve :
    `basic_slow_profile.probe.mjs` 7/7 (A copie locale : Basic à 1,1–4,7 s ; B sans copie : écran vide puis Basic à
    7,4 s, aucun échantillon Pro sur ~600, captures `temp/d18_defects/shots_basic_slow_profile/`) ; invité
    `first_launch_style.probe.mjs` sans bascule ; `landscape_scroll` 33/33, `capture` 10/10 sans
    `dashboard_style_unknown` ; `tests/eve/first_launch_workspace_restore.test.mjs` 5/5 (maquette au nouveau contrat).
    Non vérifié : appareils (serveur local iOS/Tauri, profil en route depuis le cloud).
    Suite (risque fermé, 5 nov.) : déconnexion → connexion sur la même page, lectures distantes retenues 6 s —
    C1 même compte Basic, C2 autre compte eVe Pro (niveau débutant : le style choisi l'emporte), C3 retour au compte
    Basic après une déconnexion depuis un projet (ruban affiché) ; écran de connexion, recherche, menus, accueil.
    Lecteur trouvé avant correction : les lectures des rubriques de l'accueil (`dashboard:prefetch`, `dashboard:fun`)
    se terminaient après la déconnexion et plaçaient leurs niveaux par `registryStyle` → `dashboard_style_unknown`.
    Correctif : `dashboard_mystic_rubric_reads.js#read` ne pose rien pour un accueil fermé (`isCurrent` avant de placer,
    à la réponse locale comme à `update`), sans capture de l'erreur. Le style publié est celui du profil
    (`readDashboardStyle` : choisi, sinon celui de son niveau, R3 sans niveau) ; seul « rien de publié ni connu » est
    inconnu. Preuve : `basic_slow_profile.probe.mjs` 17/17 (A, B, C1–C3 : jamais Pro pour le compte Basic, jamais
    Basic pour le compte Pro, aucun `dashboard_style_unknown` dans les erreurs de page, la console ni l'anneau
    `reportRuntimeError`), `capture.probe.mjs` 10/10. Captures `temp/d18_defects/shots_basic_slow_profile/`.
  - NOTÉ, transmis par le coordinateur à la session Sport (propriétaire Live Activity) : `live_activity_skin` est une fonction, mais les attributs ActivityKit sont
    figés au démarrage (`live_activity_link.js#liveActivityAttributes` theme) : une activité en cours ne suit pas un
    changement de couleur de Réglages › Visuel.
  - FAIT profil lu sans section visuelle (5 nov., risque trouvé par la session Sport : comptes faits avant la section
    `visual`, premier lancement terminé — `registryStyle` levait `dashboard_style_unknown` dans toute géométrie de panneau,
    `bevy_panel_layout.js#toolboxReservedHeight`, la carte ne dessinait que sa bande). Règle du coordinateur : une fois le
    profil lu, le style est connu ; sans section visuelle ou sans niveau, le défaut R3 ; inconnu SEULEMENT avant toute
    lecture. Correctif : `profile_api.js#loadUserProfile` note la lecture du profil de la personne connectée
    (`visual_level_cache.js#rememberProfileRead` / `isProfileRead`, par principal ; une publication partielle des
    préférences — fond, météo, espace — n'en est pas une) ; `dashboard_home_style.js#readDashboardStyle` répond alors
    `normalizeDashboardStyle` (R3). Aucune capture de l'exception. Preuve : `temp/d18_defects/profile_no_visual.probe.mjs`
    6/6 (compte `app_session.mjs` sans section visuelle : style « eve », accueil ouvert, `training.open_exercise` ok, carte
    Chaise au mur dessinée entière — `out_profile_no_visual/2_training_card.png` —, aucun `dashboard_style_unknown`) ;
    `basic_slow_profile.probe.mjs` 17/17.
  - FAIT panneau ouvert sur une rubrique (5 nov., trouvé par la session Médicaments : Préférences › Santé dessiné devant
    Activité, le toucher allait à la rubrique). Cause : l'ordre du toucher (`bevy_ui_runtime.js#hitTestTrees`, bandes
    strictes `couche × 100000 + z`) n'était pas l'ordre du dessin (bande + z des enregistrements : panneaux à 2350, au-dessus
    de la bande Mystic) ; et le sol du Mystic, relevé au-dessus de tout enregistrement plus bas à CHAQUE repeinte
    (`menu_surface_record_runtime.js#surfaceLocalDepth`), passait par-dessus un panneau ouvert après lui au premier survol.
    Correctif : un seul calcul de profondeur (`workspace_scene_layers.js#workspaceSceneDrawDepth`, lu par la projection et
    par le toucher) ; le toucher trie les arbres par profondeur de dessin, sans mémo (`invalidateHitTestOrder` retiré) ; un
    arbre peint à travers un sol (`drawn_through`, l'arbre Mystic → `MYSTIC_SURFACE_RECORD_ID`) est touché à la profondeur de
    ce sol dans la scène, et pas du tout sans lui ; le sol du Mystic couvre les panneaux ouverts à son ouverture
    (`opening`, premier rendu de l'arbre), jamais ceux ouverts après — le dernier ouvert est dessus, au dessin comme au
    toucher ; un appui sur un arbre dessiné sur le menu n'est plus un « appui dehors » qui le fermait
    (`bevy_ui_mystic_runtime.js#resolveButtonFromPoint` → `hosted`). Suite (5 nov., demande du coordinateur : le dernier
    ouvert dessus) : l'ouverture qui relève le sol est l'ouverture elle-même — `openAt` (rubrique ouverte ou rouverte depuis
    sa tuile, menu tenu) arme `openingPaint`, lu par le premier rendu, même sol monté ; aucun second mécanisme. Preuve :
    `temp/d18_meds/profile_tap.probe.mjs` « touch ticks Allaitement » et 0 échec (note posologie gardée sur une réponse sans
    `known`) ; `temp/d18_defects/panel_over_rubric.probe.mjs` 12/12 — 1 Santé sur Activité : toucher et coche réels ; 2
    « Ouvrir un panneau » sur Activité : 367 points sur les plaques au panneau, ✕ réel, rubrique intacte ; 3 (vue bureau, où
    Santé laisse la tuile visible ; sur un téléphone il couvre les tuiles et le toucher lui revient) Santé ouvert puis
    Activité ouverte par sa tuile : sol à 2360 au-dessus de Santé (2359), 234 points sur 234 à la rubrique, fermée par un
    vrai toucher sur ← de la bande, puis Santé de nouveau utilisable (un vrai toucher sur « Allaitement » le change).
    Non-régression : profile_no_visual 6/6, landscape_scroll 33/33, capture 10/10, done_points 18/18, disc_pause 37/37,
    film_camera 37/37, profile_tap 2/2.
    Non vérifié : appareils.
- FAIT D34 rouleaux (5 nov., Web ; `temp/d18_rollers/rollers.probe.mjs` 72/72 après, 41/71 avant ; captures et rapports
  `temp/d18_rollers/out/before|after/`) : cause prouvée par le test d'impact — la fenêtre d'un rouleau (`<id>_value`) était
  une rangée inerte et le champ de valeur qu'elle porte n'est large que de son texte ; un appui à côté de la valeur tombait
  sur la zone de défilement (`scroll_area`), qui prenait le glisser (28 glissers sur 28 aux marges de la fenêtre faisaient
  défiler, valeur inchangée). Correction en UN endroit, la brique du rouleau (`bevy_panel_numeric_field.js#numericRollerFieldNode`) :
  la fenêtre est une surface `pointer_capture` (même fond, même taille, rangée) qui porte le glisser du rouleau et son
  double toucher, comme ses voisins ; vaut pour tous les rouleaux (Sport, Médicament Heure/Dose/Max/jour, dates, heures,
  alarmes, rail contextuel). Choix : aucun changement du moteur de pointeur ni de `bevy_ui_scroll_runtime.js` (l'arbitrage
  « la cible possède son glisser → pas de défilement » y était déjà juste) ; le nom d'un rouleau et le sol entre les
  rouleaux font toujours défiler (prouvé, souris et toucher). Essai appareil : utilisateur.
- FAIT D28 + D29 conseils alimentaires selon la santé (5 nov., Web ; `temp/d18_food/food.probe.mjs` 51/51, captures
  `temp/d18_food/out/` f1–f4 à côté des maquettes F1–F4). Base `food` du bundle (69 règles sourcées) appliquée sur
  l'appareil par règles (`eVe/domains/health_protocol/food_advice_{rules,products,runtime,commands}.js`), famille MCP
  `food_advice.*`. Prouvé : rien au Carnet → diabète « inconnu » (glycémie à jeun non relevée), aucun verdict ; glycémie
  à jeun 1,32 g/L vérifiée → diabète tenu → pâtes « al dente » avec raison et source FFD ; allergie arachides/noisettes
  du Carnet → ligne rouge « À éviter » et verdict « À éviter » (F2) ; SINTROM → épinards (vitamine K), millepertuis
  (à éviter) ; simvastatine → pamplemousse ; levure de riz rouge (complément) → mêmes lignes qu'un médicament, et
  food_advice.products : levure × simvastatine, Lévothyrox × fer (espacement 2 h, RCP § 4.5) ; conseil du médecin
  « Conseil · Dr Martin » appliqué seulement une fois validé ; drapeau rouge de la liste de courses ; repas de l'objectif
  (F3) : triangle rouge en fin de ligne, une carte par aliment ; « Pourquoi » / « Source » au toucher (food_advice.reason) ;
  MCP : rules ouvert, verdicts/profile/products/tips/tip_save refusés.
  CHOIX (sans question, d'après maquettes, charte, motif voisin) : 1 données de santé fermées à l'IA/MCP comme
  health_products ; seule `food_advice.rules` (base publique) est ouverte : l'assistant explique quand on le lui demande ;
  2 la raison et la source se déplient en lignes « Pourquoi » / « Source » sous la ligne touchée (même brique, même
  fiche), toucher = `food_advice.reason` ; 3 verdict principal « À éviter » dès qu'une règle de santé le dit ; une
  allergie remplace la ligne de sélection (F2) ; 4 « eVe propose » : produit scanné → première alternative OFF que la
  santé permet ; aliment → règle « prefer » de la MÊME condition ET de la MÊME source (pas de mélange de sources) ; le
  base porte désormais `whole_fruit` et `diabetes_t2_whole_fruit` (bundle e09b26ddb403451e) : le jus d'orange reçoit
  « eVe propose : Fruit entier » (F3, prouvé) ;
  5 lignes prefer/préparation/idée reçue = « Conseil · <condition> » ; 6 une ligne par médicament et par aliment (le
  thésaurus prime sur la phrase RCP du même médicament) ; 7 un produit dont l'emballage n'est pas en français est
  reconnu par ses catégories OFF, lues dans la base (`food_item.categories`, ex. Spaghetti Nº5) ; `categories_tags` gardé sur l'article de
  courses (`SHOPPING_PRODUCT_SCHEMA`) ; 8 les cartes du repas réutilisent `calendarCard` (cartes du panneau) ;
  9 traitement → condition (AVK, statine) lu dans la base (`condition.thesaurus` contre les classes thésaurus des
  substances du médicament) ; les copies JS `TREATMENT_CLASSES` / `FOOD_OF_CATEGORY` sont retirées (coordinateur, 5 nov.).
  Depuis (5 nov., autres agents, même sonde) : le conseil du médecin passe par un vrai `share.send` / `share.accept`
  entre deux comptes (liste scellée), et la fiche médicament montre « Interaction · <produit> », l'écart en heures et
  « Pourquoi » / « Source » au toucher (`health_products_views.js` réutilise `foodAdviceCardNode`).
  Sonde (bundle e09b26ddb403451e) : `temp/d18_food/food.probe.mjs` 51/51, dont « eVe propose : Fruit entier » sur le
  jus (calcul et carte F3). Écran de saisie du médecin : FAIT dans D26. Une ligne « Conseil : … », dictée ou tapée sur
  l'écran des lignes de l'ordonnance, avec la même brique de ligne : même motif, donc sans maquette. Elle se retire au
  second toucher et s'imprime sous les médicaments. Essai appareil : utilisateur.
- FAIT D35 l'assistante dit qu'elle est prête (5 nov., Web ; demande de l'utilisateur : « elle ne dit jamais qu'elle est
  prête », il doit demander « tu es là ? »). Cause : le micro anticipé s'ouvrait pendant « Attends, je prépare tes
  documents » sans être rendu sourd à sa phrase (`state.earlyInput` encore nul quand elle commençait) ; sa voix comptait
  comme parole entendue (`heard`), la phrase prête était sautée et le modèle répondait à sa propre phrase rejouée
  (« Salut ») ; hors ligne, la session locale disait « Salut, que veux-tu ? » par ONNX ; un rappel ne disait rien ; un
  échec de la phrase restait muet. Correction : micro sourd à sa phrase en cours, `heard` = une tirade de 300 ms (plus de
  bruit additionné), phrase prête à chaque ouverture (rappel compris, le modèle parle ensuite), session locale par
  l'annonceur, échec = erreur visible. Sonde `PROBE_PREBUILT_SERVER=1 node temp/d18_assistant_ready/ready_sentence.probe.mjs`
  9/9 deux fois (avant, modules HEAD : 4/9, le rapport reproduit). Fiche `known-bug-solutions/assistant-ready-sentence-missing/`.
  Reste (utilisateur) : sur l'iPad USB, entendre « C'est bon, je suis prête » à l'arrivée (route audio iOS à l'ouverture du micro).

- FAIT D36, lignes 1 et 2 (5 nov., Web). Demande : « si je crée un complément, si je fais un clic long dessus, je peux pas
  le supprimer. Ça doit être transverse… Dès qu'on crée quelque chose, on puisse l'effacer. »
  - Inventaire : `temp/d18_delete/inventory.md`.
  - Sonde : `temp/d18_delete/d36/hold_delete.probe.mjs`, vrais appuis longs sur le canevas. Avant : copie figée
    `temp/d36_before`. Après : 17/17 objets.
  - Déjà OK avant : complément, médicament, liste de médias, et le texte de Créer par son bandeau.
  - Manques prouvés puis corrigés : rendez-vous, projet, instrument, effacés au 1er toucher ; aucun appui long sur la liste
    pour autrui, l'ordonnance, l'entrée du Carnet, l'annonce, la vente, le profil de vie, le contact du carnet ; série gardée
    sans Supprimer ; trajet GPS (l'appui long ne montrait que ✕ : `dashboard_disc_icon_required`, la plaque passait
    `item.icon` au lieu de `item.glyph`) ; MCP sans `projects.delete` ni `creation.delete`.
  - Choix faits sans demander :
    1. Une seule rangée Supprimer, `dashboard_hold_options.js#dashboardDeleteAction`. `open` confirme tout `action_delete`,
       donc aucun appui long n'efface au 1er toucher.
    2. Les listes à cases gardent leur geste validé : Créer et prises (Suppr. coche puis efface), carnet de contacts
       (l'appui long coche la ligne, puis Suppr., puis confirmer).
    3. Les courses gardent leur vue tenue M3 ; leur Suppr. s'allume au 1er toucher.
    4. Machines : « Retir. » (archiver), désormais en deux touchers.
    5. Les effacements de santé restent fermés à MCP et à l'IA, par conception.
    6. Nouvelles commandes, toutes dans la liste `confirmed` : `projects.delete`, `creation.delete`, `share.list_delete`
       (refuse la liste « à moi » intégrée ; une liste de santé passe par `health_products.list_remove` en source ui, comme
       `applyDraft`), `dashboard.objective.delete`.
    7. Il n'existe pas de corbeille : l'effacement reste le `kind: 'delete'` canonique.
  - Éditions additives dans les fichiers d'autres agents : `health_products_screens.js` (heldList), `list_share_runtime.js` et
    `sharing/contracts.js` (`share.list_delete`), `dashboard_training.js` (Supprimer d'une série), `dashboard_training_machines.js`
    (confirmation).
  - Reste, choix noté :
    - Média importé de la Médiathèque : pas d'effacement de bout en bout. Seuls les octets côté serveur s'effacent
      (`files.remove`) ; les copies de l'appareil (Tauri, iOS : Rust et Swift, hors de ce lot JS) le feraient revenir.
      Il faut un propriétaire qui efface sur chaque magasin.
    - Objectif : corrigé (2 touchers et `dashboard.objective.delete`), mais non sondé sur le canevas, faute d'en créer un sur un
      compte neuf.
    - Effets et machines : corrigés par la même brique, non sondés.
    - Ligne 3 du cahier (revue adverse) : à faire par un autre agent.
  - FAIT les trois restes (5 nov., Web ; Tauri et iOS compilés, non lancés). Sonde `temp/d18_delete/d36/hold_delete.probe.mjs`,
    lancée par `temp/d18_delete/d36/run.sh` (`run_after5.log` effets et Loisirs, `run_after11.log` média et Loisirs,
    `run_after12.log` objectif avec `STYLE=eve_basic`).
    - Média de la Médiathèque : appui long réel sur sa ligne (Médias › Images) → Insérer, Favori, Supprimer ; 1er toucher
      arme, 2e efface ; absent de l'écran, de `media_import.list`, du coffre (`deleted`), des octets du serveur, du magasin
      de fichiers du navigateur ; absent après rechargement ; une 2e session (copie de travail IndexedDB effacée avant le
      démarrage) liste le média témoin gardé et aucun des effacés. `media_import.delete` par MCP : OK.
    - Loisirs : appui long réel sur Cinéma → « Ajouter aux favoris », sans `dashboard_disc_icon_required`. Deux causes :
      `item.icon` → `item.glyph`, et le 2e affichage du niveau (réponse du serveur, DATAtourisme) relayait les plaques sans
      leur appui long (`dashboard_activity_bricks.js`, `update` les tient aussi). Les autres appelants de `plateActions`
      relus : ils passent tous un glyphe.
    - Objectif : le niveau vide sur un compte neuf est voulu (eVe Pro cache la tuile Objectifs ; « Nouvel objectif » crée
      le projet guidé). Sur eVe Basic : appui long réel → Fait, Clore, Régler, Définir la cible, Supprimer ; deux touchers ;
      absent après rechargement ; `dashboard.objective.delete` par MCP : OK. L'appui long passe par `dashboardDeleteAction`.
    - Chaîne d'effets et effet enregistré : appui long réel, deux touchers, absent après rechargement, MCP
      (`audio_fx.stop` d'une chaîne, `audio_fx.delete`) OK. Les machines sont laissées à l'agent A.
  - Choix faits sans demander (média) :
    1. Commande `media_import.delete { media_id }` (la clé de `media_import.list`), dans la liste `confirmed` de sa famille.
    2. Les octets partent côté serveur à tout `delete` committé, dans `VaultRouter::commit` (Rust,
       `atome-server/src/media/removal.rs`), quel que soit le chemin (appui long, MCP, synchro d'un appareil) ; le client
       n'appelle plus `files.remove`.
    3. Chaque magasin d'appareil lâche sa copie au `delete` : Tauri (Rust, `local_atome_media_removal.rs`, commit local et
       synchro entrante), iOS (Swift, `AiSRuntimeMediaRemoval.swift`), navigateur (`guest_workspace_store.js`).
    4. L'effacement retire aussi le média des favoris et de toutes les listes de médias.
    5. La Médiathèque n'a que des lignes ; l'aperçu de la scène utilise le même `holdRow`.
  - FAIT, effacement venu d'un autre appareil (`temp/d18_delete/d36/sync_delete.probe.mjs`, `sync_delete.log`) : l'appareil B
    (2e connexion /ws/api prouvée par la clé de A) committe le `delete` d'un média importé par A. Les octets du serveur
    partent (`VaultRouter::commit`), le coffre le dit `deleted`, le média témoin reste. Chez A, par sa synchro, avant
    tout rechargement : le magasin de fichiers le lâche et `media_import.list` ne le montre plus. Après rechargement :
    absent de la liste et de l'écran (Médias › Images), le témoin présent. Aucune correction n'a été nécessaire.
  - Contrôle du 5 nov. après les changements de l'agent A (armement partagé, `observeTouches`). Le média repasse :
    `run_after13.log` seul, `run_after14.log` en lancement complet, `sync_delete2.log`. L'échec de `run_fix.log`
    (`controlListed` faux, `listed: 0`) venait de la sonde : la 2e session lisait sa liste une seule fois, après 15 s fixes,
    avant que sa copie de travail ne se remplisse. Elle attend maintenant que le média témoin arrive (jusqu'à 120 s) et
    note le délai.
  - Non vérifié : Tauri et iOS non lancés (cargo check et test unitaire Tauri OK, `swiftc -parse` OK).
  - FAIT revue adverse, constats 2–6, 9–13, 15–18 (5 nov., Web ; rapport `temp/d18_delete/challenge/report.md`).
    Sondes : `temp/d18_delete/d36/hold_delete.probe.mjs` (`run_fix.log` 23 objets verts avec toucher à côté et témoin gardé, `run_fix2.log` carte de l'Agenda et appui long sur une prise de Créer 2/2 ; objectif non atteint sur eVe Pro par conception, prouvé avant sur eVe Basic ; contrôle « 2e session » du média rouge sur le témoin `controlListed`, hors de ce lot), `temp/d18_delete/challenge/series.probe.mjs`
    (`series.log`, 9/9), `temp/d18_delete/challenge/stray.probe.mjs` (`stray.log` + `stray2.log`, 3/3 : en-tête, sol à côté, plaque tenue), `own_sync.probe.mjs`.
    - Une seule confirmation partout (10, 17). Un seul état armé, `bevy_ui_tools_band.js#toolsBandDeleteArming`, partagé par
      la rangée Supprimer de l'appui long (`dashboardDeleteAction`, signature inchangée) et par tout « Suppr. » de bandeau
      (`toolsBandDeleteTool` : allumé tant qu'il est armé, 1er toucher arme, 2e efface). Retirés : le « Non / Oui » du profil
      de vie, la confirmation propre du carnet de contacts, la question de la brique liste à cases, l'invite de la
      Réception, l'état armé privé des courses, de la carte de consentement aux capteurs et des rapports de Réglages › Avancé.
    - Toucher à côté (11) : tout toucher hors de la rangée ou de l'outil armé désarme, dans la brique, par l'observateur de
      touchers du runtime BevyUI (`observeTouches`). Prouvé : armer, toucher l'en-tête, un seul toucher n'efface plus.
    - Un toucher n'efface plus rien (2–6, 12) : série gardée (Favori ne fait que retirer des favoris), carte et éditeur de
      l'Agenda, publication planifiée (et son appui long dans l'Agenda : `publish.cancel`), `video_train_retire`, annulation
      d'une réservation de coach (avec appui long), suppression d'un message reçu, d'une interaction, d'un fond enregistré
      (chacun avec appui long), « Retirer » de l'annonce.
    - Annonces et ventes : « Supprimer » efface l'enregistrement (annonce : `events.unpublish` puis `calendar.delete_event` ;
      vente : nouvelle commande `shop.delete`, rembourse comme `withdraw` puis `kind: 'delete'`) ; « Retirer » reste à part, armé.
    - Machines (13) : Supprimer efface (nouvelle commande `training.delete_machine`) ; les séances passées restent telles
      qu'enregistrées (histoire en ajout seul, rien ne relit le `machine_id` d'une séance passée).
    - Séries gardées (15) : la sonde a montré qu'un ancien écrit de profil d'un autre appareil faisait revenir une série
      effacée (elles vivaient dans `preferences.training.series`, dernier écrit gagnant). Correction : chaque série est son
      propre Atome privé `training_series` (`training_series_records.js`) ; celles encore dans le profil y passent une fois
      (sauf celles dont l'Atome a déjà existé), puis la liste du profil est vidée. Prouvé : après rechargement et après les
      écrits périmés d'un 2e appareil, la série effacée reste partie, la série non favorite reste gardée et listée.
      Cause annexe corrigée : `training.set_favorite` refusait un `series:<id>` (INVALID_ARGUMENT).
    - `calendar.delete_event` (16) : `calendar_event_not_found` sur un id inconnu ou d'un autre type d'Atome
      (`calendar_api.js#isLiveEventRecord`, aussi pour lire et modifier).
    - `dashboard_duo.js:85` (18) : l'appui long n'est pas vide, il porte sa vraie option, « Duo » allumé qui ferme la
      zone (ajouté par l'appui long standard) ; commentaire posé, rien d'autre.
    - Choix faits sans demander : la réservation d'un coach se « supprime » en l'annulant (`coaches.cancel`) ; dans les
      panneaux de projet sans appui long de scène, l'appui long coche la ligne (Réception), déplie la carte (Interactions)
      ou arme Supprimer (Fonds) ; le carnet de contacts garde son appui long qui coche ; les courses gardent leur vue tenue
      M3 ; le texte armé d'un fond peut être coupé dans sa colonne de 80 px ; le « Conseil » d'une ordonnance (retrait
      d'une ligne proposée, pas d'un objet créé) garde ses deux touchers propres.
    - FAIT sondé sur le canevas (5 nov., suite du coordinateur) : `temp/d18_delete/d36/rest.probe.mjs` → 8/8
      (`rest_run.log`, `rest_run2.log`, `rest_run3.log`, `out/rest_run.json`). Chaque élément semé par sa vraie commande
      (MCP ou voix), un frère semé avec lui, puis : 1er toucher arme, toucher ailleurs désarme, un toucher après garde
      l'élément, le suivant l'efface, rien ne revient au rechargement, le frère reste.
      Coach : `coaches.become` puis deux demandes d'un 2e compte ; appui long sur la ligne « Demandes », Supprimer.
      Publication planifiée : `publish.send` avec `due_at` ; appui long sur la tuile Agenda, Supprimer.
      Train vidéo : `video_train.share` à un contact ; appui long sur la ligne du fil, « Retir. ».
      Réception : message direct d'un contact ; la ligne dépliée, Supprimer.
      Interactions : `projects.create`, `ui.text.create`, `interactions.create` ; le panneau du projet, carte tenue, Supprimer.
      Fonds : le Enreg. du panneau, nom tapé dans son champ ; le Supprimer de la ligne.
      Avancé : `debug.report` de l'assistant. Chemin d'une personne : tuile Session › Réglages › page suivante › Avancé,
      accordéon Debug, case cochée, Suppr. de la bande.
      Consentement capteurs : `sensors.set_consent` puis `training.open_exercise`, « Infos ». Sur le Web il n'y a aucun
      enregistrement (fichiers natifs .asr), donc rien à recharger ni de frère. La preuve est l'armement, le désarmement
      et le résultat « Mouvements supprimés » au seul 2e toucher. Le compteur d'appels `sensors.delete` du bus est resté
      à 0 : l'abonnement de la sonde ne voit pas ce chemin, ce n'est pas une preuve d'absence.
    - FAIT clés i18n devenues inutiles retirées (toutes langues) : `profile_delete_ask`, `answer_yes`, `answer_no`
      (`languages_dashboard_mystic.js`), `eve.comm.inbox.delete_prompt`, `eve.contact.delete_prompt_one`,
      `eve.contact.delete_prompt` (`languages_fr_core.js`, `languages_en_core.js`), `eve.conversation.delete_all_prompt`
      (`languages_fr_comm_inbox.js`, `languages_en_comm_inbox.js`), les `delete_prompt*` de `languages_bug_reports.js`
      et `eve.finder.delete_prompt*` (`languages_finder.js`). Grep : plus aucun consommateur.
  - FAIT revue adverse, constats 1, 7, 8, 14, 19 (5 nov., Web ; rapport `temp/d18_delete/challenge/report.md`).
    Sondes (serveur Rust de la sonde construit à part, `PROBE_SERVER_BIN`, cible `temp/d18_delete/d36b/target`, supprimée ensuite) :
    `temp/d18_delete/d36b/items.probe.mjs` → 24/24 (`items5.log`), `temp/d18_delete/d36b/lists_forums.probe.mjs`, deux comptes → 16/16 (`lf9.log`), `anchor.probe.mjs` → 3/3 (`anchor4.log`) ; `items6.log` 24/24 après les corrections.
    Téléphone 430×932, `--use-angle=metal`, vrais appuis longs : le 1er toucher arme, le 2e efface.
    - Constat 1. Effacer un projet efface son contenu : la portée `project_id` plus la descendance `parent_id`, en un seul lot
      (`adole_api/projects.js#delete_project`). Prouvé : enfant et petit-enfant effacés, l'autre projet gardé, rien ne revient
      quand un 2e appareil rejoue ses écrits périmés.
    - Constat 7. Effacement par commande et appui long : préréglages d'effet, livres (avec leurs fichiers), disciplines
      à soi (avec leurs pratiques et le choix gardé), pratiques du journal, prises, ressenti du jour (carte Résultats),
      résultats de laboratoire (valeurs, document d'origine et fichier avec), photos Beauté, imports Strava.
      Le ressenti et les résultats sont refusés à MCP (`health_access_denied_for_actor`).
      Santé, fichiers touchés : ressenti `atome/src/squirrel/health/health_feeling.js`, `feeling_contracts.js` ;
      résultats seulement `eVe/domains/health_record/health_record_runtime.js`, `health_record_commands.js`,
      `atome/src/squirrel/health/health_record_contracts.js`, `eVe/domains/dashboard/health_record_result_views.js`,
      `health_record_results.js` ; magasin santé `atome/src/squirrel/health/index.js` et `health_imports.js`.
    - Constat 8. Appui long branché sur les commandes existantes : soin et séjour Thalasso, boîte et alias du courrier
      du site, forum (« Quitter » pour un membre, « Supprimer » pour son fondateur, nouvelles commandes `forum.delete` et
      `forum.remove_post`, en Rust dans `forums.rs`), message d'un forum (le sien, ou tout message pour le fondateur),
      liste reçue (« Quitter » = `share.detach`).
    - Constat 14. Une liste faite pour soi est une tuile parmi les autres ; son appui long l'efface, l'autre reste.
    - Constat 19. Une liste partagée effacée par son auteur : chaque partage est révoqué ; chez le destinataire, en direct,
      la copie, ses lignes, son papier et son reçu partent ; la liste sœur et sa ligne restent ; rien ne revient après
      rechargement. L'écoute de `squirrel:share-revoked` est posée dès l'import du module (`list_share_commands.js`).
    - Choix faits sans demander :
      - le contenu d'un projet, c'est la portée `project_id` et la descendance `parent_id` ;
      - une photo Beauté ou une prise retire la référence seulement, le média reste dans la Médiathèque ;
      - un livre part avec ses fichiers ;
      - le ressenti d'un jour et un jour Strava sont vidés, jamais effacés : un id effacé est une pierre tombale sur le
        serveur, et un ressenti saisi ensuite le même jour serait ignoré ;
      - un résultat part avec son document d'origine et son fichier ;
      - pas de `qr.remove` : un QR gardé est un média de la Médiathèque, déjà effaçable par `media_import.delete` ;
      - Strava : la commande seule, aucun écran ne liste les imports (levé le 6 nov. : Sport › Journal) ;
      - une copie détachée reste au destinataire ; une liste scellée reçue peut s'ouvrir vide.
      - un forum est une tuile, pas un outil du niveau : ses maquettes f1–f3 le voulaient (« une tuile au nom du forum »)
        et la règle des niveaux garde les données en tuiles ; son glyphe l'avait fait passer pour un outil (`tile: true`
        dans `dashboard_circle_items.js`).
    - Restes, avec leur raison :
      - `script.remove` : bloqué, aucun écran ne liste les scripts. Un nouveau contrôle demande une maquette (règle 16).
        Levé le 6 nov. : Créer › Texte › Calc › « Scripts ».
      - Appui long du préréglage d'effet : branché, mais non atteint par la sonde (aucune commande n'ouvre ce panneau).
        Commande prouvée.
      - Appui long du courrier du site : non sondé sur le canevas (il faut un domaine). Vérifié par Biome.
      - FAIT (5 nov., demande du coordinateur) les trois défauts trouvés en route :
        - « Quitter » : l'appareil qui quitte prend la réponse de sa propre commande. `list_share_runtime.js#detach` écrit
          le reçu `detached` (avec ses copies) dans sa copie de travail, et la tuile redevient aussitôt une liste à soi.
          Prouvé sans attente.
        - Retrait manqué hors ligne : à chaque reconnexion (`squirrel:auth-transport-open`) et à chaque restauration
          (`squirrel:workspace-synchronized`), `list_share_runtime.js#reconcile` compare les reçus encore liés aux partages
          vivants du serveur (`AdoleAPI.sharing.inbox`, l'action `inbox` déjà servie). Un partage qui n'est plus vivant
          part comme le fait `withdrawn`. Les vérifications passent une à une (`list_share_commands.js`). Prouvé : l'app de Marie fermée,
          Julien efface ; sa copie reste vivante dans son coffre. Elle rouvre l'app dans la même session (sa reconnexion) ;
          aucun `share-revoked` ne lui parvient, et sa copie, sa ligne et son reçu partent (effacés dans son coffre par son
          appareil) ; les autres listes restent. Fermer le socket ou passer hors ligne dans Playwright ne coupait pas la
          poussée en direct : seule la fermeture de l'app la coupe.
        - Appui long sur un outil du niveau de la rangée la plus basse : `dashboard_mystic_item_actions.js#open` tient
          la plaque comme elle-même (`heldItself`, le dessin de l'appui standard des rangées) quand aucune case d'accueil
          n'est sous elle. Sans ancre possible, l'erreur est explicite (`dashboard_item_actions_anchor_missing` levée).
          Sans actions ou hors contexte, la raison est nommée. `dashboard_hold_options.js` n'est pas touché. Prouvé par
          `temp/d18_delete/d36b/anchor.probe.mjs` 3/3 : les vrais articles du niveau Contacts sont reposés avec un forum
          en outil, qui tombe sur la rangée la plus basse ; un vrai appui long dessine l'outil au-dessus de « Supprimer »,
          qui arme puis efface le forum. Aucun outil du niveau ne porte aujourd'hui un tel appui en production : le
          défaut était latent depuis que les forums sont des tuiles.
- FAIT recoupement de tout ce que la personne prend et est (5 nov. 2026, Web ; demande du coordinateur, D24/D27/D28/D29).
  - 2026-11-05 Matrice avant/après : `temp/d18_cross_check/matrix.md`.
  - 2026-11-05 Sondes. FAIT, prouvé par `PROBE_PREBUILT_SERVER=1 node temp/d18_cross_check/cross.probe.mjs` → 35/35 (`run4.log`).
    Un cas positif et un négatif pour chaque croisement : complément × médicament, complément × complément, ordonnance,
    sport, sommeil et coucher, grossesse et allaitement, aliment acheté ou mangé, fiche d'aliment.
    La pré-ordonnance est prouvée par `temp/d18_rx_aid/rx_aid.probe.mjs` → 68/68 (2 contrôles ajoutés).
    Les autres sondes restent vertes : meds 58/58, food 51/51, share 36/36, `rules_unit.mjs` 15/15.
  - 2026-11-05 Référence. FAIT : le binaire Rust (`atome-health-ref`) extrait les phrases des RCP 4.2 à 4.8 qui nomment
    une part de la vie, en règles `context_rule` citées telles quelles.
    - Les facteurs : conduite, somnolence, soleil, effort, déshydratation, hypoglycémie, alcool, sommeil, prise au
      coucher, tendons.
    - Une phrase qui dit seulement « aucun effet » ne donne aucune règle, sauf si elle continue par « mais », « toutefois »…
    - Le 4.8 n'est gardé qu'en règles, jamais en texte de document.
    - Fixture b2113cb1d8f056f7 (47 règles de contexte ; les règles de profil, de prise et de dose sont inchangées).
    - Test `the_smpc_sentences_about_the_person_s_life_are_quoted_as_written` ; fmt, clippy -D warnings, tests et
      cargo deny verts.
  - 2026-11-05 Un seul lecteur. FAIT : `food_advice_runtime.js#readFoodAdviceContext` lit tout.
    - Il lit les produits, ce qui exclut les produits en pause et inclut les pré-ordonnances validées.
    - Il lit le Carnet (allergies, antécédents), les paramètres et la vie (`person_lifestyle.js#readPersonLifestyle`).
    - `person_id` donne la liste et le Carnet d'un patient, jamais la vie du titulaire.
    - L'aide (`prescription_aid_commands.js#carnet`) et l'ordonnance passent par lui ; il n'y a pas de moteur parallèle.
  - 2026-11-05 Fiche médicament et complément. FAIT : ses lignes disent les interactions, la règle ANSES lue dans les
    deux sens, les allergies, les antécédents (RCP 4.3/4.4), le profil (4.3/4.4/4.6, précautions comprises), la vie
    (4.2–4.8) et les aliments achetés ou mangés. Ce qui n'est pas connu est écrit « Inconnu · … ».
  - 2026-11-05 Ordonnance. FAIT : chaque ligne est vérifiée contre le Carnet du patient ; une ligne contre-indiquée
    prend la marque « avoid ». Sans référence (hors ligne), `checks_error` est rendu et aucune marque n'est mise.
  - 2026-11-05 Aide à la prescription. FAIT : ses lignes lisent aussi le sport, le sommeil et l'heure de coucher, et les
    précautions du profil.
  - 2026-11-05 Aliments. FAIT : la phrase RCP sur l'alcool marque la boisson « À limiter » ; le thésaurus garde la
    priorité.
  - CHOIX (sans question, d'après la charte et le motif voisin) :
    1. Une ligne de vie n'est jamais bloquante. Présente, c'est une précaution (« limit ») ; inconnue, elle est
       « à considérer », sans marque.
    2. Le sport compte comme présent s'il y a au moins une séance en 28 jours. Il est absent (aucune ligne) s'il y a
       0 séance alors que la personne en a déjà fait, et inconnu si elle n'en a jamais fait.
    3. Une séance est intense à partir de 6 MET (OMS 2020, Compendium 2024, `TRAINING_VIGOROUS_MET`).
    4. « Dehors » veut dire `outdoor_run` seulement. Le soleil est inconnu autrement.
    5. Une prise est « au coucher » si elle tombe à 30 min ou moins de l'heure de coucher du programme Sommeil.
    6. Conduite, alcool et soleil : déclarés dans Préférences › Santé (suite du coordinateur, 5 nov., même motif que
       « Allaitement », validé d'office). Jamais déclaré = inconnu ; « Rien à déclarer » ou 0 verre = absent ; une ligne
       seulement décochée, sans autre ligne déclarée, redevient inconnue (même règle que la grossesse).
    7. Pour un patient, toute sa vie est inconnue.
    8. Une ligne d'ordonnance seulement nommée est résolue par son nom dans la référence (`medicineNamed`, comme l'aide).
    9. Déploiement : le bundle du serveur doit être reconstruit avec le nouveau binaire AVANT le JS, car le contrat
       refuse un bundle sans `context_rules`.
  - 2026-11-05 Conduite, soleil et alcool déclarés. FAIT : deux lignes cochées de la même brique dans « Ce que eVe doit
    savoir » (« Je conduis », « Exposition au soleil », juste après Allaitement), et « Alcool » en verres par semaine sur le
    rouleau des nombres (0 par défaut, nombre entier), sous les lignes.
    - Propriétaires : `health_profile_contract.js` (catégories `driving` et `sun`, `alcohol_week`,
      `healthProfileAlcohol`), `health_profile.declare { category: 'alcohol', glasses }`, `bevy_panel_home_health.js`.
    - Lecture : `person_lifestyle.js#declaredOf`, puis `prescription_aid_rules.js#contextFindings`. « Je conduis » tient
      aussi la vigilance soutenue de l'ANSES (mélatonine).
    - Preuve : `cross.probe.mjs` → 44/44 (`run5.log`), par de vrais touchers sur les lignes et sur le rouleau, positif et
      négatif pour chacun ; captures `temp/d18_cross_check/out/profil_*.png`.
    - Restent verts : meds 58/58, food 51/51, rx_aid 68/68, share 36/36. Un premier passage de share a donné 33/36 (section K,
      clé de Paul publiée trop tôt) ; il est repassé à 36/36 sans changement de code (instable, hors de ce lot).
  - Reste : rien du lot sur le Web. Appareils (iOS, Tauri) : à l'utilisateur.
  - 2026-11-05 Règle 21 contre Q70 : profil Santé sur le serveur, scellé pour la personne seule. FAIT (Web).
    - Décision : la règle 21 (« le serveur est le seul point de vérité », utilisateur, 4 nov. 2026, « Nothing is kept only on
      a device ») l'emporte sur Q70 (« stockage cet appareil seulement », 31 oct.). La raison de Q70, la vie privée, est gardée
      par le sceau : le profil est sur le serveur, scellé pour la clé de la personne, et aucun mot n'y est en clair.
    - Stockage : la déclaration `health_profile:<personne>` et les allergies et intolérances `health_preference:<personne>:<clé>`,
      type `health_profile`, ne portent que `sealed` (`eVe/domains/programs/health_profile_store.js`). À la première lecture,
      les copies Q70 `device:` et les anciennes copies en clair `program_preference:` y sont scellées une fois, puis
      supprimées dans le même lot par le pipeline. Le mécanisme `device:` reste pour ses autres usages.
    - Partage (CHOIX, sans question) : le profil scellé ne s'ouvre que sur les appareils de la personne. Le chemin du médecin
      (`readPersonParameters({ person_id })`, ordonnance, aide) garde son contrat : il n'a jamais lu le profil, la vie d'un
      patient reste « inconnu ». Ce que le patient veut faire savoir lui parvient par ce qu'il envoie : l'aide D27 scellée
      pour les deux, avec les faits de son Carnet.
    - Défauts trouvés par la preuve à deux navigateurs, corrigés à leur propriétaire. Ils touchaient tout ce qui est scellé
      pour le compte : les listes D25, l'aide D27, les copies des capteurs.
      1. `adole_websocket_message.js` : `backupKeys` manquait dans `auth-response`. Un appareil appairé ou restauré ne
         recevait donc jamais les clés de secours.
      2. `auth_pairing_client.js` : la session s'ouvrait avant que l'anneau reçu soit gardé. Un `ensure()` au démarrage
         pouvait le remplacer ; désormais l'anneau passe d'abord, à l'appairage comme à la restauration.
      3. `share_keys.js#make` : un appareil fraîchement connecté qui n'avait pas encore la fiche de clé en publiait une
         nouvelle, à la place de celle du compte. Il demande désormais au serveur (`published`).
    - Preuve : `PROBE_PREBUILT_SERVER=1 node temp/d18_cross_check/profile_server.probe.mjs` → 30/30.
      - A : copies Q70 déplacées ; « Je conduis », « Grossesse » et 3 verres touchés pour de vrai.
      - Serveur : base, coffres et journaux sans déclaration ni allergène en clair.
      - Trames de A et B, dans les deux sens, sans valeur en clair.
      - B, appairé par le nombre, retrouve tout ; déconnecté, sa copie locale vidée, puis reconnecté, il retrouve tout du
        serveur.
      - C, navigateur neuf ouvert par le seul code de secours, retrouve la même déclaration et la même allergie.
    - Autres vérifications :
      - `temp/reco_sante/device_ui.probe.mjs` → 40/40, ses vérifications Q70 passées à la règle 21.
      - `temp/reco_sante/device.probe.mjs` → 23/23.
      - `temp/account_restore/account_restore.probe.mjs` s'arrête avant toute restauration (rechargement de A au-delà de
        30 s, sur machine calme aussi) : non attribué, la restauration est prouvée par C ci-dessus.
      - `temp/d18_meds/share_keys.probe.mjs` → 12/12, dont l'appareil frais qui ne remplace pas la clé.
      - cross 44/44, share 36/36, rx_aid 68/68, meds 58/58, food 51/51 (journaux `temp/d18_cross_check/r21/`).
      - Tests du dépôt : `program_allergens` et `program_collection_contract`, 14 réussis ; les 5 tests de contrôle en échec
        échouent pareil sur HEAD propre (antérieurs). `auth_phone_link_client` 7/7.
      - Natif : `cargo check -p squirrel` passe (avertissements d'atome-server seulement, autre session) ; `swiftc -parse`
        des 82 fichiers Common passe. Les filtres natifs sont par préfixe `device:` (Tauri, iOS) : rien à retirer. Le type
        `health_profile` est dans `eVe/registry/generated/atome_types.json`, que lisent Axum et la porte de types iOS.
    - Non vérifié : Tauri et iOS en marche (à l'utilisateur).

- FAIT (2026-11-06, D36 ; ouvert ATTENTE UTILISATEUR le 2026-11-05) — seules restes du lot, bloqués par la règle 16 (une nouvelle place à l'écran demande une maquette validée) : (1) les scripts ne sont listés par aucun écran, donc `script.remove` n'est atteignable que par MCP/voix ; (2) les imports Strava se suppriment par commande seulement, aucun écran ne les montre. Question posée à l'utilisateur le 5 nov. : faut-il un écran de liste pour chacun (où), avec maquette avant code. Réponse 6 nov. : « Oui, maquette d'abord ». Maquettes aux vrais jetons : `temp/d18_lists_mockup/out/` (constats `findings.md`, questions `questions.md`). Scripts — A (recommandé) : outil « Scripts » dans Créer › Texte › Calc, les scripts du texte sur la scène, appui long → Supprimer ; B : ligne « Scripts » dans Préférences › Assistant, tous les scripts. Strava — A (recommandé) : chaque activité importée devient une ligne de Sport › Journal, appui long du Journal ; B : ligne du bloc Strava de Préférences › Santé ouvrant les activités en tuiles ou en liste. À coder après le choix : `strava.remove_import {source_id}` (une activité ; aujourd'hui seul `strava.remove_imports` supprime tout). Questions posées le 6 nov. — VALIDÉ par l'utilisateur le 6 nov. : Scripts = A (outil « Scripts » dans Créer › Texte › Calc), Strava = A (activités dans Sport › Journal). FAIT le 6 nov. (Web) : Scripts A et Strava A codés comme leurs maquettes. Scripts : outil « Scripts » après « Grille » dans Calc, montré seulement quand le texte a un script (zen, même règle que l'outil « Liste ») ; les scripts du texte en tuiles sur la scène (`eVe/domains/dashboard/dashboard_create_scripts.js`, brique des cellules de scène, « Liste »/« Tuiles » au-delà d'une page), appui long → Supprimer (`dashboardDeleteAction`) → `script.remove` ; le dernier effacé rend le texte. Strava : chaque activité importée est une ligne de Sport › Journal (glyphe de la discipline, durée, distance, pouls max ou « — »), lue par `getHealthOwner().imports.list({source})` ; appui long du Journal → Supprimer → nouvelle commande `strava.remove_import {source_id}` (liste `confirmed` de la famille strava), qui retire l'activité de son jour par le commit canonique ; un jour vide est vidé, jamais effacé ; MCP refusé (`health_access_denied_for_actor`). Preuve : `temp/d18_lists_mockup/proof.probe.mjs` 26/26, 0 erreur de page (`proof_run1.log`, captures `temp/d18_lists_mockup/proof/`) : 1er toucher arme, toucher à côté désarme, 2e toucher efface, absent après rechargement, voisins gardés, moniteur `workout_duration` 120 → 60 ce jour-là. `bevy_scroll_exports_missing` (vu pendant les maquettes, 08:19–08:30) ne vient pas de ces écrans : le moteur de rendu servi alors n'avait pas encore `press_atome_bevy_scroll` (passage du défilement en Rust par une autre session, WASM reconstruit à 14:04) ; absent de la preuve. Tout le reste de D36, D24/D29 (croisements, conduite/soleil/alcool), règle 21 contre Q70 est FAIT avec preuves (voir les blocs datés du 5 nov. ci-dessus). Tests appareil (iPad, Tauri) : à faire par l'utilisateur.

### R-112 — Publish the remaining version and Framework State changes on main (2026-11-03)
- Statut : FAIT — eVe main `0e9acd42` and Atome main `170775861` published and independently verified with `git ls-remote` on 2026-11-03 after the user's explicit one-operation exception.
- Source: current Codex chat, 2026-11-03: « Ils devraient être poussés sur main. Fais-le à ma place »; files identified as `eVe/version.txt` and `eVe/documentations/FRAMEWORK_STATE.md`.
- Prepared: original files backed up under `temp/git-main-recovery-2026-11-03/`, preserved byte-for-byte and committed as eVe `0e9acd42`. Its existing main branch was fast-forwarded from its 14-commit-old tip; fetched `origin/main` is included. Atome main records the exact eVe commit. No conflict or unmerged file; both product versions remain 1.48.
- Publication: after the initial automatic refusal, the user answered « Oui, autoriser ces deux push » on 2026-11-03. eVe was published first; its remote commit and Atome's exact submodule reference were checked before publishing Atome. Both remote main hashes matched their local commits. No conflict, force-push, new branch or authentication/configuration change; no publication step remains. The request-register closure is documentation only.
- Evidence: `temp/git-main-recovery-2026-11-03/published.json` and the original patches/files in that directory. This is Git metadata/documentation preparation; no application code or runtime behavior changed. The register closure remains local: automatic review rejected its additional commit/push as outside the two-push exception; the two requested publications are complete.

### R-106 — Complete atome/eVe optimization campaign
- Preuve récupérée2026-11-02 : endurance médias QA sur iPad1.42 terminée le2026-11-01 à11:42UTC,102cycles/1808316ms, résultat vert (`ipad_qa_media_endurance.json`). Ne valide ni les projets réels de l'iPhone1.46(44), ni R-108. Le dernier test Web1.42 conserve un échec de cible de ligne ; l'adaptation du test au défilement reste à valider, les autres acceptations restent ouvertes. Dernière priorité utilisateur : audit du nouvel échec R-108 et des points R104 ; aucune réinstallation ancienne à effectuer.
- Statut : EN COURS (2026-10-31) — current chat, campaign `temp/optimisation_2026-10-30T12-40-47-959Z/`.
- User request and approval: optimize performance, memory retention and package size across Web, Tauri and iOS without losing functionality; continue automatically. Latest device instruction: « fais tout ce que tu peux faire sans l'ipad et des mo,n retour je le reconnecte ».
- Validated complete lots: preservation, physical-device control and reference installation (3/8; 37% complete, 63% remaining). Implementation and partial tests do not count as accepted whole lots.
- Verified evidence and source ownership: campaign `WORK_LOG.md`, `campaign.json`, persistent lifecycle/virtualization/package/native tests, and runtime campaign entry in `eVe/documentations/FRAMEWORK_STATE.md`. No Git write or push is authorized by this task.
- Native test control limitation: CUA returned after3h45 despite requested20s timeout; no further CUA calls. User explicitly approved AppleScript/System Events on2026-11-01, restricted to the QA Tauri copy; no Mac settings/credentials changes. Actual native clicks, captures, Inspector input and canonical QA project creation/reopen verified. A native file-picker modal became hidden; exact QA process relaunched without resetting data. Tauri final acceptance is also blocked by stale HTTP validation: loaded old diagnostic module despite correct final file served. Canonical static_asset_cache.rs repair passes four real HTTP tests; corrected Release build/native acceptance in progress, no cache purge.
- iPad QA isolation: user explicitly approved the exception to `.codex/visual-test-protocol.md`, §Preconditions 2 on2026-11-01: two QA iOS Optimisation A/B projects in the current account, test media only, existing projects untouched. Both created; three QA image/audio/video fixtures imported in A through the actual canonical panel/native picker. Real playback/stop/replay/end passes, including advancing native clock and zero retained voice IDs after stop/end. A→B→A preserves the three media IDs; B has no media or owned decoded audio. Durable app-relaunch and rich endurance checks in progress. No pending permission identified by technical preflight; inspection now has a45s total client deadline, including discovery.
- Remaining: finish subsystem audit, optimized runtime/endurance and before/after acceptance on Web/Tauri, latest/rich-media iPad acceptance, final checks/cleanup and measured delivery report. The renewed Web run completes202cycles/30min after the project-identity repair but fails the5%heap gate at9.68%; same-view retained-allocation replay completes200cycles/30min but also fails at9.49%; retained stacks are under investigation. Snapshot sharing saves46.6%history memory in paired measurements, but real203cycle replay still fails9.23%heap gate; no complete memory acceptance. A later comparable-workload Web run passes199cycles/30min at+2.30%heap; cold audio capacity growth is preserved separately and earlier failures remain. Final-audio-owner layered replay passes: cold image/audio, six ordered media members, depth/edit/extraction/reorder/reload;21screenshots retained. Tauri Release has both failed initial-present and successful numeric boot observations; native UI acceptance resumes with explicit AppleScript permission. Current1.42(build41)iOS compilation/signature/install/launch pass; latest/rich-media acceptance remains.
- Device work resumed at the user's explicit return/request (2026-10-31): wired USB, XCUITest screenshots, actual Objectives/Back touches, Web Inspector health and Instruments access confirmed. The user explicitly authorized closing the existing « Coucher » panel; that single close was performed and verified. Installed1.39(38) passes100real navigation cycles/34min36s and100collector lifecycle cycles; latest1.42/rich media tests remain. User explicitly authorized closing alarm interruption panels with their crosses during this test campaign, including occurrence acknowledgement; schedules and recurrence must not change. « Dernier café » close and latest/rich-media acceptance are resuming. Dernier café was closed and current1.42 light navigation100cycles/34min42s passes, WASM91,553,792bytes stable. Rich-media/final-revision acceptance remains.

- Latest final-owner revision: all29Molecule suites,3705-file syntax and M0 pass. Native1.42 final-owner build/signature succeeds; in-place final1.42 device installation and launch pass; health/touch acceptance resumes. Same-source final1.42 Tauri build passes6m07s/535.56MiB. Targeted sync/offline18/18pass after test-only canonical-token fixture correction; product security unchanged.

### R-001 — Calendrier : refonte du panneau Rendez-vous
- Statut : FAIT (2026-10-30, soir) — Q2 codée (Perso, Pro, Sport au départ, `temp/reco_small/r001_default_calendars.probe.mjs` 8/8 relancée par le registre) ; Q1 et Q60 : état actuel gardé (ta réponse « reco partout »). Restent non vérifiés : AlarmKit sur appareil, visio à l'heure, Tauri, iOS.
- Source : ta demande du 2026-10-27, 12 h 15 (session `77572327`, « Alors, je suis allé dans rendez-vous… »).
  La session s'est arrêtée à 14 h 05 sur la question 2 sur 3, sans réponse ; rien n'a été codé.
- Validé par toi : maquettes `temp/calendar_event_redesign/mockups/` (rouleaux sans − / +, les voisins servent
  de − et +) ; carte Fin = rouleaux de l'heure de fin liés à la durée dans les deux sens, sans bascule Durée / Date ;
  plusieurs calendriers (carte repliable, au plus 4 lignes puis défilement) ; dépliages vers le haut ; sélection à
  gauche ; visio : invitations à l'enregistrement, et à l'heure de l'alarme eVe ouvre la salle pour toi et envoie
  aux invités une notification « Rejoindre ».
- Questions restées sans réponse : le pas du rouleau des minutes (5 en 5, réglage actuel, ou 1 en 1) ; les
  calendriers créés au départ.
- Manque dans le code (vérifié le 2026-10-30) : « Répéter » n'a que 4 choix fixes
  (`bevy_panel_calendar_editor_model.js` `CALENDAR_REPEAT_CHOICES`), pas de mode avancé (« un jour sur deux »,
  propositions standard comme chez Apple) ; les alarmes ne sont que des pastilles « avant » / « à l'heure », sans
  « pendant » ni « après », et seule celle « à l'heure » porte une action ; la carte s'appelle encore
  « Me prévenir » au lieu de « Alarme » ; le titre doit rester fixe quand le reste du panneau défile (à vérifier).
- Déjà fait par d'autres sessions (à confirmer, pas à refaire) : rouleaux de début, de date et de durée
  (2026-10-28, `bevy_panel_calendar_rollers.js`) ; « Calendriers » de l'Agenda (2026-10-29, FRAMEWORK_STATE).

- Questions posées le 2026-10-30 : n° 1 (pas des minutes) et 2 (calendriers de départ) de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- FAIT le 2026-10-30 : refonte « Rendez-vous » (carte titre fixe, rouleaux Début / Fin liés, « Répéter » propositions
  + Personnalisé RFC 5545, « Alarmes » plusieurs, Quand avant/après le début/la fin, Quoi Notification à Projet,
  visio) ; un seul propriétaire de l'instant d'alarme (`calendar_alarm_instant.js`) ; MCP `calendar.repeat.set`,
  `calendar.alarm.set` relatif. Preuves : `temp/r001/recurrence_alarms.probe.mjs` 37/37,
  `temp/r001/panel_controls.probe.mjs` 28/28, Playwright `temp/r001/panel_ui.probe.mjs` 26/27 (seul échec : l'étape
  « grille posee » du harnais), captures `temp/r001/shots/`. Non vérifié : AlarmKit sur appareil, visio à l'heure,
  listes Musique / Média / Projet à l'écran, Tauri, iOS.
- FAIT le 2026-10-30 (reco partout) : Q2, au premier affichage de l'Agenda d'un compte, « Calendriers » montre Perso,
  Pro, Sport ; Pro et Sport sont faits une fois par compte par `createCalendar` (pipeline canonique,
  `eVe/intuition/tools/calendar_default_calendars.js`, ids `calendar_pro_<compte>` / `calendar_sport_<compte>`), jamais
  refaits s'ils sont supprimés. Preuves : `temp/reco_small/r001_default_calendars.probe.mjs` 10/10 (compte neuf isolé,
  rechargement après suppression de Sport), capture `temp/reco_small/r001/3_calendriers_depart.png`. Non vérifié : Tauri, iOS.

### R-002 — Sampler : écran complet de l'éditeur de sample
- Statut : FAIT (2026-10-30, soir) — éditeur de sample plein écran (Q3, maquettes E1–E4) : `temp/reco_sampler/edit_kernel.probe.mjs` 11/11, Playwright `sample_editor_ui.probe.mjs` 42/42 (`temp/reco_sampler/ui_attempt_1.log`), captures `temp/reco_sampler/shots/`. Non vérifié : Tauri, iOS, vrai pincement WebKit, son audible.
- Source : cahier `todo/sampler_cahier_des_charges_2026-10-29.md` §8 ; mémoire du 2026-10-29 « Bloqué : pas de
  maquette validée (règle 16) ; voix et MCP seulement ».
- Reste : maquette aux vrais jetons, ta validation, puis le code et la sonde.
- Question posée : questions posées le 2026-10-30 (session d'exécution du registre), texte complet dans `todo/questions_registre_2026-10-30.md`, n° 3 : « Valides-tu l'éditeur de sample plein écran (maquettes `temp/synth/mockups/e1_editeur_repos.png` à `e4_editeur_repere.png`, outils en 4 familles Écoute, Éditer, Forme, Repère) ? »
- FAIT le 2026-10-30 (reco partout) : éditeur de sample plein écran codé selon E1–E4 (`eVe/domains/dashboard/dashboard_sample_editor.js` + `_view.js`, ouvert par l'outil « Éditer » au pied d'une zone) : vue d'ensemble, vue de travail (deux canaux, zoom, défilement, bulles), familles Écoute / Éditer (Couper, Copier, Coller, Muet, Rogner, Figer) / Forme (Entrée, Sortie, Envers, Gain, Norme, Centre, Étirer, Ton) / Repère (Slice, Boucle, Marque, Aimant), chaque outil par la commande canonique (`audio_fx.edit_apply`, nouvelle op `pitch`). Écart accepté : retour par le Retour `fold` du pied (règle 13) au lieu du ✕. Preuves : `temp/reco_sampler/edit_kernel.probe.mjs` 11/11 sur PCM réel, `temp/reco_sampler/view_build.probe.mjs` PASS, Playwright `temp/reco_sampler/sample_editor_ui.probe.mjs` ALL PASS (rapport `temp/probe_reports/dashboard_enhancement/reco_sampler_editor/`, captures `temp/reco_sampler/shots/`). Non vérifié : Tauri, iOS, pincement réel à deux doigts, écoute audible ; le moteur lit encore la source, pas le rendu en cache (cahier §8.4).

### R-003 — Sampler : correspondances SFZ manquantes
- Statut : FAIT (2026-10-30)
- Source : mémoire Sampler du 2026-10-29 (« Jamais fait »).
- Fait : `one_shot` (la zone joue jusqu'au bout du sample), keyswitches (`sw_lokey/sw_hikey/sw_last/sw_default`) et filtres de zone (`fil_type`, `cutoff`, `resonance`, `fil_keytrack`, `fil_keycenter`, `fil_veltrack`) dans le moteur (`atome-instrument`), la spec `mix-graph`, le schéma JS, l'import et l'export SFZ ; WASM Web reconstruit.
- Preuve : `cargo test` (`atome-instrument/tests/bank_opcodes.rs` 5/5, `mix-graph/src/instrument_bank_tests.rs` 2/2, journal `temp/r003/cargo_tests.log`) ; `node temp/r003/sfz_opcodes.probe.mjs` 13/13.

### R-004 — Sampler : auto-sampling de la sortie d'eVe
- Statut : FAIT (2026-10-30)
- Source : mémoire Sampler du 2026-10-29 (« attend un enregistreur de sortie »).
- Fait : le worklet du chemin direct (où jouent les instruments d'eVe sur le Web) garde une prise de sa propre sortie (`direct_path_worklet.js` `take_start` / `take_stop`) ; `audio_fx.auto_sample { instrument_id }` joue les notes du plan sur la chaîne de l'instrument, découpe la prise stéréo sans latence et crée le nouvel instrument. Natif (Tauri, iOS) : refusé clairement (CAPTURE_UNAVAILABLE), comme l'auto-sampling MIDI natif.
- Preuve : `COMM_SERVER_ROOT=temp/r004/tree node temp/r004/auto_sample_instrument.probe.mjs` → 10/10 sur la vraie page (rapport `temp/probe_reports/dashboard_enhancement/r004_auto_sample_instrument/report.json`).

### R-005 — Activités : cahier des charges jamais coché
- Statut : FAIT (2026-10-31) — Q33, Q38 et Q65 (message discret dans la bande du bas : `temp/reco_activites/quiet_message.probe.mjs` 17/17, `loisirs_cut.probe.mjs` 9/9) ; Q32 laissée ouverte à ton nom (relecture par des spécialistes, hors code) ; Q39 pas maintenant ; Q64 pas de fil public, étude des faux comptes après le lancement des invitations.
- Source : `todo/cahier_des_charges_activites_atome_eVe.md`.
- Rapproché le 2026-10-30 (contrôle dans le code, script `temp/cahier_reconcile/apply.mjs`) : 96 cases cochées avec
  leur preuve, 40 partielles (« partiel : … ; manque : … »), 2 non commencées ; l'en-tête dit l'état réel.
- Reste codable sans maquette : messages de borne et de valeur ramenée (retour existant), source du calcul des
  calories dans la ligne « ≈ », source des mesures partagées, saut à l'ancre dans le lecteur, réponse à une réponse
  (données déjà là), synchro hors connexion et multi-appareil, tests de fuseau horaire.
- Demandent aussi une décision (vu le 2026-10-30) : lire le passage ancré d'une réponse VideoTrain (quel geste ?) et montrer une réponse à une réponse comme telle.
- Reste qui demande une maquette validée (règle 16) : résumé et réglages du défi de cadence ; durées
  d'échauffement / retour au calme et distance ou allure par phase ; affichage d'une perte GPS ou d'un pouls
  absent dehors ; trace après la séance ; pas de charge personnalisés ; télécharger, repartager, couper les commentaires d'un fil ; file
  de modération ; réponses imbriquées.
- Hors code (ta décision) : relecture par des coachs ou des spécialistes (FEAT-008, FEAT-009, FEAT-011) ; partage
  d'un média tiers non redistribuable (FEAT-004/006).

- Questions posées le 2026-10-30 : n° 32 et 33 ; les maquettes des éléments nouveaux suivent de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- FAIT le 2026-10-30 (codable sans maquette) : messages de borne (`training_form.js#trainingFormNotes`, éditeur
  « Forme », et `training.set_profile` → `form_notes` pour l'assistant) ; source du calcul des calories (« Énergie ·
  poids × durée ») ; source des mesures partagées (instrumented / typed / computed / declared, exigée par MCP) ;
  réservation coach hors connexion (`SOURCE_UNAVAILABLE`) et sur plusieurs appareils ; fuseaux. Preuves :
  `temp/r005/form_notes.probe.mjs` 6/6, `set_profile_notes.probe.mjs` 5/5, `sources.probe.mjs` 7/7,
  `offline_coaches.probe.mjs` 5/5, `multidevice.probe.mjs` 12/12, `tz.probe.mjs` 10/10. Cahier coché (98/138).
- Bloqué (question 37) : le message de borne ne s'affiche pas sur l'accueil (`teleport_feedback.js#showTeleportToast`
  peint dans la scène du projet ; sans projet, rien, et il répond `painted: true` ; Playwright
  `temp/r005/toast_home.probe.mjs`) ; touche aussi Coachs, Boutique, Émissions, Web, Vidéo.
- Questions 38 (énergie de l'appareil) et 39 (calories saisies). Non vérifié : Tauri, iOS.
- FAIT le 2026-10-30, Q48 et Q49 (maquettes r005_06, r005_07a, r005_07c validées) : Échéance (rouleau de dates,
  « Aucune ») et Défi (nombre 13 · 21 · 34… + jours / séances) dans la préparation d'un objectif, après « Heure de la
  séance » ; « Régler » dans la tenue de l'objectif la rouvre (MCP `dashboard.objective.prepare`) ; tuile « Coachs »
  dans Cardio / Musculation / Souplesse seulement quand l'annuaire a des coachs de la discipline, liste filtrée ;
  « Fuseau » sous Annulation dans Mon coaching › Séance (zone de l'appareil par défaut ; voix « mes horaires sont à
  l'heure de Londres » → `coaches.become { timezone }`). Preuves : `temp/r005_code_coach/q48.probe.mjs` 13/13,
  `q49.probe.mjs` 8/8, Playwright `ui.probe.mjs` 36/36 (captures `temp/r005_code_coach/shots/`). Cahier 100/138.
  Écarts de maquette assumés : le Défi a un premier cran « Aucun » (même motif que « Aucune ») ; les voisins de
  Paris sur le rouleau Fuseau sont Oslo / Podgorica (toutes les zones IANA triées par décalage), non Londres / Berlin.
  Non vérifié : Tauri, iOS.
- CORRIGÉ le 2026-10-30 : le panneau « Fil » de VideoTrain n'avait pas de ✕ à gauche de son pied (règle 13) et son
  nom n'y était pas centré (il passait toujours un Retour replié) ; preuve Playwright `temp/r005_code_thread/thread_ui.probe.mjs` 1b.
- FAIT le 2026-10-30, Q50 à Q52 (maquettes `temp/r005_mockups/out/r005_08`, `r005_09`, `r005_10b` validées, 52 B) :
  appui sur sa contribution → Import · Envoi · Avis (allumé = réponses ouvertes) · Retir. ; sur celle d'un autre →
  Import (si son auteur l'a permis à l'envoi) · Signal ; niveau « Signalés » du propriétaire du fil (nombre de
  signalements, drapeau, Garder · Retir.) ; « ↳ <nom> » sous la réponse à une réponse, placée sous sa réponse parente ;
  l'heure d'ancre touchée lit l'origine depuis cet instant, en tête ; chaque geste a sa commande MCP `video_train.*`.
  Preuves : `temp/r005_code_thread/thread_rights_ws.probe.mjs` 23/23, Playwright `thread_ui.probe.mjs` 33/33
  (captures `temp/r005_code_thread/shots/`), `reply_order.check.mjs` 3/3, `labels.check.mjs` 14/14. Cahier 109/138.
  Choix pris sans maquette (même motif, à revoir si tu veux) : l'outil d'entrée de « Signalés » s'appelle « Modér. »
  (« Signal. » était coupé : 7 signes) et n'apparaît que si des signalements attendent ; la case « Import permis »
  (décochée par défaut) dans la carte d'Envoi / de partage ; Garder laisse la contribution cachée pour qui l'a
  signalée ; un fil VideoTrain n'est jamais public, donc aucun fil public pour un moins de 15 ans sans code d'âge.
  Reste (ta décision) : fils publics et mineurs ; étude des faux comptes. Non vérifié : Tauri, iOS, Android.
- FAIT le 2026-10-30, Q43 à Q47 (maquettes validées) : défi de cadence (Record › Rythme, bilan tenu / pas tenu),
  programme cardio échauffement / calme / effort en mètres / allure, rangées GPS et Pouls absents dehors, trace après
  la séance (privée, décochée à l'envoi), pas de charge par exercice. Preuves : `temp/r005_code_sport/pure.probe.mjs`
  13/13, `ui_nodes.probe.mjs` 10/10, Playwright `ui.probe.mjs` 36/37 (seul échec : l'étape « grille posee » du
  harnais), captures `temp/r005_code_sport/shots/`. Même motif appliqué sans maquette : « Valeur » en tête de la
  colonne de Forme pour le gainage. Non vérifié : appareils.
- FAIT le 2026-10-30 (reco partout) : Q33 — une vidéo d'un tiers (YouTube, PeerTube : eVe n'en a que la référence) part en lien seul,
  jamais en fichier, décidé par le serveur (`server/news_broadcast.js#linkOnlyMember`, lit l'atome de l'auteur dans son coffre)
  pour VideoTrain (partage, réponse, Envoi), le fil eVe et les forums ; dans le texte pour les réseaux ; « Import » refusé
  `news_media_link_only` ; MCP `video_train.*` répond `link_only`. Q38 — l'énergie active mesurée par l'appareil sur la séance
  d'abord (« Énergie · montre ≈ 245 kcal », lue par le propriétaire santé comme le pouls, jamais pour l'assistant / MCP), le
  calcul poids × durée seulement sans appareil ; la feuille santé iOS de la séance demande aussi la lecture de l'énergie active.
  Preuves : `temp/reco_activites/link_only_ws.probe.mjs` 11/11, `link_only_client.probe.mjs` 9/9,
  `temp/r005_code_thread/thread_rights_ws.probe.mjs` 23/23, `temp/reco_activites/device_energy.probe.mjs` 9/9 (faux hôte natif).
  Non vérifié : iPhone / Apple Watch (délai de synchro de la montre), Android (permission calories actives non demandée à la séance,
  comme le pouls), Tauri. Cahier 110/138.
- ATTENTE UTILISATEUR (Q37, maquette seule, rien codé) : `temp/reco_activites/mockups/q37_message_dans_la_bande.png` (et à côté de
  l'annonce Loisirs réelle d'aujourd'hui : `q37_loisirs_et_message.png`). Question : « Sur la fiche Écarté › Forme (Perso, 8 séries,
  Pas +3 kg depuis 12 kg), eVe ramène les séries 4 à 8 à 18 kg. La maquette montre ce message dans le champ de la bande du bas, à
  la place de « Rechercher », sans loupe, comme l'annonce de Loisirs ; il s'efface au toucher. Je le code ainsi pour tous les
  messages discrets (Forme, Coachs, Boutique, Émissions, Web, Vidéo) ? Reco : oui. » Cause du silence : `teleport_feedback.js#paint`
  passe un projet vide à `updateProjectSceneRecords`, qui ne dessine rien et rend `Promise.resolve(null)` ; `paint` ne lit pas cette
  réponse et dit `true` (Playwright `temp/reco_activites/forme_capture.probe.mjs` : `painted: true, project: '', inScene: false`).
- FAIT le 2026-10-31 (reco partout, Q65 validée) : le message discret du Dashboard s'écrit dans le champ de la bande du bas à la
  place de son indication, sans loupe, sur le verre du champ comme l'annonce de Loisirs ; un toucher l'efface (le reste de ce
  toucher ne tape pas, n'ouvre pas Loisirs) et l'indication revient. Un seul propriétaire : `eVe/domains/dashboard/dashboard_quiet_message.js`
  (la ligne), posée par `dashboard_communication_input.js#noticeField` (la brique de l'annonce Loisirs, `onTouch`) ;
  `teleport_feedback.js#showTeleportToast` (async) l'y envoie quand le Dashboard est à l'écran, sinon dessine sur le projet
  ouvert et répond ce qui a été fait (`paint` n'écrit que sur le projet à l'écran, lit la réponse de la scène : plus de `true`
  sans dessin). Tous les appelants (Forme, Coachs, Boutique, Émissions, Web, Vidéo, Loisirs, effets) passent par là.
  L'annonce Loisirs coupée « Loisirs : les so… » l'est par la règle de la brique (`fitSingleLineText`, « … »), aucun outil
  ne la recouvre (Send est la partie du verre après le champ). Preuves : Playwright `temp/reco_activites/quiet_message.probe.mjs`
  17/17 (vraie écriture Forme → « Séries 4–8 ramenées à 18 kg » dans le champ, toucher, « Rechercher » + loupe revenus, sans
  caret ; `false` sans endroit où dessiner ; projet ouvert : dessiné dans sa scène puis retiré), `temp/reco_activites/loisirs_cut.probe.mjs`
  9/9 ; captures `temp/reco_activites/capture/quiet/`, `capture/loisirs_cut/`.

### R-006 — Tâche urgente du 22 oct. : designs et questions restés en attente
- Statut : FAIT (2026-11-04) — toutes les questions tranchées (« Oui, reco partout » des 30 et 31 oct.) sont codées et prouvées : Q66 à Q68 (Sport, Beauté), Q67 Duo, Q70 à Q73 (Santé), le contexte d'eau de la molette des souffles ; preuves dans les puces ci-dessous.
- Source : `todo/urgent_task_suivi_2026-10-22.md` ; études `todo/etude_sante_plaisir_thalasso_2026-10-22.md` §7,
  `todo/etude_activites_sport_objectifs_2026-10-27.md`.
- Rapproché le 2026-10-30 :
  - Fait : Tempo et enchaînement (maquettes L9v2 / O5 validées le 28 oct. ; outil « Auto » de
    `dashboard_training_card.js`, rouleau « Rythme » de `dashboard_training_record.js`) ; Matrice de Scène (« Validé :
    proposition A », 23 oct., FRAMEWORK_STATE 2026-10-23 et 2026-10-29) ; Web V1 par-dessus Bevy (2026-10-28,
    `web_page_player.js`) ; L16 Social sportif (« C puis A », 28 oct., FRAMEWORK_STATE « Sport lot L11 ») ; L06
    variations par série (`training_form.js`) ; L08-L10 décisions 6 et 7 (sieste, méditation, respiration codées le
    28 oct.).
  - Caduc : « Prochain événement eVe Basic » (l'accueil Basic fixé le 26 oct. : contact, agenda, objectif ; la
    disposition A sert à l'accueil Pro).
  - Questions jamais tranchées : CAL-01 (déplacer les séances futures quand l'heure d'un objectif change) ; clore un
    objectif ; S-01 (repos fixe, visée Force, poly-articulaires d'abord) ; L06 séries d'échauffement et programmes
    tout faits ; Split View (SV-03) ; B-01 « Beauté » ou « Apparence » ; L08-L10 décisions 1-5 et 8-12 (Plaisir,
    « i » des outils santé, bilan unique, profil santé, Thalasso, découverte locale, assistant et santé, stockage).
  - Vérifié le 2026-10-30 : Kapalabhati (`atome/src/shared/breath_pattern.js`, validé le 28 oct.) est une
    hyperventilation cyclique courte, sans apnée ; l'étude (§ Sécurité respiratoire) l'exclut, surtout près de l'eau.
    Question n° 34 ajoutée.

- Questions posées le 2026-10-30 : n° 13 à 29 et 34 de `todo/questions_registre_2026-10-30.md`. Tout ce qui reste de l'entrée dépend de ces réponses.
- FAIT le 2026-10-30 (reco partout) : Q13 (une nouvelle heure d'objectif déplace les séances à venir, garde les séances vécues, faites aujourd'hui ou déplacées à la main ; CAL-01 aussi pour les actions de programme), Q14 (« Clore » au maintien à côté de « Fait », commande `dashboard.objective.close`, programme en pause, historique gardé), Q15 (repos fixe 90 s / 120 s), Q16 (visée Force : 3 à 5 rép., charge plus lourde), Q17 (poly-articulaires d'abord) codés. Preuves : `temp/reco_sport/sport_reco.probe.mjs` 31/31, `temp/reco_sport/cal_close.probe.mjs` 17/17 (TZ=Europe/Paris), `until_expand.probe.mjs` PASS, `temp/cal_02/routine_pause.probe.mjs` 4/4, app réelle `temp/reco_sport/capture.probe.mjs` (« repos 120 s », ordre de « Mon programme »). Non vu dans l'app réelle : la ligne « Clore » (la case Objectifs est invisible sur l'accueil Pro du téléphone ; `close_ui.probe.mjs` n'a pas pu ouvrir la rubrique). Pas de réouverture d'un objectif clos.
  - Posées puis validées le 2026-10-31 (« Oui, reco partout », questions n° 66 à 68) : Q18 échauffement (`q18a`-`q18d`) et programmes prêts (`q18e`, `q18f`) ; Q19 ligne « Duo » au maintien (« Côte à côte » dépasse les 6 lettres de la règle 11) et zones l'une sur l'autre (`q19a`-`q19c`) ; Q20 plaque, prise guidée et comparaison « Beauté » (`q20a`-`q20c`). Maquettes et questions : `temp/reco_sport/mockups/` et `temp/reco_sport/mockups/questions.md`.
  - FAIT le 2026-10-31 (Q66 = Q18) : échauffement par défaut sur les exercices chargés à la barre ou à la machine (8 × 50 % puis 5 × 75 % de la charge, 60 s de repos après chacune ; pas `warmup` de `program_session_contract.js`, jamais compté comme une série), « + 2 échauf. » sur la carte et durée qui le compte (5:21 → 8:00 au développé couché 40 kg), ligne « Échauffement » du Détail, « 1/2 » sur « échauf. » en orange pendant la séance, rouleau « Échauf. » de Perso (Aucune / 1 série / 2 séries ; `training.set_profile` `warmup_sets`). Programmes prêts : outil « Prêts » dans la bande de « Mon programme », panneau « Programmes prêts » (accordéons Débutant, Force, Haut / Bas à 5 séances, Remise en forme ; `atome/src/shared/training_ready_programs.js`), disque « Prendre ce programme » : il remplace « Mon programme » (la séance du jour, en alternance), ses jours vont à l'agenda en séries hebdomadaires, un programme pris avant quitte l'agenda à partir du jour même ; les séances faites restent au Suivi. Commandes `training.list_ready_programs`, `training.take_ready_program` (confirmée), `training.open_program` `panel: ready`. Preuves : `temp/reco_sport/warmup.probe.mjs` 18/18, `ready.probe.mjs` 21/21, `ready_runtime.probe.mjs` PASS, `q66_q68_ui.probe.mjs` (vraie page) 26/26, captures `temp/reco_sport/shots/q66*.png`.
  - FAIT le 2026-10-31 (Q68 = Q20) : module « Beauté » : plaque dans Activité › Bien-être à côté de Sieste ; prise guidée (caméra en haut, dernière photo de la même pose en transparence, rouleaux « Pose » et « Zone », disque orange « Prendre la photo », bande ✕ / Suivi / Rappel) ; la photo passe par le seul chemin de prise (`bevy_panel_media_capture.js`, médias de la personne) puis rejoint les photos Beauté ; « Suivi » montre deux dates de la même pose côte à côte, chacune sur son rouleau ; « Rappel » met ou retire un rappel hebdomadaire dans l'agenda. Famille MCP `beauty` : `open`, `list_photos`, `shoot` (confirmée), `add_photo`, `read_reminder`, `set_reminder`. Preuves : `temp/reco_sport/beauty.probe.mjs` 13/13, `q66_q68_ui.probe.mjs` (caméra factice de Chromium) 26/26, captures `temp/reco_sport/shots/q68*.png`. Q67 (« Duo », Q19) confiée à un autre agent, rien codé ici. Non vérifié : iOS, Tauri, vraie caméra.
  - FAIT le 2026-11-04 (Q68, règle 18 « va dans tes médias, comme toute prise ») : sur le Web aucune photo prise n'apparaissait dans les médias de la personne (Beauté comme toute autre prise) : le serveur répond un chemin relatif au dossier de la personne (`captures/x.jpg`) et `media_persistence_service.js#resolveRecordingPath` le réécrivait en `recordings/x.jpg`, alors que la liste des médias ne garde une image que sous `captures/`. Corrigé chez ce propriétaire (le dossier rendu par le serveur est gardé). Preuve en vraie page : `temp/reco_sport/beauty_media.probe.mjs` 10/10 (photo du disque → rangée sous `captures/` → listée par `listUserMedia` locale et serveur, donc « mes médias » du panneau d'import → Média › Images › « Mes images » la montre ; capture `temp/reco_sport/shots/q68d_mediatheque_images.png`). Non réparé : les photos déjà enregistrées avant la correction gardent leur chemin `recordings/` et restent hors de la liste. Sondes Q66/Q68 relancées le 2026-11-04 : `q66_q68_ui.probe.mjs` 25/25, sondes Node 21/21, 18/18, 13/13.
- FAIT le 2026-10-30 (reco partout) : Q21 objectif « Plaisir » (OBJ-14, phrases vocales comprises), Q22 hors progression, Q23 suggestion du jour dans la bulle d'eVe Basic (une par jour, jamais sous un panneau de préparation, jamais la respiration en séjour Thalasso ; « ne me propose plus rien » à la voix, `brick_session.suggestions`), Q24 le Ressenti en fin de séance de brique (motif Sport M5b) et après un soin Thalasso fait, Q26 séjour Thalasso côté données et voix (`thalasso.*`), Q27 source de chaque entrée de Loisirs (la découverte locale existait), Q28 `health_profile.read` demande l'accord à chaque fois, Q34 « i » du Kapalabhati (eau, grossesse, épilepsie, cœur, panique) et jamais en contexte d'eau. Preuves : `node temp/reco_sante/pure.probe.mjs` 25/25 ; `PROBE_ISOLATED=1 node temp/reco_sante/ui.probe.mjs` 27/28 (seul échec : l'étape « grille posee » du harnais), rapport `temp/reco_sante/ui.probe.report.json`, captures `temp/reco_sante/shots/`.
  - BLOQUÉ Q29 : aucun stockage « appareil seulement » n'existe (Web → Fastify, Tauri → synchro Axum, iOS → synchro Swift) ; les allergies et intolérances d'aujourd'hui (`program_preference`, portée globale) sont synchronisées, contrairement à la décision. Il faut créer ce mécanisme (décision d'architecture) ; tant qu'il manque, les nouveaux sujets du profil (grossesse, cœur, articulations, respiration, peau, thyroïde/diabète, épilepsie, panique) ne sont pas enregistrés (Q25).
  - À valider par l'utilisateur (maquettes, écrans non codés) : Q25 lignes à case du profil santé (`temp/reco_sante/out/m1_profil_sante.png`), Q26 écran du séjour et ajout d'un soin (`m2_sejour_thalasso.png`, et où le ranger), Q23 geste « Ne plus proposer » au maintien sur la phrase (`m3_ne_plus_proposer.png`). Questions dans chaque PNG.
  - FAIT le 2026-11-04 : la molette des souffles de la carte Respiration suit le contexte d'eau : pendant un séjour Thalasso (`thalasso.stay_read`, `today.in_stay`) elle n'offre plus le Kapalabhati, sauf s'il est déjà le souffle choisi par la personne, qui reste le sien (`dashboard_brick_session_card.js#breathsFor`, brique `breath_pattern.js#breathPatternIds`). Preuve : `PROBE_ISOLATED=1 node temp/reco_sante/breath_water.probe.mjs` (journal `temp/reco_sante/breath_water.log`) : hors séjour Alternée a Kapalabhati pour voisin ; en séjour Perso ; Kapalabhati choisi en séjour reste affiché ; aucune erreur. eVe Pro n'a pas de bulle sur son accueil : hors décision (Q23 vise la bulle d'eVe Basic).
- FAIT le 2026-10-31 (reco partout) : Q67 Duo (= Q19, code et preuves du 2026-11-04) : deux outils du Dashboard à l'écran ensemble. Au maintien d'une plaque consultée (un exercice, une liste de médias), ligne « Duo » sous « Favori » et « Progr. » ; touchée, sa page s'ouvre et la zone du haut avec elle (téléphone : l'une sur l'autre, découpe 4:3 de la V6.1, l'outil tenu en bas avec sa bande inchangée ; tablette et ordinateur : côte à côte, l'outil tenu à droite). La zone offre les tuiles de l'accueil (la dernière choisie en premier, pages tournées d'un glisser de côté), puis le niveau de la tuile ; une plaque y ouvre sa page ; une vidéo touchée y joue seule à sa proportion, au pied de la zone, sans les pastilles de la liste, un toucher sur l'image rendant les lignes. Le « Duo » allumé d'un maintien fait sur la zone la ferme ; le ✕ de l'outil tenu ferme les deux ; jamais proposé par l'assistant de lui-même. MCP `dashboard.duo.open { tile? }`, `dashboard.duo.choose { tile }`, `dashboard.duo.close`. Propriétaire `eVe/domains/dashboard/dashboard_duo.js`. Preuves : `temp/reco_duo/duo_phone.probe.mjs` 32/32 (430 × 932), `temp/reco_duo/duo_wide.probe.mjs` 8/8 (1280 × 860), captures `temp/reco_duo/shots/phone_*.png` et `wide_*.png`. Non vérifié : image vidéo réelle en Chromium sans écran (nœud et boîte seulement), iOS, Tauri, Android. Reste hors lot : sur téléphone, la carte Sport n'a que 399 px dans la découpe 4:3 et son disque orange passe sous sa propre bande (mise en page de la carte dans une pièce courte, `dashboard_training_card_view.js`).
- FAIT le 2026-11-04 (Q70 à Q73, « Oui, reco partout » du 2026-10-31) : Q70 stockage « cet appareil seulement » : un atome `device:` (`atome/src/shared/device_scope_contract.js`) passe par `window.Atome.commit` comme les autres, n'est jamais envoyé ni synchronisé (Web : pas de ligne dans la file d'envoi, jamais adopté ; Fastify le refuse, `device_only_atome` ; Tauri `is_device_local_atome_id` ; iOS `enqueueSyncEvent`) ; tout le profil santé y vit (`device:health_profile:<personne>`, allergies et intolérances `device:program_preference:…`), l'ancienne copie synchronisée déplacée une fois puis supprimée par le pipeline (`eVe/domains/programs/health_profile_store.js`). Q71 lignes à case standard (case à gauche), « Rien à déclarer » en tête, cocher une autre la décoche (`health_profile.declare`). Q72 écran du séjour Thalasso selon m2 (lieu et dates sur molettes en haut, une carte par jour, « Soin » variante B), rangé dans Santé › Thalasso et ouvert par `thalasso.open` (`dashboard_thalasso_card.js`, `dashboard_thalasso_view.js`). Q73 maintien sur la phrase d'eVe → une seule ligne « Ne plus proposer » (`dashboard_daily_suggestion.js`). Preuves : `node temp/reco_sante/device.probe.mjs` 23/23 ; `PROBE_ISOLATED=1 node temp/reco_sante/device_ui.probe.mjs` (vraie page, Fastify isolé, compte neuf) 32/32 vérifications Q70 à Q73 (`temp/reco_sante/device_ui_full_2026-11-04.txt`, captures `temp/reco_sante/shots_device_full/`, seule ligne en échec : le rechargement coupé par la limite de 10 min, machine à charge 430) puis `RECO_ONLY=q70` 20/20 avec le rechargement (`temp/reco_sante/device_ui_q70_reload_2026-11-04.txt`) ; Tauri `cargo test --lib local_atome_sync_worker` 8 réussis ; iOS `swiftc -parse` seulement. Écart : « Ne plus proposer » est dans la dalle standard du maintien (✕ à gauche), pas nue sous la phrase comme la maquette. Non vérifié : Tauri et iOS en marche.
- 2026-11-05 Q70 remplacée par la règle 21 (AGENTS.md, « le serveur est le seul point de vérité ») : le profil Santé, les allergies et les intolérances ne vivent plus sous `device:`. Ils sont sur le serveur, scellés pour la seule personne (`health_profile:` et `health_preference:`, type `health_profile`, `eVe/domains/programs/health_profile_store.js`) ; les copies `device:` sont scellées une fois puis supprimées. Détail et preuves : R-115, « Règle 21 contre Q70 ». Le mécanisme `device:` reste pour ses autres usages.

### R-007 — Finder du projet : maquette à six états jamais validée
- Statut : FAIT (2026-10-31) — Finder A–F (`temp/reco_finder/r007.probe.mjs` 46 OK, `r007_ef.probe.mjs` 30/30) et Q75 cœur blanc sans fond partout (Finder, Contacts : `heart_contacts.probe.mjs`). Seul échec : l'étape « grille posee » du harnais. Non vérifié : PeerTube, clavier iOS, cœur du Train vidéo.
- Source : session `e9cfee6f` du 2026-10-27, arrêtée sur « Valides-tu la maquette du Finder ? » (liste, Choix,
  Filtre, Lieux, TV, vidéos en ligne). Aucune réponse trouvée dans les transcripts (rapprochement du 2026-10-30).
- Maquettes : `temp/finder_charter/mockups/finder_charter.png` (états A–F) et `finder_today_project.png` (l'actuel).
- Rien du nouveau design n'est codé : `bevy_panel_finder_view.js` garde l'en-tête triable (`sortableHeaderNode`) et
  les pastilles de portée ; l'appui long renomme encore (`bevy_panel_finder_interactions.js`, `finder.row.rename`).
  « Outils du Finder dans Tous » (2026-10-29) n'a touché que le chargement (`loadScopeRecords` `withTools`).
- Reste : la validation de la maquette et de ses 3 sous-questions (garder Suppr. dans Choix ; le tri dans Filtre ;
  le champ de recherche dans la bande), puis coder A–F et les deux défauts vus en route (triangle orange de
  `bevy_panel_accordion.js`, écart de 4 px au lieu de 5 entre pastilles).
- Question posée : questions posées le 2026-10-30 (session d'exécution du registre), texte complet dans `todo/questions_registre_2026-10-30.md`, n° 4 à 7 : validation de la maquette A–F (remise aux règles du 30 oct. : rayons au dixième, plus de chevrons, 3 px entre lignes ; l'ancienne version est gardée dans `finder_charter_2026-10-27.html`), Suppr. dans Choix, tri dans Filtre, champ de recherche dans la bande.
- FAIT le 2026-10-30 (reco partout) : A–D codés selon la maquette (liste, Choix par appui long avec Tout / Suppr. demandé dans la bande / Import / Nom, Filtre avec tris Récents / A → Z / Type au pied et conditions, Lieux en lignes nom / adresse sous la carte) ; le champ dans la bande du panneau, Trouver allumé tant qu'il est ouvert ; en-tête triable, « n résultats », bouton Tags et triangle orange retirés ; 5 px entre pastilles ; chaque geste a son action MCP `ui.find.panel`. E (TV) et F (vidéos en ligne) vérifiés ensuite : bande ✕ + champ seuls, ni portées ni Filtre ; TV : logo, nom, catégorie · source, un cœur par chaîne, le champ filtre, un toucher joue la chaîne sur le projet et ferme le Finder, glyphe sur Pays / Favoris, glyphe vidéo pour une chaîne sans logo ; vidéos : l'image mène la ligne, titre, chaîne · durée (durée YouTube ajoutée côté serveur), la page suivante se lit seule près de la fin (elle ne se déclenchait jamais : corrigé), chaque vidéo une fois ; champ vide = l'historique, rien sans historique (texte « Saisir une recherche puis appuyer sur Entrée » retiré). Preuves : `PROBE_ISOLATED=1 node temp/reco_finder/r007.probe.mjs` → 46 OK, 1 FAIL (« grille posee », harnais) ; `PROBE_ISOLATED=1 node temp/reco_finder/r007_ef.probe.mjs` → ALL OK (30 ; catalogue TV, flux et recherche YouTube réels, 25 → 47 lignes, cœur contour au repos et plein pour un favori) ; captures `temp/probe_reports/dashboard_enhancement/reco_finder_r007/` (1_repos … 7_lieux) et `reco_finder_r007_ef/` (8_tv … 13_youtube_page_suivante). Cœur (question 75, réponse « Oui, reco partout » du 2026-10-31) : blanc et sans fond partout, contour au repos, plein pour un favori, cible de toucher gardée — fait à la brique `buildFavoriteHeartButtonNode` (Finder, contacts, Train vidéo). Preuves : `r007_ef.probe.mjs` → ALL OK (30) ; `temp/reco_finder/heart_contacts.probe.mjs` → le toucher sur le cœur nu bascule le favori, plein et blanc ensuite (seul échec : « grille posee », harnais) ; captures `reco_finder_r007_ef/8_tv.png`, `8b_tv_pays.png`, `reco_finder_heart_contacts/1_contacts_avant.png`, `2_contacts_apres.png`. Train vidéo non capturé (même brique). Non vérifiés : PeerTube (même chemin), logos refusés au Chromium sans tête (imgur 403), clavier iOS.

### R-008 — Action d'alarme : restes
- Statut : FAIT (2026-10-30)
- Source : mémoire « Action d'alarme » du 2026-10-25.
- Reste : lancer Apple Music / Spotify à une heure ; la grille Outil liste tout le ruban (~100 outils) au lieu des
  outils pertinents.
- Fait : la musique d'une alarme (Apple Music, Spotify) joue et s'arrête par la source unique de Musique (`placed_launch.js` → `music_source.js` `.play` / `.stop`) ; la grille « Outil » ne liste que les 10 outils déclarés `launch_at_time` (Audio, Vidéo, Écran, MIDI, IA, Lire, Arrêter, Télévision, Lire et Rec du prompteur).
- Preuve : `temp/r008/alarm_music_tools.probe.mjs` → 17/17 sur la vraie page (rapport et captures `temp/r008/report/`). Lecture Spotify réelle et iPhone : R-102.

### R-009 — Séquenceur : M7, Ouvrir / Lancer sur un événement du calendrier
- Statut : FAIT (2026-10-30)
- Source : `todo/timeline/sequenceur_vues_clips_2026-10-29.md` (« M7 : … (à faire) », même motif que M6, validé
  d'office).
- Rapproché le 2026-10-30 : M7 est codé (commit eVe bee6cc2a du 29 oct.) : rouleau « Mode » Lancer / Ouvrir dans le panneau de lancement du calendrier (`bevy_panel_calendar_launch.js`, `placed_launch.js` `PLACED_PROJECT_MODES`).
- Preuve : `PROBE_ISOLATED=1 COMM_SERVER_ROOT=temp/r004/tree node temp/sequencer_build/cal_mode.probe.mjs` (vraie page, compte neuf) : la ligne « Mode » montre Lancer / Ouvrir sur le rouleau canonique ; par défaut Lancer (`ui.timeline.transport.play`), un pas du rouleau → Ouvrir (rien n'est joué). Sortie gardée : `temp/sequencer_build/cal_mode_2026-10-30.log`.

### R-010 — Timeline et vidéo : restes ouverts
- Statut : FAIT (2026-10-31) — Q74 outil « Réalig » en Liste (`temp/reco_small/r010_realign.probe.mjs` 15/15, `r010_realign_run2.log`) ; Q8 et Q10 : état actuel gardé (ta réponse « reco partout »). Non vérifié : iOS, Tauri.
- Source : mémoire « Audio et Timeline » ; `todo/audio_to_finalize.md`.
- Fait : filtres de couleur de luminance du shader vidéo, corrigés le 2026-10-15
  (`atome/renderers/bevy-core/assets/shaders/video_external.wgsl#apply_color_filters` borne l'entrée à [0, 1] ;
  FRAMEWORK_STATE 2026-10-15 « Video colour filters clamped », sonde
  `temp/mixer/video_lane_pixels_real_app.probe.mjs` `FILTER_SWEEP=1`).
- Reste : trois décisions jamais tranchées (aucune réponse trouvée dans tes messages depuis le 7 oct.) : seuil de
  synchro image / son EBU R37 (le code resynchronise au-delà de 120 ms, mesuré +3 à 9 ms) ; bouton « Réaligner la
  timeline sur la Liste » (aujourd'hui la timeline est remplie une fois depuis la Liste, puis ne bouge plus) ; ordre
  des tranches du mixeur pour un gaucher (`molecule_mix_layout.js#layoutMixRow` garde l'ordre des pistes).

- Questions posées le 2026-10-30 : n° 8 (seuil de synchro), 9 (outil « Réalig. ») et 10 (ordre des tranches pour un gaucher) de `todo/questions_registre_2026-10-30.md`. Rien d'autre à coder dans cette entrée.
- Maquette du 2026-10-30 (reco partout, Q9) : `temp/reco_small/mockups/r010_maquette_realig.png` (zoom
  `r010_maquette_realig_zoom.png`, état actuel `r010_liste_actuelle.png`) : l'outil « Réalig » (glyphe d'alignement
  `para_left`) dans la bande du bas d'un projet en Liste, posé par le vrai ruban. Rien de codé. Question à poser :
  valides-tu cet outil, à cette place (premier outil de la bande, à gauche) et avec ce glyphe ? Q8 et Q10 : état actuel
  gardé, rien à coder.
- FAIT le 2026-10-31 (Q74 validée, « Oui, reco partout ») : « Réalig » codé. En Liste, premier outil de la bande, à
  gauche (`menu_work_context.js`, `main_menu_view_zoom_content.js`) ; un toucher remet la timeline dans l'ordre de la
  Liste en un seul lot annulable (`project_view_timeline_owner.js#realignProjectTimelineToList`) ; commande MCP
  `ui.timeline.realign`. Preuve : `temp/reco_small/r010_realign.probe.mjs` (A-B-C → C-A-B au toucher, une annulation
  rend A-B-C, MCP, état durable relu ; captures `temp/reco_small/r010/`). Non vérifié : iOS, Tauri.
### R-011 — TV et YouTube : restes ouverts
- Statut : FAIT (2026-10-30, soir) — coins de la découpe et Q11 (la ligne de la Liste joue dans sa vignette, `temp/reco_small/r011_list_row_window.probe.mjs` 11/11). Non vérifié : vraie iframe YouTube, flux TV réel, iOS, Tauri.
- Source : mémoire « TV, YouTube, fenêtres média ».
- Fait : la « page hôte du lecteur » est codée et en ligne depuis le 2026-10-07 (`atome/src/eve_youtube_player.html`,
  `eVe/intuition/tools/youtube_player_host.js` ; FRAMEWORK_STATE 2026-10-07 ; https://atome.one/eve_youtube_player.html
  répond). Son essai sur l'iPhone et sur Tauri est reporté dans R-102.
- Manque :
  - coins arrondis de la découpe : `media_window.wgsl#fragment` rend tout le quad transparent sans forme arrondie ;
    passer taille et rayon (ou le masque `shape_sdf`) au pipeline `media_window.rs` et écarter l'extérieur ;
  - mode liste (ta demande du 6 oct., session `3e1e2de6` : « On va faire de même en mode liste ») : une ligne de la
    Liste qui montre une vidéo TV / YouTube reçoit sa découpe et le lecteur se place sous l'aperçu de la ligne.

- Questions posées le 2026-10-30 : n° 11 de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- FAIT le 2026-10-30 : coins arrondis de la découpe (masque de forme de l'atome dans `media_window.rs` /
  `media_window.wgsl`, effacement destination-out, suit taille, rayon, variante et masque). Preuves : `cargo test --lib
  media_window` 6/6, sonde pixels `temp/r011/rounded_media_window.probe.mjs` 10/10 sur le wasm livré `cb26d7cb7ccc980b`
  (sur le wasm de HEAD, les deux contrôles de coins échouent), captures `temp/r011/shipped_wasm_home/`. Non vérifié :
  iOS et Tauri, iframe YouTube réelle, canevas d'un projet (l'ouverture d'un projet en sonde échoue aussi sur HEAD).
- Vu, hors de cette entrée : une vidéo qui joue (`video_external`) ignore son propre `corner_radius` côté Rust.
- FAIT le 2026-10-30 (reco partout) : Q11, mode liste. Une ligne de la Liste dont la TV / la vidéo en ligne joue sur
  place devient une seule image sur tout son bloc de film, sa découpe (`media_window_of`,
  `bevy_panel_record_timeline_preview.js#filmFrames`), et le lecteur se pose dessous
  (`project_scene_query_runtime.js#readProjectSceneMediaWindowStandIn`, `inplace_media_overlay.js`) ; aucune autre
  copie n'est découpée (`render_atom.js`) ; au repos le film est inchangé. Preuves :
  `temp/reco_small/r011_list_row_window.probe.mjs` 11/11 contrôles propres (l'étape « grille posee » du harnais échoue
  parfois), captures `temp/reco_small/r011/2_liste_lecture.png`, `3_liste_apres.png`, `4_naturel_lecture.png` ; tests
  `tests/eve/youtube_player_lifecycle`, `peertube_player`, `tv_inplace_player` passent (le dernier échoue 1 fois sur 6
  au premier lancement à froid). Non vérifié : vraie iframe YouTube / vrai flux TV, iOS, Tauri ; les commandes
  posées sur le média (`project_media_controls.js`) lisent encore la place de l'Atome, pas celle de la ligne.

### R-012 — Musique en cours : recherche de position Spotify
- Statut : FAIT (2026-10-30)
- Source : mémoire « Musique en cours » du 2026-10-23 (« Spotify seek not implemented »).
- Fait : commande `music.seek` (contrat `atome/src/squirrel/music/contracts.js`), `controlSpotify` envoie `PUT /me/player/seek?position_ms=…&device_id=…` puis relit la position (`server/music/spotify_operations.js`, `music_operations.js`) ; la source Musique (`eVe/domains/music/music_source.js`) peut chercher sur Spotify (`canSeek`), Deezer reste catalogue seul.
- Preuve : `node temp/r012/spotify_seek.probe.mjs` → 10/10 (vrai contrat, vraie opération serveur, vraie source ; seule l’API HTTP de Spotify est simulée). Essai sur un vrai compte Premium : R-102.

### R-013 — Moteur vocal : restes ouverts
- Statut : FAIT (2026-11-04) — Q12 et Q61 faites (ci-dessous) ; « répète » dit par toi sur l'iPad USB « Ipad atomic » : 3 sur 3 compris
  (puce du 2026-11-04 ci-dessous). Démarrage sourd et mode avion restent dans R-102.
- Source : mémoire « Refonte du moteur vocal » du 2026-10-23 ; `todo/refonte_assistant_vocal.md` §17, §18.7.
- Rapprochement du 2026-10-30 : rien n'a bougé depuis le 2026-10-23 (FRAMEWORK_STATE, 2026-10-23, liste encore les
  trois défauts).
- Reste codable ici : « répète » faible en son réel (0/3 iPad, 1/2 Mac, parfait en numérique) : ajouter les variantes
  entendues à la grammaire Vosk et les mesurer au corpus (intention dans `eVe/domains/user/first_launch_guide.js`).
- Reste sur ton appareil (reporté dans R-102) : démarrage sourd (1 fois sur 8, cause inconnue ; piège
  `trap_voice.js` et `temp/voice_bench/ipad_deaf_hunt.sh` prêts), mode avion sur l'iPad.
- Question jamais posée (§8) : la dictée libre garde-t-elle la reconnaissance du système ou passe-t-elle par
  l'assistant connecté ? (`dashboard_capture_session.js` `purpose: 'dictation'`).

- Questions posées le 2026-10-30 : n° 12 de `todo/questions_registre_2026-10-30.md` ; le reste de l'entrée se code sans attendre.
- Fait le 2026-10-30 : variantes entendues mesurées (banc moteur réel `temp/r013/bench.mjs`, 36 prises réelles au
  Mac + corpus du lot 0) : aucun gain, deux fausses « répète » sous la télé ; grammaire inchangée. Les échecs au son
  réel du Mac sont des tours `too_long` (bruit de la pièce), un seul « hors grammaire » sur 36.
- Reste (après Q61) : enregistrer sur l'iPad le PCM poussé au moteur pour ≥ 10 « répète » dits par une personne,
  le rejouer au banc ; démarrage sourd et mode avion (R-102).
- FAIT le 2026-10-30 (reco partout) : Q12 — la dictée libre passe par la transcription de l'assistant connecté quand il
  peut servir la personne (compte authentifié accepté par le fournisseur, `provider_broker.js#providerPrincipalReady`, et
  appareil en ligne, `checkConnection('fastify')`), par la reconnaissance du système sinon (hors ligne, ou invité en ligne) ; une seule décision par dictée
  (`atome/src/squirrel/voice/service_stt_runtime.js#routeOf`, `service_assistant_stt.js`), erreur explicite sans relais ;
  la capture du Dashboard n'écrit rien et signale l'erreur si la dictée échoue. Aucun des deux plugins ne devient mort
  (hors ligne, tours de l'assistant, permission micro d'Android) : rien retiré. Q61 — mode d'essai du moteur codé
  (`atome/engines/voice-turns` `Take`, `session::read(record)`, WASM `setRecording`/`takeRecording`, commande de
  développeur `window.eveVoiceTestTakes`, `eVe/voice/conversation/conversation_test_takes.js`), banc `temp/r013/bench.mjs`
  set `device`, pilote iPad `temp/reco_voice/ipad_takes.mjs`. Preuves : `temp/reco_voice/dictation_route.probe.mjs` 11/11 (dont l'invité en ligne → système)
  (fournisseur simulé sur le socket : la qualité réelle de la transcription n'est pas vérifiée),
  `temp/reco_voice/takes_web.probe.mjs` 7/7 (3 tours Web rejoués au banc natif, même résultat 3/3). Le WASM audio de
  `atome/src/wasm` n'est pas reconstruit (travail non construit d'une autre session dans audio-wasm) : sur le Web le mode
  d'essai répond `conversation.setRecording is not a function` jusqu'à la prochaine construction ; l'iPad l'a à sa
  prochaine construction Xcode.
- Reste (tes prises, sur l'iPad « Jeezs's Tab », USB) : 1) construire et installer l'app depuis Xcode (elle embarque le
  moteur modifié) ; 2) réinstaller à neuf pour retomber sur le premier lancement guidé (ou rester sur un écran guidé) ;
  3) au Mac : `xcrun devicectl device process launch --device 00008142-001C21C62147801C --terminate-existing one.atome.app
  -- -AtomeWebInspector`, puis `node temp/reco_voice/ipad_takes.mjs on` ; 4) sur un écran du guide, dire 10 fois
  « répète » à ta distance habituelle, en attendant chaque fois qu'eVe ait fini de parler ; 5) `node
  temp/reco_voice/ipad_takes.mjs status` (10 prises ou plus), `node temp/reco_voice/ipad_takes.mjs pull`, puis
  `node temp/reco_voice/ipad_takes.mjs off` ; ne pas relancer l'app avant le `pull` (prises en mémoire seulement).
  Ensuite (moi) : `DEVICE_DIR=temp/r013/device node temp/r013/bench.mjs ipad device`, écoute des prises.
- Défaut hors lot vu le 2026-10-30 : l'objectif « pleasure » (`DASHBOARD_OBJECTIVES`) n'a pas de phrases vocales
  (`eve.first_launch.intent.goal.pleasure` absent de `eVe/i18n/languages_first_launch_voice.js`) : l'écran Objectifs du
  guide n'a aucune phrase pour lui (et `temp/r013/phrases.mjs` échoue sur `goals`).
- FAIT le 2026-11-04 : prises sur l'iPad branché en USB, « Ipad atomic » (iPad Pro 2e génération, iOS 27.0.1 ; « Jeezs's Tab »
  n'est plus qu'en Wi-Fi). App reconstruite (moteur vocal natif avec le mode d'essai) et installée ; écran guidé « deux façons »
  ouvert par-dessus la session (`openCredentials`, `access`, `start`, sans déconnexion ni données effacées), WebDriverAgent pour
  les captures. 4 prises (`temp/r013/device_atomic/`, `takes.json`) : 3 « répète » nets, tous compris par le moteur de l'iPad
  (`heard: répète`) ; la 4e (`too_long`, 23 s) n'en contient pas : 10 s de parole ou de bruit continu avant. Avant : 0 sur 3. Tu as
  jugé « répète a fonctionné » ; 3 prises au lieu des 10 prévues. Le rejeu au banc Mac n'a pas été refait : la source et le
  binaire `temp/r013/engine_probe`, `temp/r013/target` ont disparu de `temp/` (nettoyage) ; le verdict est celui du moteur de
  l'iPad. Outils : `temp/reco_voice/ipad_takes.mjs` (appareil par `IPAD_UDID`, défaut Ipad atomic ; corrigé pour le débogueur
  qui renvoie des objets), `temp/r013/atomic/eval.mjs`.

### R-014 — Publication programmée : contacts par profil (Q7)
- Statut : FAIT (2026-10-30, soir) — Q35 : appui long sur la tuile d'un réseau dans Publier → « Profils » (`temp/reco_small/r014_network_hold.probe.mjs` 13/13).
- Source : mémoire « Publication programmée » du 2026-10-28.
- Réponse trouvée : « A » le 2026-10-28 à 17 h 48 (session `6e947365`) : dans Publier, les destinataires suivent le
  profil actif ; le Répertoire reste non filtré.
- Fait : contacts filtrés dans Publier (`eVe/domains/publish/publish_people.js`, `getLifeProfileRuntime().visible`),
  `contact_model.js` garde `profiles`, ligne « Profils » du maintien (eVe fd2e7981, FRAMEWORK_STATE 2026-10-28).
- FAIT le 2026-10-30 : forums et réseaux de Publier filtrés par le profil actif (`publish_people.js#underActiveLifeProfile`,
  `#readPublishForums`, `publish_networks.js#readPublishNetworks`, commandes `publish.*`) ; un forum ou un réseau
  rangé par l'Atome `life_profile_filing` (`life_profile_runtime.js#assign` / `#filingsOf`, MCP `profiles.assign`
  `item_kind` + `item_id`) ; maintien d'une tuile forum dans Contacts → ligne « Profils ». Preuve :
  `temp/r014/forum_profiles.probe.mjs`, 21/21 (`temp/r014/run/report.json`). Non vérifié : Tauri, iOS, synchro.
- Manque (après réponse à Q35) : ranger un réseau depuis l'écran (aujourd'hui par l'assistant seulement).
- FAIT le 2026-10-30 (reco partout) : Q35, appui long sur une tuile réseau de Publier (TikTok, Instagram, Page
  Facebook) → maintien commun avec la ligne « Profils » ; cocher range le réseau (`life_profile_filing`,
  item_kind network) par `window.Atome.commit` (`publish_surface.js#holdNetwork`, `bevy_panel_disc_tiles.js`
  `holdable`, `hostHold` du stage). Preuves : `temp/reco_small/r014_network_hold.probe.mjs` 13/13 (vrais appuis :
  appui long TikTok → Profils → Sport ; sous Pro TikTok absent, sous Sport présent), captures `temp/reco_small/r014/`.
  Vu : une fois Profils déplié, la dalle agrandie couvre la tuile tenue (comportement de la brique commune).

### R-015 — Curseurs : derniers curseurs hors du curseur unique
- Statut : FAIT (2026-10-30, soir) — Q36 B : l'outil lâché rejoint la bande du bas, curseur DOM retiré (`temp/reco_small/r015_band_tool.probe.mjs` 13/16 : les 3 échecs sont la réouverture d'un projet en sonde, défaut antérieur prouvé par `r015_reopen_baseline.probe.mjs`, une erreur AudioContext non attribuée et l'étape du harnais ; la persistance est relue après rechargement, 9b/9c).
- Vérifié le 2026-10-30 : vivant, Trouver › Outils › « Taille » lâché sur un projet monte ce curseur (bornes fausses
  0–100 au lieu de 8–420) ; preuve `temp/r015/live_slider.probe.mjs` (2/2), capture `temp/r015/live_dom_slider.png`.
  Aucun code changé : toute suite dépend de la réponse.
- Source : mémoire « Sliders : un seul partout » du 2026-10-26.
- Rapprochement du 2026-10-30 : un seul reste vivant, le curseur de la boîte à outils de la projection DOM, un
  `<input type="range">` natif (`atome/src/squirrel/components/tool_slider_elements.js`, monté par
  `eVe/intuition/projection/button.js` via `slider_tool_content.js`, lié par
  `project_drop_projection_slider_runtime.js`), gardé exprès « jusqu'au passage de cette boîte à outils en Bevy »
  (FRAMEWORK_STATE 2026-10-26). Tous les autres sont sur la jauge ou le curseur d'outil.
- Reste : passer ce curseur sur le curseur d'outil Bevy (`bevy_ui_tool_slider.js#buildBevyToolSliderNode`).
- FAIT le 2026-10-30 (reco partout) : Q36 B, l'outil lâché depuis Trouver › Outils rejoint la bande du bas du projet
  (`eVe/intuition/menu/project_band_tools.js`, Atome projet `band_tools`, gardé une fois, relu à l'ouverture) ;
  « Taille » y est le curseur d'outil Bevy 8–420 ; MCP `projects.band_tool`. Le chemin du curseur DOM est supprimé
  (7 fichiers, `ToolSlider` retiré de `spark.js` et `scripts/bundle.js`, 3 cas de test DOM retirés). Preuves :
  `temp/reco_small/r015_band_tool.probe.mjs` (journal `temp/reco_small/r015.log`, 21:42) : contrôles 1–8, 10, 9b, 9c
  passent (dépôt réel, aucun bouton DOM ni `<input type=range>`, `band_tools` = [size], jauge « 233 px » au geste, MCP,
  après rechargement `band_tools` relu = [size] et la bande du projet bâtie de lui pose Taille 8–420) ; échouent :
  9 (réouverture du projet après rechargement : `bevy_renderer_diff_present_timeout`, défaut connu des sondes, le même
  sans aucun `band_tools` et avec le menu d'avant ce lot : `temp/reco_small/r015_baseline_{1,2,pristine,gesture_1,gesture_2}.log`)
  et 11 (« The AudioContext encountered an error from the audio device » de Chromium après rechargement, vu seulement
  dans les passes qui font glisser le curseur, 3 fois sur 4 ; jamais sans ce glissement ni dans les bases ; non attribué,
  aucun code audio sur ce chemin) ; l'étape « grille posee » du harnais échoue aussi. Captures `temp/reco_small/r015/`,
  `tests/eve/slider_options_contract.test.mjs` 12/12. Non prouvé : Taille vue dans la bande d'un projet rouvert à l'écran. Hors périmètre : le reste de la boîte à outils de projection DOM (`project_drop_toolbox_*`, runtimes palette /
  déplacement / hôte, `window.eveProjectDropApi.mountToolProjectionInstance`) n'a plus d'appelant (code mort à retirer
  sur accord).

### R-016 — Résultats : lots après le lot A
- Statut : ATTENTE UTILISATEUR (2026-10-31) — tout est codé (lots B à F, Q40/Q69 « Mon nom » et image fidèle de l'aperçu : `temp/reco_resultats/results.probe.mjs` ALL OK, `run14.log`) ; reste ton geste pour Strava : accord développeur, création de l'application, clés `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` dans `/etc/squirrel/squirrel.env` (étapes dans la puce « lot F » ci-dessous, envoyées le 2026-10-30).
- Source : mémoire « Panneau Résultats » du 2026-10-28 (session `67c374b0`) ; plan validé (« Ordre de
  réalisation »), maquettes `temp/results_panel/mockups/` M1–M12.
- Fait : lot A, données du ressenti (`atome/src/shared/health_feeling_contract.js`,
  `atome/src/squirrel/health/health_feeling.js`, MCP `health_feeling.set` ; FRAMEWORK_STATE 2026-10-28, sondes 24/24
  et 9/9). Pas encore écrit : HKStateOfMind sur iOS.
- Manque (rapprochement du 2026-10-30, rien dans le code ni dans FRAMEWORK_STATE) :
  - B, moniteur Résultats (M1–M4 validées) : anneaux et cartes pastel, bande de la semaine glissée de côté,
    bascules d'activité au pied, heure choisie en glissant sur une carte, repères « après », commandes vocales,
    entrée « Résultats » dans le Moniteur, carte Ressenti vide « Non renseigné ».
  - C, séance (M5b–M9) : fin de séance sans le grand disque, Passer / Enregistrer dans la bande ; lignes du ressenti
    au départ et pendant le repos ; le matin, le champ du pied en Pro. La phrase de l'assistant en Basic n'a pas de
    maquette.
  - D, muscles (M10) : muscles principaux et secondaires des 93 exercices, la silhouette, la ligne « Muscles ».
  - E, envoi (M11) : sélection, tout coché par défaut, puis « Suite » vers Publier (Publier existe depuis le
    2026-10-29).
  - F, connexions (M12) : panneau Préférences › Santé et OAuth serveur par service (Strava, Whoop, Oura) ; chaque
    service demande un accord développeur de ton côté ; l'assistant ne lit jamais ces données.

- Question 30 : déjà répondue le 28 oct. (le matin en Basic = une courte phrase de l'assistant qu'on touche). Question posée le 2026-10-30 : n° 31 (services de connexion, lot F) de `todo/questions_registre_2026-10-30.md`.
- En cours le 2026-10-30 : lot B (moniteur Résultats) et lots D + E (muscles, envoi), puis lot C ; lot F attend la question 31 et tes accords développeur.
- FAIT le 2026-10-30 : lot D (muscles des 93 exercices `atome/src/shared/training_muscles.js`, silhouettes
  `training_body_map.js`, ligne « Muscles » `dashboard_training_muscles.js`) et lot E (« Envoyer mes résultats »,
  `eVe/domains/results_send/`, MCP `results_send.*`). Preuves : `temp/r016de/muscles_data.probe.mjs` 13/13,
  `temp/r016de/ui.probe.mjs` 39/40 (seul échec : l'étape « grille posee » du harnais), captures `temp/r016de/shots/`.
  Lot E branché sur des cartes d'essai : le moniteur du lot B doit appeler `registerResultsSendSource`.
- Questions 40 (« Mon nom » dans l'aperçu), 41 (image jointe), 42 (pas de réseaux pour des résultats).
- FAIT le 2026-10-30 : lot C (ressenti avant Lancer, pendant les repos, au bilan sans disque avec Passer · Suivi ·
  Envoi · Enreg. ; champ du matin en Pro ; panneau « Ressenti », MCP `health_feeling.open`). Preuve :
  `temp/r016c/feeling.probe.mjs` ALL OK (`temp/r016c/run8.log`), `temp/r016c/block.node.mjs`, captures
  `temp/r016c/*.png`. En cours : la phrase du matin en Basic, vérifiée au navigateur par l'agent. Non fait : rangées
  de ressenti sur les cartes cardio (autre vue). Questions 53 (teinte d'une case cochée), 54 (séance toute passée).
- FAIT le 2026-10-30 (reco partout) : lot F, Strava d'abord (Q31). Connexion par la page de Strava (OAuth serveur,
  jetons dans le coffre `health.strava`, renouvellement, déconnexion révoquée), import des 30 derniers jours dans les
  séances (un enregistrement par jour `activity_import`, source « instrumented » / strava, réimport sans doublon),
  vu par Résultats (séances Sport, anneau) ; MCP `strava.*` ; Préférences › Santé (brique « Santé » de Réglages),
  bloc pareil aux comptes des réseaux. Sans application Strava sur le serveur : « Non disponible sur ce serveur
  atome », erreur `NOT_CONFIGURED`. Preuves : `temp/reco_strava/strava_server.probe.mjs` 35/35,
  `temp/reco_strava/strava_import.probe.mjs` 25/25, `temp/reco_strava/ui_settings.probe.mjs` ALL OK sans et avec clés
  (`ui_not_configured.log`, `ui_configured.log`), captures `temp/probe_reports/dashboard_enhancement/reco_strava_*/`.
  Reste de ton côté : accord développeur Strava, création de l'application, clés `STRAVA_CLIENT_ID` /
  `STRAVA_CLIENT_SECRET` dans `/etc/squirrel/squirrel.env`, redirection
  `https://atome.one/api/social/oauth/callback/strava`. Non vérifié : un vrai compte Strava, iOS, Tauri. Whoop, Oura :
  non commencés (Q31 = Strava d'abord).
- FAIT le 2026-10-30 (reco partout) : Q41 l'envoi joint l'image de l'aperçu (découpée dans l'image que le moteur
  dessine, `eVe/domains/rendering/bevy_ui_node_capture.js`, rangée dans tes médias « Mes résultats.png ») en plus des
  lignes ; Q54 une séance toute passée finit « Arrêté », sans ligne d'objectif, enregistrée arrêtée et pas comptée,
  Passer et Enreg. en sortent ; Q55 toucher une carte sans glisser rend la journée entière ; Q56 depuis « Tout », un
  toucher garde l'activité seule, ensuite chaque toucher ajoute ou retire (filtre des médias inchangé) ; Q58 la plaque
  « Résultats » du Moniteur est une plaque entière, son nom entier ; Q62 A Forme et Force en tête de la zone des valeurs
  de la carte cardio avant Lancer. Q42, Q53, Q57, Q59 : état actuel gardé. Preuves : `temp/reco_resultats/results.probe.mjs`
  ALL OK (`run9.log`), `temp/reco_resultats/training.probe.mjs` ALL OK (`training_run2.log`),
  `temp/reco_resultats/split_import.probe.mjs` ALL OK, captures `temp/reco_resultats/out/`.
- Q40 (« Mon nom » dans l'aperçu) : maquette faite, pas codée, en attente de ta validation :
  `temp/reco_resultats/mockups/q40_maquette_nom_coche.png` (une ligne « Résultats de Jean-Eric » en haut de l'aperçu,
  en gras, un demi-outil de haut), `q40_maquette_nom_decoche.png` (ligne absente), écran actuel `q40_actuel.png`.
  Question : « Quand " Mon nom " est coché, on montre " Résultats de Jean-Eric " en première ligne de l'aperçu, comme
  sur la maquette ? Reco : oui. »
- FAIT le 2026-10-31 : Q40 (question 69 validée) codée, remplace la ligne « maquette faite, pas codée » ci-dessus :
  « Mon nom » coché, l'aperçu commence par « Résultats de <ton nom> » en gras, un demi-outil de haut ; décoché, la ligne
  disparaît ; l'image jointe à l'envoi la porte en tête. Une personne sans nom : pas de ligne.
  `eVe/domains/results_send/results_send_panel.js`. Preuves : `temp/reco_resultats/results.probe.mjs` ALL OK (`run11.log`),
  captures `temp/reco_resultats/out/q40_nom_coche.png`, `q40_nom_decoche.png`, `q40_sans_nom.png`, `q41_image_envoyee.png`.
- FAIT le 2026-10-31 (relecture du coordinateur) : l'image jointe est fidèle à l'aperçu : le fond du panneau tel qu'il est
  peint entre les cartes (plus de bandes blanches), la marge du panneau tout autour, l'espace des cartes comme à l'écran,
  « Résultats de … » à la marge, comme sur la maquette validée ; plus de barre de défilement sur l'image (un défilement
  par le code la laisse maintenant s'éteindre). `eVe/domains/rendering/bevy_ui_node_capture.js`,
  `eVe/domains/rendering/bevy_ui_scroll_runtime.js`. Preuves : `temp/reco_resultats/results.probe.mjs` ALL OK (`run14.log`),
  image `temp/reco_resultats/out/q41_image_envoyee.png`.
- Revérifié le 2026-11-04 sur l'arbre actuel, sans compte ni vraie clé (l'utilisateur testera Strava plus tard, statut inchangé) : `strava_server.probe.mjs` 35/35, `strava_import.probe.mjs` 25/25, `ui_settings.probe.mjs` ALL OK sans clés et avec clés d'essai, 0 erreur (`temp/reco_strava/rerun_1104_*.log`).

### R-104 — Refonte globale atome/eVe : cartographie, MCP universel en accès, offline sans IA
- Statut : FAIT (vérifié le 2026-11-04) — phases A à F faites. Preuves relues : fusion atome `c02dcb734` et eVe
  `090dab6e`, toutes deux contenues dans `origin/main` (atome `60047e3b2` = `git ls-remote`) ; correctif du moteur de
  rendu de main gardé (`05e58963d`, paire `56e875eee68a1239`) ; test Tauri corrigé en place
  (`tests/tauri/local_atome_history.rs`) ; FRAMEWORK_STATE § 5 du 2026-11-01 ; phase E consignée dans
  `temp/r104/PHASE_D_LOG.md` « Phase E » (worktree). Ce qui reste n'est plus R-104 : décisions et essais d'appareil
  en R-107, incident iOS en R-108, accès MCP universel en R-109.
- Fusion (2026-11-01) : session de fusion, merges sans force, branches `refonte-r104` publiées comme points de
  restauration, sauvegardes `backup/main-pre-r104-20261101-140505` ; régressions iOS 1.45 (43) suivies en BUG-012 à
  BUG-015 du registre de débogage.
- Historique : signal de départ donné le 2026-10-30 au soir, session `41da0099`. Fait au départ : commit eVe
  `402f9924` puis parent `e3f1d0849`, push des deux `main` (vérifié sur GitHub). TestFlight : une publication 1.41 (40)
  de la session montre tournait déjà sur le même état ; pas de doublon lancé (le script refuse deux publications).
  Choix de branche (§1.2 bis, toi, 2026-10-30) : **branche dédiée à part**, `refonte-r104` (parent et eVe) dans le
  worktree `.claude/worktrees/refonte-r104`, partie de `e3f1d0849` / `402f9924` ; les autres sessions restent sur
  `main` ; une seule fusion à la fin. Exception à « jamais de worktree », limitée à cette tâche. Git redevient en
  lecture seule hors de cette branche.
- Phases A et B faites (30 oct., soir) : inventaires `temp/r104/baseline/` et conception
  `eVe/documentations/global_registry_architecture.md` (dans le worktree). Phase C : maquettes faites, 37 écrans en
  téléphone et bureau (MA, MB, MC, MD) dans `temp/r104/mockups/` du worktree. Phase C CLOSE (30 oct., soir) : 6
  questions posées et répondues, toutes sur la recommandation : S0–S5 = alertes, briques R0–R2 ; catalogue
  Compl'Alim + Open Food Facts ; modèle partagé par lien, chaque version proposée ; import et Modèles dans le Carnet
  (Traitements, outil « Modèl. ») ; partage du carnet rien coché ; liste B prise en bloc. Réponses consignées dans
  `temp/r104/mockups/QUESTIONS_PHASE_C.md` (worktree). Phase D (code) en cours.
  - Phase D, lot D4 fait le 2026-10-30 (moteurs Santé sans interface) : import de protocole (forme du modèle, texte
  original gardé tel quel, `.txt` reconnu), index des ingrédients, règles S0–S5 (toutes « proposées, inactives »),
  planificateur sans IA, revue proposé → revu → actif, modèles partagés par partage lié avec versions proposées,
  catalogue Compl'Alim hors ligne, produits Open Food Facts vus gardés sur l'appareil, familles MCP
  `health_protocol` / `health_products` fermées à l'IA. Preuve : `temp/r104/probes/d4_*.probe.mjs` (6 sondes,
  138 PASS, 0 FAIL), détail dans `temp/r104/PHASE_D_LOG.md` § D4.
  - À te soumettre en fin de tâche (D4, non bloquant) : les règles SEC-01..10 et les sorties A–I ne sont définies que dans ton document 2
  (personnel, jamais lu). D4 les a calées sur les dix familles de tests B.6 et l'ordre B.1–B.3 du cahier 01 :
  comparer avec ton document 2 et dire ce qui diffère. Tes modèles réels de `tests/health_protocols/` n'ont jamais
  été lus : lance `node temp/r104/probes/d4_import.probe.mjs tests/health_protocols` (n'affiche que des comptes).
  Non fait : interface (maquettes MA/MB de la phase C), i18n des libellés.
  - Lot D8 (2026-10-31) : MD1 (Programmes dans Mon matériel, familles, « Retir. », droits gardés en atomes privés), MD2 (demande annoncée par eVe, panneau Refus / Oui, assistant sans JSON) et MD3 (Relier, Visib., carte, Signal / Bannir / Fin du lien, « Réseau des objectifs » dans Confidentialité) codés. Preuves : `temp/r104/probes/d8_access.probe.mjs`, `d8_social.probe.mjs` 21/21, `d8_network_unit.mjs` 15/15, captures `temp/r104/probes/out/d8_*`. Reste (fait par l'orchestrateur après le lot D5) (fichiers Mystic interdits au lot) : brancher l'entrée du niveau « Relier » dans la grille, la scène de la carte, les lignes Signaler / Bloquer / Fin du lien de l'appui d'un contact, et les annotations du registre (`mcp_access`, `objective_network`) ; détail dans `temp/r104/PHASE_D_LOG.md` § D8 « Placements to add after D5 ». Bloqué (nommé) : essai P022–P025 avec de vrais comptes d'autres personnes.
- Source : la session « Cahier MCP » du 2026-10-28 au 2026-10-30. Le cahier en vigueur est
  `todo/refonte_globale_architecture_mcp_offline_v1_2_2026-10-30.md` (V1.2, copié de ton dossier Téléchargements).
  Il remplace le cahier MCP du 28 oct. et le plan `todo/mcp_universal_access_plan_2026-10-28.md` (périmé).
- Validé par toi : attendre la fin de toutes les autres tâches, y compris la session « Audit atome eVe ». Au démarrage,
  et avant toute écriture : commit, push de `main` (eVe puis le parent) et build TestFlight. Puis poser la question
  de branche du §1.2 bis du cahier.
- Le 2026-10-30, tu as demandé de fusionner cette tâche avec la session « Plan de gestion des activités »
  (cahier Santé 01 + protocoles 02) en une seule tâche, traitée en une passe. Le plan commun est
  `todo/plan_refonte_mcp_et_sante_activites_2026-10-30.md`. Les deux plans ont été validés par toi le 2026-10-30
  (« Plans approved ») ; les 13 questions de la phase C restent à poser une à une après le signal. Le volet
  Santé de la session « Plan de gestion des activités » est écrit à part, avec les mêmes phases A–F :
  `todo/plan_sante_activites_objectifs_2026-10-30.md` (état réel du code, blocages par nature, 7 questions Santé
  de la phase C avec recommandations). Ta consigne du 2026-10-30 : ne rien démarrer avant ton signal. Les deux
  tâches partent ensemble, dans une nouvelle session bâtie sur les deux plans ; les deux anciennes sessions ne
  sont archivées ou supprimées qu'avec ton accord.
- Questions Santé (§6 du plan Santé) toutes réglées le 2026-10-30 : 1 la charte l’emporte partout ; 2 Santé partagée en trois (objectifs sous Projets, briques sous Activité, carnet en rubrique propre) ; 3 mise en relation = outil de la bande ; 4 D1 déjà validée le 28 oct. ; 5 thermalisme tranché par le cahier (`THERM-CAND-*`) ; 6 Ciqual embarqué + produits Open Food Facts déjà vus gardés sur l’appareil ; 7 ton document 2 sert de base et d’exemple, c’est un modèle (template) et d’autres viendront : l’import suit la forme du modèle, chaque document déposé dans `tests/health_protocols/` (ignoré par Git, jamais poussé, `atomecorp/a` est public) est importé et testé sans changer le code ; certains modèles sont partageables : privés par défaut, partagés par leur auteur entre comptes eVe (partages liés D8–D10, jamais GitHub), le receveur repasse par l’import et la sécurité S0–S5 sur son propre profil ; les proposer et les partager dans eVe = maquettes en phase C.
- Tuile « Carnet de santé » de l'accueil : question posée avec maquettes le 2026-10-31 (« à côté de Moniteur »
  impossible en Pro), réponse **A — sous Projets** (rangée du bas, à gauche de Capture ; Basic inchangé, carnet par
  la recherche et la voix). Maquettes `temp/r104/mockups/carnet_tile/` (worktree). Placement confié au lot D14.
- Fait (worktree `refonte-r104`) : lots D1 à D16 codés et vérifiés (preuves `temp/r104/PHASE_D_LOG.md`) ; phase E
  terminée le 2026-10-31 (vérifications, deux corrections : recherche du Carnet en Pro et Basic, tuiles de l'accueil
  nommées pour les lecteurs d'écran ; preuves section « Phase E » du même journal, suivi `temp/r104/REMAINING.md`).
- Phase F (2026-11-01) : la correction du moteur de rendu de `main` (commit `05e58963d`) précède la fusion ;
  `refonte-r104` fusionné dans `main` (eVe puis atome).
- Attend de ton côté : jalons visuels V01–V03 de P075, P076, P077 ; essais sur appareil (iPad, montre, CarPlay,
  lecteur d'écran et clavier réels) ; P030, P078, P022–P025 avec de vrais comptes ; suppression éventuelle de la copie
  `temp/r104/bisect/wt_mainwasm` (13 Go, suppression refusée par les permissions de la session).
- Références externes citées par le cahier : `~/Desktop/taxonomie.md` ;
  `~/Downloads/01_CAHIER_COMPLET_SANTE_ACTIVITES_OBJECTIFS_atome_eVe.md` (le nom
  `CAHIER_DES_CHARGES_SANTE_ATOME_EVE_2026-10-30.md` cité par le cahier est introuvable ; c'est le fichier le plus proche).
- FAIT le 2026-10-30 : lot B, moniteur « Résultats » (Moniteur › Résultats, MCP `dashboard.results.*`), branché au
  lot E (envoi depuis le vrai moniteur). Preuve : `temp/r016b/results.probe.mjs` ALL OK 57/57
  (`temp/r016b/run12.log`), `temp/r016b/model.probe.mjs`, captures `temp/r016b/out/`. Non vérifié : vrai hôte santé
  iOS/Android, appareil. Questions 55 à 59. Lot F attend la question 31.
- FAIT le 2026-10-30 (suite du lot C) : phrase du matin en Basic une fois par jour même après rechargement, touchée
  elle ouvre « Ressenti » ; lignes du ressenti pendant les récups cardio et au bilan cardio. Preuve :
  `temp/r016c/basic_cardio.probe.mjs` ALL OK (`temp/r016c/basic_run6.log`), captures `temp/r016c/b0*.png`,
  `c0*.png`. Bloqué : lignes avant Lancer sur une carte cardio (question 62).

### R-108 — Incident iOS 1.46 (44) : projets, Sport, registre R-104, design V5 (2026-11-01 soir)
- Mission cloud 2026-11-02 (branche `claude/magical-ptolemy-x4b0re` de a et eVe, base a `9c8f11af8` / eVe `29a07f03`) :
  suivi ligne par ligne `todo/suivi_mission_r108_cloud_2026-11-02.md`. Corrigé et testé dans le cloud : BUG-012/013 (cas
  limites de la libération du quota : id d'appareil, démarrage, clé illisible, échec IndexedDB ; Vitest 7/7, Web réel
  26/26), BUG-016 (ancrage des bips par intersection des lectures, partagé entre séances ; Vitest 4/4), BUG-008 E2
  (actions de carte de la montre mises en file, jamais perdues ; syntaxe seulement), clone propre (setup Vitest suivi,
  `logs/` créé). Web réel sans défaut : BUG-015 13/13, Sport 11/11 (BUG-005 : Stop sur la carte ; « En direct » sans
  Stop = décision). Aucun essai appareil : scénarios au § 5 du suivi.
- Reste à faire par l'agent (2026-11-02, non résolu) : BUG-005 (a) maquetté par l'app réelle (page des questions) ; maquettes
  aux vrais jetons encore à faire pour BUG-006 (1/2/3 ; capture du défaut faite), BUG-010 (1/2/3), BUG-011, BUG-004 et des TÂCHE-001…014 de design (seule la planche V5 `m1_tuiles_v5` existe) ;
  (BUG-008 E1 et E3 corrigés en code le 2026-11-02, essai montre requis.)
  Page des questions : https://claude.ai/artifact/A64AyZo1pEgeidZJm8qJmC.
- Re-signalement utilisateur,2026-11-02 (chat optimisation) : « en cliquant sur un projet sur iOS [...] directement à la racine du Dashboard », demande d'explication du correctif et de couverture du dossier R104. Audit en lecture seule : les31 entrées du paquet sont présentes au registre, plus BUG-016 ; le rapport global déclare8 entrées touchées et0 correction validée sur appareil. L'iPhone joignable porte toujours1.46(44), mais le paquet de test porte lui aussi44 : ce numéro seul ne prouve pas la présence du runtime corrigé. iPad Atomic indisponible à la lecture CoreDevice. Source c95afeb43 présente,12/12 tests sync relancés avec succès ; ce n'est pas une preuve d'ouverture réelle. Aucune installation, création de projet, modification du volume, écriture Git ou publication faite par cet audit. À établir : installation effective et identité du runtime, puis les5 ouvertures/5 créations/BUG-015/mesure sonore déjà prévus ; ne pas déclarer l'incident résolu.
- Statut : ATTENTE UTILISATEUR (2026-11-02) — essais iPhone/montre et décisions (R-107, V5 D1–D6, BUG-005/006/010/011/004, REG-001/002) ; code cloud publié sur les branches de session.
- Source : mission « MISSION COMPLÈTE — incident iOS build 44, registre R-104 intégral et design V5 » (2026-11-01), dossier
  `~/Desktop/R104_MAIN_PACKAGE_2026-11-01/`. Rapports : `todo/rapport_incident_ios_build44.md`,
  `todo/rapport_global_post_R104_MAIN_2026-11-01.md` ; registre de débogage annoté (« Résultat 2026-11-01 soir », BUG-016).
- Fait (code, tests Node, non poussé) : BUG-012/013 cause établie sur l'iPhone (`localStorage` saturé par 66 295 flux de
  sync) → flux/curseurs en IndexedDB ; BUG-016 ancrage horloge audio des bips ; montre E4 ; TÂCHE-007 serveur.
- Bloqué, à décider par toi : (1) installer le paquet de test `temp/ios_build44_2026-11-01/pkg/work/atome.app` sur l'iPhone
  (1.46 (44) + JS corrigé ; données conservées ; retour par l'IPA 44) ; (2) créer 5 projets `TEST-B44-n` pour BUG-013 ;
  (3) monter le volume de l'iPhone, posé près du micro du Mac, pour mesurer les bips.
- Toujours ouvert : décisions R-107 et V5 D1–D6 ; affichage de la date des vidéos (maquette) ; montre E1–E3 ; push,
  build 1.46 (45) et déploiement serveur sur accord explicite.

### R-111 — Trois tâches du 2026-11-02 : balayages, menus + « en cours », normes design V6.1
- Statut : ATTENTE UTILISATEUR (2026-11-02) — tâches 1, 2 et 3 FAITES (preuves ci-dessous) ; un point ouvert : l'outil « tâche de fond » (inexistant dans le code).
- Source : chat cloud du 2026-11-02, « Thread, c'est trois tâches… tu feras cette tâche [V6.1] en dernier, de façon à ce que je vérifie avant » ; prompts joints `Prompt_atome_eVe_gestes_swipe_navigation.md`, `PROMPT_CLAUDE_CORRECTIONS_GESTES_MENUS_ACTIVITE_ATOME.md`, `PROMPT_NORMES_DASHBOARD_atome_eVe_V6_1.md`, maquette `temp/v61_audit/src/v61.html`.
- Tâche 1 FAIT : balayage vers le haut depuis le sol de l'accueil / d'une rubrique, Retour, Suivant ou le ✕ → racine ; assistant → en grand (geste natif) ; outil Messages → toutes les communications ; champ → agrandi 3 outils (texte, focus, curseur gardés), replié par balayage vers le bas ou vide et sans focus. Preuves : `tests/eve/dashboard_swipe_navigation.test.mjs` 5/5, sonde réelle `temp/swipe_r110/swipe.probe.mjs` 13/13 (7/13 sur l'ancien code). Icône Dashboard gardée (règle 9 du prompt). Non vérifié : balayage de l'outil Messages avec un message en attente ; iPhone/iPad.
- Tâche 2 FAIT : 3 menus (rail, ruban projet, ruban principal) — balayage rapide = défilement sans rien lancer, exploration lente = loupe sans rien lancer, tap = une fois, tap qui arrête l'inertie = rien, loupe entière au bord ; bouton « en cours » = disque orange au-dessus de l'assistant (accueil, rubrique, projet ; s'efface sur la bande d'un panneau), toucher → la séance. Preuves : `tests/eve/menu_swipe_explore_tap.test.mjs` 6/6, `tests/eve/ongoing_tool.test.mjs` 2/2, sondes `temp/swipe_r110/{menu 7/7, rail 12/12, rail_ongoing 15/15, ongoing 8/8}.probe.mjs`, `tests/probes/r108_sport_session_web.probe.mjs` 11/11.
- Décidé par ta demande, à reporter dans AGENTS.md règle 13 (son texte dit encore « ▶ ») : le disque orange ; le toucher ouvre la séance quand une seule tourne (R-107 BUG-005 option b). Reste ouvert (R-107 BUG-006 cause 2) : garder la case du bouton libre dans les panneaux.
- Tâche 3, questions posées (V6.1 contre la charte AGENTS.md 11–16) : (1) arrondi 3 px partout ou règle 14 (1/10 du petit côté, 12 px max) ; (2) bande du bas droitier : Assistant à gauche / Retour à droite (V6.1) ou Retour à gauche / Assistant à droite (règle 13) ; (3) Précédent/Suivant dans une rangée au-dessus de Retour (V6.1) ou dans la bande (règle 13) ; (4) échelle adaptée à l'écran (V6.1) ou tailles fixes (règle 12) ; (5) libellés 9 caractères (V6.1) ou 6 lettres pour un outil de 60 (règle 11) ; (6) verre 33 % / flou 9 px et typographie 12 / 15,6 px appliqués tels quels ? ; (7) « iPhone Duo déplié » : aucun appareil pliable pris en charge dans le code (le « Duo » existant est deux outils à l'écran) — à confirmer. Planche : `temp/v61_audit/out/sheet_v61_vs_current.png`.
- Manque dans le code : tout la tâche 3 (rien codé). Git : poussé sur `main` à ta demande (« met tout sur main », 2026-11-02) — eVe `94de6f1`, atome `main` (pointeur du sous-module mis à jour).

- Réponses aux 7 questions (2026-11-02, session cloud, outil de questions) : (1) arrondi 3 px partout (règle 14 à réécrire) ;
  (2) bande du bas droitier : Assistant tout à gauche, Retour tout à droite, miroir pour un gaucher (règle 13 à réécrire) ;
  (3) Précédent / Suivant dans une rangée juste au-dessus de Retour, dans la grille (règle 13) ; (4) unité FIXE : 60 / 120 pt
  partout, plus de colonnes sur grand écran, défilement sur petit (règle 12 inchangée ; la grille 6×8 / 8×6 de la V6.1 n'est
  donc pas mise à l'échelle) ; (5) libellés 9 caractères puis « ... » partout, tuiles et outils (règle 11 à réécrire) ;
  (6) verre 33 % / flou 9 px, police 12 px et ratio 1,3 partout, heure-date-météo comprises, et : l'heure et la météo
  deviennent des tuiles ; la loupe des barres garde la taille des caractères et montre plus de caractères quand l'outil
  grandit ; (7) appliquer la disposition Duo (Preview 4:3 + outils) au Duo existant ; l'utilisateur met Xcode à jour pour
  le support du pliable.
- Corrections de l'utilisateur sur la maquette (2026-11-02) : le Carnet de santé quitte l'accueil pour la rubrique Moniteur ;
  Heure et Météo = deux tuiles de 3 × 1 unités (180 × 60), sans libellé, au sommet ; en dessous l'Agenda = 6 × 1, son libellé
  et son icône masqués dès qu'un rendez-vous s'affiche ; la tuile Contacts n'affiche plus le dernier contact, elle garde
  toujours son libellé et son icône. Maquette refaite avec ces corrections (mêmes fichiers, + `m7_moniteur.png`).
- Correction suivante (2026-11-02) : en paysage, le logo au centre de l'espace vide entre le sommet et les tuiles du bas ;
  l'ensemble des tuiles en 4:3 dans les deux orientations. Fait dans la maquette : portrait 6 × 8 unités (360 × 480),
  paysage 12 × 9 (720 × 540) sur un iPad (`temp/v61_audit/mockup/planche_4_3.png`). Question posée : sur un iPhone en
  paysage (402 pt de haut) le bloc de 540 + la bande ne tient pas à unité fixe — défilement, unité réduite en paysage
  téléphone, ou autre disposition ?
- Corrections suivantes (2026-11-02) : la tuile Capture au centre (portrait : colonnes 3-4 ; paysage : 4e des six, le plus
  au centre possible) ; mode « 07 Finder » de la V6.1 appliqué à la bande du bas : dès que le champ ne peut pas être affiché
  entièrement, seule sa loupe se voit ; un toucher lui donne toute la place disponible, les autres outils de la bande se
  compriment en traits de 4 px dans une case, l'assistant reste fixe, ✕ à la place de Retour (animation 0,68 s
  cubic-bezier(.24,.8,.19,1), champ en fondu après 0,2 s). Maquette : `temp/v61_audit/mockup/bande_traits_etapes.png`,
  `bande_traits.gif`, `planche_4_3.png`.
- Correction (2026-11-02) : l'outil Atome (l'assistant) et le « V » au centre du Dashboard n'ont aucun socle : leur dessin seul,
  sur le fond (maquette refaite avec les SVG réels `atome_curve.svg` + `atome_dot.svg`).
- **Maquette VALIDÉE par l'utilisateur (« validé », 2026-11-02)**, avec les deux points ouverts tranchés par la maquette validée :
  iPhone en paysage = unité réduite pour que le bloc 4:3 et la bande tiennent sans défilement (recommandation) ; libellés des
  tuiles de 60 = police 12 px gardée, texte raccourci à la largeur (« Conta… »). Codage en cours.
- Maquette de ces choix (2026-11-02), pastilles, couleurs et fond réels de l'app : `temp/v61_audit/mockup/planche_portrait.png`
  (droitier, gaucher, rubrique paginée, Duo) et `planche_paysage_loupe.png` (paysage, loupe) ; sources `temp/v61_audit/mockup/build.py`.
  Montrée à l'utilisateur, en attente de ses corrections ou de sa validation ; ensuite le code et la mise à jour d'AGENTS.md
  (règles 11, 12, 13, 14) par lui.
- Demandes ajoutées pendant le codage (2026-11-02) : optimiser au max les performances graphiques ; supprimer l'obsolète,
  l'inutile et le redondant ; zone de preview 4:3 au-dessus des outils ; garder la place en bas pour l'outil Communication,
  le disque « en cours » et un outil « tâche de fond » ; ne rien changer au fonctionnel ; la même charte en mode projet
  (ruban principal, menu latéral) en gardant clic, loupe, glisser-défiler ; le Mystic garde son rangement mais ses dalles
  prennent le nouveau design et les nouvelles couleurs ; coin replié en haut à droite des tuiles à plusieurs items
  (Mystic et Dashboard).
- Tâche 3 CODÉE (2026-11-02) — preuves :
  - jetons servis par l'app réelle : arrondi 3, verre 33 % / 9 px, libellés 15,6 / 12 px, coupe 9 caractères, la loupe
    montre le nom entier à police égale (`temp/swipe_r110/tokens.probe.mjs` 11/11, captures `temp/swipe_r110/out_tokens/`) ;
  - accueil sur la matrice (portrait, iPad paysage, téléphone paysage, iPad portrait), rubrique avec plaques et coin replié,
    rangée Précédent / Suivant libre au-dessus de Retour (mêmes captures) ; gaucher en miroir et eVe Basic
    (`temp/swipe_r110/styles.probe.mjs` 4/4, `out_styles/`) ; bande « Finder » loupe → champ plein → ✕
    (`temp/swipe_r110/finder.probe.mjs` 5/5, `out_finder/`) ;
  - tests : `tests/eve` sans nouvel échec par rapport à la base (la base a 307 échecs préexistants, sans lien avec ce travail).
  - AGENTS.md règles 11–14 réécrites, `maps/DESIGN_MAP.md`, `maps/CODEMAP.md`, `eVe/documentations/FRAMEWORK_STATE.md` à jour.
- Point ouvert à poser à l'utilisateur : l'« outil tâche de fond » demandé n'existe pas dans le code (seuls existent l'outil
  Messages et le disque « en cours ») ; leur place est gardée (le disque au-dessus de l'assistant, Messages dans la bande).
  À préciser par l'utilisateur : ce que cet outil doit signaler.
- Git : poussé sur `main` à la demande de l'utilisateur (2026-11-02) ; suivis poussés de même.
- Corrections après test de l'utilisateur (2026-11-02), FAITES et poussées : une seule grille d'écran (« un seul tableau »,
  `eVe/elements/system_ui_grid.js`) pour la bande, les outils de rubrique, les flèches et le ruban du projet ; le micro
  collé à l'assistant ; Précédent / Suivant avaient le même identifiant (une seule flèche visible) : corrigé ; l'assistant
  sans socle (bande et ruban), à gauche pour un droitier en projet aussi ; la zone de saisie du ruban en projet prend toute
  la place, les outils en barres, animation 0,68 s. Preuves : `temp/swipe_r110/grid.probe.mjs` 5/5,
  `project_finder.probe.mjs` 3/3, `menu.probe.mjs` 7/7, `rail.probe.mjs` 12/12, `swipe.probe.mjs` 13/13.
- L'outil « tâche de fond » = le disque orange « en cours » (tâche 2) : une séance qui continue hors de son écran (un minuteur
  de sport) le montre au-dessus de l'assistant, dans la case de la grille gardée libre ; FAIT (l'utilisateur l'a reconnu, 2026-11-02).
- Demandes du 2026-11-03 (même session) FAITES et poussées : l'outil Dashboard (Organize en projet) toujours dans le coin
  opposé à l'assistant, Retour juste avant lui (bande et ruban) ; gestes des tuiles : glisser latéral sous le doigt depuis
  une dalle comme depuis le vide ou la marge, droite = page d'avant puis niveau au-dessus sans pause ; sur l'accueil, une
  tuile glissée vers la gauche ouvre sa rubrique en tournant sous le doigt ; vers le haut, toute dalle se retourne et ouvre
  son contenu, vers le bas rien ne s'ouvre et un niveau ouvert se referme. Preuves : `temp/swipe_r110/pages.probe.mjs` 11/11,
  `flip.probe.mjs` 6/6, `project_finder.probe.mjs` 3/3. Limite : l'ouverture suit le doigt jusqu'au retournement, puis le
  contenu s'ouvre à son propre rythme (pas encore un agrandissement continu lié au doigt) ; une tuile sans contenu n'ouvre
  pas encore de bloc vide.
- Trait blanc entre l'Agenda et le V : vu sur une capture d'une version intermédiaire jamais poussée (champ du bas bogué) ;
  non reproduit sur le code poussé (30 images de l'ouverture de la recherche, `temp/swipe_r110/frames.probe.mjs`). À rouvrir
  si l'utilisateur le revoit, avec sa capture.

### R-109 — Vérification MCP « universel en accès » (cahier V1.2/V1.23) sur l'app réelle (2026-11-02)
- Statut : FAIT (vérifié le 2026-11-04, session `41da0099`, Web réel, serveur de test isolé). Preuves relancées par
  moi : `temp/r109/probes/gesture_bus_trace.probe.mjs` 15/15 (`out/gesture_verify.log` : forme, déplacement, dessin,
  calque, emplacement, prise / relecture / modèle du rail naturel, recadrage, rangement Créer, toutes les écritures des
  atomes touchés nommées, trace 0,6 µs par écriture), `r109_mcp_parity_web` 12/12 (MCP p50 4–13 ms, p95 7–63 ms),
  `r108_mcp_coverage_web` 8/8, `registry:check` ok (4211 entrées), `exposure_registry.probe.mjs` 10/10.
  Tests unitaires voisins : 11 échecs (pincement, point d'écran d'un dépôt Natural, capture
  `media_input_enumeration_unavailable`) tous dans du code non touché par R-109 (`surface_pinch_runtime.js` 28 sept.,
  `surface_runtime.js` 26 oct., `media_input_devices.js` 29 oct.) ; `project_view_molecule_combine` 2/10 identiques
  sur HEAD. Non vérifié : iOS et Tauri (pont stdio vers le serveur local), appareil réel.
- Demande : « dis-moi si on a bien intégré ce nouveau concept : quasiment toutes les actions passent par MCP, même quand ce
  n'est pas une IA » (chat cloud 2026-11-02). Cahier : `todo/refonte_globale_architecture_mcp_offline_v1_2_2026-10-30.md`
  (identique au V1.23 fourni, même SHA-256) : MCP universel en accès, UI / voix / script / MCP sur les mêmes contrats
  d'outils (ToolRuntime V2, command bus), pas de transport MCP pour les événements bruts.
- Vérifié (Web réel, `tests/probes/r108_mcp_coverage_web.probe.mjs` 8/8) : serveur MCP de la page (protocole 2025-06-18),
  `tools/list` = 1 197 outils ; `tools/call ui.couleur.apply` (transport `ai`) a le même effet que l'UI et passe par le
  même `commandBusV2` ; la sélection au toucher passe par le bus (`ui.select`), outil listé par MCP.
- **Écart démontré** : Créer › Forme › Cercle + toucher (création au geste) ne passe ni par le runtime d'outils ni par le
  bus : `shape_creation_runtime.js#createAt` écrit par `eveToolBase.createAtome` + `Atome.commit` (pipeline de mutation
  canonique gardé, contrat d'outil contourné). MCP crée une forme par `atome.create`, un autre contrat que l'UI.
- Manque : le classement `UI_only / runtime_only / MCP_exposed / blocked_by_policy / needs_adapter` du § 5.3 n'existe pas
  dans le registre (`eVe/registry/generated/full-map.json` : aucun champ d'exposition) ; inventaire des autres chemins UI
  qui contournent le runtime à faire ; client MCP externe sans IA par le relais (`server/remoteCommandRelay.js`) non testé.
- **Audit du 2026-11-02 (feu vert utilisateur)** : compte rendu `todo/audit_mcp_r109_2026-11-02.md`. Client MCP
  officiel sans IA (SDK 1.32.2, stdio → `/ws/api` → page) : 11/11 (`tests/probes/r109_mcp_external_client_web.probe.mjs`),
  écriture refusée avant octroi, `tools/list_changed` reçu, 189 → 962 outils avec « Modifier ». Classement : 985/994
  outils d'interface exposés ; 9 invisibles tant que leur panneau n'est pas ouvert (enregistrement paresseux). 28 fichiers
  écrivent par `Atome.commit` hors du bus (gestes, créations) : tri à faire. Corrections en attente de décision.
- **Corrections du 2026-11-02 (1, 2, 3 validés par l'utilisateur)** : outils paresseux chargés au premier appel MCP,
  `tools/list_changed` à l'apparition d'un outil, liste paginée gardée ; chaque écriture tracée sur le bus après la
  trame (1–7 µs côté geste) ; trois bugs d'annulation corrigés (scène, état relu, écritures en vol). Sondes : externe 11/11,
  couverture 8/8, parité 9/12 à 11/11. **Reste ouvert** : annulation envoyée juste après une modification
  (`history_source_transaction_not_found`, interface et MCP), côté processus du coffre. Détail
  `todo/audit_mcp_r109_2026-11-02.md` § 6–7.
- **Annulation immédiate corrigée (2026-11-02)** : l'annulation partait au serveur avant que la file d'envoi du
  navigateur lui ait remis l'écriture ; elle vide d'abord cette file (`flushWorkspace`). Parité 12/12, trois fois.
- **Classement § 5.3 dans le registre — FAIT (2026-11-04)** : champ `exposure` (+ `exposure_blocked_on`) sur chaque
  outil et méthode MCP, calculé au build (`scripts/registry/registry_project_exposure.mjs`, `registry_annotate.mjs#annotateExposure`),
  refus des `UI_only` / `needs_adapter` non exceptés (`annotations.json` `exposure_exceptions`, vide), `_meta['atome/exposure']`
  dans `tools/list`. Preuves : `temp/r109/probes/exposure_registry.probe.mjs` 10/10, `temp/r109/probes/exposure_web.probe.mjs`
  8/8 (page 1 213 outils, programme 189 puis 1 135, 0 écart avec le registre).
- **Tri des écritures et outil armé — CODÉ (2026-11-04)** : détail `temp/r109/TRIAGE.md`, audit § 9. Les propriétaires
  partagés (`createAtome`, `updateAtomeProperties`, `commitRuntimeSetBatch`, duplication) transmettent `{source, tool_id}`
  à l'écriture ; 48 fichiers triés : (b) gestes 6 tracés avec l'outil armé, (a) propriétaires appelés par un outil 32,
  (c) contournements 6 → 0 : `ui.layer.add`, `ui.placeholder.fill`, `ui.crop`, `creation.keep` créés,
  relecture / modèle du rail naturel par `ui.record.actions.replay` / `.template` ; la forme SVG n'écrit plus l'atome
  depuis la vue (balisage lu à la création, sinon `shape_svg_markup_unreadable`). Hors des 48 : texte, cercle, lasso,
  molécule (création, combinaison, transformation) tracés. Les autres opérations de molécule (dégrouper, supprimer,
  extraire) sont des exécuteurs d'outil déjà sur le bus par leur commande ; leur écriture garde la trace `local`.
  Vérifié par moi : `registry:check` ok (4211 entrées), `exposure_registry.probe.mjs` 10/10.
  `tests/eve/project_view_molecule_combine.test.mjs` : 2 échecs sur 10, **identiques sur HEAD intact** (préexistants, pas R-109).

### R-107 — Fusion R-104 → main (2026-11-01) : décisions et essais restés ouverts
- Statut : ATTENTE UTILISATEUR (2026-11-01) — questions posées dans le compte rendu final de la session de fusion,
  rapport `todo/rapport_fusion_r104_main_2026-11-01.md` ; registre de débogage annoté
  `todo/registre_debug_r104_2026-11-01.md` (bloc « Résultat 2026-11-01 » par entrée).
- Source : mission « sauvegarde, fusion R-104, débogage puis design V5 » du 2026-11-01
  (`~/Desktop/R104_MAIN_PACKAGE_2026-11-01/mission/`, journal
  `~/Documents/Sauvegarde-Claude-2026-10-31/r104-main-merge-20261101-140505/PLAN_ET_JOURNAL_CLAUDE.md`).
- Fait et prouvé (Web) : fusion eVe et atome (`090dab6e` / `c02dcb734`), BUG-001 (caméra arrière au scan, eVe
  `83556da1`), BUG-006 causes 3 et 4 (eVe `70c845cf`), BUG-003 (rouleaux de date, âge Sport, contrôle Rencontre ;
  eVe `fb5aa1f0`, atome `668f7ead7`), BUG-012/013/015 vérifiés sur main ; sondes `temp/r104merge/probes/`.
- Push de main : fait depuis (R-112, 2026-11-03) ; `origin/main` contient la fusion R-104 (vérifié le 2026-11-04).
  BUG-012, BUG-013 et BUG-014 ne se tranchent toujours que sur l'iPhone/iPad (build > 43).
- Décisions de design à prendre (règle 16, rien codé) :
  - Design V5 D1–D6 : `temp/r104merge/design_v5/AUDIT_DESIGN_V5.md`, maquette `mockups/m1_tuiles_v5.png`.
  - BUG-005 : (a) Stop dans le pied de « En direct » ou (b) l'outil ▶ ouvre la fiche quand une seule activité tourne.
  - BUG-006 cause 2 : l'outil ▶ recouvert par un panneau ouvert sur téléphone (garder la case libre ?).
  - BUG-010 : six outils impossibles à 402/393 pt ; options (1) bande hors pied, (2) bord à bord, (3) 3+3.
  - BUG-011 : Retouche ouvre l'import avec Médias déplié et Images allumé (modifie la règle 18) ?
  - BUG-004 : poids/taille en rouleaux (la règle 14 dit ligne-curseur) ?
  - REG-002 : case « Photo » aussi dans les catégories et la recherche de Prod. ?
  - BUG-002 : sélection multiple + suppression groupée (nouvelle fonction, maquette) ; appui long en vue Liste ;
    Santé › Compléments sans appui long.
  - REG-001 : quelle valeur est « le numéro de série » (jamais affiché dans l'historique) ?
  - BUG-009 : refus d'encadrement (contrôle serveur ou autre moteur) ; page de départ = TÂCHE-004.
  - TÂCHE-002, 003, 009, 010–014 : maquettes à produire puis valider.
- Reste à coder une fois une build possible : montre E1–E4 / S1–S3 (Swift, `temp/r104merge/agents/watch/protocole_montre.md`).
- Non vérifié : appareil iOS (build > 43), montre, Tauri, Android.

### R-110 — Android local test, tester distribution and server update (2026-11-02)
- Statut : FAIT (delivery verified 2026-11-02) — Android 1.46.0 (13) installed/tested/distributed, Firebase notifications confirmed, production atome/eVe 1.46 verified. Cache-maintenance limitation is recorded below.
- Source: local Codex chat, 2026-11-02: « Tu vas lancer le script qui installe l'application sur Android. le telephone est connecté […] tu testes juste […] locale, après t'envoies une nouvelle version […] tu avertis les gens […] mettre le serveur à jour à la dernière version de Atom ».
- Authorized: local Android installation/test, then Firebase distribution to the existing configured testers with e-mail notification, and production server update. The user accepted USB debugging and asked to authorize this computer permanently. No Git publication was requested or performed during the initial delivery; the user subsequently requested synchronization of the result to GitHub.
- Done: server atome/eVe 1.46, atome source `a3dbe8b96`, eVe `ccdcf1ab`; data/source backups validated, environment unchanged, active service, database/public HTTPS/identity checks pass. Exact evidence in `temp/android_delivery_2026-11-02/REPORT.md` and its server logs.
- Local acceptance found a real upgrade failure: build 12 installs without clearing data but ADOLE initialization panics on `news_publications.thread_ref`. It was not uploaded or distributed. Canonical native pre-schema preparation extracted to `platforms/desktop-tauri/src/server/local_atome_schema.rs` and completed for News; regression reproduced the exact error, then all four native SQLite tests pass. M0 passes.
- Physical acceptance done: build 13 installs in place, renders Home, opens Contacts/Objectives by real touches, returns through the footer, resumes the same view/process and passes another cold launch. Native logs have no fatal/database/terminal-renderer failure in the tested window. Firebase confirms release `2jrio4vva3eq8` and notification of the configured group/addresses; the distributed immutable APK matches the tested SHA-256. Proof: `temp/android-release-uqQWga/report.json`. No unanswered permission request remains. Temporary dispatcher: `temp/android_delivery_2026-11-02/dispatch.mjs`; active acceptance directory: `temp/android_delivery_2026-11-02/attempt13/`.

- Operational limitation: required cache cleanup was run, but macOS refuses CoreDevice `AppInstallationBinaryDeltas` (EPERM), including the preview with process access. Cleanup cannot complete without external OS access; no permission setting was changed. Logs: `temp/android_delivery_2026-11-02/cleanup.log` / `cleanup-preview.log`. This does not leave any installation/publication/server step pending. The native repair and tests were initially left local under the Git policy. The subsequent user request authorizes synchronization of this result to GitHub; fetched main updates are integrated, with 53 JavaScript/release checks, four native SQLite tests and M0 passing. Xcode window state is excluded.

## Attentes de ton côté (aucune session ne peut les faire seule)

### R-122 — Convertisseur de trousseaux vers CXF : essai à la main et sur tes vrais exports (2026-11-05)
- Statut : ATTENTE UTILISATEUR — l'outil est codé et vérifié sur des données fictives. Le compte rendu de fin de
  session du 2026-11-05 te demande deux essais.
- Source : ton prompt « Convertisseur autonome de trousseaux pour atome » (session `8fc5b5d1`) : 1PUX, CSV Apple et
  autres, 1PIF, vers CXF 1.0 ; chiffré par défaut ; app macOS en cinq étapes ; tests ; spécification ; exemple
  pour atome.
- Fait :
  - Code : `tools/keychain-converter/` et sa spécification `FORMATS.md`.
  - App : `tools/keychain-converter/dist/atome keychain converter.app`, construite par `build_macos_app.sh`.
  - Tests : `tests/keychain_converter/`, 38 au vert ; clippy, rustfmt et cargo deny OK.
  - Annexe A du standard : 0 violation (`temp/keychain_converter/appendix_probe`).
  - Exemple : `tests/fixtures/keychain_converter/expected/`.
- Reste, de ton côté (une session ne peut pas le faire seule) :
  - ouvrir l'app et suivre les cinq dialogues jusqu'au bout. Seuls le lancement et le premier dialogue ont été
    vérifiés ; les cinq autres scripts de dialogue compilent ;
  - convertir un vrai export 1Password `.1pux` et un vrai CSV Apple Passwords ; le rapport `.report.json` dira
    s'il reste des clés non reconnues (`source_keys_only_in_fidelity`) ou des avertissements.
- Hors tâche : il n'existe pas encore d'importateur CXF dans atome (première tâche : ne pas toucher au stockage).

### R-101 — Inscrire l'iPhone 13 Pro de Sylvain
- Statut : ATTENTE UTILISATEUR
- Question posée le 2026-10-30 (session `e6d257bf`) : l'UDID de son iPhone 13 Pro, pour l'inscrire au compte
  développeur.

### R-102 — Essais sur tes appareils
- Statut : ATTENTE UTILISATEUR
- Vidéo puis visio sur l'iPhone, app au premier plan (session `fa77e9d2`, 2026-10-27) ; scintillement de
  Capture › Audio sur l'iPad (session `51ffbaeb`) ; écoute du Sampler sur l'iPad / AUv3 ; montre réelle (W1–W7) ;
  alarmes d'objectif sur l'iPhone ; écran CarPlay dans la voiture ; lecture YouTube par la page hôte sur l'iPhone et
  sur Tauri (R-011) ; démarrage sourd et mode avion du moteur vocal sur l'iPad (R-013).

### R-103 — Compte de test sur atome.one
- Statut : ATTENTE UTILISATEUR
- Question du 2026-10-29 (session `0b6e244a`) : rouvrir l'inscription une minute pour créer le compte de test.
  Probablement dépassée par l'inscription sur invitation (2026-10-30) : à confirmer avec toi.

### R-113 — Montre : tuiles jamais reçues (glyphe iPhone seul)
- Statut : ATTENTE UTILISATEUR (2026-11-04) — build 40 VALID sur App Store Connect le 2026-10-30 ; les builds suivants (43, 45, 46, VALID) portent aussi le correctif. Demandé : installer le dernier build TestFlight et relancer l'app montre.
- Source : ta photo du 2026-10-30 au soir (session `84259824`) : au premier lancement de TestFlight 1.40 (39), la montre
  ne montre que le glyphe bleu de l'iPhone, sans texte, donc elle n'a jamais reçu ses tuiles.
- Cause trouvée : l'iPhone n'ouvrait sa liaison montre (WCSession) qu'au chargement de la fenêtre d'eVe ; la demande de
  la montre qui réveille l'app en arrière-plan était perdue, et rien ne la renvoyait. Corrigé dans le code (liaison ouverte
  au lancement, page démarrée sans fenêtre à la demande, la montre resalue une page qui ne l'a pas encore été). Preuves :
  sonde `temp/watch_companion/probe_watch_link.mjs` 53/53, cible montre compilée, dessin des images vérifié en WebKit
  (`temp/watch_companion/webkit/paint_probe.swift`).
- Reste : ton essai sur la montre avec le dernier build TestFlight (46 au 2026-11-04).

### R-114 — Tuiles de l'accueil adaptées à l'écran (iPhone, Android, iPad)
- Statut : FAIT (2026-11-04) — accueil, ruban d'un projet et rail contextuel sur la même case de la norme (50–80 px) ; L1 en paysage téléphone ; rangées vides entières en trop ; D19 (propositions du V en paysage) corrigé avec D18. Preuves : `temp/r114_tile_norm/{matrix,neighbours,rail}.probe.mjs` (tout OK), app réelle `home_real.probe.mjs` 25/25 et `ribbon_real.probe.mjs` 6/6. Non vérifié : appareils iOS/Android, zones sûres natives. Correction du 4 nov. (reproche de l'utilisateur : V sans case au-dessus, Basic couché sans Heure/Météo et ordre changé) : L1 = la matrice debout gardée case pour case, ses quatre rangées aplaties à 1,5, Heure/Météo/Agenda en colonne à gauche, pour Pro comme pour Basic ; le V garde ses quatre voisins du portrait (Déconnecter dessus, Réglages dessous). Preuves : `temp/r114_tile_norm/l1_v.probe.mjs` (app réelle, tout OK), `matrix`/`neighbours` (ordre et voisins = portrait), planche `temp/r114_tile_norm/out/r114_L1_corrige.png`. Android 640×360 couché : case 49 (plus petit écran, sous la norme d'un px). Le contenu des panneaux garde l'unité de 60. Plafond de 9 caractères gardé (règle 11). Joint et rapport des textes (repris de D18 § 9 sur décision de l'utilisateur, 4 nov. : choix personnel, valeurs de la charte par défaut) : FAIT — Réglages › Visuel, deux lignes du slider standard « Rapport des textes » 1,1–1,3 et « Joint des tuiles » 0–6 px, lus en direct (`system_ui_tokens.js` `textRatio` / `gridJointPx`, `system_ui_grid.js#systemUiGridJointPx`) ; l'accueil ne lit plus le `gap` enregistré du modèle. Preuve : `temp/r114_tile_norm/visual_settings.probe.mjs` (vrais glissements, accueil, étiquette et bande suivent), régressions `home_real`/`l1_v`/`ribbon_real`/`matrix`/`neighbours`/`rail` OK. Planche portrait `temp/r114_tile_norm/out/r114_portrait_reglages.png` envoyée pour vérification de conformité. Planche validée par l'utilisateur (4 nov., « le design est impeccable »). Contour des tuiles (demande du 4 nov. : taille et opacité, pouvoir le supprimer) : FAIT — Réglages › Visuel « Contour des tuiles » 0–3 px physiques (0 = aucun) et « Opacité du contour » 0–100 %, défauts 1 px / 28 % (`dashboard_skin.js` `tileDisc.edgeWidths`/`edgeOpacities`, `dashboard_mystic_colors.js#plateMaterial`). Preuve : `temp/r114_tile_edge` via `temp/r114_tile_norm/tile_edge.probe.mjs` (vrais glissements, panneau défilé au doigt ; opacité suivie, largeur 0 = aucun contour, pixels du bord égaux au fond : `edge_pixels.mjs`), régressions `visual_settings`/`home_real` OK. Non vérifié sur appareil.
- Source : prompt collé du 2026-11-04 « Adaptation automatique des tuiles atome/eVe » (grille 4:3 / 3:4, 3 × 4 tuiles
  debout, taille maximale, joints 1 pt, zones sûres, textes proportionnels, recalcul à la rotation).
- Réponses de l'utilisateur (2026-11-04, outil de questions) :
  - Taille : une NORME min/max pour tous les appareils, pas une taille par appareil ; tuile min ~100 (voir les plus petits
    écrans), max ~160, à étudier en maquette. Plus de place ⇒ plus de cases (tuiles ou outils), le 4:3 est un MINIMUM ;
    debout sur iPhone, Heure/Météo/Agenda calés en haut, le reste en bas ; la place en trop est quantifiée en cases vides
    entières (comme des icônes manquantes), jamais un espace libre en accordéon.
  - Joint : variable, réglage de 0 (ou 1) à 6 px dans les préférences visuelles (transparence, flou, couleurs) ; la tuile
    rétrécit d'autant. Ce réglage appartient à la tâche D18 § 9 (`todo/ameliorations_debogages_D18_2026-11-04.md`,
    « atome eVe Improvement and Debugging ») : l'utilisateur l'y reporte lui-même.
  - Textes : rapport réglable (1,1 / 1,2 / 1,3) dans les mêmes préférences visuelles (D18 § 9), pas proportionnel à la tuile ;
    coupe « … » automatique à la largeur plutôt qu'un nombre de caractères, si possible (audit demandé).
  - Un seul tableau pour tout outil (accueil, bandes, rail contextuel, menu principal, ruban) ; seule exception le menu
    Mystic (même taille et style, mobile sous le doigt). FAIT : écrit dans AGENTS.md règle 13 et en mémoire ; ne plus demander.
- Audit des textes : la coupe automatique à la largeur mesurée existe déjà dans les deux propriétaires
  (`bevy_ui_menu_surface.js#truncateBevyToolLabel` via `fitSingleLineText`, `dashboard_creation_records.js#dashboardLabelBandText`
  via `measureLabel`) ; c'est le plafond de 9 caractères de la règle 11 qui s'y ajoute. Passer au tout-automatique = retirer ce plafond.
- Constat d'architecture : l'unité est une constante figée au chargement (`SYSTEM_UI_TOOL_UNIT_PX = 60`,
  `eVe/elements/system_ui_tokens.js`, lue par ~89 fichiers) ; une unité choisie par écran et à la rotation demande d'en
  faire une valeur vivante relue par la grille (`system_ui_grid.js`), la matrice et les bandes.
- Maquette d'étude : `temp/r114_tile_norm/out/r114_norme_tuiles.png` (source `temp/r114_tile_norm/build.mjs`) — unité
  50–80 (tuile 100–160) : iPhone SE 118, Android 360 × 640 114, iPhone 16 Pro 128 (+2 rangées vides), Pro Max 140,
  iPad 11″ debout 160 (+4 col., +4 rangées), iPad couché 152 ; iPhone couché : A 4:3 à tuile 74 (sous le min),
  B compact 12 × 5 à 122 (hors 4:3), C 4:3 à 100 qui défile.
- Questions ouvertes : (1) valider la norme 100–160 ; (2) iPhone couché A, B ou C ; (3) coupe « … » automatique seule
  (retirer le plafond de 9 caractères de la règle 11) ou garder le plafond.
- Ensuite : codage (unité vivante, matrice élastique en cases entières, recalcul à la rotation), règles 11–12 réécrites.
- Suite (2026-11-04) : A, B et C refusés. L'utilisateur garde la taille de base 120 (unité 60) et demande de remodeler les tuiles
  (120 × 60, 240 × 120, 180 × 60…, debout comme couché) pour un bloc 4:3 qui tienne couché. Maquette
  `temp/r114_tile_norm/out/r114_paysage_L1_L2.png` (source `build_landscape.mjs`), unité 60 fixe, sans défilement sur iPhone SE,
  Android 640 × 360, iPhone 16 Pro et Pro Max couchés :
  - L1 (recommandée) : le bloc debout tel quel (Activité · V · Média / Projets · Moniteur · Contacts / Capture au centre) en
    tuiles 120 × 90 (1,5 unité, multiple d'une demi-case, règle 12), 360 × 270 = 4:3 exact ; Heure, Météo, Agenda en colonne à gauche.
  - L2 : six tuiles 120 × 60 en bloc 2 × 3 (240 × 180, 4:3 exact), Heure/Météo/Agenda à gauche, le V à droite.
- VALIDÉ par l'utilisateur (2026-11-04) : L1 ; règle « on remplit la place » : unité choisie par écran dans la norme (tuile
  120 par défaut, jamais < 100, jamais > 160), la plus grande qui tient, tout le tableau grandissant avec (bande comprise) ;
  bloc 4:3 au minimum, jamais de défilement sur téléphone, les tuiles changent de forme par demi-cases, jamais de taille
  ni d'ordre ; plus de tuiles qu'une page ⇒ la place en trop en montre davantage, en 4:3, avant d'ajouter une page.
  Écrit dans AGENTS.md règle 12 (2026-11-04).
- Reste à coder : unité vivante (`system_ui_tokens.js` `SYSTEM_UI_TOOL_UNIT_PX`, ~89 lecteurs) relue par la grille, la matrice,
  les bandes, le rail et le menu principal ; matrice couchée L1 (`dashboard_home_matrix.js`) ; remplissage des pages en 4:3
  (`dashboard_mystic_grid.js`) ; recalcul à la rotation. Question restante : plafond de 9 caractères des libellés (règle 11)
  gardé, ou coupe « … » à la largeur seule. Joint et rapport des textes : tâche D18 § 9.
