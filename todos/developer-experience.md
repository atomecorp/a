# 🚨 DEVELOPER EXPERIENCE - Erreurs plus claires

## Problèmes actuels
Le framework fail silencieusement dans plusieurs cas, rendant le debug difficile.

## Examples d'erreurs à améliorer

### 1. Template inexistant
```javascript
// Actuellement - silent fail
const element = $('nonexistent-template', { text: 'Hello' });
// → Crée un div vide sans avertissement

// Souhaité - erreur claire
// → Console: "⚠️ Template 'nonexistent-template' not found. Available: ['box', 'button', 'card']"
```

### 2. Parent selector invalide
```javascript
// Actuellement - silent fail ou erreur native
const element = $('box', { 
  parent: '#nonexistent-container' 
});
// → Element créé mais pas attaché

// Souhaité - fallback + warning
// → Console: "⚠️ Parent '#nonexistent-container' not found. Falling back to document.body"
```

### 3. CSS properties invalides
```javascript
// Actuellement - silent fail
const element = $('box', {
  css: {
    'invalid-property': 'value',
    backgroundColr: 'red' // typo
  }
});

// Souhaité - validation + suggestions
// → Console: "⚠️ Unknown CSS property 'backgroundColr'. Did you mean 'backgroundColor'?"
```

### 4. Event handlers non-fonctions
```javascript
// Actuellement - erreur native peu claire
const element = $('button', {
  onclick: "not a function" // String au lieu de fonction
});

// Souhaité - erreur explicite
// → Console: "❌ Event handler 'onclick' must be a function, got string"
```

## TODO Implementation
- [ ] Validation template registry avec suggestions
- [ ] Warning pour parent selectors invalides + fallback
- [ ] Validation CSS properties avec typo detection
- [ ] Type checking pour event handlers
- [ ] Mode dev vs prod (verbose vs silent)
- [ ] Helper `debugSquirrel()` pour état du système
