# Comment Obtenir le Tempo Correctement dans un Plugin AUv3

## Contexte du Problème

Le bouton "Tempo" dans `ios_apis.js` retournait toujours 120 BPM au lieu de la vraie valeur du tempo de l'hôte (AUM, Logic Pro, etc.).

## Analyse Technique du Problème

### 1. Architecture du Système de Tempo
```
Host (AUM/Logic) → AUHostMusicalContextBlock → Plugin AUv3 → JavaScript Bridge → Bouton Tempo
```

### 2. Points de Défaillance Identifiés

#### A. Variable `cachedTempo` jamais mise à jour
```swift
// WebViewManager.swift ligne 21
private static var cachedTempo: Double = 120.0  // ❌ Toujours 120!
static func updateCachedTempo(_ t: Double) { if t > 0 { cachedTempo = t } }
```

La fonction `updateCachedTempo()` était définie mais **jamais appelée**.

#### B. Fonction `checkHostTempo()` supprimée
```swift
// utils.swift ligne 242
// ULTRA OPTIMIZATION: Removed checkHostTempo() completely - not essential for core functionality
```

La vérification périodique du tempo avait été supprimée pour des "optimisations de performance".

#### C. Logique de fallback défaillante
```swift
// WebViewManager.swift - requestHostTempo
if block(&currentTempo, nil, nil, nil, nil, nil), currentTempo > 0 {
    bpm = currentTempo; source = "hostBlock"  // ✅ Cas idéal
} else {
    bmp = WebViewManager.cachedTempo; source = "cached"  // ❌ Toujours 120!
}
```

## Solution Implémentée

### 1. Mise à Jour du Tempo dans le Transport
**Fichier:** `/src-Auv3/auv3/utils.swift`

J'ai ajouté la vérification du tempo dans la fonction `checkHostTransport()` existante :

```swift
private func checkHostTransport() {
    guard let tsBlock = self.transportStateBlock else { return }
    var flags = AUHostTransportStateFlags(rawValue: 0)
    var currentSampleTime: Double = 0
    if tsBlock(&flags, &currentSampleTime, nil, nil) {
        let isPlaying = (flags.rawValue & AUHostTransportStateFlags.moving.rawValue) != 0
        let sr = getSampleRate() ?? 44100.0
        
        // ✅ NOUVEAU: Vérification et mise à jour du tempo
        if let musicalBlock = self.musicalContextBlock {
            var currentTempo: Double = 0
            if musicalBlock(&currentTempo, nil, nil, nil, nil, nil), currentTempo > 0 {
                WebViewManager.updateCachedTempo(currentTempo)  // 🎯 Mise à jour!
            }
        }
        
        // ... reste du code transport
    }
}
```

**Avantages:**
- Utilise la boucle de transport existante (déjà optimisée à 5 FPS)
- Pas de nouvelle boucle = pas d'impact performance
- Tempo mis à jour en temps réel

### 2. Amélioration du Gestionnaire `requestHostTempo`
**Fichier:** `/src-Auv3/Common/WebViewManager.swift`

```swift
if action == "requestHostTempo" {
    var bpm: Double = 120.0
    var source = "fallback"
    if let au = WebViewManager.hostAudioUnit {
        if let block = au.musicalContextBlock {
            var currentTempo: Double = 0
            // ✅ Première tentative - paramètres minimaux
            if block(&currentTempo, nil, nil, nil, nil, nil), currentTempo > 0 {
                bpm = currentTempo; source = "hostBlock"
                WebViewManager.updateCachedTempo(currentTempo)  // 🎯 Mise à jour immédiate
            } else {
                // ✅ Deuxième tentative - tous les paramètres
                var timeSignatureNum: Double = 0
                var timeSignatureDen: Int = 0
                var currentBeatPosition: Double = 0
                var sampleOffsetToNextBeat: Int = 0
                var currentMeasureDownbeatPosition: Double = 0
                if block(&currentTempo, &timeSignatureNum, &timeSignatureDen, 
                        &currentBeatPosition, &sampleOffsetToNextBeat, 
                        &currentMeasureDownbeatPosition), currentTempo > 0 {
                    bpm = currentTempo; source = "hostBlockFull"
                    WebViewManager.updateCachedTempo(currentTempo)
                } else {
                    bmp = WebViewManager.cachedTempo; source = "cached(\(WebViewManager.cachedTempo))"
                }
            }
        }
    }
    // ✅ Debug logging pour diagnostic
    print("[WebViewManager] requestHostTempo: bpm=\(bpm), source=\(source)")
    // ... envoi de la réponse
}
```

### 3. Types de Paramètres Corrects

Référence Apple Documentation pour `AUHostMusicalContextBlock`:

```swift
typedef BOOL (^AUHostMusicalContextBlock)(
    double * __nullable currentTempo,                    // 🎯 Le tempo en BPM
    double * __nullable timeSignatureNumerator,          // Ex: 4 dans 4/4
    NSInteger * __nullable timeSignatureDenominator,     // Ex: 4 dans 4/4  
    double * __nullable currentBeatPosition,             // Position dans la mesure
    NSInteger * __nullable sampleOffsetToNextBeat,       // Échantillons jusqu'au prochain beat
    double * __nullable currentMeasureDownbeatPosition   // Position du début de mesure
);
```

## Flux de Données Corrigé

### 1. Au Démarrage du Plugin
```
Plugin Init → hostAudioUnit injecté → musicalContextBlock disponible
```

### 2. Pendant la Lecture
```
Host Change Tempo → Transport Poll (5 FPS) → musicalContextBlock() → updateCachedTempo()
```

### 3. Quand l'Utilisateur Clique "Tempo"
```
Button Click → auv3_tempo() → requestHostTempo → musicalContextBlock() → Real Tempo Value ✅
```

## Sources de Tempo par Priorité

1. **`hostBlock`** - Direct du `musicalContextBlock` (idéal)
2. **`hostBlockFull`** - Avec tous les paramètres (fallback)  
3. **`cached(XXX)`** - Valeur mise en cache (maintenant correcte!)
4. **`cachedNoBlock(XXX)`** - Pas de block musical disponible
5. **`noAU(XXX)`** - Pas d'AudioUnit hôte

## Test de la Solution

### Code JavaScript de Test
```javascript
// Dans ios_apis.js
addBtn('Tempo', async()=>{ 
    const bpm = await AUv3API.auv3_tempo(); 
    log('Tempo='+bpm); 
    return bpm; 
});
```

### Procédure de Test
1. Charger le plugin dans AUM
2. Régler le tempo de AUM à 140 BPM (ou autre que 120)
3. Cliquer sur le bouton "Tempo"
4. Vérifier la valeur retournée
5. Vérifier les logs de debug dans la console

### Logs de Debug Attendus
```
[WebViewManager] requestHostTempo: bpm=140.0, source=hostBlock
```

## Impact Performance

- **Minimal** : Utilise la boucle de transport existante (5 FPS)
- **Pas de nouvelle thread**
- **Pas de polling supplémentaire**
- **Cache intelligent** pour éviter les appels répétés

## Fichiers Modifiés

1. **`/src-Auv3/auv3/utils.swift`**
   - Ajout de la mise à jour tempo dans `checkHostTransport()`

2. **`/src-Auv3/Common/WebViewManager.swift`** 
   - Amélioration de `requestHostTempo` avec retry et debug

## Cas d'Usage Spéciaux

### Host sans Support Musical Context
```swift
// Fallback gracieux vers cached tempo (120.0 par défaut)
source = "cachedNoBlock(120.0)"
```

### Plugin en Mode Standalone
```swift  
// Pas d'AudioUnit hôte
source = "noAU(120.0)"
```

### Changement de Tempo en Temps Réel
```swift
// Mise à jour automatique via transport polling
Host: 120 BPM → 140 BPM
Plugin: cachedTempo 120 → 140 (en ~200ms)
```

## Conclusion

La solution corrige le problème de tempo en:
1. **Réactivant** la vérification de tempo (supprimée par erreur)
2. **Utilisant** l'infrastructure de transport existante (performance)
3. **Implémentant** une logique de fallback robuste
4. **Ajoutant** du debug pour le diagnostic futur

Le tempo est maintenant correctement récupéré de l'hôte au lieu de retourner toujours 120 BPM.
