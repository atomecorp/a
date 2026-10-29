# Plan — accès universel par MCP (28 oct. 2026)

Source : `/Users/jean-ericgodard/Desktop/cahier-des-charges-atome-mcp-complete.md`.
Statut : **plan validé par l'utilisateur le 28 oct. 2026, avec les 8 recommandations de la section 1**. Exécution seulement après la fin de la session « Audit atome eVe », sur le code tel qu'il sera alors. Git en lecture seule ; aucun commit.

**Préalable demandé par l'utilisateur (28 oct.), une fois l'audit terminé et avant J0 :** commit de tout l'état local (eVe, puis le parent), push de `main` sur GitHub (eVe d'abord), build iOS envoyée sur TestFlight (`./scripts/XCode_testflight_generator`). La tâche ne commence qu'ensuite.

## 0. Ce que la lecture du code confirme aujourd'hui

- La passerelle `atome/src/squirrel/atome/mcp.js` (≈3 000 lignes avec ses 16 modules) vit **dans la page eVe** (`globalThis.handleAtomeMCPRequestAsync`). Ses seuls appelants sont la voix, l'assistant, les alarmes et le relais distant `teleport/remote_command.js`. **L'interface officielle ne passe pas par elle.**
- Aucun `initialize`, `tools/list`, `tools/call` ou `notifications/initialized` dans `atome/src`, `eVe`, `server` ni `platforms`, et aucune dépendance `@modelcontextprotocol`. Ce n'est pas encore du MCP au sens du protocole : c'est du JSON-RPC maison (`mcp.tools.list`, `runtime.tools.call`).
- L'entrée synchrone `handleAtomeMCPRequest` appelle le handler **sans** politique, capacité ni sandbox (l'entrée asynchrone, elle, les vérifie).
- Les entrées de l'UI officielle passent par quelques goulots seulement, et c'est ce qui rend le chantier faisable :
  1. **BevyUI** : `eVe/domains/rendering/bevy_ui_runtime.js#dispatchRuntimeEvent`. Tous les événements de panneau, et ceux de l'accessibilité, aboutissent à une seule table `state.handlers`.
  2. **Canevas projet** : `surface_runtime.js` → intentions → `project_scene_*` → `Atome.commit`.
  3. **Texte / IME** : `hidden_text_service_runtime.js` + `text_editing_session.js`.
  4. **Outils** : `eVe/intuition/runtime/tool_gateway.js#invokeToolGateway` → `command_bus.js` → runtime d'outils.
  5. **Écouteurs DOM bruts restants** : 62 fichiers, dont 22 dans `atome/src/squirrel/components` et 12 dans `eVe/intuition/tools`. Ils sont à inventorier un par un.
- Il existe déjà un chemin « client extérieur → serveur → page active » : le relais distant (WS → `squirrel:remote-control-command` → passerelle, avec un acteur restreint). C'est la brique à réutiliser pour les clients externes.

## 1. Décisions à prendre maintenant (avant exécution)

| # | Question | Ma recommandation |
| --- | --- | --- |
| D1 | Transport pour les clients externes | **MCP standard (version 2025-11-25) via stdio** : un petit pont JS lancé par le client MCP (`tools/mcp_bridge/`), qui parle au serveur par `/ws/api` (relais existant) et atteint l'instance eVe active. Aucune nouvelle route HTTP, donc conforme au module 05. Streamable HTTP seulement si tu l'autorises explicitement (ce serait une exception au module 05). |
| D2 | Comment l'UI officielle « passe par MCP » | **Dans le même processus** : l'UI officielle est un client MCP local de la même passerelle (aucun réseau, aucune sérialisation JSON). Chaque entrée brute (pointeur, touche, molette, IME, accessibilité) devient un appel de l'outil `input.dispatch` portant une liste ordonnée d'événements, contrôlée **avant** l'effet. Les tables de handlers deviennent privées : seule la porte peut les atteindre. |
| D3 | Deux niveaux d'outils | **Les deux** : (a) `input.*` pour les gestes fins, rejouables et fidèles (exigé par le cahier) ; (b) les outils sémantiques déjà existants (`projects.open`, `ui.settings.set`…) pour les interfaces alternatives. L'UI officielle utilise (a), et (a) aboutit aux mêmes propriétaires que (b). |
| D4 | État lisible par une autre interface | Ressources MCP sérialisables (`resources/read` + `notifications/resources/updated`) pour vues, sélection, édition, progression et erreurs, avec numéro de séquence et relecture complète. **Jamais** les objets du renderer. |
| D5 | Identité des clients externes | Jeton d'appairage émis par l'utilisateur depuis eVe ; droits restreints par défaut (modèle de l'acteur du relais distant), révocables. Les capacités déclarées par le client sont ignorées. |
| D6 | Plateformes | Web d'abord (je valide). Ensuite Tauri, puis iOS : c'est toi qui testes sur l'appareil. Android, AUv3 et Pure OS restent dans l'inventaire et seront chiffrés après J4. |
| D7 | Seuils de performance de départ | À confirmer après les mesures de J3. Proposition : surcoût de la porte en processus p95 < 0,5 ms par lot, p99 < 2 ms ; **0 événement perdu ou réordonné** ; aucune image manquée en plus sur le dessin, le glisser et le défilement ; clavier iOS et AudioContext toujours ouverts dans le même tour de geste. |
| D8 | Client alternatif de réception | Un client JS minimal **sans IA** (Node, dans `tools/mcp_reference_client/`) : découvrir, lire l'état, appeler, recevoir une mise à jour, gérer une erreur, faire un tracé continu et une saisie de texte. |

## 2. Phase 1 — Faisabilité (première tranche, ~20–40 JP selon le cahier)

**J0 — Référence.** Je note les commits atome/eVe et les modifications locales après l'audit. Je fixe la liste des scénarios : réglage du niveau, assistant marche/arrêt, recherche, ouverture de projet, dessin, saisie et couleur du texte, défilement, glisser-déposer, démarrage/arrêt audio, import média.

**J1 — Inventaire vérifiable** (`todo/mcp_universal_access_matrix.md`), généré autant que possible par des sondes, pas à la main :
- Lister les handlers enregistrés dans BevyUI pour chaque écran parcouru par Playwright (arbre, nœud, événement → propriétaire).
- Classer les 62 fichiers à écouteurs DOM bruts : entrée utilisateur, service interne ou frontière système.
- Rapprocher le catalogue de la passerelle (544 outils runtime / 189 IA, à remesurer) des écrans réels.
- Requalifier les anciens « hors MCP » des ledgers (survol, focus, pression, dépôt).
- Pour chaque ligne : source, propriétaire, mutation, droits, retour, plateforme, statut (exposé / obligatoire / contourné / limite système).

**J2 — Vrai protocole MCP, tranche verticale.**
- Ajouter le cycle standard (`initialize` / `initialized`, `tools/list`, `tools/call`, `resources/*`, notifications) **dans la passerelle existante**, comme couche de protocole au-dessus des handlers actuels. Pas de second moteur.
- Unifier les contrôles : l'entrée synchrone passe par la même politique que l'asynchrone, et la validation se fait avant l'effet partout.
- Écrire le pont stdio (D1) en réutilisant le relais distant, avec l'acteur appairé (D5).
- Preuve : le client de référence fait découverte → `projects.open` → effet canonique → état relu → erreur et refus effectif.

**J3 — Gestes et performance (le point dur).**
- Mesurer d'abord le chemin direct actuel (Playwright avec vrais clics sur le canevas, ticks Bevy, latence entrée → image).
- Prototyper `input.dispatch` en processus sur 4 cas : un panneau BevyUI (réglages), le dessin continu, la saisie texte/IME, le défilement à la molette.
- Coût à surveiller : la passerelle crée aujourd'hui un enregistrement d'opération, un événement et des clones à chaque appel. Les entrées fines auront une voie légère : lot ordonné, sans clone profond, journal en anneau. Les contrôles de droits restent actifs ; seule la comptabilité est allégée.
- Vérifier sur Web que le clavier (service caché) et l'AudioContext restent préparés **dans le même tour de geste**. Sur iOS, c'est toi qui testes.

**J4 — Revue et chiffrage révisé.** Je te remets la matrice, les mesures direct/MCP, les limites système (sélecteurs natifs, feuilles iOS, sites tiers embarqués) et un plan de vagues rechiffré. **Point d'arrêt : tu décides de la généralisation.**

## 3. Phase 2 — Migration par vagues (après ton accord à J4)

Chaque vague suit le cycle du cahier : mesure avant → modification → mesure après → correction jusqu'au seuil. Ensuite, la matrice est mise à jour et l'accès direct de la vague est fermé (pas de repli silencieux).

1. **J5 — Entrées communes** : la porte devant `dispatchRuntimeEvent` (BevyUI et accessibilité), devant les intentions du canevas, devant le service texte et devant `invokeToolGateway`. Ces quatre goulots couvrent d'un coup la plupart des écrans.
2. **Vague A** : réglages, niveau utilisateur, assistant, navigation, Dashboard, projets, recherche.
3. **Vague B** : éditeurs (dessin, texte, styles, sélection), glisser-déposer, Timeline/Molecule.
4. **Vague C** : médias, import, capture, audio/vidéo (commande par MCP, flux hors MCP), communication, activités.
5. **Vague D** : les écouteurs DOM restants de `atome/src/squirrel/components`, frontières natives Tauri/iOS, plugins, sites embarqués (limites nommées).
6. **J7 — Réception** : garde anti-contournement en script (`scripts/check_mcp_only_input.mjs`) qui refuse tout nouvel écouteur d'entrée hors porte. S'y ajoutent les sondes comparatives conservées dans `tests/`, la mise à jour des cartes et de FRAMEWORK_STATE, et le rapport de réception avec ses limites.

## 4. Ce que je ne ferai pas sans te demander

- Ajouter une route HTTP ou une dépendance (SDK MCP officiel compris : le protocole sera écrit en JS dans la passerelle).
- Retirer une fonctionnalité ou accepter un écart de performance.
- Déclarer « tout est MCP » sur la seule base d'un nombre d'outils ou d'une sonde simulée.
- Toucher à Git.
