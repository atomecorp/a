/* 🐿️ Squirrel.js Core-Only v1.0.0 - https://github.com/atomecorp/a */
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

  /**
   * 🚀 SQUIRREL.JS CORE BUNDLE
   * Core uniquement, sans composants, sans kickstart
   * Léger et rapide pour usage avec imports explicites
   */


  // === EXPOSITION GLOBALE ===
  window.$ = $;
  window.define = define;
  window.observeMutations = observeMutations;
  window.body = document.body;
  window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

  // === CORE UTILITIES OBJECT ===
  window.Squirrel = {
    $,
    define,
    observeMutations,
    version: '1.0.0'
  };

  console.log('✅ Squirrel.js Core loaded - Use explicit imports for components');

  // === PAS D'ÉVÉNEMENT READY POUR LE CORE ===
  // Le bundle core est pour usage avancé sans kickstart

})();
