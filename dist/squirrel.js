/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * https://github.com/your-org/squirrel
 * 
 * Copyright (c) 2025 Squirrel Team
 * Released under the MIT License
 * Generated: 2025-06-19T13:46:51.941Z
 */
var Squirrel = (function () {
  'use strict';

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
  const $ = (id, props = {}) => {
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
        const child = $(childConfig.id, childConfig);
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
  const define = (id, config) => {
    templateRegistry.set(id, config);
    return config;
  };

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

  // Export par défaut
  var button_builder = {
    create: createButton};

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

  // Export selon la convention standard recommandée
  var badge_builder = {
    create: createBadge};

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

  // Export par défaut
  var tooltip_builder = {
    create: createTooltip
  };

  /**
   * 🚀 SQUIRREL.JS - CLEAN BUNDLE ENTRY
   */


  // Fonction define locale pour éviter les conflits AMD
  function defineTemplate(id, config) {
    if (!window.templateRegistry) {
      window.templateRegistry = new Map();
    }
    window.templateRegistry.set(id, config);
    return config;
  }

  // Fonction pour créer la structure DOM de base (remplace kickstart)
  function createViewElement() {
    if (!document.getElementById('view')) {
      const viewDiv = document.createElement('div');
      viewDiv.id = 'view';
      viewDiv.className = 'atome';
      viewDiv.style.cssText = `
      background: #272727;
      color: lightgray;
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
    `;
      document.body.appendChild(viewDiv);
      console.log('✅ Element #view créé');
    }
  }

  // Initialisation des APIs
  function initSquirrel() {
    window.$ = $;
    window.define = defineTemplate;
    
    // Créer la structure DOM de base
    createViewElement();
    
    // Chargement des composants
    const components = {};
    
    try {
      if (button_builder?.create) {
        components.Button = button_builder.create;
        window.Button = button_builder.create;
      }
      
      if (badge_builder?.create) {
        components.Badge = badge_builder.create;
        window.Badge = badge_builder.create;
      }
      
      if (tooltip_builder?.create) {
        components.Tooltip = tooltip_builder.create;
        window.Tooltip = tooltip_builder.create;
      }
    } catch (error) {
      console.warn('⚠️ Erreur lors du chargement des composants:', error.message);
    }
    
    window.Squirrel = {
      version: '1.0.0',
      ready: true,
      $: $,
      define: defineTemplate,
      components: components,
      ...components
    };
    
    console.log('✅ Squirrel.js loaded with components:', Object.keys(components));
  }

  // Auto-initialisation
  if (typeof window !== 'undefined') {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initSquirrel();
        window.dispatchEvent(new CustomEvent('squirrel:ready', {
          detail: { version: '1.0.0', ready: true }
        }));
      });
    } else {
      initSquirrel();
      // Déclencher l'événement de manière asynchrone
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('squirrel:ready', {
          detail: { version: '1.0.0', ready: true }
        }));
      }, 0);
    }
  }

  var bundleEntry = { initSquirrel };

  return bundleEntry;

})();
