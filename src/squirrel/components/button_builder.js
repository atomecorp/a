import { $, define } from '../squirrel.js';

/**
 * Composant Button skinnable avec HyperSquirrel
 * Chaque élément du bouton est entièrement customisable
 */

// === SYSTÈME DE TEMPLATES/SKINS ===

// Registre des templates globaux
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
      // boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      // backgroundColor: 'rgba(69,69,69,1)',
      // color: 'orange',
      minWidth: '30px',
      height: '19px'
    },
    onStyle: {
        backgroundColor: 'rgba(99,99,99,1)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
         color: 'pink',
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
const applyTemplate = (config, templateName) => {
  const template = buttonTemplates[templateName];
  if (!template) {
    console.warn(`Template "${templateName}" non trouvé. Templates disponibles:`, Object.keys(buttonTemplates));
    return config;
  }

  // Fusionner les styles du template avec la config
  const mergedConfig = {
    ...config,
    css: {
      ...template.css,
      ...config.css // Les styles personnalisés overrident le template
    }
  };

  // Appliquer les styles ON/OFF du template si pas définis dans config
  if (template.onStyle && !config.onStyle) {
    mergedConfig.onStyle = template.onStyle;
  } else if (template.onStyle && config.onStyle) {
    mergedConfig.onStyle = { ...template.onStyle, ...config.onStyle };
  }

  if (template.offStyle && !config.offStyle) {
    mergedConfig.offStyle = template.offStyle;
  } else if (template.offStyle && config.offStyle) {
    mergedConfig.offStyle = { ...template.offStyle, ...config.offStyle };
  }

  // Stocker les infos du template pour référence
  mergedConfig._templateName = templateName;
  mergedConfig._templateInfo = template;

  return mergedConfig;
};

// Fonction pour ajouter des effets hover/active du template
const applyTemplateEffects = (button, template) => {
  if (template.hover) {
    button.addEventListener('mouseenter', () => {
      button.$({ css: template.hover });
    });

    button.addEventListener('mouseleave', () => {
      // Retourner au style de base
      const currentState = button.getState ? button.getState() : null;
      if (currentState !== null) {
        // Mode toggle - appliquer le style selon l'état
        const stateStyle = currentState ? button._config.onStyle : button._config.offStyle;
        button.$({ css: { ...template.css, ...stateStyle } });
      } else {
        // Mode normal - retourner au style de base
        button.$({ css: template.css });
      }
    });
  }

  if (template.active) {
    button.addEventListener('mousedown', () => {
      button.$({ css: template.active });
    });

    button.addEventListener('mouseup', () => {
      const currentState = button.getState ? button.getState() : null;
      if (currentState !== null) {
        const stateStyle = currentState ? button._config.onStyle : button._config.offStyle;
        button.$({ css: { ...template.css, ...stateStyle } });
      } else {
        button.$({ css: template.css });
      }
    });
  }
};

// === DÉFINITION DES TEMPLATES DE BASE ===

// Template pour le conteneur principal du bouton
define('button-container', {
  tag: 'button',
  class: 'hs-button',
  text: 'hello',
  css: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    backgroundColor: '#f8f9fa',
    color: '#333',
    fontSize: '14px',
    fontFamily: 'system-ui, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    outline: 'none'
  },
  attrs: {
    type: 'button'
  }
});

// Template pour l'icône du bouton
define('button-icon', {
  tag: 'span',
  class: 'hs-button-icon',
  css: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '6px',
    fontSize: '16px'
  }
});

// Template pour le texte du bouton
define('button-text', {
  tag: 'span',
  class: 'hs-button-text',
  css: {
    fontSize: 'inherit',
    fontWeight: '400',
    lineHeight: '1'
  }
});

// Template pour le badge/compteur
define('button-badge', {
  tag: 'span',
  class: 'hs-button-badge',
  css: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    minWidth: '18px',
    height: '18px',
    padding: '0 4px',
    borderRadius: '9px',
    backgroundColor: '#dc3545',
    color: 'white',
    fontSize: '11px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
});

// === VARIANTES DE STYLES PRÉDÉFINIES ===

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
const createButton = (config = {}) => {
  const {
    text = 'Button',
    icon,
    badge,
    variant = 'default',
    size = 'md',
    onClick,
    skin = {},
    id,
    disabled = false,
    
    // === SYSTÈME DE TEMPLATES ===
    template, // ou templates pour compatibilité
    templates, // alias pour template
    
    // === NOUVELLES PROPRIÉTÉS TOGGLE ===
    onText,
    offText,
    onAction,
    offAction,
    onStyle = {},
    offStyle = {},
    initialState = false, // false = OFF, true = ON
    onStateChange,
    
    // === PROPRIÉTÉS POUR ÉTATS MULTIPLES ===
    states, // Array d'états personnalisés
    cycleMode = 'forward',
    
    ...otherProps
  } = config;

  // Génération d'ID unique si non fourni
  const buttonId = id || `btn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Résoudre le nom du template
  const templateName = template || templates;
  
  // Appliquer le template si spécifié
  let processedConfig = config;
  if (templateName) {
    processedConfig = applyTemplate(config, templateName);
  }

  // Déterminer le mode de fonctionnement
  const isToggleMode = onText !== undefined || offText !== undefined;
  const isMultiStateMode = states && states.length > 0;
  
  // État interne pour le toggle
  let currentToggleState = initialState;
  let currentStateIndex = 0;
  let pingPongDirection = 1;

  // Configuration initiale selon le mode
  let finalText = text;
  let finalStyles = {};

  if (isToggleMode) {
    // Mode toggle: utiliser l'état initial pour déterminer le texte et les styles
    finalText = currentToggleState ? (onText || text) : (offText || text);
    const toggleStyles = currentToggleState ? processedConfig.onStyle : processedConfig.offStyle;
    finalStyles = { ...toggleStyles };
  } else if (isMultiStateMode) {
    // Mode multi-états: utiliser le premier état
    const firstState = states[0];
    finalText = firstState.text || text;
    finalStyles = { ...firstState.css };
  }

  // Styles de base selon variant et size
  let containerStyles = { ...buttonStyles[variant] || {}, ...buttonSizes[size] || {} };

  // Application des styles personnalisés dans l'ordre de priorité
  // 1. Styles de base (variant + size)
  // 2. Styles de template
  // 3. Styles de skin.container
  // 4. Styles de toggle/états (onStyle/offStyle ou states.css)
  // 5. Styles de config.css (priorité absolue)
  
  if (templateName && buttonTemplates[templateName]) {
    containerStyles = { ...containerStyles, ...buttonTemplates[templateName].css };
  }
  
  if (skin.container) {
    containerStyles = { ...containerStyles, ...skin.container };
  }
  
  if (Object.keys(finalStyles).length > 0) {
    containerStyles = { ...containerStyles, ...finalStyles };
  }
  
  if (processedConfig.css) {
    containerStyles = { ...containerStyles, ...processedConfig.css };
  }

  // Styles pour état disabled
  if (disabled) {
    containerStyles.opacity = '0.6';
    containerStyles.cursor = 'not-allowed';
    containerStyles.pointerEvents = 'none';
  }

  // Fonction de gestion du clic
  const handleClick = (event) => {
    if (disabled) return;

    if (isToggleMode) {
      // Mode toggle: basculer entre ON/OFF
      currentToggleState = !currentToggleState;
      
      // Mettre à jour le texte
      const newText = currentToggleState ? onText : offText;
      if (newText) {
        button.updateText(newText);
      }
      
      // Mettre à jour les styles
      const newStyles = currentToggleState ? processedConfig.onStyle : processedConfig.offStyle;
      const baseStyles = templateName && buttonTemplates[templateName] ? buttonTemplates[templateName].css : {};
      if (newStyles && Object.keys(newStyles).length > 0) {
        button.$({ css: { ...baseStyles, ...newStyles, ...processedConfig.css } });
      }
      
      // Exécuter l'action appropriée
      if (currentToggleState && onAction) {
        onAction(currentToggleState, button);
      } else if (!currentToggleState && offAction) {
        offAction(currentToggleState, button);
      }
      
      // Callback de changement d'état
      if (onStateChange) {
        onStateChange(currentToggleState, button);
      }
      
    } else if (isMultiStateMode) {
      // Mode multi-états: passer à l'état suivant
      currentStateIndex = getNextStateIndex(currentStateIndex, states.length, cycleMode, pingPongDirection);
      
      // Pour ping-pong, ajuster la direction si nécessaire
      if (cycleMode === 'ping-pong') {
        if (currentStateIndex === states.length - 1) {
          pingPongDirection = -1;
        } else if (currentStateIndex === 0) {
          pingPongDirection = 1;
        }
      }
      
      const newState = states[currentStateIndex];
      
      // Mettre à jour l'apparence
      if (newState.text) button.updateText(newState.text);
      if (newState.css) {
        const baseStyles = templateName && buttonTemplates[templateName] ? buttonTemplates[templateName].css : {};
        button.$({ css: { ...baseStyles, ...newState.css, ...processedConfig.css } });
      }
      if (newState.icon) {
        const iconEl = button.querySelector('.hs-button-icon');
        if (iconEl) iconEl.textContent = newState.icon;
      }
      
      // Exécuter l'action de l'état
      if (newState.action) {
        newState.action(newState, currentStateIndex, button);
      }
      
      // Callback de changement d'état
      if (onStateChange) {
        onStateChange(newState, currentStateIndex, button);
      }
      
    } else {
      // Mode bouton classique
      if (onClick) {
        onClick(event, button);
      }
    }
  };

  // Création du conteneur principal
  const button = $('button-container', {
    id: buttonId,
    css: containerStyles,
    attrs: { disabled },
    onClick: handleClick,
    ...otherProps
  });

  // Stocker la config pour référence
  button._config = processedConfig;

  // Appliquer les effets du template si disponible
  if (templateName && buttonTemplates[templateName]) {
    applyTemplateEffects(button, buttonTemplates[templateName]);
  }

  // Ajout de l'icône si présente
  if (icon) {
    const iconElement = $('button-icon', {
      id: `${buttonId}_icon`,
      text: icon,
      css: skin.icon || {}
    });
    
    // Ajustement de la marge si pas de texte
    if (!finalText) {
      iconElement.$({ css: { marginRight: '0' } });
    }
    
    button.appendChild(iconElement);
  }

  // Ajout du texte si présent
  if (finalText) {
    // Si le bouton n'a pas déjà de texte, on le met directement sur le bouton principal
    if (!button.querySelector('.hs-button-text')) {
      button.textContent = finalText;
    } else {
      const textElement = $('button-text', {
        id: `${buttonId}_text`,
        text: finalText,
        css: skin.text || {}
      });
      button.appendChild(textElement);
    }
  }

  // Ajout du badge si présent
  if (badge !== undefined) {
    const badgeElement = $('button-badge', {
      id: `${buttonId}_badge`,
      text: badge.toString(),
      css: skin.badge || {}
    });
    button.appendChild(badgeElement);
  }

  // Méthodes utilitaires de base
  button.updateText = (newText) => {
    // Si le bouton n'a pas de .hs-button-text, on modifie directement textContent
    const textEl = button.querySelector('.hs-button-text');
    if (textEl) textEl.textContent = newText;
    else button.textContent = newText;
    return button;
  };

  button.updateBadge = (newBadge) => {
    const badgeEl = button.querySelector('.hs-button-badge');
    if (badgeEl) {
      badgeEl.textContent = newBadge.toString();
    } else if (newBadge !== undefined) {
      // Créer le badge s'il n'existe pas
      const badgeElement = $('button-badge', {
        id: `${buttonId}_badge_new`,
        text: newBadge.toString(),
        css: skin.badge || {}
      });
      button.appendChild(badgeElement);
    }
    return button;
  };

  button.setVariant = (newVariant) => {
    const variantStyles = buttonStyles[newVariant] || {};
    button.$({ css: variantStyles });
    return button;
  };

  button.setDisabled = (isDisabled) => {
    button.disabled = isDisabled;
    button.$({ 
      css: { 
        opacity: isDisabled ? '0.6' : '1',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        pointerEvents: isDisabled ? 'none' : 'auto'
      }
    });
    return button;
  };

  // === MÉTHODES POUR TEMPLATES ===
  button.getTemplate = () => processedConfig._templateName || null;
  button.getTemplateInfo = () => processedConfig._templateInfo || null;

  // Ajout de l'icône si présente
  if (icon) {
    const iconElement = $('button-icon', {
      id: `${buttonId}_icon`,
      text: icon,
      css: skin.icon || {}
    });
    
    // Ajustement de la marge si pas de texte
    if (!finalText) {
      iconElement.$({ css: { marginRight: '0' } });
    }
    
    button.appendChild(iconElement);
  }

  // Ajout du texte si présent
  if (finalText) {
    // Si le bouton n'a pas déjà de texte, on le met directement sur le bouton principal
    if (!button.querySelector('.hs-button-text')) {
      button.textContent = finalText;
    } else {
      const textElement = $('button-text', {
        id: `${buttonId}_text`,
        text: finalText,
        css: skin.text || {}
      });
      button.appendChild(textElement);
    }
  }

  // Ajout du badge si présent
  if (badge !== undefined) {
    const badgeElement = $('button-badge', {
      id: `${buttonId}_badge`,
      text: badge.toString(),
      css: skin.badge || {}
    });
    button.appendChild(badgeElement);
  }

  // Méthodes utilitaires de base
  button.updateText = (newText) => {
    // Si le bouton n'a pas de .hs-button-text, on modifie directement textContent
    const textEl = button.querySelector('.hs-button-text');
    if (textEl) textEl.textContent = newText;
    else button.textContent = newText;
    return button;
  };

  button.updateBadge = (newBadge) => {
    const badgeEl = button.querySelector('.hs-button-badge');
    if (badgeEl) {
      badgeEl.textContent = newBadge.toString();
    } else if (newBadge !== undefined) {
      // Créer le badge s'il n'existe pas
      const badgeElement = $('button-badge', {
        id: `${buttonId}_badge_new`,
        text: newBadge.toString(),
        css: skin.badge || {}
      });
      button.appendChild(badgeElement);
    }
    return button;
  };

  button.setVariant = (newVariant) => {
    const variantStyles = buttonStyles[newVariant] || {};
    button.$({ css: variantStyles });
    return button;
  };

  button.setDisabled = (isDisabled) => {
    button.disabled = isDisabled;
    button.$({ 
      css: { 
        opacity: isDisabled ? '0.6' : '1',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        pointerEvents: isDisabled ? 'none' : 'auto'
      }
    });
    return button;
  };

  // === MÉTHODES SPÉCIFIQUES AU TOGGLE ===
  if (isToggleMode) {
    button.toggle = () => {
      handleClick();
      return button;
    };
    
    button.setState = (state) => {
      if (currentToggleState !== state) {
        handleClick();
      }
      return button;
    };
    
    button.getState = () => currentToggleState;
    
    button.setOnState = () => {
      if (!currentToggleState) {
        handleClick();
      }
      return button;
    };
    
    button.setOffState = () => {
      if (currentToggleState) {
        handleClick();
      }
      return button;
    };
  }
  
  // === MÉTHODES SPÉCIFIQUES MULTI-ÉTATS ===
  if (isMultiStateMode) {
    button.nextState = () => {
      handleClick();
      return button;
    };
    
    button.setStateIndex = (index) => {
      if (index >= 0 && index < states.length && index !== currentStateIndex) {
        currentStateIndex = index;
        const newState = states[currentStateIndex];
        
        if (newState.text) button.updateText(newState.text);
        if (newState.css) button.$({ css: newState.css });
        if (newState.icon) {
          const iconEl = button.querySelector('.hs-button-icon');
          if (iconEl) iconEl.textContent = newState.icon;
        }
        
        if (newState.action) {
          newState.action(newState, currentStateIndex, button);
        }
        
        if (onStateChange) {
          onStateChange(newState, currentStateIndex, button);
        }
      }
      return button;
    };
    
    button.getCurrentState = () => states[currentStateIndex];
    button.getCurrentStateIndex = () => currentStateIndex;
    button.getStates = () => states;
  }

  return button;
};

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

// === FACTORY FUNCTIONS POUR VARIANTES COMMUNES ===

const createPrimaryButton = (config) => createButton({ ...config, variant: 'primary' });
const createSecondaryButton = (config) => createButton({ ...config, variant: 'secondary' });
const createSuccessButton = (config) => createButton({ ...config, variant: 'success' });
const createDangerButton = (config) => createButton({ ...config, variant: 'danger' });
const createWarningButton = (config) => createButton({ ...config, variant: 'warning' });

const createIconButton = (config) => createButton({ 
  ...config, 
  text: '', 
  skin: { 
    container: { padding: '8px', borderRadius: '50%' },
    ...config.skin 
  }
});

const createOutlineButton = (config) => createButton({
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
function materialSwitch(config) {
  return createButton(buttonPresets.materialSwitch(config));
}

// === API STATIQUE POUR LES TEMPLATES ===

// Ajouter les templates à la fonction Button
createButton.templates = buttonTemplates;
createButton.getTemplateList = () => Object.keys(buttonTemplates);
createButton.getTemplate = (name) => buttonTemplates[name];
createButton.addTemplate = (name, template) => {
  buttonTemplates[name] = template;
  console.log(`✅ Template "${name}" ajouté`);
  return createButton;
};

createButton.listTemplates = () => {
  console.table(
    Object.entries(buttonTemplates).map(([key, value]) => ({
      nom: key,
      description: value.description || 'Aucune description',
      famille: value.name || key
    }))
  );
  return createButton;
};

createButton.removeTemplate = (name) => {
  if (buttonTemplates[name]) {
    delete buttonTemplates[name];
    console.log(`✅ Template "${name}" supprimé`);
  } else {
    console.warn(`⚠️ Template "${name}" introuvable`);
  }
  return createButton;
};

// === EXPORTS ===
export { createButton };

// Alias pour compatibilité avec l'ancien pattern
const Button = createButton;

// Copier les méthodes statiques sur l'alias Button
Button.templates = createButton.templates;
Button.getTemplateList = createButton.getTemplateList;
Button.getTemplate = createButton.getTemplate;
Button.addTemplate = createButton.addTemplate;
Button.listTemplates = createButton.listTemplates;
Button.removeTemplate = createButton.removeTemplate;

export { Button };

// Export par défaut - fonction directe pour usage: Button({...})
export default createButton;

// Export des utilitaires supplémentaires
export {
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
  createWarningButton,
  createIconButton,
  createOutlineButton,
  buttonStyles,
  buttonSizes,
  materialSwitch
};