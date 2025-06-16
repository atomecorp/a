/**
 * 🍽️ MENU COMPONENT - VERSION 1.0 PROFESSIONAL
 * Composant Menu ultra-flexible avec contrôle total du layout et des styles
 */

class Menu {
  constructor(options = {}) {
// console.log('🏗️ Création du composant Menu avec options:', options);
    
    // Configuration par défaut
    this.config = {
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
      styling: {
        // Container principal
        container: {
          display: 'flex',
          position: 'relative',
          backgroundColor: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          ...options.styling?.container
        },
        
        // Items individuels
        item: {
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
          userSelect: 'none',
          ...options.styling?.item
        },
        
        // Groupes d'items
        group: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          ...options.styling?.group
        },
        
        // Sous-menus (dropdowns)
        dropdown: {
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
          ...options.styling?.dropdown
        },
        
        // États interactifs
        states: {
          hover: {
            backgroundColor: '#f8f9fa',
            transform: 'translateY(-1px)',
            ...options.styling?.states?.hover
          },
          active: {
            backgroundColor: '#007bff',
            color: '#ffffff',
            ...options.styling?.states?.active
          },
          focus: {
            outline: '2px solid #007bff',
            outlineOffset: '2px',
            ...options.styling?.states?.focus
          },
          disabled: {
            opacity: '0.5',
            cursor: 'not-allowed',
            ...options.styling?.states?.disabled
          }
        },
        
        ...options.styling
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
      
      // Options avancées
      options: {
        closeOnOutsideClick: options.options?.closeOnOutsideClick ?? true,
        closeOnItemClick: options.options?.closeOnItemClick ?? true,
        animation: options.options?.animation ?? 'fade',
        keyboard: options.options?.keyboard ?? true,
        ...options.options
      },
      
      // Debug
      debug: options.debug || false
    };

    // Stockage interne
    this.itemsMap = new Map();           // Map des items avec leurs données
    this.groupsMap = new Map();          // Map des groupes
    this.dropdownsMap = new Map();       // Map des dropdowns actifs
    this.selectedItems = new Set();      // Items sélectionnés
    this.activeDropdown = null;          // Dropdown actuellement ouvert

    // Callbacks
    this.callbacks = {
      onItemClick: options.onItemClick || null,
      onItemHover: options.onItemHover || null,
      onDropdownOpen: options.onDropdownOpen || null,
      onDropdownClose: options.onDropdownClose || null,
      onResponsiveChange: options.onResponsiveChange || null
    };

    // Créer le menu
    this.createContainer();
    this.createMenu();
    this.setupEventListeners();
    this.setupResponsive();

    if (this.config.debug) {
// console.log(`✅ Menu "${this.config.id}" créé avec succès`);
    }
  }

  // ========================================
  // 🏗️ CONSTRUCTION DU MENU
  // ========================================

  createContainer() {
    // Créer le container principal
    this.container = document.createElement('nav');
    this.container.id = this.config.id;
    this.container.className = 'professional-menu';

    // Point d'attachement
    const attachPoint = document.querySelector(this.config.attach);
    if (!attachPoint) {
      console.error(`❌ Point d'attachement "${this.config.attach}" introuvable`);
      return;
    }

    // Appliquer les styles du container
    this.applyContainerStyles();
    attachPoint.appendChild(this.container);
    
// console.log(`📦 Container menu créé et attaché à "${this.config.attach}"`);
  }

  applyContainerStyles() {
    // Styles de position si spécifiés
    const positionStyles = {};
    if (this.config.position.x !== undefined || this.config.position.y !== undefined) {
      positionStyles.position = 'absolute';
      if (this.config.position.x !== undefined) positionStyles.left = `${this.config.position.x}px`;
      if (this.config.position.y !== undefined) positionStyles.top = `${this.config.position.y}px`;
    }

    // Styles de taille
    const sizeStyles = {};
    if (this.config.size.width !== 'auto') sizeStyles.width = `${this.config.size.width}px`;
    if (this.config.size.height !== 'auto') sizeStyles.height = `${this.config.size.height}px`;

    // Styles de layout
    const layoutStyles = {
      flexDirection: this.config.layout.direction === 'vertical' ? 'column' : 'row',
      flexWrap: this.config.layout.wrap ? 'wrap' : 'nowrap',
      justifyContent: this.config.layout.justify,
      alignItems: this.config.layout.align,
      gap: this.config.layout.gap
    };

    // Combiner tous les styles
    const allStyles = {
      ...this.config.styling.container,
      ...positionStyles,
      ...sizeStyles,
      ...layoutStyles
    };

    Object.assign(this.container.style, allStyles);
  }

  createMenu() {
    // Parcourir le contenu et créer les éléments
    this.config.content.forEach((contentItem, index) => {
      const element = this.createContentElement(contentItem, index);
      if (element) {
        this.container.appendChild(element);
      }
    });
  }

  createContentElement(contentItem, index) {
    switch (contentItem.type) {
      case 'item':
        return this.createMenuItem(contentItem, index);
      case 'group':
        return this.createMenuGroup(contentItem, index);
      case 'separator':
        return this.createSeparator(contentItem, index);
      default:
        console.warn(`⚠️ Type de contenu inconnu: ${contentItem.type}`);
        return null;
    }
  }

  createMenuItem(itemData, index) {
    const item = document.createElement(itemData.href ? 'a' : 'div');
    item.id = itemData.id || `menu-item-${index}`;
    item.className = 'menu-item';
    
    // Href pour les liens
    if (itemData.href) {
      item.href = itemData.href;
    }

    // Contenu de l'item
    if (itemData.content) {
      if (itemData.content.html) {
        item.innerHTML = itemData.content.html;
      } else if (itemData.content.text) {
        item.textContent = itemData.content.text;
      }
    }

    // Styles de base
    Object.assign(item.style, this.config.styling.item);

    // Styles spécifiques de l'item
    if (itemData.style) {
      Object.assign(item.style, itemData.style);
    }

    // Position spécifique (pour flexbox)
    if (itemData.position === 'end') {
      item.style.marginLeft = 'auto';
    } else if (itemData.position === 'center') {
      item.style.margin = '0 auto';
    }

    // Gérer les dropdowns
    if (itemData.dropdown) {
      this.createDropdown(item, itemData.dropdown);
    }

    // Stocker l'item
    this.itemsMap.set(item.id, {
      ...itemData,
      element: item,
      states: itemData.states || {}
    });

    return item;
  }

  createMenuGroup(groupData, index) {
    const group = document.createElement('div');
    group.id = groupData.id || `menu-group-${index}`;
    group.className = 'menu-group';

    // Styles de base du groupe
    Object.assign(group.style, this.config.styling.group);

    // Layout spécifique du groupe
    if (groupData.layout) {
      const groupLayoutStyles = {
        flexDirection: groupData.layout.direction === 'vertical' ? 'column' : 'row',
        gap: groupData.layout.gap || this.config.layout.gap,
        justifyContent: groupData.layout.justify || 'flex-start',
        alignItems: groupData.layout.align || 'center'
      };
      Object.assign(group.style, groupLayoutStyles);
    }

    // Styles spécifiques du groupe
    if (groupData.style) {
      Object.assign(group.style, groupData.style);
    }

    // Créer les items du groupe
    if (groupData.items) {
      groupData.items.forEach((itemData, itemIndex) => {
        const item = this.createMenuItem(itemData, `${index}-${itemIndex}`);
        if (item) {
          group.appendChild(item);
        }
      });
    }

    // Stocker le groupe
    this.groupsMap.set(group.id, {
      ...groupData,
      element: group
    });

    return group;
  }

  createSeparator(separatorData, index) {
    const separator = document.createElement('div');
    separator.id = separatorData.id || `menu-separator-${index}`;
    separator.className = 'menu-separator';

    // Style par défaut du séparateur
    const defaultSeparatorStyle = {
      width: this.config.layout.direction === 'vertical' ? '100%' : '1px',
      height: this.config.layout.direction === 'vertical' ? '1px' : '20px',
      backgroundColor: '#e0e0e0',
      margin: '0 8px'
    };

    Object.assign(separator.style, defaultSeparatorStyle);

    // Styles spécifiques
    if (separatorData.style) {
      Object.assign(separator.style, separatorData.style);
    }

    return separator;
  }

  createDropdown(parentItem, dropdownData) {
    const dropdown = document.createElement('div');
    dropdown.id = `${parentItem.id}-dropdown`;
    dropdown.className = 'menu-dropdown';

    // Styles de base du dropdown
    Object.assign(dropdown.style, this.config.styling.dropdown);

    // Position du dropdown
    if (dropdownData.position) {
      const positions = dropdownData.position.split('-');
      if (positions.includes('top')) dropdown.style.bottom = '100%';
      if (positions.includes('right')) dropdown.style.left = 'auto', dropdown.style.right = '0';
    }

    // Créer les items du dropdown
    if (dropdownData.items) {
      dropdownData.items.forEach((item, index) => {
        const dropdownItem = this.createMenuItem(item, `dropdown-${index}`);
        if (dropdownItem) {
          dropdownItem.style.width = '100%';
          dropdownItem.style.margin = '2px 0';
          dropdown.appendChild(dropdownItem);
        }
      });
    }

    // Ajouter le dropdown au parent
    parentItem.style.position = 'relative';
    parentItem.appendChild(dropdown);

    // Stocker le dropdown
    this.dropdownsMap.set(dropdown.id, {
      ...dropdownData,
      element: dropdown,
      parent: parentItem
    });

    return dropdown;
  }

  // ========================================
  // 🎭 GESTION DES ÉVÉNEMENTS
  // ========================================

  setupEventListeners() {
    // Événements de clic
    this.container.addEventListener('click', (e) => {
      this.handleItemClick(e);
    });

    // Événements de survol
    this.container.addEventListener('mouseover', (e) => {
      this.handleItemHover(e);
    });

    this.container.addEventListener('mouseout', (e) => {
      this.handleItemLeave(e);
    });

    // Événements clavier
    if (this.config.options.keyboard) {
      this.container.addEventListener('keydown', (e) => {
        this.handleKeyboard(e);
      });
    }

    // Clic à l'extérieur pour fermer les dropdowns
    if (this.config.options.closeOnOutsideClick) {
      document.addEventListener('click', (e) => {
        if (!this.container.contains(e.target)) {
          this.closeAllDropdowns();
        }
      });
    }
  }

  handleItemClick(event) {
    const item = event.target.closest('.menu-item');
    if (!item) return;

    const itemData = this.itemsMap.get(item.id);
    if (!itemData) return;

    // Gérer les dropdowns
    if (itemData.dropdown) {
      event.preventDefault();
      this.toggleDropdown(item);
      return;
    }

    // Fermer les dropdowns si configuré
    if (this.config.options.closeOnItemClick) {
      this.closeAllDropdowns();
    }

    // États actifs
    this.setActiveItem(item);

    // Callback
    if (this.callbacks.onItemClick) {
      this.callbacks.onItemClick(itemData, event);
    }

    // Callback spécifique de l'item
    if (itemData.onClick) {
      itemData.onClick(event);
    }

// console.log(`🍽️ Menu item clicked: ${item.id}`);
  }

  handleItemHover(event) {
    const item = event.target.closest('.menu-item');
    if (!item) return;

    const itemData = this.itemsMap.get(item.id);
    if (!itemData) return;

    // Appliquer les styles de survol
    this.applyItemState(item, 'hover');

    // Callback
    if (this.callbacks.onItemHover) {
      this.callbacks.onItemHover(itemData, event);
    }
  }

  handleItemLeave(event) {
    const item = event.target.closest('.menu-item');
    if (!item) return;

    // Restaurer les styles par défaut
    this.removeItemState(item, 'hover');
  }

  handleKeyboard(event) {
    switch (event.key) {
      case 'Escape':
        this.closeAllDropdowns();
        break;
      case 'ArrowDown':
      case 'ArrowUp':
        this.navigateItems(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
        break;
      case 'Enter':
      case ' ':
        const focusedItem = document.activeElement;
        if (focusedItem && focusedItem.classList.contains('menu-item')) {
          focusedItem.click();
          event.preventDefault();
        }
        break;
    }
  }

  // ========================================
  // 🎨 GESTION DES ÉTATS ET STYLES
  // ========================================

  applyItemState(item, state) {
    const itemData = this.itemsMap.get(item.id);
    if (!itemData) return;

    // Styles globaux de l'état
    const globalStateStyles = this.config.styling.states[state];
    if (globalStateStyles) {
      Object.assign(item.style, globalStateStyles);
    }

    // Styles spécifiques de l'item pour cet état
    const itemStateStyles = itemData.states[state];
    if (itemStateStyles) {
      Object.assign(item.style, itemStateStyles);
    }
  }

  removeItemState(item, state) {
    const itemData = this.itemsMap.get(item.id);
    if (!itemData) return;

    // Restaurer les styles de base
    Object.assign(item.style, this.config.styling.item);
    
    // Réappliquer les styles spécifiques de l'item
    if (itemData.style) {
      Object.assign(item.style, itemData.style);
    }
  }

  setActiveItem(item) {
    // Désactiver tous les autres items
    this.itemsMap.forEach((itemData, itemId) => {
      if (itemId !== item.id) {
        this.removeItemState(itemData.element, 'active');
      }
    });

    // Activer l'item courant
    this.applyItemState(item, 'active');
  }

  // ========================================
  // 📱 GESTION RESPONSIVE
  // ========================================

  setupResponsive() {
    if (!this.config.responsive.enabled) return;

    // Observer les changements de taille d'écran
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResponsiveChange();
    });

    this.resizeObserver.observe(document.body);
    
    // Vérification initiale
    this.handleResponsiveChange();
  }

  handleResponsiveChange() {
    const width = window.innerWidth;
    const breakpoints = this.config.responsive.breakpoints;

    let currentBreakpoint = 'desktop';
    
    if (width <= breakpoints.mobile?.maxWidth) {
      currentBreakpoint = 'mobile';
    } else if (width <= breakpoints.tablet?.maxWidth) {
      currentBreakpoint = 'tablet';
    }

    // Appliquer les styles responsive
    this.applyResponsiveStyles(currentBreakpoint);

    // Callback
    if (this.callbacks.onResponsiveChange) {
      this.callbacks.onResponsiveChange(currentBreakpoint, width);
    }
  }

  applyResponsiveStyles(breakpoint) {
    const breakpointConfig = this.config.responsive.breakpoints[breakpoint];
    if (!breakpointConfig) return;

    // Appliquer les modifications de layout
    if (breakpointConfig.orientation) {
      this.container.style.flexDirection = breakpointConfig.orientation === 'vertical' ? 'column' : 'row';
    }

    if (breakpointConfig.collapse) {
      // Logique pour transformer en menu burger sur mobile
      this.createMobileToggle();
    }
  }

  createMobileToggle() {
    // Créer un bouton burger pour mobile
    if (!this.mobileToggle) {
      this.mobileToggle = document.createElement('button');
      this.mobileToggle.innerHTML = '☰';
      this.mobileToggle.className = 'menu-mobile-toggle';
      this.mobileToggle.style.cssText = `
        display: none;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        padding: 8px;
      `;

      this.mobileToggle.addEventListener('click', () => {
        this.toggleMobileMenu();
      });

      this.container.parentElement.insertBefore(this.mobileToggle, this.container);
    }

    // Afficher/masquer selon la taille d'écran
    if (window.innerWidth <= this.config.responsive.breakpoints.mobile?.maxWidth) {
      this.mobileToggle.style.display = 'block';
      this.container.style.display = 'none';
    } else {
      this.mobileToggle.style.display = 'none';
      this.container.style.display = 'flex';
    }
  }

  // ========================================
  // 🎪 GESTION DES DROPDOWNS
  // ========================================

  toggleDropdown(parentItem) {
    const dropdownId = `${parentItem.id}-dropdown`;
    const dropdown = document.getElementById(dropdownId);
    
    if (!dropdown) return;

    const isOpen = dropdown.style.opacity === '1';

    if (isOpen) {
      this.closeDropdown(dropdown);
    } else {
      this.closeAllDropdowns();
      this.openDropdown(dropdown);
    }
  }

  openDropdown(dropdown) {
    dropdown.style.opacity = '1';
    dropdown.style.visibility = 'visible';
    dropdown.style.transform = 'translateY(0)';

    this.activeDropdown = dropdown;

    // Callback
    if (this.callbacks.onDropdownOpen) {
      this.callbacks.onDropdownOpen(dropdown);
    }
  }

  closeDropdown(dropdown) {
    dropdown.style.opacity = '0';
    dropdown.style.visibility = 'hidden';
    dropdown.style.transform = 'translateY(-10px)';

    if (this.activeDropdown === dropdown) {
      this.activeDropdown = null;
    }

    // Callback
    if (this.callbacks.onDropdownClose) {
      this.callbacks.onDropdownClose(dropdown);
    }
  }

  closeAllDropdowns() {
    this.dropdownsMap.forEach((dropdownData) => {
      this.closeDropdown(dropdownData.element);
    });
  }

  // ========================================
  // 🛠️ API PUBLIQUE
  // ========================================

  addItem(itemData, groupId = null) {
    const item = this.createMenuItem(itemData, Date.now());
    
    if (groupId) {
      const group = document.getElementById(groupId);
      if (group) {
        group.appendChild(item);
      }
    } else {
      this.container.appendChild(item);
    }

    return item.id;
  }

  removeItem(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
      item.remove();
      this.itemsMap.delete(itemId);
    }
  }

  updateItem(itemId, newData) {
    const itemData = this.itemsMap.get(itemId);
    if (!itemData) return;

    const item = itemData.element;

    // Mettre à jour le contenu
    if (newData.content) {
      if (newData.content.html) {
        item.innerHTML = newData.content.html;
      } else if (newData.content.text) {
        item.textContent = newData.content.text;
      }
    }

    // Mettre à jour les styles
    if (newData.style) {
      Object.assign(item.style, newData.style);
    }

    // Mettre à jour les données
    Object.assign(itemData, newData);
  }

  toggleMobileMenu() {
    const isVisible = this.container.style.display !== 'none';
    this.container.style.display = isVisible ? 'none' : 'flex';
    
    if (this.mobileToggle) {
      this.mobileToggle.innerHTML = isVisible ? '☰' : '✕';
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    if (this.mobileToggle) {
      this.mobileToggle.remove();
    }
    
    this.container.remove();
// console.log(`🗑️ Menu "${this.config.id}" détruit`);
  }

  // ========================================
  // 🔧 UTILITAIRES
  // ========================================

  navigateItems(direction) {
    const items = Array.from(this.container.querySelectorAll('.menu-item'));
    const currentIndex = items.findIndex(item => item === document.activeElement);
    
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = items.length - 1;
    if (nextIndex >= items.length) nextIndex = 0;
    
    if (items[nextIndex]) {
      items[nextIndex].focus();
    }
  }

  getActiveItem() {
    return Array.from(this.itemsMap.values()).find(item => 
      item.element.style.backgroundColor === this.config.styling.states.active.backgroundColor
    );
  }

  getAllItems() {
    return Array.from(this.itemsMap.values());
  }

  getDropdownState(itemId) {
    const dropdownId = `${itemId}-dropdown`;
    const dropdown = document.getElementById(dropdownId);
    return dropdown ? dropdown.style.opacity === '1' : false;
  }
}

// Export par défaut
export default Menu;
