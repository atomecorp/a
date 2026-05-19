# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Thinkpad – Functional Memo (Draft Specification)

1. Folder / List Concept for Documents

Objective

Provide a way to group multiple documents or captures into logical containers (folders or lists) instead of always placing them directly into a project canvas.

Behavior
 • When multiple files are dropped at once:
 • The system creates a container (folder/list) automatically.
 • The container holds the dropped elements as a structured list.
 • When multiple captures are made in sequence:
 • They are grouped into a single container (list or folder).
 • Containers are:
 • Independent objects (not necessarily tied directly to the main project view).
 • Usable as intermediate organization layers.

Goals
 • Reduce clutter on project canvas.
 • Provide semantic grouping (“these belong together”).
 • Allow later transformation (list → project → structured view).

⸻

1. Calendar Enhancements

Required Views
 • Daily view (existing).
 • Weekly view (mandatory).

Search & Filters
 • Add a search system with filters:
 • Filter by date range.
 • Filter by event type.
 • Filter by keywords.
 • Search UI must:
 • Reuse the global search module.
 • Automatically focus on calendar data (events + dates).

Settings & Preferences
 • Add a dedicated settings icon in calendar UI.
 • Settings panel must allow:
 • Start of week selection (Monday, Sunday, etc.).
 • Display preferences.
 • Default view (day/week).

⸻

1. News Wall (Special Matrix Project)

Structure
 • Create a special project in the Matrix called: News.
 • This project is divided vertically:
 • Top section: live incoming news / notifications.
 • Bottom section: content threads and responses.

News Filtering Engine
 • Built-in filtering engine allowing selection of:
 • Specific friends.
 • Subscribed users.
 • Topics (e.g., Music, Art, Tech, etc.).
 • User can configure:
 • Which sources are allowed.
 • Which themes are shown.

Interaction
 • Each news item supports threaded responses.
 • Response types:
 • Text.
 • Audio.
 • Video.
 • Behavior is similar to:
 • Instagram comments.
 • Facebook feed reactions.

⸻

1. Capture Tool (Video / Audio / Photo)

Default Behavior (Single Click)
 • A single click on the tool:
 • Immediately starts capture based on default mode.

Default mode options:
 • Video.
 • Audio.
 • Last used tool.

Long Click (Advanced Mode)
 • A long click:
 • Opens tool selection panel:
 • Video.
 • Audio.
 • Photo.

Intent Detection & Cancellation Logic

Case 1 – Immediate correction
 • User single-clicks (video starts).
 • User long-clicks and selects another mode within a short delay (e.g. < 2s).
 • System behavior:
 • Cancel and delete current capture.
 • Start selected mode (audio/photo/etc.).

Case 2 – Delayed confirmation
 • User single-clicks (video starts).
 • User changes tool after a longer delay (e.g. > 10s).
 • System behavior:
 • Do NOT cancel previous capture.
 • Treat new tool as intentional second action.

Photo special rule
 • If user switches to Photo and takes a second photo:
 • No cancellation.
 • System assumes user intent was Photo mode.

Preferences
 • User can set default behavior:
 • Always Video.
 • Always Audio.
 • Last used tool.

⸻

1. Global Goal

These features aim to:
 • Improve cognitive organization (lists, folders, grouping).
 • Improve temporal organization (calendar).
 • Improve social and informational flow (news wall).
 • Improve capture ergonomics (fast intent-based recording).

⸻

Status

Draft – to be refined into full technical spec later.

🚀 EXECUTION MASTER PLAN — eVe Intuition Refactor

🎯 OBJECTIF

Exécuter l’ensemble des corrections, factorisations et optimisations identifiées dans l’audit.

⚠️ Ne pas s’arrêter tant que toutes les tâches ne sont pas réalisées.
⚠️ Traiter UNE tâche à la fois.
⚠️ Chaque tâche doit être validée avant de passer à la suivante.

⸻

🔒 CONTRAINTES ABSOLUES

 1. Conserver 100% des fonctionnalités existantes.
 2. Respecter strictement :

eve/application/documentations/**

 1. Aucune suppression de comportement documenté.
 2. Aucune refactorisation non demandée dans le ticket en cours.
 3. Aucun fallback silencieux.
 4. Aucun changement de logique métier.
 5. Tous les patchs doivent être rétrocompatibles.

⸻

📦 MÉTHODOLOGIE OBLIGATOIRE

Pour chaque tâche :

1️⃣ Identifier précisément les fichiers concernés.
2️⃣ Produire un diff minimal (unified diff).
3️⃣ Lister les imports/exports impactés.
4️⃣ Fournir les commandes de vérification (grep / lint / build).
5️⃣ Confirmer que le patch ne modifie pas la logique métier.
6️⃣ Valider avant de passer à la tâche suivante.

Aucune tâche suivante ne doit être commencée tant que la précédente n’est pas entièrement validée.

⸻

🧩 PHASE 1 — CORRECTIONS CRITIQUES IMMÉDIATES

Tâche 1

Remplacer tout require() dans module ES (tools/communication.js) par import ES valide.

Tâche 2

Déplacer mtraxCloseInFlightGuard au-dessus de toute utilisation dans eVeIntuition.js.

Tâche 3

Unifier les préfixes de sélection :
 • Export unique depuis runtime/selection.js
 • Import dans runtime/selection_snapshot.js
 • Supprimer la duplication locale

Tâche 4

Renommer ensureString → isString dans contracts/validator.js.

Tâche 5

Ajouter destroyLayerInvariantObserver() dans runtime/layer_contract.js et connecter au cycle de destruction.

⸻

🧩 PHASE 2 — FACTORISATION STRUCTURELLE

Tâche 6

Créer shared/utils.js et migrer progressivement :
 • ensureString
 • isPlainObject
 • deepClone
 • deepMerge

Tâche 7

Créer shared/media_types.js et supprimer duplications.

Tâche 8

Centraliser les constantes de layers et panel TTL.

Tâche 9

Factoriser le locking via runtime/in_flight_lock.js.

Tâche 10

Unifier readExplicitLatchedState / readExplicitLatched.

⸻

🧩 PHASE 3 — SIMPLIFICATION MAJEURE (STRANGLER PATTERN)

Tâche 11

Extraire la gestion des panels depuis eVeIntuition.js vers intuition_/runtime/panel_api.js.

Tâche 12

Supprimer la façade MTrax legacy et recâbler les points d’entrée sur les modules runtime Intuition.

Tâche 13

Extraire la gestion group timeline vers intuition_/runtime/group_timeline_api.js.

Tâche 14

Nettoyage systématique des addEventListener non désinscrits.

Tâche 15

Nettoyage systématique des setTimeout non clear.

⸻

🔍 VÉRIFICATIONS OBLIGATOIRES APRÈS CHAQUE TÂCHE
 • grep pour vérifier disparition des duplications
 • vérification imports/exports
 • lint sans erreur
 • build sans erreur
 • aucune modification de comportement documenté

⸻

🧠 RÈGLE FINALE

Ne jamais :
 • Regrouper plusieurs tâches dans un seul patch.
 • Introduire de refactorisation opportuniste.
 • Modifier du code hors du périmètre du ticket.

Toujours :
 • Patch minimal.
 • Validation complète.
 • Passage à la tâche suivante uniquement après confirmation.

⸻

🏁 FIN D’EXÉCUTION

L’exécution est terminée uniquement lorsque toutes les tâches (1 à 15) sont réalisées et validées.
