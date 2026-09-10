# Empilement, emplacements media et templates de News (10 sept. 2026)

Quatre changements lies, livres dans l'ordre impose par leurs dependances : A -> B -> C -> D.

## A. L'audience d'une News a un seul proprietaire

Le flux `+` ecrivait `project_intent = {family, goal, audience}` sur le projet — et
**personne ne le lisait jamais**. L'audience reelle vivait ailleurs (`news_presentation`,
destinataires de Communiquer). Deux descriptions paralleles de « a qui s'adresse cette News ».

- `news_model.js` : `NEWS_AUDIENCE`, la cle `audience` declaree dans
  `normalizeNewsPresentation` (elle **jette silencieusement** toute cle non declaree), et
  `news_audience` ecrit par `newsProjectMarkerProps`.
- `newsAudienceFromProjectIntent` — le **seul** endroit qui connaisse le vocabulaire du `+`.
- `createNewsThread` comble l'audience depuis l'intention **quand la presentation n'en porte
  pas**. Une presentation explicite l'emporte toujours : l'intention ne devient jamais
  autoritaire, pour ne pas verrouiller la correction a venir cote `+`.
- Le rail lit `news_audience` au lieu de diffuser `all: true` en dur.

`project_intent` devient de la provenance. **Le `+` n'a pas ete touche.**

## B. Toute creation s'empile, plus rien ne se superpose

Les presets posaient tous `left: 60, top: 60`, les brouillons `24/24`, l'outil texte `80/80`,
et les enregistrements audio **aucune** geometrie (`left: null`).

Nouveau frere de `resolveProjectSceneNextStackPosition` dans
`project_scene_stack_runtime.js` : `resolveProjectSceneNextPlacement`, qui lit les
**enregistrements de scene** (jamais le DOM — sinon faux en liste/matrice et inexercable
sans navigateur).

- Fratrie = meme parent (`meta.parent_id` inclus), hors ephemeres, hors dashboard, **hors
  mobilier d'interface** — sans ce dernier filtre, un raccourci d'outil gare a y=2000
  repousserait toute creation future hors ecran.
- Y = `max(top + height)` + gouttiere ; X constant a 60 (un `min` sur la fratrie ferait
  deriver toute la colonne quand on deplace un atome a la main).
- Geometrie lue avec `parsePx`/`parsePxOrNull` : elle est persistee en **chaines** (`"333px"`),
  `Number()` donnerait `NaN`. Un frere sans geometrie est **ignore**, jamais lu comme 0.
- Aucun retour a la ligne, aucun plafond : « encore une video encore en dessous » est la
  demande, et la surface defile.

Branche sur : l'entonnoir de creation (`applyStackedPlacementToSpec`, qui teste le spec
d'**entree** puisque les presets ont deja injecte 60/60), le service de persistance media,
le texte structure, le dessin (spec **et** brouillon miroir, qui doivent bouger ensemble),
l'outil texte sans pointeur, et la cascade de depot (verticale au lieu de 4 colonnes).

**Deux resolveurs concurrents supprimes** : `resolveNextProjectMediaPosition` (dependant du
DOM, balayage par rangees) et `buildCapturePlacementResolver` (posait chaque capture au
point d'arrivee de l'animation, donc les unes SUR les autres).

**Correction de fond** : le service ecrivait `left: null` quand il n'avait pas de placement.
`sanitizeAtomeProperties` **conserve `null`** — cela teleportait en 0,0 un emplacement deja
positionne au moment ou l'enregistrement le remplissait. Les cles sont desormais **omises**.

## C. Atomes-emplacements (`media_pending`)

Un atome media qui existe deja mais attend son enregistrement. **Une propriete sur le kind
existant, rendue en `shape`** — pas un type nouveau : `normalizeType` teste
`.includes('video')`, donc `video_placeholder` resoudrait quand meme en type de rendu `video`
et ferait tomber la scene entiere.

Nouveau `media_placeholder.js` : `isMediaPlaceholder` = **en attente ET sans source**. Ce
« et sans source » rend le systeme auto-reparant — un emplacement rempli cesse d'en etre un
meme si personne n'ecrit `media_pending: false`.

Une seule ligne dans `render_atom.js`, a cote de `structuralMolecule`, franchit les **quatre**
gardes qui sinon suppriment un media sans source ou font tomber la scene.

Plus : le moteur de rendu media monte enfin l'emplacement (le `return null` le rendait
invisible sans un mot), l'integrite media l'exempte (sinon elle jette a l'arret de
l'enregistrement, **fichier deja ecrit**), et son rail gagne l'enregistrement et perd la
lecture — un transport mort est pire qu'absent.

`project_view_placeholder_fill.js` : **proprietaire unique** du remplissage, sur le modele de
`project_view_record_trigger.js`. Naturel, Liste et Matrice l'appellent, aucun ne le
redefinit. L'id de l'emplacement voyage dans `projectAtomeId`, ce qui fait ecrire le media
sur la **meme ligne** au lieu d'en creer une seconde.

## D. Templates de News, et la News n'est plus forcement en liste

- `news_template_model.js` (pur) : six formes, `normalizeNewsTemplate`. `simple` reproduit
  exactement la News d'avant.
- `news_template_layout_runtime.js` : un emplacement par type choisi, **sans position** —
  c'est l'empilement de B qui place. D'ou l'ordre A -> B -> C -> D.
- `news_template_panel.js` : panneau calque sur le guide du `+` (**intouche**). Largeur 378
  choisie par arithmetique : `378 - 2x10 = 358 = inputWidthPx`, exactement la largeur codee
  en dur du controle segmente — le probleme « pas de controle segmente parametrable » dispar-
  ait sans toucher au composant. Tuiles de formes, controle segmente liste/naturel/matrice,
  pastilles multi-select, bouton Creer **epingle** (il ne defile jamais). Le panneau ne se
  reinitialise pas : le deuxieme usage ne coute qu'un appui sur Creer.
- Le mode voyage dans `presentation.view_mode` (deja relu par `restoreProjectViewMode`) ; les
  types dans `properties.news_template`, parce que `normalizeNewsPresentation` jette les cles
  inconnues **sans erreur**.
- L'appui long sur l'en-tete News ouvre le choix de forme. `openNewsTemplatePanel({create})`
  est la couture exportee pour que le `+` s'y branche plus tard.
- **Publier ne bouge pas** : `news_communicate` du rail.

## Hypotheses prises

1. **`text` n'est pas une case a cocher** — titre et corps sont toujours poses ; une case
   qu'on ne peut pas decocher serait un mensonge. Trois pastilles + une legende.
2. **L'appui long ouvre le panneau** au lieu de creer directement ; la premiere tuile
   reproduit l'ancien comportement en un appui.
3. **Un emplacement image ouvre l'import**, pas l'appareil photo.
4. **Un emplacement image/audio/video annule reste en place** — c'est une case de template.

## Verification

15 probes sous `temp/`, rouge d'abord, plus un parcours navigateur reel
(`temp/news_template_ui.probe.mjs`) : appui long -> panneau -> « Post video » -> Creer ->
projet en **mode naturel**, titre + corps + emplacement **empiles** (chacun sous le bas du
precedent), emplacement rendu en `shape` et **present dans la scene**, aucune erreur
`bevy_projection_`.

## Piege trouve par le parcours navigateur

Les presets d'atome portent une source de **demonstration**
(`assets/videos/superman.mp4`, `assets/audios/riff.m4a`). Un emplacement naissait donc avec
la video d'exemple : `isMediaPlaceholder` etait faux — a juste titre, puisqu'il avait une
source — et l'utilisateur aurait vu Superman a la place de sa case vide.

C'est precisement le « ET sans source » du predicat qui l'a revele. Neutralise dans
`mediaPlaceholderCreateSpec` (`media_placeholder.js`), un seul proprietaire, et verrouille
par la probe.

## Verdict du parcours navigateur

```
panel:opened          appui long sur l'entete News -> le panneau de forme s'ouvre
panel:create          « Post video » -> mode naturel, contenu ['video']
news:created          projet tague news, view_mode NATUREL (plus force en liste)
news:structure        titre + corps + un emplacement video
news:stacked          tops = [24, 72, 144] — chacun sous le bas du precedent
placeholder:in_scene  type de rendu `shape`, identite metier `video`, present dans la scene
```

Aucune erreur `bevy_projection_`, aucune erreur de page.

## Non verifie

- Tauri et iOS.
- Le remplissage effectif d'un emplacement par un enregistrement reel (le double-clic est
  cable et exerce par probe ; la capture media elle-meme n'a pas ete jouee en navigateur).
