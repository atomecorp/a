# Étude de faisabilité — communications et vidéo unifiées (lot L18 : COM-01..04, VID-01..02)

Date : 2026-10-22. C'est une étude seule. Elle n'a modifié aucun code, n'a fait aucune opération Git, n'a rien publié ni envoyé et n'a créé aucun compte. Les sources externes ont été consultées le 2026-10-22 ; leurs liens sont en fin de document (§12). Les preuves internes sont des lectures de code, citées en `fichier:ligne`. Une lecture de code n'est pas une capacité vérifiée à l'exécution ; ce statut est donc rappelé quand il compte.

Cadre (`todo/!!!!!!_Urgent_big _task_to implement.md`) : §1.10 (COM-01..04, VID-01..02), §1.15 (lignes « Deux switches sociaux » et « Partout par défaut »), lot L18 (l.331), questions §2.2 (l.340-360), matrice des menaces §4.2, ligne « Social et agrégation » (l.402), tests d'agrégation (l.448).

---

## 1. Synthèse

1. Le **Universal Adapter** n'existe pas dans le code. On ne trouve aucune occurrence dans `eVe/`, `atome/src` ou `server/` (grep insensible à la casse, variantes `universal.adapter`, `universal_adapter`, `UniversalAdapter`). Les seules mentions sont celles de la tâche elle-même (l.149, 157, 331, 350). L'unification existe pourtant déjà par morceaux, sous forme de registres et de contrats par domaine (§2). Elle doit être étendue, pas doublée.
2. **VideoTrain** n'existe que comme concept : `eVe/concept/eVe.html` (« VideoTrain Knowledge Hub ») et `todo/atome_chat_GPT_Archives/Atom f concept.md:91-92` (« conversations […] ancrées directement dans le temps d'une vidéo »). Il n'y a aucun code. L'invariant « Origine / Mieux noté » est donc un contrat à créer.
3. La publication sociale (TikTok, Instagram, Facebook) existe déjà, sans aucune publication réelle faute d'apps développeur (`atome/documentations/social_sharing.md:3-6, 158-170`). Elle part d'une **sélection vide** (`bevy_panel_comm_social.js:14`) et refuse un envoi sans destination (`:69`). Le « tout coché par défaut » n'est donc pas l'état actuel, et l'étude recommande de ne pas l'adopter.
4. Les conditions officielles rendent le **flux transversal impossible** pour TikTok, Instagram et Facebook. On peut au mieux lire son propre contenu professionnel et publier sous condition. Un flux complet n'est réaliste que pour eVe natif et PeerTube (API publique, fédérée). YouTube permet une recherche sous quota strict, et Dailymotion est bloqué par le Player ID.
5. Un risque de sécurité a été relevé dans le code mail, hors lot (§9, G-10). Les routes HTTP `/api/eve/mail/*` n'ont pas d'authentification et réutilisent un connecteur en cache dont la clé n'inclut pas le mot de passe (`server/mailRoutes.js:19-33, 274-316`). C'est à confirmer par une sonde locale avant tout chantier mail.

---

## 2. Audit interne (propriétaires, statuts, preuves)

Les statuts suivent la classification demandée : **Disponible et compatible**, **Existant mais inadapté**, **Indisponible**, **Non trouvé après investigation**, **Non vérifiable faute d'accès**.

| Brique | Statut | Preuve | Remarque |
| --- | --- | --- | --- |
| Universal Adapter | **Non trouvé après investigation** | 0 occurrence dans le code ; mentions seulement dans la tâche, l.149/157/331/350 | Les briques les plus proches sont les lignes suivantes. Ne pas inventer un « adaptateur » parallèle. |
| Normaliseur commun des connecteurs (mail/agenda/contacts/banque) | Disponible et compatible (forme seule) | `atome/src/squirrel/shared/connector_contract.js:26-33` | Il normalise `provider`, `read_capabilities` et `write_capabilities` ; aucune logique de transport. C'est le point d'ancrage naturel d'un contrat de capacités par source. |
| Registre des fournisseurs vidéo | Disponible et compatible | `eVe/domains/media/online_video_providers.js:13-31` (youtube, peertube) ; chargeurs `eVe/intuition/tools/online_video_runtimes.js:4-13` ; contrat commun `atome/src/squirrel/online_video/contracts.js:7-38` | Une déclaration par service. C'est le noyau existant d'une « unification vidéo ». |
| Recherche YouTube | Disponible (Web vérifié le 7 oct.) ; iOS/Tauri non vérifiés | `server/ws_youtube_search.js:5-6` (12 req./min/adresse, 80/jour), `:66` (`videoEmbeddable`, `videoSyndicated`) | Une seule clé serveur. Le garde de 80/jour est inférieur au plafond Google de 100 appels `search.list` par jour (§3). |
| Lecture YouTube en place | Web vérifié ; iOS non vérifié | page hôte `/eve_youtube_player.html` (mémoire du 7 oct.) | Erreurs 150/153 selon l'origine ; contrainte du lecteur officiel. |
| PeerTube recherche + lecture | Disponible (Web, sonde 18 contrôles) ; Tauri/iOS non vérifiés | `server/ws_peertube.js:13-14` (Sepia, annuaire joinpeertube), `:95-99` (liste d'hôtes, anti-SSRF) ; `atome/src/shared/online_video_refs.js:24-33` | Lecture seule. Pas de connexion à une instance, pas d'upload, pas de commentaire. |
| Dailymotion | **Indisponible** | Absent du registre ; `eVe/documentations/FRAMEWORK_STATE.md:1936` (403 sans Player ID, mesuré le 20 oct.) | Débloquer demande un Player ID créé dans Dailymotion Studio (compte opérateur). |
| Relais natifs des trames publiques | Disponible et compatible | `platforms/desktop-tauri/src/server/public_relay.rs:12-14` ; `platforms/ios/atome-auv3/Common/FastifySyncPublicRelay.swift:10-12` | Ils relaient youtube-search et peertube-*. |
| Publication sociale TikTok/Instagram/Facebook | Existant, non prouvé en réel | `server/social/*.js` ; `atome/src/squirrel/social/contracts.js:8,14,21` ; `capabilities.js:63-101` ; doc `social_sharing.md` | Publier seulement. Pas de lecture de flux, de commentaires ni de messages (`social_sharing.md:38-40`). |
| Sélection des destinations sociales | Disponible et compatible | `eVe/intuition/runtime/bevy_panel/bevy_panel_comm_social.js:14` (`selected: []`), `:43-44` (filtrage par comptes), `:69` (destination requise), `:132` (bascule) | Sélection explicite, conforme à la recommandation du §5. |
| Jetons sociaux | Disponible et compatible | `providerCredentialVault.js` (coffre chiffré du principal, `social_sharing.md:88-90`) | Les jetons ne vont jamais au client. |
| Messagerie eVe (contacts, conversation, demandes) | Disponible et compatible (prouvé Mac↔iPad en prod le 15 oct.) | `server/communication_relations.js`, `communication_delivery.js`, `communication_request_guard.js` ; contrat `atome/src/shared/communication_contract.js:58-75` | Réseau privé natif. |
| News eVe (publier, aimer, republier, fil) | Disponible et compatible | `server/news_broadcast.js:196-200` (like), `:278-283` (`publish, distribute, like, repost`) ; `eVe/domains/news/news_thread_runtime.js:85-87` (`meta.parent_id`), `news_model.js:120-133` (`news_origin_author_id`) | Réseau public natif. Il conserve l'auteur d'origine, base possible de VideoTrain. |
| Droits de partage | Disponible et compatible | `atome/src/shared/share_rights.js:7-57` | Rôles, atténuation et révocation en cascade. |
| Mail IMAP/SMTP générique | Existant mais inadapté (sécurité, plateformes) | `atome/src/squirrel/mail/*` ; contrat `mail/connector_contract.js:3-34` (iCloud v1) ; outils IA `atome/src/squirrel/ai/default_tools_mail.js:3-224` (`mail.send` exige `confirmed`, l.208-224) ; routes `server/mailRoutes.js:274-316` ; Tauri `platforms/desktop-tauri/src/server/mod.rs:5269-5273` | Auth par mot de passe d'application (champ `security.mailPassword`, `bevy_panel_home_settings_view.js:142`, coffre `auth_ref`, `bootstrap_transport.js:177-191`). Pas d'OAuth/XOAUTH2. Aucune route mail dans le serveur Swift iOS (aucune occurrence de `/api/eve/mail` dans `platforms/ios/atome-auv3/Common`). Les routes REST sont une divergence connue du « No REST ». |
| Gmail / Outlook OAuth | **Indisponible** | aucune occurrence `xoauth`/`gmail` dans `atome/src/squirrel/mail` | Nécessite une vérification Google des scopes restreints (§3). |
| SMS | Existant mais inadapté (auth seule) | `server/auth_sms_ovh.js:47-53` : envoi limité à un lien `https://atome.one/auth/v/…`, sans réponse (`senderForResponse: false`) | Aucune messagerie SMS utilisateur. Pas de `MFMessageComposeViewController` dans `platforms/ios`. |
| Profils pro/perso/privé/loisirs | **Non trouvé après investigation** | `bevy_panel_home_identity_view.js:10-16` (une identité : nom, prénom, pseudo, tél., e-mail) ; seuls `first_launch_auth_flow.js:72` (classe d'appareil `personal/shared`) et `meeting_contract.js:12-21` (objectif « professional » de Rencontre) s'en approchent | Ni l'un ni l'autre n'est une persona de publication. |
| VideoTrain | **Non trouvé après investigation** | concept seulement (voir §1) | À créer en composant News + fil + vidéo. |
| Recherche unifiée multi-sources | Indisponible | Finder vidéo à une portée par fournisseur (`bevy_panel_finder_online_video.js:11-33`) | Une recherche n'interroge qu'un service. |

---

## 3. Conditions officielles des sources (au 2026-10-22)

Ce sont des faits lus sur les pages officielles. Les inférences sont signalées par « (inférence) ».

- **TikTok.** Le Display API lit le profil de base (`user.info.basic`) et les vidéos de l'utilisateur connecté (`video.list`), avec un `embed_link` à ouvrir dans une webview. Il n'expose ni recherche publique, ni commentaires, ni publication. Le Content Posting API exige le scope `video.publish` approuvé. Un client **non audité** ne publie qu'en privé (SELF_ONLY) : 5 utilisateurs au plus par 24 h, comptes privés au moment de publier. Le plafond est d'environ 15 publications par créateur et par 24 h, partagé entre clients. L'interface est imposée : pseudo du créateur affiché, confidentialité **sans valeur présélectionnée**, Comment/Duet/Stitch désactivés par défaut, déclaration de consentement, aperçu. Aucun filigrane ni texte promotionnel n'est autorisé. La recherche « Research API » est un produit à part, réservé à la recherche (éligibilité non lue sur la page : **à vérifier**).
- **Instagram (API with Instagram Login / Facebook Login).** Il faut un **compte professionnel** (Business ou Creator) : « your app users must have an Instagram professional account ». Un compte personnel n'a pas d'accès API. La publication passe par `instagram_business_content_publish`. Les images doivent être en JPEG. Reels, carrousels (20 éléments) et stories sont possibles. La limite est de 100 publications API par 24 h glissantes ; la même page dit 50 dans la section carrousel, une contradiction à vérifier par `content_publishing_limit`. La modération des commentaires et la messagerie sont possibles pour le compte professionnel. La recherche par hashtag demande Facebook Login et « Instagram Public Content Access ».
- **Facebook.** On publie sur une **Page** via `pages_manage_posts` et `pages_read_engagement`, avec les tâches CREATE_CONTENT/MANAGE/MODERATE. On peut lire `/page_id/feed`, modifier un post créé par l'app et le supprimer (DELETE). Graph API v26.0. Publier sur le **profil personnel** n'est plus possible : `publish_actions` est déprécié depuis 2018 et remplacé par les **Share dialogs**.
- **YouTube Data API v3.** Le quota par défaut est de 10 000 unités par jour, plus deux réserves séparées de **100 appels `search.list`** et **100 appels `videos.insert`** par jour (1 unité par appel). `commentThreads.insert`, `comments.insert` et `videos.delete` coûtent 50 unités. L'upload demande `youtube.upload` (OAuth utilisateur). La page dit, verbatim, « Videos uploaded from unverified API projects are not restricted to private viewing mode ». C'est un changement par rapport à la règle de 2020 encore citée par des tiers ; il reste **à confirmer dans la console** avant tout plan d'upload. Règles : ne pas mêler d'autres sources aux résultats YouTube et ne pas les présenter comme tels (III.C.5), attribution propre à YouTube (III.F.2.a), données rafraîchies ou supprimées après 30 jours (III.E.4), aucune copie ni lecture hors ligne de l'audiovisuel (III.E.1), lecteur non modifié et visible, sans lecture en arrière-plan (III.I.6, I.9).
- **Dailymotion.** Le lecteur exige un **Player ID** créé dans Dailymotion Studio ou par l'API (le 403 sans Player ID a été mesuré le 20 oct.). Le Platform API fonctionne en OAuth2 par scopes (`video.read`, `video.manage`…), avec un upload en deux temps (session puis fichier). La documentation lue ne montre pas de point de recherche publique dédié. L'ancienne API de recherche répond sans clé (mesure du 20 oct.), mais sa pérennité n'est pas garantie (inférence).
- **PeerTube (REST v8.3).** L'authentification se fait **par instance** (grants `password` et `refresh_token`, un jeton actif à la fois). L'upload est classique ou reprenable (POST/PUT/DELETE), sous `max_file_size_reached` et `quota_reached`. On trouve aussi la recherche vidéos/chaînes/playlists, les fils de commentaires (créer, répondre, supprimer, approuver) et le suivi d'instances (ActivityPub). La limite est de 50 appels par 10 s, avec réponse 429 et en-têtes `Retry-After`. Sepia Search est un index tiers ; chaque instance a ses propres règles (inférence, à vérifier par instance).
- **Gmail.** IMAP/SMTP passe par XOAUTH2 avec le scope `https://mail.google.com/`, classé **restreint**, comme `gmail.readonly` et `gmail.modify`. Si les données restreintes sont stockées ou transmises par un serveur, une **évaluation de sécurité** (CASA) est obligatoire, avec revalidation annuelle. `gmail.send` est seulement « sensible ». **iCloud** accepte les mots de passe d'application pour les apps tierces (modèle actuel d'eVe).
- **SMS sur iOS.** Il n'existe aucune API publique pour lire les SMS ou iMessage (inférence solide : MessageUI n'expose que la composition, et la page Apple lue ne contenait que le titre). L'envoi passe par `MFMessageComposeViewController`, que l'utilisateur doit valider lui-même (`canSendText()`). L'envoi automatique est impossible depuis l'appareil.
- **Passerelles SMS (tarifs publics).** OVHcloud France : environ 0,06 € HT par SMS à 100 SMS, jusqu'à environ 0,048 € HT en très gros volume (résultat de recherche ; la page tarifaire elle-même n'a pas pu être lue). Twilio France : 0,0798 $ par segment sortant, 0,0075 $ en entrant, numéro dès 1,15 $/mois ; un expéditeur alphanumérique ne reçoit pas de réponse. Ce sont des tarifs publics, pas une offre négociée.

---

## 4. Matrice source × fonction × plateforme × droits/coût × statut/preuve

Codes externes : **O** = officiel et accessible ; **C** = sous condition (audit, compte pro, App Review, quota) ; **R** = renvoi ou partage système seulement ; **✗** = impossible ou interdit. Le statut interne suit entre crochets : [D] disponible, [P] présent mais non prouvé en réel, [–] absent.

| Source | Recherche | Lecture | Publication | Commentaire/réponse | Republication | Suppression | Sync |
| --- | --- | --- | --- | --- | --- | --- | --- |
| eVe natif (News + messagerie) | O [D tags `searchTags`] | O [D] | O [D] | O [D fil, `meta.parent_id`] | O [D `repost`] | O [à vérifier côté News] | O [D pipeline commit + `/ws/sync`] |
| TikTok | ✗ (Research API hors usage produit, à vérifier) | C propres vidéos [–] | C audit pour public ; privé sinon [P] | ✗ [–] | ✗ | ✗ par API (inférence) [–] | C statut de publication [P] |
| Instagram pro | C hashtag (FB Login + PCA) [–] | C propres médias [–] | C 100/24 h, JPEG/Reels [P] | C modération de ses propres médias [–] | ✗ | C (à vérifier) [–] | C conteneur/statut [P] |
| Instagram perso | ✗ | ✗ | R partage système [P] | ✗ | ✗ | ✗ | ✗ |
| Facebook Page | ✗ hors PCA | C `/feed` [–] | C App Review [P] | C (guide séparé) [–] | ✗ | C DELETE [–] | C [–] |
| Facebook profil | ✗ | ✗ | R Share dialog/copie [P `handed_off`] | ✗ | ✗ | ✗ | ✗ |
| YouTube | C 100 appels/jour [D Web] | O lecteur officiel [D Web] | C OAuth, 100/jour [–] | C 50 unités [–] | ✗ | C 50 unités [–] | C 30 jours max [–] |
| Dailymotion | C ancienne API [–] | C Player ID [–] | C OAuth [–] | à vérifier | ✗ | C | à vérifier |
| PeerTube | O Sepia/instance [D Web] | O flux natifs [D Web] | C compte par instance [–] | C par instance [–] | ✗ (partage ActivityPub) | C [–] | O ActivityPub/RSS [–] |
| VideoTrain | à créer sur News [–] | idem | idem | idem (cœur du concept) | idem | idem | pipeline canonique |
| E-mail IMAP/SMTP | O IMAP SEARCH [P `mail.search`] | O [P] | (jamais public) | O réponse [P brouillon + confirmation] | transfert [–] | O [P `mail.delete`] | O [P `/api/eve/mail/sync`] |
| Gmail OAuth | C restreint + CASA [–] | idem | — | idem | — | idem | idem |
| SMS | ✗ iOS | ✗ iOS | — | R composeur iOS [–] ; passerelle serveur payante [auth seule] | — | ✗ | ✗ |

**Plateformes.** Web : trames `/ws/api` Fastify, vérifiées pour YouTube et PeerTube. macOS/Tauri : mêmes trames par `public_relay.rs` et `provider_relay.rs`, plus des routes mail Axum (`mod.rs:5269`) ; pas de cible de partage système pour TikTok/Instagram, donc la route est l'export (`social_sharing.md:170-173`). iOS : relais Swift pour les trames publiques et sociales, `export_file_share` (non exécuté sur appareil), **pas de mail** dans le serveur local Swift, composeur SMS possible mais absent. Android : hors périmètre prouvé.

**Coûts.** TikTok, Meta et Google sont gratuits en appels, mais coûtent en audit et en App Review (temps humain et conformité), et CASA est payant (inférence : laboratoire tiers). Le SMS coûte environ 0,05 à 0,08 € par message. PeerTube est gratuit, mais une instance éventuelle d'eVe aurait un coût de stockage et de trafic.

---

## 5. Défi de « toutes les plateformes compatibles cochées par défaut » et politique recommandée

**Le défaut proposé est rejeté pour la publication externe.** Six raisons :

1. **Règles des fournisseurs.** TikTok interdit toute présélection de la confidentialité et exige un consentement explicite avant l'upload. Cocher TikTok d'office revient à pré-décider l'audience, ce que ces règles excluent dans l'esprit (inférence raisonnable). Meta distingue Page et profil : un profil « coché » ne peut que se transformer en renvoi.
2. **Mélange d'identités.** Publier d'un geste sur le compte pro et sur le compte perso est l'erreur la plus grave du domaine (gravité haute, probabilité moyenne, irréversible une fois diffusé, car les copies tierces échappent à la suppression).
3. **Données sensibles.** Une séance de santé ou une localisation partagée « partout » est une fuite (ligne « Social et agrégation » de §4.2).
4. **Échecs partiels inévitables** (formats, quotas, jetons expirés) : plus il y a de cibles par défaut, plus il y a d'échecs à gérer pour une intention que l'utilisateur n'a pas exprimée.
5. **Zen.** Une liste de cases cochées à décocher ajoute des contrôles à chaque publication. Une sélection discrète, mémorisée par profil, est plus légère.
6. **Situation actuelle.** Le code part déjà d'une sélection vide (`bevy_panel_comm_social.js:14`). Changer ce défaut serait une régression de sécurité.

**Politique recommandée (« destinations mémorisées par profil, confirmées »).**

- **Par défaut : eVe seul**, dans l'audience du profil actif (voir §6).
- Chaque profil peut mémoriser un **jeu de destinations externes** que l'utilisateur a choisi une fois, explicitement (consentement initial horodaté, révocable). Il est proposé et pré-rempli, jamais étendu en silence : une destination nouvellement connectée n'est jamais ajoutée d'office.
- **Confirmation proportionnée.** Si les destinations mémorisées ne contiennent que du privé ou des contacts, un geste suffit. Dès qu'une destination publique externe est présente, ou que le contenu porte des données santé ou localisation, une confirmation affiche le pseudo, le compte et l'audience de chaque cible (TikTok l'impose de toute façon).
- **Jamais de destination externe pour un profil « privé »** : la case est indisponible, pas seulement décochée.
- États par destination : `autorisée`, `indisponible` (raison : compte perso, scope manquant, quota), `échec` (rejouable), `remise à l'app` (`handed_off`), `exportée`. Ils existent déjà dans `SOCIAL_STATUSES` (`contracts.js:21-23`).
- Les critères d'acceptation sont au §10 (tests T-01..T-06).

---

## 6. Modèle de séparation des profils (pro / perso / privé / loisirs)

Aujourd'hui, un compte porte une identité, sans persona (§2). Proposition minimale, sans seconde architecture :

- **Profil = Atome typé** (`type: 'profile_persona'`) appartenant au compte (`meta.owner_id`, `meta.parent_id` = compte). Il est créé par le pipeline canonique (`window.Atome.commit`), comme toute donnée. Champs : `kind` (`pro|perso|prive|loisirs|custom`), identité de publication (nom affiché, photo), **comptes externes liés** (références vers les entrées `social.<network>` du coffre, jamais les jetons), **audience eVe par défaut** (rôle `share_rights`), **destinations mémorisées** (§5), boîte mail liée (référence `auth_ref`), drapeaux de sensibilité (santé, localisation interdites en public).
- **Le jeton reste au coffre serveur du principal** (`providerCredentialVault.js`) ; le profil ne porte qu'un `credential_ref`. Un même compte externe ne peut être lié qu'à **un seul** profil, ce qui empêche qu'une publication perso parte sur un compte pro.
- **Contacts.** Le carnet reste unique (une fiche par personne, déjà décidé). L'appartenance à un ou plusieurs profils est une propriété de relation, pas une copie.
- **Stockage.** Les contenus restent des Atomes du compte. Le profil détermine l'**audience** et l'**identité d'émission**, pas un autre coffre (inutile tant qu'aucune exigence légale ne l'impose).
- **Profil actif visible.** Un seul indicateur discret (photo du profil) dans le compositeur et la recherche, conformément au zen.
- **Propriétaire.** L'extension du profil canonique (`eVe/domains/user/profile_api.js`) et d'un contrat partagé `atome/src/shared/profile_persona_contract.js`, consommé par `social/capabilities.js` (filtrage des destinations) et par le serveur (refus si la destination n'appartient pas au profil émetteur). La vérification se fait **côté serveur**, pas seulement dans l'UI.

---

## 7. Réponse à un post tiers : traçabilité et représentation dans eVe

- **Atome « réponse »** (`kind: 'reply'`) avec `properties.in_reply_to = { network, remote_id, remote_url, author_handle, fetched_at }` et `meta.parent_id` = l'Atome de référence du post tiers. Ce dernier est un **lien** (titre court, miniature si le contrat du fournisseur le permet, URL), jamais une copie du contenu.
- **Envoi.** Il part vers le réseau d'origine seulement si l'API le permet pour ce compte (Facebook Page, Instagram pro sur ses propres médias, YouTube, PeerTube). Sinon c'est un `handed_off` : ouverture de l'app ou de la page officielle avec le texte copié.
- **Publication eVe facultative et choisie.** La réponse peut aussi être publiée sur eVe, avec un bandeau « en réponse à @auteur sur Réseau » et le lien. Le fil eVe ne montre **que** la réponse et la référence, jamais le fil tiers comme s'il était natif.
- **Consentement.** On ne cite pas le contenu de l'auteur tiers ni des autres participants au-delà de ce que le lecteur officiel ou l'embed affiche. Pièces jointes : seulement celles de l'utilisateur.
- **Cycle de vie.** `remote_reply_id` et un statut par réseau sont conservés (le modèle de jobs de `social_jobs.js` est réutilisable). Modifier ou supprimer côté eVe propose de faire de même à distance si l'API le permet (YouTube et Facebook DELETE ; TikTok non). L'état « supprimé dans eVe, encore en ligne sur Réseau » reste affiché, sans succès fictif. Les réponses entrantes ne sont récupérées que là où l'API l'autorise (PeerTube, YouTube, Instagram pro, Page) et sont marquées « provenance externe ».
- **Historique.** Tout passe par `commit` : ce qui a été envoyé, où et quand reste dans l'historique et n'est jamais réécrit.

---

## 8. Invariant VideoTrain « Origine / Mieux noté »

- **Un fil = un Atome racine** (la vidéo ou le message d'origine, `videotrain_root`). Les contributions sont des Atomes enfants (`meta.parent_id`), éventuellement ancrés dans le temps (`anchor_ms`), comme le dit le concept.
- **Le switch est une projection, pas une donnée.** « Origine » affiche la racine ; « Mieux noté » affiche la contribution au meilleur score (`likes` des News, `news_broadcast.js:196-200`, avec un départage déterministe : score, puis date, puis id). Basculer ne crée aucun Atome, ne réordonne rien en base et ne change jamais la racine. L'état du switch est une préférence de vue.
- **Distinct du tri global** Chronologique / Plus appréciés (§1.15 « Deux switches sociaux ») : ce sont deux contrôles et deux portées.
- **Agrégation vidéo.** Une vidéo YouTube ou PeerTube peut être la racine **référencée** d'un fil (lien + lecteur officiel), jamais copiée. Les contributions restent dans eVe. L'agrégation n'efface ni ne remplace le fil.
- **« Mieux noté » = popularité**, pas pertinence (§1.15). Aucune promesse de qualité, surtout pour la santé.
- **Propriétaire à créer** : `eVe/domains/news/videotrain_thread_runtime.js`, qui compose `news_thread_runtime.js` (fil, `meta.parent_id`) et les lecteurs vidéo existants. Pas de nouveau moteur.

---

## 9. Manques : propriétaire / contrat et plus petite vérification

| # | Manque | Propriétaire / contrat proposé | Plus petite vérification |
| --- | --- | --- | --- |
| G-01 | Universal Adapter introuvable | Arbitrage : l'utilisateur indique ce qu'il désigne. Sinon, contrat de capacités par source dans `shared/connector_contract.js` + registres existants (vidéo, social, mail) | Grep déjà fait (0). Une question à l'utilisateur, une seule. |
| G-02 | Recherche unifiée | Fédérateur côté client qui interroge les registres et garde **des groupes par source** (attribution YouTube séparée, III.F.2.a) ; l'extension du Finder `bevy_panel_finder_online_video.js` | Sonde Node : une requête vers youtube (stub) + peertube (stub), résultats non mêlés, provenance par élément. |
| G-03 | Dailymotion | Entrée du registre + moteur + trame serveur, après un Player ID opérateur | Sonde HTTP : embed avec Player ID → 200 (aucun compte créé par l'agent). |
| G-04 | Profils/personas | `profile_persona_contract.js` + `profile_api.js` ; refus serveur dans `social_operations.js` | Test unitaire : destination d'un autre profil → `social_destination_invalid`. |
| G-05 | Destinations mémorisées | État de profil + `bevy_panel_comm_social.js` (pré-remplissage) | Sonde panneau : un nouveau compte connecté n'apparaît pas coché. |
| G-06 | Réponse tierce | `kind: 'reply'` + jobs sociaux étendus (`reply` par réseau) | Fournisseurs simulés (`temp/social/fake_providers.mjs`) : succès sur Page, `handed_off` sur TikTok. |
| G-07 | VideoTrain | `videotrain_thread_runtime.js` sur le fil News | Sonde : 3 contributions, likes 0/2/2 ; « Mieux noté » = la plus ancienne des deux à 2 ; nombre d'Atomes inchangé après 10 bascules. |
| G-08 | Upload YouTube/PeerTube | Jobs sociaux étendus aux réseaux vidéo (`social/contracts.js` `SOCIAL_NETWORKS`) | Doubles fournisseurs seulement ; vérifier la règle « unverified » dans la console avant tout réel. |
| G-09 | Gmail/Outlook OAuth | Connecteur XOAUTH2 dans `mail/node_protocol_clients.js`, jeton au coffre | Décision coût/CASA d'abord ; aucune sonde réelle avant. |
| G-10 | **Sécurité mail (hors lot, à remonter)** | `server/mailRoutes.js` : pas d'auth par route (`:274-316`), connecteur en cache dont la clé n'inclut pas le mot de passe (`:19-33`), hôte IMAP/SMTP fourni par le client (risque SSRF, `scripts/icloud_live_credentials.mjs:144-174`) | Sonde locale isolée : deux appels `/api/eve/mail/sync` même e-mail, mots de passe différents, contre un faux serveur IMAP local ; le second doit échouer. Le corriger est une extension de périmètre à autoriser. |
| G-11 | Mail iOS | Route mail dans le serveur Swift local, ou relais vers Fastify | Sonde WS locale iOS : `mail.list` → résultat ou erreur explicite. |
| G-12 | SMS utilisateur | iOS : pont `MFMessageComposeViewController` (l'utilisateur envoie lui-même). Serveur : passerelle payante, hors V1 | Construction simulateur : `canSendText()` = false attendu, erreur explicite affichée. |

---

## 10. Réponses aux questions §2.2

**Q1. Capacités par source.** Voir la matrice du §4. En résumé : eVe natif couvre les 7 fonctions. PeerTube a la recherche, la lecture et la sync ouvertes, l'écriture par compte d'instance. YouTube offre recherche, lecture, upload, commentaire et suppression sous quota et OAuth. Instagram pro et Facebook Page permettent de publier et de gérer son propre contenu. TikTok permet de publier (privé tant qu'il n'y a pas d'audit) et de lire ses propres vidéos. Instagram perso et Facebook profil se limitent au renvoi. Le mail couvre tout sauf la publication. Le SMS est impossible en lecture sur iOS, et en envoi se limite au composeur ou à une passerelle.

**Q2. Validation, coûts, lecteur officiel.** Audit TikTok (public, plafonds), App Review Meta (`pages_manage_posts`, `instagram_business_content_publish`), compte professionnel Instagram, OAuth YouTube et extension de quota au-delà de 100 recherches par jour, Player ID Dailymotion, CASA pour Gmail restreint, SMS payant. Le lecteur officiel est **obligatoire** pour YouTube et Dailymotion (aucune copie). PeerTube permet la lecture native des flux de l'instance (déjà fait).

**Q3. Flux transversal ?** Non pour TikTok, Instagram et Facebook (aucun accès au fil d'autrui, inférence fondée sur les produits API lus). Oui pour eVe et PeerTube. Pour YouTube, seulement recherche, embed et renvoi. Il faut afficher la provenance par élément et ne jamais présenter un mélange comme « résultats YouTube ».

**Q4. Politique de publication.** Elle est au §5 : eVe seul par défaut, destinations mémorisées par profil et consenties, confirmation proportionnée, aucune destination externe pour le profil privé.

**Q5. Séparation des profils.** Elle est au §6 : un Atome persona, des comptes liés par référence au coffre (un compte externe = un profil), l'audience par `share_rights`, un contrôle serveur.

**Q6. Réponse tierce.** Elle est au §7 : un lien et non une copie, `in_reply_to`, un statut par réseau, une publication eVe facultative avec mention de l'origine, la suppression à distance seulement si l'API le permet.

**Q7. Fonctions réellement présentes.** Elles sont au §2. Le Universal Adapter et VideoTrain n'ont pas été trouvés. Sont à assembler : le registre vidéo, la couche sociale, News et la messagerie, les droits de partage, le mail IMAP/SMTP, les relais natifs.

**Q8. Répartition par plateforme.** Les API tierces passent **par le serveur Fastify** (clés opérateur, jetons au coffre), relayées par Tauri (Rust) et iOS (Swift) sans logique propre ; c'est le modèle existant. Le partage système est natif (iOS `export_file_share`, Web Share L2). Le composeur SMS est natif iOS. Le mail est à aligner : Fastify et Axum l'ont, iOS non. Chaque frontière se valide avec une sonde WS locale par plateforme (mémoire « Vérifier iOS par le WS local »). Android : non vérifié.

**Q9. Confidentialité, modération, conservation.** Les messages privés et le mail ne sont jamais publiables par défaut. Le contenu santé ou localisation est bloqué vers le public externe. Le contenu entrant est une donnée non fiable : rendu inerte, pas d'instruction exécutée par l'IA ou le MCP (§4.2). Pour la modération eVe, on part de l'anti-spam existant (`communication_request_guard.js`) et des refus et blocages ; le signalement des News est à ajouter. Conservation : les données YouTube sont rafraîchies ou supprimées à 30 jours, les variantes sociales supprimées à 24 h (déjà en place), aucune copie de vidéo tierce. Les questions de droit à l'image, des mineurs et du RGPD relèvent d'un professionnel compétent ; l'étude ne les tranche pas.

**Q10. Prototypes minimaux autorisés.** Ils figurent au §11. Ce sont des sondes sous `temp/` avec des fournisseurs simulés, sans UI ni architecture parallèle, sans envoi réel.

**Q11 à Q15.** Elles sont **hors lot** :
- Q11 (Thalasso) relève du lot Thalasso et santé ;
- Q12 (« i », descriptions et assistant pour activités et repos) relève du lot activités/assistant ;
- Q13 (mail, invitations, import, calendrier, alarmes, IMP) relève du lot IMP, avec renvoi au G-10 de cette étude ;
- Q14 (dashboards déclaratifs, liens et packaging) relève du lot dashboards déclaratifs ;
- Q15 (trois cellules et Agenda « prochain événement ») relève du lot eVe Basic Agenda.

Voir la table des lots du même fichier.

---

## 11. Plan de tests sans aucun envoi réel

Tous les tests sont sous `temp/l18/`. Les hôtes TikTok, Meta, Google et Dailymotion sont simulés (réemploi de `temp/social/fake_providers.mjs` via `NODE_OPTIONS=--import`). Le serveur est isolé (`PROBE_ISOLATED=1`), avec des comptes de sonde locaux. Aucun SMS, aucun e-mail SMTP réel, aucune publication.

| Test | Hypothèse vérifiée | Critère d'acceptation |
| --- | --- | --- |
| T-01 | Sélection initiale vide | Panneau Publier ouvert, `readState().selected` = `[]` ; Publier sans destination → erreur `destination_required` |
| T-02 | Nouveau compte non coché | Connexion simulée d'Instagram pro → destination proposée, non sélectionnée |
| T-03 | Profil privé | Destination externe → état `indisponible`, refus serveur même par MCP direct |
| T-04 | Mauvais profil | Job avec destination liée à un autre profil → refus serveur, aucun appel au double fournisseur |
| T-05 | TikTok non audité | Options de confidentialité = celles de `creator_info`, aucune présélection ; envoi forcé public → refus |
| T-06 | Échec partiel | 3 destinations dont 1 en 429 et 1 jeton expiré → 1 `published`, 1 `failed` rejouable, 1 `expired` ; aucun renvoi des publiées |
| T-07 | Réponse tierce | Page simulée : `remote_reply_id` stocké ; TikTok : `handed_off` ; Atome eVe avec `in_reply_to` et lien, aucune copie du post |
| T-08 | Recherche unifiée | YouTube et PeerTube simulés : groupes séparés, attribution par source, quota YouTube local respecté (≤ 80/jour) |
| T-09 | VideoTrain | 10 bascules Origine/Mieux noté : nombre d'Atomes et racine inchangés, départage déterministe |
| T-10 | Mail jamais public | `mail.read` → aucune destination sociale proposée pour son contenu ; `mail.send` sans `confirmed` → refus (`default_tools_mail.js:208-224`) ; faux serveur SMTP local |
| T-11 | Sécurité mail (G-10) | Faux IMAP local ; deuxième appel avec mauvais mot de passe → échec attendu (résultat à rapporter, sans corriger) |
| T-12 | iOS | Sonde WS locale : trames `peertube-search` relayées ; `mail.list` → erreur explicite ; `canSendText` simulé |

---

## 12. Sources externes (consultées le 2026-10-22)

- TikTok Content Posting API, Get started : https://developers.tiktok.com/doc/content-posting-api-get-started
- TikTok Content Sharing Guidelines (UX, non audité, plafonds) : https://developers.tiktok.com/doc/content-sharing-guidelines
- TikTok Display API, overview : https://developers.tiktok.com/doc/display-api-overview ; get started : https://developers.tiktok.com/doc/display-api-get-started
- TikTok Research API (éligibilité non lue) : https://developers.tiktok.com/doc/research-api-specs-query-videos
- Instagram Platform, overview : https://developers.facebook.com/docs/instagram-platform/overview ; Content publishing : https://developers.facebook.com/docs/instagram-platform/content-publishing
- Facebook Pages API, Posts (v26.0) : https://developers.facebook.com/docs/pages-api/posts
- Meta, Platform product changes (2018-04-24, dépréciation de `publish_actions`) : https://developers.facebook.com/ads/blog/post/2018/04/24/platform-product-changes/
- YouTube Data API, coûts de quota : https://developers.google.com/youtube/v3/determine_quota_cost ; videos.insert : https://developers.google.com/youtube/v3/docs/videos/insert ; Developer Policies : https://developers.google.com/youtube/terms/developer-policies
- Dailymotion Player : https://developers.dailymotion.com/player/ ; Platform API : https://developers.dailymotion.com/api/platform-api/
- PeerTube REST API (v8.3.0) : https://docs.joinpeertube.org/api-rest-reference.html
- Gmail IMAP/SMTP XOAUTH2 : https://developers.google.com/workspace/gmail/imap/xoauth2-protocol ; scopes : https://developers.google.com/workspace/gmail/api/auth/scopes ; scopes restreints : https://support.google.com/cloud/answer/13464325 ; évaluation de sécurité : https://support.google.com/cloud/answer/13465431
- Apple, mots de passe d'application : https://support.apple.com/en-us/102654 ; MFMessageComposeViewController : https://developer.apple.com/documentation/messageui/mfmessagecomposeviewcontroller (la page n'a rendu que son titre ; le comportement décrit est une connaissance générale du framework, à relire sur la page)
- OVHcloud SMS, tarifs (page non lisible par l'outil ; chiffres issus du moteur de recherche) : https://www.ovhcloud.com/fr/sms/prices/ ; Twilio SMS France : https://www.twilio.com/en-us/sms/pricing/fr

Limites : les pages lues par extraction automatique peuvent omettre des sections. La phrase YouTube sur les projets non vérifiés a été contrôlée verbatim dans le HTML officiel. La limite Instagram (100 contre 50), l'éligibilité au Research API TikTok, les exemptions CASA et les tarifs OVH restent **à reconfirmer** avant toute décision.
