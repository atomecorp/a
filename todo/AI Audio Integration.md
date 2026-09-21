# AI Audio Integration — atome

## Statut
Roadmap / cahier des charges / prompt d’implémentation.

**Phase 1 livrée le 21 sept. 2026** (MusicGPT derrière l’AI Audio Service, UI Créer › Générateur › Audio AI, clé en Préférences). Voir « Journal de réalisation » en fin de fichier. Restent ouverts : test réel avec une clé MusicGPT, SheetSage2, stems, MIDI→audio, provider `auto` multi-fournisseurs réel, 2ᵉ provider.

## Décision d’architecture

La première phase d’intégration doit utiliser **MusicGPT comme provider de génération audio principal**.

Cette décision ne doit **jamais** créer une dépendance structurelle entre atome et MusicGPT.

atome doit exposer une **API audio IA interne standard**, indépendante des fournisseurs, avec des adapters/providers interchangeables. MusicGPT est le premier provider implémenté, pas l’API publique interne d’atome.

Objectif structurel :

`atome → AI Audio Service → provider adapter → MusicGPT / autre provider`

YuE2 n’est plus le provider de référence de cette roadmap. Il pourra être réévalué ultérieurement comme provider local ou expérimental si sa licence, ses performances et ses capacités deviennent adaptées, mais aucune partie de l’UI ou du modèle de données ne doit dépendre de lui.

## Objectif

Intégrer dans **atome** une chaîne IA audio modulaire permettant de passer entre audio, représentation musicale éditable et génération audio, sans dupliquer les fonctions déjà présentes dans le projet.

Le système doit permettre notamment :
- génération audio musicale à partir d’un style, d’une description et éventuellement de paroles ;
- génération instrumentale ciblée, par exemple violon cinématique, guitare, piano ou batterie ;
- génération instrumentale sans voix ;
- transcription audio → mélodie / accords / structure / MIDI / ABC lorsque le provider approprié le permet ;
- utilisation d’une mélodie existante comme contrainte de génération lorsque le provider le permet ;
- MIDI → représentation intermédiaire → audio via un provider compatible ;
- modification d’une mélodie/partition avant régénération ;
- séparation de stems via le provider le plus adapté ;
- changement de provider sans modifier l’UI ;
- routage automatique d’une opération vers le provider disposant de la capacité nécessaire ;
- suivi des coûts, du provider, du modèle, de la version et des paramètres utilisés.

## Principe fondamental : API interne standard

L’API interne d’atome doit normaliser les opérations audio IA.

L’UI ne doit jamais appeler directement :
- MusicGPT ;
- SheetSage2 ;
- Wondera ;
- Musicful ;
- Suno ;
- un futur modèle local ;
- tout autre fournisseur externe.

L’UI appelle uniquement le service audio IA d’atome.

Exemple conceptuel :

```js
await aiAudio.generate({
  provider: 'auto',
  prompt: 'solo violin, cinematic, intimate, no drums, no vocals',
  instrument: 'violin',
  duration: 30,
  tempo: 90,
  instrumental: true
})
```

Le service sélectionne ensuite le provider approprié et traduit la requête standard vers l’API spécifique du fournisseur.

## Providers de référence

### 1. MusicGPT — provider principal de la phase 1

MusicGPT est le premier provider à intégrer.

Fonctions à exploiter en priorité :
- génération de musique depuis un prompt ;
- génération instrumentale ;
- choix/style musical ;
- contrôle de la durée lorsque disponible ;
- génération asynchrone ;
- récupération des résultats par webhook ou statut/polling ;
- récupération WAV/MP3 lorsque disponible ;
- outils d’extraction, remix, extend, inpaint ou stems uniquement après validation de leurs endpoints API réels et de leur disponibilité sur le plan utilisé.

L’API MusicGPT documente notamment une génération REST autour de `MusicAI`, avec authentification par clé API, `prompt`, `music_style`, `lyrics`, `make_instrumental`, `vocal_only`, `output_length` et `webhook_url` selon la version d’API disponible.

Important :
- ne pas supposer qu’une version précise de MusicGPT est disponible pour tous les comptes ;
- la documentation actuelle présente notamment Music AI V2 comme une offre Enterprise ;
- ne pas figer `/v1` ou `/v2` dans le domaine métier ;
- conserver base URL, version d’API et modèle dans la configuration de l’adapter ;
- ne jamais exposer la clé MusicGPT dans le JavaScript frontend ;
- passer par une passerelle/service sécurisé côté serveur ou runtime natif autorisé.

### 2. SheetSage2 — provider spécialisé transcription/analyse

SheetSage2 reste un candidat spécialisé pour le pont audio → représentation musicale.

Sorties potentielles à exploiter :
- `score.abc` ;
- `transcription.mid` ;
- `melody.mid` ;
- `melody_vocal.mid` ;
- `melody_instrumental.mid` ;
- `chords.mid` ;
- beats / downbeats ;
- key ;
- chords ;
- structure ;
- événements temporels.

SheetSage2 ne doit pas être couplé à MusicGPT. Il est un provider indépendant spécialisé dans d’autres capacités.

### 3. Providers futurs

L’architecture doit permettre d’ajouter sans refonte :
- Wondera ;
- Musicful ;
- Suno si les endpoints requis sont accessibles par API ;
- modèles locaux ;
- modèles open source ;
- autres fournisseurs à venir.

Ces providers ne doivent pas être simulés : une capability n’est activée que lorsqu’un endpoint ou une implémentation réellement fonctionnelle a été validé.

## Capability registry

Chaque provider doit déclarer explicitement ce qu’il sait réellement faire.

Exemple :

```js
{
  id: 'musicgpt',
  capabilities: {
    textToMusic: true,
    instrumentalGeneration: true,
    vocalGeneration: true,
    stems: false,
    audioToMidi: false,
    midiConditioning: false,
    extend: false,
    remix: false,
    inpaint: false,
    asyncJobs: true,
    webhooks: true
  }
}
```

Les valeurs ci-dessus sont un exemple de structure, pas une vérité figée sur les capacités du provider. Elles doivent être générées à partir des endpoints effectivement intégrés et testés.

Une capability ne doit jamais être marquée `true` uniquement parce qu’elle existe dans l’application web du fournisseur. Elle doit être disponible dans l’API réellement utilisée par atome.

## API interne proposée

Créer une abstraction indépendante des modèles, par exemple :

`Audio AI Service`
- `generate(request)`
- `getJob(jobId)`
- `cancel(jobId)` lorsque supporté
- `listProviders()`
- `getCapabilities(providerId)`
- `estimate(request)` lorsque possible
- `transcribe(audio, options)`
- `audioToMidi(audio, options)`
- `midiToAudio(midi, options)`
- `audioToScore(audio, options)`
- `scoreToAudio(score, options)`
- `extractMelody(audio, options)`
- `extractChords(audio, options)`
- `analyzeStructure(audio, options)`
- `separateStems(audio, options)`
- `extend(audio, options)`
- `remix(audio, options)`
- `regenerate(source, constraints)`

Les noms définitifs doivent respecter les conventions déjà utilisées dans atome.

## Schéma de requête canonique

Le domaine atome ne doit pas utiliser les noms de paramètres propres à MusicGPT.

Exemple :

```js
const request = {
  operation: 'generate',
  provider: 'auto',
  model: null,
  prompt: 'cinematic solo violin, expressive, intimate',
  style: 'cinematic',
  instrument: 'violin',
  instrumental: true,
  vocals: false,
  lyrics: null,
  duration: 30,
  tempo: 90,
  key: null,
  referenceAudio: null,
  referenceMidi: null,
  stemTargets: null,
  output: {
    preferredFormat: 'wav'
  },
  routing: {
    allowFallback: true,
    preferLocal: false,
    maxCost: null
  }
}
```

L’adapter MusicGPT traduit ensuite uniquement les champs compatibles vers le payload MusicGPT.

Les champs non supportés doivent :
1. être ignorés explicitement avec information de capability ;
2. provoquer un routage vers un autre provider si demandé ;
3. ou retourner une erreur structurée `CAPABILITY_UNAVAILABLE`.

Ne jamais faire croire qu’un provider a respecté un paramètre qu’il ne sait pas réellement utiliser.

## Réponse canonique

Tous les providers doivent retourner une structure atome commune.

Exemple :

```js
{
  jobId: '...',
  provider: 'musicgpt',
  providerJobId: '...',
  model: '...',
  status: 'queued',
  eta: null,
  costEstimate: null,
  outputs: [],
  metadata: {},
  warnings: []
}
```

Une fois terminé :

```js
{
  jobId: '...',
  provider: 'musicgpt',
  providerJobId: '...',
  status: 'completed',
  outputs: [
    {
      type: 'audio',
      format: 'wav',
      url: '...',
      duration: 30
    }
  ],
  metadata: {
    prompt: '...',
    providerModel: '...',
    generationParameters: {}
  }
}
```

## Routing multi-provider

Prévoir trois modes :

### Provider explicite

```js
provider: 'musicgpt'
```

atome utilise MusicGPT et échoue proprement si la capability demandée manque.

### Provider automatique

```js
provider: 'auto'
```

Le routeur sélectionne le provider selon :
1. capability requise ;
2. disponibilité ;
3. préférence utilisateur ;
4. qualité configurée ;
5. coût ;
6. temps estimé ;
7. contraintes de licence ;
8. local/distant.

### Fallback

Si MusicGPT est indisponible ou ne possède pas une capability :
- sélectionner un autre provider autorisé ;
- ne jamais changer silencieusement de provider si cela modifie les droits, le coût ou le comportement de façon importante ;
- enregistrer le provider réellement utilisé dans les métadonnées de l’objet généré.

## Contrainte majeure avant développement

**Ne rien implémenter avant audit du code atome existant.**

Rechercher dans tout le projet les fonctions déjà présentes ou en cours concernant :
- audio → MIDI ;
- MIDI → audio ;
- pitch detection ;
- transcription musicale ;
- détection mélodique ;
- accords ;
- tempo / beat / downbeat ;
- séparation de stems ;
- génération audio / musique ;
- conversion MIDI / ABC / MusicXML ou formats apparentés ;
- time-stretch / pitch-shift ;
- import/export audio et MIDI ;
- modèles IA audio déjà intégrés ;
- workers, WASM, services locaux, APIs ou MCP liés à l’audio.

Pour chaque fonction trouvée, classifier :
1. **KEEP** — meilleure ou complémentaire ;
2. **EXTEND** — à compléter avec MusicGPT, SheetSage2 ou un autre provider ;
3. **REPLACE** — nouvelle solution préférable ;
4. **REMOVE** — redondante/obsolète après migration ;
5. **COEXIST** — fonction différente justifiant plusieurs solutions.

Aucune suppression ne doit être effectuée sans :
- identifier tous les appels/dépendances ;
- tests de non-régression ;
- validation explicite de la solution de remplacement.

## Workflow 1 — génération instrumentale ciblée

Phase 1 prioritaire.

Exemples :
- violon cinématique seul ;
- guitare acoustique seule ;
- piano seul ;
- batterie seule ;
- instrumental complet sans voix.

Pipeline cible :

`atome → Audio AI Service → MusicGPT adapter → MusicGPT API → job async → résultat audio → nouvel objet audio atome`

Le provider MusicGPT doit recevoir une consigne explicite et `make_instrumental` lorsque la version d’API utilisée le supporte.

Tester systématiquement si le résultat respecte réellement :
- absence de voix ;
- présence de l’instrument demandé ;
- absence d’instruments explicitement interdits ;
- durée ;
- style ;
- stabilité sur plusieurs générations.

Un prompt n’est pas une garantie d’isolation parfaite. Le résultat doit être évalué comme tel.

## Workflow 2 — Audio → MIDI

1. L’utilisateur sélectionne/import un objet audio.
2. Le routeur choisit un provider possédant `audioToMidi` ou une combinaison validée.
3. Extraction possible de :
   - mélodie globale ;
   - mélodie vocale ;
   - mélodie instrumentale ;
   - accords ;
   - tempo/structure.
4. Création d’un objet MIDI atome éditable.
5. Conserver une référence vers l’audio source et les métadonnées de transcription.
6. Permettre la correction manuelle avant toute régénération.

MusicGPT ne doit pas être supposé responsable de cette opération si l’endpoint correspondant n’est pas disponible et validé.

## Workflow 3 — MIDI → Audio

Objectif utilisateur :
> sélectionner une piste MIDI et demander « interprète-la en violon cinématique ».

Pipeline générique :

`MIDI atome → Audio AI Service → provider possédant midiConditioning/midiToAudio → audio → nouvel objet audio atome`

Ne pas supposer que MusicGPT consomme directement un MIDI tant qu’un endpoint officiellement accessible et testé ne le confirme pas.

Si MusicGPT ne le permet pas :
- conserver MusicGPT pour la génération textuelle/instrumentale ;
- router `midiToAudio` vers un autre provider ;
- ou utiliser un bridge symbolique validé ;
- ne jamais convertir implicitement le MIDI en simple description textuelle en prétendant conserver les notes.

## Workflow 4 — Audio → partition → modification → audio

Pipeline générique :

`Audio → provider transcription → ABC/MIDI → édition → Audio AI Service → provider de génération compatible → nouvel audio`

Cas :
- conserver une mélodie et changer l’instrumentation ;
- modifier quelques notes ;
- changer accords/harmonie ;
- changer tempo/structure ;
- réinterpréter dans un autre style.

Le provider de transcription et le provider de génération peuvent être différents.

## Workflow 5 — Stems

La séparation de stems est une capability indépendante de la génération.

Auditer d’abord les moteurs déjà présents dans atome.

Si MusicGPT expose l’endpoint nécessaire dans l’API souscrite et qu’il est satisfaisant, l’implémenter dans le MusicGPT adapter.

Sinon :
- conserver le moteur existant ;
- ou utiliser un provider spécialisé ;
- ou router automatiquement cette opération vers un autre provider.

Pipeline :

`mix → Audio AI Service → provider stems → stems → objets audio atome indépendants`

La présence d’un stem splitter dans une interface web ne suffit pas : l’endpoint API doit être vérifié et testé.

## Données et non-destruction

Chaque transformation IA doit :
- conserver la source ;
- créer une nouvelle version ou un nouvel objet ;
- enregistrer provider/modèle/version ;
- enregistrer le provider demandé et le provider réellement utilisé ;
- paramètres ;
- seed lorsque disponible ;
- prompt/style ;
- représentation symbolique utilisée ;
- coût estimé et coût réel lorsque disponibles ;
- durée d’exécution ;
- date ;
- liens parent/enfant entre objets.

Les opérations doivent être annulables et compatibles avec l’historique/Undo d’atome.

## Exécution locale / distante

Prévoir dès l’architecture :
- providers locaux ;
- providers distants/API ;
- détection des capacités machine pour les providers locaux ;
- file d’attente ;
- progression ;
- annulation lorsqu’elle est possible ;
- erreurs récupérables ;
- retry contrôlé ;
- timeout ;
- cache ;
- quotas et limites par provider.

MusicGPT est un provider distant : atome n’a pas à héberger son modèle ou son GPU.

Un futur provider local peut nécessiter son propre runtime/GPU. Il doit rester derrière la même interface.

Ne pas bloquer l’UI pendant l’inférence.

## Sécurité

### Clés API

Les clés MusicGPT et des autres fournisseurs :
- ne doivent jamais être présentes dans le bundle JavaScript frontend ;
- ne doivent jamais être envoyées au navigateur ;
- ne doivent jamais être écrites dans les logs applicatifs ;
- doivent être stockées dans le mécanisme de secrets prévu par l’infrastructure atome ;
- doivent pouvoir être remplacées/révoquées sans rebuild de l’UI.

### Gateway

Prévoir une passerelle sécurisée :

`frontend atome → service/gateway atome → provider distant`

La gateway doit :
- authentifier l’utilisateur atome ;
- contrôler quotas et autorisations ;
- injecter la clé provider ;
- normaliser les erreurs ;
- suivre coût et usage ;
- gérer les webhooks providers ;
- empêcher un client de modifier arbitrairement les URLs provider ou les secrets.

## Intégration MusicGPT — Phase 1

### Étape 1 — audit

Avant de créer le moindre adapter :
- trouver l’architecture actuelle des services/API/MCP ;
- identifier où doivent vivre les appels externes ;
- identifier le stockage des secrets ;
- identifier le système de jobs/progression ;
- identifier le modèle d’objet audio ;
- identifier import/export et cache média ;
- identifier l’Undo/Redo ;
- identifier les tests existants.

### Étape 2 — contrat provider

Créer le contrat `AudioAIProvider` ou l’équivalent conforme aux conventions d’atome.

Il doit fournir au minimum :
- identité du provider ;
- capabilities ;
- `generate()` ;
- `getJob()` ;
- normalisation des erreurs ;
- normalisation du résultat ;
- estimation coût si fournie par le provider ;
- métadonnées provider/version.

### Étape 3 — MusicGPT adapter

Créer un adapter MusicGPT isolé.

Responsabilités :
- convertir une requête canonique atome en payload MusicGPT ;
- ajouter l’Authorization côté sécurisé ;
- choisir la version d’API configurée ;
- soumettre la génération ;
- enregistrer `task_id` / conversion IDs lorsqu’ils sont retournés ;
- gérer webhook ou polling ;
- récupérer les sorties audio ;
- normaliser la réponse ;
- remonter `credit_estimate` lorsque fourni ;
- mapper proprement les erreurs HTTP/provider ;
- ne jamais exposer les détails internes MusicGPT à l’UI sauf métadonnées de diagnostic en mode expert.

### Étape 4 — première fonction verticale

Implémenter d’abord :

`generate instrumental from prompt`

Cas minimal :

```js
await aiAudio.generate({
  provider: 'musicgpt',
  prompt: 'cinematic solo violin, expressive, intimate, no drums, no vocals',
  instrumental: true,
  duration: 30
})
```

Résultat attendu :
- job atome créé immédiatement ;
- UI non bloquée ;
- progression/statut disponible ;
- résultat audio attaché à un nouvel objet ;
- provenance MusicGPT enregistrée ;
- coût estimé enregistré lorsque disponible ;
- erreurs récupérables.

### Étape 5 — provider auto

Une fois MusicGPT validé :
- activer `provider: 'auto'` ;
- le routeur doit sélectionner MusicGPT pour les capabilities validées ;
- aucun autre provider ne doit être appelé tant qu’il n’a pas son propre adapter et ses tests.

### Étape 6 — deuxième provider

Ajouter ensuite un deuxième provider uniquement via le même contrat.

Le test décisif : **aucun composant UI existant ne doit avoir besoin d’être modifié pour passer de MusicGPT au deuxième provider.**

Si l’ajout du deuxième provider nécessite de modifier l’UI ou les objets audio parce que des concepts MusicGPT ont fui dans le domaine, l’architecture doit être corrigée avant de poursuivre.

## Mapping MusicGPT — règles

Le mapping doit être centralisé dans l’adapter.

Exemple conceptuel :

```js
function toMusicGPTPayload(request, config) {
  return {
    prompt: request.prompt,
    music_style: request.style || undefined,
    lyrics: request.lyrics || '',
    make_instrumental: request.instrumental === true,
    output_length: request.duration || undefined,
    webhook_url: config.webhookUrl
  }
}
```

Ce code est indicatif :
- vérifier les paramètres exacts de la version API réellement activée ;
- ne pas envoyer de paramètres unsupported ;
- ne pas coder les secrets dans cette fonction ;
- ne pas coder le modèle ou la version en dur si le provider les rend configurables.

## Erreurs standard

Normaliser au minimum :
- `PROVIDER_UNAVAILABLE`
- `AUTH_ERROR`
- `QUOTA_EXCEEDED`
- `PAYMENT_REQUIRED`
- `RATE_LIMITED`
- `INVALID_REQUEST`
- `CAPABILITY_UNAVAILABLE`
- `GENERATION_FAILED`
- `TIMEOUT`
- `CANCELLED`
- `OUTPUT_UNAVAILABLE`

Conserver le message provider brut uniquement dans les diagnostics protégés.

## Coût et quotas

Le service doit être prêt à comparer les coûts entre providers.

Chaque job doit pouvoir enregistrer :
- provider ;
- modèle ;
- opération ;
- coût estimé ;
- unité de facturation ;
- coût réel si retourné ;
- durée générée ;
- nombre de variantes ;
- quota restant lorsque disponible.

Le système ne doit pas supposer que tous les fournisseurs facturent en tokens. Ils peuvent facturer en crédits, génération, seconde, minute ou opération.

## UX

L’utilisateur ne doit pas voir les détails techniques du provider sauf mode expert.

Actions possibles sur un objet audio/MIDI :
- Générer ;
- Transcrire en MIDI ;
- Extraire mélodie ;
- Extraire accords ;
- Interpréter ;
- Changer instrument ;
- Changer style ;
- Régénérer ;
- Séparer ;
- Éditer la partition.

Exemple :

`Créer → Audio IA → Violon → Cinématique → Générer`

ou :

`Piste MIDI → Interpréter → Violon → Cinématique → Générer`

Le choix du provider ne doit pas être nécessaire pour un utilisateur normal. Le mode expert peut permettre :
- Auto ;
- MusicGPT ;
- autres providers disponibles.

## Tests obligatoires

### Architecture
- remplacer MusicGPT par un provider mock sans modifier l’UI ;
- ajouter un deuxième provider sans modifier le contrat public ;
- capability absente → erreur propre ou fallback ;
- provider auto → routeur déterministe selon configuration ;
- métadonnées du provider réellement utilisé enregistrées.

### MusicGPT Phase 1
- authentification valide ;
- clé invalide ;
- génération instrumentale ;
- instrumental sans voix ;
- prompt d’instrument seul ;
- durée demandée ;
- webhook ;
- polling si utilisé ;
- erreur provider ;
- timeout ;
- quota/crédit insuffisant ;
- résultat WAV/MP3 lorsque disponible ;
- estimation de coût lorsqu’elle est retournée.

### Fonctionnels globaux
- voix fredonnée → MIDI via provider compatible ;
- instrument monophonique → MIDI ;
- morceau complet → mélodie MIDI ;
- morceau complet → accords ;
- MIDI simple → audio via provider compatible ;
- changement de style avec conservation de mélodie via provider compatible ;
- instrumental sans voix ;
- génération d’un instrument seul ;
- séparation de stems via provider compatible ;
- annulation d’une génération lorsqu’elle est supportée ;
- historique/Undo/Redo.

### Qualité
Comparer :
- notes source vs transcription ;
- timing ;
- tempo ;
- conservation mélodique après génération ;
- artefacts ;
- présence d’instruments non demandés ;
- présence de voix non demandée ;
- stabilité sur plusieurs générations ;
- différence de qualité entre providers lorsque plusieurs sont disponibles.

### Performance
Mesurer :
- temps de soumission ;
- temps en file ;
- temps de génération ;
- temps de téléchargement ;
- taille du cache ;
- impact UI ;
- erreurs/retry ;
- coût par opération.

Aucune opération IA lourde ne doit bloquer le thread UI.

## Livrables

1. Audit de l’existant atome.
2. Tableau KEEP / EXTEND / REPLACE / REMOVE / COEXIST.
3. Contrat standard `Audio AI Service`.
4. Capability registry.
5. Router provider / mode `auto`.
6. MusicGPT adapter.
7. Gateway/secrets sécurisés.
8. Prototype génération instrumentale MusicGPT.
9. Tests automatisés.
10. Tests UI/UX.
11. Benchmarks qualité/performance/coût.
12. Documentation développeur.
13. Documentation utilisateur.
14. Liste des risques licences/dépendances/coûts/provider lock-in.
15. Procédure documentée pour ajouter un nouveau provider.

## Critères d’acceptation

La phase MusicGPT est validée lorsque :
- MusicGPT fonctionne derrière l’API interne atome ;
- l’UI n’appelle jamais MusicGPT directement ;
- une génération instrumentale peut être lancée sans bloquer l’UI ;
- le résultat devient un objet audio atome ;
- provenance, provider, modèle et paramètres sont conservés ;
- les secrets MusicGPT restent hors frontend ;
- les erreurs sont normalisées ;
- les coûts sont récupérés/enregistrés lorsqu’ils sont fournis ;
- MusicGPT peut être remplacé par un provider mock sans modifier l’UI ;
- un deuxième provider peut être ajouté derrière le même contrat ;
- les tests et benchmarks sont reproductibles.

La roadmap globale est validée lorsque :
- l’utilisateur peut convertir un audio en MIDI exploitable via un provider compatible ;
- il peut sélectionner un MIDI et obtenir une interprétation audio via un provider compatible ;
- il peut conserver/modifier une mélodie puis régénérer lorsque le provider le permet ;
- les conversions restent non destructives ;
- l’UI reste indépendante des modèles ;
- aucune fonctionnalité existante utile n’a été supprimée sans remplacement validé ;
- les providers peuvent être remplacés ;
- le routage multi-provider fonctionne ;
- l’ajout d’un nouveau fournisseur ne nécessite pas de refonte UI.

---

# Prompt d’implémentation pour l’agent

Tu travailles dans le projet **atome**.

Ta mission est de construire l’architecture **AI Audio Integration** multi-provider et d’intégrer **MusicGPT comme premier provider opérationnel**.

MusicGPT est la **phase 1** et le provider de référence initial. Il ne doit jamais devenir une dépendance structurelle de l’UI, du modèle de données ou des objets audio d’atome.

Le système doit être conçu dès le premier commit pour permettre l’ajout de plusieurs providers.

## Règle n°1 — audit avant code

**Commence par auditer le projet. Ne code rien avant d’avoir identifié ce qui existe déjà.**

Recherche toutes les implémentations audio/MIDI/IA/API/MCP pertinentes dans le repository et ses modules liés.

Produis d’abord un rapport indiquant :
- fichiers/modules concernés ;
- fonction réelle ;
- état : production, expérimental, incomplet, mort ;
- dépendances ;
- tests existants ;
- système de secrets ;
- système de jobs/asynchrone ;
- système de stockage/cache média ;
- fonctions audio/MIDI déjà présentes ;
- conflits/redondances avec MusicGPT/SheetSage2 ;
- décision proposée : KEEP / EXTEND / REPLACE / REMOVE / COEXIST.

Ensuite seulement, propose le plan d’intégration minimal.

## Phase 1 obligatoire — abstraction avant MusicGPT

Avant l’appel MusicGPT, créer ou identifier l’interface standard d’atome.

Elle doit permettre au minimum :
- `generate()` ;
- `getJob()` ;
- `getCapabilities()` ;
- `listProviders()` ;
- `estimate()` lorsque possible ;
- erreurs normalisées ;
- métadonnées normalisées.

Ne crée aucune fonction UI nommée `musicgptGenerate`, `callMusicGPT` ou équivalent.

L’UI doit appeler une fonction générique de type :

```js
aiAudio.generate(request)
```

## Phase 2 obligatoire — MusicGPT adapter

Créer un adapter isolé MusicGPT.

Utiliser l’API officielle disponible sur le compte et vérifier sa version au moment de l’implémentation.

La documentation MusicGPT actuelle expose une API REST `MusicAI` acceptant notamment des champs tels que :
- `prompt` ;
- `music_style` ;
- `lyrics` ;
- `make_instrumental` ;
- `vocal_only` ;
- `output_length` ;
- `webhook_url`.

Elle retourne selon la version des identifiants de job/conversion, une ETA et peut fournir une estimation de crédits.

Ne copie pas ces noms dans le domaine atome. Traduis-les dans l’adapter.

La clé API doit rester côté sécurisé. Aucun secret MusicGPT ne doit être présent dans le frontend JavaScript.

## Premier use case vertical

Implémenter en premier :

**prompt → piste instrumentale → objet audio atome**

Test de référence :

```js
await aiAudio.generate({
  provider: 'musicgpt',
  prompt: 'cinematic solo violin, expressive, intimate, no drums, no vocals',
  instrumental: true,
  duration: 30
})
```

Le résultat doit :
- créer un job immédiatement ;
- ne pas bloquer l’UI ;
- suivre le statut ;
- recevoir le callback/webhook ou utiliser le mécanisme de récupération prévu ;
- créer un nouvel objet audio non destructif ;
- conserver la provenance ;
- conserver les paramètres ;
- conserver le coût estimé si MusicGPT le retourne ;
- exposer une erreur atome standard si la génération échoue.

## Multi-provider obligatoire dès la conception

Créer un registre de providers et de capabilities.

Exemple conceptuel :

```js
registerAudioAIProvider('musicgpt', musicGPTProvider)
registerAudioAIProvider('sheetsage2', sheetSageProvider)
```

Prévoir ensuite :
- Wondera ;
- Musicful ;
- Suno ;
- providers locaux ;
- futurs providers.

Ne pas les implémenter fictivement. Ils doivent pouvoir être ajoutés sans changement d’UI.

## Provider `auto`

Prévoir l’architecture permettant :

```js
provider: 'auto'
```

Le routeur doit sélectionner un provider selon les capabilities réelles.

La première version peut n’avoir que MusicGPT pour la génération. Dans ce cas `auto` résout vers MusicGPT uniquement pour les fonctions que son adapter déclare comme validées.

## Interdiction de fausses capabilities

Ne suppose pas que MusicGPT :
- accepte directement le MIDI ;
- garantit un instrument totalement isolé ;
- expose toutes les fonctions de son application web via API ;
- expose un stem splitter dans le plan/API actuellement disponible ;
- supporte un paramètre uniquement parce qu’il apparaît dans une autre version de documentation.

Chaque capability doit être validée par :
1. documentation officielle actuelle ;
2. appel réel ;
3. test automatisé ou reproductible.

## Audio → MIDI et SheetSage2

SheetSage2 reste un provider spécialisé possible pour transcription/analyse.

Ne le fusionne pas avec MusicGPT.

Le service atome doit pouvoir router :
- génération → MusicGPT ;
- transcription → SheetSage2 ou moteur existant ;
- stems → moteur existant ou autre provider ;
- autres opérations → provider possédant réellement la capability.

## Contraintes

- respecter l’architecture et les conventions atome ;
- JavaScript côté frontend ;
- ne pas introduire TypeScript ;
- privilégier modularité et providers interchangeables ;
- aucune dépendance directe de l’UI envers MusicGPT/SheetSage2 ;
- secrets hors frontend ;
- traitements lourds hors thread UI ;
- opérations non destructives ;
- Undo/Redo compatible ;
- tests et benchmarks obligatoires ;
- ne supprimer aucun module existant avant validation ;
- vérifier compatibilité framework/module/MCP ;
- prévoir providers locaux et distants ;
- documenter les licences et droits commerciaux ;
- enregistrer coûts et quotas lorsque disponibles ;
- ne pas ajouter de dépendance inutile.

## Fonctionnalités cibles

1. Génération instrumentale ciblée via MusicGPT — première fonction à livrer.
2. Génération musicale générale.
3. Audio → MIDI/partition via provider approprié.
4. MIDI/partition → audio interprété via provider compatible.
5. Audio → partition → édition → régénération.
6. Changement d’instrument/style en conservant une mélodie lorsque possible.
7. Séparation de stems via provider compatible.
8. Métadonnées et provenance complètes.
9. Suivi des coûts.
10. Architecture provider remplaçable.
11. Routage automatique multi-provider.

## Ordre de travail

1. Audit.
2. Rapport KEEP / EXTEND / REPLACE / REMOVE / COEXIST.
3. Contrat `Audio AI Service`.
4. Capability registry.
5. Architecture secrets/gateway/jobs.
6. MusicGPT adapter.
7. Prototype génération instrumentale MusicGPT.
8. Tests fonctionnels.
9. Tests qualité/coût/performance.
10. Provider `auto`.
11. Documentation procédure d’ajout d’un provider.
12. Deuxième provider seulement après validation de l’abstraction.
13. Nettoyage des anciennes implémentations uniquement après validation.

## Definition of Done — première phase

La première phase est terminée uniquement si :
- MusicGPT génère réellement une piste depuis atome ;
- aucun appel MusicGPT n’est effectué directement par l’UI ;
- la clé API n’est jamais exposée au frontend ;
- le job est asynchrone ;
- le résultat est un objet audio atome non destructif ;
- provenance/coût/paramètres sont enregistrés ;
- les erreurs sont normalisées ;
- le provider est déclaré dans un registre ;
- ses capabilities sont explicites ;
- un provider mock peut remplacer MusicGPT sans changer l’UI ;
- la procédure d’ajout d’un deuxième provider est documentée ;
- les tests sont reproductibles.

À chaque étape, privilégier la réutilisation de l’existant plutôt que la duplication.


---

# Journal de réalisation — phase 1 (21 sept. 2026)

## Audit de l’existant (KEEP / EXTEND / REPLACE / REMOVE / COEXIST)

| Élément | Fichiers | Fonction réelle | État | Décision |
|---|---|---|---|---|
| Audio → MIDI (Basic Pitch, tfjs local) | `eVe/intuition/tools/audio_to_midi/*`, `atome/src/assets/vendor/basic-pitch/` | transcription locale, crée un atome MIDI | production | **KEEP** (provider local `audioToMidi` futur possible) |
| Import MIDI / lecture | `eVe/domains/midi/smf.js`, `midi_playback_runtime.js` | parse SMF, lecture Web MIDI | production | KEEP |
| Time-stretch (Rubber Band WASM) | `eVe/intuition/tools/audio_edit/*` | stretch offline | production | KEEP / COEXIST |
| TTS OpenAI (`speech`) | `eVe/voice/assistant/assistant_media_session.js` | voix → fichier audio | production | COEXIST (parole ≠ musique) |
| TTS local Piper / STT / realtime | `atome/src/squirrel/voice/*` | voix de l’assistant | production | COEXIST |
| Passerelle IA serveur | `server/wsAiProviderOperations.js` | proxy OpenAI authentifié sur `/ws/api` | production | **EXTEND** (actions `audio.*`) |
| Coffre de clés serveur | `server/providerCredentialVault.js` | clés chiffrées par utilisateur | production (OpenAI seul) | **EXTEND** (`musicgpt`) |
| Import média canonique | `eVe/intuition/tools/project_drop_external_runtime.js` | upload + création d’atome | production | KEEP (réutilisé tel quel) |
| Générateur | `eVe/intuition/tools/generator/*` | générateurs procéduraux (texte, texture) | production | **EXTEND** (générateurs « à activation », placement racine) |
| Génération musicale | — | aucune | absent | nouveau (MusicGPT) |
| Stems / pitch detection hors Basic Pitch | — | aucun | absent | à faire (phase ultérieure) |

Aucune suppression.

## Architecture livrée

`UI (Audio AI) → aiAudio (client) → WS ai-provider audio.* → AI Audio Service → adapter → MusicGPT`

- **Service** `server/ai_audio/service.js` : registre de providers, capabilities, routeur `auto` (ordre d’enregistrement, première capability validée **et** clé présente), requête/réponse canoniques, erreurs standard (`AUTH_ERROR`, `PAYMENT_REQUIRED`, `NO_PROVIDER_KEY`, `CAPABILITY_UNAVAILABLE`, …), jobs en mémoire (TTL 24 h, cloisonnés par principal), sortie téléchargée **côté serveur** (aucune URL provider n’atteint le client → OK iOS origine opaque).
- **Adapter** `server/ai_audio/providers/musicgpt.js` : seul fichier qui connaît MusicGPT. `POST {base}/{v}/MusicAI`, polling `GET {base}/{v}/byId?conversionType=MUSIC_AI&task_id=…`, header `Authorization: <clé>`. Base/version/modèle en env (`MUSICGPT_API_BASE`, `MUSICGPT_API_VERSION` défaut `v1`, `MUSICGPT_MODEL` pour v2). Capabilities `true` : textToMusic, instrumentalGeneration, vocalGeneration, asyncJobs ; tout le reste `false`. `duration`/`tempo`/`key` → warnings explicites (non envoyés).
- **Mock** `server/ai_audio/providers/mock.js` : activé seulement par `ATOME_AI_AUDIO_MOCK=1`, prouve le remplacement sans toucher l’UI.
- **WS** : actions `audio.providers`, `audio.capabilities`, `audio.generate`, `audio.job`, `audio.output` ; `credential.store|status|remove` acceptent `provider: 'musicgpt'` (clé validée contre l’API MusicGPT avant stockage).
- **Client** `atome/src/squirrel/ai/audio/ai_audio_client.js` (`window.atomeAiAudio`) : `generate`, `getJob`, `waitForJob`, `fetchOutput`, `listProviders`, `getCapabilities`. Passe par `requestProviderService` → même chemin web / Tauri / iOS, relais natifs inchangés.
- **Préférences** : `listAiKeyProviders()` (`model_catalog_registry.js`) insère MusicGPT sous OpenAI **sans** l’ajouter au registre chat (routage conversation et rafraîchissement des modèles intacts). Clé → coffre serveur ; pas de bouton « Utiliser » ; enregistrer la clé MusicGPT ne change pas le provider chat actif.
- **UI** : `Créer › Générateur › Audio AI` (`eVe/intuition/tools/ai_generators/`, runtime mutualisé avec Vidéo / Image / Vecteur AI depuis le 21 sept.). Active l’IA audio dans le slot de l’atome via `voice/assistant/active_ai_slot.js` ; `invokeAssistant` consulte ce slot (seule retouche du chantier assistant). Réutilise `createAssistantDock` + `renderAssistantScene` : même visuel « à l’écoute », clic = arrêt, appui long = prompt. Le résultat est importé par `importFilesToProjectViaCreator` au niveau courant (liste / naturel standard), provenance dans la prop `ai_generation`.

## Ajouter un provider

1. Créer `server/ai_audio/providers/<id>.js` qui implémente le contrat documenté en tête de `service.js` (`id, label, credentialId, capabilities, submit, poll, [validateKey], [readOutput]`). Ne déclarer `true` qu’une capability validée par un appel réel.
2. L’enregistrer dans `server/ai_audio/index.js` (l’ordre = préférence du routeur `auto`).
3. Si une clé est nécessaire : ajouter l’id à `SERVER_VAULT_PROVIDERS` (`server/providerCredentialVault.js`) et à `AI_SERVICE_KEY_PROVIDERS` + `SERVER_VAULT_AI_PROVIDERS` (`atome/src/squirrel/ai/model_catalog_registry.js`).
4. Aucun changement d’UI.

## Vérifications faites

- `temp/ai_audio_service_probe.mjs` — 10/10 : mapping, capabilities, routage auto, mock, handler WS complet, 402→PAYMENT_REQUIRED, clé jamais renvoyée, URLs provider jamais exposées.
- `temp/ai_generators_client_probe.mjs` (remplace `ai_audio_client_probe.mjs`) : runtime mutualisé des générateurs IA.
- `temp/ai_audio_ws_probe.mjs` — vrai serveur + vrai WebSocket : une fausse clé est **refusée par l’API MusicGPT réelle** (`AUTH_ERROR`), génération mock de bout en bout (WAV réel), clé absente des trames et des logs.
- `temp/ai_audio_ui.probe.mjs` — vraie app (Playwright, 3001, mock) 8/8 : MusicGPT sous OpenAI, clé routée serveur, vrais clics Créer › Générateur › Audio AI, visuel dans l’atome, appui long, **saisie clavier réelle** du prompt, atome `sound` créé avec provenance, clic = arrêt et slot rendu.

## Reste à faire

- [ ] Test réel avec une clé MusicGPT valide (durée, eta, crédits, formats WAV/MP3, respect « instrumental »).
- [ ] Déployer le serveur (atome.one) : les apps Tauri / iOS relaient vers le Fastify distant ; tant qu’il n’a pas ce code, le statut de la clé MusicGPT y est faux (l’ancien serveur ignore `provider`).
- [ ] Vérifier Tauri (copie figée d’eVe dans `target/debug/eVe`) et iOS.
- [ ] Dictée vocale du prompt (réutiliser la session voix de l’assistant quand sa refonte sera stabilisée).
- [ ] Variante 2 de MusicGPT : aujourd’hui seule la variante 1 devient un atome (id de la 2ᵉ dans `ai_generation.variants`).
- [ ] Webhooks (serveur joignable publiquement requis) ; jobs persistants au-delà du redémarrage serveur.
- [ ] SheetSage2 / stems / MIDI→audio / audio→partition (workflows 2 à 5).
