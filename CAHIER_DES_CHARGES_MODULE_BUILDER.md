# 📋 Cahier des Charges - Module Builder avec APIs Squirrel.js

## 🎯 Objectif

Reproduire toutes les fonctionnalités du composant Web `src/squirrel/components/module_builder.js` en utilisant uniquement les APIs natives de **Squirrel.js** sans recours aux Web Components.

---

## 📊 Analyse du Module Existant

### 🔧 Fonctionnalités Principales Identifiées

#### 1. **Configuration et Initialisation**
- **Configuration flexible** : Système de configuration avec fusion intelligente (mergeConfig)
- **Positionnement** : Support des coordonnées x/y et dimensionnement automatique
- **Auto-attachement** : Capacité de s'attacher automatiquement à un conteneur
- **Registry global** : Système de registre pour tous les modules et connexions

#### 2. **Interface Utilisateur**
- **Structure modulaire** : Header, Content et Connecteurs
- **Système de styles** : CSS généré dynamiquement avec support des objets et tableaux
- **Shadow DOM** : Encapsulation des styles (à remplacer par isolation CSS)
- **Responsive design** : Adaptation automatique selon les contraintes

#### 3. **Système d'Animation**
- **Animations configurables** : États hover, selected, drag, connecteurs
- **Keyframes dynamiques** : Génération CSS à la volée
- **Timing personnalisé** : Support cubic-bezier et durées custom
- **Système de particules** : Intégration avec UniversalParticleProcessor

#### 4. **Interactions**
- **Drag & Drop** : Déplacement des modules avec contraintes
- **Sélection** : Sélection simple et multiple
- **Renommage** : Double-clic pour édition in-place
- **Connexions** : Création/suppression de liens entre modules

#### 5. **Système de Connexions**
- **Connecteurs typés** : Input/Output avec types (audio, control, data, midi, video)
- **Détection intelligente** : Recherche de connecteurs sous la souris
- **Lignes de connexion** : Rendu SVG avec couleurs selon le type
- **Gestion des états** : Highlighting, validation, suppression

##### 🔗 **Connexion par Drag & Drop**
- **Drag source** : Cliquer-glisser depuis un connecteur (input ou output)
- **Visual feedback** : Ligne temporaire qui suit la souris pendant le drag
- **Drop validation** : Vérification de compatibilité des types lors du drop
- **Drop target** : Survol des connecteurs compatibles avec highlighting
- **Auto-connection** : Relâcher sur un connecteur compatible crée la connexion
- **Cancel drag** : Relâcher dans le vide annule l'opération

##### 🖱️ **Connexion par Clic**
- **Premier clic** : Sélectionner un connecteur (feedback visuel)
- **État sélectionné** : Le connecteur reste highlighted
- **Deuxième clic** : Cliquer sur un autre connecteur compatible
- **Auto-connection** : Si compatible, créer la connexion automatiquement
- **Déconnexion** : Si déjà connectés, supprimer la connexion existante
- **Cancel sélection** : Cliquer dans le vide désélectionne

##### 🎨 **Visual Feedback des Connexions**
- **Ligne temporaire** : Pendant le drag, ligne qui suit la souris
- **Couleurs par type** : 
  - Audio : `#ff6b6b` (rouge)
  - Control : `#4ecdc4` (turquoise)
  - Data : `#45b7d1` (bleu)
  - MIDI : `#96ceb4` (vert)
  - Video : `#feca57` (jaune)
- **États visuels** :
  - Normal : Ligne solide
  - Hover : Ligne plus épaisse + glow
  - Invalid : Ligne en pointillé rouge
  - Connecting : Animation pulse sur le connecteur

##### ⚡ **Gestion des États de Connexion**
- **Compatible** : Connecteurs du même type ou compatibles
- **Incompatible** : Types différents non-compatibles
- **Déjà connecté** : Une connexion existe déjà
- **Self-connection** : Impossible de connecter un module à lui-même
- **Direction** : Input ne peut se connecter qu'à Output et vice-versa

#### 6. **Callbacks et Événements**
- **Événements customs** : connectionCreated, moduleSelected, etc.
- **Callbacks configurables** : onConnectionCreate, onModuleSelect
- **Propagation** : Bubbling et gestion des événements

---

## 🛠 Architecture Technique Proposée

### 📦 Structure des Fichiers

```
/module-builder-api/
├── module-builder.js          # Factory principal utilisant Squirrel APIs
├── module-registry.js         # Gestionnaire global des modules
├── connection-manager.js      # Gestionnaire des connexions
├── animation-engine.js        # Moteur d'animations
├── drag-controller.js         # Contrôleur drag & drop
├── style-processor.js         # Processeur de styles CSS
└── event-dispatcher.js        # Gestionnaire d'événements
```

### 🎨 APIs Squirrel.js à Utiliser

#### 1. **Création d'Éléments - `$()`**
```javascript
// Utilisation de l'API principale pour créer les modules
const moduleContainer = $('div', {
    id: `module-${id}`,
    class: 'module-container',
    css: {
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`
    }
});
```

#### 2. **Templates Registry**
```javascript
// Définition de templates pour les composants
template('module-header', {
    tag: 'div',
    class: 'module-header',
    css: {
        background: 'linear-gradient(145deg, #34495e 0%, #2c3e50 50%)',
        padding: '10px 16px'
    }
});
```

#### 3. **Gestion d'Événements**
```javascript
// Utilisation des gestionnaires d'événements Squirrel
element.onclick = (e) => handleModuleClick(e);
element.ondblclick = (e) => handleRename(e);
element.onmousedown = (e) => startDrag(e);
```

#### 4. **Manipulation CSS**
```javascript
// Utilisation de l'API CSS de Squirrel
element.css({
    transform: 'scale(1.02) translateY(-2px)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.2)'
});
```

---

## 📋 Spécifications Fonctionnelles

### 🏗 Module Factory Principal

#### **Signature d'API**
```javascript
function createModule(config) {
    // Configuration identique au Web Component
    return {
        element,           // Élément DOM principal
        id,               // Identifiant unique
        config,           // Configuration fusionnée
        connections,      // Set des connexions
        // ... méthodes publiques
    };
}
```

#### **Configuration Requise**
```javascript
const defaultConfig = {
    // Identité et position
    id: 'module_' + Date.now(),
    name: 'Untitled Module',
    x: undefined,
    y: undefined,
    width: 200,
    height: 120,
    
    // Connecteurs
    inputs: [
        { id: 'in1', name: 'Input 1', type: 'audio', color: '#e74c3c' }
    ],
    outputs: [
        { id: 'out1', name: 'Output 1', type: 'audio', color: '#e74c3c' }
    ],
    
    // Styles personnalisables
    containerStyle: {
        backgroundColor: '#2c3e50',
        border: '2px solid #34495e',
        borderRadius: '12px'
    },
    
    // Animations
    animations: {
        enabled: true,
        duration: '0.3s',
        timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        moduleHover: { /* ... */ },
        moduleSelected: { /* ... */ },
        connectorHover: { /* ... */ }
    },
    
    // Callbacks
    callbacks: {
        onConnectionCreate: (connection) => {},
        onModuleSelect: (module) => {},
        onModuleRename: (oldName, newName) => {}
    }
};
```

### 🎨 Système de Styles

#### **Processeur CSS avec Squirrel**
```javascript
function applyStyles(element, styles) {
    // Conversion objets → CSS via APIs Squirrel
    if (typeof styles === 'object') {
        element.css(styles);
    } else if (typeof styles === 'string') {
        element.style.cssText += styles;
    }
}

function generateModuleCSS(config) {
    // Génération CSS dynamique équivalente
    const css = `
        .module-container {
            ${objectToCss(config.containerStyle)}
            transition: all ${config.animations.duration} ${config.animations.timing};
        }
        
        .module-container:hover {
            ${objectToCss(config.animations.moduleHover)}
        }
    `;
    
    // Injection CSS global
    injectGlobalCSS(css);
}
```

### 🔗 Gestionnaire de Connexions

#### **API Connexions**
```javascript
const ConnectionManager = {
    connections: new Map(),
    
    create(sourceModule, sourceConnector, targetModule, targetConnector) {
        // Validation des types
        // Création ligne SVG
        // Enregistrement dans le registry
        // Dispatch événements
    },
    
    remove(connectionId) {
        // Suppression ligne
        // Nettoyage registry
        // Callbacks
    },
    
    findAt(x, y) {
        // Détection sous la souris
        // Équivalent à _findConnectorAtPosition
    }
};
```

### 🎭 Moteur d'Animations

#### **Animation Engine**
```javascript
const AnimationEngine = {
    apply(element, animationConfig) {
        if (!animationConfig.enabled) return;
        
        // Application via Squirrel CSS APIs
        element.css({
            transform: animationConfig.transform,
            transition: `all ${animationConfig.duration} ${animationConfig.timing}`,
            boxShadow: Array.isArray(animationConfig.boxShadow) 
                ? animationConfig.boxShadow.join(', ')
                : animationConfig.boxShadow
        });
    },
    
    setupHoverAnimations(element, config) {
        element.onmouseenter = () => this.apply(element, config.animations.moduleHover);
        element.onmouseleave = () => this.resetToDefault(element);
    }
};
```

### 🖱 Contrôleur Drag & Drop

#### **Drag Controller**
```javascript
const DragController = {
    setupDragging(module) {
        let isDragging = false;
        let startPos = { x: 0, y: 0 };
        
        module.header.onmousedown = (e) => {
            if (module._isDragDisabled) return;
            
            isDragging = true;
            startPos = { x: e.clientX, y: e.clientY };
            
            const handleMove = (e) => {
                if (!isDragging) return;
                
                const deltaX = e.clientX - startPos.x;
                const deltaY = e.clientY - startPos.y;
                
                module.element.css({
                    left: `${module.config.x + deltaX}px`,
                    top: `${module.config.y + deltaY}px`
                });
                
                // Mise à jour des lignes de connexion
                ConnectionManager.updateLines(module);
            };
            
            const handleUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };
            
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
        };
    }
};
```

---

## 🎯 Implémentation Étape par Étape

### **Phase 1: Factory Principal** (2-3 jours)
1. ✅ Création factory `createModule(config)`
2. ✅ Système de merge configuration
3. ✅ Structure DOM de base (header, content, connecteurs)
4. ✅ Registry global des modules

### **Phase 2: Styles et Animations** (2-3 jours)
1. ✅ Processeur CSS utilisant APIs Squirrel
2. ✅ Système d'animations configurables
3. ✅ États hover/selected/drag
4. ✅ Injection CSS global

### **Phase 3: Interactions** (3-4 jours)
1. ✅ Drag & Drop des modules
2. ✅ Sélection et multi-sélection
3. ✅ Renommage double-clic
4. ✅ Gestion des événements

### **Phase 4: Système de Connexions** (4-5 jours)
1. ✅ Création/gestion connecteurs
2. ✅ Détection sous la souris
3. ✅ Lignes SVG de connexion
4. ✅ Validation et couleurs par type

### **Phase 5: Finalisation** (1-2 jours)
1. ✅ Tests et debugging
2. ✅ Documentation API
3. ✅ Exemples d'utilisation
4. ✅ Performance et optimisations

---

## 📚 APIs Squirrel.js Requises

### 🎨 **CSS et Styles**
```javascript
// API principale de création
$(tag, props)

// Templates
template(id, config)

// Manipulation CSS
element.css(styles)
element.width(value)
element.height(value)
element.x(value)  // left
element.y(value)  // top
```

### 🎭 **Événements**
```javascript
// Gestionnaires d'événements
element.onclick = handler
element.onmousedown = handler
element.onmousemove = handler
element.onmouseup = handler
element.ondblclick = handler
```

### 🔍 **Sélection DOM**
```javascript
// API grab pour récupération d'éléments
grab(id)

// Registry interne
_registry[id]
```

### 🎲 **Utilitaires**
```javascript
// Délais
wait(delay, callback)

// Inspection et debug
element.inspect()

// Extensions Array/Object
array.each(callback)
```

---

## 🚀 Avantages de cette Approche

### ✅ **Performances**
- ❌ Pas de Shadow DOM (overhead éliminé)
- ✅ CSS global optimisé
- ✅ Manipulation DOM directe via Squirrel

### ✅ **Maintenabilité**
- ✅ APIs Squirrel natives et cohérentes
- ✅ Code plus simple sans Web Components
- ✅ Debugging facilité

### ✅ **Flexibilité**
- ✅ Intégration parfaite avec l'écosystème Squirrel
- ✅ Styling CSS complet via APIs
- ✅ Extension facile des fonctionnalités

### ✅ **Compatibilité**
- ✅ Fonctionne partout où Squirrel fonctionne
- ✅ Pas de polyfills Web Components
- ✅ Intégration avec autres composants Squirrel

---

## 📋 Livrables Attendus

### 📦 **Code Source**
1. **module-builder.js** - Factory principal
2. **module-registry.js** - Gestionnaire global
3. **connection-manager.js** - Système de connexions
4. **animation-engine.js** - Moteur d'animations
5. **style-processor.js** - Processeur CSS

### 📖 **Documentation**
1. **API Reference** - Documentation complète
2. **Examples** - Cas d'usage avec code
3. **Migration Guide** - Migration du Web Component
4. **Performance Guide** - Optimisations

### 🧪 **Tests et Validation**
1. **Tests unitaires** - Couverture fonctionnelle
2. **Tests d'intégration** - Avec autres composants Squirrel
3. **Benchmarks** - Comparaison performance vs Web Component
4. **Examples interactifs** - Démonstrations live

---

## 🎯 Résultat Final

Un **système de modules** complet, performant et 100% compatible avec l'écosystème **Squirrel.js**, offrant toutes les fonctionnalités du Web Component original avec :

- 🚀 **Meilleures performances** (pas de Shadow DOM)
- 🎨 **Intégration CSS parfaite** avec les APIs Squirrel
- 🔧 **Maintenabilité améliorée** avec du code plus simple
- 🎯 **Fonctionnalités identiques** au Web Component
- ✨ **Extension facile** pour de nouvelles fonctionnalités

**Estimation totale : 12-17 jours de développement**
