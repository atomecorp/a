# Unification des panneaux (26 sept. 2026)

Demande : unifier, corriger, optimiser et centraliser au maximum le code des
panneaux (le moins de code possible). Base de design = coque Bevy du panneau
Couleur (arrondi, sans en-tête).

## Tâches
- [x] 1. Coque : bande du rail contextuel réservée dans la résolution de placement (ouverture, drag, resize, refresh) ; panneaux ouverts repoussés quand le rail apparaît, rendus à leur place quand il part (intention de placement conservée)
- [x] 2. Options mortes/dispersées supprimées : `dockToDashboardHeader` (ne faisait que couper le drag → Contact indéplaçable), `allowMobileFloating`, `mobileFloatingSurfaceKeys`, `openBesideContextualRail`, `resolveHandednessEdgeInsetPx` (3 copies)
- [x] 3. Accordéons opaques (en-tête + corps, jetons `accordion.headerBackground/bodyBackground`)
- [x] 4. Contact : une seule colonne pour tous les blocs ; colonne de sélection seulement s'il y a une fiche supprimable
- [x] 5. Largeurs : `resolvePanelColumnWidth` (plus de plafond à 358 px → marges gauche/droite égales) ; champ numérique à largeur de colonne ; nuanciers qui finissent sur la marge
- [x] 6. Panneau déplacé qui suit toujours son contenu (bord haut fixe) sauf redimensionnement explicite
- [x] 7. Coller → Bevy (liste, cases, glisser sur le projet = coller au point de lâcher, bouton Coller) ; libellé = contenu de la copie, pluriel correct
- [x] 8. Supprimés, Historique, Calques, Fond → Bevy (Fond = schéma déclaratif)
- [x] 9. Régression corrigée : les lignes de liste n'affichaient plus sélection/lecture (« cleanup old design ») ; `panelStateBackground` non importé (ReferenceError sur cible d'absorption) ; aperçu de glisser qui mettait un objet dans `background`
- [x] 10. Factorisations : `panelTextFieldHandlers` (6 copies), `selectableListDragHandlers` + `session.route` (3 copies), `resolvePanelProjectDropPoint`, sélection de copies (2 copies)
- [x] 11. Code mort supprimé : pipeline DOM des panneaux (panel_creator, panel_open_settle_runtime, panel_layout_runtime/geometry/policy), 16 modules `elements/design/*` + presets DOM (dialogues, chrome, contrôles, undo/fond/presse-papiers), 3 fichiers DOM de Fond, vue DOM de Supprimés, styles Calques
- [x] 12. Probe app réelle `temp/panels_unification_real_app.probe.mjs` (Playwright, gestes réels)

## Journal
- Probe verte : rail (ouverture, drag, apparition/disparition), Contact déplaçable + alignement + opacité, Coller (bouton + glisser), Historique (pas arrière), Supprimés (supprimer/restaurer), Calques, Fond (numérique, choix de motif), croissance après drag, aucun dialogue DOM, aucune erreur page.
- Historique : le journal est en ajout seul — appliquer une position ajoute des événements, la position revient en fin (comportement identique à l'ancien panneau DOM).
