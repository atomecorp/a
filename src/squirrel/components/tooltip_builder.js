import { $, define } from '../squirrel.js';

/**
 * Composant Tooltip simple pour tester la découverte automatique
 */

// Template pour le tooltip
define('tooltip-container', {
  tag: 'div',
  class: 'hs-tooltip',
  css: {
    position: 'absolute',
    backgroundColor: '#333',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '14px',
    zIndex: '9999',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease'
  }
});

/**
 * Crée un tooltip
 */
const createTooltip = (config = {}) => {
  const {
    text = 'Tooltip',
    target,
    position = 'top',
    css = {},
    ...otherProps
  } = config;

  // Créer le tooltip
  const tooltip = $('tooltip-container', {
    text,
    css: { ...css },
    ...otherProps
  });

  // Si une cible est spécifiée, ajouter les événements
  if (target) {
    target.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
      document.body.appendChild(tooltip);
      
      // Positionner le tooltip
      const rect = target.getBoundingClientRect();
      tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
      tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
    });
    
    target.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      }, 200);
    });
  }

  return tooltip;
};

// === EXPORTS ===
export { createTooltip };

// Alias pour compatibilité avec l'ancien pattern
const Tooltip = createTooltip;
export { Tooltip };

// Export par défaut - fonction directe pour usage: Tooltip({...})
export default createTooltip;
