/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * Generated: 2025-06-19T14:04:11.935Z
 */
var Squirrel = (function () {
  'use strict';

  
          // Temporarily disable AMD define to avoid conflicts
          var _define = typeof define !== 'undefined' ? define : undefined;
          if (typeof define === 'function' && define.amd) {
            var define = undefined;
          }
        

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
   * 🔴 Badge Component - Test de l'auto-discovery
   * Composant simple pour tester que le système détecte et expose automatiquement
   * les nouveaux composants sans intervention manuelle.
   */

  // Template pour le badge
  define$1('badge-element', {
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
   * Composant Button skinnable avec HyperSquirrel
   * Chaque élément du bouton est entièrement customisable
   */

  // === DÉFINITION DES TEMPLATES DE BASE ===

  // Template pour le conteneur principal du bouton
  define$1('button-container', {
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
  define$1('button-icon', {
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
  define$1('button-text', {
    tag: 'span',
    class: 'hs-button-text',
    css: {
      fontSize: 'inherit',
      fontWeight: '400',
      lineHeight: '1'
    }
  });

  // Template pour le badge/compteur
  define$1('button-badge', {
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

  // === TEMPLATES POUR DRAGGABLE ===

  // Template pour un élément draggable basique
  define$1('draggable-box', {
    tag: 'div',
    class: 'hs-draggable',
    css: {
      position: 'absolute',
      width: '100px',
      height: '100px',
      backgroundColor: '#3498db',
      border: '2px solid #2980b9',
      borderRadius: '8px',
      cursor: 'grab',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontWeight: 'bold',
      transition: 'box-shadow 0.2s ease'
    }
  });

  // Template pour un handle de drag
  define$1('drag-handle', {
    tag: 'div',
    class: 'hs-drag-handle',
    css: {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      height: '30px',
      backgroundColor: 'rgba(0,0,0,0.1)',
      borderRadius: '8px 8px 0 0',
      cursor: 'grab',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  });

  // Template pour une drop zone
  define$1('drop-zone', {
    tag: 'div',
    class: 'hs-drop-zone',
    css: {
      position: 'relative',
      minHeight: '100px',
      border: '2px dashed #bdc3c7',
      borderRadius: '8px',
      backgroundColor: '#ecf0f1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#7f8c8d',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      margin: '10px'
    }
  });

  // Styles pour les états des drop zones
  define$1('drop-zone-active', {
    css: {
      borderColor: '#3498db',
      backgroundColor: '#ebf3fd',
      color: '#2980b9'
    }
  });

  define$1('drop-zone-hover', {
    css: {
      borderColor: '#27ae60',
      backgroundColor: '#e8f5e8',
      color: '#27ae60',
      transform: 'scale(1.02)'
    }
  });

  define$1('drop-zone-reject', {
    css: {
      borderColor: '#e74c3c',
      backgroundColor: '#fdf2f2',
      color: '#c0392b'
    }
  });

  /**
   * Composant Slider skinnable avec HyperSquirrel
   * Chaque élément du slider est entièrement customisable
   * Support pour sliders horizontaux, verticaux et circulaires
   */

  // === DÉFINITION DES TEMPLATES DE BASE ===

  // Template pour le conteneur principal du slider
  define$1('slider-container', {
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
  define$1('slider-track', {
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
  define$1('slider-progression', {
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
  define$1('slider-handle', {
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
  define$1('slider-label', {
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
  define$1('slider-tick', {
    tag: 'div',
    class: 'hs-slider-tick',
    css: {
      position: 'absolute',
      backgroundColor: '#ccc',
      pointerEvents: 'none'
    }
  });

  /**
   * Composant Tooltip simple pour tester la découverte automatique
   */

  // Template pour le tooltip
  define$1('tooltip-container', {
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
   * Composant Unit Builder avec HyperSquirrel
   * Créer des blocs graphiques draggables connectables entre eux
   */

  // === GESTIONNAIRE GLOBAL DES UNITS ===
  class UnitManager {
    constructor() {
      this.units = new Map();
      this.connections = new Map();
      this.selectedUnits = new Set();
      this.dragState = null;
      this.connectionMode = false;
      this.firstConnector = null;
      this.nextUnitId = 1;
      this.nextConnectorId = 1;
      this.nextConnectionId = 1;
      
      // État pour le drag de connecteurs
      this.connectorDragState = {
        isDragging: false,
        sourceConnector: null,
        dragLine: null
      };
      
      this.setupGlobalListeners();
    }

    setupGlobalListeners() {
      // Désélectionner tout au clic sur le fond
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.unit-container') && !e.target.closest('.unit-connector')) {
          this.deselectAll();
        }
      });
    }

    generateUnitId() {
      return `unit_${this.nextUnitId++}`;
    }

    generateConnectorId() {
      return `connector_${this.nextConnectorId++}`;
    }

    generateConnectionId() {
      return `connection_${this.nextConnectionId++}`;
    }

    registerUnit(unit) {
      this.units.set(unit.id, unit);
    }

    unregisterUnit(unitId) {
      // Supprimer toutes les connexions liées à ce unit
      this.removeAllConnectionsForUnit(unitId);
      this.units.delete(unitId);
      this.selectedUnits.delete(unitId);
    }

    removeAllConnectionsForUnit(unitId) {
      const connectionsToRemove = [];
      this.connections.forEach((connection, connectionId) => {
        if (connection.fromUnit === unitId || connection.toUnit === unitId) {
          connectionsToRemove.push(connectionId);
        }
      });
      connectionsToRemove.forEach(id => this.removeConnection(id));
    }

    selectUnit(unitId) {
      this.selectedUnits.add(unitId);
      const unit = this.units.get(unitId);
      if (unit) {
        unit.element.classList.add('unit-selected');
      }
    }

    deselectUnit(unitId) {
      this.selectedUnits.delete(unitId);
      const unit = this.units.get(unitId);
      if (unit) {
        unit.element.classList.remove('unit-selected');
      }
    }

    deselectAll() {
      this.selectedUnits.forEach(unitId => this.deselectUnit(unitId));
    }

    getSelectedUnits() {
      return Array.from(this.selectedUnits);
    }

    createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
      const connectionId = this.generateConnectionId();
      const connection = {
        id: connectionId,
        fromUnit: fromUnitId,
        fromConnector: fromConnectorId,
        toUnit: toUnitId,
        toConnector: toConnectorId
      };
      
      this.connections.set(connectionId, connection);
      this.renderConnection(connection);
      return connectionId;
    }

    removeConnection(connectionId) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        const connectionElement = document.querySelector(`[data-connection-id="${connectionId}"]`);
        if (connectionElement) {
          connectionElement.remove();
        }
        this.connections.delete(connectionId);
      }
    }

    renderConnection(connection) {
      const fromUnit = this.units.get(connection.fromUnit);
      const toUnit = this.units.get(connection.toUnit);
      
      if (!fromUnit || !toUnit) return;

      const fromConnector = fromUnit.element.querySelector(`[data-connector-id="${connection.fromConnector}"]`);
      const toConnector = toUnit.element.querySelector(`[data-connector-id="${connection.toConnector}"]`);
      
      if (!fromConnector || !toConnector) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('data-connection-id', connection.id);
      line.classList.add('unit-connection-line');
      
      this.updateConnectionPosition(line, fromConnector, toConnector);
      
      // Ajouter la ligne au SVG container (créé s'il n'existe pas)
      let svg = document.querySelector('.unit-connections-svg');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('unit-connections-svg');
        svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;
        document.body.appendChild(svg);
      }
      
      svg.appendChild(line);
    }

    updateConnectionPosition(line, fromConnector, toConnector) {
      const fromRect = fromConnector.getBoundingClientRect();
      const toRect = toConnector.getBoundingClientRect();
      
      const fromX = fromRect.left + fromRect.width / 2;
      const fromY = fromRect.top + fromRect.height / 2;
      const toX = toRect.left + toRect.width / 2;
      const toY = toRect.top + toRect.height / 2;
      
      line.setAttribute('x1', fromX);
      line.setAttribute('y1', fromY);
      line.setAttribute('x2', toX);
      line.setAttribute('y2', toY);
      line.setAttribute('stroke', '#666');
      line.setAttribute('stroke-width', '2');
    }

    updateAllConnections() {
      this.connections.forEach(connection => {
        const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
        if (line) {
          const fromUnit = this.units.get(connection.fromUnit);
          const toUnit = this.units.get(connection.toUnit);
          
          if (fromUnit && toUnit) {
            const fromConnector = fromUnit.element.querySelector(`[data-connector-id="${connection.fromConnector}"]`);
            const toConnector = toUnit.element.querySelector(`[data-connector-id="${connection.toConnector}"]`);
            
            if (fromConnector && toConnector) {
              this.updateConnectionPosition(line, fromConnector, toConnector);
            }
          }
        }
      });
    }

    getAllConnections() {
      return Array.from(this.connections.values());
    }

    handleConnectorClick(unitId, connectorId, connectorType) {
      if (!this.firstConnector) {
        // Premier connecteur sélectionné
        this.firstConnector = { unitId, connectorId, connectorType };
        this.highlightConnector(unitId, connectorId, true);
      } else {
        // Deuxième connecteur sélectionné
        const { unitId: firstUnitId, connectorId: firstConnectorId, connectorType: firstType } = this.firstConnector;
        
        // Vérifier que ce ne sont pas les mêmes connecteurs
        if (firstUnitId !== unitId || firstConnectorId !== connectorId) {
          // Vérifier qu'un est input et l'autre output
          if ((firstType === 'input' && connectorType === 'output') || 
              (firstType === 'output' && connectorType === 'input')) {
            
            // Déterminer fromUnit/fromConnector et toUnit/toConnector
            let fromUnitId, fromConnectorId, toUnitId, toConnectorId;
            if (firstType === 'output') {
              fromUnitId = firstUnitId;
              fromConnectorId = firstConnectorId;
              toUnitId = unitId;
              toConnectorId = connectorId;
            } else {
              fromUnitId = unitId;
              fromConnectorId = connectorId;
              toUnitId = firstUnitId;
              toConnectorId = firstConnectorId;
            }
            
            // Vérifier s'il existe déjà une connexion entre ces connecteurs
            const existingConnection = Array.from(this.connections.values()).find(conn =>
              conn.fromUnit === fromUnitId && 
              conn.fromConnector === fromConnectorId &&
              conn.toUnit === toUnitId && 
              conn.toConnector === toConnectorId
            );
            
            if (existingConnection) {
              // Déconnecter
              this.removeConnection(existingConnection.id);
            } else {
              // Connecter
              this.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
            }
          }
        }
        
        // Reset de la sélection
        this.highlightConnector(firstUnitId, firstConnectorId, false);
        this.firstConnector = null;
      }
    }

    highlightConnector(unitId, connectorId, highlight) {
      const unit = this.units.get(unitId);
      if (unit) {
        const connector = unit.element.querySelector(`[data-connector-id="${connectorId}"]`);
        if (connector) {
          if (highlight) {
            connector.classList.add('connector-selected');
          } else {
            connector.classList.remove('connector-selected');
          }
        }
      }
    }

    // === MÉTHODES POUR LE DRAG DE CONNECTEURS ===

    startConnectorDrag(unitId, connectorId, connectorType, event) {
      event.preventDefault();
      event.stopPropagation();
      
      this.connectorDragState.isDragging = true;
      this.connectorDragState.sourceConnector = { unitId, connectorId, connectorType };
      
      // Créer une ligne temporaire pour visualiser la connexion
      this.createDragLine(event);
      
      // Ajouter les listeners globaux
      document.addEventListener('mousemove', this.handleConnectorDragMove.bind(this));
      document.addEventListener('mouseup', this.handleConnectorDragEnd.bind(this));
    }

    createDragLine(event) {
      // Obtenir ou créer le SVG container
      let svg = document.querySelector('.unit-connections-svg');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('unit-connections-svg');
        svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;
        document.body.appendChild(svg);
      }
      
      // Créer la ligne temporaire
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('unit-drag-line');
      line.setAttribute('stroke', '#007bff');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5,5');
      line.setAttribute('opacity', '0.8');
      
      const sourceConnector = this.getConnectorElement(
        this.connectorDragState.sourceConnector.unitId, 
        this.connectorDragState.sourceConnector.connectorId
      );
      
      if (sourceConnector) {
        const rect = sourceConnector.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;
        
        line.setAttribute('x1', startX);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', event.clientX);
        line.setAttribute('y2', event.clientY);
      }
      
      svg.appendChild(line);
      this.connectorDragState.dragLine = line;
    }

    handleConnectorDragMove(event) {
      if (!this.connectorDragState.isDragging || !this.connectorDragState.dragLine) return;
      
      // Mettre à jour la position de fin de la ligne
      this.connectorDragState.dragLine.setAttribute('x2', event.clientX);
      this.connectorDragState.dragLine.setAttribute('y2', event.clientY);
      
      // Highlight du connecteur cible potentiel
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      if (targetElement && targetElement.classList.contains('unit-connector')) {
        targetElement.getAttribute('data-connector-id');
        const targetConnectorType = targetElement.getAttribute('data-connector-type');
        targetElement.closest('.unit-container').getAttribute('data-unit-id');
        
        // Vérifier si c'est un connecteur valide pour la connexion
        const sourceType = this.connectorDragState.sourceConnector.connectorType;
        if ((sourceType === 'output' && targetConnectorType === 'input') ||
            (sourceType === 'input' && targetConnectorType === 'output')) {
          targetElement.classList.add('connector-drag-hover');
        }
      }
      
      // Supprimer les anciens highlights
      document.querySelectorAll('.connector-drag-hover').forEach(el => {
        if (!el.contains(targetElement)) {
          el.classList.remove('connector-drag-hover');
        }
      });
    }

    handleConnectorDragEnd(event) {
      if (!this.connectorDragState.isDragging) return;
      
      // Supprimer la ligne temporaire
      if (this.connectorDragState.dragLine) {
        this.connectorDragState.dragLine.remove();
      }
      
      // Trouver le connecteur cible
      const targetElement = document.elementFromPoint(event.clientX, event.clientY);
      if (targetElement && targetElement.classList.contains('unit-connector')) {
        const targetConnectorId = targetElement.getAttribute('data-connector-id');
        const targetConnectorType = targetElement.getAttribute('data-connector-type');
        const targetUnitId = targetElement.closest('.unit-container').getAttribute('data-unit-id');
        
        const source = this.connectorDragState.sourceConnector;
        
        // Vérifier si c'est une connexion valide
        if ((source.connectorType === 'output' && targetConnectorType === 'input') ||
            (source.connectorType === 'input' && targetConnectorType === 'output')) {
          
          // Déterminer fromUnit/fromConnector et toUnit/toConnector
          let fromUnitId, fromConnectorId, toUnitId, toConnectorId;
          if (source.connectorType === 'output') {
            fromUnitId = source.unitId;
            fromConnectorId = source.connectorId;
            toUnitId = targetUnitId;
            toConnectorId = targetConnectorId;
          } else {
            fromUnitId = targetUnitId;
            fromConnectorId = targetConnectorId;
            toUnitId = source.unitId;
            toConnectorId = source.connectorId;
          }
          
          // Vérifier s'il existe déjà une connexion
          const existingConnection = Array.from(this.connections.values()).find(conn =>
            conn.fromUnit === fromUnitId && 
            conn.fromConnector === fromConnectorId &&
            conn.toUnit === toUnitId && 
            conn.toConnector === toConnectorId
          );
          
          if (existingConnection) {
            // Déconnecter
            this.removeConnection(existingConnection.id);
          } else {
            // Connecter
            this.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
          }
        }
      }
      
      // Nettoyer
      document.querySelectorAll('.connector-drag-hover').forEach(el => {
        el.classList.remove('connector-drag-hover');
      });
      
      document.removeEventListener('mousemove', this.handleConnectorDragMove.bind(this));
      document.removeEventListener('mouseup', this.handleConnectorDragEnd.bind(this));
      
      this.connectorDragState.isDragging = false;
      this.connectorDragState.sourceConnector = null;
      this.connectorDragState.dragLine = null;
    }

    getConnectorElement(unitId, connectorId) {
      const unit = this.units.get(unitId);
      if (unit) {
        return unit.element.querySelector(`[data-connector-id="${connectorId}"]`);
      }
      return null;
    }
  }

  // Instance globale du gestionnaire
  new UnitManager();

  // === DÉFINITION DES TEMPLATES ===

  // Template pour le conteneur principal du unit
  define$1('unit-container', {
    tag: 'div',
    class: 'unit-container',
    css: {
      position: 'absolute',
      minWidth: '120px',
      minHeight: '80px',
      backgroundColor: '#f8f9fa',
      border: '2px solid #ddd',
      borderRadius: '8px',
      cursor: 'move',
      userSelect: 'none',
      overflow: 'visible',
      zIndex: '100'
    }
  });

  // Template pour l'en-tête du unit
  define$1('unit-header', {
    tag: 'div',
    class: 'unit-header',
    css: {
      backgroundColor: '#e9ecef',
      borderBottom: '1px solid #ddd',
      borderRadius: '6px 6px 0 0',
      padding: '8px 12px',
      fontWeight: 'bold',
      fontSize: '14px',
      color: '#333',
      cursor: 'move'
    }
  });

  // Template pour le nom éditable
  define$1('unit-name', {
    tag: 'span',
    class: 'unit-name',
    css: {
      display: 'block',
      outline: 'none',
      backgroundColor: 'transparent',
      border: 'none'
    }
  });

  // Template pour le corps du unit
  define$1('unit-body', {
    tag: 'div',
    class: 'unit-body',
    css: {
      padding: '8px 12px', // Réduire le padding vertical
      minHeight: '32px', // Réduire la hauteur minimale
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    }
  });

  // Template pour l'icône
  define$1('unit-icon', {
    tag: 'img',
    class: 'unit-icon',
    attrs: { draggable: 'false' },
    css: {
      maxWidth: '32px',
      maxHeight: '32px',
      objectFit: 'contain',
      pointerEvents: 'none'
    }
  });

  // Template pour les connecteurs
  define$1('unit-connector', {
    tag: 'div',
    class: 'unit-connector',
    css: {
      zIndex: '2',
      position: 'absolute',
      width: '12px',
      height: '12px',
      backgroundColor: '#007bff',
      borderRadius: '50%',
      cursor: 'pointer',
      border: '2px solid #fff',
      boxShadow: '0 0 0 1px #007bff'
    }
  });

  // Template pour les connecteurs d'entrée
  define$1('unit-connector-input', {
    tag: 'div',
    class: 'unit-connector unit-connector-input',
    css: {
      position: 'absolute',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      cursor: 'pointer',
      border: '2px solid #fff',
      left: '-8px',
      backgroundColor: '#28a745',
      boxShadow: '0 0 0 1px #28a745'
    }
  });

  // Template pour les connecteurs de sortie
  define$1('unit-connector-output', {
    tag: 'div',
    class: 'unit-connector unit-connector-output',
    css: {
      position: 'absolute',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      cursor: 'pointer',
      border: '2px solid #fff',
      right: '-8px',
      backgroundColor: '#dc3545',
      boxShadow: '0 0 0 1px #dc3545'
    }
  });

  // === CSS GLOBAL ===
  const unitStyles = `
  .unit-selected {
    border-color: #007bff !important;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25) !important;
  }
  
  .unit-name[contenteditable="true"] {
    background-color: rgba(255, 255, 255, 0.9) !important;
    border: none !important;
    border-radius: 3px !important;
    padding: 0 !important;
    outline: none !important;
    box-shadow: inset 0 0 0 1px rgba(0, 123, 255, 0.3) !important;
  }
  
  .connector-selected {
    transform: scale(1.3) !important;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.4) !important;
  }
  
  .unit-connector:hover {
    transform: scale(1.2);
  }
  
  .connector-drag-hover {
    transform: scale(1.4) !important;
    box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.6) !important;
  }
  
  .unit-icon.animated {
    animation: iconPulse 0.3s ease;
  }
  
  @keyframes iconPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
`;

  // Injecter les styles
  if (!document.querySelector('#unit-styles')) {
    const style = document.createElement('style');
    style.id = 'unit-styles';
    style.textContent = unitStyles;
    document.head.appendChild(style);
  }

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
   * 🚀 SQUIRREL.JS - BUNDLE ENTRY POINT
   * Point d'entrée avec initialisation immédiate et simple
   */


  // === ÉTAT GLOBAL ===
  let pluginManager = null;

  // === FONCTION DEFINE LOCALE ===
  const defineTemplate = (id, config) => {
    if (!window.templateRegistry) {
      window.templateRegistry = new Map();
    }
    window.templateRegistry.set(id, config);
    return config;
  };



  // === INITIALISATION IMMÉDIATE DES APIs ===
  function initSquirrelAPIs() {
    // Exposer les utilitaires de base
    window.$ = $$1;
    window.define = defineTemplate;
    window.observeMutations = observeMutations;
    window.body = document.body;
    window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();
    
    // Créer le plugin manager
    pluginManager = new PluginManager();
    window.pluginManager = pluginManager;
    
    // Créer l'API des plugins
    const pluginAPI = new SquirrelPluginAPI(pluginManager);
    window.Squirrel = pluginAPI;
  }

  // === INITIALISATION DOM ===
  function initSquirrelDOM() {
    try {
      runKickstart(); // Utilise le vrai kickstart importé
      window.squirrelDomReady = true;
      
      // Émettre l'événement de compatibilité
      window.dispatchEvent(new CustomEvent('squirrel:ready', {
        detail: { 
          version: '1.0.0', 
          components: Array.from(pluginManager.loadedPlugins),
          domReady: true
        }
      }));
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation DOM:', error);
    }
  }

  // Auto-initialisation
  if (typeof window !== 'undefined') {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initSquirrelAPIs();
        initSquirrelDOM();
      });
    } else {
      initSquirrelAPIs();
      initSquirrelDOM();
    }
  }

  var bundleEntry = {
    initAPIs: initSquirrelAPIs,
    initDOM: initSquirrelDOM,
    loadComponents
  };

  return bundleEntry;

})();
