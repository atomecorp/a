# Guide Complet : Résoudre l'Invisibilité des Sorties MIDI AUv3

## 🎯 Problème Résolu
**Symptôme** : Plugin AUv3 avec entrées MIDI visibles dans AUM mais aucune sortie MIDI disponible
**Cause racine** : Erreurs dans l'implémentation Swift des propriétés MIDI de la classe AUAudioUnit
**Solution** : Correction des APIs Swift modernes et configuration cross-target

---

## 🔍 Diagnostic Initial

### Symptômes observés
- ✅ Plugin AUv3 visible et fonctionnel dans AUM
- ✅ Entrées MIDI disponibles : "Atome MIDI In"
- ❌ Aucune sortie MIDI visible dans les connexions AUM
- ❌ Impossible de router MIDI OUT vers autres plugins

### Investigation menée
1. **Configuration Info.plist** ✅ Correcte (type "aumi", capabilities MIDI)
2. **Implémentation CoreMIDI** ✅ Fonctionnelle (MIDISourceCreate, virtualSource)
3. **Propriétés AUv3** ❌ **ERREUR TROUVÉE ICI**

---

## 🛠️ Solution Technique

### Étape 1 : Correction des propriétés MIDI Swift

**Fichier** : `platforms/ios/atome-auv3/auv3/utils.swift`

**AVANT** (incorrect) :
```swift
// API obsolète et propriétés inexistantes
override public var MIDIOutputNames: [String] {
    return ["Atome MIDI Out"]
}

override public var outputMIDIChannelCount: UInt32 {
    return 1
}

override public var inputMIDIChannelCount: UInt32 {
    return 1
}
```

**APRÈS** (correct) :
```swift
// API Swift moderne
override public var midiOutputNames: [String] {
    return ["Atome MIDI Out"]
}

// Propriétés outputMIDIChannelCount/inputMIDIChannelCount supprimées
// (n'existent pas dans l'API Swift moderne)
```

### Étape 2 : Résolution dépendance cross-target

**Fichier** : `platforms/ios/atome-auv3/Common/WebViewManager.swift`

**Problème** : WebViewManager essayait d'accéder à `auv3Utils` au moment de la compilation, causant des erreurs cross-target.

**AVANT** (erreur compilation) :
```swift
if let auv3Instance = webView.window?.windowScene?.delegate as? auv3Utils {
    auv3Instance.sendMIDIRawViaHost(data: midiData)
}
```

**APRÈS** (runtime-safe) :
```swift
// Vérification runtime avec sélecteur
if let auv3Instance = webView.window?.windowScene?.delegate,
   auv3Instance.responds(to: Selector("sendMIDIRawViaHost:")) {
    auv3Instance.perform(Selector("sendMIDIRawViaHost:"), with: midiData)
}
```

---

## 🔧 Procédure de Réparation Complète

### 1. Identifier les erreurs Swift

```bash
cd /Users/atome/a/platforms/ios/atome-auv3
xcodebuild clean build -scheme "atome" 2>&1 | grep -i error
```

**Erreurs typiques à chercher** :
- `MIDIOutputNames` vs `midiOutputNames`
- `outputMIDIChannelCount` / `inputMIDIChannelCount` non reconnus
- Erreurs de compilation cross-target

### 2. Correction des APIs MIDI

**Localiser** : `platforms/ios/atome-auv3/auv3/utils.swift` ligne ~45-60

**Remplacer** :
```swift
// Dans la section "// MIDI Output capabilities pour host discovery"
override public var midiOutputNames: [String] {
    return ["Atome MIDI Out"]
}

// Supprimer complètement ces propriétés si présentes :
// - outputMIDIChannelCount
// - inputMIDIChannelCount
```

### 3. Correction dépendances cross-target

**Localiser** : `platforms/ios/atome-auv3/Common/WebViewManager.swift`

**Pattern runtime-safe** :
```swift
// Utiliser responds(to:) et perform() au lieu du cast direct
if let instance = potentialAuv3Instance,
   instance.responds(to: Selector("methodName:")) {
    instance.perform(Selector("methodName:"), with: parameter)
}
```

### 4. Compilation et test

```bash
# Build complet
cd /Users/atome/a/platforms/ios/atome-auv3
xcodebuild clean install -scheme "atome" CODE_SIGN_IDENTITY="iPhone Developer" -allowProvisioningUpdates

# Lancement app
open -n "/path/to/built/app"
```

---

## ✅ Validation du Succès

### Dans AUM Host Application

1. **Ajouter le plugin Atome** dans une channel
2. **Vérifier les connexions MIDI** :
   - ✅ **MIDI In** : "Atome MIDI In" (existait déjà)
   - ✅ **MIDI Out** : "Atome MIDI Out" (nouveau !)
3. **Test de routage** : Connecter "Atome MIDI Out" vers un autre plugin

### Messages de succès attendus
```
** INSTALL SUCCEEDED **
CodeSign /path/to/atomeAudioUnit.appex
RegisterWithLaunchServices /path/to/atome.app
```

---

## 🔍 Points Techniques Importants

### API Swift AUv3 Evolution

| Ancienne API | API Moderne | Status |
|--------------|-------------|---------|
| `MIDIOutputNames` | `midiOutputNames` | ✅ Requis |
| `outputMIDIChannelCount` | *(n'existe plus)* | ❌ Supprimer |
| `inputMIDIChannelCount` | *(n'existe plus)* | ❌ Supprimer |

### Configuration Info.plist validée

```xml
<dict>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).atomeAudioUnitFactory</string>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.AudioUnit-UI</string>
        <key>NSExtensionAttributes</key>
        <dict>
            <key>AudioUnit</key>
            <dict>
                <key>type</key>
                <string>aumi</string> <!-- Instrument, pas aumf -->
                <key>supportsMIDI</key>
                <true/>
                <key>supportsMIDIInput</key>
                <true/>
                <key>supportsMIDIOutput</key>
                <true/>
                <key>hasMIDIOutput</key>
                <true/>
            </dict>
        </dict>
    </dict>
</dict>
```

---

## 🚨 Pièges à Éviter

### 1. API Swift obsolètes
**Erreur** : Utiliser les anciens noms de propriétés
**Solution** : Toujours vérifier la documentation Swift actuelle

### 2. Cross-target compilation
**Erreur** : Cast direct entre targets différents
**Solution** : Utiliser runtime checking avec `responds(to:)`

### 3. Configuration incomplète
**Erreur** : Oublier les flags MIDI dans Info.plist
**Solution** : Vérifier `supportsMIDI`, `supportsMIDIOutput`, `hasMIDIOutput`

---

## 🎯 Résumé Exécutif

**Temps de résolution** : ~2h de debug approfondi
**Cause principale** : Swift API moderne vs ancienne documentation
**Impact** : Plugin AUv3 maintenant 100% compatible avec hosts MIDI
**Leçon apprise** : Toujours vérifier les APIs Swift lors d'erreurs AUv3 mystérieuses

---

## 📚 Ressources Complémentaires

- [Documentation AUv3 Apple](https://developer.apple.com/documentation/audiotoolbox/audio_unit_v3_plug-ins)
- [MIDI Swift APIs](https://developer.apple.com/documentation/coremidi)
- [Cross-target Swift patterns](https://docs.swift.org/swift-book/LanguageGuide/Protocols.html)

---

**Status** : ✅ **RÉSOLU** - Sorties MIDI visibles dans AUM  
**Date** : 8 août 2025  
**Validé par** : Tests en conditions réelles avec AUM host
