# eVe / Atome — Protocole Maître de Debug de la Molécule

## Objectif Global

Stabiliser définitivement le système de création et de gestion des molécules dans eVe.

Une molécule représente une session média complète :

* timeline ;
* transport ;
* clips ;
* moteur audio ;
* renderer WebGPU ;
* historique ;
* lecture ;
* état runtime.

Le but n’est PAS de corriger rapidement des symptômes.
Le but est :

* identifier la cause racine ;
* supprimer les routes concurrentes ;
* éliminer les états incohérents ;
* garantir une création transactionnelle fiable ;
* empêcher les sessions fantômes ;
* rendre les bugs reproductibles ;
* rendre le système observable.

---

# Règles Absolues

## Interdictions

* Pas de fallback runtime.
* Pas de correction cosmétique.
* Pas de patch temporaire.
* Pas de nouvelle architecture improvisée.
* Pas de duplication de logique.
* Pas de nouvelle source de vérité.
* Pas de refactorisation globale.
* Pas de "quick fix".
* Pas de suppression silencieuse d’erreur.
* Pas de try/catch qui masque un problème.
* Pas d’analyse du framework complet hors périmètre.

---

## Principes Obligatoires

### Une intention utilisateur = une seule molécule

Règle fondamentale :

```txt
1 intention utilisateur
→ 1 molecule_creation_id
→ 1 MoleculeSession complète
```

ou :

```txt
échec
→ rollback complet
→ aucune session résiduelle
```

---

### Toute création doit être observable

Aucune création implicite.
Aucune création silencieuse.
Aucun état caché.

Chaque étape doit être tracée.

---

### Toute création doit être transactionnelle

La molécule ne doit jamais exister partiellement.

Soit :

* complète ;
* prête ;
* cohérente.

Soit :

* rollback ;
* destruction ;
* nettoyage mémoire.

Jamais entre les deux.

---

# Pipeline Théorique de Création

## États obligatoires

```txt
requested
→ validating_source
→ creating_session
→ creating_timeline
→ attaching_media
→ initializing_audio
→ initializing_renderer
→ binding_transport
→ ready
```

En cas d’erreur :

```txt
failed
→ rollback
→ disposed
```

---

# Sources Possibles de Création

Toutes les routes suivantes doivent converger vers UNE seule factory centrale.

## Sources utilisateur

* import audio ;
* import vidéo ;
* enregistrement audio ;
* enregistrement vidéo ;
* saisie texte ;
* ouverture MTraX ;
* ouverture via atome ;
* restauration de projet ;
* duplication ;
* drag & drop ;
* ouverture historique.

---

# Factory Centrale Obligatoire

## Architecture cible

Toutes les créations doivent passer par :

```js
createMoleculeSession(request)
```

Interdiction de :

* créer une MoleculeSession ailleurs ;
* instancier une timeline directement ;
* initialiser le renderer hors pipeline ;
* initialiser l’audio hors pipeline ;
* bypasser le transport.

---

# Phase 1 — Cartographie

## Prompt Audit Principal

```md
Analyse uniquement le pipeline de création d’une molécule dans eVe.

Contexte :
Une molécule est une session média complète, pas un simple panneau UI.
Elle contient timeline, transport, clips, audio natif, renderer WebGPU et historique.

Elle peut être créée depuis :
- import média ;
- enregistrement audio ;
- enregistrement vidéo ;
- saisie texte ;
- ouverture via MTraX ;
- atome_mtrack_open_request.

Fichiers connus :
- molecule.js
- molecule.api.js
- eVeIntuition.js
- panel_lifecycle_runtime.js
- molecule_architecture_and_rebuild_plan.md
- ARCHITECTURE_MAP.md
- API_MAP.md

Objectif :
cartographier précisément le pipeline de création d’une molécule.

Ne modifie aucun code.

Produit :
1. liste des points d’entrée ;
2. ordre réel des appels ;
3. objets créés ;
4. états modifiés ;
5. sources de vérité ;
6. routes concurrentes ;
7. appels async ;
8. dépendances UI/runtime/audio/WebGPU ;
9. endroits où une création partielle peut rester en mémoire ;
10. endroits où plusieurs molécules peuvent être créées pour une seule intention utilisateur.

Interdictions :
- ne pas corriger ;
- ne pas refactoriser ;
- ne pas ajouter de fallback ;
- ne pas inventer une nouvelle architecture.

Résultat attendu :
un graphe d’exécution clair du pipeline de création de molécule.
```

---

# Phase 2 — Instrumentation

## Objectif

Rendre les bugs observables.

Pas les corriger.

---

## Prompt Instrumentation

```md
À partir du graphe d’exécution précédent, ajoute une instrumentation temporaire minimale pour rendre observable la création d’une molécule.

Objectif :
identifier pourquoi la création devient instable.

Règles :
- ne corrige rien ;
- ajoute uniquement des logs/probes TEMP_DEBUG ;
- chaque création de molécule doit recevoir un molecule_creation_id ;
- tracer les transitions d’état ;
- tracer les appels async ;
- tracer les créations/destructions de session ;
- tracer timeline/audio/renderer/transport séparément ;
- tracer les erreurs silencieuses ;
- tracer les doubles créations ;
- tracer les créations incomplètes.

Format obligatoire :

TEMP_DEBUG_MOLECULE {
  creation_id,
  source,
  step,
  file,
  function,
  molecule_id,
  timeline_id,
  renderer_state,
  audio_state,
  transport_state,
  timestamp,
  status,
  error
}

Logger uniquement aux bifurcations critiques.
```

---

# Phase 3 — Reproduction

## Objectif

Transformer un bug erratique en bug reproductible.

---

## Scénarios Obligatoires

### Création

* import audio ;
* import vidéo ;
* record audio ;
* record vidéo ;
* saisie texte ;
* ouverture MTraX.

### Stress

* double ouverture rapide ;
* fermeture/réouverture ;
* ouverture multiple ;
* import simultané ;
* destruction pendant init ;
* audio non disponible ;
* WebGPU non disponible ;
* timeline invalide.

---

## Vérifications Obligatoires

Pour chaque test :

```txt
1 seule MoleculeSession
1 seule timeline
1 transport cohérent
1 renderer cohérent
aucune session fantôme
aucune création partielle
aucun listener dupliqué
aucune route concurrente
aucune fuite mémoire évidente
```

---

# Phase 4 — Isolation de la Cause Racine

## Ennemis Probables

* double création ;
* ancien MTrack encore actif ;
* état UI ≠ état runtime ;
* async non await ;
* race condition ;
* renderer créé trop tôt ;
* audio prêt après timeline ;
* dispose manquant ;
* session non rollbackée ;
* listeners multiples ;
* event déclenché deux fois ;
* création recursive ;
* état partagé global ;
* cache incohérent ;
* session restaurée + recréée ;
* timeline mutable depuis plusieurs endroits.

---

# Phase 5 — Correction

## Règle Absolue

Correction minimale.

Pas de réécriture globale.

---

## Prompt Correction

```md
À partir des logs TEMP_DEBUG et des tests, identifie la cause racine du problème de création de molécule.

Corrige uniquement la cause racine prouvée.

Contraintes :
- aucune refonte globale ;
- aucun fallback runtime ;
- aucune source de vérité supplémentaire ;
- aucune route alternative ajoutée ;
- aucune correction cosmétique ;
- supprimer tous les logs TEMP_DEBUG après validation ;
- conserver ou ajouter les tests de non-régression.

Priorité absolue :
garantir qu’une intention utilisateur crée exactement une seule molécule complète ou échoue proprement sans laisser d’état partiel.

Pour chaque modification :
- fichier ;
- fonction ;
- cause corrigée ;
- comportement avant ;
- comportement après ;
- test associé.
```

---

# Signaux d’Alerte Critiques

## Extrêmement suspects

* création de MoleculeSession dans plusieurs fichiers ;
* timeline créée hors factory ;
* renderer initialisé depuis UI ;
* état global mutable ;
* singleton implicite ;
* listeners non nettoyés ;
* transport attaché plusieurs fois ;
* callbacks async sans await ;
* accès direct à window.Molecule depuis plusieurs couches ;
* état UI qui pilote directement le runtime.

---

# Objectif Final

Obtenir un système où :

```txt
Une molécule =
une transaction runtime cohérente,
atomique,
observable,
isolée,
reproductible,
rollbackable,
sans état fantôme.
```

Et où :

```txt
Toutes les routes utilisateur convergent vers une seule vérité.
```

---

# Priorités Réelles

## Priorité 1

Stabilité de création de molécule.

## Priorité 2

Suppression des routes concurrentes.

## Priorité 3

Rollback fiable.

## Priorité 4

Nettoyage mémoire et dispose.

## Priorité 5

Performance.

Les optimisations de performance ne doivent commencer qu’après stabilisation complète du pipeline.
