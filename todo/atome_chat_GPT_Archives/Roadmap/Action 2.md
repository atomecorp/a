# Action 2 — Intégration OpenAI native complète dans Atom — PRIORITÉ URGENTE

## Statut

**Document autonome extrait de `Urgent.md`.** Il constitue la source de vérité de l’Action 2. Les identifiants de modèles/API cités ci-dessous ont été vérifiés contre la documentation OpenAI disponible le 10 septembre 2026, mais Codex doit les revalider au moment de l’implémentation.

**Priorité : URGENTE / prochaine intégration à réaliser dans Atom.**

Objectif : intégrer OpenAI comme un fournisseur IA natif et interchangeable dans Atom/eVe, avec conversation texte fluide, voix temps réel full-duplex, vision, génération/édition d’images, transcription, synthèse vocale, recherche, fichiers, outils agentiques et modèles de raisonnement les plus récents disponibles sur le compte OpenAI, tout en faisant passer **toute action sur Atom par le MCP / Runtime V2 / Tool Gateway canonique**. La priorité modèle par défaut est un **profil Sol léger** ; Astra doit être vérifié et proposé comme option avancée lorsqu’il est réellement accessible.

Cette intégration ne doit créer **aucune deuxième API métier Atom** et ne doit jamais permettre à OpenAI de contourner les permissions, confirmations, sandbox, historique, undo/redo, idempotence ou journalisation d’Atom.

Architecture cible :

```text
Utilisateur
   │
   ├── texte
   ├── voix / micro
   ├── image / caméra / fichier
   └── commandes multimodales
          │
          ▼
┌──────────────────────────────────────┐
│ OpenAI Provider dans Atom           │
│                                      │
│ Responses API                        │
│ Realtime API                         │
│ Audio / transcription / TTS          │
│ Images                               │
│ outils hébergés OpenAI               │
│ modèles courants                     │
└──────────────────┬───────────────────┘
                   │ tool calls / intents
                   ▼
┌──────────────────────────────────────┐
│ OpenAI ↔ Atom MCP Bridge            │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ MCP Atom canonique                   │
│ capability / policy / confirmation   │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ Runtime V2 / Tool Gateway / Command  │
│ Bus / historique / sync              │
└──────────────────┬───────────────────┘
                   │
                   ▼
                 Atom/eVe
```

## 1. Règle fondamentale d’architecture

OpenAI est un **provider d’intelligence**, pas un propriétaire métier.

Une commande telle que :

```text
« crée un texte Bonjour au centre »
```

ne doit jamais devenir :

```text
OpenAI → DOM / état interne / filesystem direct
```

Elle doit toujours devenir :

```text
OpenAI
  → tool call
  → bridge MCP
  → MCP Atom
  → Runtime V2 / Tool Gateway
  → mutation canonique Atom
```

Les mêmes opérations doivent produire le même résultat lorsqu’elles proviennent de l’UI, d’un plugin Atom, d’un client MCP, d’OpenAI texte ou d’OpenAI Realtime.

## 1.1. Audit préalable obligatoire de l’existant — avant toute nouvelle intégration

Avant d’ajouter du code OpenAI, **inspecter ce qu’Atom/eVe possède déjà et décider explicitement quoi conserver, adapter, remplacer ou supprimer**. Cette phase est obligatoire : l’objectif n’est pas d’empiler une seconde pile vocale, une seconde gestion des clés ou une seconde abstraction d’IA.

L’audit doit couvrir au minimum :

- l’assistant conversationnel déjà présent au centre de l’interface ;
- toute implémentation actuelle de voix, synthèse vocale, transcription, détection d’activité vocale et lecture audio ;
- la solution vocale/open-source actuellement intégrée ou expérimentée ;
- le registre/providers IA existant et les autres IA déjà supportées ;
- l’interface existante de saisie/gestion des clés API et son stockage ;
- le chemin actuel OpenAI s’il en existe déjà un ;
- le MCP Atom, Runtime V2, Tool Gateway, AI gateway et Command Bus ;
- les tests, feature flags, dépendances, imports, fichiers de configuration, documentation et maps associés.

Produire avant code une matrice explicite :

```text
composant existant | rôle actuel | qualité | sécurité | réutilisable ? | décision
-------------------|-------------|---------|----------|---------------|---------
...                | ...         | ...     | ...      | garder / adapter / remplacer / supprimer
```

### Règle de migration / suppression

- **Ne rien supprimer avant d’avoir identifié le propriétaire et démontré la parité fonctionnelle du remplacement.**
- Si l’ancien code fait strictement doublon, est moins bon ou crée une deuxième source de vérité : migrer, tester puis le **supprimer complètement**.
- Une suppression complète signifie : code, imports, exports, feature flags, configuration, tests devenus obsolètes, documentation divergente, assets morts et routes d’exécution inutilisées.
- Ne pas conserver un ancien chemin « au cas où » si aucun rôle clair ne lui reste.
- Après migration, vérifier par recherche statique qu’aucune référence morte ou route parallèle ne subsiste.

### Cas particulier de la voix / TTS open source existante

La solution actuelle ne doit **pas** être supprimée par principe. Elle doit être challengée.

Si elle apporte une vraie valeur — par exemple fonctionnement local/offline, faible latence, confidentialité, secours lorsque l’API OpenAI est indisponible ou crédits épuisés — elle peut être conservée mais **reclassée proprement** derrière l’abstraction commune, par exemple :

```text
SpeechProvider
├── OpenAIRealtimeProvider
├── OpenAITTSProvider
└── LocalSpeechProvider   ← éventuel moteur open source existant
```

Dans ce cas, il ne doit rester qu’une seule UX et une seule logique métier de conversation ; le provider local est un backend/fallback, pas une seconde application vocale.

Si l’ancien moteur n’apporte aucun avantage mesurable après comparaison qualité/latence/offline/coût/maintenance, le remplacer puis effacer toute trace de l’ancien chemin.

### Providers IA et clés API existants

Atom doit continuer à pouvoir accueillir plusieurs IA. OpenAI n’obtient **aucun chemin spécial câblé en dur** qui casserait les autres providers.

Le système existant de providers et de saisie des clés API doit être audité et réutilisé s’il est sain. Sinon, le faire évoluer vers un propriétaire unique des credentials sans dupliquer l’UI ni le stockage.

Avant le vertical slice OpenAI, vérifier au minimum :

1. sélection du provider OpenAI dans le système existant ;
2. saisie d’une clé OpenAI par le chemin prévu ;
3. stockage/lecture sécurisés selon la plateforme ;
4. probe OpenAI **non destructif** avec cette clé ;
5. erreur claire pour clé absente, invalide, révoquée ou sans droits ;
6. absence totale de clé dans logs, bundles, traces et fichiers projet ;
7. non-régression des autres providers IA ;
8. appel OpenAI → tool call → MCP Atom → Runtime V2 → résultat réel → retour à la conversation.

Cette vérification de l’existant fait partie de l’Action 2 et doit apparaître dans le rapport final de Codex avec preuves et décisions de conservation/suppression.

## 2. API principale : Responses API

Pour les nouvelles fonctions texte/agentiques, utiliser la **Responses API** comme point d’entrée principal. Ne pas bâtir la nouvelle architecture autour de l’ancienne logique Chat Completions sauf nécessité de compatibilité isolée.

Le provider doit prendre en charge :

- streaming des réponses ;
- état conversationnel ;
- Structured Outputs lorsque pertinent ;
- function/tool calling ;
- outils MCP ;
- outils hébergés compatibles avec le modèle choisi ;
- appel asynchrone d’outils lorsque supporté ;
- steering en cours de traitement lorsque supporté ;
- reprise d’une réponse / continuité de raisonnement selon les mécanismes API disponibles ;
- compaction de contexte pour les sessions longues ;
- prompt caching ;
- sélection dynamique du modèle et du niveau de raisonnement ;
- traces et métriques de coût/latence.

Le code doit isoler l’API OpenAI derrière une interface provider stable :

```text
AIProvider
├── createConversation()
├── send()
├── stream()
├── cancel()
├── steer()
├── listModels()
├── getCapabilities()
├── executeToolResult()
└── dispose()
```

Le reste d’Atom ne doit pas dépendre d’identifiants de modèles OpenAI en dur.

## 3. Modèles : priorité à Sol léger, Astra vérifié mais non prioritaire

La priorité produit n’est **pas** de centrer l’intégration sur Astra. La priorité par défaut doit être un **profil Sol léger** pour la conversation quotidienne, l’appel d’outils, la fluidité, la latence et le coût. Astra doit être **vérifié** et pris en charge lorsqu’il est réellement accessible au compte, mais il ne doit pas être le choix par défaut dans Atom.

Important : `Sol léger` est ici un **rôle produit Atom**, pas forcément un identifiant API figé. Si OpenAI expose un identifiant spécifique correspondant à une variante légère de Sol, l’utiliser. Sinon, résoudre `Sol léger` vers le meilleur modèle Sol actuellement disponible dans une configuration légère / faible latence / faible effort compatible avec les capacités du moment.

Politique proposée :

```text
par défaut / conversation fluide / usage quotidien / premières intégrations
    → rôle Atom : sol_light
    → meilleur modèle Sol réellement disponible
    → configuration légère / faible latence / faible reasoning effort lorsque pertinent

raisonnement plus poussé / orchestration / tâches complexes
    → rôle Atom : best_reasoning
    → GPT-6 Astra si réellement accessible
    → sinon meilleur modèle général disponible

équilibre coût / qualité
    → rôle Atom : balanced
    → meilleur modèle équilibré disponible

faible coût / gros volume / tâches simples
    → rôle Atom : fast
    → meilleur modèle rapide disponible

voix temps réel
    → rôle Atom : voice
    → priorité à un profil Sol temps réel si OpenAI en expose un et s’il supporte les outils nécessaires
    → sinon meilleur modèle Realtime compatible tool use réellement disponible
```

Mais **ne pas figer cette liste comme vérité permanente**. Implémenter un `OpenAIModelRegistry` capable de :

- découvrir ou configurer les modèles réellement disponibles ;
- associer chaque modèle à ses capacités connues ;
- distinguer texte, vision, realtime, image, transcription, TTS, embeddings, etc. ;
- exposer des alias Atom stables (`sol_light`, `best_reasoning`, `balanced`, `fast`, `voice`, `image`, etc.) ;
- permettre à l’utilisateur de choisir explicitement un modèle ;
- permettre à l’utilisateur de choisir explicitement le niveau de raisonnement si le modèle le supporte ;
- résoudre un rôle vers un modèle différent selon plateforme, latence, coût, quotas ou disponibilité ;
- conserver un fallback propre lorsqu’un modèle n’est pas accessible ;
- journaliser le modèle réellement utilisé ;
- éviter toute régression lors du remplacement d’un modèle par une nouvelle génération ;
- vérifier explicitement si Astra est disponible et l’exposer seulement si c’est vrai.

Exemple conceptuel :

```js
const MODEL_ROLES = {
  sol_light: ['gpt-5.6-sol'],
  best_reasoning: ['gpt-6-astra', 'gpt-5.6-sol'],
  balanced: ['gpt-5.6-terra', 'gpt-5.6-sol'],
  fast: ['gpt-5.6-luna', 'gpt-5.6-sol'],
  voice: ['sol-realtime-if-available', 'gpt-realtime-2.1', 'gpt-realtime-2'],
  image: ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']
};
```

Les identifiants ci-dessus doivent être **revalidés contre la documentation/API au moment de coder** ; le registre ne doit jamais provoquer un crash si un modèle est indisponible. Si l’API n’expose pas de modèle séparé nommé « Sol léger » ou « Sol temps réel », Atom doit conserver ces **alias UX** et les résoudre proprement vers les meilleurs candidats réels.

## 4. Voix : OpenAI Realtime intégré directement dans Atom

Intégrer la **Realtime API** pour obtenir une vraie conversation vocale fluide, full-duplex et interruptible, et non une succession rigide de requêtes audio.

Cible :

```text
micro utilisateur
   ↓
WebRTC / Realtime
   ↓
modèle vocal OpenAI
   ↔ audio sortant en streaming
   ↔ interruptions / barge-in
   ↔ événements temps réel
   ↔ tool calls
            ↓
          MCP Atom
            ↓
          Runtime V2
```

Exigences :

- priorité à **WebRTC** côté navigateur/Tauri/iOS lorsque approprié ;
- WebSocket côté serveur/sideband quand nécessaire ;
- conservation d’une conversation continue ;
- détection d’activité vocale configurable ;
- barge-in : l’utilisateur peut interrompre immédiatement l’IA ;
- annulation propre de l’audio et de la réponse en cours ;
- tool calling pendant une conversation vocale ;
- retour vocal après exécution d’un outil ;
- support texte + audio dans la même session ;
- état visible dans l’UI : écoute / réflexion / appel outil / réponse / erreur ;
- latence mesurée de bout en bout ;
- aucune clé API OpenAI persistée dans le frontend ou le bundle ;
- reconnexion et reprise contrôlées après perte réseau ;
- suppression propre des pistes média et sessions à la fermeture.

Le modèle vocal doit être choisi via le registre de capacités. La préférence produit est d’utiliser un **profil Sol temps réel** s’il existe réellement et s’il couvre les capacités nécessaires ; à défaut, utiliser le meilleur modèle Realtime compatible tool use réellement disponible. Les docs actuelles exposent la famille **GPT-Realtime-2.x**, dont `gpt-realtime-2.1` comme modèle de raisonnement avec tool use. Ne pas lier Atom à un seul identifiant permanent.

## 5. Transcription et synthèse vocale

En plus du Realtime speech-to-speech, prévoir des services séparés pour les cas où ils sont meilleurs :

```text
OpenAITranscriptionProvider
OpenAITTSProvider
```

Cas d’usage :

- transcription d’un enregistrement ;
- dictée hors session Realtime ;
- sous-titres ;
- indexation de contenus audio ;
- transcription temps réel dédiée ;
- génération d’une voix à partir d’un texte ;
- export audio.

Le registre doit pouvoir utiliser les modèles spécialisés actuels disponibles dans l’API, notamment les familles de transcription Realtime/Transcribe et TTS, sans figer l’architecture sur leurs noms actuels.

## 6. Multimodal : texte, image, fichier, caméra

Le provider doit permettre à une conversation Atom de fournir :

- texte ;
- images ;
- captures d’écran ;
- fichiers ;
- extraits de projet ;
- métadonnées structurées ;
- éventuellement frames caméra lorsque l’API/produit utilisé le permet.

Ne jamais envoyer implicitement l’intégralité d’un projet. Le contexte transmis doit passer par une politique explicite :

```text
ContextPolicy
├── selection_only
├── current_object
├── current_project_summary
├── explicit_files
└── user_approved_extended_context
```

L’utilisateur doit pouvoir savoir ce qui est envoyé au provider externe.

## 7. Image generation / image editing — intégration complète

Ajouter un provider OpenAI image de première classe :

```text
OpenAIImageProvider
├── generate(prompt, options)
├── edit(images, prompt, mask?, options)
├── inspectCapabilities()
├── cancel()
└── importResultToAtom()
```

### Modèles image à viser

À la date de cette spécification, le modèle API OpenAI le plus capable pour **génération ET édition** est **GPT-Image-2.5 Sunburst**. **GPT-Image-2.5 Flare** doit pouvoir être utilisé comme variante plus rapide/économique lorsque disponible. Le provider doit néanmoins rester piloté par un registre de capacités et revalider les modèles disponibles au runtime ou à la configuration : aucun nom de modèle ne doit devenir une dépendance structurelle du framework.

Exemple de rôles :

```js
image: {
  best: 'gpt-image-2.5-sunburst',
  fast: 'gpt-image-2.5-flare'
}
```

### Surfaces API à supporter

Le provider doit couvrir les deux usages OpenAI pertinents :

1. **API Images** pour les opérations directes :
   - `/v1/images/generations` ;
   - `/v1/images/edits` ;
   - une ou plusieurs images d’entrée selon les capacités du modèle ;
   - masque si supporté/utile ;
   - choix de taille, qualité, format et autres options réellement annoncées par l’API.
2. **Responses API + outil image_generation** lorsque l’image est produite dans le contexte d’une conversation/agent et que le modèle sélectionné supporte cet outil.

Le code choisit la surface la plus adaptée au cas d’usage sans dupliquer les règles métier Atom.

### Workflows UX obligatoires

Depuis une conversation Atom, l’utilisateur doit pouvoir demander naturellement :

```text
« crée une image… »
« modifie cette image… »
« enlève cet objet… »
« remplace l’arrière-plan… »
« fais trois variantes… »
« utilise l’image sélectionnée comme référence… »
```

Le contexte image doit pouvoir venir :

- de l’Atome actuellement sélectionné ;
- d’un asset explicite du projet ;
- d’une image importée ;
- d’une capture explicitement autorisée ;
- de plusieurs images lorsque le modèle le supporte.

Résultat canonique :

```text
Conversation / commande
        ↓
OpenAIImageProvider
        ↓
OpenAI image API
        ↓
asset résultat
        ↓
MCP / capability Atom d’import-création
        ↓
Runtime V2
        ↓
Atome image dans le projet
```

Une édition ne doit jamais modifier silencieusement l’original : créer une nouvelle version/asset ou passer par le mécanisme canonique de versionnement/undo d’Atom. Les images produites doivent revenir dans Atom sous forme d’assets/Atomes via la route canonique d’import/création, jamais par écriture arbitraire dans l’état ou le filesystem.

### Critères d’acceptation image

- génération depuis texte ;
- édition à partir d’une image sélectionnée ;
- conservation correcte des références d’assets ;
- annulation ;
- progression/état visible ;
- erreurs et quotas propres ;
- résultat importé dans Atom via MCP/Runtime V2 ;
- undo/versionnement lorsque applicable ;
- aucune clé OpenAI exposée au client ;
- benchmark génération → apparition exploitable dans le projet.

## 8. Outils OpenAI hébergés

Prévoir l’utilisation optionnelle des outils exposés par la Responses API lorsque le modèle les supporte :

- web search ;
- file search ;
- code interpreter ;
- image generation ;
- computer use ;
- hosted shell ;
- apply patch ;
- skills ;
- remote MCP ;
- tool search ;
- autres outils futurs découverts par capacité.

Règle : un outil OpenAI ne remplace pas une capacité Atom existante lorsqu’une opération doit modifier Atom.

Exemple :

```text
OpenAI web_search → information externe : OK
OpenAI file_search → recherche dans corpus autorisé : OK
OpenAI computer_use → machine explicitement autorisée : politique spécifique
OpenAI apply_patch → dépôt explicitement autorisé : politique spécifique
OpenAI → modifier un Atome directement : INTERDIT
                         ↓
                    MCP Atom obligatoire
```

## 9. MCP comme bus de contrôle unique d’Atom

Tous les outils Atom exposés à OpenAI doivent être obtenus à partir du registre MCP/runtime existant ou d’une projection sémantique de celui-ci.

Prévoir :

```text
OpenAIToolAdapter
├── listAtomTools()
├── mapMcpSchemaToOpenAI()
├── executeAtomTool()
├── streamProgress()
├── cancelOperation()
└── returnToolResult()
```

L’adaptateur doit :

- convertir les schemas sans dupliquer leur source de vérité ;
- transmettre `actor`, `trace_id`, `intent_id`, `idempotency_key` ;
- respecter `dry_run` ;
- respecter les confirmations ;
- conserver les identifiants d’opérations ;
- rapporter les erreurs structurées ;
- empêcher les boucles de tool calls incontrôlées ;
- appliquer budgets de temps et de coût ;
- supporter toolchains/batch lorsque cela réduit la latence ;
- permettre les opérations différées.

## 10. Conversation et état

Créer une abstraction de session :

```text
AIConversationSession
├── id
├── provider
├── model
├── modalities
├── conversation_state
├── previous_response_id / équivalent
├── selected Atom context
├── pending tool calls
├── operation ids
├── usage
└── trace
```

La conversation doit survivre aux transitions UI prévues par eVe sans devenir propriétaire de l’état métier Atom.

Prévoir :

- nouvelle conversation ;
- reprise ;
- fork ;
- changement de modèle ;
- passage texte ↔ voix ;
- interruption ;
- steering en cours de réponse si supporté ;
- changement du niveau de raisonnement si supporté ;
- compaction des longues sessions ;
- export/import contrôlé d’une conversation si demandé.

## 11. UI eVe — Atome Conversation OpenAI, sans réinventer l’UX Atom

Ne pas créer une interface lourde ou étrangère à eVe. Il ne s’agit **pas** de créer un nouveau système UX : l’intégration doit utiliser les surfaces, menus, géométries, interactions et règles déjà définis dans Atom/eVe.

Créer ou compléter une **surface conversationnelle native** (Atome/molécule de conversation selon les primitives existantes) permettant de converser avec OpenAI tout en restant dans le projet. Cette surface doit être compatible texte et voix et pouvoir être réduite/restaurée sans perdre la session.

### Contrôles requis

L’interface doit permettre, sans multiplier les commandes visibles :

- choisir le **provider** lorsque plusieurs providers IA existent ;
- choisir le **modèle** OpenAI parmi ceux réellement disponibles ;
- choisir le **niveau de raisonnement** uniquement parmi les valeurs supportées par le modèle sélectionné ;
- choisir le mode **texte / voix / multimodal** ;
- voir l’état minimal : écoute, réponse, raisonnement, outil/MCP en cours, génération d’image, erreur ;
- interrompre immédiatement une réponse vocale ou textuelle ;
- reprendre une conversation ;
- changer de modèle en cours de conversation lorsque l’API le permet sans casser l’état ;
- voir/valider les demandes de confirmation MCP sensibles.

Pour **GPT-6 Astra**, l’API actuelle expose `reasoning.effort` avec :

```text
low
medium
high
xhigh
max
```

La liste affichée ne doit cependant jamais être codée comme une constante universelle : elle vient des capabilities du modèle. Un autre modèle peut proposer un ensemble différent. Si la fonctionnalité API permet un changement de reasoning effort en cours de conversation, Atom doit l’exposer sans reconstruire inutilement le contexte.

### Sélection de modèle

Le sélecteur doit afficher des rôles compréhensibles et, en second niveau, le modèle exact :

```text
Sol léger      → meilleur profil Sol léger disponible
Raisonnement    → GPT-6 Astra si disponible, sinon meilleur modèle profond
Équilibré       → modèle équilibré disponible
Rapide          → modèle rapide disponible
Voix            → profil Sol temps réel si disponible, sinon meilleur modèle Realtime compatible tool use
Image qualité   → GPT-Image-2.5 Sunburst
Image rapide    → GPT-Image-2.5 Flare
```

Les associations sont résolues par le registre dynamique et peuvent évoluer sans réécrire l’UI.

### Conversation vocale fluide

La surface doit refléter une conversation réellement full-duplex :

- l’utilisateur peut parler pendant la réponse ;
- barge-in immédiat ;
- arrêt de l’audio de sortie quand l’utilisateur interrompt ;
- conservation du contexte ;
- tool call vers MCP pendant la conversation ;
- retour du résultat MCP au modèle ;
- poursuite vocale naturelle après le résultat ;
- possibilité de passer de voix à texte et inversement dans la même conversation lorsque l’API le supporte.

### Règles UI Atom à conserver

- surfaces carrées et ratios prévus par le framework ;
- menus existants ;
- aucun popup/palette flottante arbitraire ;
- comportement cohérent mobile/tablette/desktop ;
- priorité aux interactions tactiles/pouce selon les règles eVe ;
- conversation réductible sans perte de contexte ;
- accès au projet pendant la conversation ;
- aucune duplication d’un système global de menus ou d’inspection.

### Assistant central — sélection du modèle et représentation organique du niveau

Le visuel actuel de l’assistant central est une **cellule douce et translucide avec un noyau interne**. Cette identité doit être conservée et affinée : humaine, organique, calme, légèrement féminine mais non sexualisée, sérieuse, très épurée, sans esthétique techno froide, sans surcharge décorative et sans effet « flashy/kitsch ».

**Une image de référence finale sera fournie par l’utilisateur en annexe de cette Action 2.** Codex doit utiliser cette image comme direction visuelle et ne pas finaliser un autre langage graphique contradictoire. Si l’annexe n’est pas encore disponible au moment du premier vertical slice, implémenter la structure/animation paramétrable mais attendre la référence avant validation graphique finale.

#### Interaction de sélection

- un appui maintenu / press-and-hold sur l’assistant entre dans le mode de sélection du modèle ;
- maximum **5 niveaux/modèles visibles** dans cette interaction ;
- le passage d’un niveau au suivant doit être un **morphing continu et doux**, jamais un saut sec ;
- le niveau sélectionné est résolu vers le `OpenAIModelRegistry` et ses capabilities ;
- le geste exact de passage entre niveaux **n’est pas encore figé** : le long press est l’entrée certaine de l’interaction, mais le mécanisme de cycle/sélection (glissement, déplacement, relâchement, cycle discret, etc.) doit être prototypé puis validé par l’utilisateur avant d’être verrouillé ;
- **ne pas inventer ni hard-coder ce geste arbitrairement** dans le premier vertical slice : séparer la logique `selectedModelLevel` du geste d’entrée afin de pouvoir changer l’interaction sans toucher au registre de modèles ni au provider ;
- le prototype doit permettre de comparer au moins 2 variantes de sélection, mesurer erreurs/temps de sélection et vérifier la compatibilité souris/tactile/stylet ;
- l’interaction doit rester utilisable souris, tactile et stylet sans créer un menu flottant lourd.

#### Structure visuelle : membrane intacte, noyau divisé en pétales

La membrane / cellule externe reste **une forme unique et stable**. Elle ne porte pas les graduations de niveau.

C’est le **noyau interne** qui encode le niveau de manière immédiatement lisible et comptable :

```text
niveau 1 → 1 noyau/lobe organique entier
niveau 2 → noyau divisé en 2 pétales nets
niveau 3 → noyau divisé en 3 pétales nets
niveau 4 → noyau divisé en 4 pétales nets
niveau 5 → noyau divisé en 5 pétales nets
```

Règles :

- le niveau 1 est **un noyau entier**, puis le noyau **se divise** ; il ne se remplit pas progressivement depuis le vide ;
- les séparations sont des divisions propres et organiques, pas des cicatrices, encoches, satellites ou pictogrammes ajoutés ;
- la géométrie générale du noyau peut être légèrement aplatie horizontalement / organique, évocatrice d’une présence ou d’un regard **sans dessiner un œil ou une pupille littérale** ;
- le noyau doit rester relativement petit dans la cellule ; même au niveau 5 il ne doit pas envahir toute la surface par sa masse ;
- sa taille totale peut croître légèrement avec le niveau, mais **le comptage des pétales reste l’indicateur fixe principal**.

#### Luminosité : second indicateur obligatoire et très marqué

Le niveau de puissance/intelligence perçu doit également être exprimé par une montée **très nette** de luminosité :

```text
niveau 1 → noyau petit, lumière faible et contenue
niveau 2 → lumière légèrement plus présente
niveau 3 → lumière médiane, diffusion visible
niveau 4 → noyau très lumineux, membrane fortement éclairée
niveau 5 → lumière maximale, rayonnement qui envahit visuellement presque toute la cellule
```

La différence entre niveau 1 et niveau 5 doit être évidente au premier coup d’œil, y compris sur une image fixe. Le niveau 5 ne doit pas seulement avoir un centre un peu plus clair : **la lumière du noyau doit diffuser dans l’ensemble de la cellule**, tout en conservant la douceur pastel/organique du design.

#### Pulsation : troisième indicateur, temporel mais calme

Le pulse encode lui aussi le niveau par un motif simple : **N pulses pour le niveau N**.

```text
niveau 1 : pulse — pause longue — pulse — pause longue…
niveau 2 : pulse pulse — pause longue — pulse pulse — pause longue…
niveau 3 : pulse pulse pulse — pause longue…
niveau 4 : pulse pulse pulse pulse — pause longue…
niveau 5 : pulse pulse pulse pulse pulse — pause longue…
```

Contraintes temporelles non négociables :

- la **durée d’un pulse reste la même** quel que soit le niveau ;
- l’intervalle entre deux pulses d’une même salve reste le même ;
- **aucune accélération** lorsque le nombre de pulses augmente ;
- la pause entre deux salves est toujours nettement **plus longue** que l’intervalle entre deux pulses ;
- en conséquence, une salve de 4 pulses prend naturellement environ deux fois plus de temps qu’une salve de 2 pulses, à cadence identique ;
- les montées/descentes de lumière sont douces, sans clignotement sec ni effet stroboscopique ;
- la luminosité de base et le pic du pulse augmentent également avec le niveau ;
- l’animation doit rester calme et non stressante.

Le système doit rester compréhensible **sans animation** : en mode réduction des mouvements/accessibilité, le nombre de pétales + la luminosité statique suffisent à identifier le niveau.

#### Hiérarchie des indicateurs

```text
1. pétales du noyau  → niveau exact, fixe, comptable instantanément
2. luminosité        → sensation immédiate de puissance croissante
3. pulses            → confirmation vivante et organique du niveau
```

Aucun quatrième langage graphique ne doit être ajouté sans nécessité démontrée. La simplicité est une contrainte : pas d’anneaux de niveau, pas de chiffres permanents, pas de satellites décoratifs, pas de marques arbitraires.

## 12. Authentification et secrets

Ne jamais mettre une clé API OpenAI longue durée dans :

- JavaScript livré au navigateur ;
- bundle iOS/Tauri ;
- IndexedDB non protégée ;
- fichiers de projet ;
- logs ;
- Git.

Créer un propriétaire unique des credentials côté backend/provider sécurisé.

Pour Realtime côté client, utiliser les mécanismes recommandés par OpenAI pour établir la session sans exposer le secret principal, avec serveur/sideband quand nécessaire.

Prévoir :

```text
OpenAIAuthBroker
├── credentials source
├── ephemeral/session credentials
├── revoke/rotate
├── scope
└── audit
```

## 13. Sécurité et confirmation Atom

La sécurité OpenAI ne remplace jamais la sécurité Atom.

Pour toute action :

```text
OpenAI tool call
   ↓
MCP Atom
   ↓
resolveAccessPolicy()
   ↓
capabilities
   ↓
sandbox
   ↓
rate limit
   ↓
confirmation si requise
   ↓
Runtime V2
```

La classification de risque doit être déclarative par outil/capability et ne doit pas reposer uniquement sur le nom de l’outil.

Les actions destructrices, communications externes, accès sensibles, shell/computer use et filesystem doivent disposer de politiques explicites.

## 14. Providers modulaires

Créer une frontière générique permettant d’ajouter ultérieurement Claude, Gemini, IA locale ou autre sans réécrire Atom :

```text
AIProvider
   ↑
   ├── OpenAIProvider
   ├── LocalProvider
   └── FutureProvider
```

OpenAI peut offrir davantage de fonctions, mais aucune classe métier Atom ne doit importer directement le SDK OpenAI.

Un seul module d’intégration OpenAI peut dépendre du SDK/protocole OpenAI.

## 15. Services OpenAI à couvrir

La première version doit inventorier et classer les APIs OpenAI actuellement disponibles et décider explicitement : intégrée maintenant / prévue / non pertinente.

Inventaire minimum à évaluer :

```text
Responses
Chat Completions (compatibilité seulement)
Realtime
Realtime transcription
Realtime translation
Audio speech
Audio transcription
Audio translation
Images generation/edit
Videos si disponible et pertinent
Embeddings
Moderation
Files
Uploads
Vector stores / file search
Batch
Fine-tuning si pertinent
Web search
File search
Code interpreter
Computer use
Hosted shell
Apply patch
Skills
Remote MCP
Tool search
Agents SDK / orchestration
```

Ne pas intégrer un endpoint uniquement parce qu’il existe. Chaque service doit correspondre à une capability Atom et avoir un propriétaire clair.

## 16. Embeddings / recherche sémantique

Prévoir un provider embeddings indépendant pour :

- indexation facultative de documents ;
- recherche sémantique ;
- mémoire projet opt-in ;
- déduplication/rapprochement si pertinent.

Mais respecter le principe local-first : si une indexation locale existe, elle reste possible. L’envoi de contenu à OpenAI doit être explicite et gouverné par la politique de données.

## 17. Agents et orchestration

Utiliser la Responses API et éventuellement l’Agents SDK uniquement comme orchestration de l’intelligence, sans déplacer le propriétaire de l’action Atom hors du MCP.

Prévoir :

- single-agent par défaut ;
- multi-agent uniquement lorsque la tâche le justifie ;
- handoffs éventuels ;
- tracing ;
- budgets ;
- limite de profondeur ;
- limite du nombre d’appels outils ;
- annulation globale ;
- reprise d’une opération ;
- progression visible.

Astra supportant les workflows longs et l’appel d’outils avancé, son intégration doit pouvoir exploiter les mécanismes actuels sans rendre Atom dépendant de lui.

## 18. Performance

Benchmarks obligatoires avant validation.

Mesurer au minimum :

```text
texte : saisie → premier token
voix : fin de parole → début audio réponse
barge-in : parole utilisateur → arrêt audio IA
MCP : tool call → début Runtime
outil court : intention → résultat UI
outil long : intention → operation_id
reconnexion Realtime
changement texte ↔ voix
coût tokens / minute / action
mémoire et CPU au repos
mémoire et CPU pendant streaming audio
```

Les budgets chiffrés doivent être fixés avant la campagne de validation et mesurés sur desktop + iOS + navigateur selon disponibilité.

Aucune nouvelle couche OpenAI ne doit ajouter une latence évitable au Runtime V2.

## 19. Offline / panne / fallback

Atom doit rester utilisable lorsque OpenAI est indisponible.

Prévoir :

```text
OpenAI offline
   → UI Atom continue
   → MCP local continue
   → fonctions locales continuent
   → conversation OpenAI indique indisponibilité
   → retry explicite / backoff
```

Ne jamais bloquer l’ouverture d’un projet ou une fonctionnalité locale essentielle sur une connexion OpenAI.

## 20. Logs, traces et coût

Ajouter des métriques structurées sans journaliser de secrets :

```text
provider
model
request/response id
conversation id
trace id
intent id
latency first token
total latency
tool calls
operation ids
input/output usage
estimated cost
error class
retry count
```

Un panneau Monitoring pourra exploiter ces métriques plus tard, mais la collecte doit être disponible dès l’intégration.

## 20.1. Crédits, budget, quotas et avertissement avant interruption

L’intégration ne doit jamais attendre qu’une conversation échoue brutalement pour informer l’utilisateur d’un problème de crédit ou de quota.

Créer un composant/provider de statut distinct, par exemple :

```text
OpenAIUsageStatus
├── billing/credit state si accessible
├── usage/spend state
├── project/org limits
├── rate-limit state
├── local rolling estimate
├── thresholds
└── alerts
```

### Ne pas confondre les causes

Le système doit distinguer au minimum :

- crédits prépayés épuisés (`credit_balance_exhausted` lorsque renvoyé) ;
- limite d’utilisation d’organisation ;
- limite de dépenses d’organisation ;
- limite de dépenses de projet ;
- rate limit temporaire ;
- clé invalide/révoquée ;
- panne réseau/service.

Une erreur `429` ou `insufficient_quota` ne doit jamais être traduite automatiquement par « plus de crédit » sans lire le code/détail réel de l’erreur.

### Jauge avant panne

L’UI de conversation/assistant doit offrir une **jauge discrète mais disponible du budget/crédit OpenAI**. Elle est distincte du niveau de modèle (pétales/lumière/pulses) pour ne pas mélanger deux informations différentes.

- afficher un solde exact uniquement si l’API/compte/permissions OpenAI permettent réellement de le récupérer ;
- si le solde exact n’est pas disponible de façon fiable, afficher explicitement **estimé** ou **inconnu**, jamais un faux chiffre précis ;
- dans ce cas, calculer une estimation locale à partir de l’usage/coût observé et du budget configuré ;
- permettre des seuils d’alerte configurables ;
- prévoir au minimum états normal / faible / critique / épuisé ;
- lorsqu’un seuil faible ou critique est franchi, prévenir **avant** le blocage de l’API ;
- la jauge ne doit pas dépendre d’un rafraîchissement permanent coûteux : adapter le polling/refresh à ce que l’API permet réellement.

Exemples de formulations possibles :

```text
« Crédit OpenAI faible. »
« Crédit OpenAI presque épuisé. »
« Crédit OpenAI épuisé. »
```

Si une estimation sérieuse des requêtes/minutes restantes est calculable, elle peut être annoncée comme estimation (`≈ 5 minutes`, `≈ N interactions`) mais ne doit jamais être présentée comme certitude.

### Avertissement vocal

En mode vocal :

- annoncer une alerte lorsque le crédit passe sous le seuil critique ;
- si une nouvelle conversation commence alors que le crédit est critique, l’annoncer dès le début ;
- si le crédit est épuisé, annoncer immédiatement que le service OpenAI ne peut plus continuer ;
- ne pas boucler/retry indéfiniment sur une erreur de facturation ;
- proposer proprement le fallback local/autre provider si disponible.

**Point essentiel : le message « crédit épuisé » ne doit pas dépendre d’un nouvel appel TTS OpenAI**, puisque cet appel peut lui-même être refusé. Utiliser pour cette alerte un mécanisme local garanti : moteur TTS local/open-source conservé, synthèse système, ou ressource vocale locale prévue à cet effet.

### Prévision et protection

Le solde prépayé pouvant être mis à jour avec un léger délai côté fournisseur, ne pas l’utiliser comme unique coupe-circuit instantané. Maintenir aussi :

- comptage local des coûts/usage de la session ;
- budget de session/projet configurable ;
- estimation du coût avant une opération lourde lorsque possible (image, longue génération, etc.) ;
- blocage préventif local si un budget Atom explicite serait dépassé ;
- aucun achat/rechargement automatique déclenché par Atom sans action/autorisation explicite de l’utilisateur.

## 21. Tests obligatoires

Le cahier des charges doit imposer une **campagne de tests profonde**, pas une simple vérification superficielle. Les tests doivent couvrir texte, voix, outils MCP, sécurité, modèles, multimodal, images, import dans Atom, versionnement, UX et performances.

Prévoir au minimum les familles de tests suivantes, avec automatisation quand c’est réaliste et scénarios manuels instrumentés quand l’automatisation complète n’est pas possible.

### 21.1 Texte / conversation / modèles

1. conversation texte simple ;
2. streaming ;
3. annulation ;
4. reprise de conversation ;
5. changement de modèle ;
6. changement de reasoning effort ;
7. `sol_light` sélectionné par défaut ;
8. résolution de `sol_light` vers un modèle réel disponible ;
9. Astra disponible → exposition correcte dans l’UI ;
10. Astra indisponible → absence propre ou fallback propre sans erreur ;
11. modèle indisponible → fallback ;
12. cohérence du registre de modèles/capabilities ;
13. journalisation du modèle réellement utilisé ;
14. budget coût/latence par rôle de modèle.

### 21.2 MCP / outils / Runtime V2

15. tool call MCP lecture seule ;
16. tool call MCP mutation ;
17. action nécessitant confirmation ;
18. refus d’une action sans capability ;
19. idempotence ;
20. toolchain ;
21. opération différée ;
22. progression d’opération ;
23. annulation d’opération ;
24. cohérence même action UI vs MCP vs OpenAI ;
25. undo/redo après mutation déclenchée par OpenAI ;
26. absence de route de mutation parallèle ;
27. actor/trace_id/intent_id/idempotency_key bien transmis ;
28. `dry_run` respecté ;
29. erreur MCP structurée et visible côté conversation.

### 21.3 Voix / Realtime

30. voice connect ;
31. conversation vocale full-duplex ;
32. interruption/barge-in ;
33. fin de parole → début audio réponse ;
34. parole utilisateur pendant réponse → arrêt audio IA ;
35. reconnexion ;
36. fermeture session → ressources libérées ;
37. tool call pendant voix ;
38. résultat tool → réponse vocale ;
39. passage voix → texte ;
40. passage texte → voix ;
41. conservation du contexte pendant ces bascules ;
42. VAD configurable ;
43. état UI écoute/réponse/outil/erreur correct ;
44. choix du rôle `voice` et résolution vers le bon modèle réel ;
45. profil Sol temps réel si disponible, sinon fallback Realtime correct.

### 21.4 Images — génération, édition, import Atom

46. génération d’image depuis texte ;
47. génération de plusieurs variantes ;
48. édition d’une image sélectionnée ;
49. suppression d’un élément dans une image ;
50. remplacement d’arrière-plan ;
51. agrandissement / extension d’image (outpaint ou mécanisme équivalent supporté) ;
52. import du résultat dans Atom via MCP/Runtime V2 ;
53. annulation d’une génération d’image ;
54. progression/état visible pendant génération ;
55. erreurs et quotas propres ;
56. versionnement/undo après édition d’image ;
57. conservation correcte des références d’assets.

### 21.5 Images — entrées provenant d’Atom

58. génération d’image à partir d’un **carré** créé dans Atom ;
59. génération d’image à partir d’un **cercle** créé dans Atom ;
60. génération d’image à partir de plusieurs formes Atom (carrés, cercles, composition simple) ;
61. génération d’image à partir d’un **dessin libre / graffiti** créé dans Atom ;
62. génération d’image à partir d’une **capture d’une zone du projet** explicitement autorisée ;
63. édition d’une image en utilisant comme référence un Atome image existant ;
64. refus propre lorsqu’un Atome/asset non autorisé est demandé comme entrée ;
65. résolution correcte du contexte visuel envoyé au provider ;
66. résultat revenu comme asset/Atome canonique et non comme mutation sauvage.

### 21.6 Multimodal / fichiers / transcription / TTS

67. image en entrée dans la conversation ;
68. fichier explicitement autorisé ;
69. fichier non autorisé refusé ;
70. transcription d’un fichier audio ;
71. transcription temps réel dédiée ;
72. synthèse vocale depuis texte ;
73. export audio ;
74. combinaison texte + image + outil dans une même session.

### 21.7 Sécurité / données / secrets

75. secret absent du client ;
76. logs sans secret ;
77. offline ;
78. limites d’appels outils ;
79. quotas modèles ;
80. contexte `selection_only` ;
81. contexte `current_object` ;
82. contexte `explicit_files` ;
83. refus d’envoi implicite du projet complet ;
84. journal d’audit des opérations sensibles ;
85. confirmation visible dans la conversation pour une action sensible.

### 21.8 UX / stabilité / régressions

86. sélecteur provider/modèle/reasoning utilisable ;
87. réduction/restauration de la conversation sans perte de session ;
88. interaction continue avec le projet pendant la conversation ;
89. cohérence mobile/tablette/desktop ;
90. absence de popup parasite ;
91. surface conversationnelle compatible avec les règles eVe ;
92. absence de régression sur les outils et menus existants ;
93. résilience à une panne réseau ;
94. résilience à une panne OpenAI.

Chaque famille de tests doit définir : scénario, source du contexte, étapes, résultat attendu, logs attendus, critères d’échec, niveau d’automatisation, appareils/cibles testés et budgets de performance associés.


### 21.9 Audit/migration de l’existant et multi-provider

95. inventaire réel de la pile voix/TTS existante ;
96. comparaison ancien moteur vocal vs OpenAI sur qualité/latence/offline/coût ;
97. conservation du moteur local uniquement si son rôle de fallback est démontré ;
98. si remplacement : aucune référence morte/import/flag/route/doc de l’ancien chemin ;
99. provider OpenAI sélectionnable dans le système IA existant ;
100. clé OpenAI valide → probe non destructif réussi ;
101. clé absente/invalide/révoquée → diagnostic correct ;
102. clé jamais présente dans logs/bundle/fichier projet ;
103. autres providers IA toujours fonctionnels après intégration ;
104. test bout en bout clé OpenAI → réponse → tool call → MCP → Runtime V2 → résultat → conversation.

### 21.10 Assistant central / niveaux de modèle

105. long press entre bien dans la sélection modèle ;
106. maximum 5 niveaux ;
107. niveau 1 = 1 lobe/pétale, niveau 2 = 2, … niveau 5 = 5 ;
108. membrane externe non segmentée ;
109. morphing entre niveaux fluide sans saut ;
110. différence de luminosité niveau 1 ↔ niveau 5 objectivement visible en visual-regression ;
111. niveau 5 diffuse la lumière dans presque toute la cellule ;
112. niveau 1 garde un noyau petit et nettement moins lumineux ;
113. niveau N = exactement N pulses par salve ;
114. durée d’un pulse identique aux 5 niveaux ;
115. intervalle intra-salve identique aux 5 niveaux ;
116. pause inter-salves supérieure à l’intervalle intra-salve ;
117. aucune accélération de cadence quand N augmente ;
118. mode réduction des mouvements : niveau encore identifiable par pétales + luminosité ;
119. mapping niveau visuel ↔ rôle/modèle réel exact ;
120. changements de modèle n’interrompent pas inutilement la session.

### 21.11 Crédits / quotas / alertes

121. jauge normale ;
122. seuil faible ;
123. seuil critique ;
124. crédit épuisé (`credit_balance_exhausted`) ;
125. spend limit projet ≠ crédit épuisé ;
126. spend limit organisation ≠ crédit épuisé ;
127. usage limit organisation ≠ crédit épuisé ;
128. rate limit temporaire ≠ crédit épuisé ;
129. estimation clairement étiquetée si solde exact indisponible ;
130. alerte avant épuisement ;
131. alerte dès l’ouverture d’une session vocale si état critique ;
132. à zéro : arrêt des retries inutiles ;
133. à zéro : message vocal produit sans dépendre d’OpenAI TTS ;
134. fallback local/autre provider proposé/activé selon politique ;
135. budget local de session/projet respecté ;
136. aucun rechargement/achat automatique sans consentement explicite.

### 21.12 Stratégie d’exécution des tests et budget API

Les **136 scénarios** ci-dessus sont des scénarios logiques de validation. Ils ne doivent **pas** être traduits en 136 appels OpenAI réels. La suite doit être factorisée et organisée en niveaux afin de garder les coûts, la latence et la reproductibilité sous contrôle.

Profils obligatoires :

```text
OPENAI_LIVE_TESTS=0      → défaut CI : unitaires, contrats, mocks, fixtures, visual tests ; aucun appel OpenAI payant
OPENAI_LIVE_TESTS=smoke  → petit sous-ensemble réel : auth, texte, tool-call MCP, Realtime court, image minimale
OPENAI_LIVE_TESTS=full   → validation release/manuelle seulement, avec budget explicite
```

Règles :

- **CI ordinaire = `OPENAI_LIVE_TESTS=0`** ; aucun test payant ne doit partir implicitement ;
- mutualiser les fixtures, transports mockés, réponses enregistrées et assets de référence ;
- réutiliser les mêmes fixtures carrés/cercles/graffiti pour plusieurs tests image ;
- ne pas régénérer une image lorsqu’un test ne vérifie que l’import, l’undo, le mapping MCP ou l’UI ;
- réserver les générations/éditions réelles aux smoke/release tests ;
- ne jamais tester « crédit épuisé » en consommant réellement le crédit : injecter/simuler l’état fournisseur ;
- Astra ne nécessite qu’un smoke test court de disponibilité/capabilities/tool-call lorsqu’il est accessible ; ne pas dupliquer toute la suite sur Astra ;
- produire à la fin de chaque campagne live un rapport : nombre de requêtes, tokens input/output, minutes Realtime, opérations image, coût estimé/réel si disponible, erreurs et retries.

Budgets initiaux à **challenger après la première campagne mesurée** :

```text
smoke réel :          ≈ 10–20 appels API réels maximum
texte smoke :         objectif <= 20 000 tokens input+output
release texte live :  cible 20 000–60 000 tokens ; plafond initial 150 000 sans override explicite
Realtime live :       ≈ 3–8 minutes cumulées pour la campagne complète
image live release :  ≈ 8–15 générations/éditions réelles maximum
```

Ces valeurs sont des budgets de départ, pas des vérités universelles. Après mesure, Codex doit les ajuster selon les coûts réels, la stabilité des tests et la couverture obtenue. Toute hausse importante doit être explicite et justifiée.

## 22. Critères d’acceptation

La tâche 2 est terminée seulement si :

- Atom peut tenir une conversation texte OpenAI en streaming ;
- Atom peut tenir une conversation vocale Realtime réellement fluide, full-duplex et interruptible ;
- la conversation peut déclencher des outils MCP, recevoir leur résultat et continuer naturellement en voix ou texte ;
- une surface conversationnelle Atom permet de sélectionner provider, modèle et niveau de raisonnement selon les capabilities ;
- le rôle par défaut de conversation est **`sol_light`** et il se résout proprement vers un modèle Sol réellement disponible ;
- Astra n’est pas imposé comme défaut mais il est détecté, vérifié et proposé lorsqu’il est réellement accessible ;
- le rôle `voice` privilégie un profil Sol temps réel s’il existe, sinon le meilleur modèle Realtime compatible tool use ;
- génération ET édition d’images fonctionnent depuis la conversation et depuis un asset sélectionné ;
- génération d’image à partir d’éléments Atom simples fonctionne, notamment au moins : carré, cercle et dessin libre/graffiti ;
- l’agrandissement / extension d’image fonctionne lorsque le modèle/surface le permet, ou est explicitement documenté comme non disponible si l’API réelle ne le permet pas ;
- GPT-Image-2.5 Sunburst est pris en charge comme modèle image qualité lorsque disponible, avec fallback par capabilities ;
- les modèles sont abstraits derrière un registre/capabilities ;
- OpenAI peut appeler les outils Atom ;
- ces appels passent réellement par MCP ;
- les mutations arrivent réellement au Runtime V2 canonique ;
- confirmations/capabilities/sandbox restent effectives ;
- les mêmes actions restent undoable lorsque leur type le permet ;
- le frontend ne contient aucun secret OpenAI longue durée ;
- la panne OpenAI ne casse pas Atom ;
- les benchmarks et tests critiques passent ;
- la documentation et les maps d’architecture/API sont mises à jour ;
- aucun chemin parallèle de mutation n’a été introduit.
- l’audit de la voix/TTS/providers/clés existants a été réalisé et documenté avant migration ;
- tout ancien code remplacé a été réellement supprimé sans laisser de seconde route morte/parallèle ;
- tout moteur vocal local conservé possède un rôle explicite (offline/fallback/alerte) derrière l’abstraction commune ;
- les autres providers IA et leur gestion de clés continuent à fonctionner ;
- l’assistant central permet une sélection fluide de 1 à 5 niveaux via long press ;
- les niveaux sont lisibles instantanément par 1 à 5 pétales du noyau ;
- la luminosité est nettement croissante et le niveau 5 éclaire presque toute la cellule ;
- les pulses codent exactement le niveau sans accélérer la cadence ;
- le mécanisme exact de cycle/sélection des niveaux a été prototypé et validé utilisateur avant verrouillage UX ;
- la suite de 136 scénarios est factorisée en unit/mock, smoke live et full live ; la CI ordinaire ne consomme aucun crédit OpenAI ;
- les campagnes live produisent un rapport de consommation et respectent le budget configuré ;
- la jauge crédit/budget et les avertissements avant épuisement sont opérationnels ;
- à épuisement, l’utilisateur reçoit un message clair, y compris vocalement sans dépendre d’un nouvel appel OpenAI ;

## 23. Ordre d’implémentation recommandé

### Phase A — Audit / migration de l’existant

- relire `.codex/AGENTS.md` et ses imports/règles ;
- inventorier les providers IA déjà présents ;
- inventorier le système existant de clés API/credentials ;
- inventorier tout le code voix/TTS/transcription existant, y compris solution open-source ;
- inventorier l’assistant central et ses propriétaires UI ;
- inventorier MCP, Runtime V2, AI gateway et interfaces conversationnelles existantes ;
- établir la matrice garder / adapter / remplacer / supprimer ;
- exécuter les tests/baselines avant modification ;
- relever les sources de vérité ;
- vérifier les SDK OpenAI déjà installés ;
- vérifier les versions et docs OpenAI du jour ;
- tester la clé OpenAI par un probe non destructif via le système de provider existant ;
- écrire le plan de changements et le plan de suppression des chemins obsolètes avant code.

### Phase B — Provider texte

- `OpenAIProvider` ;
- Responses API ;
- streaming ;
- registry modèles/capabilities avec rôle par défaut `sol_light` ;
- conversations ;
- annulation ;
- usage/cost/trace.

### Phase C — MCP tools

- projection MCP → tools OpenAI ;
- appel ;
- résultat ;
- erreurs ;
- progression ;
- confirmations ;
- toolchains ;
- opérations longues.

### Phase D — Voice

- Realtime ;
- WebRTC ;
- priorité au rôle `voice` avec préférence Sol temps réel si disponible ;
- sideband si nécessaire ;
- VAD ;
- interruption ;
- appels MCP ;
- reconnexion ;
- cleanup.

### Phase E — Multimodal et image

- image input ;
- fichiers ;
- `OpenAIImageProvider` ;
- GPT-Image-2.5 Sunburst / Flare via capabilities ;
- `/v1/images/generations` ;
- `/v1/images/edits` ;
- outil `image_generation` de la Responses API lorsque pertinent ;
- sélection d’un Atome image comme entrée ;
- import canonique du résultat via MCP/Runtime V2 ;
- versionnement/undo ;
- transcription ;
- TTS ;
- autres endpoints réellement utiles.

### Phase F — UX Conversation OpenAI / assistant central

- intégrer la conversation dans les primitives eVe existantes ;
- sélecteur provider/modèle ;
- sélecteur de reasoning effort piloté par capabilities ;
- états voix/texte/tool/image ;
- sélecteur par défaut orienté `sol_light` ;
- long press sur l’assistant central pour entrer dans la sélection jusqu’à 5 niveaux ;
- prototyper et faire valider le geste exact de cycle/sélection avant verrouillage ;
- garder `selectedModelLevel` indépendant du geste pour permettre de changer l’interaction ;
- noyau divisé en 1 à 5 pétales selon le niveau ;
- luminosité fortement croissante jusqu’à diffusion quasi complète niveau 5 ;
- salves de 1 à 5 pulses à cadence constante + pause longue ;
- utiliser l’image de référence fournie en annexe avant validation graphique finale ;
- jauge crédit/budget distincte du niveau de modèle ;
- alertes faible/critique/épuisé, y compris vocales avec fallback local ;
- barge-in et interruption ;
- confirmations MCP ;
- réduction/restauration sans perte de session ;
- cohérence mobile/tablette/desktop.

### Phase G — Hardening

- auth/secrets ;
- quotas ;
- sécurité ;
- tests ;
- benchmarks ;
- documentation ;
- maps ;
- régressions.

---

# Prompt Codex — Action 2 : intégrer complètement OpenAI dans Atom

Copier ce prompt dans Codex pour lancer l’implémentation. Codex doit d’abord auditer et proposer un plan court, puis modifier le dépôt et exécuter les tests. Il ne doit pas réinventer une architecture parallèle.

```text
Tu travailles dans le dépôt Atom/eVe.

OBJECTIF PRIORITAIRE
Implémenter l’« Action 2 — Intégration OpenAI native complète dans Atom » décrite dans `/atome/Roadmap/Action 2.md`.

Ce fichier est la source de vérité de cette action. Ne recopier ni ne maintenir une seconde spécification divergente dans `Urgent.md`.

Priorités fonctionnelles non négociables :
- conversation texte OpenAI en streaming ;
- conversation vocale Realtime full-duplex avec interruption/barge-in ;
- tous les appels d’actions Atom passent par MCP puis Runtime V2 ;
- interface eVe native de conversation avec sélection dynamique du modèle et du `reasoning.effort` ;
- génération et édition d’images via le provider OpenAI image, avec GPT-Image-2.5 Sunburst comme cible qualité actuelle si disponible et fallback par capabilities ;
- sélection d’un Atome/asset image comme entrée et import canonique du résultat dans Atom ;
- aucune clé OpenAI longue durée dans le frontend.

Avant de coder :
1. lis intégralement /atome/Roadmap/Urgent.md ;
2. lis .codex/AGENTS.md et tous les documents/règles qu’il référence pour le périmètre modifié ;
3. inspecte les maps API/architecture et la documentation Atom/eVe correspondante ;
4. inspecte le MCP existant, le Runtime V2 / Tool Gateway, l’AI gateway et les interfaces conversationnelles déjà présentes ;
5. identifie les sources de vérité et réutilise-les ;
6. vérifie dans la documentation officielle OpenAI actuelle les endpoints, modèles et SDK disponibles au moment où tu exécutes ce travail. Ne suppose pas que les identifiants listés dans le cahier des charges sont encore les plus récents.
7. cartographie la pile voix/TTS/transcription existante, y compris tout moteur open-source, et décide garder/adapter/remplacer/supprimer ;
8. cartographie le registre multi-provider et la gestion actuelle des clés API ;
9. teste la clé OpenAI par un probe non destructif sans l’exposer ;
10. établis une baseline de tests avant modification ;
11. si un ancien chemin doit disparaître, prévois sa suppression complète après parité testée (code/imports/flags/config/docs/tests/assets/routes).

CONTRAINTES NON NÉGOCIABLES
- JavaScript côté front/framework ; ne pas introduire TypeScript comme nouvelle norme.
- Ne créer aucune seconde API métier Atom.
- Toute mutation Atom déclenchée par OpenAI doit passer par MCP puis Runtime V2 / Tool Gateway / Command Bus canonique.
- Ne pas manipuler directement le DOM, l’état interne ou le filesystem pour contourner les propriétaires existants.
- Conserver capabilities, sandbox, rate limiting, confirmations, idempotence, audit, historique, undo/redo et sync.
- Aucun secret OpenAI longue durée dans le client, le bundle, IndexedDB, Git ou les logs.
- L’intégration OpenAI doit être un provider remplaçable derrière une interface stable ; les autres composants Atom ne doivent pas dépendre directement du SDK OpenAI.
- Respecter l’architecture UI eVe et les normes Atom Development.
- Ne pas dupliquer les schemas MCP : les projeter/adapter depuis leur source canonique.
- Toute nouvelle fonction doit disposer de tests et benchmarks conformément à Atom Development.

CAPACITÉS À IMPLÉMENTER
A. OpenAI texte / agent
- Responses API comme API principale pour la nouvelle intégration.
- streaming ;
- état conversationnel ;
- Structured Outputs si utile ;
- function/tool calling ;
- steering/async tools/reasoning continuity lorsqu’ils sont supportés par le modèle/API réellement disponible ;
- compaction/caching pour conversations longues ;
- usage, coût, traces et annulation.

B. Modèles
- registre dynamique de modèles et capacités ;
- supporter un rôle par défaut `sol_light` résolu vers le meilleur modèle Sol réellement disponible ;
- vérifier si GPT-6 Astra (`gpt-6-astra`) est réellement accessible au compte au moment du test, sans en faire le défaut ;
- fallback propre vers les modèles OpenAI disponibles ;
- rôles stables Atom : sol_light / best_reasoning / balanced / fast / voice / image / transcription / tts / embedding ;
- choix utilisateur explicite possible ;
- ne pas disperser les model IDs dans le code.

C. MCP / contrôle Atom
- exposer à OpenAI les outils Atom via un adaptateur MCP ;
- tool calls OpenAI → MCP Atom → Runtime V2 ;
- résultats/progression/erreurs/annulation ;
- toolchains et opérations longues ;
- actor, trace_id, intent_id, idempotency_key, dry_run ;
- confirmations réelles et politiques de risque déclaratives.

D. Voix
- intégrer OpenAI Realtime pour une conversation vocale full-duplex fluide ;
- privilégier WebRTC côté client lorsque pertinent ;
- WebSocket/sideband côté serveur lorsque nécessaire ;
- VAD configurable ;
- barge-in/interruption immédiate ;
- tool calling pendant la voix ;
- retour vocal après résultat MCP ;
- reconnexion et cleanup ;
- utiliser le meilleur modèle Realtime réellement disponible et compatible tool use ; privilégier un profil Sol temps réel s’il existe réellement, sinon fallback Realtime documenté (les docs au 10/09/2026 listent notamment GPT-Realtime-2.x ; revalider au moment du code).

E. Multimodal / services spécialisés
- image en entrée ;
- fichiers explicitement autorisés ;
- image generation/edit via provider ;
- transcription ;
- TTS ;
- embeddings si utile ;
- inventorier Batch, Files, Vector Stores/File Search, Moderation, Computer Use, Code Interpreter, Hosted Shell, Apply Patch, Skills, Remote MCP, Tool Search, Video, Agents SDK et autres APIs actuelles ;
- pour chacune : intégrer seulement si elle correspond à une capability Atom claire, sinon documenter « non intégrée / raison ».

F0. Assistant central / UX modèle
- conserver la cellule/membrane externe unique ;
- long press = entrée dans la sélection du modèle ;
- le geste exact de cycle/sélection n’est pas encore figé : prototyper au moins 2 variantes et obtenir validation utilisateur avant de le hard-coder ;
- découpler `selectedModelLevel` du geste UI ;
- 5 niveaux maximum ;
- noyau niveau N = N pétales/lobes nets ;
- niveau 1 = noyau entier petit, puis division en 2/3/4/5 ;
- luminosité fortement croissante, niveau 5 irradiant presque toute la cellule ;
- niveau N = N pulses par salve ;
- durée et intervalle des pulses constants à tous les niveaux ;
- aucune accélération ;
- pause entre salves plus longue que l’intervalle intra-salve ;
- image de référence fournie en annexe à respecter avant finalisation visuelle ;
- prévoir visual-regression + tests timing.

F1. Crédits / quotas / budget
- afficher une jauge de budget/crédit distincte du niveau de modèle ;
- solde exact seulement s’il est réellement accessible ; sinon état/estimation explicitement labellisé ;
- alerter avant épuisement : faible puis critique ;
- distinguer crédit épuisé, spend limit, usage limit, rate limit, clé invalide ;
- en voix, annoncer le seuil critique et l’épuisement ;
- l’annonce d’épuisement doit fonctionner sans OpenAI TTS (fallback local/système) ;
- ne pas boucler sur les erreurs de facturation ;
- aucun achat/rechargement automatique sans consentement explicite.

F. Données / confidentialité
- politique explicite de contexte envoyé à OpenAI ;
- selection_only / current_object / project_summary / explicit_files / approved_extended_context ;
- ne jamais envoyer silencieusement tout un projet ;
- rendre identifiable ce qui quitte l’environnement local ;
- Atom doit continuer à fonctionner sans OpenAI.

ARCHITECTURE ATTENDUE
Utilisateur texte/voix/image
→ OpenAIProvider
→ Responses ou Realtime selon modalité
→ tool call
→ OpenAIToolAdapter
→ MCP Atom
→ policy/capability/confirmation
→ Runtime V2 / Tool Gateway / Command Bus
→ Atom/eVe

LIVRABLES
1. audit initial court avec fichiers/propriétaires identifiés ;
2. plan d’implémentation ordonné ;
3. code réel ;
4. tests automatisés ;
5. benchmarks ;
6. documentation utilisateur/dev nécessaire ;
7. mise à jour des maps API/architecture ;
8. rapport final listant fichiers modifiés, tests exécutés, résultats, limites et prochaines étapes.

TESTS MINIMUM
- texte streaming ;
- annulation ;
- changement/fallback de modèle ;
- rôle `sol_light` sélectionné et résolu correctement ;
- Astra détecté s’il est accessible au compte ;
- tool call MCP lecture ;
- mutation MCP ;
- confirmation ;
- capability refusée ;
- idempotence ;
- toolchain ;
- opération différée ;
- Realtime connect ;
- full-duplex ;
- barge-in ;
- reconnexion ;
- tool call vocal → MCP → résultat vocal ;
- génération d’image depuis texte ;
- édition d’image depuis un asset sélectionné ;
- génération à partir d’un carré Atom ;
- génération à partir d’un cercle Atom ;
- génération à partir d’un dessin libre/graffiti Atom ;
- agrandissement / extension d’image lorsque supporté ;
- import canonique de l’image résultante dans Atom ;
- absence de secret côté client ;
- offline ;
- cohérence UI vs MCP vs OpenAI ;
- undo/redo après action OpenAI lorsque pertinent ;
- absence de route de mutation parallèle.
- audit de l’ancienne pile voix/TTS et preuve de conservation ou suppression ;
- non-régression des autres providers et gestion de clés ;
- long press assistant + mapping 1..5 modèles ;
- 1..5 pétales exacts ;
- luminosité niveau 1 vs 5 nettement distincte ;
- 1..5 pulses exacts, cadence constante, pause longue ;
- jauge crédit normal/faible/critique/épuisé ;
- discrimination credit/spend/usage/rate-limit ;
- alerte vocale d’épuisement sans OpenAI TTS ;
- profil CI par défaut sans appel OpenAI payant ;
- `OPENAI_LIVE_TESTS=smoke` limité à un sous-ensemble critique ;
- `OPENAI_LIVE_TESTS=full` réservé à la validation release/manuelle ;
- rapport automatique de consommation live (requêtes, tokens, minutes Realtime, images, coût) ;
- aucune simulation d’épuisement par consommation réelle de crédits.

PERFORMANCE
Mesure séparément au minimum : premier token, fin de parole→début audio, interruption→arrêt audio, overhead MCP, action courte→UI, reconnexion Realtime, CPU/mémoire et coût. Fixe les budgets avant la mesure selon Atom Development ; ne déclare pas la tâche conforme sans chiffres reproductibles.

MÉTHODE
Commence par l’audit et le plan. Ensuite implémente jusqu’à un vertical slice réellement fonctionnel :
1. conversation texte Responses ;
2. tool call OpenAI vers une action MCP Atom en lecture ;
3. tool call OpenAI vers une mutation Atom confirmée ;
4. conversation Realtime vocale ;
5. tool call vocal vers MCP Atom ;
6. tests et benchmarks.
Puis étends aux capacités multimodales et spécialisées sans casser le chemin canonique.

Ne termine pas en produisant uniquement un plan ou des pseudo-fichiers. Si le dépôt et l’environnement permettent l’implémentation, modifie le code, exécute les tests et fournis les preuves. Si un point est réellement bloqué par un credential/service externe, implémente tout ce qui est testable localement, ajoute mocks/probes nécessaires, et documente précisément le blocage restant.
```

## Annexe visuelle A — Assistant Atom / niveaux de modèle

**À fournir par l’utilisateur.**

Le visuel fourni en annexe constitue la référence de direction artistique pour l’assistant central : membrane/cellule externe, noyau organique, segmentation 1→5 pétales, progression de luminosité et sensation générale. La version finale doit rester paramétrable dans le code, mais ne doit pas diverger arbitrairement de cette référence sans validation utilisateur.

Avant de déclarer l’UX terminée, fournir des captures/visual-regression des cinq états statiques et une preuve du timing des pulses.

## 24. Références OpenAI à revalider au moment de l’implémentation

Documentation officielle de référence :

```text
https://developers.openai.com/
https://developers.openai.com/api/docs/models
https://developers.openai.com/api/docs/models/gpt-6-astra
https://developers.openai.com/api/docs/guides/latest-model
https://platform.openai.com/docs/
```

État vérifié lors de la rédaction de cette tâche (10/09/2026) :

- GPT-6 Astra est documenté dans l’API sous `gpt-6-astra` ;
- la famille GPT-5.6 reste disponible ;
- GPT-6 Astra est documenté et peut être proposé pour les tâches complexes lorsqu’il est accessible, mais il n’est pas la priorité par défaut de ce cahier des charges ;
- la Responses API est la base recommandée pour les nouvelles expériences agentiques ;
- OpenAI expose des modèles Realtime récents avec speech-to-speech et tool use ;
- l’écosystème API expose également des surfaces spécialisées pour transcription, speech, images, embeddings, batch, modération et outils agentiques.

**Ces faits doivent être revalidés au moment où Codex implémente la tâche.** Le code doit utiliser des capacités et un registre de modèles plutôt qu’une hypothèse figée sur l’offre OpenAI du jour.

