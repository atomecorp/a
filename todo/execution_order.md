# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Nature du document

Ce fichier est l'ordre d'execution autoritatif des taches actives de ./todo.

Il ne doit plus etre interprete comme une simple liste indicative.

Regle de perimetre:

- Seuls les fichiers todo explicitement cites dans ce document peuvent etre executes.
- Tout fichier present dans ./todo mais absent de ce document est hors ordre actif.
- Un fichier absent ne doit pas etre traite tant qu'il n'a pas ete ajoute ici avec sa phase, ses dependances, ses criteres de sortie, et sa validation utilisateur.

## Regles de pilotage

- Cocher chaque tache terminee avec [x].
- Ne pas commencer une phase dependante tant que ses prerequis ne sont pas totalement valides.
- Avant chaque nouvelle tache, fournir a l'utilisateur un resume court de la tache, des fichiers sources concernes, des dependances, des tests prevus, et attendre sa validation explicite.
- Aucune nouvelle tache ne demarre sans validation explicite de l'utilisateur.
- Chaque tache terminee doit etre suivie d'au moins un test, une verification, ou un controle cible adapte a la tache.
- Chaque cloture de tache doit produire un rapport avec: tache realisee, validation executee, resultat, nombre de taches accomplies sur le total, et pourcentage d'avancement global.
- Le pourcentage d'avancement global se calcule sur le total des cases a cocher de ce fichier.
- Toute nouvelle sous-tache decouverte en cours de route doit etre ajoutee ici avant execution si elle modifie l'ordre ou le perimetre.
- Une fois toutes les taches d'un fichier todo/*.md accomplies et verifiees, deplacer ce fichier vers done/ si ce n'est pas deja fait.
- Apres la derniere tache terminee et verifiee, supprimer ce fichier: todo/execution_order.md.

## Processus obligatoire par tache

1. Identifier la prochaine tache non cochee la plus prioritaire dans l'ordre ci-dessous.
2. Resumer la tache a l'utilisateur.
3. Attendre sa validation explicite.
4. Executer la tache.
5. Lancer le test ou la verification obligatoire.
6. Produire le rapport d'avancement avec X/Y et Z%.
7. Si le fichier source todo est entierement solde, le deplacer vers done/.

## Gardes-fous transverses obligatoires

Sources principales:

- todo/cleanup_architecture/file_size_and_coding_standards_remediation.md

Ces regles s'appliquent a toutes les phases restantes ci-dessous:

- Reduire les gros fichiers au lieu de continuer a les etendre sans limite.
- Supprimer le code mort, duplique, deprecated, ou inatteignable decouvert pendant chaque tache.
- Ne pas creer de micro-fichiers, wrappers pass-through, proxies, ou couches artificielles.
- Verifier la taille, la cohesion, la factorisation, et la validation de tout fichier touche.
- Ne jamais considerer un refactor comme termine sans preuve de validation.

## Historique deja execute

### 1. Corrections critiques immediates eVe Intuition

Source principale:

- todo/urgent_priorities.md

- [x] Remplacer tout require() dans module ES, notamment tools/communication.js.
- [x] Deplacer mtraxCloseInFlightGuard avant toute utilisation dans eVeIntuition.js.
- [x] Unifier les prefixes de selection depuis runtime/selection.js.
- [x] Renommer ensureString en isString dans contracts/validator.js.
- [x] Ajouter destroyLayerInvariantObserver() et le connecter au cycle de destruction.
- [x] Verifier lint/build/smoke test apres chaque correction.

### 2. Factorisation minimale du socle

Source principale:

- todo/urgent_priorities.md

- [x] Creer shared/utils.js et migrer progressivement les utilitaires communs.
- [x] Creer shared/media_types.js et supprimer les duplications de types media.
- [x] Centraliser les constantes de layers et de TTL panels.
- [x] Factoriser le locking via runtime/in_flight_lock.js.
- [x] Unifier readExplicitLatchedState / readExplicitLatched.
- [x] Verifier les imports/exports et l'absence de duplication restante avec rg.

### 3. Contrat panel / layout eVe

Sources principales:

- todo/eve_features/update_panel_refactor.md
- todo/eve_features/panel_tools_above_footer_band.md
- todo/eve_features/panel_overflow_direction_indicators.md

- [x] Centraliser les tokens de chrome panel.
- [x] Finaliser createEveDialog avec header, body, tools band, footer.
- [x] Placer les outils de panel au-dessus du footer band.
- [x] Garder le footer comme bande finale avec titre, fermeture et resize grip.
- [x] Garantir que le body reste la seule zone scrollable.
- [x] Ajouter des indicateurs visibles de debordement haut/bas sur le vrai scroll container.
- [x] Migrer les panels simples avant les panels complexes.
- [x] Valider home/user, finder, communication, calendar et mtrack.

### 4. Molecule / MTraX deja engage - points deja valides

Sources principales:

- todo/molecule/molecule_sanitizer.md
- todo/media_handling/MTraX_edition.md
- todo/molecule/molecule_tests.md
- todo/molecule/molecule_trouble_solving.md
- todo/molecule/molecule_rename_mtrack_to_molecule.md

- [x] Construire les diagnostics globaux Molecule avant les corrections profondes.
- [x] Clarifier le contrat preview: interne par defaut, externalise uniquement si explicite.
- [x] Remplacer le layout tracks/cells par un layout responsive.
- [x] Fiabiliser le splitter pour qu'il ne deplace jamais le panel.
- [x] Retirer les styles globaux dangereux sur le host docke.
- [x] Simplifier les synchronisations layout.

Les points Molecule non termines sont repris plus bas dans l'ordre obligatoire restant.

## Ordre obligatoire des phases restantes

### Phase 1 - Gouvernance architecture Atome/eVe

Statut:

- [ ] Non commencee

Depend de:

- aucune phase restante

Sources principales:

- todo/cleanup_architecture/eve_atome_master_cleanup_plan.md

Objectif:

- Definir avec l'utilisateur l'architecture cible avant toute cartographie globale ou tout nouveau chantier structurel.

Regles obligatoires de cette phase:

- L'architecture cible Atome open / eVe closed doit etre definie avec la collaboration explicite de l'utilisateur.
- Cette phase doit etre terminee avant todo/ai_voice/eVe_MCP_APIS_Tools.md.
- La frontiere open/closed doit etre validee avant toute cartographie CODEMAP/API_MAP/ARCHITECTURE_MAP.

Taches:

- [ ] Valider avec l'utilisateur la frontiere open-source Atome / closed-source eVe.
- [ ] Valider les regles de classement: UI closed, tools closed, infrastructure de l'app open, security open, cross-platform open, server open.
- [ ] Identifier les dependances autorisees et interdites entre couches open et closed.
- [ ] Identifier les dossiers et modules a deplacer, scinder, ou proteger pour respecter cette architecture.
- [ ] Verifier que la structure cible est suffisamment stable pour devenir la base des cartographies futures.
- [ ] Produire un test ou une verification adaptee apres chaque sous-tache et un rapport d'avancement global.

### Phase 2 - Cartographie framework, APIs, code et MCP

Statut:

- [ ] Non commencee

Depend de:

- Phase 1 terminee et architecture validee avec l'utilisateur

Sources principales:

- todo/ai_voice/eVe_MCP_APIS_Tools.md
- todo/ai_voice/history_and_ai.md

Objectif:

- Cartographier correctement le framework, les APIs et les responsabilites du code a partir d'une architecture deja clarifiee.

Taches:

- [ ] Creer ou mettre a jour docs/CODEMAP.md apres validation de la phase 1.
- [ ] Creer ou mettre a jour docs/API_MAP.md apres validation de la phase 1.
- [ ] Creer ou mettre a jour docs/ARCHITECTURE_MAP.md apres validation de la phase 1.
- [ ] Lister les APIs publiques, semi-publiques, et internes sans hallucination ni doublon.
- [ ] Faire apparaitre explicitement la frontiere Atome open / eVe closed dans les maps.
- [ ] Rendre ces maps obligatoires avant toute nouvelle implementation.
- [ ] Produire un test ou une verification documentaire ciblee apres chaque sous-tache et un rapport d'avancement global.

### Phase 3 - Finalisation Molecule / MTraX

Statut:

- [ ] Partiellement commencee

Depend de:

- Phase 2 terminee

Sources principales:

- todo/molecule/molecule_sanitizer.md
- todo/media_handling/MTraX_edition.md
- todo/molecule/molecule_tests.md
- todo/molecule/molecule_trouble_solving.md
- todo/molecule/molecule_rename_mtrack_to_molecule.md

Taches:

- [ ] Traiter les bugs Molecule dans l'ordre du guide trouble solving.
- [ ] Ajouter ou mettre a jour les probes/tests Molecule.
- [ ] Inventorier les noms mtrack, mtrax, mtracks, hmtracks.
- [ ] Lancer le renommage progressif Molecule seulement apres stabilisation fonctionnelle.
- [ ] Garder les aliases legacy uniquement aux frontieres publiques documentees.

### Phase 4 - AV APIs / recording / preview

Statut:

- [ ] Non commencee

Depend de:

- Phase 2 terminee

Sources principales:

- todo/media_handling/AV_APIS.md
- todo/media_handling/video_recording_and_preview.md
- todo/media_handling/Mtracks_engine.md

Taches:

- [ ] Sortir l'extraction audio de conteneur video hors de bridge.rs.
- [ ] Retirer les ecritures disque du callback CPAL.
- [ ] Supprimer les allocations par callback dans le metering recorder.
- [ ] Encadrer ou supprimer les chemins debug Swift en production.
- [ ] Remplacer progressivement l'ancien chemin recorder C FFI AUv3.
- [ ] Stabiliser les frontieres publiques audio/video playback/recording/preview.

### Phase 5 - Partage / sync / Finder

Statut:

- [ ] Non commencee

Depend de:

- Phase 2 terminee

Sources principales:

- todo/sharing_search_monitoring/sharing_to_code.md
- todo/sharing_search_monitoring/finder.md
- todo/sharing_search_monitoring/finder_UI.md
- todo/communication_social/matrix_flower_context_menu.md

Taches:

- [ ] Reproduire le bug de partage Fastify vers Tauri et collecter les logs.
- [ ] Identifier la cause: receiverProjectId, parent_id, ou filtre loadProjectAtomes().
- [ ] Consolider getCurrentProjectId().
- [ ] Supprimer les fallbacks qui masquent les erreurs.
- [ ] Ajouter validation et erreurs claires pour les partages non lies.
- [ ] Stabiliser Finder apres correction du modele partage/projet.
- [ ] Ajouter le menu Flower contextuel Matrix apres stabilisation selection/command path.
- [ ] Verifier que Copy, Paste, Duplicate, Delete et Rename routent vers les vrais chemins runtime.

### Phase 6 - Migration V2 / cleanup large / performance

Statut:

- [ ] Non commencee

Depend de:

- Phase 2 terminee

Sources principales:

- todo/cleanup_architecture/v2_full_migration_framework.md
- todo/cleanup_architecture/framework_cleanup_and_ui_optimization_plan_2026-04-19.md
- todo/cleanup_architecture/deep_ux_performance_and_ios_boot_compliance.md

Taches:

- [ ] Supprimer progressivement les bridges eveGoeyMenuApi.
- [ ] Supprimer l'alias legacy new_menu.
- [ ] Normaliser les IDs tools en _intuition_v2_*.
- [ ] Nettoyer les APIs clone/outils legacy.
- [ ] Renommer les contrats V1 encore exposes.
- [ ] Migrer les cles de persistance *_v1.
- [ ] Ajouter les garde-fous CI anti regression V1.
- [ ] Nettoyer uniquement les artefacts generes confirmes comme jetables.
- [ ] Executer le plan deep UX/performance apres stabilisation des frontieres V2.

### Phase 7 - Auth, Apple Mail, notifications, calendar

Statut:

- [ ] Non commencee

Depend de:

- Phase 5 terminee

Sources principales:

- todo/communication_social/user_auth.md
- todo/communication_social/apple_mail_security.md
- todo/eve_features/Notification_tool.md
- todo/eve_features/calendar_todos.md

Taches:

- [ ] Completer les points production auth critiques.
- [ ] Valider les contraintes Apple Mail IMAP/CalDAV.
- [ ] Stabiliser le systeme de notifications.
- [ ] Ajouter vue semaine, recherche et preferences calendar.

### Phase 8 - IA vocale / MCP / editor / runtime

Statut:

- [ ] Non commencee

Depend de:

- Phase 2 terminee
- Phase 7 terminee pour les dependances mail/auth/calendar
- Phase 6 suffisamment stable pour eviter de brancher l'IA sur des surfaces legacy en cours de migration

Sources principales:

- todo/ai_voice/AI_integration_problems_to_solve.md
- todo/ai_voice/AI_Integration.md
- todo/ai_voice/eVe_AI.md
- todo/ai_voice/eVe_code_editor.md
- todo/ai_voice/Full_vocal_AI_integration.md
- todo/ai_voice/MCP_voice_control.md
- todo/ai_voice/voice_recognition.md

Taches:

- [ ] Stabiliser le contrat semantique mail.
- [ ] Stabiliser la memoire de session.
- [ ] Stabiliser le transport Tauri/mail.
- [ ] Ajouter une couche robuste d'interpretation STT.
- [ ] Etendre le meme modele a contacts et calendar.
- [ ] Etendre le meme modele aux outils Atome.
- [ ] Integrer l'editeur code/MCP sur une base architecturelle stable.
- [ ] Ajouter tests semantiques, orchestrateur et E2E Tauri.

### Phase 9 - Chantiers produits differables

Statut:

- [ ] Non commences

Depend de:

- Toutes les phases structurelles precedentes suffisamment stables

Sources principales:

- todo/midi/atome_midi_binding_system.md
- todo/midi/Midi_implementation.md
- todo/rendering_graphics/vector_editing_layer.md
- todo/rendering_graphics/universal_canvas.md
- todo/dev_ops/install_MediaSoup.md
- todo/communication_social/social_network_tool.md
- todo/eve_features/presets-system.md
- todo/dev_ops/api-sugar.md
- todo/dev_ops/npm-publication-checklist.md
- todo/dev_ops/rewrite_documentation.md
- todo/dev_ops/eve_website_publishing.md

Taches:

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

## Fichiers de todo hors ordre actif

Les fichiers suivants existent dans ./todo mais ne doivent pas etre traites tant qu'ils ne sont pas rattaches explicitement a une phase ci-dessus:

- todo/eve_features/eve_accessibility.md
- todo/eve_features/menu_interactions.md
- todo/planning_audit/eve_intuition_technical_audit.md
- todo/cleanup_architecture/eVe_optiisations.md
- todo/sharing_search_monitoring/Share_tool.md
- todo/sharing_search_monitoring/tool_monitor.md
- todo/sharing_search_monitoring/tools_monitoring.md
- todo/communication_social/mail.md
- todo/communication_social/matrix.md
- todo/dev_ops/developer-experience.md

Si un de ces fichiers devient necessaire, il doit etre ajoute ici avant execution.

## Fin

- [ ] Toutes les phases ci-dessus sont terminees.
- [ ] Toutes les validations finales sont passees.
- [ ] Tous les fichiers todo soldes ont ete deplaces vers done/.
- [ ] Supprimer ce fichier: todo/execution_order.md.
