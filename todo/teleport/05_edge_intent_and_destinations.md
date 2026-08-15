# Téléportation — Lots 5 et 6 : geste au bord + choix de destination

État : **fait pour la logique** (2026-08-15). Dépend des lots 1 à 4.

## Lot 5 — intention au bord

`eVe/intuition/runtime/eve_intuition/teleport_edge_intent_runtime.js` (nouveau), branché
dans `atome_contextual_edit_runtime.js` (`begin` / `track` / `end` sur le drag existant).

### Le signal était déjà là

Aucune géométrie nouvelle n'a été introduite. Le drag existant **clampe** déjà la position
à la surface (`contextualGestureProps`) : quand l'utilisateur continue de pousser, la
position *désirée* dépasse le clamp pendant que la position *peinte* colle au bord.
Cet écart **est** la poussée contre le mur. Le détecteur consomme les mêmes entrées.

Pas de carte spatiale, pas de configuration d'écrans : le geste est l'intention (§5.2).

### Trois conditions simultanées (§18)

| Seuil | Valeur | Ce qu'il empêche |
| --- | --- | --- |
| `tolerancePx` | 2 | le scintillement dû aux arrondis sub-pixel |
| `minOvershootPx` | 24 | qu'un flick rapide qui frôle le bord déclenche |
| `minDwellMs` | 450 | qu'on téléporte un objet qu'on gare simplement dans un coin |

Règles complémentaires, toutes couvertes par la probe :

- **une seule fois par drag** — un geste = une intention, même maintenu ;
- **revenir à l'intérieur remet le compteur à zéro** — un utilisateur hésitant ne peut
  pas accumuler jusqu'au déclenchement ;
- **changer réellement de bord redémarre le délai** — mais dériver le long du même bord
  dominant reste une seule poussée continue et déclenche normalement ;
- **le resize est exclu** — seul `mode === 'drag'` est suivi.

## Lot 6 — plusieurs destinations

`eVe/intuition/tools/teleport_destination_picker.js` (nouveau).

Le §5.3 dit surtout ce que ça ne doit **pas** être : pas de choix arbitraire, pas de
grande fenêtre, pas de gestionnaire d'appareils. La solution était déjà dans le code :
`enterVirtual` du contextual editor donne un rail d'outils arbitraire avec son propre
invocateur. Le sélecteur est donc **une liste d'outils**, pas une nouvelle surface.

- une cible → téléportation directe, aucune étape (§5.2) ;
- plusieurs → le rail contextuel affiche les appareils par **nom**, pas par identifiant ;
- aucune → `squirrel:teleport-no-destination`, retour discret, l'objet reste (§20).

Le rail se ferme dès que la question est répondue — arrivée, annulation, ou absence de
cible — et n'apparaît que lorsque le contexte l'exige (§19).

## Vérification

- `temp/teleport_edge_intent_probe.mjs` — 8 sections. L'essentiel porte sur ce qui **ne
  doit pas** déclencher (frôlement, poussée brève, hésitation, changement de bord),
  avec une horloge injectée pour exercer le délai de façon déterministe plutôt qu'avec
  des `sleep`.
- `temp/teleport_destination_picker_probe.mjs` — 8 sections. Le choix passe par le vrai
  manager et est intercepté au niveau du transport, ce qui vérifie aussi le message émis.

Les neuf probes des lots 1 à 6 passent ensemble. Graphe de boot : 234 modules, la couche
API reste non-eager.

## Correction en cours de route

Une assertion de ma probe était fausse, pas le code : pousser en `(400, 700)` reste une
poussée **vers le bas** (dépassement 362) et non vers la droite (230). Le comportement
observé est correct — dériver le long du bord dominant est une poussée continue. La probe
a été corrigée pour tester un vrai changement de bord (bas peu profond → droite profonde).

## Reste à faire

- **Retour visuel** du `squirrel:teleport-no-destination` : l'événement est émis, rien ne
  le peint encore. À faire avec l'apparence du proxy résiduel (lot 3).
- **Accordage des seuils sur appareil réel** : 24 px / 450 ms sont des valeurs de départ
  raisonnées, pas mesurées. Le §18 demande explicitement de les tester.
- **Vérification en application réelle** : non faite.
