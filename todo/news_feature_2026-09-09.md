# News eVe — publication et fil multi-utilisateurs (9 sept. 2026)

## Etat

Implementation **livree**. Verification executable **complete** (7 probes vertes, dont le fil
3 utilisateurs x 3 posts). Verification **visuelle UI incomplete** — un seul blocage, decrit
plus bas, sans rapport avec la fonctionnalite.

## Ce qui a ete fait

| Lot | Contenu | Fichiers principaux |
|---|---|---|
| 1 | i18n (25 cles fr/en) + vocabulaire de 15 tags + nom horodate parametrable | `eVe/i18n/languages_{fr,en}_core.js`, `eVe/domains/news/news_tag_vocabulary.js`, `eVe/core/project_default_name.js` |
| 2 | Rangee News du Dashboard lue en **scope global** (visible depuis n'importe quel projet) + categorie critique a l'ouverture | `eVe/domains/dashboard/dashboard_data_adapters.js`, `dashboard_open_state.js` |
| 3 | Creation d'un fil : projet marque `project_kind:'news'`, `view_mode:'list'`, ligne Tags, molecule d'auteur (titre + corps), carte Dashboard | `eVe/domains/news/news_model.js`, `news_thread_runtime.js`, `dashboard_header_creation_actions.js` |
| 4 | Ouverture depuis la carte News | `eVe/domains/dashboard/dashboard_actions.js` |
| 5 | Rail contextuel curate + correction de l'arite `(definition, options)` | `eVe/domains/rendering/project_view_news_rail.js`, `project_view_surface_context_runtime.js` |
| 6 | Outil Tags : panneau Bevy (recherche + liste + creation), atome `type:'tag'` | `eVe/intuition/runtime/bevy_panel/bevy_panel_tags_runtime.js`, `eVe/intuition/tools/tags.js`, `eVe/domains/news/news_tag_line_runtime.js` |
| 7 | Depot d'un tag par glisser sur la ligne Tags (pont panneau -> vue projet, inexistant avant) | `eVe/domains/news/news_tag_drop_runtime.js` |
| 8 | Lecture seule **par molecule** avec remontee d'ancetres, branchee sur le point d'etranglement des ecritures | `eVe/intuition/tools/core/tool_runtime_atome_mutation_shared.js`, `eVe/intuition/runtime/tool_genesis_mutation_runtime.js` |
| 9 | Charge utile de publication portant le sous-arbre + le contrat de lecture | `eVe/domains/news/news_publication_payload.js`, `eVe/intuition/tools/communication_news_publication.js` |
| 10 | Reception : resolution/creation du projet local, materialisation, fusion des tags, carte locale | `eVe/domains/news/news_reception_runtime.js`, `eVe/intuition/tools/communication.js` |
| 11 | Mode d'ecriture (`none`/`all`/`open`) selectionnable, permissions reellement envoyees | `bevy_panel_comm_model.js`, `bevy_panel_comm_runtime.js`, `bevy_panel_comm_advanced_view.js`, `communication_events.js` |
| 12 | Reponses : molecule par auteur, participants du fil, preconfiguration de Communiquer | `news_thread_runtime.js`, `project_view_news_rail.js`, `communication.js` |

## Decisions structurantes

- **Une News = deux objets** : un PROJET (le fil, en mode liste) + une CARTE `type:'record'`
  en **scope global** (`project_id` null) qui pointe vers lui via `news_project_id`. Sans le
  scope global, la carte n'etait visible que si son propre projet etait courant.
- **Le verrou est par MOLECULE**, jamais par projet : c'est ce qui laisse un destinataire
  repondre dans un fil en lecture seule.
- **Deux commutateurs orthogonaux** : `share_mode` (temps reel / one shot / copie — le
  transport) et `writable` (la permission). `collaboratif = realtime && writable` : dans ce
  cas rien n'est copie, le partage de vault diffuse les atomes de l'auteur.
- **La timeline de molecule est reconstruite a la reception**, jamais transportee (la
  publication est stockee verbatim dans une pile plafonnee a 200 entrees).
- **`tag` n'est PAS enregistre dans `core_atome_types.js`** (`registerCoreAtomeTypes()` n'est
  appele que par les tests et basculerait `allow_unknown_properties:false` sur tous les
  types). Il porte un cas explicite dans `render_atom.js normalizeType` -> `text`.

## Bugs preexistants corriges en passant

- `props.locked` etait **ignore** par `updateAtomeProperties` et le commit de texte : la
  lecture seule etait purement decorative.
- `advanced.readMode/writeMode/writeProps` etaient collectes mais **jamais lus** a l'envoi ;
  les permissions partaient codees en dur `alter:true`.
- L'invocateur du rail perdait son second argument : **tout slider du rail etait muet**.

## Bug preexistant NON corrige (hors perimetre)

- `main_menu_content_runtime.js:432` — le `touch` de l'outil `import` du ruban appelle
  `invokeCreateTool`, jamais defini dans ce fichier -> `ReferenceError`. Le rail News ne
  passe donc jamais par cette route. Correctif suggere : `invokeSimpleTool('ui.capture.import')`.
- `dashboard_label_persistence.js` refuse toujours de renommer une carte News.

## Verification

7 probes sous `temp/`, toutes vertes :

```
temp/news_dashboard_reader.probe.mjs     portee de lecture de la rangee News
temp/news_thread_creation.probe.mjs      arbre du fil valide par le VRAI modele de liste
temp/news_dashboard_entry.probe.mjs      appui long reel (520 ms / 10 px) + ouverture de carte
temp/news_rail.probe.mjs                 rail curate, niveau unique, arite, routage
temp/news_tags.probe.mjs                 3 chemins d'ajout, dedup, glisser-deposer
temp/news_lock.probe.mjs                 lecture seule par molecule
temp/news_thread_3x3.probe.mjs           3 utilisateurs x 3 posts = 9 contributions
```

Le fil 3x3 verifie chez CHACUN des trois utilisateurs : 3 molecules nommees « auteur · date »,
les molecules des autres verrouillees et la sienne editable, une seule ligne Tags fusionnee
sans doublon, les 3 participants connus, et la carte Dashboard visible depuis un autre projet.

## Blocage restant : le parcours visuel

`temp/news_ui_thread.probe.mjs` (Playwright, jamais le volet navigateur).

**Ce qui passe deja** : 3 comptes crees et connectes dans un vrai navigateur, Dashboard
monte, et l'appui long au pointeur atteint bien `__eve_dashboard_header_bg_news` **et declenche
la creation de News** — prouve par l'erreur qui remonte de l'INTERIEUR de celle-ci.

**Ce qui bloque** : `matrix_project_list_failed: Fastify backend is not configured (missing
Fastify WebSocket URL)`. Le client ne resout son backend Fastify que sur le **port 3001**
(`server_config.json`), or le serveur de dev de l'utilisateur l'occupe et n'a pas le bypass
OTP — la probe doit donc demarrer sa propre instance sur un port libre. `window.__SQUIRREL_FASTIFY_WS_API_URL__`
est remis a null par le boot de l'application.

**Deblocage** : arreter le serveur de dev sur 3001 et laisser la probe demarrer son instance
`SQUIRREL_AUTH_OTP_BYPASS=1` sur ce port. Une seule ligne a changer dans la probe (`PORT: '3001'`).
Cela n'a rien a voir avec la fonctionnalite News : toute creation de projet echoue de la meme
maniere dans cet environnement.

## Non verifie

- Tauri et iOS : non executes.
- Enregistrement audio/video et import reels dans une News : cables sur les routes eprouvees
  du rail standard, mais non exerces au pointeur.

---

# Correction (9 sept. 2026, seconde passe)

## Le modele etait faux

Une News n'est **rien d'autre qu'un projet ordinaire portant un tag de catalogue `news`**.
La premiere passe avait cree un objet « carte » distinct a cote du projet : deux objets pour
une seule chose, d'ou la double creation apparente et la suppression asymetrique.

- `properties.project_tags: ['news']` sur l'atome PROJET remplace l'ancien `project_kind`.
- La rangee News du Dashboard lit la **meme source que la rangee Projets**
  (`data_source: 'projects'` + `project_tag: 'news'` dans `constants.json`), filtree sur le tag.
- **Suppression symetrique** : les deux rangees portent le meme id, `runProjectAction` accepte
  desormais `news`, et un changement de projet recharge les deux
  (`GLOBAL_ACCOUNT_CATEGORIES` / `PROJECT_BACKED_CATEGORY_IDS`).
- Toute la notion de carte a disparu : `newsCardSpec`, `createLocalNewsPublication`,
  `updateNewsCard`, la lecture en scope global et son helper de portee sont supprimes.

## La roue reinventee

Les lignes etaient fabriquees par des evenements de commit ecrits a la main : sans geometrie
ni projection de scene, donc **visibles en liste et absentes en mode naturel**. Corrige :

- toute creation passe par `window.eveToolBase.createAtome` (rendu actif) et par
  `createCanonicalMolecule` ;
- `buildPropertiesFromSpec` filtrant par **liste blanche**, les proprietes metier
  (`news_line`, `hierarchy_order`, `tag_slug`) sont posees juste apres par une ecriture de
  proprietes ordinaire sur un atome deja cree ;
- la timeline de molecule n'est plus fabriquee a la main ;
- la ligne Tags nait avec son premier tag (une molecule canonique exige un membre).

## Les trois defauts signales

1. **Double creation** : verrou d'appel en cours dans `createNewsThread` — un appui long
   delivre deux fois ne cree qu'un projet. Verifie en UI reelle (1 projet cree) et par probe
   (deux appels concurrents -> un seul projet).
2. **Suppression** : le cablage est corrige (la rangee News accepte supprimer/dupliquer/copier
   et recharge les deux rangees). **Mais la suppression echoue encore cote serveur, pour TOUT
   projet** — voir le defaut anterieur ci-dessous.
3. **Ouverture du mauvais projet** : la creation n'active plus le workspace de son cote ; elle
   rend le projet et le Dashboard l'ouvre par `openProjectItem`, le seul endroit ou vit la
   transition de mode workspace. Verifie en UI reelle : le projet courant passe bien de
   l'ancien au nouveau.

## Defaut ANTERIEUR, non corrige (hors perimetre)

`api.projects.delete` echoue pour **tout** projet, News ou non :
le serveur refuse l'action `atome`/`delete` heritee que le client appelle encore
(`canonical_event_commit_required`, `server/server.js:3390-3401` et `:3530-3534`).
Preuve : dans la meme session, un projet de controle **sans tag news** echoue a l'identique.
C'est la vraie cause de « ca n'efface pas toujours ». Je n'y ai pas touche : le chemin est
partage par toutes les suppressions de projet.

## Menage

Exports que personne n'importait ramenes au rang de details internes
(`NEWS_PROJECT_TAG`, `PROJECT_TAGS_PROPERTY`, `NEWS_DEFAULT_PRESENTATION`, `withProjectTag`,
`isNewsLine`, `normalizeNewsParticipants`, `NEWS_PAYLOAD_SCHEMA_VERSION`,
`isNewsTagDragPayload`, `NEWS_TAG_SLUGS`, `newsTagVocabulary`, `matchesNewsTagQuery`) ;
`findTagsLine` en double supprime ; dependance `commitBatch` qui fuyait dans l'API du runtime
de tags supprimee.

## Verification

8 probes vertes, dont **le parcours navigateur reel** (`temp/news_ui_thread.probe.mjs`,
3 comptes crees depuis la page contre le serveur de dev 3001) :

- appui long au pointeur sur l'entete News -> **un seul** projet, tague `news`,
  nomme `News <date>`, `view_mode: list` ;
- le **nouveau** projet devient courant (et pas l'ancien) ;
- molecule « auteur · date » avec titre et corps comme MEMBRES
  (`meta.parent_id`, l'appartenance canonique) ;
- les deux lignes sont **projetees dans la scene** (`scene.byId`) : la correlation
  liste <-> naturel est retablie.

Non verifiable en Chromium headless : le rail de niveau (la surface projet ne monte pas sans
WebGPU — `bevy_renderer_initial_present_timeout`). Il est couvert par
`temp/news_rail.probe.mjs`, qui exerce le vrai `openCurrentLevel`.

---

# Troisieme passe — les trois defauts restants

## 1. La suppression ne supprimait rien (defaut ANTERIEUR, corrige)

Le client appelait l'action heritee `atome`/`soft-delete`, que le serveur refuse
(`canonical_event_commit_required`, `server/server.js:3390-3401`). **Toute** suppression de
projet echouait, News ou non — c'etait la vraie cause de « ca n'efface pas toujours ».

Correction : la suppression passe desormais par un **evenement canonique**
(`{type:'events', action:'commit', event:{kind:'delete', atome_id, actor}}`), comme toute
autre ecriture. `adole_adapter_atome.js` expose `commitDelete` ; `delete_atome` l'utilise.
Le chemin `softDelete` mort a ete supprime.

Verifie par `temp/news_delete.probe.mjs` (navigateur reel) : un projet **ordinaire** et une
**News** se suppriment tous deux et disparaissent de la liste. Rouge avant, vert apres.

## 2. Le rail n'etait pas verifiable (corrige)

Chromium headless n'exposait aucun adaptateur WebGPU : le moteur Bevy n'atteignait jamais sa
premiere presentation et la surface projet ne montait pas. Avec un adaptateur logiciel
(`--use-angle=swiftshader --use-vulkan=swiftshader --enable-unsafe-webgpu`), la vue liste
monte reellement.

Verifie en UI reelle : `activeKind: 'container_project'`, `toolCount: 12` — exactement les
12 outils du rail News — et la vue liste affiche la ligne de contribution.

## 3. La correlation liste <-> naturel, verifiee pour de vrai

La probe bascule maintenant le projet en **mode naturel** et verifie que les deux lignes
creees en liste sont projetees dans `scene.byId` (`known: 2, types: ['text','text']`), puis
revient en liste. C'est la verification que le defaut « invisible en mode naturel » exigeait.

## 4. La reception etait fausse (corrige au passage)

Le destinataire recreait la contribution **avec les identifiants de l'emetteur** : le serveur
refusait l'ecriture (`property_write_denied`) — on n'ecrit pas dans les atomes d'autrui.

Correction : la reception recree la contribution par les **primitives canoniques**
(`ensureContributionMolecule` -> `createAtome` + `createCanonicalMolecule`), sous des
identifiants possedes localement. Une contribution par auteur, retrouvee et rafraichie a
chaque nouveau post : le rejeu est idempotent sans cle supplementaire.
`newsPublicationCommitEvents` (evenements bruts) est supprime.

## 5. Optimisation : la reception relisait tout le projet quatre fois

Chaque publication recue declenchait quatre lectures completes de l'etat du projet
(jusqu'a 2000 lignes) : une pour la contribution, une par tag fusionne, une pour les
participants. Sur un fil de 9 posts a trois utilisateurs, cela faisait ~72 lectures — assez
pour faire tomber la connexion WebSocket du serveur de dev en cours de parcours.

Desormais **une seule lecture par reception**, partagee entre la contribution, les tags et
les participants (`readProjectRecords` expose par le runtime de fil) ; `mergeNewsTags` lit
une fois quel que soit le nombre de tags et **ne fait rien du tout** quand ils sont deja tous
presents — le cas courant d'un fil qui s'anime.

## 6. Duplication des tags (attrapee par le parcours navigateur)

Sur le fil complet, la ligne Tags se remplissait de doublons (science x4, sport x13). Cause :
`parentIdOf` du runtime de tags lisait `record.parent_id` alors que **l'appartenance
canonique vit dans `meta.parent_id`**. `readNewsTagSlugs` voyait donc une ligne toujours
vide, et chaque reception rajoutait les memes tags.

Corrige aux trois endroits ou je lis un parent. Les magasins des probes exposaient le parent
a la racine — une forme que le serveur ne produit jamais : ils reproduisent desormais la
forme serveur, ce qui rend cette classe de defaut detectable hors navigateur.

## Verdict final du parcours navigateur

`temp/news_ui_thread.probe.mjs`, trois sessions authentifiees contre le serveur de dev :

```
news:created            un seul projet, tags ['news'], view_mode list
news:opened             le NOUVEAU projet devient courant (pas l'ancien)
news:structure          molecule « auteur · date », lignes titre + corps
news:list_mounted       surface liste montee, la contribution s'affiche
news:lines_in_natural_scene   2/2 lignes projetees en mode naturel
news:rail               container_project, 12 outils = le rail News
thread:round_1/2/3      9 publications, 18 receptions, rejeux dedupliques
thread:alice/bob/carol  3 contributions (Alice, Bob, Carol), 2 tags sans doublon,
                        3 participants, projet present sur les rangees News ET Projets
news:deleted            News et projet de controle supprimes
news:delete_symmetric   disparu des deux rangees
```

Les contributions des autres sont verrouillees chez chaque destinataire, la sienne reste
editable — verifie a chaque tour.
