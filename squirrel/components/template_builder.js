/**
 * 📋 TEMPLATE COMPONENT - ARCHITECTURE DE RÉFÉRENCE
 * Composant template avec l'architecture clean pour créer de nouveaux composants
 * Architecture: Zero dependency, functional, bundle-friendly
 */

// === FONCTION PRINCIPALE DE CRÉATION ===
function createTemplate(options = {}) {
  // Configuration par défaut
  const config = {
    id: options.id || `template-${Date.now()}`,
    position: { x: 0, y: 0, ...options.position },
    size: { width: 'auto', height: 'auto', ...options.size },
    attach: options.attach || 'body',
    
    // Contenu du composant
    content: options.content || 'Template Component',
    
    // Styles avec contrôle CSS complet
    style: {
      display: 'block',
      position: 'relative',
      backgroundColor: '#f5f5f5',
      border: '2px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      margin: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      color: '#333',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'all 0.3s ease',
      ...options.style
    },
    
    // Comportement
    behavior: {
      clickable: options.behavior?.clickable ?? true,
      hoverable: options.behavior?.hoverable ?? true,
      draggable: options.behavior?.draggable ?? false,
      ...options.behavior
    },
    
    // Callbacks
    onClick: options.onClick || null,
    onHover: options.onHover || null,
    onMount: options.onMount || null,
    onDestroy: options.onDestroy || null,
    
    // Debug
    debug: options.debug || false
  };

  // === FONCTION INTERNE DE CRÉATION DU CONTAINER ===
  function createContainer() {
    // Déterminer le point d'attachement
    let attachPoint;
    if (typeof config.attach === 'string') {
      attachPoint = document.querySelector(config.attach);
      if (!attachPoint && config.attach === 'body') {
        attachPoint = document.body;
      }
    } else {
      attachPoint = config.attach; // Assume que c'est déjà un élément DOM
    }

    if (!attachPoint) {
      console.warn(`⚠️ Point d'attachement "${config.attach}" non trouvé, utilisation de body`);
      attachPoint = document.body;
    }

    // Créer le container principal
    const container = document.createElement('div');
    container.id = config.id;
    container.className = 'hs-template';
    
    // Ajouter le contenu
    if (typeof config.content === 'string') {
      container.textContent = config.content;
    } else if (config.content instanceof HTMLElement) {
      container.appendChild(config.content);
    } else if (Array.isArray(config.content)) {
      config.content.forEach(item => {
        if (typeof item === 'string') {
          const textNode = document.createTextNode(item);
          container.appendChild(textNode);
        } else if (item instanceof HTMLElement) {
          container.appendChild(item);
        }
      });
    }

    // Appliquer les styles du container
    applyContainerStyles(container);
    
    // Attacher au DOM
    attachPoint.appendChild(container);
    
    if (config.debug) {
      console.log(`📦 Template component créé et attaché à "${config.attach}"`);
    }

    return container;
  }

  // === FONCTION D'APPLICATION DES STYLES ===
  function applyContainerStyles(container) {
    // Styles de position si spécifiés
    const positionStyles = {};
    if (config.position.x !== undefined || config.position.y !== undefined) {
      positionStyles.position = 'absolute';
      if (config.position.x !== undefined) positionStyles.left = `${config.position.x}px`;
      if (config.position.y !== undefined) positionStyles.top = `${config.position.y}px`;
    }

    // Styles de taille si spécifiés
    const sizeStyles = {};
    if (config.size.width !== 'auto') sizeStyles.width = typeof config.size.width === 'number' ? `${config.size.width}px` : config.size.width;
    if (config.size.height !== 'auto') sizeStyles.height = typeof config.size.height === 'number' ? `${config.size.height}px` : config.size.height;

    // Appliquer tous les styles
    const finalStyles = { ...config.style, ...positionStyles, ...sizeStyles };
    Object.assign(container.style, finalStyles);
  }

  // === FONCTION DE SETUP DES EVENT LISTENERS ===
  function setupEventListeners(container) {
    // Click handler
    if (config.behavior.clickable && config.onClick) {
      container.addEventListener('click', (event) => {
        config.onClick(container, event);
      });
      container.style.cursor = 'pointer';
    }

    // Hover handlers
    if (config.behavior.hoverable) {
      container.addEventListener('mouseenter', (event) => {
        container.style.transform = 'translateY(-2px)';
        container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        
        if (config.onHover) {
          config.onHover(container, event, 'enter');
        }
      });

      container.addEventListener('mouseleave', (event) => {
        container.style.transform = 'translateY(0)';
        container.style.boxShadow = config.style.boxShadow || '0 2px 4px rgba(0,0,0,0.1)';
        
        if (config.onHover) {
          config.onHover(container, event, 'leave');
        }
      });
    }

    // Draggable (optionnel, implémentation basique)
    if (config.behavior.draggable) {
      container.draggable = true;
      container.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', container.id);
        container.style.opacity = '0.7';
      });
      
      container.addEventListener('dragend', () => {
        container.style.opacity = '1';
      });
    }
  }

  // === CRÉATION ET ASSEMBLAGE FINAL ===
  const container = createContainer();
  setupEventListeners(container);

  // Callback onMount
  if (config.onMount) {
    config.onMount(container);
  }

  // === MÉTHODES PUBLIQUES DU COMPOSANT ===
  
  // Méthode pour mettre à jour le contenu
  container.updateContent = function(newContent) {
    if (typeof newContent === 'string') {
      this.textContent = newContent;
    } else if (newContent instanceof HTMLElement) {
      this.innerHTML = '';
      this.appendChild(newContent);
    }
    return this;
  };

  // Méthode pour mettre à jour les styles
  container.updateStyle = function(newStyles) {
    Object.assign(this.style, newStyles);
    return this;
  };

  // Méthode pour détruire le composant
  container.destroy = function() {
    if (config.onDestroy) {
      config.onDestroy(this);
    }
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  };

  // Méthode pour obtenir la configuration
  container.getConfig = function() {
    return { ...config };
  };

  return container;
}

// === FACTORY FUNCTIONS POUR VARIANTES COMMUNES ===

// Template simple avec contenu texte
const createSimpleTemplate = (text, options = {}) => createTemplate({ 
  ...options, 
  content: text,
  style: {
    backgroundColor: '#e3f2fd',
    border: '1px solid #2196f3',
    color: '#1976d2',
    ...options.style
  }
});

// Template de notification
const createNotification = (message, type = 'info', options = {}) => {
  const typeStyles = {
    info: { backgroundColor: '#e3f2fd', borderColor: '#2196f3', color: '#1976d2' },
    success: { backgroundColor: '#e8f5e8', borderColor: '#4caf50', color: '#2e7d32' },
    warning: { backgroundColor: '#fff3e0', borderColor: '#ff9800', color: '#f57c00' },
    error: { backgroundColor: '#ffebee', borderColor: '#f44336', color: '#d32f2f' }
  };

  return createTemplate({
    ...options,
    content: message,
    style: {
      ...typeStyles[type],
      padding: '12px 16px',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: '500',
      ...options.style
    }
  });
};

// Template de card
const createCard = (title, content, options = {}) => {
  const cardContainer = document.createElement('div');
  
  if (title) {
    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    titleElement.style.cssText = 'margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #333;';
    cardContainer.appendChild(titleElement);
  }
  
  if (content) {
    const contentElement = document.createElement('div');
    contentElement.textContent = content;
    contentElement.style.cssText = 'font-size: 14px; line-height: 1.5; color: #666;';
    cardContainer.appendChild(contentElement);
  }

  return createTemplate({
    ...options,
    content: cardContainer,
    style: {
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      ...options.style
    }
  });
};

// === EXPORTS ===
export { 
  createTemplate,
  createSimpleTemplate,
  createNotification,
  createCard
};

// Alias pour compatibilité avec l'ancien pattern (comme Menu dans menu_builder.js)
const Template = createTemplate;
export { Template };

// Export par défaut : fonction directe (cohérent avec menu_builder.js)
export default createTemplate;
