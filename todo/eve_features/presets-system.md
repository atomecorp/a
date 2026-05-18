# 🎨 PRESET/SKIN SYSTEM

## Vision
LEGO-style system of pre-styled and skinnable components for rapid development.

## Desired Usage Examples

### Preset Definition
```javascript
// Basic preset
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

// Skins for the preset
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

### Simple Usage
```javascript
// Usage with preset + skin
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

### Complex Presets
```javascript
// Modern slider preset
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
  // + pseudo-elements for thumb styling
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
- [ ] Create `definePreset(name, config)`
- [ ] Create `defineSkin(preset, skinName, styles)`
- [ ] Parse the syntax `'preset:skin'`
- [ ] Smart merge of preset + skin + props
- [ ] Cache for preset/skin combinations
