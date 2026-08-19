# Full Native Atome — Audit et plan de migration Rust

## Mission

Tu travailles sur le projet **atome/eVe**.

Le projet a désormais basculé son moteur principal vers **Bevy**. L’objectif est d’évaluer puis de préparer une migration de l’application vers une architecture **native Rust au maximum**, tout en **conservant JavaScript comme langage de scripting, d’extension et d’automatisation**.

La priorité absolue n’est pas de “réécrire en Rust pour réécrire en Rust”.

La priorité est :

1. supprimer les doublons architecturaux inutiles entre JavaScript et Rust ;
2. avoir une source de vérité unique pour l’état applicatif ;
3. exploiter correctement Bevy et son ECS ;
4. améliorer les performances, la stabilité, la consommation mémoire et la maintenabilité lorsque le gain est réel ;
5. conserver toute la souplesse conceptuelle d’**atome** ;
6. conserver JavaScript comme couche dynamique de scripting ;
7. ne perdre aucune fonctionnalité existante ;
8. ne pas casser les projets existants ;
9. conserver les cibles Web, iOS et macOS ;
10. produire un plan de migration progressif, testable et réversible avant toute conversion massive.

Le nom du projet doit toujours être écrit **atome** en minuscules.

---

# 1. Règle fondamentale

Ne commence PAS par convertir le code.

Commence par réaliser un **audit complet de l’architecture actuelle**.

Aucune migration importante ne doit être proposée uniquement sur la base du principe :

> Rust est plus rapide que JavaScript.

Chaque migration doit être justifiée par au moins un de ces critères :

- suppression d’un aller-retour JS ↔ Rust coûteux ;
- suppression d’une duplication d’état ;
- suppression d’une duplication de logique ;
- meilleure intégration avec Bevy/ECS ;
- amélioration mesurable des performances ;
- réduction de latence ;
- réduction des allocations ;
- réduction de la consommation mémoire ;
- meilleure sûreté du code ;
- meilleure maintenabilité ;
- meilleur accès aux threads ou tâches asynchrones ;
- simplification de l’architecture ;
- meilleure portabilité entre Web, iOS et macOS ;
- nécessité liée au temps réel, à l’audio, au MIDI, à la timeline, au rendu ou aux interactions intensives.

Inversement, si une partie du code n’a **aucun intérêt réel à être migrée**, elle doit être signalée comme telle.

---

# 2. Architecture cible générale

L’architecture recherchée est approximativement :

```text
                    atome
                      │
                      ▼
              ┌───────────────┐
              │   Rust Core   │
              │   Bevy ECS    │
              └───────┬───────┘
                      │
       ┌──────────────┼───────────────┐
       │              │               │
       ▼              ▼               ▼
     Native          Web           Scripting
  iOS / macOS        WASM             JS
       │              │               │
       │              │               ▼
       │              │        API publique atome
       │              │               │
       └──────────────┴───────────────┘
                      │
                Source de vérité
                     Rust
```

Le JavaScript ne doit donc pas disparaître.

Il doit changer de rôle.

## JavaScript doit rester pertinent pour

- scripting utilisateur ;
- automatisations ;
- extensions ;
- plugins dynamiques ;
- comportements personnalisés ;
- prototypage ;
- génération de scripts par IA ;
- logique utilisateur non critique ;
- accès ponctuel aux API navigateur lorsqu’un bridge Web est nécessaire.

## JavaScript ne doit idéalement plus être responsable de

- l’état central de l’application ;
- la représentation canonique des objets atome ;
- la boucle principale ;
- la timeline temps réel ;
- le moteur audio ;
- le scheduling critique ;
- les données ECS ;
- la géométrie critique ;
- les interactions nécessitant un traitement intensif ;
- la synchronisation entre plusieurs représentations du même objet ;
- la logique qui existe déjà en parallèle dans Rust.

---

# 3. Audit initial obligatoire

Produis une cartographie complète du dépôt.

Pour chaque module, fichier ou ensemble logique significatif, déterminer :

- langage ;
- responsabilité ;
- dépendances ;
- état manipulé ;
- fréquence d’exécution ;
- sensibilité à la latence ;
- interaction avec Bevy ;
- interaction avec JavaScript ;
- interaction avec Swift / Objective-C si présente ;
- interaction avec WASM ;
- interaction avec le navigateur ;
- interaction avec l’audio ;
- interaction avec le MIDI ;
- interaction avec le stockage ;
- interaction réseau ;
- interaction avec l’IA ;
- nécessité ou non d’un accès dynamique.

Créer un tableau de classification de la forme :

| Module | Langage actuel | Responsabilité | État canonique ? | Temps réel ? | Bridge JS/Rust ? | Candidat Rust ? | Priorité | Risque |
|---|---|---|---|---|---|---|---|---|

Ne te contente pas des noms de fichiers.

Lis suffisamment le code pour comprendre réellement qui possède l’état et qui décide.

---

# 4. Détecter les doubles sources de vérité

C’est un point critique.

Identifier tous les cas dans lesquels une même information existe simultanément dans :

- JavaScript ;
- Rust ;
- Bevy ECS ;
- DOM ;
- Swift ;
- stockage ;
- cache ;
- représentation intermédiaire ;
- autre système.

Exemples :

```text
objet atome JS
      │
      ▼
copie Rust
      │
      ▼
Entity Bevy
```

ou :

```text
timeline JS
   │
   ├──── état UI
   │
   └──── messages → Rust scheduler
```

Pour chacun de ces cas :

1. identifier la source de vérité actuelle ;
2. identifier les synchronisations nécessaires ;
3. identifier les risques de divergence ;
4. mesurer ou estimer le coût des conversions ;
5. déterminer si Bevy ECS peut devenir la source canonique ;
6. proposer une API de lecture/commande destinée au JavaScript.

L’objectif final doit être :

> un état canonique unique autant que possible.

---

# 5. Audit des bridges

Recenser tous les passages :

- JS → Rust ;
- Rust → JS ;
- JS → WASM ;
- WASM → JS ;
- Rust → Swift ;
- Swift → Rust ;
- WebView → native ;
- native → WebView ;
- messages sérialisés ;
- JSON ;
- strings ;
- copies de buffers ;
- callbacks ;
- événements ;
- promises ;
- channels.

Pour chaque bridge :

- fréquence ;
- volume moyen ;
- volume maximal ;
- allocation ;
- copie mémoire ;
- sérialisation ;
- désérialisation ;
- éventuelle conversion de type ;
- caractère synchrone ou asynchrone ;
- possibilité de batch ;
- possibilité d’utiliser des handles ;
- possibilité de partager un buffer ;
- possibilité de supprimer complètement le bridge.

Identifier particulièrement les bridges utilisés :

- à chaque frame ;
- lors d’un drag ;
- lors d’un zoom ;
- lors du scroll ;
- pour la timeline ;
- pour les waveforms ;
- pour l’audio ;
- pour les événements MIDI ;
- pour l’animation ;
- pour le dessin ;
- pour les matrices ;
- pour les listes de milliers d’objets.

---

# 6. Audit Bevy / ECS

Examiner si l’architecture actuelle exploite réellement Bevy ou si Bevy est encore utilisé comme moteur derrière une architecture principalement JS.

Identifier :

- Components ;
- Resources ;
- Systems ;
- Events / Messages ;
- Observers ;
- Plugins ;
- Schedules ;
- States ;
- Assets ;
- rendering ;
- UI ;
- input ;
- tâches async ;
- éventuels world access directs ;
- commandes différées.

Vérifier particulièrement :

- si les objets **atome** correspondent naturellement à des entities ;
- si leurs propriétés correspondent à des components ;
- si certains concepts doivent plutôt être des resources ;
- si les relations Song → Section → Piste peuvent être représentées proprement ;
- comment représenter les conteneurs ;
- comment représenter les groupes ;
- comment représenter les règles de lecture ;
- comment représenter les permissions ;
- comment représenter les conditions ;
- comment représenter les objets téléportables ;
- comment représenter l’historique et undo/redo.

Ne transforme pas mécaniquement chaque objet JavaScript en Component.

Cherche un modèle ECS cohérent.

---

# 7. Domaines à auditer séparément

Effectuer un audit spécifique pour chacun des domaines suivants.

## 7.1 UI

Analyser :

- UI actuelle ;
- Bevy UI ;
- éventuel DOM/WebView ;
- rendu custom ;
- menus ;
- toolbar ;
- barre inférieure ;
- barre contextuelle droite ;
- dashboard ;
- assistant plein écran ;
- labels ;
- listes ;
- matrices ;
- timeline ;
- drag & drop ;
- gestes ;
- sélection ;
- raccourcis ;
- multi-touch ;
- trackpad.

Déterminer quelles parties doivent :

- devenir Rust/Bevy ;
- rester plateforme ;
- rester HTML/DOM si nécessaire ;
- être exposées au scripting JS.

Préserver impérativement la possibilité pour un script JS de :

- créer un objet ;
- modifier ses propriétés ;
- l’attacher à un parent ;
- le déplacer ;
- lui appliquer des comportements ;
- écouter ses événements ;
- demander sa destruction ;
- effectuer des opérations groupées.

---

## 7.2 Audio

Auditer :

- moteur audio ;
- scheduling ;
- samples ;
- clips ;
- trim ;
- cut ;
- roll ;
- loops ;
- points de loop ;
- time-stretch ;
- pitch ;
- automation ;
- paramètres ;
- sidechain éventuel ;
- multi-out ;
- plugins ;
- AUv3 ;
- interop native ;
- buffers ;
- threads temps réel.

Règle :

> aucune allocation, sérialisation JSON ou passage JS inutile ne doit se trouver sur un chemin audio temps réel.

Le scripting JS doit pouvoir commander l’audio, mais ne doit pas devenir une dépendance du thread audio.

Prévoir un modèle :

```text
JS script
   │
   ▼
Command / Event
   │
   ▼
Rust scheduler
   │
   ▼
Audio realtime
```

et non :

```text
audio callback → JS → décision → retour audio
```

---

## 7.3 MIDI

Auditer :

- entrée ;
- sortie ;
- mapping ;
- scheduling ;
- timestamp ;
- automation ;
- MIDI learn ;
- AUv3 MIDI ;
- contrôleurs externes ;
- routage.

Le JavaScript doit pouvoir déclarer des règles MIDI sans être placé sur le chemin critique de chaque événement si cela crée une latence ou du jitter.

---

## 7.4 Timeline / séquenceur

Auditer :

- représentation du temps ;
- playhead ;
- tempo ;
- signature ;
- clips ;
- sections ;
- pistes ;
- automation ;
- boucles ;
- quantification ;
- transitions ;
- règles de lecture ;
- arrangement ;
- stack/layer ;
- scheduling anticipé.

La timeline est une candidate forte pour Rust.

Déterminer si le temps doit être représenté par :

- ticks entiers ;
- frames ;
- samples ;
- durée rationnelle ;
- beats ;
- secondes ;
- combinaison de plusieurs représentations.

Éviter les erreurs cumulatives de float si possible.

---

## 7.5 Dessin / vectoriel / géométrie

Auditer :

- vectoriel ;
- main levée ;
- découpe ;
- hit-testing ;
- transformations ;
- bounding boxes ;
- paths ;
- tessellation ;
- zoom ;
- rotation ;
- sélection ;
- snapping.

Identifier les traitements qui bénéficient réellement de Rust.

---

## 7.6 Vidéo / média

Auditer :

- décodage ;
- frame timing ;
- synchronisation audio/vidéo ;
- buffers ;
- thumbnails ;
- export ;
- intégration système.

Séparer clairement :

- orchestration ;
- traitement intensif ;
- API plateforme.

---

## 7.7 Stockage et format de projet

Auditer :

- IndexedDB ;
- Cache API ;
- filesystem natif ;
- sérialisation ;
- assets ;
- metadata ;
- cache ;
- autosave ;
- restauration ;
- migrations de versions.

Définir un **format de projet stable et versionné** indépendant de l’implémentation interne.

La migration JS → Rust ne doit pas rendre les anciens projets incompatibles.

Prévoir :

```text
ProjectFormatVersion
SchemaVersion
Migration N -> N+1
```

Chaque migration doit être :

- testable ;
- déterministe ;
- sauvegardable ;
- autant que possible réversible.

---

## 7.8 Réseau / synchronisation / collaboration

Auditer :

- protocoles ;
- websocket ;
- HTTP ;
- sync ;
- partage ;
- permissions ;
- granularité des droits ;
- conditions ;
- téléportation d’objets ;
- conflits.

Ne pas coupler le format réseau à la représentation mémoire ECS interne.

---

## 7.9 IA

L’IA doit pouvoir commander atome via une API de haut niveau.

Éviter que l’IA dépende de détails internes de Bevy.

Préférer :

```text
IA
 │
 ▼
Atome Command API
 │
 ▼
Rust core
```

Cette même API peut éventuellement être utilisée par :

- JS ;
- automatisations ;
- tests ;
- agents ;
- réseau.

---

# 8. JavaScript doit devenir une API de scripting de première classe

Ne considère pas JavaScript comme un héritage à tolérer.

Le scripting JS doit devenir une **fonction officielle d’atome**.

Concevoir une API stable, documentée et versionnée.

Exemple conceptuel :

```javascript
const circle = atome.create("shape", {
  x: 100,
  y: 200,
  width: 80,
  height: 80
});

circle.set({
  rotation: 30
});

circle.on("tap", () => {
  circle.animate({
    scale: 1.2
  });
});
```

Cette API ne doit PAS donner accès directement à des pointeurs, Entity IDs Bevy bruts ou détails internes instables.

Utiliser plutôt :

- handles ;
- IDs stables ;
- commandes ;
- transactions ;
- queries contrôlées ;
- événements.

Exemple interne :

```text
JavaScript
    │
    ▼
Atome JS API
    │
    ▼
Command Buffer
    │
    ▼
Rust API
    │
    ▼
Bevy ECS
```

---

# 9. Performance du scripting JS

Prévoir plusieurs niveaux d’interaction.

## Niveau 1 — commandes ponctuelles

Exemple :

```javascript
atom.set({ x: 100 });
```

Très simple.

## Niveau 2 — batch

Exemple :

```javascript
atome.batch(() => {
  for (...) {
    ...
  }
});
```

L’objectif est d’éviter plusieurs milliers de crossings JS/Rust.

## Niveau 3 — opérations vectorisées

Exemple conceptuel :

```javascript
atome.query(".selected").set({
  opacity: 0.5
});
```

Le filtrage et l’application peuvent être réalisés côté Rust.

## Niveau 4 — comportements compilables ou déclaratifs

Pour les traitements extrêmement fréquents, permettre éventuellement de déclarer une logique qui s’exécute côté Rust sans callback JS par frame.

Exemple :

```javascript
atom.behavior({
  type: "follow",
  target: other,
  smoothing: 0.2
});
```

Le JS décrit le comportement.

Rust l’exécute.

---

# 10. Préserver la flexibilité conceptuelle d’atome

La migration ne doit pas transformer atome en framework rigide.

Les propriétés fondamentales suivantes doivent être préservées :

- création dynamique d’objets ;
- propriétés extensibles ;
- composition ;
- relations entre objets ;
- comportements dynamiques ;
- scripting ;
- introspection ;
- sérialisation ;
- manipulation par IA ;
- plugins ;
- générateurs ;
- extensions futures non connues aujourd’hui.

Étudier une séparation entre :

### Composants natifs typés

Pour les propriétés connues et critiques :

```text
Transform
Visibility
AudioSource
TimelineClip
Track
Section
Permission
```

### Propriétés dynamiques

Pour les extensions et données utilisateur.

Par exemple :

```text
DynamicProperties
CustomData
ScriptState
Metadata
```

Mais ne choisis pas une solution avant audit.

Comparer au minimum :

- `HashMap<String, Value>` ;
- enum typé ;
- reflection Bevy ;
- `Reflect` ;
- registries ;
- composants dynamiques ;
- extension registry ;
- schema registry ;
- combinaison de plusieurs approches.

Évaluer :

- performance ;
- sérialisation ;
- type safety ;
- compatibilité JS ;
- introspection ;
- plugins ;
- migrations.

---

# 11. API interne commune

Étudier la création d’une API de commandes indépendante du frontend :

```text
AtomeCommand
AtomeQuery
AtomeEvent
AtomeTransaction
```

Cette API pourrait être utilisée par :

```text
UI Rust
JS scripting
IA
MIDI mappings
network
automation
tests
```

Exemple :

```text
          UI
           │
JS ────────┤
AI ────────┤
MIDI ──────┤
           ▼
      AtomeCommand
           │
           ▼
        Bevy ECS
```

Cela permettrait de conserver une flexibilité élevée sans multiplier les chemins de code.

Évaluer cette piste sérieusement.

---

# 12. iOS et macOS

Auditer tout ce qui nécessite encore :

- Swift ;
- Objective-C ;
- Objective-C++ ;
- UIKit ;
- AppKit ;
- AVFoundation ;
- CoreAudio ;
- CoreMIDI ;
- Metal ;
- StoreKit ;
- fichiers ;
- partage ;
- permissions ;
- caméra ;
- micro ;
- notifications ;
- extensions ;
- AUv3.

L’objectif n’est PAS de supprimer Swift à n’importe quel prix.

L’objectif est :

```text
Rust = logique atome
Swift/ObjC = adaptateur plateforme minimal
```

Documenter les cas où une API Apple doit raisonnablement rester côté Swift/ObjC.

---

# 13. Web

Le même core Rust doit pouvoir être compilé vers WASM autant que possible.

Auditer :

- taille du WASM ;
- temps de chargement ;
- initialisation ;
- WebGL/WebGPU ;
- audio Web ;
- workers ;
- threading ;
- SharedArrayBuffer ;
- filesystem browser ;
- IndexedDB ;
- clipboard ;
- drag/drop système ;
- file picker ;
- permissions ;
- JS glue.

La cible Web ne doit pas imposer une architecture moins bonne aux versions natives.

Créer des abstractions de plateforme lorsque nécessaire.

---

# 14. Plugins et extensibilité

Préserver plusieurs niveaux possibles de plugins.

Étudier :

### Plugins Rust internes

Pour performances maximales.

### Plugins JS

Pour facilité et dynamisme.

### Plugins externes futurs

Ne pas bloquer la possibilité d’introduire plus tard :

- WASM plugins ;
- scripting supplémentaire ;
- extensions natives ;
- protocoles distants.

Mais ne complexifie pas immédiatement le projet uniquement pour une hypothèse future.

---

# 15. Sécurité du scripting

Le JavaScript utilisateur ne doit pas pouvoir compromettre le moteur.

Déterminer :

- quelles API sont exposées ;
- quelles opérations nécessitent permission ;
- gestion filesystem ;
- réseau ;
- accès devices ;
- microphone ;
- caméra ;
- shell ;
- exécution native.

Si un sandbox est nécessaire, proposer une solution.

Différencier :

```text
Trusted internal scripts
User scripts
Downloaded scripts
AI-generated scripts
```

---

# 16. Compatibilité

La migration doit conserver :

- comportement actuel ;
- projets existants ;
- fichiers existants ;
- automatisations existantes ;
- scripts existants lorsque raisonnablement possible ;
- API publique existante ou fournir une couche de compatibilité ;
- fonctionnalités Web ;
- fonctionnalités iOS ;
- fonctionnalités macOS.

Pour chaque incompatibilité impossible à éviter :

1. la documenter ;
2. expliquer la raison ;
3. proposer un adaptateur ;
4. proposer une migration automatique ;
5. prévoir un test.

---

# 17. Tests de non-régression

Avant chaque phase de migration, construire ou compléter les tests nécessaires.

Minimum :

## Tests unitaires

Pour logique Rust.

## Tests d’intégration

Pour interactions modules.

## Tests de scripting

JS → Rust.

## Tests de format projet

Chargement/sauvegarde/migration.

## Tests timeline

Timing, loops, sections, transitions.

## Tests audio

Scheduling et absence de glitch.

## Tests MIDI

Timestamp et routage.

## Tests UI

Interactions importantes.

## Golden tests

Lorsque pertinent pour :

- rendu ;
- sérialisation ;
- export ;
- waveform ;
- géométrie.

## Tests de charge

Créer par exemple :

- 1 000 atomes ;
- 10 000 atomes ;
- 100 000 composants simples ;
- milliers de modifications par seconde ;
- automation dense ;
- timeline longue ;
- gros projet.

---

# 18. Benchmarks obligatoires

Ne promets pas un gain de performance sans benchmark.

Établir une baseline AVANT migration.

Mesurer lorsque pertinent :

- startup ;
- FPS ;
- frame time moyen ;
- frame time p95 ;
- frame time p99 ;
- CPU ;
- RAM ;
- allocations ;
- temps de création de 1k / 10k objets ;
- temps de modification batch ;
- latence JS → Rust ;
- coût d’une query ;
- timeline scheduling ;
- MIDI jitter ;
- audio callback ;
- sauvegarde ;
- chargement ;
- sérialisation ;
- taille bundle ;
- taille WASM.

Créer un dossier ou protocole benchmark reproductible.

---

# 19. Méthode de migration

Ne jamais faire une réécriture “big bang”.

Utiliser une migration progressive.

Pour chaque domaine :

```text
1. baseline
2. tests
3. nouvelle implémentation Rust
4. adaptateur API existante
5. exécution parallèle éventuelle pour comparaison
6. validation
7. activation nouvelle implémentation
8. suppression ancienne implémentation
```

Lorsque possible, prévoir des **feature flags**.

Exemple conceptuel :

```text
legacy_js_timeline
rust_timeline
```

Le but est de permettre :

- comparaison ;
- rollback ;
- bisect ;
- validation progressive.

---

# 20. Ordre de migration à déterminer

Ne prends pas cet ordre comme une vérité avant audit, mais utilise-le comme hypothèse de départ :

### Phase 0
Audit et benchmarks.

### Phase 1
Définition de l’état canonique et API interne.

### Phase 2
Réduction des doubles états JS/Rust.

### Phase 3
Timeline / scheduling.

### Phase 4
Interactions et géométrie critiques.

### Phase 5
Audio / MIDI orchestration.

### Phase 6
UI et modèle d’objets.

### Phase 7
Stockage et format projet.

### Phase 8
API JS officielle.

### Phase 9
Nettoyage des anciennes couches JS internes.

### Phase 10
Optimisation finale native/Web.

Après audit, produire un ordre corrigé basé sur :

- dépendances ;
- ROI ;
- risque ;
- difficulté ;
- possibilité de test ;
- fréquence de changement du module.

---

# 21. Aucun code perdu

Avant suppression d’un module JS :

- rechercher toutes ses utilisations ;
- rechercher les imports dynamiques ;
- rechercher les appels indirects ;
- rechercher les noms utilisés comme strings ;
- rechercher les callbacks ;
- rechercher les hooks ;
- rechercher les extensions ;
- rechercher les scripts ;
- rechercher les tests ;
- rechercher les fonctionnalités rarement utilisées.

Produire une checklist de parité fonctionnelle.

Ne pas considérer un module comme inutile simplement parce qu’il n’est pas importé statiquement.

---

# 22. Nettoyage

Une fois seulement qu’un remplacement Rust est validé :

- supprimer les duplications ;
- supprimer les adapters devenus inutiles ;
- supprimer les conversions inutiles ;
- supprimer les copies d’état ;
- supprimer les dead code paths ;
- supprimer les feature flags obsolètes ;
- mettre à jour la documentation.

Ne jamais conserver indéfiniment deux architectures concurrentes.

---

# 23. Gestion des erreurs

Définir une politique cohérente :

- erreurs Rust ;
- erreurs scripts ;
- erreurs plateforme ;
- erreurs réseau ;
- erreurs projet ;
- panic policy ;
- logs ;
- traces.

Un script JS défaillant ne doit pas pouvoir faire tomber l’application entière.

---

# 24. Observabilité

Prévoir des moyens de comprendre :

- quel système Bevy prend du temps ;
- quelle commande JS est coûteuse ;
- combien de crossings JS/Rust ont lieu ;
- quelles allocations sont produites ;
- quelles queries sont coûteuses ;
- où se trouvent les spikes frame-time.

Proposer instrumentation et profiling.

---

# 25. Ce qu’il ne faut surtout pas faire

Ne pas :

- réécrire tout le projet d’un coup ;
- supprimer JS ;
- dupliquer tout l’ECS dans un objet JS ;
- appeler JS à chaque frame sans nécessité ;
- sérialiser en JSON des données temps réel ;
- passer des buffers audio par JSON ;
- exposer directement les Entity IDs Bevy au scripting ;
- coupler le format de sauvegarde aux structures Rust internes ;
- casser le Web pour simplifier le natif ;
- casser le natif pour simplifier le Web ;
- remplacer une abstraction flexible par une architecture rigide ;
- migrer un module sans tests ;
- supprimer une fonction dont l’usage n’a pas été recherché ;
- optimiser sans mesurer.

---

# 26. Décisions attendues de l’audit

À la fin de l’audit, répondre explicitement à ces questions.

## Architecture

1. Quelle est aujourd’hui la source de vérité principale ?
2. Existe-t-il plusieurs sources de vérité ?
3. Quel rôle réel joue Bevy actuellement ?
4. Quel pourcentage approximatif de logique applicative reste en JS ?
5. Quelles responsabilités sont inutilement dupliquées ?
6. Où sont les principaux bridges ?

## Performance

7. Quels bridges sont réellement coûteux ?
8. Quels modules JS sont sur des chemins critiques ?
9. Quels gains sont probables ?
10. Quels gains sont spéculatifs ?
11. Quels modules ne valent pas la peine d’être migrés ?

## Rust

12. Quels modules doivent devenir Rust en priorité ?
13. Les objets atome doivent-ils être directement des entities Bevy ?
14. Quelle structure ECS est recommandée ?
15. Comment représenter les propriétés dynamiques ?
16. Comment organiser les crates ?

## JavaScript

17. Quelle API JS publique doit être conservée ?
18. Quelle API doit être modifiée ?
19. Comment garantir batch et transactions ?
20. Comment éviter un callback JS sur les chemins temps réel ?
21. Comment sandboxer les scripts si nécessaire ?

## Plateformes

22. Quelle part peut être commune iOS/macOS/Web ?
23. Quels adapters plateforme restent nécessaires ?
24. Quels problèmes spécifiques WASM existent ?
25. Quelles dépendances natives bloquent une migration ?

## Migration

26. Quel ordre précis de migration minimise le risque ?
27. Quels feature flags faut-il créer ?
28. Quels tests manquent aujourd’hui ?
29. Quels benchmarks manquent ?
30. Quelle stratégie de rollback utiliser ?

---

# 27. Livrables demandés

Avant toute migration massive, produire les fichiers suivants.

## `audit_native_rust.md`

Contenant :

- état actuel ;
- architecture ;
- cartographie ;
- doubles sources de vérité ;
- bridges ;
- modules critiques ;
- problèmes détectés ;
- benchmarks actuels ;
- risques ;
- recommandations.

## `native_rust_target_architecture.md`

Contenant :

- architecture cible ;
- diagrammes ;
- crates ;
- responsabilités ;
- API interne ;
- API JS ;
- plateforme ;
- données ;
- événements ;
- commandes ;
- format projet.

## `native_rust_migration_plan.md`

Plan exécutable comprenant pour chaque étape :

- objectif ;
- fichiers/modules concernés ;
- dépendances ;
- tests à écrire ;
- benchmark ;
- modifications ;
- compatibilité ;
- rollback ;
- critères d’acceptation.

## `native_rust_compatibility_matrix.md`

Comparer :

```text
feature
avant
après
Web
iOS
macOS
JS API
tests
status
```

## `native_rust_benchmarks.md`

Avec baseline et protocole reproductible.

---

# 28. Structure proposée des crates

Ne pas appliquer automatiquement cette structure.

L’évaluer et la corriger selon le dépôt réel.

```text
atome/
├── crates/
│   ├── atome_core/
│   ├── atome_ecs/
│   ├── atome_ui/
│   ├── atome_timeline/
│   ├── atome_audio/
│   ├── atome_midi/
│   ├── atome_media/
│   ├── atome_storage/
│   ├── atome_network/
│   ├── atome_scripting/
│   ├── atome_ai/
│   ├── atome_platform/
│   ├── atome_platform_web/
│   └── atome_platform_apple/
```

Éviter une fragmentation artificielle en dizaines de crates si elle n’apporte rien.

---

# 29. Critères de réussite finale

La migration complète pourra être considérée réussie uniquement si :

- Bevy/Rust possède l’état canonique principal ;
- JS n’est plus nécessaire à la boucle moteur ;
- JS reste utilisable comme scripting flexible ;
- aucun chemin audio temps réel ne dépend du JS ;
- la timeline critique est déterministe ;
- les bridges ont été réduits ;
- les projets existants restent chargeables ;
- les fonctionnalités existantes sont conservées ;
- les tests passent ;
- les benchmarks ne régressent pas sans justification ;
- iOS fonctionne ;
- macOS fonctionne ;
- Web fonctionne ;
- la taille et le temps de chargement Web restent acceptables ;
- le scripting reste simple ;
- une IA peut manipuler atome via une API stable ;
- les extensions futures restent possibles ;
- l’architecture est plus simple qu’avant et non plus complexe.

---

# 30. Format du rapport final de Codex

Terminer l’audit avec un résumé très concret :

```text
MIGRATION FULL NATIVE RUST : OUI / PARTIELLE / NON

Rust actuel estimé :
JS actuel estimé :

Rust cible recommandé :
JS cible recommandé :

Top 5 modules à migrer :
1.
2.
3.
4.
5.

Modules à conserver en JS :
1.
2.
...

Principal problème architectural actuel :
...

Principal gain attendu :
...

Principal risque :
...

Première étape concrète :
...

Ordre complet :
...
```

---

# 31. Instruction finale

L’objectif n’est pas de transformer **atome** en application Rust rigide.

L’objectif est de déplacer **le moteur, l’état et les traitements critiques vers Rust/Bevy**, tout en conservant une couche JavaScript extrêmement flexible qui permette à l’utilisateur, aux plugins, aux automatisations et à l’IA de manipuler atome facilement.

La bonne architecture doit permettre à ces deux idées de coexister :

```text
RUST
performance
stabilité
ECS
temps réel
source de vérité
native
```

et :

```text
JAVASCRIPT
flexibilité
scripting
extensions
expérimentation
automatisation
IA
```

La migration doit donc aboutir à :

> **Rust comme moteur. JavaScript comme langage de contrôle dynamique.**

Commence maintenant par l’audit du dépôt et ne modifie pas l’architecture tant que les dépendances, risques, benchmarks et tests nécessaires n’ont pas été identifiés.
