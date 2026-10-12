# Tâche numéro 1 — Plugin OpenAI ↔ Atom

# Plugin OpenAI ↔ Atom — plan d’implémentation

## Objectif

Créer un plugin **Atom** installable dans OpenAI/ChatGPT, capable de découvrir et d’appeler les fonctions d’Atom via **MCP**, sans créer une seconde API métier parallèle.

Principe central :

```text
ChatGPT / OpenAI
      ↓
Plugin Atom
      ↓
MCP standard
      ↓
Atom MCP Gateway
      ↓
MCP Atom existant
      ↓
Runtime V2 / Tool Gateway
      ↓
Atom / eVe
```

Le plugin OpenAI n’est qu’un client/adaptateur. La logique métier, les permissions, les confirmations, l’historique, les mutations et les règles de sécurité restent dans Atom.

---

## 1. Réutiliser le MCP Atom existant

Atom possède déjà un runtime MCP interne avec notamment :

- `handleAtomeMCPRequestAsync()` ;
- `runtime.tools.call` ;
- `runtime.tools.batch_call` ;
- `ai.tools.call` ;
- `atome.create` ;
- `mcp.tools.list` ;
- `mcp.resources.list` ;
- `mcp.resources.read` ;
- `mcp.prompts.list` ;
- `mcp.prompts.get` ;
- `mcp.toolchains.execute` ;
- `mcp.operations.*` ;
- contrôle des capabilities ;
- sandbox ;
- rate-limit ;
- idempotence ;
- confirmations ;
- journal de sécurité ;
- suivi de progression et opérations différées.

Il ne faut donc pas reconstruire un autre moteur MCP pour OpenAI.

À faire : créer une **couche d’adaptation MCP standard**, appelée par exemple :

```text
Atom MCP Gateway
```

Cette couche traduit le protocole MCP attendu par OpenAI vers les appels Atom existants.

---

## 2. Exposer une vraie surface MCP standard

Le gateway doit exposer un endpoint HTTPS, par exemple :

```text
https://mcp.atom.app/mcp
```

En développement :

```text
http://localhost:3000/mcp
```

Le serveur doit supporter au minimum :

```text
initialize
tools/list
tools/call
resources/list
resources/read
prompts/list
prompts/get
```

Puis traduire vers Atom :

```text
tools/list      → mcp.tools.list
tools/call      → runtime.tools.call / ai.tools.call / méthodes sémantiques Atom
resources/list  → mcp.resources.list
resources/read  → mcp.resources.read
prompts/list    → mcp.prompts.list
prompts/get     → mcp.prompts.get
```

---

## 3. JavaScript uniquement

Le connecteur doit rester compatible avec la politique du projet : **JavaScript pur**, pas de TypeScript obligatoire.

Dépendances minimales possibles :

```bash
npm install @modelcontextprotocol/sdk zod
```

Structure suggérée :

```text
integrations/
└── openai/
    └── atom_plugin/
        ├── plugin.json
        ├── mcp.json
        ├── server/
        │   ├── server.js
        │   ├── atom_bridge.js
        │   ├── auth.js
        │   ├── tools.js
        │   └── resources.js
        └── skills/
            └── atom/
                ├── SKILL.md
                └── references/
                    ├── atom_model.md
                    ├── atom_commands.md
                    └── security.md
```

---

## 4. Bridge minimal vers Atom

Le gateway doit rester très mince.

Exemple conceptuel :

```js
export async function callAtom(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params
  };

  const response = await globalThis.handleAtomeMCPRequestAsync(request);

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.result;
}
```

Aucune logique métier importante ne doit être déplacée ici.

Le bridge :

- traduit les schémas ;
- injecte l’identité de l’acteur ;
- transmet les métadonnées ;
- restitue les erreurs proprement ;
- conserve les identifiants d’opérations ;
- ne contourne jamais le Tool Gateway.

---

## 5. Outils exposés à ChatGPT

Ne pas exposer immédiatement des centaines de fonctions internes.

Créer d’abord une petite surface sémantique stable :

```text
atom_status

project_list
project_get
project_open
project_create
project_save

atom_list
atom_get
atom_create
atom_update
atom_delete

selection_get
selection_set

file_list
file_read
file_create
file_update

tool_list
tool_execute

action_undo
action_redo
```

Puis ajouter progressivement :

```text
text_*
draw_*
audio_*
video_*
calendar_*
communication_*
share_*
```

Les outils OpenAI doivent rester des façades sémantiques.

Exemple :

```text
atom_create
      ↓
atome.create
      ↓
Runtime V2
      ↓
Tool Gateway
```

---

## 6. Ne jamais dupliquer le Runtime

Règle non négociable :

```text
OpenAI tool
   ↓
Atom MCP Gateway
   ↓
Runtime / Tool Gateway existant
   ↓
mutation canonique
```

Interdit :

- manipuler directement le DOM ;
- écrire directement dans un état interne pour contourner Runtime V2 ;
- créer une API OpenAI distincte des outils Atom ;
- ajouter des chemins de mutation spécifiques au plugin ;
- dupliquer les permissions ou règles métier dans le plugin.

---

## 7. Exemple d’appel

Utilisateur :

```text
Crée un texte “Bonjour” au centre du projet courant.
```

ChatGPT appelle :

```json
{
  "name": "atom_create",
  "arguments": {
    "type": "text",
    "content": "Bonjour",
    "position": {
      "x": 0.5,
      "y": 0.5
    }
  }
}
```

Le plugin convertit vers :

```text
atome.create
```

Puis Atom résout l’outil Runtime V2 approprié.

---

## 8. Fichiers

Ne jamais exposer un accès filesystem arbitraire à ChatGPT.

Préférer des outils bornés :

```text
file_list
file_read
file_create
file_update
file_delete
```

Avec une racine contrôlée :

```text
/project/
```

Interdire :

```text
../
/etc
~/
chemins absolus non autorisés
sorties par symlink
```

Les droits doivent être déterminés par le contexte Atom et les capabilities de l’acteur.

---

## 9. Identité et authentification

Réutiliser **Keycloak** comme fournisseur OAuth/OIDC.

Architecture :

```text
ChatGPT
   ↓ OAuth 2.1 / PKCE
Keycloak
   ↓ access token
Atom MCP Gateway
   ↓ actor Atom
MCP Atom
```

Chaque connexion OpenAI doit être traduite en acteur Atom, par exemple :

```json
{
  "actor_id": "openai:<user-id>",
  "source": "openai_plugin",
  "capabilities": [
    "project.read",
    "project.write",
    "runtime.execute"
  ]
}
```

Le token ne doit pas décider seul des opérations finales : le moteur de politiques Atom garde le dernier mot.

---

## 10. Sécurité et confirmations

Le serveur doit conserver les contrôles Atom déjà présents :

```text
resolveActorProfile()
resolveAccessPolicy()
hasActorCapability()
hasSandboxProfile()
readIdempotencyRecord()
consumeRateLimit()
validateConfirmation()
```

Chaque outil doit posséder une classification de risque explicite :

```text
read
write
destructive
external
communication
financial
privileged
```

Éviter les règles basées seulement sur des noms ou patterns de chaînes.

Exemple :

```js
{
  id: 'atom.delete',
  permissions: ['project.write'],
  risk: 'destructive',
  confirmation: 'required'
}
```

La confirmation OpenAI ne doit jamais remplacer la confirmation Atom.

Flux :

```text
Utilisateur
   ↓
ChatGPT
   ↓ confirmation éventuelle OpenAI
Atom MCP
   ↓ vérification capabilities
   ↓ vérification policy
   ↓ confirmation Atom si nécessaire
Runtime
```

---

## 11. Idempotence

Les appels susceptibles d’être rejoués doivent transporter une clé d’idempotence :

```text
idempotency_key
```

Particulièrement important pour :

- création ;
- suppression ;
- export ;
- envoi de message ;
- partage ;
- paiement ou opération externe future ;
- toolchains.

Le retry réseau ne doit jamais créer deux objets identiques par accident.

---

## 12. Opérations longues

Réutiliser le mécanisme d’opérations différées Atom.

Exemple :

```json
{
  "defer": true
}
```

Réponse :

```json
{
  "ok": true,
  "deferred": true,
  "operation_id": "..."
}
```

Puis :

```text
operation_status
operation_cancel
```

Ces opérations sont nécessaires pour :

- séparation de stems ;
- rendu vidéo ;
- génération IA ;
- import lourd ;
- export ;
- conversion audio ;
- indexation.

---

## 13. Toolchains et commandes composées

Une instruction naturelle peut déclencher plusieurs opérations.

Exemple :

```text
Crée une page, ajoute un titre et trois blocs texte.
```

Le plugin peut utiliser :

```text
mcp.toolchains.execute
```

ou un batch Runtime lorsque toutes les étapes sont compatibles.

À ajouter idéalement :

```text
transaction_begin
transaction_execute
transaction_commit
transaction_rollback
```

Objectif : éviter un projet partiellement modifié lorsqu’une étape intermédiaire échoue.

---

## 14. Resources MCP

Les ressources permettent à ChatGPT de lire le contexte sans convertir chaque lecture en outil.

Exemples :

```text
atom://project/current
atom://project/current/selection
atom://project/current/tree
atom://project/current/files
atom://runtime/tools
atom://runtime/status
```

Une ressource doit être :

- bornée ;
- documentée ;
- filtrée selon les droits ;
- peu coûteuse ;
- sans mutation implicite.

---

## 15. Prompts MCP

Les prompts peuvent fournir des workflows officiels Atom :

```text
create_project
analyse_project
refactor_plugin
prepare_performance
export_media
```

Ils doivent décrire un workflow, pas cacher des permissions ou contourner Runtime.

---

## 16. Skill OpenAI Atom

Le plugin doit contenir un skill expliquant au modèle comment utiliser Atom correctement.

Fichier :

```text
skills/atom/SKILL.md
```

Contenu minimum :

```markdown
# Atom

Atom est un environnement créatif modulaire universel.

Principes :
- tout objet visible est un Atome ou une molécule ;
- les tools sont des contrôles et ne changent pas de structure ;
- les atomes/molécules peuvent changer de représentation Naturel/Liste/Matrice ;
- utiliser les outils sémantiques Atom ;
- ne jamais manipuler directement le DOM ;
- ne jamais contourner le Tool Gateway ;
- conserver les règles de géométrie et d’UI Atom ;
- travailler avec des chemins relatifs au projet ;
- demander confirmation pour toute opération déclarée sensible.
```

Séparation importante :

```text
Skill = compréhension de la philosophie et des workflows
MCP   = état réel, données et actions
```

---

## 17. Plugin OpenAI

Le paquet OpenAI doit déclarer :

- son nom ;
- sa version ;
- son MCP ;
- son skill Atom ;
- éventuellement une interface UI plus tard.

Conceptuellement :

```json
{
  "name": "Atom",
  "version": "1.0.0",
  "description": "Create, inspect and control Atom projects from OpenAI.",
  "skills": "./skills/",
  "extensions": {
    "com.openai": {
      "mcp": "atom"
    }
  }
}
```

Le schéma exact du manifest doit être vérifié au moment de l’implémentation contre la spécification OpenAI courante.

---

## 18. Développement local

Pour commencer, ne pas exposer Atom publiquement.

Architecture de test :

```text
ChatGPT
   ↓
Secure MCP Tunnel / tunnel de développement
   ↓
localhost:3000/mcp
   ↓
Atom MCP Gateway
   ↓
Atom
```

Étapes :

1. lancer Atom ;
2. lancer le MCP Gateway ;
3. tester avec MCP Inspector ;
4. vérifier `initialize` ;
5. vérifier `tools/list` ;
6. appeler un outil read-only ;
7. appeler `atom_create` ;
8. vérifier les confirmations ;
9. vérifier l’idempotence ;
10. connecter le MCP à OpenAI en mode développeur.

---

## 19. Production

Architecture recommandée :

```text
OpenAI / ChatGPT
       ↓
https://mcp.atom.app/mcp
       ↓
Atom MCP Gateway
       ↓
Session Router
       ↓
connexion sortante sécurisée depuis l’appareil
       ↓
Atom local
```

Atom reste local-first.

Le serveur distant peut servir principalement de relais et d’authentification, sans devenir propriétaire des projets.

---

## 20. Multi-device

Prévoir dès le début :

```text
devices_list
device_get_active
device_set_active
```

Exemple :

```json
{
  "devices": [
    {
      "id": "mac-studio",
      "type": "desktop",
      "online": true
    },
    {
      "id": "iphone",
      "type": "mobile",
      "online": true
    },
    {
      "id": "ipad",
      "type": "tablet",
      "online": false
    }
  ]
}
```

Permettre ensuite :

```text
Fais-le sur mon Mac.
Ouvre le projet sur mon iPad.
Envoie le rendu vers mon iPhone.
```

---

## 21. iOS / Tauri

Ne pas supposer qu’un serveur HTTP local reste accessible en permanence sur iOS.

Préférer une connexion sortante sécurisée :

```text
Atom iOS
   ↓ WSS
Atom Relay
   ↑
MCP Gateway
```

Le relay route vers la session active.

Le même mécanisme peut servir sur macOS, iOS et autres cibles.

---

## 22. Voix OpenAI

Le plugin MCP et la voix doivent rester découplés.

Si le client ChatGPT utilisé ne permet pas encore d’appeler directement un plugin depuis son mode vocal, utiliser l’API OpenAI Realtime comme pont vocal :

```text
Micro
  ↓
OpenAI Realtime
  ↓ tool call
Atom Voice Bridge
  ↓
Atom MCP Gateway
  ↓
Atom
```

Les mêmes outils MCP doivent être réutilisés.

Ne jamais créer un jeu d’actions vocales différent du MCP.

Quand la voix ChatGPT accepte directement le plugin, elle peut appeler le même serveur MCP sans modifier Atom.

---

## 23. API vocale et API texte identiques

Règle :

```text
ChatGPT texte ─┐
               ├→ Atom MCP Gateway → Atom
OpenAI Voice ──┘
```

Ainsi :

- même sécurité ;
- mêmes schemas ;
- mêmes confirmations ;
- même historique ;
- mêmes tests ;
- même runtime ;
- aucune duplication métier.

---

## 24. Tests obligatoires

Chaque outil exposé au plugin doit avoir :

### Contrat
- schéma d’entrée valide ;
- schéma de sortie stable ;
- description claire ;
- niveau de risque ;
- capabilities requises.

### Fonctionnel
- appel direct Atom ;
- appel MCP ;
- appel depuis OpenAI ;
- même résultat métier dans les trois cas.

### Sécurité
- utilisateur autorisé ;
- utilisateur non autorisé ;
- sandbox insuffisante ;
- confirmation absente ;
- confirmation invalide ;
- retry ;
- clé d’idempotence réutilisée ;
- input malformé ;
- tentative d’accès fichier hors projet.

### Régression
- UI ;
- Runtime V2 ;
- historique ;
- undo/redo ;
- partage ;
- collaboration ;
- sync ;
- iOS/Tauri.

### Performance
Mesurer notamment :

- `tools/list` ;
- appel read-only simple ;
- appel `atom_create` ;
- toolchain ;
- round-trip local ;
- round-trip distant ;
- coût du bridge seul ;
- coût total réseau.

Le bridge ne doit pas masquer le coût réel du Runtime Atom.

---

## 25. Logs et observabilité

Chaque appel doit pouvoir être corrélé par :

```text
trace_id
intent_id
operation_id
actor_id
idempotency_key
```

Journaliser :

- outil demandé ;
- outil réellement résolu ;
- acteur ;
- policy appliquée ;
- confirmation ;
- durée ;
- succès/échec ;
- résultat résumé ;
- device cible ;
- origine : `openai_plugin`, `openai_voice`, `atom_ui`, etc.

Ne pas journaliser inutilement les contenus privés complets.

---

## 26. Versioning

Versionner indépendamment :

```text
Atom Runtime
Atom MCP internal contract
Atom MCP Gateway
Plugin OpenAI Atom
Skill Atom
```

Le gateway doit absorber autant que possible les changements internes afin de préserver la surface OpenAI.

Prévoir :

```text
protocol_version
plugin_version
runtime_version
capabilities_version
```

---

## 27. Compatibilité avec la norme plugin Atom

Le connecteur OpenAI doit respecter la distinction :

```text
Plugin Atom      = paquet/distribution de capacités
Connecteur       = adaptation vers un service externe
MCP              = interopérabilité IA
Runtime V2       = propriétaire canonique des actions
```

Le serveur MCP n’est pas lui-même le moteur métier du plugin.

Le plugin ne devient jamais propriétaire du menu, du renderer, de l’état global ou du moteur de mutation.

---

## 28. Ordre d’implémentation recommandé

### Phase 1 — Adapter MCP

Créer :

```text
initialize
tools/list
tools/call
```

Branchés au MCP Atom existant.

### Phase 2 — MVP 5 outils

```text
atom_status
project_list
project_open
atom_create
atom_update
```

### Phase 3 — Test local

- MCP Inspector ;
- tunnel sécurisé ;
- connexion OpenAI Developer Mode.

### Phase 4 — Skill Atom

Créer `skills/atom/SKILL.md`.

### Phase 5 — Fichiers et édition

Ajouter :

```text
file_list
file_read
file_create
file_update
selection_get
selection_set
action_undo
action_redo
```

### Phase 6 — Sécurité complète

- Keycloak ;
- OAuth 2.1 ;
- capabilities ;
- classification de risque ;
- confirmation forte ;
- idempotence ;
- journalisation.

### Phase 7 — Opérations et toolchains

- opérations différées ;
- progression ;
- annulation ;
- batch ;
- transactions.

### Phase 8 — Relay et multi-device

- sessions ;
- devices ;
- routage ;
- reconnexion ;
- offline/online.

### Phase 9 — Voix

- OpenAI Realtime ;
- réutilisation exacte des mêmes outils MCP.

### Phase 10 — Publication

- manifest final ;
- documentation ;
- tests d’installation ;
- permissions ;
- versioning ;
- éventuelle publication du plugin.

---

## 29. Critère de réussite

Le connecteur est considéré correctement implémenté seulement si cette même intention :

```text
Créer un texte “Bonjour” dans le projet courant.
```

produit le même résultat métier lorsqu’elle est exécutée :

```text
UI Atom
Plugin Atom
MCP direct
OpenAI ChatGPT
OpenAI Realtime / voix
```

avec :

- mêmes permissions ;
- même Runtime V2 ;
- même historique ;
- même undo/redo ;
- même politique de confirmation ;
- même journalisation ;
- aucune route de mutation parallèle.

---

## 30. Règle finale

**Une fonction Atom ne doit jamais être développée spécifiquement pour OpenAI. Elle doit exister une seule fois dans Atom, être exposée proprement via le Runtime/Tool Gateway, puis rendue accessible à OpenAI par MCP.**

Cette règle garantit :

- modularité ;
- compatibilité future avec d’autres IA ;
- maintenabilité ;
- sécurité ;
- cohérence UI/MCP/plugin ;
- absence de duplication ;
- possibilité de remplacer OpenAI ou d’ajouter d’autres clients sans modifier le cœur Atom.
---

---

## Action suivante

La précédente **Tâche numéro 2** a été extraite dans un document autonome pour garder cette roadmap lisible :

**→ `/atome/Roadmap/Action 2.md` — Intégration OpenAI native complète dans Atom**

Ce document est désormais la source de vérité pour l’intégration OpenAI native (conversation texte, Realtime vocal, MCP, image, multimodal, modèles, raisonnement, outils et prompt Codex).
