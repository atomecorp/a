# Audit MCP / voix — tout le framework (26 oct. 2026)

Demande utilisateur : vérifier que tout soit accessible en MCP par la voix (toutes les API, tout le framework) et corriger.

Contrat : chaque action d'écran a sa commande MCP sur le même chemin canonique (AGENTS.md règle 6) ; elle est
visible de l'assistant (`ai.tools.list` / `runtime.tools.list`, `conversation_session.prepareTools`), autorisée par
`mcp_security_policy.js` / `mcp_security.js`, et appelée par l'outil d'écran lui-même.

Catalogue réel mesuré (sonde `temp/mcp_voice_audit/catalog.probe.mjs`, app Web, utilisateur connecté) :
544 outils runtime, 189 outils IA, 285 méthodes MCP — liste dans `temp/mcp_voice_audit/out/catalog_names.txt`.

## Étapes
1. Inventaire par zone (Dashboard/réglages, Santé/agenda/objectifs, médias, communication, projet/canevas).
2. Écarts : action d'écran sans commande, commande non visible de l'assistant, commande refusée par la politique.
3. Corrections dans les propriétaires canoniques + sonde MCP sur l'app réelle.
4. Rapport.
