# Événements publics — déclarer une activité datée, la voir dans les bonnes rubriques

Tâche créée le 2026-10-26 à la demande de l'utilisateur. Plan à valider **point par point** (une
question à la fois, code seulement après la dernière réponse). Rien n'est codé.

## 0. La demande, telle que je la comprends

N'importe quel utilisateur doit pouvoir **déclarer une activité datée** : concert, spectacle,
compétition sportive, repas, soirée, projection, etc. La déclaration :

- part dans une **base globale**, commune à tout le monde (aujourd'hui, tout objet utilisateur
  vit dans le coffre privé de son auteur) ;
- **apparaît d'elle-même dans les bonnes rubriques** d'Activité (Spectacles › Concerts, Sport,
  Scène… ; Temps libre › Événements…), autour du lieu où elle se tient ;
- est **diffusée sur le réseau interne d'Atome** et, au choix, sur les réseaux sociaux de
  l'auteur.

On la déclare depuis **trois endroits**, toujours avec le même module :

1. le **calendrier** : un outil « déclarer / promouvoir » sur un événement ;
2. **chaque liste de rubrique** (Concerts, Sport, Scène…) : un outil « créer », qui pré-remplit
   la catégorie ;
3. l'**Envoi de Créer** (Texte, Dessin, Retouche) : on publie une affiche et, si elle est
   datée, on la déclare en même temps.

C'est un module **transverse**, avec un seul code : un modèle, un écrivain, un écran, une
commande.

## 1. État des lieux (vérifié dans le code le 2026-10-26)

| Brique | Propriétaire | Constat |
|---|---|---|
| Événement de calendrier | `eVe/intuition/tools/calendar_model.js` (`normalizeEvent` l.153, `buildEventParticles` l.212), seul écrivain `calendar_api.js` (`createEvent` l.211, `updateEvent` l.245) | Type `calendar_event`. `kind` vaut seulement `event` ou `todo` : **aucune catégorie**. `location` est du texte libre, **sans coordonnées**. Il n'y a ni participants ni organisateur. `personal:true` met `access/visibility:'private'` (l.218). |
| Contrat d'outil du calendrier | `atome/src/shared/calendar_tool_contract.js` | Schéma `additionalProperties:false` : tout nouveau champ doit y être déclaré. |
| Panneau d'événement (design A · Cartes) | `bevy_panel_calendar_editor_view.js` (`card` l.44 et `labeled` l.59 sont **privés**, accordéon « Plus » l.130-155), bande `bevy_panel_calendar_band.js:10-39`, intentions `bevy_panel_calendar_runtime.js:283-350` | La bande d'édition contient Suppr., ✓ et Retour. La carte hébergée sur le Dashboard a **sa propre bande** (`dashboard_calendar_surface.js:20-26`). |
| Rubriques Activité | `dashboard_shows.js` (`DASHBOARD_SHOW_LEVELS` l.40-46 : plaque → glyphe + chaîne de *kinds*), cadre de liste partagé `dashboard_stage_list.js` | 6 plaques Spectacles et 9 plaques Temps libre. Chaque liste lit sa chaîne de *kinds* dans l'ordre, sans doublon d'`id`. Les tuiles sous les lignes (`tiles()` l.107) acceptent un « + », sur le modèle de `new_playlist` de `dashboard_music.js:38-50`. Les outils par entrée (`tools()` l.119-132) sont Agenda, Trajet, Site et Billet. |
| Lecture des rubriques | `eVe/domains/shows/shows_client.js` → trame publique `shows-nearby` → `server/ws_shows.js` (+ `shows_tourism.js`) | Sources externes **seulement** (OpenAgenda, OSM, TMDB, TheSportsDB, DATAtourisme). La trame est anonyme et limitée par adresse IP. Les relais Tauri/iOS la transmettent en **retirant le jeton**. |
| Contrat MCP des rubriques | `atome/src/squirrel/shows/contracts.js`, `eVe/domains/shows/shows_runtime.js` | Commande `shows.add_to_calendar` → `calendar.create_event`. Les entrées sont gardées en mémoire (LRU de 500). |
| Taxonomie | aucune commune | `AGENDA_WORDS` (`ws_shows.js:48-56`), `PLACES`, `TOURISM_KINDS`, `NEWS_TAG_SLUGS` (`news_tag_vocabulary.js`) : quatre listes séparées. **Rien pour repas ou soirée.** |
| Diffusion interne | `server/news_broadcast.js`, `window.eveNews` (`news_publish_api.js`) | Chaîne de publication unique (règle D7). Une News **est un projet**. `audience:'all'` fait une écriture de pile + un envoi **par utilisateur** (O(N)). La liste blanche des tags est vide par défaut, donc chacun reçoit tout. |
| Public projeté depuis un coffre | `server/directoryPublicService.js` | Profil `visibility=public` projeté dans `directory_public_profiles`, plus un flux rejouable `directory.public` sur `/ws/sync` (`wsSyncRuntime.js` l.6, 242, 361-421). **C'est le précédent exact** : un objet du coffre projeté dans une table publique, avec un flux public. |
| Points d'entrée des écritures serveur | `wsAtomeOperations.js` l.169 (commit), l.206 (commit-batch), l.438 (`sync`, la voie hors ligne / natif), `atomeHistoryCommands.js:19` (annuler) | Les **quatre** appellent `_wsApiSyncRuntime.publish(event)`. Le rafraîchissement de l'annuaire est recopié à la main à deux de ces endroits. |
| Base partagée | `database/driver.js` (better-sqlite3 ou libSQL), `schema.sql` + `adole_schema_migrations.js` (tables déclarées **aux deux endroits**) | Pas de colonne lat/lon, pas d'index spatial. |
| Garde anti-abus | `server/communication_request_guard.js` (quotas, suspension après des blocages), `communication_relations.js` (`blockedEitherWay`) | **Aucun signalement de contenu.** Pas de dépublication des News. |
| Fichiers lus par d'autres | `setFileReadResolver` (`userFiles.js:271-287`) | Précédents : `news` et `sync_share`. On lit l'original, sans copie. |
| Envoi de Créer | `dashboard_create_surface.js` (`share()` l.269-285, outil l.294) | Deux voies : les contacts (`writeToPerson`) et l'appli système (`shareFileToApp`). **Ni News ni réseaux sociaux.** |
| Réseaux sociaux | `social.*` (`server/social/social_operations.js`, `social/contracts.js`) | Comptes de l'utilisateur seulement. `prepare` exige un fichier **déjà stocké**. La publication réelle est bloquée faute d'apps développeur TikTok/Meta. **Les contacts n'ont aucun champ réseau social.** |
| Lieu | `bevy_panel_finder_place_runtime.js` (Nominatim, `reverseGeocodePlace`), `readShowsPosition()` | Ces briques sont réutilisables pour géocoder le lieu déclaré. |
| Enregistrement MCP | 7 endroits (recette de `creation.*`) | `contracts.js` de la famille, `mcp_handlers_contracts.js`, `mcp_handlers.js`, `mcp_security_policy.js` (`CONFIRMED_COMMANDS`), `mcp_security.js`, `tool_runtime_service_commands.js`, `conversation_session.js`, `project_work_mode_state.js`. |

**Tailles à surveiller** (règle des 500 lignes) :

- **à ne pas faire grossir** : `calendar_api.js` 497, `calendar/service.js` 498, `dashboard_mystic_sources.js` 477 ;
- **proche de la limite** : `bevy_panel_calendar_runtime.js` 450.

Tout l'ajout va dans des fichiers neufs. Ces quatre fichiers ne reçoivent qu'un branchement d'une
ligne.

## 2. Architecture proposée

### 2.1 Le principe : la déclaration *est* un événement de calendrier rendu public

- **Pas de nouvel objet.** Un événement public est le `calendar_event` de son auteur, rangé dans
  son coffre, qui porte une nouvelle propriété `publication`. Conséquences :
  - l'organisateur l'a d'office dans son agenda ;
  - il le modifie avec le panneau qu'il connaît ;
  - l'historique et l'annulation passent par le pipeline unique (`Atome.commit`) ;
  - le hors-ligne fonctionne : l'événement est validé localement, puis publié quand la
    synchronisation atteint atome.one.
- **La base globale est une projection, jamais une vérité.** Le serveur projette chaque
  événement `publication.visibility = 'public'` dans une table partagée `public_events`,
  exactement comme l'annuaire projette les profils publics. Supprimer ou dépublier l'événement
  retire la ligne. La table peut être reconstruite depuis les coffres.
- **Une seule voie d'écriture : le commit.** Il n'y a pas de trame « publish » à part :
  - le projecteur se branche à l'unique point où passent les quatre entrées d'écriture (§2.3) ;
  - il écrit en retour dans l'atome de l'auteur l'état de la publication
    (`publication.status` : `live` ou `refused`, avec `publication.reason`) par
    `router.commit(principal, …)`. L'interface lit cet état sur l'atome, comme tout le reste.

### 2.2 La forme de `publication` (propriété JSON de `calendar_event`)

```
publication: {
  visibility: 'public' | 'private',        // 'private' = dépublié, ligne retirée
  categories: ['concert', …],              // slugs de la taxonomie unique (§2.4), 1 à 3
  place: { label, address, city, lat, lon },// géocodé à la déclaration (obligatoire si public)
  poster: '<atome_id>' | null,              // affiche : image / dessin / texte exporté de Créer
  price: { free: true } | { label: '12 €' },
  ticket_url: 'https://…' | null,
  url: 'https://…' | null,
  status: 'pending' | 'live' | 'refused',   // écrit par le SERVEUR uniquement
  reason: null | 'quota' | 'invalid' | 'reported' | 'blocked'
}
```

Le titre, `start`, `end`, `all_day`, `timezone`, `description` et la récurrence restent les
champs existants de l'événement. L'organisateur affiché est le **nom de son compte**, lu côté
serveur depuis la session et jamais fourni par le client, comme pour les News.

### 2.3 Le serveur

- **Tables** (dans `schema.sql` **et** dans une migration appelée par `runAdoleSchemaMigrations`) :
  - `public_events` : `event_id` (la clé est l'`atome_id`), `author_id`, `author_name`,
    `title`, `summary`, `start_at`, `end_at`, `all_day`, `timezone`, `categories_json`,
    `place_label`, `city`, `lat`, `lon`, `cell` (maille ≈ 11 km :
    `floor(lat*10)*10000+floor(lon*10)`), `poster_id`, `price_json`, `ticket_url`, `url`,
    `reports`, `hidden`, `sequence`, `updated_at`. Index sur `(cell, start_at)` et sur
    `author_id`.
  - `public_event_reports` : `event_id`, `reporter_id`, `reason`, `created_at`, avec la clé
    unique `(event_id, reporter_id)`.
  - `public_event_journal` : flux séquencé, sur le modèle de `directory_public_events`.
- **Service** `server/public_events.js`, une fabrique `createPublicEventsService({ query,
  vaultRouter, relations, syncRuntime, guard })` :
  - `project(principal, event)` : appelé après chaque commit d'un `calendar_event`. Il relit
    l'état dans le coffre (`router.getState`, jamais le contenu envoyé par le client), valide
    (titre, date future, lieu avec coordonnées, catégories connues, URL https), applique la
    garde, insère ou met à jour la ligne ou la retire, puis écrit `status`/`reason` dans l'atome
    de l'auteur. Il ignore son propre écrit en retour : sans cela, le projecteur se
    redéclencherait sur l'écriture qu'il vient de faire.
  - `nearby({ lat, lon, radiusKm, categories, from, viewer })` : lit les mailles de la zone,
    garde les dates à venir ou en cours, calcule la distance (haversine de `ws_shows.js`, que
    j'extrais en fonction partagée) et trie par date. Les auteurs bloqués par le lecteur dans un
    sens ou dans l'autre (`blockedEitherWay`) et les lignes `hidden` sont exclus.
  - `mine(author)`, `report(viewer, eventId, reason)`, `expire()` (retire les lignes 24 h après
    leur fin ; appelé à la lecture, sans minuterie).
- **Un seul point après commit.** Je crée `afterCommitted(connection, userId, events)`, qui
  regroupe `syncRuntime.publish`, le rafraîchissement de l'annuaire et le projecteur
  d'événements publics. Les **quatre** sites (`wsAtomeOperations.js` l.169, 206 et 438,
  `atomeHistoryCommands.js:19`) l'appellent. Cela supprime la copie existante du rafraîchissement
  d'annuaire. À vérifier au lot L3 : la voie `sync` (l.438) est bien celle par laquelle Tauri et
  iOS remontent leurs écritures hors ligne.
- **Trame** `public-events`, famille authentifiée injectée comme `news` (`server_services.js`,
  `server.js`, `ws_api_message_handlers.js`). Actions : `nearby`, `mine`, `report`. Côté client
  elle passe par `fastifyCall`, qui se connecte directement à atome.one : **aucun code natif**.
- **Lecture par les rubriques.** Le *kind* `declared` de `shows_client.readShows` est routé vers
  `public-events nearby`. La chaîne d'une plaque mêle ainsi les sources ouvertes et les
  déclarations, sans toucher au mécanisme des plaques. Pour un invité sans compte, voir Q1.
- **Affiche lisible par tous.** `setFileReadResolver('public_events', …)` accorde la lecture du
  fichier d'une affiche référencée par une ligne publique non masquée. Rien n'est copié.
- **Flux en direct** (selon Q2) : `public.events` sur `/ws/sync`, calqué sur `directory.public`.
  L'écran ouvert reçoit les nouvelles déclarations sans relire.
- **Anti-abus** : une garde `createPublicEventGuard`, sur le modèle de
  `createContactRequestGuard`. Valeurs proposées, à valider en Q3 :
  - 5 publications par jour et 30 actives au maximum ;
  - 1 par jour pour un compte de moins de 72 h ;
  - masquage automatique après 3 signalements de comptes distincts ;
  - suspension de 30 jours après 3 masquages.
  - Script d'administration `scripts/public_events_admin.mjs` : lister les signalements,
    rétablir, retirer.

### 2.4 Une taxonomie unique des activités

Un seul fichier, `atome/src/shared/activity_categories.js`, partagé par le client et le serveur.
Pour chaque catégorie il donne :

```
{ slug, glyph, plates: ['shows.concerts', …], agendaWords: [...], newsTag, spoken }
```

Catégories proposées : `concert`, `stage` (théâtre, danse, humour), `screening` (projection),
`sport`, `festival`, `expo`, `family`, `meal` (repas), `party` (soirée), `workshop` (atelier),
`outing` (balade, rando), `market` (marché, vide-grenier), `wellbeing`.

- Le libellé vient d'`eveT('eve.activity.category.<slug>')`.
- `AGENDA_WORDS` quitte `ws_shows.js` pour cette table : un seul propriétaire, et le tri des
  événements OpenAgenda suit les mêmes catégories que les déclarations.
- La plaque **Gratuit** se calcule à partir de `price.free`. Ce n'est pas une catégorie.
- Les tags News sont dérivés de `newsTag` : un abonné au tag `sport` reçoit les annonces sportives.

### 2.5 Le client : un domaine, un écrivain, une commande

- `eVe/domains/public_events/` :
  - `public_events_client.js` : trames `nearby`, `mine`, `report`.
  - `public_events_runtime.js` : `executePublicEventCommand(action, input)`. C'est le **seul
    écrivain**. Il passe par `CalendarAPI.createEvent` / `updateEvent`, donc par le pipeline
    unique, puis par `AdoleAPI.sync.flushWorkspace()`. Ce dernier appel est nécessaire parce
    qu'un objet créé dans le navigateur n'existe côté serveur qu'après la synchronisation.
  - `public_event_draft.js` : brouillon pur, issu d'un événement, d'une plaque ou d'une
    création. Il calcule la catégorie par défaut d'après la plaque et l'affiche d'après la
    création.
- **Contrat** `atome/src/squirrel/public_events/contracts.js`, famille `events.*` :

  | Commande | Rôle | Capacité |
  |---|---|---|
  | `events.categories` | liste la taxonomie | `events.read` |
  | `events.declare` | crée et publie (titre, début, fin, lieu, catégories, prix, billet, affiche) | `events.write`, **confirmée** |
  | `events.publish` | publie un événement existant du calendrier | `events.write`, **confirmée** |
  | `events.update` | modifie une déclaration | `events.write` |
  | `events.unpublish` | dépublie ; l'événement reste dans l'agenda | `events.write` |
  | `events.mine` | mes annonces et leur statut | `events.read` |
  | `events.nearby` | annonces autour d'une position ou d'une ville, filtrées par catégorie | `events.read` |
  | `events.report` | signale une annonce | `events.write` |
  | `events.open` | ouvre l'écran de déclaration pré-rempli (présentation) | `events.control` |

  Elle est enregistrée aux **7 endroits** de la recette. Les instructions de l'assistant
  comprennent par exemple : « j'organise un concert samedi à 20 h à la salle des fêtes de
  Nolande » → `events.declare`, avec confirmation orale avant publication.
- **Les écrans appellent les mêmes commandes.** Le « + » d'une rubrique, l'outil du calendrier
  et l'outil de l'Envoi passent tous par `events.open` puis `events.declare` / `events.publish`.

### 2.6 L'écran de déclaration : le panneau d'événement, en mode public

**Pas de second formulaire.** On garde le panneau d'événement A · Cartes et on lui ajoute un
**mode public** : quelques cartes de plus, dans un fichier neuf
`bevy_panel_calendar_publication.js` (le runtime du calendrier est à 450 lignes).

- J'extrais `card` et `labeled` de `bevy_panel_calendar_editor_view.js` vers
  `bevy_panel_calendar_cards.js`, pour qu'ils aient un seul propriétaire partagé.
- Cartes ajoutées sous Heure :
  - **Quoi** : les puces de catégorie (`selectableChipGroupNode`, 1 à 3) ;
  - **Où** : un champ géocodé (`createFinderPlaceRuntime`), proposé à partir de la position ;
  - **Affiche** : `createMediaSourcesRuntime`, avec Importer, Photo et choix dans les listes
    de Créer ;
  - **Entrée** : Gratuit ou un prix, plus le lien Billet.
- Une fois publié, **l'état de publication se lit sur l'événement**, sans texte ajouté : l'outil
  de la bande est sélectionné quand l'événement est `live`, actif pendant `pending`. Un refus
  passe par une notification du canal existant (Q8).
- La bande d'édition reçoit un outil « déclarer » (libellé à choisir, Q5), placé avant ✓, à la
  fois dans `bevy_panel_calendar_band.js` et dans `dashboard_calendar_surface.js`.
- C'est un **design nouveau** (puces, lieu, affiche) : une maquette PNG aux vrais jetons est
  à valider avant de coder.

### 2.7 Les trois entrées

| Entrée | Ce qui se passe | Fichiers touchés |
|---|---|---|
| **Calendrier** | L'outil « déclarer » bascule l'événement ouvert en mode public, avec un brouillon pré-rempli : titre, date, lieu texte à géocoder. | `bevy_panel_calendar_band.js`, `dashboard_calendar_surface.js`, une intention `calendar.publication.*` routée vers le nouveau fichier |
| **Liste d'une rubrique** | Une tuile « + » sous les lignes, comme `new_playlist`, ouvre le panneau d'événement neuf en mode public. La catégorie vient de la plaque (Concerts → `concert`, Sport → `sport`…). Les entrées déclarées apparaissent dans la liste par le *kind* `declared`, ajouté à la chaîne de chaque plaque grâce à la taxonomie. | `dashboard_shows.js` (`tiles()`, `DASHBOARD_SHOW_LEVELS`), `shows_client.js` |
| **Envoi de Créer** | Un outil « déclarer » de plus dans la bande du sélecteur de personnes (`share()`), à côté de Réseau et Envoi. La création classée devient l'**affiche** de l'événement : image et dessin directement, texte exporté en PNG (Carré/Story) ou en PDF (A4). Un tap ouvre le panneau d'événement neuf en mode public. Pas de question modale (Q6). | `dashboard_create_surface.js` (une ligne), `public_event_draft.js` |

**Sur une entrée déclarée**, dans la bande sous l'aperçu :

- les outils existants : Agenda (`shows.add_to_calendar`, recopie dans mon agenda), Trajet,
  Site, Billet ;
- un outil de plus, **Signaler** ;
- **Contac.** (Q11) : demande de contact à l'organisateur par le parcours existant
  (`contact request`, garde anti-spam) ; absent pour un invité et sur ses propres annonces ;
- pour l'auteur, **Modif.** (ouvre son événement) et **Retirer** (`events.unpublish`).

**« Mes annonces »** : une ligne de plus dans la liste du calendrier ou dans une plaque (Q7),
qui réutilise le cadre de liste partagé et affiche les statuts.

### 2.8 Diffusion sur le réseau

Elle dépend de Q2. Ma recommandation :

1. **Toujours** : apparaître dans les rubriques autour du lieu, par lecture. Il n'y a rien à
   pousser et cela tient la charge.
2. **En direct** : le flux `public.events` pour les écrans ouverts.
3. **Option « Prévenir mes contacts »** : une News `audience:{group:[contacts]}` par la chaîne
   unique `window.eveNews`, dans **un projet News propre à l'annonce** (sinon `publish` marquerait
   tout le projet courant comme News), avec le tag de catégorie.
4. **Option « Réseaux »** : `shareFileToApp` (feuille de partage système) tout de suite, puis
   `social.prepare/publish` avec l'affiche stockée dès que les apps développeur seront
   configurées (bloqué aujourd'hui, `Private/social.env`).

« Les contacts ont des réseaux sociaux » : **ce n'est pas le cas aujourd'hui** (aucun champ).
Ce sont les comptes de **l'utilisateur** qui existent (Préférences › Réseaux sociaux). Voir Q9.

## 3. Questions à trancher (une à la fois)

- **Q1 — Qui voit les annonces ?** ✅ **Décidé le 2026-10-26 : tout le monde**, invités compris,
  comme les sources ouvertes. Lecture anonyme limitée par IP ; le filtre des auteurs bloqués ne
  s'applique que pour un compte connecté. Déclarer exige un compte.
- **Q2 — « Diffusé sur le réseau interne »** ✅ **Décidé le 2026-10-26 : a + b + c** (d écarté
  pour l'instant). Question d'origine : (a) visible dans les rubriques autour
  du lieu ; (b) + arrivée en direct sur les écrans ouverts ; (c) + News aux contacts en option ;
  (d) + notification aux gens proches qui suivent la catégorie. Recommandation : a + b + c ;
  d plus tard, car il faut une position connue par le serveur, ce qui touche à la vie privée.
- **Q3 — Modération.** ✅ **Décidé le 2026-10-26 : post-modération** (publication immédiate,
  masquage auto à 3 signalements, script admin) **avec les quotas du §2.3 tels quels.** Publication immédiate avec signalement et masquage automatique
  (post-modération), ou validation avant publication ? Quotas proposés au §2.3.
  Recommandation : post-modération.
- **Q4 — Où vont repas, soirée, atelier, marché ?** ✅ **Décidé le 2026-10-26 : une plaque de
  plus dans Temps libre** pour repas/soirée/atelier/marché, nommée **« Sortie »**. Aucune plaque ne les accueille. Proposition :
  une plaque de plus dans Temps libre, au nom court à choisir (« Entre nous » ? « Rendez. » ?),
  ou bien dans Temps libre › Événements.
- **Q5 — Libellé de l'outil** ✅ **Décidé le 2026-10-26 : « Annon. »** (partout : calendrier,
  rubriques, Envoi de Créer). Question d'origine : (6 lettres au plus) : « Annon. », « Promo », « Public » ou
  « Décla. » ?
- **Q6 — Envoi de Créer** ✅ **Décidé le 2026-10-26 : outil « Annon. » dans la bande d'envoi**,
  la création devient l'affiche ; aucune question posée. Question d'origine : : un outil de plus dans la bande d'envoi (recommandé, zen : rien à
  répondre pour qui envoie juste à un contact), ou la question « est-ce daté ? » posée à chaque
  envoi ?
- **Q7 — « Mes annonces »** ✅ **Décidé le 2026-10-26 : une entrée dans le calendrier** (liste
  des annonces + statuts, Modif./Retirer). Question d'origine : : dans le calendrier, dans chaque rubrique, ou nulle part (l'agenda
  suffit) ?
- **Q8 — Distinguer une annonce d'Atome d'une source ouverte** ✅ **Décidé le 2026-10-26 :
  organisateur sur la ligne de détail (pas de badge) + annonces mêlées par date.** Conséquence
  technique (L6) : la chaîne des *kinds* se lit aujourd'hui à la suite, sans tri. Le *kind*
  `declared` doit donc être lu à part, puis fusionné par `start` dans chaque page de la liste.
  Cette fusion se fait dans `readPage` de `dashboard_shows.js`, sans liste parallèle. Question
  d'origine : dans la liste : l'organisateur
  sur la ligne de détail (recommandé, pas de badge), annonces en tête de liste ou mêlées par
  date ?
- **Q9 — Réseaux des contacts** ✅ **Décidé le 2026-10-26 : il s'agit des comptes de
  l'utilisateur**. « Annon. » propose aussi la publication sur ses réseaux (§2.8, point 4). Aucun
  champ n'est ajouté aux contacts. Question d'origine : : faut-il ajouter des champs réseaux sociaux aux fiches de
  contact (tâche à part), ou bien parliez-vous de vos propres comptes ?
- **Q10 — Récurrence.** ✅ **Décidé le 2026-10-26 : répétition acceptée.** Le serveur publie les
  occurrences des 60 prochains jours. L'extension de récurrence passe dans `atome/src/shared`
  (lot L2). Question d'origine : Une annonce qui se répète (cours chaque mardi) : publier les occurrences
  des 60 prochains jours (recommandé ; l'extension de récurrence passe dans `atome/src/shared`
  pour servir aussi au serveur), ou seulement des dates uniques en v1 ?
- **Q11 — Contacter l'organisateur.** ✅ **Décidé le 2026-10-26 : outil « Contac. »** sur l'annonce,
  qui ouvre la demande de contact existante (anti-spam compris). Caché pour un invité. Question d'origine : Un outil « Contacter » sur l'annonce, qui ouvre une demande
  de contact par le parcours existant (anti-spam compris) ? Ou rien en v1 ?

## 4. Lots (dans l'ordre ; chacun se termine par sa sonde verte)

**État au 2026-10-26 soir : tout est codé et vérifié sur Web.** Sondes : `temp/public_events/l3_server.probe.mjs` 20/20
(serveur isolé, 4 comptes réels), `temp/public_events/ui.probe.mjs` 51/51 (app réelle, 2 comptes, vrais clics ; toutes les commandes `events.*` passées par MCP),
`temp/public_events/agenda_kinds.probe.mjs` 8/8. Documentation : `atome/documentations/public_events.md`.
Restent : l'essai sur Tauri, iOS et Android, et le déploiement sur atome.one (sur demande).

| Lot | Contenu | État |
|---|---|---|
| L0 | Q1–Q11 + maquette | ✅ réponses reçues, maquette validée (« lance tout ») |
| L1 | Taxonomie `atome/src/shared/activity_categories.js` (13 catégories), contrat `public_event_contract.js`, i18n `eVe/i18n/languages_public_events.js`, `AGENDA_WORDS` lus dans la taxonomie (marchés et brocantes passent d'Événements à Sortie, kind `outings`), haversine partagé | ✅ |
| L2 | Modèle : `publication` (auteur) + `publication_status` (serveur seul) sur `calendar_event` (`calendar_model.js`, brouillon de l'éditeur, `eventPayload`) ; la récurrence vient de `icalendar.js`, déjà importable côté serveur | ✅ |
| L3 | Serveur : tables, `public_events{,_store,_guard}.js`, `ws_api_commit_effects.js` (les 4 sites), trame `public-events`, kind `declared`, push `public-events-changed`, script d'administration | ✅ 20/20 |
| L4 | `events.*` (13 commandes, + `panel`, `save`, `share`) aux 7 endroits + instructions vocales ; `declare` / `publish` confirmés ; `creation_id` (affiche) sur declare/publish/update/open, `open { mine }` | ✅ toutes vérifiées par MCP (categories, declare→confirmation, nearby, mine, open ×2, update, report, contact, unpublish) ; plaque Sortie dans `shows.plates` / `shows.search` et les instructions |
| L5 | Mode « Annon. » du panneau d'événement : cartes Quoi / Où / Affiche / Entrée / Diffuser, cartes extraites dans `bevy_panel_calendar_cards.js`, outil de bande (panneau et carte hébergée) | ✅ |
| L6 | Rubriques : plaque Sortie, annonces mêlées par date avec l'organisateur, tuile Annon., outils Écrire / Signal / Modif. / Retir., arrivée en direct | ✅ |
| L7 | Créer › Envoi › Annon. : la création devient l'affiche (`events.open { creation_id }`) | ✅ |
| L8 | Diffuser : Contacts = News aux contacts acceptés (dans une News propre à l'annonce) ✅ vérifié à 2 comptes ; Réseaux = feuille de partage système (non essayée en sonde : pas de Web Share dans Chromium headful macOS sans geste réel) | ✅ / partiel |
| L9 | Natif | ⏳ non essayé (Tauri, iOS, Android) ; déploiement atome.one à demander |
| L10 | Cartes, FRAMEWORK_STATE §5, documentation | ✅ |

**Écarts par rapport au plan et à la maquette (à valider) :**
- **Affiche** : un seul outil « Import » (le panneau d'import unique, règle AGENTS.md 18, ajoutée le
  26 oct.), à la place de Import / Photo / Créer. La photo et les médias sont dans ce panneau ; une
  création de Créer devient l'affiche par Envoi › Annon.
- **Écrire** : le champ du bas de la liste devient un champ d'écriture (« Écrire à Marie »), Entrée envoie.
  Correctif dans le propriétaire partagé : une conversation peut viser un compte absent du carnet
  (le serveur tranche : contact accepté → message, sinon demande de contact).
- **Tout à la voix (correction du 26 oct. soir)** : `events.panel` remplit chaque champ du panneau ouvert
  (lieu dit à voix haute → meilleure réponse du géocodeur), `choose_poster` ouvre le panneau d'import
  que `media_import.*` pilote, `events.save` = Garder (confirmé), `events.share` = Réseaux par les comptes
  connectés (`social.prepare` puis `social.publish`). À l'écran, Réseaux reste la feuille de partage
  système. Corrigé en route : le panneau d'événement revient avec son brouillon après le panneau d'import.
- **Libellés** : « Écrire » au lieu de « Contac. » (7 caractères), « Signal », « Retir. ».
- **« Mes annonces »** : une plaque de la rubrique Agenda du Dashboard. Le panneau Calendrier « pro »
  n'a pas de liste à part ; les annonces y sont des événements comme les autres.
- **Organisateur** : le nom que le compte partage sur sa fiche publique. Un compte qui ne partage aucun
  nom n'en montre pas.
- **Lecture sur Tauri / iOS** : le relais natif retire le jeton, donc pas de filtre des personnes
  bloquées par ce chemin.
- **Signal** : un toucher signale avec la raison « autre ». Il n'y a pas de choix de raison à l'écran ;
  la voix et MCP peuvent en donner une.
- **Défaut de charte noté au §5** : déjà corrigé dans la brique par une autre session (« Une fois »
  prend l'aspect sélectionné). Une brique corrigée ici : les puces ne dépassent plus la largeur de leur
  groupe.

## 5. Garde-fous propres à cette tâche

- **Défaut de charte trouvé dans la brique réutilisée** (capture réelle
  `temp/calendar_alarm_action/base_top.png`, 2026-10-25). Le choix « Une fois » de Répéter est
  dessiné avec un **contour blanc**, ce qui viole la règle 15. Les puces de Me prévenir en avaient
  un aussi dans la maquette E1. Au lot L5, on corrige la brique propriétaire (contrôle segmenté et
  puces → `selectedSurface`), jamais une copie.

- **Une seule vérité.** L'atome de l'auteur fait foi. `public_events` n'est qu'une projection
  reconstructible : aucune écriture client directe, aucun contenu cru sans relecture du coffre.
- **Pas de copie.** On réutilise le panneau d'événement, le cadre de liste, la chaîne News,
  `shareFileToApp`, le géocodeur, la garde anti-abus et `blockedEitherWay`. On n'écrit ni
  formulaire parallèle, ni seconde taxonomie, ni seconde chaîne de publication.
- **Pas de repli.** Pas de lieu géocodé : refus explicite (`events_place_required`). Serveur
  injoignable : statut `pending`, jamais un succès simulé.
- **Zen et charte (AGENTS.md 10-16).** Aucun badge ni texte non demandé. Libellés de 6 lettres
  au plus. États par les jetons, jamais de bordure.
- **Vie privée.** Le serveur ne connaît la position d'un lecteur que le temps de sa requête et
  ne la garde pas. Le lieu d'une annonce est public par nature : on le dit dans la carte Où
  (texte validé en maquette).
- **Chaque action d'écran a sa commande `events.*`**, dans la même tâche.
