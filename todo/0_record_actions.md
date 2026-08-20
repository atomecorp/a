# Interaction.md

## Objectif

Formaliser l’interface du Dashboard et le nouveau système d’enregistrement des interactions utilisateur dans atome/eVe.

## 1. Dashboard — structure validée

Le Dashboard sert uniquement à donner une vue d’ensemble des grands outils du système.

1. **Calendrier**
   - Agenda, passé, présent et futur.
   - Rendez-vous, rappels, tâches et échéances.
   - L’historique est intégré au calendrier : ce qui a réellement été fait apparaît dans le passé.
   - Filtrage possible par projet, date, contact ou type d’activité.

2. **Projets**
   - Projet et objectif sont conceptuellement une seule entité.
   - Un projet contient ce que l’utilisateur construit ou cherche à accomplir.
   - La progression n’est pas portée par cette rubrique : elle est observée dans le Moniteur.

3. **Contacts**
   - Personnes, groupes et relations.
   - Portraits ou vignettes carrées lorsque l’image est utile.

4. **Store**
   - Ressources, outils, modules, contenus et services.

5. **Moniteur**
   - Vue transversale de tout ce qui évolue ou se mesure.
   - Peut suivre aussi bien la progression d’un album, d’un film ou d’un projet logiciel que le sport, le sommeil, la santé, les habitudes ou toute autre métrique pertinente.
   - Le Moniteur observe les données existantes : il ne crée pas une seconde source de vérité.

6. **Actualités**
   - Rubrique éventuelle, à conserver uniquement si elle apporte une information globale réellement utile.

## 2. Principe général d’affichage

Les modes **Liste**, **Matrice** et **Naturel** sont des représentations différentes des mêmes objets et des mêmes données. Un changement de mode ne doit jamais modifier la logique profonde du projet.

## 3. Ajout de l’outil Record

Dans le menu latéral, lorsque **Play** est disponible, ajouter aussi un outil **Record**, au minimum en modes :

- Liste ;
- Matrice ;
- Naturel.

Le rôle de Record n’est pas seulement d’enregistrer un média. Il doit enregistrer **les actions de l’utilisateur et leur temporalité**.

## 4. Enregistrement en mode Liste / Matrice

Lorsque l’utilisateur active Record :

1. un temps de référence `T0` est créé ;
2. chaque action utilisateur significative est enregistrée ;
3. chaque action reçoit son temps relatif depuis `T0` ;
4. les actions enregistrées deviennent des événements sur une timeline.

### Exemple

Contenu : chanson 1, chanson 2, chanson 3, vidéo, texte.

Performance utilisateur :

- `T+2 s` : déclenche chanson 1 ;
- `T+4 s` : déclenche chanson 2 ;
- `T+6 s` : déclenche chanson 3 ;
- `T+8 s` : déclenche la vidéo ;
- la vidéo reste active 5 secondes ;
- `T+13 s` : affiche un texte ;
- le texte reste visible 2 secondes.

Le système doit créer automatiquement une timeline correspondant à cette chorégraphie.

La temporalité vient du **geste de l’utilisateur**, pas uniquement de la durée intrinsèque des contenus.

## 5. Timeline générée

La timeline produite par Record doit être entièrement éditable après l’enregistrement. L’utilisateur doit pouvoir notamment :

- déplacer un événement dans le temps ;
- modifier son instant de déclenchement ;
- raccourcir ou rallonger sa durée ;
- prolonger la présence d’un texte ;
- modifier les intervalles entre événements ;
- supprimer, ajouter ou réorganiser des événements ;
- rejouer le résultat.

L’enregistrement initial est donc une **capture de performance**, pas un résultat figé.

## 6. Mode Naturel

En mode Naturel, Record doit également enregistrer les interactions spatiales et visuelles, par exemple :

- déplacement d’un objet ;
- repositionnement de plusieurs objets ;
- apparition ou disparition d’un élément ;
- modification progressive d’une mise en page ;
- construction d’un visuel ;
- transformation de l’organisation spatiale d’un projet.

Ces gestes sont enregistrés avec leur timing et transformés eux aussi en événements de timeline rejouables et éditables.

## 7. Modèle conceptuel

```text
Utilisateur
    ↓
Record
    ↓
Capture des actions + timing relatif
    ↓
Séquence d’événements
    ↓
Timeline
    ↓
Édition / ajustement
    ↓
Replay
```

Record capture donc :

- **quoi** a été fait ;
- **quand** cela a été fait ;
- éventuellement **combien de temps** l’état résultant doit rester actif ;
- et, lorsque nécessaire, les paramètres de l’action.

## 8. Nature des événements enregistrables

Le système doit pouvoir évoluer vers plusieurs types d’événements :

- lecture / arrêt d’un média ;
- sélection ou activation d’un élément ;
- affichage / masquage d’un texte ou objet ;
- déplacement ;
- redimensionnement ;
- changement de propriété ;
- modification de mise en page ;
- autres interactions pertinentes.

L’architecture ne doit donc pas être limitée à un simple séquenceur audio/vidéo.

## 9. Règles essentielles

- Ne pas dupliquer les données existantes.
- Utiliser l’historisation déjà présente dans atome/eVe lorsque cela est pertinent.
- Séparer le concept métier de sa représentation visuelle.
- Record capture des interactions utilisateur, pas uniquement des fichiers médias.
- Le timing enregistré est relatif au début de la session Record.
- La timeline générée reste modifiable.
- Le même principe fonctionne en Liste, Matrice et Naturel.
- Une lecture ultérieure doit pouvoir reproduire la performance enregistrée.
- La UI ne doit pas contenir la logique métier fondamentale : les actions doivent passer par les APIs prévues par atome.

## 10. Cas d’usage principal

L’utilisateur veut créer rapidement une séquence sans programmer manuellement une timeline.

1. Il prépare ses objets.
2. Il appuie sur Record.
3. Il interagit naturellement avec eux au rythme souhaité.
4. Il arrête Record.
5. Il obtient une timeline correspondant à sa performance.
6. Il ajuste ensuite cette timeline avec précision.

Le système transforme ainsi une **interaction intuitive en structure temporelle éditable**.

## 11. Critères d’acceptation

Le développement est considéré comme correct si :

- Record apparaît aux endroits définis ;
- le début de l’enregistrement crée un temps zéro fiable ;
- chaque interaction prise en charge est enregistrée avec son temps relatif ;
- l’ordre et les intervalles entre actions sont conservés ;
- une timeline est générée à partir de l’enregistrement ;
- cette timeline peut être rejouée et éditée ;
- un texte peut être rallongé ou raccourci après capture ;
- les actions spatiales du mode Naturel peuvent être enregistrées puis rejouées ;
- le comportement reste cohérent entre Liste, Matrice et Naturel ;
- aucune seconde couche d’historique ou de données métier n’est créée inutilement.

---

# Journal d'exécution — 19 août 2026

Périmètre de ce tour : la **boucle complète en Liste/Matrice** (§3, §4, §5, §10) et
la fusion Objectifs → Projets (§1.2). La capture spatiale du mode Naturel (§6) n'est
pas traitée.

| Point | État | Ce qui a été fait |
|---|---|---|
| §1.2 — projet et objectif, une seule entité | **fait** | La rubrique `goals` disparaît du Dashboard, qui expose désormais les six rubriques du §1. Vérifié avant de toucher quoi que ce soit : aucune référence JavaScript, aucun atome de ce type en base — la fusion est déclarative et sans perte. |
| §3 — Record là où Play se trouve | **fait** | `container_record` dans le rail des modes Liste et Matrice, allumé pendant qu'il enregistre. Le mode Naturel garde son Record de média : ne pas le doubler avant le §6. |
| §4, §7, §8, §9 — capture | **fait** | `project_view_interaction_recorder.js` : T0 sur une horloge monotone, temps relatifs, durée **mesurée sur le geste**. Il ÉCOUTE les signaux existants — la file de lecture, la sélection, `atome:changed` — et n'instrumente aucun appel métier : aucune seconde source de vérité (§9). |
| §5, §10, §11 — timeline générée | **fait** | `project_view_capture_to_timeline.js` : chaque événement devient un clip à son instant, avec sa durée. Les événements qui se chevauchent prennent des pistes distinctes, ceux qui se suivent partagent la leur. **L'édition et le rejeu n'ont rien demandé** : ce sont les opérations de timeline et le transport qui existaient déjà. |
| §6 — mode Naturel | **non traité** | Il reste à décider comment un déplacement ou un redimensionnement devient un événement rejouable : le schéma de molecule ne porte aucune géométrie visuelle, seulement un ordre temporel. |

## Vérification

23 assertions dédiées, dont l'exemple du §4 rejoué à l'identique : trois chansons,
une vidéo tenue 5 s, un texte tenu 2 s — et des clips qui portent exactement ces
temps. Suite complète : 146 assertions vertes, 39 modules liés en ESM.

**Non vérifié à l'écran** : le démarrage s'arrête toujours sur
`remote_account_not_provisioned`, en amont de tout ce qui a été modifié.

## Restes

- §6, la capture spatiale du mode Naturel.
- Un événement de sélection ou de changement de propriété n'a pas de durée
  mesurable : il reçoit la temporisation par défaut de 2 s. Une durée réelle
  demanderait un signal de « fin d'affichage » qui n'existe pas.
- L'outil `tool.dashboard.goals` et son entrée persistée en base subsistent : les
  retirer touche le catalogue d'outils persisté, ce qui demande un backend pour
  être vérifié. La rubrique, elle, a bien disparu.

---

# Journal d'exécution — 20 août 2026

Symptôme signalé : « après un record de mes actions sur une liste, quand je la
mets en lecture elle s'exécute de façon séquentielle sans tenir compte de mes
actions ». Ce n'était pas un malentendu sur le cahier des charges — c'était
**quatre défauts réels**, dont le dernier vidait le §11 de son sens.

| # | Défaut | Correctif |
|---|---|---|
| 1 | **Toucher une ligne ne déclenchait rien.** Un tap valait `project_view.list.select` : une sélection, rien de plus. La photo ne s'affichait pas, le son ne partait pas — le Record n'avait donc aucune lecture à mesurer. | `project_view_record_trigger.js` : pendant Record, **toucher, c'est déclencher**. Un seul propriétaire de la règle, appelé par la Liste *et* la Matrice (§11). |
| 2 | **Aucune exclusivité.** Déclencher la vidéo n'arrêtait pas l'audio en cours. | `projectViewPlayback.triggerChild()` coupe d'abord, puis allume. La règle est vraie à la CAPTURE, donc le rejeu la reproduit. |
| 3 | **La durée d'un objet fixe était inventée** (2 s forfaitaires) au lieu de venir du geste. | Un objet fixe n'a pas de fin naturelle : il reste annoncé jusqu'au geste suivant. Sa durée est mesurée, pas supposée. Un média, lui, s'arrête seul et c'est cette fin qui est mesurée. |
| 4 | **Lecture ignorait la capture.** La molecule écrite par Record existait bien, mais rien ne disait au niveau que c'était SA chorégraphie : Lecture enchaînait le contenu en séquentiel. | Mode de lecture `performance` : le niveau retient l'identifiant de la molecule capturée (`playback_performance_id`) et Lecture rejoue son transport. Une performance **ne s'hérite pas** — elle désigne un niveau précis. |

Effet de bord évité : un objet déclenché s'annonce avant que la sélection ne
suive, donc le Record ne l'enregistre **pas deux fois** (une fois mesuré, une
fois avec la temporisation par défaut). Une sélection qui ne déclenche rien
reste capturée : c'est la seule règle qui a changé.

Ajouté au rail : l'option **Performance** sous l'appui long sur Lecture, et elle
disparaît quand aucune chorégraphie n'existe — pas de bouton mort (§15 de
`0 -finalise-features`). Basculer en Séquentiel **ne perd pas** la capture.

## Régression corrigée au passage (Matrice)

`state.selectedIds` était relu de `getCurrentSelectionIds()`, un module qui
ignore les lignes de molecule : il répondait vide et **le rail contextuel restait
sans cible** alors qu'une tuile venait d'être touchée. Le commentaire au-dessus
du code disait déjà l'inverse de ce que faisait le code. La tuile touchée EST la
sélection de la vue, mot pour mot comme la liste.

## Vérification

```
record_performance_replay_probe.mjs   OK   21 checks (dont le rejeu par la vraie route du rail)
contextual_rail_views_probe.mjs       OK   (cible matrice = "a1", conteneur libéré, atome conservé)
lot14_record_interactions_probe.mjs   OK
lot15_record_tool_dashboard_probe.mjs OK
link_check.mjs                        OK   50/50 modules liés en ESM
check:no-fallbacks                    ok   (39 fichiers)
check:component-reuse-guardrails      ok   (4 rules)
```

Chorégraphie capturée par la probe : `photo@2/3 son@5/3 film@8/5` — la
temporalité vient bien du geste.

Trois assertions du probe de rail étaient devenues **fausses sans que le
mécanisme soit cassé** : elles greppaient le texte de
`project_view_surface_runtime.js`, dont le câblage a été extrait dans deux
modules dédiés. L'une d'elles passait même grâce à un COMMENTAIRE. Elles
interrogent maintenant le mécanisme là où il vit, et celle sur le rail est
vérifiée en le FAISANT.

## Vérifié dans l'application réelle (serveur de test, port 3002)

Les modules réels chargés par la page, pilotés par la vraie route d'intention
`project_view.list.select` :

| Mesure | Résultat |
|---|---|
| hors Record, toucher une ligne | `-` — ne déclenche rien, la navigation est inchangée |
| pendant Record, toucher la photo | `ph1` — elle s'affiche et **reste** |
| pendant Record, toucher le texte | `tx1` — le précédent s'est éteint, celui-ci reste |
| événements capturés | `ph1:play au1:play tx1:play` — trois gestes, trois clips, **zéro doublon** |
| cible du rail en Matrice | `ph1` — parité avec la liste rétablie |

**Un cinquième défaut, trouvé par l'app et raté par la probe Node.** Le premier
essai a rendu `ph1:play au1:play au1:select` : `au1` comptait DEUX fois. La
déduplication portait sur « ce qui joue encore » ; or si la lecture du média se
termine ou échoue avant que la sélection n'arrive, l'objet n'est plus en cours
et le doublon passait — un clip mesuré *plus* un clip de 2 s pour un seul geste.
La règle porte désormais sur le dernier objet **déclenché**, pas sur ce qui joue
encore. Assertion de non-régression ajoutée à la probe.

## Reste

- **§6, la capture spatiale du mode Naturel** — toujours non traitée.
- **Le parcours complet à l'écran** (importer de vrais médias, Record depuis le
  rail, save/reopen du projet) reste à faire : `startGuest` force toujours
  `backend: 'local_guest'`, qui attend Tauri. « Essayer » ne peut donc pas écrire
  depuis un navigateur, même avec `--test` — il faut un compte connecté. Ce qui
  précède est vérifié sur les modules réels dans l'app, avec des records injectés.
