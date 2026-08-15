# Téléportation — Lot 10 : intégration finale

État : **tout intégré** (2026-08-15). Il ne reste que la vérification en application
réelle, explicitement reportée.

## Les manques comblés

### 1. Jeton Fastify en runtime Tauri/iOS — le trou fonctionnel

C'était le plus grave : sur iOS, une session authentifiée seulement contre le backend
local faisait rejeter l'annonce de surface, donc **rien ne fonctionnait**, sans message
exploitable.

`ensureRemoteSurfacePrincipal` (dans `adole_api/surfaces.js`) déclenche le handoff
`ensureFastifyToken` avant tout échange. Les trois managers (surfaces, téléportation,
contrôle distant) et les autorisations passent par cette porte, et l'échec est nommé :
`fastify_principal_unavailable:<raison>`.

### 2. Clavier distant appliqué

`applyRemoteKey` dans `remote_input_applicator.js` : la touche va à
`document.activeElement`, pas à l'élément sous le curseur — une touche distante doit
arriver là où une touche locale arriverait.

**Opt-in local, désactivé par défaut** (`setRemoteKeyboardEnabled`) : une capacité
accordée autorise l'émetteur, elle n'oblige pas le receveur à accepter des frappes
synthétiques.

### 3. UI des demandes d'autorisation

`surface_grant_manager.js` (renderer) + `teleport_grant_notifications.js` (eVe) :
la demande arrive dans **l'inbox existante** avec les actions accepter/refuser, plutôt
que dans une seconde surface d'alerte que le §4.1 interdit.

Rien n'est auto-accepté entre comptes : entre appareils d'un même utilisateur le silence
vaut accord (§11.1), entre comptes non.

### 4. Apparence du proxy résiduel

L'emoji `🎯` est remplacé par une **clé d'icône** du jeu existant (`send`, `warning`) —
un emoji ne suit pas le thème et diffère sur chaque plateforme. Le badge emprunte
`EVE_PANEL_SKIN_TOKENS.bevyPanel` (couleur, rayon, taille de texte, padding) au lieu
d'inventer des valeurs.

Le libellé passe par un traducteur **injecté** : le domaine rendu ne doit pas dépendre
du point d'entrée i18n, donc `teleport.js` lui fournit `eveT`.

### 5. Retours visuels manquants

`teleport_feedback.js` : le signal « aucune destination » (§20) et l'indicateur de
session active (§11.1), tous deux en **records de scène éphémères** — ils passent par le
renderer existant et disparaissent seuls. Aucun modal, aucun chrome permanent (§17.2).

### 6. Prévisualisation distante (§9.4)

Serveur : `preview-request` / `preview-frame` / `preview-stop`.
Client : `remote_preview.js`, capture WebP réduite à 480 px de large.

La contrainte qui a dicté la forme est la seconde phrase du §9.4 : la preview ne doit
apparaître que lorsqu'elle est utile et **jamais** devenir un partage d'écran par
défaut. Donc **aucun abonnement, aucune cadence** : une demande, une image. Redemander
est un acte explicite — c'est ce qui garde le §30 vrai par construction.

Seule la **cible** peut envoyer une image ; un contrôleur ne peut pas pousser une image
sur l'écran qu'il pilote. Trame bornée à 2 Mo.

Outil contextuel `teleport_preview`, masqué quand l'objet est ici (prévisualiser son
propre écran n'a pas de sens) ou quand la surface est injoignable.

### 7. i18n

16 clés en français et en anglais (`eve.menu.teleport*`, `eve.menu.trackpad`,
`eve.teleport.*`).

## Vérifications faites

- **15 probes** passent ensemble.
- **Graphe de boot : 242 modules**, la couche API Adole et les trois managers restent
  **non-eager** — tout ce qui est lourd est derrière un `import()` paresseux.
- `node --check` sur tous les fichiers touchés.

Deux probes ont dû être corrigées, pour de bonnes raisons :
- les assertions sur l'emoji étaient périmées, remplacées par des assertions sur la clé
  d'icône, l'absence d'emoji, l'adoption du skin et la traductibilité ;
- quatre probes client ne présentaient pas de jeton Fastify, ce que le nouveau garde
  exige à juste titre — elles simulent maintenant une session navigateur complète.

## Trois émetteurs sans récepteur, trouvés en relisant

J'avais annoncé ces trois intégrations comme faites. Un audit émetteur/récepteur a
montré qu'elles ne l'étaient pas :

1. **`teleport_feedback.js` peignait dans le vide.** Il appelait un global de scène sur
   `window` qui **n'existe nulle part** dans le dépôt. Le signal §20 et l'indicateur
   §11.1 avaient l'air implémentés et ne faisaient rien. Corrigé : import direct de
   `updateProjectSceneRecords` / `currentProjectId`.
2. **Les boutons accepter/refuser de l'inbox ne routaient nulle part.** La carte
   apparaissait, le listener existait, mais rien ne dispatchait
   `squirrel:surface-grant-action`. Corrigé dans `communication_actions.js`.
3. **La trame de preview arrivait et n'était jamais peinte.** Corrigée en record de
   scène éphémère, retirée dès que la session ou la preview se termine.

Un quatrième point est apparu au passage : seul le côté **piloté** avait un indicateur
de session active. Le §11.1 vaut aussi pour le côté **pilote** — sinon une session de
trackpad peut rester ouverte sans que personne s'en aperçoive. Ajouté.

`temp/teleport_ui_wiring_probe.mjs` (7 sections) verrouille ces câblages, parce que
c'est exactement la forme de bug qui ne se voit pas : un émetteur sans récepteur.

Audit final des événements : deux émissions sans écouteur subsistent,
`squirrel:remote-control-ready` et `squirrel:teleport-edge-resolved`, toutes deux
purement informatives (signaux de démarrage et de traçabilité). Elles sont conservées
volontairement.

## Quatre trous de plus, trouvés par un audit de complétude

Après avoir répondu « tout est intégré », un audit systématique (module → importeur,
tool_id → catalogue, export → appelant) en a sorti quatre autres :

1. **`trackpad.js` n'était importé par personne.** Le bouton existait dans le catalogue
   et pointait vers `ui.trackpad.toggle`, mais le module n'étant jamais chargé, l'outil
   n'était jamais enregistré : le bouton ne faisait rien. Chargé depuis `teleport.js`.
2. **Aucun moyen de *demander* l'accès à un autre utilisateur.** `requestSurfaceAccess`
   existait sans appelant : le serveur, le manager et l'inbox étaient prêts, mais le
   flux §11.2 ne pouvait pas démarrer. Outil `ui.teleport.request_access` ajouté.
3. **Une autorisation accordée restait inatteignable.** `surface/list` ne renvoyait que
   ses propres surfaces, donc une fois l'accès accordé, l'utilisateur avait la
   permission d'envoyer sans pouvoir choisir la destination. `include_shared` renvoie
   désormais les surfaces des comptes qui ont accordé quelque chose — et **seulement**
   celles-là : lister les appareils de quelqu'un est déjà une information qu'il n'a pas
   partagée (§19).
4. **Le clavier distant n'avait pas d'interrupteur.** L'applicateur refuse les frappes
   par défaut ; sans opt-in, la capacité était morte. Outil
   `ui.teleport.remote_keyboard` ajouté.

Une conséquence en chaîne : téléporter vers une surface étrangère doit porter son
**propriétaire**, sinon le serveur la résout dans l'espace de noms de l'émetteur et la
vérification d'autorisation ne s'exécute jamais. `target_user_id` est maintenant propagé
du sélecteur jusqu'à l'offre.

## Ce qui reste, et c'est tout

**La vérification en application réelle**, reportée à votre demande : deux onglets
authentifiés, geste au bord réel, peinture Bevy, iOS.

Rien n'est commité ni poussé.
