/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * https://github.com/your-org/squirrel
 * 
 * Copyright (c) 2025 Squirrel Team
 * Released under the MIT License
 * Generated: 2025-06-18T19:29:39.837Z
 */
var Squirrel = (function (exports) {
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

  /**
   * 🔌 SQUIRREL PLUGIN MANAGER
   * Système de chargement automatique et dynamique des composants
   */

  class PluginManager {
    constructor() {
      this.plugins = new Map();
      this.loadedPlugins = new Set();
      this.componentsPath = './components/';
      this.registeredComponents = [];
    }

    /**
     * Auto-discovery des composants dans le dossier components
     */
    async discover() {
      // Liste des composants disponibles (générée automatiquement)
      const availableComponents = [
        'List_builder',
        'badge_builder',
        'button_builder',
        'draggable_builder',
        'matrix_builder',
        'menu_builder',
        'slider_builder',
        'table_builder',
        'tooltip_builder',
        'unit_builder'
      ];

      // Enregistrement paresseux de tous les composants
      availableComponents.forEach(componentName => {
        this.registerLazyPlugin(componentName);
      });

      this.registeredComponents = availableComponents;
      return availableComponents;
    }

    /**
     * Enregistrement paresseux d'un plugin (ne charge pas immédiatement)
     */
    registerLazyPlugin(componentName) {
      const pluginName = this.getPluginName(componentName);
      
      this.plugins.set(pluginName, {
        componentFile: componentName,
        loaded: false,
        instance: null,
        loader: () => this.loadComponent(componentName, pluginName)
      });
    }

    /**
     * Transformation du nom de fichier en nom de plugin
     * Ex: "button_builder" -> "Button", "draggable_builder" -> "draggable"
     */
    getPluginName(componentName) {
      const baseName = componentName.replace('_builder', '').replace('.js', '');
      
      // Règle générale : première lettre en majuscule pour tous les composants
      return baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    /**
     * Chargement dynamique d'un composant
     */
    async loadComponent(componentName, pluginName) {
      if (this.loadedPlugins.has(pluginName)) {
  // console.log(`✅ Plugin "${pluginName}" déjà chargé`);
        return this.plugins.get(pluginName);
      }

  // console.log(`🔄 Chargement du plugin "${pluginName}" depuis "${componentName}.js"`);

      try {
        const componentPath = `${this.componentsPath}${componentName}.js`;
        const module = await import(componentPath);
        
        // Exposition globale du composant (gestion spéciale par composant)
        this.exposePlugin(componentName, module, pluginName);
        
        // Mise à jour du plugin
        const plugin = this.plugins.get(pluginName);
        plugin.loaded = true;
        plugin.instance = window[pluginName]; // Utiliser l'instance exposée globalement
        
        this.loadedPlugins.add(pluginName);
        
        // console.log(`✅ Plugin "${pluginName}" chargé et exposé en tant que window.${pluginName}`, typeof window[pluginName]);
        return plugin;
        
      } catch (error) {
        console.error(`❌ Erreur lors du chargement du plugin "${pluginName}":`, error);
        throw error;
      }
    }

    /**
     * Détermine le nom d'export à utiliser et l'adapte si nécessaire
     */
    getExportName(componentName, module) {
      // Cette méthode est maintenant dépréciée, utiliser exposePlugin à la place
      if (module.default) {
        return 'default';
      }
      const exports = Object.keys(module);
      return exports[0] || 'default';
    }

    /**
     * Exposition automatique des plugins selon des conventions standards
     */
    exposePlugin(componentName, module, pluginName) {
  // console.log(`🔧 Exposition automatique du plugin "${pluginName}" depuis "${componentName}"`);
      
      // 🎯 SYSTÈME D'EXPOSITION AUTOMATIQUE PAR CONVENTION
      
      // ⚠️ CAS SPÉCIAUX PRIORITAIRES (avant les conventions)
      // Plus aucun cas spécial - tous les composants suivent les conventions ES6
      
      // Convention 1: module.default.create (structure recommandée)
      if (module.default && typeof module.default.create === 'function') {
        window[pluginName] = module.default.create;
        window[pluginName + 'Styles'] = module.default; // Pour accès aux styles/variantes
        // console.log(`  ✅ window.${pluginName} = module.default.create (convention standard)`);
        
        // Exposition des fonctions utilitaires pour certains composants
        if (componentName === 'draggable_builder') {
          window.makeDraggable = module.makeDraggable;
          window.makeDraggableWithDrop = module.makeDraggableWithDrop;
          window.makeDropZone = module.makeDropZone;
          // console.log(`  ✅ Fonctions utilitaires Draggable exposées`);
        }
        
        if (componentName === 'unit_builder') {
          // Exposer les fonctions utilitaires sur l'objet global Unit
          Object.assign(window[pluginName], {
            deleteUnit: module.deleteUnit,
            deleteUnits: module.deleteUnits,
            selectUnit: module.selectUnit,
            selectUnits: module.selectUnits,
            deselectUnit: module.deselectUnit,
            deselectUnits: module.deselectUnits,
            deselectAllUnits: module.deselectAllUnits,
            getSelectedUnits: module.getSelectedUnits,
            renameUnit: module.renameUnit,
            renameUnits: module.renameUnits,
            connectUnits: module.connectUnits,
            disconnectUnits: module.disconnectUnits,
            getAllConnections: module.getAllConnections,
            getUnit: module.getUnit,
            getAllUnits: module.getAllUnits
          });
          // console.log(`  ✅ Fonctions utilitaires Unit exposées`);
        }
        
        return;
      }
      
      // Convention 2: module.default direct (fonction simple)  
      if (module.default && typeof module.default === 'function') {
        window[pluginName] = module.default;
  // console.log(`  ✅ window.${pluginName} = module.default (fonction directe)`);
        return;
      }
      
      // Convention 3: Fonction avec nom conventionnel (createNom)
      const createFunctionName = `create${pluginName}`;
      if (module[createFunctionName] && typeof module[createFunctionName] === 'function') {
        window[pluginName] = module[createFunctionName];
  // console.log(`  ✅ window.${pluginName} = ${createFunctionName} (convention nommée)`);
        return;
      }
      
      // Convention 4: Recherche de fonction create* 
      const createFunctions = Object.keys(module).filter(key => 
        key.startsWith('create') && typeof module[key] === 'function'
      );
      if (createFunctions.length > 0) {
        window[pluginName] = module[createFunctions[0]];
  // console.log(`  ✅ window.${pluginName} = ${createFunctions[0]} (fonction create trouvée)`);
        return;
      }
      
      // Convention 5: Première fonction exportée
      const functions = Object.keys(module).filter(key => typeof module[key] === 'function');
      if (functions.length > 0) {
        window[pluginName] = module[functions[0]];
  // console.log(`  ✅ window.${pluginName} = ${functions[0]} (première fonction)`);
        return;
      }
      
      // Convention 6: module.default objet (fallback)
      if (module.default) {
        window[pluginName] = module.default;
  // console.log(`  ⚠️ window.${pluginName} = module.default (fallback objet)`);
        return;
      }
      
      // Cas spéciaux - méthode manuelle pour composants complexes
      this.exposePluginManual(componentName, module, pluginName);
    }
    
    /**
     * Exposition manuelle pour cas spéciaux (garde-fou)
     */
    exposePluginManual(componentName, module, pluginName) {
  // console.log(`🔧 Exposition manuelle pour "${pluginName}" (cas spécial)`);
      
      switch (componentName) {
        case 'draggable_builder':
          // Draggable exporte plusieurs fonctions - les exposer toutes
          window.draggable = module.draggable;
          window.makeDraggable = module.makeDraggable;
          window.makeDraggableWithDrop = module.makeDraggableWithDrop;
          window.makeDropZone = module.makeDropZone;
          window.Draggable = module.draggable; // Alias principal
  // console.log('  ✅ Draggable exposé avec toutes ses fonctions');
          break;
          
        // Plus de cas spéciaux - tous les composants utilisent les conventions ES6
        
        default:
          // Dernier fallback absolu
          const firstExport = Object.keys(module)[0];
          if (firstExport) {
            window[pluginName] = module[firstExport];
  // console.log(`  ⚠️ window.${pluginName} = ${firstExport} (dernier fallback)`);
          } else {
            console.warn(`❌ Impossible d'exposer le plugin ${pluginName} automatiquement`);
            console.warn('   Module exports:', Object.keys(module));
          }
          break;
      }
    }

    /**
     * Chargement d'un plugin spécifique
     */
    async load(pluginName) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin "${pluginName}" non trouvé. Plugins disponibles: ${Array.from(this.plugins.keys()).join(', ')}`);
      }

      if (!plugin.loaded) {
        await plugin.loader();
      }

      return plugin.instance;
    }

    /**
     * Chargement de plusieurs plugins
     */
    async loadMultiple(pluginNames) {
      const results = {};
      
      for (const pluginName of pluginNames) {
        try {
          results[pluginName] = await this.load(pluginName);
        } catch (error) {
          console.error(`Erreur lors du chargement de ${pluginName}:`, error);
          results[pluginName] = null;
        }
      }
      
      return results;
    }

    /**
     * Chargement de tous les plugins
     */
    async loadAll() {
      const pluginNames = Array.from(this.plugins.keys());
  // console.log(`🔄 Chargement de tous les plugins: ${pluginNames.join(', ')}`);
      
      return await this.loadMultiple(pluginNames);
    }

    /**
     * Obtenir la liste des plugins disponibles
     */
    getAvailablePlugins() {
      return Array.from(this.plugins.keys());
    }

    /**
     * Obtenir la liste des plugins chargés
     */
    getLoadedPlugins() {
      return Array.from(this.loadedPlugins);
    }

    /**
     * Statut des plugins
     */
    getStatus() {
      const available = this.getAvailablePlugins();
      const loaded = this.getLoadedPlugins();
      
      return {
        available: available.length,
        loaded: loaded.length,
        availableList: available,
        loadedList: loaded,
        pending: available.filter(p => !loaded.includes(p))
      };
    }
    
    /**
     * Chargement synchrone d'un plugin (pour compatibilité avec les proxies)
     * Note: Cette méthode suppose que le plugin est déjà préchargé
     */
    loadSync(pluginName) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        console.error(`❌ Plugin "${pluginName}" non trouvé. Plugins disponibles: ${Array.from(this.plugins.keys()).join(', ')}`);
        return null;
      }

      if (plugin.loaded) {
        // console.log(`✅ Plugin "${pluginName}" déjà chargé (synchrone)`);
        return plugin.instance;
      }

      // Si le plugin n'est pas chargé, on ne peut pas le charger de façon synchrone
      // avec les imports ES6. On va donc forcer un chargement asynchrone immédiat
      console.warn(`⚠️ Tentative de chargement synchrone du plugin "${pluginName}" non préchargé`);
      
      // Chargement asynchrone immédiat (pas vraiment synchrone mais on fait de notre mieux)
      this.load(pluginName).catch(error => {
        console.error(`❌ Erreur chargement synchrone de "${pluginName}":`, error);
      });
      
      return null;
    }
  }

  // Exposition globale pour utilisation directe
  window.PluginManager = PluginManager;

  /**
   * 🎯 SQUIRREL PLUGIN API
   * Interface simple pour l'utilisation conditionnelle des plugins
   */

  class SquirrelPluginAPI {
    constructor(pluginManager) {
      this.pluginManager = pluginManager;
    }

    /**
     * Utilisation conditionnelle de plugins
     * Usage: await Squirrel.use(['Button', 'Slider'])
     */
    async use(pluginNames) {
      if (typeof pluginNames === 'string') {
        pluginNames = [pluginNames];
      }

      // console.log(`🎯 Chargement conditionnel des plugins: ${pluginNames.join(', ')}`);
      
      const results = await this.pluginManager.loadMultiple(pluginNames);
      
      // Retourne les instances chargées
      return results;
    }

    /**
     * Chargement d'un plugin unique avec retour d'instance
     */
    async plugin(pluginName) {
      return await this.pluginManager.load(pluginName);
    }

    /**
     * Vérification si un plugin est disponible
     */
    hasPlugin(pluginName) {
      return this.pluginManager.plugins.has(pluginName);
    }

    /**
     * Vérification si un plugin est chargé
     */
    isPluginLoaded(pluginName) {
      return this.pluginManager.loadedPlugins.has(pluginName);
    }

    /**
     * Liste des plugins disponibles
     */
    getAvailablePlugins() {
      return this.pluginManager.getAvailablePlugins();
    }

    /**
     * Liste des plugins chargés
     */
    getLoadedPlugins() {
      return this.pluginManager.getLoadedPlugins();
    }

    /**
     * Statut complet des plugins
     */
    getPluginStatus() {
      return this.pluginManager.getStatus();
    }

    /**
     * API de création de composants avec chargement automatique
     */
    async create(componentType, ...args) {
      // Chargement automatique du plugin si nécessaire
      await this.use([componentType]);
      
      // Récupération du constructeur depuis window
      const ComponentClass = window[componentType];
      if (!ComponentClass) {
        throw new Error(`Composant "${componentType}" non trouvé après chargement`);
      }

      // Création et retour de l'instance
      return new ComponentClass(...args);
    }

    /**
     * Raccourcis pour les composants les plus utilisés
     */
    async button(...args) {
      return await this.create('Button', ...args);
    }

    async slider(...args) {
      return await this.create('Slider', ...args);
    }

    async matrix(...args) {
      return await this.create('Matrix', ...args);
    }

    async module(...args) {
      return await this.create('Module', ...args);
    }

    async table(...args) {
      return await this.create('Table', ...args);
    }

    async list(...args) {
      return await this.create('List', ...args);
    }

    async menu(...args) {
      return await this.create('Menu', ...args);
    }
  }

  /**
   * 🚀 SQUIRREL.JS - BUNDLE ENTRY POINT (DYNAMIC VERSION)
   * Point d'entrée avec chargement dynamique des composants
   */


  // === IMPORT DYNAMIQUE DES COMPOSANTS ===
  // Auto-discovery des composants disponibles
  async function loadComponents() {
    const componentModules = {};
    
    // Liste des composants détectés automatiquement
    const componentFiles = [
      'List_builder.js',
      'badge_builder.js', 
      'button_builder.js',
      'draggable_builder.js',
      'matrix_builder.js',
      'menu_builder.js',
      'slider_builder.js',
      'table_builder.js',
      'tooltip_builder.js',
      'unit_builder.js'
    ];
    
    // Import dynamique de chaque composant
    for (const file of componentFiles) {
      try {
        const componentName = file.replace('_builder.js', '').replace('.js', '');
        const moduleName = componentName.charAt(0).toUpperCase() + componentName.slice(1) + 'Builder';
        
        const module = await import(`../src/squirrel/components/${file}`);
        componentModules[moduleName] = module;
        
        // console.log(`  ✅ ${moduleName} chargé`);
      } catch (error) {
        console.warn(`  ⚠️ Impossible de charger ${file}:`, error.message);
      }
    }
    
    return componentModules;
  }

  // === INITIALISATION DU FRAMEWORK ===
  async function initSquirrel() {
    // console.log('🔄 Initialisation de Squirrel.js...');
    
    // Exposer les utilitaires de base
    window.$ = $;
    window.define = define;
    window.observeMutations = observeMutations;
    window.body = document.body;
    window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();
    
    // Créer le plugin manager
    const pluginManager = new PluginManager();
    window.pluginManager = pluginManager;
    
    // Créer l'API des plugins
    const pluginAPI = new SquirrelPluginAPI(pluginManager);
    window.Squirrel = pluginAPI;
    
    // === CHARGEMENT DYNAMIQUE DES COMPOSANTS ===
    // console.log('🔍 Chargement des composants...');
    const componentModules = await loadComponents();
    
    // === EXPOSITION AUTOMATIQUE DES COMPOSANTS ===
    Object.entries(componentModules).forEach(([moduleName, module]) => {
      try {
        if (module.default && module.default.create) {
          // Extraire le nom du composant (enlever "Builder")
          const componentName = moduleName.replace('Builder', '');
          
          // Exposer globalement
          window[componentName] = module.default.create;
          window[`${componentName}Styles`] = module.default;
          
          // Pour Draggable, exposer aussi les fonctions supplémentaires
          if (componentName === 'Draggable') {
            window.draggable = module.default.create;
            window.makeDraggable = module.default.makeDraggable;
            window.makeDraggableWithDrop = module.default.makeDraggableWithDrop;
            window.makeDropZone = module.default.makeDropZone;
          }
          
          // Enregistrer dans le plugin manager
          pluginManager.loadedPlugins.add(componentName);
          
          // console.log(`  ✅ ${componentName} exposé globalement`);
        }
      } catch (error) {
        console.warn(`  ⚠️ Erreur lors de l'exposition de ${moduleName}:`, error.message);
      }
    });
    
    // API pour le chargement manuel (pour compatibilité)
    window.loadPlugin = async (pluginName) => {
      // console.log(`✅ Plugin ${pluginName} déjà chargé dans le bundle`);
      return window[pluginName];
    };
    
    // console.log('🎉 Squirrel.js initialisé avec succès!');
    // console.log(`📦 ${Object.keys(componentModules).length} composants chargés`);
    // console.log('🧩 Composants:', Array.from(pluginManager.loadedPlugins));
    
    // Émettre un événement pour signaler que tout est prêt
    window.dispatchEvent(new CustomEvent('squirrel:ready', {
      detail: { 
        version: '1.0.0', 
        components: Array.from(pluginManager.loadedPlugins),
        count: Object.keys(componentModules).length,
        dynamicLoading: true
      }
    }));
  }

  // === AUTO-INITIALISATION ===
  if (typeof window !== 'undefined') {
    // Si on est dans un navigateur, initialiser automatiquement
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSquirrel);
    } else {
      // DOM déjà prêt
      setTimeout(initSquirrel, 0);
    }
  }

  // Export par défaut pour l'utilisation en module
  var bundleEntry = {
    init: initSquirrel,
    loadComponents
  };

  exports.default = bundleEntry;
  exports.initSquirrel = initSquirrel;
  exports.loadComponents = loadComponents;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({});
