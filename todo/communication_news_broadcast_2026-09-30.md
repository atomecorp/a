# Communication, partage temps réel et News diffusées — cahier des charges (30 sept. 2026)

Documents antérieurs dont ce cahier prend la suite (ne pas les rouvrir) :
`news_feature_2026-09-09.md`, `news_templates_stacking_2026-09-10.md`,
`debug_communication_notifications_publications_2026-09-01.md`, `communication_refonte.md`,
`sharing_search_monitoring/Share_tool.md`. Tâche séparée : `visio_client_2026-09-30.md`.

## Règle de complétion (non négociable)

- Chaque case ci-dessous n'est cochée qu'avec une **preuve d'exécution** consignée dans la
  section « Journal » : nom de la probe, commande, sortie résumée.
- La preuve est obtenue **avec plusieurs comptes réels** (client WebSocket authentifié et/ou
  navigateur Playwright, un contexte par compte) contre le vrai serveur Fastify. Un mock de
  géométrie ou de serveur ne vaut pas preuve.
- Rouge d'abord : l'état avant correction est mesuré et noté.
- Tauri et iOS : « non vérifié » tant que leur voie réelle n'a pas été exécutée.
- La tâche n'est terminée que lorsque **toutes** les cases sont cochées.

## Décisions produit

- **D1 — Audience des News.** Tout utilisateur est abonné par défaut. Il porte une
  **liste blanche de tags** : vide = tous les tags ; dès qu'il coche des tags, il ne reçoit
  plus que les News portant au moins un de ces tags.
- **D2 — Tags.** Trois sources, un seul espace de slugs (`slugifyNewsTag`) :
  - **tags de type**, posés automatiquement d'après l'`atomeType` des atomes contenus
    (`video`, `audio`, `image`, `text`) — jamais d'après le type de rendu — et
    **retirables par l'auteur** ;
  - **vocabulaire système** (`news_tag_vocabulary.js`) ;
  - **tags libres** créés par les utilisateurs (« École privée Clermont-Ferrand »,
    « Cueillette des champignons à Nolande »).
  On peut s'abonner à n'importe quel tag. Un **registre serveur** des tags publiés
  (slug, libellé, compteur) permet de rechercher les tags libres et de mettre les gens en
  relation.
- **D3 — Premier contact.** Toute communication pair-à-pair (message, partage, appel)
  exige que le destinataire ait **accepté** l'émetteur. Avant acceptation, seule une
  **demande de contact** passe. La diffusion par tags n'exige aucune acceptation.
- **D4 — Blocage.** Appliqué **par le serveur, partout** : messages, demandes de contact,
  partages, appels, et News de la personne bloquée (dans les deux sens). Réglé depuis la
  fiche Contact. La personne bloquée **n'est pas prévenue** (réponse d'envoi indiscernable
  d'un succès côté expéditeur, aucune notification côté destinataire).
- **D5 — Audio / vidéo.** Notes vocales et vidéo envoyées à un contact accepté, reçues et
  lues. Failles d'identité de la visio corrigées. Le client d'appel est hors périmètre.
- **D6 — Médias d'une News.** Lus **en lecture seule, liés à l'original** : aucun fichier
  copié chez l'abonné ; une correction de l'auteur se propage.
- **D7 — Une seule chaîne de publication.** « Nouveau » du Dashboard, le rail News et
  « partager un projet à tout le monde » appellent la **même** API. Le Dashboard disparaîtra :
  la réception alimente aussi l'outil Communication du bas.

## Contrats d'API

### Serveur — WebSocket `/ws/api` (connexion authentifiée, identité = session)

| Trame | Rôle |
|---|---|
| `{type:'contact', action:'request', toUserId, note?}` | demande de contact (seul envoi autorisé avant acceptation) |
| `{type:'contact', action:'respond', fromUserId, decision:'accept'\|'refuse'\|'block'}` | réponse du destinataire |
| `{type:'contact', action:'block'\|'unblock', userId}` | blocage explicite |
| `{type:'contact', action:'list'}` | contacts acceptés, demandes en attente, bloqués |
| `{type:'news', action:'publish', projectId, title, summary, tags[], audience:'all'\|{group:[ids]}, payload}` | publication unique ; fan-out serveur |
| `{type:'news', action:'subscriptions-get'}` / `subscriptions-set, tags[]` | liste blanche de l'utilisateur (vide = tout) |
| `{type:'news', action:'tags-search', query, limit}` | registre des tags (slug, label, count) |
| `direct-message` (existant) | refusé si pas de contact accepté ou si blocage ; `kind` limité à une liste blanche |

Stockage de la relation : `sync_share_policies` (existant) — `always` = contact accepté,
`block` = bloqué, `never` = refusé. Pas de table parallèle.

### Client squirrel — `AdoleAPI.contacts`, `AdoleAPI.news`

Enveloppes 1:1 des trames ci-dessus.

### eVe — `window.eveNews` (façade indépendante du Dashboard)

- `compose({ template })` → crée le projet News (`createNewsThread`).
- `publish(projectId, { tags, audience })` → tague `news` si besoin, calcule les tags de
  type, envoie `news/publish`.
- `subscriptions.get()` / `subscriptions.set(tags)`.
- `tags.search(query)`.
- `onReceived(listener)` → appelé à chaque News reçue (Dashboard et outil Communication).

## Lots et vérifications

### L0 — Harnais multi-comptes
- [x] `temp/comm/comm_harness.mjs` : N comptes via le flux phone-link (`SQUIRREL_AUTH_SMS_MOCK=1`),
      un client WS authentifié et/ou un contexte Playwright par compte.

### L1 — État des lieux (mesuré avant correction)
- [x] Message direct A→B en ligne.
- [x] Message direct A→B hors ligne, relu à la connexion de B.
- [x] Partage temps réel : A modifie un atome partagé, B reçoit l'événement.
- [x] Partage : écriture de B sur une propriété non autorisée refusée.
- [x] Partage : révocation coupe la propagation.
- [x] News publiée à « tout le monde » reçue par un second compte (chemin actuel).

### L2 — Sécurité des messages directs
- [x] Le destinataire voit l'identité **serveur** même si l'expéditeur forge `fromName`/`fromId`.
- [x] `kind` hors liste blanche refusé.
- [x] Le téléphone de l'expéditeur n'est pas transmis.
- [x] Rafale de messages limitée (erreur explicite au-delà du débit).
- [x] Message trop long refusé.

### L3 — Premier contact et blocage
- [x] Message A→B sans contact accepté : refusé (`contact_required`).
- [x] Demande de contact A→B : B reçoit une notification de demande.
- [x] B accepte : A→B et B→A passent.
- [x] B refuse : A ne peut toujours pas écrire.
- [x] B bloque A : message, demande de contact, partage de A vers B refusés **sans
      que A le sache**, aucune notification chez B. (Appel : voir L9.)
- [x] Partage `action:'create'` sans consentement : refusé.
- [x] Déblocage rétablit l'état antérieur.
- [x] Interface fiche Contact : accepter / refuser / bloquer / débloquer. (`bevy_panel_home_relation.js` ; demande reçue aussi traitable depuis la notification : Accepter / Refuser / Bloquer. Vérifié dans l'app réelle au niveau des fonctions des boutons ; clic pointeur sur le canvas non joué.)

### L4 — Diffusion serveur des News
- [x] `news/publish` : une publication, reçue par tous les comptes abonnés, sans boucle client.
- [x] Un destinataire en échec n'empêche pas les suivants.
- [x] Audience `group` : livrée aux seuls contacts du groupe, avec la publication complète
      (serveur). Matérialisation du projet chez le destinataire : vérifiée en L7.
- [x] L'auteur ne se notifie pas lui-même.

### L5 — Tags et abonnements
- [x] Tags de type posés automatiquement (News avec vidéo → `video`).
- [x] Tag de type retiré par l'auteur : absent de la publication (`removedTypeTags` / `news_removed_type_tags`, filtré dans `news_publish_api.js` ; exercé au niveau module, pas par une UI dédiée).
- [x] Tag libre créé, publié, trouvé par `tags-search` depuis un autre compte.
- [x] Liste blanche vide : tout reçu.
- [x] Liste blanche `video` : News `video` reçue, News `health` seule non reçue.
- [x] Abonnement à un tag libre : News portant ce tag reçue.
- [x] Blocage : aucune News de la personne bloquée reçue (dans les deux sens).
- [x] Interface d'abonnement (cases + recherche) : panneau Tags en mode `subscribe` (`window.__eveTags.openSubscriptions()`).

### L6 — Médias en lecture seule liés
- [x] L'abonné affiche le média de la News sans copie de fichier.
- [x] L'abonné ne peut pas modifier le média.
- [x] L'auteur corrige le média : l'abonné voit la correction (à la republication de l'auteur ; pas en direct sans republication).

### L7 — API News indépendante du Dashboard
- [x] `eveNews.publish` publie sans passer par le Dashboard.
- [x] « Partager un projet à tout le monde » produit le même résultat que « Nouveau ».
- [x] `onReceived` notifié à chaque réception.

### L8 — Outil Communication du bas
- [x] Une News reçue apparaît dans l'outil et défile avec les messages non lus.
- [ ] Inbox (`communication_inbox_*`) rebranchée ; un seul bandeau sur l'outil. **Décision produit attendue** : le bandeau de l'inbox et la boîte de saisie du ruban (`communication_input_tool.js`) se disputent le même emplacement de l'outil.

### L9 — Audio / vidéo
- [x] Note vocale A→B (contact accepté) : reçue et lisible par B.
- [x] Note vidéo A→B : reçue et lisible par B.
- [x] Visio : `auth` par simple téléphone refusé.
- [x] Visio : en-têtes `x-user-id`/`x-phone` forgés sans jeton refusés.
- [x] Visio : `joinRoom` d'une room dont on n'est pas membre refusé.
- [x] Visio : invitation d'un non-contact ou d'un bloqueur refusée.

## Journal

(Preuves d'exécution, lot par lot.)

### 30 sept. — L0 harnais
`node temp/comm/l0_harness.probe.mjs` → 2/2 PASS. Instance Fastify isolée (port aléatoire, SQLite et
coffres temporaires, `SQUIRREL_AUTH_SMS_MOCK=1`), comptes créés par le vrai flux phone-link.
Reconnexion sans SMS : `auth me` + jeton de session (un nouveau lien serait bloqué par la limite
1/min/numéro).

### 30 sept. — L1 état des lieux (avant correction)
`node temp/comm/l1_baseline.probe.mjs` → 11/16 PASS.
- Verts (existant fonctionnel) : DM en ligne (identité serveur), DM hors ligne mis en file puis
  livré à la reconnexion, atome créé, demande de partage `pending`, acceptation, **patch de A reçu
  en temps réel par B sur `/ws/sync`**, écriture de B refusée (`property_write_denied`),
  révocation (`revoked`, plus rien ne fuit), publication via message reçue.
- Rouges (failles, à corriger en L2/L3) : un non-contact peut écrire ; téléphone de l'expéditeur
  transmis au destinataire ; **téléphone du destinataire renvoyé à l'expéditeur**
  (`receiver_phone`) ; `kind:'share-request'` forgé accepté ; `share create` actif sans
  consentement.
- Défaut annexe : après `auth me` sans jeton par trame, `_wsApiAuthExpMs` reste `null` →
  `resolveWsApiPrincipal` détache la connexion (`Number(null)=0`). Sans effet sur l'app (elle
  joint son jeton à chaque écriture).

### 30 sept. — L2/L3 serveur
Nouveaux modules : `server/communication_relations.js` (contact accepté dans
`communication_contacts`, blocage dans `sync_share_policies` — une policy `always` aurait
auto-accepté tous les partages, d'où la table dédiée), `server/communication_delivery.js`
(garde des messages : enveloppe `eve-comm-share` seule, `kind` ∈ {message, share-request},
128 Ko / 8000 caractères, 30 messages / 10 s, identité réécrite par le serveur, aucun
téléphone relayé). `share create` suit désormais le chemin `request`. Client :
`adole_websocket_message.js` préfère l'identité serveur.
`node temp/comm/l2_l3_contact_security.probe.mjs` → **28/28 PASS** (3 comptes) ;
`node temp/comm/l1_baseline.probe.mjs` (mis à jour : contacts établis) → **16/16 PASS**.
Limite connue : un message vers un destinataire qui vous a bloqué répond comme un
destinataire hors ligne (`queued:true`) ; un expéditeur qui saurait B en ligne pourrait le
déduire.

### 30 sept. — L4/L5 serveur
`server/news_broadcast.js` + trame `news` (`publish`, `subscriptions-get/set`, `tags-search`) ;
tables `news_publications`, `news_subscriptions`, `news_tags`. Un message direct ne peut plus
porter de `publication`. Auteur imposé par la session ; une publication d'autrui ne peut pas
être réécrite ; 10 publications / min.
`node temp/comm/l4_l5_news_broadcast.probe.mjs` → **16/16 PASS** (4 comptes) : diffusion à
tous y compris profils privés, auteur non notifié, liste blanche (vidéo / tag libre / santé),
tag libre trouvable, blocage dans les deux sens, groupe limité aux contacts, publication
présente dans la pile persistée, tolérance aux échecs (module réel, destinataire qui lève).

### 30 sept. — L9 visio (serveur)
Jeton = session d'appareil valide (`iss`/`aud atome-ws` + `assertDeviceSessionClaims`, donc
révocation prise en compte) ; plus d'authentification par téléphone ni d'en-têtes d'identité ;
`joinRoom` exige l'authentification et le droit d'entrer (`canJoinRoom` : propriétaire, invité,
public, contacts du propriétaire, jamais en cas de blocage) ; inviter exige un contact accepté
non bloqué ; `/contacts/*` de la visio délègue à `communication_relations` (plus de carnet en
mémoire parallèle). Les routes lisaient `auth.id` alors qu'une session porte `sub` : une vraie
session était refusée (401) — corrigé.
- Rouge d'abord : `COMM_SERVER_ROOT=<git archive HEAD> node temp/comm/l9_visio_security.probe.mjs`
  → **3/13** (auth par téléphone acceptée, en-têtes forgés acceptés, session valide refusée en HTTP).
- Après : `node temp/comm/l9_visio_security.probe.mjs` → **13/13 PASS** (3 comptes ; `joinRoom`
  réel avec routeur mediasoup).

### 30 sept. — L6 médias de News (lecture seule liée)
Serveur : à la publication, seuls les médias **possédés par l'auteur** sont gardés et leur source
est réécrite en `/api/uploads/<id du fichier>` (sinon citer l'id d'un média d'autrui suffisait à
en ouvrir la lecture) ; `canAccessFile` accepte des résolveurs de lecture (`setFileReadResolver`)
liés au **propriétaire du fichier** : `news` (compte réel, non bloqué, destinataire selon ses
tags ou le groupe) et `sync_share` (partage accepté). Client : la publication porte
`media_src`, la réception crée un atome média local **verrouillé** qui pointe sur le fichier de
l'auteur (`ensureNewsMediaReference`), rafraîchi à la republication.
`node temp/comm/l6_news_media.probe.mjs` → **11/11 PASS**.

### 30 sept. — L9 notes vocales et vidéo
`node temp/comm/l9_media_notes.probe.mjs` → **10/10 PASS** : note notifiée au contact
(`share-request` vérifié côté serveur), acceptée, atome rejoué par `/ws/sync`, fichier joué par
son nom d'origine ET par id, jamais par un tiers.

### 30 sept. — Rouge d'abord (défauts présents sur HEAD)
`node temp/comm/red_head.probe.mjs` : **HEAD 0/4 → corrigé 4/4** — téléchargement anonyme d'un
fichier privé par son nom (chemin « sans propriétaire » qui servait tout fichier), note partagée
acceptée injouable (403 : `canAccessFile` ignorait les partages de synchronisation), expéditeur
bloqué toujours livré, fausse News forgée par message direct acceptée.

### 30 sept. — L7/L8/L5/L3 dans de vrais navigateurs
`node temp/comm/l7_l8_browser.probe.mjs` → **15/15 PASS** : deux navigateurs Chromium
(Playwright, SwiftShader, un contexte par compte) contre l'instance isolée (seul
`server_config.json` est intercepté pour annoncer son port ; `__SQUIRREL_FORCE_FASTIFY__`).
- `eveNews.compose` + `eveNews.publish` sans Dashboard → diffusion serveur à Bob ; tag de type
  `video` automatique ; `onReceived` ; projet tagué `news` avec la contribution de l'auteur chez
  Bob ; **carte dans la rangée News du Dashboard** ; notification `publication` non lue ;
  **l'outil Communication fait défiler « Premier post de test »** ; partager un projet ordinaire
  à tous = même chaîne ; panneau d'abonnement → liste blanche `video` enregistrée → une News
  `health` n'arrive pas ; bloquer/débloquer depuis les fonctions de la fiche ; aucune erreur de page.
- Capture d'écran noire : SwiftShader headless ne compose pas le canvas WebGPU → **aucune
  vérification visuelle** ; les preuves sont l'état de l'application.

Défauts préexistants trouvés et corrigés en route :
- **Compte web neuf** : `load_saved_current_project` levait `atome_not_available_locally` → boot
  de l'espace de travail en échec 11 fois → **Communication jamais chargée** (aucun message ni
  News reçu tant qu'aucun projet n'était ouvert). Corrigé (`projects.js`).
- Panneau Tags : `onOpen` lisait le contexte à la racine au lieu de `{ context }` → le projet
  visé n'était jamais pris (masqué par le repli sur le projet courant).
- Réponses WS de type inconnu rangées sous `data` : ajout de `contact-response` et
  `news-response` à `RESPONSE_PAYLOADS`.

### Régression complète (après toutes les corrections)
L0 2/2 · L1 16/16 · L2/L3 28/28 · L4/L5 16/16 · L6 11/11 · L9 visio 13/13 · L9 notes 10/10 ·
navigateurs 15/15 · rouge d'abord 4/4.

## Points ouverts
- **Inbox (L8)** : décision produit sur l'emplacement de l'outil (bandeau inbox vs boîte de saisie).
- **Déploiement** : le serveur de production doit recevoir ces changements — `atome.one` ignore
  silencieusement une trame `/ws/api` inconnue (`contact`, `news` y expireraient). Axum (Tauri) et
  le serveur Swift (iOS) n'implémentent ni `direct-message` ni ces trames : la communication passe
  par Fastify. **Tauri et iOS : non vérifiés.**
- **Identité des médias** (hors périmètre, tâche proposée) : `resolveUploadIdentity` croit
  `x-user-id`, `resolveMediaDownloadIdentity` croit `?user_id=` → URL média signée à introduire.
- **Relation « Demande envoyée »** : un refus ou un blocage de l'autre côté reste affiché
  « demande envoyée » (volontaire, D4).
- `tests/eve/communication_notifications_publications.test.mjs` importe
  `createCommunicationNewsPublication`, supprimé (boucle client remplacée par la diffusion
  serveur) — suite du repo non lancée (consigne).
