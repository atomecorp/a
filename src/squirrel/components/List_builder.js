
/**
 * 🎯 LIST COMPONENT - VERSION 2.0 MATERIAL DESIGN
 * Composant List avec styles Material Design et personnalisation complète
 */

class List {
  constructor(options = {}) {
    // console.log('🏗️ Création du composant List avec options:', options);
    
    // Configuration par défaut Material Design
    this.config = {
      id: options.id || `list-${Date.now()}`,
      items: options.items || [],
      position: { x: 0, y: 0, ...options.position },
      size: { width: 300, height: 400, ...options.size },
      
      // Espacement ultra-personnalisable
      spacing: { 
        vertical: options.spacing?.vertical ?? 4,        // Espace entre les éléments
        horizontal: options.spacing?.horizontal ?? 0,    // Marge horizontale
        itemPadding: options.spacing?.itemPadding ?? 16, // Padding interne des éléments
        marginTop: options.spacing?.marginTop ?? 0,      // Marge avant chaque élément
        marginBottom: options.spacing?.marginBottom ?? 0, // Marge après chaque élément
        ...options.spacing 
      },
      
      attach: options.attach || 'body',
      
      // Configuration Material Design des éléments
      itemStyle: {
        fontSize: options.itemStyle?.fontSize ?? '14px',
        fontWeight: options.itemStyle?.fontWeight ?? '400',
        lineHeight: options.itemStyle?.lineHeight ?? '1.4',
        textColor: options.itemStyle?.textColor ?? '#212121',
        backgroundColor: options.itemStyle?.backgroundColor ?? '#ffffff',
        borderRadius: options.itemStyle?.borderRadius ?? '8px',
        ...options.itemStyle
      },
      
      states: {
        hover: {
          backgroundColor: '#f5f5f5',
          boxShadow: '0 2px 4px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.24)',
          transform: 'translateY(-1px)',
          ...options.states?.hover
        },
        selected: {
          backgroundColor: '#1976d2',
          color: '#ffffff',
          boxShadow: '0 4px 8px rgba(25,118,210,0.3)',
          transform: 'translateY(-1px)',
          ...options.states?.selected
        },
        ...options.states
      },
      
      containerStyle: options.containerStyle || {},
      
      // Options Material Design
      selectable: options.selectable !== false,
      multiSelect: options.multiSelect || false,
      elevation: options.elevation ?? 2,
      rippleEffect: options.rippleEffect !== false,
      
      // Debug
      debug: options.debug || false
    };

    // Stockage interne
    this.itemsMap = new Map();
    this.itemStates = new Map();
    this.itemElements = new Map();
    this.selectedItems = new Set();

    // Callbacks
    this.callbacks = {
      onItemClick: options.onItemClick || null,
      onItemSelect: options.onItemSelect || null,
      onItemHover: options.onItemHover || null,
      onItemLeave: options.onItemLeave || null
    };

    // État interne
    this.container = null;
    this.isInitialized = false;

    // Initialisation
    this.init();
  }

  // ========================================
  // 🏗️ INITIALISATION
  // ========================================

  init() {
    try {
// console.log(`🚀 Initialisation de la liste "${this.config.id}"...`);
      this.createContainer();
      this.createItems();
      this.setupEventListeners();
      this.isInitialized = true;

      if (this.config.debug) {
// console.log(`✅ List "${this.config.id}" initialisée avec succès`);
// console.log(`📝 ${this.config.items.length} éléments créés`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors de l'initialisation de List "${this.config.id}":`, error);
    }
  }

  createContainer() {
    const attachPoint = typeof this.config.attach === 'string' 
      ? document.querySelector(this.config.attach) 
      : this.config.attach;

    if (!attachPoint) {
      throw new Error(`Point d'attachement "${this.config.attach}" non trouvé`);
    }

    this.container = document.createElement('div');
    this.container.id = this.config.id;
    this.container.className = 'list-container';
    
    this.applyContainerStyles();
    attachPoint.appendChild(this.container);
    
// console.log(`📦 Container créé et attaché à "${this.config.attach}"`);
// console.log(`🔍 Container dans le DOM:`, this.container);
// console.log(`📐 Dimensions:`, this.container.style.width, 'x', this.container.style.height);
// console.log(`📍 Position:`, this.container.style.left, this.container.style.top);
  }

  applyContainerStyles() {
    const elevation = this.getElevationShadow(this.config.elevation);
    
    const defaultStyles = {
      position: 'absolute',
      left: `${this.config.position.x}px`,
      top: `${this.config.position.y}px`,
      width: `${this.config.size.width}px`,
      height: `${this.config.size.height}px`,
      overflow: 'auto',
      background: '#ffffff',
      borderRadius: '12px',
      padding: '8px',
      boxShadow: elevation,
      border: 'none',
      fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    };

    const finalStyles = { ...defaultStyles, ...this.config.containerStyle };
    Object.assign(this.container.style, finalStyles);
  }

  getElevationShadow(level) {
    const shadows = {
      0: 'none',
      1: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
      2: '0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)',
      3: '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)',
      4: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
      5: '0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22)'
    };
    return shadows[level] || shadows[2];
  }

  createItems() {
// console.log(`📋 Création de ${this.config.items.length} éléments...`);
    this.config.items.forEach((itemData, index) => {
      const itemElement = this.createItem(itemData, index);
      this.container.appendChild(itemElement);
    });
  }

  createItem(itemData, index) {
    const itemElement = document.createElement('div');
    const itemId = itemData.id || `item-${index}`;
    
    itemElement.id = itemId;
    itemElement.className = 'list-item';
    itemElement.textContent = itemData.content || itemData.text || `Élément ${index + 1}`;
    
    // Stockage des données
    this.itemsMap.set(itemId, itemData);
    this.itemElements.set(itemId, itemElement);
    this.itemStates.set(itemId, 'default');
    
    // Application des styles Material Design
    this.applyItemStyles(itemElement, itemData);
    
    return itemElement;
  }

  applyItemStyles(element, itemData) {
    // Styles Material Design avec paramètres personnalisables
    const defaultStyles = {
      // Espacement ultra-personnalisable
      padding: `${this.config.spacing.itemPadding}px`,
      marginTop: `${this.config.spacing.marginTop}px`,
      marginBottom: `${this.config.spacing.vertical}px`,
      marginLeft: `${this.config.spacing.horizontal}px`,
      marginRight: `${this.config.spacing.horizontal}px`,
      
      // Texte personnalisable
      fontSize: this.config.itemStyle.fontSize,
      fontWeight: this.config.itemStyle.fontWeight,
      lineHeight: this.config.itemStyle.lineHeight,
      color: this.config.itemStyle.textColor,
      fontFamily: 'inherit',
      
      // Style Material Design
      background: this.config.itemStyle.backgroundColor,
      borderRadius: this.config.itemStyle.borderRadius,
      border: 'none',
      boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
      
      // Interactions
      cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
      userSelect: 'none'
    };

    // Fusion avec styles personnalisés
    const componentStyles = this.config.itemStyle.default || {};
    const itemSpecificStyles = itemData.style || {};
    const finalStyles = { ...defaultStyles, ...componentStyles, ...itemSpecificStyles };
    
    Object.assign(element.style, finalStyles);
    
    // Ajouter l'effet ripple si activé
    if (this.config.rippleEffect) {
      this.addRippleEffect(element);
    }
  }

  addRippleEffect(element) {
    element.addEventListener('click', (e) => {
      const ripple = document.createElement('span');
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
        z-index: 1;
      `;
      
      // Ajouter l'animation CSS si elle n'existe pas
      if (!document.getElementById('ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
          @keyframes ripple {
            to {
              transform: scale(4);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      element.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  setupEventListeners() {
    this.container.addEventListener('click', (e) => {
      const itemElement = e.target.closest('.list-item');
      if (itemElement) {
        this.handleItemClick(itemElement, e);
      }
    });

    this.container.addEventListener('mouseover', (e) => {
      const itemElement = e.target.closest('.list-item');
      if (itemElement) {
        this.handleItemHover(itemElement);
      }
    });

    this.container.addEventListener('mouseout', (e) => {
      const itemElement = e.target.closest('.list-item');
      if (itemElement) {
        this.handleItemLeave(itemElement);
      }
    });
  }

  // ========================================
  // 🎭 GESTION DES ÉVÉNEMENTS
  // ========================================

  handleItemClick(element, event) {
    const itemId = element.id;
    const itemData = this.itemsMap.get(itemId);
    const index = Array.from(this.itemElements.values()).indexOf(element);

    if (this.config.selectable) {
      this.toggleSelection(itemId);
    }

    if (this.callbacks.onItemClick) {
      this.callbacks.onItemClick(itemData, index, event);
    }
  }

  handleItemHover(element) {
    const itemId = element.id;
    this.applyState(itemId, 'hover');

    if (this.callbacks.onItemHover) {
      const itemData = this.itemsMap.get(itemId);
      this.callbacks.onItemHover(itemData);
    }
  }

  handleItemLeave(element) {
    const itemId = element.id;
    const currentState = this.itemStates.get(itemId);
    
    if (currentState === 'hover') {
      const isSelected = this.selectedItems.has(itemId);
      this.applyState(itemId, isSelected ? 'selected' : 'default');
    }

    if (this.callbacks.onItemLeave) {
      const itemData = this.itemsMap.get(itemId);
      this.callbacks.onItemLeave(itemData);
    }
  }

  // ========================================
  // 🎨 GESTION DES ÉTATS
  // ========================================

  applyState(itemId, stateName) {
    const element = this.itemElements.get(itemId);
    if (!element) return;

    const stateStyles = this.config.states[stateName] || {};
    
    if (stateName === 'default') {
      const itemData = this.itemsMap.get(itemId);
      this.applyItemStyles(element, itemData);
    } else {
      Object.assign(element.style, stateStyles);
    }

    this.itemStates.set(itemId, stateName);
  }

  toggleSelection(itemId) {
    const isSelected = this.selectedItems.has(itemId);

    if (!this.config.multiSelect && !isSelected) {
      this.selectedItems.forEach(selectedId => {
        this.selectedItems.delete(selectedId);
        this.applyState(selectedId, 'default');
      });
    }

    if (isSelected) {
      this.selectedItems.delete(itemId);
      this.applyState(itemId, 'default');
    } else {
      this.selectedItems.add(itemId);
      this.applyState(itemId, 'selected');
    }

    if (this.callbacks.onItemSelect) {
      const itemData = this.itemsMap.get(itemId);
      this.callbacks.onItemSelect(itemData, !isSelected);
    }
  }

  // ========================================
  // 🔧 API PUBLIQUE
  // ========================================

  addItem(itemData) {
    const index = this.config.items.length;
    this.config.items.push(itemData);
    
    const itemElement = this.createItem(itemData, index);
    this.container.appendChild(itemElement);
    
    return itemData.id || `item-${index}`;
  }

  removeItem(itemId) {
    const element = this.itemElements.get(itemId);
    if (element) {
      element.remove();
      this.itemElements.delete(itemId);
      this.itemsMap.delete(itemId);
      this.itemStates.delete(itemId);
      this.selectedItems.delete(itemId);
    }
  }

  getSelectedItems() {
    return Array.from(this.selectedItems).map(id => this.itemsMap.get(id));
  }

  clearSelection() {
    this.selectedItems.forEach(itemId => {
      this.applyState(itemId, 'default');
    });
    this.selectedItems.clear();
  }

  // Nouvelle méthode pour mettre à jour les styles d'espacement
  updateSpacing(newSpacing) {
    this.config.spacing = { ...this.config.spacing, ...newSpacing };
    // Réappliquer les styles à tous les éléments
    this.itemElements.forEach((element, itemId) => {
      const itemData = this.itemsMap.get(itemId);
      this.applyItemStyles(element, itemData);
    });
  }

  // Nouvelle méthode pour mettre à jour les styles de texte
  updateTextStyle(newTextStyle) {
    this.config.itemStyle = { ...this.config.itemStyle, ...newTextStyle };
    // Réappliquer les styles à tous les éléments
    this.itemElements.forEach((element, itemId) => {
      const itemData = this.itemsMap.get(itemId);
      this.applyItemStyles(element, itemData);
    });
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.itemsMap.clear();
    this.itemElements.clear();
    this.itemStates.clear();
    this.selectedItems.clear();
    
    this.isInitialized = false;
  }
}

// === FONCTION DE CRÉATION PRINCIPALE ===
function createList(options = {}) {
  const list = new List(options);
  list.init();
  return list.container;
}

// === EXPORTS ===
export { createList };

// Alias pour compatibilité avec l'ancien pattern (éviter le conflit avec la classe List)
const ListComponent = createList;
export { ListComponent };
export { ListComponent as List };

// Export par défaut - fonction directe pour usage: List({...})
export default createList;
