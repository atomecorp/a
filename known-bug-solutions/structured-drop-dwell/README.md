# Structured combination bypasses its dwell timer

Web baseline `matrix_dwell_baseline_v2` (2026-09-08) records a canonical wrap after
only 50 ms of overlap. Both List/Matrix runtimes assigned absorbTargetId directly
and treated any combine intent as armed on release, bypassing the shared timer.

Both now call armStationaryAbsorb and gate release with hasStationaryAbsorbOverlap.
Mode/placement is part of the dwell zone; changing zones restarts the 500 ms wait.
Progress updates use existing BevyUI motion patches. Cancellation, replaced
sessions and failed arming release timers. Canonical membership mutation remains
combineCanonicalMolecule; the new shared feedback module only projects session
geometry, translated intention and progress.

Twenty-four targeted tests pass, including early release, successful release,
zone rearming and cancelled timers. Web matrix_dwell_pixels_v3 and
list_dwell_fixed_v1 pass brief/maintained drops, reorder and reload with clean
console; the List run also expands the molecule. Inspected Matrix pixels show
its dragged image and the complete intention label.

The Matrix ghost had an additional layering bug: raising only the card root to
z=5 covered its preview at z=1. tileMediaCardNode now accepts a base zIndex and
applies the same offset to its children. It reuses the existing record preview.

Remaining acceptance: side-zone compositions, nested targets, undo/redo and
reopening through the Dashboard. Do not infer those from a center-drop result.

## Supprime — le choix est passe dans le rail (2026-09-20)

La temporisation d'immobilite ET la palette flottante n'existent plus. Un depot ne
decide plus rien : il POSE l'objet la ou le doigt l'a lache, puis les memes choix
(Avant/Apres/Devant/Derriere/Ecraser/Inserer, ou Inclure/Poser dessus pour une
page) s'affichent comme des outils ordinaires du rail contextuel, jusqu'au prochain
appui sur un objet. Voir `eVe/domains/rendering/project_view_drop_choice_rail.js`.

Ce qui reste de l'episode, et qui vaut pour la suite :

- `resolveStructuredDropIntent` (zones avant/apres/simultane) survit : c'est de la
  geometrie, pas de la temporisation. Le surlignage de cible se lit desormais sur
  l'intention, sans aucun delai.
- L'ancienne palette gelait le point de depot pour que l'objet n'aille pas se poser
  sous le doigt, et rembobinait ensuite le delta. Sans palette, ces deux
  contorsions disparaissent — c'etait le signe que le pop-up etait au mauvais
  endroit du geste.
- Un depot sur une page n'inclut plus automatiquement : c'etait une reparentage
  silencieux que subissait tout objet simplement relache au-dessus d'une page.
