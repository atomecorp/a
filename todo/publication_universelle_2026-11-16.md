# Publication universelle, connexions aux plateformes, communication unifiée (2026-11-16)

Demande de l'utilisateur, 16 nov. 2026 (prompt « PROMPT — atome/eVe : publication universelle… », session courante) :
compléter Publier / Communiquer / comptes pour publier vers plusieurs réseaux, programmer, recevoir commentaires et
messages privés dans Communiquer, y répondre, connecter les comptes depuis le contexte ; Steam et Heroku à part ;
assistant + MCP. **Maquettes d’abord, une par une, validées avant tout code d’interface.** Registre : R-190.

Ordre : 1 audit → 2 faisabilité → 3 simplification → 4 maquettes (une par une) → 5 architecture validée → 6 code →
7 vérification → 8 recette par plateforme.

## 1. Audit du code (16 nov., lu dans le code, pas dans les docs)

Fait majeur : **le serveur vivant est le serveur Rust `atome-server`** (Web et prod : `scripts/run_fastify.sh:115-130`,
`scripts/server_update.js:224-235`). `social.*` passe par `atome/servers/atome-server/src/providers/dispatch.rs:202-214`
→ `providers/social/ops.rs`. `server/social/*.js` n'est plus qu'une implémentation de référence (le Rust en est le portage
ligne à ligne). Les docs `social_sharing.md` et `squirrel/social/client.js:7` disent encore « Fastify » : périmées.
Tout nouvel adaptateur s'écrit donc en Rust (AGENTS.md règle 7).

Légende : **V** opérationnel vérifié par sonde · **C** codé non vérifié · **P** partiel · **D** documenté seulement ·
**A** absent · **B** bloqué (API, autorisation, coût).

| Fonction | État | Propriétaires |
| --- | --- | --- |
| Publier (panneau unique : texte + 1er média, tuiles Fil eVe / personnes / réseaux / forums, Quand, Envoi) | V (Fastify, 28 oct. ; jamais rejoué sur le serveur Rust) | `eVe/domains/publish/publish_surface.js`, `publish_people.js`, `publish_send.js` |
| Entrées de Publier : Créer › Envoi, discussion, News, prises, boutique, GPS, Santé, Agenda, `publish.open` | C/V | `dashboard_create_surface.js:310`, `dashboard_mystic_surface_lists.js:57`, `dashboard_news_publication.js:171`… |
| Publication programmée (Quand, Agenda « Publications », déplacer = reprogrammer, supprimer = annuler, retard notifié) | V personnes/fil ; C réseaux | Rust `ws_api/scheduled/{mod,fire,channels,store}.rs` ; `publish_calendar.js`, `publish_planned.js` |
| Réseaux : TikTok, Instagram (pro), Facebook (Pages ; profil = texte copié + facebook.com) | C — aucun appel réel jamais fait (pas d'apps développeur, pas de `Private/social.env`) | Rust `providers/social/{tiktok,instagram,facebook,ops,jobs,sessions}.rs` ; réf. `server/social/*.js` ; liste figée `atome/src/squirrel/social/contracts.js:8` |
| OAuth connecter / rafraîchir / révoquer | C (Instagram sans révocation, Facebook sans rafraîchissement) | idem + `social_oauth.js` (état 48 hex, 10 min) |
| État par destination (statut, id distant, URL, erreur, tentatives), anti-doublon (`unconfirmed` jamais renvoyé), une course par destination | C (tests vitest JS, pas de test Rust) | `social_jobs.js:107-134`, `jobs.rs:402` |
| Réessai | P manuel seulement (panneau Com) | `bevy_panel_comm_social.js:105` |
| Mise à jour d'un post | P Page Facebook seule | `facebook.rs:372` |
| Suppression, lecture des posts, commentaires, MP, webhooks | **A** (scopes publication seule) | — |
| Plusieurs comptes par réseau | **A** (un enregistrement `social.<réseau>` ; plusieurs Pages sous un compte FB : C) | `social_sessions.js:15`, `sessions.rs:40` |
| Connexion depuis Publier puis retour à l'opération | **A** (tuile non connectée → feuille de partage / copie, ou échec) | `publish_networks.js:94-110`, `capabilities.js:42-47` |
| Mémoire des dernières destinations | **A** (brouillon vide à chaque ouverture) | `publish_surface.js:40` |
| Réglages › Préférences › Communication › Réseaux sociaux (état, Connecter/Reconnecter, Déconnecter ×2) | C | `bevy_panel_home_social.js:26-167` |
| Réglages › Mots de passe et clés (fiches nom/login/mot de passe, coffre serveur AES-GCM par principal) | C (tests non rejoués) | `bevy_panel_home_vault*.js`, `server/providerCredentialVault.js` |
| Communication « Publier sur les réseaux » (2e surface, liste les comptes sans pouvoir connecter) | C — doublon de Publier | `bevy_panel_comm_social*.js` |
| Boîte de réception = pile de notifications serveur (liste blanche de champs) | C | Rust `social/notification_stack.rs:143-174` ; client `communication_notifications.js:97-130` |
| Champs d'origine externe (plateforme, compte, auteur externe, fil, id distant, capacité de réponse) | **A** (supprimés par les deux listes blanches) | idem |
| Seule source externe entrante : formulaire de site (`site-contact`) | P (champs `reply_to`/`site_id` perdus au stockage, pas de Répondre) | `server/site_http.js:90-108` |
| Réponse | C atome→atome seulement (`eve-comm-send`) | `communication_events.js:83` |
| Filtres de la boîte | P : boîte / archives + tris ; aucun filtre de provenance | `bevy_panel_comm_model.js:240` |
| Réception au Dashboard : outil d'état (cellule Messages), liste « en attente » (une ligne par personne), rubrique notifications | C/V | `dashboard_status_tool.js`, `dashboard_pending_messages.js`, `dashboard_mystic_sources.js:224` |
| Mail IMAP/SMTP | P (réglages + API + outils `mail.*`, aucune boîte mail dans eVe, pas dans Communiquer) | `atome-server/src/mail/`, `bevy_panel_home_settings_view.js:135` |
| Publication Web (site atome.one/<slug>, versions, programmation, retour arrière) | C (prouvé sur staging le 29 oct.) ; domaines/mail simulés | Rust `site/*.rs` |
| MCP : `social.*` (7), `publish.*` (9), `forum.*` (11), `site.*`, `communication.*`, `mail.*` | C (confirmation exigée pour les actions externes) | `mcp_contract_families.js` |
| YouTube (recherche), PeerTube (lecture), Strava (OAuth + import), GitHub (synchro de code) | hors publication | `ws_api/sources/youtube.rs`, `providers/strava.rs`… |

## 2. Faisabilité par plateforme (API officielles, état à nov. 2026)

✓ API officielle · Pro = compte pro/créateur · Rev = revue du fournisseur · Ass = partage assisté seulement · ✗ indisponible · ? à vérifier.

| Plateforme | Texte | Image | Vidéo | Programmé (par eVe) | Lire ses posts | Commentaires lire/répondre | MP lire/répondre | Webhooks | Modifier/suppr. | Auth | Validation / coût |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Facebook Pages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ / ✓ | ✓ / ✓ (Messenger de la Page, fenêtre 24 h) | ✓ signés | ✓ / ✓ | OAuth (Meta) | Rev (App Review, vérif. entreprise) |
| Facebook profil perso | Ass | Ass | Ass | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | — |
| Instagram | ✗ seul | ✓ Pro | ✓ Pro (Reels) | ✓ | ✓ Pro | ✓ / ✓ Pro | ✓ / ✓ Pro (24 h ; 1 réponse privée par commentaire, 7 j) | ✓ | légende seule / ✓ | OAuth Instagram Login | Rev ; perso = Ass |
| Threads | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ / ✓ (+ masquer, approbation) | ✗ | ✓ | ✗ / ✓ | OAuth (même app Meta) | Rev |
| TikTok | ✗ (photo ✓) | ✓ (URL vérifiée) | ✓ | ✓ | P (liste vidéos) | ✗ / ✗ | ✗ | P | ✗ | OAuth | Rev (audit Direct Post ; avant audit : privé seulement) |
| YouTube | ✗ | ✗ | ✓ | ✓ (`publishAt`) | ✓ | ✓ / ✓ | ✗ | P (PubSub nouvelles vidéos) | ✓ / ✓ | OAuth Google | Rev (projet non audité : vidéos privées seulement) ; quota 10 000 unités/j ≈ 6 envois |
| X | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ / ✓ | P (selon accès) | P | ✗ / ✓ | OAuth 2 PKCE | **payant** : ≈ 0,015 $/post, 0,20 $ avec lien, lectures facturées |
| Bluesky | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ / ✓ | ✓ / ✓ (API chat) | ✗ (flux/sondage) | ✗ / ✓ | OAuth ATProto | aucune, gratuit |
| Mastodon | ✓ | ✓ | ✓ | ✓ (côté instance) | ✓ | ✓ / ✓ | ✓ (messages directs) | ✓ (flux/push) | ✓ / ✓ | OAuth par instance | aucune, gratuit |
| PeerTube | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ / ✓ | ✗ | P | ✓ / ✓ | OAuth par instance | aucune |
| LinkedIn | ✓ | ✓ | ✓ | ✓ | P | Rev (Community Management) | ✗ | Rev | P / ✓ | OAuth | profil : libre ; page/commentaires : Rev |
| Pinterest | ✗ | ✓ (épingle) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ / ✓ | OAuth | accès d'essai puis Rev |
| Reddit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ / ✓ | P | ✗ | ✓ / ✓ | OAuth | usage commercial : accord |
| Tumblr | ✓ | ✓ | ✓ | ✓ | ✓ | P | ✗ | ✗ | ✓ / ✓ | OAuth | aucune |
| Dailymotion | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ / ✓ | OAuth | compte partenaire |
| Snapchat | Ass (Creative Kit) | Ass | Ass | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✗ publication autonome |
| Telegram | ✓ (bot admin d'un canal) | ✓ | ✓ | ✓ | P | P (groupe lié) | ✓ (messages au bot) | ✓ | ✓ / ✓ | jeton de bot (serveur) | aucune |
| Discord | ✓ (bot/webhook d'un salon) | ✓ | ✓ | ✓ | ✓ | ✓ (fils) | ✓ (au bot) | ✓ (gateway) | ✓ / ✓ | OAuth bot | aucune |
| WhatsApp Business | ✗ (pas de publication) | — | — | — | — | — | ✓ (24 h, modèles) | ✓ | — | numéro pro + Meta | Rev + facturé par conversation |
| Slack, Matrix | outils d'équipe : ✓ techniquement, hors réseau social | | | | | | | | | | |
| Steamworks | ✗ annonces (portail seulement, aucune méthode d'écriture) | | | | lecture des news ✓ | | | | | clé éditeur | build : SteamPipe (`steamcmd` + compte constructeur) |
| Heroku | déploiement : Platform API ✓ (builds, releases, retour arrière) | | | | | | | | | OAuth | plateforme en « sustaining engineering » depuis fév. 2026 |
| GitHub Pages | site statique : ✓ (API + Pages) | | | | | | | | | OAuth | aucune |

Ordre d'intégration proposé (faisabilité × intérêt) :
1. **Meta** : Pages Facebook (publication + commentaires + Messenger), Instagram pro (publication + commentaires + MP),
   Threads (même app). Code de publication déjà là (Rust) ; il manque réception, réponse, webhooks, multi-comptes.
2. **Ouverts et gratuits, testables tout de suite** : Bluesky, Mastodon (et PeerTube, même famille), Telegram, Discord.
3. **YouTube** (vidéo + commentaires), **TikTok** (publication seule, déjà codée, audit à passer), **LinkedIn** profil.
4. Selon ton choix : X (payant), Pinterest, Reddit, Tumblr, Dailymotion.
5. Écartés (raison réelle) : Snapchat (aucune publication autonome), WhatsApp Business (pas de publication, numéro
   pro + facturation), Steam annonces (aucune API d'écriture), Heroku (voir question 4).

## 3. Simplification des parcours

Cas : « publier cette vidéo sur Instagram et TikTok », aucun compte connecté.

| | Aujourd'hui | Proposé |
| --- | --- | --- |
| Connexion | ⌂ → Réglages → Communication → Réseaux sociaux → Connecter Instagram → page officielle → retour → Connecter TikTok → page officielle → retour → fermer (≈ 9 actions, 3 changements de contexte, l'opération n'est pas encore commencée) | Dans Publier, toucher la tuile Instagram non connectée ouvre directement la page officielle ; au retour la tuile est connectée ET choisie, le texte et le média intacts (1 action + l'autorisation chez le fournisseur) |
| Publication | média → Envoi → Publier → tuiles → Envoi ; une tuile non connectée part en silence vers la feuille de partage | média → Envoi → tuiles → Envoi (3 actions) ; aucune tuile choisie d'office ; les dernières destinations en tête de la grille, jamais pré-cochées |
| Options d'un réseau | carte TikTok déjà dans Publier | idem, et seulement la carte du réseau choisi qui en exige (YouTube : titre + visibilité) |
| Retrouver les réactions | aucune | commentaires et MP arrivent dans la même boîte (outil d'état, liste en attente), rangés par publication et par réseau ; Répondre part d'office vers la plateforme d'origine |
| Doublon à supprimer | Communication › « Publier sur les réseaux » (2e surface de publication) | retirée : Publier est le seul chemin (son suivi d'envois rejoint Publier / l'Agenda) |

## 4. Maquettes (une par une, validation avant la suivante)

Dossier : `temp/publish_universal_2026-11-16/mockups/`. Captures réelles de référence : `temp/probe_reports/dashboard_enhancement/publish_universal_capture_{phone,desktop}/`.

- [x] M1 Connexion des comptes (Réglages › Communication › Réseaux sociaux) — téléphone portrait, paysage, bureau — **validée le 16 nov.** (`mockups/M1_connexion_comptes.png`)
- [x] M2 Publication multiréseau (Publier, tuiles, connexion dans la tuile) — **validée le 16 nov.** (`mockups/M2_publier_multireseau.png`)
- [x] M3 Options nécessaires (carte du réseau choisi) — **validée le 16 nov.** (`mockups/M3_options_reseau.png`)
- [x] M2 bis Réseaux gardés par profil, grille derrière « Où » — **validée le 16 nov., variante 2B** (`mockups/M2bis_reseaux_gardes.png`)
- [x] M4 Réception (outil d'état / liste en attente avec provenance) — validée 16 nov. (`mockups/M4_reception.png`, `build_m4.mjs`)
- [x] M5 Conversation et réponse vers l'origine — envoyée 16 nov. (`mockups/M5_reponse_origine.png`, `build_m5.mjs` ; fond réel : conversation du Dashboard, sonde `capture/inbox.probe.mjs`), validée 16 nov.
- [x] M6 Programmation et résultats (Agenda, suivi par destination) — envoyée 16 nov. (`mockups/M6_programmation_resultats.png`, `build_m6.mjs` ; fonds réels : Quand › Plus tard, Agenda › Rendez-vous, rangée de l'enveloppe), validée 16 nov.
- [x] M7 Compte absent ou expiré, reprise de l'action — envoyée 16 nov. (`mockups/M7_relier_puis_reprendre.png`, `build_m7.mjs`), validée 16 nov.

## 5. Questions à l'utilisateur

Voir R-190 dans `todo/REGISTRE_DEMANDES.md` (comptes possédés, apps développeur, X payant, Steam/Heroku).

## 5 bis. Architecture validée (16 nov., après M1–M7 et les 6 points)

Contrats partagés (une seule source ; le Rust et le JS les suivent mot pour mot) :

- **Réseaux** : `tiktok, instagram, facebook, threads, youtube, linkedin, bluesky, mastodon, telegram, discord`
  (`SOCIAL_NETWORKS`, `atome/src/squirrel/social/contracts.js` ; miroir Rust `providers/social/sessions.rs` `Network`).
  X non codé ; Steam, Heroku abandonnés.
- **Comptes multiples** : l'enregistrement du coffre `social.<réseau>` porte `accounts: [{ account, label, identity,
  scopes, enabled, tokens… }]` (jetons jamais vers le client). Destination = `<réseau>:<account>` (Facebook garde
  `facebook:page:<id>` ; l'ancien `instagram`/`tiktok` seul = le premier compte). Op `social.accounts` → `{ networks:
  [{ network, configured, accounts: [{ account, label, identity, state: connected|expired|disabled }] }] }`.
- **Faux fournisseurs** : chaque adaptateur lit son URL de base dans `SOCIAL_API_BASE_<RÉSEAU>` (vide = l'officielle) ;
  `SOCIAL_FAKE_PROVIDERS=1` accepte une app de test sans secret réel. Les sondes montent un faux serveur HTTP local.
- **Auth** : OAuth officiel partout où il existe (Meta pour Facebook/Instagram/Threads, Google pour YouTube, LinkedIn,
  TikTok, Mastodon par instance avec enregistrement d'app dynamique, Bluesky OAuth atproto). Telegram (jeton de robot +
  canal) et Discord (URL de webhook ou robot) : saisis une fois dans l'accordéon du réseau (M1), gardés au coffre serveur.
  Jamais de mot de passe de réseau dans eVe.
- **Réception** : entrée de la pile de notifications, `kind` `social-message` (MP) ou `social-comment`, plus un champ
  `origin` gardé par les deux listes blanches (Rust `social/notification_stack.rs`, JS `communication_notifications.js`) :
  `{ network, account, kind: dm|comment|mention, thread, remote_id, post: { id, url, title, job_id }, author: { id, name,
  handle, avatar_url }, reply: { mode: dm|comment|none, until, private_until } }`. Entrées : webhook Meta signé
  (`POST/GET /api/social/webhook/meta`, X-Hub-Signature-256) ; relève périodique (60 s) pour les autres (Bluesky,
  Mastodon, YouTube, LinkedIn, Telegram, Discord). Tout message reçu est aussi gardé sur atome (règle 21) dans le fil
  `social/threads/<réseau>/<account>/<thread>` du coffre de la personne ; effacé au retrait du réseau.
- **Réponse** : op `social.reply { notification_id | origin, text, attachment_ids?, private? }` → envoie par l'adaptateur
  du réseau d'origine seul (MP, réponse sous un commentaire, réponse privée Instagram), garde la réponse dans le même fil,
  rend `{ status, remote_id }` ou l'erreur (`social_reply_window_closed`, `social_session_expired`…). Op
  `social.thread.read { network, account, thread, cursor? }` → `{ items, nextCursor }` au format des messages de la
  conversation (`box: sent|inbox`, `origin`).
- **Publier** : destinations gardées par profil de vie (préférence serveur, la même que `underActiveLifeProfile`) ; le Fil
  eVe toujours inclus, jamais décochable ; outil « Où » (grille), 2B (petits disques dans la carte) ; tuile d'un réseau non
  relié → `connect.start` puis reprise du brouillon (M7) ; résultat par destination dans le mode programmé (M6), seul un
  échec arrive dans l'enveloppe ; Réess. = destinations en échec seules.
- **MCP** : `social.accounts`, `social.reply`, `social.thread.read` ajoutés à la famille `social` (confirmation exigée pour
  `social.reply`) ; `publish.*` prend les destinations gardées par défaut.

Précisions du lot R (16 nov.) : identifiant de destination
`^(facebook:profile|facebook:page:[0-9]{1,40}|(tiktok|instagram|threads|youtube|linkedin|bluesky|mastodon|telegram|discord)(:[A-Za-z0-9._@-]{1,120})?)$`
(schémas `social/contracts.js`, `publish/contracts.js`, `public_events/contracts.js`, puis `npm run registry:build`) ;
ops `social.connect.start { network, instance?, handle? }`, `social.disconnect { network, account? }` (efface les fils
gardés), `social.account.enable { network, account, enabled }`, `social.credentials.save { network, fields }` ;
`social.reply` → `{ status: "sent", remote_id, item }` ; erreurs `social_reply_window_closed`, `social_reply_unsupported`,
`social_account_not_found`, `social_credentials_invalid` ; options `options.<réseau>` (`options.youtube = { title,
visibility }`) ; entrées de pile `social_<réseau>_<hash>`. Disque d'un réseau : propriétaire unique
`eVe/intuition/tools/social_network_disc.js` (lot F). Retouches hors couloir accordées par l'orchestrateur :
`providers/credentials.rs`, `providers/mod.rs`, `web.rs` (webhook dans la branche sociale existante, signature vérifiée
d'abord), `main.rs` (relève seulement des comptes reliés).

Lots : **R** serveur Rust (comptes multiples, 7 adaptateurs, réception, réponse, fil gardé, faux fournisseurs) ;
**E** Publier (Où, gardés par profil, Fil eVe forcé, 2B, relier dans la tuile + reprise, résultats M6) ; **F** réception
et conversation (disques de provenance, regroupement des commentaires, filtre par le champ, fil réseau M5) ; **G** comptes
M1 (Réglages), retrait de « Publier sur les réseaux » de Communication, client JS `social.*`, contrats, MCP.

## 6. Journal des décisions

- 16 nov. — M1 validée (« M1 validée ») : même place (Réglages › Communication › accordéon « Réseaux sociaux », vers le
  haut) ; une rangée par réseau configuré sur le serveur (les autres cachés), disque + nom + identité renvoyée ou
  « Expirée » ; toucher une rangée non connectée ouvre la page officielle ; une rangée connectée se déplie (comptes /
  Pages, autorisations, case à gauche ; décocher = désactiver sans effacer, ou retirer l'autorisation chez le réseau) ;
  outils du compte déplié dans la bande de pied : Ajouter, Reconnex., Déconnex. (deux touches), ✕. Question 5 réglée
  par cette validation (bande de pied, pas l'appui long).
- 16 nov. — M2 validée (« M2 validée ») : Publier reste le seul panneau ; tuiles dans l'ordre dernières destinations
  (jamais cochées d'office) → Fil eVe → réseaux → forums → personnes ; une tuile par compte ou Page (nom coupé à 9 +
  « … ») ; seuls les réseaux configurés ; média sélectionné joint d'office ; Communication › « Publier sur les
  réseaux » retiré ; l'assistant ouvre Publier prérempli et attend Envoi.
- 16 nov. — M3 validée (« Oui, je valide M3 »).
- 16 nov. — **Parcours décidé par l'utilisateur** (remplace « jamais cochées d'office » de M2) : les réseaux sont choisis
  une fois au départ, puis gardés ; Publier publie toujours au même endroit sans reposer la question ; la grille des
  destinations n'est plus montrée à chaque fois, un petit outil la déplie pour changer ; une réponse à un message reçu
  d'un réseau repart dans ce réseau seul, sans question ; tout est aussi « alimenté » sur atome, qui possède tous les
  messages. Le moins de panneaux et de questions possible. Points remontés à l'utilisateur (16 nov.) : les destinations
  gardées ne valent que pour une publication (jamais un envoi à une personne, une ordonnance, un partage de liste) ;
  TikTok impose « qui voit » à chaque envoi ; un réseau qui ne prend pas le contenu (texte seul vers TikTok/YouTube/
  Instagram) est sauté et nommé au résultat ; les messages reçus vivent en privé dans le compte atome (jamais sur le
  Fil public) et s'effacent si la personne le demande ou retire le réseau. En attente : copie de chaque publication sur le Fil eVe toujours ou décochable .
- 16 nov. — Destinations gardées **par profil de vie** (« Par profil ») : chaque profil garde ses réseaux.
- 16 nov. — M2 bis validée, **variante 2B** (« 2B avec rappel ») : outil « Où » entre Médias et Quand ; première fois sous un profil = grille dépliée ; ensuite grille repliée et une ligne de petits disques des destinations gardées dans la carte du texte.

- 16 nov. — M7 validée et les 6 points validés : grille = Facebook Pages, Instagram, Threads, YouTube, TikTok, LinkedIn, Bluesky, Mastodon, Telegram, Discord ; code contre faux fournisseurs, apps développeur plus tard avec guide ; X non codé ; Steam et Heroku abandonnés sans remplaçant. **Fil eVe : TOUJOURS coché, jamais décochable** (« il faut absolument qu'on soit viral … mieux vaut trop que pas assez ») : toute publication l'alimente, sa tuile reste choisie et ne se décoche pas, son disque toujours premier.

- 16 nov. (soir) — Code fini : lots G (contrats, Réglages), E (Publier), F (réception, réponse), R (serveur Rust) ; sondes de bout en bout sur le vrai serveur (Telegram 25/25, YouTube 17/17) ; recette §7, guide des apps §8. Les livraisons d'un envoi programmé portent leur `job_id` (Suppr. possible après coup).

## 7. Recette par plateforme (16 nov., état réel)

Trois niveaux, jamais confondus :
- **codé** : le code existe et compile ;
- **testé en simulation** : une sonde l'a fait passer contre un faux fournisseur, qui répond comme le réseau ;
- **validé en production** : il a tourné contre le vrai réseau, avec une vraie app développeur.

**Aucun réseau n'est validé en production.** Aucune app développeur n'existe encore (décision du 16 nov., guide §8).

| Réseau | Lien | Publier | Recevoir | Répondre | Suppr. | Niveau |
| --- | --- | --- | --- | --- | --- | --- |
| Telegram | jeton du robot + canal | texte, image, vidéo | relève 60 s | message privé, réponse dans le canal | oui | testé en simulation, de bout en bout (vrai serveur, sonde `integration/telegram_e2e`, 21/21) |
| YouTube | OAuth Google | vidéo (titre, visibilité, « pour enfants » obligatoires) | relève 60 s des commentaires, avec la miniature | sous un commentaire, ou nouveau commentaire sur la vidéo | oui | testé en simulation, de bout en bout (OAuth, relève, réponses, révocation : `integration/youtube_e2e`, 17/17) ; l'envoi de la vidéo n'est testé qu'en test unitaire Rust |
| Mastodon | OAuth sur l'instance (atome s'y inscrit) | texte, image, vidéo | relève 60 s (mentions, messages directs) | oui (même visibilité) | oui | testé en simulation (test Rust contre faux serveur) |
| Discord | lien de webhook (+ robot pour lire) | texte, image, vidéo | relève 60 s du salon (messages directs non lus : il faudrait la Gateway) | réponse dans le salon | oui | testé en simulation (test Rust contre faux serveur) |
| Bluesky | OAuth atproto (PAR, PKCE, DPoP) | texte ≤ 300 (texte court proposé), image ; vidéo envoyée comme blob | relève 60 s (notifications, chat) | oui (racine et parent) | oui | testé en simulation (tests unitaires Rust) |
| Threads | OAuth Meta | texte ≤ 500 (texte court proposé), image, vidéo | webhook Meta signé + relève | oui | oui | testé en simulation (tests unitaires Rust) |
| Facebook Pages | OAuth Meta, une tuile par Page | texte, image, vidéo ; modification après coup | webhook Meta signé (Messenger + commentaires) | oui (sans pièce jointe) | oui | testé en simulation (tests unitaires Rust) |
| Instagram | OAuth Meta (compte pro) | image, vidéo (pas de texte seul) | webhook Meta signé | réponse au commentaire ; réponse privée dans les 7 jours | non (l'API ne le permet pas) | testé en simulation (tests unitaires Rust) |
| TikTok | OAuth TikTok | vidéo, photos ; « qui voit » demandé à chaque envoi | rien (l'API n'ouvre ni commentaires ni messages) | non | non (l'API ne le permet pas) | testé en simulation (existant + options) |
| LinkedIn | OAuth LinkedIn | texte, image, vidéo | commentaires seulement après la revue « Community Management » de LinkedIn | oui (après cette revue) | oui | testé en simulation (tests unitaires Rust) |
| Fil eVe | interne | toujours coché, jamais décochable | — | — | — | codé ; sondes Publier du lot E |

Communs, testés en simulation contre le vrai serveur :
- aucun jeton ni secret dans les réponses ni dans les journaux du serveur ;
- webhook Meta sans signature → 401 ;
- déconnexion : révocation chez le réseau et fils gardés effacés.

Côté interface :
- Réglages › Réseaux sociaux (M1) : Playwright 10/10, téléphone et bureau ;
- Publier (M2–M3, M6) : Playwright 17/17 ;
- réception et réponse à l'origine (M4–M5) : Playwright 18/18.

Hors périmètre, par décision : X, Steam, Heroku.

## 8. Guide — créer les apps développeur (à faire plus tard, par l'utilisateur)

Tout se règle sur le serveur, par ses variables d'environnement. Rien ne va dans le navigateur ni dans le dépôt.
Pour chaque réseau, l'adresse de retour à déclarer chez lui est `https://<domaine>/api/social/oauth/callback/<réseau>`, avec `SOCIAL_PUBLIC_BASE_URL=https://<domaine>`.

1. **Meta** (Facebook Pages, Instagram, Threads) — developers.facebook.com › Créer une app › type « Entreprise ».
   - Produits : Facebook Login for Business, Instagram API (compte professionnel), Threads API, Webhooks.
   - Autorisations à faire approuver (App Review) :
     - Facebook : `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_messaging` ;
     - Instagram : `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages` ;
     - Threads : `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`, `threads_delete`.
   - Variables : `FACEBOOK_APP_ID/SECRET`, `INSTAGRAM_APP_ID/SECRET`, `THREADS_APP_ID/SECRET`.
   - Webhooks : adresse de rappel `https://<domaine>/api/social/webhook/meta`, jeton de vérification = `META_WEBHOOK_VERIFY_TOKEN` (une valeur longue choisie au hasard) ; abonner `messages`, `feed` et `comments`.
2. **Google / YouTube** — console.cloud.google.com.
   - Projet › activer « YouTube Data API v3 » › écran de consentement (externe) › identifiants OAuth « Application Web ».
   - Autorisations : `youtube.upload`, `youtube.force-ssl`, `youtube.readonly` ; la vérification Google est obligatoire pour publier en public.
   - Variables : `YOUTUBE_CLIENT_ID/SECRET`.
3. **TikTok** — developers.tiktok.com › Créer une app.
   - Produits : Login Kit + Content Posting API (Direct Post).
   - Autorisations : `user.info.basic`, `video.upload`, `video.publish` (Direct Post, à faire approuver par TikTok ; `TIKTOK_DIRECT_POST=0` s'en passe et laisse la personne finir l'envoi dans l'app TikTok).
   - L'audit de TikTok est nécessaire pour publier en public : sans lui, tout reste privé. Une fois l'audit obtenu, `TIKTOK_AUDITED=1`.
   - Variables : `TIKTOK_CLIENT_KEY/SECRET`.
4. **LinkedIn** — linkedin.com/developers › Créer une app, liée à une page.
   - Produits : « Share on LinkedIn » et « Sign In with OpenID Connect » (`openid`, `profile`, `w_member_social`).
   - « Community Management API » pour lire les commentaires : c'est une revue LinkedIn, puis `LINKEDIN_COMMUNITY=1`.
   - Variables : `LINKEDIN_CLIENT_ID/SECRET`.
5. **Sans app à créer :**
   - Bluesky : atome se présente par `GET /api/social/oauth/client-metadata/bluesky.json`.
   - Mastodon : atome s'inscrit sur chaque instance.
   - Telegram et Discord : chaque personne colle le jeton de son robot ou le lien de son webhook dans Réglages.

Une fois les apps créées : publier d'abord sur un compte de test, puis seulement passer la ligne du réseau à « validé en production » au §7.
