# Guide Technique : Récupération et Diffusion du Transport (Play/Stop + Position) AUv3 vers JavaScript

Ce document explique comment :
1. Lire l’état de transport (lecture / arrêt / position) du host dans un Audio Unit (AUv3) en Swift.
2. Le transférer proprement vers un `WKWebView` / JavaScript.
3. Consommer l’information côté JS via une API simple.
4. Reproduire l’implémentation dans un autre projet.

---
## 1. Concepts Core Audio / AUv3 utilisés

| Élément | Rôle |
|---------|------|
| `transportStateBlock` (AUAudioUnit) | Callback host fournissant flags + sampleTime courant. |
| `musicalContextBlock` (optionnel) | Récupère tempo / signature / beat / etc. |
| Sample Time | Position en échantillons (convertie en secondes avec sampleRate). |
| Flags (AUHostTransportStateFlags) | Bits indiquant mouvement, changement d’état (start/stop/seek). |

Flags typiques utiles:
- `moving` (bit 0x2) : la lecture avance.
- `changed` : un évènement (start/stop/seek) vient de se produire (selon host).

---
## 2. Récupération Transport côté Swift (Audio Unit)

Implémentation dans la sous-classe d’`AUAudioUnit` (ex: `auv3Utils`). Le polling se fait dans le render block (ou via un timer) à faible fréquence (ex: 5 Hz) pour éviter toute surcharge.

```swift
private var lastPlayheadSampleTime: Double = 0
private var lastIsPlaying: Bool = false
private var lastTempo: Double = 120.0

private func checkHostTransport() {
    guard let tsBlock = self.transportStateBlock else { return }
    var flags = AUHostTransportStateFlags(rawValue: 0)
    var currentSampleTime: Double = 0
    let ok = tsBlock(&flags, &currentSampleTime, nil, nil)
    if ok {
        // Tempo (facultatif)
        if let mc = self.musicalContextBlock {
            var tempo: Double = 0, num: Double = 0, beat: Double = 0, measure: Double = 0
            var den: Int = 0, sampleOffset: Int = 0
            if mc(&tempo, &num, &den, &beat, &sampleOffset, &measure), tempo > 0 { lastTempo = tempo; WebViewManager.updateCachedTempo(tempo) }
        }
        let isPlayingNow = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
        lastIsPlaying = isPlayingNow
        lastPlayheadSampleTime = currentSampleTime // host sample time fiable
        let sr = getSampleRate() ?? 44100.0
        WebViewManager.updateTransportCache(isPlaying: isPlayingNow,
                                            playheadSeconds: currentSampleTime / sr)
    }
}
```

Intégration dans le render block (simplifié) :
```swift
if currentTime - strongSelf.lastTransportCheck >= 0.2 { // 5 Hz
    strongSelf.checkHostTransport()
    strongSelf.lastTransportCheck = currentTime
}
```

---
## 3. Mise à disposition pour le WebView

`WebViewManager` maintient un cache et expose un *stream* déclenché à la demande par le JS.

Variables et mise à jour du cache :
```swift
private static var lastPlayheadSeconds: Double = 0
private static var lastIsPlaying: Bool = false
static func updateTransportCache(isPlaying: Bool, playheadSeconds: Double) {
    lastIsPlaying = isPlaying
    lastPlayheadSeconds = playheadSeconds
}
```

Démarrage du flux côté Swift (simplifié) :
```swift
private static var hostStateTimer: Timer?
private static var lastSentTransportPlaying: Bool? = nil
private static var lastSentTransportPosition: Double = -1

private static func startHostStateStream() {
    stopHostStateStream()
    // Envoi initial
    sendBridgeJSON(["action":"hostTransport",
                    "playing": lastIsPlaying,
                    "positionSeconds": lastPlayheadSeconds])
    lastSentTransportPlaying = lastIsPlaying
    lastSentTransportPosition = lastPlayheadSeconds

    hostStateTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
        let playing = lastIsPlaying
        let pos = lastPlayheadSeconds
        var changed = false
        if lastSentTransportPlaying == nil || playing != lastSentTransportPlaying { changed = true }
        if !playing && abs(pos - lastSentTransportPosition) > 0.05 { changed = true } // seek à l'arrêt
        if changed {
            sendBridgeJSON(["action":"hostTransport", "playing": playing, "positionSeconds": pos])
            lastSentTransportPlaying = playing
            lastSentTransportPosition = pos
        }
    }
}
```

Bridge vers JS :
```swift
private static func sendBridgeJSON(_ dict: [String: Any]) {
    guard let wv = webView,
          let data = try? JSONSerialization.data(withJSONObject: dict),
          let json = String(data: data, encoding: .utf8) else { return }
    let js = "window.AUv3API && AUv3API._receiveFromSwift(\(json));"
    wv.evaluateJavaScript(js, completionHandler: nil)
}
```

Réception des commandes JS (extrait) :
```swift
if action == "startHostStateStream" { WebViewManager.startHostStateStream(); return }
if action == "stopHostStateStream" { WebViewManager.stopHostStateStream(); return }
```

---
## 4. API JavaScript côté client

Enregistrement et démarrage du flux :
```javascript
AUv3API.auv3_host_state(true, (state) => {
  console.log('Transport', state.playing ? '▶' : '⏸', state.positionSeconds.toFixed(2));
});
```

Arrêt du flux :
```javascript
AUv3API.auv3_host_state(false);
```

Interne (réception générique) :
```javascript
switch(msg.action){
  case 'hostTransport':
    hostStateCallbacks.forEach(fn => { try { fn(msg); } catch(e){} });
    break;
}
```

Objet reçu (`msg`) :
```json
{
  "action": "hostTransport",
  "playing": true,
  "positionSeconds": 12.345
}
```

---
## 5. Étapes pour reproduire dans un autre projet

1. Créer une sous-classe `AUAudioUnit` (ou adapter la vôtre) et ajouter `checkHostTransport()`.
2. Dans le render block (ou un timer background), appeler `checkHostTransport()` périodiquement (4–10 Hz). Ne pas faire 60 Hz inutilement.
3. Ajouter un gestionnaire central (type `WebViewManager`) qui conserve `lastIsPlaying` / `lastPlayheadSeconds`.
4. Implémenter un système de bridge (WKScriptMessageHandler) écoutant une action JS `startHostStateStream` / `stopHostStateStream`.
5. Démarrer un `Timer` Swift qui compare l’état courant à l’état envoyé précédemment et n’envoie que si nécessaire.
6. Côté JS, définir une API simple :
   - Démarrer : envoie `{action:'startHostStateStream'}`.
   - Stop : `{action:'stopHostStateStream'}`.
   - Réception : dispatcher `hostTransport` vers les callbacks enregistrés.
7. (Optionnel) Ajouter un flux temps séparé (`hostTimeUpdate`) si besoin de mise à jour continue des secondes pendant la lecture.

---
## 6. Bonnes pratiques / Pièges

| Piège | Solution |
|-------|----------|
| Toggling artificiel (fake timer) | Toujours se baser sur `transportStateBlock` réel. |
| Flags manqués (évènement court) | Mettre à jour `isPlaying` chaque poll, pas seulement quand `flags != 0`. |
| Spam d’évènements | Comparer dernier état envoyé avant d’émettre. |
| Mauvais tempo | Ne pas bloquer transport si `musicalContextBlock` indispo (séparer). |
| UI trop lente | Fréquence 0.2 s suffisante pour play/stop; plus rapide uniquement pour timecode. |

---
## 7. Validation / Tests rapides

Checklist :
- Démarrer lecture host → log ▶ (une fois).
- Arrêter → log ⏸.
- Redémarrer rapidement → log ▶ immédiat.
- Seek pendant stop → nouveau log (si seuil > 50 ms atteint).
- Lecture longue → aucun spam `hostTransport` (seul flux timecode avance).

---
## 8. Extension : intégrer tempo (optionnel)

```swift
if let mc = musicalContextBlock {
  var t: Double = 0
  if mc(&t, nil, nil, nil, nil, nil), t > 0 { WebViewManager.updateCachedTempo(t) }
}
```
JS :
```javascript
const bpm = await AUv3API.auv3_tempo();
```

---
## 9. Résumé minimal (copier-coller rapide)

Swift (cache + envoi) :
```swift
// Dans AU
checkHostTransport(); // met à jour cache via WebViewManager.updateTransportCache
// Dans WebViewManager
startHostStateStream(); // timer 200 ms -> compare & envoie hostTransport
```
JS :
```javascript
AUv3API.auv3_host_state(true, s => console.log(s.playing, s.positionSeconds));
```

---
Dernière mise à jour : 2025-08-08
