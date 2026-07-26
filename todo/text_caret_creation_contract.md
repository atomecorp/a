# Contrat de création de texte sur le fond d'un projet

Statut : en cours (2026-07-26)

## Contrat exigé (produit)

1. **Double-clic sur le fond du projet** → le **caret seul** apparaît au point cliqué.
   Aucune boîte, aucun fond translucide, aucun cadre pointillé de sélection,
   aucun chrome / toolbox / bandeau.
2. **Première frappe** → la boîte apparaît, avec le caret, et **s'étend au fur et
   à mesure** de la saisie (largeur suivant le texte).
3. **Retour chariot** → nouvelle ligne ; la boîte grandit en hauteur.
4. **Clic en dehors, contenu non vide** → valide le texte.
5. **Clic en dehors, contenu vide** (jamais saisi, ou tout effacé) → l'Atome est
   **supprimé instantanément**. Jamais de résidu dans le projet.

## Écart constaté au départ

| # | Constat | Emplacement |
|---|---|---|
| E1 | Le create au point produit une boîte `132 × 24` visible (fond translucide) au lieu d'un caret seul | `tool_runtime_create_execution.js`, `text_tool_create_runtime.js` |
| E2 | `text_bridge.sizeFor` plancher `132 × 24` → la boîte ne part pas de la largeur du caret et ne « pousse » pas depuis rien | `text_bridge.js` |
| E3 | Un Atome texte vide peint quand même son fond `rgba(18,18,18,0.42)` | `render_atom.js` (`style.fill`) |
| E4 | Le create sélectionne l'Atome → overlay pointillé Bevy + chrome | `tool_runtime_create_execution.js` (`performSelectionMutation`) |
| E5 | `collectEmptyTextAtomeIds` interroge le **DOM** (`queryAtomeElements`, `[data-role="atome-text"]`) — or la surface projet est **Bevy seule**, `atomeChildCount: 0`. Donc `removeEmptyTextAtomes` ne trouve jamais rien et les vides s'accumulent | `text_tool_editing_runtime.js` |
| E6 | Le core `executeTextCreate` appelle `scheduleTextAtomeFocus` (DOM) au lieu de `beginProjectSceneTextEdit` (scène Bevy) → pas de session d'édition, donc pas de caret ni de frappe sur ce chemin | `tool_runtime_create_execution.js` |

## Plan

- [x] P0 — Rendre le contrat explicite dans la documentation
- [x] P1 (E5) — `collectEmptyTextAteomeIds` lit les **records de scène projet**
- [x] P2 (E6) — le core `executeTextCreate` ouvre la session d'édition de scène
- [x] P3 (E4) — pas de sélection au create au point
- [x] P4 (E1/E2) — géométrie caret au départ, croissance par le contenu
- [x] P5 (E3) — un Atome texte vide ne peint pas de fond
- [ ] P6 — vérification visuelle réelle en navigateur, étape par étape — **BLOQUÉ**
- [ ] P7 (nouveau, bloquant le contrat) — un **clic simple** sur le fond du projet
      sélectionne le projet, ce qui **rouvre le dashboard par-dessus le canevas**.
      Le premier clic du double-clic déclenche donc le dashboard, qui avale le
      second clic : selon la course, le double-clic ne crée rien du tout.
      C'est très probablement la vraie « une fois sur deux » vécue par
      l'utilisateur, en plus de la géométrie déjà corrigée.
      Chaîne : `routeBackgroundClick` (clickCount 1) → `applyBackgroundSelection`
      → `applySelectionIntent(projectId,'replace')` → dashboard ouvert
      (records `__eve_dashboard_*` + `project_veil` plein écran par-dessus).
- [ ] P8 — quand la scène projet n'a aucun record, la surface WebGPU **conserve
      la frame précédente** au lieu de l'effacer : l'écran montre encore le
      dashboard alors que la scène est vide. Rend toute capture trompeuse.

## Journal

- Serveur : `scripts/run_fastify.sh --test` → `http://localhost:3001`.
  Entrée « Essayer » = session anonyme (pas de compte). Appui long ~1,2 s sur
  l'en-tête `Projets` = nouveau projet. Onglet neuf plutôt que reload : la
  surface WebGPU cesse de repeindre après un `navigate`.
