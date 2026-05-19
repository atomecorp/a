# Audio Engine Migration Prompt

## Prompt

Tu travailles dans le repo Atome/eVe. Ta mission est de mener la migration totale du système audio legacy vers le nouveau moteur audio unifié, puis de supprimer toutes les parties legacy devenues inutiles afin de garder le code le plus minimal possible.

Le moteur cible est défini dans:

- `documentations/atome_audio_engine.md`
- `eve/application/todo/native_atome_audio_engine.md`
- `eve/application/todo/cpal_Kira_integration.md`

Le résultat attendu n'est pas une migration partielle ni une cohabitation durable entre plusieurs moteurs. Le but est:

1. faire du nouveau moteur l'unique propriétaire du playback audio dans Atome/eVe
2. faire du nouveau moteur l'unique propriétaire logique du recording audio
3. router aussi le son des vidéos vers ce moteur
4. intégrer MTrack / MTrax à ce même moteur
5. supprimer ensuite tout le legacy inutile

Le périmètre runtime à couvrir explicitement est:

- mode web quand Atome/eVe tourne dans un browser avec le serveur Fastify sur FreeBSD
- mode app / Tauri
- mode AUv3

Le chantier n'est pas fini tant que le nouveau moteur n'est pas réellement utilisable dans ces trois contextes selon leurs contraintes respectives.

Cela inclut aussi les prérequis système runtime. En particulier, si le stack FreeBSD / Tauri nécessite des dépendances audio système, elles doivent être identifiées, documentées et prises en compte dans la migration. Hypothèse actuelle à confirmer: au minimum `JACK` est requis pour l'audio natif sur FreeBSD.

## Objectif produit

Après ton travail, tout flux audio d'Atome/eVe doit passer par le nouveau moteur, notamment:

- lecture des atomes `audio`
- lecture des atomes `sound`
- lecture de la bande son des atomes `video`
- lecture des enregistrements `audio_recording`
- lecture de la bande son des `video_recording`
- preview et playback MTrack / MTrax
- scrubbing et transport MTrack quand un média audible est présent
- enregistrement audio
- debug / metering / validation

Cette contrainte vaut:

- en browser pur servi par Fastify / FreeBSD
- en runtime app / Tauri
- en AUv3

## Règles impératives

### 1. Un seul propriétaire audio

Il ne doit plus exister plusieurs chemins de playback production qui se concurrencent.

En particulier:

- pas de playback final via `HTMLAudioElement` si le runtime supporte le nouveau moteur
- pas de playback final via `HTMLVideoElement` pour la bande son si le nouveau moteur peut la prendre en charge
- pas de backend legacy utilisé comme propriétaire principal
- pas de logique feature-level qui joue le son en dehors du moteur unifié

### 2. Le legacy doit être supprimé après migration

Une fois la migration faite, supprime tout ce qui est devenu inutile dans l'ancien moteur.

Garde uniquement le strict minimum nécessaire à la compatibilité réelle.

### 3. Exception à vérifier: AudioWorklet recording Web

Hypothèse actuelle:

- l'`AudioWorklet` n'est encore nécessaire que pour l'enregistrement quand Atome tourne dans un browser pur
- il ne doit pas rester comme moteur audio playback principal

Tu dois confirmer cette hypothèse dans le code.

Règle:

- si l'`AudioWorklet` est effectivement encore requis uniquement pour le recording browser, conserve uniquement ce strict minimum
- sinon, adapte la cible en expliquant précisément pourquoi

Cette vérification doit être faite spécifiquement pour le mode browser servi par Fastify / FreeBSD, car c'est le seul contexte où un fallback Web peut rester légitime.

### 4. AUv3 sample accuracy ne doit pas régresser

La validation AUv3 actuellement acquise doit rester vraie:

- `play_record_sync` vert
- `sample_alignment` vert
- `delta_samples = 0`
- `suite_finished.status = "ok"`

## Ce que tu dois faire

### Phase A. Audit complet

Fais l'inventaire précis de tous les chemins audio legacy et de tous les points d'entrée qui utilisent encore:

- `backend.html`
- `backend.legacy_auv3`
- `record_audio`
- `record_video`
- chemins WebAudio historiques
- chemins `HTMLAudioElement` / `HTMLVideoElement` utilisés pour du playback production
- bridges legacy iPlug / DSP qui doublonnent le nouveau moteur
- chemins MTrack qui ne sont pas encore pilotés par le moteur unifié
- dépendances système runtime encore nécessaires sur FreeBSD / Tauri pour que le nouveau moteur audio fonctionne réellement

Classe chaque élément dans une des catégories suivantes:

- `à migrer`
- `à garder temporairement comme bridge`
- `à supprimer`
- `à garder définitivement`

Pour les dépendances système FreeBSD / Tauri, précise pour chacune:

- obligatoire ou optionnelle
- playback, record, ou les deux
- usage production ou test seulement

### Phase B. Migration fonctionnelle totale

Migre tout ce qui doit l'être pour que le nouveau moteur prenne réellement possession de:

- playback audio standard
- playback de la bande son vidéo
- playback et preview MTrack
- recording
- transport commun: play / pause / stop / seek / rate / gain / mute

Vérifie explicitement le comportement dans les contextes suivants:

- browser + Fastify / FreeBSD
- app / Tauri
- AUv3

Pour FreeBSD / Tauri, la vérification n'est pas complète tant que les dépendances système minimales nécessaires au moteur audio n'ont pas été confirmées.

### Phase C. Nettoyage agressif du legacy

Quand la migration fonctionnelle est terminée, supprime:

- les branches mortes
- les adaptateurs devenus inutiles
- les anciens chemins de playback qui ne servent plus
- les duplications de logique entre façade, APIs, examples et runtime bridges

Ne laisse subsister que:

- le nouveau moteur
- les bridges encore indispensables
- le fallback browser strictement nécessaire
- l'`AudioWorklet` uniquement s'il est confirmé nécessaire au recording browser

## Modules à traiter en priorité

Tu dois traiter en priorité, sans te limiter à eux:

- `src/application/audio_runtime/audio.facade.js`
- `src/application/audio_runtime/backend.kira.js`
- `src/application/audio_runtime/backend.legacy_auv3.js`
- `src/application/audio_runtime/backend.html.js`
- `eve/application/domains/media/api/audio_api.js`
- `eve/application/domains/media/api/video_api.js`
- `eve/application/domains/media/api/media_api_shared.js`
- `src/application/audio_runtime/record_audio_api.js`
- `src/application/examples/record_audio.js`
- `src/application/examples/record_audio_UI.js`
- `src/application/examples/record_video.js`
- `src/application/examples/record_video_UI.js`
- `src/application/examples/user.js`
- `eve/application/intuition/tools/mtrack.js`
- `eve/application/intuition/tools/audio_engine_debug_runtime.js`
- `platforms/ios/atome-auv3/Common/WebViewManager.swift`
- `platforms/ios/atome-auv3/Common/AudioControllerProtocol.swift`
- `platforms/ios/atome-auv3/auv3/AudioUnitViewController.swift`
- `platforms/ios/atome-auv3/auv3/utils.swift`

## Contraintes techniques

### Playback vidéo

Le rendu visuel vidéo peut rester séparé si nécessaire, mais:

- le son ne doit plus être owned par le player visuel
- le player visuel doit être muté quand le moteur unifié possède la bande son
- les commandes `play/pause/stop/seek/rate` doivent rester synchronisées

### MTrack / MTrax

MTrack doit être traité comme un cas principal, pas comme un addon:

- clock de playback pilotée par le moteur audio quand la timeline est audible
- preview et playback doivent partager la même famille de moteur
- clips audio et clips vidéo avec bande son doivent suivre la même logique de routing

### Recording

Le recording doit converger sur une seule logique produit.

Le browser pur peut garder un chemin spécifique de capture si nécessaire, mais seulement comme adaptation vers le nouveau pipeline, pas comme ancien moteur complet conservé par inertie.

Le prompt doit considérer comme hypothèse de travail que:

- le browser servi par Fastify / FreeBSD peut nécessiter `getUserMedia` + `AudioWorklet` pour la capture
- cette exception ne doit pas contaminer les runtimes Tauri et AUv3

## Livrables obligatoires

Tu dois produire:

1. les modifications de code nécessaires pour la migration
2. le nettoyage du code legacy inutile
3. une note de synthèse claire listant:
   - ce qui a été migré
   - ce qui a été supprimé
   - ce qui a été conservé
   - pourquoi cela a été conservé
4. une mise à jour documentaire si le code final diffère de l'architecture cible

## Critères d'acceptation

Le travail n'est acceptable que si:

1. le nouveau moteur est le chemin principal de playback audio dans Atome/eVe
2. le son des vidéos est intégré à cette logique
3. MTrack / MTrax utilise cette même logique pour les médias audibles
4. les chemins legacy inutiles ont été supprimés
5. l'exception `AudioWorklet` éventuelle est justifiée, minimale et limitée au browser recording
6. AUv3 reste sample-accurate
7. il n'existe plus de double propriété audio entre ancien et nouveau moteur
8. le comportement cible est vérifié en browser avec Fastify / FreeBSD, en app / Tauri, et en AUv3
9. les dépendances système minimales du runtime FreeBSD / Tauri sont documentées, en particulier `JACK` si sa nécessité est confirmée

## Sortie finale attendue

Quand tu auras terminé, réponds avec:

- les fichiers modifiés
- les parties legacy supprimées
- les parties legacy gardées
- la justification précise de chaque partie gardée
- les dépendances système requises par runtime, notamment sur FreeBSD / Tauri
- les tests exécutés
- les risques résiduels éventuels
