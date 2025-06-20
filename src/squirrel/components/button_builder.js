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
    ...otherProps
  } = config;

  // Génération d'ID unique si non fourni
  const buttonId = id || `btn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Styles de base selon variant et size
  let containerStyles = { ...buttonStyles[variant] || {}, ...buttonSizes[size] || {} };
  
  // Application des styles personnalisés
  if (skin.container) {
    containerStyles = { ...containerStyles, ...skin.container };
  }

  // Styles pour état disabled
  if (disabled) {
    containerStyles.opacity = '0.6';
    containerStyles.cursor = 'not-allowed';
    containerStyles.pointerEvents = 'none';
  }

  // Création du conteneur principal
  const button = $('button-container', {
    id: buttonId,
    css: containerStyles,
    attrs: { disabled },
    onClick: disabled ? undefined : onClick,
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
    if (!text) {
      iconElement.$({ css: { marginRight: '0' } });
    }
    
    button.appendChild(iconElement);
  }

  // Ajout du texte si présent
  if (text) {
    const textElement = $('button-text', {
      id: `${buttonId}_text`,
      text,
      css: skin.text || {}
    });
    button.appendChild(textElement);
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

  // Méthodes utilitaires spécifiques au bouton
  button.updateText = (newText) => {
    const textEl = button.querySelector('.hs-button-text');
    if (textEl) textEl.textContent = newText;
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

  return button;
};

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