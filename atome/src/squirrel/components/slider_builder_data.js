// Slider visual config extracted from slider_builder.js: variant styles, size presets, and the preset system.
const sliderVariants = {
  horizontal: {
    container: { width: '200px', height: '20px' },
    track: { width: '100%', height: '4px', top: '50%', transform: 'translateY(-50%)' },
    progression: { height: '100%', left: '0', top: '0', borderTopLeftRadius: '4px', borderBottomLeftRadius: '4px' },
    handle: { width: '16px', height: '16px', top: '50%' },
    label: { top: '25px', transform: 'translateX(-50%)' }
  },
  vertical: {
    container: { width: '20px', height: '200px' },
    track: { width: '4px', height: '100%', left: '50%', transform: 'translateX(-50%)' },
    progression: { width: '100%', bottom: '0', left: '0', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' },
    handle: { width: '16px', height: '16px', left: '50%' },
    label: { left: '25px', transform: 'translateY(-50%)' }
  },
  circular: {
    container: { width: '120px', height: '120px' },
    track: { width: '100%', height: '100%', borderRadius: '50%', border: '4px solid #e0e0e0' },
    progression: { display: 'none' }, // Progression géré différemment pour circulaire (SVG)
    handle: { width: '20px', height: '20px' },
    label: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
};

const sliderSizes = {
  sm: { scale: 0.8 },
  md: { scale: 1 }, // default
  lg: { scale: 1.2 },
  xl: { scale: 1.5 }
};

// === SYSTÈME DE PRESETS ===
const sliderPresets = {
  materialHorizontal: (config = {}) => {
    const baseSkin = {
      container: {
        width: '250px',
        height: '24px',
        padding: '12px 0'
      },
      track: {
        width: '100%',
        height: '4px',
        top: '10px',
        backgroundColor: '#e0e0e0',
        borderRadius: '2px'
      },
      progression: {
        height: '100%',
        backgroundColor: '#1976d2',
        borderRadius: '2px'
      },
      handle: {
        width: '20px',
        height: '20px',
        top: '-8px',
        backgroundColor: '#1976d2',
        border: 'none',
        boxShadow: '0 3px 6px rgba(25, 118, 210, 0.3)'
      },
      label: {
        top: '30px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#1976d2'
      }
    };
    return {
      ...config,
      type: 'horizontal',
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      }
    };
  },

  materialVertical: (config = {}) => {
    const baseSkin = {
      container: {
        width: '24px',
        height: '250px',
        padding: '0 12px'
      },
      track: {
        width: '4px',
        height: '100%',
        left: '10px',
        backgroundColor: '#e0e0e0',
        borderRadius: '2px'
      },
      progression: {
        width: '100%',
        backgroundColor: '#1976d2',
        borderRadius: '2px'
      },
      handle: {
        width: '20px',
        height: '20px',
        left: '-8px',
        backgroundColor: '#1976d2',
        border: 'none',
        boxShadow: '0 3px 6px rgba(25, 118, 210, 0.3)'
      },
      label: {
        left: '30px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#1976d2'
      }
    };
    return {
      ...config,
      type: 'vertical',
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      }
    };
  },

  materialCircular: (config = {}) => {
    const baseSkin = {
      container: {
        width: '140px',
        height: '140px',
        padding: '10px'
      },
      track: {
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        border: '6px solid #e0e0e0',
        backgroundColor: 'transparent'
      },
      handle: {
        width: '24px',
        height: '24px',
        backgroundColor: '#1976d2',
        border: '3px solid #fff',
        boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)'
      },
      label: {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1976d2'
      }
    };
    return {
      ...config,
      type: 'circular',
      skin: {
        ...baseSkin,
        ...(config.skin || {})
      }
    };
  }
};

// === COMPOSANT SLIDER PRINCIPAL ===

/**
 * Crée un slider entièrement skinnable
 * @param {Object} config - Configuration du slider
 * @param {string} config.type - Type de slider (horizontal, vertical, circular)
 * @param {number} config.min - Valeur minimum (défaut: 0)
 * @param {number} config.max - Valeur maximum (défaut: 100)
 * @param {number} config.value - Valeur initiale (défaut: 50)
 * @param {number} config.step - Pas de progression (défaut: 1)
 * @param {Function} config.onChange - Handler de changement de valeur
 * @param {Function} config.onInput - Handler d'input continu
 * @param {Object} config.skin - Styles personnalisés pour chaque partie
 * @param {string} config.id - ID personnalisé (sinon auto-généré)
 * @param {boolean} config.disabled - Slider désactivé
 * @param {boolean} config.showLabel - Afficher la valeur (défaut: true)
 * @param {boolean} config.showTicks - Afficher les graduations
 * @param {Array} config.ticks - Positions des graduations
 * @param {number} config.radius - Rayon personnalisé pour slider circulaire
 * @param {number} config.handleOffset - Décalage du handle (en %) : positif = extérieur, négatif = intérieur
 */

export { sliderVariants, sliderSizes, sliderPresets };
