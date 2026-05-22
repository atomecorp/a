# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

Atome — MIDI Engine universel (Desktop + Mobile)

Objectif : construire un moteur MIDI universel pour Atome (automation, réception notes/CC, MIDI Learn, mapping, enregistrement/replay), utilisable :
 • Desktop : macOS, Windows, Linux (et FreeBSD si possible)
 • Mobile : iOS, Android
 • Intégrations futures : VST3/AUv3 (V3)

Contraintes non négociables
 • API unique côté Atome (bus d’événements / ADOLE), quel que soit l’OS.
 • Aucune logique MIDI dans l’UI : tout passe par le moteur + event bus.
 • Thread-safe, RT-friendly (pas d’allocations dans le callback temps réel).
 • Horodatage : tous les events MIDI ont un timestamp monotonic.
 • Routage et mapping déterministes (replay possible).
 • Project requirement: integrate the Rust midir library as the primary MIDI management library because it aligns with the WebAssembly target direction and fits the Kira-based audio stack.

⸻

1) Architecture cible

1.1 Modules

 1. atome-midi-core (Rust)
 • Modèle d’événements MIDI normalisé
 • Router/Filter/Mapper
 • MIDI Learn
 • Automation bridge
 • Recording + Replay
 • Clock / Timestamp normalisation
 2. atome-midi-backends (Rust + FFI)
 • Desktop : midir (Win/macOS/Linux)
 • WebAssembly direction: keep the Rust midir integration as the reference backend choice whenever the target runtime allows it, to preserve alignment with Kira.
 • iOS : CoreMIDI bridge (Swift/ObjC → Rust)
 • Android : AMidi (NDK) bridge (Kotlin/Java → Rust)
 • Option FreeBSD : backend dédié (voir section 9)
 3. atome-midi-ipc (Tauri / Axum / Fastify selon cibles)
 • Expose API au runtime Atome (JS/TS)
 • Subscriptions (pub/sub)
 • Commandes (open port, map, learn, record)
 4. atome-midi-ui (JS/TS)
 • Panneaux : ports, monitoring, MIDI learn, mapping
 • Aucune logique temps réel

1.2 Flux (résumé)
 • OS MIDI → Backend → MidiEvent → Router → (Learn/Map/Automation/Record) → Event Bus Atome
 • Atome (Automation, mapping) → Commandes → Router → Output MIDI (plus tard)

⸻

1) Spécification des événements MIDI

2.1 Format interne normalisé

Définir un type unique MidiEvent (sans allocations dans le callback) :
 • timestamp_ns: u64 (monotonic)
 • source_id: MidiSourceId
 • channel: u8 (0..15)
 • kind: MidiKind

MidiKind (minimum) :
 • NoteOn { note: u8, vel: u8 }
 • NoteOff { note: u8, vel: u8 }
 • CC { cc: u8, value: u8 }
 • PitchBend { value14: u16 }
 • Aftertouch { pressure: u8 }
 • PolyAftertouch { note: u8, pressure: u8 }
 • ProgramChange { program: u8 }
 • SysEx { len: u16, data_ref: SysExRef } (optionnel MVP)
 • Clock/Start/Stop/Continue (optionnel MVP)

2.2 Parsing
 • Desktop (midir) : bytes → parse vers MidiEvent
 • iOS/Android : récupérer messages (packets) → parse identique

2.3 Normalisation
 • Toujours produire timestamp_ns local (monotonic) + option wallclock_ms (debug)
 • Conserver la source (port/device)

⸻

1) Gestion des ports et devices

3.1 Identité stable d’un port

Définir un identifiant stable MidiPortUID (persistant) :
 • macOS : CoreMIDI unique ID
 • Windows : device ID + name hash
 • Linux : ALSA client:port
 • iOS/Android : endpoint ID

Stockage : table/propriété Atome (persistable) :
 • nom, uid, type (in/out), dernière vue, état (enabled)

3.2 API Ports (MVP)
 • List inputs
 • Open input
 • Close input
 • Subscribe events
 • Hotplug (device added/removed)

⸻

1) Router / Filters / Transforms

4.1 Router

Le Router reçoit MidiEvent et le dispatch vers :
 • Monitoring
 • MIDI Learn
 • Mapping
 • Automation
 • Recording

4.2 Filtres
 • par source
 • par canal
 • par type (notes/CC)
 • par note range

4.3 Transform
 • remap channel
 • CC scaling (0..127 → 0..1)
 • curves (lin/log)
 • deadzone / smoothing (pour knobs)

⸻

1) MIDI Learn

5.1 Objectif

Associer un contrôle MIDI (ex: CC74 ch1 source X) à une cible Atome :
 • propriété d’un atome (ex opacity, x, filter.cutoff)
 • paramètre DSP
 • commande transport

5.2 Modèle

LearnTarget :
 • target_type : AtomeProperty | DSPParam | Command
 • target_id : (atom_id + property_path) ou param_id
 • range : min/max
 • curve : linear/log/custom

LearnBinding :
 • source_uid
 • channel
 • message : CC/Note/PitchBend
 • id : cc number / note
 • mode : absolute | relative (optionnel)

5.3 Procédure Learn
 • UI déclenche start_learn(target)
 • moteur passe en état Learning(target)
 • premier event compatible reçu → créé binding
 • UI affiche confirmation
 • stop_learn()

5.4 Conflits
 • Si binding déjà existant → choix : remplacer / dupliquer / annuler

⸻

1) Automation (Atome)

6.1 But

Convertir un flux MIDI en modifications de propriétés Atome déterministes.

6.2 Mapping vers propriétés
 • Chaque LearnBinding est un mapping : MIDI → valeur normalisée (0..1) → propriété.
 • Appliquer : scaling, curve, smoothing.

6.3 Écriture dans le modèle Atome
 • Les changements générés doivent produire des events Atome (bus) qui :
 • peuvent être enregistrés
 • peuvent être rejoués
 • respectent les IDs (atom_id / property_path)

6.4 Throttling
 • CC peut spammer : implémenter un throttle (ex 120 Hz max) et/ou coalescing.

⸻

1) Recording & Replay (MVP+)

7.1 Enregistrement MIDI brut
 • record events avec timestamp
 • sauvegarde : JSONL / binary (Protobuf) selon perf

7.2 Enregistrement Automation Atome
 • Option : enregistrer uniquement les events Atome produits (plus utile pour replay)

7.3 Replay
 • replayer lit le flux + respecte timestamps
 • mode : realtime | step | scrub (optionnel)

⸻

1) API publique (contrats)

8.1 Commands (JS → Rust)
 • midi.listInputs()
 • midi.openInput(uid)
 • midi.closeInput(uid)
 • midi.subscribe()
 • midi.startLearn(target)
 • midi.stopLearn()
 • midi.saveBindings() / midi.loadBindings()
 • midi.setBinding(bindingId, config)
 • midi.removeBinding(bindingId)
 • midi.startRecord(mode) / midi.stopRecord()
 • midi.replay(recordingId, options)

8.2 Events (Rust → JS)
 • midi:event (raw monitoring)
 • midi:learn:hit
 • midi:binding:changed
 • automation:event (Atome property write)
 • device:added/removed

⸻

1) Backends par OS

9.1 Desktop MVP (macOS/Windows/Linux)
 • Utiliser midir.
 • Treat midir as the required Rust integration baseline for MIDI management, including the WebAssembly-oriented architecture path and Kira interoperability.
 • Implémenter :
 • enumeration ports
 • open input + callback
 • hotplug (si support, sinon polling)

9.2 iOS (CoreMIDI)
 • Créer un module Swift minimal :
 • liste endpoints
 • ouvre input port
 • callback reçoit packets
 • forward vers Rust via FFI (C ABI)

9.3 Android (AMidi)
 • Créer module Kotlin/NDK :
 • ouverture device
 • callback reçoit messages
 • forward Rust via JNI

9.4 FreeBSD (option)
 • Évaluer :
 • sndio/rtmidi port (si disponible)
 • ou un backend custom via /dev/umidi* + ioctl
 • Tant que non stable : le marquer “experimental”.

⸻

1) Qualité temps réel (RT)

10.1 Règles RT
 • callback MIDI :
 • pas d’alloc
 • pas de locks bloquants
 • push dans un ring buffer (SPSC)

10.2 Buffers
 • SPSC ring buffer : backend → core
 • Core thread : parse + route + dispatch

10.3 Horloge
 • Instant::now() monotonic pour timestamp

⸻

1) Panneaux UI (MVP)

 1. MIDI Monitor
 • affiche source, channel, type, data, timestamp
 2. Ports
 • liste inputs
 • enable/disable
 3. MIDI Learn
 • bouton “Learn” par target
 • affiche binding
 4. Mappings
 • courbe, min/max, smoothing, throttle

⸻

1) Plan de tâches (checklist exécutable)

Phase A — Core Rust (MVP)

 1. Créer crate atome-midi-core.
 2. Définir MidiEvent, MidiKind, MidiSourceId, MidiPortUID.
 3. Implémenter parser bytes → MidiEvent (Note/CC/PB minimum).
 4. Implémenter Router (dispatch) + filtres.
 5. Implémenter storage bindings (serde) + IDs stables.
 6. Implémenter MIDI Learn state machine.
 7. Implémenter mapping MIDI→value (0..1) + curves (linear + log) + smoothing.
 8. Implémenter automation writer : MidiEvent → Atome bus event (property write).
 9. Implémenter throttle/coalescing.
 10. Ajouter tests : parsing, mapping, learn, throttle.

Phase B — Desktop backend (MVP)
 11. Créer crate atome-midi-backend-midir.
 11b. Validate the midir-first integration path against the WebAssembly target direction and the Kira audio architecture before widening backend coverage.
 12. Lister ports inputs + construire MidiPortUID.
 13. Ouvrir input + callback → ring buffer.
 14. Thread core consume ring buffer → route.
 15. Hotplug : polling 1s (MVP) + events added/removed.

Phase C — Bridge Tauri (MVP)
 16. Définir commandes Tauri invoke.
 17. Définir event streaming (emit) : midi:event, automation:event.
 18. Gérer subscriptions + backpressure.
 19. Persister bindings dans le storage projet Atome.

Phase D — UI (MVP)
 20. Construire panneau Ports.
 21. Construire MIDI Monitor.
 22. Construire MIDI Learn UI (start/stop, affichage binding).
 23. Construire panneau Mapping (min/max/curve/smoothing).

Phase E — Recording/Replay (V1)
 24. Enregistrer flux MIDI brut (timestamp) + sauvegarde.
 25. Enregistrer flux automation Atome.
 26. Replay realtime.

Phase F — Mobile backends (V2)
 27. iOS : module CoreMIDI (Swift) + FFI vers Rust.
 28. Android : AMidi (NDK) + JNI vers Rust.
 29. Valider latence + stabilité.

Phase G — Plugins (V3)
 30. VST3 : récupérer MIDI/transport via API plugin.
 31. AUv3 (iOS/macOS) : idem.
 32. Unifier : plugin mode vs standalone mode.

⸻

1) Critères de validation

MVP
 • Recevoir NoteOn/NoteOff/CC sur macOS + Windows + Linux.
 • Monitoring stable, pas de drop visible.
 • MIDI Learn : binder un CC à une propriété Atome et contrôler en temps réel.
 • Mapping : curve + min/max fonctionnels.
 • Throttle : pas de spam UI.

V2
 • iOS/Android : recevoir MIDI d’un contrôleur USB.
 • mêmes bindings, mêmes IDs.

V3
 • plugin reçoit MIDI du DAW.
 • automation/learn identiques.

⸻

1) Notes d’implémentation (pragmatiques)
 • MVP sans SysEx (sauf besoin immédiat).
 • Relative CC (endless encoders) : à ajouter après le MVP.
 • Transport MIDI Clock : optionnel MVP.
 • Stockage bindings : JSON simple d’abord.

⸻

1) Dossiers suggérés (Atome)
 • src/squirrel/midi/core/ (Rust core)
 • src/squirrel/midi/backends/midir/
 • src/squirrel/midi/backends/ios/
 • src/squirrel/midi/backends/android/
 • eVe/tools/midi/ (UI)
 • eVe/runtime/midi_bridge/ (IPC)
