// Extracted from button_builder.js: multi-state index helper and pure preset configuration.
// This module deliberately does not import the button constructor: the entry module owns
// instantiation, which keeps the component dependency graph acyclic.
import { buttonStyles } from './button_builder_templates.js';

// === FONCTION UTILITAIRE POUR CALCULER LE PROCHAIN ÉTAT ===
function getNextStateIndex(current, total, mode, direction = 1) {
  switch (mode) {
    case 'backward':
      return (current - 1 + total) % total;
    case 'ping-pong':
      const next = current + direction;
      if (next >= total) return total - 2;
      if (next < 0) return 1;
      return next;
    default: // 'forward'
      return (current + 1) % total;
  }
}

// === CONFIGURATIONS POUR VARIANTES COMMUNES ===

const buttonConfigForVariant = (config = {}, variant) => ({ ...config, variant });

const iconButtonConfig = (config = {}) => ({
  ...config,
  text: '',
  skin: {
    container: { padding: '8px', borderRadius: '50%' },
    ...config.skin
  }
});

const outlineButtonConfig = (config = {}) => ({
  ...config,
  variant: 'outline',
  skin: {
    container: {
      color: buttonStyles[config.color || 'primary']?.backgroundColor || '#007bff',
      borderColor: buttonStyles[config.color || 'primary']?.backgroundColor || '#007bff'
    },
    ...config.skin
  }
});

// === SYSTÈME DE PRESETS ===
const buttonPresets = {
  materialSwitch: (config = {}) => {
    const baseSkin = {
      container: {
        position: 'relative',
        width: '60px',
        height: '34px',
        padding: '0',
        borderRadius: '17px',
        backgroundColor: '#ccc',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        fontFamily: 'Roboto, Arial, sans-serif',
        fontSize: '0px'
      },
      icon: {
        position: 'absolute',
        left: '2px',
        top: '2px',
        width: '30px',
        height: '30px',
        borderRadius: '50%',
        backgroundColor: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0px',
        transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        transform: 'translateX(0px)'
      }
    };
    return {
      ...config,
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      },
      icon: config.icon || '○',
      text: config.text || 'OFF',
      id: config.id || 'material-toggle',
    };
  }
};

// Ajout d'une méthode utilitaire sur Button pour le preset
const materialSwitchConfig = (config = {}) => buttonPresets.materialSwitch(config);

export {
  getNextStateIndex,
  buttonConfigForVariant,
  iconButtonConfig,
  outlineButtonConfig,
  materialSwitchConfig
};
