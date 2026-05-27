# eVe / Atome — Protocole Maître de Debug Import & Enregistrement Média vers Atome

## Objectif Global

Stabiliser le pipeline d’import et d’enregistrement média en vue de la création fiable d’un atome dans eVe / Atome.

Ce protocole couvre :

* import audio ;
* import vidéo ;
* import image ;
* import texte si applicable ;
* enregistrement audio ;
* enregistrement vidéo ;
* capture micro ;
* capture caméra ;
* capture écran si applicable ;
* création d’un atome à partir d’un média ;
* attachement éventuel à une molécule ;
* création ou ouverture de timeline ;
* persistance du média ;
* rollback en cas d’échec.

Le but n’est PAS de patcher une importation isolée.
Le but est de rendre le pipeline média → atome fiable, observable, transactionnel et reproductible.

---

# Principe Fondamental

## Une intention média = un atome cohérent

Règle absolue :

```txt
1 intention utilisateur média
→ 1 media_operation_id
→ 1 média validé
→ 1 atome créé ou mis à jour
```

ou :

```txt
échec
→ rollback complet
→ aucun fichier orphelin
→ aucun atome fantôme
→ aucune molécule fantôme
```

---

# Définition du Pipeline

## Pipeline normal attendu

```txt
requested
→ validating_source
→ acquiring_media
→ normalizing_media
→ extracting_metadata
→ preparing_asset
→ creating_atome
→ binding_media_to_atome
→ optional_molecule_binding
→ persisting
→ ready
```

## Pipeline d’erreur attendu

```txt
failed
→ rollback_media
→ rollback_atome
→ rollback_molecule_link
→ cleanup_temp_files
→ disposed
```

---

# Règles Absolues

## Interdictions

* Pas de fallback runtime.
* Pas de création d’atome avant validation minimale du média.
* Pas de média persistant sans atome propriétaire clair.
* Pas d’atome créé sans asset média cohérent.
* Pas de fichier temporaire laissé sans owner.
* Pas de création de molécule implicite non tracée.
* Pas de correction cosmétique.
* Pas de try/catch silencieux.
* Pas de refactorisation globale.
* Pas de duplication de logique import/record.
* Pas de route alternative non documentée.
* Pas de source de vérité média multiple.

## Obligations

* Toute opération média doit avoir un `media_operation_id`.
* Tout média doit avoir un owner clair.
* Tout atome créé depuis un média doit référencer son origine.
* Toute erreur doit produire un rollback explicite.
* Toute création partielle doit être nettoyée.
* Toute route d’import et d’enregistrement doit converger vers un pipeline central.

---

# Factory Centrale Obligatoire

Toutes les routes média doivent converger vers :

```js
createAtomeFromMedia(request)
```

Cette fonction doit devenir la porte d’entrée logique unique pour :

* import audio ;
* import vidéo ;
* import image ;
* record audio ;
* record vidéo ;
* capture micro ;
* capture caméra ;
* capture écran ;
* drag & drop média ;
* paste média ;
* restauration média.

Interdiction de :

* créer un atome directement depuis un callback média ;
* créer une molécule directement depuis un import ;
* persister un média sans passer par le pipeline ;
* attacher un média à un atome hors pipeline ;
* laisser l’UI piloter directement la création runtime.

---

# Sources Possibles d’Entrée

## Import

* file picker ;
* drag & drop ;
* paste ;
* import depuis projet ;
* import depuis bibliothèque ;
* import depuis URL ;
* import depuis stockage local ;
* import depuis stockage distant.

## Enregistrement

* micro ;
* caméra ;
* écran ;
* audio système si applicable ;
* stop recording ;
* pause/resume recording ;
* autosave recording ;
* recovery après crash.

## Runtime

* API Atome ;
* API Molecule ;
* MTraX ;
* panel lifecycle ;
* project loading ;
* history restore ;
* offline/online sync.

---

# Phase 1 — Cartographie

## Prompt Audit Principal

```md
Analyse uniquement le pipeline d’import et d’enregistrement média en vue de créer un atome dans eVe / Atome.

Contexte :
Un média importé ou enregistré doit créer un atome cohérent, avec un owner clair, un état runtime fiable, une persistance contrôlée et éventuellement une relation avec une molécule/timeline.

Le pipeline concerne :
- import audio ;
- import vidéo ;
- import image ;
- enregistrement audio ;
- enregistrement vidéo ;
- capture micro ;
- capture caméra ;
- drag & drop ;
- paste ;
- restauration média ;
- création d’atome ;
- attachement média ;
- lien éventuel avec molécule.

Objectif :
cartographier précisément toutes les routes qui transforment un média en atome.

Ne modifie aucun code.

Produit :
1. liste des points d’entrée média ;
2. ordre réel des appels ;
3. fichiers impliqués ;
4. fonctions impliquées ;
5. callbacks async ;
6. objets média créés ;
7. atomes créés ;
8. liens éventuels vers molécules ;
9. fichiers temporaires ;
10. persistance ;
11. rollback existant ou absent ;
12. sources de vérité média ;
13. sources de vérité atome ;
14. routes concurrentes ;
15. zones où un média peut exister sans atome ;
16. zones où un atome peut exister sans média valide ;
17. zones où plusieurs atomes peuvent être créés pour un seul média ;
18. zones où plusieurs médias peuvent être attachés au même atome sans contrôle.

Interdictions :
- ne pas corriger ;
- ne pas refactoriser ;
- ne pas ajouter de fallback ;
- ne pas ajouter de logs à cette étape ;
- ne pas inventer une nouvelle architecture.

Résultat attendu :
un graphe d’exécution clair du pipeline média → atome.
```

---

# Phase 2 — Instrumentation

## Objectif

Rendre observable la transformation média → atome.

---

## Prompt Instrumentation

```md
À partir du graphe précédent, ajoute une instrumentation temporaire minimale pour observer le pipeline média → atome.

Objectif :
identifier les doubles créations, fichiers orphelins, atomes fantômes, médias invalides, callbacks tardifs, erreurs silencieuses et divergences runtime/persistence.

Règles :
- ne corrige rien ;
- ajoute uniquement des logs TEMP_DEBUG_MEDIA_ATOME ;
- chaque opération doit recevoir un media_operation_id ;
- chaque média doit avoir un media_asset_id ;
- chaque atome créé doit avoir un atome_runtime_id ;
- tracer les transitions d’état ;
- tracer les callbacks async ;
- tracer la création/destruction des fichiers temporaires ;
- tracer la validation du média ;
- tracer l’extraction des métadonnées ;
- tracer la création d’atome ;
- tracer l’attachement média → atome ;
- tracer le lien optionnel atome → molécule ;
- tracer la persistance ;
- tracer les rollbacks ;
- tracer les erreurs silencieuses.

Format obligatoire :

TEMP_DEBUG_MEDIA_ATOME {
  media_operation_id,
  source,
  step,
  file,
  function,
  media_type,
  media_asset_id,
  temp_file_id,
  atome_id,
  atome_runtime_id,
  molecule_id,
  timeline_id,
  metadata_state,
  persistence_state,
  rollback_state,
  timestamp,
  status,
  error
}

Logger uniquement aux points critiques.
```

---

# Phase 3 — Reproduction

## Objectif

Transformer les bugs erratiques d’import/enregistrement en scénarios reproductibles.

---

## Scénarios Import Obligatoires

* import audio valide ;
* import vidéo valide ;
* import image valide ;
* import média corrompu ;
* import média très lourd ;
* import média sans métadonnées ;
* import média avec codec non supporté ;
* drag & drop ;
* paste ;
* double import rapide ;
* annulation pendant import ;
* import puis fermeture immédiate du panel ;
* import puis ouverture MTraX ;
* import offline ;
* import après restauration projet.

---

## Scénarios Recording Obligatoires

* start record audio ;
* stop record audio ;
* cancel record audio ;
* start record video ;
* stop record video ;
* cancel record video ;
* pause/resume recording ;
* micro indisponible ;
* caméra indisponible ;
* permission refusée ;
* permission accordée tardivement ;
* arrêt brutal pendant recording ;
* fermeture panel pendant recording ;
* création atome après stop ;
* création atome après autosave ;
* recovery après crash.

---

# Vérifications Obligatoires

Pour chaque scénario :

```txt
1 media_operation_id
1 media_asset_id valide
1 atome créé ou 0 si échec
0 atome fantôme
0 média orphelin
0 fichier temporaire résiduel non justifié
0 molécule fantôme
0 callback actif après cancel/dispose
0 double création
rollback complet en cas d’erreur
persistance cohérente
UI cohérente avec runtime
runtime cohérent avec stockage
```

---

# Vérifications Visuelles et Persistance Runtime

## Vérifications Visuelles Obligatoires

Après import ou enregistrement, vérifier explicitement que l’atome créé possède bien une représentation visuelle correcte.

### Audio

```txt
waveform générée
waveform cohérente avec le média
waveform persistée
waveform restaurée après refresh
waveform restaurée après reboot
waveform restaurée après reload projet
aucune waveform fantôme
aucune waveform vide
```

### Vidéo

```txt
thumbnail/image vidéo générée
thumbnail cohérente avec le média
thumbnail persistée
thumbnail restaurée après refresh
thumbnail restaurée après reboot
thumbnail restaurée après reload projet
aucune image fantôme
aucune image vide
```

### Images

```txt
aperçu image correct
aperçu persisté
aperçu restauré après refresh
aperçu restauré après reboot
```

---

## Vérifications de Résistance Runtime

Tester explicitement :

```txt
refresh UI
reload runtime
reload projet
reboot application
reconnexion session
restauration historique
offline → online
```

Les visuels générés doivent rester cohérents et reconnectés à leur atome propriétaire.

---

## Vérifications Fixtures Média

Tous les tests doivent utiliser les médias présents dans :

```txt
./tests/fixtures/media
```

Tester explicitement :

```txt
plusieurs formats audio
plusieurs formats vidéo
fichiers lourds
fichiers courts
fichiers longs
fichiers corrompus
fichiers sans metadata
fichiers avec codecs différents
fichiers avec dimensions inhabituelles
fichiers avec framerate inhabituel
```

Aucun test ne doit être limité à un seul média de démonstration.

---

# Phase 4 — Isolation de la Cause Racine

## Ennemis Probables

* création d’atome avant validation média ;
* double callback `onload` / `onready` ;
* stop recording déclenché plusieurs fois ;
* UI qui crée l’atome et runtime qui le recrée ;
* média persisté avant owner ;
* atome créé puis média invalide ;
* média valide mais atome non créé ;
* fichier temporaire non supprimé ;
* permission média résolue après abandon ;
* callback qui arrive après dispose ;
* import et ouverture MTraX qui créent deux routes ;
* ancien système MTrack encore actif ;
* historique qui restaure un atome déjà créé ;
* offline/online sync qui duplique un asset ;
* metadata async non attendue ;
* transcoding async non attendu ;
* stockage local et runtime divergents.

---

# Phase 5 — Correction

## Règle Absolue

Correction minimale et prouvée.

Pas de réécriture globale.

---

## Prompt Correction

```md
À partir des logs TEMP_DEBUG_MEDIA_ATOME et des tests, identifie la cause racine des problèmes d’import/enregistrement média vers atome.

Corrige uniquement la cause racine prouvée.

Contraintes :
- aucune refonte globale ;
- aucun fallback runtime ;
- aucune nouvelle source de vérité ;
- aucune route alternative ;
- aucune correction cosmétique ;
- aucun masquage d’erreur ;
- supprimer tous les logs TEMP_DEBUG après validation ;
- conserver ou ajouter les tests de non-régression.

Priorité absolue :
garantir qu’une intention média crée exactement un atome cohérent, ou échoue proprement sans laisser d’atome fantôme, média orphelin, fichier temporaire ou molécule fantôme.

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

* création d’atome dans un callback média ;
* création d’atome dans l’UI ;
* création d’atome dans plusieurs fichiers pour le même média ;
* média sauvegardé sans owner ;
* fichier temporaire jamais nettoyé ;
* recording stop appelé plusieurs fois ;
* callback média actif après cancel ;
* permission async qui relance une création ;
* atome créé avant extraction metadata ;
* molécule créée implicitement depuis import ;
* timeline créée avant validation média ;
* persistance déclenchée avant ready ;
* UI et runtime qui possèdent chacun une copie de l’état média.

---

# Focus Spécial : Import → Atome → Molécule

Vérifier explicitement :

```txt
media import
→ media validation
→ metadata extraction
→ asset preparation
→ create atome
→ bind media to atome
→ optional create/open molecule
→ optional attach to timeline
→ persist
→ ready
```

Ce pipeline doit être séquentiel, observable et rollbackable.

Une molécule ne doit pas être créée automatiquement sans intention claire ou sans trace dans le pipeline.

---

# Focus Spécial : Recording → Atome

Vérifier explicitement :

```txt
record request
```
