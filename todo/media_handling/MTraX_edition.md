# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# MTraX edition - exigences en cours

## Objectif principal

Garantir un mode d'edition MTraX identique au comportement d'un atome selectionne dans le projet, avec synchronisation bidirectionnelle entre timeline, preview et outils.

## Selection bidirectionnelle (obligatoire)

- Quand un clip est selectionne dans la timeline, l'objet correspondant doit etre selectionne et encadre dans la preview.
- Quand un objet est selectionne dans la preview, le clip correspondant doit etre selectionne dans la timeline.
- La selection doit remonter dans la selection globale (`adole-atome-selected`) pour que tous les outils utilisent la meme cible.

## Manipulation dans la preview (obligatoire)

- Les objets internes du groupe restent manipulables dans la preview:
  - move
  - scale
  - rotate
- Les transformations sont historisees et persistees dans la timeline.

## Contraintes de drag (obligatoires)

- Interdiction de deplacer le groupe ou le panneau MTraX en draggant dans la zone preview.
- La seule zone autorisee pour deplacer le groupe/panneau docke est le header dedie en haut (`eve-mtrack-dock-move-header`).
- Le drag depuis la preview ne doit jamais declencher un drag global d'atome.

## Outils et Info panel (obligatoire)

- Tout objet interne selectionne via MTraX doit etre traite comme une selection projet standard.
- Les tools (select, transform, etc.) doivent recevoir la meme cible que hors MTraX.
- Le tool Info doit afficher immediatement les informations de l'objet interne selectionne.

## Architecture de dock (obligatoire)

- Quand un groupe est ouvert:
  - le header de dock est rendu au-dessus
  - le panneau MTraX est rendu dans le groupe (pas detache dans la couche globale)
- Le panneau ne doit pas "flotter" hors du groupe pendant l'edition dockee.

## Validation minimale

- Test 1: selection timeline -> preview (contour visible immediat).
- Test 2: selection preview -> timeline (clip surligne immediat).
- Test 3: drag dans preview deplace uniquement l'objet interne.
- Test 4: drag preview ne deplace jamais le groupe/panneau.
- Test 5: drag via header de dock deplace bien le groupe/panneau.
- Test 6: Info panel et outils reactualises apres chaque selection/transform.
