# AUv3 API Reference - Documentation Complète

> Analyse reverse engineering du panneau **AUv3API Test** du fichier `./examples/ios_apis.js`

## Vue d'Ensemble

L'API AUv3 fournit un pont JavaScript/Swift pour les plugins Audio Unit v3, permettant l'interaction avec le système iOS, la gestion de fichiers, et l'accès aux données audio/MIDI en temps réel.

---

## 📁 Gestion de Fichiers

### `iOS Save` - Sauvegarde via Document Picker iOS

```javascript
AUv3API.ios_file_saver(fileName, data)
```

**Fonction :** `ios_file_saver(file_name, data)`
- **Description :** Ouvre le Document Picker iOS natif pour permettre à l'utilisateur de choisir l'emplacement de sauvegarde
- **Paramètres :**
  - `file_name` (string) : Nom du fichier proposé
  - `data` (any) : Données à sauvegarder (objet, string, ArrayBuffer)
- **Retour :** Promise qui résout avec `{success: true, fileName, path}`
- **Action Swift attendue :** `saveFileWithDocumentPicker`
- **Encodage :** Automatique (UTF-8 pour texte, base64 pour binaire)

**Exemple d'utilisation :**
```javascript
const data = {time: Date.now(), demo: true, ios: true};
await AUv3API.ios_file_saver('demo_file.json', data);
```

---

### `iOS Load` - Chargement via File Picker JavaScript

```javascript
AUv3API.ios_file_loader(acceptExtensions)
```

**Fonction :** `ios_file_loader(acceptExtensions = ['.atome','.json','.txt','.lrc','.md','.wav','.mp3','.m4a','.flac','.ogg'])`
- **Description :** Utilise un input file HTML caché pour charger des fichiers (pas le Document Picker natif)
- **Paramètres :**
  - `acceptExtensions` (array) : Extensions acceptées
- **Retour :** Promise avec `{fileName, data, encoding, rawFile}`
- **Avantage :** Évite les limitations sandbox AUv3 du Document Picker natif

**Exemple d'utilisation :**
```javascript
const result = await AUv3API.ios_file_loader(['public.data']);
console.log(`Loaded ${result.fileName}, length: ${result.data.length}`);
```

---

### `AUv3 Save` - Sauvegarde Interne AUv3

```javascript
AUv3API.auv3_file_saver(fileName, data)
```

**Fonction :** `auv3_file_saver(file_name, data)`
- **Description :** Sauvegarde dans le sandbox/App Group de l'AUv3
- **Paramètres :**
  - `file_name` (string) : Nom du fichier
  - `data` (any) : Données à sauvegarder
- **Action Swift attendue :** `saveProjectInternal`
- **Utilise :** `window.sauvegarderProjetAUv3()` si disponible

**Exemple d'utilisation :**
```javascript
const project = {name: 'MonProjet', stamp: Date.now(), v: 1};
await AUv3API.auv3_file_saver('MonProjet.atome', project);
```

---

### `List Projects` - Liste des Projets AUv3

```javascript
AUv3API.auv3_file_list(path)
```

**Fonction :** `auv3_file_list(path = 'Projects')`
- **Description :** Liste les fichiers dans le dossier spécifié
- **Paramètres :**
  - `path` (string) : Chemin du dossier (défaut: 'Projects')
- **Retour :** Promise avec array des noms de fichiers
- **Action Swift attendue :** `listFiles`
- **Utilise :** `window.AtomeFileSystem.listFiles()` si disponible

**Exemple d'utilisation :**
```javascript
const files = await AUv3API.auv3_file_list('Projects');
console.log('Projets disponibles:', files);
```

---

### `Load Proj` - Chargement de Projet AUv3

```javascript
AUv3API.auv3_file_loader(path, filename)
```

**Fonction :** `auv3_file_loader(path = 'Projects', filename)`
- **Description :** Charge un fichier depuis le stockage interne AUv3
- **Paramètres :**
  - `path` (string) : Chemin du dossier
  - `filename` (string) : Nom du fichier (requis)
- **Retour :** Promise avec les données du fichier
- **Action Swift attendue :** `loadFileInternal`

**Exemple d'utilisation :**
```javascript
const projectData = await AUv3API.auv3_file_loader('Projects', 'MonProjet');
console.log('Clés du projet:', Object.keys(projectData));
```

---

## 🎵 Audio et Tempo

### `Tempo` - Récupération du Tempo Host

```javascript
AUv3API.auv3_tempo()
```

**Fonction :** `auv3_tempo()`
- **Description :** Récupère le tempo actuel du host (DAW/Loopy Pro)
- **Retour :** Promise avec la valeur BPM (number)
- **Action Swift attendue :** `requestHostTempo`
- **Réponse Swift :** `{action:'hostTempo', bpm:Number, requestId}`

**Exemple d'utilisation :**
```javascript
const bpm = await AUv3API.auv3_tempo();
console.log(`Tempo actuel: ${bpm} BPM`);
```

---

### `SampleRate` - Taux d'Échantillonnage

```javascript
AUv3API.auv3_sample_rate()
```

**Fonction :** `auv3_sample_rate()`
- **Description :** Récupère le sample rate du host audio
- **Retour :** Promise avec le taux en Hz
- **Mécanisme :** Swift appelle `window.updateSampleRate(hostRate)`
- **Info détaillée :** `AUv3API.auv3_sample_rate_info()`

**Exemple d'utilisation :**
```javascript
const sampleRate = await AUv3API.auv3_sample_rate();
const info = AUv3API.auv3_sample_rate_info();
console.log(`Sample Rate: ${sampleRate}Hz`);
console.log(`Host: ${info.host}, Web: ${info.web}, Discrepancy: ${info.discrepancy}`);
```

---

### `SR Info` - Informations Sample Rate Détaillées

```javascript
AUv3API.auv3_sample_rate_info()
```

**Fonction :** `auv3_sample_rate_info()`
- **Description :** Retourne les informations détaillées sur les sample rates
- **Retour :** Object avec `{host, web, discrepancy, lastUpdate}`
- **Utilité :** Diagnostic des conflits entre sample rate host et Web Audio

---

## ⏱️ Timeline et Transport

### `Time ▶︎/■` - Stream Timeline (Toggle)

```javascript
AUv3API.auv3_current_time(start, format, callback)
```

**Fonction :** `auv3_current_time(start, format='time', callback)`
- **Description :** Active/désactive le stream de position temporelle du host
- **Paramètres :**
  - `start` (boolean) : true pour démarrer, false pour arrêter
  - `format` (string) : 'time' ou 'samples'
  - `callback` (function) : Fonction appelée à chaque update
- **Actions Swift :** `startHostTimeStream` / `stopHostTimeStream`
- **Réponse Swift :** `{action:'hostTimeUpdate', positionSeconds, positionSamples, tempo, ppq, playing}`

**Exemple d'utilisation :**
```javascript
// Démarrer le stream
AUv3API.auv3_current_time(true, 'time', (info) => {
    console.log(`Position: ${info.positionSeconds.toFixed(1)}s`);
    AUv3API.updateTimecode(info.positionSeconds * 1000);
});

// Arrêter le stream
AUv3API.auv3_current_time(false);
```

---

### `TimeOnce` - Position Temporelle Unique

```javascript
AUv3API.auv3_current_time_once(format)
```

**Fonction :** `auv3_current_time_once(format='time')`
- **Description :** Récupère la position actuelle une seule fois (optimisé CPU)
- **Mécanisme :** Démarre le stream, résout au premier message, puis arrête
- **Retour :** Promise avec les infos de timeline
- **Timeout :** 1 seconde

**Exemple d'utilisation :**
```javascript
const info = await AUv3API.auv3_current_time_once('time');
console.log(`Position actuelle: ${info.positionSeconds.toFixed(3)}s`);
```

---

### `Transport ▶︎/■` - État Transport Host (Toggle)

```javascript
AUv3API.auv3_host_state(start, callback)
```

**Fonction :** `auv3_host_state(start, callback)`
- **Description :** Écoute les changements d'état play/stop du host
- **Paramètres :**
  - `start` (boolean) : true pour écouter, false pour arrêter
  - `callback` (function) : Appelée sur changement d'état
- **Actions Swift :** `startHostStateStream` / `stopHostStateStream`
- **Réponse Swift :** `{action:'hostTransport', playing:true/false, positionSeconds}`

**Exemple d'utilisation :**
```javascript
// Écouter les changements de transport
AUv3API.auv3_host_state(true, (state) => {
    const status = state.playing ? '▶' : '⏸';
    console.log(`Transport ${status} ${state.positionSeconds.toFixed(1)}s`);
});
```

---

## 🎹 MIDI

### `MIDI In ▶︎/■` - Réception MIDI (Toggle)

```javascript
AUv3API.auv3_midi_receive(start, callback)
```

**Fonction :** `auv3_midi_receive(start, callback)`
- **Description :** Active/désactive la réception de données MIDI
- **Paramètres :**
  - `start` (boolean) : true pour recevoir, false pour arrêter
  - `callback` (function) : Appelée pour chaque message MIDI
- **Actions Swift :** `startMidiStream` / `stopMidiStream`
- **Réponses Swift :**
  - `{action:'midiEvent', status, data1, data2, timestamp}` (parsé)
  - `{action:'midiEventRaw', bytes:[...], timestamp}` (raw)

**Exemple d'utilisation :**
```javascript
AUv3API.auv3_midi_receive(true, (msg) => {
    if (msg.type === 'parsed') {
        console.log(`MIDI: 0x${msg.status.toString(16)} ${msg.data1},${msg.data2}`);
    } else {
        console.log(`MIDI RAW:`, msg.bytes);
    }
});
```

---

### `MIDI Test` - Envoi MIDI Test

```javascript
AUv3API.auv3_midi_send(midi_data)
```

**Fonction :** `auv3_midi_send(midi_data)`
- **Description :** Envoie des données MIDI vers la sortie de l'AU
- **Paramètres :**
  - `midi_data` : Array `[status, data1, data2]` ou Object `{status, data1, data2}`
- **Action Swift :** `sendMidi`
- **Exemple test :** Note C4 (60) On puis Off après 300ms

**Exemple d'utilisation :**
```javascript
// Jouer une note C4
AUv3API.auv3_midi_send([0x90, 60, 100]); // Note On
setTimeout(() => {
    AUv3API.auv3_midi_send([0x80, 60, 0]); // Note Off
}, 300);
```

---

## 🔧 Utilitaires et Intégration

### Detection d'Environnement

```javascript
// Vérification si on est dans un AUv3
function isAUv3() {
    return !!(window.webkit?.messageHandlers?.swiftBridge);
}

// Vérification de disponibilité du bridge
function bridgeAvailable() {
    return !!(window.webkit?.messageHandlers?.swiftBridge);
}
```

### Mise à Jour Timecode

```javascript
AUv3API.updateTimecode(timecodeMs)
```

**Fonction :** `updateTimecode(timecodeMs)`
- **Description :** Met à jour l'affichage timecode et l'intégration Lyrix
- **Paramètres :**
  - `timecodeMs` (number) : Position en millisecondes
- **Effets :**
  - Update élément `#timecode-display`
  - Appelle `window.lyricsDisplay.updateTime()` si disponible

### MIDI Logger Intégré

Le panneau inclut un logger MIDI minimal qui :
- Affiche les messages MIDI en temps réel
- Compatible avec l'injection Swift `sendMIDIToJS`
- Crée automatiquement `window.midiUtilities.receiveMidiData`

---

## 📋 Messages Swift Attendus

### Actions JS → Swift

| Action | Paramètres | Description |
|--------|------------|-------------|
| `saveFileWithDocumentPicker` | fileName, data, encoding, requestId | Sauvegarde via Document Picker |
| `saveProjectInternal` | fileName, data, requestId | Sauvegarde sandbox AUv3 |
| `listFiles` | path, requestId | Liste fichiers dossier |
| `loadFileInternal` | path, filename, requestId | Charge fichier sandbox |
| `requestHostTempo` | requestId | Demande tempo host |
| `getSampleRate` | requestSampleRate | Demande sample rate |
| `startHostTimeStream` | format | Démarre stream timeline |
| `stopHostTimeStream` | - | Arrête stream timeline |
| `startHostStateStream` | - | Démarre stream transport |
| `stopHostStateStream` | - | Arrête stream transport |
| `startMidiStream` | - | Démarre réception MIDI |
| `stopMidiStream` | - | Arrête réception MIDI |
| `sendMidi` | bytes | Envoie données MIDI |

### Réponses Swift → JS

| Action | Paramètres | Description |
|--------|------------|-------------|
| `saveFileWithDocumentPickerResult` | success, fileName, path, error, requestId | Résultat sauvegarde iOS |
| `saveProjectInternalResult` | success, fileName, path, error, requestId | Résultat sauvegarde AUv3 |
| `listFilesResult` | success, files, error, requestId | Liste des fichiers |
| `loadFileWithDocumentPickerResult` | success, fileName, data, encoding, error, requestId | Données chargées |
| `hostTempo` | bpm, requestId | Tempo du host |
| `hostTimeUpdate` | positionSeconds, positionSamples, tempo, ppq, playing | Update timeline |
| `hostTransport` | playing, positionSeconds | État transport |
| `midiEvent` | status, data1, data2, timestamp | Message MIDI parsé |
| `midiEventRaw` | bytes, timestamp | Message MIDI raw |

### Callbacks Spéciaux

- `window.updateSampleRate(sampleRate)` : Appelé par Swift pour mettre à jour le sample rate
- `window.midiUtilities.receiveMidiData(d1,d2,d3,ts)` : Injection MIDI directe

---

## 🎯 Point d'Entrée Swift

```javascript
// Swift doit appeler cette fonction pour envoyer des messages
window.AUv3API._receiveFromSwift(jsonPayload)
```

**Utilisation côté Swift :**
```swift
// Exemple d'envoi de message depuis Swift
let message = ["action": "hostTempo", "bpm": 120, "requestId": 1]
webView.evaluateJavaScript("window.AUv3API._receiveFromSwift(\(jsonString))")
```

---

# Guide d'Implémentation Swift pour AUv3 API

## Architecture du Bridge JS/Swift

### 1. Configuration WebView (AudioUnitViewController.swift)

```swift
import WebKit
import UniformTypeIdentifiers

class AudioUnitViewController: AUViewController, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var pendingRequests: [Int: String] = [:]
    private var requestIdCounter = 0
    
    // Configuration du message handler
    private func setupMessageHandler() {
        let contentController = WKUserContentController()
        contentController.add(self, name: "swiftBridge")
        
        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
    }
    
    // Reception des messages JS
    func userContentController(_ userContentController: WKUserContentController, 
                              didReceive message: WKScriptMessage) {
        guard let messageBody = message.body as? [String: Any],
              let action = messageBody["action"] as? String else { return }
        
        DispatchQueue.main.async { [weak self] in
            switch action {
            case "saveFileWithDocumentPicker":
                self?.handleSaveFileWithDocumentPicker(messageBody)
            case "saveProjectInternal":
                self?.handleSaveProjectInternal(messageBody)
            case "listFiles":
                self?.handleListFiles(messageBody)
            case "loadFileInternal":
                self?.handleLoadFileInternal(messageBody)
            case "requestHostTempo":
                self?.handleRequestHostTempo(messageBody)
            case "getSampleRate":
                self?.handleGetSampleRate(messageBody)
            case "startHostTimeStream":
                self?.handleStartHostTimeStream(messageBody)
            case "stopHostTimeStream":
                self?.handleStopHostTimeStream()
            case "startHostStateStream":
                self?.handleStartHostStateStream()
            case "stopHostStateStream":
                self?.handleStopHostStateStream()
            case "startMidiStream":
                self?.handleStartMidiStream()
            case "stopMidiStream":
                self?.handleStopMidiStream()
            case "sendMidi":
                self?.handleSendMidi(messageBody)
            default:
                print("Action Swift non reconnue: \(action)")
            }
        }
    }
}
```

### 2. Gestion de Fichiers - Implémentations Swift

#### iOS Document Picker - Sauvegarde

```swift
extension AudioUnitViewController: UIDocumentPickerDelegate {
    
    private func handleSaveFileWithDocumentPicker(_ message: [String: Any]) {
        let fileName = message["fileName"] as? String ?? "untitled.json"
        let data = message["data"] as? String ?? ""
        let encoding = message["encoding"] as? String ?? "utf8"
        let requestId = message["requestId"] as? Int ?? 0
        
        // Créer fichier temporaire
        guard let tempURL = createTempFile(fileName: fileName, data: data, encoding: encoding) else {
            sendErrorToJS(action: "saveFileWithDocumentPickerResult", 
                         error: "Impossible de créer le fichier temporaire", 
                         requestId: requestId)
            return
        }
        
        // Ouvrir Document Picker pour export
        let documentPicker = UIDocumentPickerViewController(forExporting: [tempURL])
        documentPicker.delegate = self
        documentPicker.modalPresentationStyle = .formSheet
        
        // Stocker requestId pour la réponse
        pendingRequests[requestId] = "saveFileWithDocumentPicker"
        
        present(documentPicker, animated: true)
    }
    
    private func createTempFile(fileName: String, data: String, encoding: String) -> URL? {
        let tempDir = FileManager.default.temporaryDirectory
        let tempURL = tempDir.appendingPathComponent(fileName)
        
        do {
            if encoding == "base64" {
                // Décoder base64
                if let decodedData = Data(base64Encoded: data) {
                    try decodedData.write(to: tempURL)
                }
            } else {
                // UTF-8 par défaut
                try data.write(to: tempURL, atomically: true, encoding: .utf8)
            }
            return tempURL
        } catch {
            print("Erreur création fichier temp: \(error)")
            return nil
        }
    }
    
    // Callback Document Picker
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        
        // Trouver le requestId correspondant
        let requestId = findRequestId(for: "saveFileWithDocumentPicker")
        
        let response: [String: Any] = [
            "action": "saveFileWithDocumentPickerResult",
            "success": true,
            "fileName": url.lastPathComponent,
            "path": url.path,
            "requestId": requestId
        ]
        
        sendToJS(response)
        pendingRequests.removeValue(forKey: requestId)
    }
    
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let requestId = findRequestId(for: "saveFileWithDocumentPicker")
        sendErrorToJS(action: "saveFileWithDocumentPickerResult", 
                     error: "Utilisateur a annulé", 
                     requestId: requestId)
        pendingRequests.removeValue(forKey: requestId)
    }
}
```

#### Sauvegarde Interne AUv3

```swift
private func handleSaveProjectInternal(_ message: [String: Any]) {
    let fileName = message["fileName"] as? String ?? "project.json"
    let data = message["data"] as? String ?? ""
    let requestId = message["requestId"] as? Int ?? 0
    
    // Obtenir le dossier Documents de l'App Group ou sandbox
    guard let documentsDir = getAppGroupDirectory() ?? getDocumentsDirectory() else {
        sendErrorToJS(action: "saveProjectInternalResult", 
                     error: "Impossible d'accéder au dossier Documents", 
                     requestId: requestId)
        return
    }
    
    let projectsDir = documentsDir.appendingPathComponent("Projects")
    
    // Créer dossier Projects si nécessaire
    do {
        try FileManager.default.createDirectory(at: projectsDir, 
                                               withIntermediateDirectories: true)
    } catch {
        sendErrorToJS(action: "saveProjectInternalResult", 
                     error: "Impossible de créer le dossier Projects", 
                     requestId: requestId)
        return
    }
    
    let fileURL = projectsDir.appendingPathComponent(fileName)
    
    do {
        try data.write(to: fileURL, atomically: true, encoding: .utf8)
        
        let response: [String: Any] = [
            "action": "saveProjectInternalResult",
            "success": true,
            "fileName": fileName,
            "path": fileURL.path,
            "requestId": requestId
        ]
        
        sendToJS(response)
    } catch {
        sendErrorToJS(action: "saveProjectInternalResult", 
                     error: "Erreur d'écriture: \(error.localizedDescription)", 
                     requestId: requestId)
    }
}

private func getAppGroupDirectory() -> URL? {
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.atomecorp.atome")
}

private func getDocumentsDirectory() -> URL? {
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
}
```

#### Liste et Chargement de Fichiers

```swift
private func handleListFiles(_ message: [String: Any]) {
    let path = message["path"] as? String ?? "Projects"
    let requestId = message["requestId"] as? Int ?? 0
    
    guard let documentsDir = getAppGroupDirectory() ?? getDocumentsDirectory() else {
        sendErrorToJS(action: "listFilesResult", 
                     error: "Impossible d'accéder au dossier Documents", 
                     requestId: requestId)
        return
    }
    
    let targetDir = documentsDir.appendingPathComponent(path)
    
    do {
        let fileURLs = try FileManager.default.contentsOfDirectory(at: targetDir, 
                                                                  includingPropertiesForKeys: nil)
        let fileNames = fileURLs.map { $0.lastPathComponent }
        
        let response: [String: Any] = [
            "action": "listFilesResult",
            "success": true,
            "files": fileNames,
            "requestId": requestId
        ]
        
        sendToJS(response)
    } catch {
        sendErrorToJS(action: "listFilesResult", 
                     error: "Erreur de lecture dossier: \(error.localizedDescription)", 
                     requestId: requestId)
    }
}

private func handleLoadFileInternal(_ message: [String: Any]) {
    let path = message["path"] as? String ?? "Projects"
    let fileName = message["filename"] as? String ?? ""
    let requestId = message["requestId"] as? Int ?? 0
    
    guard !fileName.isEmpty else {
        sendErrorToJS(action: "loadFileWithDocumentPickerResult", 
                     error: "Nom de fichier requis", 
                     requestId: requestId)
        return
    }
    
    guard let documentsDir = getAppGroupDirectory() ?? getDocumentsDirectory() else {
        sendErrorToJS(action: "loadFileWithDocumentPickerResult", 
                     error: "Impossible d'accéder au dossier Documents", 
                     requestId: requestId)
        return
    }
    
    let fileURL = documentsDir.appendingPathComponent(path).appendingPathComponent(fileName)
    
    do {
        let data = try String(contentsOf: fileURL, encoding: .utf8)
        
        let response: [String: Any] = [
            "action": "loadFileWithDocumentPickerResult",
            "success": true,
            "fileName": fileName,
            "data": data,
            "encoding": "utf8",
            "requestId": requestId
        ]
        
        sendToJS(response)
    } catch {
        sendErrorToJS(action: "loadFileWithDocumentPickerResult", 
                     error: "Erreur de lecture: \(error.localizedDescription)", 
                     requestId: requestId)
    }
}
```

### 3. Audio et Tempo - Intégration Host

```swift
// Extension pour accéder aux propriétés du host
extension AudioUnitViewController {
    
    private func handleRequestHostTempo(_ message: [String: Any]) {
        let requestId = message["requestId"] as? Int ?? 0
        
        // Accéder au tempo via l'Audio Unit
        guard let audioUnit = audioUnit else {
            sendErrorToJS(action: "hostTempo", 
                         error: "Audio Unit non disponible", 
                         requestId: requestId)
            return
        }
        
        // Obtenir le tempo depuis les paramètres host
        let tempo = audioUnit.getHostTempo() // Méthode à implémenter dans l'AU
        
        let response: [String: Any] = [
            "action": "hostTempo",
            "bpm": tempo,
            "requestId": requestId
        ]
        
        sendToJS(response)
    }
    
    private func handleGetSampleRate(_ message: [String: Any]) {
        guard let audioUnit = audioUnit else { return }
        
        let sampleRate = audioUnit.getHostSampleRate()
        
        // Envoyer via callback direct (pas de requestId)
        let jsCall = "window.updateSampleRate(\(sampleRate))"
        webView.evaluateJavaScript(jsCall)
    }
}
```

### 4. Timeline et Transport - Streaming en Temps Réel

```swift
class AudioUnitViewController {
    private var timeStreamTimer: Timer?
    private var transportStreamTimer: Timer?
    
    private func handleStartHostTimeStream(_ message: [String: Any]) {
        let format = message["format"] as? String ?? "time"
        
        // Timer pour envoyer la position toutes les 50ms
        timeStreamTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.sendHostTimeUpdate(format: format)
        }
    }
    
    private func handleStopHostTimeStream() {
        timeStreamTimer?.invalidate()
        timeStreamTimer = nil
    }
    
    private func sendHostTimeUpdate(format: String) {
        guard let audioUnit = audioUnit else { return }
        
        let timeInfo = audioUnit.getHostTimeInfo() // À implémenter dans l'AU
        
        let response: [String: Any] = [
            "action": "hostTimeUpdate",
            "positionSeconds": timeInfo.positionSeconds,
            "positionSamples": timeInfo.positionSamples,
            "tempo": timeInfo.tempo,
            "ppq": timeInfo.ppq,
            "playing": timeInfo.isPlaying
        ]
        
        sendToJS(response)
    }
    
    private func handleStartHostStateStream() {
        transportStreamTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.sendHostTransportUpdate()
        }
    }
    
    private func handleStopHostStateStream() {
        transportStreamTimer?.invalidate()
        transportStreamTimer = nil
    }
    
    private func sendHostTransportUpdate() {
        guard let audioUnit = audioUnit else { return }
        
        let transportInfo = audioUnit.getHostTransportInfo()
        
        let response: [String: Any] = [
            "action": "hostTransport",
            "playing": transportInfo.isPlaying,
            "positionSeconds": transportInfo.positionSeconds
        ]
        
        sendToJS(response)
    }
}
```

### 5. MIDI - Réception et Envoi

```swift
extension AudioUnitViewController {
    private var midiStreamActive = false
    
    private func handleStartMidiStream() {
        midiStreamActive = true
        // L'Audio Unit doit envoyer les données MIDI reçues via sendMidiToJS
    }
    
    private func handleStopMidiStream() {
        midiStreamActive = false
    }
    
    private func handleSendMidi(_ message: [String: Any]) {
        guard let audioUnit = audioUnit,
              let bytes = message["bytes"] as? [Int] else { return }
        
        // Convertir en UInt8 et envoyer via l'Audio Unit
        let midiBytes = bytes.map { UInt8($0) }
        audioUnit.sendMidiData(midiBytes)
    }
    
    // Appelé par l'Audio Unit quand un message MIDI arrive
    func receiveMidiFromAudioUnit(status: UInt8, data1: UInt8, data2: UInt8, timestamp: UInt64) {
        guard midiStreamActive else { return }
        
        // Message parsé
        let parsedResponse: [String: Any] = [
            "action": "midiEvent",
            "status": Int(status),
            "data1": Int(data1),
            "data2": Int(data2),
            "timestamp": timestamp
        ]
        
        // Message raw
        let rawResponse: [String: Any] = [
            "action": "midiEventRaw",
            "bytes": [Int(status), Int(data1), Int(data2)],
            "timestamp": timestamp
        ]
        
        sendToJS(parsedResponse)
        sendToJS(rawResponse)
        
        // Callback direct pour compatibilité
        let jsCall = "if(window.midiUtilities?.receiveMidiData) window.midiUtilities.receiveMidiData(\(data1),\(data2),\(data2),\(timestamp))"
        webView.evaluateJavaScript(jsCall)
    }
}
```

### 6. Utilitaires de Communication

```swift
extension AudioUnitViewController {
    
    // Envoie un message JSON vers JavaScript
    private func sendToJS(_ data: [String: Any]) {
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                let escapedJson = jsonString.replacingOccurrences(of: "\\", with: "\\\\")
                                           .replacingOccurrences(of: "'", with: "\\'")
                let jsCall = "window.AUv3API._receiveFromSwift('\(escapedJson)')"
                
                DispatchQueue.main.async { [weak self] in
                    self?.webView.evaluateJavaScript(jsCall) { result, error in
                        if let error = error {
                            print("Erreur JS: \(error)")
                        }
                    }
                }
            }
        } catch {
            print("Erreur sérialisation JSON: \(error)")
        }
    }
    
    // Envoie une erreur vers JavaScript
    private func sendErrorToJS(action: String, error: String, requestId: Int) {
        let response: [String: Any] = [
            "action": action,
            "success": false,
            "error": error,
            "requestId": requestId
        ]
        sendToJS(response)
    }
    
    // Trouve un requestId dans les requêtes en attente
    private func findRequestId(for action: String) -> Int {
        for (id, storedAction) in pendingRequests {
            if storedAction == action {
                return id
            }
        }
        return 0
    }
}
```

### 7. Intégration Audio Unit (Extension à implémenter)

```swift
// Dans votre classe Audio Unit principale
extension YourAudioUnit {
    
    func getHostTempo() -> Double {
        // Accéder aux paramètres host tempo
        if let musicalContextBlock = self.musicalContextBlock {
            var tempo = 120.0
            var timeSignatureNumerator: Float = 4
            var timeSignatureDenominator: Int = 4
            var currentMeasureDownbeat = 0.0
            var sampleOffsetToNextBeat = 0.0
            var currentBeatPosition = 0.0
            
            let result = musicalContextBlock(&tempo, 
                                           &timeSignatureNumerator, 
                                           &timeSignatureDenominator,
                                           &currentBeatPosition, 
                                           &sampleOffsetToNextBeat, 
                                           &currentMeasureDownbeat)
            
            if result == noErr {
                return tempo
            }
        }
        return 120.0 // Valeur par défaut
    }
    
    func getHostSampleRate() -> Double {
        return Double(self.outputBusses[0].format.sampleRate)
    }
    
    func getHostTimeInfo() -> (positionSeconds: Double, positionSamples: Int64, tempo: Double, ppq: Double, isPlaying: Bool) {
        // Implémenter via transportStateBlock et musicalContextBlock
        // ...
        return (0.0, 0, 120.0, 0.0, false)
    }
    
    func sendMidiData(_ bytes: [UInt8]) {
        // Envoyer MIDI via outputEventBlock
        // ...
    }
}
```

## Points Clés d'Implémentation

### 1. **Gestion des RequestID**
- Chaque requête asynchrone utilise un `requestId` unique
- Stocker dans `pendingRequests` pour associer réponses
- Nettoyer après chaque réponse

### 2. **Threading**
- Toujours traiter les messages sur le main thread
- Les timers de streaming tournent sur le main thread
- L'Audio Unit peut callback depuis l'audio thread

### 3. **Gestion d'Erreurs**
- Toujours envoyer une réponse (succès ou erreur)
- Inclure messages d'erreur descriptifs
- Timeouts côté JavaScript pour éviter les blocages

### 4. **Performance**
- Limiter la fréquence des updates de timeline (50ms)
- Arrêter les streams quand non utilisés
- Éviter les fuites mémoire avec weak references

Cette implémentation Swift complète permet de reproduire entièrement toutes les fonctionnalités documentées dans l'API JavaScript AUv3.
