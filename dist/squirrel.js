/*!
 * Squirrel.js v1.0.0
 * Modern Web Component Framework
 * Generated: 2025-06-19T14:18:18.934Z
 */
var Squirrel = (function (exports) {
  'use strict';

  
          // Create global define function for kickstart compatibility
          if (typeof window.define === 'undefined') {
            window.templateRegistry = window.templateRegistry || new Map();
            window.define = function(id, config) {
              window.templateRegistry.set(id, config);
              return config;
            };
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
    const badge = $$1('badge-element', {
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
    create: createBadge,
    
    // Styles et variantes disponibles pour utilisation avancée
    variants: {
      primary: '#007bff',
      success: '#28a745', 
      warning: '#ffc107',
      danger: '#dc3545',
      info: '#17a2b8',
      light: '#f8f9fa',
      dark: '#343a40'
    }
  };

  var BadgeBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    createBadge: createBadge,
    default: badge_builder
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
    const button = $$1('button-container', {
      id: buttonId,
      css: containerStyles,
      attrs: { disabled },
      onClick: disabled ? undefined : onClick,
      ...otherProps
    });

    // Ajout de l'icône si présente
    if (icon) {
      const iconElement = $$1('button-icon', {
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
      const textElement = $$1('button-text', {
        id: `${buttonId}_text`,
        text,
        css: skin.text || {}
      });
      button.appendChild(textElement);
    }

    // Ajout du badge si présent
    if (badge !== undefined) {
      const badgeElement = $$1('button-badge', {
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
        const badgeElement = $$1('button-badge', {
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

  // === FACTORY FUNCTIONS POUR VARIANTES COMMUNES ===

  const createPrimaryButton = (config) => createButton({ ...config, variant: 'primary' });
  const createSecondaryButton = (config) => createButton({ ...config, variant: 'secondary' });
  const createSuccessButton = (config) => createButton({ ...config, variant: 'success' });
  const createDangerButton = (config) => createButton({ ...config, variant: 'danger' });
  const createWarningButton = (config) => createButton({ ...config, variant: 'warning' });

  const createIconButton = (config) => createButton({ 
    ...config, 
    text: '', 
    skin: { 
      container: { padding: '8px', borderRadius: '50%' },
      ...config.skin 
    }
  });

  const createOutlineButton = (config) => createButton({
    ...config,
    variant: 'outline',
    skin: {
      container: { 
        color: buttonStyles[config.color || 'primary']?.backgroundColor || '#007bff',
        borderColor: buttonStyles[config.color || 'primary']?.backgroundColor || '#007bff'
      },
      ...config.skin
    }
  });

  // === SYSTÈME DE PRESETS ===
  const buttonPresets = {
    materialSwitch: (config = {}) => {
      const baseSkin = {
        container: {
          position: 'relative',
          width: '60px',
          height: '34px',
          padding: '0',
          borderRadius: '17px',
          backgroundColor: '#ccc',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          fontFamily: 'Roboto, Arial, sans-serif',
          fontSize: '0px'
        },
        icon: {
          position: 'absolute',
          left: '2px',
          top: '2px',
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0px',
          transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          transform: 'translateX(0px)'
        }
      };
      return {
        ...config,
        skin: {
          ...baseSkin,
          ...(config.skin || {})
        },
        icon: config.icon || '○',
        text: config.text || 'OFF',
        id: config.id || 'material-toggle',
      };
    }
  };

  // Ajout d'une méthode utilitaire sur Button pour le preset
  function materialSwitch(config) {
    return createButton(buttonPresets.materialSwitch(config));
  }

  // Export par défaut
  var button_builder = {
    create: createButton,
    primary: createPrimaryButton,
    secondary: createSecondaryButton,
    success: createSuccessButton,
    danger: createDangerButton,
    warning: createWarningButton,
    icon: createIconButton,
    outline: createOutlineButton,
    materialSwitch,
  };

  var ButtonBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    buttonSizes: buttonSizes,
    buttonStyles: buttonStyles,
    createButton: createButton,
    createDangerButton: createDangerButton,
    createIconButton: createIconButton,
    createOutlineButton: createOutlineButton,
    createPrimaryButton: createPrimaryButton,
    createSecondaryButton: createSecondaryButton,
    createSuccessButton: createSuccessButton,
    createWarningButton: createWarningButton,
    default: button_builder
  });

  /**
   * Composant Draggable avec HyperSquirrel
   * Rend n'importe quel élément draggable avec des callbacks personnalisables
   */

  // === FONCTION UTILITAIRE DE DRAG & DROP ===

  /**
   * Fonction pour créer des zones de drop
   * @param {HTMLElement|string} element - L'élément ou sélecteur de la drop zone
   * @param {Object} options - Options de configuration
   */
  function makeDropZone(element, options = {}) {
    const {
      onDragEnter = () => {},
      onDragOver = () => {},
      onDragLeave = () => {},
      onDrop = () => {},
      acceptTypes = [], // Types de données acceptées
      hoverClass = 'drop-hover',
      activeClass = 'drop-active',
      acceptClass = 'drop-accept',
      rejectClass = 'drop-reject'
    } = options;

    const dropElement = typeof element === 'string' ? document.querySelector(element) : element;
    if (!dropElement) return;

    let dragCounter = 0; // Pour gérer les événements imbriqués

    const handleDragEnter = (e) => {
      e.preventDefault();
      dragCounter++;
      
      if (dragCounter === 1) {
        dropElement.classList.add(hoverClass);
        onDragEnter(e, dropElement);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver(e, dropElement);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      dragCounter--;
      
      if (dragCounter === 0) {
        dropElement.classList.remove(hoverClass, acceptClass, rejectClass);
        onDragLeave(e, dropElement);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      dragCounter = 0;
      
      dropElement.classList.remove(hoverClass, acceptClass, rejectClass);
      
      // Récupérer les données transférées
      const transferData = {};
      try {
        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
          Object.assign(transferData, JSON.parse(jsonData));
        }
      } catch (err) {
        console.warn('Erreur parsing des données de drop:', err);
      }
      
      // Récupérer les données texte
      transferData.text = e.dataTransfer.getData('text/plain');
      
      onDrop(e, dropElement, transferData);
    };

    // Attacher les événements
    dropElement.addEventListener('dragenter', handleDragEnter);
    dropElement.addEventListener('dragover', handleDragOver);
    dropElement.addEventListener('dragleave', handleDragLeave);
    dropElement.addEventListener('drop', handleDrop);

    // Fonction de nettoyage
    return () => {
      dropElement.removeEventListener('dragenter', handleDragEnter);
      dropElement.removeEventListener('dragover', handleDragOver);
      dropElement.removeEventListener('dragleave', handleDragLeave);
      dropElement.removeEventListener('drop', handleDrop);
      dropElement.classList.remove(hoverClass, activeClass, acceptClass, rejectClass);
    };
  }

  /**
   * Fonction de drag avancée avec support drag & drop HTML5
   * @param {HTMLElement} element - L'élément à rendre draggable
   * @param {Object} options - Options de configuration
   */
  function makeDraggableWithDrop(element, options = {}) {
    const {
      onDragStart = () => {},
      onDragMove = () => {},
      onDragEnd = () => {},
      cursor = 'move',
      constrainToParent = false,
      bounds = null,
      rotationFactor = 0,
      scaleFactor = 0,
      // Nouvelles options pour drag & drop
      enableHTML5 = true,
      transferData = {},
      ghostImage = null,
      dragStartClass = 'dragging',
      onHTML5DragStart = () => {},
      onHTML5DragEnd = () => {},
      onDropDetection = () => {} // Callback pour détecter les zones de drop en mode classique
    } = options;

    // Configuration CSS de base
    element.style.cursor = cursor;
    element.style.userSelect = 'none';
    
    // Activer le drag HTML5 si demandé
    if (enableHTML5) {
      element.draggable = true;
    }

    // Variables pour stocker la position originale et le ghost
    let originalPosition = null;
    let ghostElement = null;
    let isDraggingClassic = false;

    // === DRAG HTML5 ===
    if (enableHTML5) {
      element.addEventListener('dragstart', (e) => {
        if (dragStartClass) element.classList.add(dragStartClass);
        
        // Configurer l'image fantôme
        if (ghostImage) {
          e.dataTransfer.setDragImage(ghostImage, 0, 0);
        }
        
        // Transférer les données
        e.dataTransfer.effectAllowed = 'move';
        if (transferData) {
          e.dataTransfer.setData('application/json', JSON.stringify(transferData));
        }
        e.dataTransfer.setData('text/plain', element.textContent || '');
        
        onHTML5DragStart(e, element);
      });

      element.addEventListener('dragend', (e) => {
        if (dragStartClass) element.classList.remove(dragStartClass);
        onHTML5DragEnd(e, element);
      });
    }

    // === DRAG CLASSIQUE OPTIMISÉ (avec ghost) ===
    const onMouseDown = (e) => {
      // Si HTML5 drag est activé ET que c'est un clic gauche, laisser HTML5 gérer
      if (enableHTML5 && e.button === 0 && e.target.draggable) return;
      
      // Empêcher le comportement par défaut
      e.preventDefault();
      e.stopPropagation();
      
      isDraggingClassic = true;
      
      // Désactiver temporairement les transitions sur l'élément original
      const originalTransition = element.style.transition;
      element.style.transition = 'none';
      
      // Sauvegarder la position originale
      const rect = element.getBoundingClientRect();
      originalPosition = {
        x: rect.left,
        y: rect.top,
        transform: element.style.transform || '',
        transition: originalTransition
      };
      
      // Créer un élément ghost qui suit la souris
      createGhostElement(e.clientX, e.clientY);
      
      // Appliquer la classe de drag à l'original
      if (dragStartClass) element.classList.add(dragStartClass);
      
      const startX = e.clientX;
      const startY = e.clientY;
      
      // Callback de début
      onDragStart(element, startX, startY, 0, 0);

      const onMouseMove = (e) => {
        if (!isDraggingClassic) return;
        
        // Déplacer le ghost, pas l'élément original
        if (ghostElement) {
          ghostElement.style.left = (e.clientX - 30) + 'px'; // Offset pour centrer
          ghostElement.style.top = (e.clientY - 20) + 'px';
        }
        
        // Callback de mouvement
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        onDragMove(element, e.clientX, e.clientY, deltaX, deltaY);
      };

      const onMouseUp = (e) => {
        if (!isDraggingClassic) return;
        
        isDraggingClassic = false;
        
        // Supprimer la classe de drag
        if (dragStartClass) element.classList.remove(dragStartClass);
        
        // Restaurer la transition originale
        if (originalPosition) {
          element.style.transition = originalPosition.transition;
        }
        
        // Détection de drop
        let dropSuccess = false;
        if (onDropDetection) {
          try {
            onDropDetection(element, e.clientX, e.clientY);
            dropSuccess = true;
          } catch (err) {
            // console.log('Pas de zone de drop détectée');
          }
        }
        
        // Nettoyer le ghost
        removeGhostElement();
        
        // Remettre l'élément à sa position originale (il n'a jamais bougé)
        // L'élément reste à sa place, seul le ghost bougeait
        
        // Callback de fin
        onDragEnd(element, e.clientX, e.clientY, e.clientX - startX, e.clientY - startY);

        // Nettoyer les événements
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('mouseleave', onMouseUp);
      };

      // Attacher les événements globalement pour capturer même en dehors de l'élément
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mouseleave', onMouseUp);
    };

    // Fonction pour créer l'élément ghost
    function createGhostElement(x, y) {
      ghostElement = element.cloneNode(true);
      ghostElement.style.position = 'fixed';
      ghostElement.style.left = (x - 30) + 'px';
      ghostElement.style.top = (y - 20) + 'px';
      ghostElement.style.width = element.offsetWidth + 'px';
      ghostElement.style.height = element.offsetHeight + 'px';
      ghostElement.style.opacity = '0.7';
      ghostElement.style.transform = 'scale(0.9) rotate(5deg)';
      ghostElement.style.zIndex = '9999';
      ghostElement.style.pointerEvents = 'none';
      ghostElement.style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)';
      ghostElement.style.borderRadius = '8px';
      ghostElement.style.transition = 'none'; // ← IMPORTANT: Pas de transition sur le ghost
      
      // Ajouter une bordure pour distinguer le ghost
      ghostElement.style.border = '2px solid rgba(255,255,255,0.5)';
      
      document.body.appendChild(ghostElement);
    }
    
    // Fonction pour supprimer l'élément ghost
    function removeGhostElement() {
      if (ghostElement && ghostElement.parentNode) {
        ghostElement.parentNode.removeChild(ghostElement);
        ghostElement = null;
      }
    }

    element.addEventListener('mousedown', onMouseDown);

    // Fonction de nettoyage améliorée
    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.style.cursor = '';
      element.style.userSelect = '';
      element.draggable = false;
      
      // Nettoyer le ghost s'il existe encore
      removeGhostElement();
      
      // Remettre la position originale si nécessaire
      if (originalPosition) {
        element.style.transform = originalPosition.transform;
        element.style.transition = originalPosition.transition;
      }
    };
  }

  // === FONCTION UTILITAIRE DE DRAG ===

  /**
   * Fonction de drag ultra-performante avec transform
   * @param {HTMLElement} element - L'élément à rendre draggable
   * @param {Object} options - Options de configuration
   */
  function makeDraggable(element, options = {}) {
    const {
      onDragStart = () => {},
      onDragMove = () => {},
      onDragEnd = () => {},
      cursor = 'move',
      constrainToParent = false,
      bounds = null,
      rotationFactor = 0,
      scaleFactor = 0
    } = options;

    // Configuration CSS de base
    element.style.cursor = cursor;
    element.style.userSelect = 'none';

    // Variables pour stocker la translation
    let currentX = 0;
    let currentY = 0;

    const onMouseDown = (e) => {
      let isDragging = true;
      let lastX = e.clientX;
      let lastY = e.clientY;

      // Changer le curseur
      const originalCursor = element.style.cursor;
      element.style.cursor = cursor === 'grab' ? 'grabbing' : cursor;

      onDragStart(element, lastX, lastY, currentX, currentY);

      const onMouseMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;

        currentX += deltaX;
        currentY += deltaY;

        // Construire le transform avec les effets demandés
        let transformParts = [`translate(${currentX}px, ${currentY}px)`];

        // Ajouter rotation si demandée
        if (rotationFactor > 0) {
          const totalDeltaX = currentX;
          const totalDeltaY = currentY;
          if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) {
            const rotation = Math.atan2(totalDeltaY, totalDeltaX) * (180 / Math.PI) * rotationFactor;
            transformParts.push(`rotate(${rotation}deg)`);
          }
        }

        // Ajouter scale si demandé
        if (scaleFactor > 0) {
          const distance = Math.sqrt(currentX * currentX + currentY * currentY);
          const scale = 1 + (distance * scaleFactor * 0.001);
          transformParts.push(`scale(${Math.min(scale, 1.5)})`); // Max scale 1.5
        }

        // Appliquer la transformation
        element.style.transform = transformParts.join(' ');

        // Callback de mouvement (peut modifier le transform)
        onDragMove(element, currentX, currentY, deltaX, deltaY);

        // Mettre à jour les positions de référence
        lastX = e.clientX;
        lastY = e.clientY;

        e.preventDefault();
      };

      const onMouseUp = (e) => {
        isDragging = false;
        element.style.cursor = originalCursor;

        onDragEnd(element, currentX, currentY, currentX, currentY);

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('mouseleave', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('mouseleave', onMouseUp);

      e.preventDefault();
    };

    element.addEventListener('mousedown', onMouseDown);

    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.style.cursor = '';
      element.style.userSelect = '';
      element.style.transform = '';
    };
  }

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

  // === BUILDER PRINCIPAL ===

  /**
   * Créer un élément draggable avec template et options
   * @param {string} template - Template à utiliser
   * @param {Object} config - Configuration du draggable
   */
  function draggable(template = 'draggable-box', config = {}) {
    const {
      // Options de création
      content = 'Drag me!',
      css = {},
      attrs = {},
      parent = null,
      
      // Options de drag
      cursor = 'grab',
      rotationFactor = 0,
      scaleFactor = 0,
      constrainToParent = false,
      bounds = null,
      
      // Callbacks
      onDragStart = () => {},
      onDragMove = () => {},
      onDragEnd = () => {},
      
      // Options d'apparence
      dragActiveClass = 'dragging',
      dragHoverShadow = '0 8px 16px rgba(0,0,0,0.2)'
    } = config;

    // Créer l'élément avec le template
    const element = $$1(template, {
      content,
      css,
      attrs,
      parent
    });

    // Rendre l'élément draggable
    const destroyDrag = makeDraggable(element, {
      cursor,
      rotationFactor,
      scaleFactor,
      constrainToParent,
      bounds,
      onDragStart: (el, x, y, currentX, currentY) => {
        if (dragActiveClass) el.classList.add(dragActiveClass);
        if (dragHoverShadow) el.style.boxShadow = dragHoverShadow;
        onDragStart(el, x, y, currentX, currentY);
      },
      onDragMove: (el, currentX, currentY, deltaX, deltaY) => {
        onDragMove(el, currentX, currentY, deltaX, deltaY);
      },
      onDragEnd: (el, endX, endY, totalX, totalY) => {
        if (dragActiveClass) el.classList.remove(dragActiveClass);
        if (dragHoverShadow) el.style.boxShadow = '';
        onDragEnd(el, endX, endY, totalX, totalY);
      }
    });

    // Attacher la fonction de destruction à l'élément
    element.destroyDraggable = destroyDrag;

    return element;
  }

  // Export par défaut conforme aux autres composants
  var draggable_builder = {
    create: draggable,
    makeDraggable,
    makeDraggableWithDrop,
    makeDropZone
  };

  var DraggableBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    default: draggable_builder,
    draggable: draggable,
    makeDraggable: makeDraggable,
    makeDraggableWithDrop: makeDraggableWithDrop,
    makeDropZone: makeDropZone
  });

  /**
   * 🎯 MATRIX COMPONENT - VERSION 2.0 COMPLÈTE
   * Composant Matrix avec gestion d'état granulaire et customisation complète des cellules
   */

  class Matrix {
    constructor(options = {}) {
      // Configuration par défaut
      this.config = {
        id: options.id || `matrix-${Date.now()}`,
        grid: { x: 4, y: 4, ...options.grid },
        size: { width: 400, height: 400, ...options.size },
        position: { x: 0, y: 0, ...options.position },
        spacing: { horizontal: 8, vertical: 8, external: 16, ...options.spacing },
        attach: options.attach || 'body',
        
        // Configuration des cellules
        cells: options.cells || {},
        states: options.states || {},
        containerStyle: options.containerStyle || {},
        
        // Options avancées
        debug: options.debug || false,
        responsive: options.responsive !== false,
        autoResize: options.autoResize !== false,
        maintainAspectRatio: options.maintainAspectRatio || false
      };

      // Stockage interne
      this.cellsMap = new Map();           // Map des cellules avec leurs données
      this.cellStates = new Map();         // États par cellule
      this.cellElements = new Map();       // Éléments DOM par cellule
      this.selectedCells = new Set();      // Cellules sélectionnées

      // Callbacks
      this.callbacks = {
        onCellClick: options.onCellClick || null,
        onCellDoubleClick: options.onCellDoubleClick || null,
        onCellLongClick: options.onCellLongClick || null,
        onCellHover: options.onCellHover || null,
        onCellLeave: options.onCellLeave || null,
        onCellStateChange: options.onCellStateChange || null,
        onSelectionChange: options.onSelectionChange || null,
        onResize: options.onResize || null
      };

      // État interne
      this.container = null;
      this.longClickTimer = null;
      this.resizeObserver = null;
      this.isInitialized = false;

      // Initialisation
      this.init();
    }

    // ========================================
    // 🏗️ INITIALISATION
    // ========================================

    init() {
      try {
        this.createContainer();
        this.createCells();
        this.setupEventListeners();
        this.setupResizeObserver();
        this.applyInitialStates();
        this.isInitialized = true;

        if (this.config.debug) {
  // console.log(`✅ Matrix "${this.config.id}" initialisée avec succès`);
  // console.log(`📊 ${this.config.grid.x}×${this.config.grid.y} = ${this.getTotalCells()} cellules`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors de l'initialisation de Matrix "${this.config.id}":`, error);
      }
    }

    createContainer() {
      // Attachement au DOM
      const attachPoint = typeof this.config.attach === 'string' 
        ? document.querySelector(this.config.attach) 
        : this.config.attach;

      if (!attachPoint) {
        throw new Error(`Point d'attachement "${this.config.attach}" non trouvé`);
      }

      // Création du container principal
      this.container = document.createElement('div');
      this.container.id = this.config.id;
      this.container.className = 'matrix-container';
      
      // Application des styles
      this.applyContainerStyles();
      
      attachPoint.appendChild(this.container);
    }

    applyContainerStyles() {
      const defaultStyles = {
        position: 'absolute',
        left: `${this.config.position.x}px`,
        top: `${this.config.position.y}px`,
        display: 'grid',
        gridTemplateColumns: `repeat(${this.config.grid.x}, 1fr)`,
        gridTemplateRows: `repeat(${this.config.grid.y}, 1fr)`,
        gap: `${this.config.spacing.vertical}px ${this.config.spacing.horizontal}px`,
        background: '#f8f9fa',
        borderRadius: '12px',
        border: '1px solid #dee2e6',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
        boxSizing: 'border-box'
      };

      // Gestion du redimensionnement automatique
      if (this.config.autoResize) {
        // Mode responsive : s'adapte au parent
        Object.assign(defaultStyles, {
          position: 'relative',
          left: 'auto',
          top: 'auto',
          width: '100%',
          height: '100%',
          padding: `${this.config.spacing.external}px`
        });
      } else {
        // Mode taille fixe
        Object.assign(defaultStyles, {
          width: `${this.config.size.width}px`,
          height: `${this.config.size.height}px`,
          padding: `${this.config.spacing.external}px`
        });
      }

      // Fusion avec les styles personnalisés
      const finalStyles = { ...defaultStyles, ...this.config.containerStyle };
      Object.assign(this.container.style, finalStyles);
    }

    createCells() {
      for (let y = 0; y < this.config.grid.y; y++) {
        for (let x = 0; x < this.config.grid.x; x++) {
          this.createCell(x, y);
        }
      }
    }

    createCell(x, y) {
      const cellKey = `${x},${y}`;
      const cellConfig = this.config.cells[cellKey] || {};
      const defaultConfig = this.config.cells.default || {};
      
      // ID de la cellule (personnalisé ou auto-généré)
      const cellId = cellConfig.id || `${this.config.id}-cell-${x}-${y}`;

      // Création de l'élément DOM
      const cellElement = document.createElement('div');
      cellElement.id = cellId;
      cellElement.className = 'matrix-cell';
      cellElement.tabIndex = 0;
      cellElement.setAttribute('data-x', x);
      cellElement.setAttribute('data-y', y);
      cellElement.setAttribute('data-cell-id', cellId);
      cellElement.setAttribute('role', 'button');
      cellElement.setAttribute('aria-label', `Cellule ${x}, ${y}`);

      // Contenu de la cellule
      const content = cellConfig.content || defaultConfig.content || '';
      cellElement.textContent = content;

      // Styles par défaut des cellules
      const defaultCellStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        minHeight: '40px',
        transition: 'all 0.2s ease',
        userSelect: 'none'
      };

      // Application des styles (défaut + personnalisés)
      const cellStyles = { 
        ...defaultCellStyles, 
        ...defaultConfig.style, 
        ...cellConfig.style 
      };
      Object.assign(cellElement.style, cellStyles);

      // Stockage des données de la cellule
      this.cellsMap.set(cellKey, {
        id: cellId,
        x, y,
        content,
        element: cellElement,
        config: cellConfig
      });

      // Stockage de l'élément DOM
      this.cellElements.set(cellKey, cellElement);

      // Initialisation des états
      const initialStates = new Set(['normal']);
      if (cellConfig.states) {
        cellConfig.states.forEach(state => initialStates.add(state));
      }
      this.cellStates.set(cellKey, initialStates);

      // Debug mode
      if (this.config.debug) {
        cellElement.setAttribute('title', `Cellule (${x}, ${y}) - ID: ${cellId}`);
      }

      this.container.appendChild(cellElement);
    }

    applyInitialStates() {
      // Application des styles d'états initiaux
      this.cellStates.forEach((states, cellKey) => {
        states.forEach(stateName => {
          if (stateName !== 'normal' && this.config.states[stateName]) {
            const [x, y] = cellKey.split(',').map(Number);
            this.applyCellStateStyle(x, y, stateName);
          }
        });
      });
    }

    // ========================================
    // 🎯 GESTION DES ÉVÉNEMENTS
    // ========================================

    setupEventListeners() {
      // Event delegation sur le container
      this.container.addEventListener('click', this.handleCellClick.bind(this));
      this.container.addEventListener('dblclick', this.handleCellDoubleClick.bind(this));
      this.container.addEventListener('mousedown', this.handleCellMouseDown.bind(this));
      this.container.addEventListener('mouseup', this.handleCellMouseUp.bind(this));
      this.container.addEventListener('mouseenter', this.handleCellHover.bind(this), true);
      this.container.addEventListener('mouseleave', this.handleCellLeave.bind(this), true);
      this.container.addEventListener('keydown', this.handleCellKeyDown.bind(this));
    }

    handleCellClick(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData) return;

      const { x, y, id, element } = cellData;

      // Callback
      if (this.callbacks.onCellClick) {
        this.callbacks.onCellClick(element, x, y, id, event);
      }
    }

    handleCellDoubleClick(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData) return;

      const { x, y, id, element } = cellData;

      // Callback
      if (this.callbacks.onCellDoubleClick) {
        this.callbacks.onCellDoubleClick(element, x, y, id, event);
      }
    }

    handleCellMouseDown(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData) return;

      const { x, y, id, element } = cellData;

      // Démarrage du timer pour long click
      this.longClickTimer = setTimeout(() => {
        if (this.callbacks.onCellLongClick) {
          this.callbacks.onCellLongClick(element, x, y, id, event);
        }
      }, 500);
    }

    handleCellMouseUp(event) {
      // Annulation du long click
      if (this.longClickTimer) {
        clearTimeout(this.longClickTimer);
        this.longClickTimer = null;
      }
    }

    handleCellHover(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData || !event.target.classList.contains('matrix-cell')) return;

      const { x, y, id, element } = cellData;

      // Application du style hover s'il est défini
      if (this.config.states.hover) {
        this.applyStylesToElement(element, this.config.states.hover, true);
      }

      // Callback
      if (this.callbacks.onCellHover) {
        this.callbacks.onCellHover(element, x, y, id, event);
      }
    }

    handleCellLeave(event) {
      const cellData = this.getCellFromEvent(event);
      if (!cellData || !event.target.classList.contains('matrix-cell')) return;

      const { x, y, id, element } = cellData;

      // Suppression du style hover et réapplication des styles d'états
      this.reapplyCellStyles(x, y);

      // Callback
      if (this.callbacks.onCellLeave) {
        this.callbacks.onCellLeave(element, x, y, id, event);
      }
    }

    handleCellKeyDown(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.handleCellClick(event);
      }
    }

    getCellFromEvent(event) {
      const cellElement = event.target.closest('.matrix-cell');
      if (!cellElement) return null;

      const x = parseInt(cellElement.getAttribute('data-x'));
      const y = parseInt(cellElement.getAttribute('data-y'));
      const id = cellElement.getAttribute('data-cell-id');
      const cellKey = `${x},${y}`;
      const cellData = this.cellsMap.get(cellKey);

      return { x, y, id, element: cellElement, cellData };
    }

    // ========================================
    // 🗂️ GESTION D'ÉTAT DES CELLULES
    // ========================================

    getCellState(x, y) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey);
      if (!states || states.size === 0) return null;
      
      // Retourne l'état principal (le dernier ajouté qui n'est pas 'normal')
      const statesArray = Array.from(states);
      return statesArray.find(state => state !== 'normal') || 'normal';
    }

    getCellStates(x, y) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey);
      return states ? Array.from(states) : [];
    }

    hasCellState(x, y, stateName) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey);
      return states ? states.has(stateName) : false;
    }

    setCellState(x, y, stateName, active = true) {
      const cellKey = `${x},${y}`;
      const states = this.cellStates.get(cellKey) || new Set();
      const cell = this.cellsMap.get(cellKey);

      if (!cell) return;

      const wasActive = states.has(stateName);

      if (active && !wasActive) {
        states.add(stateName);
        this.applyCellStateStyle(x, y, stateName);
      } else if (!active && wasActive) {
        states.delete(stateName);
        this.removeCellStateStyle(x, y, stateName);
      }

      this.cellStates.set(cellKey, states);

      // Gestion de la sélection
      if (stateName === 'selected') {
        if (active) {
          this.selectedCells.add(cellKey);
        } else {
          this.selectedCells.delete(cellKey);
        }
        this.triggerSelectionChange();
      }

      // Callback
      if (this.callbacks.onCellStateChange && wasActive !== active) {
        this.callbacks.onCellStateChange(cell.element, x, y, stateName, active);
      }
    }

    addCellState(x, y, stateName) {
      this.setCellState(x, y, stateName, true);
    }

    removeCellState(x, y, stateName) {
      this.setCellState(x, y, stateName, false);
    }

    toggleCellState(x, y, stateName) {
      const hasState = this.hasCellState(x, y, stateName);
      this.setCellState(x, y, stateName, !hasState);
      return !hasState;
    }

    clearCellStates(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (!cell) return;

      // Retour au style par défaut
      this.resetCellStyle(x, y);
      
      // Réinitialisation avec état normal uniquement
      this.cellStates.set(cellKey, new Set(['normal']));
      
      // Suppression de la sélection
      this.selectedCells.delete(cellKey);
      this.triggerSelectionChange();
    }

    applyCellStateStyle(x, y, stateName) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      const stateStyle = this.config.states[stateName];

      if (cell && stateStyle) {
        // Application des styles avec priorité !important pour éviter les conflits
        this.applyStylesToElement(cell.element, stateStyle, true);
      }
    }

    removeCellStateStyle(x, y, stateName) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (!cell) return;

      // Suppression spécifique des propriétés CSS de cet état
      const stateStyle = this.config.states[stateName];
      if (stateStyle) {
        Object.keys(stateStyle).forEach(property => {
          const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          cell.element.style.removeProperty(cssProp);
        });
      }

      // Réapplication des styles d'états restants
      this.reapplyCellStyles(x, y);
    }

    reapplyCellStyles(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      const states = this.cellStates.get(cellKey);

      if (!cell || !states) return;

      // Reset et réapplication des styles de base
      this.resetCellStyle(x, y);

      // Réapplication des styles d'états actifs avec priorité !important
      states.forEach(stateName => {
        if (stateName !== 'normal' && this.config.states[stateName]) {
          this.applyStylesToElement(cell.element, this.config.states[stateName], true);
        }
      });
    }

    // ========================================
    // 📐 MÉTHODES DE REDIMENSIONNEMENT
    // ========================================

    /**
     * Force un redimensionnement manuel de la matrice
     * @param {number} width - Nouvelle largeur (optionnel)
     * @param {number} height - Nouvelle hauteur (optionnel)
     */
    resize(width, height) {
      if (width !== undefined && height !== undefined) {
        this.config.size.width = width;
        this.config.size.height = height;
        
        if (!this.config.autoResize) {
          this.container.style.width = `${width}px`;
          this.container.style.height = `${height}px`;
        }
      }
      
      this.updateCellSizes();
      
      if (this.config.debug) ;
    }

    /**
     * Active ou désactive le redimensionnement automatique
     * @param {boolean} enabled - Activer ou désactiver
     */
    setAutoResize(enabled) {
      const wasEnabled = this.config.autoResize;
      this.config.autoResize = enabled;

      if (enabled && !wasEnabled) {
        // Activation du redimensionnement automatique
        this.applyContainerStyles();
        this.setupResizeObserver();
      } else if (!enabled && wasEnabled) {
        // Désactivation du redimensionnement automatique
        this.disconnectResizeObserver();
        this.applyContainerStyles();
      }
    }

    /**
     * Déconnecte le ResizeObserver
     */
    disconnectResizeObserver() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
    }

    /**
     * S'adapte à un élément parent spécifique
     * @param {HTMLElement|string} parentElement - Élément parent ou sélecteur
     */
    fitToParent(parentElement) {
      const parent = typeof parentElement === 'string' 
        ? document.querySelector(parentElement) 
        : parentElement;

      if (!parent) {
        console.error('❌ Élément parent non trouvé');
        return;
      }

      // Déplacement vers le nouveau parent
      parent.appendChild(this.container);
      
      // Activation du redimensionnement automatique
      this.setAutoResize(true);
      
      // Force une mise à jour immédiate
      const rect = parent.getBoundingClientRect();
      this.handleResize({ contentRect: rect });
    }

    /**
     * Ajuste automatiquement la taille des cellules en fonction de leur contenu
     * @param {Object} options - Options d'ajustement
     */
    autoSizeCells(options = {}) {
      const { 
        minWidth = 40, 
        minHeight = 40, 
        padding = 8,
        fontSize = null 
      } = options;

      this.cellsMap.forEach((cell, cellKey) => {
        const element = cell.element;
        const content = element.textContent || '';
        
        if (content.length > 0) {
          // Créer un élément temporaire pour mesurer le texte
          const measureEl = document.createElement('div');
          measureEl.style.cssText = `
          position: absolute;
          top: -9999px;
          left: -9999px;
          visibility: hidden;
          white-space: nowrap;
          font-family: ${element.style.fontFamily || 'inherit'};
          font-size: ${fontSize || element.style.fontSize || '14px'};
          font-weight: ${element.style.fontWeight || 'inherit'};
        `;
          measureEl.textContent = content;
          document.body.appendChild(measureEl);
          
          const textWidth = measureEl.offsetWidth;
          const textHeight = measureEl.offsetHeight;
          
          document.body.removeChild(measureEl);
          
          // Appliquer les nouvelles dimensions
          const newWidth = Math.max(textWidth + padding * 2, minWidth);
          const newHeight = Math.max(textHeight + padding * 2, minHeight);
          
          element.style.width = `${newWidth}px`;
          element.style.height = `${newHeight}px`;
        }
      });
      
      if (this.config.debug) ;
    }

    /**
     * Redimensionne la grille pour s'adapter au contenu
     * @param {Object} options - Options de redimensionnement
     */
    fitToContent(options = {}) {
      this.autoSizeCells(options);
      
      // Recalcul de la taille du container
      let maxWidth = 0;
      let maxHeight = 0;
      
      this.cellsMap.forEach((cell) => {
        const rect = cell.element.getBoundingClientRect();
        maxWidth = Math.max(maxWidth, rect.width);
        maxHeight = Math.max(maxHeight, rect.height);
      });
      
      const totalWidth = (maxWidth * this.config.grid.x) + 
                        (this.config.spacing.horizontal * (this.config.grid.x - 1)) + 
                        (this.config.spacing.external * 2);
                        
      const totalHeight = (maxHeight * this.config.grid.y) + 
                         (this.config.spacing.vertical * (this.config.grid.y - 1)) + 
                         (this.config.spacing.external * 2);
      
      this.resize(totalWidth, totalHeight);
    }

    setupResizeObserver() {
      if (!this.config.autoResize || !window.ResizeObserver) return;

      // Observer pour détecter les changements de taille du parent
      this.resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          this.handleResize(entry);
        }
      });

      // Observer le parent du container
      const parent = this.container.parentElement;
      if (parent) {
        this.resizeObserver.observe(parent);
      }
    }

    handleResize(entry) {
      if (!this.config.autoResize) return;

      const { width, height } = entry.contentRect;
      
      if (this.config.debug) ;

      // Mise à jour de la configuration interne
      this.config.size.width = width;
      this.config.size.height = height;

      // Redimensionnement des cellules si nécessaire
      this.updateCellSizes();

      // Callback de redimensionnement si défini
      if (this.callbacks.onResize) {
        this.callbacks.onResize(width, height);
      }
    }

    updateCellSizes() {
      if (!this.config.autoResize) return;

      // Les cellules se redimensionnent automatiquement grâce au CSS Grid
      // Mais on peut ajuster certaines propriétés si nécessaire
      
      const containerRect = this.container.getBoundingClientRect();
      const availableWidth = containerRect.width - (2 * this.config.spacing.external);
      const availableHeight = containerRect.height - (2 * this.config.spacing.external);
      
      const cellWidth = (availableWidth - (this.config.spacing.horizontal * (this.config.grid.x - 1))) / this.config.grid.x;
      const cellHeight = (availableHeight - (this.config.spacing.vertical * (this.config.grid.y - 1))) / this.config.grid.y;

      // Maintien du ratio d'aspect si demandé
      if (this.config.maintainAspectRatio) {
        const minSize = Math.min(cellWidth, cellHeight);
        this.cellsMap.forEach((cell) => {
          cell.element.style.width = `${minSize}px`;
          cell.element.style.height = `${minSize}px`;
        });
      }

      if (this.config.debug) ;
    }
    // ========================================
    // 🎨 UTILITAIRES DE STYLES
    // ========================================

    /**
     * Applique un objet de styles à un élément avec gestion automatique camelCase/kebab-case
     * @param {HTMLElement} element - Élément DOM
     * @param {Object} styles - Objet de styles
     * @param {boolean} important - Utiliser !important
     */
    applyStylesToElement(element, styles, important = false) {
      Object.entries(styles).forEach(([property, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          element.style.setProperty(cssProp, String(value), important ? 'important' : '');
        }
      });
    }

    /**
     * Convertit un nom de propriété camelCase en kebab-case
     * @param {string} camelCase - Propriété en camelCase
     * @returns {string} Propriété en kebab-case
     */
    camelToKebab(camelCase) {
      return camelCase.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    // ========================================
    // 🔍 INTERROGATION GLOBALE
    // ========================================

    getCellsByState(stateName) {
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        if (states.has(stateName)) {
          const [x, y] = cellKey.split(',').map(Number);
          const cell = this.cellsMap.get(cellKey);
          result.push({ x, y, id: cell.id, element: cell.element });
        }
      });

      return result;
    }

    getCellsWithAnyState(stateNames) {
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        const hasAnyState = stateNames.some(stateName => states.has(stateName));
        if (hasAnyState) {
          const [x, y] = cellKey.split(',').map(Number);
          const cell = this.cellsMap.get(cellKey);
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element, 
            states: Array.from(states) 
          });
        }
      });

      return result;
    }

    getCellsWithAllStates(stateNames) {
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        const hasAllStates = stateNames.every(stateName => states.has(stateName));
        if (hasAllStates) {
          const [x, y] = cellKey.split(',').map(Number);
          const cell = this.cellsMap.get(cellKey);
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element, 
            states: Array.from(states) 
          });
        }
      });

      return result;
    }

    getStateCount(stateName) {
      let count = 0;
      this.cellStates.forEach(states => {
        if (states.has(stateName)) count++;
      });
      return count;
    }

    getAllStates() {
      const allStates = new Set();
      this.cellStates.forEach(states => {
        states.forEach(state => allStates.add(state));
      });
      return Array.from(allStates);
    }

    getStateDistribution() {
      const distribution = {};
      this.cellStates.forEach(states => {
        states.forEach(state => {
          distribution[state] = (distribution[state] || 0) + 1;
        });
      });
      return distribution;
    }

    // ========================================
    // 🔍 RECHERCHE AVANCÉE
    // ========================================

    findCells(criteria) {
      const result = [];
      
      this.cellsMap.forEach((cell, cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        let matches = true;

        // Vérification des critères
        if (criteria.state && !this.hasCellState(x, y, criteria.state)) {
          matches = false;
        }
        
        if (criteria.hasContent !== undefined) {
          const hasContent = cell.content && cell.content.trim().length > 0;
          if (criteria.hasContent !== hasContent) {
            matches = false;
          }
        }
        
        if (criteria.position) {
          if (criteria.position.x) {
            if (criteria.position.x.min !== undefined && x < criteria.position.x.min) matches = false;
            if (criteria.position.x.max !== undefined && x > criteria.position.x.max) matches = false;
          }
          if (criteria.position.y) {
            if (criteria.position.y.min !== undefined && y < criteria.position.y.min) matches = false;
            if (criteria.position.y.max !== undefined && y > criteria.position.y.max) matches = false;
          }
        }

        if (matches) {
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element,
            content: cell.content,
            states: this.getCellStates(x, y)
          });
        }
      });

      return result;
    }

    getCellsInRange(x1, y1, x2, y2) {
      const result = [];
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cellKey = `${x},${y}`;
          const cell = this.cellsMap.get(cellKey);
          if (cell) {
            result.push({ 
              x, y, 
              id: cell.id, 
              element: cell.element 
            });
          }
        }
      }

      return result;
    }

    getCellsInRow(rowIndex) {
      const result = [];
      for (let x = 0; x < this.config.grid.x; x++) {
        const cellKey = `${x},${rowIndex}`;
        const cell = this.cellsMap.get(cellKey);
        if (cell) {
          result.push({ 
            x, 
            y: rowIndex, 
            id: cell.id, 
            element: cell.element 
          });
        }
      }
      return result;
    }

    getCellsInColumn(columnIndex) {
      const result = [];
      for (let y = 0; y < this.config.grid.y; y++) {
        const cellKey = `${columnIndex},${y}`;
        const cell = this.cellsMap.get(cellKey);
        if (cell) {
          result.push({ 
            x: columnIndex, 
            y, 
            id: cell.id, 
            element: cell.element 
          });
        }
      }
      return result;
    }

    compareCellStates(x1, y1, x2, y2) {
      const states1 = new Set(this.getCellStates(x1, y1));
      const states2 = new Set(this.getCellStates(x2, y2));
      
      const same = [...states1].every(state => states2.has(state)) && 
                   [...states2].every(state => states1.has(state));
      
      const common = [...states1].filter(state => states2.has(state));
      const different1 = [...states1].filter(state => !states2.has(state));
      const different2 = [...states2].filter(state => !states1.has(state));
      
      return { same, common, different1, different2 };
    }

    findSimilarCells(x, y) {
      const referenceStates = new Set(this.getCellStates(x, y));
      const result = [];
      
      this.cellStates.forEach((states, cellKey) => {
        const [cellX, cellY] = cellKey.split(',').map(Number);
        
        // Skip la cellule de référence
        if (cellX === x && cellY === y) return;
        
        // Vérifier si les états sont identiques
        const same = states.size === referenceStates.size && 
                     [...states].every(state => referenceStates.has(state));
        
        if (same) {
          const cell = this.cellsMap.get(cellKey);
          result.push({ 
            x: cellX, 
            y: cellY, 
            id: cell.id, 
            element: cell.element 
          });
        }
      });
      
      return result;
    }

    groupCellsByState() {
      const groups = {};
      
      this.cellStates.forEach((states, cellKey) => {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        
        states.forEach(stateName => {
          if (!groups[stateName]) {
            groups[stateName] = [];
          }
          groups[stateName].push({ 
            x, y, 
            id: cell.id, 
            element: cell.element 
          });
        });
      });
      
      return groups;
    }

    // ========================================
    // 📝 GESTION DU CONTENU ET STYLES
    // ========================================

    getCellId(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.id : null;
    }

    getCellContent(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.content : null;
    }

    setCellContent(x, y, content) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (cell) {
        cell.content = content;
        cell.element.textContent = content;
      }
    }

    getCellStyle(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.element.style : null;
    }

    setCellStyle(x, y, styles) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (cell) {
        Object.assign(cell.element.style, styles);
      }
    }

    resetCellStyle(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      
      if (cell) {
        // Récupération des styles de base
        const cellConfig = cell.config;
        const defaultConfig = this.config.cells.default || {};
        
        const defaultCellStyles = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          minHeight: '40px',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        };

        const baseStyles = { 
          ...defaultCellStyles, 
          ...defaultConfig.style, 
          ...cellConfig.style 
        };

        // Reset complet du style
        cell.element.removeAttribute('style');
        
        // Réapplication des styles de base avec priorité normale
        this.applyStylesToElement(cell.element, baseStyles, false);
      }
    }

    // ========================================
    // 🎯 GESTION DE LA SÉLECTION
    // ========================================

    getSelectedCells() {
      const result = [];
      this.selectedCells.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({ 
          x, y, 
          id: cell.id, 
          element: cell.element 
        });
      });
      return result;
    }

    clearSelection() {
      const selectedCoords = Array.from(this.selectedCells);
      selectedCoords.forEach(cellKey => {
        const [x, y] = cellKey.split(',').map(Number);
        this.removeCellState(x, y, 'selected');
      });
    }

    triggerSelectionChange() {
      if (this.callbacks.onSelectionChange) {
        this.callbacks.onSelectionChange(this.getSelectedCells());
      }
    }

    // ========================================
    // 📊 UTILITAIRES ET STATISTIQUES
    // ========================================

    getTotalCells() {
      return this.config.grid.x * this.config.grid.y;
    }

    getCell(x, y) {
      const cellKey = `${x},${y}`;
      const cell = this.cellsMap.get(cellKey);
      return cell ? cell.element : null;
    }

    getCellData(x, y) {
      const cellKey = `${x},${y}`;
      return this.cellsMap.get(cellKey);
    }

    // ========================================
    // 🧹 NETTOYAGE
    // ========================================

    destroy() {
      try {
        // Nettoyage des timers
        if (this.longClickTimer) {
          clearTimeout(this.longClickTimer);
          this.longClickTimer = null;
        }

        // Nettoyage du ResizeObserver
        this.disconnectResizeObserver();

        // Suppression des event listeners
        if (this.container) {
          this.container.removeEventListener('click', this.handleCellClick);
          this.container.removeEventListener('dblclick', this.handleCellDoubleClick);
          this.container.removeEventListener('mousedown', this.handleCellMouseDown);
          this.container.removeEventListener('mouseup', this.handleCellMouseUp);
          this.container.removeEventListener('mouseenter', this.handleCellHover);
          this.container.removeEventListener('mouseleave', this.handleCellLeave);
          this.container.removeEventListener('keydown', this.handleCellKeyDown);

          // Suppression du DOM
          if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
          }
        }

        // Nettoyage des Maps
        this.cellsMap.clear();
        this.cellStates.clear();
        this.cellElements.clear();
        this.selectedCells.clear();

        // Reset des callbacks
        this.callbacks = {};

  // console.log(`✅ Matrix "${this.config.id}" détruite avec succès`);
      } catch (error) {
        console.error(`❌ Erreur lors de la destruction de Matrix "${this.config.id}":`, error);
      }
    }
  }

  // Factory functions pour usage simplifié
  function createMatrix(options) {
    return new Matrix(options);
  }

  /**
   * Crée une matrix responsive qui s'adapte à son parent
   * @param {HTMLElement|string} parent - Élément parent ou sélecteur
   * @param {Object} options - Options de configuration
   * @returns {Matrix} Instance de Matrix
   */
  function createResponsiveMatrix(parent, options = {}) {
    const parentElement = typeof parent === 'string' ? document.querySelector(parent) : parent;
    
    if (!parentElement) {
      throw new Error(`Élément parent "${parent}" non trouvé`);
    }
    
    return new Matrix({
      autoResize: true,
      maintainAspectRatio: false,
      attach: parentElement,
      ...options
    });
  }

  /**
   * Crée une matrix avec auto-dimensionnement des cellules
   * @param {Object} options - Options de configuration
   * @returns {Matrix} Instance de Matrix
   */
  function createAutoSizedMatrix(options = {}) {
    const matrix = new Matrix({
      autoResize: false,
      ...options
    });
    
    // Auto-dimensionnement après création
    setTimeout(() => {
      matrix.fitToContent();
    }, 0);
    
    return matrix;
  }

  var MatrixBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    createAutoSizedMatrix: createAutoSizedMatrix,
    createMatrix: createMatrix,
    createResponsiveMatrix: createResponsiveMatrix,
    default: Matrix
  });

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

      if (this.config.debug) ;
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

  var MenuBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    default: Menu
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

  // === SYSTÈME DE PRESETS ===
  const sliderPresets = {
    materialHorizontal: (config = {}) => {
      const baseSkin = {
        container: {
          width: '250px',
          height: '24px',
          padding: '12px 0'
        },
        track: {
          width: '100%',
          height: '4px',
          top: '10px',
          backgroundColor: '#e0e0e0',
          borderRadius: '2px'
        },
        progression: {
          height: '100%',
          backgroundColor: '#1976d2',
          borderRadius: '2px'
        },
        handle: {
          width: '20px',
          height: '20px',
          top: '-8px',
          backgroundColor: '#1976d2',
          border: 'none',
          boxShadow: '0 3px 6px rgba(25, 118, 210, 0.3)'
        },
        label: {
          top: '30px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#1976d2'
        }
      };
      return {
        ...config,
        type: 'horizontal',
        skin: {
          ...baseSkin,
          ...(config.skin || {})
        }
      };
    },

    materialVertical: (config = {}) => {
      const baseSkin = {
        container: {
          width: '24px',
          height: '250px',
          padding: '0 12px'
        },
        track: {
          width: '4px',
          height: '100%',
          left: '10px',
          backgroundColor: '#e0e0e0',
          borderRadius: '2px'
        },
        progression: {
          width: '100%',
          backgroundColor: '#1976d2',
          borderRadius: '2px'
        },
        handle: {
          width: '20px',
          height: '20px',
          left: '-8px',
          backgroundColor: '#1976d2',
          border: 'none',
          boxShadow: '0 3px 6px rgba(25, 118, 210, 0.3)'
        },
        label: {
          left: '30px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#1976d2'
        }
      };
      return {
        ...config,
        type: 'vertical',
        skin: {
          ...baseSkin,
          ...(config.skin || {})
        }
      };
    },

    materialCircular: (config = {}) => {
      const baseSkin = {
        container: {
          width: '140px',
          height: '140px',
          padding: '10px'
        },
        track: {
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          border: '6px solid #e0e0e0',
          backgroundColor: 'transparent'
        },
        handle: {
          width: '24px',
          height: '24px',
          backgroundColor: '#1976d2',
          border: '3px solid #fff',
          boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)'
        },
        label: {
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#1976d2'
        }
      };
      return {
        ...config,
        type: 'circular',
        skin: {
          ...baseSkin,
          ...(config.skin || {})
        }
      };
    }
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
    const container = $$1('slider-container', {
      id: sliderId,
      css: containerStyles,
      ...otherProps
    });

    // Création de la piste
    const track = $$1('slider-track', {
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
      progression = $$1('slider-progression', {
        id: `${sliderId}_progression`,
        css: progressionStyles
      });
      track.appendChild(progression);
    }

    // Création du handle
    const handle = $$1('slider-handle', {
      id: `${sliderId}_handle`,
      css: handleStyles
    });

    // Création du label si demandé
    let label;
    if (showLabel) {
      label = $$1('slider-label', {
        id: `${sliderId}_label`,
        text: currentValue.toString(),
        css: labelStyles
      });
    }

    // Création des graduations si demandées
    if (showTicks && ticks.length > 0) {
      ticks.forEach((tickValue, index) => {
        const tickPosition = ((tickValue - min) / (max - min)) * 100;
        const tick = $$1('slider-tick', {
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

  // === FACTORY FUNCTIONS POUR VARIANTES COMMUNES ===

  const createHorizontalSlider = (config) => createSlider({ ...config, type: 'horizontal' });
  const createVerticalSlider = (config) => createSlider({ ...config, type: 'vertical' });
  const createCircularSlider = (config) => createSlider({ ...config, type: 'circular' });

  const materialHorizontal = (config) => createSlider(sliderPresets.materialHorizontal(config));
  const materialVertical = (config) => createSlider(sliderPresets.materialVertical(config));
  const materialCircular = (config) => createSlider(sliderPresets.materialCircular(config));

  // Export par défaut
  var slider_builder = {
    create: createSlider,
    horizontal: createHorizontalSlider,
    vertical: createVerticalSlider,
    circular: createCircularSlider,
    materialHorizontal,
    materialVertical,
    materialCircular
  };

  var SliderBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    createCircularSlider: createCircularSlider,
    createHorizontalSlider: createHorizontalSlider,
    createSlider: createSlider,
    createVerticalSlider: createVerticalSlider,
    default: slider_builder,
    materialCircular: materialCircular,
    materialHorizontal: materialHorizontal,
    materialVertical: materialVertical,
    sliderPresets: sliderPresets,
    sliderSizes: sliderSizes,
    sliderVariants: sliderVariants
  });

  /**
   * 📊 TABLE COMPONENT - VERSION 1.0 PROFESSIONAL
   * Composant Table avec gestion complète des cellules, styles et fonctionnalités
   */

  class Table {
    constructor(options = {}) {
  // console.log('🏗️ Création du composant Table avec options:', options);
      
      // Configuration par défaut
      this.config = {
        id: options.id || `table-${Date.now()}`,
        position: { x: 0, y: 0, ...options.position },
        size: { width: 800, height: 600, ...options.size },
        attach: options.attach || 'body',
        
        // Colonnes avec configuration complète
        columns: options.columns || [],
        
        // Lignes avec cellules
        rows: options.rows || [],
        
        // Styles personnalisables
        styling: {
          cellPadding: options.styling?.cellPadding ?? 12,
          cellMargin: options.styling?.cellMargin ?? 2,
          rowHeight: options.styling?.rowHeight ?? 40,
          borderSpacing: options.styling?.borderSpacing ?? 0,
          
          headerStyle: {
            backgroundColor: '#343a40',
            color: '#ffffff',
            fontWeight: '600',
            fontSize: '14px',
            padding: '12px',
            ...options.styling?.headerStyle
          },
          
          cellStyle: {
            backgroundColor: '#ffffff',
            color: '#212529',
            fontSize: '13px',
            border: '1px solid #dee2e6',
            padding: '8px 12px',
            ...options.styling?.cellStyle
          },
          
          alternateRowStyle: {
            backgroundColor: '#f8f9fa',
            ...options.styling?.alternateRowStyle
          },
          
          states: {
            hover: {
              backgroundColor: '#e9ecef',
              cursor: 'pointer',
              ...options.styling?.states?.hover
            },
            selected: {
              backgroundColor: '#007bff',
              color: '#ffffff',
              ...options.styling?.states?.selected
            },
            ...options.styling?.states
          },
          
          ...options.styling
        },
        
        // Options fonctionnelles
        options: {
          sortable: options.options?.sortable ?? true,
          selectable: options.options?.selectable ?? true,
          multiSelect: options.options?.multiSelect ?? false,
          resizableColumns: options.options?.resizableColumns ?? true,
          addRows: options.options?.addRows ?? true,
          deleteRows: options.options?.deleteRows ?? true,
          addColumns: options.options?.addColumns ?? true,
          deleteColumns: options.options?.deleteColumns ?? true,
          ...options.options
        },
        
        // Debug
        debug: options.debug || false
      };

      // Stockage interne
      this.cellsMap = new Map();           // Map des cellules avec leurs données
      this.rowsMap = new Map();            // Map des lignes
      this.columnsMap = new Map();         // Map des colonnes
      this.selectedRows = new Set();       // Lignes sélectionnées
      this.selectedCells = new Set();      // Cellules sélectionnées
      this.sortConfig = { column: null, direction: 'asc' };

      // Callbacks
      this.callbacks = {
        onCellClick: options.onCellClick || null,
        onCellEdit: options.onCellEdit || null,
        onRowSelect: options.onRowSelect || null,
        onSort: options.onSort || null,
        onRowAdd: options.onRowAdd || null,
        onRowDelete: options.onRowDelete || null,
        onColumnAdd: options.onColumnAdd || null,
        onColumnDelete: options.onColumnDelete || null
      };

      // État interne
      this.container = null;
      this.tableElement = null;
      this.isInitialized = false;

      // Initialisation
      this.init();
    }

    // ========================================
    // 🏗️ INITIALISATION
    // ========================================

    init() {
      try {
  // console.log(`🚀 Initialisation de la table "${this.config.id}"...`);
        this.createContainer();
        this.createTable();
        this.setupEventListeners();
        this.isInitialized = true;

        if (this.config.debug) {
  // console.log(`✅ Table "${this.config.id}" initialisée avec succès`);
  // console.log(`📊 ${this.config.columns.length} colonnes, ${this.config.rows.length} lignes`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors de l'initialisation de Table "${this.config.id}":`, error);
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
      this.container.className = 'table-container';
      
      this.applyContainerStyles();
      attachPoint.appendChild(this.container);
      
  // console.log(`📦 Container table créé et attaché à "${this.config.attach}"`);
    }

    applyContainerStyles() {
      const defaultStyles = {
        position: 'absolute',
        left: `${this.config.position.x}px`,
        top: `${this.config.position.y}px`,
        width: `${this.config.size.width}px`,
        height: `${this.config.size.height}px`,
        background: '#ffffff',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      };

      Object.assign(this.container.style, defaultStyles);
    }

    createTable() {
      // Créer l'en-tête fixe (div, pas table)
      this.headerContainer = document.createElement('div');
      this.headerContainer.className = 'table-header-container';
      this.headerContainer.style.cssText = `
      display: flex;
      flex-shrink: 0;
      border-bottom: 2px solid #dee2e6;
      background: ${this.config.styling.headerStyle.backgroundColor || '#343a40'};
    `;

      // Créer le conteneur de corps avec scroll
      this.bodyContainer = document.createElement('div');
      this.bodyContainer.className = 'table-body-container';
      this.bodyContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: calc(100% - 50px);
    `;

      // Créer l'en-tête et le corps
      this.createHeader();
      this.createBody();
      
      // Assembler la structure
      this.container.appendChild(this.headerContainer);
      this.container.appendChild(this.bodyContainer);
    }

    createHeader() {
      // Créer les colonnes d'en-tête comme des divs flexibles
      this.config.columns.forEach(column => {
        const headerCell = document.createElement('div');
        headerCell.id = `header-${column.id}`;
        headerCell.className = 'table-header-cell';
        headerCell.textContent = column.header || column.id;
        
        // Style de la cellule d'en-tête
        headerCell.style.cssText = `
        width: ${column.width || 100}px;
        min-width: ${column.width || 100}px;
        max-width: ${column.width || 100}px;
        padding: ${this.config.styling.headerStyle.padding || '12px'};
        font-size: ${this.config.styling.headerStyle.fontSize || '14px'};
        font-weight: ${this.config.styling.headerStyle.fontWeight || '600'};
        color: ${this.config.styling.headerStyle.color || '#ffffff'};
        border-right: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: ${column.style?.textAlign === 'right' ? 'flex-end' : 
                          column.style?.textAlign === 'center' ? 'center' : 'flex-start'};
      `;
        
        // Styles spécifiques à la colonne
        if (column.style) {
          Object.assign(headerCell.style, column.style);
        }
        
        // Ajouter l'indicateur de tri si sortable
        if (this.config.options.sortable && column.sortable !== false) {
          headerCell.style.cursor = 'pointer';
          headerCell.style.userSelect = 'none';
          headerCell.dataset.columnId = column.id;
          headerCell.innerHTML += ' <span class="sort-indicator">⚌</span>';
        }
        
        this.headerContainer.appendChild(headerCell);
        
        // Stocker la colonne
        this.columnsMap.set(column.id, column);
      });
    }

    createBody() {
      this.config.rows.forEach((rowData, rowIndex) => {
        const rowElement = this.createRow(rowData, rowIndex);
        this.bodyContainer.appendChild(rowElement);
      });
    }

    createRow(rowData, rowIndex) {
      const row = document.createElement('div');
      row.id = rowData.id || `row-${rowIndex}`;
      row.className = 'table-row';
      row.style.cssText = `
      display: flex;
      min-height: ${this.config.styling.rowHeight || 40}px;
      border-bottom: 1px solid #e9ecef;
      ${rowIndex % 2 === 1 ? `background-color: ${this.config.styling.alternateRowStyle?.backgroundColor || '#f8f9fa'};` : ''}
    `;
      
      // Style spécifique à la ligne
      if (rowData.style) {
        Object.assign(row.style, rowData.style);
      }
      
      // Créer les cellules
      this.config.columns.forEach(column => {
        const cell = this.createCell(rowData, column, rowIndex);
        row.appendChild(cell);
      });
      
      // Stocker la ligne
      this.rowsMap.set(row.id, rowData);
      
      return row;
    }

    createCell(rowData, column, rowIndex) {
      const cell = document.createElement('div');
      const cellData = rowData.cells[column.id];
      
      // Style de base de la cellule
      cell.style.cssText = `
      width: ${column.width || 100}px;
      min-width: ${column.width || 100}px;
      max-width: ${column.width || 100}px;
      padding: ${this.config.styling.cellStyle.padding || '8px 12px'};
      display: flex;
      align-items: center;
      font-size: ${this.config.styling.cellStyle.fontSize || '13px'};
      color: ${this.config.styling.cellStyle.color || '#212529'};
      background-color: ${this.config.styling.cellStyle.backgroundColor || '#ffffff'};
      border-right: 1px solid #e9ecef;
      justify-content: ${column.style?.textAlign === 'right' ? 'flex-end' : 
                        column.style?.textAlign === 'center' ? 'center' : 'flex-start'};
    `;
      
      if (cellData) {
        // ID de la cellule
        cell.id = cellData.id || `cell-${rowIndex}-${column.id}`;
        cell.textContent = cellData.content || '';
        
        // Style spécifique à la cellule
        if (cellData.style) {
          Object.assign(cell.style, cellData.style);
        }
        
        // Stocker la cellule
        this.cellsMap.set(cell.id, {
          ...cellData,
          rowId: rowData.id || `row-${rowIndex}`,
          columnId: column.id
        });
      }
      
      cell.dataset.rowId = rowData.id || `row-${rowIndex}`;
      cell.dataset.columnId = column.id;
      cell.className = 'table-cell';
      
      return cell;
    }

    setupEventListeners() {
      // Événements de clic sur l'en-tête
      this.headerContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('table-header-cell') && e.target.dataset.columnId) {
          this.handleHeaderClick(e.target, e);
        }
      });

      // Événements de clic sur les cellules du corps
      this.bodyContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('table-cell')) {
          this.handleCellClick(e.target, e);
        }
      });

      // Événements de survol sur les lignes
      this.bodyContainer.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('table-cell')) {
          this.handleCellHover(e.target);
        }
      });

      this.bodyContainer.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('table-cell')) {
          this.handleCellLeave(e.target);
        }
      });
    }

    // ========================================
    // 🎭 GESTION DES ÉVÉNEMENTS
    // ========================================

    handleCellClick(cell, event) {
      const cellData = this.cellsMap.get(cell.id);
      const rowId = cell.dataset.rowId;
      const columnId = cell.dataset.columnId;

      if (this.config.options.selectable) {
        this.toggleCellSelection(cell.id);
      }

      if (this.callbacks.onCellClick) {
        this.callbacks.onCellClick(cellData, rowId, columnId, event);
      }

  // console.log(`📋 Cell clicked: ${cell.id}`);
    }

    handleHeaderClick(header, event) {
      const columnId = header.dataset.columnId;
      
      if (this.config.options.sortable) {
        this.sortByColumn(columnId);
      }
    }

    handleCellHover(cell) {
      // Appliquer l'effet hover à toute la ligne
      const row = cell.parentElement;
      if (row && this.config.styling.states.hover) {
        Object.assign(row.style, this.config.styling.states.hover);
      }
    }

    handleCellLeave(cell) {
      // Restaurer le style original de la ligne
      const row = cell.parentElement;
      if (row) {
        const rowId = row.id;
        const rowData = this.rowsMap.get(rowId);
        const rowIndex = Array.from(this.bodyContainer.children).indexOf(row);
        
        // Réappliquer les styles de base
        row.style.cssText = `
        display: flex;
        min-height: ${this.config.styling.rowHeight || 40}px;
        border-bottom: 1px solid #e9ecef;
        ${rowIndex % 2 === 1 ? `background-color: ${this.config.styling.alternateRowStyle?.backgroundColor || '#f8f9fa'};` : ''}
      `;
        
        // Réappliquer le style spécifique de la ligne s'il existe
        if (rowData && rowData.style) {
          Object.assign(row.style, rowData.style);
        }
      }
    }

    // ========================================
    // 🔧 API PUBLIQUE
    // ========================================

    addRow(rowData) {
      const rowIndex = this.config.rows.length;
      
      this.config.rows.push(rowData);
      const rowElement = this.createRow(rowData, rowIndex);
      this.bodyContainer.appendChild(rowElement);
      
      if (this.callbacks.onRowAdd) {
        this.callbacks.onRowAdd(rowData);
      }
      
      return rowData.id || `row-${rowIndex}`;
    }

    removeRow(rowId) {
      const rowElement = document.getElementById(rowId);
      if (rowElement) {
        rowElement.remove();
        this.rowsMap.delete(rowId);
        this.selectedRows.delete(rowId);
        
        if (this.callbacks.onRowDelete) {
          this.callbacks.onRowDelete(rowId);
        }
      }
    }

    updateCell(rowId, columnId, newContent) {
      const cellId = `cell-${rowId.split('-')[1]}-${columnId}`;
      const cellElement = document.getElementById(cellId);
      const cellData = this.cellsMap.get(cellId);
      
      if (cellElement && cellData) {
        cellElement.textContent = newContent;
        cellData.content = newContent;
        
        if (this.callbacks.onCellEdit) {
          this.callbacks.onCellEdit(cellData, newContent);
        }
      }
    }

    sortByColumn(columnId) {
      const direction = this.sortConfig.column === columnId && this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
      this.sortConfig = { column: columnId, direction };
      
      // Tri des données
      this.config.rows.sort((a, b) => {
        const aVal = a.cells[columnId]?.content || '';
        const bVal = b.cells[columnId]?.content || '';
        
        const comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
        return direction === 'asc' ? comparison : -comparison;
      });
      
      // Reconstruire le tableau
      this.refreshTable();
      
      // Mettre à jour l'indicateur de tri
      this.updateSortIndicators(columnId, direction);
      
      if (this.callbacks.onSort) {
        this.callbacks.onSort(columnId, direction);
      }
    }

    toggleCellSelection(cellId) {
      const cellElement = document.getElementById(cellId);
      
      if (this.selectedCells.has(cellId)) {
        this.selectedCells.delete(cellId);
        this.handleCellLeave(cellElement);
      } else {
        if (!this.config.options.multiSelect) {
          this.clearSelection();
        }
        this.selectedCells.add(cellId);
        Object.assign(cellElement.style, this.config.styling.states.selected);
      }
    }

    clearSelection() {
      this.selectedCells.forEach(cellId => {
        const cellElement = document.getElementById(cellId);
        if (cellElement) {
          this.handleCellLeave(cellElement);
        }
      });
      this.selectedCells.clear();
    }

    refreshTable() {
      // Vider le conteneur de corps
      this.bodyContainer.innerHTML = '';
      
      // Recréer toutes les lignes
      this.config.rows.forEach((rowData, rowIndex) => {
        const rowElement = this.createRow(rowData, rowIndex);
        this.bodyContainer.appendChild(rowElement);
      });
    }

    updateSortIndicators(activeColumn, direction) {
      // Réinitialiser tous les indicateurs
      this.config.columns.forEach(col => {
        const header = document.getElementById(`header-${col.id}`);
        if (header) {
          const indicator = header.querySelector('.sort-indicator');
          if (indicator) {
            indicator.textContent = col.id === activeColumn ? (direction === 'asc' ? '▲' : '▼') : '⚌';
          }
        }
      });
    }

    // Méthodes utilitaires
    exportToCSV() {
      let csv = '';
      
      // En-têtes
      csv += this.config.columns.map(col => col.header || col.id).join(',') + '\n';
      
      // Données
      this.config.rows.forEach(row => {
        const values = this.config.columns.map(col => {
          const cell = row.cells[col.id];
          return cell ? `"${cell.content}"` : '';
        });
        csv += values.join(',') + '\n';
      });
      
      return csv;
    }

    destroy() {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      
      this.cellsMap.clear();
      this.rowsMap.clear();
      this.columnsMap.clear();
      this.selectedRows.clear();
      this.selectedCells.clear();
      
      this.isInitialized = false;
    }
  }

  var TableBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    default: Table
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
    const tooltip = $$1('tooltip-container', {
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

  var TooltipBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    default: tooltip_builder
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
  const unitManager = new UnitManager();

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

  // === CLASSE UNIT ===
  class Unit {
    constructor(options = {}) {
      const {
        id = unitManager.generateUnitId(),
        name = 'Unit',
        position = { x: 100, y: 100 },
        inputs = [],
        outputs = [],
        icon = null,
        iconSrc = null,
        backgroundColor = null
      } = options;

      this.id = id;
      this.name = name;
      this.position = position;
      this.inputs = [];
      this.outputs = [];
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.isEditingName = false;
      this.backgroundColor = backgroundColor;

      this.createElement();
      this.setupDragging();
      this.setupSelection();
      this.setupNameEditing();
      this.setPosition(position.x, position.y);
      
      // Appliquer la couleur de fond si fournie
      if (backgroundColor) {
        this.setBackgroundColor(backgroundColor);
      }
      
      // Ajouter au DOM d'abord
      unitManager.registerUnit(this);
      document.body.appendChild(this.element);
      
      // Puis ajouter les connecteurs
      inputs.forEach(input => this.addInput(input));
      outputs.forEach(output => this.addOutput(output));
      
      // Ajuster la hauteur initiale du module
      this.adjustModuleHeight();
      
      // Ajouter l'icône si fournie
      if (icon || iconSrc) {
        this.setIcon(icon || iconSrc);
      }
    }

    createElement() {
      this.element = $$1('unit-container', {
        attrs: { 'data-unit-id': this.id }
      });

      this.header = $$1('unit-header');
      this.nameElement = $$1('unit-name', { text: this.name });
      this.body = $$1('unit-body');

      this.header.appendChild(this.nameElement);
      this.element.appendChild(this.header);
      this.element.appendChild(this.body);
    }

    setupDragging() {
      let startX, startY, startPosX, startPosY;

      const handleMouseDown = (e) => {
        if (this.isEditingName) return;
        
        this.isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startPosX = this.position.x;
        startPosY = this.position.y;
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
      };

      const handleMouseMove = (e) => {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        this.setPosition(startPosX + deltaX, startPosY + deltaY);
        unitManager.updateAllConnections();
      };

      const handleMouseUp = () => {
        this.isDragging = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      this.header.addEventListener('mousedown', handleMouseDown);
    }

    setupSelection() {
      this.element.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (e.ctrlKey || e.metaKey) {
          // Multi-sélection
          if (unitManager.selectedUnits.has(this.id)) {
            unitManager.deselectUnit(this.id);
          } else {
            unitManager.selectUnit(this.id);
          }
        } else {
          // Sélection simple
          unitManager.deselectAll();
          unitManager.selectUnit(this.id);
        }
      });
    }

    setupNameEditing() {
      this.nameElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startNameEditing();
      });
    }

    startNameEditing() {
      this.isEditingName = true;
      this.nameElement.contentEditable = true;
      this.nameElement.focus();
      
      // Sélectionner tout le texte
      const range = document.createRange();
      range.selectNodeContents(this.nameElement);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const finishEditing = () => {
        this.isEditingName = false;
        this.nameElement.contentEditable = false;
        this.name = this.nameElement.textContent.trim() || 'Unit';
        this.nameElement.textContent = this.name;
      };

      this.nameElement.addEventListener('blur', finishEditing, { once: true });
      this.nameElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.nameElement.blur();
        }
      });
    }

    setPosition(x, y) {
      this.position.x = x;
      this.position.y = y;
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
    }

    setBackgroundColor(color) {
      this.backgroundColor = color;
      if (this.element) {
        this.element.style.backgroundColor = color;
      }
    }

    setIcon(iconData) {
      // Supprimer l'ancienne icône
      const oldIcon = this.body.querySelector('.unit-icon');
      if (oldIcon) {
        oldIcon.remove();
      }

      if (!iconData) return;

      const icon = $$1('unit-icon');
      
      // Désactiver le drag par défaut sur l'image
      icon.draggable = false;
      
      if (iconData.startsWith('data:')) {
        // Base64
        icon.src = iconData;
      } else {
        // URL/Path
        icon.src = iconData;
      }

      this.body.appendChild(icon);
      this.iconElement = icon;
    }

    animateIcon() {
      if (this.iconElement) {
        this.iconElement.classList.add('animated');
        setTimeout(() => {
          this.iconElement.classList.remove('animated');
        }, 300);
      }
    }

    addInput(options = {}) {
      const {
        id = unitManager.generateConnectorId(),
        name = `Input ${this.inputs.length + 1}`,
        color = '#28a745'
      } = options;

      const connector = $$1('unit-connector-input', {
        attrs: { 
          'data-connector-id': id,
          'data-connector-type': 'input',
          'title': name
        }
      });

      if (color) {
        connector.style.backgroundColor = color;
        connector.style.boxShadow = `0 0 0 1px ${color}`;
      }

      // Positionner le connecteur
      const inputIndex = this.inputs.length;
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      connector.style.top = `${startY + inputIndex * spacing}px`;

      connector.addEventListener('click', (e) => {
        e.stopPropagation();
        unitManager.handleConnectorClick(this.id, id, 'input');
      });

      // Ajouter les event listeners pour le drag
      connector.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        unitManager.startConnectorDrag(this.id, id, 'input', e);
      });

      this.element.appendChild(connector);
      this.inputs.push({ id, name, color, element: connector });
      
      // Ajuster la hauteur du module après ajout
      this.adjustModuleHeight();
      
      return id;
    }

    addOutput(options = {}) {
      const {
        id = unitManager.generateConnectorId(),
        name = `Output ${this.outputs.length + 1}`,
        color = '#dc3545'
      } = options;

      const connector = $$1('unit-connector-output', {
        attrs: { 
          'data-connector-id': id,
          'data-connector-type': 'output',
          'title': name
        }
      });

      if (color) {
        connector.style.backgroundColor = color;
        connector.style.boxShadow = `0 0 0 1px ${color}`;
      }

      // Positionner le connecteur
      const outputIndex = this.outputs.length;
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      connector.style.top = `${startY + outputIndex * spacing}px`;

      connector.addEventListener('click', (e) => {
        e.stopPropagation();
        unitManager.handleConnectorClick(this.id, id, 'output');
      });

      // Ajouter les event listeners pour le drag
      connector.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        unitManager.startConnectorDrag(this.id, id, 'output', e);
      });

      this.element.appendChild(connector);
      this.outputs.push({ id, name, color, element: connector });
      
      // Ajuster la hauteur du module après ajout
      this.adjustModuleHeight();
      
      return id;
    }

    removeInput(connectorId) {
      const inputIndex = this.inputs.findIndex(input => input.id === connectorId);
      if (inputIndex !== -1) {
        const input = this.inputs[inputIndex];
        input.element.remove();
        this.inputs.splice(inputIndex, 1);
        
        // Repositionner les connecteurs restants
        this.repositionInputs();
      }
    }

    removeOutput(connectorId) {
      const outputIndex = this.outputs.findIndex(output => output.id === connectorId);
      if (outputIndex !== -1) {
        const output = this.outputs[outputIndex];
        output.element.remove();
        this.outputs.splice(outputIndex, 1);
        
        // Repositionner les connecteurs restants
        this.repositionOutputs();
      }
    }

    repositionInputs() {
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      this.inputs.forEach((input, index) => {
        input.element.style.top = `${startY + index * spacing}px`;
      });
      
      // Ajuster la hauteur du module après repositionnement
      this.adjustModuleHeight();
    }

    repositionOutputs() {
      const spacing = 20;
      const headerHeight = 35; // Hauteur du header
      const bodyPaddingTop = 8; // Padding top du body
      const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
      const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
      this.outputs.forEach((output, index) => {
        output.element.style.top = `${startY + index * spacing}px`;
      });
      
      // Ajuster la hauteur du module après repositionnement
      this.adjustModuleHeight();
    }

    // Nouvelle méthode pour ajuster automatiquement la hauteur du module
    adjustModuleHeight() {
      const connectorSpacing = 20;
      const headerHeight = 35; // Hauteur réduite du header
      const bodyPadding = 16; // Padding réduit top + bottom du body
      const minBodyHeight = 32; // Hauteur minimale réduite du body
      const extraMargin = 8; // Marge réduite pour l'esthétique
      
      // Calculer le nombre maximum de connecteurs sur un côté
      const maxConnectors = Math.max(this.inputs.length, this.outputs.length);
      
      if (maxConnectors === 0) {
        // Pas de connecteurs, utiliser une hauteur minimale réduite
        this.element.style.height = 'auto';
        this.element.style.minHeight = '60px';
        return;
      }
      
      // Calculer la hauteur nécessaire pour tous les connecteurs
      const connectorsHeight = Math.max(1, maxConnectors) * connectorSpacing; // Supprimer le +10 pour startY
      const requiredBodyHeight = Math.max(minBodyHeight, connectorsHeight);
      const totalHeight = headerHeight + requiredBodyHeight + bodyPadding + extraMargin;
      
      // Appliquer la nouvelle hauteur
      this.element.style.height = `${totalHeight}px`;
      this.element.style.minHeight = `${totalHeight}px`;
      
      // Optionnel: Log pour debug
      console.log(`📏 Unit ${this.name}: ${maxConnectors} connecteurs max → hauteur ${totalHeight}px`);
    }

    select() {
      unitManager.selectUnit(this.id);
    }

    deselect() {
      unitManager.deselectUnit(this.id);
    }

    rename(newName) {
      this.name = newName;
      this.nameElement.textContent = newName;
    }

    destroy() {
      unitManager.unregisterUnit(this.id);
      this.element.remove();
    }

    // Events
    onClick() {
      this.animateIcon();
    }

    onLongClick() {
      this.animateIcon();
    }
  }

  // === FONCTIONS UTILITAIRES DE L'API ===

  function createUnit(options) {
    return new Unit(options);
  }

  function deleteUnit(unitId) {
    const unit = unitManager.units.get(unitId);
    if (unit) {
      unit.destroy();
    }
  }

  function deleteUnits(unitIds) {
    unitIds.forEach(id => deleteUnit(id));
  }

  function selectUnit(unitId) {
    unitManager.selectUnit(unitId);
  }

  function selectUnits(unitIds) {
    unitIds.forEach(id => selectUnit(id));
  }

  function deselectUnit(unitId) {
    unitManager.deselectUnit(unitId);
  }

  function deselectUnits(unitIds) {
    unitIds.forEach(id => deselectUnit(id));
  }

  function deselectAllUnits() {
    unitManager.deselectAll();
  }

  function getSelectedUnits() {
    return unitManager.getSelectedUnits();
  }

  function renameUnit(unitId, newName) {
    const unit = unitManager.units.get(unitId);
    if (unit) {
      unit.rename(newName);
    }
  }

  function renameUnits(unitIds, newName) {
    unitIds.forEach(id => renameUnit(id, newName));
  }

  function connectUnits(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
    return unitManager.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
  }

  function disconnectUnits(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
    const connectionToRemove = Array.from(unitManager.connections.values()).find(conn =>
      conn.fromUnit === fromUnitId && 
      conn.fromConnector === fromConnectorId &&
      conn.toUnit === toUnitId && 
      conn.toConnector === toConnectorId
    );
    
    if (connectionToRemove) {
      unitManager.removeConnection(connectionToRemove.id);
    }
  }

  function getAllConnections() {
    return unitManager.getAllConnections();
  }

  function getUnit(unitId) {
    return unitManager.units.get(unitId);
  }

  function getAllUnits() {
    return Array.from(unitManager.units.values());
  }

  // === EXPORT ===
  var unit_builder = {
    create: createUnit
  };

  var UnitBuilder = /*#__PURE__*/Object.freeze({
    __proto__: null,
    connectUnits: connectUnits,
    createUnit: createUnit,
    default: unit_builder,
    deleteUnit: deleteUnit,
    deleteUnits: deleteUnits,
    deselectAllUnits: deselectAllUnits,
    deselectUnit: deselectUnit,
    deselectUnits: deselectUnits,
    disconnectUnits: disconnectUnits,
    getAllConnections: getAllConnections,
    getAllUnits: getAllUnits,
    getSelectedUnits: getSelectedUnits,
    getUnit: getUnit,
    renameUnit: renameUnit,
    renameUnits: renameUnits,
    selectUnit: selectUnit,
    selectUnits: selectUnits,
    unitManager: unitManager
  });

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
   * 🚀 SQUIRREL.JS - CDN BUNDLE ENTRY POINT
   * Static imports version for IIFE bundling
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

    // Pre-register all components
    const components = {
      badge_builder: BadgeBuilder,
      button_builder: ButtonBuilder,
      draggable_builder: DraggableBuilder,
      matrix_builder: MatrixBuilder,
      menu_builder: MenuBuilder,
      slider_builder: SliderBuilder,
      table_builder: TableBuilder,
      tooltip_builder: TooltipBuilder,
      unit_builder: UnitBuilder
    };

    // Register all components with the plugin manager
    Object.entries(components).forEach(([name, component]) => {
      if (component && typeof component === 'object') {
        pluginManager.registerPlugin(name, component);
      }
    });
  }

  // === INITIALISATION DOM ===
  function initSquirrelDOM() {
    try {
      window.squirrelDomReady = true;
      
      // Émettre l'événement de compatibilité
      window.dispatchEvent(new CustomEvent('squirrel:ready', {
        detail: { 
          version: '1.0.0', 
          components: pluginManager ? Array.from(pluginManager.getLoadedPlugins()) : [],
          domReady: true
        }
      }));
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation DOM:', error);
    }
  }

  // === AUTO-INITIALISATION ===
  if (typeof window !== 'undefined') {
    // ÉTAPE 1: Initialiser les APIs immédiatement
    initSquirrelAPIs();
    
    // ÉTAPE 2: Initialiser le DOM dès que body est disponible
    if (document.body) {
      // Body disponible, initialiser immédiatement
      initSquirrelDOM();
    } else {
      // Attendre le body
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSquirrelDOM);
      } else {
        setTimeout(initSquirrelDOM, 0);
      }
    }
  }

  // === EXPOSITION DES APIs CORE ===
  function exposeCorAPIs() {
    // Replace temporary functions with real ones
    window.$ = $$1;
    window.define = define$1;
    window.observeMutations = observeMutations;
  }

  // Appel de la fonction pour exposer les APIs core
  exposeCorAPIs();

  // Export for module compatibility
  const squirrelBundleInfo = {
    ready: true,
    version: '1.0.0',
    components: [
      'badge_builder',
      'button_builder', 
      'draggable_builder',
      'matrix_builder',
      'menu_builder',
      'slider_builder',
      'table_builder',
      'tooltip_builder',
      'unit_builder'
    ]
  };

  var bundleEntryCdn = {
    initAPIs: initSquirrelAPIs,
    initDOM: initSquirrelDOM,
    version: '1.0.0'
  };

  exports.default = bundleEntryCdn;
  exports.squirrelBundleInfo = squirrelBundleInfo;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({});
