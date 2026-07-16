# Execution Order Reconciliation Audit — 2026-07-16

Status: Complete  
Original snapshot: 138 checkbox entries  
Decision policy: functional product contract  
Mutation scope: documentation, governance scripts, and persistent tests only

## Outcome

- The original 138 entries are preserved below with stable audit identifiers.
- Twelve phase lifecycle checkboxes were converted to derived text statuses and removed from progress totals.
- Dashboard was split into verified functional scope and one precise 0.5 px preview-rounding remainder.
- Matrix Flower moved from Phase 6 to Phase 3 ter before panel migration because panels are not a dependency.
- Active orphan documents were registered; completed or duplicate documents were archived.

## Evidence catalog

| Evidence | Current result |
| --- | --- |
| EV-STRUCT | `npm run check:execution-order` passes; paths, registrations, statuses, duplicates and counts are reproducible. |
| EV-DOC | Phase 0 normalization remains recorded with explicit status semantics. |
| EV-FOUNDATION | `npm run check:syntax` passes for 955 files; current owners for utilities, validation, latched state and layer teardown exist. |
| EV-PANEL | Panel chrome and standard-path probes pass. The user probe reaches the current flow and exposes one separate focus regression registered in Phase 8. |
| EV-MOLECULE | `check:molecule-guardrails` and `check:no-fallbacks` pass. |
| EV-MAPS | The four maps retain mandatory-use gates and the Atome/eVe boundary. |
| EV-SECURITY | Mutation, DOM, fallback and auth-bootstrap security checks pass. |
| EV-BEVY | Main-menu/Dashboard focused suites produced 45 passes out of 46; Flower module and drag-cancellation probes pass. |
| EV-DASH | Only focused Dashboard failure: `467.5 !== 468` in `dashboard_records.test.mjs:345`. |
| EV-MATRIX | Matrix delegates context opening to Flower, but Matrix context typing and the five command routes remain incomplete. |
| EV-OPEN | No current exit validation was found; task remains active under its registered source. |

## Source groups

| Group | Sources |
| --- | --- |
| SRC-00 | Phase 0 documentation sources |
| SRC-HIST | Historical urgent/factorization sources |
| SRC-PANEL | Panel refactor sources |
| SRC-MOL-H | Historical Molecule sources |
| SRC-1 / SRC-2 / SRC-3 | Governance, maps and security |
| SRC-3T | Bevy UI, Matrix Flower and interaction sources |
| SRC-4..SRC-10 | Corresponding active phase sources |
| SRC-FIN | Final gates and todo/tests/ |
| SRC-ROOT | Root governance |

## Original 138-entry ledger

| Audit ID | Original section | Initial | Type | Sources | Original text | Decision | Evidence | Final disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EO-001 | Phase 0 - Documentation and architecture normalization | [x] | Statut de phase | SRC-00 | Completed in the current documentation pass. | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-002 | Phase 0 - Documentation and architecture normalization | [x] | Tache | SRC-00 | Retire the obsolete pre-Bevy media-editor specification from the active architecture. | Termine verifie ou jalon historique conserve | EV-DOC | Case conservee cochee |
| EO-003 | Phase 0 - Documentation and architecture normalization | [x] | Tache | SRC-00 | Remove audio/video fallback language and describe browser capture as an explicit backend where it is supported. | Termine verifie ou jalon historique conserve | EV-DOC | Case conservee cochee |
| EO-004 | Phase 0 - Documentation and architecture normalization | [x] | Tache | SRC-00 | Mark timeline, AV, recording, and export documents with explicit status semantics. | Termine verifie ou jalon historique conserve | EV-DOC | Case conservee cochee |
| EO-005 | Phase 0 - Documentation and architecture normalization | [x] | Tache | SRC-00 | Add the professional export contract: editable project package, open archival master, delivery export, deterministic rendering, checkpointed resume, atomic publication, and final validation. | Termine verifie ou jalon historique conserve | EV-DOC | Case conservee cochee |
| EO-006 | Phase 0 - Documentation and architecture normalization | [x] | Tache | SRC-00 | Register the relevant timeline, media, rendering, AI, sharing, test, and product todo families in the phase sources below. | Termine verifie ou jalon historique conserve | EV-DOC | Case conservee cochee |
| EO-007 | 1. Corrections critiques immediates eVe Intuition | [x] | Tache | SRC-HIST | Remplacer tout require() dans module ES, notamment tools/communication.js. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-008 | 1. Corrections critiques immediates eVe Intuition | [x] | Tache | SRC-HIST | Deplacer mtraxCloseInFlightGuard avant toute utilisation dans eVeIntuition.js. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-009 | 1. Corrections critiques immediates eVe Intuition | [x] | Tache | SRC-HIST | Unifier les prefixes de selection depuis runtime/selection.js. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-010 | 1. Corrections critiques immediates eVe Intuition | [x] | Tache | SRC-HIST | Renommer ensureString en isString dans contracts/validator.js. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-011 | 1. Corrections critiques immediates eVe Intuition | [x] | Tache | SRC-HIST | Ajouter destroyLayerInvariantObserver() et le connecter au cycle de destruction. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-012 | 1. Corrections critiques immediates eVe Intuition | [x] | Tache | SRC-HIST | Verifier lint/build/smoke test apres chaque correction. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-013 | 2. Factorisation minimale du socle | [x] | Tache | SRC-HIST | Creer shared/utils.js et migrer progressivement les utilitaires communs. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-014 | 2. Factorisation minimale du socle | [x] | Tache | SRC-HIST | Creer shared/media_types.js et supprimer les duplications de types media. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-015 | 2. Factorisation minimale du socle | [x] | Tache | SRC-HIST | Centraliser les constantes de layers et de TTL panels. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-016 | 2. Factorisation minimale du socle | [x] | Tache | SRC-HIST | Factoriser le locking via runtime/in_flight_lock.js. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-017 | 2. Factorisation minimale du socle | [x] | Tache | SRC-HIST | Unifier readExplicitLatchedState / readExplicitLatched. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-018 | 2. Factorisation minimale du socle | [x] | Tache | SRC-HIST | Verifier les imports/exports et l'absence de duplication restante avec rg. | Termine verifie ou jalon historique conserve | EV-FOUNDATION | Case conservee cochee |
| EO-019 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Centraliser les tokens de chrome panel. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-020 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Finaliser createEveDialog avec header, body, tools band, footer. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-021 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Placer les outils de panel au-dessus du footer band. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-022 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Garder le footer comme bande finale avec titre, fermeture et resize grip. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-023 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Garantir que le body reste la seule zone scrollable. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-024 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Ajouter des indicateurs visibles de debordement haut/bas sur le vrai scroll container. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-025 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Migrer les panels simples avant les panels complexes. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-026 | 3. Contrat panel / layout eVe | [x] | Tache | SRC-PANEL | Valider home/user, finder, communication, calendar et mtrack. | Termine verifie ou jalon historique conserve | EV-PANEL | Case conservee cochee |
| EO-027 | 4. Molecule / MTraX deja engage - points deja valides | [x] | Tache | SRC-MOL-H | Construire les diagnostics globaux Molecule avant les corrections profondes. | Termine verifie ou jalon historique conserve | EV-MOLECULE | Case conservee cochee |
| EO-028 | 4. Molecule / MTraX deja engage - points deja valides | [x] | Tache | SRC-MOL-H | Clarifier le contrat preview: interne par defaut, externalise uniquement si explicite. | Termine verifie ou jalon historique conserve | EV-MOLECULE | Case conservee cochee |
| EO-029 | 4. Molecule / MTraX deja engage - points deja valides | [x] | Tache | SRC-MOL-H | Remplacer le layout tracks/cells par un layout responsive. | Termine verifie ou jalon historique conserve | EV-MOLECULE | Case conservee cochee |
| EO-030 | 4. Molecule / MTraX deja engage - points deja valides | [x] | Tache | SRC-MOL-H | Fiabiliser le splitter pour qu'il ne deplace jamais le panel. | Termine verifie ou jalon historique conserve | EV-MOLECULE | Case conservee cochee |
| EO-031 | 4. Molecule / MTraX deja engage - points deja valides | [x] | Tache | SRC-MOL-H | Retirer les styles globaux dangereux sur le host docke. | Termine verifie ou jalon historique conserve | EV-MOLECULE | Case conservee cochee |
| EO-032 | 4. Molecule / MTraX deja engage - points deja valides | [x] | Tache | SRC-MOL-H | Simplifier les synchronisations layout. | Termine verifie ou jalon historique conserve | EV-MOLECULE | Case conservee cochee |
| EO-033 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Statut de phase | SRC-3T | Non commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-034 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [x] | Tache | SRC-3T | Completer et valider les primitives BevyUI partagees manquantes et leurs interactions reelles, sans remigrer le dashboard ni le menu direct deja rendus par Bevy. | Termine verifie ou jalon historique conserve | EV-BEVY | Case conservee cochee |
| EO-035 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [x] | Tache | SRC-3T | Migrate the bottom Bevy main menu interaction model: direct actions, expandable palettes, latch state, dedicated hold actions, hold-to-palette, drag cancellation, and removal of the flattened legacy projection. | Termine verifie ou jalon historique conserve | EV-BEVY | Case conservee cochee |
| EO-036 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [x] | Tache | SRC-3T | Migrate the Flower hold contract: held-pointer palette opening, immediate Back navigation, leaf preview followed by activation on release, and cancellation safety. | Termine verifie ou jalon historique conserve | EV-BEVY | Case conservee cochee |
| EO-037 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [x] | Tache | SRC-3T | Delete Flower/menu/toolbox DOM bridges, aliases, factories, and browser-only state once the complete Bevy interaction contract is verified and no canonical consumer remains. | Termine verifie ou jalon historique conserve | EV-BEVY | Case conservee cochee |
| EO-038 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Tache | SRC-3T | Finaliser la parite Dashboard Bevy, migrer le dashboard, puis supprimer tout chemin HTML/DOM restant. | Partiel, scinde entre acquis fonctionnels et reliquat 0,5 px | EV-DASH | Dashboard fonctionnel coche; reliquat d'arrondi ouvert |
| EO-039 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Tache | SRC-3T | Migrer les panels/dialogs et leur infrastructure commune, puis supprimer les factories, observateurs layout et lectures de geometrie DOM devenus inutiles; le chrome Molecule reste execute en Phase 4 apres sa stabilisation fonctionnelle. | Actif, aucune preuve de cloture actuelle | EV-BEVY | Case conservee ouverte |
| EO-040 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Tache | SRC-3T | Realiser l'audit calendrier et implementer sa projection Bevy sans dupliquer CalendarAPI, recurrence, alarmes, todos ou fuseaux horaires. | Actif, aucune preuve de cloture actuelle | EV-BEVY | Case conservee ouverte |
| EO-041 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Tache | SRC-3T | Realiser l'audit map/localisation, valider le provider et la confidentialite, puis implementer la scene Bevy sans Leaflet ni widget DOM embarque. | Actif, aucune preuve de cloture actuelle | EV-BEVY | Case conservee ouverte |
| EO-042 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Tache | SRC-3T | Inventorier puis supprimer toutes les couches visibles Intuition/View/DOM devenues sans consommateurs apres migration. | Actif, aucune preuve de cloture actuelle | EV-BEVY | Case conservee ouverte |
| EO-043 | Phase 3 ter - Product UI Bevy migration and DOM retirement | [ ] | Tache | SRC-3T | Valider Web, Tauri et iOS sur le meme contrat scene/diff/interactions, avec erreurs typees pour les capacites indisponibles. | Actif, aucune preuve de cloture actuelle | EV-BEVY | Case conservee ouverte |
| EO-044 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Statut de phase | SRC-1 | Terminee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-045 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Valider avec l'utilisateur la frontiere open-source Atome / closed-source eVe. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-046 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Valider les regles de classement: UI closed, tools closed, infrastructure de l'app open, security open, cross-platform open, server open. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-047 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Identifier les dependances autorisees et interdites entre couches open et closed. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-048 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Identifier les dossiers et modules a deplacer, scinder, ou proteger pour respecter cette architecture. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-049 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Verifier que la structure cible est suffisamment stable pour devenir la base des cartographies futures. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-050 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Executer les deplacements, scissions, et protections structurels valides avant toute cartographie future. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-051 | Phase 1 - Gouvernance architecture Atome/eVe | [x] | Tache | SRC-1 | Produire un test ou une verification adaptee apres chaque sous-tache et un rapport d'avancement global. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-052 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Statut de phase | SRC-2 | Terminee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-053 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Creer ou mettre a jour maps/CODEMAP.md apres validation de la phase 1. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-054 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Creer ou mettre a jour maps/API_MAP.md apres validation de la phase 1. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-055 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Creer maps/DESIGN_MAP.md pour cartographier le design JavaScript, les tokens, les factories visuelles, les styles injectes, les assets, et les exceptions CSS generees ou vendorisees. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-056 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Creer ou mettre a jour maps/ARCHITECTURE_MAP.md apres validation de la phase 1. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-057 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Lister les APIs publiques, semi-publiques, et internes sans hallucination ni doublon. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-058 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Faire apparaitre explicitement la frontiere Atome open / eVe closed dans les maps. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-059 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Rendre ces maps obligatoires avant toute nouvelle implementation. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-060 | Phase 2 - Cartographie framework, APIs, code et MCP | [x] | Tache | SRC-2 | Produire un test ou une verification documentaire ciblee apres chaque sous-tache et un rapport d'avancement global. | Termine verifie ou jalon historique conserve | EV-MAPS | Case conservee cochee |
| EO-061 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Statut de phase | SRC-3 | Terminee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-062 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Inventorier toutes les surfaces de securite du framework: filesystem, reseau, websocket, bridges JS/natifs, tokens, secrets, permissions, stockage, MCP, sync, server, sandbox, et imports dynamiques. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-063 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Verifier en profondeur les risques de fuite de secrets, d'injection de commande, de traversal de chemin, d'elevation de privilege, de bypass de permissions, de bridge trop permissif, et de payloads non valides. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-064 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Auditer les flux auth, user preferences sensibles, token storage, journalisation, rate limiting, et separation des donnees utilisateur. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-065 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Auditer les surfaces MCP et IA pour confirmer l'absence de raccourcis dangereux, de mutations non autorisees, et de contournements du pipeline canonique. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-066 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Prioriser les failles par severite: critique, haute, moyenne, basse. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-067 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Corriger toutes les failles critiques et hautes avant de poursuivre. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-068 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Documenter clairement les failles restantes avec impact, proprietaire, plan de remediation, et justification si elles ne sont pas corrigees immediatement. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-069 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Produire des tests et verifications de securite cibles apres chaque correction sensible. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-070 | Phase 3 - Audit strict de securite framework / resolution des failles | [x] | Tache | SRC-3 | Produire un rapport d'audit et de resolution des failles avec avancement global avant cloture de phase. | Termine verifie ou jalon historique conserve | EV-SECURITY | Case conservee cochee |
| EO-071 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Statut de phase | SRC-4 | Partiellement commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-072 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Traiter les bugs Molecule dans l'ordre du guide trouble solving. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-073 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Ajouter ou mettre a jour les probes/tests Molecule. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-074 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Inventorier les noms mtrack, mtrax, mtracks, hmtracks. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-075 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Lancer le renommage progressif Molecule seulement apres stabilisation fonctionnelle. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-076 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Garder les aliases legacy uniquement aux frontieres publiques documentees. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-077 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Migrer le chrome visible Molecule vers Bevy et supprimer son panel DOM selon V2.12 apres la phase 3 ter. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-078 | Phase 4 - Finalisation Molecule / MTraX | [ ] | Tache | SRC-4 | Restaurer le contrat canonique marqueurs -> sections -> Cells par piste de V2.13, puis supprimer toute implementation Cells DOM ou etat parallele restant. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-079 | Phase 5 - AV APIs / recording / preview | [ ] | Statut de phase | SRC-5 | Non commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-080 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Sortir l'extraction audio de conteneur video hors de bridge.rs. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-081 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Retirer les ecritures disque du callback CPAL. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-082 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Supprimer les allocations par callback dans le metering recorder. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-083 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Encadrer ou supprimer les chemins debug Swift en production. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-084 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Remplacer progressivement l'ancien chemin recorder C FFI AUv3. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-085 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Stabiliser les frontieres publiques audio/video playback/recording/preview. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-086 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Implementer le contrat d'export professionnel et la decision des profils ouverts, archivage et livraison. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-087 | Phase 5 - AV APIs / recording / preview | [ ] | Tache | SRC-5 | Supprimer les anciennes routes HTMLMediaElement et no-op media renderer; les capacites indisponibles doivent retourner une erreur typee explicite. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-088 | Phase 6 - Partage / sync / Finder | [ ] | Statut de phase | SRC-6 | Non commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-089 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Reproduire le bug de partage Fastify vers Tauri et collecter les logs. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-090 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Identifier la cause: receiverProjectId, parent_id, ou filtre loadProjectAtomes(). | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-091 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Consolider getCurrentProjectId(). | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-092 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Supprimer les fallbacks qui masquent les erreurs. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-093 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Ajouter validation et erreurs claires pour les partages non lies. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-094 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Stabiliser Finder apres correction du modele partage/projet. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-095 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Ajouter le menu Flower contextuel Matrix apres stabilisation selection/command path. | Actif, remonte en Phase 3 ter avant les panels | EV-MATRIX | Deux taches cible/commandes en Phase 3 ter |
| EO-096 | Phase 6 - Partage / sync / Finder | [ ] | Tache | SRC-6 | Verifier que Copy, Paste, Duplicate, Delete et Rename routent vers les vrais chemins runtime. | Actif, remonte en Phase 3 ter avant les panels | EV-MATRIX | Deux taches cible/commandes en Phase 3 ter |
| EO-097 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Statut de phase | SRC-7 | Non commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-098 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Executer le nettoyage profond de conformite des fichiers source: tailles, annotations verbeuses, duplication verifiee via les maps, recherche de code mort/inoperant/problematique, factorisation, simplification sans regression, et unification stricte des styles systeme partages a partir de eVe/elements/system_ui_tokens.js sans doubler les sources de couleurs, blur, shadow ou fonds derives. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-099 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Supprimer progressivement les bridges eveGoeyMenuApi. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-100 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Supprimer l'alias legacy new_menu. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-101 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Normaliser les IDs tools en _intuition_v2_*. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-102 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Nettoyer les APIs clone/outils legacy. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-103 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Renommer les contrats V1 encore exposes. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-104 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Migrer les cles de persistance *_v1. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-105 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Executer la sanitisation du systeme de tools decrite dans todo/tools/tool_sanitisation.md avant de declarer la migration V2 des tools comme stabilisee. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-106 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Ajouter les garde-fous CI anti regression V1. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-107 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Nettoyer uniquement les artefacts generes confirmes comme jetables. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-108 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Corriger l'occupation plein ecran iOS sur iPhone pour supprimer les bandes noires haut/bas sans regression sur iPad. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-109 | Phase 7 - Migration V2 / cleanup large / performance | [ ] | Tache | SRC-7 | Executer le plan deep UX/performance apres stabilisation des frontieres V2. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-110 | Phase 8 - Auth, Apple Mail, notifications, calendar | [ ] | Statut de phase | SRC-8 | Non commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-111 | Phase 8 - Auth, Apple Mail, notifications, calendar | [ ] | Tache | SRC-8 | Completer les points production auth critiques. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-112 | Phase 8 - Auth, Apple Mail, notifications, calendar | [ ] | Tache | SRC-8 | Valider les contraintes Apple Mail IMAP/CalDAV. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-113 | Phase 8 - Auth, Apple Mail, notifications, calendar | [ ] | Tache | SRC-8 | Stabiliser le systeme de notifications. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-114 | Phase 8 - Auth, Apple Mail, notifications, calendar | [ ] | Tache | SRC-8 | Ajouter vue semaine, recherche et preferences calendar. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-115 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Statut de phase | SRC-9 | Non commencee | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-116 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Stabiliser le contrat semantique mail. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-117 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Stabiliser la memoire de session. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-118 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Stabiliser le transport Tauri/mail. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-119 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Ajouter une couche robuste d'interpretation STT. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-120 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Etendre le meme modele a contacts et calendar. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-121 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Etendre le meme modele aux outils Atome. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-122 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Integrer l'editeur code/MCP sur une base architecturelle stable. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-123 | Phase 9 - IA vocale / MCP / editor / runtime | [ ] | Tache | SRC-9 | Ajouter tests semantiques, orchestrateur et E2E Tauri. | Actif, aucune preuve de cloture actuelle | EV-OPEN | Case conservee ouverte |
| EO-124 | Phase 10 - Chantiers produits differables | [ ] | Statut de phase | SRC-10 | Non commences | Statut administratif retire du calcul | EV-STRUCT | Statut texte derive |
| EO-125 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | MIDI. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-126 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Vector editing layer. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-127 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Universal canvas, including verification that Squirrel and preferably the open-source Squirrel + Atome engine remain correctly exported through the CDN and still produce a viable functional PWA. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-128 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Matrix protocol + MediaSoup communication stack: Matrix accounts, exchange rooms, social/news wall, telephony/call state, and mediasoup media-plane integration. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-129 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Presets/skins. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-130 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | API sugar. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-131 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Publication npm. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-132 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Documentation. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-133 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Website publishing. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-134 | Phase 10 - Chantiers produits differables | [ ] | Tache | SRC-10 | Ace Step integration in eVe. | Actif, aucune preuve de cloture actuelle | EV-MAPS | Case conservee ouverte |
| EO-135 | Fin | [ ] | Garde finale | SRC-FIN | Toutes les phases ci-dessus sont terminees. | Actif, aucune preuve de cloture actuelle | EV-STRUCT | Case conservee ouverte |
| EO-136 | Fin | [ ] | Garde finale | SRC-FIN | Toutes les validations finales sont passees. | Actif, aucune preuve de cloture actuelle | EV-STRUCT | Case conservee ouverte |
| EO-137 | Fin | [ ] | Garde finale | SRC-FIN | Tous les fichiers todo soldes ont ete deplaces vers done/. | Actif, aucune preuve de cloture actuelle | EV-STRUCT | Case conservee ouverte |
| EO-138 | Fin | [ ] | Garde finale | SRC-FIN | Supprimer ce fichier: todo/execution_order.md. | Actif, aucune preuve de cloture actuelle | EV-STRUCT | Case conservee ouverte |

## Initially unregistered todo documents

| Original path | Decision | Destination | Reason |
| --- | --- | --- | --- |
| todo/audits/2026-07-14_framework_documentation_conformance.md | Actif | Phase 7 | Remediation documentee |
| todo/cleanup_architecture/eVe_optiisations.md | Obsolete | done/obsolete/eVe_optimisations.md | Duplique les modules .codex |
| todo/cleanup_architecture/file_size_inventory_2026-07-14.md | Actif | Phase 7 | Registre de reduction |
| todo/dev_ops/developer-experience.md | Actif | Phase 7 | Erreurs typees sans fallback |
| todo/molecule/PROJET_MOLECULE_DEBUG.md | Actif | Phase 4 | Audit Molecule |
| todo/molecule/molecule-status.md | Termine verifie | done/molecule/molecule-status-2026-04-28.md | Rapport solde |
| todo/rendering_graphics/robust_bevy_regression_fix_prompt_en.md | Partiel | Phase 3 ter | Drag/lasso ouverts |
| todo/sharing_search_monitoring/tool_monitor.md | Actif | Phase 10 | Source canonique |
| todo/sharing_search_monitoring/tools_monitoring.md | Obsolete | done/obsolete/tools_monitoring.md | Doublon |
| todo/tests/README.md | Specification | Validation finale | Registre |
| todo/tests/assistant_ai.md | Actif | Validation finale | Scenarios assistant |
| todo/tests/authentification.md | Actif | Validation finale | Scenarios auth |
| todo/tests/dashboard.md | Actif | Validation finale | Scenarios Dashboard |
| todo/tests/main_menu.md | Actif | Validation finale | Scenarios menu |
| todo/tests/preferences_utilisateur.md | Actif | Validation finale | Scenarios preferences |
| todo/tests/projets.md | Actif | Validation finale | Scenarios projets |
| todo/tests/transversal.md | Actif | Validation finale | Scenarios transverses |
| todo/ui_bevy/bevy_ui_integration_zen.md | Specification | Phase 3 ter | Couvert par le dossier |
| todo/ui_bevy/dashboard.md | Specification | Phase 3 ter | Couvert par le dossier |
| todo/ui_bevy/dashboard_bevy_ui_parity_matrix.md | Partiel | Phase 3 ter | Reconcilie |
| todo/ui_bevy/prompt_dashboard_bevy_design.md | Obsolete | Phase 3 ter | Prototype historique |
| todo/ui_bevy/ui_bevy_migration.md | Actif | Phase 3 ter | Migration UI |

## Known active evidence gaps

- Dashboard preview positioning differs by 0.5 px from its focused contract; it is non-blocking and follows Matrix Flower.
- The authentication probe retains focus on the hidden password input after success; Phase 8 owns the regression.
- Web, Tauri and iOS final product acceptance remains open and is not inferred from static contracts.
- Historical progress reports retain their original denominators.

## Completion proof

Every original entry has an audit ID, decision, evidence class and disposition. Every maintained todo document is registered by exact path or governed directory, or archived as completed/obsolete. The permanent checker and its tests reproduce the reconciled count.
