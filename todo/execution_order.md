# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

## Nature du document

Ce fichier est l'ordre d'execution autoritatif des taches actives de ./todo.

Status: Canonical execution order. This file is the authoritative sequencing and scope registry for every active todo document.

Il ne doit plus etre interprete comme une simple liste indicative.

Regle de perimetre:

- Seuls les fichiers todo explicitement cites dans ce document peuvent etre executes.
- Tout fichier present dans ./todo mais absent de ce document est hors ordre actif.
- Un fichier absent ne doit pas etre traite tant qu'il n'a pas ete ajoute ici avec sa phase, ses dependances, ses criteres de sortie, et sa validation utilisateur.

Rendering decision locked by the product owner:

- Bevy/WebGPU is the only supported product renderer.
- The project uses one shared rendering pipeline and one visible canvas per active rendering zone.
- No alternate renderer, parallel media compositor, compatibility renderer, or silent runtime substitution may be added.

Document status vocabulary:

- `Termine verifie`: implemented behavior backed by current evidence.
- `Actif`: executable unfinished work with an explicit exit criterion.
- `Partiel`: a verified implemented subset plus a precise executable remainder.
- `Bloque`: unfinished work whose stated validation cannot currently run or whose required external decision is unavailable.
- `Obsolete`: retained only as a migration record and never used as an implementation authority.
- `Specification`: target contract or design decision that is not executable until registered as active work.

Checkboxes are reserved for executable work and final executable validation gates. Phase lifecycle labels are plain text derived from their child tasks and are not included in progress totals.

### Reconciliation audit - original 138-entry snapshot

Statut:

Termine verifie

Sources principales:

- todo/execution_order.md
- todo/audits/2026-07-14_framework_documentation_conformance.md
- done/obsolete/eVe_optimisations.md
- todo/cleanup_architecture/file_size_inventory_2026-07-14.md
- todo/dev_ops/developer-experience.md
- todo/molecule/PROJET_MOLECULE_DEBUG.md
- done/molecule/molecule-status-2026-04-28.md
- todo/rendering_graphics/robust_bevy_regression_fix_prompt_en.md
- todo/sharing_search_monitoring/tool_monitor.md
- done/obsolete/tools_monitoring.md
- todo/tests/
- todo/ui_bevy/

- [x] Auditer et reconcilier le snapshot original des 138 entrees, classifier tous les documents todo, produire la preuve entree par entree et installer le controle permanent `npm run check:execution-order`.

Critere de sortie:

- Les 138 entrees originales ont une decision tracable, chaque document todo est enregistre ou explicitement classe, et le controle permanent reproduit le total et passe avec ses tests.

### Phase 0 - Documentation and architecture normalization

Status:

Termine verifie

Scope completed:

- [x] Retire the obsolete pre-Bevy media-editor specification from the active architecture.
- [x] Remove audio/video fallback language and describe browser capture as an explicit backend where it is supported.
- [x] Mark timeline, AV, recording, and export documents with explicit status semantics.
- [x] Add the professional export contract: editable project package, open archival master, delivery export, deterministic rendering, checkpointed resume, atomic publication, and final validation.
- [x] Register the relevant timeline, media, rendering, AI, sharing, test, and product todo families in the phase sources below.

## Regles de pilotage

- Cocher chaque tache terminee avec [x].
- Ne pas commencer une phase dependante tant que ses prerequis ne sont pas totalement valides.
- Avant chaque tache, effectuer un controle de coherence court et strictement limite aux
  instructions, documentations, maps et todo directement applicables a cette tache.
- Ne remonter a l'utilisateur que les conflits materiels qui modifieraient le
  comportement produit, l'architecture, la securite, le perimetre ou le critere de
  sortie. Les differences de formulation, raffinements non bloquants, details
  d'implementation et questions pouvant etre resolues pendant l'analyse technique ne
  doivent pas interrompre l'execution.
- Regrouper les conflits materiels connus de la tache en une seule demande de decision,
  avec une recommandation concise et au maximum les choix reellement necessaires. Apres
  la decision, mettre les sources concernees en coherence puis executer la tache.
- Ce controle prealable ne doit jamais devenir un nouvel audit exhaustif du depot. Il
  s'arrete des que les sources directement applicables sont coherentes. Un conflit
  decouvert plus tard n'interrompt la tache que s'il rend l'implementation en cours
  incorrecte ou dangereuse.
- Avant chaque nouvelle tache, dire explicitement a l'utilisateur ce qui doit etre fait sur cette tache, quels fichiers sources sont concernes, quelles dependances s'appliquent, quels tests ou verifications sont prevus, et quel est le pourcentage de taches accomplies sur le total.
- Ce point d'etape doit etre donne avant l'execution de la tache.
- Aucune nouvelle tache ne demarre sans validation explicite de l'utilisateur.
- Chaque tache terminee doit etre suivie d'au moins un test, une verification, ou un controle cible adapte a la tache.
- Chaque cloture de tache doit produire un rapport avec: tache realisee, validation executee, resultat, nombre de taches accomplies sur le total, et pourcentage d'avancement global.
- Le pourcentage d'avancement global se calcule sur le total des cases a cocher de ce fichier.
- Toute tache ouverte herite obligatoirement des criteres de sortie et de la Definition of Done de ses sources principales. Si la ligne fournit un critere plus precis, ce critere s'ajoute au contrat source. Une tache sans source verifiable, sans resultat observable ou sans validation ciblee ne peut pas etre cloturee.
- Toute nouvelle sous-tache decouverte en cours de route doit etre ajoutee ici avant execution si elle modifie l'ordre ou le perimetre.
- Une fois toutes les taches d'un fichier todo/*.md accomplies et verifiees, deplacer ce fichier vers done/ si ce n'est pas deja fait.
- Apres la derniere tache terminee et verifiee, supprimer ce fichier: todo/execution_order.md.

## Processus obligatoire par tache

1. Identifier la prochaine tache non cochee la plus prioritaire dans l'ordre ci-dessous.
2. Effectuer le controle de coherence cible des seules sources directement applicables.
3. Si un conflit materiel existe, le regrouper et demander une decision concise avant
   implementation; sinon ne pas interrompre le flux.
4. Dire a l'utilisateur ce qui doit etre fait sur la tache, les fichiers sources concernes, les dependances, les tests prevus, et le pourcentage de taches accomplies sur le total.
5. Attendre sa validation explicite.
6. Executer la tache.
7. Lancer le test ou la verification obligatoire.
8. Produire le rapport d'avancement avec X/Y et Z%.
9. Si le fichier source todo est entierement solde, le deplacer vers done/.

Baseline after the 2026-07-13 renderer-decision cleanup: 61/138 checked tasks (44.20%). Historical progress reports below retain the totals recorded at their original completion date.

Reconciled state after the 2026-07-16 audit and subsequent documentation decisions: 61/148 executable tasks checked (41.22%). The current denominator includes the completed reconciliation, the WebSocket-only transport decision, secure browser/native authentication-token storage remediation, the OVHcloud production SMS provider boundary, stable user identity independent of phone, explicit cross-runtime account provisioning with preserved isolated guest mode, Argon2id migration of legacy bcrypt password verifiers, trusted-device and Recovery-Kit account recovery, snapshot-accelerated rebuild, two ordered Time Machine historical-branching tasks, reopened `/ws/sync` security validation, persistent sender auto-accept UI, true manual-linked sharing, append-only last-write-wins offline conflict handling, and private-by-default directory contact data. The full original 138-entry decision ledger remains `done/planning_audit/execution_order_reconciliation_2026-07-16.md`.

## Gardes-fous transverses obligatoires

Sources principales:

- todo/cleanup_architecture/file_size_and_coding_standards_remediation.md

Ces regles s'appliquent a toutes les phases restantes ci-dessous:

- Reduire les gros fichiers au lieu de continuer a les etendre sans limite.
- Supprimer le code mort, duplique, deprecated, ou inatteignable decouvert pendant chaque tache.
- Rechercher et reduire le code mort, inoperant, fragile, trompeur, ou structurellement problematique quand il est confirme par l'audit local.
- Ne pas creer de micro-fichiers, wrappers pass-through, proxies, ou couches artificielles.
- Verifier via les maps qu'aucune logique similaire n'est maintenue a deux endroits sans justification.
- Reduire les annotations, commentaires, et explications verbeuses qui n'apportent pas de valeur durable.
- Verifier la taille, la cohesion, la factorisation, et la validation de tout fichier touche.
- Simplifier au maximum le code touche sans supprimer de fonctionnalite ni casser l'application.
- Ne jamais considerer un refactor comme termine sans preuve de validation.

## Historique deja execute

### 1. Corrections critiques immediates eVe Intuition

Source principale:

- done/urgent_task.md (historical source; no active work)

- [x] Remplacer tout require() dans module ES, notamment tools/communication.js.
- [x] Deplacer mtraxCloseInFlightGuard avant toute utilisation dans eVeIntuition.js.
- [x] Unifier les prefixes de selection depuis runtime/selection.js.
- [x] Renommer ensureString en isString dans contracts/validator.js.
- [x] Ajouter destroyLayerInvariantObserver() et le connecter au cycle de destruction.
- [x] Verifier lint/build/smoke test apres chaque correction.

### 2. Factorisation minimale du socle

Source principale:

- done/urgent_task.md (historical source; no active work)

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

### Phase 2 bis - Migration exclusive du transport métier Atome vers WebSocket

Statut:

Actif

Depend de:

- Phase 2 terminee

Sources principales:

- done/websocket_only_atome_transport.md
- todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md
- todo/cleanup_architecture/stable_user_identity_independent_of_phone.md
- todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md
- todo/cleanup_architecture/argon2id_password_hash_migration.md
- todo/cleanup_architecture/production_sms_provider_boundary.md
- todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md
- todo/cleanup_architecture/secure_auth_token_storage.md
- eVe/documentations/atome_persistence_contract.md
- atome/documentations/CRUD_apis.md
- maps/API_MAP.md
- maps/ARCHITECTURE_MAP.md

Objectif:

- Faire de `/ws/api` l'unique transport des operations applicatives et métier Atome sur Fastify, Tauri et les plateformes supportees, sans fallback HTTP. HTTP reste limite au bootstrap/configuration/sante et au transfert de ressources ou fichiers binaires explicitement documente.

Taches:

- [x] Migrer toutes les operations Atome métier vers `/ws/api`, securiser `/ws/sync` par authentification et filtrage des permissions, implementer les actions WebSocket manquantes, retirer les lectures/ecritures HTTP et leurs fallbacks, puis valider la parite Fastify/Tauri/iOS et installer des garde-fous permanents; critere de sortie: tous les criteres et tests de `done/websocket_only_atome_transport.md` et `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md` passent.
- [ ] Migrer l'identite utilisateur vers un principal opaque, immuable et independant du telephone: separer les alias de connexion/recherche, supprimer toute derivation ou prediction d'identifiant depuis un numero, migrer atomiquement les comptes existants et toutes leurs references, puis valider changement, suppression et reattribution du telephone sans perte ni transfert de donnees; critere de sortie: tous les criteres et tests de `todo/cleanup_architecture/stable_user_identity_independent_of_phone.md` passent.
- [ ] Remplacer la creation implicite de shadow users par un provisionnement Tauri/Fastify explicite et securise, tout en conservant `Essayer` comme espace invite local/prive a principal opaque isole et avec adoption transactionnelle optionnelle lors de la creation ou liaison d'un compte; critere de sortie: tous les criteres et tests de `todo/cleanup_architecture/explicit_cross_runtime_account_provisioning.md` passent.
- [ ] Migrer les verificateurs de mot de passe Fastify/Tauri/iOS vers Argon2id: ne creer que des hashes Argon2id, verifier les anciens bcrypt uniquement pour migration, les remplacer atomiquement apres connexion reussie, imposer 15 points de code Unicode minimum et au moins 64 acceptes avec espaces sans regles de composition, refuser les secrets compromis de facon respectueuse de la confidentialite, puis borner memoire/concurrence; critere de sortie: tous les criteres et tests de `todo/cleanup_architecture/argon2id_password_hash_migration.md` passent.
- [ ] Implementer la frontiere OVHcloud SMS de production apres une requete `/ws/api`: raccorder le point d'extension `sendSMS()` a un compte OVHcloud restreint, conserver protocoles et secrets exclusivement dans l'adaptateur serveur, interdire tout fallback automatique, remplacer `Math.random()` et les stores process-locaux par un OTP cryptographiquement sur et un defi temporaire PostgreSQL consomme atomiquement, sans OTP persiste en clair ni entree Atome/historique/sync, appliquer des limitations progressives multidimensionnelles sans verrouillage global du compte, puis journaliser les evenements de securite avec references opaques, empreinte reseau HMAC rotative, client normalise et retention automatique de six mois sans IP/user-agent complets; critere de sortie: tous les criteres et tests de `todo/cleanup_architecture/production_sms_provider_boundary.md` passent.
- [ ] Remplacer atomiquement la recuperation SMS seule par SMS plus cle d'appareil autorise, ou SMS plus Recovery Kit lorsque l'appareil est perdu, avec changement de telephone securise, delais/notifications, revocation complete et maintien du chemin actuel jusqu'a validation du remplacement; critere de sortie: tous les criteres et tests de `todo/cleanup_architecture/account_recovery_trusted_device_and_recovery_kit.md` passent.
- [ ] Supprimer tout stockage ou chargement de bearer tokens lisibles depuis `localStorage` ou `sessionStorage`, conserver les sessions navigateur dans des cookies HttpOnly et les secrets natifs dans le credential store ou coffre chiffre approuve, nettoyer les anciennes cles sans les reutiliser, puis installer un garde-fou permanent; critere de sortie: tous les criteres et tests de `todo/cleanup_architecture/secure_auth_token_storage.md` passent.

### Phase 2 ter - Reconstruction acceleree de state_current par snapshot

Statut:

Actif

Depend de:

- Phase 2 bis terminee pour exposer les operations et diagnostics par le transport canonique

Sources principales:

- todo/cleanup_architecture/snapshot_accelerated_state_rebuild.md
- eVe/documentations/atome_persistence_contract.md
- atome/documentations/database_architecture.md
- eVe/documentations/Atome Time Machine.md
- maps/API_MAP.md
- maps/ARCHITECTURE_MAP.md

Objectif:

- Implementer une reconstruction sure et deterministe de `state_current` depuis un snapshot de confiance et le seul suffixe d'evenements posterieur, sans autoriser la suppression ou l'archivage destructif des evenements avant validation complete.

Taches:

- [ ] Implementer et valider la reconstruction acceleree snapshot + curseur d'evenements + replay du suffixe, avec comparaison au replay complet et garde-fou anti-suppression; critere de sortie: toutes les exigences et validations de `todo/cleanup_architecture/snapshot_accelerated_state_rebuild.md` passent.

### Phase 2 quater - Time Machine historical branching

Statut:

Actif

Depend de:

- Phase 2 bis terminee pour disposer du transport canonique des branches, historiques, snapshots et restaurations
- Phase 2 ter terminee pour disposer d'une reconstruction snapshot + suffixe fiable avant d'introduire les branches

Sources principales:

- todo/ai_voice/time_machine_historical_branching.md
- todo/ai_voice/history_and_ai.md
- eVe/documentations/Atome Time Machine.md
- maps/API_MAP.md
- maps/ARCHITECTURE_MAP.md

Objectif:

- Etendre le replay append-only existant avec une edition historique sur branche persistante, sans modifier l'historique original et sans commencer l'implementation avant validation explicite du modele de branches.

Taches:

- [ ] Definir puis faire valider par l'utilisateur le modele Time Machine de branches, divergence, recomputation, conflits, fusion, abandon, permissions, synchronisation, snapshots et presentation; critere de sortie: le contrat versionne satisfait la Task 1 de `todo/ai_voice/time_machine_historical_branching.md`.
- [ ] Implementer l'edition historique avec branches et replay avant deterministe uniquement apres validation du modele; critere de sortie: toutes les exigences et validations de la Task 2 de `todo/ai_voice/time_machine_historical_branching.md` passent sur Fastify, Tauri et les plateformes supportees.

### Phase 3 ter - Product UI Bevy migration and DOM retirement

Statut:

Partiel

Depend de:

- Phase 3 terminee

Sources principales:

- todo/ui_bevy/
- todo/cleanup_architecture/system_ui_component_ssot.md
- todo/cleanup_architecture/v2_full_migration_framework.md
- todo/eve_features/menu_interactions.md
- todo/eve_features/calendar_todos.md
- todo/eve_features/map_localization.md
- todo/communication_social/matrix_flower_context_menu.md
- todo/rendering_graphics/robust_bevy_regression_fix_prompt_en.md

Objectif:

- Construire le socle UI Bevy unique, migrer les surfaces produit visibles, puis supprimer leurs routes HTML/DOM, Intuition/View et bridges devenus inutiles. Le navigateur ne conserve que le shell minimal et les services caches autorises pour texte/accessibilite/IME.

Taches:

- [x] Completer et valider les primitives BevyUI partagees manquantes et leurs interactions reelles, sans remigrer le dashboard ni le menu direct deja rendus par Bevy.
- [x] Migrate the bottom Bevy main menu interaction model: direct actions, expandable palettes, latch state, dedicated hold actions, hold-to-palette, drag cancellation, and removal of the flattened legacy projection.
- [x] Repair the bottom Bevy main-menu palette opening regression at its canonical direct-motion owner: restore immediate first-frame presentation, the historical 180/70/120 ms elastic rebound, shared icon/label/accent movement, and validate real WebGPU clicks frame by frame without reconciliation fallback or duplicate animation path.
- [x] Migrate the Flower hold contract: held-pointer palette opening, immediate Back navigation, leaf preview followed by activation on release, and cancellation safety.
- [x] Delete Flower/menu/toolbox DOM bridges, aliases, factories, and browser-only state once the complete Bevy interaction contract is verified and no canonical consumer remains.
- [x] Confirmer le Dashboard fonctionnel rendu par Bevy: ouverture, fermeture, scroll, glissement, edition des libelles et absence d'arbre Dashboard DOM visible.
- [ ] Ajouter le contexte Flower Matrix avec la tuile cible ou selectionnee et exactement Copy, Paste, Duplicate, Delete et Rename; critere de sortie: clic droit et appui long ouvrent le Flower canonique sur la bonne tuile, sans proxy DOM.
- [ ] Relier les cinq actions Flower Matrix aux vrais chemins runtime et desactiver visiblement toute action indisponible; critere de sortie: chaque commande modifie la cible attendue ou retourne un etat desactive explicite, avec tests cibles.
- [ ] Corriger ou formaliser l'ecart vertical de 0,5 px des previews Dashboard; critere de sortie: le contrat `dashboard_records` et le rendu accepte utilisent la meme regle d'arrondi.
- [ ] Clore les notes de regression drag/lasso encore ouvertes dans `robust_bevy_regression_fix_prompt_en.md`; critere de sortie: priorite des gestes et selection lasso passent leurs interactions reelles et contrats cibles.
- [ ] Migrer les panels/dialogs et leur infrastructure commune, puis supprimer les factories, observateurs layout et lectures de geometrie DOM devenus inutiles; le chrome Molecule reste execute en Phase 4 apres sa stabilisation fonctionnelle.
- [ ] Realiser l'audit calendrier et implementer sa projection Bevy sans dupliquer CalendarAPI, recurrence, alarmes, todos ou fuseaux horaires.
- [ ] Realiser l'audit map/localisation, valider le provider et la confidentialite, puis implementer la scene Bevy sans Leaflet ni widget DOM embarque.
- [ ] Inventorier puis supprimer toutes les couches visibles Intuition/View/DOM devenues sans consommateurs apres migration.
- [ ] Valider Web, Tauri et iOS sur le meme contrat scene/diff/interactions, avec erreurs typees pour les capacites indisponibles.

Progress report Phase 3 ter — Flower hold contract:

- Completed the Bevy Flower tree and captured-pointer interaction contract. Stationary hold release is passive; palette and Back navigation occur during the held session; leaves activate once on release; cancellation clears the session without committing a tool action.
- Retired the visible Flower DOM renderer and its direct production export. `new_menu_v2` remains active because verified consumers still use its menu API; its removal is a separate pending migration task.
- Validation passed: focused Flower tests, main-menu BevyUI tests, `npm run check:syntax`, `npm run check:no-fallbacks`, and `npm run check:dom-projection-guardrails`.
- Global progress: 62/138 checked tasks, 44.92%.

Progress report Phase 3 quater — BevyUI browser bridge retirement:

- Replaced browser menu/Flower aliases and pointer-state globals with a lightweight internal per-window registry; the product compositor now registers BevyUI menu and Flower instances without exposing them on `window`.
- Deleted the DOM main-menu/Flower factories and obsolete bridge/guard modules, migrated geometry and login docking consumers to BevyUI measurements, and removed the Dashboard DOM toolbox fallback.
- Updated focused tests, Playwright guidance, architecture/API/design/code maps, and added a production-source regression scan against retired aliases and Flower browser state.
- Validation passed: 29 focused Vitest contracts, Flower/selection/layer/capture/login probes, `npm run check:syntax`, `npm run check:no-fallbacks`, `npm run check:dom-projection-guardrails`, and both root/eVe diff checks.
- Global progress: 63/138 checked tasks, 45.65%.

### Phase 1 - Gouvernance architecture Atome/eVe

Statut:

Termine verifie

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

- [x] Valider avec l'utilisateur la frontiere open-source Atome / closed-source eVe.
- [x] Valider les regles de classement: UI closed, tools closed, infrastructure de l'app open, security open, cross-platform open, server open.
- [x] Identifier les dependances autorisees et interdites entre couches open et closed.
- [x] Identifier les dossiers et modules a deplacer, scinder, ou proteger pour respecter cette architecture.
- [x] Verifier que la structure cible est suffisamment stable pour devenir la base des cartographies futures.
- [x] Executer les deplacements, scissions, et protections structurels valides avant toute cartographie future.
- [x] Produire un test ou une verification adaptee apres chaque sous-tache et un rapport d'avancement global.

Contrainte validee:

- Les deplacements, scissions, et protections identifies dans cette phase ne doivent pas etre repousses a une phase lointaine: ils doivent etre prepares maintenant par inventaire exact, puis executes des que la structure cible est validee, au plus tard dans la tache suivante compatible avec la regle interdisant toute execution structurelle avant validation explicite de l'architecture cible.

Structure cible validee:

- atome/: couche open contenant core framework, APIs, contrats, runtime partage, securite, server, sync, plateformes, engines, et assets generiques.
- eve/: couche closed contenant UI produit, tools produit, workflows eVe, composition produit, branding, et packaging prive.
- tests/: validations separees par cible atome, eve, et integration.
- documentations/: documentation separee par ownership et cartographies futures.
- temp/: seul emplacement autorise pour probes, sorties temporaires, scripts de diagnostic jetables, et artefacts temporaires.
- dist/ ou dossiers build dedies: uniquement artefacts generes, jamais source maintenue.

Execution structurelle en cours:

- Deplacements effectues: src/shared vers atome/shared, src/application/security vers atome/security, eVe vers eVe.
- Chemins historiques actifs eVe, src/shared, et src/application/security retires des sources filtrees hors artefacts generes.
- src/squirrel a ete remappe sous atome/src/squirrel; les dependances directes vers eVe des modules explicitement listes ont ete scindees ou protegees avant classement open strict.
- Modules src/squirrel a scinder ou proteger avant migration open stricte: src/squirrel/ai/default_tools.js, src/squirrel/ai/default_tools.runtime_trace_integration.test.mjs, src/squirrel/ai/model_catalog_refresh.js, src/squirrel/ai/provider_client.js, src/squirrel/calendar/bootstrap.js, src/squirrel/calendar/calendar_api_source.js, src/squirrel/mail/bootstrap.js, src/squirrel/voice/ai_planner.js, src/squirrel/voice/aVa_panel.js, src/squirrel/voice/home_surface.js, src/squirrel/voice/home_surface.locale_history.test.mjs, src/squirrel/components/intuition_builder/index.js.
- Validation passee: npm run check:syntax.
- Validation passee: npm run check:no-fallbacks.
- Execution finale passee: les imports directs Atome -> eVe ont ete retires des modules atome/src/squirrel explicitement listes; les integrations produit passent maintenant par injections runtime, globals installes, ou module closed eVe dedie.
- Deplacement/scission passee: atome/src/squirrel/voice/aVa_panel.js a ete retire de la couche Atome et reinstalle dans eVe/voice/aVa_panel.js, charge par eVe/eVe.js.
- Protection passee: atome/src/squirrel/components/intuition_builder/layer_contract.js isole le contrat minimal de layer flottant necessaire au builder Atome sans import closed eVe.
- Protection passee: atome/src/squirrel/ai/profile_loader.js centralise la lecture injectee du profil utilisateur sans import closed eVe.
- Verification passee: rg sur atome/src/squirrel/ai, calendar, mail, voice et components/intuition_builder ne trouve plus d'import direct vers eVe.
- Verification passee: git submodule status eVe conserve le gitlink eVe actif; .git/modules/eVe/config core.worktree vaut ../../../eVe.
- Validations passees: npm run check:syntax; npm run check:no-fallbacks; node atome/src/squirrel/ai/default_tools.runtime_trace_integration.test.mjs; node atome/src/squirrel/voice/main_handle_bridge.import_bootstrap.test.mjs; node atome/src/squirrel/voice/main_handle_bridge.test.mjs; node atome/src/squirrel/voice/home_surface.locale_history.test.mjs; node --test atome/src/application/audio_runtime/play_record_core.test.mjs; node --test atome/src/squirrel/ai/provider_client.test.mjs; node --test atome/src/squirrel/ai/model_catalog_refresh.test.mjs; node --test atome/src/squirrel/calendar/bootstrap.test.mjs atome/src/squirrel/calendar/calendar_api_source.test.mjs; node --test atome/src/squirrel/voice/ai_planner.test.mjs atome/src/squirrel/voice/home_surface.test.mjs; node --check eVe/voice/aVa_panel.js.
- Rapport d'avancement Phase 1: tache realisee, validations executees et reussies, 34/118 taches cochees, avancement global 28.81%.
- Note de perimetre: les references eVe restantes dans atome/src/application/index.js et atome/src/squirrel/kickstart.js sont des points de bootstrap/version produit; atome/src/application/audio_runtime/av_api_boundaries.test.mjs reste un test d'integration AV avec eVe a traiter dans la phase AV dediee.

### Phase 2 - Cartographie framework, APIs, code et MCP

Statut:

Termine verifie

Depend de:

- Phase 1 terminee et architecture validee avec l'utilisateur

Sources principales:

- todo/ai_voice/eVe_MCP_APIS_Tools.md
- todo/ai_voice/history_and_ai.md

Objectif:

- Cartographier correctement le framework, les APIs et les responsabilites du code a partir d'une architecture deja clarifiee.

Taches:

- [x] Creer ou mettre a jour maps/CODEMAP.md apres validation de la phase 1.
- [x] Creer ou mettre a jour maps/API_MAP.md apres validation de la phase 1.
- [x] Creer maps/DESIGN_MAP.md pour cartographier le design JavaScript, les tokens, les factories visuelles, les styles injectes, les assets, et les exceptions CSS generees ou vendorisees.
- [x] Creer ou mettre a jour maps/ARCHITECTURE_MAP.md apres validation de la phase 1.
- [x] Lister les APIs publiques, semi-publiques, et internes sans hallucination ni doublon.
- [x] Faire apparaitre explicitement la frontiere Atome open / eVe closed dans les maps.
- [x] Rendre ces maps obligatoires avant toute nouvelle implementation.
- [x] Produire un test ou une verification documentaire ciblee apres chaque sous-tache et un rapport d'avancement global.

Rapports d'avancement Phase 2:

- CODEMAP: creation de maps/CODEMAP.md comme carte operationnelle du codebase; validation par controle des references maps/docs, presence du fichier, sections documentaires obligatoires; resultat reussi; avancement 35/118, soit 29.66%.
- API_MAP: creation de maps/API_MAP.md comme carte initiale des familles d'APIs verifiees; validation par controle de taille, presence, sections/frontieres rg, inspection ciblee des exports, globals, routes HTTP/WebSocket, et APIs bootstrap; resultat reussi; avancement 36/118, soit 30.51%.
- DESIGN_MAP: creation de maps/DESIGN_MAP.md comme carte du design JavaScript, tokens, factories, styles injectes, assets, et exceptions CSS framework/vendor/build; validation par controle de taille, sections rg, inventaire CSS, inspection des modules eVe/elements, eVe/intuition, eVe/domains/mtrax, atome/src/squirrel/components, atome/src/assets; resultat reussi; avancement 37/118, soit 31.36%.
- ARCHITECTURE_MAP: creation de maps/ARCHITECTURE_MAP.md comme contrat de couches, directions de dependance, modes runtime, flux de mutation, separation UI/API/MCP/storage/sync, regles de placement et zones To verify; validation par controle de taille, sections rg obligatoires, references aux maps et documents sources, et existence des chemins documentaires references; resultat reussi; avancement 38/118, soit 32.20%.
- API visibility inventory: mise a jour de maps/API_MAP.md avec inventaire classe Public, Semi-public, Internal, et Status: To verify; validation par extraction rg des exports, globals, routes Fastify/WebSocket, points runtime eVe, services Atome, stores eVe, MCP/AI/voice/audio, correction des entrees non confirmees SelectionAPI et AtomeAI, et controle rg des sections/statuts; resultat reussi; avancement 39/118, soit 33.05%.
- Explicit open/closed boundary: updated maps/CODEMAP.md, maps/API_MAP.md, maps/DESIGN_MAP.md, and maps/ARCHITECTURE_MAP.md with explicit Atome open / eVe closed boundary contracts covering ownership, dependency direction, API exposure, design ownership, promotion rules, and boundary debt; validation by targeted rg checks for the new contract sections and cross-map references; result passed; progress 40/118, 33.90%.
- Mandatory pre-implementation map gate: updated maps/CODEMAP.md, maps/API_MAP.md, maps/DESIGN_MAP.md, and maps/ARCHITECTURE_MAP.md with explicit mandatory pre-implementation gates defining which map must be consulted before code, API, design, architecture, runtime, persistence, sync, MCP, tool, UI, security, or cross-layer work; validation by targeted rg checks for the new gate sections and cross-map references; result passed; progress 41/118, 34.75%.
- Phase 2 final documentary verification: verified that maps/CODEMAP.md, maps/API_MAP.md, maps/DESIGN_MAP.md, and maps/ARCHITECTURE_MAP.md exist and contain Mandatory Use sections, Mandatory Pre-Implementation Gate sections, explicit Atome open / eVe closed boundary contracts, cross-map references, and Phase 2 progress reports; corrected the two legacy Phase 2 progress totals from 115 to the current 118-task total; validation by targeted rg checks, map existence checks, and global checkbox recount; result passed; Phase 2 completed; progress 43/118, 36.44%.

### Phase 3 - Audit strict de securite framework / resolution des failles

Statut:

Partiel

Depend de:

- Phase 2 terminee

Sources principales:

- done/planning_audit/framework_security_audit_and_vulnerability_remediation.md
- todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md
- todo/cleanup_architecture/eve_atome_master_cleanup_plan.md
- todo/communication_social/user_auth.md
- todo/communication_social/apple_mail_security.md
- todo/sharing_search_monitoring/Share_tool.md
- todo/ai_voice/MCP_voice_control.md
- done/ai_voice/Full_vocal_AI_integration.md

Objectif:

- Mener un audit de securite strict, hautement sensible, et tres approfondi sur tout le framework, puis resoudre les failles identifiees selon leur severite avant de poursuivre les autres chantiers.

Regles obligatoires de cette phase:

- L'audit couvre l'ensemble du framework, pas seulement un sous-systeme isole.
- Les surfaces client, runtime, MCP, bridge, stockage, reseau, serveur, auth, permissions, sync, et natif doivent etre auditees.
- Les failles critiques et hautes doivent etre resolues avant de passer aux phases suivantes.
- Les failles moyennes doivent etre soit corrigees, soit documentees avec proprietaire, impact, mitigation, et plan d'action explicite.
- Aucun resultat d'audit ne doit etre masque par un fallback, un silence, ou une simple note cosmetique.
- La cloture de phase exige des validations de securite ciblees et un rapport explicite des risques restants.

Taches:

- [x] Inventorier toutes les surfaces de securite du framework: filesystem, reseau, websocket, bridges JS/natifs, tokens, secrets, permissions, stockage, MCP, sync, server, sandbox, et imports dynamiques.
- [x] Verifier en profondeur les risques de fuite de secrets, d'injection de commande, de traversal de chemin, d'elevation de privilege, de bypass de permissions, de bridge trop permissif, et de payloads non valides.
- [x] Auditer les flux auth, user preferences sensibles, token storage, journalisation, rate limiting, et separation des donnees utilisateur.
- [x] Auditer les surfaces MCP et IA pour confirmer l'absence de raccourcis dangereux, de mutations non autorisees, et de contournements du pipeline canonique.
- [x] Prioriser les failles par severite: critique, haute, moyenne, basse.
- [x] Corriger toutes les failles critiques et hautes avant de poursuivre.
- [x] Documenter clairement les failles restantes avec impact, proprietaire, plan de remediation, et justification si elles ne sont pas corrigees immediatement.
- [x] Produire des tests et verifications de securite cibles apres chaque correction sensible.
- [x] Produire un rapport d'audit et de resolution des failles avec avancement global avant cloture de phase.
- [ ] Revalider la cloture securite apres authentification et cloisonnement de `/ws/sync`; critere de sortie: les connexions anonymes sont refusees avant `welcome`, les evenements Atome, comptes et fichiers sont limites aux permissions et capacites du principal, et tous les tests de `todo/cleanup_architecture/authenticated_permission_scoped_ws_sync.md` passent.

Rapports d'avancement Phase 3:

- The original Phase 3 security audit and remediation report remains the historical record in `done/planning_audit/framework_security_audit_and_vulnerability_remediation.md`.
- The 2026-07-16 documentation/code reconciliation found an unauthenticated and globally forwarded `/ws/sync` channel. Phase 3 is reopened only for remediation validation after the Phase 2 bis WebSocket work.

### Phase 4 - Finalisation Molecule / MTraX

Statut:

Partiel

Depend de:

- Phase 3 ter terminee

Sources principales:

- todo/molecule/molecule_sanitizer.md
- todo/media_handling/MTraX_edition.md
- todo/molecule/NewMolecules.md
- todo/molecule/molecule_tests.md
- todo/molecule/molecule_trouble_solving.md
- todo/molecule/molecule_rename_mtrack_to_molecule.md
- todo/molecule/PROJET_MOLECULE_DEBUG.md

Taches:

- [ ] Traiter les bugs Molecule dans l'ordre du guide trouble solving.
- [ ] Ajouter ou mettre a jour les probes/tests Molecule.
- [ ] Inventorier les noms mtrack, mtrax, mtracks, hmtracks.
- [ ] Lancer le renommage progressif Molecule seulement apres stabilisation fonctionnelle.
- [ ] Garder les aliases legacy uniquement aux frontieres publiques documentees.
- [ ] Migrer le chrome visible Molecule vers Bevy et supprimer son panel DOM selon V2.12 apres la phase 3 ter.
- [ ] Restaurer le contrat canonique marqueurs -> sections -> Cells par piste de V2.13, puis supprimer toute implementation Cells DOM ou etat parallele restant.

Rapports d'avancement Phase 4:

- Trouble solving Task 1 / clip disappearance during drag: reused the existing browser-driven `tests/probes/mtrack_clip_drag_invariant_probe.test.mjs` probe against the active Fastify app on port 3001. The report at `temp/probe_reports/mtrack_clip_drag_invariant_probe/report.json` validated horizontal drag, drag to previous track, drag to next track, repeated stress movements with track creation and return, and autoscroll edge dragging. Result passed: clip identity and persisted identity stayed present, track and clip counts stayed valid, DOM parent tracks matched model track ids, no stale clip node remained attached to the wrong lane, and console error count was 0. Additional validations passed: `npm run check:molecule-guardrails`; `npm run check:no-fallbacks`. No source edit was required because the current implementation already satisfies Task 1 invariants. The global Phase 4 execution-order checkbox remains open until the remaining trouble solving tasks are validated in order. Progress remains 53/118, 44.92%.
- Abandoned investigation note for immediate post-record Molecule open: the unresolved user-visible bug is that after recording a short audio/video media item, opening the created Molecule in less than one second can show empty tracks; waiting two or three seconds or reopening can make tracks appear. A later attempted correction was fully reverted because it made the system less stable: Molecules were not always created after recording, and the recording flow could become difficult or impossible to stop reliably. The next investigation must start from the clean pre-attempt state and must not reapply the reverted strategy without a deterministic reproduction. Related symptoms still to investigate include missing or unclear Molecule tools for record media audio/video, record motion, audio/video/front/back camera source selection, synchronized target track semantics, SVG/keyframe recording behavior, and the `detail` tool. Evidence from the reverted attempt: targeted contract probes for panel record tools, camera record state, and media-open readiness passed while the code was present, but they were removed with the rollback because they validated the reverted implementation; `npm run check:molecule-guardrails`, `npm run check:no-fallbacks`, `npm run check:syntax`, and `git diff --check` passed during the attempt; `npm run test:molecule` could not run because `eVe/tests/molecule/run_molecule_tests.mjs` is missing; the attempted full capture probe `node tests/probes/photo_video_capture_fullscreen_probe.test.mjs` did not reach the record scenario because `.eve-capture-fullscreen__record-button[data-kind="video"]` timed out. Required next step: build or repair a deterministic browser/Tauri reproduction that records, stops, verifies media-atome creation, opens Molecule immediately, and asserts track/clip presence before changing runtime code. Do not mark the Phase 4 bug task complete until that reproduction passes and the stop-record lifecycle remains stable.

### Phase 5 - AV APIs / recording / preview

Statut:

Actif

Depend de:

- Phase 3 terminee

Sources principales:

- todo/media_handling/AV_APIS.md
- todo/media_handling/video_recording_and_preview.md
- todo/media_handling/RECORDING_INTEGRATION_PLAN.md
- todo/media_handling/RUNNING_VIDEO_AUDIO_SYNC_PLAN.md
- todo/media_handling/debug_ios_media_recorder.md
- todo/molecule/NewMolecules.md

Taches:

- [ ] Sortir l'extraction audio de conteneur video hors de bridge.rs.
- [ ] Retirer les ecritures disque du callback CPAL.
- [ ] Supprimer les allocations par callback dans le metering recorder.
- [ ] Encadrer ou supprimer les chemins debug Swift en production.
- [ ] Remplacer progressivement l'ancien chemin recorder C FFI AUv3.
- [ ] Stabiliser les frontieres publiques audio/video playback/recording/preview.
- [ ] Implementer le contrat d'export professionnel et la decision des profils ouverts, archivage et livraison.
- [ ] Supprimer les anciennes routes HTMLMediaElement et no-op media renderer; les capacites indisponibles doivent retourner une erreur typee explicite.

### Phase 6 - Partage / sync / Finder

Statut:

Actif

Depend de:

- Phase 3 terminee

Sources principales:

- todo/sharing_search_monitoring/sharing_to_code.md
- todo/sharing_search_monitoring/Share_tool.md
- todo/sharing_search_monitoring/finder.md
- todo/sharing_search_monitoring/finder_UI.md

Taches:

- [ ] Reproduire le bug de partage Fastify vers Tauri et collecter les logs.
- [ ] Identifier la cause: receiverProjectId, parent_id, ou filtre loadProjectAtomes().
- [ ] Consolider getCurrentProjectId().
- [ ] Supprimer les fallbacks qui masquent les erreurs.
- [ ] Ajouter validation et erreurs claires pour les partages non lies.
- [ ] Implementer et valider l'option d'acceptation persistante par expediteur: case `Accepter automatiquement les prochains partages de cet expediteur` cochee par defaut dans l'ecran d'acceptation, de-cochable avant validation, politique `always` limitee au perimetre explicitement autorise et revocable; critere de sortie: le partage courant, l'auto-accept compatible, le refus d'elargissement implicite et la revocation sont verifies.
- [ ] Implementer le vrai mode manuel lie sans conversion en copie: conserver l'identite du lien et un curseur de publication accepte, accumuler les mutations append-only autorisees sans propagation de fond, puis publier et appliquer explicitement le delta par WebSocket; critere de sortie: temps reel lie, manuel lie et copie detachee ont trois comportements distincts, testes avec permissions, expiration, rejet, reconnexion et absence de fallback.
- [ ] Implementer la resolution hors ligne last-write-wins sans perte historique: ordonner les evenements autorises par timestamp avec departage deterministe, projeter le gagnant courant, conserver tous les evenements concurrents dans le journal append-only et produire toute correction/restauration comme nouvel evenement; critere de sortie: replay hors ligne, conflits, egalites d'horodatage, permissions, diagnostics, relecture complete et parite Fastify/Tauri/iOS sont verifies sans mutation du passe.
- [ ] Rendre le telephone et les coordonnees prives par defaut dans tout le repertoire: ajouter un consentement explicite et revocable independant de la visibilite du profil, supprimer les contacts et secrets des listes publiques, recherches, caches hors ligne et evenements de compte, puis n'exposer les champs consentis qu'au proprietaire ou aux relations autorisees; critere de sortie: profil public sans consentement, consentement actif/revoque, relations autorisees, `/ws/sync`, Fastify/Tauri/iOS et absence absolue de `password_hash` dans les payloads clients sont testes.
- [ ] Stabiliser Finder apres correction du modele partage/projet.

### Phase 7 - Migration V2 / cleanup large / performance

Statut:

Actif

Depend de:

- Phase 3 terminee

Sources principales:

- todo/cleanup_architecture/file_size_and_coding_standards_remediation.md
- todo/cleanup_architecture/file_size_inventory_2026-07-14.md
- todo/audits/2026-07-14_framework_documentation_conformance.md
- todo/cleanup_architecture/system_ui_component_ssot.md
- todo/cleanup_architecture/v2_full_migration_framework.md
- todo/cleanup_architecture/framework_cleanup_and_ui_optimization_plan_2026-04-19.md
- todo/cleanup_architecture/deep_ux_performance_and_ios_boot_compliance.md
- todo/cleanup_architecture/ios_fullscreen_surface_compliance.md
- todo/tools/tool_sanitisation.md
- todo/dev_ops/developer-experience.md

Regles obligatoires de cette phase:

- Toute reduction ou unification des styles systeme doit partir de eVe/elements/system_ui_tokens.js comme source unique deja existante pour les couleurs, opacites, blur et shadows communs.
- Il est interdit de creer une source parallele de tokens partages pour les panels, tools, components, Molecule, lists et surfaces systeme voisines.
- Les styles partages doivent etre reduits au minimum: une teinte generale, puis des variantes derivees par opacite, contraste, et etat au lieu de multiplier les palettes locales.

Taches:

- [ ] Executer le nettoyage profond de conformite des fichiers source: tailles, annotations verbeuses, duplication verifiee via les maps, recherche de code mort/inoperant/problematique, factorisation, simplification sans regression, et unification stricte des styles systeme partages a partir de eVe/elements/system_ui_tokens.js sans doubler les sources de couleurs, blur, shadow ou fonds derives.
- [ ] Supprimer progressivement les bridges eveGoeyMenuApi.
- [ ] Supprimer l'alias legacy new_menu.
- [ ] Normaliser les IDs tools en _intuition_v2_*.
- [ ] Nettoyer les APIs clone/outils legacy.
- [ ] Renommer les contrats V1 encore exposes.
- [ ] Migrer les cles de persistance *_v1.
- [ ] Executer la sanitisation du systeme de tools decrite dans todo/tools/tool_sanitisation.md avant de declarer la migration V2 des tools comme stabilisee.
- [ ] Ajouter les garde-fous CI anti regression V1.
- [ ] Nettoyer uniquement les artefacts generes confirmes comme jetables.
- [ ] Corriger l'occupation plein ecran iOS sur iPhone pour supprimer les bandes noires haut/bas sans regression sur iPad.
- [ ] Executer le plan deep UX/performance apres stabilisation des frontieres V2.
- [ ] Remplacer les echecs silencieux des APIs de developpement par des erreurs typees et actionnables, sans fallback implicite; critere de sortie: templates, parents, styles et handlers invalides sont couverts par des contrats dev/prod explicites.

### Phase 8 - Auth, Apple Mail, notifications, calendar

Statut:

Actif

Depend de:

- Phase 6 terminee
- Phase 3 terminee

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
- [ ] Liberer le focus natif du champ mot de passe apres authentification avant de reveler le workspace; critere de sortie: `user_panel_content_contract` passe sans focus retenu dans la sequence masquee.

### Phase 9 - IA vocale / MCP / editor / runtime

Statut:

Actif

Depend de:

- Phase 2 terminee
- Phase 8 terminee pour les dependances mail/auth/calendar
- Phase 7 suffisamment stable pour eviter de brancher l'IA sur des surfaces legacy en cours de migration
- Phase 3 terminee

Sources principales:

- todo/ai_voice/AI_integration_problems_to_solve.md
- todo/ai_voice/AI_Integration.md
- todo/ai_voice/eVe_AI.md
- todo/ai_voice/eVe_code_editor.md
- done/ai_voice/Full_vocal_AI_integration.md (historical completed source)
- todo/ai_voice/MCP_voice_control.md
- todo/ai_voice/voice_recognition.md
- todo/ai_voice/eVe_MCP_APIS_Tools.md

Taches:

- [ ] Stabiliser le contrat semantique mail.
- [ ] Stabiliser la memoire de session.
- [ ] Stabiliser le transport Tauri/mail.
- [ ] Ajouter une couche robuste d'interpretation STT.
- [ ] Etendre le meme modele a contacts et calendar.
- [ ] Etendre le meme modele aux outils Atome.
- [ ] Integrer l'editeur code/MCP sur une base architecturelle stable.
- [ ] Ajouter tests semantiques, orchestrateur et E2E Tauri.

### Phase 10 - Chantiers produits differables

Statut:

Actif

Depend de:

- Toutes les phases structurelles precedentes suffisamment stables

Sources principales:

- todo/midi/atome_midi_binding_system.md
- todo/midi/Midi_implementation.md
- todo/rendering_graphics/vector_editing_layer.md
- todo/rendering_graphics/universal_canvas.md
- todo/dev_ops/install_MediaSoup.md
- todo/communication_social/social_network_tool.md
- todo/communication_social/user_auth.md
- todo/eve_features/presets-system.md
- todo/dev_ops/api-sugar.md
- todo/dev_ops/npm-publication-checklist.md
- todo/dev_ops/rewrite_documentation.md
- todo/dev_ops/eve_website_publishing.md
- todo/ai_voice/ace_step_integration.md
- todo/sharing_search_monitoring/tool_monitor.md

Taches:

- [ ] MIDI.
- [ ] Vector editing layer.
- [ ] Universal canvas, including verification that Squirrel and preferably the open-source Squirrel + Atome engine remain correctly exported through the CDN and still produce a viable functional PWA.
- [ ] Matrix protocol + MediaSoup communication stack: Matrix accounts, exchange rooms, social/news wall and telephony/call state use the canonical WebSocket architecture for commands, signaling and durable data; only mediasoup real-time audio/video streams use the explicitly authorized WebRTC/RTP media-plane exception; critere de sortie: tous les criteres de `todo/dev_ops/install_MediaSoup.md` passent sans REST, HTTP polling or alternate signaling transport.
- [ ] Presets/skins.
- [ ] API sugar.
- [ ] Publication npm.
- [ ] Documentation.
- [ ] Website publishing.
- [ ] Ace Step integration in eVe.
- [ ] Integrer le monitoring reactif des tools dans l'Info Panel apres sanitisation des tools et migration Bevy des panels; critere de sortie: tools visibles, hidden et systeme refletent et pilotent le vrai runtime sans etat parallele.

## Todo scope registry

Every maintained todo family is assigned to an execution phase. A file may not be executed outside its assigned phase.

- Phase 3 ter: `todo/ui_bevy/`, `todo/eve_features/menu_interactions.md`, `todo/eve_features/calendar_todos.md`, `todo/eve_features/map_localization.md`, `todo/communication_social/matrix_flower_context_menu.md`, `todo/rendering_graphics/robust_bevy_regression_fix_prompt_en.md`, `todo/cleanup_architecture/system_ui_component_ssot.md`, `todo/cleanup_architecture/v2_full_migration_framework.md`.
- Phase 4: `todo/molecule/`, `todo/media_handling/MTraX_edition.md`, `todo/media_handling/RUNNING_VIDEO_AUDIO_SYNC_PLAN.md`.
- Phase 5: `todo/media_handling/`.
- Phase 6: `todo/sharing_search_monitoring/`, `todo/communication_social/mail.md`, `todo/communication_social/matrix.md`, `todo/communication_social/matrix_flower_context_menu.md`, `todo/communication_social/social_network_tool.md`.
- Phase 7: remaining `todo/cleanup_architecture/` files excluding `system_ui_component_ssot.md` and `v2_full_migration_framework.md`, `todo/audits/`, `todo/rendering_graphics/`, `todo/tools/`, `todo/dev_ops/developer-experience.md`.
- Phase 8: `todo/communication_social/user_auth.md`, `todo/eve_features/Notification_tool.md`, `todo/eve_features/eve_accessibility.md`.
- Phase 9: `todo/ai_voice/`.
- Phase 10: `todo/midi/`, `todo/dev_ops/`, `todo/communication_social/apple_mail_security.md`, `todo/eve_features/prompt_modification_menu_mvp_v146_ios_touch_tests.md`, `todo/tests/`, `todo/execution_order.md` follow-up documentation work.

The registry is intentionally directory-based only for families that are fully governed by the corresponding phase. Any newly created todo file must be assigned here before execution.

Si un de ces fichiers devient necessaire, il doit etre ajoute ici avant execution.

## Fin

- [ ] Toutes les phases ci-dessus sont terminees.
- [ ] Toutes les validations finales sont passees.
- [ ] Executer et reconcilier les registres `todo/tests/`; critere de sortie: chaque scenario est automatise, valide manuellement avec preuve, ou classe obsolète sans doublon.
- [ ] Tous les fichiers todo soldes ont ete deplaces vers done/.
- [ ] Supprimer ce fichier: todo/execution_order.md.
