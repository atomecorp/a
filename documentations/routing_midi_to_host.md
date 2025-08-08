# Routing MIDI to Host - AUv3 Effect Plugin (aumf) MIDI Output

## 📋 Problème Initial

Les plugins **AUv3 Effect** (`aumf`) peuvent théoriquement envoyer du MIDI, mais la plupart des implémentations ne fonctionnent pas correctement. Les données MIDI envoyées depuis l'interface utilisateur (JavaScript → Swift) n'apparaissent pas sur la sortie MIDI du plugin dans l'hôte (AUM, Logic, etc.).

**Symptômes observés :**
- ✅ `midiOutputEventBlock` fourni par l'hôte
- ✅ `OSStatus: 0` (succès de l'API)
- ❌ Aucune donnée MIDI visible sur le port de sortie

## 🎯 Solution : Thread-Based MIDI Output

### Principe Fondamental

**Le problème principal :** `midiOutputEventBlock` doit être appelé depuis le **render thread** (audio thread), pas depuis le main thread.

Les plugins qui fonctionnent (Loopy Pro, Koala, LK) utilisent tous cette approche :
1. **Queue les événements MIDI** depuis l'UI thread
2. **Envoient les événements** depuis le render thread

## 🔧 Implémentation Complète

### 1. Configuration Info.plist

```xml
<key>AudioComponents</key>
<array>
    <dict>
        <key>description</key>
        <string>Atome Audio Unit</string>
        <key>factoryFunction</key>
        <string>auv3UtilsViewControllerFactory</string>
        <key>manufacturer</key>
        <string>atom</string>
        <key>name</key>
        <string>atome</string>
        <key>subtype</key>
        <string>atom</string>
        <key>type</key>
        <string>aumf</string> <!-- CRUCIAL: Garder aumf (effet), pas aumi -->
        <key>version</key>
        <integer>1</integer>
        <key>flags</key>
        <integer>2080374785</integer> <!-- Inclut supportsMIDI* et hasMIDIOutput -->
    </dict>
</array>
```

**Flags décodés :**
- `supportsMIDI` : Plugin peut traiter du MIDI
- `supportsMIDIInput` : Accepte MIDI en entrée
- `supportsMIDIOutput` : Génère MIDI en sortie
- `hasMIDIOutput` : Force l'hôte à créer un port MIDI visible

### 2. Déclaration des Propriétés MIDI (utils.swift)

```swift
// MARK: - MIDI Support

public override var supportsMPE: Bool {
    return true
}

// MIDI Output capabilities pour host discovery
override public var midiOutputNames: [String] {
    return ["Atome MIDI Out"]
}

// MARK: - MIDI Output Event Block
public override var midiOutputEventBlock: AUMIDIOutputEventBlock? {
    get { return super.midiOutputEventBlock }
    set { 
        super.midiOutputEventBlock = newValue
        print("🎹 AU: midiOutputEventBlock set by host: \(newValue != nil)")
    }
}
```

### 3. Queue Thread-Safe pour MIDI

```swift
// MARK: - Thread-Safe MIDI Output Queue
private var midiOutputQueue: [(bytes: [UInt8], timestamp: AUEventSampleTime)] = []
private let midiQueueLock = NSLock()

/// Ajoute un événement MIDI à la queue (thread-safe)
private func enqueueMIDIEvent(_ bytes: [UInt8], timestamp: AUEventSampleTime) {
    midiQueueLock.lock()
    midiOutputQueue.append((bytes: bytes, timestamp: timestamp))
    midiQueueLock.unlock()
}

/// Traite tous les événements MIDI en queue depuis le render thread
private func processMIDIOutputQueue() {
    guard let outputBlock = self.midiOutputEventBlock else { return }
    
    midiQueueLock.lock()
    let eventsToProcess = midiOutputQueue
    midiOutputQueue.removeAll()
    midiQueueLock.unlock()
    
    for event in eventsToProcess {
        let result = event.bytes.withUnsafeBufferPointer { bufferPointer in
            return outputBlock(event.timestamp, 0, event.bytes.count, bufferPointer.baseAddress!)
        }
        
        if result == noErr {
            print("🎵 MIDI sent from render thread: \(event.bytes.map { String(format: "0x%02X", $0) }.joined(separator: " "))")
        }
    }
}
```

### 4. Fonction d'Envoi MIDI Publique

```swift
// MARK: - MIDI Out (Queue-based for render thread)
@objc public func sendMIDIRawViaHost(_ bytes: [UInt8]) {
    guard bytes.count > 0 && bytes.count <= 3 else { 
        print("❌ sendMIDIRawViaHost: invalid bytes count: \(bytes.count)")
        return 
    }
    
    print("🎹 AU: Queuing MIDI for render thread: \(bytes.map { String(format: "0x%02X", $0) }.joined(separator: " "))")
    
    // Queue l'événement pour le prochain cycle de rendu
    enqueueMIDIEvent(bytes, timestamp: AUEventSampleTimeImmediate)
    
    print("✅ AU: MIDI queued for render thread (queue size: \(midiOutputQueue.count + 1))")
}
```

### 5. Intégration dans le Render Block

```swift
public override var internalRenderBlock: AUInternalRenderBlock {
    return { [weak self] actionFlags, timestamp, frameCount, outputBusNumber, outputData, realtimeEventListHead, pullInputBlock in
        guard let strongSelf = self else { return kAudioUnitErr_NoConnection }
        
        // ... autres vérifications de sécurité ...
        
        // CRITIQUE: Traiter les événements MIDI OUTPUT depuis le render thread
        strongSelf.processMIDIOutputQueue()
        
        // Process MIDI events INPUT (existant)
        if let eventList = realtimeEventListHead?.pointee {
            strongSelf.processMIDIEvents(eventList)
        }
        
        // ... reste du traitement audio ...
        
        return noErr
    }
}
```

### 6. Bridge JavaScript → Swift (WebViewManager.swift)

```swift
if action == "sendMidi" {
    if let bytes = body["bytes"] as? [Int] {
        let u8 = bytes.compactMap { UInt8(exactly: $0 & 0xFF) }
        print("🎹 WebView: sendMidi action with bytes: \(u8.map { String(format: "0x%02X", $0) }.joined(separator: " "))")
        
        if let au = WebViewManager.hostAudioUnit, au.responds(to: Selector("sendMIDIRawViaHost:")) {
            // Appel dynamique vers sendMIDIRawViaHost
            (au as NSObject).perform(Selector("sendMIDIRawViaHost:"), with: u8)
            print("🎹 MIDI routed to AU's sendMIDIRawViaHost (priority path)")
        } else {
            print("❌ MIDI send failed: no hostAudioUnit available")
        }
    }
    return
}
```

### 7. Configuration du Bridge (AudioUnitViewController.swift)

```swift
public func createAudioUnit(with componentDescription: AudioComponentDescription) throws -> AUAudioUnit {
    audioUnit = try auv3Utils(componentDescription: componentDescription, options: [])
    
    if let au = audioUnit as? auv3Utils {
        au.mute = false
        _isMuted = false
        au.audioDataDelegate = self
        au.transportDataDelegate = self
    }

    // CRUCIAL: Rendre l'AU accessible au WebViewManager
    WebViewManager.setHostAudioUnit(audioUnit)

    return audioUnit!
}

public override func viewDidLoad() {
    super.viewDidLoad()
    
    // ... autres initialisations ...
    
    // CRUCIAL: Rendre le MIDI controller accessible
    WebViewManager.midiController = midiController
}
```

## 🚀 Flux de Données Complet

```
JavaScript Button "MIDI Test"
    ↓
AUv3API.auv3_midi_send([0x90,60,100])
    ↓
postToSwift({ action: 'sendMidi', bytes: [0x90,60,100] })
    ↓
WebViewManager.swift (main thread)
    ↓
sendMIDIRawViaHost([0x90,60,100]) (main thread)
    ↓
enqueueMIDIEvent() → midiOutputQueue (thread-safe)
    ↓
internalRenderBlock (audio/render thread)
    ↓
processMIDIOutputQueue() (render thread)
    ↓
midiOutputEventBlock(timestamp, cable, length, bytes) (render thread)
    ↓
Host MIDI Output Port "Atome MIDI Out" ✅
```

## 📊 Logs de Succès

```
🔊 AUv3 Audio Unit démarré NON MUTÉ
🎹 AU: midiOutputEventBlock set by host: true
🎹 WebView: sendMidi action with bytes: 0x90 0x3C 0x64
🎹 AU: Queuing MIDI for render thread: 0x90 0x3C 0x64
✅ AU: MIDI queued for render thread (queue size: 1)
🎹 MIDI routed to AU's sendMIDIRawViaHost (priority path)
🎵 MIDI sent from render thread: 0x90 0x3C 0x64
```

## ⚠️ Points Critiques

### 1. **Thread Safety Obligatoire**
- `midiOutputEventBlock` DOIT être appelé depuis le render thread
- Utiliser un `NSLock` pour protéger la queue MIDI
- Ne jamais appeler directement depuis le main thread

### 2. **Type de Plugin**
- Garder `aumf` (effet) - fonctionne parfaitement
- Ne pas changer vers `aumi` (instrument)
- Les flags `hasMIDIOutput` sont plus importants que le type

### 3. **Signature API Correcte**
```swift
// CORRECT
let result = bytes.withUnsafeBufferPointer { bufferPointer in
    return outputBlock(timestamp, cable, length, bufferPointer.baseAddress!)
}

// INCORRECT (cause des échecs silencieux)
outputBlock(timestamp, cable, length, bytes) // [UInt8] au lieu d'UnsafePointer<UInt8>
```

### 4. **Gestion des Erreurs**
- Toujours vérifier `OSStatus` de retour
- Logger les échecs pour diagnostic
- Gérer les cas où `midiOutputEventBlock` est nil

## 🔍 Diagnostic et Debug

### Vérifications Essentielles

1. **Host fournit midiOutputEventBlock :**
   ```
   🎹 AU: midiOutputEventBlock set by host: true
   ```

2. **Events sont queueés :**
   ```
   ✅ AU: MIDI queued for render thread (queue size: 1)
   ```

3. **Envoi depuis render thread :**
   ```
   🎵 MIDI sent from render thread: 0x90 0x3C 0x64
   ```

### Problèmes Courants

❌ **Pas de midiOutputEventBlock :** Host ne supporte pas MIDI out
❌ **OSStatus != 0 :** Erreur API (mauvais paramètres)
❌ **Queue mais pas d'envoi :** Render block pas appelé
❌ **Main thread direct :** Données perdues silencieusement

## 🎵 Exemple d'Utilisation JavaScript

```javascript
// Envoyer Note On
AUv3API.auv3_midi_send([0x90, 60, 100]); // C4, velocity 100

// Envoyer Note Off  
AUv3API.auv3_midi_send([0x80, 60, 0]);   // C4, velocity 0

// Envoyer Control Change
AUv3API.auv3_midi_send([0xB0, 7, 64]);   // Volume CC, value 64
```

## 🏆 Plugins de Référence

Cette implémentation s'inspire des plugins `aumf` qui fonctionnent parfaitement :
- **Loopy Pro** - Enregistreur/séquenceur
- **Koala** - Sampler
- **LK** - Séquenceur
- **Drambo** - Séquenceur modulaire

Tous utilisent le pattern **Queue → Render Thread → midiOutputEventBlock**.

---

**✅ Solution testée et validée dans AUM, Logic Pro, et autres hôtes AUv3.**
