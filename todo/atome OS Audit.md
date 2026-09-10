# Atom OS Audit

**Date :** 9 septembre 2026  
**Périmètre :** Atom Core / dépôt `atomecorp/a`, sous-module eVe / dépôt `atomecorp/eVe`, et architecture Atome OS basée sur FreeBSD.  
**Hypothèse fondamentale de cet audit :** **FreeBSD reste le véritable système d'exploitation de bas niveau. Atom OS ne doit pas réimplémenter le kernel, le scheduler, les drivers, le réseau, le stockage, les jails, le firewall, le gestionnaire de paquets ou l'hyperviseur.**

---

## 1. Verdict

La clarification change sensiblement le premier audit.

**Atom/eVe est beaucoup plus proche d'une base correcte pour Atom OS que ne le laissait entendre l'analyse précédente.**

La bonne architecture n'est pas :

> Atom réimplémente un OS au-dessus de FreeBSD.

La bonne architecture est :

> **FreeBSD fournit les primitives système ; Atom/eVe leur donne une représentation sémantique, modulaire, contrôlable par humain ou IA.**

Il n'est donc pas nécessaire de créer un nouveau scheduler, un nouveau système de services, un nouveau firewall, un nouveau système de fichiers, un nouveau moteur de jails ou un nouvel hyperviseur.

Il manque surtout une **couche de contrôle haut niveau** entre Atom/eVe et les fonctions natives de FreeBSD.

La fondation Atome actuelle est adaptée à cela, car elle possède déjà les notions de :

- `capability`
- `service`
- `protocol`
- `connector`
- `automation`
- `pack`
- `policy`
- lifecycle
- dépendances
- permissions
- compatibilité
- API typées
- MCP
- historique
- replay déterministe
- fonctionnement offline
- synchronisation

La constitution actuelle impose également que toute nouvelle fonctionnalité ait une API déclarée, typée, MCP-compatible, accessible aux IA et que les opérations avec effets passent par le Command Bus, les policies, les capabilities, l'audit et l'idempotence.

**Il ne faut donc pas changer le modèle fondamental. Il faut l'étendre au système.**

---

# 2. Ce qu'Atom OS ne doit PAS construire

Ces éléments doivent rester entièrement sous la responsabilité de FreeBSD ou de ses composants standards.

| Fonction | Responsable |
|---|---|
| Kernel | FreeBSD |
| Scheduler CPU | FreeBSD |
| Drivers | FreeBSD |
| USB / PCI / réseau bas niveau | FreeBSD |
| Processus / threads | FreeBSD |
| Filesystem | ZFS / FreeBSD |
| Snapshots système | ZFS |
| Boot environments | `bectl` / ZFS |
| Firewall | PF |
| Services | `rc.d` |
| Packages | `pkg` |
| Jails | FreeBSD Jails |
| Limites de ressources | `rctl`, `cpuset`, priorités natives |
| Priorités temps réel | `rtprio` |
| Virtualisation | `bhyve` |
| Compatibilité binaire Linux | Linuxulator |
| Mise à jour du système de base | mécanismes FreeBSD |
| Gestion mémoire | FreeBSD |
| Réseau TCP/IP | FreeBSD |

Atom OS ne doit fournir qu'une **interface sémantique** au-dessus de ces mécanismes.

Exemple :

```text
Utilisateur / IA :
"donne plus de priorité à l'audio"

Atom :
system.performance.set_profile("audio")

Provider FreeBSD :
cpuset / rtprio / paramètres audio appropriés

FreeBSD :
effectue réellement l'opération
```

L'utilisateur et l'IA ne doivent pas avoir besoin de connaître `rtprio`, `sysctl`, `service`, `jail`, `bectl`, etc.

---

# 3. Architecture recommandée

```text
Humain
UI
Voix
IA locale
IA distante
MCP
   │
   ▼
Command Bus Atom
   │
   ▼
Policy / Capability / Audit
   │
   ▼
System Capability Registry
   │
   ├── Provider FreeBSD natif
   ├── Provider Linuxulator
   ├── Provider Linux bhyve
   └── éventuellement Provider distant
   │
   ▼
FreeBSD / Linux guest / matériel
```

La couche importante est :

# **System Capability Registry**

Elle permet de décrire une fonctionnalité par ce qu'elle fait, et non par la technologie utilisée.

Exemples :

```text
system.audio.output
system.audio.input
system.audio.realtime
system.display
system.network
system.bluetooth
system.storage
system.power
system.service
system.application
system.sandbox
system.virtualization
system.device
system.update
system.backup
system.performance
```

Un appelant ne doit pas savoir si la fonction est réalisée par :

- FreeBSD natif ;
- Linuxulator ;
- un jail ;
- une VM Linux bhyve ;
- un service distant.

Cette indirection est probablement **la pièce architecturale la plus importante à ajouter**.

---

# 4. Les briques réellement manquantes

## P0 — 1. System Capability Registry

### État

Le modèle Atome possède déjà la notion de `capability`, mais il n'existe pas encore de registre complet représentant les capacités de la machine comme des fonctionnalités système.

### À ajouter

Une couche permettant de demander :

```text
capability.available
capability.describe
capability.status
capability.execute
capability.configure
```

Chaque capability doit indiquer :

- son provider ;
- sa disponibilité ;
- ses paramètres ;
- ses permissions ;
- son niveau de risque ;
- si elle fonctionne offline ;
- si elle nécessite un redémarrage ;
- si elle est réversible ;
- ses dépendances ;
- ses métriques de performance.

### Importance

**P0.**

C'est elle qui rend Atom OS indépendant de l'implémentation sous-jacente.

---

## P0 — 2. Desired System State

Atom possède déjà un excellent modèle d'état applicatif et d'historique.

Il faut appliquer le même principe à la configuration de la machine.

Exemple :

```text
audio.profile = realtime
network.wifi = enabled
display.refresh = 60
service.matrix = running
application.xxx = enabled
sandbox.plugin.xxx = running
```

Mais Atom ne doit pas devenir la vérité du kernel.

Il doit conserver :

```text
desired_state
observed_state
```

Exemple :

```text
desired_state:
    service.matrix = running

observed_state:
    service.matrix = stopped
```

Atom peut alors :

1. détecter l'écart ;
2. proposer une correction ;
3. appliquer la correction via FreeBSD ;
4. vérifier le résultat.

C'est une architecture beaucoup plus robuste pour une IA qu'une succession de commandes shell.

---

## P0 — 3. Privilege / Policy Broker

L'IA ne doit jamais contrôler directement un shell root.

La bonne chaîne est :

```text
IA
 ↓
capability
 ↓
policy
 ↓
permission
 ↓
confirmation éventuelle
 ↓
provider
 ↓
FreeBSD
```

Le shell existant peut rester :

- outil de développement ;
- console d'administration ;
- procédure break-glass / rescue.

Mais il ne doit pas devenir l'API d'Atom OS.

Pour les fonctions système sensibles, les permissions doivent être explicites :

```text
system.read
system.service.manage
system.network.configure
system.storage.mount
system.application.install
system.update.apply
system.power.shutdown
system.virtualization.manage
```

Les capabilities système sensibles ne doivent jamais être accordées implicitement à une IA.

---

## P0 — 4. Plugin Runtime sécurisé

C'est l'un des vrais manques du framework actuel.

La documentation plugin actuelle indique explicitement que :

- le manifeste est pratiquement déjà disponible ;
- le modèle de données existe ;
- les capacités et policies existent ;
- **l'exécution de code tiers sandboxé n'est pas encore réalisée.**

Pour Atom OS, ce mécanisme devient central.

Je recommande quatre niveaux.

### Niveau 1 — Plugin déclaratif

Aucun code.

Seulement :

- UI ;
- configuration ;
- workflow ;
- commandes ;
- capacités existantes.

C'est le niveau à privilégier.

### Niveau 2 — Worker / WASM

Pour du code utilisateur isolé ne nécessitant pas d'accès système direct.

### Niveau 3 — Jail FreeBSD

Pour une application ou un service nécessitant :

- processus ;
- fichiers ;
- réseau ;
- librairies natives.

Atom gère seulement le lifecycle.

FreeBSD réalise l'isolation.

### Niveau 4 — Provider privilégié signé

Cas exceptionnel pour une extension nécessitant une fonction système privilégiée.

Très petit code, signé, audité et explicitement autorisé.

---

# 5. Le système de jails : correction par rapport au premier audit

Le premier audit parlait de « construire le provider FreeBSD Jail ».

La formulation était trop basse niveau.

Il ne faut surtout pas construire un moteur de jail.

FreeBSD le possède déjà.

Il faut seulement construire un :

# **Jail Lifecycle Adapter**

Exemples d'actions :

```text
sandbox.create
sandbox.start
sandbox.stop
sandbox.destroy
sandbox.snapshot
sandbox.network
sandbox.resources
sandbox.status
```

Ces actions appellent ensuite les primitives natives FreeBSD.

Atom connaît :

- l'intention ;
- le propriétaire ;
- les permissions ;
- le lifecycle ;
- les dépendances ;
- l'état attendu.

FreeBSD connaît :

- les processus ;
- les namespaces FreeBSD/jails ;
- les mounts ;
- le réseau ;
- les ressources.

Cette séparation est correcte.

---

# 6. QoS et performances : une brique importante à ajouter

Pour une machine créative, audio et vidéo doivent être considérés différemment des tâches ordinaires.

Atom ne doit pas construire un scheduler.

Il doit construire des **profils de ressources** qui configurent le scheduler FreeBSD.

Exemples :

```text
performance.normal
performance.audio
performance.video
performance.live
performance.background
performance.battery
```

Un profil peut agir sur les primitives FreeBSD existantes :

- priorité ;
- affinité CPU ;
- limites CPU/mémoire ;
- priorité des services ;
- configuration audio ;
- tâches de fond ;
- fréquence ou politiques énergétiques lorsque disponibles.

La couche Atom doit exprimer :

> « audio temps réel prioritaire »

et non :

> « exécute telle suite de dix commandes Unix ».

---

# 7. Audio : FreeBSD ou Linux ?

## Point important

L'affirmation :

> « Linux a forcément une latence moins prédictible »

n'est pas exacte dans l'absolu.

Linux configuré avec **PREEMPT_RT** est précisément conçu pour réduire la latence maximale et améliorer le déterminisme.

La documentation officielle du kernel Linux indique que PREEMPT_RT rend la majorité du kernel préemptible, utilise des interruptions threadées et de l'héritage de priorité afin de réduire les latences de scheduling.

En revanche, **Linux standard**, Linux mal configuré, ou une machine chargée de tâches graphiques et système peut effectivement présenter beaucoup plus de jitter.

FreeBSD possède de son côté :

- priorités temps réel via `rtprio` ;
- modes audio basse latence ;
- réglage du buffering ;
- architecture audio native relativement simple.

Mais FreeBSD n'est pas non plus un RTOS à déterminisme absolu.

La documentation FreeBSD précise notamment qu'un processus temps réel peut encore être retardé par certains comportements kernel ou par un page-in.

Donc :

# **il ne faut choisir ni FreeBSD ni Linux sur la réputation de leur latence moyenne.**

Il faut mesurer le **worst case**.

---

# 8. Ce qu'il faut mesurer pour l'audio

Le critère principal ne doit pas être :

```text
latence moyenne = 3,2 ms
```

mais :

```text
deadline misses = 0
xruns = 0
jitter maximal acceptable
```

Tests recommandés :

- charge CPU élevée ;
- rendu WebGPU simultané ;
- accès disque massif ;
- réseau actif ;
- téléchargement ;
- IA locale active ;
- plusieurs plugins ;
- enregistrement audio ;
- lecture multipiste ;
- périphérique USB ;
- fonctionnement prolongé.

Mesurer :

- callback audio moyen ;
- callback p99 ;
- callback p99.9 / p99.99 ;
- maximum observé ;
- nombre de xruns ;
- round-trip latency ;
- variance de la latence ;
- dérive clock ;
- stabilité sur plusieurs heures.

**Pour Atom OS, une latence légèrement plus élevée mais sans xruns est préférable à une latence moyenne plus faible avec des pics.**

Sur ce point, ton intuition est correcte.

---

# 9. Faut-il mettre Linux dans une VM ?

## Recommandation : pas par défaut

Ajouter une VM Linux simplement dans l'espoir d'améliorer la latence audio n'est pas une bonne première solution.

Une VM ajoute :

```text
application
 ↓
kernel Linux guest
 ↓
driver virtuel / passthrough
 ↓
hyperviseur bhyve
 ↓
scheduler FreeBSD host
 ↓
matériel
```

La documentation Linux PREEMPT_RT elle-même rappelle que la virtualisation ajoute des sources supplémentaires de latence : scheduling du vCPU côté host, émulation ou VirtIO, traitement des I/O côté host.

Le passthrough PCI peut réduire une partie de cette latence.

Mais cela :

- augmente la complexité ;
- réserve le périphérique au guest ;
- complique les drivers ;
- complique le diagnostic ;
- ajoute deux systèmes à maintenir.

### Donc pour l'audio

Ordre de préférence :

1. **FreeBSD natif**
2. benchmark FreeBSD correctement optimisé
3. si insuffisant, comparaison avec Linux PREEMPT_RT **bare metal**
4. seulement ensuite test Linux PREEMPT_RT sous bhyve avec CPU pinning et périphérique dédié/passthrough

Une VM ne doit pas être le premier remède à un problème de temps réel.

---

# 10. Linuxulator : probablement beaucoup plus intéressant

FreeBSD possède Linuxulator.

Il permet d'exécuter de nombreux binaires Linux **sans lancer un kernel Linux**.

Cela signifie :

```text
application Linux
 ↓
ABI Linuxulator
 ↓
kernel FreeBSD
```

Pour Atom OS, c'est très intéressant.

Cela permet potentiellement d'utiliser un logiciel disponible uniquement sous Linux tout en conservant :

- le kernel FreeBSD ;
- le scheduler FreeBSD ;
- le modèle de sécurité FreeBSD ;
- les jails ;
- la même machine.

Limite importante :

Linuxulator ne fournit pas toutes les fonctions Linux spécifiques.

La documentation FreeBSD indique notamment des limitations autour de fonctions système telles que :

- cgroups ;
- namespaces Linux ;
- certaines interactions matérielles ou système.

### Stratégie recommandée

```text
Provider 1 : FreeBSD native
        ↓ si indisponible
Provider 2 : Linuxulator
        ↓ si insuffisant
Provider 3 : Linux bhyve
        ↓ éventuellement
Provider 4 : machine distante
```

Cette hiérarchie est simple et cohérente avec la philosophie Atom.

---

# 11. Linux VM : bons cas d'usage

Une VM Linux peut néanmoins être très utile pour :

- CUDA / certaines piles IA ;
- logiciels uniquement disponibles sous Linux ;
- outils nécessitant cgroups ou namespaces Linux ;
- containers Linux ;
- build Linux ;
- services backend spécifiques ;
- calcul lourd ;
- traitements offline ;
- rendu ou encodage non temps réel.

Je la considérerais donc comme une :

# **Compatibility Appliance**

et non comme une partie structurelle obligatoire d'Atom OS.

Atom doit pouvoir la démarrer seulement lorsqu'une capability en a besoin.

Exemple :

```text
capability.ai.cuda
provider = linux-bhyve
```

L'utilisateur ou l'IA appelle la capability.

Atom démarre éventuellement la VM.

Le reste du système ne sait pas que Linux est impliqué.

C'est le bon niveau d'abstraction.

---

# 12. Vidéo

Pour le rendu live, je conserverais :

```text
Bevy
 ↓
wgpu / WebGPU
 ↓
FreeBSD
 ↓
GPU
```

Une VM Linux n'apporte pas naturellement un meilleur déterminisme vidéo.

Le GPU est lui-même une ressource fortement partagée et peut perturber le temps réel CPU.

La documentation PREEMPT_RT recommande d'ailleurs de tester explicitement les workloads graphiques lorsqu'ils cohabitent avec des tâches temps réel.

Une VM Linux devient intéressante uniquement pour :

- traitement offline ;
- codec absent ;
- outil IA vidéo ;
- CUDA ;
- rendu spécialisé.

Pour le compositor/live path, rester natif est plus simple.

---

# 13. Séparer Control Plane et Media Plane

C'est important pour Atom OS.

## Control Plane

Peut passer par :

- Atome ;
- MCP ;
- IA ;
- Command Bus ;
- policies ;
- historique ;
- sync.

Il gère :

- créer ;
- configurer ;
- charger ;
- router ;
- démarrer ;
- arrêter ;
- modifier des paramètres.

## Media Plane

Ne doit pas passer par l'IA ou MCP dans la boucle temps réel.

Audio :

```text
Kira / moteur natif
→ callback audio
→ driver
```

Vidéo :

```text
Bevy / wgpu
→ GPU
```

L'IA configure le graphe.

Elle ne se trouve jamais dans le callback audio ni dans la boucle de rendu critique.

Le document plugin actuel va déjà dans cette direction en séparant :

- plan de contrôle ;
- plan signal.

Cette décision est correcte.

---

# 14. Offline / Online : déjà très bon, avec une clarification à ajouter

La politique actuelle impose l'offline pour :

- Browser lorsque possible selon son contrat ;
- Tauri ;
- iOS ;
- AUv3 ;
- FreeBSD Pure OS.

Le système de sync append-only et de replay déterministe est une excellente base.

Mais pour Atom OS, il faut distinguer deux types d'état.

## État utilisateur synchronisable

Exemple :

- projets ;
- documents ;
- préférences ;
- profils ;
- automatisations.

Peut être synchronisé.

## État physique de la machine

Exemple :

- interface audio présente ;
- volume actuel ;
- écran ;
- réseau ;
- batterie ;
- jail en cours ;
- périphérique USB.

**Cet état doit rester localement autoritaire.**

Le cloud peut synchroniser une préférence ou proposer une action.

Il ne doit pas devenir la vérité d'un périphérique physique.

Je recommande de formaliser cette distinction dans la documentation.

---

# 15. Update et recovery

Il faut corriger le builder actuel sur ce point.

Le builder utilise actuellement une logique :

- versions `latest` ;
- `pkg upgrade` ;
- mise à jour du framework depuis Git ;
- restart.

C'est pratique en développement.

Pour un OS de production, il faut plutôt que la couche Atom orchestre les mécanismes natifs de FreeBSD.

FreeBSD dispose déjà de :

- ZFS ;
- boot environments ;
- `bectl` ;
- pkg / pkgbase selon le mode choisi.

Atom doit seulement fournir :

```text
update.plan
update.download
update.verify
update.snapshot
update.apply
update.healthcheck
update.commit
update.rollback
```

Exemple :

```text
1. créer boot environment
2. appliquer update
3. reboot
4. health check Atom
5. si OK → commit
6. sinon → rollback
```

Encore une fois :

**Atom orchestre ; FreeBSD exécute.**

Le rollback automatique après crash-loop mentionné dans les documents du builder reste à mettre en place.

---

# 16. Observabilité système

Pour qu'une IA administre correctement une machine, elle doit pouvoir observer son état.

Il faut une couche uniforme pour :

- CPU ;
- mémoire ;
- GPU ;
- stockage ;
- réseau ;
- services ;
- jails ;
- VM ;
- audio xruns ;
- latence ;
- frame time ;
- batterie ;
- température ;
- disponibilité des périphériques.

Il faut distinguer :

## événements durables

Exemple :

```text
audio interface changed
plugin installed
service configuration changed
update applied
```

## télémétrie éphémère

Exemple :

```text
CPU = 43 %
GPU = 61 %
latency = 2.8 ms
```

Ne pas remplir l'historique Atome de millions d'échantillons inutiles.

La télémétrie doit avoir son propre buffer / agrégation.

---

# 17. Performance Gate obligatoire

Toute nouvelle capability système devrait avoir un benchmark.

Pour les fonctions ordinaires :

- temps d'ouverture ;
- temps de réponse ;
- mémoire ;
- CPU ;
- impact idle.

Pour audio :

- xruns ;
- jitter ;
- worst-case callback ;
- round-trip latency.

Pour vidéo :

- frame drops ;
- p99 / maximum frame time ;
- GPU memory ;
- comportement sous charge.

Pour une fonctionnalité système, un test ne devrait pas seulement répondre :

> « ça fonctionne ».

Il doit répondre :

> « ça fonctionne sans dégrader les garanties globales ».

---

# 18. Les manques classés

| Priorité | Brique | État |
|---|---|---|
| **P0** | System Capability Registry | À créer |
| **P0** | Provider abstraction FreeBSD / Linuxulator / bhyve | À créer |
| **P0** | Desired System State / Observed State | À formaliser |
| **P0** | Privilege & Policy Broker système | À compléter |
| **P0** | Plugin sandbox / lifecycle | Conçu, pas encore implémenté |
| **P1** | Resource / QoS profiles | À créer |
| **P1** | Jail lifecycle adapter | À créer, mais basé sur jails FreeBSD existants |
| **P1** | Compatibility Broker Linux | À créer |
| **P1** | Update transactionnel + rollback | À renforcer |
| **P1** | Observabilité système unifiée | À compléter |
| **P1** | Benchmarks système automatiques | À généraliser |
| **P2** | Remote provider / compute distant | Optionnel |
| **P2** | Linux VM auto-on-demand | Optionnel |

---

# 19. Ce qui est déjà suffisamment bon

Je conserverais sans refonte majeure :

- modèle universel Atome ;
- Command Bus ;
- architecture capability/policy ;
- MCP ;
- exposition IA ;
- historique append-only ;
- replay ;
- sync ;
- offline-first ;
- Bevy/WebGPU ;
- moteur audio natif ;
- séparation des runtimes ;
- structure de plugin proposée ;
- builder FreeBSD déclaratif ;
- principes de modularité `.codex`.

Le framework possède donc déjà la majorité des concepts nécessaires au **niveau architectural**.

---

# 20. Recommandation finale

Je recommande cette architecture :

```text
ATOM OS
│
├── Human / AI / MCP / Voice
│
├── Command Bus
│
├── Policy & Capability Engine
│
├── System Capability Registry
│
├── Desired State / Observed State
│
├── Providers
│   ├── FreeBSD native
│   ├── Linuxulator
│   ├── FreeBSD Jail
│   ├── Linux bhyve
│   └── Remote
│
├── Media Plane
│   ├── Kira / native audio
│   └── Bevy / WebGPU
│
└── FreeBSD
    ├── kernel
    ├── drivers
    ├── ZFS
    ├── PF
    ├── rc.d
    ├── pkg
    ├── jails
    ├── bhyve
    └── hardware
```

La règle centrale devrait être :

> **Atom décrit l'intention, la politique et l'état. FreeBSD réalise l'opération.**

Et pour la compatibilité :

> **Native FreeBSD d'abord → Linuxulator ensuite → VM Linux seulement si réellement nécessaire.**

Pour le temps réel :

> **Ne pas ajouter Linux dans une VM avant d'avoir démontré par benchmark que FreeBSD natif ne tient pas les deadlines.**

Si un benchmark montre une faiblesse FreeBSD, la comparaison pertinente est d'abord :

```text
FreeBSD bare metal
vs
Linux PREEMPT_RT bare metal
```

et non :

```text
FreeBSD
vs
Linux dans une VM
```

La VM rajoute précisément les couches susceptibles d'introduire du jitter.

---

# 21. Conclusion

Avec le périmètre correctement défini, **je ne vois pas de raison de changer la base FreeBSD ni de refaire Atom/eVe**.

Le chantier n'est pas de construire un OS traditionnel.

Le chantier est de transformer les fonctions existantes de FreeBSD et les fonctions d'Atom/eVe en un **graphe de capabilities modulaires, introspectables, sécurisées et remplaçables**.

Une fois les cinq éléments suivants terminés :

1. System Capability Registry ;
2. provider abstraction ;
3. desired/observed system state ;
4. policy broker système ;
5. plugin sandbox ;

Atom/eVe disposera d'une architecture cohérente pour devenir un **OS haut niveau entièrement contrôlable par humain ou IA**, tout en conservant :

- FreeBSD comme base solide ;
- offline-first ;
- compatibilité online ;
- modularité ;
- sécurité ;
- possibilité d'intégrer ponctuellement Linux sans dépendre de Linux.

---

# Sources principales

## Dépôts Atom / eVe

- `atomecorp/a/.codex/modules/05-api-rendering-and-ui.md`
- `atomecorp/a/.codex/modules/06-atome-state-sync-and-runtime-modes.md`
- `atomecorp/a/atome/documentations/atomeOS_usage.md`
- `atomecorp/a/platforms/atomeOS/builder/README.md`
- `atomecorp/a/platforms/atomeOS/builder/docs/architecture.md`
- `atomecorp/a/platforms/atomeOS/builder/docs/known_issues.md`
- `atomecorp/a/platforms/atomeOS/builder/docs/auto_update.md`
- `atomecorp/a/todo/eVe_plugin.md`
- `atomecorp/a/atome/src/shared/atome_universal_contract.js`
- `atomecorp/eVe/documentations/realtime_sync_architecture.md`
- `atomecorp/eVe/eVe_essentials.md`

## FreeBSD

- FreeBSD Documentation — Linux Binary Compatibility:
  https://docs.freebsd.org/en/books/handbook/linuxemu/
- FreeBSD Documentation — Virtualization / bhyve:
  https://docs.freebsd.org/en/books/handbook/virtualization/
- FreeBSD Sound subsystem:
  https://man.freebsd.org/cgi/man.cgi?query=pcm&sektion=4
- FreeBSD realtime priorities:
  https://man.freebsd.org/cgi/man.cgi?query=rtprio&sektion=1
- FreeBSD ZFS Boot Environments:
  https://docs.freebsd.org/en/books/handbook/zfs/
- FreeBSD Updating and Upgrading:
  https://docs.freebsd.org/en/books/handbook/cutting-edge/

## Linux temps réel

- Linux Kernel — PREEMPT_RT:
  https://docs.kernel.org/core-api/real-time/
- Linux Kernel — PREEMPT_RT theory:
  https://docs.kernel.org/core-api/real-time/theory.html
- Linux Kernel — hardware and virtualization considerations:
  https://docs.kernel.org/core-api/real-time/hardware.html
- Linux Kernel — real-time kernel configuration:
  https://docs.kernel.org/next/core-api/real-time/kernel-configuration.html
