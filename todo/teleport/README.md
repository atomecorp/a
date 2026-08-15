# Téléportation — état d'avancement

Cahier des charges : `todo/3 - teleport.md`.
Contrat développeur : `atome/documentations/teleport.md`.

| Lot | Sujet | État |
| --- | --- | --- |
| 0 | Audit de l'existant | fait — `00_audit.md` |
| 1 | Surface Registry | fait — `01_surface_registry.md` |
| 2 | Teleport Manager (2 phases, ACK/rollback) | fait — `02_teleport_manager.md` |
| 3 | Filtre de rendu + proxy résiduel | fait — `03_render_filter_residual_proxy.md` |
| 4 | Outils contextuels | fait — `04_contextual_tools.md` |
| 5 | Geste au bord | fait — `05_edge_intent_and_destinations.md` |
| 6 | Choix de destination | fait — même fichier |
| 7 | Contrôle distant + trackpad | fait — `07_remote_control_trackpad.md` |
| 8 | Permissions inter-utilisateurs | fait — `08_cross_user_permissions.md` |
| 9 | Résilience / reconnexion | fait — `09_resilience.md` |
| 10 | Maps, documentation, intégration finale | fait — `10_completion.md` |

## Critères d'acceptation du §29

| Critère | État |
| --- | --- |
| un objet quitte une surface sans être dupliqué | tenu par construction — un seul atome, rendu filtré |
| il apparaît sur une autre surface | tenu |
| une icône résiduelle reste sur la source | tenu — icône du jeu + skin eVe |
| l'icône permet de retrouver l'objet et ses actions | tenu — même `id`, outils contextuels actifs |
| geste au bord sans configuration spatiale | tenu |
| cible unique utilisée directement | tenu |
| plusieurs cibles → sélection contextuelle | tenu |
| aucune fenêtre ni menu permanent ajouté | tenu — vérifié par probe |
| toutes les commandes vivent dans la toolbox | tenu |
| trackpad contextuel, pas un écran imposé | tenu — vérifié par probe |
| trackpad indépendant de la téléportation | tenu |
| devices du même compte contrôlables directement | tenu |
| device d'un autre user demande autorisation | tenu |
| l'utilisateur peut rapatrier | tenu |
| l'utilisateur peut laisser/persister | tenu |
| une perte de connexion ne perd pas l'objet | tenu |
| identité unique conservée | tenu |
| destination locale, proche ou distante | distante via Fastify ; pas de découverte de proximité (hors périmètre V1) |

## Ce qui reste ouvert

**Une seule chose : la vérification en application réelle** — deux onglets authentifiés,
geste au bord réel, peinture Bevy, iOS. Reportée explicitement.

Tout le reste est intégré (lot 10, `10_completion.md`) : jeton Fastify Tauri/iOS,
clavier distant appliqué, UI des demandes d'autorisation dans l'inbox existante,
apparence du proxy résiduel avec le skin eVe, retours visuels §20 et §11.1,
prévisualisation distante §9.4, et les 16 clés i18n fr/en.

Points à challenger une fois les tests réels faits, non bloquants :

- seuils du geste au bord (24 px / 450 ms) — valeurs raisonnées, non mesurées ; le §18
  demande de les tester ;
- purge des autorisations expirées (`expires_at` est respecté à la lecture, aucune tâche
  ne nettoie les lignes) ;
- journal d'audit dédié aux sessions ;
- reprise de session de contrôle distant après reconnexion : délibérément non
  automatique, à challenger côté UX.

## Dette repérée en passant (hors périmètre)

- Branche morte `BuiltinHandlers` dans `adole_websocket_message.js:100`.
- Timers infinis dans `eVe/intuition/tools/communication_remote_commands.js`.
- `resolveWsApiPrincipal` traite `_wsApiAuthExpMs === null` comme expiré ; plusieurs
  chemins d'auth écrivent `null`. Concerne toutes les familles typées.

## Lancer les probes

```bash
for p in temp/teleport_*_probe.mjs; do node "$p" || echo "FAIL $p"; done
```
