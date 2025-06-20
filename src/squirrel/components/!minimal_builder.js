/**
 * 🌱 MINIMAL TEMPLATE - BASE ULTRA-SIMPLE
 * Template minimaliste pour créer rapidement de nouveaux composants
 * Architecture: Zero dependency, functional, clean
 */

// === FONCTION PRINCIPALE ===
function createMinimal(options = {}) {
  // Configuration simple
  const config = {
    content: options.content || 'Minimal Component',
    style: options.style || {},
    onClick: options.onClick || null
  };

  // Créer l'élément
  const element = document.createElement('div');
  element.className = 'hs-minimal';
  
  // Ajouter le contenu
  element.textContent = config.content;
  
  // Styles par défaut + personnalisés
  const defaultStyle = {
    padding: '12px',
    margin: '8px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontFamily: 'system-ui, sans-serif'
  };
  
  Object.assign(element.style, defaultStyle, config.style);
  
  // Event listener si fourni
  if (config.onClick) {
    element.addEventListener('click', config.onClick);
    element.style.cursor = 'pointer';
  }
  
  // Attacher au DOM
  document.body.appendChild(element);
  
  return element;
}

// === EXPORTS ===
export { createMinimal };

// Alias pour compatibilité avec l'ancien pattern (comme Menu dans menu_builder.js)
const Minimal = createMinimal;
export { Minimal };

// Export par défaut : fonction directe (cohérent avec menu_builder.js)
export default createMinimal;
