# 📏 Matrix Spacing API Documentation

## Vue d'ensemble

Le composant Matrix propose maintenant un système d'espacement amélioré qui résout les problèmes d'irrégularité dans l'espacement entre cellules. Plusieurs modes d'espacement sont disponibles pour différents cas d'usage.

## Problème résolu

**Problème initial :** L'espacement CSS `gap` pouvait créer des inconsistances visuelles, certaines cellules apparaissant collées tandis que d'autres étaient bien espacées, particulièrement avec de faibles valeurs d'espacement.

**Solution :** Implémentation de 4 modes d'espacement différents avec contrôle précis.

## Configuration d'espacement

### Structure de configuration

```javascript
spacing: {
    horizontal: 4,          // Espacement horizontal en pixels
    vertical: 4,            // Espacement vertical en pixels
    mode: 'gap',           // Mode d'espacement: 'gap', 'margin', 'padding', 'border'
    uniform: true,         // Force un espacement uniforme
    outer: 2              // Espacement externe (padding du container)
}
```

### Modes d'espacement

#### 1. Mode `gap` (par défaut)
- **Usage :** CSS Grid `gap`
- **Avantages :** Performance optimale, code simple
- **Idéal pour :** Espacement > 3px, grilles régulières
- **Uniform=true :** Utilise la moyenne des espacements H/V

```javascript
spacing: {
    horizontal: 4,
    vertical: 4,
    mode: 'gap',
    uniform: true,
    outer: 2
}
```

#### 2. Mode `margin`
- **Usage :** Marges calculées sur chaque cellule
- **Avantages :** Contrôle précis, évite les doublements
- **Idéal pour :** Espacement variable, interfaces complexes

```javascript
spacing: {
    horizontal: 3,
    vertical: 5,
    mode: 'margin',
    uniform: false,  // Permet H ≠ V
    outer: 1
}
```

#### 3. Mode `border`
- **Usage :** Bordures transparentes
- **Avantages :** Espacement minimal précis (0-2px)
- **Idéal pour :** Séquenceurs, grilles denses

```javascript
spacing: {
    horizontal: 1,
    vertical: 1,
    mode: 'border',
    uniform: true,
    outer: 0
}
```

#### 4. Mode `padding`
- **Usage :** Padding sur chaque cellule
- **Avantages :** Espacement interne, préserve la taille
- **Idéal pour :** Interfaces tactiles, boutons

```javascript
spacing: {
    horizontal: 2,
    vertical: 3,
    mode: 'padding',
    uniform: false,
    outer: 0
}
```

## API Publique

### Création avec espacement

```javascript
const matrix = new Matrix({
    id: 'my_matrix',
    grid: { x: 4, y: 4 },
    spacing: {
        horizontal: 3,
        vertical: 3,
        mode: 'gap',
        uniform: true,
        outer: 1
    }
    // ... autres options
});
```

### Modification dynamique

```javascript
// Changer le mode d'espacement
matrix.setSpacing({
    horizontal: 5,
    vertical: 5,
    mode: 'margin',
    uniform: false,
    outer: 2
});

// Modification partielle (conserve les autres valeurs)
matrix.setSpacing({
    mode: 'border',
    horizontal: 1
});
```

## Exemples d'usage

### Pad de contrôle audio
```javascript
const audioPad = new Matrix({
    spacing: {
        horizontal: 4,
        vertical: 4,
        mode: 'gap',       // Performance optimale
        uniform: true,     // Espacement régulier
        outer: 2          // Marge externe
    }
});
```

### Interface de mixage responsive
```javascript
const mixer = new Matrix({
    spacing: {
        horizontal: 2,
        vertical: 2,
        mode: 'margin',    // Contrôle précis
        uniform: false,    // H ≠ V possible
        outer: 1          // Marge minimale
    }
});
```

### Séquenceur pas à pas
```javascript
const sequencer = new Matrix({
    spacing: {
        horizontal: 1,
        vertical: 1,
        mode: 'border',    // Espacement minimal
        uniform: true,     // Régularité
        outer: 0          // Pas de marge
    }
});
```

## Guide de choix du mode

| Cas d'usage | Mode recommandé | Raison |
|-------------|----------------|--------|
| Grille > 3px espacement | `gap` | Performance et simplicité |
| Espacement < 3px | `border` | Précision maximale |
| Interface responsive | `margin` | Contrôle flexible |
| Boutons tactiles | `padding` | Zone de clic préservée |
| Espacement variable H≠V | `margin` ou `padding` | Support natif |
| Performance critique | `gap` | CSS Grid natif |

## Interface de test

### Contrôles disponibles
- **Sliders :** Espacement horizontal/vertical (0-20px)
- **Select :** Mode d'espacement
- **Checkbox :** Espacement uniforme
- **Presets :** Configurations prédéfinies

### Page de test
Ouvrez `test-spacing-matrix.html` pour :
- Tester tous les modes en temps réel
- Comparer les résultats visuels
- Créer des matrices de test
- Exporter les configurations

## Intégration dans l'interface

### Contrôles dans index.js
```javascript
// Interface utilisateur avec contrôles d'espacement
ui.innerHTML = `
    <div>
        <label>Mode: </label>
        <select id="spacing-mode-select">
            <option value="gap">Gap</option>
            <option value="margin">Margin</option>
            <option value="border">Border</option>
            <option value="padding">Padding</option>
        </select>
    </div>
    <div>
        <label>H: </label>
        <input type="range" id="spacing-h" min="0" max="10" value="2">
        <span id="spacing-h-val">2</span>px
    </div>
    <div>
        <label>V: </label>
        <input type="range" id="spacing-v" min="0" max="10" value="2">
        <span id="spacing-v-val">2</span>px
    </div>
    <button id="apply-spacing-btn">Apply Spacing</button>
`;
```

### Application à toutes les matrices
```javascript
document.getElementById('apply-spacing-btn').addEventListener('click', () => {
    const newSpacing = {
        horizontal: parseInt(document.getElementById('spacing-h').value),
        vertical: parseInt(document.getElementById('spacing-v').value),
        mode: document.getElementById('spacing-mode-select').value,
        uniform: true,
        outer: 0
    };
    
    // Appliquer à toutes les matrices
    Matrix.getAllMatrices().forEach(matrix => {
        matrix.setSpacing(newSpacing);
    });
});
```

## Considérations techniques

### Performance
1. **`gap`** : Le plus performant (CSS natif)
2. **`border`** : Très bon (une propriété par cellule)
3. **`margin`** : Bon (calculs de marges)
4. **`padding`** : Bon (simple application)

### Compatibilité
- Tous les navigateurs modernes
- CSS Grid support requis
- ResizeObserver pour responsive

### Limitations
- **`gap`** : Espacement identique H/V en mode uniform
- **`border`** : Peut affecter la couleur de fond
- **`margin`** : Calculs plus complexes
- **`padding`** : Réduit l'espace intérieur des cellules

## Bonnes pratiques

1. **Commencez par `gap`** pour la majorité des cas
2. **Utilisez `border`** pour l'espacement minimal (< 3px)
3. **Préférez `margin`** pour les interfaces responsives
4. **Testez toujours** avec la page de test incluse
5. **Documentez** le choix du mode dans vos projets

## Dépannage

### Espacement irrégulier
**Solution :** Passez de `gap` à `border` ou `margin`

### Cellules qui se chevauchent
**Solution :** Vérifiez les valeurs négatives, utilisez `outer > 0`

### Performance dégradée
**Solution :** Revenez au mode `gap` avec `uniform: true`

### Espacement trop grand
**Solution :** Réduisez les valeurs ou changez de mode

---

Cette documentation couvre l'ensemble du système d'espacement amélioré pour les matrices. Pour des exemples pratiques, consultez `test-spacing-matrix.html` et `index.js`.