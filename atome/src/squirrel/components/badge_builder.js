import { $, define } from '../squirrel.js';

/**
 * 🔴 Badge Component - Test de l'auto-discovery
 * Composant simple pour tester que le système détecte et expose automatiquement
 * les nouveaux composants sans intervention manuelle.
 */

// Template pour le badge
define('badge-element', {
  tag: 'span',
  class: 'hs-badge',
  css: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }
});

/**
 * Crée un badge
 */
const createBadge = (config = {}) => {
  const {
    text = 'Badge',
    variant = 'primary',
    css = {},
    onclick,
    ...otherProps
  } = config;

  // Couleurs par défaut selon le variant
  const variants = {
    primary: { backgroundColor: '#007bff', color: 'white' },
    success: { backgroundColor: '#28a745', color: 'white' },
    warning: { backgroundColor: '#ffc107', color: '#212529' },
    danger: { backgroundColor: '#dc3545', color: 'white' },
    info: { backgroundColor: '#17a2b8', color: 'white' },
    light: { backgroundColor: '#f8f9fa', color: '#212529', border: '1px solid #dee2e6' },
    dark: { backgroundColor: '#343a40', color: 'white' }
  };

  // Appliquer le style du variant
  const variantStyles = variants[variant] || variants.primary;

  // Créer le badge
  const badge = $('badge-element', {
    text,
    css: { 
      ...variantStyles,
      ...css,
      cursor: onclick ? 'pointer' : 'default'
    },
    onclick: onclick || null,
    ...otherProps
  });

  return badge;
};

// === EXPORTS ===
export { createBadge };

// Alias pour compatibilité avec l'ancien pattern
const Badge = createBadge;
export { Badge };

// Export par défaut - fonction directe pour usage: Badge({...})
export default createBadge;
