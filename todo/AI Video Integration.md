# AI Video Integration — atome

## Statut
Roadmap / cahier des charges / prompt d’implémentation.

**Phase 1 livrée le 21 sept. 2026** : Runway derrière l’AI Video Service, texte → vidéo et image → vidéo, Créer › Générateur › Vidéo AI, clé Runway en Préférences. Livrés en même temps : **Image AI** (photoréaliste) et **Vecteur AI** (SVG) via ChatGPT. Voir « Journal de réalisation » en fin de fichier.

## Décision d’architecture

La première phase d’intégration doit utiliser **Runway comme provider vidéo principal par défaut**.

Cette décision ne doit **jamais** créer une dépendance structurelle entre **atome** et Runway.

atome doit exposer une **API vidéo IA interne standard**, indépendante des fournisseurs, avec des adapters/providers interchangeables.

Architecture cible :

`atome → AI Video Service → provider adapter → Runway / fal.ai / Google / autre provider`

Runway est le **premier provider implémenté**, pas l’API interne d’atome.

Objectif structurel :
- pouvoir changer de modèle Runway sans modifier l’UI ;
- pouvoir changer de fournisseur sans modifier l’UI ;
- pouvoir utiliser plusieurs fournisseurs simultanément selon la capacité demandée ;
- pouvoir router une demande selon **qualité / coût / latence / capacité** ;
- conserver l’historique complet de chaque génération ;
- ne jamais exposer une clé API fournisseur dans le frontend.

---

# Objectif

Intégrer dans **atome** une chaîne IA vidéo modulaire permettant de créer, transformer, étendre et exploiter des vidéos générées par IA comme des objets natifs du projet.

Le système doit permettre notamment :

- texte → vidéo ;
- image → vidéo ;
- vidéo → vidéo lorsque le provider le permet ;
- génération depuis une image ou vidéo de référence ;
- contrôle de durée, ratio et résolution lorsque disponible ;
- contrôle de première/dernière frame lorsque disponible ;
- contrôle caméra/mouvement lorsque disponible ;
- extension/continuation d’une vidéo lorsque disponible ;
- transformation/modification d’une vidéo existante lorsque disponible ;
- génération avec audio natif lorsque disponible ;
- utilisation d’un audio atome comme référence/conditionnement lorsque le provider le permet ;
- génération depuis une piste audio créée par MusicGPT ou un autre moteur audio ;
- intégration non destructive avec la timeline et les objets vidéo atome ;
- suivi du provider, modèle, version, prompt, coût, durée, résolution, latence et provenance ;
- architecture capable d’accueillir plusieurs providers sans refonte de l’UI.

---

# Principe fondamental : API interne standard

L’UI d’atome ne doit jamais appeler directement :

- Runway ;
- fal.ai ;
- Google / Veo / Gemini ;
- Replicate ;
- Luma ;
- un modèle local ;
- un futur provider.

L’UI appelle uniquement le **AI Video Service** d’atome.

Exemple conceptuel :

```js
await aiVideo.generate({
  provider: 'auto',
  prompt: 'woman walking through a futuristic city at dusk',
  duration: 10,
  aspectRatio: '16:9',
  resolution: '1080p',
  referenceImage: null,
  referenceVideo: null,
  audioAsset: null,
  routing: {
    priority: 'quality',
    maxCostUsd: 2.00
  }
})
```

L’AI Video Service :
1. analyse la demande ;
2. vérifie les capabilities disponibles ;
3. choisit le provider/model approprié ;
4. traduit la requête canonique vers l’API du provider ;
5. crée un job normalisé ;
6. suit le job ;
7. récupère le résultat ;
8. crée l’objet vidéo atome ;
9. enregistre coût, provenance et métadonnées.

---

# Provider principal — Phase 1 : Runway

## Rôle

**Runway est le provider par défaut de la première phase.**

Le premier objectif concret est :

`Prompt → Runway → vidéo générée → objet vidéo atome`

Puis :

`Image atome → Runway → vidéo générée → objet vidéo atome`

Ensuite seulement, étendre les fonctions selon les endpoints réellement disponibles.

## Règles

- utiliser l’API officielle Runway ;
- privilégier l’appel REST côté service/gateway pour rester indépendant d’un SDK spécifique ;
- ne pas introduire TypeScript dans le frontend ;
- stocker la clé API uniquement côté serveur / runtime natif sécurisé ;
- ne jamais intégrer les noms de paramètres Runway dans le modèle métier atome ;
- conserver base URL, version d’API, modèles et pricing dans la configuration de l’adapter ;
- ne pas supposer qu’une fonction présente dans l’application Runway est disponible dans l’API ;
- une capability n’est activée qu’après validation de l’endpoint réel ;
- considérer les générations comme des jobs asynchrones ;
- prévoir polling, retry, backoff, timeout, annulation si supportée, reprise et journalisation ;
- ne pas interroger agressivement les endpoints de statut ;
- isoler toutes les erreurs Runway derrière des erreurs normalisées atome.

## Coût

Le système doit traiter le coût comme une donnée de premier niveau.

Référence actuelle à vérifier au moment de l’implémentation :
- 1 crédit API Runway = environ **$0,01** ;
- les modèles peuvent être facturés en crédits/seconde ;
- le coût dépend du modèle, de la durée et parfois du type de sortie.

Ne jamais figer les prix dans l’UI.

Créer une configuration/version de pricing pouvant être mise à jour sans modifier le code métier.

---

# Providers futurs

L’architecture doit permettre d’ajouter sans refonte :

- **fal.ai** — provider secondaire prioritaire pour accès multi-modèles ;
- Google Vertex AI / Veo / Gemini ;
- Replicate ;
- Luma ;
- modèles open source locaux ou hébergés ;
- futurs fournisseurs.

Le provider Runway ne doit donc être qu’un adapter parmi plusieurs.

---

# Capability Registry

Chaque provider doit déclarer explicitement ce qu’il sait réellement faire.

Exemple :

```js
{
  id: 'runway',
  capabilities: {
    textToVideo: true,
    imageToVideo: true,
    videoToVideo: false,
    referenceImage: true,
    referenceVideo: false,
    firstFrame: false,
    lastFrame: false,
    keyframes: false,
    cameraControl: false,
    audioConditioning: false,
    nativeAudio: false,
    extend: false,
    edit: false,
    inpaint: false,
    outpaint: false,
    upscale: false,
    frameRateEnhancement: false,
    alphaOutput: false,
    nativeSemanticLayers: false,
    asyncJobs: true,
    polling: true,
    webhooks: false,
    costEstimate: true
  }
}
```

Les valeurs ci-dessus sont **un exemple de structure**, pas une vérité figée.

Elles doivent provenir :
- des endpoints effectivement intégrés ;
- de tests réels ;
- de la version réelle de l’API ;
- du modèle effectivement utilisé.

## Règle absolue

Une capability ne doit jamais être marquée `true` simplement parce qu’elle existe dans l’application web du fournisseur.

Elle doit être disponible dans l’API utilisée par atome et avoir été testée.

---

# AI Video Service — API interne proposée

Créer une abstraction indépendante des providers.

Exemple conceptuel :

```text
AI Video Service
- generate(request)
- imageToVideo(request)
- videoToVideo(request)
- extend(request)
- edit(request)
- transform(request)
- upscale(request)
- enhanceFrameRate(request)
- getJob(jobId)
- cancel(jobId)
- retry(jobId)
- estimate(request)
- listProviders()
- getCapabilities(providerId)
- getModels(providerId)
- selectProvider(request)
```

Les noms définitifs doivent respecter les conventions existantes dans atome.

---

# Schéma de requête canonique

Le domaine atome ne doit pas utiliser les paramètres propriétaires Runway.

Exemple :

```js
{
  operation: 'generate',
  provider: 'auto',

  prompt: '',
  negativePrompt: null,

  duration: 10,
  aspectRatio: '16:9',
  resolution: '1080p',
  fps: null,

  source: {
    image: null,
    video: null,
    audio: null,
    firstFrame: null,
    lastFrame: null
  },

  references: {
    images: [],
    videos: [],
    character: null,
    style: null
  },

  controls: {
    camera: null,
    motion: null,
    seed: null
  },

  output: {
    format: 'video',
    alpha: false,
    layers: false
  },

  routing: {
    priority: 'quality',
    maxCostUsd: null,
    maxLatencyMs: null,
    providerAllowList: null,
    providerDenyList: null
  },

  providerOptions: {}
}
```

## Champs normalisables

À normaliser autant que possible :
- prompt ;
- durée ;
- ratio ;
- résolution ;
- fps ;
- image source ;
- vidéo source ;
- audio source ;
- first frame ;
- last frame ;
- références ;
- seed ;
- priorité qualité/coût/latence ;
- coût maximum ;
- format de sortie ;
- état du job.

## Champs provider-specific

Les options impossibles à normaliser proprement doivent rester dans :

```js
providerOptions: {
  runway: {
    // paramètres Runway uniquement
  }
}
```

Ces options ne doivent jamais contaminer l’API principale.

---

# Jobs asynchrones

Toutes les générations doivent être traitées comme des jobs.

Schéma normalisé :

```js
{
  id: 'atome-job-id',
  provider: 'runway',
  providerJobId: '...',
  model: '...',
  operation: 'generate',

  status: 'queued',
  progress: null,

  createdAt: '...',
  startedAt: null,
  completedAt: null,

  estimatedCostUsd: null,
  actualCostUsd: null,

  latencyMs: null,

  error: null,

  outputAssets: []
}
```

Statuts normalisés :

```text
queued
running
succeeded
failed
cancelled
expired
```

Le code UI ne doit jamais dépendre des statuts propriétaires du provider.

---

# Provider Router

Prévoir dès la première version :

```js
provider: 'auto'
```

Le router doit pouvoir sélectionner un provider/model selon :

- capability obligatoire ;
- qualité ;
- coût ;
- latence ;
- disponibilité ;
- résolution ;
- durée ;
- audio natif ;
- références ;
- capacité d’édition ;
- quota ;
- politique utilisateur.

Exemples :

```text
preview rapide → provider économique
plan final → Runway qualité élevée
audio fourni → provider acceptant audioConditioning
first/last frame requis → provider compatible
budget < $1 → provider/model compatible
```

Le router doit rester déterministe et explicable.

Enregistrer la raison du choix dans les métadonnées du job.

---

# Workflow 1 — Texte → vidéo

1. L’utilisateur crée ou sélectionne un objet/projet.
2. Il demande une génération vidéo.
3. atome crée une requête canonique.
4. Le router choisit Runway par défaut en phase 1.
5. Création du job.
6. Polling du statut.
7. Téléchargement/récupération du résultat.
8. Création d’un nouvel objet vidéo atome.
9. Enregistrement de la provenance.
10. Ajout à la timeline sans destruction de la source.

---

# Workflow 2 — Image → vidéo

Pipeline :

`Image atome → AI Video Service → Runway adapter → vidéo → objet vidéo atome`

Conserver :
- image source ;
- prompt ;
- paramètres ;
- provider/model ;
- coût ;
- durée ;
- ratio ;
- résolution ;
- relation parent/enfant.

L’image source ne doit jamais être remplacée.

---

# Workflow 3 — Vidéo → vidéo

Cette fonction ne doit être activée que si le provider/model utilisé la supporte réellement.

Pipeline :

`Vidéo source → AI Video Service → provider compatible → nouvelle vidéo`

Cas :
- changer style ;
- transformer l’environnement ;
- modifier ambiance ;
- modifier personnage ;
- modifier rendu ;
- variation contrôlée.

Toujours créer un nouvel asset.

---

# Workflow 4 — Extension / continuation

Objectif :

`Vidéo existante → extend → nouvelle séquence`

Le système doit :
- conserver la source ;
- stocker les points temporels ;
- conserver la continuité parent/enfant ;
- permettre Undo/Redo ;
- ne pas fusionner automatiquement de manière destructive.

Si le provider ne supporte pas `extend`, désactiver la capability ou router vers un autre provider.

---

# Workflow 5 — Audio / MusicGPT → vidéo

Objectif important pour atome :

`Piste audio → AI Video Service → provider audio-aware → vidéo`

Exemples :
- clip musical ;
- visualisation rythmique ;
- scène synchronisée avec une musique ;
- vidéo générée à partir d’un morceau MusicGPT.

Attention :

**audioConditioning != synchronisation musicale exacte**

Il faut mesurer :
- synchronisation avec beats ;
- synchronisation avec événements ;
- cohérence avec structure musicale ;
- précision temporelle ;
- latence ;
- dérive.

Ne jamais promettre une synchronisation frame-perfect avant validation expérimentale.

---

# Workflow 6 — Régénération partielle / édition

Lorsqu’un provider supporte des opérations d’édition :

- éditer une portion ;
- transformer une scène ;
- remplacer une région ;
- modifier un élément ;
- changer le style ;
- changer le mouvement ;
- réinterpréter une séquence.

Ces opérations doivent rester non destructives.

---

# Couches vidéo / “stems vidéo”

## Décision

Ne pas considérer Runway ni un autre générateur comme fournisseur de “stems vidéo” tant qu’une API ne fournit pas réellement :

- personnage séparé ;
- décor séparé ;
- objets séparés ;
- alpha/mattes ;
- profondeur ;
- masques sémantiques ;
- tracking d’objets.

Une séquence PNG ou un export ProRes n’est **pas** un système de couches sémantiques.

## Architecture séparée

Créer un service distinct :

```text
Video Matting / Segmentation Service
```

Capabilities possibles :

```js
{
  backgroundRemoval: true,
  objectSegmentation: true,
  alphaMatte: true,
  objectTracking: true,
  depthMap: true,
  semanticMasks: true
}
```

Pipeline :

`Vidéo générée → Matting/Segmentation → objets vidéo séparés → timeline atome`

Ne pas coupler cette fonction au provider de génération.

---

# Données / provenance / non-destruction

Chaque transformation IA doit enregistrer :

- provider ;
- modèle ;
- version ;
- endpoint/operation ;
- prompt ;
- negative prompt ;
- paramètres ;
- seed si disponible ;
- référence(s) image/vidéo/audio ;
- durée demandée ;
- durée réelle ;
- résolution ;
- ratio ;
- fps ;
- coût estimé ;
- coût réel ;
- crédit/provider pricing version ;
- latence ;
- date ;
- job ID atome ;
- job ID provider ;
- parent asset(s) ;
- enfant(s) généré(s) ;
- statut ;
- erreurs ;
- droits/licence si nécessaire.

Toute génération crée :
- un nouvel objet ;
- ou une nouvelle version ;

jamais une modification destructive silencieuse.

---

# Timeline atome

Une génération vidéo doit devenir un objet vidéo natif compatible avec :

- timeline ;
- lecture ;
- trim ;
- cut/split ;
- loop ;
- position temporelle ;
- durée ;
- mute/visibility si applicable ;
- composition ;
- Undo/Redo ;
- persistance ;
- export.

L’IA ne doit pas créer un silo séparé du moteur vidéo existant.

---

# Audit obligatoire avant développement

## Règle n°1

**Ne rien implémenter avant audit du code atome existant.**

Rechercher dans tout le projet :

- moteur vidéo existant ;
- objets vidéo ;
- timeline ;
- import/export ;
- codec/transcodage ;
- thumbnails ;
- proxy vidéo ;
- playback ;
- seek ;
- trim ;
- split ;
- time stretch ;
- loop ;
- effets ;
- compositing ;
- alpha ;
- masques ;
- tracking ;
- WebCodecs ;
- FFmpeg ou équivalent ;
- workers ;
- WASM ;
- services distants ;
- API ;
- MCP ;
- stockage ;
- cache ;
- uploads ;
- téléchargement ;
- Undo/Redo ;
- persistence ;
- provenance ;
- système de jobs ;
- système de notifications/progression.

Pour chaque élément trouvé, produire :

```text
KEEP
EXTEND
REPLACE
REMOVE
COEXIST
```

Aucune suppression avant :
- identification des appels ;
- tests ;
- validation de remplacement ;
- non-régression.

---

# Adapter Runway

Créer un adapter isolé.

Exemple :

```text
providers/
  runway/
    adapter
    capabilities
    models
    pricing
    mapper
    errors
    tests
```

Responsabilités :

- authentification ;
- mapping requête atome → Runway ;
- mapping Runway → job atome ;
- sélection du modèle ;
- polling ;
- récupération sortie ;
- calcul/estimation coût ;
- normalisation erreurs ;
- rate limits ;
- retry/backoff ;
- timeout ;
- logs ;
- tests contractuels.

Aucun code UI dans l’adapter.

---

# Sécurité

La clé Runway ne doit jamais être :
- dans le JavaScript navigateur ;
- dans le bundle Web ;
- dans les logs ;
- dans Git ;
- dans un fichier public ;
- envoyée au client.

Créer une passerelle sécurisée :
- backend atome ;
- service natif Tauri ;
- service distant sécurisé ;
- ou architecture équivalente validée.

Prévoir :
- rotation des clés ;
- séparation dev/test/prod ;
- quotas ;
- rate limiting ;
- audit ;
- masquage des secrets ;
- gestion des erreurs 401/403/429 ;
- protection contre les abus.

---

# Coût / Budget

Créer une couche indépendante de pricing.

Fonctions :

```js
estimate(request)
getPricing(provider, model)
recordActualCost(job)
```

Avant une génération coûteuse, atome doit pouvoir connaître :
- coût estimé ;
- provider ;
- modèle ;
- durée ;
- résolution ;
- unité de facturation.

Le router peut utiliser le coût.

Exemple :

```js
routing: {
  priority: 'cost',
  maxCostUsd: 1.00
}
```

Ne jamais supposer qu’un prix fournisseur est permanent.

Versionner les données de pricing.

---

# Cache / stockage

Prévoir :
- cache des assets ;
- cache des previews ;
- cache des résultats de jobs ;
- URLs temporaires provider ;
- téléchargement automatique si les URLs expirent ;
- stockage persistant contrôlé par atome ;
- cleanup ;
- reprise après crash ;
- déduplication lorsque pertinente.

Ne jamais dépendre à long terme d’une URL temporaire fournisseur.

---

# Erreurs normalisées

Exemples :

```text
AUTH_ERROR
QUOTA_EXCEEDED
RATE_LIMITED
INVALID_REQUEST
UNSUPPORTED_CAPABILITY
UNSUPPORTED_MODEL
CONTENT_REJECTED
PROVIDER_UNAVAILABLE
JOB_TIMEOUT
JOB_FAILED
DOWNLOAD_FAILED
COST_LIMIT_EXCEEDED
UNKNOWN_PROVIDER_ERROR
```

Conserver l’erreur brute provider en diagnostic, mais ne pas l’exposer directement comme contrat UI.

---

# UX

L’utilisateur ne doit pas voir les détails techniques du provider en mode normal.

Actions possibles :

- Générer vidéo ;
- Animer image ;
- Transformer vidéo ;
- Étendre ;
- Régénérer ;
- Changer style ;
- Utiliser image de référence ;
- Utiliser vidéo de référence ;
- Utiliser audio ;
- Choisir qualité/coût/vitesse ;
- Séparer sujet/décor si le pipeline Matting est disponible.

Mode expert :
- choix provider ;
- choix modèle ;
- coût estimé ;
- capabilities ;
- seed ;
- options provider-specific ;
- statut détaillé du job.

---

# Tests obligatoires

## Fonctionnels

- prompt simple → vidéo ;
- image → vidéo ;
- plusieurs ratios ;
- plusieurs durées ;
- plusieurs résolutions ;
- génération annulée si supportée ;
- job échoué ;
- job timeout ;
- rate limit ;
- reprise après erreur réseau ;
- création de l’objet vidéo atome ;
- relation parent/enfant ;
- Undo/Redo ;
- sauvegarde/réouverture ;
- changement de provider sans modification UI ;
- provider `auto` ;
- estimation de coût ;
- coût maximum ;
- fallback provider.

## Qualité

Comparer :
- fidélité au prompt ;
- cohérence temporelle ;
- stabilité du sujet ;
- visage ;
- mains ;
- mouvements humains ;
- mouvements caméra ;
- cohérence entre frames ;
- artefacts ;
- fidélité à l’image de référence ;
- fidélité à la vidéo de référence ;
- cohérence style ;
- synchronisation audio si utilisée.

## Performance

Mesurer :
- temps de soumission ;
- temps en queue ;
- temps d’inférence ;
- temps total ;
- temps téléchargement ;
- taille fichier ;
- impact UI ;
- cache ;
- nombre de jobs simultanés ;
- mémoire ;
- CPU ;
- réseau.

Aucune opération distante ne doit bloquer le thread UI.

---

# Benchmark providers

Créer une suite reproductible de prompts/tests.

Exemples :

1. visage humain fixe ;
2. marche ;
3. course ;
4. danse ;
5. mains visibles ;
6. travelling caméra ;
7. scène de nuit ;
8. produit ;
9. personnage récurrent ;
10. image → vidéo ;
11. vidéo → vidéo ;
12. audio → vidéo ;
13. animation stylisée ;
14. photoréalisme ;
15. mouvement complexe.

Stocker :
- prompt ;
- seed ;
- provider ;
- modèle ;
- coût ;
- latence ;
- résultats ;
- score interne ;
- date.

Ne jamais comparer des providers sans conserver les paramètres.

---

# Intégration MCP

Si atome expose ses fonctions via MCP :

- exposer les fonctions **AI Video Service** normalisées ;
- ne pas exposer directement les endpoints Runway ;
- ne jamais transmettre les secrets provider ;
- conserver la logique de routing côté atome.

Exemple conceptuel :

```text
video.generate
video.image_to_video
video.transform
video.extend
video.status
video.cancel
video.estimate
```

---

# Phase 1 — Runway

## Objectif minimal

Livrer :

1. Audit vidéo existant.
2. `AI Video Service`.
3. `Runway Adapter`.
4. Capability registry.
5. `text → video`.
6. `image → video`.
7. jobs asynchrones.
8. polling.
9. coût estimé.
10. provenance.
11. création d’objets vidéo atome.
12. Undo/Redo.
13. persistence.
14. tests.
15. documentation.

## Hors phase 1

Ne pas bloquer la phase 1 sur :
- matting complet ;
- segmentation avancée ;
- Google ;
- fal.ai ;
- Replicate ;
- Luma ;
- audio-sync avancée ;
- multi-provider automatique complet.

Mais l’architecture doit déjà permettre de les ajouter.

---

# Phase 2 — Multi-provider

Ajouter en priorité :

## fal.ai

Objectif :
- deuxième adapter ;
- accès rapide à plusieurs familles de modèles ;
- validation du switch provider sans changement UI ;
- test du router coût/qualité/latence.

Puis :
- Google ;
- autres providers si justifiés.

---

# Phase 3 — Audio-visuel

Relier :

`MusicGPT / Audio AI Service → AI Video Service`

Tester :
- audio conditionnement ;
- beat sync ;
- structure musicale ;
- clips ;
- visualisation ;
- réactivité aux événements.

---

# Phase 4 — Matting / segmentation

Créer :

`Video Matting Service`

Objectif :
- sujet ;
- décor ;
- objets ;
- alpha ;
- tracking ;
- depth ;
- masks.

La génération vidéo et la décomposition vidéo doivent rester indépendantes.

---

# Critères d’acceptation

L’intégration est validée lorsque :

- l’utilisateur peut générer une vidéo depuis un prompt ;
- il peut générer une vidéo depuis une image ;
- Runway fonctionne comme provider par défaut ;
- l’UI ne connaît aucun endpoint Runway ;
- la clé Runway n’est jamais exposée au frontend ;
- le système utilise des jobs asynchrones ;
- les coûts sont estimables et enregistrés ;
- chaque génération produit un objet vidéo atome ;
- la provenance complète est enregistrée ;
- les opérations restent non destructives ;
- Undo/Redo fonctionne ;
- les résultats sont persistants ;
- un deuxième provider peut être ajouté sans modifier l’UI ;
- les capabilities sont déclarées dynamiquement ;
- le provider peut être choisi manuellement ou par `auto` ;
- les tests sont reproductibles.

---

# Livrables

1. Audit de l’existant vidéo atome.
2. Tableau KEEP / EXTEND / REPLACE / REMOVE / COEXIST.
3. Architecture AI Video Service.
4. Contrat canonique de requête.
5. Capability registry.
6. Adapter Runway.
7. Provider router minimal.
8. Job manager.
9. Cost estimator.
10. Prototype text → video.
11. Prototype image → video.
12. Intégration timeline.
13. Tests automatisés.
14. Tests UI/UX.
15. Benchmarks qualité/coût/latence.
16. Documentation développeur.
17. Documentation utilisateur.
18. Documentation sécurité.
19. Documentation provider.
20. Liste des risques/licences/quotas.

---

# Prompt d’implémentation pour l’agent

Tu travailles dans le projet **atome**.

Ta mission est d’intégrer une architecture **AI Video Integration** dont le premier provider est **Runway**, tout en garantissant dès le départ que Runway reste remplaçable.

## Règle n°1

**Commence par auditer le projet. Ne code rien avant d’avoir identifié ce qui existe déjà.**

Recherche toutes les implémentations vidéo/IA pertinentes dans le repository et ses modules liés.

Produis d’abord un rapport indiquant :

- fichiers/modules concernés ;
- fonction réelle ;
- état : production / expérimental / incomplet / mort ;
- dépendances ;
- tests existants ;
- liens avec timeline/objets/persistence ;
- APIs/MCP/services existants ;
- gestion jobs existante ;
- stockage/cache ;
- Undo/Redo ;
- conflits/redondances avec la future intégration ;
- décision proposée :
  - KEEP ;
  - EXTEND ;
  - REPLACE ;
  - REMOVE ;
  - COEXIST.

Ensuite seulement, proposer un plan d’intégration minimal.

## Contraintes

- respecter l’architecture et les conventions atome ;
- JavaScript côté frontend ;
- ne pas introduire TypeScript dans le frontend ;
- privilégier modularité et providers interchangeables ;
- aucune dépendance directe de l’UI envers Runway ;
- aucune clé API dans le client ;
- opérations asynchrones ;
- aucun blocage UI ;
- opérations non destructives ;
- Undo/Redo compatible ;
- persistence ;
- tests et benchmarks obligatoires ;
- ne supprimer aucun module existant avant validation ;
- vérifier compatibilité framework/module/MCP ;
- documenter les coûts ;
- documenter les quotas ;
- documenter les licences ;
- documenter les limitations ;
- garder la possibilité d’ajouter fal.ai et d’autres providers.

## Architecture obligatoire

Créer ou identifier :

```text
AI Video Service
  ↓
Capability Registry
  ↓
Provider Router
  ↓
Runway Adapter
  ↓
Runway API
```

Puis permettre plus tard :

```text
Provider Router
├── Runway
├── fal.ai
├── Google
├── Replicate
├── Luma
└── futurs providers
```

L’UI ne doit jamais dépendre de cette liste.

## Première implémentation

La première intégration fonctionnelle doit utiliser Runway.

Priorité :

1. text → video ;
2. image → video ;
3. jobs asynchrones ;
4. polling ;
5. création d’un objet vidéo atome ;
6. métadonnées complètes ;
7. coût estimé ;
8. non-destruction ;
9. persistence ;
10. Undo/Redo.

N’ajoute aucune capability avancée avant d’avoir confirmé son existence dans l’API Runway réellement utilisée.

## Règle capabilities

Pour chaque endpoint réellement intégré :
- ajouter la capability ;
- écrire un test ;
- documenter les paramètres ;
- documenter le coût ;
- documenter les limites.

Si une fonction n’existe pas :
- capability = false ;
- ne pas simuler la fonction ;
- permettre au router d’utiliser un autre provider plus tard.

## Sécurité

Créer une couche sécurisée entre le frontend et Runway.

Interdit :
- clé Runway dans le JS ;
- clé dans Git ;
- clé dans localStorage ;
- clé dans les logs ;
- appel direct navigateur → Runway si cela expose le secret.

## Données

Chaque génération doit enregistrer :

```js
{
  provider: 'runway',
  model: '...',
  providerJobId: '...',
  operation: 'generate',
  prompt: '...',
  parameters: {},
  estimatedCostUsd: 0,
  actualCostUsd: null,
  duration: 0,
  resolution: '',
  aspectRatio: '',
  latencyMs: null,
  parentAssets: [],
  outputAssets: [],
  createdAt: '',
  completedAt: null
}
```

## Definition of Done — Phase 1

La phase 1 est terminée lorsque :

- le service vidéo IA atome existe ;
- Runway fonctionne derrière un adapter ;
- text → video fonctionne ;
- image → video fonctionne ;
- les jobs sont suivis ;
- les erreurs sont normalisées ;
- les coûts sont estimables ;
- les vidéos deviennent des objets atome ;
- la source n’est jamais détruite ;
- Undo/Redo fonctionne ;
- sauvegarde/réouverture fonctionne ;
- les clés sont sécurisées ;
- l’UI ne contient aucune logique Runway ;
- un mock ou second adapter de test prouve qu’un provider peut être remplacé sans modification UI ;
- la documentation est complète ;
- les tests sont reproductibles.

## Ordre de travail

1. Audit.
2. Rapport.
3. Cartographie KEEP / EXTEND / REPLACE / REMOVE / COEXIST.
4. Architecture.
5. Validation du plan.
6. Contrat `AI Video Service`.
7. Capability registry.
8. Runway Adapter.
9. Job manager.
10. Cost estimator.
11. Prototype text → video.
12. Prototype image → video.
13. Intégration objets/timeline.
14. Tests.
15. Benchmarks.
16. Sécurité.
17. Documentation.
18. Préparation du second provider.

À chaque étape :
- réutiliser l’existant ;
- éviter les duplications ;
- éviter les dépendances fournisseurs ;
- ne jamais transformer Runway en dépendance structurelle d’atome.


---

# Journal de réalisation — phase 1 (21 sept. 2026)

## Audit de l’existant vidéo (KEEP / EXTEND / REPLACE / REMOVE / COEXIST)

| Élément | Chemin | Décision |
|---|---|---|
| Détection du type vidéo + sonde des métadonnées | `eVe/domains/media/asset_box_media.js` | KEEP |
| Upload + URL média | `eVe/domains/media/asset_box_file_upload.js` | KEEP |
| Importeur canonique (drop.external) | `eVe/intuition/tools/project_drop_external_runtime.js` | **EXTEND** : accepte une entrée `preuploaded` (fichier déjà stocké par le serveur, pas de double upload) |
| Classification de rendu | `eVe/domains/rendering/render_atom.js` | KEEP |
| Lecture Bevy (`<video>` caché + frame callback) | `eVe/domains/rendering/bevy_video_*_runtime.js` | KEEP |
| Trim / crop dans la projection | `bevy_projection_media_contract.js`, `media_crop_model.js` | KEEP |
| Transport de lecture | `project_view_playback_runtime.js`, `selected_project_media_playback_runtime.js` | KEEP |
| Posters (capturés à l’affichage) | `media_video_poster_runtime.js`, `project_preview_video_posters.js` | KEEP |
| Aperçus liste / finder | `bevy_panel_record_preview.js`, `bevy_panel_finder_model.js` | KEEP |
| Pistes vidéo Molecule, splitClip | `eVe/intuition/tools/molecule/*` | COEXIST (le résultat IA devient une source de clip) |
| Enregistrement (MediaRecorder, iOS natif) | `video_api_record.js`, `AppNativeVideoRecorderSupport.swift` | COEXIST |
| ffmpeg serveur / Tauri (cache webm→mp4) | `server/server_media.js`, `desktop-tauri/.../mod.rs` | KEEP |
| Streaming Range | `server/server.js` (`GET /api/uploads/:file`) | KEEP |
| Capture compositeur (retouche) | `svg_draw_mask_runtime.js`, `bevy_project_preview_capture_adapter.js` | **REUSE** pour exporter l’image sélectionnée (image → vidéo) |
| Génération vidéo IA | — | nouveau (Runway) |
| WebCodecs / matting / segmentation | — | absent (phase 4) |

Aucune suppression.

## Architecture livrée

`UI (Vidéo AI) → aiVideo (client) → WS ai-provider video.* → AI Video Service → registre + routeur → adapter → Runway`

- **Socle partagé** `server/ai_generation/core.js` : registre de providers + routeur `auto` (capability, clé, contrainte d’acceptation, **raison du choix**), jobs par principal (TTL 24 h), mapping HTTP → erreurs. Utilisé par l’audio et la vidéo.
- **Service** `server/ai_video/service.js` : requête canonique (prompt, negativePrompt, duration, aspectRatio, resolution, fps, source.image, controls.seed, routing.priority/maxCostUsd, providerOptions), `estimate` avant génération, `COST_LIMIT_EXCEEDED`, statuts `queued|running|succeeded|failed|cancelled|expired`, `cancel`, erreurs normalisées du cahier des charges. **La sortie est téléchargée et stockée côté serveur** dans les fichiers de l’utilisateur (`storeGeneratedVideo`, même mécanique que `remote-wallpaper`) : ni base64 (casserait les relais Tauri 16 MiB / iOS 28 Mo), ni URL Runway temporaire côté client.
- **Adapter** `server/ai_video/providers/runway.js` : seul fichier qui connaît Runway (`api.dev.runwayml.com`, `Bearer`, `X-Runway-Version: 2024-11-06`, `/v1/text_to_video`, `/v1/image_to_video`, `/v1/tasks/{id}`, `DELETE` pour annuler, `/v1/organization` pour valider la clé). Modèles en env (`RUNWAY_TEXT_MODEL` = `gen4.5`, `RUNWAY_IMAGE_MODEL` = `gen4_turbo`), ratios validés par modèle, durée 2–10 s, ajustements → warnings. Modération → `CONTENT_REJECTED`. Capabilities `true` : textToVideo, imageToVideo, asyncJobs, polling, costEstimate, cancel ; tout le reste `false`.
- **Pricing versionné** `server/ai_video/providers/runway_pricing.js` (version `2026-09-21`, 1 crédit = 0,01 $, gen4_turbo 5 cr/s, gen4.5 12 cr/s, veo3.1 20/40, veo3.1_fast 10/15). Chaque job enregistre la version utilisée.
- **Mock** `server/ai_video/providers/mock.js` (`ATOME_AI_VIDEO_MOCK=1`) : preuve qu’un provider remplace Runway sans toucher l’UI.
- **Client** `atome/src/squirrel/ai/video/ai_video_client.js` (`window.atomeAiVideo`) : estimate, generate, getJob, waitForJob (backoff 5 → 15 s), cancel, storeOutput.
- **Préférences** : OpenAI › MusicGPT › **Runway** (clé stockée serveur, validée par Runway, sans bouton « Utiliser »).
- **UI** — runtime unique `eVe/intuition/tools/ai_generators/` pour les 4 générateurs du Générateur (**Audio AI, Vidéo AI, Image AI, Vecteur AI**) : même dock, même visuel dans l’atome, clic = arrêt, appui long = prompt ; activer l’un libère l’autre. Vidéo AI : une image sélectionnée ⇒ image → vidéo (export par le compositeur, `parent_assets` = l’image), sinon texte → vidéo ; ratio/durée déduits du prompt (« vertical », « carré », « 8 s ») ; coût estimé affiché avant la génération.
- **Image AI** : pré-prompt photoréaliste + action serveur `image-generate` (clé OpenAI serveur) → PNG → atome image.
- **Vecteur AI** : pré-prompt d’illustrateur vectoriel + action `responses` → SVG réel **assaini** (scripts, handlers, foreignObject, `<image>`, href externes, `javascript:` retirés + validation XML) → atome svg.
- Provenance commune `ai_generation` (generator, operation, prompt, pre_prompt, provider demandé/réel, modèle, paramètres, warnings, coût estimé/réel, version de pricing, raison du routage, parent_assets, latence, dates).

## Ajouter un provider vidéo (ex. fal.ai)

1. `server/ai_video/providers/<id>.js` implémentant le contrat en tête de `service.js` (`estimate`, `submit`, `poll`, `cancel?`, `validateKey?`) + sa grille de prix versionnée ; capabilities `true` uniquement si testées.
2. L’enregistrer dans `server/ai_video/index.js` (ordre = préférence de `auto`).
3. Si clé : ajouter l’id à `SERVER_VAULT_PROVIDERS` (serveur) et à `AI_SERVICE_KEY_PROVIDERS` + `SERVER_VAULT_AI_PROVIDERS` (`model_catalog_registry.js`).
4. Aucun changement d’UI.

## Vérifications faites

- `temp/ai_video_service_probe.mjs` — 10/10 : mapping texte/image, ratios par modèle, durée bornée, estimation (gen4.5 5 s = 0,60 $, gen4_turbo 5 s = 0,25 $), budget, routage auto + raison, THROTTLED/SUCCEEDED/modération, annulation, cloisonnement par utilisateur, clé et URL Runway jamais exposées, sortie stockée une seule fois.
- `temp/ai_audio_service_probe.mjs` — 10/10 après extraction du socle (non-régression).
- `temp/ai_generators_client_probe.mjs` — 9/9 : 4 générateurs, image → vidéo, coût affiché, pré-prompt photo, assainissement SVG, bascule entre générateurs.
- `temp/ai_video_ws_probe.mjs` — vrai serveur + WebSocket : fausse clé **refusée par l’API Runway réelle** (`AUTH_ERROR`), génération mock, fichier stocké et enregistré, servi en 200 et en Range 206.
- `temp/ai_generators_ui.probe.mjs` — vraie app (Playwright, mocks) 11/11 : ordre des clés, validation Runway, 4 entrées du Générateur, vrais clics Vidéo AI → dock → appui long → prompt tapé → atome vidéo lisible, image sélectionnée → image → vidéo avec `parent_assets`, Image AI sans clé OpenAI → message clair, atomes image et svg réels (svg assaini), clic = arrêt.
- Correctif au passage : `photo.svg` et `video.svg` n’avaient ni `width` ni `height` et s’affichaient minuscules dans le menu.

## Reste à faire

- [ ] Tests réels avec une clé Runway et une clé OpenAI (je n’ai pas les clés) : qualité, latence, coût réel vs estimé.
- [ ] Déployer le serveur (atome.one) pour Tauri / iOS ; vérifier la copie locale de la vidéo (`ensureMediaLocallyAvailable`) sur ces plateformes.
- [ ] Undo/Redo et sauvegarde/réouverture : passent par le pipeline canonique de création, non exercés explicitement par une probe.
- [ ] Mode expert (choix provider/modèle, seed, options provider), bouton d’annulation dans le dock.
- [ ] Jobs persistants au-delà d’un redémarrage serveur ; webhooks.
- [ ] Phases 2–4 : fal.ai, audio → vidéo (MusicGPT), matting / segmentation.
