# Plan corrigé — Transformer `eVe_AI_OPAC_WIP.md` en réponse complète à `atome_format_capabilities.md`

Date : 2026-05-29  
Statut : proposition corrective  
Objet : vérifier scientifiquement si le WIP OPAC couvre les capacités fonctionnelles cibles, puis proposer un plan qui couvre les manques.

---

## 1. Verdict

`eVe_AI_OPAC_WIP.md` ne répond pas complètement à la demande de `atome_format_capabilities.md`.

Il répond correctement à une partie importante du **socle technique** :

- format canonique d'Atome ;
- modèle de types ;
- modèle de tools ;
- command bus ;
- historique append-only ;
- audit ;
- sécurité ;
- exposition MCP / IA ;
- registres et manifests OPAC en première approche.

Mais il ne répond que partiellement à la demande globale, car `atome_format_capabilities.md` décrit un **écosystème fonctionnel auto-évolutif**, pas seulement un format d'objet, de tool et de registry.

La différence centrale :

```text
atome_format_capabilities.md
= ce que l'écosystème doit permettre fonctionnellement

Eve_AI_OPAC_WIP.md
= comment stabiliser une base canonique d'exécution, de mutation, de tool, d'audit et de registry
```

Donc le WIP est une bonne fondation, mais il doit devenir une couche interne d'un plan plus large.

Score de couverture estimé selon la grille ci-dessous : **54 % environ**.

Ce score n'est pas une vérité absolue ; c'est un indice semi-quantitatif basé sur la présence de contrats testables dans le WIP.

---

## 2. Méthode d'évaluation

### 2.1 Hypothèse testée

Hypothèse H1 : `eVe_AI_OPAC_WIP.md` répond correctement aux capacités demandées dans `atome_format_capabilities.md`.

### 2.2 Critère scientifique utilisé

Une capacité est considérée comme couverte seulement si le WIP fournit au minimum :

1. une définition claire de l'objet concerné ;
2. un contrat ou schéma vérifiable ;
3. un chemin d'exécution ou de cycle de vie ;
4. des règles de validation ;
5. des règles de sécurité / permission / audit si l'action produit un effet ;
6. une place dans le registry ou dans le runtime ;
7. un comportement exploitable par l'IA quand la demande l'exige.

### 2.3 Échelle de score

| Score | Signification |
|---:|---|
| 0 | absent |
| 1 | mentionné mais pas défini opérationnellement |
| 2 | partiellement défini, mais incomplet ou non généralisé |
| 3 | défini de manière testable et exploitable |

### 2.4 Sources internes lues

Repères de lecture utilisés :

- `atome_format_capabilities.md`, lignes 9-15 : le document cible demande exclusivement des capacités fonctionnelles, pas une architecture technique.
- `atome_format_capabilities.md`, lignes 19-35 : création d'application, UI, outil, API, agent, workflow, service, protocole, modèle de données et capacité réutilisable.
- `atome_format_capabilities.md`, lignes 92-103 : création à la demande et création automatique des éléments manquants.
- `atome_format_capabilities.md`, lignes 123-145 : structuration et validation formelles.
- `atome_format_capabilities.md`, lignes 154-166 : sécurité, droits de publication et droits de monétisation.
- `atome_format_capabilities.md`, lignes 185-235 : découverte, inspection, accessibilité universelle et utilisation par les IA.
- `atome_format_capabilities.md`, lignes 242-279 : assemblage universel, construction récursive et capitalisation.
- `atome_format_capabilities.md`, lignes 284-337 : collaboration, distribution, visibilité et monétisation.
- `atome_format_capabilities.md`, lignes 341-393 : automatisation, personnalisation, évolution continue et écosystème auto-évolutif.
- `atome_format_capabilities.md`, lignes 397-401 : principe fondamental de brique réutilisable, découvrable, composable, partageable, monétisable et exploitable par humains, apps, outils, agents et IA.
- `eVe_AI_OPAC_WIP.md`, lignes 5-15 : le WIP se présente lui-même comme une base de convergence orientée implémentation, non comme un standard final.
- `eVe_AI_OPAC_WIP.md`, lignes 59-68 : objectif de cohérence autour d'Atomes, tools, runtime, IA, déterminisme et audit.
- `eVe_AI_OPAC_WIP.md`, lignes 73-103 : mutation pipeline, déterminisme, sécurité, opération type-agnostic.
- `eVe_AI_OPAC_WIP.md`, lignes 289-300 : tool model canonique.
- `eVe_AI_OPAC_WIP.md`, lignes 644-688 : surfaces API UI, tools, MCP et IA.
- `eVe_AI_OPAC_WIP.md`, lignes 775-817 : contrat de compatibilité IA et voix.
- `eVe_AI_OPAC_WIP.md`, lignes 949-990 : registry et packaging proposés.
- `eVe_AI_OPAC_WIP.md`, lignes 1078-1112 : le WIP reconnaît qu'OPAC exige plus que le runtime de base.
- `eVe_AI_OPAC_WIP.md`, lignes 1186-1232 : roadmap centrée sur format, runtime, manifests, registry et génération de tools.

---

## 3. Matrice de couverture

| Capacité cible | Couverture WIP | Score /3 | Diagnostic |
|---|---:|---:|---|
| Création | partielle | 1.5 | Le WIP permet de penser la création de types/tools, mais pas la création complète d'applications, agents, services, protocoles ou environnements de travail. |
| Modification | forte mais limitée | 2.5 | Le command bus, les patchs et l'historique sont solides ; la transformation/fusion d'applications reste peu définie. |
| Composition | partielle | 1.5 | Registry et manifests existent, mais il manque une grammaire de composition universelle entre API, outils, agents, workflows, services et apps. |
| Réutilisation | correcte mais incomplète | 2.0 | Le registry va dans le bon sens, mais le cycle complet de réutilisation/promotion/versioning n'est pas défini pour toutes les briques. |
| Création à la demande | faible | 1.0 | Le WIP mentionne génération de tools/types, mais pas un vrai moteur ODAC/OPAC : intention → plan → recherche → assemblage → génération → validation → publication. |
| Extensibilité | partielle | 2.0 | Les types et tools sont extensibles ; agents, services, protocoles et APIs ne sont pas au même niveau de formalisation. |
| Structuration | partielle | 2.0 | Bonne structuration pour Atome, type, tool, ETS ; manque un manifest universel de brique. |
| Validation | partielle | 2.0 | Validation de schéma, permission, audit : oui. Validation de cohérence complète des apps/workflows/agents/services : insuffisante. |
| Sécurité | solide mais pas complète | 2.5 | Très bon socle policy/confirmation/audit. Manque droits de publication, droits commerciaux, licences, entitlements. |
| Déclaration | partielle | 1.5 | Registry et ETS déclarent surtout tools/types/composants/workflows ; pas toutes les briques demandées. |
| Découverte | partielle | 2.0 | Multi-registry prévu. Il manque index, recherche sémantique, scoring, capacités, coût, conditions et compatibilité détaillée. |
| Inspection | partielle | 2.0 | Le manifest expose capacités/dépendances/risque. Coûts, conditions d'utilisation et contraintes métier restent faibles. |
| Accessibilité universelle | partielle | 1.5 | Les tools sont listables/invocables. L'universalité pour toute brique n'est pas encore garantie. |
| Utilisation par les IA | bonne mais incomplète | 2.5 | IA-visible metadata, policy et tool intentions sont solides. La création/modification/déclaration automatique de toute brique reste à définir. |
| Assemblage universel | faible | 1.0 | Pas de typage de ports, contrats d'interface, graph de composition ni règles de compatibilité inter-briques. |
| Construction récursive | faible | 1.0 | Le WIP autorise l'idée, mais ne définit pas comment construire une API à partir d'APIs, un agent à partir d'agents, etc. |
| Capitalisation | partielle | 2.0 | Historique et registry aident. Mais transformer toute création en ressource réutilisable n'est pas généralisé. |
| Collaboration | faible | 1.0 | Le sync local/cloud existe, mais pas le partage, la coédition, les rôles collectifs, les forks, reviews et merges. |
| Distribution | partielle faible | 1.5 | Public/private registry et bundles sont évoqués. Il manque un workflow de publication complet. |
| Visibilité | partielle faible | 1.5 | Le WIP a `local/private/enterprise/public`, mais pas groupe/utilisateur/gratuit/payant dans un modèle complet de droits. |
| Monétisation | faible | 0.75 | Le champ `pricing.mode` est trop léger pour commercialisation, licences, paiements, droits et revenus. |
| Automatisation | partielle faible | 1.5 | Invocation, batch et IA existent. Il manque scheduler, triggers, automations durables, monitoring et auto-création contrôlée. |
| Personnalisation | faible | 1.0 | Peu de modèle de préférences, adaptation utilisateur, profils ou personnalisation comportementale. |
| Évolution continue | partielle faible | 1.5 | Migrations et versions existent. Il manque lifecycle complet : deprecation, upgrade, compatibilité, rollback, apprentissage contrôlé. |
| Écosystème auto-évolutif | partielle faible | 1.5 | L'idée est compatible avec le WIP, mais pas encore spécifiée comme mécanique d'écosystème. |
| Principe fondamental | partiel | 1.5 | Le WIP vise bien la réutilisation par registry, mais ne rend pas encore toute création partageable, composable, monétisable et exploitable par tous les acteurs. |

Score total : **42.25 / 78 = 54.2 %**.

---

## 4. Ce qu'il faut garder du WIP

Le WIP ne doit pas être jeté. Il faut le repositionner.

### 4.1 À conserver comme socle technique

- Canonical Atome Object Contract.
- Type Registry.
- Tool Model.
- Code and Behavior Model.
- Command Bus.
- History / Snapshots / Time Travel.
- Persistence Model.
- MCP Compatibility.
- AI Compatibility.
- Security / Policy / Consent.
- Audit / Traceability.
- Registry baseline.
- ETS pour les tools.

### 4.2 À changer de statut

Le WIP doit devenir :

```text
Couche 3 — Runtime canonique Atome / Tool / Mutation / Audit
```

Il ne doit pas être présenté comme la réponse complète à l'écosystème OPAC.

### 4.3 Raison

Le WIP répond à la question :

```text
Comment représenter et exécuter proprement les objets/tools/actions dans eVe ?
```

La demande cible pose une question plus large :

```text
Comment créer, déclarer, découvrir, assembler, valider, réutiliser, distribuer,
monétiser et faire évoluer toute brique de l'écosystème eVe ?
```

---

## 5. Plan corrigé recommandé

Le plan corrigé doit créer une architecture de capacités universelles au-dessus du runtime Atome.

Architecture cible :

```text
Utilisateur / IA / Agent / UI / Script / Voix
  -> Intent Layer
  -> OPAC Planner
  -> Capability Registry
  -> Universal Brick Manifest
  -> Composition Graph
  -> Validation & Policy Engine
  -> Atome Runtime / Tool Runtime / Command Bus
  -> Persistence / Audit / Sync
  -> Packaging / Distribution / Monetization
  -> Feedback / Evolution / Reuse Loop
```

---

## 6. Nouvelle notion centrale : Universal Brick

Le concept manquant est la **brique universelle**.

Une brique universelle peut être :

- une application ;
- une interface ;
- un outil ;
- une API ;
- un agent ;
- un workflow ;
- un service ;
- un protocole ;
- un modèle de données ;
- une capacité ;
- un composant ;
- un connecteur ;
- un template ;
- un pack ;
- une politique ;
- une automatisation.

Règle :

```text
Toute création eVe doit pouvoir devenir une Universal Brick.
```

---

## 7. Universal Brick Manifest — format minimal

Le WIP possède déjà un ETS pour les tools. Il faut généraliser cette idée.

### 7.1 Schéma conceptuel

```jsonc
{
  "id": "brick.unique_id",
  "kind": "application|ui|tool|api|agent|workflow|service|protocol|data_model|capability|component|connector|automation|pack|policy",
  "version": "1.0.0",
  "name": "Human readable name",
  "description": "What this brick does",
  "owner": {
    "user_id": "string",
    "organization_id": "string?"
  },
  "visibility": "private|group|enterprise|public_free|public_paid",
  "status": "draft|validated|published|deprecated|archived",
  "capabilities": [
    {
      "key": "media.video.export",
      "description": "Export a video project",
      "inputs_schema": {},
      "outputs_schema": {},
      "effects": ["persistent", "external_write"],
      "risk_level": "LOW|MEDIUM|HIGH|CRITICAL"
    }
  ],
  "interfaces": {
    "ui": {},
    "api": {},
    "mcp": {},
    "voice": {},
    "script": {},
    "agent": {}
  },
  "composition": {
    "ports_in": [],
    "ports_out": [],
    "accepted_kinds": [],
    "provided_kinds": [],
    "contracts": []
  },
  "dependencies": [],
  "permissions": {
    "required": [],
    "exposed": [],
    "delegable": []
  },
  "constraints": {
    "runtime": [],
    "platform": [],
    "data_classes": [],
    "latency_budget_ms": null,
    "cost_estimate": null
  },
  "validation": {
    "schemas": [],
    "tests": [],
    "policy_checks": [],
    "compatibility_checks": []
  },
  "distribution": {
    "package_id": "string?",
    "signature": "string?",
    "license": "string?",
    "terms_url": "string?"
  },
  "monetization": {
    "mode": "none|free|paid|rent|subscription|revenue_share|internal",
    "price": null,
    "currency": null,
    "entitlement_policy": {}
  },
  "audit": {
    "created_at": "iso",
    "created_by": "principal_id",
    "updated_at": "iso?",
    "lineage": []
  }
}
```

### 7.2 Règle de compatibilité avec Atome

Le Universal Brick Manifest ne remplace pas Atome.

Il l'encapsule :

```text
Universal Brick
  -> déclare la capacité, la composition, les droits, la distribution
  -> référence des Atomes, Tools, Types, Workflows, APIs, Agents
  -> délègue l'exécution durable au runtime Atome / Tool / Command Bus
```

---

## 8. Cycle de vie obligatoire d'une brique

Le plan corrigé doit imposer un cycle de vie unique :

```text
Intent
  -> Draft
  -> Declaration
  -> Validation
  -> Registration
  -> Discovery
  -> Inspection
  -> Composition
  -> Execution
  -> Audit
  -> Packaging
  -> Publication
  -> Monetization / Entitlement
  -> Reuse
  -> Evolution
  -> Deprecation / Migration
```

Aucune brique ne doit contourner ce cycle si elle devient durable ou partageable.

---

## 9. Moteur OPAC / ODAC corrigé

Le WIP parle de génération, mais il manque le moteur complet.

Pipeline obligatoire :

```text
1. Comprendre l'intention utilisateur
2. Extraire les exigences fonctionnelles
3. Rechercher les briques existantes
4. Évaluer compatibilité, coût, droits, sécurité et qualité
5. Réutiliser avant de créer
6. Identifier les manques
7. Générer uniquement les briques manquantes
8. Déclarer chaque nouvelle brique dans un manifest
9. Tester chaque brique isolément
10. Tester la composition complète
11. Simuler permissions, effets de bord et coûts
12. Produire une proposition lisible humain
13. Demander validation si nécessaire
14. Exécuter via runtime canonique
15. Auditer toutes les décisions
16. Capitaliser le résultat comme ressource réutilisable
```

### 9.1 Contrat du Planner

Le planner OPAC doit produire :

```jsonc
{
  "intent_id": "uuid",
  "user_goal": "string",
  "requirements": [],
  "reuse_candidates": [],
  "missing_bricks": [],
  "composition_plan": {},
  "risk_report": {},
  "cost_report": {},
  "validation_plan": {},
  "human_summary": "string"
}
```

### 9.2 Règle de décision

```text
Créer une nouvelle brique est interdit tant qu'une brique existante compatible n'a pas été recherchée et rejetée avec raison explicite.
```

---

## 10. Composition universelle

Le WIP n'a pas encore de vraie grammaire de composition. Il faut l'ajouter.

### 10.1 Modèle cible

```text
Brick A output port
  -> type compatibility check
  -> permission compatibility check
  -> side-effect compatibility check
  -> runtime compatibility check
  -> Brick B input port
```

### 10.2 Graphe de composition

```jsonc
{
  "graph_id": "composition.project_1",
  "nodes": [
    { "id": "node_1", "brick_id": "api.assets.search", "kind": "api" },
    { "id": "node_2", "brick_id": "tool.video.export", "kind": "tool" }
  ],
  "edges": [
    {
      "from": "node_1.outputs.assets",
      "to": "node_2.inputs.assets",
      "contract": "asset_list.v1"
    }
  ],
  "validation": {
    "status": "valid|invalid|warning",
    "errors": []
  }
}
```

### 10.3 Cas explicitement requis

Le modèle doit permettre :

- API dans outil ;
- API dans API ;
- outil dans outil ;
- agent dans outil ;
- agent dans workflow ;
- workflow dans application ;
- service dans outil ;
- application dans application ;
- modèle de données dans plusieurs systèmes.

---

## 11. Validation scientifique et technique

La validation doit être séparée en couches.

| Couche | Validation requise |
|---|---|
| Schéma | JSON Schema / contrat typé / version |
| Dépendances | existence, version, compatibilité, licence |
| Permissions | droits requis, droits exposés, délégation |
| Effets de bord | durable, externe, irréversible, financier, privé |
| Sécurité | policy, sandbox, secrets, confirmation |
| Composition | ports, types, contraintes, cycles, données |
| Runtime | dry-run, rollback, idempotence, trace_id |
| IA | compréhension du manifest, choix justifié, résumé humain |
| Distribution | signature, provenance, owner, droits de publication |
| Monétisation | prix, entitlement, droits commerciaux, fiscalité minimale |
| Collaboration | rôles, ownership, conflits, merges |
| Évolution | migration, compatibilité arrière, dépréciation |

### 11.1 Critère d'acceptation global

Une brique ne peut être publiée que si :

```text
schema_valid
AND dependencies_valid
AND permissions_valid
AND side_effects_classified
AND policy_valid
AND composition_valid
AND tests_passed
AND audit_ready
AND distribution_rights_valid
AND monetization_rights_valid_if_paid
```

---

## 12. Sécurité, droits et gouvernance

Le WIP a un bon noyau de sécurité. Il faut l'étendre aux droits économiques et sociaux.

### 12.1 Droits à ajouter

- droit de créer ;
- droit de modifier ;
- droit d'exécuter ;
- droit de composer ;
- droit de partager ;
- droit de publier ;
- droit de vendre ;
- droit de louer ;
- droit de forker ;
- droit de dériver ;
- droit de déprécier ;
- droit de supprimer / archiver ;
- droit de transférer la propriété.

### 12.2 Policy engine minimal

```jsonc
{
  "subject": "user|agent|service",
  "action": "create|modify|execute|compose|publish|monetize|share|fork",
  "object": "brick_id",
  "context": {
    "workspace": "string",
    "visibility": "string",
    "risk_level": "string",
    "data_classes": [],
    "commercial": true
  },
  "decision": "ALLOW|REQUIRE_CONFIRM|DENY"
}
```

---

## 13. Distribution et monétisation

Le WIP contient seulement un embryon de `pricing.mode`. Il faut un vrai modèle.

### 13.1 Package publiable

Un package doit contenir :

- manifest universel ;
- schémas ;
- code ou références signées ;
- assets ;
- dépendances ;
- tests ;
- documentation ;
- licence ;
- conditions d'utilisation ;
- provenance ;
- signature ;
- SBOM ou équivalent si code exécutable.

### 13.2 Modes économiques

- privé non commercial ;
- public gratuit ;
- public payant ;
- achat définitif ;
- location ;
- abonnement ;
- usage interne entreprise ;
- revenue share ;
- gratuit mais attribution obligatoire ;
- licence restrictive.

### 13.3 Entitlement

Le runtime doit vérifier :

```text
utilisateur possède le droit d'utiliser cette brique
AND contexte autorisé
AND licence valide
AND paiement/abonnement valide si nécessaire
AND restrictions de redistribution respectées
```

---

## 14. Collaboration

Le WIP parle de sync, mais la collaboration demandée est plus large.

Il faut définir :

- workspace partagé ;
- rôles ;
- ownership ;
- coédition ;
- branch/fork ;
- review ;
- merge ;
- conflit ;
- commentaire ;
- audit par utilisateur ;
- permissions temporaires ;
- publication collective ;
- partage privé / groupe / entreprise / public.

Cycle collaboratif minimal :

```text
create draft
  -> invite collaborators
  -> edit branch
  -> propose change
  -> review
  -> approve
  -> merge
  -> publish or keep private
```

---

## 15. Personnalisation et évolution continue

Le document cible demande l'adaptation continue.

À ajouter :

- profil utilisateur ;
- préférences ;
- style créatif ;
- historique de choix ;
- contraintes personnelles ;
- niveau d'autonomie autorisé pour l'IA ;
- templates personnels ;
- agents spécialisés personnels ;
- recommandations de briques ;
- migration automatique contrôlée ;
- rollback après adaptation.

Règle :

```text
La personnalisation ne doit jamais modifier silencieusement la brique canonique partagée.
Elle doit produire une variante, un profil d'exécution ou une configuration versionnée.
```

---

## 16. Roadmap corrigée

### Phase 0 — Clarifier le niveau du document

But : séparer clairement les documents.

Livrables :

- `atome_format_capabilities.md` = capacités fonctionnelles cibles ;
- `universal_brick_manifest.md` = schéma universel de brique ;
- `eve_opac_runtime_contract.md` = runtime Atome/Tool/Command Bus, basé sur le WIP ;
- `opac_planner_pipeline.md` = création à la demande ;
- `opac_registry_distribution_monetization.md` = publication, store, droits, monétisation.

Critère d'acceptation : chaque document a un rôle unique et ne mélange pas intention, architecture et implémentation.

### Phase 1 — Définir Universal Brick Manifest

But : couvrir toutes les briques cibles.

Inclure :

- application ;
- UI ;
- tool ;
- API ;
- agent ;
- workflow ;
- service ;
- protocol ;
- data model ;
- capability ;
- component ;
- connector ;
- automation ;
- pack ;
- policy.

Critère d'acceptation : toute capacité listée dans `atome_format_capabilities.md` peut être représentée par un manifest.

### Phase 2 — Construire le Capability Registry

But : rendre les briques découvrables, inspectables, composables et réutilisables.

Fonctions :

- `registry.declare` ;
- `registry.validate` ;
- `registry.search` ;
- `registry.inspect` ;
- `registry.resolve_dependencies` ;
- `registry.check_compatibility` ;
- `registry.publish` ;
- `registry.deprecate` ;
- `registry.fork`.

Critère d'acceptation : l'IA peut chercher une brique par intention, comprendre ses capacités et justifier pourquoi elle la choisit ou la rejette.

### Phase 3 — Définir le Composition Graph

But : assembler proprement les briques.

Livrables :

- ports typés ;
- contrats input/output ;
- dépendances ;
- compatibilité runtime ;
- compatibilité permission ;
- compatibilité effets de bord ;
- validation de graph ;
- execution plan.

Critère d'acceptation : les cas d'assemblage universel du document cible sont tous représentables.

### Phase 4 — Construire le OPAC Planner

But : créer une solution à partir d'une intention.

Pipeline :

```text
intent
  -> requirements
  -> search existing bricks
  -> select candidates
  -> generate missing bricks
  -> compose
  -> validate
  -> propose
  -> execute
  -> package
  -> capitalize
```

Critère d'acceptation : le planner doit prouver qu'il a cherché avant de créer.

### Phase 5 — Étendre validation, sécurité et audit

But : rendre la création automatique sûre.

Ajouter :

- dry-run ;
- sandbox ;
- policy engine ;
- confirmation ;
- side-effect classifier ;
- cost classifier ;
- dependency scanner ;
- license scanner ;
- generated artifact audit ;
- rollback.

Critère d'acceptation : aucune brique générée ne peut être exécutée ou publiée sans validation.

### Phase 6 — Distribution, visibilité, monétisation

But : couvrir les capacités économiques.

Ajouter :

- package signing ;
- publication workflow ;
- visibility rules ;
- paid/free/private/group/enterprise modes ;
- license / terms ;
- entitlement checks ;
- purchase/rent/subscription modes ;
- revenue tracking ;
- revocation.

Critère d'acceptation : une brique peut être publiée, vendue, réservée à un groupe ou gardée privée avec règles vérifiables.

### Phase 7 — Collaboration

But : permettre la construction collective.

Ajouter :

- workspaces ;
- roles ;
- collaborative branches ;
- reviews ;
- merges ;
- conflict resolution ;
- shared audit ;
- co-ownership.

Critère d'acceptation : plusieurs utilisateurs peuvent construire une brique et publier une version validée.

### Phase 8 — Évolution continue et auto-évolution

But : faire grandir l'écosystème.

Ajouter :

- lifecycle versions ;
- migration plans ;
- deprecation ;
- upgrade path ;
- compatibility reports ;
- usage feedback ;
- quality scoring ;
- recommendation engine ;
- controlled self-improvement loop.

Critère d'acceptation : une brique peut évoluer sans casser les compositions existantes.

---

## 17. Structure documentaire finale recommandée

```text
documentations/
  capabilities/
    atome_format_capabilities.md
    capability_coverage_matrix.md

  opac/
    opac_concepts.md
    opac_planner_pipeline.md
    opac_creation_on_demand.md
    opac_reuse_before_creation.md

  manifests/
    universal_brick_manifest.md
    ets_tool_manifest.md
    api_manifest.md
    agent_manifest.md
    workflow_manifest.md
    service_manifest.md
    protocol_manifest.md
    data_model_manifest.md

  registry/
    capability_registry.md
    discovery_and_inspection.md
    package_distribution.md
    visibility_and_entitlements.md
    monetization.md

  runtime/
    atome_runtime_contract.md
    tool_runtime_contract.md
    command_bus_contract.md
    persistence_and_history.md
    audit_and_traceability.md

  validation/
    validation_pipeline.md
    policy_engine.md
    sandbox_execution.md
    generated_artifact_tests.md

  collaboration/
    collaborative_workspaces.md
    branch_review_merge.md
    ownership_and_roles.md

  evolution/
    lifecycle_versioning.md
    migration_and_deprecation.md
    ecosystem_self_evolution.md
```

---

## 18. Synthèse directe

`eVe_AI_OPAC_WIP.md` est une bonne réponse à :

```text
Comment obtenir un runtime Atome propre, déterministe, auditable, compatible IA/MCP ?
```

Il n'est pas une réponse complète à :

```text
Comment construire un écosystème eVe où toute création devient une brique
réutilisable, découvrable, composable, partageable, monétisable et exploitable
par humains, apps, outils, agents et IA ?
```

La correction consiste à ajouter au-dessus du WIP :

1. Universal Brick Manifest ;
2. Capability Registry ;
3. OPAC Planner ;
4. Composition Graph ;
5. Validation Pipeline ;
6. Distribution & Monetization ;
7. Collaboration Model ;
8. Continuous Evolution Loop.

Le WIP actuel devient alors la couche d'exécution fiable, pas la totalité du système.

