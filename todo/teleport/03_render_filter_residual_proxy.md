# Téléportation — Lot 3 : filtre de rendu + proxy résiduel

État : **fait pour le tronc commun** (2026-08-15). Dépend des lots 1 et 2.

## Ce qui a été livré

- `eVe/domains/rendering/teleport_residual_projection.js` (nouveau) — owner du proxy
  résiduel : identité de surface locale, libellés de destination, et
  `projectTeleportRecord(record)` qui renvoie soit le record intact, soit le marqueur.
- `eVe/domains/rendering/project_scene_record_projection.js` — la projection est
  appliquée dans `normalizeProjectSceneRecords`, **l'entonnoir unique** par lequel
  passe tout record avant d'atteindre le canvas. Un objet hébergé ailleurs devient
  donc un proxy sur *tous* les chemins qui alimentent la scène, pas seulement celui
  qu'emprunte l'outil de téléportation.
- `teleport_manager.js` — publie `squirrel:teleport-surface-context`
  (`surfaceId` + libellés) à la connexion et à chaque changement de présence.

## Décisions

1. **Le proxy garde le même `id`.** C'est une projection, pas un second atome : la
   sélection et la toolbox contextuelle continuent d'agir sur l'objet réel (§7.1), et
   le §13 est tenu par construction.
2. **La source média est retirée du proxy.** Un proxy qui porterait encore `src`
   afficherait une seconde copie de l'objet à l'écran — exactement ce que la
   téléportation prétend ne pas faire.
3. **Taille fixe 168×44, jamais via la politique max-axis.** `normalizeAtomeSizeToMaxAxis`
   redimensionne au lieu de clamper : elle gonflerait le badge au lieu de le borner.
4. **Tant que la surface ignore son identité, rien n'est masqué.** Montrer brièvement
   l'objet réel est récupérable ; masquer tous les objets derrière des proxys ne l'est pas.
5. **Le chrome éphémère est exclu** (dashboard, lanes molecule, BevyUI) : ces records ne
   sont pas téléportables et ne doivent jamais être projetés.
6. **Le renderer ne remonte pas dans la couche API.** Le manager lui *pousse* l'identité
   de surface et les libellés par événement ; la direction de dépendance reste correcte.

## Vérification

`temp/teleport_residual_projection_probe.mjs` — 10 sections, à travers le vrai entonnoir
de scène. Couvre notamment :

- **pendant `TELEPORT_PREPARING`, les deux surfaces peignent encore l'objet réel** —
  c'est la traduction visuelle de l'invariant du §16 ;
- destination perdue → proxy « injoignable », pas disparition ;
- surface hôte → objet réel, surface source → proxy, avec le même `id` des deux côtés.

Les six probes des lots 1 à 3 passent ensemble.

## Reste à faire sur ce lot

- **Rendu visuel réel.** Le proxy est projeté comme un record `text` ; il n'a pas encore
  la grammaire visuelle d'eVe (tokens `EVE_PANEL_SKIN_TOKENS`, icône plutôt qu'emoji).
  À reprendre avec le lot 4, quand la toolbox du proxy existera — les deux se
  challengent mutuellement.
- **Vérification en application réelle** (deux onglets authentifiés) : non faite. Les
  probes couvrent la logique de projection, pas la peinture Bevy.
