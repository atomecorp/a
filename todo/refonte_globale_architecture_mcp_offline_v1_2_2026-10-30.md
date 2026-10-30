# atome/eVe — Audit architectural exhaustif et refonte globale en une seule bascule

**Cahier des charges d'architecture — annexe indépendante au chantier Santé**  
**Version 1.2 consolidée — 30 octobre 2026 (MCP universel en accès, offline/IA optionnelle, choix Git explicite)**  
**Nature : prescription de travail, pas rapport d'exécution.**  
**Décision du responsable produit : audit profond et vérifications AVANT ; refonte cohérente de l'ensemble du système EN UNE SEULE BASCULE ; tests et corrections APRÈS. Aucune migration fonctionnelle progressive en production. Le travail sur une branche Git distincte est OPTIONNEL et doit être décidé explicitement par le responsable produit au moment de l’exécution, jamais présumé.**

> **Statut vérifié :** le dépôt `atomecorp/eVe` dispose de plusieurs sources canoniques **partielles** (catégories Dashboard, panneaux, outils, objets, actions). En revanche, dans les sources inspectées, **aucun référentiel unique et exhaustif n'a été démontré** qui permette d'interroger d'un seul endroit les atomes, les familles, les outils, les palettes, les panneaux, les activités, les exercices, les menus, les projets, les molécules et leurs emplacements UI. Ce manque de *cartographie globale* justifie la tâche. Il ne prouve pas que toute l'architecture soit « erratique » : les parties canoniques existantes sont à préserver.

### Décision architecturale synthétique — à conserver pendant toute la refonte

**atome fonctionne seul.** Le produit, ses projets, ses outils, ses panneaux et ses fonctions locales restent utilisables **hors ligne, sans compte IA, sans modèle d'IA, sans serveur MCP distant, sans API IA et sans CDN**. Une IA constitue un **compagnon optionnel** : elle lit et actionne, dans ses droits, les mêmes capacités que la personne ; elle ne remplace ni l'utilisateur, ni le moteur, ni l'interface. Les fonctions dont la nature impose un fournisseur distant (recherche Internet, diffusion, réservation, service cloud, etc.) doivent signaler cette limite sans bloquer le reste du produit.

**Décision MCP : universel en accès, non obligatoire en transport interne.** Toute capacité fonctionnelle autorisée doit être **découvrable, lisible et pilotable** via MCP par une IA ou un client indépendant, mais les événements bruts de pointeur, les boucles audio/vidéo et les gestes du renderer local ne sont **pas obligés de traverser une enveloppe MCP**. UI locale, script, voix, automatisation et MCP convergent vers les **mêmes contrats, outils, permissions et propriétaires d'exécution**. Il ne doit y avoir ni deuxième moteur métier, ni deuxième état durable.

**Refonte totale, livraison unique.** Audit profond et conception globale avant écriture ; réalisation cohérente, tests et bascule **en une seule transition du produit actif**, puis corrections. La branche dédiée reste **facultative** et soumise au choix explicite du responsable produit. **Aucune brique perdue, aucune identité effacée, aucun design remplacé par une UI générique.**

Ce cahier est **la tâche de refonte globale**, distincte du cahier Santé et du cahier MCP du 28 octobre 2026. Il intègre la conclusion de leur confrontation, sans présumer que le protocole MCP officiel, les performances ni la couverture exhaustive sont déjà démontrés.

---

## 1. Commande et périmètre non négociables

### 1.1. Finalité

Transformer le système atome/eVe en une architecture dont **chaque objet, outil, catégorie, module, menu et emplacement graphique est identifiable, classé, versionné, retrouvable et interrogeable**, à partir de contrats centraux explicites.

Les principes architecturaux, le runtime d'exécution et les sous-systèmes multimédia doivent rester **modulaires**, sans nouvelles fenêtres génériques et sans recopier la logique des outils. La centralisation vise **les définitions et leurs relations**, pas un monolithe contenant toute l'implémentation.

### 1.2. Règles absolues

1. **Zéro perte de capacité** : conserver toutes les briques, y compris anciennes, masquées, spécialisées, expérimentales, cachées sous plusieurs niveaux, propres à eVe Basic/eVe Pro, aux projets, aux contextes et aux plateformes.
2. **Identifiants et liens préservés** : pas de renommage destructeur de `atome_id`, `tool_id`, `surface_key`, IDs d'exercice, de projet, de molécules ou de scénarios. Toute adaptation passe par alias et résolution explicite, avec tests.
3. **Conservation fonctionnelle** : chaque outil retrouve sa commande réelle, ses paramètres natifs, son état, ses permissions, son historique, son apparence et sa logique d'ouverture.
4. **Même structure logique quelle que soit l'entrée** : UI, outil, raccourci, commande, API, IA, MCP, voix. Toutes les opérations persistantes reviennent aux propriétaires canoniques.
5. **Une opération de refonte de bout en bout** : aucun lancement partiel de l'ancienne et de la nouvelle architecture, aucun déploiement par rubrique, aucun drapeau produit laissant deux arborescences actives en production.
6. **Audit et simulation complets avant la bascule** : tests préalables et plan de retour arrière sont indispensables. La création d’une branche Git de préparation est une **option**, non une condition ni une action automatique. Elle ne change pas la règle d’une seule bascule de l’architecture active.
7. **Tests et corrections après bascule**, en plus des tests préalables. Possibilité de revenir à un état sain si une régression critique est constatée ; une refonte « en un pas » n'est pas une absence de filet de sécurité.
8. **Ni nouveaux faux composants ni doublons** : réutiliser les modules Bevy, Rust, JavaScript, services atome, contrats existants, recherche, Calendrier, Finder, permissions, synchronisation et couche MCP.
9. **Offline indépendant de l'IA — bloquant** : l'installation provisionnée localement démarre et reste opérationnelle sans Internet, IA, jeton de modèle, service MCP distant ou accès cloud. Aucune fonction *intrinsèquement locale* ne doit dépendre de la disponibilité d'un compagnon IA. Prévoir un accès aux ressources nécessaires localement, une file de synchronisation et des dégradations explicites pour les services réellement distants.
10. **MCP égalité de capacités, pas détour obligatoire des événements bruts** : toute action fonctionnelle autorisée est exposable/découvrable par MCP et partage les contrats et validations de l'UI ; les gestes à fréquence élevée conservent leurs voies natives optimisées lorsque leur sémantique reste représentable par des opérations équivalentes.

### 1.2 bis. Décision Git à demander **au moment de la réalisation**

**Question obligatoire avant toute première modification de code dans la phase de refonte :**

> « Pour cette refonte globale d’atome/eVe, veux-tu travailler sur **une branche Git dédiée et distincte**, ou **directement sur la branche actuellement choisie** ? »

- **Choix A — branche dédiée (optionnelle)** : création d’une branche nommée après accord explicite ; audit, implémentation et tests sur cette branche, puis une seule intégration finale de la refonte. Ne pas la créer avant réponse.
- **Choix B — branche courante** : refonte complète sur la branche explicitement retenue, sans création automatique de branche ; une seule bascule fonctionnelle, en conservant les sauvegardes, contrôles d’intégrité, tests et moyen de restauration adaptés.
- **En l’absence de réponse**, n’inférer ni la création d’une branche ni le droit de modifier la branche courante : poursuivre seulement l’analyse non destructive et attendre la décision pour les écritures.
- **Décision consignée** dans le rapport d’exécution : option choisie, branche et commit de départ, branche cible le cas échéant, responsable de la validation.
- **Ne pas confondre** : la possibilité d’une branche distincte est un choix de méthode de développement ; **la refonte globale et la bascule unique restent obligatoires**, quelle que soit l’option.

### 1.3. Étendue

- Modèle atome ; types, traits, propriétés, identité, parenté, liens, historisation, permissions, partage.
- Molécules, groupes, projets, templates, instances, médias, timelines et espaces de travail.
- Outils, actions, paramètres, palettes, options de l'outil actif, outils contextuels, commandes et exécution.
- Menus, Dashboard, rubriques, sous-rubriques, surfaces, panneaux, cellules, listes, composants UI et visibilité.
- Activité, Sport, tous les exercices, Bien-être, Loisirs, Coachs, Shopping, Boutiques, Trajets ; briques historiques et spécialisées.
- Santé, objectifs, programmes, suivi, moniteurs, Nutrition, Sleep, recherche scientifique et futurs modules thermal/esthétique.
- API locales/cloud, MCP, IA, automatisations, synchronisation, moteurs graphiques et médias ; iOS, macOS, Web et matériel embarqué si pris en charge dans le périmètre actif.
- Exploitabilité : documentation générée, interrogations, tests de conformité, métriques, diagnostics et cartographie immédiatement consultable.
- Fonctionnement **sans IA et hors ligne** : navigation et recherche locales, création/édition de projets et d'atomes, outils, activités autonomes, stockage local, rendu Bevy, audio/vidéo/3D/MIDI et automatisations exécutables sur l'appareil ; exceptions réseau documentées capacité par capacité.
- Contrats MCP : ouverture à un client tiers standard après authentification, découverte de capacités, lecture des états et changements, invocation, résultats, annulations, droits et limites de plateforme, sans requérir une IA.

**Hors périmètre de cette refonte de structure :** réécrire arbitrairement les algorithmes audio/vidéo/3D, changer l'identité graphique validée, inventer des APIs ou modifier les recommandations médicales. En revanche, leurs propriétaires, contrats et dépendances doivent figurer dans la cartographie, et leurs performances doivent être préservées.

---

## 2. Éléments réellement vérifiés — audit initial, non exhaustif

| Sous-système | Référence réelle | Constat | À compléter |
|---|---|---|---|
| Dashboard — catégories premières | `default_values/constants.json` et `domains/dashboard/dashboard_defaults.js` | JSON existant : `calendar`, `news`, `contacts`, `monitor`, `projects`, avec ordre, `dock`, `tool_binding`, source de données. | Rattacher tous les niveaux du Dashboard et leurs cas dynamiques. |
| Dashboard — sous-niveaux | `domains/dashboard/dashboard_mystic_sources.js` | Sources et logiques d'Activité, Créer, Capture, Settings, Monitoring, etc. réparties dans du JS. | Graphe complet des niveaux, enfants, options, permissions et emplacements. |
| Activité | `dashboard_mystic_sources.js` | 7 entrées explicitement relevées : Sport, Bien-être, Coachs, Loisirs, Liste de courses, Boutiques, Trajets ; affichage filtrable selon contexte/Basic. | Parcours exhaustif, tous descendants, anciens états, masqués. |
| Sport | `domains/dashboard/dashboard_training.js` | Musculation → 9 zones → exercices ; Cardio, Souplesse, Favoris, Programme, Semaine, Journal. | `#shared/training_catalog.js` et commandes `training.*` : cardinal exact non prouvé dans cet audit. |
| Bien-être | `domains/dashboard/dashboard_wellbeing.js` | 4 activités exécutables : Respiration, Méditation, Relaxation, Sieste. | Réglages, ponts vers objectifs Santé, actions et médias. |
| Loisirs | `domains/dashboard/dashboard_shows.js` | 15 catégories déclarées et filtres conditionnés aux fournisseurs. | Distinguer sorties, lieux, séances, activités praticables. |
| Briques Santé | `domains/programs/program_brick_catalog.js` | 45 définitions `BR-01..BR-45` et 13 compositions d'objectifs, **différentes** du catalogue des exercices. | Vérifier les anciens alias `BR-*` et le catalogue historique annoncé de 89 entrées avant de conclure. |
| Outils | `intuition/tools/core/tool_registry.js`, `tool_definition_ssot.js` | Registre outillé, validations et représentation des outils/palettes déjà en place. | Réconcilier définitions persistantes, runtime, commandes, menus, contextes et visibilité. |
| Panneaux | `intuition/panel_definitions.js` | Définitions canoniques pour de nombreuses surfaces, IDs, modules, TTL et ouverture. | Inclure panneaux construits par domaines et surfaces dynamiques, sans dupliquer leurs propriétaires. |
| Menu Bevy | `intuition/ribbon/bevy_ui_main_menu_model.js` | Présentation depuis les définitions d'outils ; enfant actif et options affichées par le runtime. | Vérifier l'égalité avec l'arbre universel et les critères de contexte. |
| Recherche | `domains/dashboard/dashboard_search_source.js` | Scopes Dashboard, y compris Activités, mais la traversée de tous les descendants n'est pas établie. | Index hiérarchique exhaustif, recherche des feuilles, synonymes, alias, sécurité. |
| MCP et IA | `documentations/runtime_ai_mcp_entrypoints.md` ; `intuition/runtime/tool_gateway.js` | Contrat documenté : UI/MCP/IA/Voix → runtime V2 → command bus/handlers. MCP `runtime.tools.list/call/batch_call` prévus. | Évaluer les implémentations réellement exposées, les politiques et la parité d'exécution. |
| Objets/molécules | `core/atome_commit.js`, `intuition/runtime/molecule_stores.js`, `domains/templates/project_template_model.js` | Commit atome ; timeline d'une molécule stockée sur l'atome propriétaire, non en magasin parallèle ; templates comme projets atome ordinaires. | Récupérer les contrats bas niveau, les exceptions et les migrations existantes. |

**Limites documentées :** dans cette passe, `#shared/training_catalog.js`, les contrats `#squirrel/...`, le répertoire historique des 89 briques et le graphe de tous les menus n'ont **pas** été entièrement inspectés. Impossible d'attester aujourd'hui le nombre total d'exercices, la totalité des modules ou l'absence d'une cartographie interne alternative. **L'audit préalable doit fermer ces lacunes**, et la liste totale ne sera validée qu'après comparaison statique *et* runtime.

Références principales :

- https://github.com/atomecorp/eVe/blob/main/default_values/constants.json
- https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_mystic_sources.js
- https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_training.js
- https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_shows.js
- https://github.com/atomecorp/eVe/blob/main/domains/dashboard/dashboard_wellbeing.js
- https://github.com/atomecorp/eVe/blob/main/domains/programs/program_brick_catalog.js
- https://github.com/atomecorp/eVe/blob/main/intuition/panel_definitions.js
- https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_registry.js
- https://github.com/atomecorp/eVe/blob/main/intuition/tools/core/tool_definition_ssot.js
- https://github.com/atomecorp/eVe/blob/main/intuition/runtime/tool_gateway.js
- https://github.com/atomecorp/eVe/blob/main/documentations/runtime_ai_mcp_entrypoints.md
- https://github.com/atomecorp/eVe/blob/main/intuition/runtime/molecule_stores.js
- https://github.com/atomecorp/eVe/blob/main/domains/templates/project_template_model.js

---

## 3. Modèle conceptuel commun à normaliser

**L'atome est la base persistante, pas une tuile de Dashboard.** La distinction indispensable est celle entre :

1. **Identité et données** : atome, type, propriétaire, attributs, liens, révision, persistance, permissions.
2. **Assemblage** : molécule, groupe, projet, template, programme, collection, instance et liens compositifs.
3. **Capacité** : outil ou activité réalisable, définie par une identité, un contrat de commande, un propriétaire d'exécution, des paramètres, des préconditions et des effets.
4. **Organisation métier** : catégories, sous-catégories, tags, taxonomies multiples ; un même outil peut apparaître en plusieurs endroits sans duplication de sa logique.
5. **Présentation** : cellule, tuile, palette, panneau, zone de réglages, ruban, contextuel, liste, arborescence et position ; projection du modèle, jamais autorité sur les données.
6. **Entrée d'exécution** : geste, interface, commande/API, IA, MCP, voix. Ces portes ont des droits différents mais doivent appeler le même propriétaire métier.

### 3.1. Ontologie et relations requises

- `atome` : objet de base ; identité canonique, type, traits, propriétés et cycles de vie.
- `tool_definition` : capacité/contrat, référencée par `tool_id`, et liée à l'atome ou l'enregistrement qui la définit selon le modèle effectivement confirmé par l'audit.
- `tool_instance` : association contextualisée d'un outil à une sélection, un atome, un projet ou une session ; **ne pas créer une copie du code de l'outil**.
- `molecule` : assemblage d'atomes, porteur de timeline et d'un propriétaire ; **ne pas l'assimiler automatiquement à un projet**.
- `project` : racine/contexte de travail, permissions, atomes et assemblages ; les templates restent des projets atome.
- `contact` : entité métier liée à un enregistrement atome, à une identité et à ses permissions, selon les contrats vérifiés ; ne pas assimiler tout contact à un simple noeud UI.
- `activity_definition` : pratique ou action réellement réalisable (sport, respiration, nutrition, etc.), éventuellement servie par un outil canonique.
- `health_brick` : concept de santé ou de suivi, qui **peut ne pas être exécutable** ; rattachement à zéro, une ou plusieurs `activity_definition` et mesures.
- `objective_scenario` : graphe ordonné de références à des briques et activités, contraintes et critères ; pas d'implémentation de capacités en double.
- `taxonomy_node` : catégorie, sous-catégorie, groupe de navigation, filtre, raccourci ; sans état métier propre par défaut.
- `ui_placement` : où et dans quelles circonstances la définition apparaît ; distinct de la définition de l'objet, de l'outil ou de l'activité.
- `panel_surface` : identité, type, module/propriétaire natif, représentation et cycle de vie ; distinct des outils qui l'ouvrent.
- `action_contract` : schéma d'entrée/sortie, permission, idempotence, trace, route/capacité propriétaire ; versionné.

**Relations minimales** : `contains`, `refers_to`, `opens`, `executes`, `configures`, `uses_brick`, `produces`, `observes`, `belongs_to`, `visible_in`, `inherits_permissions_from`, `aliases`, `supersedes`, `depends_on`. Leur validité et les cycles autorisés doivent être définis, testés et documentés.

### 3.2. Cardinalités et invariants

- Un outil peut avoir **plusieurs emplacements** dans l'interface et **un seul contrat d'exécution canonique**.
- Une brique Santé peut contribuer à **plusieurs objectifs** et ne possède qu'une fiche de connaissance canonique ; ses sessions personnelles ne sont pas doublées.
- Une catégorie peut présenter des références d'autres domaines ; les liens ne créent pas de copie de l'activité.
- Un atome possède une identité stable ; une molécule agrège des références selon les invariants du propriétaire. Une instance de template conserve l'identité de son origine et ses valeurs d'instance.
- **Un panneau visuellement identique n'est pas forcément la même instance**, mais doit partager son composant et sa logique canonique lorsque c'est le cas prévu.
- Toute commande a un propriétaire clairement unique ; aucun état durable ne dépend exclusivement du panneau qui l'affiche.

### 3.3. Deux arborescences, un graphe

Il faut produire à la fois :

- **Carte sémantique** : que signifie chaque objet, quel est son type, de quelles données, services et commandes il dépend.
- **Carte de navigation** : où l'utilisateur le trouve, par quelle catégorie et quel niveau, avec quel rendu, quelle priorité, quelle visibilité et quel chemin d'accès.

**Ne pas imposer artificiellement un arbre unique** à un système naturellement relationnel. Le stockage logique est un graphe normalisé ; les arbres du Dashboard, des menus, du Finder et des projets en sont des *projections explicites et déterministes*. Un outil partagé est référencé depuis plusieurs branches, pas dupliqué.

---

## 4. Référentiel central et format

### 4.1. Architecture de la source de vérité

**Décision : registre déclaratif central des identités et relations + registres propriétaires conservés pour les comportements.**

Le registre central est la **carte indexée des définitions**, non une nouvelle API métier. Il peut être stocké en JSON versionné, généré de modules JavaScript quand les valeurs sont dynamiques et validé par un schéma JSON. Toute information présente dans deux sources doit avoir **un seul propriétaire** et une projection dérivée. Ne pas créer un deuxième `ToolRegistry`, un deuxième gestionnaire de panneaux, un deuxième propriétaire de timeline ni un deuxième système de permissions.

**Exemple de découpage logique à confirmer pendant l'audit :**

```
architecture/
  registry/
    schema/                  # JSON Schema + règles inter-fichiers
    identities.json          # ids, classes, alias, statut, propriétaire
    relationships.json       # arcs vérifiés et références
    taxonomy.json            # hiérarchies et appartenances multiples
    placements.json          # emplacements UI, ordre, visibilité, contexte
    capabilities.json        # référence des contrats/runtime existants
    integrations.json        # ports MCP/API/services/propriétaires
  generated/
    full-map.json            # assemblage déterministe de tous les fichiers
    inventory-report.json    # comptes, trous, collisions et orphelins
    ui-tree.json             # hiérarchie projetée par mode/plateforme
    graph.mmd                # graphe de dépendances pour audit humain
    index.md                 # documentation et catalogue consultables
```

Les noms ci-dessus **sont une proposition de destination**, pas des chemins ou APIs prétendument déjà implémentés. La structure finale doit respecter les conventions réellement présentes après audit des dépôts.

### 4.2. Identité d'une entrée

Un enregistrement doit permettre au minimum :

| Champ | Rôle |
|---|---|
| `id`, `kind`, `version` | Identité unique, nature normalisée, version du contrat. |
| `owner_path`, `source_refs` | Fichier/paquet propriétaire, preuves de sa présence et dépendances. |
| `label_key`, `aliases`, `tags` | Localisation i18n, noms de recherche, compatibilité historique. |
| `parent_refs` ou `relationships` | Parenté réelle, références croisées et appartenance à plusieurs taxonomies. |
| `execution_ref` | **Seulement si exécutable** : `tool_id`, action, contrat et handler déjà enregistré. |
| `ui_placements` | Navigation, parent de présentation, index de priorité, scope, variante de plateforme, rôle et visibilité. |
| `surface_ref` | Panneau/surface effectivement utilisée ; ses options et son composant restent propriétaires. |
| `status`, `source_confidence` | Confirmé en code, visible au runtime, masqué, indisponible, historique, candidat ; distinctions obligatoires. |
| `permissions`, `availability` | Politique, prérequis, abonnement, matériel, santé et contexte. |
| `test_refs`, `deprecation` | Tests, parité, éventuels remplacements non destructifs. |

Un noeud de navigation ne devient pas une « activité » parce qu'il a une icône. Un exercice n'est pas une simple « sous-catégorie » parce qu'il se trouve sous Musculation. Le schéma impose un `kind` explicite.

### 4.3. Exemple JSON **illustratif et non importable**

```json
{
  "schema_version": "proposed-1",
  "id": "activity.wellbeing.breathing",
  "kind": "activity_definition",
  "source_refs": ["domains/dashboard/dashboard_wellbeing.js"],
  "capability_ref": "breathing",
  "ui_placements": [
    { "parent": "dashboard.activity.wellbeing", "order": 10, "mode": "all" }
  ],
  "execution_ref": null,
  "status": "owner_to_verify",
  "label_key": "<clé i18n à résoudre lors de l'audit>"
}
```

Ce JSON illustre les **distinctions** ; il ne suppose pas l'existence d'un `tool_id` pour la respiration. La production des liens devra extraire les vrais identifiants et refuser ceux qui ne résolvent pas.

### 4.4. Cartographie lisible par les humains

Pour chaque noeud, l'outil de documentation doit retourner immédiatement :

- **Où est-il ?** chemin de code, package, propriétaire, fichiers de tests, documentation.
- **Qu'est-ce que c'est ?** type, nature exécutable ou descriptive, version, état réel.
- **Où l'utilisateur le voit-il ?** Dashboard > … > sous-niveau > cellule, ou projet > … > outil/contextuel ; variantes et éventuels masquages.
- **Que fait-il ?** identifiant d'action, entrées, sorties, API/command bus, permissions, suivi des erreurs.
- **De quoi dépend-il ?** données atome, services, moteur Rust/Bevy, médias, synchronisation, capteurs, autres outils.
- **Combien d'éléments ?** totaux par type, par domaine, par niveau, par visibilité ; feuilles, nœuds et références uniques comptés séparément.

La cartographie est régénérée lors de chaque changement du référentiel ; elle ne peut pas être tenue à jour par documentation manuelle seule.

---

## 5. MCP, APIs et flux — étude de refonte profonde

### 5.1. Décision produit et comparaison architecturale

> Les atomes constituent le socle. Les atomes et leurs relations permettent des outils, contacts, molécules, projets, activités, panneaux et scénarios. Les agents/assistants les interrogent et les pilotent au moyen des capacités MCP et APIs appropriées.

**Arbitrage de conception** :
- **Conserver l'existant sans changement** : bon chemin local et moteurs spécialisés, mais découverte, classification, interopérabilité externe et parité IA incomplètes.
- **MCP obligatoire pour chaque événement utilisateur brut** (hypothèse du cahier MCP fourni) : universalité apparente, mais surcoût, activation système asynchrone, dépendances protocolaires et complexité pour scroll, dessin, texte/IME, jeu, audio, vidéo, Bevy.
- **Cible retenue : architecture hybride unifiée** : mêmes contrats fonctionnels, droits, états et outils que l'entrée soit l'UI locale, un script, une automatisation, la voix ou MCP ; **toute capacité pertinente est pilotable par MCP**, sans encapsuler chaque trame physique ou chaque échantillon audio dans MCP.

MCP est une **porte d'accès standardisée**, non un moteur de données, de rendu, de capture ou de streaming. Une interface tactile n'a pas besoin d'aller-retour MCP pour dessiner ou déplacer un curseur ; elle utilise les mêmes propriétaires et contrôles par le trajet local le plus court. Le rendu et les événements éphémères peuvent rester locaux, tandis que les actions reproductibles et leur état/résultat doivent être exprimables par des contrats communs. Les droits et la traçabilité des mutations sont obligatoires, quel que soit l'appelant.

### 5.2. Chemin commun à faire appliquer

```text
INTERFACE (Bevy / Web / iOS)  ─┐
SCRIPT / API / AUTOMATISATION ─┼→ CONTRAT/IDENTITÉ D'OUTIL → RUNTIME OUTILS V2
IA / GPT / AGENT / VOIX       ─┤                 │                      │
MCP (outil exposé)            ─┘                 └→ politiques/permissions
                                                        │
                                          COMMAND BUS / HANDLER CANONIQUE
                                                        │
                                              PROPRIÉTAIRE DE DOMAINE
                                                /               \
                                         commit atome       action éphémère
                                                │               │
                                      évènements/synchro    session/capteur
                                                └───────┬───────┘
                                                  PROJECTION UI
                                             Bevy / DOM / native
```

L'UI locale entre directement dans les **contrats/outils canoniques** : elle ne devient pas cliente d'un serveur MCP pour fonctionner. Le serveur/adaptateur MCP local ou distant est une **entrée supplémentaire** vers ce même runtime. La voix et l'IA restent facultatives ; un assistant ne détient ni la base de données, ni le cycle de vie des panneaux, ni un pouvoir supérieur à ses permissions. Les clients MCP sans IA sont pris en charge.

Pour les mutations durables, respecter **l'historisation, l'identité, le partage et la synchronisation canoniques**, pas des sauvegardes parallèles. Pour le temps réel audio, vidéo, capteurs et 3D, distinguer **plan de commande** (contrat et état) et **plan de données** (flux basse latence), qui doit rester direct et optimal.

**Contrat documenté aujourd'hui** : `documentations/runtime_ai_mcp_entrypoints.md` prévoit `runtime.tools.list`, `runtime.tools.call`, `runtime.tools.batch_call` et une couche d'audit/confirmation pour l'IA. La tâche doit **tester** ce qui existe effectivement dans les environnements actifs avant de figer la cible ; elle ne peut pas déduire l'exécution complète du seul document.

### 5.3. Tests de la proposition « tout pilotable par MCP »

- Comparer chaque outil UI à la liste des capacités runtime et à leur exposition MCP : `UI_only`, `runtime_only`, `MCP_exposed`, `blocked_by_policy`, `needs_adapter`.
- Mesurer la parité : mêmes validations, retours, erreurs, restrictions, traces, confirmations, annulations et permissions.
- Inventorier les commandes redondantes et les raccourcis contournant le gateway, sans casser les chemins spécialisés qui ont un propriétaire légitime.
- Exiger une découverte des capacités dynamiques : recherche par `tool_id`, par catégorie, par contexte, par capacité et par atome ; **pas de catalogue codé en dur pour un assistant**.
- Respecter les autorisations : un outil découvert n'est pas forcément un outil que l'agent est autorisé à exécuter ; séparation lecture, écriture, partage, suppression, santé, actions critiques.
- Maintenir le mode local-first et les contrats Tauri/iOS/Web/cloud, sans dépendance obligatoire au réseau pour les actions locales.
- Vérifier l'hypothèse « CDN/API » : définir précisément ce qui est distribué (catalogues, médias, assets, programmes) et ce qui reste transactionnel/privé (projets, contacts, santé, commandes). **Un CDN ne remplace pas un commit transactionnel ni un backend d'identité.**

### 5.4. Répartition explicite des responsabilités — entrées et délégation

**Règle : déléguer au propriétaire qui sait exécuter avec le meilleur coût, et unifier au niveau du contrat, non du transport brut.** La délégation n'est jamais un contournement des droits ou de la persistance canonique.

| Niveau | Responsable à vérifier dans le code | Ce qui lui appartient | Ce qui est partagé ou exposé |
|---|---|---|---|
| Entrées physiques | Adaptateur d'entrée natif/Web/Bevy | Souris, molette, survol, toucher, stylet, pression, mouvement analogique/joystick, clavier/IME, MIDI et autres événements à fréquence élevée ; capture, ordre, coalescence maîtrisée et focus | Intentions logiques, état/erreurs et sémantique de geste documentés |
| Interaction/rendu | Moteur Bevy et propriétaires de scène/éditeur | Hit-testing, sélection locale, prévisualisation, défilement, déplacement, dessin, rendu aux FPS cibles et traitement éphémère | Commandes fonctionnelles équivalentes, état observable, fermeture durable des gestes |
| Outils/contrats | ToolRuntime V2, CommandBus, handlers et droits existants | Validation avant effet, orchestration, transactions, historique, annulation, IDs et permissions | Une même capacité invocable par UI, API, scripts, automatisations, voix ou MCP |
| Média/temps réel | Noyaux audio/vidéo/3D, périphériques et capteurs | Audio callback, playback, sampler, MIDI temporel, multi-pistes, vidéo, frame pipeline, buffers, transferts de flux, synchronisation | Démarrer/arrêter/configurer, état, métriques et commandes sûres exposables |
| Externe/IA | Adaptateur MCP conforme et éventuels agents | Découverte, permission client, appels, résultats, ressources, subscriptions, confirmations | Pas de moteur métier parallèle ; IA optionnelle et désactivable |

**Exemples vérifiables** : un mouvement continu de souris ou de joystick peut être traité localement à la cadence du dispositif et de Bevy, sans un appel MCP par trame ; un agent peut demander via MCP une translation cible, une modification d'outil, une lecture d'état ou une séquence d'actions équivalentes. Une saisie manuelle/IME doit garder son chemin native d'activation et de composition ; MCP expose des opérations d'édition sûres, pas une imitation obligatoire de chaque `keydown`. Une action persistante rejoint toujours les mutations canoniques. Pour dessin/multi-gestes, comparer séquences et résultats, sans confondre fidélité d'intention avec transport intégral des événements bruts.

**À prouver avant l'implémentation** : responsables réellement en place (ne pas inventer de modules), contrats disponibles, couches de délégation adaptées, latence p50/p95/p99, pertes/doublons de gestes, cohérence de l'historique, autorisations et comportement hors ligne sur matériel réel. Préserver les appels synchrones nécessitant une activation utilisateur native. Définir les exceptions lorsque l'OS interdit le pilotage artificiel d'une action matérielle.

### 5.5. Interopérabilité MCP officielle et interfaces alternatives

- Évaluer les versions **officielles actuellement applicables** du protocole MCP, et vérifier son cycle d'initialisation ou d'échanges, la découverte, les appels, ressources, résultats, erreurs et notifications ; **ne pas considérer un JSON-RPC interne baptisé MCP comme une preuve de conformité**.
- Tester avec un **client MCP tiers indépendant, sans IA**. Identifier explicitement les transports standards possibles et les transports personnalisés, notamment la compatibilité avec les WebSockets existants ; pas de deuxième autorité métier ni de transport ajouté implicitement au produit.
- Une autre interface doit pouvoir découvrir le catalogue, lire l'état autorisé, la structure de navigation et ses variations, suivre les changements, invoquer un outil et constater son résultat. Une liste de noms d'outils ne suffit pas à reconstruire une interface fonctionnelle.
- Les opérations à effet doivent subir les **mêmes validations avant effet** en synchrone, asynchrone, lot et appel direct ; l'identité du client, les scopes, confirmations, limites de débit, journaux et révocations proviennent d'une autorité fiable.
- Garder la séparation entre **commandes** (incluant capture, lecture, démarrage/arrêt, automatisation) et **flux de données** (audio, vidéo, capteurs, MIDI, 3D). Ne jamais appeler MCP depuis une boucle audio critique ni par échantillon vidéo.
- Contrôler les limites OS : activation utilisateur, focus iOS, clavier/IME, sélecteurs de fichiers et consentements natifs. L'absence de possibilité de simuler un geste natif ne doit pas être masquée par une promesse MCP irréaliste.

### 5.6. Offline-first impératif ; l'IA n'est qu'un compagnon

- **Test d'autonomie fondamentale** : démarrer avec réseau coupé et services d'IA/MCP distant absents ; ouvrir le Dashboard, naviguer jusqu'aux sous-activités, chercher des briques, créer/ouvrir/éditer/enregistrer des projets, utiliser les panneaux et outils, puis quitter et relancer sans perte de données.
- **Aucune dépendance cachée** au cloud pour le boot, la navigation, les métadonnées, le rendu, la recherche locale, la création de projets et les commandes natives supportées. Tout élément distribué via CDN doit disposer de son équivalent installé, mis en cache de façon robuste ou embarqué si son usage est nécessaire hors ligne.
- **Parité sans IA** : chaque fonction du noyau est utilisable manuellement, par outil et/ou automatisation déterministe ; l'IA peut suggérer, assembler ou exécuter dans ses permissions, mais son absence ne doit jamais désactiver le socle fonctionnel ni les parcours locaux.
- **Ressources réseau par nature** : publication distante, services tiers, recherche Internet, échanges en ligne et appels de modèles distants deviennent explicitement indisponibles ou différés, **sans blocage de la session locale**. Les données restent locales, avec reprise/synchronisation après retour réseau selon les contrats existants.
- **MCP local compatible offline** si l'utilisateur possède un client local ; aucun serveur MCP externe ni service d'IA ne sont obligatoires. Séparer la disponibilité d'une *porte d'entrée MCP* de l'existence et du fonctionnement de la capacité métier.
- L'IA se comporte comme **un autre utilisateur autorisé, un compagnon et non un chef d'orchestre indispensable**. Même modèle d'objet, mêmes outils, mêmes limites de droits ; révocation ou arrêt immédiat sans interrompre l'usage humain.
- Vérifier Web/Tauri/iOS et matériels embarqués selon leurs capacités réelles ; l'autonomie hors ligne de chaque plateforme doit être prouvée, et les impossibilités identifiées, non cachées.

### 5.7. Observabilité

Chaque action doit pouvoir remonter : `trace_id`, `intent_id`, `source`, `tool_id`, `atome_id`/`project_id` si applicable, propriétaire, latence, résultat, erreur et révision. Les traces privées de santé et les données sensibles ne doivent pas être exposées dans les diagnostics génériques.

---

## 6. Audit exhaustif obligatoire AVANT toute réécriture

### 6.1. Capture de référence immuable

1. Bloquer un commit/source exacte de **tous** les dépôts et packages concernés, pas seulement `atomecorp/eVe` : atome, Squirrel, Rust/Bevy, contrats partagés et services MCP/API effectivement reliés.
2. Sauvegarder leurs schémas, les exemples d'objets, la base de tests, les fixtures, les instantanés de navigation, et les états représentatifs des projets existants.
3. Exécuter le produit actuel dans chaque contexte disponible ; capturer l'arborescence **réelle**, les menus actifs, les panneaux, la présentation des outils, les actions contextuelles et les fonctions Basic/Pro.
4. Dresser les exceptions : éléments non lançables, dépendances tierces, permissions, matériel absent, services facultatifs et fonctionnalités spécifiquement masquées.
5. Etablir une table de correspondance entre les identités historiques, les alias, les instances et les contrats actuels ; conserver les collisions à résoudre sans décisions automatiques arbitraires.

### 6.2. Double méthode pour ne rien perdre

**Analyse statique** : scanner registres, définitions, JSON, `tool_id`, surfaces, `source`, imports, actions, routes, contrats, tests, fichiers d'historique et schémas. Enregistrer la preuve source/ligne et le commit. Détecter les constructions dynamiques et imports paresseux ; ne pas conclure à l'absence sur simple recherche de texte.

**Exploration dynamique** : pour chaque rubrique et modalité, ouvrir les nœuds, descendre jusqu'aux feuilles, inspecter les menus contextuels, les paramètres natifs, les états actifs, les modes d'édition, les permissions, les filtres et la recherche. Lister aussi les actions accessibles seulement via IA/MCP, raccourci, geste ou projet.

**Comparaison obligatoire** : `retrouvés dans le code ∪ retrouvés au runtime ∪ héritage/historique`, réconciliés par identifiant canonique. Tout élément non classé est un **blocage** de la bascule, même s'il semble obsolète.

### 6.3. Inventaires à livrer avant validation

- `baseline_inventory.json` : liste totale, IDs, types, provenance, visibilité, exécution, statut et contexte.
- `baseline_navigation.json` : tous les chemins depuis chaque racine, profondeur, ordres et conditions d'affichage.
- `baseline_capabilities.json` : commandes, panneaux, paramètres, ports MCP/API, propriétaires, permissions.
- `baseline_dependencies.json` : dépendances, import graph, paquet, moteur et frontière de persistance.
- `baseline_counts.json` : compte unique et compte par apparition, par source et mode ; historique inclus.
- `baseline_parity.md` : tableau « avant/attendu/après » et inventaire des divergences.
- `baseline_visual/` : captures, états et comparaisons aux véritables interfaces validées.
- `baseline_offline_matrix.json` : fonction × plateforme × disponibilité réseau/IA/MCP distant × ressources locales requises × résultat testé et exceptions réellement dépendantes d'Internet.
- `baseline_mcp_parity.json` : capacité × ID canonique × invocation UI/API/MCP × permissions × états/résultats × latence × preuve de client indépendant.

**Condition de clôture de l'audit** : tous les identifiants connus doivent être soit liés à un noeud/une capacité, soit explicitement archivés avec justification, soit signalés comme incohérences à résoudre. Aucun élément inconnu ne doit être supprimé pour simplifier l'inventaire.

### 6.4. Analyse de conception AVANT implémentation

- Cartographier le couplage et la duplication entre dossiers/domaines, responsabilités mixtes, imports circulaires, chemins d'exécution parallèles et sources de vérité divergentes.
- Proposer les propriétaires définitifs de chaque schéma et action, avec dépendances autorisées entre paquets.
- Vérifier que les surfaces proposées respectent **exactement** les graphismes, composants, interactions et réglages actuels, particulièrement atome/eVe : aucun panneau générique substitutif.
- Évaluer coût de génération des index, dépendances au chargement, taille mémoire, latence de recherche et fréquence de rafraîchissement de Bevy/DOM.
- Produire un plan de transformation technique **complet, cohérent et implémentable en un seul ensemble**, avec séquencement interne de développement possible **sans livraisons produit intermédiaires**.

---

## 7. Architecture cible et règles de compilation des menus

1. Une taxonomie déclarative, versionnée et validée, ne porte **que la structure et les relations**.
2. Un registre canonique des outils reste propriétaire de leurs actions, paramètres, labels, icônes et conventions de présentation (source existante à confirmer / consolider, ne pas dupliquer).
3. Le constructeur de Dashboard/Mystic, menus, panneaux et recherche consomme les mêmes identités et relations normalisées ; il ne réinvente pas ses listes à la main.
4. Les niveaux peuvent être produits à l'ouverture par une fonction enregistrée (exercices, favoris, événements locaux, données utilisateur), mais le **fournisseur**, ses paramètres, son type et ses frontières sont déclarés dans la carte.
5. Un noeud a un ordre explicite et stable par contexte ; la position visuelle suit les tokens/contraintes Bevy existants, et non des coordonnées JSON absolues applicables à tous les écrans.
6. Les masquages ont une **raison** : mode, permission, matériel, inactivité, état clinique, abonnements, préférence et politique produit. Les enfants masqués restent dénombrables et détectables dans la cartographie d'audit, sans être exposés aux utilisateurs non autorisés.
7. La recherche indexe les **nœuds profonds** et renvoie la voie d'accès / la commande propriétaire ; les synonymes ne changent pas l'identité.
8. Les schémas et les liens deviennent la base des aides/skills/agents : ils peuvent demander « liste toutes les activités utilisant Sport », « où est Respiration ? », « quel panneau affiche telle valeur ? », « quelle commande MCP permet de lancer cet outil ? » avec des réponses vérifiées.
9. Les éléments historiques conservent statut et alias ; les informations absentes sont `unknown`, jamais renseignées par intuition.

### 7.1. Exemple de structure attendue (catégories vs capacités)

```text
Dashboard
  ├─ rubriques système : Agenda, News, Contacts, Moniteur, Projets …
  └─ Activité [projection]
      ├─ Sport [niveau de navigation]
      │   ├─ Musculation [niveau]
      │   │   └─ Zone [niveau] → Exercice [activité exécutable]
      │   ├─ Cardio [niveau] → Exercice [activité exécutable]
      │   ├─ Souplesse [niveau] → Exercice [activité exécutable]
      │   └─ Favoris / Programme / Semaine / Journal [outils, PAS des exercices]
      ├─ Bien-être [niveau] → Respiration / Méditation / Relaxation / Sieste [activités]
      ├─ Coachs [répertoire/service]
      ├─ Loisirs [découverte] → 15 catégories de lieux/événements
      ├─ Liste de courses [outil métier]
      ├─ Boutiques [outil métier]
      └─ Trajets [outil métier]
```

Cette arborescence est **l'état de navigation observé dans les fichiers inspectés**, pas une proposition définitive de réorganisation. Les catégories jugées surprenantes devront être **proposées et validées sémantiquement**, sans suppression de référence ni renommage destructeur. Une vue métier plus rationnelle peut garder les raccourcis actuels en accès secondaires.

---

## 8. Travail de refonte totale en une seule bascule

### Phase préparatoire — *avant*, sans changer le produit

**P0 — Inventaire exhaustif et preuve d'absence de perte, y compris mode offline et usages sans IA.** Fermer les points non audités, retrouver tous les exercices/anciens catalogues, toutes les variantes, les outils non exposés, les contrats MCP, la navigation complète et les dépendances. Mesurer comptes et références.

**P1 — Architecture définitive sur dossier ; comparer explicitement chemins actuels, MCP partout et cible hybride ; décider les délégations par propriétaire, les politiques d’entrée et la parité des fonctions, puis valider la cible.** Rédiger ontologie, matrice de responsabilité, schémas, règles de graphes, stratégie JSON + JS, index, gestion des catégories, générations de menus, cartographie visuelle, politiques, performances et commandes.

**P2 — Choix de branche, puis construction intégrale (sans migration progressive).** **Avant toute modification**, poser la question de la section 1.2 bis et recueillir un choix explicite : branche dédiée **optionnelle** ou branche courante. Ne créer aucune branche par défaut. Implémenter ensuite le registre et les générateurs, centraliser les relations et recâbler **tous** les domaines concernés sur la branche choisie, avec un seul modèle d’exécution. Des commits internes sont possibles ; **une seule livraison fonctionnelle** doit toucher l’application.

**P3 — Qualification complète avant bascule.** Exécuter l’ensemble des tests unitaires, d’intégration, d’identité, de schéma, de parité UI/API/MCP, des migrations de données en environnement de test et des tests de navigation réels, **sur la branche choisie**. Réconcilier les inventaires « avant »/« après » jusqu’à fermeture de tous les écarts. Si une branche dédiée a été choisie, vérifier également son intégration avant la fusion.

### Bascule produit unique — *un seul changement cohérent*

**P4 — Bascule/livraison atomique.** Livrer **une seule refonte cohérente** comprenant code, index, tests, docs, données et scripts coordonnés. **Si une branche dédiée a été choisie**, fusionner après revue et validation ; **si la branche courante a été choisie**, ne pas imposer de branche ni de PR supplémentaires. Dans les deux cas, une seule transition effective de l’architecture active. Les fichiers de migration sont **testés à blanc** avec des jeux de données représentatifs ; aucun service ne doit fonctionner dans un état hybride ancien/nouveau. Une migration persistante éventuelle doit être transactionnelle/compatible selon le backend réellement déployé.

### Après la bascule — qualification et corrections

**P5 — Campagne complète de régression et corrections.** Tester le produit réel, remonter les écarts, corriger les anomalies, revalider comptes/IDs/écrans/performances et poursuivre jusqu'à stabilisation. Les correctifs sont **des réparations de la cible unique**, pas une migration progressive de rubriques laissées sur l'ancienne structure.

**P6 — Audit de clôture.** Produire le rapport final d'équivalence, le catalogue exact des éléments, la carte consultable, les preuves de tests et les exceptions explicitement acceptées.

**Clarification essentielle :** « en une seule passe » signifie *une seule bascule architecturale de la version active*. Il serait dangereux de confondre cette décision avec « écrire sans tester ». La préparation intégrale, les essais en environnement de test, la validation, les sauvegardes et la possibilité de rollback **sont obligatoires**. La branche distincte **n’est pas obligatoire** : elle dépend exclusivement du choix posé au début de l’exécution.

---

## 9. Tests et critères d'acceptation bloquants

### 9.1. Intégrité et couverture

- Identités **avant = après** pour tout élément conservé, avec liste explicite des alias et exceptions autorisées ; aucune perte silencieuse.
- Les chemins de chaque outil/activité/écran sont consultables via le catalogue central, y compris ceux qui sont masqués ou conditionnels (pour un auditeur autorisé).
- Chaque `tool_id`, `surface_key`, identifiant de brique, exercice, projet et molécule se résout de manière univoque.
- Aucun lien vers une commande inexistante ; aucun duplicate owner ; aucune référence orpheline, collision d'alias ou cycle interdit.
- Comptes produits automatiquement : uniques / apparitions UI / par famille / par profondeur / par plateforme / visibles / masqués / archivés.

### 9.2. Interface et comportement

- Comparaison des écrans existants et nouveaux (captures, interactions), à tailles d'écran différentes, gaucher/droitier, modes Basic/Pro et contextes projet.
- Navigation descendante et retour de chaque niveau ; recherche des descendants ; outils contextuels ; long press ; propriétés natives directement associées aux outils ; favoris, programme et médias.
- Aucune fenêtre ou carte substitutive qui ne respecte pas le composant réel ; même apparence, teintes, proportions, icônes et emplacement d'options.
- Rien de « décoratif » ne remplace une action ; chaque entrée visible exécutable ouvre le bon propriétaire.

### 9.3. Commandes, persistance, sécurité

- Parité **fonctionnelle** UI / script / API / MCP / IA / voix pour chaque capacité autorisée ; résultat, permissions, audit, erreurs, annulation, identité et idempotence cohérents ; **sans** exiger un transport MCP pour chaque événement physique.
- Toute fonction locale reste exploitable sans IA, sans modèle connecté, sans serveur MCP externe et sans réseau ; les assistants peuvent être entièrement désactivés sans perte de commandes manuelles.
- Client MCP indépendant et sans IA validé ; l'interopérabilité au protocole officiel est démontrée, non supposée.
- Historisation atome, Time Machine, undo/redo, snapshots, partage, collaboration, permissions et sync offline/online sans perte ni double écriture.
- Confidentialité santé/contacts ; refus explicite d'accès non autorisé ; aucun élargissement d'accès lié à une taxonomie de recherche ou à l'IA.
- Templates et instances, molécules, timelines, projets existants chargés sans migration destructive ; stabilité des IDs et des liens.

### 9.4. Performance et plateformes

- Benchmarks **avant/après sur mêmes scénarios** : démarrage, chargement du Dashboard, profondeur des menus, temps de recherche, mémoire, allocations, charge CPU/GPU, latence d'ouverture, débit et fréquence de rendu Bevy.
- Audio temps réel, sampler, effets, enregistrement, synchro MIDI, lecture vidéo, 3D et lecture multitrack : tests de latence, interruptions, synchronisation et non-régression.
- Souris, molette, stylet/pression, tactile, clavier/IME, périphériques analogiques/joystick et gestes Bevy : contrôle de cadence, précision, tracé, ordre, coalescence, activation native et parité des commandes MCP, sans invocation protocolaire forcée par trame.
- Web, macOS/Tauri, iOS/natif/AiS si présents, matériel local-first, conditions hors réseau, permissions refusées et services externes indisponibles.
- Scénarios de test **offline dès le premier démarrage**, après première synchronisation, pendant une coupure, après redémarrage et lors du retour réseau ; IA activée, désactivée, non installée, erreur et timeout ; vérifier chaque capacité locale et l'absence de dépendance au CDN ou à un service distant.
- La couche de métadonnées et les index ne doivent pas ajouter d'aller-retour réseau au chemin critique d'interaction ; les régressions dépassant le seuil établi sur la baseline bloquent la bascule.

### 9.5. Seuil de bascule

**No-go obligatoire** si un outil/exercice connu n'est plus résolu, si le nombre d'éléments ne concorde pas sans exception approuvée, si une API/permission historique a changé sans contrat, si un écran essentiel est remplacé par une interface inventée, si des performances critiques se dégradent au-delà des seuils préalablement mesurés, **ou si une fonction locale auparavant disponible dépend désormais d'Internet, de MCP externe ou d'une IA**.

---

## 10. Livrables de la tâche et définition de « terminé »

1. **Rapport d'audit profond** (ce qui existe exactement, doublons, incohérences, ancienneté et preuves source/runtime).
2. **Cartographie globale générée** : JSON complet, index de recherche, arbre de navigation par contexte, graphe de dépendances, rapport de nombres, champs canoniques/alias.
3. **Spécification d'ontologie et contrats** : types atome, capacités, outils, instances, molécules, projets, activités, panneaux, permissions, labels et emplacements UI.
4. **Analyse MCP/API et architecture d'exécution** : comparaison contradictoire des trois options, architecture hybride retenue, un runtime propriétaire, parité fonctionnelle, client MCP indépendant, audit, typage, politiques, latence locale, plan de données séparé pour le multimédia et limites des gestes natifs.
5. **Proposition de classification validable** : deux vues « situation réelle » / « organisation rationnelle cible », avec règles de conservation des anciens chemins.
6. **Patch global de restructuration** : livraison cohérente sur la branche **choisie explicitement** (PR uniquement si une branche dédiée a été retenue), scripts de génération, schémas, validations et adaptateurs nécessaires ; aucun second moteur.
7. **Plan de test et résultats de tests** : suites automatisées et captures réelles sur les plateformes pertinentes, inventaire avant/après, comparaisons et plan de restauration.
8. **Documentation pour développeurs et agents** : « trouver une brique/un outil/un panneau en une requête », procédures d'ajout sans modifier plusieurs registres à la main, diagnostics et cartographie dans le dépôt.
9. **Rapport de clôture** : liste exacte des éléments conservés, anomalies résolues, limites réelles et nouvelles garanties de cohérence.
10. **Matrice d'autonomie offline/sans IA** : preuves exécutées par plateforme et par fonction, démarrage sans réseau, coupure, reprise, compagnon IA absent et client MCP distant inaccessible ; exceptions réseau justifiées et non bloquantes.

La tâche est terminée uniquement lorsque le produit restructuré fonctionne **avec et sans IA, en ligne et hors ligne pour toutes ses fonctions locales**, que la cartographie est consultable et régénérable, que **tous les éléments existants ont été réconciliés**, et que la parité fonctionnelle, la sécurité et les performances sont validées.

---

## 11. Articulation avec le chantier Santé

Le cahier des charges Santé reste le document métier directeur : `CAHIER_DES_CHARGES_SANTE_ATOME_EVE_2026-10-30.md`.

**Ordre logique avant publication de la refonte** : le présent audit architectural doit résoudre les identités et chemins effectifs pour permettre au moteur de parcours Santé de référencer les **vrais** outils ; les JSON santé (briques, scénarios, preuves et médias) n'ont pas à recréer leur propre système de navigation ou d'exécution.

**L'intégration finale est unique** : le futur système doit relier sans duplication le Dashboard, Activité, Sport, Bien-être, Santé, les scénarios, les moniteurs, le calendrier, les notifications et la recherche. Une nouvelle fiche Santé utilisera le même référentiel global de capacités et d'emplacements que tous les autres domaines.

---

## 12. Instructions opérationnelles à l'équipe d'implémentation / agent de code

**Références de cadrage à confronter à l'état réel :** `cahier-des-charges-atome-mcp-complete.md` (28 octobre 2026, proposition universelle par MCP ; audit ciblé et estimations non garanties), `documentations/runtime_ai_mcp_entrypoints.md`, `taxonomie.md` (proposition de taxonomie et dimensions de contexte), `CAHIER_DES_CHARGES_SANTE_ATOME_EVE_2026-10-30.md`. Les anciens chiffres de couverture et de charge sont des hypothèses à réauditer et non des objectifs imposés. Les modules Rust/JavaScript/Bevy et services réels restent les références prioritaires.

> **MISSION : RESTRUCTURATION GLOBALE atome/eVe — LIVRAISON EN UNE SEULE BASCULE.** Commencer par analyser TOUS les dépôts et packages actifs, récupérer les contrats partagés, les briques historiques et les menus dynamiques, puis produire la cartographie exhaustive et les comparatifs avant/après. Définir et faire valider une ontologie commune et la frontière de responsabilité de chaque registre. **Avant toute écriture, demander explicitement si une branche Git distincte doit être créée (optionnelle) ou si la branche courante doit être utilisée ; ne jamais choisir à la place du responsable produit.** Après cette décision, implémenter toute la structure cible sur la branche choisie, sans modifier la version active par étapes. Préserver intégralement identités, données, outils, réglages natifs, graphisme, permissions, MCP, historique et performances. Tester avant la bascule ; fusionner seulement si une branche dédiée a été choisie ; livrer dans tous les cas la refonte comme un seul changement cohérent, puis exécuter les campagnes complètes de tests et corriger les anomalies dans la nouvelle architecture. Tout objet, fonctionnalité, identifiant, chemin UI ou contrat non justifié est un point bloquant ; aucun effacement silencieux. N'inventer ni capacité ni composant ni API. Utiliser les modules réels Rust/Bevy/JavaScript et leurs propriétaires existants.

**Décision finale actée : AUDITER INTÉGRALEMENT (dont OFFLINE/SANS IA) → COMPARER ET VALIDER LA CIBLE HYBRIDE → CONCEVOIR INTÉGRALEMENT → DEMANDER LE CHOIX DE BRANCHE (DÉDIÉE OPTIONNELLE / COURANTE) → IMPLÉMENTER INTÉGRALEMENT SUR LA BRANCHE CHOISIE → TESTER (dont MCP indépendant et offline) → BASCULER EN UN SEUL PAS → TESTER ET CORRIGER.**
