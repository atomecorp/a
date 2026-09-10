# Atome / eVe — Applications et plugins : spécification pour les IA et les développeurs

**Version :** 0.2 — proposition de contrat, benchmarks obligatoires ajoutés, non implémentée  
**Date :** 9 septembre 2026  
**Destinataires :** IA de conception, Codex, développeurs du moteur et auteurs de plugins  
**Documents associés :** [WORK_METHOD.md](WORK_METHOD.md) · [USER_GUIDE.md](USER_GUIDE.md)

> Ce document décrit le système à construire, pas une API disponible aujourd’hui. Les exemples portant la mention « contrat proposé » ne sont pas exécutables dans le framework actuel sans réalisation des prérequis. Le point de départ existant est `todo/eVe_plugin.md` : lors de l’adoption, réconcilier les deux documents et conserver une seule spécification active.
>
> Les règles globales `.codex/AGENTS.md` et leurs modules restent les références architecturales. Cette proposition ne les modifie pas implicitement. Version de discussion en français, hors dépôt ; une intégration dans la documentation développeur devra respecter sa politique de langue.

## Sommaire

- [1. Objectif et périmètre](#1-objectif-et-périmètre)
- [2. Ce qui existe et ce qui reste à prouver](#2-ce-qui-existe-et-ce-qui-reste-à-prouver)
- [3. Vocabulaire commun](#3-vocabulaire-commun)
- [4. Architecture proposée et propriétaires](#4-architecture-proposée-et-propriétaires)
- [5. Contrat de paquet](#5-contrat-de-paquet)
- [6. Points d’extension et interface utilisateur](#6-points-dextension-et-interface-utilisateur)
- [7. Exécution JavaScript et frontière de sécurité](#7-exécution-javascript-et-frontière-de-sécurité)
- [8. Données, instances, historique et collaboration](#8-données-instances-historique-et-collaboration)
- [9. Cycle de vie et mise à jour à chaud](#9-cycle-de-vie-et-mise-à-jour-à-chaud)
- [10. API publiques, JavaScript et génération par IA](#10-api-publiques-javascript-et-génération-par-ia)
- [11. MCP et services externes](#11-mcp-et-services-externes)
- [12. Plateformes, médias et distribution](#12-plateformes-médias-et-distribution)
- [13. Scénarios de validation locaux du système plugin](#13-scénarios-de-validation-locaux-du-système-plugin)
- [14. Documentation, aide et kit d’auteur](#14-documentation-aide-et-kit-dauteur)
- [15. Plan de réalisation à proposer avant tout code](#15-plan-de-réalisation-à-proposer-avant-tout-code)
- [16. Arbitrages et prérequis sans bloquer la rédaction](#16-arbitrages-et-prérequis-sans-bloquer-la-rédaction)
- [17. Sources et niveau de preuve](#17-sources-et-niveau-de-preuve)

## 1. Objectif et périmètre

Permettre de créer une application utilisant le moteur Atome/eVe sans ajouter son code au dépôt du moteur. Un auteur humain ou une IA peut partir d’un cahier des charges, écrire un script JavaScript, composer des capacités existantes ou intégrer une API/module externe autorisé. Le résultat est empaqueté, testé puis installé dans un environnement eVe déjà en fonctionnement.

Le moteur conserve le rendu, les interactions système, les données canoniques, l’historique, la synchronisation et les autorisations. Le plugin exprime son comportement et ses contributions ; il ne devient pas un deuxième framework à l’intérieur du premier.

**Périmètre nécessaire à la première version complète demandée :** paquet déclaratif ET logique JavaScript écrite à la main ou par IA ; installation externe au dépôt ; activation/désactivation ; mise à jour à chaud contrôlée ; scénarios, documentation et tests ; accès par les API autorisées. Une livraison seulement déclarative est un jalon intermédiaire, pas l’achèvement de cette demande.

Les effets audio au niveau échantillon, nouveaux rendus GPU, binaires natifs téléchargés, magasin commercial et distribution publique sur toutes les plateformes ne sont pas des prérequis de ce premier contrat. Ils nécessitent des lots explicitement séparés.

## 2. Ce qui existe et ce qui reste à prouver

### 2.1 Sources directement vérifiées

| Élément | Constat documentaire ou de code | Ce que cela ne prouve pas |
| --- | --- | --- |
| Point d’entrée Codex | Jeu modulaire et Git en lecture seule. [R1] | Une autorisation de déployer ou merger automatiquement. |
| `atome_universal_contract.js` | Les kinds `application`, `pack`, `tool`, `ui`, `connector`, `workflow`, etc. existent ; les familles `capabilities`, `interfaces`, `composition`, `policy`, `lifecycle` sont normalisées. [R3] | Une application tierce installable ou un chargeur de code. |
| `core_atome_types.js` | La liste centrale consultée contient notamment project, group, text, shape, médias et record ; pas de définition centrale `pack` ou `application` dans ce fichier. [R4] | L’absence de tout enregistrement de ces types ailleurs ; l’audit doit le vérifier. |
| `todo/eVe_plugin.md` | Brouillon de conception, lots L0–L9, réutilisation du modèle Atome et des registres existants. [R2] | Des lots déjà développés ou leurs garanties validées. |
| Règles API / rendu / état | Commandes contrôlées, mutations canoniques, propriétaires uniques, WebGPU et permissions. [R5, R6] | Une exposition MCP externe complète pour tout outil simplement enregistré. |
| Protocoles UI | Procédures d’interaction et de preuves visuelles existantes. [R7] | Une qualification automatique iOS, Android ou plugin sans exécution. |

Aucun test du moteur, de sécurité, de synchronisation ou de device n’a été exécuté pendant cette rédaction. Les affirmations d’anciens plans doivent être requalifiées en code inspecté, test exécuté, intention documentaire ou hypothèse.

### 2.2 Rapprochement obligatoire avec le brouillon existant

| Proposition du brouillon | Traitement dans cette spécification |
| --- | --- |
| Plugin = Atome de kind `pack` | Conservé ; ne pas créer un kind universel `plugin`. Distinguer kind conceptuel et type concret enregistré. |
| Réutiliser l’enveloppe universelle et les propriétaires | Conservé ; aucun registre métier concurrent. |
| Manifeste durable dans `properties.manifest` | Candidat de stockage, à confirmer par audit et aller-retour de persistance avant gel du contrat. |
| « Worker sans fetch », isolation implicite | À corriger : un Worker dispose notamment de fetch et d’IndexedDB. L’isolation doit être imposée et testée, pas déclarée. [E4] |
| Clone structuré considéré comme validation suffisante | À corriger : un schéma de messages bornés est requis ; une valeur clonable n’est pas forcément autorisée. |
| Historique/sync/undo/MCP fournis gratuitement | À requalifier : réutilisation attendue, à démontrer pour chaque intégration et chaque effet. Un effet externe n’est pas annulé par l’historique local. |
| Budget mémoire Worker présenté comme plafond garanti | À remplacer par des limites réellement imposables et mesurées selon le moteur choisi. |
| Suppression de tous les Atomes liés au plugin à la désinstallation | À corriger : retirer le code et les contributions, conserver par défaut les créations utilisateur. |
| Tests uniquement dans `temp/` ; pas de suite du dépôt | À harmoniser avec les règles globales : probes temporaires pour diagnostic, régressions permanentes dans `tests/`, contrôles globaux et locaux requis. |
| Chemin unique de machine personnelle et pas de worktree | Contrainte locale à arbitrer avec la méthode multi-utilisateur, pas exigence universelle à copier. |
| API détaillée `atome.plugin.api@1` | Inventaire de besoins, pas API publiée. Auditer, minimiser et geler la surface avant de générer un SDK. |

## 3. Vocabulaire commun

### 3.1 Application, classe d’application et instance

**Application :** ensemble cohérent de fonctionnalités pour un usage : un journal, un organisateur de concert, un outil de montage ou un suivi de projet. Elle compose des Atomes, commandes, outils et vues du moteur.

**Classe d’application :** terme utilisé ici pour la définition réutilisable de l’application : capacités, schéma de données, composition, points d’entrée et scénarios. Ce n’est pas une obligation d’écrire `class Application` en JavaScript ni d’introduire un système d’héritage. Le modèle recommandé est la composition du contrat existant de kind `application`.

**Instance d’application :** une utilisation de cette définition dans un contexte donné, avec son identité, sa version de définition et les Atomes de son projet. Deux instances ne partagent pas de données parce qu’elles utilisent le même modèle.

Le mapping exact vers un type enregistré et un projet existant doit être confirmé en L0. Ne pas inventer un champ libre dans chaque Atome ou un nouveau stockage pour rendre ces termes artificiellement opérationnels.

### 3.2 Plugin, paquet, contribution, connecteur et module

**Plugin :** mode de distribution et d’extension. Le paquet est décrit par un Atome de kind `pack` et peut contribuer une application, un outil, un workflow, une interface ou un connecteur. Une application n’a pas nécessairement besoin d’être un plugin ; un plugin n’est pas nécessairement une application entière.

**Contribution :** enregistrement borné dans un propriétaire existant : commande, outil, surface, workflow ou capacité. Une contribution n’obtient pas la propriété du menu, du moteur de rendu ou du registre qu’elle rejoint.

**Module :** unité de code interne au paquet. Il n’est pas installé séparément ni transformé en service global sans nécessité démontrée.

**Connecteur :** adaptation d’un service externe vers une capacité du moteur. Un lien d’API n’est pas du code installable ; une bibliothèque JavaScript n’est pas une API distante ; un serveur MCP n’est pas un paquet plugin.

### 3.3 MCP

MCP permet à une IA de découvrir et d’utiliser des outils, ressources ou prompts. Il ne définit pas à lui seul l’installation, la sandbox, l’interface Atome, le format de paquet ou les droits d’un plugin. Ceux-ci appartiennent au contrat d’hôte. [E1]

```text
Classe d’application → description réutilisable d’un usage
Instance             → utilisation contextualisée et données propres
Paquet plugin        → distribution/version de capacités et contributions
API eVe              → contrat d’accès contrôlé au moteur
MCP                  → interopérabilité avec des clients et outils IA
```

## 4. Architecture proposée et propriétaires

```text
Auteur humain / IA / module audité / API externe
  → spécification et scénarios
  → paquet indépendant : description + code éventuel + assets + preuves
  → vérification d’intégrité / compatibilité / permissions
  → runtime d’extension isolé
  → intentions et messages validés par l’hôte
  → propriétaire existant / Command Bus / politique d’accès
  → mutation canonique / historique / projection / synchronisation
  → rendu et interactions eVe existants
```

Les signatures `window.Atome.commit` / `commitBatch` désignent les propriétaires d’écriture côté hôte. Elles ne sont pas exposées comme objets vivants au code tiers. L’extension transmet une intention ; le moteur valide et effectue l’opération par son chemin canonique. [R5, R6]

### 4.1 Responsabilités à auditer avant implémentation

| Besoin | Propriétaire candidat identifié par le brouillon | Action requise |
| --- | --- | --- |
| Description d’Atomes et types | `atome/src/shared/atome_universal_contract.js`, `core_atome_types.js` | Réutiliser et vérifier les schémas réellement enregistrés. |
| Outils et invocation | `eVe/intuition/tools/core/tool_registry.js`, `tool_runtime_registered_handler.js` | Ouvrir une inscription/retrait contrôlés, sans permettre d’écraser un outil système. |
| Politiques IA | `atome/src/squirrel/ai/agent_gateway.js`, `atome/src/squirrel/atome/mcp_security_policy.js` | Vérifier couverture des capacités, invocation et confirmation. |
| Interfaces déclaratives | `eVe/intuition/runtime/bevy_panel/`, propriétaires de composants du module 04 | Réutiliser composition, texte, géométrie, sélection et skins. |
| Contributions aux panneaux | `eVe/intuition/panel_definitions.js` | Vérifier contrat et points d’extension effectifs. |
| Secrets | `atome/src/squirrel/security/token_vault.js` | Confirmer le stockage et les usages délégués ; aucune lecture par le plugin. |
| Signature et provenance | `atome/security/trusted_keys.js` et vérification associée | Réutiliser seulement si le modèle convient aux paquets et à la révocation. |
| Stockage/projection | `database/adole_storage_projection.js`, schémas et commit | Vérifier le round-trip, les droits et les mises à jour de manifeste. |

Ces chemins non lus intégralement dans la présente rédaction sont des cibles d’audit, pas des garanties d’API publique. Le premier plan doit confirmer chaque propriétaire et les références actuelles.

Un registre d’installation peut détenir le cycle de vie des paquets si aucun propriétaire ne l’assure. Il ne doit pas recopier les tables d’outils, d’ACL, de rendu ou de commandes. Il conserve des références vers leurs enregistrements et organise leur retrait.

## 5. Contrat de paquet

### 5.1 Identités à ne pas confondre

Distinguer : identité stable du paquet ; version immuable et empreinte du contenu ; identité de l’éditeur ; installation locale ; utilisateur/contexte autorisé ; instance d’application ; contribution ; révision du contrat d’API.

La même identité de paquet ne garantit pas une même version. Un changement d’octets crée un nouvel artefact ; une même version publiée ne doit pas être remplacée silencieusement. Le nom lisible, le nom de domaine ou une signature ne donnent aucun droit sur les projets.

### 5.2 Réutiliser les champs existants

| Famille universelle | Rôle dans le paquet |
| --- | --- |
| `meta` | Identité descriptive, auteur et références de provenance. |
| `capabilities` | Capacités déclarées, schémas, effets et niveau de risque déclaré. |
| `interfaces` | Commandes, entrées, sorties et événements publics. |
| `composition` | Contributions et dépendances. |
| `policy` | Visibilité, licence et politique de distribution ; pas les droits effectivement accordés par un utilisateur. |
| `lifecycle` | Version, compatibilité, migrations et dépréciation. |
| `properties` autorisées | Porteur de code et métadonnées propres au type enregistré si le schéma les prévoit. |

Le champ `capabilities` décrit un contrat ; il ne constitue pas une permission. Les besoins de l’extension doivent être reliés à des opérations hôtes connues ; les capacités qu’elle offre sont distinguées des capacités hôtes qu’elle demande.

Pour éviter deux vérités, le plan choisit un domicile durable unique pour le manifeste. Une description normalisée en mémoire ou un fichier de paquet n’est qu’une représentation de ce contrat. La proposition `properties.manifest` du brouillon ne doit pas coexister avec des copies indépendamment modifiables aux autres niveaux.

### 5.3 Exemple de forme cible — pas un paquet installable aujourd’hui

Cet exemple décrit la cible de normalisation. Les noms de capacités applicatives, le type concret `pack`, les propriétés et points d’extension doivent être enregistrés et testés avant emploi. Le marqueur d’empreinte doit être remplacé lors de l’empaquetage ; ce contenu ne vaut ni signature ni permission.

```json
{
  "id": "pack.example.rehearsal",
  "type": "pack",
  "kind": "pack",
  "schema_version": 1,
  "meta": {
    "name": "Rehearsal planner",
    "description": "Prepare a rehearsal using existing project and text tools"
  },
  "capabilities": [
    {
      "key": "example.rehearsal.prepare",
      "description": "Create a rehearsal outline in the authorized project",
      "inputs_schema": {
        "type": "object",
        "properties": {
          "project_id": { "type": "string" },
          "title": { "type": "string", "minLength": 1, "maxLength": 120 }
        },
        "required": ["project_id", "title"],
        "additionalProperties": false
      },
      "outputs_schema": {
        "type": "object",
        "properties": { "created_id": { "type": "string" } },
        "required": ["created_id"],
        "additionalProperties": false
      },
      "effects": ["write", "persistent"],
      "risk_level": "MEDIUM",
      "permissions": ["project.content.write"]
    }
  ],
  "interfaces": {
    "inputs": {},
    "outputs": {},
    "commands": { "prepare": { "capability": "example.rehearsal.prepare" } },
    "events": {}
  },
  "composition": {
    "dependencies": [],
    "children": [{ "id": "application.example.rehearsal", "kind": "application" }],
    "ports": [],
    "compatible_with": []
  },
  "policy": {
    "visibility": "private",
    "license": "UNLICENSED",
    "permissions": [],
    "entitlements": []
  },
  "lifecycle": {
    "version": "0.1.0",
    "compatibility": { "atome_plugin_api": "1-draft" },
    "migrations": []
  },
  "properties": {
    "carrier": {
      "type": "isolated-javascript",
      "entry": "src/main.js",
      "integrity": "BUILD_GENERATED_DIGEST"
    }
  }
}
```

`project.content.write`, `isolated-javascript` et `1-draft` sont ici des propositions de nommage, pas des constantes vérifiées du runtime. Lors du gel de l’API, reprendre les noms existants quand ils couvrent exactement le besoin ; générer cet exemple depuis le schéma réel.

### 5.4 Empaquetage et publication

Un paquet comprend sa description, les fichiers de code effectivement nécessaires, les assets, les traductions, la documentation, la référence de scénarios et les licences applicables. Les preuves lourdes peuvent rester dans un stockage de validation référencé par empreinte ; aucune donnée utilisateur réelle n’est embarquée comme fixture.

L’installation vérifie contenu, version, éditeur attendu, signature selon la politique adoptée, dépendances et compatibilité. Bloquer les chemins sortant du paquet, liens symboliques dangereux, décompression démesurée, fichiers exécutables inattendus et téléchargements de code non déclarés.

Les dépendances sont résolues à des versions exactes et vérifiées avant activation ; pas d’import arbitraire depuis une URL mutable pendant l’exécution. Un module proposé en ligne est audité avant incorporation. Son fichier README n’est pas une instruction autorisant l’IA à changer les règles du moteur.

Les essais locaux peuvent employer un éditeur de développement approuvé pour un espace QA. Ils ne doivent pas ouvrir un mode « exécuter tout code non signé » dans la production. La signature atteste la provenance et l’intégrité, pas l’innocuité.

## 6. Points d’extension et interface utilisateur

La première version expose un petit ensemble de points prouvés : outils, actions, compositions d’application, surfaces déclaratives et workflows. Chaque point possède un propriétaire, un schéma, des capacités requises, des limites et une procédure de retrait.

Une contribution ne s’ajoute pas automatiquement au menu principal. Elle se place selon le contrat UI existant et le plan accepté. Ni nouvelles catégories de Dashboard, ni nouvelles palettes, ni accumulation de labels ne sont introduites sous prétexte qu’un plugin est installé. Les outils gardent leur structure ; les données peuvent employer les présentations déjà prévues.

Le paquet déclare des arbres de composants ou des intentions d’affichage ; l’hôte vérifie puis rend. Il ne fournit ni HTML libre, ni CSS injecté, ni canvas visible propre, ni événement clavier/pointeur global. La géométrie, les menus, les carrés/ratios, les skins et l’i18n restent ceux du framework. Les contrôles normatifs sont référencés dans les modules et maps, pas copiés intégralement ici. [R1, R5]

Un identifiant de contribution doit être dans l’espace de nom du paquet et lié à son installation. Les collisions avec le système ou un autre éditeur sont refusées. Ne pas utiliser une option de remplacement d’un registre interne comme droit d’écraser une contribution étrangère.

Le retrait libère handlers, vues, abonnements et ressources créés par l’installation. Les registres doivent supporter la répétition installation/retrait sans duplication ni résidu.

## 7. Exécution JavaScript et frontière de sécurité

### 7.1 Deux porteurs initiaux, un contrat fonctionnel

**Déclaratif :** données, arbres et enchaînements d’opérations connues. Pas d’évaluation de chaînes comme code. Ce mode exige quand même validation, limites et permissions : une déclaration peut commander une écriture ou saturer une ressource.

**JavaScript isolé :** code manuel ou généré exécuté dans un environnement qui ne reçoit que l’accès contrôlé aux capacités de l’hôte. L’isolation et les limitations sont réalisées avant l’ouverture aux extensions non fiables.

Un simple module ES importé dans le contexte principal ou un Worker du même origin ne constitue pas cette sandbox. Les Workers disposent notamment d’accès réseau et de stockage ; enlever `window` ou masquer un nom de fonction ne démontre pas l’absence de fuite. [E4]

### 7.2 Choix d’isolation à résoudre par un audit technique

Évaluer un environnement JavaScript restreint, éventuellement un interpréteur embarqué dans une exécution isolée, ou une frontière native adaptée au runtime. Ce choix est un besoin de sécurité réel ; il doit comparer réutilisation, dépendances, compatibilité mobile, coûts mémoire et performances.

Le plan de preuve vérifie : absence d’accès aux credentials et au stockage de l’hôte ; pas de réseau non autorisé ; pas d’import dynamique externe ; limites des messages ; interruption d’une boucle infinie ; nettoyage après arrêt ; impossibilité d’appeler directement une API native. Les tests sont effectués sur chaque porteur effectivement annoncé.

Ne pas promettre un plafond mémoire strict si la technologie retenue ne permet pas de l’imposer. Déclarer distinctement limite imposée, budget surveillé et mesure indicative. Si l’isolation n’est pas démontrée, marquer le porteur comme indisponible pour le code non fiable ; ne pas le remplacer silencieusement par une exécution privilégiée.

### 7.3 Messages et contexte d’autorité

Tous les appels métier entre extension et hôte passent par un protocole asynchrone, à schéma validé. Les messages emportent uniquement des valeurs autorisées et bornées. Une référence opaque à une ressource ne donne pas une référence mutable à l’objet réel.

L’hôte associe le canal à l’installation, au paquet, à sa version, à l’utilisateur, au projet et aux permissions. Un plugin ne choisit pas ces éléments d’autorité dans une charge utile qu’il peut falsifier.

Le contrat de message contient au minimum : version du protocole, identifiant de requête, opération, arguments validés, contexte lié par l’hôte, délai, identifiant d’opération idempotente lorsque nécessaire, résultat ou erreur typée. Les paramètres `plugin_id` ou `user_id` envoyés par le plugin ne font jamais foi.

L’API métier accepte par défaut des données JSON bornées. Les fonctions, nœuds DOM, objets d’hôte, cycles, propriétés dangereuses ou payloads excessifs sont refusés par le schéma. D’éventuels transferts binaires utilisent un canal explicite contrôlé en taille et en propriété, pas une autorisation générale fondée sur structured-clone.

Annuler une attente ne prouve pas qu’un effet externe n’a pas eu lieu. En cas de délai dépassé après envoi, l’hôte suit l’opération et signale `outcome-unknown` si nécessaire, plutôt que relancer aveuglément une écriture.

### 7.4 Permissions effectives

La décision est l’intersection des droits de l’utilisateur, du projet, de l’installation, de la capacité, du runtime et du canal de distribution. La politique est vérifiée à chaque opération et à la frontière d’écriture, y compris après une reconnexion.

Le niveau de risque annoncé par le paquet n’est pas autoritaire. Un éditeur ne peut pas classer un envoi de données privées comme une simple lecture pour supprimer le consentement. Un appel MCP et un clic utilisateur reçoivent les mêmes contrôles.

Les permissions nouvelles d’une mise à jour ne sont pas accordées silencieusement. Les actions sensibles et externes suivent les confirmations du moteur ; le canal de prévisualisation n’est pas une dérogation.

Les secrets restent dans le coffre de l’hôte ou du connecteur autorisé. Le plugin demande une opération identifiée sans récupérer le jeton brut. Refuser un mécanisme générique « utiliser un secret vers n’importe quelle URL » qui deviendrait une exfiltration.

### 7.5 Budget et panne

Le plan applique obligatoirement le [contrat PERF-1](WORK_METHOD.md#performance-contract) destiné au module Codex global propriétaire. Les budgets d’ouverture et la méthode de mesure n’ont pas une seconde définition dans la présente spec. Limiter appels en vol, taille des messages, profondeur des arbres, taille des résultats, jobs, temps de calcul et fréquence d’actualisation. La mémoire dépend des garanties du porteur retenu.

Un dépassement produit une erreur, une suspension ou une mise en quarantaine observable. Le moteur reste utilisable. Au prochain démarrage, un paquet fautif ne boucle pas en redémarrage automatique. Une activation reste à la demande ; l’installation n’ajoute pas un préchargement global coûteux.

### 7.6 Benchmarks spécifiques aux applications et plugins

Chaque plugin et chaque nouvelle version sont soumis aux mêmes obligations, qu’ils soient déclaratifs, codés manuellement ou générés par IA. Le plan fixe les budgets propres au porteur et à la charge en référençant PERF-1 ; un paquet qui fonctionne mais ralentit l’hôte au-delà des budgets n’est pas validé.

**Trois états à comparer :** hôte sans le paquet, paquet installé mais inactif, paquet actif sur le scénario. Pour une mise à jour, comparer aussi ancienne et nouvelle versions, avec les mêmes données et droits. Mesurer séparément téléchargement/vérification du paquet, activation, première UI utilisable, appels au pont, traitement, désactivation et retour au repos. L’installation ne doit pas préchauffer artificiellement le scénario d’ouverture mesuré comme froid.

Le parcours UI du plugin hérite des classes PERF-UI ; mesurer le temps de bout en bout, sans retrancher le pont, le contrôle de permissions ou le rendu hôte. Les API sans écran fixent leur budget de latence/débit/volume dans la spec locale. Les outils MCP mesurent coût local et réseau séparément, sans présenter une réponse d’API comme le résultat visible chez l’utilisateur.

Le benchmark couvre au minimum le chemin nominal, la charge représentative convenue, la libération des ressources et l’impact sur un parcours du moteur déjà existant. Pour plusieurs instances ou plugins, mesurer le cumul avec des fixtures fixées au plan, pas uniquement chaque paquet isolé. Une limite locale par plugin ne prouve pas à elle seule le respect du budget global du moteur.

Pour le hot reload, mesurer l’attente du point sûr, la durée de bascule et l’interruption perceptible séparément. Un report durant un enregistrement est un comportement explicite, pas une bascule instantanée. Les migrations ont leur budget dépendant du volume ; elles ne sont pas incluses artificiellement dans un « reload = 0 ms ». Si audio/vidéo est concerné, appliquer PERF-AV et publier la continuité réelle.

Le kit d’auteur doit pouvoir produire le même rapport de benchmark que la CI, avec candidats, appareils, P50/P95/max, limites, ressources et données brutes. Les seuils ne sont ni autodéclarés comme réussis par le paquet ni relevés par son éditeur après un échec. L’hôte et le circuit de validation restent propriétaires du verdict.

## 8. Données, instances, historique et collaboration

### 8.1 Séparation code / données / autorisation

Les données créées appartiennent au projet et à ses utilisateurs, pas au fichier de code chargé. L’instance référence la classe d’application et la version compatible sans recopier tous les objets du paquet dans chaque enregistrement.

L’état d’installation et les grants sont des informations de l’hôte. Les préférences de l’application et les données métier passent par les propriétaires canoniques. Le plugin n’ouvre ni base parallèle, ni stockage de vérité locale concurrent.

### 8.2 Historique et effets externes

Les changements métier réutilisent le commit et l’historique existants. Leur conservation, undo et synchronisation doivent être testés dans les scénarios : le simple appel d’une façade ne suffit pas à annoncer ces propriétés.

Le replay de l’historique ne rappelle pas une API distante, une IA ou une opération d’envoi. Il rejoue les résultats canoniques enregistrés. Une réponse externe ou une génération non déterministe est capturée comme résultat de l’opération d’origine, avec la provenance nécessaire ; son recalcul est une nouvelle action explicite.

Une compensation éventuelle d’effet externe est une opération distincte, autorisée et documentée. Un undo d’Atome ne retire pas un courriel déjà envoyé.

### 8.3 Multi-utilisateur

L’installation d’un plugin sur une machine n’autorise pas son exécution chez un collaborateur. Un projet partagé peut indiquer qu’une capacité manque ; le destinataire choisit son installation et ses droits.

Un appareil sans plugin doit conserver les données. Il peut afficher les Atomes génériques déjà interprétables et expliquer l’absence de fonctionnalité. Ce comportement est un état documenté de capacité absente, pas un fallback de rendu concurrent.

Des versions concurrentes doivent respecter un schéma commun explicite. Lorsqu’une version ne peut pas écrire de manière sûre, refuser cette opération plutôt que réinterpréter silencieusement les données. La politique de conflit reste celle du moteur et préserve l’historique. [R6]

### 8.4 Retrait et suppression

Désactiver coupe l’exécution et retire les contributions actives. Désinstaller enlève le paquet et ses ressources d’exécution ; les données utilisateur restent par défaut.

Supprimer les données est une action séparée qui expose son périmètre, ses dépendances, les autres utilisateurs concernés et les possibilités de récupération. Ne pas assimiler `source_domain: plugin.<id>` à une autorisation d’effacer tous les contenus correspondants.

## 9. Cycle de vie et mise à jour à chaud

### 9.1 Sens de « à chaud »

Installer, activer ou mettre à jour une extension compatible sans redémarrer toute l’application hôte. Cela ne signifie pas remplacer des instructions au milieu d’un traitement, recharger un composant natif arbitraire, interrompre un enregistrement ou modifier simultanément la version active de tous les collaborateurs.

Une opération non interruptible est terminée ou mise en pause selon un point sûr défini dans le scénario. Pendant une performance ou un enregistrement, différer la bascule plutôt que promettre une continuité audio non mesurée.

### 9.2 États proposés

```text
absent → installed → enabled → active
                  ↘ disabled
active → update-staged → quiescing → active (nouvelle version)
active / staged → failed ou quarantined
installed / disabled → uninstalled (données conservées)
```

Ces états sont ceux du runtime plugin. Ils ne remplacent pas les statuts de tâche définis dans `WORK_METHOD.md`.

### 9.3 Transaction de mise à jour

1. Récupérer le nouveau paquet dans un stockage de staging immuable ; vérifier provenance, empreintes, compatibilité et dépendances.
2. Comparer les capacités demandées et recueillir les permissions supplémentaires avant activation.
3. Préparer l’extension sans ouvrir de nouvelles écritures métier ; vérifier ses contrats et son initialisation.
4. Réserver la transition pour cette installation ; arrêter l’admission de nouvelles opérations de l’ancienne version et attendre le point sûr prévu.
5. Vérifier la révision des données ; exécuter une migration autorisée si elle est nécessaire, en préservant les écritures concurrentes et l’historique.
6. Retirer les contributions de l’ancienne instance et activer atomiquement la nouvelle référence quand les propriétaires le permettent.
7. Réaliser les contrôles de santé et de scénario nécessaires ; libérer l’ancien runtime et ses ressources.
8. Enregistrer la version active, les résultats et les éventuelles limites.

Un seul propriétaire organise la bascule. Les effets ne s’exécutent jamais deux fois parce que deux versions ont été actives un instant.

En cas d’échec avant migration, conserver ou réactiver la version précédente si elle est sûre. Après migration irréversible ou effet externe, ne pas annoncer un rollback automatique : bloquer l’activation incompatible et proposer la réparation la plus petite et prouvée. Les anciennes versions peuvent rester dans le stockage d’artefacts, mais pas comme branches de code dormantes actives du moteur.

## 10. API publiques, JavaScript et génération par IA

### 10.1 Surface minimale proposée

L’API réelle sera figée après audit. La documentation d’auteur doit dériver de cette surface et de ses schémas, et non d’une liste de fonctions inventées dans un prompt.

| Famille | Opérations attendues, à relier aux propriétaires |
| --- | --- |
| Contexte | Lire projet et sélection autorisés, sans objets vivants. |
| Données | Lire un sous-ensemble autorisé ; proposer des mutations ; suivre les résultats. |
| UI | Déclarer/actualiser/retirer une composition avec les composants approuvés. |
| Outils | Déclarer une contribution ; recevoir une intention ; invoquer une capacité autorisée. |
| Événements | Abonnements limités et résiliables, sans fuite hors du scope. |
| Connecteurs | Appeler des opérations nommées, recevoir des résultats filtrés. |
| Cycle de vie | Activation, arrêt, reprise et migration dans les conditions de l’hôte. |
| Diagnostic | Émettre des événements structurés autorisés, sans secrets ni console parasite. |

Une API interne existante n’est pas publique uniquement parce qu’un fichier peut être importé. Le SDK d’auteur est une façade de contrat, pas une copie du moteur. Aucune nouvelle couche générale n’est ajoutée si la frontière peut être assurée par un propriétaire existant.

### 10.2 Exemple pédagogique de script — contrat proposé

Ce code illustre seulement la séparation entre calcul local et effet hôte. `context.commands.execute`, `context.signals.on` et l’opération utilisée sont des noms proposés ; ils devront être remplacés/générés depuis le SDK effectivement livré. Ne pas les présenter comme déjà disponibles.

```js
export async function activate(context) {
  const unsubscribe = context.signals.on('prepare-requested', async (event) => {
    const title = String(event.title ?? '').trim();
    if (!title || title.length > 120) {
      throw new Error('invalid_rehearsal_title');
    }

    return context.commands.execute({
      operation: 'example.rehearsal.prepare',
      arguments: { project_id: event.project_id, title },
      operation_id: event.operation_id
    });
  });

  return async function deactivate() {
    await unsubscribe();
  };
}
```

L’hôte revalide toujours les arguments, l’identité réelle, les permissions et l’idempotence. Le contrôle du script n’est qu’un confort d’auteur, pas une barrière de sécurité.

### 10.3 Cahier des charges vers plugin

L’IA commence par la spécification et l’audit des capacités existantes. Elle propose soit une composition sans code, soit une petite logique JavaScript, soit un connecteur. Une capacité absente devient une évolution du moteur identifiée dans le plan ; elle n’est pas simulée par une API fictive.

Le code manuel suit exactement les mêmes contrats, tests et permissions. L’origine « écrit par l’utilisateur » ou « généré par IA » ne dispense pas du contrôle de provenance et d’exécution.

### 10.4 API ou module trouvé en ligne

Avant adoption : identifier la source et sa version, lire sa licence et ses conditions d’usage, vérifier maintenance/sécurité, dépendances, coûts, contraintes de confidentialité et capacités réellement nécessaires.

Pour un module : l’isoler, borner ses entrées/sorties, vérifier ses imports et ses effets ; ne pas incorporer un second framework UI ou renderer. Pour une API : décrire authentification, données sortantes, méthodes autorisées, pagination, quotas, délais, erreurs et idempotence.

Ne pas exécuter automatiquement les scripts d’installation d’un paquet découvert. Ne pas transmettre de code privé, données personnelles ou secrets au fournisseur d’IA sans autorisation de leur titulaire.

## 11. MCP et services externes

### 11.1 Deux directions d’intégration

**Exposition :** une IA extérieure découvre une capacité du plugin via le serveur/passerelle MCP du moteur, puis son invocation suit la même politique qu’une action eVe.

**Consommation :** une application plugin utilise un service externe MCP ou une API via un connecteur autorisé du moteur. Le code du fournisseur n’est pas exécuté dans eVe simplement parce qu’il est joignable.

Les descriptions d’outils, résultats, prompts et ressources distantes restent des données non fiables. Ils ne peuvent pas changer les règles du framework ni autoriser une action. L’hôte applique ses permissions et limite les données transmises.

### 11.2 Version de référence vérifiée

Au 9 septembre 2026, l’adresse officielle `specification/latest` redirige vers **2026-07-28**. C’est la référence externe de conception, pas une preuve que la passerelle actuelle d’Atome l’implémente. [E1]

Cette révision documente des requêtes autonomes avec version et capacités dans `_meta`, `server/discover`, et non le handshake de session `initialize` des versions antérieures. Le plan doit auditer le protocole réellement utilisé par le moteur avant migration. Les contrats de plugin et la version MCP restent deux numéros distincts. [E2]

L’absence de prise en charge de la révision choisie produit une incompatibilité claire. Ne pas cacher une ancienne implémentation derrière une étiquette « dernière version MCP », ni ajouter une compatibilité silencieuse contraire aux règles globales.

### 11.3 Frontière de transport : décision architecturale explicite

Les transports standard actuels de MCP sont `stdio` et Streamable HTTP ; un transport personnalisé reste possible mais doit conserver la sémantique du protocole. Un WebSocket interne n’établit donc pas, à lui seul, l’interopérabilité avec les clients MCP ordinaires. [E3]

Les règles actuelles du framework réservent les commandes et données applicatives au chemin WebSocket canonique et n’autorisent que des exceptions précises. [R5]

**Proposition à adopter dans le module propriétaire, pas permission implicite :** garder WebSocket à l’intérieur d’Atome/eVe ; autoriser une frontière d’interopérabilité externe unique, possédée par la passerelle/les connecteurs existants, utilisant le protocole exigé par le serveur MCP ou l’API tiers. Elle traduit les appels contrôlés, sans nouvelle source d’état et sans transport applicatif parallèle.

Tant que cette frontière n’est pas autorisée, ne pas développer un REST générique ou un MCP HTTP clandestin. Une configuration de transport propre à cette frontière est un contrat explicite, pas un fallback.

### 11.4 Contrat d’outil et authentification

Chaque outil exposé indique son nom qualifié, ses schémas d’entrée/sortie, son propriétaire, ses effets, ses permissions et son comportement d’erreur. Le choix d’exposition se fait dans la politique : une fonction utilitaire interne n’a pas à devenir un outil MCP distinct.

L’enregistrement dans `AtomeAI` ne suffit pas : tester découverte, invocation, résultat, refus de permission et retrait à travers un client MCP réel. Mettre à jour la découverte quand une contribution activée change, selon les capacités effectivement prises en charge.

Pour une ressource MCP HTTP protégée, appliquer l’autorisation correspondante, la séparation des audiences de jetons et les contrôles de scopes. Ne jamais réutiliser aveuglément un jeton destiné à un autre serveur ni l’envoyer dans un lien de test. [E5]

### 11.5 Réseau et effets externes

Le connecteur limite destination, opération, méthode, taille, durée et données sortantes. Il revalide les redirections et empêche les accès indus aux adresses internes et services de métadonnées. Une liste de domaines seule n’est pas une preuve suffisante contre les détournements d’URL.

Les réponses distantes sont contrôlées comme des entrées non fiables. Une action d’envoi est traçable et respecte une clé d’opération persistante quand le fournisseur le permet. Une panne de transport ne déclenche pas une nouvelle écriture sans vérification du résultat antérieur.

### 11.6 MCP Apps n’est pas le moteur de plugins eVe

La spécification officielle mentionne des extensions optionnelles, dont MCP Apps pour des interfaces intégrées aux conversations. Leur présence n’impose pas un renderer HTML supplémentaire dans eVe. [E1]

Le premier lot peut exposer des outils et résultats sans surface MCP Apps. Une extension d’UI conversationnelle serait un adaptateur distinct à auditer, avec compatibilité client vérifiée, jamais une réimplémentation du rendu principal.

## 12. Plateformes, médias et distribution

### 12.1 Contrat multiplateforme

Un paquet décrit les capacités indispensables, les cibles testées et leurs limites. L’hôte vérifie ses propres capacités avant activation. La présence de JavaScript ou de WebGPU n’assure pas un comportement identique entre Web, WKWebView, Tauri et une future cible Android.

Android natif est une cible demandée ; sa chaîne d’exécution Atome/eVe et ses ponts n’ont pas été établis par cet audit. Il faut une fiche de support et des tests propres avant de le déclarer compatible.

### 12.2 Deux types de mise à jour

**Mise à jour de paquet :** une logique ou composition utilisant des capacités déjà supportées peut être candidate au chargement à chaud.

**Mise à jour de l’hôte :** nouveau droit OS, composant natif, DSP non supporté, nouveau moteur ou capacité manquante exige un build de l’hôte et son circuit de distribution. Ne pas déguiser cela en mise à jour de contenu.

### 12.3 Contraintes des stores

Apple admet certaines mini-apps JavaScript et certains plugins non embarqués dans le binaire sous ses règles 4.7 ; cela reste conditionnel. Les contraintes portent notamment sur responsabilité du contenu, données/consentement, exposition des technologies natives, indexation et restrictions d’âge. L’accès natif via le pont du moteur ne doit pas être présumé autorisé. Une étude du canal et une vérification des règles Apple restent nécessaires. [E6]

Google Play distingue notamment le téléchargement de code natif/exécutable et le code interprété, lequel reste soumis aux politiques de la plateforme. Aucun « mode plugin » ne vaut autorisation générale d’auto-mise à jour de l’application Android. [E7]

Ces documents de conception ne certifient pas l’acceptation App Store ou Google Play. Le fonctionnement d’un prototype ad hoc ne démontre pas sa conformité au canal public.

### 12.4 Médias et temps réel

La première version pilote des opérations média existantes par intentions : préparer un arrangement, ajuster des paramètres autorisés ou lancer une analyse hors-ligne. Elle ne place pas un callback JavaScript tiers dans l’audio temps réel et ne crée pas un compositeur vidéo séparé.

Un plan signal futur peut étudier des modules WASM/DSP ou des shaders dans le propriétaire existant. Il doit démontrer mémoire, latence, isolation, compatibilité et distribution par plateforme ; la simple présence d’un moteur WASM ne résout pas ces sujets.

Microphone, caméra, MIDI et fichiers restent accessibles uniquement via des capacités hôtes disponibles et autorisées. Les permissions natives du moteur ne sont pas héritées automatiquement par le plugin.

## 13. Scénarios de validation locaux du système plugin

Le socle global est défini par Codex. Les scénarios ci-dessous sont locaux au chantier plugin ; ils s’ajoutent aux scénarios propres à chaque paquet. Les identifiants sont proposés pour la spécification, pas des tests déjà présents.

| ID | Précondition et action | Résultat attendu et preuve |
| --- | --- | --- |
| PLG-01 | Installer un paquet valide provenant d’un dépôt extérieur. | Version/empreinte reconnues, aucune copie de son code dans les sources du moteur, permissions visibles. |
| PLG-02 | Créer deux instances de la même application dans deux projets. | Données et identités séparées ; définition commune sans mélange de contenu. |
| PLG-03 | Activer puis désactiver un paquet avec outil et panneau. | Contribution visible puis retirée ; menus restants accessibles ; aucun listener/timer/handler résiduel. |
| PLG-04 | Paquet altéré, signature non admise ou dépendance incompatible. | Refus avant exécution ; motif précis ; état initial intact. |
| PLG-05 | Appeler une capacité non accordée ou usurper un contexte. | Refus côté hôte, aucune écriture ni fuite ; trace exploitable. |
| PLG-06 | Révoquer un droit pendant un appel ou une session. | Pas de nouvelles opérations autorisées par l’ancien grant ; état des effets en vol explicite. |
| PLG-07 | Essayer stockage d’hôte, réseau arbitraire, import externe ou API native directe. | Échec dans chaque porteur déclaré sûr ; preuves d’isolation distinctes de la revue de code. |
| PLG-08 | Boucle infinie, rafale d’appels ou arbre trop volumineux. | Interruption/refus ; hôte utilisable ; seuils requis respectés. Une garantie indisponible bloque la validation, elle ne vaut pas réussite. |
| PLG-09 | Mettre à jour à chaud sans migration. | Bascule au point sûr, une seule version active, données préservées, aucune commande dupliquée. |
| PLG-10 | Échec pendant la mise à jour, puis migration concurrente. | Aucun rollback destructif ; ancienne version sûre ou blocage contrôlé et réparation documentée. |
| PLG-11 | A édite, B lit ; B tente une écriture interdite. | Convergence autorisée et refus d’ACL ; pixels et état vérifiés chez A et B. |
| PLG-12 | B n’a pas le plugin, ou possède une version incompatible. | Données conservées ; capacité manquante expliquée ; pas d’exécution ni installation automatique. |
| PLG-13 | Reconnexion après une action, puis replay de l’historique. | Pas de nouvel appel externe dû au replay ; pas de doublon métier. |
| PLG-14 | Désinstaller un paquet ayant créé du contenu. | Code/contributions retirés ; créations utilisateur conservées et récupérables. |
| PLG-15 | Découvrir/invoquer puis retirer un outil via un client MCP réel. | Schémas et résultats corrects, permissions identiques à l’UI, outil retiré non invocable. |
| PLG-16 | Jouer le scénario sur Web, Tauri et iOS réellement visés. | Résultats par appareil/runtime ; aucune validation par extrapolation. Android ajouté après preuve du support. |
| PLG-17 | Lancer le tutoriel puis l’arrêter après une modification. | Seuls ses objets QA sont nettoyés ; données réelles et modifications concurrentes préservées. |
| PLG-18 | Code manuscrit et code généré réalisent le même scénario. | Même contrat, mêmes permissions et mêmes critères ; aucune route privilégiée pour l’IA. |
| PLG-19 | Benchmark première ouverture puis réouverture du plugin et d’un parcours hôte témoin. | PERF-1 appliqué par appareil/charge ; seuils et non-régression respectés, P50/P95/max et échecs archivés. |
| PLG-20 | Comparer hôte seul, paquet installé inactif et paquet actif ; répéter le cycle de vie. | Coût de boot/idle borné, ressources libérées, mémoire active dans le budget et aucune activité privée résiduelle injustifiée. |
| PLG-21 | Plusieurs instances/plugins et mise à jour à chaud pendant un usage représentatif. | Budget global, durée de bascule et continuité mesurés ; pas de masquage du coût par un résultat par plugin seulement. |

Les scénarios doivent être développés en préconditions, gestes, états et critères avant leur implémentation. Les budgets et la matrice précise sont proposés dans le plan avec le niveau simple/intermédiaire/avancé, puis décidés par l’utilisateur. Les benchmarks PERF-1 sont obligatoires dans les trois niveaux ; aucun niveau ne supprime les scénarios de performance applicables. Les quatre niveaux de risque d’une capacité ne sont pas ces trois niveaux de vérification.

Les tests persistants rejoignent `tests/` ; les probes temporaires restent dans `temp/`. Un test manquant n’est jamais un succès implicite. Les régressions de UI/UX passent par les gestes et captures des procédures existantes. [R7]

## 14. Documentation, aide et kit d’auteur

Le guide utilisateur commun est `USER_GUIDE.md`. Il couvre déjà l’idée, les scénarios, la classe d’application, les plugins, le code manuel/IA et les tests distants. Ne pas créer une seconde explication contradictoire de ces concepts dans chaque plugin.

Chaque paquet fournit uniquement sa documentation spécifique : objectif, permissions, entrée dans la fonction, scénario nominal, erreurs, compatibilités et données conservées au retrait. Les exemples techniques sont générés ou testés contre la surface d’API réellement publiée.

La chaîne cible lie scénario → contrat → test → exemple → tutoriel → vidéo. Une démonstration exécute le vrai parcours dans un contexte isolé. Elle dispose de pause/arrêt et n’envoie rien à des tiers sans consentement. L’aide intégrée ne présente pas un tutoriel seulement écrit comme déjà exécutable.

Le kit minimal comprend : schéma de paquet versionné, petit exemple déclaratif, petit exemple JavaScript, outils de validation et benchmarks réutilisant les propriétaires existants, procédure d’empaquetage, fiche de compatibilité et parcours de réception. Pas de magasin ou de générateur supplémentaire sans besoin démontré.

## 15. Plan de réalisation à proposer avant tout code

Ce plan s’articule aux lots L0–L9 du brouillon existant ; il les consolide au lieu d’ouvrir une feuille de route parallèle.

| Lot | Livrable attendu | Condition de sortie |
| --- | --- | --- |
| L0 — Audit et cohérence | Propriétaires vérifiés, type/kind et persistance tranchés, contradictions documentaires résolues. | Un seul contrat et un aller-retour de manifeste prouvé. |
| L1 — Contrat/paquet | Schéma versionné, identités, provenance, dépendances et fixture. | Manifestes invalides refusés ; type réel enregistré si nécessaire. |
| L2 — Contributions | Enregistrement/retrait dans les propriétaires existants. | Cycle répété sans duplication, UI du moteur préservée. |
| L3/L4 — Frontière et permissions | Messages bornés, contexte authentifié, consentement et révocation. | Appels autorisés/refusés et usurpation testés. |
| L5 — Cycle de vie | Installation et activation déclaratives, données d’instance, retrait sûr. | PLG-01 à 06 et 14 selon périmètre, preuves UI comprises. |
| L6 — JavaScript isolé et budgets | Porteur de code réel, manuel ou IA, confinement et performances démontrés. | PLG-07/08/18/19/20 passent selon périmètre ; aucun accès privilégié caché, aucune validation sans mesures. |
| L7 — API et mise à jour | Surface publique minimale, compatibilité, hot reload et migrations. | Exemples exécutables et PLG-09/10/12/13/21, budgets de bascule mesurés. |
| L9 — Distribution/collaboration | Paquet indépendant, canal QA distant, multi-device et documentation. | Scénarios distants, versions exactes, retour arrière et réception. |
| MCP externe | Audit du protocole existant et frontière explicitement autorisée. | Découverte/appel/refus/retrait par client réel ; PLG-15. |
| L8 — Médias signal | Lot distinct ultérieur selon demande. | Mesures DSP/GPU et validation native propres au lot. |

L’installation déclarative peut être montrée tôt, mais la tâche « plugins codables » reste ouverte jusqu’à la livraison du JavaScript isolé. À chaque lot : audit, plan, code, tests globaux/locaux, candidat, validation IA, puis réception utilisateur. Les maps et l’état factuel suivent leurs règles existantes.

## 16. Arbitrages et prérequis sans bloquer la rédaction

**Recommandations retenues pour cette proposition :** composition plutôt qu’héritage, paquet externe, réutilisation des kinds existants, permissions minimales, données conservées au retrait, premier lot sans magasin, JavaScript de contrôle plutôt que DSP tiers, activation à la demande, aperçu QA distinct de la production.

**À décider dans le plan d’implémentation avec preuve :** type enregistré et domicile de manifeste ; technologie d’isolation ; contrat public minimal ; frontière MCP/API externe ; mécanisme de bascule ; profils de distribution iOS/Android ; ressources de test et secrets. L’IA prépare les options et sa recommandation, puis ne pose qu’une question produit ou d’autorisation réellement nécessaire à la fois.

Ces éléments n’empêchent pas d’utiliser la présente spécification comme cahier des charges. Ils empêchent seulement de prétendre que le moteur est déjà construit ou de coder une frontière non autorisée.

## 17. Sources et niveau de preuve

Lecture le 9 septembre 2026. Les liens de code sont fixés sur le commit consulté ; les sources externes restent à revérifier avant publication.

- **R1 — Point d’entrée Codex :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/.codex/AGENTS.md
- **R2 — Brouillon plugin L0–L9 :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/todo/eVe_plugin.md
- **R3 — Contrat universel lu :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/atome/src/shared/atome_universal_contract.js
- **R4 — Types centraux lus :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/atome/src/shared/core_atome_types.js
- **R5 — Règles API/rendu/UI :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/.codex/modules/05-api-rendering-and-ui.md
- **R6 — État/historique/synchronisation :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/.codex/modules/06-atome-state-sync-and-runtime-modes.md
- **R7 — Validation UI :** https://github.com/atomecorp/a/blob/17f9af3e6b3fd880977f3a761375278bb689580f/atome/documentations/how_debug_UI.md ; et `.codex/visual-test-protocol.md` dans le même dépôt.
- **E1 — MCP, spécification actuelle consultée :** https://modelcontextprotocol.io/specification/2026-07-28
- **E2 — MCP, changements de protocole :** https://modelcontextprotocol.io/specification/2026-07-28/changelog
- **E3 — MCP, transports :** https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- **E4 — MDN, capacités d’un Worker :** https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope
- **E5 — MCP, autorisation :** https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- **E6 — Apple, App Review Guidelines, notamment 2.5.2 et 4.7 :** https://developer.apple.com/app-store/review/guidelines/
- **E7 — Google Play, Device and Network Abuse :** https://support.google.com/googleplay/android-developer/answer/16559646?hl=en

**Complément performance :** le catalogue transverse et les sources P1–P8 sont regroupés dans [WORK_METHOD.md, PERF-1](WORK_METHOD.md#performance-contract), pour éviter une norme concurrente. Les PLG-19 à 21 sont des scénarios à implémenter et exécuter, pas des résultats acquis.

**État final de ce document :** proposition rédigée ; aucun hôte de plugins, sandbox, SDK, connecteur, workflow ou canal de distribution n’a été implémenté par cette livraison. Aucun benchmark applicatif n’a été exécuté pour cette révision.
