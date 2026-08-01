# Flower — l'appui long n'ouvrait plus le menu (fond, puis atomes)

Corrigé le 29/07/2026. Régression introduite le 25/07/2026, sans rapport avec le
travail sur la consommation d'énergie du même jour.

## Symptôme

Dans un projet, un appui long sur le fond n'ouvrait plus le menu radial.

## Cause

Le commit `341cc32` (« input box works on mobile too », 25/07) a ajouté un garde
dans le timer d'appui long du Flower :

```js
if (event.defaultPrevented === true) { clearPointerState(); return; }
```

L'intention était juste : si un champ de saisie Bevy a consommé la pression, le
menu radial ne doit pas se déclencher par-dessus.

Mais le garde est trop large. Le calque de fond du projet
(`core/atome_events/project_layer_runtime.js`) appelle `preventDefault()` **dès
le pointerdown** sur le fond, uniquement pour qu'un glissé ne dégénère pas en
sélection de texte native. Or c'est exactement le geste que le Flower possède
quand le doigt ne bouge pas. Le timer relisait `defaultPrevented` à 460 ms, le
trouvait à `true`, et abandonnait — donc plus jamais de Flower sur le fond.

Mesuré : `defaultPrevented` vaut `false` à la distribution du pointerdown puis
`true` 700 ms plus tard, le `preventDefault()` venant de
`project_layer_runtime.js:488` en phase de capture.

## Correction

Une primitive de marquage par pointeur dans `intuition/flower/context_pointer_lock.js`,
à côté des verrous existants :

- `markFlowerBackgroundPointerGesture(pointerId)` — posée par le calque de fond
  au moment où il arme sa session, juste avant son `preventDefault()` ;
- `isFlowerBackgroundPointerGesture(pointerId)` — lue par le timer du Flower ;
- nettoyée par le `cleanup()` du calque, plus un TTL identique à celui des
  verrous pour qu'un pointerup perdu ne laisse pas le drapeau armé.

Le garde devient :

```js
if (event.defaultPrevented === true && !isFlowerBackgroundPointerGesture(event.pointerId)) {
```

Les dépendances passent par l'injection de `createProjectLayerRuntime`, comme
`isFlowerPointerLocked` déjà présent.

Le marquage n'a **qu'un seul site d'appel**, dans la branche fond, après les
sorties anticipées sur atome touché et sur cible ignorée : un vrai consommateur
(champ de saisie) ne peut donc jamais le poser, et la protection du 25/07 reste
entière.

Rien à changer côté conflit de gestes : le calque se retirait déjà quand le
Flower verrouille le pointeur (gardes dans ses handlers `pointermove` et
`pointerup`). Seul le garde `defaultPrevented` cassait la séquence.

## Vérification

```bash
node temp/energy_probe/flower_contract_probe.mjs   # les 3 comportements
node temp/energy_probe/pointer_gesture_probe.mjs   # la primitive
```

Contrat vérifié dans l'app réelle (Chromium Playwright, projet ouvert) :

| geste sur le fond | Flower |
|---|---|
| maintien immobile | s'ouvre |
| pression puis glissé | ne s'ouvre pas (lasso) |

La probe de la primitive a été passée sur un module volontairement cassé
(contrôle négatif) : 4 échecs, donc elle discrimine.

Performances inchangées après correction : repos 1,0 tick/s (~0,10 % d'un cœur),
activité 59,9 ticks/s.

## Deuxième moitié : les atomes

Même cause, autre consommateur. `domains/rendering/surface_interaction_runtime.js`
appelle `stopSurfaceEvent(event)` dès qu'un atome est touché (l.124), **avant**
de savoir si la pression va router vers l'édition de texte ou simplement armer
un déplacement. Le `defaultPrevented` qui en résultait faisait reculer le timer
d'appui long exactement comme sur le fond.

La primitive a donc été généralisée — `markFlowerPointerGestureArmed` /
`isFlowerPointerGestureArmed` / `clearFlowerPointerGestureArmed` — et posée dans
la branche déplacement/redimensionnement uniquement. Les deux branches d'édition
de texte au-dessus sortent avant et ne marquent rien, donc elles continuent de
faire reculer le Flower. Le marquage est nettoyé en tête des handlers
`pointerup` et `pointercancel`, avant leurs sorties anticipées.

Là aussi le design prévoyait déjà que le Flower gagne : le runtime de surface
termine sa session dès que le Flower verrouille le pointeur (l.278 et l.330).

## Sélection multiple : outils ajoutés

`FLOWER_MIXED_SELECTION_TOOL_KEYS` passe de `['info', 'play']` à
`['info', 'play', 'delete', 'communicate']`. La clé canonique est
**`communicate`**, celle des trois autres jeux d'outils.

`delete` reçoit `selection_ids` et agit donc sur toute la sélection, et il prend
le style `danger` comme dans les jeux mono-kind.

## Limite de vérification

Le contrat du fond (maintien -> menu, glissé -> lasso) est vérifié bout-en-bout.
**L'appui long sur atome et le menu de sélection multiple ne le sont pas** : le
serveur local renvoie `remote_account_not_provisioned` à la création de projet,
ce qui bloque aussi le parcours dashboard lui-même (appui long sur l'en-tête
« Projets » ne crée plus rien). Rien à voir avec ces correctifs — constaté aussi
avec la modification retirée.

À rejouer dès que le provisionnement du compte anonyme refonctionne :

```bash
node temp/energy_probe/flower_atome_probe.mjs
```
