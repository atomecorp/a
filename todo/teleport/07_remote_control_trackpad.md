# Téléportation — Lot 7 : contrôle distant + trackpad

État : **fait pour la logique** (2026-08-15). Dépend du lot 1 uniquement — le contrôle
distant est **indépendant** de la téléportation (§10.1, §10.3).

## Ce qui a été livré

- `server/wsRemoteControlOperations.js` (nouveau) — famille `remote-control` sur
  `/ws/api` : `request`, `revoke`/`deny`, `list`, `pointer`, `gesture`, `key`.
  Pushes : `remote-control-started`, `remote-control-input`, `remote-control-ended`.
  Fin de session automatique sur perte de surface, branchée dans `server.js`.
- `atome/src/squirrel/teleport/remote_control_manager.js` (nouveau) — owner renderer.
- `eVe/intuition/tools/trackpad.js` (nouveau) — l'outil de toolbox.
- Entrée `trackpad` dans le catalogue, `adole_websocket_message.js` étendu.

L'enveloppe de message reprend celle du prototype local `/ws/control` Tauri
(`{action, requestId, payload}` → `{type, requestId, success, data}`) : c'est la seule
partie réutilisable de ce prototype, son transport étant en loopback et ne relayant rien.

## Posture de sécurité (§28)

- **Un identifiant de session n'est pas une capacité.** Chaque événement d'entrée est
  revérifié à l'arrivée : le principal **et** la surface de l'émetteur doivent
  correspondre au contrôleur de la session. Rejouer une enveloppe capturée depuis un
  autre socket ne fait rien.
- **La révocation est immédiate**, sans période de grâce. La surface contrôlée peut
  toujours reprendre la main (§11.2) ; un tiers ne peut ni révoquer ni piloter.
- **Seules les capacités accordées passent.** Une session « pointeur » refuse le
  clavier, en nommant la capacité manquante.
- **Aucune session ne survit à sa surface** : perte de socket = fin immédiate, sinon la
  cible accepterait des entrées d'un socket que plus personne ne possède.
- **Expiration** (30 min par défaut) : une session de contrôle est une délégation
  vivante, pas une préférence stockée.
- **Inter-utilisateurs refusé explicitement** (`remote_control_cross_user_not_authorized`)
  jusqu'au lot 8.

Même en accord automatique intra-compte (§11.1), la surface contrôlée **est prévenue** :
le §11.1 demande un indicateur de session active, pas du silence.

## Le trackpad, tel que le §10 l'exige

- **Outil de toolbox** à bascule, pas un mode : le module ne crée aucun élément DOM,
  n'ouvre aucun panneau, n'appelle jamais `requestFullscreen`. Vérifié par la probe.
- **Sans téléportation préalable** : `selection_required` est absent, le trackpad
  fonctionne sans objet sélectionné ni objet téléporté.
- **Coexiste avec le reste** : il écoute les événements pointeur de la surface déjà
  présente ; éteint, l'objet sous le doigt se comporte normalement.
- **Une cible → connexion directe ; plusieurs → le même rail contextuel que la
  téléportation** ; aucune → refus propre.
- **Deltas coalescés à ~60 Hz** et **sommés, pas jetés** : un balayage rapide parcourt
  la même distance quel que soit le débit d'événements.

## Vérification

- `temp/teleport_remote_control_probe.mjs` — 11 sections, majoritairement des refus :
  usurpation de session, mauvaise surface, capacité non accordée, révocation par un
  tiers, contrôle inter-utilisateurs, expiration, perte de surface.
- `temp/teleport_trackpad_probe.mjs` — 8 sections, dont la vérification que le module
  ne crée aucune surface et s'arrête instantanément quand le serveur ferme la session.

Onze probes (lots 1 à 7) passent ensemble. Graphe de boot : 234 modules, couche API
toujours non-eager.

## Application des entrées côté cible

`atome/src/squirrel/teleport/remote_input_applicator.js` (nouveau) ferme la boucle :
un curseur virtuel par session entrante, déplacé par les deltas reçus, et les
événements pointeur rejoués **normalement** sur la surface déjà présente.

Choix structurant : **synthétiser des événements pointeur standards** plutôt que
d'attaquer le renderer. L'intercepteur de surface canonique reste l'unique propriétaire
du pointeur ; un second chemin vers le canvas serait précisément le genre d'owner
parallèle que le dépôt interdit. `elementFromPoint` fait atterrir le pointeur distant
sur ce qui se trouve réellement dessous — un doigt distant est traité comme un doigt.

- curseur borné à la surface, jamais hors écran ;
- événements marqués `isRemoteControlInput` pour ne jamais être renvoyés ;
- geste inconnu **ignoré** plutôt qu'approximé — appliquer le mauvais geste sur l'écran
  de quelqu'un est pire que n'en appliquer aucun ;
- le clavier est relayé mais **pas appliqué** : cela demande la capacité explicite du
  §11.3 et un modèle de focus, aucun des deux n'existe encore ;
- l'applicateur n'est chargé que si la surface est réellement pilotée.

Couvert par `temp/teleport_remote_input_probe.mjs` (11 sections).

## Reste à faire

- **Prévisualisation distante** (§9.4) : non commencée.
- **Indicateur visuel de session active** : l'événement existe, rien ne le peint.
- **Vérification en application réelle** : non faite.
