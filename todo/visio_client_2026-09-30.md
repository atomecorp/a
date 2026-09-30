# Client d'appel visio / audio en direct (tâche séparée, 30 sept. 2026)

Issue de `communication_news_broadcast_2026-09-30.md` (décision D5) : hors périmètre de cette
mission.

## Constat
- SFU mediasoup côté serveur (`server/visio.js`, `/ws/visio` dans `visio_ws_handler.js`, routes
  HTTP `visio_routes.js`) : `joinRoom`, `createTransport`, `produce`, `consume`…
- **Aucun client** dans `eVe/` ni `atome/src/` (pas de `mediasoup-client`, pas de
  `RTCPeerConnection`), hors `eVe/R&D`.
- Les failles d'identité serveur sont corrigées par la mission Communication (lot L9).

## À faire
- [ ] Client `mediasoup-client` (ou WebRTC direct) branché sur `/ws/visio` authentifié par JWT.
- [ ] Appel audio et vidéo entre deux contacts acceptés ; refus si non-contact ou bloqué.
- [ ] Surface d'appel dans l'outil Communication (appel entrant = notification dans l'inbox).
- [ ] Vérification réelle à deux navigateurs (flux audio/vidéo reçus), Tauri et iOS séparément.
