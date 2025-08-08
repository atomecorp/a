# Guide Technique : Récupération Continue de la Position de Lecture (Playhead) AUv3 → JavaScript

Ce document décrit comment mettre en place (et reproduire) un flux temps réel « position de la tête de lecture » entre un Audio Unit (AUv3) écrit en Swift et une interface JavaScript embarquée dans un WKWebView. Il est aligné avec la logique utilisée par le bouton `Time ▶︎` dans `ios_apis.js`.

---
## 1. Objectif
Obtenir périodiquement côté JavaScript la position de lecture du host (en secondes, samples, état play/stop, tempo optionnel) sous forme de messages structurés :
```json
{
  "action": "hostTimeUpdate",
  "positionSeconds": 12.345,
  "positionSamples": 543210,
  "tempo": 120.0,
  "ppq": 24.69,
  "playing": true
}
```

---
## 2. Sources d’information côté AUv3
| Source | Rôle |
|--------|------|
| `transportStateBlock` | Récupère `currentSampleTime` + flags (lecture en cours / changement). |
| `musicalContextBlock` | (Optionnel) Tempo, beat, signature, offset… |
| Sample Rate | Conversion échantillons → secondes. |

Le choix retenu : polling léger (≈5 Hz) depuis le render block pour maintenir un cache central (dans `WebViewManager`) puis un timer côté WebView pour émettre vers JS.

---
## 3. Mise à jour du cache transport (Swift / AU)
Dans la sous‑classe `AUAudioUnit` (ex: `auv3Utils`) :
```swift
private var lastPlayheadSampleTime: Double = 0
private var lastIsPlaying: Bool = false
private var lastTempo: Double = 120.0

private func checkHostTransport() {
    guard let tsBlock = self.transportStateBlock else { return }
    var flags = AUHostTransportStateFlags(rawValue: 0)
    var currentSampleTime: Double = 0
    if tsBlock(&flags, &currentSampleTime, nil, nil) {
        // Tempo (facultatif)
        if let mc = self.musicalContextBlock {
            var t: Double = 0, num: Double = 0, beat: Double = 0, measure: Double = 0
            var den: Int = 0, sampleOffset: Int = 0
            if mc(&t, &num, &den, &beat, &sampleOffset, &measure), t > 0 {
                lastTempo = t
                WebViewManager.updateCachedTempo(t)
            }
        }
        let isMoving = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
        lastIsPlaying = isMoving
        lastPlayheadSampleTime = currentSampleTime
        let sr = getSampleRate() ?? 44100.0
        WebViewManager.updateTransportCache(isPlaying: isMoving,
                                            playheadSeconds: currentSampleTime / sr)
    }
}
```
Intégration (extrait du render block) :
```swift
if currentTime - strongSelf.lastTransportCheck >= 0.2 { // 5 Hz
    strongSelf.checkHostTransport()
    strongSelf.lastTransportCheck = currentTime
}
```

---
## 4. Cache central + Stream (Swift / WebViewManager)
Variables partagées :
```swift
private static var lastPlayheadSeconds: Double = 0
private static var lastIsPlaying: Bool = false
private static var cachedTempo: Double = 120.0
static func updateTransportCache(isPlaying: Bool, playheadSeconds: Double) {
    lastIsPlaying = isPlaying
    lastPlayheadSeconds = playheadSeconds
}
static func updateCachedTempo(_ t: Double) { if t > 0 { cachedTempo = t } }
```
Démarrage du flux temps :
```swift
private static var hostTimeTimer: Timer?

private static func startHostTimeStream(format: String?) {
    stopHostTimeStream()
    hostTimeTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
        let isPlaying = lastIsPlaying
        let playhead = lastPlayheadSeconds
        let tempo = cachedTempo
        let payload: [String: Any] = [
            "action": "hostTimeUpdate",
            "positionSeconds": playhead,
            "positionSamples": Int(playhead * 44100.0),
            "tempo": tempo,
            "ppq": playhead * (tempo / 60.0), // basique: PPQ = secondes * (BPM/60)
            "playing": isPlaying
        ]
        sendBridgeJSON(payload)
    }
}
private static func stopHostTimeStream() {
    hostTimeTimer?.invalidate(); hostTimeTimer = nil
}
```
Envoi JSON dans le WebView :
```swift
private static func sendBridgeJSON(_ dict: [String: Any]) {
    guard let wv = webView,
          let data = try? JSONSerialization.data(withJSONObject: dict),
          let json = String(data: data, encoding: .utf8) else { return }
    let js = "window.AUv3API && AUv3API._receiveFromSwift(\(json));"
    wv.evaluateJavaScript(js, completionHandler: nil)
}
```
Réception d’actions JS :
```swift
if action == "startHostTimeStream" { WebViewManager.startHostTimeStream(format: body["format"] as? String); return }
if action == "stopHostTimeStream"  { WebViewManager.stopHostTimeStream(); return }
```

---
## 5. API JavaScript (`ios_apis.js`)
Public :
```javascript
API.auv3_current_time = function auv3_current_time(start, format='time', callback){
  if (typeof callback === 'function' && timeCallbacks.indexOf(callback) === -1) {
    timeCallbacks.push(callback);
  }
  if (!bridgeAvailable()) return console.warn('swiftBridge not available');
  if (start && !timeStreamActive) {
    timeStreamActive = true;
    postToSwift({ action: 'startHostTimeStream', format });
  } else if (!start && timeStreamActive) {
    timeStreamActive = false;
    postToSwift({ action: 'stopHostTimeStream' });
  }
};
```
Réception :
```javascript
case 'hostTimeUpdate': {
  if (typeof msg.positionSeconds === 'number') {
    AUv3API.updateTimecode(msg.positionSeconds * 1000);
  }
  timeCallbacks.forEach(fn => { try { fn(msg); } catch(_){} });
  break;
}
```
Utilisation (exemple bouton) :
```javascript
AUv3API.auv3_current_time(true, 'time', info => {
  console.log('Time', info.positionSeconds.toFixed(2), 's', info.playing ? '▶' : '⏸');
});
// ... plus tard pour arrêter :
AUv3API.auv3_current_time(false);
```
`updateTimecode()` (affichage) :
```javascript
API.updateTimecode = function(timecodeMs){
  if (!isFinite(timecodeMs) || timecodeMs < 0) timecodeMs = 0;
  const seconds = (timecodeMs/1000).toFixed(3);
  const el = document.getElementById('timecode-display');
  if (el) el.textContent = seconds+'s';
};
```

---
## 6. Format des données envoyées
| Champ | Type | Description |
|-------|------|-------------|
| action | string | 'hostTimeUpdate' |
| positionSeconds | number | Position en secondes (cache) |
| positionSamples | number | Conversion simple (sampleRate * secondes) |
| tempo | number | Valeur cache (ou fallback 120) |
| ppq | number | Approx: secondes * (tempo / 60) |
| playing | boolean | État lecture host |

---
## 7. Étapes de Reproduction (Résumé)
1. Dans votre AU : implémenter `checkHostTransport()` comme ci‑dessus.
2. Poller cette fonction périodiquement (render block ou timer) pour alimenter le cache via `WebViewManager.updateTransportCache`.
3. Dans le gestionnaire WebView : ajouter `startHostTimeStream()` + `stopHostTimeStream()` avec un `Timer` (200 ms typique).
4. Créer une fonction d’envoi JSON `sendBridgeJSON`.
5. Exposer deux actions côté Swift pour démarrer/stopper le flux (via `WKScriptMessageHandler`).
6. Côté JS : créer `auv3_current_time(start, format, callback)` qui envoie `startHostTimeStream` / `stopHostTimeStream`.
7. Dans `_receiveFromSwift`, traiter `hostTimeUpdate` et redistribuer aux callbacks.
8. (Optionnel) Ajouter une fonction utilitaire d’affichage formaté (mm:ss.mmm, etc.).

---
## 8. Bonnes Pratiques
| Problème | Solution |
|----------|----------|
| Sur-polling (CPU) | 5–10 Hz suffisent pour UI; interpolation JS si besoin de fluidité. |
| Valeur tempo absente | Garder un cache + fallback 120. |
| Rattrapage de seek | Lire `currentSampleTime` à chaque poll (même si stop). |
| Précision PPQ | Pour un usage avancé, recalculer via beat / measure plutôt que formule simple. |
| Bloc indisponible | Tester existence de `transportStateBlock` avant usage. |

---
## 9. Extensions Possibles
- Interpolation côté JS entre deux `hostTimeUpdate` si `playing`.
- Ajout d’un champ `source` (ex: "cached" / "host").
- Enrichir avec `beat`, `measure`, `timeSignature` si fournis par `musicalContextBlock`.
- Fusionner flux transport + temps pour réduire le nombre de timers.

---
## 10. Mini Recette Copier-Coller
Swift (mise à jour + timer JS) :
```swift
checkHostTransport() // dans un poll
// WebViewManager.startHostTimeStream -> envoie périodiquement hostTimeUpdate
```
JS :
```javascript
AUv3API.auv3_current_time(true,'time', info => console.log(info.positionSeconds));
```

---
Dernière mise à jour : 2025-08-08
