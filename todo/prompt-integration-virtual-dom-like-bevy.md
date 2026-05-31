# Prompt d’intégration — Virtual Scene / Virtual DOM-like + Bevy

Tu es un expert senior en architecture graphique temps réel, WebGPU, canvas, Bevy, ECS, scène hiérarchique, systèmes de drag/resize, accessibilité canvas et migration de moteur de rendu.

## Contexte projet

Le projet Atome/eVe possède déjà :

- un modèle canonique d’atomes ;
- des relations hiérarchiques parent/enfant ;
- des racines système comme `view` et `project_view_<project_id>` ;
- une projection de l’état canonique vers une scène de rendu WebGPU ;
- un canvas WebGPU partagé pour une zone de rendu active ;
- une logique d’interaction canvas-level : sélection, hit testing, drag, resize, édition de texte.

Un document d’architecture indique que l’existant est proche d’un système de scène virtuelle, mais pas encore un vrai Virtual DOM hiérarchique côté rendu. Le rendu actuel semble plutôt être une liste filtrée et triée par `z-index`, avec lookup par id, puis dessin dans un canvas.

Le projet prévoit une migration vers Bevy.

## Bugs critiques observés

1. Après plusieurs déplacements d’atomes, certains atomes précédemment déplacés commencent à se déplacer tout seuls après environ 2 à 4 secondes.
2. Pendant un drag, l’atome actif peut sauter, trembler ou glitcher.
3. Pendant le resize de la WebView, le canvas est parfois stretché comme une image bitmap avant de reprendre sa taille correcte.
4. Le resize devrait révéler ou cropper la scène, pas déformer les atomes.
5. Les atomes ne doivent jamais changer d’échelle à cause d’un resize de WebView.

## Mission

Analyse le code et propose une stratégie d’intégration claire entre :

- un Virtual DOM-like / Virtual Scene Tree propre à Atome ;
- Bevy comme futur moteur ECS/rendu ;
- le WebGPU canvas actuel ;
- la correction des bugs de drag et de resize.

Tu dois décider si le Virtual DOM-like doit être intégré avant Bevy, après Bevy, ou en deux phases.

## Décision attendue

Ne réponds pas vaguement. Donne une décision tranchée parmi :

1. intégrer le Virtual DOM-like complet avant Bevy ;
2. intégrer Bevy d’abord ;
3. intégrer maintenant seulement un contrat Virtual Scene minimal, puis Bevy, puis éventuellement enrichir le Virtual DOM-like après Bevy.

Par défaut, privilégie l’option 3 si le code confirme que Bevy fournit déjà une partie des primitives utiles : ECS, hiérarchie d’entités, caméras, RenderLayers, RenderGraph, UI, viewport et systèmes de transformation.

Important : ne construis pas une grosse couche Virtual DOM concurrente de Bevy si Bevy peut porter une partie du graphe de scène et des calques. Le Virtual DOM-like Atome doit rester un contrat de projection/diff entre l’état canonique Atome et le renderer, pas devenir un second moteur de rendu complet.

## Questions à résoudre

### A. Le document actuel couvre-t-il tous les usages ?

Vérifie si le document couvre explicitement :

- hiérarchie parent/enfant ;
- groupes ;
- calques ;
- z-index ;
- ordre de rendu ;
- clipping ;
- masques ;
- viewport ;
- camera ;
- resize WebView ;
- devicePixelRatio ;
- taille CSS du canvas vs taille réelle du drawing buffer ;
- limitation `maxTextureDimension2D` ;
- drag ;
- pointer capture ;
- pointercancel ;
- blur ;
- sortie de fenêtre ;
- hit testing ;
- sélection ;
- focus clavier ;
- texte ;
- IME ;
- copier/coller ;
- accessibilité ;
- bridge DOM caché pour texte/accessibilité ;
- lifecycle des listeners ;
- lifecycle des ressources GPU ;
- dirty flags ;
- diffing ;
- reconciliation ;
- invalidation ;
- undo/redo ;
- snapshots ;
- autosave ;
- animations/tweens ;
- timers ;
- `requestAnimationFrame` ;
- synchronisation backend ;
- tests de non-régression.

Classe chaque point en :

- couvert clairement ;
- couvert partiellement ;
- absent ;
- dangereux ou ambigu.

### B. Invariants obligatoires

Propose des invariants stricts :

1. L’état canonique Atome est la seule source de vérité métier.
2. La scène de rendu est jetable et reconstructible.
3. Aucun système de rendu ne doit muter directement l’état canonique hors commande déclarée.
4. Un seul writer peut modifier la position logique d’un atome à un instant donné.
5. Aucun write différé ne peut modifier un atome après la fin d’une session de drag si son `dragSessionId` est périmé.
6. Le resize de WebView ne modifie pas les positions logiques des atomes.
7. Le resize modifie le viewport, la taille du render target ou la caméra, mais ne stretch jamais le rendu existant.
8. La taille CSS du canvas et la taille réelle du buffer doivent être synchronisées avant le rendu suivant.
9. Les atomes ne doivent jamais être déformés par un changement de taille du canvas.
10. Les coordonnées écran, viewport, monde, canvas CSS pixels et device pixels doivent être séparées.

### C. Diagnostic prioritaire des bugs actuels

Avant toute migration Bevy, instrumente le code pour trouver qui écrit les positions.

Ajoute un traçage obligatoire de toutes les écritures de position :

- timestamp ;
- atomId ;
- ancienne position ;
- nouvelle position ;
- writer/source ;
- stack trace ;
- cause : drag, resize, layout, animation, restore, autosave, sync, raf, timer ;
- `dragSessionId` ;
- état `isDragging` ;
- pointerId ;
- frameId ;
- route/canvas active ;
- taille WebView ;
- taille CSS canvas ;
- taille drawing buffer ;
- viewport ;
- camera transform.

Cherche spécialement :

- `setTimeout` ;
- `setInterval` ;
- debounce/throttle ;
- animation/tween/spring ;
- `requestAnimationFrame` non annulé ;
- stale closure ;
- listeners non nettoyés ;
- autosave/restore/snapshot ;
- sync backend ;
- recalcul de layout différé ;
- mutation directe de position ;
- double source de vérité ;
- ancien `selectedAtom`, `activeAtom`, `dragTarget`, `lastPosition` ;
- updates envoyés à un atome non actif.

Critère de réussite : après 20 déplacements d’atomes différents et 5 secondes d’attente, aucune position ne doit changer si aucune commande utilisateur n’est active.

### D. Architecture Virtual Scene minimale avant Bevy

Ne construis pas encore un Virtual DOM complet.

Construis plutôt un contrat minimal renderer-agnostic :

```ts
type AtomeRenderNode = {
  id: string
  parentId: string | null
  kind: 'shape' | 'image' | 'text' | 'group' | 'container' | 'effect'
  localTransform: Transform2D
  worldTransform?: Transform2D // dérivé uniquement
  bounds: Rect
  visible: boolean
  opacity: number
  zIndex: number
  layer: string
  clip?: ClipSpec
  mask?: MaskSpec
  material?: MaterialSpec
  text?: TextSpec
  interactive: boolean
  accessibility?: AccessibilitySpec
  children: string[]
}

type RenderDiffOp =
  | { type: 'spawn', node: AtomeRenderNode }
  | { type: 'despawn', id: string }
  | { type: 'updateTransform', id: string, localTransform: Transform2D }
  | { type: 'updateStyle', id: string, patch: Partial<AtomeRenderNode> }
  | { type: 'reparent', id: string, parentId: string | null, index?: number }
  | { type: 'setLayer', id: string, layer: string }
  | { type: 'setVisibility', id: string, visible: boolean }
  | { type: 'setClip', id: string, clip?: ClipSpec }
```

Ajoute :

- dirty flags : `HierarchyDirty`, `TransformDirty`, `StyleDirty`, `TextDirty`, `BoundsDirty`, `LayerDirty`, `AccessibilityDirty` ;
- un reconciler qui produit des diffs déterministes ;
- un scheduler qui applique les diffs dans un ordre stable ;
- une séparation stricte entre état canonique, projection, diff, rendu ;
- un bridge texte/accessibilité DOM séparé du canvas ;
- une API d’événements déclaratifs : `PointerDown`, `PointerMove`, `PointerUp`, `PointerCancel`, `ResizeViewport`, `Focus`, `Blur`, `TextEditStart`, `TextEditCommit`.

### E. Mapping vers Bevy

Propose comment mapper ce contrat vers Bevy sans dupliquer inutilement Bevy :

- `AtomeRenderNode.id` -> composant `AtomeId` ;
- `parentId` / `children` -> relations ECS `ChildOf` / `Children` ;
- `localTransform` -> `Transform` ;
- `worldTransform` -> `GlobalTransform` dérivé par Bevy ;
- `zIndex` / `layer` -> `RenderLayers`, ordre caméra ou composant de tri selon le type de rendu ;
- viewport/crop/reveal -> caméra + viewport + projection orthographique ;
- calques professionnels -> caméras ordonnées, RenderLayers, passes de rendu ou RenderGraph selon le besoin ;
- UI non-scène -> Bevy UI si elle est dans Bevy, sinon DOM overlay ;
- texte éditable/accessibilité -> bridge DOM ou système dédié, ne pas supposer qu’un canvas seul suffit.

Précise ce qui doit rester côté Atome et ce qui doit être confié à Bevy.

### F. Resize professionnel

Corrige le resize selon ces règles :

1. Ne jamais utiliser le canvas comme image stretchée.
2. Ne pas se contenter de changer `style.width` / `style.height`.
3. Synchroniser la taille réelle du buffer avec la taille affichée.
4. Utiliser `ResizeObserver`.
5. Gérer `devicePixelContentBoxSize` si disponible.
6. Fallback propre avec `contentBoxSize * devicePixelRatio`.
7. Clamp avec `device.limits.maxTextureDimension2D`.
8. Mettre à jour viewport/camera/projection avant le rendu suivant.
9. Le resize doit révéler/cropper la scène, pas scaler les atomes.
10. Tester WebView, zoom, DPI, resize rapide, resize pendant drag.

Critère visuel : pendant le resize, aucun frame ne doit afficher un canvas stretché ou des atomes déformés.

### G. Plan en deux phases recommandé

Si l’audit confirme que Bevy va porter la hiérarchie, les calques et le rendu, propose ce plan :

#### Phase 1 — Avant Bevy

Objectif : stabiliser le système et définir le contrat.

À faire :

- corriger ou au minimum tracer le bug des atomes qui bougent seuls ;
- corriger le resize canvas/WebView ;
- définir le `AtomeRenderNode` minimal ;
- définir les diffs ;
- définir les dirty flags ;
- définir les invariants ;
- écrire les tests de non-régression ;
- ne pas implémenter un Virtual DOM complet.

#### Phase 2 — Intégration Bevy

Objectif : utiliser Bevy comme backend de rendu/ECS.

À faire :

- créer un backend Bevy qui consomme les snapshots/diffs Atome ;
- mapper les nodes Atome vers des entités Bevy ;
- utiliser les relations parent/enfant Bevy ;
- utiliser `Transform` / `GlobalTransform` ;
- utiliser `RenderLayers` et caméras ordonnées pour les calques ;
- utiliser `Camera.viewport` et projection orthographique pour crop/reveal ;
- utiliser RenderGraph seulement pour les passes de rendu avancées, pas comme modèle métier ;
- garder l’état canonique côté Atome ;
- ne pas laisser Bevy et Atome écrire simultanément la même position.

#### Phase 3 — Après Bevy, seulement si nécessaire

Objectif : enrichir le Virtual DOM-like si Bevy ne couvre pas assez les besoins Atome.

À faire uniquement si nécessaire :

- diff hiérarchique plus complet ;
- layout spécialisé ;
- système de clipping/masking avancé ;
- système d’accessibilité enrichi ;
- cache de mesure texte ;
- reconciliation optimisée ;
- batching spécialisé.

### H. Livrables attendus

Produis :

1. un audit du document actuel ;
2. une liste des manques ;
3. une recommandation avant/après Bevy ;
4. un plan d’intégration en phases ;
5. un patch plan précis ;
6. les fichiers/fonctions à inspecter ;
7. les logs/assertions à ajouter ;
8. les tests de non-régression ;
9. un mapping Atome -> Bevy ;
10. les risques techniques ;
11. les critères d’acceptation.

## Format de réponse exigé

Réponds avec ces sections :

A. Verdict court  
B. Ce que le document couvre bien  
C. Ce qui manque ou reste dangereux  
D. Décision : avant Bevy, après Bevy ou deux phases  
E. Architecture cible  
F. Patch minimal avant migration  
G. Mapping précis vers Bevy  
H. Tests de non-régression  
I. Risques  
J. Prochaines actions concrètes

Ne donne pas une réponse générique. Raisonne comme si tu devais corriger et migrer un vrai projet de production.
