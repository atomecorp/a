# Ordre d'execution des taches

Objectif: attaquer les taches dans l'ordre le plus efficace, cocher ce qui est accompli, et supprimer ce fichier une fois toutes les taches terminees.

Regle de suivi:

- Cocher chaque tache terminee avec `[x]`.
- Ne pas commencer une phase dependante tant que les phases socle ne sont pas validees.
- Apres la derniere tache terminee et verifiee, supprimer ce fichier: `todo/execution_order.md`.

## 1. Corrections critiques immediates eVe Intuition

Source principale: `todo/urgent_priorities.md`

- [ ] Remplacer tout `require()` dans module ES, notamment `tools/communication.js`.
- [ ] Deplacer `mtraxCloseInFlightGuard` avant toute utilisation dans `eVeIntuition.js`.
- [ ] Unifier les prefixes de selection depuis `runtime/selection.js`.
- [ ] Renommer `ensureString` en `isString` dans `contracts/validator.js`.
- [ ] Ajouter `destroyLayerInvariantObserver()` et le connecter au cycle de destruction.
- [ ] Verifier lint/build/smoke test apres chaque correction.

## 2. Factorisation minimale du socle

Source principale: `todo/urgent_priorities.md`

- [ ] Creer `shared/utils.js` et migrer progressivement les utilitaires communs.
- [ ] Creer `shared/media_types.js` et supprimer les duplications de types media.
- [ ] Centraliser les constantes de layers et de TTL panels.
- [ ] Factoriser le locking via `runtime/in_flight_lock.js`.
- [ ] Unifier `readExplicitLatchedState` / `readExplicitLatched`.
- [ ] Verifier les imports/exports et l'absence de duplication restante avec `rg`.

## 3. Contrat panel / layout eVe

Source principale: `todo/eve_features/update_panel_refactor.md`

- [ ] Centraliser les tokens de chrome panel.
- [ ] Finaliser `createEveDialog` avec header, body, footer et tools dock.
- [ ] Garantir que le body reste la seule zone scrollable.
- [ ] Migrer les panels simples avant les panels complexes.
- [ ] Valider home/user, finder, communication, calendar et mtrack.

## 4. Molecule / MTraX panel

Sources principales:

- `todo/molecule/molecule_sanitizer.md`
- `todo/media_handling/MTraX_edition.md`
- `todo/molecule/molecule_tests.md`

- [ ] Clarifier le contrat preview: interne par defaut, externalise uniquement si explicite.
- [ ] Remplacer le layout tracks/cells par un layout responsive.
- [ ] Fiabiliser le splitter pour qu'il ne deplace jamais le panel.
- [ ] Retirer les styles globaux dangereux sur le host docke.
- [ ] Simplifier les synchronisations layout.
- [ ] Ajouter ou mettre a jour les probes/tests Molecule.
- [ ] Lancer le renommage progressif Molecule seulement apres stabilisation.

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

- [ ] Reproduire le bug de partage Fastify vers Tauri et collecter les logs.
- [ ] Identifier la cause: `receiverProjectId`, `parent_id`, ou filtre `loadProjectAtomes()`.
- [ ] Consolider `getCurrentProjectId()`.
- [ ] Supprimer les fallbacks qui masquent les erreurs.
- [ ] Ajouter validation et erreurs claires pour les partages non lies.
- [ ] Stabiliser Finder apres correction du modele partage/projet.

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

## 10. Chantiers produits differables

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
