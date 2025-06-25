/**
 * 🍽️ MENU COMPONENT - VERSION 2.0 FUNCTIONAL
 * Composant Menu ultra-flexible avec pattern fonctionnel pour bundling CDN
 */

// === FONCTION PRINCIPALE DE CRÉATION ===
function createMenu(options = {}) {
  // Configuration par défaut
  const config = {
    id: options.id || `menu-${Date.now()}`,
    position: { x: 0, y: 0, ...options.position },
    size: { width: 'auto', height: 'auto', ...options.size },
    attach: options.attach || 'body',
    
    // Layout & Behavior
    layout: {
      direction: 'horizontal', // horizontal, vertical, grid
      wrap: false,
      justify: 'flex-start', // flex-start, center, flex-end, space-between, space-around
      align: 'center', // flex-start, center, flex-end, stretch
      gap: '8px',
      ...options.layout
    },
    
    // Contenu du menu
    content: options.content || [],
    
    // Styles avec contrôle CSS complet
    style: {
      display: 'flex',
      position: 'relative',
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      ...options.style
    },
    
    // Comportement responsive
    responsive: {
      enabled: options.responsive?.enabled ?? true,
      breakpoints: {
        mobile: { maxWidth: '768px', ...options.responsive?.breakpoints?.mobile },
        tablet: { maxWidth: '1024px', ...options.responsive?.breakpoints?.tablet },
        ...options.responsive?.breakpoints
      },
      ...options.responsive
    },
    
    // Callbacks
    callbacks: {
      onItemClick: options.callbacks?.onItemClick || options.onItemClick || null,
      onItemHover: options.callbacks?.onItemHover || options.onItemHover || null,
      onDropdownOpen: options.callbacks?.onDropdownOpen || options.onDropdownOpen || null,
      onDropdownClose: options.callbacks?.onDropdownClose || options.onDropdownClose || null,
      ...options.callbacks
    },
    
    // Debug
    debug: options.debug || false
  };

  // ========================================
  // 🏗️ FONCTIONS DE CONSTRUCTION DU MENU
  // ========================================

  function createContainer() {
    // Créer le container principal
    const container = document.createElement('nav');
    container.id = config.id;
    container.className = 'professional-menu';

    // Point d'attachement
    const attachPoint = document.querySelector(config.attach);
    if (!attachPoint) {
      console.error(`❌ Point d'attachement "${config.attach}" introuvable`);
      return null;
    }

    // Appliquer les styles du container
    applyContainerStyles(container);
    attachPoint.appendChild(container);
    
    if (config.debug) {
      console.log(`📦 Container menu créé et attaché à "${config.attach}"`);
    }
    
    return container;
  }

  function applyContainerStyles(container) {
    // Styles de position si spécifiés
    const positionStyles = {};
    if (config.position.x !== undefined || config.position.y !== undefined) {
      positionStyles.position = 'absolute';
      if (config.position.x !== undefined) positionStyles.left = `${config.position.x}px`;
      if (config.position.y !== undefined) positionStyles.top = `${config.position.y}px`;
    }

    // Styles de taille
    const sizeStyles = {};
    if (config.size.width !== 'auto') sizeStyles.width = typeof config.size.width === 'string' ? config.size.width : `${config.size.width}px`;
    if (config.size.height !== 'auto') sizeStyles.height = typeof config.size.height === 'string' ? config.size.height : `${config.size.height}px`;
    if (config.size.maxWidth) sizeStyles.maxWidth = typeof config.size.maxWidth === 'string' ? config.size.maxWidth : `${config.size.maxWidth}px`;
    if (config.size.minHeight) sizeStyles.minHeight = typeof config.size.minHeight === 'string' ? config.size.minHeight : `${config.size.minHeight}px`;

    // Styles de layout
    const layoutStyles = {
      flexDirection: config.layout.direction === 'vertical' ? 'column' : 'row',
      flexWrap: config.layout.wrap ? 'wrap' : 'nowrap',
      justifyContent: config.layout.justify,
      alignItems: config.layout.align,
      gap: config.layout.gap
    };

    // Combiner tous les styles
    const allStyles = {
      ...config.style,
      ...positionStyles,
      ...sizeStyles,
      ...layoutStyles
    };

    Object.assign(container.style, allStyles);
  }

  function createMenu(container) {
    // Parcourir le contenu et créer les éléments
    config.content.forEach((contentItem, index) => {
      const element = createContentElement(contentItem, index);
      if (element) {
        container.appendChild(element);
      }
    });
  }

  function createContentElement(contentItem, index) {
    switch (contentItem.type) {
      case 'item':
        return createMenuItem(contentItem, index);
      case 'group':
        return createMenuGroup(contentItem, index);
      case 'separator':
        return createSeparator(contentItem, index);
      default:
        // Si pas de type spécifié, on assume que c'est un item
        return createMenuItem({ ...contentItem, type: 'item' }, index);
    }
  }

  function createMenuItem(itemData, index) {
    const item = document.createElement(itemData.href ? 'a' : 'div');
    item.id = itemData.id || `menu-item-${index}`;
    item.className = 'menu-item';
    item.setAttribute('data-menu-id', itemData.id || `menu-item-${index}`);

    // Contenu de l'item
    if (itemData.content) {
      if (itemData.content.text) {
        item.textContent = itemData.content.text;
      } else if (itemData.content.html) {
        item.innerHTML = itemData.content.html;
      }
    }

    // Href pour les liens
    if (itemData.href && item.tagName === 'A') {
      item.href = itemData.href;
    }

    // Styles de base pour les items
    const baseItemStyles = {
      display: 'flex',
      alignItems: 'center',
      padding: '8px 16px',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      textDecoration: 'none',
      color: '#333333',
      fontSize: '14px',
      fontWeight: '400',
      userSelect: 'none'
    };

    // Appliquer les styles de l'item
    const itemStyles = { ...baseItemStyles, ...itemData.style };
    Object.assign(item.style, itemStyles);

    // Event listeners pour les interactions
    setupItemEventListeners(item, itemData);

    // Créer le dropdown si présent
    if (itemData.dropdown) {
      createDropdown(item, itemData.dropdown);
    }

    return item;
  }

  function createMenuGroup(groupData, index) {
    const group = document.createElement('div');
    group.id = groupData.id || `menu-group-${index}`;
    group.className = 'menu-group';

    // Styles du groupe
    const groupStyles = {
      display: 'flex',
      alignItems: 'center',
      gap: groupData.layout?.gap || '8px',
      ...groupData.style
    };

    if (groupData.layout?.direction === 'vertical') {
      groupStyles.flexDirection = 'column';
    }

    Object.assign(group.style, groupStyles);

    // Créer les items du groupe
    if (groupData.items) {
      groupData.items.forEach((item, itemIndex) => {
        const element = createContentElement(item, itemIndex);
        if (element) {
          group.appendChild(element);
        }
      });
    }

    return group;
  }

  function createSeparator(separatorData, index) {
    const separator = document.createElement('div');
    separator.id = separatorData.id || `menu-separator-${index}`;
    separator.className = 'menu-separator';

    const separatorStyles = {
      borderTop: '1px solid #e0e0e0',
      margin: '4px 0',
      ...separatorData.style
    };

    Object.assign(separator.style, separatorStyles);
    return separator;
  }

  function createDropdown(parentItem, dropdownData) {
    const dropdown = document.createElement('div');
    dropdown.id = `${parentItem.id}-dropdown`;
    dropdown.className = 'menu-dropdown';

    // Styles du dropdown
    const dropdownStyles = {
      position: 'absolute',
      top: '100%',
      left: '0',
      minWidth: '200px',
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: '4px',
      zIndex: '1000',
      opacity: '0',
      visibility: 'hidden',
      transform: 'translateY(-10px)',
      transition: 'all 0.3s ease',
      ...dropdownData.style
    };

    Object.assign(dropdown.style, dropdownStyles);

    // Créer les items du dropdown
    if (dropdownData.items) {
      dropdownData.items.forEach((item, itemIndex) => {
        const element = createContentElement(item, itemIndex);
        if (element) {
          dropdown.appendChild(element);
        }
      });
    }

    // Ajouter le dropdown au DOM
    document.body.appendChild(dropdown);

    // Positionner le dropdown par rapport au parent
    setupDropdownPositioning(parentItem, dropdown, dropdownData);

    return dropdown;
  }

  function setupDropdownPositioning(parentItem, dropdown, dropdownData) {
    const updatePosition = () => {
      const rect = parentItem.getBoundingClientRect();
      const offset = dropdownData.offset || { x: 0, y: 4 };
      
      dropdown.style.position = 'fixed';
      dropdown.style.left = `${rect.left + offset.x}px`;
      dropdown.style.top = `${rect.bottom + offset.y}px`;
    };

    // Position initiale
    updatePosition();

    // Reposition on scroll/resize
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
  }

  function setupItemEventListeners(item, itemData) {
    // Click handler
    item.addEventListener('click', (event) => {
      event.preventDefault();
      
      // Dropdown toggle
      const dropdown = document.getElementById(`${item.id}-dropdown`);
      if (dropdown) {
        toggleDropdown(dropdown);
      }
      
      // Callback
      if (config.callbacks.onItemClick) {
        config.callbacks.onItemClick(itemData.id || item.id, event);
      }
    });

    // Hover handlers
    item.addEventListener('mouseenter', (event) => {
      applyHoverState(item, itemData);
      
      if (config.callbacks.onItemHover) {
        config.callbacks.onItemHover(itemData.id || item.id, event);
      }
    });

    item.addEventListener('mouseleave', (event) => {
      removeHoverState(item, itemData);
    });
  }

  function applyHoverState(item, itemData) {
    if (itemData.states?.hover) {
      Object.assign(item.style, itemData.states.hover);
    } else {
      // Default hover state
      item.style.backgroundColor = '#f8f9fa';
      item.style.transform = 'translateY(-1px)';
    }
  }

  function removeHoverState(item, itemData) {
    // Reset to original styles
    if (itemData.states?.hover) {
      Object.keys(itemData.states.hover).forEach(prop => {
        item.style[prop] = '';
      });
    } else {
      item.style.backgroundColor = '';
      item.style.transform = '';
    }
    
    // Reapply original styles
    if (itemData.style) {
      Object.assign(item.style, itemData.style);
    }
  }

  function toggleDropdown(dropdown) {
    const isVisible = dropdown.style.opacity === '1';
    
    if (isVisible) {
      // Fermer
      dropdown.style.opacity = '0';
      dropdown.style.visibility = 'hidden';
      dropdown.style.transform = 'translateY(-10px)';
    } else {
      // Ouvrir
      dropdown.style.opacity = '1';
      dropdown.style.visibility = 'visible';
      dropdown.style.transform = 'translateY(0)';
    }
  }

  function setupResponsive(container) {
    if (!config.responsive.enabled) return;

    const handleResize = () => {
      const width = window.innerWidth;
      const breakpoints = config.responsive.breakpoints;
      
      // Check mobile breakpoint
      if (breakpoints.mobile && width <= breakpoints.mobile.maxWidth) {
        applyResponsiveStyles(container, 'mobile');
      }
      // Check tablet breakpoint
      else if (breakpoints.tablet && width <= breakpoints.tablet.maxWidth) {
        applyResponsiveStyles(container, 'tablet');
      }
      // Desktop
      else {
        applyResponsiveStyles(container, 'desktop');
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
  }

  function applyResponsiveStyles(container, breakpoint) {
    const responsiveConfig = config.responsive.breakpoints[breakpoint];
    
    if (responsiveConfig) {
      // Apply responsive styles
      if (responsiveConfig.style) {
        Object.assign(container.style, responsiveConfig.style);
      }
      
      // Handle hamburger menu
      if (responsiveConfig.showHamburger) {
        const hamburger = container.querySelector('#hamburger-icon');
        const navLinks = container.querySelector('#nav-links');
        
        if (hamburger) hamburger.style.display = 'flex';
        if (navLinks) navLinks.style.display = 'none';
      } else {
        const hamburger = container.querySelector('#hamburger-icon');
        const navLinks = container.querySelector('#nav-links');
        
        if (hamburger) hamburger.style.display = 'none';
        if (navLinks) navLinks.style.display = 'flex';
      }
    }
  }

  // ========================================
  // 🚀 CRÉATION ET RETOUR DU MENU
  // ========================================

  // Créer le container
  const container = createContainer();
  if (!container) return null;

  // Créer le contenu du menu
  createMenu(container);

  // Setup responsive
  setupResponsive(container);

  // Setup outside click to close dropdowns
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) {
      // Close all dropdowns
      const dropdowns = document.querySelectorAll('.menu-dropdown');
      dropdowns.forEach(dropdown => {
        if (dropdown.style.opacity === '1') {
          toggleDropdown(dropdown);
        }
      });
    }
  });

  if (config.debug) {
    console.log(`✅ Menu "${config.id}" créé avec succès`);
  }

  // Retourner l'élément DOM du container
  return container;
}

// === EXPORTS ===
export { createMenu };

// Alias pour compatibilité avec l'ancien pattern
const Menu = createMenu;
export { Menu };

// Export par défaut - fonction directe pour usage: Menu({...})
export default createMenu;
