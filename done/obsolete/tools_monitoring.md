# Mandatory Execution Gate

Status: Obsolete — duplicate superseded by `todo/sharing_search_monitoring/tool_monitor.md`.

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Tache - Tools Monitoring Dashboard

## Objectif

Creer un outil de monitoring qui ouvre un panneau avec un tableau de bord des tools, pour visualiser et piloter leur activation en temps reel.

## Resultat attendu

Le panneau affiche:

1. En haut: la liste des tools actuellement actifs (y compris les tools hidden/systeme actives).
2. En dessous: la liste complete de tous les tools disponibles.
3. Pour chaque ligne: nom, id, mode d activation, etat actif/inactif, flag hidden.

## Interactions utilisateur

1. Activer un tool inactif depuis le tableau (checkbox/toggle/bouton).
2. Desactiver un tool actif depuis le tableau.
3. Le changement doit etre immediat et applique au vrai runtime (pas un etat local decoratif).
4. Le tri doit mettre les actifs en haut automatiquement.

## Regles de comportement

1. Les tools hidden doivent etre visibles dans ce panneau avec un indicateur `hidden`.
2. Les tools systeme toujours actifs doivent apparaitre comme actifs, avec indication de leur type/system source.
3. L activation a du sens en priorite pour les tools en mode `latch` (activation persistante).
4. Les tools `one_shot` doivent pouvoir etre armes (ready) et rester en attente d un clic/target, sans casser leur logique.
5. Les tools de type `contextual` peuvent etre actives, mais leur execution effective depend de la selection/cible.

## Contraintes techniques

1. Source de verite unique: runtime tools (pas de duplication d etat).
2. Pas de patch de contournement, pas de fallback cache-misere, pas de masquage d erreur.
3. Mise a jour reactive/event-driven (sans refresh manuel).
4. Compatible avec tools visibles + hidden + systeme.

## Livrables

1. Un nouveau tool `tools.monitoring` (ou nom runtime equivalent valide par le catalogue).
2. Un panneau UI `Tools Monitoring` integre dans le flux standard des panels.
3. Le tableau de controle activation/desactivation en temps reel.
4. Tests minimaux:
   - affichage complet des tools (visible + hidden)
   - changement actif/inactif depuis le panneau
   - coherence etat panneau <-> runtime
   - cas `latch` et `one_shot`.

## Definition of Done

1. Tous les tools affichent un etat coherent avec le runtime.
2. Les actions du panneau pilotent bien les vrais tools.
3. Les tools hidden sont visibles et monitorables dans le panneau.
4. Aucun ecart d etat apres refresh/reload.
