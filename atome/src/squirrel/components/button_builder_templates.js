// Button visual config extracted from button_builder.js: variant templates, base styles, size presets.
const buttonTemplates = {
  'squirrel_design': {
    name: 'Material Design Green',
    description: 'Style Material Design avec couleurs vertes',
    css: {
      fontFamily: 'Roboto, sans-serif',
      fontSize: '12px',
      fontWeight: '300',
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      borderRadius: '3px',
      border: 'none',
      padding: '8px 9px',


      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      minWidth: '30px',
      height: '19px'
    },
    onStyle: {
      backgroundColor: 'rgba(99,99,99,1)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
      color: 'yellow',
    },
    offStyle: {
      backgroundColor: 'rgba(69,69,69,1)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      color: 'orange',
    }
  },
  // === MATERIAL DESIGN ===
  'material_design_blue': {
    name: 'Material Design Blue',
    description: 'Style Material Design avec couleurs bleues',
    css: {
      fontFamily: 'Roboto, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderRadius: '4px',
      border: 'none',
      padding: '8px 16px',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      // boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      // backgroundColor: '#2196F3',
      color: 'white',
      minWidth: '64px',
      height: '36px'
    },
    onStyle: {
      backgroundColor: '#1976D2',
      boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
    },
    offStyle: {
      backgroundColor: '#757575',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    },
    hover: {
      transform: 'translateY(-1px)',
      boxShadow: '0 6px 12px rgba(0,0,0,0.3)'
    },
    active: {
      transform: 'translateY(0)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }
  },


  'material_design_green': {
    name: 'Material Design Green',
    description: 'Style Material Design avec couleurs vertes',
    css: {
      fontFamily: 'Roboto, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderRadius: '4px',
      border: 'none',
      padding: '8px 16px',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      // boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      // backgroundColor: '#4CAF50',
      color: 'white',
      minWidth: '64px',
      height: '36px'
    },
    onStyle: {
      backgroundColor: '#388E3C',
      boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
    },
    offStyle: {
      backgroundColor: '#9E9E9E',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }
  },

  // === BOOTSTRAP STYLE ===
  'bootstrap_primary': {
    name: 'Bootstrap Primary',
    description: 'Style Bootstrap avec couleur primaire',
    css: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      fontWeight: '400',
      borderRadius: '6px',
      border: '1px solid transparent',
      padding: '6px 12px',
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
      // backgroundColor: '#007bff',
      //  border: '12px solid rgba(255,255,255,0.2)',

      // borderColor: '#007bff',
      color: 'white',
      minWidth: 'auto',
      height: 'auto'
    },
    onStyle: {
      backgroundColor: '#0056b3',
      borderColor: '#004085'
    },
    offStyle: {
      backgroundColor: '#6c757d',
      borderColor: '#5a6268'

    },
    hover: {
      backgroundColor: '#0056b3',
      borderColor: '#004085'
    }
  },

  // === FLAT DESIGN ===
  'flat_modern': {
    name: 'Flat Modern',
    description: 'Design plat moderne avec couleurs vives',
    css: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      borderRadius: '8px',
      border: 'none',
      padding: '10px 20px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      // backgroundColor: '#3498db',
      color: 'white',
      boxShadow: 'none'
    },
    onStyle: {
      backgroundColor: '#e74c3c',
      transform: 'scale(0.98)'
    },
    offStyle: {
      backgroundColor: '#95a5a6',
      transform: 'scale(1)'
    }
  },

  // === NEUMORPHISM ===
  'neumorphism_light': {
    name: 'Neumorphism Light',
    description: 'Style neumorphisme avec thème clair',
    css: {
      fontFamily: 'SF Pro Display, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      borderRadius: '12px',
      border: 'none',
      padding: '12px 24px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      // backgroundColor: '#e0e5ec',
      // color: '#333',
      // boxShadow: '6px 6px 12px #c5cad1, -6px -6px 12px #ffffff'
    },
    onStyle: {
      backgroundColor: '#d1d9e6',
      boxShadow: 'inset 4px 4px 8px #c5cad1, inset -4px -4px 8px #ffffff',
      color: '#2c3e50'
    },
    offStyle: {
      backgroundColor: '#e0e5ec',
      boxShadow: '6px 6px 12px #c5cad1, -6px -6px 12px #ffffff',
      color: '#7f8c8d'
    }
  },

  // === GLASSMORPHISM ===
  'glass_blur': {
    name: 'Glass Blur',
    description: 'Effet de verre avec flou',
    css: {
      fontFamily: 'Poppins, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      borderRadius: '15px',
      // border: '1px solid rgba(255,255,255,0.2)',
      padding: '10px 20px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      // backgroundColor: 'rgba(255,255,255,0.1)',
      backdropFilter: 'blur(10px)',
      color: 'white',
      // boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
    },
    onStyle: {
      backgroundColor: 'rgba(46, 213, 115, 0.3)',
      borderColor: 'rgba(46, 213, 115, 0.4)',
      boxShadow: '0 8px 32px rgba(46, 213, 115, 0.2)'
    },
    offStyle: {
      backgroundColor: 'rgba(255, 71, 87, 0.3)',
      borderColor: 'rgba(255, 71, 87, 0.4)',
      boxShadow: '0 8px 32px rgba(255, 71, 87, 0.2)'
    }
  },

  // === RETRO/VINTAGE ===
  'retro_80s': {
    name: 'Retro 80s',
    description: 'Style rétro années 80',
    css: {
      fontFamily: 'Orbitron, monospace',
      fontSize: '12px',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      borderRadius: '0',
      border: '2px solid #ff006e',
      padding: '8px 16px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      // backgroundColor: '#000',
      // color: '#ff006e',
      // boxShadow: '0 0 10px rgba(255, 0, 110, 0.5)'
    },
    onStyle: {
      backgroundColor: '#ff006e',
      color: '#000',
      boxShadow: '0 0 20px rgba(255, 0, 110, 0.8)'
    },
    offStyle: {
      backgroundColor: '#333',
      color: '#666',
      borderColor: '#666',
      boxShadow: '0 0 5px rgba(102, 102, 102, 0.3)'
    }
  }
};

// === FONCTIONS DE GESTION DES TEMPLATES ===

// Fonction pour appliquer un template

const buttonStyles = {
  primary: {
    backgroundColor: '#007bff',
    color: 'white',
    borderColor: '#007bff'
  },
  secondary: {
    backgroundColor: '#6c757d',
    color: 'white',
    borderColor: '#6c757d'
  },
  success: {
    backgroundColor: '#28a745',
    color: 'white',
    borderColor: '#28a745'
  },
  danger: {
    backgroundColor: '#dc3545',
    color: 'white',
    borderColor: '#dc3545'
  },
  warning: {
    backgroundColor: '#ffc107',
    color: '#212529',
    borderColor: '#ffc107'
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: '2px'
  },
  ghost: {
    backgroundColor: 'transparent',
    border: 'none',
    boxShadow: 'none'
  }
};

const buttonSizes = {
  xs: { padding: '4px 8px', fontSize: '11px' },
  sm: { padding: '6px 12px', fontSize: '12px' },
  md: { padding: '8px 16px', fontSize: '14px' }, // default
  lg: { padding: '12px 24px', fontSize: '16px' },
  xl: { padding: '16px 32px', fontSize: '18px' }
};

// === COMPOSANT BUTTON PRINCIPAL ===

/**
 * Crée un bouton entièrement skinnable
 * @param {Object} config - Configuration du bouton
 * @param {string} config.text - Texte du bouton
 * @param {string} config.icon - Icône (HTML ou emoji)
 * @param {string|number} config.badge - Badge/compteur
 * @param {string} config.variant - Style prédéfini (primary, secondary, etc.)
 * @param {string} config.size - Taille (xs, sm, md, lg, xl)
 * @param {Function} config.onClick - Handler de clic
 * @param {Object} config.skin - Styles personnalisés pour chaque partie
 * @param {string} config.id - ID personnalisé (sinon auto-généré)
 * @param {boolean} config.disabled - Bouton désactivé
 * 
 * === SYSTÈME DE TEMPLATES ===
 * @param {string} config.template - Nom du template à appliquer
 * @param {string} config.templates - Alias pour template
 * 
 * === NOUVELLES PROPRIÉTÉS TOGGLE ===
 * @param {string} config.onText - Texte quand activé
 * @param {string} config.offText - Texte quand désactivé
 * @param {Function} config.onAction - Action quand passe à ON
 * @param {Function} config.offAction - Action quand passe à OFF
 * @param {Object} config.onStyle - Styles CSS pour état ON
 * @param {Object} config.offStyle - Styles CSS pour état OFF
 * @param {boolean} config.initialState - État initial (true=ON, false=OFF)
 * @param {Function} config.onStateChange - Callback lors du changement d'état
 * 
 * === PROPRIÉTÉS MULTI-ÉTATS ===
 * @param {Array} config.states - Array d'états {text, css, action, icon}
 * @param {string} config.cycleMode - Mode de cycle ('forward', 'backward', 'ping-pong')
 */

export { buttonTemplates, buttonStyles, buttonSizes };
