# Infrastructure Atome/eVe — Jails utilisateurs + IA mutualisée

## 1. Principe général

Atome/eVe ne doit pas être hébergé comme un simple site web.

L’infrastructure correcte doit séparer clairement :

* l’environnement utilisateur ;
* les données ;
* le runtime Atome ;
* la synchronisation ;
* les services IA ;
* les ressources GPU.

Le bon modèle est :

1 utilisateur = 1 jail FreeBSD
IA = services mutualisés séparés
GPU = ressource partagée, jamais dédiée à chaque jail

⸻

1. Architecture cible

Internet
  ↓
Reverse Proxy / TLS
  ↓
Atome Gateway
  ↓
────────────────────────────────────────────
FreeBSD Atome Server          Linux AI/GPU Server
────────────────────────────────────────────
Jails utilisateurs            Voxtral STT
Runtime Atome                 Voxtral TTS
SQLite / libSQL               DeepSeek / Mistral / LLM
WebSocket                     GPU workers
Sync offline/online           Streaming inference
Permissions                   Queue / scheduler
Media / projects              Model cache

⸻

1. Serveur FreeBSD — cœur Atome/eVe

Le serveur FreeBSD gère la partie système, utilisateurs, données et runtime.

Rôle du serveur FreeBSD

* héberger les jails utilisateurs ;
* isoler chaque utilisateur ;
* faire tourner le runtime Atome/eVe ;
* gérer les projets ;
* gérer les bases SQLite/libSQL ;
* gérer les fichiers et médias ;
* gérer les permissions ;
* gérer la synchronisation offline/online ;
* exposer les services via WebSocket ;
* communiquer avec la couche IA.

Structure possible

FreeBSD Host
 ├── jail_proxy
 ├── jail_admin
 ├── jail_ai_gateway
 ├── jail_user_0001
 ├── jail_user_0002
 ├── jail_user_0003
 ├── jail_media
 └── jail_sync

⸻

1. Jail utilisateur

Chaque utilisateur dispose de son propre environnement isolé.

jail_user_x
 ├── atome-runtime
 ├── user.sqlite
 ├── projects/
 ├── media/
 ├── cache/
 ├── sync-agent
 └── websocket-agent

Avantages

* isolation forte entre utilisateurs ;
* sauvegarde indépendante ;
* restauration indépendante ;
* migration possible utilisateur par utilisateur ;
* sécurité plus propre ;
* cohérence avec la philosophie Atome/eVe ;
* possibilité de suspendre ou redémarrer un utilisateur sans affecter les autres.

⸻

1. Point important : pas d’IA dans chaque jail

Il ne faut surtout pas faire :

1 jail = 1 utilisateur = 1 modèle IA

Ce serait trop lourd, trop coûteux et techniquement mauvais.

La bonne logique est :

1 jail = 1 environnement utilisateur
IA = service centralisé
GPU = ressource mutualisée

⸻

1. Couche IA / GPU

La couche IA doit être séparée du serveur FreeBSD principal.

Le plus réaliste est un serveur Linux dédié aux IA, surtout si on utilise des GPU NVIDIA.

Linux AI/GPU Server
 ├── Voxtral STT
 ├── Voxtral TTS
 ├── DeepSeek / Mistral / autre LLM
 ├── GPU workers
 ├── queue de tâches
 ├── streaming tokens/audio
 ├── model cache
 └── API interne

Pourquoi Linux pour l’IA ?

Parce que les piles GPU, LLM, STT et TTS sont beaucoup plus matures sous Linux :

* pilotes NVIDIA ;
* CUDA si nécessaire ;
* moteurs d’inférence ;
* gestion de VRAM ;
* workers GPU ;
* streaming IA ;
* compatibilité avec les runtimes modernes.

FreeBSD reste excellent pour les jails et l’isolation, mais Linux est plus adapté pour l’IA GPU.

⸻

1. AI Gateway Atome

Les jails utilisateurs ne doivent pas appeler directement les modèles IA.

Ils passent par une passerelle centrale :

jail_user_x
  ↓
Atome AI Gateway
  ↓
Task Router
  ↓
GPU Worker / API Mistral / LLM Server
  ↓
Streaming response
  ↓
jail_user_x

Rôle de l’AI Gateway

* authentifier l’utilisateur ;
* vérifier les permissions ;
* gérer les quotas ;
* router les demandes ;
* choisir le bon modèle ;
* gérer la file d’attente ;
* gérer les priorités ;
* streamer les réponses texte ;
* streamer l’audio TTS ;
* annuler une tâche si nécessaire ;
* journaliser les usages ;
* éviter qu’un modèle accède directement aux données utilisateur.

⸻

1. STT avec Voxtral

Le STT doit utiliser Voxtral, pas Whisper.

Flux logique :

Micro utilisateur
  ↓
stream audio WebSocket
  ↓
Atome AI Gateway
  ↓
Voxtral STT
  ↓
texte partiel / texte final
  ↓
LLM / MCP / Runtime Atome

Voxtral peut servir à :

* transcrire la voix ;
* comprendre une commande orale ;
* analyser un contenu audio ;
* fournir du texte exploitable par le LLM ou le système MCP.

⸻

1. TTS avec Voxtral TTS

Le TTS doit aussi passer par un service mutualisé.

Flux logique :

Réponse LLM
  ↓
segmentation par phrase
  ↓
Voxtral TTS
  ↓
stream audio
  ↓
client Atome/eVe

Il ne faut pas attendre toute la réponse du LLM avant de lancer la voix.

Le bon comportement est :

LLM streaming texte
  ↓
phrases détectées progressivement
  ↓
TTS streaming
  ↓
lecture immédiate

C’est indispensable pour obtenir une expérience proche d’un assistant vocal type Jarvis.

⸻

1. LLM / Chat / DeepSeek

Le LLM de chat, par exemple DeepSeek ou Mistral, doit aussi être mutualisé.

jail_user_x
  ↓
AI Gateway
  ↓
LLM Server
  ↓
réponse streamée
  ↓
jail_user_x

Le LLM ne doit pas accéder directement aux fichiers ou bases utilisateur.

Il doit passer par :

* les permissions Atome ;
* les APIs internes ;
* le MCP ;
* les outils exposés proprement par Atome/eVe.

⸻

1. Pas d’apprentissage IA

Les IA sont utilisées uniquement en mode inférence/réponse.

Elles ne sont pas utilisées en mode apprentissage, entraînement ou fine-tuning.

Donc :

Pas de training
Pas de dataset utilisateur pour apprendre
Pas de backpropagation
Pas de modèle qui se modifie tout seul
Pas d’apprentissage dans les jails

Le serveur IA sert uniquement à répondre :

texte → réponse LLM
audio → transcription
texte → voix

⸻

1. PyTorch : pas obligatoire par principe

Comme il n’y a pas d’apprentissage, PyTorch n’est pas une nécessité architecturale.

Cependant, il peut devenir nécessaire selon le runtime choisi pour Voxtral, DeepSeek ou un autre modèle.

Conclusion correcte :

Pas besoin de PyTorch pour apprendre, car on n’apprend pas.
Mais PyTorch peut être imposé par certains moteurs d’inférence.

Si possible, privilégier des moteurs d’inférence simples, robustes et adaptés à la production.

⸻

1. Deux modes possibles pour Voxtral

Option A — API Mistral

Atome AI Gateway
  ↓
API Mistral Voxtral STT / TTS

Avantages :

* pas de GPU local ;
* pas de CUDA ;
* pas de PyTorch local ;
* déploiement beaucoup plus simple ;
* idéal pour démarrer.

Inconvénients :

* dépendance à Mistral ;
* coût à l’usage ;
* confidentialité à encadrer ;
* latence dépendante du réseau.

Option B — Self-hosting Voxtral

Linux GPU Server
 ├── Voxtral STT
 ├── Voxtral TTS
 ├── runtime d’inférence
 └── API interne

Avantages :

* contrôle total ;
* meilleure confidentialité ;
* indépendance ;
* intégration profonde avec Atome/eVe.

Inconvénients :

* GPU nécessaire ;
* maintenance plus lourde ;
* drivers ;
* VRAM ;
* runtime d’inférence ;
* possible dépendance à Python/PyTorch selon le moteur.

⸻

1. Infrastructure MVP recommandée

Pour démarrer sans complexité excessive :

Serveur FreeBSD
 ├── jails utilisateurs
 ├── runtime Atome
 ├── SQLite/libSQL
 ├── WebSocket
 ├── sync
 └── AI Gateway
API Mistral
 ├── Voxtral STT
 ├── Voxtral TTS
 └── éventuellement LLM

C’est la solution la plus simple pour valider le produit.

⸻

1. Infrastructure avancée recommandée

Pour une version plus autonome :

Serveur A — FreeBSD Atome/eVe
 ├── jails utilisateurs
 ├── runtime Atome
 ├── bases utilisateur
 ├── stockage média
 ├── sync
 ├── permissions
 └── AI Gateway
Serveur B — Linux GPU IA
 ├── Voxtral STT
 ├── Voxtral TTS
 ├── DeepSeek / Mistral LLM
 ├── workers GPU
 ├── scheduler
 ├── streaming inference
 └── monitoring IA
Serveur C — Stockage / backup optionnel
 ├── ZFS snapshots
 ├── sauvegardes
 ├── archives médias
 └── réplication

⸻

1. Résumé final

L’architecture idéale pour Atome/eVe est :

FreeBSD + jails = isolation utilisateur
AI Gateway = contrôle, sécurité, quotas, streaming
Voxtral = STT/TTS mutualisé
DeepSeek/Mistral = LLM/chat mutualisé
GPU = ressource partagée
Linux GPU = uniquement si self-hosting IA

À éviter absolument :

IA dans chaque jail
GPU dédié à chaque utilisateur
modèle LLM par utilisateur
accès direct du LLM aux données utilisateur
mélange complet FreeBSD + IA GPU lourde sur la même machine
apprentissage IA non contrôlé sur les données utilisateur

La bonne séparation est :

User state isolé
AI compute mutualisé
permissions strictes entre les deux
