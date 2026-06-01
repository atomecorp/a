# Prompt — Rendre le format Atome universel

Date : 2026-05-29  
Statut : en cours  
Objet : faire évoluer le format Atome actuel vers une forme canonique unique, extensible et capable de couvrir les capacités fonctionnelles cibles de l'écosystème eVe.

Ce document doit être suffisant à lui seul pour guider la migration du format Atome. Il ne dépend pas d'un autre plan de conception.

---

## État d'exécution — 2026-06-01

Statut : en cours.

Avancement estimé : 90 %. Reste estimé : 10 %.

Réalisé :

- Le contrat Atome accepte maintenant le mode universel via `normalizeCanonicalAtome(..., { universal: true })`.
- L'enveloppe enrichie couvre `schema_version`, `capabilities`, `interfaces`, `composition`, `policy` et `lifecycle` avec valeurs par défaut sûres.
- `sanitizeAtomeEnvelope` sépare enveloppe, `meta`, `properties` et champs inconnus quarantainés.
- Un registre de types minimal existe via `registerAtomeType`, `getAtomeType` et `listAtomeTypes`.
- Les tools peuvent être projetés comme Atomes spécialisés via `toolToUniversalAtome`.
- Aucune API publique `fromLegacy...` ou `toLegacy...` n'est ajoutée ni tolérée.
- `atome_contract.js` a été refactoré en propriétaires cohésifs : contrat central, contrat universel et erreur de contrat.
- `database/adole_storage_projection.js` isole la sérialisation SQL comme frontière de stockage, sans format Atome legacy public.
- `database/adole_schema_migrations.js` isole les migrations additives ADOLE hors du fichier de persistance principal.
- `database/adole.js` expose maintenant une enveloppe canonique pour `getAtome`, `getStateCurrent` et `listStateCurrent`.
- `server/atomeRoutes.orm.js` a été réduit en orchestrateur de routes et de commit ; les handlers CRUD, event/state/snapshot, le formatage de frontière et les effets de sync sont extraits dans `server/atomeCrudRoutes.js`, `server/atomeEventRoutes.js`, `server/atomeRouteContract.js` et `server/atomeSyncRuntime.js`.
- `atome/src/squirrel/apis/unified/adole_api/atomes.js` a été réduit et la projection client des records Atome est isolée dans `atome_record_projection.js`.
- `server/sharing.js` consomme maintenant les Atomes retournés par `db.getAtome` via des accesseurs canoniques locaux au lieu de supposer `data`, `particles`, `atome_type` ou `parent_id`.
- Les maps `API_MAP`, `CODEMAP` et `ARCHITECTURE_MAP` ont été mises à jour pour les nouveaux propriétaires.
- Le test d'acceptation `tests/eve/code_tool.registry_identity_repair.test.mjs` existe et passe.

Reste à faire :

- Terminer la réduction structurelle de `database/adole.js` et `server/sharing.js`, qui restent des surfaces historiques surdimensionnées.
- Élargir la validation d'intégration serveur/client autour des parcours réels de partage, création, liste et synchronisation après la réduction restante.

Validations exécutées :

- `node --test atome/shared/atome_contract.test.mjs database/adole.event_projection_invariants.test.mjs tests/eve/tool_instance_projection_store.test.mjs eVe/intuition/tools/core/tool_registry.strict_persistence.test.mjs` : PASS, 15 tests.
- `node --test atome/shared/atome_contract.test.mjs tests/eve/adole_storage_projection_contract.test.mjs database/adole.event_projection_invariants.test.mjs database/adole.sanitization.test.mjs database/adole.snapshot_restore_invariants.test.mjs database/adole.user_classification.test.mjs` : PASS, 21 tests.
- `node --test tests/eve/code_tool.registry_identity_repair.test.mjs eVe/intuition/tools/core/tool_registry.strict_persistence.test.mjs tests/eve/tool_instance_projection_store.test.mjs` : PASS, 3 tests.
- `npm run check:syntax` : PASS, 660 fichiers.
- `node --test atome/shared/atome_contract.test.mjs tests/eve/adole_storage_projection_contract.test.mjs database/adole.event_projection_invariants.test.mjs database/adole.sanitization.test.mjs database/adole.snapshot_restore_invariants.test.mjs database/adole.user_classification.test.mjs tests/eve/code_tool.registry_identity_repair.test.mjs eVe/intuition/tools/core/tool_registry.strict_persistence.test.mjs tests/eve/tool_instance_projection_store.test.mjs tests/scripts/check_browser_shared_contract_imports.test.mjs tests/eve/adole_commit_boundary.test.mjs tests/server/atome_persistence_boundary.test.mjs tests/scripts/check_mutation_ownership_guardrails.test.mjs` : PASS, 29 tests.
- `npm run check:mutation-ownership-guardrails` : PASS.
- `npm run check:m0` : PASS.
- `npm run test:server-verification` : PASS.
- `npm run check:syntax` : PASS, 665 fichiers.

## Contexte vérifié dans le code

Le framework possède déjà un noyau Atome canonique réel.

`atome/src/shared/atome_contract.js` normalise un Atome vers une enveloppe :

```js
{
  id,
  type,
  kind,
  renderer,
  meta,
  traits,
  properties
}
```

Ce contrat supprime déjà les champs réservés des `properties`, refuse les alias legacy hors frontière d'adaptation, vérifie l'immutabilité de `id`, et peut rejeter ou quarantainer des propriétés inconnues via schéma.

ADOLE est aussi proche du modèle cible :

- `database/adole.js` normalise avant création ;
- la persistance sépare `atomes`, `particles`, `particles_versions`, `events`, `state_current` ;
- les tests confirment la cohérence `events + particles + state_current`.

Mais le système reste hybride :

- les formes `atome_id`, `atome_type`, `parent_id`, `owner_id`, `particles`, `data` restent présentes dans les routes, les adapters et les retours internes ;
- le contrat canonique est appliqué à certains points d'entrée, mais il n'est pas encore la forme interne unique ;
- les tools ont un contrat plus mature que les Atomes génériques ;
- l'Atome universel n'existe pas encore comme contrat transversal de première classe.

Conclusion : le noyau existe, mais il faut transformer le format Atome en socle universel pour toute création eVe.

---

## Capacités fonctionnelles à couvrir

Le nouveau format Atome doit permettre, pour toute création eVe :

- la création à partir d'une demande humaine, IA, agent, script, interface ou voix ;
- la modification pendant l'exécution ;
- la composition avec d'autres Atomes ;
- la réutilisation comme élément autonome ;
- la déclaration formelle de ses capacités ;
- la validation de sa structure, de ses entrées, de ses sorties, de ses effets et de ses permissions ;
- la découverte par recherche, registry, IA ou runtime ;
- l'inspection de ses dépendances, contraintes, coûts, risques et conditions d'usage ;
- l'exposition contrôlée aux humains, applications, tools, agents et IA ;
- le partage, la publication, la distribution, le versioning et la dépréciation ;
- la transformation d'une création ponctuelle en Atome réutilisable ;
- l'évolution continue avec migrations, rollback, compatibilité et audit.

Le format Atome doit donc couvrir plus qu'un objet graphique. Il doit pouvoir représenter une application, une UI, un tool, une API, un agent, un workflow, un service, un protocole, un modèle de données, une capacité, un composant, un connecteur, une automatisation, un pack ou une politique.

---

## Principe central

Un Atome est l'unité universelle de l'écosystème eVe.

Un Atome doit être :

- identifiable ;
- typé ;
- validable ;
- inspectable ;
- composable ;
- exécutable ou référençable selon sa nature ;
- gouverné par une politique ;
- versionné ;
- découvrable ;
- réutilisable.

Règle fondamentale :

```text
Toute création eVe doit pouvoir devenir un Atome.
```

Cette règle remplace l'idée de créer plusieurs formats concurrents pour tools, APIs, agents, workflows, services ou composants. Ces objets peuvent garder leurs contrats spécialisés, mais ils doivent pouvoir être projetés dans l'enveloppe Atome universelle.

---

## Mission

Faire évoluer le format Atome actuel pour qu'il devienne la forme canonique unique du runtime eVe et qu'il puisse représenter toute création eVe :

- application ;
- interface ;
- outil ;
- API ;
- agent ;
- workflow ;
- service ;
- protocole ;
- modèle de données ;
- capacité ;
- composant ;
- connecteur ;
- automatisation ;
- pack ;
- politique.

Toute création eVe doit pouvoir devenir un Atome découvrable, référençable, composable, réutilisable, validable, partageable, publiable, versionnable et exploitable par humain, application, tool, agent ou IA.

---

## Format cible

Étendre le contrat canonique Atome vers une enveloppe universelle :

```js
{
  id: "string",
  type: "string",
  kind: "application|ui|tool|api|agent|workflow|service|protocol|data_model|capability|component|connector|automation|pack|policy|...",
  renderer: "dom|webgpu|headless|service|agent|...",
  schema_version: 1,

  meta: {
    name: "string?",
    description: "string?",
    created_at: "iso-date",
    created_by: "user|agent|system",
    updated_at: "iso-date?",
    updated_by: "user|agent|system?",
    owner_id: "string?",
    parent_id: "string?",
    project_id: "string?",
    status: "draft|validated|published|deprecated|archived"
  },

  traits: ["string"],

  capabilities: [
    {
      key: "string",
      description: "string?",
      inputs_schema: {},
      outputs_schema: {},
      effects: ["read|write|persistent|external_write|network|execution"],
      risk_level: "LOW|MEDIUM|HIGH|CRITICAL"
    }
  ],

  interfaces: {
    inputs: {},
    outputs: {},
    events: {},
    commands: {}
  },

  composition: {
    dependencies: [],
    children: [],
    ports: [],
    compatible_with: []
  },

  policy: {
    permissions: [],
    visibility: "private|group|enterprise|public_free|public_paid",
    license: "string?",
    pricing: null
  },

  lifecycle: {
    version: "semver",
    migrations: [],
    deprecation: null
  },

  properties: {}
}
```

Ce format doit rester compatible avec les Atomes visuels simples. Pour un Atome graphique, `capabilities`, `interfaces`, `composition`, `policy` et `lifecycle` peuvent avoir des valeurs par défaut minimales.

---

## Sémantique des champs

### `id`

Identifiant technique immutable de l'Atome.

Il ne doit jamais être modifié après création. Les aliases legacy `atome_id` et `atomeId` ne doivent être acceptés qu'aux frontières.

### `type`

Type précis de l'Atome.

Exemples :

- `shape.rect` ;
- `ui.panel` ;
- `tool.code_editor` ;
- `api.calendar` ;
- `agent.assistant` ;
- `workflow.media_export` ;
- `service.mail_sync`.

### `kind`

Famille fonctionnelle de l'Atome.

Valeurs minimales :

```text
application, ui, tool, api, agent, workflow, service, protocol,
data_model, capability, component, connector, automation, pack, policy,
visual, media, project, user, generic
```

### `renderer`

Surface ou mode d'exécution principal.

Exemples :

```text
dom, webgpu, canvas, audio, headless, service, agent, mcp, tauri, fastify
```

### `meta`

Métadonnées d'enveloppe. Tout ce qui identifie, possède, date, décrit ou classe l'Atome doit vivre ici, pas dans `properties`.

Champs attendus :

- `name` ;
- `description` ;
- `created_at` ;
- `created_by` ;
- `updated_at` ;
- `updated_by` ;
- `owner_id` ;
- `parent_id` ;
- `project_id` ;
- `status`.

### `traits`

Tags structurels ou comportementaux qui aident le runtime à comprendre l'Atome.

Exemples :

```text
spatial2d, temporal, selectable, draggable, executable, ai_visible,
networked, persistent, shareable, publishable
```

### `capabilities`

Liste formelle de ce que l'Atome sait faire.

Une capacité doit déclarer :

- une clé stable ;
- des schémas d'entrée et de sortie ;
- ses effets ;
- son niveau de risque ;
- éventuellement ses permissions requises.

### `interfaces`

Contrat d'interaction.

Il décrit les entrées, sorties, événements et commandes exposés par l'Atome. Cette section sert à composer des Atomes entre eux et à les rendre exploitables par l'IA.

### `composition`

Description des dépendances et relations.

Elle sert à construire des applications, workflows ou agents à partir d'autres Atomes, et à vérifier la compatibilité entre ports, interfaces et capacités.

### `policy`

Règles d'accès, de visibilité, de licence, de publication et de monétisation.

Même si l'implémentation commerciale n'existe pas encore, le format doit réserver la place pour :

- `visibility` ;
- `permissions` ;
- `license` ;
- `pricing` ;
- `entitlements`.

### `lifecycle`

Cycle de vie de l'Atome.

Il doit couvrir :

- version ;
- migrations ;
- dépréciation ;
- compatibilité ;
- rollback ;
- archivage.

### `properties`

État métier ou visuel spécifique au type.

`properties` ne doit jamais contenir les champs d'enveloppe : `id`, `type`, `owner_id`, `parent_id`, `project_id`, `created_at`, `updated_at`, etc.

---

## Règles impératives

1. La forme canonique interne doit utiliser `id`, `type`, `kind`, `renderer`, `meta`, `traits`, `properties`.
2. Les alias `atome_id`, `atome_type`, `parent_id`, `owner_id`, `particles`, `data` ne doivent exister qu'aux frontières d'adaptation.
3. Aucun champ d'enveloppe ne doit être stocké dans `properties`.
4. `owner_id`, `parent_id`, `project_id`, `created_at`, `updated_at` doivent être déplacés vers `meta` dans les formes canoniques.
5. Les routes et adapters peuvent accepter les formes legacy, mais doivent convertir immédiatement vers le format canonique.
6. Les fonctions internes doivent retourner le format canonique, sauf API explicitement legacy.
7. Les tools existants doivent devenir un cas spécialisé d'Atome universel, sans casser leur contrat actuel.
8. Le registry des tools doit rester fonctionnel, mais une abstraction de registry universel doit être préparée.
9. Toute nouvelle validation doit être couverte par tests.
10. La migration doit être progressive et non destructive pour la base ADOLE actuelle.
11. Le format doit permettre la découverte et l'inspection sans exécuter l'Atome.
12. Les effets de bord doivent être déclarés avant exécution.
13. Toute action mutable doit être auditable, idempotente quand c'est possible, et rattachée à un acteur.
14. Les Atomes composés doivent pouvoir référencer leurs dépendances sans dupliquer leur contenu.
15. La compatibilité IA/MCP doit passer par le même contrat Atome, pas par une représentation parallèle.

---

## Architecture cible

La cible fonctionnelle est :

```text
Utilisateur / IA / Agent / UI / Script / Voix
  -> Intent Layer
  -> Atome Planner
  -> Atome Registry
  -> Atome Contract
  -> Composition Graph
  -> Validation & Policy Engine
  -> Atome Runtime / Tool Runtime / Command Bus
  -> Persistence / Events / Projection / Audit
  -> Sharing / Publishing / Distribution
  -> Feedback / Migration / Reuse Loop
```

Le format Atome doit être le langage commun entre ces couches.

Le runtime peut continuer à avoir des modules spécialisés, mais ils doivent consommer ou produire une enveloppe Atome canonique.

---

## Couches à créer ou stabiliser

### 1. Contrat Atome

Responsabilité : normaliser, valider, sanitiser et formater un Atome.

Fichier principal :

- `atome/src/shared/atome_contract.js`

### 2. Frontières historiques confinées

Responsabilité : normaliser immédiatement les anciennes formes `atome_id`, `atome_type`, `particles`, `data` vers l'enveloppe Atome canonique.

Ces formes ne doivent être normales nulle part dans le runtime. Elles ne peuvent exister qu'en entrée de frontière ou dans la sérialisation SQL existante, jamais comme API Atome publique.

### 3. Registre de types Atome

Responsabilité : déclarer les types connus, leurs schémas, leurs defaults, leurs traits et leurs capacités.

### 4. Registre Atome

Responsabilité : lister, chercher, inspecter, publier et résoudre les Atomes disponibles.

Il doit progressivement absorber ou fédérer :

- tool registry ;
- registries UI ;
- registries media ;
- registries agents ;
- registries APIs ;
- registries workflows.

### 5. Graph de composition

Responsabilité : représenter comment les Atomes se connectent.

Il doit permettre :

- dépendances ;
- enfants ;
- ports ;
- liens ;
- contraintes de compatibilité ;
- validation avant assemblage.

### 6. Policy et sécurité

Responsabilité : vérifier permissions, visibilité, effets, confirmations, publication, licence et droits d'accès.

### 7. Persistance et projection

Responsabilité : conserver l'historique append-only et exposer l'état courant canonique.

ADOLE peut garder son stockage existant, mais les frontières de lecture/écriture doivent produire le format Atome enrichi.

---

## Travail à réaliser

### 1. Durcir `atome_contract.js`

Étendre le contrat canonique pour accepter et valider :

- `schema_version` ;
- `capabilities` ;
- `interfaces` ;
- `composition` ;
- `policy` ;
- `lifecycle`.

Ajouter des valeurs par défaut sûres.

Ajouter un mode de normalisation :

```js
normalizeCanonicalAtome(record, {
  boundaryAdapter: true,
  universal: true
})
```

Ce mode doit convertir les champs legacy vers `meta` et retourner uniquement l'enveloppe canonique enrichie.

Ajouter aussi :

```js
formatCanonicalAtome(record, { universal: true })
sanitizeAtomeEnvelope(record)
sanitizeAtomeProperties(properties)
assertCanonicalPropertyKey(key)
```

`sanitizeAtomeEnvelope` doit séparer clairement :

- champs d'enveloppe ;
- `meta` ;
- `properties` ;
- champs inconnus quarantainés.

### 2. Isoler les frontières de stockage sans API legacy publique

Ne pas créer de helpers publics de type `fromLegacy...` ou `toLegacy...`.

Étude du problème :

- Des helpers nommés autour du legacy rendent l'ancien format toléré comme contrat durable.
- Ils créent une voie de compatibilité permanente et peuvent réintroduire `atome_id`, `atome_type`, `particles` ou `data` dans les couches internes.
- Ils contredisent la cible : un Atome interne doit toujours être canonique.

Solution retenue :

- Toute entrée historique doit être normalisée immédiatement par `normalizeCanonicalAtome(..., { boundaryAdapter: true, universal: true })`.
- Aucune fonction interne ne doit retourner une forme legacy.
- Les tables SQL existantes peuvent garder leurs colonnes actuelles, mais la sérialisation vers SQL doit être une frontière de stockage nommée comme telle, pas un format Atome alternatif.
- Les routes et adapters doivent produire ou consommer une enveloppe Atome canonique enrichie dès que possible.

Zones à durcir :

- `server/atomeRoutes.orm.js` ;
- `atome/src/squirrel/apis/unified/adole_api/atomes.js` ;
- les zones ADOLE qui sérialisent encore vers les tables existantes.

Objectif : empêcher que les alias historiques soient manipulés partout et éviter de transformer l'ancien format en API stable.

### 3. Canoniser les retours internes ADOLE

Modifier progressivement :

- `createAtome` ;
- `getAtome` ;
- `listAtomes` ;
- `getStateCurrent` ;
- `listStateCurrent` ;
- `appendEvent` projection output.

Les fonctions internes doivent retourner une enveloppe canonique. Si une route doit écrire dans le stockage SQL existant, elle doit passer par une frontière de sérialisation stockage explicite qui ne circule pas comme Atome applicatif.

### 4. Ajouter un registre de types Atome

Créer un registre minimal de types :

```js
registerAtomeType({
  type,
  kind,
  schema,
  allow_unknown_properties,
  default_traits,
  default_capabilities,
  default_policy
})
```

Le brancher sur `normalizeCanonicalAtome` pour que les Atomes génériques bénéficient du même niveau de validation que les tools.

### 5. Généraliser le modèle Tool vers Atome universel

Ne pas supprimer le contrat tool existant. Le mapper vers le format Atome enrichi :

- `tool.id` -> `atome.id` ou `properties.tool_definition.id` selon compatibilité ;
- `tool.tool_key` -> capacité ou identité métier stable ;
- `tool.capabilities` -> `capabilities` Atome ;
- `tool.bindings` -> `interfaces.commands` ou `interfaces.events` ;
- `tool.ui` -> `properties.ui` ou `meta.name`/`renderer`.

Préparer une abstraction :

```js
AtomeRegistry
```

qui pourra lister, valider et découvrir tools, agents, APIs, workflows, services et autres Atomes spécialisés.

### 6. Ajouter le graph de composition

Créer un modèle minimal :

```js
{
  dependencies: [
    { id, type, version, required: true }
  ],
  children: [
    { id, role, order }
  ],
  ports: [
    { key, direction: "input|output", schema: {}, required: false }
  ],
  compatible_with: [
    { type, kind, constraint }
  ]
}
```

Ce modèle doit permettre de vérifier qu'une application, un workflow ou un agent peut être assemblé à partir d'autres Atomes.

### 7. Ajouter policy, visibilité et publication

Ajouter un modèle minimal :

```js
{
  permissions: [],
  visibility: "private|group|enterprise|public_free|public_paid",
  license: null,
  pricing: null,
  entitlements: []
}
```

Le but n'est pas de finaliser la monétisation, mais de rendre le format prêt pour :

- droits de lecture ;
- droits d'écriture ;
- droits d'exécution ;
- droits de partage ;
- droits de publication ;
- accès gratuit ou payant ;
- restrictions d'organisation ou de groupe.

### 8. Ajouter lifecycle et migrations

Ajouter un modèle minimal :

```js
{
  version: "1.0.0",
  migrations: [],
  compatibility: {},
  deprecation: null,
  archived_at: null
}
```

Tout Atome publié ou réutilisable doit pouvoir évoluer sans casser les usages existants.

### 9. Ajouter les tests

Ajouter ou étendre les tests pour prouver :

- les champs legacy sont acceptés uniquement à la frontière ;
- les retours internes sont canoniques ;
- `properties` ne contient jamais les champs d'enveloppe ;
- `meta.owner_id`, `meta.parent_id`, `meta.project_id` sont préservés ;
- un Atome universel minimal est validé ;
- un tool existant peut être projeté en Atome universel ;
- un agent minimal peut être représenté comme Atome ;
- une API minimale peut être représentée comme Atome ;
- un workflow minimal peut déclarer ses dépendances et ports ;
- un Atome peut déclarer visibilité, licence et policy sans polluer `properties` ;
- la projection ADOLE reste cohérente ;
- les routes legacy restent compatibles.

---

## Plan de migration recommandé

### Phase 1 — Contrat

Étendre `atome_contract.js` sans changer le stockage.

Livrables :

- enveloppe Atome enrichie ;
- defaults ;
- validation ;
- tests unitaires.

### Phase 2 — Frontières de stockage strictes

Centraliser la normalisation d'entrée et la sérialisation de stockage sans créer d'API legacy publique.

Livrables :

- normalisation immédiate vers enveloppe canonique aux frontières d'entrée ;
- sérialisation SQL isolée et nommée comme stockage, jamais comme Atome legacy ;
- suppression progressive des conversions dispersées.

### Phase 3 — ADOLE canonique

Faire retourner le format canonique aux fonctions internes.

Livrables :

- `createAtome`, `getAtome`, `listAtomes`, `state_current` au format canonique ;
- routes legacy adaptées explicitement.

### Phase 4 — Types et registry

Créer le registre de types et préparer `AtomeRegistry`.

Livrables :

- `registerAtomeType` ;
- types minimaux pour visual, tool, api, agent, workflow, service ;
- découverte et inspection de base.

### Phase 5 — Tools comme Atomes spécialisés

Mapper les tools existants vers le format Atome enrichi.

Livrables :

- projection tool -> Atome ;
- tests de compatibilité avec le registry tool actuel ;
- exposition MCP inchangée ou améliorée.

### Phase 6 — Composition, policy, lifecycle

Ajouter les champs avancés sans imposer encore toute leur logique métier.

Livrables :

- composition graph minimal ;
- policy minimale ;
- lifecycle minimal ;
- validation et tests.

---

## Matrice de couverture attendue

| Capacité | Couverture attendue par le nouveau format Atome |
|---|---|
| Création | Un Atome peut décrire application, UI, tool, API, agent, workflow, service, protocole, modèle ou capacité. |
| Modification | Les mutations passent par patch/event/projection et restent auditables. |
| Composition | `composition` décrit dépendances, enfants, ports et compatibilité. |
| Réutilisation | `id`, `type`, `capabilities`, `interfaces`, `policy`, `lifecycle` rendent l'Atome réutilisable. |
| Création à la demande | L'Intent Layer et l'Atome Planner peuvent produire ou chercher des Atomes selon capacités. |
| Extensibilité | Le registre de types permet d'ajouter de nouveaux types sans changer le noyau. |
| Structuration | Le contrat Atome devient la structure commune. |
| Validation | Schémas, capabilities, interfaces, policy et lifecycle sont validables. |
| Sécurité | `policy`, effets et permissions sont déclarés avant action. |
| Déclaration | Tout Atome peut déclarer ce qu'il est et ce qu'il sait faire. |
| Découverte | `AtomeRegistry` peut indexer type, kind, traits, capabilities, visibility. |
| Inspection | Les métadonnées, contraintes, dépendances et risques sont lisibles sans exécution. |
| IA | Les IA peuvent raisonner sur `capabilities`, `interfaces`, `composition` et `policy`. |
| Distribution | `policy.visibility`, `license`, `pricing`, `lifecycle.version` préparent publication et partage. |
| Évolution | `lifecycle` prépare migrations, compatibilité, dépréciation et archivage. |

---

## Critères d'acceptation

Le travail est terminé quand :

1. `normalizeCanonicalAtome` produit une enveloppe Atome universelle stable.
2. Les alias legacy ne circulent plus dans les couches internes hors adapters.
3. ADOLE peut persister dans les tables actuelles, mais exposer une forme canonique.
4. Les tools restent compatibles et peuvent être vus comme Atomes spécialisés.
5. Un registre de types Atome minimal existe.
6. Le présent document est suffisant pour réaliser la migration sans dépendre d'un autre plan.
7. Les tests ciblés passent :

```sh
node --test atome/shared/atome_contract.test.mjs
node --test database/adole.event_projection_invariants.test.mjs
node --test tests/eve/tool_instance_projection_store.test.mjs
node --test tests/eve/code_tool.registry_identity_repair.test.mjs
node --test eVe/intuition/tools/core/tool_registry.strict_persistence.test.mjs
```

8. De nouveaux tests couvrent explicitement le format Atome enrichi.

---

## Attention

Ne pas faire une migration brutale de la base.

Le stockage SQL peut rester centré sur `atomes`, `particles`, `events` et `state_current` dans un premier temps. Ce qui doit changer d'abord est le contrat exposé et manipulé par le runtime : l'interne doit penser en Atome canonique, puis adapter vers le stockage legacy seulement au dernier moment.
