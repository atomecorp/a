# 🎨 SYSTÈME DE PRESETS/SKINS

## Vision
Système LEGO de composants pré-stylés et skinnables pour rapidité de développement.

## Examples d'usage souhaité

### Définition de presets
```javascript
// Preset de base
definePreset('button', {
  tag: 'button',
  css: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  }
});

// Skins pour le preset
defineSkin('button', 'primary', {
  backgroundColor: '#007bff',
  color: 'white'
});

defineSkin('button', 'danger', {
  backgroundColor: '#dc3545',
  color: 'white'
});

defineSkin('button', 'glass', {
  background: 'rgba(255,255,255,0.1)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.2)'
});
```

### Usage simple
```javascript
// Utilisation avec preset + skin
const saveBtn = $('button:primary', {
  text: 'Save',
  parent: document.body
});

const deleteBtn = $('button:danger', {
  text: 'Delete',
  parent: document.body
});

const glassBtn = $('button:glass', {
  text: 'Glass Effect',
  parent: document.body
});
```

### Presets complexes
```javascript
// Preset slider moderne
definePreset('slider', {
  tag: 'input',
  attrs: { type: 'range' },
  css: {
    appearance: 'none',
    height: '6px',
    borderRadius: '3px',
    outline: 'none'
  }
});

defineSkin('slider', 'ios', {
  background: '#ddd',
  // + pseudo-elements pour thumb styling
});

defineSkin('slider', 'material', {
  background: 'linear-gradient(to right, #4caf50, #ddd)',
});

// Usage
const volumeSlider = $('slider:ios', {
  value: 50,
  min: 0,
  max: 100,
  parent: controls
});
```

## TODO Implementation
- [ ] Créer `definePreset(name, config)`
- [ ] Créer `defineSkin(preset, skinName, styles)`
- [ ] Parser la syntaxe `'preset:skin'`
- [ ] Merge intelligent preset + skin + props
- [ ] Cache des combinaisons preset/skin
