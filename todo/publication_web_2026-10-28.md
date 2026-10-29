# Publication Web — créer un site avec eVe et le publier sur atome.one/<slug>

Tâche ouverte le 2026-10-28 à partir du cahier des charges `~/Desktop/AtomeWebSite.md` (v1.2).
Méthode décidée par l'utilisateur le 2026-10-28 : **toutes les questions et toutes les maquettes sont
validées au départ** (une question à la fois, puis une maquette à la fois) ; ensuite la réalisation est
entièrement autonome jusqu'à la recette. Rien n'est codé.

Ce fichier tient lieu des livrables `00_audit`, `01_plan` et `12_decisions` du cahier (§19), réconciliés
avec les conventions du dépôt : plans dans `todo/`, maquettes dans `temp/publication_web/mockups/`,
documentation finale dans `atome/documentations/web_publishing.md`, sondes dans `temp/publication_web/`.

---

## 1. Audit G0 — ce qui existe vraiment (vérifié le 2026-10-28)

### 1.1 Briques réutilisables

| Brique | Où | État pour un site |
| --- | --- | --- |
| Page | `ui.page.create` → `createPage` (`eVe/domains/rendering/project_view_creation_runtime.js:179`) : un `group` avec `container_kind:'page'`, cadre, format (`page_formats.js`), découpe de ses membres (`page_container_projection.js`) | **À adapter** : id stable (atome_id) ✔ ; aucun titre ni slug (nom générique « Page ») ; aucune API « lister les pages » (chacun filtre `isPageContainerRecord`) ; ordre = `hierarchy_order` générique ; `page_cover` (une page de couverture par projet) existe → candidate naturelle pour l'accueil |
| Interaction | `eVe/intuition/runtime/interaction_model.js`, `interaction_runtime.js` : `trigger` (`activate`, `hold`, …), `target` (`fixed`/`trigger`/`dynamic` via Conditions), `actions[{tool_id, action, parameters, parameter_bindings}]`, modes `consultation`/`performance` ; exécution par `invokeToolGateway` | **Réutilisé tel quel** pour le modèle ; tap/appui long hors édition captés par `interaction_surface_layer.js` |
| Panneau Interaction | `bevy_panel_interaction_runtime.js` (Quand / Sur quoi / Faire, test, sauvegarde) ; le « Faire » = `readMainMenuToolCatalog()` (les outils du ruban) | **À étendre** : aucune action « aller à une page » ni « ouvrir un lien » n'existe (recherche exhaustive : `href`, `open_url`, `goto`, `enter_page`, `ui.link`… : rien). `web.open`/`web.navigate` ouvrent le navigateur intégré du Dashboard, pas une page du projet |
| Niveaux du projet | `project_view_navigation.js` (pile de niveaux d'édition/List/Matrix) | Ce n'est **pas** une navigation entre URL ; sert seulement à « entrer » dans une page côté eVe |
| MCP / Runtime V2 | `runtime.tools.list/call/batch_call` (`mcp_handlers_ai_runtime.js`) → `v2Runtime` ; familles déclarées **une seule fois** dans `atome/src/squirrel/atome/mcp_contract_families.js` + un exécuteur dans `tool_runtime_service_commands.js` ; confirmation humaine en deux temps (`*_CONFIRMED_COMMANDS`, `validateConfirmation`) | **Réutilisé** ; famille `site.*` à créer ; **aucune commande MCP ne crée une Interaction** (seul le panneau appelle `saveInteraction`) → famille `interactions.*` à créer |
| Construction de projet par MCP | `projects.create`, `ui.page.create` (sans paramètre !), `ui.text.create`, `ui.creator` (forme, image, svg…), `media_import.*` | **À compléter** : `ui.page.create` ne prend ni nom ni cadre ; pas de liste non filtrée des atomes d'un projet |
| Projection publique (motif) | `server/public_events.js`, `server/shop_listings.js` : la vérité reste un Atome du coffre de l'auteur ; un seul crochet `afterCommitted` (`server/ws_api_commit_effects.js`) projette dans une table de l'orchestrateur ; lecture anonyme | **Motif à suivre** pour l'intention de publication ; mais un site a besoin de **versions figées** (absentes de ces deux projections) |
| Lecture serveur d'un projet | `userVaultRouter.listStates(principal, { project_id, … })` (≤ 10 000, pagination) | **Réutilisé** par le compilateur de publication |
| Fichiers publics | particule `is_public` sur les fichiers (`server/userFiles.js:304`) ; `/api/uploads/:file` lisible anonymement si public | Utilisable, mais un site doit servir des **copies versionnées et immuables** (rollback) |
| Crédits / tokens | `atome/src/shared/billing_contract.js` (1 crédit = 0,001 € ; offres 3000 crédits/mois ; pack 4000 = 5 €) ; grand livre append-only `server/billing/billing_ledger.js` | `debit`/`authorize` **n'ont aucun appelant** : aucune consommation n'est débitée aujourd'hui. Paiements Web **simulés** ; Stripe = nom de source sans code ; Apple/Google réels |
| Planification serveur | `setInterval` du séquestre de la boutique (`server/shop.js`) ; pas de table de tâches générique ; idempotence par `operation_digest` / `entry_ref` | Motif réutilisé pour les publications programmées |
| Surfaces « publier » existantes | News (`news_publish_api.js`, diffusion aux comptes, pas d'URL publique), `social.*`, Créer › Envoi, lien d'événement `/?event=<id>` | Aucun « Publier » ni « Partager » de **projet** dans le ruban ; les options d'appui long d'un projet (Dashboard › Projets) : copier, coller, dupliquer, favori, supprimer |

### 1.2 atome.one (sondé de l'extérieur, anonymement)

- DNS : `atome.one` et `www.atome.one` → `5.196.69.103` ; pas d'AAAA ; pas d'enregistrement CAA.
- TLS : Let's Encrypt (`CN=atome.one`, SAN `atome.one`, `www.atome.one`), valable jusqu'au 25/01/2027 ;
  HTTP → HTTPS en 301.
- nginx (config versionnée `deploy/atome-one-sync/nginx-atome.one.conf`) : `location /` relaie **tout** vers
  Fastify (127.0.0.1:3001) → **aucun changement nginx n'est nécessaire** pour `atome.one/<slug>`.
- Fastify : `GET /<inconnu>` → **404 JSON** (`Route GET:/… not found`), pas de repli SPA ; `/robots.txt` et
  `/sitemap.xml` → 404. Le site applicatif est servi à la racine depuis `atome/src` (statique).
- Chemins de premier niveau déjà pris (à réserver comme slugs) : `api ws atome eVe src vendor assets auth ios
  health healthz __whoami dev client-log server_config.json offline-manifest.js .well-known application css js
  shared squirrel utils wasm sw.js index.html version.json favicon.ico ios-install.html offline_media.js
  eve_preview_capture.html eve_youtube_player.html` + mots système à ajouter (`admin login static www mail
  help support legal terms privacy …`).
- **Limite** : la lecture de la configuration réelle du serveur par SSH (nginx, certbot, utilisateur du
  service) a été **refusée** par la politique de permission de cette session. Pour la recette en production
  (et pour les domaines personnels, qui touchent nginx/certbot), il faudra ton autorisation explicite.

### 1.3 Ce qui manque (matrice « existant / à adapter / à créer »)

| Besoin | Statut |
| --- | --- |
| Nom/titre de page, slug de page, liste ordonnée des pages, accueil | à adapter (Page + `page_cover`) |
| Action « Aller à » (page du projet / lien externe) | **à créer** dans le moteur Interaction + catalogue du « Faire » |
| Commandes MCP pour les interactions | **à créer** (`interactions.*`) |
| `ui.page.create` avec nom et cadre par MCP | à adapter |
| Compilateur Atomes → site public (pages, ressources, manifest d'interactions publiques, SEO) | **à créer** (selon Q1) |
| Site, slug, versions immuables, opérations, pointeur actif, historique | **à créer** (tables orchestrateur, motif `public_events`) |
| Route publique `/<slug>[/<page>]`, 404/410, robots, sitemap, cache | **à créer** (Fastify) |
| Panneau Publier (préparer, vérifier, aperçu, publier, mettre à jour, programmer, historique, retour arrière, retirer) | **à créer** sur les briques de panneau Bevy |
| Famille `site.*` (MCP/voix, confirmations) | **à créer** |
| Débit d'hébergement en crédits | à adapter (`billing_ledger.debit`, jamais appelé) |
| Domaine personnel (preuve TXT, routage par hôte, certificat) | **à créer** + changement d'infrastructure (nginx/certbot) |
| Achat/transfert de domaine, DNS, boîtes mail, commission 3 % | **à créer** ; **aucun fournisseur** (registrar, mail) ni paiement réel n'existe |

### 1.4 Risques relevés

1. **Architecture** : un site public lisible sans WebGPU, indexable et léger suppose un **second rendu**
   (HTML/CSS) à côté de Bevy. AGENTS.md règle 7 interdit « raw HTML/DOM imitation or a parallel
   implementation » et le principe 3 impose un seul rendu. Le cahier recommande l'inverse. → **Q1, arbitrage
   obligatoire avant tout.** (Le 28 oct., tu avais écarté le HTML serveur pour les liens d'événement.)
   Mesure du 28 oct. (`temp/publication_web/boot_weight.probe.mjs`, atome.one, cache vide, fibre) : premier
   canevas eVe à ~20 s, 11,9 Mo transférés, 1 467 requêtes (1 444 modules JS). Le moteur seul :
   `squirrel_bevy_renderer_bg.wasm` = 13,4 Mo (3,4 Mo en brotli), plancher d'un lecteur visiteur.
2. Les pages eVe sont des **cadres libres à positions absolues** (A4, Lettre, libre) : leur tenue sur mobile
   n'est pas évidente → Q2.
3. Le cahier dessine des boutons dans le corps des panneaux, des boutons radio, des libellés longs : ses
   wireframes **contredisent la charte** (règles 11-16 : outils dans la bande du bas, libellé ≤ 6 lettres,
   date/heure sur un rouleau, zen). Les maquettes les traduisent dans la charte ; tout écart sera montré.
4. Deux chantiers voisins non terminés : le **Publier unifié** (réseaux, forums ; décidé le 26 oct., jamais
   codé) et la **publication programmée via l'Agenda** (autre session, 28 oct., questions en cours) → Q4, Q10.
5. Domaines et mails : aucun registrar, aucun fournisseur mail, aucun paiement réel → sans contrat, la recette
   « réelle » exigée par le cahier est **BLOQUÉE** ; seule une simulation (comme la Boutique) est faisable → Q14.
6. Production : la recette finale exige un déploiement sur atome.one, donc un commit/push (que tu fais) ou un
   correctif ciblé appliqué au serveur, et l'accès SSH → Q18.

---

## 2. Questions à trancher (posées une par une, dans cet ordre)

Chaque question vient avec ma recommandation. Les réponses sont consignées ici au fil de l'eau.

| # | Question | Ma recommandation |
| --- | --- | --- |
| Q1 | **Rendu du site public** : (A) projection HTML/CSS générée côté serveur à partir des atomes ; (B) le moteur eVe (Bevy/WebGPU) en mode visiteur sur une version figée ; (C) les deux : B pour l'affichage, plus un HTML minimal (textes, images, liens) pour l'indexation et les navigateurs sans WebGPU | **A**, en levant explicitement pour ce cas l'interdit de la règle 7 (la projection publique est une sortie, comme le PDF d'une page, jamais une vérité ni un éditeur) |
| Q2 | **Tenue sur mobile** d'une page (cadre libre) | Page mise à la largeur de l'écran ; sous une largeur seuil, objets réempilés dans l'ordre de lecture (haut → bas, gauche → droite) |
| Q3 | **Où se trouve « Publier »** | Un outil « Publier » dans le menu du projet (à côté de Communiquer) + l'option « Publier » dans l'appui long d'un projet (Dashboard › Projets) |
| Q4 | Lien avec le **Publier unifié** (réseaux/News) prévu le 26 oct. | Panneau à part pour le site (versions, adresse, domaine n'ont rien d'un message) ; une fois en ligne, « Annoncer » le lien passe par le Publier unifié quand il existera |
| Q5 | **Qu'est-ce qu'une page web** | Chaque Page à la racine du projet = une page du site ; son nom = titre et slug ; ordre = celui du projet ; accueil = la page de couverture (sinon la première) ; un projet sans Page = une seule page (tout le canevas) |
| Q6 | **Action « Aller à »** dans Interaction | Nouvelle action native du « Faire » : vers une page du projet (id stable) ou un lien externe http(s) (même onglet / nouvel onglet) ; dans eVe en consultation, elle amène sur la page ; pas de menu automatique (zen), on compose ses propres objets de navigation |
| Q7 | **Adresse** | `atome.one/<slug>` proposé depuis le nom du projet, unique pour tout atome.one, premier arrivé ; slugs système réservés ; un slug changé redirige (301) l'ancien vers le nouveau |
| Q8 | **Dates sur le site public** | Jamais affichées sur le site (zen) ; toujours dans le panneau |
| Q9 | **« Powered by atome »** | Une ligne discrète au pied de chaque page : « Créé avec atome » → https://atome.one |
| Q10 | **Programmer** publication / mise à jour | Version figée au moment de programmer ; rouleau « Quand » comme pour les événements ; la publication apparaît dans l'Agenda (même mécanique que la publication programmée en cours) |
| Q11 | **Retirer** le site | Réponse 410 + `noindex` ; slug gardé au même propriétaire ; versions conservées tant que le site existe |
| Q12 | **Images** publiées | Copies figées et publiques par version ; seules les images posées sur une page publiée sortent ; image du web (« Hasard ») publiée avec sa source/attribution |
| Q13 | **Domaine personnel** dans ce lot ? | Oui : preuve TXT + CNAME, certificat Let's Encrypt automatique ; demande un changement nginx/certbot sur le serveur |
| Q14 | **Domaines & Emails** (achat, transfert, DNS, boîtes) | Tout le parcours codé avec un fournisseur **simulé** (comme la Boutique), plus un comparatif de fournisseurs réels ; le branchement réel vient quand tu as choisi et signé |
| Q15 | **Hébergement en crédits** | Débit quotidien par site en ligne ; tarif à fixer (proposition : 89 crédits/mois ≈ 0,09 €, trafic raisonnable inclus) ; alerte sous un seuil, période de grâce de 21 jours, jamais de coupure brutale |
| Q16 | **Commission 3 %** sur les domaines | Assiette = prix fournisseur HT ; affichée comme une ligne à part « Service atome » dans le devis ; jamais ajoutée après confirmation |
| Q17 | **Formulaire de contact** au premier lot ? | Non : vitrine + navigation + liens d'abord ; formulaire (messages reçus dans Communication) dans un lot suivant |
| Q18 | **Production** | À la fin, je te demande le feu vert ; déploiement par la procédure habituelle (ou correctif ciblé) ; deux sites de test publiés puis retirés après ta recette |

## 3. Maquettes à valider (une par une, après les questions ; PNG aux vrais jetons, depuis l'app réelle)

Les wireframes du cahier sont traduits dans la charte (outils dans la bande du bas, libellés ≤ 6 lettres,
rouleau pour la date, case de sélection à gauche, accordéon vers le haut, aucun bord).

| # | Écran | Contenu |
| --- | --- | --- |
| M1 | Projet → Publier | l'outil Publier dans le menu du projet ; projet jamais publié / déjà publié |
| M2 | Interaction → Aller à | Quand : Toucher ; Faire : Aller à → choix de la page (ou lien externe, onglet) |
| M3 | Publier (première fois) | pages cochées (case à gauche), accueil, adresse + disponibilité, titre, description, Quand ; bande : ✕ · Aperçu · Vérif. · Publier |
| M3 bis | Adresse / domaine personnel | adresse atome par défaut ; mon domaine : valeurs DNS, états (à configurer, vérification, actif, erreur) |
| M4 | Site en ligne | état, adresse, dates, version en ligne vs projet ; bande : ✕ · Voir · Copier · MàJ · Quand · Hist. · Retirer |
| M5 | Historique | une rangée par version (date, auteur, état) ; prochaine opération programmée ; Voir / Rétablir |
| M6 | Site public | une vraie projection d'un projet de test, ordinateur + téléphone |
| M7 | Mes sites (Projets) | la liste de tous ses sites dans la rubrique Projets (Q4 bis) |
| M8 | Outil Menu | création d'un menu fait d'objets, lié sur toutes les pages (Q6) |
| M9 | Formulaire de contact | l'objet formulaire posé sur une page, et le message reçu dans Communication (Q17) |
| M3 ter–octies | Domaines & Emails | recherche, devis (3 %), domaine détenu (connecter/transférer), DNS + renouvellements, boîtes mail, crédits d'hébergement — seulement si Q14 les garde dans le programme |

## 4. Plan de réalisation (après validation de tout ce qui précède)

Lots enchaînés en autonomie, chacun prouvé par une sonde sur le vrai mécanisme (`temp/publication_web/`).

1. **Pages** : nom/titre/slug de page, liste ordonnée des pages, accueil ; `ui.page.create` avec nom et cadre.
2. **Aller à** : action native du moteur Interaction + catalogue du « Faire » + panneau ; famille
   `interactions.*` (lister, créer, modifier, désactiver, supprimer, tester) ; test en consultation.
3. **Compilateur public** (selon Q1/Q2) : pages, objets exportables (texte, image, forme, svg…), liens,
   manifest d'interactions publiques (allowlist : Aller à page / lien), SEO (title, description, canonical,
   Open Graph, sitemap, robots), accessibilité (vrais liens, alt, focus) ; rapport « valide / non compatible ».
4. **Serveur de publication** : tables `site_publications`, `site_versions`, `site_operations`,
   `site_slugs`, (`site_domains`) ; intention de publication = Atome du coffre (motif `public_events`) ;
   construction d'une version immuable sur disque, bascule atomique du pointeur, idempotence, reprise ;
   route Fastify `/<slug>[/<page>]` avant le 404, 410 après retrait, cache (HTML revalidé, ressources hachées
   immuables) ; planificateur.
5. **Panneau Publier** (M1, M3–M5) sur les briques Bevy existantes ; famille `site.*` (état, vérifier,
   aperçu, publier, mettre à jour, programmer, annuler, historique, rétablir, retirer — confirmées).
6. **Crédits d'hébergement** : débit par `billing_ledger`, affichage, alertes.
7. **Domaine personnel** (si Q13) : preuve TXT, routage par hôte, certificat, retrait.
8. **Domaines & Emails** (selon Q14) : fournisseur simulé derrière un contrat, devis + 3 %, commande
   idempotente, transfert, DNS, boîtes ; comparatif fournisseurs.
9. **Recette** : parcours A (manuel, à l'écran par Playwright) et B (IA/MCP) sur deux projets de test,
   ordinateur + téléphone, sécurité (XSS, SSRF, isolation entre comptes, anonymat), puis production sur feu vert.

## 5. Décisions (consignées au fil des réponses)

- **Q1 (28 oct.) — A, avec images Bevy.** Le site public est une page web générée côté serveur à partir des
  atomes (texte, images, formes, SVG, vidéo en HTML/CSS). Ce que le HTML ne sait pas dessiner (verre flouté,
  shaders, effets propres à Bevy) devient, à la publication, une image rendue par Bevy lui-même (réutilise la
  capture d'aperçu `eve_preview_capture.html`). Le visiteur ne charge jamais le moteur. L'utilisateur lève la
  règle 7 pour cette sortie : elle n'est ni une vérité ni un éditeur, comme l'export PDF d'une page.
  Fidélité à surveiller en recette (coupure des lignes de texte Bevy vs navigateur). Le moteur eVe en
  visiteur (B) reste possible plus tard comme sortie à part pour une œuvre à « jouer ».
- **Q2 (28 oct.) — Responsive.** Écran large : la page à sa mise en page. Sous une largeur seuil : les objets
  se réempilent dans l'ordre de lecture (haut → bas, gauche → droite), chacun à une taille lisible ; l'aperçu
  téléphone du panneau Publier le montre avant la mise en ligne.
- **Q3 (28 oct.) — Les deux entrées.** Un outil « Publier » dans le menu du projet (à côté de Communiquer) et
  l'option « Publier » dans l'appui long d'un projet (Dashboard › Projets) ; les deux ouvrent le même panneau.
- **Q4 (28 oct.) — Panneau à part.** Le site d'un projet a son propre panneau (adresse, pages, versions, mises
  à jour), distinct du Publier unifié (messages, réseaux, forums). Annoncer le lien d'un site passera par le
  Publier unifié quand il existera. Idée ajoutée par l'utilisateur : un endroit qui liste **tous** ses sites
  publiés → Q4 bis. Confirmé par l'utilisateur au message suivant.
- **Q4 bis (28 oct.) — Dans Projets.** La liste de tous ses sites (nom, adresse, état) est dans la rubrique
  Projets du Dashboard ; une rangée touchée ouvre le panneau Publier de ce site. Nouvel élément → maquette.
- **Q5 (28 oct.) — Pages.** Chaque Page à la racine du projet = une page du site (une Page dans une Page reste
  un bloc) ; son nom = titre et slug (`atome.one/<site>/<page>`) ; accueil = page de couverture (`page_cover`),
  sinon la première ; ordre du projet ; projet sans Page = une seule page (tout le canevas) ; une page peut être
  décochée dans le panneau Publier.
- **Q6 (28 oct.) — « Aller à » + menu fait d'objets.** Nouvelle action native du « Faire » d'Interaction : vers
  une page du projet (id stable, survit au renommage) ou un lien externe http(s) (même onglet / nouvel onglet),
  sur tout objet. Édition : ne se déclenche pas (on configure) ; consultation et exécution : amène sur la page
  dans eVe (test) ; site publié : vraie URL (Retour, rechargement, lien partagé). Menu : objets ordinaires du
  projet (un par page, chacun avec « Aller à »), composés à la main ou créés par un outil « Menu » ou par l'IA
  (MCP), identiques sur toutes les pages par les templates liés (`template_link`). Outil Menu → maquette.
- **Q7 (28 oct.) — Adresse.** Slug proposé depuis le nom du projet (minuscules, sans accents, tirets),
  modifiable ; unique sur tout atome.one, premier arrivé, variante proposée si pris ; mots système réservés ;
  un changement d'adresse laisse l'ancienne rediriger (301) pour toujours, jamais réattribuée à un autre.
- **Q8 (28 oct.) — Dates.** Aucune date sur le site public ; toutes dans le panneau (première publication,
  dernière mise à jour, prochaine programmée, date de chaque version).
- **Q9 (28 oct.) — Mention.** « Créé avec atome » discret au pied de chaque page, lien vers https://atome.one,
  présent par défaut ; l'utilisateur peut le retirer (réglage du panneau Publier, aussi par MCP).
- **Q10 (28 oct.) — Programmer.** Rouleau « Quand » (comme les événements), fuseau affiché (Europe/Paris par
  défaut, heure d'été/hiver gérée) ; version figée au moment de programmer ; la publication programmée paraît
  dans l'Agenda (même mécanique que la publication programmée de l'autre session) et s'annule depuis l'Agenda
  ou le panneau ; c'est le serveur qui publie à l'heure dite ; en cas d'échec l'ancienne version reste en ligne
  et l'échec est historisé.
- **Q11 (28 oct.) — Retirer.** Après confirmation : page sobre « Ce site n'existe plus » en 410 + `noindex` ;
  projet intact ; adresse gardée au propriétaire (republication possible à la même adresse) ; versions et
  historique conservés, n'importe laquelle republiable.
- **Q12 (28 oct.) — Médias par pointeur, sans redondance.** Seuls les médias posés sur une page publiée
  deviennent lisibles en public. **Aucune copie** : la version du site pointe le fichier d'origine par son
  empreinte (SHA-256) ; un même contenu n'est stocké qu'une fois sur le serveur, quel que soit le nombre de
  versions qui l'utilisent ; vidéo et son jamais copiés, servis depuis l'original (requêtes de plage).
  Suppression dans la médiathèque : le fichier disparaît pour l'utilisateur, mais ses octets restent tant
  qu'une version publiée y pointe (compte de références), puis sont libérés. Retouche non destructive
  (`filter_*`, `image_*`, original jamais touché — vérifié `dashboard_retouch.js`) : les réglages que CSS sait
  rendre (luminosité, contraste, saturation, recadrage, rotation, miroir) sont appliqués à l'affichage sans
  nouveau fichier ; les autres (ombres, clairs, température, netteté, vignette, gomme, filtres de look) donnent
  une seule image rendue par Bevy (Q1), elle aussi stockée une fois par empreinte. Seule autre donnée nouvelle :
  une variante web d'une photo très lourde (plus grande que 2560 px), jamais pour la vidéo. Image venue du web :
  source mentionnée.
- **Q13 (28 oct.) — Domaine personnel dans ce lot.** Preuve TXT + renvoi (CNAME ; apex selon l'infra),
  vérification, certificat Let's Encrypt automatique, routage par hôte vers le site_id, adresse principale au
  choix (l'autre redirige), retrait sûr ; atome.one/<adresse> fonctionne toujours sans lui. Demande un changement
  nginx/certbot sur le serveur de production → feu vert et accès au serveur demandés à la recette (Q18).
- **Q14 (28 oct.) — Domaines & Emails simulés.** Tout le parcours codé (recherche, devis avec ligne atome ≥ 3 %,
  achat, renouvellement, transfert entrant/sortant, DNS, boîtes/alias/renvois, crédits) derrière un contrat
  fournisseur, avec un fournisseur **simulé** (comme la Boutique) : aucun argent ne bouge, aucun domaine acheté,
  et c'est indiqué. Plus un comparatif de fournisseurs réels (registrar, mail). Branchement réel après le choix et
  le contrat de l'utilisateur, sans refaire les écrans. Maquettes M3 ter–octies gardées (15 au total).
- **Q15 (28 oct.) — REVUE à la demande de l'utilisateur** (la 1re réponse « 89 crédits/mois par site » est
  annulée) : l'hébergement doit être compris dans l'abonnement atome, sans supplément, trafic mutualisé, prix
  global rentable. Étude (même jour) : un site ne coûte presque rien en plus — médias par pointeur (Q12) déjà
  comptés dans le stockage de l'offre (50 Gio / 200 Gio / 1 Tio), HTML de quelques Ko ; le trafic du serveur OVH
  est en principe non facturé au Go (à vérifier sur la facture, pas d'accès ici) : le seul vrai risque est la
  saturation du serveur partagé par un site très visité ou une vidéo reprise ailleurs. Proposition en attente :
  hébergement inclus dans toutes les offres, aucun crédit débité ; usage raisonnable par compte selon l'offre
  (89 / 233 / 610 Go de trafic par mois) ; au-delà, le site reste en ligne mais ralenti, alerte au propriétaire,
  jamais de coupure ni de facture ; cache long des médias ; si le succès vient, un CDN (~0,01 €/Go) reste
  largement couvert par 12 €/mois. Pas de compte (invité) = pas de publication.
  **Retenue** : l'utilisateur a répondu « Vas-y, continue » à cette proposition (28 oct.).
- **Q16 (28 oct.) — 3 % inclus dans le prix.** La commission atome (≥ 3 % du prix fournisseur HT, arrondi au
  centime supérieur) est **comprise dans un prix global**, sans ligne à part. Le client voit le prix du domaine
  (taxes indiquées), le total avant de payer, jamais modifié après confirmation (devis refait et remontré si le
  fournisseur change son prix). Côté atome, le grand livre garde séparément coût fournisseur, commission, taxes.
- **Q17 (28 oct.) — Formulaire de contact dans ce lot.** Le visiteur envoie nom, e-mail, message ; le
  propriétaire le reçoit comme un message dans Communication avec notification ; son adresse n'est jamais
  exposée ; endpoint public limité (validation serveur, anti-spam, limite d'envois par IP et par site,
  consentement affiché). Le formulaire se pose sur une page comme un objet → maquette M9 (16 au total).
- **Q18 (28 oct.) — Production.** Tout construit et vérifié en local d'abord (parcours manuel + IA/MCP, ordinateur
  + téléphone, sécurité) ; puis feu vert demandé avec ce qui part exactement (pas de commit/push par moi : commit
  de l'utilisateur ou correctif ciblé sur le serveur ; accès SSH à autoriser ; nginx/certbot pour le domaine
  personnel) ; deux sites de test publiés à des adresses « test », vérifiés (anonyme, clics, images, mise à jour,
  retour arrière, formulaire) ; maintien ou retrait décidé ensemble. Domaine personnel testé sur un domaine de
  l'utilisateur si fourni, sinon sur un sous-domaine d'atome.one (limite signalée).
  **Domaine de test fourni (28 oct.) : `jeezs.net`.** DNS public relevé : DNS chez o2switch
  (`ns1/ns2.o2switch.net`), A `109.234.167.152` (site existant, `www` aussi), **MX `mail.jeezs.net` + SPF actifs
  (messagerie réelle de l'utilisateur)**. Recette sur un **sous-domaine dédié** (`site-test.jeezs.net` : un TXT de
  preuve + un CNAME vers atome.one), jamais l'apex ni `www`, jamais les MX/SPF. Les enregistrements sont ajoutés
  par l'utilisateur chez o2switch (aucun accès registrar ici), avec les valeurs que le panneau affichera.
  Messagerie (utilisateur, 28 oct.) : la préserver absolument ; des boîtes de test **autres** sont permises
  (`toto@jeezs.net`, etc.) ; **jamais `jeezs@jeezs.net`**, prise et utilisée. Le module mail étant simulé (Q14),
  une vraie boîte de test n'est créable que si un fournisseur réel est branché (o2switch = cPanel : son API UAPI
  serait une piste de fournisseur réel pour un domaine déjà hébergé chez lui, à étudier dans le comparatif).

**Toutes les questions sont tranchées (28 oct.).** Suite : les 16 maquettes, une par une.

### Maquettes validées

- **M1 — Publier dans le projet (28 oct.).** Jamais un outil de plus dans la bande du bas (refus de M1a v1).
  Publier est une case du rail de Communiquer, juste après « Projet » : icône `send` (avion), libellé
  `Publier` (variante A choisie par l'utilisateur, affiché « Publi… » dans la case). Elle ouvre le panneau
  Publier (M3). Dans Projets, l'appui long sur un projet propose aussi « Publier », juste avant « Supprimer »
  (M1b). Maquettes : `temp/publication_web/mockups/M1a_2_publier_send.png`, `M1_b_appui_long.png`.
- **M2 — Interaction › Faire › « Aller » (28 oct.).** Structure validée sur la v1 ; look v1 refusé (« trop
  austère »). Validée en v2 : le panneau Interaction devient trois cartes vitrées (Quand · Sur quoi · Faire,
  `calendarCard`) dont les choix sont des tuiles pastel à glyphe en disque (`discTileGridNode`, ✓ sur le choix) ;
  « Aller » vers une page (une tuile par page du projet) ou vers un lien (champ d'adresse + tuiles Même onglet /
  Nouvel onglet). Ce look vaut pour tout le panneau Interaction et pour les panneaux du site.
  Maquettes : `M2v2_1_haut.png`, `M2v2_3_lien.png` (script `mockups/m2.mockup.mjs`).
- **M3 — Publier, première fois (28 oct.).** Validée telle quelle : cartes Adresse (`atome.one/` + adresse
  modifiable + « ✓ Libre », bouton Mon domaine → M3 bis), Pages (tuiles pastel cochées = publiées), Présentation
  (titre, description, case « Créé avec atome » cochée par défaut), Quand (Maint. / Plus tard → rouleaux date et
  heure) ; bande ✕ · Aperçu · Vérif. · Publier. Maquettes : `M3_a_maintenant.png`, `M3_b_plus_tard.png`
  (script `mockups/m3.mockup.mjs`).
- **Espacement des cartes, partout (28 oct., utilisateur).** « Trop serré » : les panneaux à cartes respirent
  davantage, dans **tous** les panneaux (pas seulement ceux du site). Essai v3 à 15 px jugé encore un peu juste ;
  v4 à 20 px (⅓ d'outil) entre les cartes (`bodyGapPx`), entre les rangées d'une carte (`CARD_GAP`) et en marge
  intérieure (`CARD_PAD`) ; l'écart des tuiles reste 5 px (règle 14). **v4 validée (20 px).** À la
  réalisation : amender la règle 14 d'AGENTS.md et les jetons (`bevy_panel_calendar_cards.js`, écart du corps des
  panneaux à cartes), puis vérifier les panneaux existants qui utilisent ces cartes (Agenda, Publier…).
- **M3 bis — Mon domaine (28 oct.).** v1 « triste », v2 plus vivante, v4 validée : carte Mon domaine (grand
  disque globe + nom du domaine en gras + état coloré : orange en attente, vert en ligne · certificat valide ;
  trois tuiles d'étapes Domaine · DNS · Certificat, ✓ au fil de l'eau) ; carte « Chez ton hébergeur DNS » (TXT et
  CNAME, chacun avec son disque, nom, Copier, valeur) tant que le domaine attend ; une fois en ligne, carte
  Adresse principale (tuiles atome.one / jeezs.net). Bande : Retour · Vérif. · Délier. Espacement 20 px.
  Maquettes : `M3bis4_a_en_attente.png`, `M3bis4_b_actif.png` (script `mockups/m3bis.mockup.mjs`, `AIR=1 AIR_PX=20`).
- **M4 — Site en ligne (28 oct.).** Validée : cartes Mon site (disque globe, adresse en gras, « ✓ En ligne ·
  N pages », Copier l'adresse), Dates (Mis en ligne, Dernière mise à jour, Prochaine en orange), Depuis la mise en
  ligne (pages modifiées en tuiles, ou « version figée, en attente de son heure »), Quand (Maint. / Plus tard) ;
  bande ✕ · Voir · MàJ · Hist. · Arrêt (Arrêt = retirer, Q11). Maquettes : `M4_a_modifie.png`, `M4_b_programme.png`.
- **M5 — Historique (28 oct.).** Validée : carte Prochaine opération (disque horloge, date en orange, Annuler) ;
  carte Versions (une rangée par version : numéro en disque pastel, date · auteur — « toi » ou « eVe » par MCP —,
  état Prévue orange / En ligne vert ; la rangée touchée sélectionnée) ; bande Retour · Voir · Rétab. (rétablir =
  nouvelle version, l'historique n'est jamais réécrit). Maquette : `M5_historique.png`.
- **M6 — Site public (28 oct.).** Validée : vraie projection d'un projet de test (« Atelier Lune ») depuis ses
  atomes en HTML/CSS (prototype `temp/publication_web/site_projection_prototype.mjs`) ; ordinateur = la page à sa
  mise en page, centrée ; téléphone = objets réempilés dans l'ordre de lecture (rangées de même hauteur gardées
  côte à côte, objets superposés gardés en un bloc, textes ramenés à une taille lisible) ; menu = textes-liens du
  projet ; « Créé avec atome » au pied ; aucune date. Maquettes : `M6_a_ordinateur.png`, `M6_b_telephone.png`.
- **M7 — Mes sites (28 oct.).** Validée : dans Projets, un petit outil « Sites » (globe) avant Favori et Créer ;
  il ouvre « Mes sites », la liste standard du Dashboard (`createDashboardStageList`) : une rangée par site (nom,
  adresse atome.one ou domaine, état En ligne / Prévu / Retiré) ; une rangée touchée ouvre le panneau Publier de
  ce site ; le champ filtre par nom. Maquettes : `M7_a_projets.png`, `M7_b_mes_sites.png`.
- **M8 — Outil Menu (28 oct.).** Validée : « Menu » dans la palette de Créer (jamais dans la bande) ; touché, il
  pose sur la page des objets texte ordinaires (un par page, chacun avec « Aller »), identiques sur toutes les
  pages par les templates liés, et ouvre son panneau : cartes Pages (tuiles cochées = dans le menu) et Place (En
  haut / À gauche / En bas) ; bande ✕ · Créer. Couleur de case : famille création. Maquettes : `M8_a_creer.png`,
  `M8_b_panneau_menu.png`.
- **M9 — Formulaire de contact (28 oct.).** Validée : l'objet formulaire posé sur une page (Nom, E-mail, Message,
  ligne de consentement « Vos coordonnées servent seulement à vous répondre. », Envoyer à la couleur du site) ;
  ordinateur : formulaire à droite du titre et du texte ; téléphone : réempilé sous eux. Le message reçu arrive
  dans Communiquer (notification repliée au pied du projet : site · expéditeur · début du message, pastille du
  compte). Maquettes : `M9_a_ordinateur.png`, `M9_b_telephone.png`, `M9_c_message_recu.png`.
- **M3 ter — Domaine › recherche (28 oct.).** Validée : ouverte par « Mon domaine » ; carte Trouver un domaine (nom
  proposé depuis le projet, Chercher, ligne orange « Simulé : aucun achat, aucun paiement ») ; carte Résultats (une
  rangée par extension : disque pastel, « ✓ Libre » vert ou « Pris », prix à l'année 3 % compris, rangée touchée
  sélectionnée) ; carte J'ai déjà un domaine (Connecter ou transférer → M3 quinquies) ; bande Retour · Devis.
  Maquette : `M3dom_ter.png` (script `mockups/m3dom.mockup.mjs`, `VARIANT=ter|quater|quinquies|sexies|septies|octies`).
- **M3 quater — Devis (28 oct.).** Validée : carte Ton domaine (« ✓ Libre · réservé pour toi 15 min ») ; carte Prix
  (Domaine 1 an, TVA 20 %, Total en vert « Garanti, ne change plus » ; 3 % compris, jamais affichés) ; carte
  Renouvellement (case « Chaque année » cochée, prochain renouvellement) ; carte Paiement (simulé) ; bande
  Retour · Payer. Maquette : `M3dom_quater.png`.
- **M3 quinquies — Domaine détenu (28 oct.).** Validée : carte Mon domaine (champ + registraire détecté en vert) ;
  carte Que faire ? (tuiles Connecter → M3 bis / Transférer) ; carte Transfert vers atome (étapes en disques numérotés :
  déverrouiller, code de transfert + champ, 1 an ajouté inclus, 5 à 7 jours sans coupure ; ligne simulé) ; bande
  Retour · Transf. jeezs.net n'est jamais transféré en recette (connexion de `site-test.jeezs.net` seulement).
  Maquette : `M3dom_quinquies.png`.
- **M3 sexies — Domaine actif : renouvellement + DNS (28 oct.).** Validée : carte Mon domaine (« ✓ Actif · expire
  le … ») ; carte Renouvellement (case « Chaque année », Prochain : date + rappel J-21 en orange, prix) ; carte
  Enregistrements DNS (une rangée par enregistrement ; ceux posés par atome — A, CNAME www, MX — marqués « Auto »,
  protégés ; les autres avec Modifier) ; bande Retour · Ajout · Sortie (transfert sortant, code donné).
  Maquette : `M3dom_sexies.png`.
- **M3 septies — Mails (28 oct.).** Validée : carte Boîtes (une rangée par boîte : adresse, place utilisée, prix
  mensuel) ; carte Alias et renvois (alias = autre adresse vers une boîte, renvoi = vers une adresse extérieure) ;
  carte Nouvelle boîte (nom + @domaine pré-rempli, prix, simulé) ; bande Retour · Ajout. Recette jeezs.net : boîtes
  de test seulement (toto@…), jamais jeezs@, messagerie réelle intouchée. Maquette : `M3dom_septies.png`.
- **M3 octies — Hébergement (28 oct.).** Validée : carte Hébergement (« Inclus », « ✓ Compris dans ton abonnement » ;
  Sites en ligne, Trafic du mois sur la limite de l'offre « jamais coupé », Stockage sur l'offre) ; carte Domaines et
  mails (domaine + date de renouvellement, boîtes au mois, simulé) ; bande ✕ seul (consultation).
  Maquette : `M3dom_octies.png`.

**Toutes les maquettes sont validées (28 oct.).** Réalisation autonome des lots du §4, puis feu vert production (Q18).

## 6. Conception de la réalisation (28 oct., après les relevés du code)

- **Contrats partagés** : `atome/src/shared/site_contract.js` (slug, mots réservés, pages du site dans l'ordre du projet,
  accueil, adresse de chaque page, paramètres d'« Aller »). Familles MCP `site` (`atome/src/squirrel/site/contracts.js`)
  et `interactions` (`atome/src/squirrel/interactions/contracts.js`) déclarées dans `mcp_contract_families.js` : elles
  deviennent des outils V2 (donc aussi des actions du « Faire » d'Interaction et des commandes voix) ; exécuteur client
  `eVe/domains/site/site_runtime.js`. « Aller » = commande `site.goto` (`page_id` ou `url` + `new_tab`).
- **Vérité** : un atome `site` dans le coffre de l'auteur, id `site_<project_id>` (le projet se lit sur l'id,
  `siteProjectId` : `project_id` est une clé réservée de l'Atome, jamais une propriété) : adresse, titre, description,
  pages publiées, mention, menu (`site_menu`). Le client agit par les frames `/ws/api` `type: 'site'`
  (`server/ws_site.js`) ; le serveur réécrit l'état (`site_status` : état, version en ligne, prochaine opération,
  domaine) sur l'atome par `vaultRouter.commit`.
- **Serveur** : tables `site_publications`, `site_versions`, `site_operations`, `site_slugs`, `site_media`,
  `site_domains`, `site_contact_log` (`database/adole_site_schema.js`, SQL dans `server/site_store.js`). Compilateur
  atomes → HTML/CSS (`server/site_projection*.js`) ; version figée sur disque (`data/sites/<site>/<version>/`,
  `ATOME_SITES_ROOT`) ; médias servis depuis le fichier d'origine par empreinte SHA-256 (`/_site/m/<sha>`), jamais
  copiés. Service public (`server/site_http.js`) par `setNotFoundHandler` (ne masque aucun fichier statique) et par
  l'hôte pour un domaine personnel (`onRequest`) ; aperçu `/_site/preview/<jeton>/…`. Formulaire : `POST /_site/contact`,
  limité par IP et par site, remis dans Communiquer (`kind: 'site-contact'`). Horloge : `setTimeout` sur la prochaine
  opération due (`server/site_publishing.js#arm`) ; `reschedule` déplace l'opération en attente. Domaines & mails :
  fournisseur simulé dans `server/site_domains.js` (registre simulé, grand livre avec la part d'atome incluse).
- **Agenda (Q10)** : une publication programmée est un événement de l'Agenda (`scheduledSend.kind: 'site'`,
  `eVe/domains/publish/publish_calendar.js#settleSiteEvent`) ; le déplacer appelle `site.reschedule` côté serveur, le
  supprimer annule l'opération ; le toucher ouvre le panneau du site.
- **Interface** : panneau du site `eVe/domains/site/site_panel.js` (+ `site_panel_views.js`, `site_panel_domain*.js`),
  Créer › Menu `site_menu_panel.js` (outil `ui.site.menu.panel`), « Mes sites » `site_list.js` (outil Sites de Projets),
  appui long d'un projet « Publier sur le web » ; « Aller » dans le « Faire » d'Interaction
  (`bevy_panel_interaction_cards.js`).
- **Recette locale (28 oct.)** : `temp/publication_web/server_site.probe.mjs` 58/58 ; `site_ui.acceptance.mjs` 13/13 au
  toucher sur le vrai serveur isolé (pages, Menu, « Aller », Interaction, Publier, site servi avec ses liens, Agenda
  programmé / déplacé / supprimé).
