import { $, define } from '../squirrel.js';

/**
 * Composant Button skinnable avec HyperSquirrel
 * Chaque élément du bouton est entièrement customisable
 */

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
    const toggleStyles = currentToggleState ? onStyle : offStyle;
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
  // 2. Styles de skin.container
  // 3. Styles de toggle/états (onStyle/offStyle ou states.css)
  // 4. Styles de config.css (priorité absolue)
  if (skin.container) {
    containerStyles = { ...containerStyles, ...skin.container };
  }
  
  if (Object.keys(finalStyles).length > 0) {
    containerStyles = { ...containerStyles, ...finalStyles };
  }
  
  if (config.css) {
    containerStyles = { ...containerStyles, ...config.css };
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
      const newStyles = currentToggleState ? onStyle : offStyle;
      if (Object.keys(newStyles).length > 0) {
        button.$({ css: newStyles });
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
      if (newState.css) button.$({ css: newState.css });
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

// === EXPORTS ===
export { createButton };

// Alias pour compatibilité avec l'ancien pattern
const Button = createButton;
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