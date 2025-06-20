/* 🐿️ Squirrel.js Full v1.0.0 - https://github.com/atomecorp/a */
(function () {
  'use strict';

  /**
   * 🌐 APIS - EXTENSIONS FOR JAVASCRIPT
   * Adding Ruby-like functionalities to JavaScript + MINIMAL REQUIRE SYSTEM FOR SQUIRREL
   */

  // Add the puts method to display in the console
  window.puts = function puts(val) {
      console.log(val);
  };

  // Add the print method to display in the console without newline (Ruby-like)
  window.print = function print(val) {
      // In browser, we can't avoid newline easily, so we use console.log but prefix with [PRINT]
      console.log('[PRINT]', val);
  };

  // Add the grab method to retrieve DOM elements
  window.grab = (function () {
      // Cache for recent results
      const domCache = new Map();

      return function (id) {
          if (!id) return null;

          // Check the registry first (fast path)
          const instance = _registry[id];
          if (instance) return instance;

          // Check the DOM cache
          if (domCache.has(id)) {
              const cached = domCache.get(id);
              // Check if the element is still in the DOM
              if (cached && cached.isConnected) {
                  return cached;
              } else {
                  // Remove obsolete entry
                  domCache.delete(id);
              }
          }

          // Search in the DOM
          const element = document.getElementById(id);
          if (!element) return null;

          // Add useful methods – only once!
          if (!element._enhanced) {
              // Mark as enhanced to avoid duplicates
              element._enhanced = true;

              const cssProperties = ['width', 'height', 'color', 'backgroundColor', 'x', 'y'];
              cssProperties.forEach(prop => {
                  const styleProp = prop === 'x' ? 'left' : prop === 'y' ? 'top' : prop;

                  element[prop] = function (value) {
                      if (arguments.length === 0) {
                          return getComputedStyle(this)[styleProp];
                      }

                      this.style[styleProp] = window._isNumber && window._isNumber(value) ? 
                          window._formatSize(value) : value;
                      return this;
                  };
              });
          }

          // Store in the cache for future calls
          domCache.set(id, element);

          return element;
      };
  })();

  // Add extensions to native JavaScript objects (similar to Ruby)
  Object.prototype.define_method = function (name, fn) {
      this[name] = fn;
      return this;
  };

  // Add methods to Array to mimic Ruby behavior
  Array.prototype.each = function (callback) {
      this.forEach(callback);
      return this;
  };

  // Extend the Object class to allow inspection
  Object.prototype.inspect = function () {
      return AJS.inspect(this);
  };

  // Add a wait function for delays (promisified version is more modern)
  const wait = (delay, callback) => {
    if (typeof callback === 'function') {
      setTimeout(callback, delay);
    } else {
      // Return a promise if no callback
      return new Promise(resolve => setTimeout(resolve, delay));
    }
  };
  window.wait = wait;

  // Add log function (alias for puts)
  window.log = window.puts;

  // Helper functions for grab method - use global versions
  // (Remove duplicated functions since they're already defined in a.js)

  // Registry for grab method
  window._registry = window._registry || {};

  // AJS object for inspect method
  window.AJS = window.AJS || {
      inspect: function(obj) {
          return JSON.stringify(obj, null, 2);
      }
  };

  // HyperSquirrel.js - Un framework minimaliste pour la création d'interfaces web

  // Cache pour templates et conversions de styles
  const createElement = (tag) => document.createElement(tag);
  const templateRegistry = new Map();
  const cssCache = new Map();

  // Gestion des événements et mutations
  const eventRegistry = new WeakMap(); // Écouteurs d'événements
  const mutationRegistry = new WeakMap(); // Observateurs de mutations

  // Conversion camelCase → kebab-case (avec cache)
  const toKebabCase = (str) => {
    if (cssCache.has(str)) return cssCache.get(str);
    const result = str.replace(/([A-Z])/g, '-$1').toLowerCase();
    cssCache.set(str, result);
    return result;
  };

  // Détection des handlers d'événements
  const isEventHandler = key => key.startsWith('on');

  // Attributs booléens reconnus
  const booleanAttributes = new Set([
    'draggable', 'hidden', 'spellcheck', 'contenteditable', 
    'disabled', 'checked', 'readonly'
  ]);

  // Fonction utilitaire pour ajouter des classes (évite la duplication de code)
  const addClasses = (element, classes) => {
    if (!classes) return;
    
    if (typeof classes === 'string') {
      // Éviter split si une seule classe
      if (classes.indexOf(' ') === -1) {
        element.classList.add(classes);
      } else {
        element.classList.add(...classes.split(' '));
      }
    } else if (Array.isArray(classes)) {
      element.classList.add(...classes);
    }
  };

  /**
   * Création et mise à jour d'éléments DOM
   * @param {string|Function} id - Identifiant du template ou fonction de création
   * @param {Object} props - Propriétés de configuration
   */
  const $$1 = (id, props = {}) => {
    const config = templateRegistry.get(id) || {};
    const element = createElement(config.tag || props.tag || id || 'div');
    
    // 🔧 FIX: Merge CSS intelligent
    const merged = { ...config, ...props };
    
    // CSS merge corrigé
    if (config.css || props.css) {
      if (typeof config.css === 'string' && typeof props.css === 'string') {
        merged.css = config.css + ';' + props.css;
      } else if (typeof config.css === 'object' && typeof props.css === 'object') {
        merged.css = { ...config.css, ...props.css };
      } else {
        merged.css = props.css || config.css;
      }
    }
    
    // 🔧 FIX: Attrs merge corrigé
    if (config.attrs || props.attrs) {
      merged.attrs = { ...(config.attrs || {}), ...(props.attrs || {}) };
    }
    
    // Marquage optionnel
    if (merged.mark) element.setAttribute('data-hyperfactory', 'true');
    
    // Attributs basiques
    merged.id && (element.id = merged.id);
    merged.text && (element.textContent = merged.text);
    
    // Classes via classList (optimisé)
    addClasses(element, merged.class);
    
    // Attributs personnalisés
    if (merged.attrs) {
      for (const [key, value] of Object.entries(merged.attrs)) {
        if (value == null) {
          element.removeAttribute(key);
        } else if (booleanAttributes.has(key)) {
          value ? element.setAttribute(key, '') : element.removeAttribute(key);
        } else {
          element.setAttribute(key, value);
        }
      }
    }
    
    // Styles CSS
    if (merged.css) {
      if (typeof merged.css === 'string') {
        element.style.cssText = merged.css;
      } else {
        for (const key in merged.css) {
          if (merged.css.hasOwnProperty(key)) {
            const value = merged.css[key];
            const kebabKey = toKebabCase(key);
            value == null 
              ? element.style.removeProperty(kebabKey)
              : element.style.setProperty(kebabKey, value);
          }
        }
      }
    }
    
    // Événements avec addEventListener
    eventRegistry.set(element, {});
    for (const key in merged) {
      if (isEventHandler(key) && typeof merged[key] === 'function') {
        const eventName = key.slice(2).toLowerCase();
        const handler = merged[key];
        element.addEventListener(eventName, handler);
        eventRegistry.get(element)[eventName] = handler;
      }
    }
    
    // Enfants imbriqués
    if (merged.children) {
      merged.children.forEach(childConfig => {
        const child = $$1(childConfig.id, childConfig);
        element.appendChild(child);
      });
    }
    
    // Méthode de mise à jour
    element.$ = updateProps => {
      if ('text' in updateProps) element.textContent = updateProps.text;
      
      if (updateProps.class) {
        addClasses(element, updateProps.class);
      }
      
      if (updateProps.css) {
        if (typeof updateProps.css === 'string') {
          element.style.cssText = updateProps.css;
        } else {
          for (const key in updateProps.css) {
            if (updateProps.css.hasOwnProperty(key)) {
              const value = updateProps.css[key];
              const kebabKey = toKebabCase(key);
              value == null 
                ? element.style.removeProperty(kebabKey)
                : element.style.setProperty(kebabKey, value);
            }
          }
        }
      }
      
      if (updateProps.attrs) {
        for (const key in updateProps.attrs) {
          if (updateProps.attrs.hasOwnProperty(key)) {
            const value = updateProps.attrs[key];
            if (value == null) {
              element.removeAttribute(key);
            } else if (booleanAttributes.has(key)) {
              value ? element.setAttribute(key, '') : element.removeAttribute(key);
            } else {
              element.setAttribute(key, value);
            }
          }
        }
      }
      
      // Mise à jour des événements
      const currentListeners = eventRegistry.get(element);
      for (const key in updateProps) {
        if (isEventHandler(key) && typeof updateProps[key] === 'function') {
          const eventName = key.slice(2).toLowerCase();
          const newHandler = updateProps[key];
          
          if (currentListeners[eventName]) {
            element.removeEventListener(eventName, currentListeners[eventName]);
          }
          
          element.addEventListener(eventName, newHandler);
          currentListeners[eventName] = newHandler;
        }
      }
      
      return element;
    };
    
    // Alias pour le style
    element._ = element.style;
    
    // Parent (support des sélecteurs)
    const parent = merged.parent || '#view';  // ← Votre changement
    if (typeof parent === 'string') {
      const target = document.querySelector(parent);
      if (target) target.appendChild(element);
      else console.warn(`Parent selector "${parent}" not found`);
    } else {
      parent.appendChild(element);
    }
    
    // 🔧 FIX: Animation native intégrée
    element.animate = (keyframes, options = {}) => {
      const animation = element.animate(keyframes, {
        duration: options.duration || 300,
        easing: options.easing || 'ease',
        fill: 'forwards'
      });
      return animation.finished;
    };
    
    // 🔧 FIX: Cleanup des observers
    element.remove = () => {
      // Nettoyer les observers
      const observers = mutationRegistry.get(element);
      if (observers) {
        observers.forEach(observer => observer.disconnect());
        mutationRegistry.delete(element);
      }
      
      // Nettoyer les events
      const events = eventRegistry.get(element);
      if (events) {
        for (const eventName in events) {
          if (events.hasOwnProperty(eventName)) {
            element.removeEventListener(eventName, events[eventName]);
          }
        }
        eventRegistry.delete(element);
      }
      
      element.parentNode?.removeChild(element);
    };
    
    return element;
  };

  /**
   * Définition d'un template réutilisable
   * @param {string} id - Identifiant du template
   * @param {Object} config - Configuration du template
   */
  const define$1 = (id, config) => {
    templateRegistry.set(id, config);
    return config;
  };

  // === 🧠 Observation des mutations DOM ===
  /**
   * Surveiller les changements sur un élément
   * @param {Element} element - Élément à observer
   * @param {Function} callback - Callback sur mutation
   * @param {Object} options - Options de l'observateur
   */
  const observeMutations = (element, callback, options = {}) => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => callback(mutation));
    });
    
    observer.observe(element, {
      attributes: true,
      childList: true,
      subtree: true,
      ...options
    });
    
    // Stocker l'observateur pour le nettoyage
    if (!mutationRegistry.has(element)) mutationRegistry.set(element, []);
    mutationRegistry.get(element).push(observer);
  };

  // / === 🎉 Démonstrations ===

  // 1. Template basique


  define('view', {
      tag: 'div',
      class: 'atome',
      id: 'view',

  });

  // 2. Animation avec CSS
  $('view', {
      parent: document.body,
      css: {
          background: '#272727',
          color: 'lightgray',
          left: '0px',
          top: '0px',
          position: 'absolute',
          width: '100%',
          height: '100%',
          overflow: 'auto',
      }

  });

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
          return createMenuItem({ ...contentItem}, index);
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

  /**
   * Composant Slider skinnable avec HyperSquirrel
   * Chaque élément du slider est entièrement customisable
   * Support pour sliders horizontaux, verticaux et circulaires
   */

  // === DÉFINITION DES TEMPLATES DE BASE ===

  // Template pour le conteneur principal du slider
  define('slider-container', {
    tag: 'div',
    class: 'hs-slider',
    css: {
      position: 'relative',
      display: 'inline-block',
      userSelect: 'none',
      touchAction: 'none'
    }
  });

  // Template pour la piste du slider
  define('slider-track', {
    tag: 'div',
    class: 'hs-slider-track',
    css: {
      position: 'absolute',
      backgroundColor: '#e0e0e0',
      borderRadius: '4px',
      overflow: 'hidden',
      zIndex: '1',
      boxSizing: 'border-box'  // Ajout important
    }
  });

  // Template pour la partie progression du slider
  define('slider-progression', {
    tag: 'div',
    class: 'hs-slider-progression',
    css: {
      position: 'absolute',
      backgroundColor: '#007bff',
      borderRadius: '0',
      zIndex: '2',
    }
  });

  // Template pour le handle/thumb du slider
  define('slider-handle', {
    tag: 'div',
    class: 'hs-slider-handle',
    css: {
      position: 'absolute',
      backgroundColor: '#fff',
      border: '2px solid #007bff',
      borderRadius: '50%',
      cursor: 'pointer',
      zIndex: '20',  // Augmenté pour être sûr qu'il est au-dessus
      boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
    }
  });

  // Template pour le label/valeur du slider
  define('slider-label', {
    tag: 'div',
    class: 'hs-slider-label',
    css: {
      position: 'absolute',
      fontSize: '12px',
      fontFamily: 'system-ui, sans-serif',
      color: '#666',
      whiteSpace: 'nowrap'
    }
  });

  // Template pour les graduations
  define('slider-tick', {
    tag: 'div',
    class: 'hs-slider-tick',
    css: {
      position: 'absolute',
      backgroundColor: '#ccc',
      pointerEvents: 'none'
    }
  });

  // === STYLES PRÉDÉFINIS ===

  const sliderVariants = {
    horizontal: {
      container: { width: '200px', height: '20px' },
      track: { width: '100%', height: '4px', top: '50%', transform: 'translateY(-50%)' },
      progression: { height: '100%', left: '0', top: '0', borderTopLeftRadius: '4px', borderBottomLeftRadius: '4px' },
      handle: { width: '16px', height: '16px', top: '50%' },
      label: { top: '25px', transform: 'translateX(-50%)' }
    },
    vertical: {
      container: { width: '20px', height: '200px' },
      track: { width: '4px', height: '100%', left: '50%', transform: 'translateX(-50%)' },
      progression: { width: '100%', bottom: '0', left: '0', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' },
      handle: { width: '16px', height: '16px', left: '50%' },
      label: { left: '25px', transform: 'translateY(-50%)' }
    },
    circular: {
      container: { width: '120px', height: '120px' },
      track: { width: '100%', height: '100%', borderRadius: '50%', border: '4px solid #e0e0e0' },
      progression: { display: 'none' }, // Progression géré différemment pour circulaire (SVG)
      handle: { width: '20px', height: '20px' },
      label: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
  };

  const sliderSizes = {
    sm: { scale: 0.8 },
    md: { scale: 1 }, // default
    lg: { scale: 1.2 },
    xl: { scale: 1.5 }
  };

  // === COMPOSANT SLIDER PRINCIPAL ===

  /**
   * Crée un slider entièrement skinnable
   * @param {Object} config - Configuration du slider
   * @param {string} config.type - Type de slider (horizontal, vertical, circular)
   * @param {number} config.min - Valeur minimum (défaut: 0)
   * @param {number} config.max - Valeur maximum (défaut: 100)
   * @param {number} config.value - Valeur initiale (défaut: 50)
   * @param {number} config.step - Pas de progression (défaut: 1)
   * @param {Function} config.onChange - Handler de changement de valeur
   * @param {Function} config.onInput - Handler d'input continu
   * @param {Object} config.skin - Styles personnalisés pour chaque partie
   * @param {string} config.id - ID personnalisé (sinon auto-généré)
   * @param {boolean} config.disabled - Slider désactivé
   * @param {boolean} config.showLabel - Afficher la valeur (défaut: true)
   * @param {boolean} config.showTicks - Afficher les graduations
   * @param {Array} config.ticks - Positions des graduations
   * @param {number} config.radius - Rayon personnalisé pour slider circulaire
   * @param {number} config.handleOffset - Décalage du handle (en %) : positif = extérieur, négatif = intérieur
   */
  const createSlider = (config = {}) => {
    const {
      type = 'horizontal',
      min = 0,
      max = 100,
      value = 50,
      step = 1,
      onChange,
      onInput,
      skin = {},
      id,
      disabled = false,
      showLabel = true,
      showTicks = false,
      ticks = [],
      size = 'md',
      radius,  // Ajout du paramètre radius
      handleOffset = 0,  // Nouveau paramètre pour ajuster la position du handle
      // Nouveaux paramètres pour zone de drag limitée
      dragMin = null,  // Zone de drag minimum (null = utilise min)
      dragMax = null,  // Zone de drag maximum (null = utilise max)
      ...otherProps
    } = config;

    // Génération d'ID unique si non fourni
    const sliderId = id || `slider_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Validation des valeurs
    const currentValue = Math.max(min, Math.min(max, value));
    const isCircular = type === 'circular';

    // Styles de base selon type et taille
    let containerStyles = { ...sliderVariants[type]?.container || {}, ...sliderSizes[size] || {} };
    let trackStyles = { ...sliderVariants[type]?.track || {} };
    let progressionStyles = { ...sliderVariants[type]?.progression || {} };
    let handleStyles = { ...sliderVariants[type]?.handle || {} };
    let labelStyles = { ...sliderVariants[type]?.label || {} };

    // Si un radius est fourni pour un slider circulaire, l'utiliser
    if (isCircular && radius) {
      const diameter = radius * 2;
      containerStyles.width = `${diameter}px`;
      containerStyles.height = `${diameter}px`;
    }

    // Application des styles personnalisés
    if (skin.container) containerStyles = { ...containerStyles, ...skin.container };
    if (skin.track) trackStyles = { ...trackStyles, ...skin.track };
    if (skin.progression) progressionStyles = { ...progressionStyles, ...skin.progression };
    if (skin.handle) handleStyles = { ...handleStyles, ...skin.handle };
    if (skin.label) labelStyles = { ...labelStyles, ...skin.label };

    // Styles pour état disabled
    if (disabled) {
      containerStyles.opacity = '0.6';
      containerStyles.pointerEvents = 'none';
    }

    // Création du conteneur principal
    const container = $('slider-container', {
      id: sliderId,
      css: containerStyles,
      ...otherProps
    });

    // Création de la piste
    const track = $('slider-track', {
      id: `${sliderId}_track`,
      css: trackStyles
    });

    // Pour un slider circulaire, s'assurer que le track remplit le conteneur
    if (isCircular) {
      track.$({
        css: {
          width: '100%',
          height: '100%',
          top: '0',
          left: '0'
        }
      });
    }

    // Création de la progression
    let progression;
    if (!isCircular) {
      progression = $('slider-progression', {
        id: `${sliderId}_progression`,
        css: progressionStyles
      });
      track.appendChild(progression);
    }

    // Création du handle
    const handle = $('slider-handle', {
      id: `${sliderId}_handle`,
      css: handleStyles
    });

    // Création du label si demandé
    let label;
    if (showLabel) {
      label = $('slider-label', {
        id: `${sliderId}_label`,
        text: currentValue.toString(),
        css: labelStyles
      });
    }

    // Création des graduations si demandées
    if (showTicks && ticks.length > 0) {
      ticks.forEach((tickValue, index) => {
        const tickPosition = ((tickValue - min) / (max - min)) * 100;
        const tick = $('slider-tick', {
          id: `${sliderId}_tick_${index}`,
          css: {
            ...skin.tick || {},
            ...(type === 'horizontal' ? {
              left: `${tickPosition}%`,
              top: '12px',
              width: '2px',
              height: '6px'
            } : {
              top: `${100 - tickPosition}%`,
              left: '12px',
              width: '6px',
              height: '2px'
            })
          }
        });
        container.appendChild(tick);
      });
    }

    // Assemblage des éléments
    container.appendChild(track);
    if (!isCircular && progression) track.appendChild(progression);
    container.appendChild(handle);  // Handle toujours au niveau du conteneur
    if (label) container.appendChild(label);

    // Variables de state
    let isDragging = false;
    let currentVal = currentValue;
    let currentHandleOffset = handleOffset;  // Stocker l'offset actuel

    // Fonction de mise à jour de position
    const updatePosition = (newValue) => {
      const clampedValue = Math.max(min, Math.min(max, newValue));
      
      if (isCircular) {
        // POSITION DU HANDLE : Toujours basée sur la plage totale (min-max)
        const handlePercentage = ((clampedValue - min) / (max - min)) * 100;
        
        // PROGRESSION : Basée sur la zone de drag si définie
        let progressionPercentage = 0;
        if (dragMin !== null || dragMax !== null) {
          // Zone de drag définie : progression selon la zone de drag
          if (clampedValue >= effectiveDragMin && clampedValue <= effectiveDragMax) {
            progressionPercentage = ((clampedValue - effectiveDragMin) / (effectiveDragMax - effectiveDragMin)) * 100;
          } else if (clampedValue > effectiveDragMax) {
            progressionPercentage = 100;
          }
          // Si clampedValue < effectiveDragMin, progressionPercentage reste 0
        } else {
          // Pas de zone de drag : progression suit le handle
          progressionPercentage = handlePercentage;
        }
        
        // Slider circulaire : position sur le cercle (handle)
        // Convertir le pourcentage en angle (0-360°)
        const handleAngleInDegrees = (handlePercentage / 100) * 360;
        
        // Convertir en radians et ajuster pour commencer en haut (-90°)
        const handleAngleInRadians = ((handleAngleInDegrees - 90) * Math.PI) / 180;
        
        // Obtenir la largeur du border pour calculer le bon rayon
        const trackStyle = window.getComputedStyle(track);
        const borderWidth = parseFloat(trackStyle.borderWidth) || parseFloat(trackStyle.borderTopWidth) || 6;
        
        // Calculer le rayon pour que le handle soit SUR le track
        // Le track a un border, on veut que le handle soit au milieu de ce border
        // Si le conteneur fait 100%, le track intérieur fait 100% - 2*borderWidth
        // Le milieu du border est donc à (100% - borderWidth) / 2
        const borderPercent = (borderWidth / container.offsetWidth) * 100;
        
        // Appliquer l'offset personnalisé
        // handleOffset positif = vers l'extérieur, négatif = vers l'intérieur
        const radiusPercent = 50 - borderPercent + currentHandleOffset;
        
        const x = 50 + radiusPercent * Math.cos(handleAngleInRadians);
        const y = 50 + radiusPercent * Math.sin(handleAngleInRadians);
        
        handle.$({
          css: {
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: '15'  // S'assurer que le handle est au-dessus du track
          }
        });
        
        // Mise à jour du stroke pour l'effet circulaire
        if (track.querySelector('svg')) {
          const progressCircle = track.querySelector('.progress-circle');
          if (progressCircle) {
            const svgRadius = 42; // Radius dans le viewBox SVG
            const circumference = 2 * Math.PI * svgRadius;
            
            if (dragMin !== null || dragMax !== null) {
              // Zone de drag limitée : arc qui grandit depuis dragMin
              const dragRangePercent = (effectiveDragMax - effectiveDragMin) / (max - min);
              const maxDragArcLength = circumference * dragRangePercent;
              const progressArcLength = (progressionPercentage / 100) * maxDragArcLength;
              
              // Décaler le cercle pour que l'arc commence à dragMin
              const dragStartPercent = (effectiveDragMin - min) / (max - min);
              const startAngleOffset = circumference * dragStartPercent;
              
              // L'arc commence à dragMin et grandit selon la progression
              progressCircle.style.strokeDasharray = `${progressArcLength} ${circumference - progressArcLength}`;
              progressCircle.style.strokeDashoffset = -startAngleOffset;
            } else {
              // Pas de zone de drag : comportement normal
              const offset = circumference - (progressionPercentage / 100) * circumference;
              progressCircle.style.strokeDasharray = circumference;
              progressCircle.style.strokeDashoffset = offset;
            }
          }
        } else {
          // Créer le SVG pour l'effet circulaire si pas encore fait
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 100 100');
          svg.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
          pointer-events: none;
          z-index: 2;
        `;
          
          // Cercle de fond (fixe)
          const svgRadius = 42;
          const circumference = 2 * Math.PI * svgRadius;
          const backgroundCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          backgroundCircle.style.cssText = `
          fill: none;
          stroke: #e0e0e0;
          stroke-width: 6;
          opacity: 0.3;
        `;
          backgroundCircle.setAttribute('cx', '50');
          backgroundCircle.setAttribute('cy', '50');
          backgroundCircle.setAttribute('r', svgRadius.toString());
          
          // Cercle de progression - différent selon zone de drag
          const circularProgressionStyles = skin.progression || {};
          const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          progressCircle.classList.add('progress-circle');
          
          if (dragMin !== null || dragMax !== null) {
            // Zone de drag limitée : arc qui grandit depuis dragMin
            const dragRangePercent = (effectiveDragMax - effectiveDragMin) / (max - min);
            const maxDragArcLength = circumference * dragRangePercent;
            const progressArcLength = (progressionPercentage / 100) * maxDragArcLength;
            
            // Décaler le cercle pour que l'arc commence à dragMin
            const dragStartPercent = (effectiveDragMin - min) / (max - min);
            const startAngleOffset = circumference * dragStartPercent;
            
            progressCircle.style.cssText = `
            fill: none;
            stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
            stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
            stroke-dasharray: ${progressArcLength} ${circumference - progressArcLength};
            stroke-dashoffset: ${-startAngleOffset};
            stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
            opacity: ${circularProgressionStyles.opacity || '1'};
          `;
          } else {
            // Pas de zone de drag : comportement normal (cercle complet)
            progressCircle.style.cssText = `
            fill: none;
            stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
            stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
            stroke-dasharray: ${circumference};
            stroke-dashoffset: ${circumference - (progressionPercentage / 100) * circumference};
            stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
            opacity: ${circularProgressionStyles.opacity || '1'};
          `;
          }
          
          progressCircle.setAttribute('cx', '50');
          progressCircle.setAttribute('cy', '50');
          progressCircle.setAttribute('r', svgRadius.toString());
          
          svg.appendChild(backgroundCircle);
          svg.appendChild(progressCircle);
          track.appendChild(svg);
        }
        
      } else {
        // Sliders horizontaux et verticaux - utiliser la plage totale
        const handlePercentage = ((clampedValue - min) / (max - min)) * 100;
        
        if (type === 'vertical') {
          // Slider vertical
          handle.$({
            css: {
              top: `${100 - handlePercentage}%`,
              transform: 'translate(-50%, -50%)'
            }
          });
          
          if (progression) {
            progression.$({
              css: {
                height: `${handlePercentage}%`
              }
            });
          }
          
        } else {
          // Slider horizontal (défaut)
          handle.$({
            css: {
              left: `${handlePercentage}%`,
              transform: 'translate(-50%, -50%)'
            }
          });
          
          if (progression) {
            progression.$({
              css: {
                width: `${handlePercentage}%`
              }
            });
          }
        }
      }
      
      // Mise à jour du label
      if (label) {
        label.$({ text: Math.round(clampedValue).toString() });
      }
      
      currentVal = clampedValue;
    };

    // Fonction de calcul de valeur depuis position
    const getValueFromPosition = (clientX, clientY) => {
      if (isCircular) {
        // Utiliser getBoundingClientRect pour obtenir la position absolue
        const containerRect = container.getBoundingClientRect();
        
        // Centre du conteneur en coordonnées absolues
        const centerX = containerRect.left + containerRect.width / 2;
        const centerY = containerRect.top + containerRect.height / 2;
        
        // Vecteur du centre vers la souris
        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;
        
        // Calcul de l'angle en utilisant atan2
        // atan2(y, x) retourne l'angle en radians entre -PI et PI
        // avec 0 pointant vers la droite (3h sur une horloge)
        let angleRadians = Math.atan2(deltaY, deltaX);
        
        // Convertir en degrés
        let angleDegrees = angleRadians * (180 / Math.PI);
        
        // Ajuster pour que 0° soit en haut (12h) au lieu de droite (3h)
        // On ajoute 90° pour faire la rotation
        angleDegrees = angleDegrees + 90;
        
        // Normaliser entre 0 et 360
        if (angleDegrees < 0) {
          angleDegrees += 360;
        }
        
        // Convertir l'angle en pourcentage (0-1)
        const percentage = angleDegrees / 360;
        
        // Convertir en valeur selon min/max
        const value = min + percentage * (max - min);
        
        // Pour les sliders circulaires, appliquer les limites de drag
        if (isCircular) {
          return Math.max(effectiveDragMin, Math.min(effectiveDragMax, value));
        }
        
        return value;
        
      } else if (type === 'vertical') {
        // Slider vertical - utiliser le rect du track
        const rect = track.getBoundingClientRect();
        const relativeY = clientY - rect.top;
        const percentage = 1 - (relativeY / rect.height);
        return min + Math.max(0, Math.min(1, percentage)) * (max - min);
        
      } else {
        // Slider horizontal - utiliser le rect du track
        const rect = track.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const percentage = relativeX / rect.width;
        return min + Math.max(0, Math.min(1, percentage)) * (max - min);
      }
    };

    // Calcul des zones de drag effectives
    const effectiveDragMin = dragMin !== null ? dragMin : min;
    const effectiveDragMax = dragMax !== null ? dragMax : max;
    
    // Validation des zones de drag
    if (effectiveDragMin < min) {
      console.warn(`dragMin (${effectiveDragMin}) ne peut pas être inférieur à min (${min})`);
    }
    if (effectiveDragMax > max) {
      console.warn(`dragMax (${effectiveDragMax}) ne peut pas être supérieur à max (${max})`);
    }

    // Gestionnaires d'événements
    const handleMouseDown = (e) => {
      if (disabled) return;
      
      isDragging = true;
      const newValue = getValueFromPosition(e.clientX, e.clientY);
      const steppedValue = Math.round(newValue / step) * step;
      
      updatePosition(steppedValue);
      
      if (onInput) onInput(currentVal);
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const newValue = getValueFromPosition(e.clientX, e.clientY);
      const steppedValue = Math.round(newValue / step) * step;
      
      updatePosition(steppedValue);
      
      if (onInput) onInput(currentVal);
      
      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      
      if (onChange) onChange(currentVal);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Support tactile
    const handleTouchStart = (e) => {
      if (disabled) return;
      
      const touch = e.touches[0];
      handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      
      const touch = e.touches[0];
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    };

    const handleTouchEnd = () => {
      handleMouseUp();
    };

    // Ajout des événements
    handle.addEventListener('mousedown', handleMouseDown);
    track.addEventListener('mousedown', handleMouseDown);
    
    handle.addEventListener('touchstart', handleTouchStart, { passive: false });
    track.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    // Position initiale
    updatePosition(currentValue);

    // Méthodes utilitaires spécifiques au slider
    container.setValue = (newValue) => {
      updatePosition(newValue);
      if (onChange) onChange(currentVal);
      return container;
    };

    container.getValue = () => currentVal;

    container.setRange = (newMin, newMax) => {
      min = newMin;
      max = newMax;
      updatePosition(currentVal);
      return container;
    };

    container.setDisabled = (isDisabled) => {
      disabled = isDisabled;
      container.$({
        css: {
          opacity: isDisabled ? '0.6' : '1',
          pointerEvents: isDisabled ? 'none' : 'auto'
        }
      });
      return container;
    };

    container.setHandleOffset = (offset) => {
      if (isCircular) {
        currentHandleOffset = offset;
        updatePosition(currentVal);
      }
      return container;
    };

    container.getHandleOffset = () => currentHandleOffset;

    return container;
  };

  /**
   * 🚀 SQUIRREL.JS FULL BUNDLE
   * Include core + composants principaux
   * Exports tout via window.Squirrel
   */


  // === EXPOSITION GLOBALE ===
  window.$ = $$1;
  window.define = define$1;
  window.observeMutations = observeMutations;
  window.body = document.body;
  window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

  // === EXPOSITION DES COMPOSANTS ===
  window.Squirrel = {
    // Core utilities
    $: $$1,
    define: define$1,
    observeMutations,
    
    // Components
    Menu: createMenu,
    Minimal: createMinimal,
    Template: createTemplate,
    Slider: createSlider,
    
    // Aliases pour compatibilité
    createMenu: createMenu,
    createMinimal: createMinimal,
    createTemplate: createTemplate,
    createSlider: createSlider
  };

  // === ÉVÉNEMENT READY ===
  window.dispatchEvent(new CustomEvent('squirrel:ready'));
  console.log('✅ Squirrel.js Full Bundle loaded');

})();
