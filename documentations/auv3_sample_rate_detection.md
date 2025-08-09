# AUv3 Host Sample Rate Detection - Solution Documentation

## Problème Initial

L'extension AUv3 renvoyait toujours un sample rate de **44100 Hz** au lieu du vrai sample rate de l'hôte (48000 Hz dans AUM), causant des artefacts audio et une mauvaise synchronisation.

## Diagnostic du Problème

### 1. Hardcoding Initial
Dans `WebViewManager.swift`, la fonction `sendSampleRateToJS()` était hardcodée :
```swift
// INCORRECT - Valeur fixe
let jsCode = "if (typeof window.updateSampleRate === 'function') { window.updateSampleRate(44100); }"
```

### 2. Format d'Initialisation vs Format Hôte
Dans `utils.swift`, le format initial était fixé à 44100 Hz :
```swift
// Format par défaut lors de l'initialisation
guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2) else {
    // ...
}
```

**Le problème** : L'hôte ne mettait pas à jour ce format, donc l'AUv3 restait bloqué sur la valeur d'initialisation.

### 3. Détection Incorrecte
La méthode `getSampleRate()` ne lisait que le format du bus de sortie, qui contenait la valeur d'initialisation (44100) et non la valeur système réelle.

## Solution Implémentée

### 1. Détection via AVAudioSession (iOS)

La **clé de la solution** : utiliser `AVAudioSession.sharedInstance().sampleRate` qui retourne le vrai sample rate système utilisé par l'hôte.

**Dans `AudioUnitViewController.swift`** :
```swift
public func getHostSampleRate() -> Double? {
    guard let au = audioUnit else {
        print("⚠️ [AudioUnitViewController] getHostSampleRate: audioUnit not available")
        return nil
    }
    
    // Method 1: Check iOS system sample rate first
    #if os(iOS)
    let systemRate = AVAudioSession.sharedInstance().sampleRate
    if systemRate > 0 && systemRate != 44100.0 {
        print("🔊 [AudioUnitViewController] Using iOS system sample rate: \(systemRate)")
        return systemRate
    }
    #endif
    
    // Method 2: Check direct bus access (fallback)
    var busRate: Double = 44100.0
    if au.outputBusses.count > 0 {
        busRate = au.outputBusses[0].format.sampleRate
    }
    
    // Return system rate if available and different from default, otherwise bus rate
    #if os(iOS)
    return (systemRate > 0 && systemRate != 44100.0) ? systemRate : busRate
    #else
    return busRate
    #endif
}
```

### 2. Correction de WebViewManager

**Dans `WebViewManager.swift`** :
```swift
private func sendSampleRateToJS() {
    // Get actual sample rate from audio controller
    if let hostSampleRate = WebViewManager.audioController?.getHostSampleRate() {
        let jsCode = "if (typeof window.updateSampleRate === 'function') { window.updateSampleRate(\(hostSampleRate)); }"
        Self.webView?.evaluateJavaScript(jsCode, completionHandler: nil)
        print("🔊 [WebViewManager] Sent actual host sample rate: \(hostSampleRate)")
    } else {
        // Fallback if audio controller not available
        let jsCode = "if (typeof window.updateSampleRate === 'function') { window.updateSampleRate(44100); }"
        Self.webView?.evaluateJavaScript(jsCode, completionHandler: nil)
        print("⚠️ [WebViewManager] Audio controller unavailable, sent fallback: 44100")
    }
}
```

### 3. Ajout de la Méthode au Protocole

**Dans `AudioControllerProtocol.swift`** :
```swift
public protocol AudioControllerProtocol: AnyObject {
    // ... méthodes existantes ...
    
    // Host sample rate access
    func getHostSampleRate() -> Double?
}
```

### 4. Interface JavaScript Améliorée

**Dans `ios_apis.js`** :
- Bouton SampleRate dynamique qui affiche la valeur : `SR: H<host_rate> W<web_rate>`
- Détection d'écart entre host et web sample rates
- Création automatique d'AudioContext temporaire pour obtenir le web sample rate

## Flux de Détection

```mermaid
graph TD
    A[JavaScript demande Sample Rate] --> B[WebViewManager.sendSampleRateToJS]
    B --> C[AudioUnitViewController.getHostSampleRate]
    C --> D{iOS disponible?}
    D -->|Oui| E[AVAudioSession.sharedInstance().sampleRate]
    D -->|Non| F[outputBusses[0].format.sampleRate]
    E --> G{systemRate ≠ 44100?}
    G -->|Oui| H[Retourne systemRate - CORRECT]
    G -->|Non| F
    F --> I[Retourne busRate - Fallback]
    H --> J[Swift exécute window.updateSampleRate]
    I --> J
    J --> K[JavaScript reçoit la vraie valeur]
```

## Debugging et Logs

### Logs Ajoutés

1. **Pre/Post Allocation** dans `AUMIDIOutputHelper.swift` :
```swift
print("🔊 [PRE-allocate] Output bus sample rate: \(preRate)")
print("🔊 [POST-allocate] ACTUAL Host sample rate after allocation: \(actualHostRate)")
```

2. **Détection Système** dans `AudioUnitViewController.swift` :
```swift
print("🔊 [AudioUnitViewController] Using iOS system sample rate: \(systemRate)")
print("🔊 [AudioUnitViewController] getHostSampleRate - system: \(systemRate), bus: \(busRate)")
```

3. **Transmission JavaScript** dans `WebViewManager.swift` :
```swift
print("🔊 [WebViewManager] Sent actual host sample rate: \(hostSampleRate)")
```

### Réduction du Spam de Logs

Dans `utils.swift`, limitation du logging dans `getSampleRate()` :
```swift
// Only print occasionally to avoid log spam
if Int.random(in: 1...1000) == 1 {
    print("🔊 [getSampleRate] Output bus sample rate: \(actualRate)")
}
```

## Résultats

### Avant
- **Host Sample Rate** : 44100 Hz (incorrect - hardcodé)
- **Web Sample Rate** : 48000 Hz (correct - détection navigateur)
- **Problème** : Discordance causant des artefacts audio

### Après
- **Host Sample Rate** : 48000 Hz (correct - détection système iOS)
- **Web Sample Rate** : 48000 Hz (correct - détection navigateur)
- **Résultat** : Synchronisation parfaite, pas d'artefacts

## Points Clés de la Solution

### 1. **AVAudioSession est la source de vérité**
- `AVAudioSession.sharedInstance().sampleRate` retourne le vrai sample rate système
- C'est ce que l'hôte (AUM) utilise réellement
- Plus fiable que le format des bus AUv3

### 2. **Format des Bus ≠ Sample Rate Réel**
- Les bus AUv3 peuvent garder leur format d'initialisation
- L'hôte ne met pas toujours à jour le format des bus
- Le sample rate système est indépendant du format des bus

### 3. **Détection à Plusieurs Niveaux**
- Priorité à `AVAudioSession` (iOS)
- Fallback sur le format des bus
- Logging pour debugging

### 4. **Interface Utilisateur Informative**
- Bouton qui affiche les deux valeurs
- Détection visuelle des écarts (couleur orange)
- API de diagnostic (`SR Info`)

## Recommandations pour le Futur

1. **Toujours utiliser AVAudioSession sur iOS** pour le sample rate
2. **Ne pas se fier uniquement aux formats de bus AUv3**
3. **Maintenir le logging** pour diagnostiquer les problèmes d'hôtes
4. **Tester avec différents hôtes** (Logic Pro, GarageBand, etc.)

## Fichiers Modifiés

- `src-Auv3/Common/AudioControllerProtocol.swift` - Ajout méthode
- `src-Auv3/auv3/AudioUnitViewController.swift` - Implémentation détection
- `src-Auv3/Common/WebViewManager.swift` - Correction hardcoding
- `src-Auv3/auv3/AUMIDIOutputHelper.swift` - Logging allocation
- `src-Auv3/auv3/utils.swift` - Réduction spam logs
- `src/application/examples/ios_apis.js` - Interface utilisateur

---

**Date** : 9 août 2025  
**Statut** : ✅ Résolu  
**Impact** : Audio sync parfaite entre WebView et AUv3 host
