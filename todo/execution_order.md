# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Ordre d'execution des taches

Objectif: attaquer les taches dans l'ordre le plus efficace, cocher ce qui est accompli, et supprimer ce fichier une fois toutes les taches terminees.

Regle de suivi:

- Cocher chaque tache terminee avec `[x]`.
- Ne pas commencer une phase dependante tant que les phases socle ne sont pas validees.
- Une fois toutes les taches d'un fichier `todo/*.md` accomplies et verifiees, deplacer ce fichier vers `done/` si ce n'est pas deja fait.
- Apres la derniere tache terminee et verifiee, supprimer ce fichier: `todo/execution_order.md`.

## 1. Corrections critiques immediates eVe Intuition

Source principale: `todo/urgent_priorities.md`

- [x] Remplacer tout `require()` dans module ES, notamment `tools/communication.js`.
- [x] Deplacer `mtraxCloseInFlightGuard` avant toute utilisation dans `eVeIntuition.js`.
- [x] Unifier les prefixes de selection depuis `runtime/selection.js`.
- [x] Renommer `ensureString` en `isString` dans `contracts/validator.js`.
- [x] Ajouter `destroyLayerInvariantObserver()` et le connecter au cycle de destruction.
- [x] Verifier lint/build/smoke test apres chaque correction.

## 2. Factorisation minimale du socle

Source principale: `todo/urgent_priorities.md`

- [x] Creer `shared/utils.js` et migrer progressivement les utilitaires communs.
- [x] Creer `shared/media_types.js` et supprimer les duplications de types media.
- [x] Centraliser les constantes de layers et de TTL panels.
- [x] Factoriser le locking via `runtime/in_flight_lock.js`.
- [x] Unifier `readExplicitLatchedState` / `readExplicitLatched`.
- [x] Verifier les imports/exports et l'absence de duplication restante avec `rg`.

## 3. Contrat panel / layout eVe

Sources principales:

- `todo/eve_features/update_panel_refactor.md`
- `todo/eve_features/panel_tools_above_footer_band.md`
- `todo/eve_features/panel_overflow_direction_indicators.md`

- [x] Centraliser les tokens de chrome panel.
- [x] Finaliser `createEveDialog` avec header, body, tools band, footer.
- [x] Placer les outils de panel au-dessus du footer band.
- [x] Garder le footer comme bande finale avec titre, fermeture et resize grip.
- [x] Garantir que le body reste la seule zone scrollable.
- [x] Ajouter des indicateurs visibles de debordement haut/bas sur le vrai scroll container.
- [x] Migrer les panels simples avant les panels complexes.
- [x] Valider home/user, finder, communication, calendar et mtrack.

## 4. Molecule / MTraX panel

Sources principales:

- `todo/molecule/molecule_sanitizer.md`
- `todo/media_handling/MTraX_edition.md`
- `todo/molecule/molecule_tests.md`
- `todo/molecule/molecule_trouble_solving.md`
- `todo/molecule/molecule_rename_mtrack_to_molecule.md`

- [x] Construire les diagnostics globaux Molecule avant les corrections profondes.
- [x] Clarifier le contrat preview: interne par defaut, externalise uniquement si explicite.
- [x] Remplacer le layout tracks/cells par un layout responsive.
- [x] Fiabiliser le splitter pour qu'il ne deplace jamais le panel.
- [x] Retirer les styles globaux dangereux sur le host docke.
- [ ] Simplifier les synchronisations layout.
- [ ] Traiter les bugs Molecule dans l'ordre du guide trouble solving.
- [ ] Ajouter ou mettre a jour les probes/tests Molecule.
- [ ] Inventorier les noms `mtrack`, `mtrax`, `mtracks`, `hmtracks`.
- [ ] Lancer le renommage progressif Molecule seulement apres stabilisation fonctionnelle.
- [ ] Garder les aliases legacy uniquement aux frontieres publiques documentees.

## 5. AV APIs / recording / preview

Source principale: `todo/media_handling/AV_APIS.md`

- [ ] Sortir l'extraction audio de conteneur video hors de `bridge.rs`.
- [ ] Retirer les ecritures disque du callback CPAL.
- [ ] Supprimer les allocations par callback dans le metering recorder.
- [ ] Encadrer ou supprimer les chemins debug Swift en production.
- [ ] Remplacer progressivement l'ancien chemin recorder C FFI AUv3.
- [ ] Stabiliser les frontieres publiques audio/video playback/recording/preview.

## 6. Partage / sync / Finder

Sources principales:

- `todo/sharing_search_monitoring/sharing_to_code.md`
- `todo/sharing_search_monitoring/finder.md`
- `todo/sharing_search_monitoring/finder_UI.md`
- `todo/communication_social/matrix_flower_context_menu.md`

- [ ] Reproduire le bug de partage Fastify vers Tauri et collecter les logs.
- [ ] Identifier la cause: `receiverProjectId`, `parent_id`, ou filtre `loadProjectAtomes()`.
- [ ] Consolider `getCurrentProjectId()`.
- [ ] Supprimer les fallbacks qui masquent les erreurs.
- [ ] Ajouter validation et erreurs claires pour les partages non lies.
- [ ] Stabiliser Finder apres correction du modele partage/projet.
- [ ] Ajouter le menu Flower contextuel Matrix apres stabilisation selection/command path.
- [ ] Verifier que Copy, Paste, Duplicate, Delete et Rename routent vers les vrais chemins runtime.

## 7. Mail / IA vocale / MCP

Source principale: `todo/ai_voice/AI_integration_problems_to_solve.md`

- [ ] Stabiliser le contrat semantique mail.
- [ ] Stabiliser la memoire de session.
- [ ] Stabiliser le transport Tauri/mail.
- [ ] Ajouter une couche robuste d'interpretation STT.
- [ ] Etendre le meme modele a contacts et calendar.
- [ ] Etendre le meme modele aux outils Atome.
- [ ] Ajouter tests semantiques, orchestrateur et E2E Tauri.

## 8. Auth, Apple Mail, notifications, calendar

Sources principales:

- `todo/communication_social/user_auth.md`
- `todo/communication_social/apple_mail_security.md`
- `todo/eve_features/Notification_tool.md`
- `todo/eve_features/calendar_todos.md`

- [ ] Completer les points production auth critiques.
- [ ] Valider les contraintes Apple Mail IMAP/CalDAV.
- [ ] Stabiliser le systeme de notifications.
- [ ] Ajouter vue semaine, recherche et preferences calendar.

## 9. Migration V2 / cleanup large

Sources principales:

- `todo/cleanup_architecture/v2_full_migration_framework.md`
- `todo/cleanup_architecture/framework_cleanup_and_ui_optimization_plan_2026-04-19.md`

- [ ] Supprimer progressivement les bridges `eveGoeyMenuApi`.
- [ ] Supprimer l'alias legacy `new_menu`.
- [ ] Normaliser les IDs tools en `_intuition_v2_*`.
- [ ] Nettoyer les APIs clone/outils legacy.
- [ ] Renommer les contrats V1 encore exposes.
- [ ] Migrer les cles de persistance `*_v1`.
- [ ] Ajouter les garde-fous CI anti regression V1.
- [ ] Nettoyer uniquement les artefacts generes confirmes comme jetables.

## 10. Taille des fichiers / normes de codage

Source principale:

- [ ] Inventorier les fichiers dans les seuils: sous 300, entre 300 et 500, au-dessus de 500, au-dessus de 800 et au-dessus de 1000 lignes.
- [ ] Prioriser les fichiers au-dessus de 500 lignes et ceux qui melangent plusieurs responsabilites.
- [ ] Reduire tout fichier au-dessus de 500 lignes avant de continuer a l'etendre, sauf si le travail en cours realise deja cette reduction.
- [ ] Traiter tout fichier au-dessus de 800 lignes comme une dette legacy critique a reduire avant toute croissance fonctionnelle.
- [ ] Imposer ces regles a tout fichier modifie, meme s'il etait deja hors seuil avant intervention.
- [ ] Sortir les utilitaires dupliques vers des modules partages seulement quand cela supprime une vraie duplication et renforce une frontiere architecturale stable.
- [ ] Eviter la multiplication artificielle des fichiers: pas de micro-fichiers, wrappers pass-through, proxies ou couches vides crees uniquement pour faire baisser le nombre de lignes.
- [ ] Ne pas disperser une logique coherente dans une multitude de petits fichiers pour contourner la contrainte de lignes; garder des frontieres de fichiers lisibles, stables et justifiees.
- [ ] Exiger pour tout fichier touche: verification du nombre de lignes, factorisation, nettoyage, optimisation et validation avant cloture.
- [ ] Supprimer le code mort, deprecated, duplique ou inatteignable trouve pendant les reductions.
- [ ] Documenter tout fichier restant au-dessus de 800 lignes avec justification, frontiere de responsabilite et plan de reduction.
- [ ] Interdire tout fichier au-dessus de 1000 lignes sans justification architecturale explicite et plan actif de reduction.
- [ ] Verifier l'alignement du code existant avec les normes de `.codex/AGENTS.md`.

## 11. Chantiers produits differables

Ces taches doivent rester apres stabilisation du socle.

- [ ] MIDI.
- [ ] Vector editing layer.
- [ ] Universal canvas.
- [ ] MediaSoup.
- [ ] Matrix social/news wall.
- [ ] Presets/skins.
- [ ] API sugar.
- [ ] Publication npm.
- [ ] Documentation.
- [ ] Website publishing.

## Fin

- [ ] Toutes les phases ci-dessus sont terminees.
- [ ] Les validations finales sont passees.
- [ ] Supprimer ce fichier: `todo/execution_order.md`.
