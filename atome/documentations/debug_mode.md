# Debug Mode (centralisé)

Ce document explique comment activer/désactiver le mode debug pour l'ensemble du framework.

## Résumé rapide

- Drapeau central retenu : `window.__CHECK_DEBUG__` (valeur boolean).
- Helper central : `atome/shared/debug.js` (exporte `isDebugEnabled()`, `shouldLogLevel()`, `wrapConsoleForDebug()`).
- Source unique : variable d'environnement `.env` exposée via `server_config.json`.

## Pourquoi centraliser ?

Consolider le debug sur un seul flag évite la dispersion des contrôles (plus simple à gérer en dev/CI) et permet de filtrer globalement `console.log/info/debug` tout en conservant `warn/error` visibles.

## Où et comment activer

1) Recommandé — via `.env` (servi par `server_config.json`) :

  - Ajoutez `__CHECK_DEBUG__=1` (ou `true`) dans `.env`.
  - Le serveur l'expose dans `server_config.json` et `loadServerConfigOnce()` positionne `window.__CHECK_DEBUG__`.

2) À chaud dans la console devtools :

  ```javascript
  window.__CHECK_DEBUG__ = true;  // activer
  window.__CHECK_DEBUG__ = false; // désactiver
  // pour que le wrapping prenne effet si nécessaire, rappeler wrapConsoleForDebug
  import('/atome/shared/debug.js').then(m => m.wrapConsoleForDebug(console));
  ```

## Effet attendu

- `window.__CHECK_DEBUG__ === true` : `console.log`, `console.info`, `console.debug` seront visibles ; `console.warn` et `console.error` restent toujours visibles.
- `window.__CHECK_DEBUG__` absent ou `false` : `log/info/debug` sont silencieux.

## Fichiers clés

- Helper debug central : `atome/shared/debug.js` (utilisez `isDebugEnabled()` dans votre code).
- Logging / envoi centralisé : `atome/src/squirrel/dev/logging.js` (gestion emission/forwarding), désormais respectueux du flag central.
- Point d'application automatique : `atome/src/squirrel/apis/loadServerConfig.js` (après chargement de `server_config.json`).

## Migration / nettoyage

Si votre code ou vos déploiements définissaient auparavant d'autres flags (par ex. `__SQUIRREL_DISABLE_UI_LOGS__`, etc.), remplacez-les par `__CHECK_DEBUG__`. Les appels consommateurs doivent utiliser `isDebugEnabled()` ou `shouldLogLevel()`.

## Bonnes pratiques

- Activez le debug localement ou via un flag de build lors des tests.
- Ne laissez pas `window.__CHECK_DEBUG__ = true` en production build par défaut — utilisez un build-time mapping ou un process d'environnement pour contrôler le comportement.

## Diagnostic du transport applicatif

- Les opérations métier Atome doivent apparaître sur `/ws/api`, jamais sur une route HTTP CRUD/event/state/snapshot/auth/sharing/sync/user-data.
- `/ws/sync` ne doit produire aucun `welcome` ni événement avant authentification.
- Une capacité native absente doit produire une erreur typée `unsupported` ou équivalente, sans tentative HTTP.
- Le contrôle distant Tauri utilise uniquement `ws://127.0.0.1:3000/ws/control`.
- Exécutez `npm run check:websocket-only-transport` pour détecter une réintroduction statique de transport interdit.

---

Fichier créé : `atome/documentations/debu_mode.md`
