Tu vas réaliser un audit technique précis, complet et exploitable de toute la stratégie d’affichage, de rendu, de manipulation, de stockage et de lecture des “atomes” dans ce projet.

Objectif principal : identifier les causes probables des problèmes de performance et de fiabilité liés à WebGPU, Canvas, Bevy, au rastering, aux rafraîchissements, aux mises à jour d’état, à la lecture/écriture en base, au stockage, à l’interprétation et à la manipulation des atomes.

Tu dois produire un rapport d’audit complet dans le fichier suivant :

./todo/WEBGPU_to_repair.md

Ne modifie pas le code applicatif. Tu dois uniquement analyser, vérifier, documenter et écrire le rapport.

---

# Périmètre de l’audit

Analyse tout ce qui concerne :

1. WebGPU
   - Initialisation de l’adapter/device/queue/surface.
   - Gestion des erreurs WebGPU.
   - Gestion du device lost / context lost.
   - Configuration du surface/canvas.
   - Recréation des ressources GPU.
   - Pipelines, bind groups, buffers, textures, uniforms, storage buffers.
   - Allocations répétées côté GPU.
   - Synchronisations CPU/GPU.
   - Copies inutiles entre CPU, GPU, mémoire JS/WASM.
   - Fuites ou accumulation de ressources.
   - Stratégie de rendu frame par frame.
   - Compatibilité navigateur et fallback éventuel.

2. Canvas
   - Création, taille, resize, DPR/devicePixelRatio.
   - Synchronisation entre canvas DOM, WebGPU surface et viewport Bevy.
   - Recalculs inutiles.
   - Rafraîchissements excessifs.
   - Problèmes de tearing, flickering, frames perdues.
   - Gestion des événements resize, zoom, scroll, focus/blur.

3. Bevy
   - Architecture ECS.
   - Systèmes liés au rendu, aux atomes, aux updates et à la base.
   - Ordre des systèmes.
   - Fréquence d’exécution des systèmes.
   - Ressources globales.
   - Events Bevy.
   - Commands différées.
   - Assets Bevy.
   - Plugins actifs.
   - Diagnostics FPS/frame time.
   - Dépendances Bevy/WebGPU/wgpu.
   - Compatibilité WASM si concerné.
   - Surcoût éventuel de systèmes exécutés à chaque frame alors qu’ils devraient être déclenchés uniquement sur changement.

4. Création, lecture, interprétation et manipulation des atomes
   - Modèle de données des atomes.
   - Structure mémoire.
   - Sérialisation/désérialisation.
   - Conversion base → atome → entité Bevy → rendu.
   - Conversion atome → rastering.
   - Parsing/interprétation des atomes.
   - Détection des changements.
   - Invalidation/revalidation.
   - Duplication de données.
   - Coût CPU.
   - Granularité des updates.
   - Gestion des identifiants.
   - Cohérence entre base, état applicatif, ECS et affichage.
   - Risques de désynchronisation.

5. Rastering / rendu des atomes
   - Où et comment les atomes sont rasterisés.
   - CPU rastering vs GPU rastering.
   - Re-rastering inutile.
   - Cache de rastering.
   - Dirty regions / dirty atoms.
   - Batching.
   - Instancing.
   - Culling.
   - Z-order / layering.
   - Textures intermédiaires.
   - Résolution de rendu.
   - Stratégie de redraw.
   - Stratégie de zoom/pan.
   - Coût du rendu lors des interactions.

6. Mise à jour et rafraîchissement
   - Boucle de rendu.
   - requestAnimationFrame si présent.
   - Bevy schedule.
   - Rafraîchissement conditionnel vs permanent.
   - Recalculs déclenchés par la base.
   - Recalculs déclenchés par les interactions utilisateur.
   - Propagation des changements.
   - Debounce/throttle.
   - Gestion des gros volumes d’atomes.
   - Risques de boucles infinies d’update.
   - Risques de double rendu.
   - Risques de lecture/écriture concurrente.

7. Base de données / stockage
   - Type de base utilisé.
   - Lecture des atomes.
   - Écriture des atomes.
   - Transactions.
   - Index.
   - Requêtes répétées.
   - Chargement initial.
   - Chargement incrémental.
   - Cache applicatif.
   - Migration de schéma.
   - Verrouillage ou contention.
   - Sérialisation des payloads.
   - Stratégie offline/local si applicable.
   - Cohérence entre stockage persistant, mémoire applicative et rendu.
   - Coût des accès base pendant les frames critiques.

8. Fiabilité générale
   - Gestion d’erreurs.
   - Logs.
   - Panic hooks si Rust/WASM.
   - Recovery après crash partiel.
   - États impossibles.
   - Race conditions.
   - Ressources non libérées.
   - Gestion des dépendances asynchrones.
   - Cas limites : canvas absent, WebGPU indisponible, base vide, base corrompue, atomes invalides, gros volume d’atomes, resize fréquent, changement d’onglet, perte de contexte GPU.

---

# Méthode obligatoire

Procède dans cet ordre :

1. Inspecter l’architecture du projet
   - Identifier les fichiers liés à WebGPU, Canvas, Bevy, rendu, atomes, base de données, stockage, parsing, rastering, cache et rafraîchissement.
   - Cartographier les flux principaux :
     - base → lecture → interprétation → atomes → ECS/état → rendu
     - interaction utilisateur → update atome → stockage → affichage
     - resize/canvas → surface WebGPU → rendu
     - modification d’atome → invalidation → rastering → refresh

2. Chercher les chemins critiques
   - Identifier tout code exécuté à chaque frame.
   - Identifier tout code qui alloue à chaque frame.
   - Identifier tout code qui lit ou écrit en base trop souvent.
   - Identifier tout code qui reconstruit des buffers, textures, pipelines ou entités inutilement.
   - Identifier tout code qui déclenche un redraw complet alors qu’un redraw partiel suffirait.
   - Identifier les conversions répétées ou coûteuses.

3. Vérifier les risques de bugs et d’instabilité
   - Device lost non géré.
   - Canvas resize incorrect.
   - Surface mal reconfigurée.
   - Ordre de systèmes Bevy fragile.
   - État Bevy désynchronisé avec la base.
   - État GPU désynchronisé avec les atomes.
   - Absence de cache.
   - Absence de dirty flags.
   - Requêtes base dans la boucle de rendu.
   - Gestion asynchrone fragile.
   - Données atomiques invalides ou mal typées.
   - Gros volumes non anticipés.

4. Évaluer les performances
   - Lister les allocations suspectes.
   - Lister les clones/copies suspectes.
   - Lister les reconstructions inutiles.
   - Lister les appels coûteux par frame.
   - Lister les requêtes base répétitives.
   - Lister les systèmes Bevy trop fréquents.
   - Lister les endroits où un cache, un batch, un index, un dirty flag ou une file d’événements réduirait fortement le coût.

5. Prioriser les réparations
   - Classer chaque problème selon :
     - Gravité : critique / haute / moyenne / basse
     - Impact : performance / fiabilité / mémoire / architecture / dette technique
     - Probabilité : certaine / probable / possible
     - Effort estimé : faible / moyen / élevé
   - Donner une proposition de correction concrète pour chaque problème.
   - Indiquer les fichiers concernés.
   - Indiquer les fonctions/modules/classes/systèmes concernés.
   - Donner, quand possible, une stratégie de test ou de validation.

---

# Format obligatoire du rapport

Écris le rapport dans :

./todo/WEBGPU_to_repair.md

Le rapport doit contenir exactement cette structure :

# Audit WebGPU / Canvas / Bevy / Atomes

## 1. Résumé exécutif

Décris clairement :

- L’état général du système.
- Les problèmes les plus graves.
- Les causes probables des problèmes de performance.
- Les causes probables des problèmes de fiabilité.
- Les réparations à faire en priorité.

## 2. Cartographie des fichiers inspectés

Tableau obligatoire :

| Zone | Fichiers inspectés | Rôle | Risque principal |
|---|---|---|---|

Inclure au minimum les zones :

- WebGPU
- Canvas
- Bevy
- Rendu
- Rastering
- Atomes
- Base de données
- Cache
- Événements / updates
- Tests / diagnostics

## 3. Flux de données actuels

Décrire les flux suivants :

### 3.1 Base → Atomes → Rendu

Expliquer précisément comment les données partent de la base et arrivent à l’affichage.

### 3.2 Interaction utilisateur → Atomes → Base → Rendu

Expliquer comment une modification utilisateur est propagée.

### 3.3 Resize / Canvas / Surface WebGPU

Expliquer comment le canvas, la surface et le viewport sont synchronisés.

### 3.4 Rastering / Refresh

Expliquer quand un atome est rasterisé, quand il est réutilisé, quand il est recalculé.

## 4. Problèmes critiques détectés

Tableau obligatoire :

| ID | Gravité | Zone | Problème | Preuve dans le code | Impact | Correction recommandée |
|---|---|---|---|---|---|---|

Chaque problème doit citer :

- le fichier
- la fonction ou le module
- le comportement observé
- pourquoi c’est un problème
- comment le corriger

## 5. Problèmes de performance

Tableau obligatoire :

| ID | Zone | Symptôme probable | Cause technique | Fichiers concernés | Correction | Gain attendu |
|---|---|---|---|---|---|---|

Inclure les catégories :

- allocations par frame
- clones/copies excessifs
- requêtes base trop fréquentes
- rastering trop fréquent
- redraw complet inutile
- reconstruction GPU inutile
- absence de batching
- absence de cache
- absence de dirty flags
- systèmes Bevy trop fréquents
- conversions de données répétées

## 6. Problèmes de fiabilité

Tableau obligatoire :

| ID | Zone | Risque | Déclencheur | Impact | Correction |
|---|---|---|---|---|---|

Inclure les catégories :

- WebGPU indisponible
- device lost
- canvas resize
- données atomiques invalides
- base vide ou corrompue
- désynchronisation base / mémoire / ECS / GPU
- erreurs asynchrones
- race conditions
- crash WASM/Rust
- perte de contexte navigateur
- onglet en arrière-plan

## 7. Analyse de la stratégie actuelle d’affichage

Répondre clairement aux questions suivantes :

- Le rendu est-il principalement immédiat, différé, événementiel ou frame-based ?
- Est-ce que tout est recalculé à chaque frame ?
- Est-ce que les atomes inchangés sont réutilisés ?
- Est-ce que le système sait distinguer un atome modifié d’un atome inchangé ?
- Est-ce que le système sait rafraîchir partiellement l’affichage ?
- Est-ce que le zoom/pan déclenche trop de recalculs ?
- Est-ce que le rastering est correctement séparé du rendu final ?
- Est-ce que la stratégie actuelle peut tenir avec 10 000, 100 000 ou 1 000 000 d’atomes ?

## 8. Analyse de la stratégie de stockage des atomes

Répondre clairement aux questions suivantes :

- Le modèle de stockage est-il adapté aux accès fréquents ?
- Les atomes sont-ils trop gros, trop imbriqués ou trop sérialisés ?
- Les index sont-ils suffisants ?
- Les lectures sont-elles batchées ?
- Les écritures sont-elles transactionnelles ?
- Les écritures sont-elles trop fréquentes ?
- La base est-elle sollicitée pendant les frames critiques ?
- Existe-t-il un cache mémoire fiable ?
- Existe-t-il une stratégie de synchronisation claire entre base et rendu ?

## 9. Architecture recommandée

Proposer une architecture cible claire.

Inclure obligatoirement :

### 9.1 Pipeline recommandé

Décrire un pipeline idéal de ce type :

Base persistante
→ chargement batché
→ cache mémoire normalisé
→ interprétation des atomes
→ dirty flags / invalidation
→ rastering uniquement des atomes modifiés
→ buffers GPU persistants
→ rendu batché / instancié
→ refresh conditionnel

### 9.2 Stratégie de cache

Décrire :

- cache mémoire des atomes
- cache de rastering
- cache GPU
- invalidation
- expiration
- cohérence avec la base

### 9.3 Stratégie de dirty flags

Décrire au minimum :

- dirty_data
- dirty_layout
- dirty_raster
- dirty_gpu
- dirty_visible
- dirty_persisted

### 9.4 Stratégie de rendu

Décrire :

- rendu partiel vs complet
- batching
- instancing
- culling
- viewport
- zoom/pan
- refresh conditionnel
- séparation rastering/rendu final

### 9.5 Stratégie base de données

Décrire :

- lectures batchées
- écritures différées
- transactions
- index
- journal d’événements si pertinent
- snapshots si pertinent
- synchronisation avec l’état mémoire

## 10. Plan de réparation priorisé

Tableau obligatoire :

| Priorité | Action | Fichiers concernés | Impact | Effort | Risque | Validation |
|---|---|---|---|---|---|---|

Classer les actions en :

- P0 : à corriger immédiatement
- P1 : important
- P2 : optimisation structurante
- P3 : amélioration long terme

## 11. Tests et instrumentation à ajouter

Proposer des tests concrets :

- Tests unitaires sur les atomes.
- Tests de parsing/interprétation.
- Tests de cohérence base ↔ mémoire ↔ ECS.
- Tests de resize canvas/WebGPU.
- Tests de device lost si simulable.
- Tests de gros volume.
- Benchmarks de rastering.
- Benchmarks de rendu.
- Benchmarks lecture/écriture base.
- Mesures FPS/frame time.
- Mesures allocations mémoire.
- Mesures temps CPU par système Bevy.
- Mesures nombre de ressources GPU créées par frame.

## 12. Liste des hypothèses à vérifier

Lister tout ce qui n’a pas pu être prouvé directement dans le code mais qui semble probable.

Format obligatoire :

| Hypothèse | Pourquoi c’est suspect | Comment vérifier |
|---|---|---|

## 13. Conclusion technique

Donner une conclusion directe :

- Ce qui bloque réellement les performances.
- Ce qui menace réellement la fiabilité.
- Ce qu’il faut réparer en premier.
- Ce qu’il ne faut pas faire.
- La stratégie cible recommandée.

---

# Exigences de qualité

Le rapport doit être technique, direct et exploitable.

Interdictions :

- Ne fais pas un rapport vague.
- Ne donne pas de conseils génériques sans preuve.
- Ne dis pas “à vérifier” si tu peux vérifier dans le code.
- Ne propose pas de réécriture complète sans justification.
- Ne modifie pas le code applicatif.
- Ne supprime aucun fichier.
- N’invente pas de fichiers inexistants.
- N’invente pas de comportement non observé.

Obligations :

- Cite les fichiers exacts.
- Cite les fonctions/modules/systèmes exacts.
- Donne des preuves concrètes issues du code.
- Distingue les faits observés des hypothèses.
- Priorise les problèmes.
- Propose des corrections réalistes.
- Indique comment valider chaque correction.
- Crée ou mets à jour uniquement le fichier ./todo/WEBGPU_to_repair.md
- Si le dossier ./todo n’existe pas, crée-le.
- Si le fichier existe déjà, conserve son contenu utile si pertinent, mais remplace les conclusions obsolètes par l’audit actuel.

---

# Commandes et vérifications

Avant d’écrire le rapport final, inspecte les fichiers du projet avec les outils disponibles.

Si possible, exécute les commandes pertinentes selon la stack détectée :

- recherche de fichiers :
  - find .
  - rg "webgpu|wgpu|canvas|bevy|atom|atoms|raster|render|texture|buffer|pipeline|database|db|storage|cache|dirty|resize|viewport|requestAnimationFrame"

- Rust/Bevy si applicable :
  - cargo check
  - cargo test
  - cargo clippy
  - cargo tree

- Web/WASM si applicable :
  - npm install si nécessaire uniquement si les dépendances sont absentes
  - npm run build
  - npm test
  - npm run lint
  - wasm-pack test si présent
  - trunk build si présent

N’exécute pas de commande destructrice.

Ne lance pas de migration de base réelle sans environnement de test.

Documente dans le rapport :

- les commandes exécutées
- celles qui ont échoué
- les erreurs importantes
- les commandes non exécutées et pourquoi

---

# Niveau d’analyse attendu

Tu dois chercher en priorité les anti-patterns suivants :

1. Lecture en base pendant la boucle de rendu.
2. Écriture en base à chaque micro-changement sans batch/debounce.
3. Recréation de textures GPU à chaque frame.
4. Recréation de buffers GPU à chaque frame.
5. Recréation de pipelines/bind groups inutilement.
6. Re-rastering complet après modification minime.
7. Redraw complet systématique.
8. Absence de dirty flags.
9. Absence de cache mémoire des atomes.
10. Absence de cache GPU/raster.
11. Clones massifs de collections d’atomes.
12. Sérialisation/désérialisation répétée.
13. Conversion base → rendu trop directe sans couche intermédiaire stable.
14. Couplage excessif entre stockage, logique atome et rendu.
15. Systèmes Bevy exécutés chaque frame sans condition.
16. Mauvaise gestion resize canvas/WebGPU.
17. Absence de stratégie device lost.
18. État dupliqué entre DB, ECS, mémoire et GPU sans source de vérité.
19. Gestion asynchrone non fiable.
20. Absence d’instrumentation performance.

---

# Résultat attendu

À la fin, le fichier ./todo/WEBGPU_to_repair.md doit contenir un audit suffisamment précis pour permettre de réparer le système sans devoir refaire une seconde analyse.

Le rapport doit permettre de répondre clairement à ces questions :

- Pourquoi l’affichage est lent ?
- Pourquoi WebGPU/Canvas/Bevy est instable ?
- Pourquoi les atomes coûtent trop cher à créer/lire/interpréter/rasteriser ?
- Pourquoi les mises à jour et refresh sont trop lourds ?
- Où sont les goulots d’étranglement ?
- Quelle stratégie d’affichage faut-il adopter ?
- Quelle stratégie de stockage faut-il adopter ?
- Quelles corrections faire en premier ?
