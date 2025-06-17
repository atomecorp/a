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
      'unit_builder',
      'waveSurfer_builder'
    ];

    // console.log(`🔍 Découverte de ${availableComponents.length} composants:`, availableComponents);

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
    
    // Cas spéciaux pour garder la casse originale
    if (baseName === 'draggable') {
      return 'draggable'; // Garde en minuscule pour cohérence
    }
    
    // Règle générale : première lettre en majuscule
    return baseName.charAt(0).toUpperCase() + baseName.slice(1);
  }

  /**
   * Auto-discovery des composants dans le dossier components
   */
  async discover() {
    // Liste des composants disponibles (générée automatiquement)
    const availableComponents = [
      'List_builder',
      'button_builder',
      'draggable_builder',
      'matrix_builder',
      'menu_builder',
      'slider_builder',
      'table_builder',
      'unit_builder',
      'waveSurfer_builder'
    ];

    // console.log(`🔍 Découverte de ${availableComponents.length} composants:`, availableComponents);

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

// console.log(`📝 Plugin "${pluginName}" enregistré (lazy loading)`);
  }

  /**
   * Conversion nom de fichier -> nom de plugin
   * Ex: "button_builder" -> "Button"
   */
  getPluginName(componentName) {
    const baseName = componentName.replace('_builder', '').replace('.js', '');
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
      
      console.log(`✅ Plugin "${pluginName}" chargé et exposé en tant que window.${pluginName}`, typeof window[pluginName]);
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
    if (componentName === 'unit_builder') {
      this.exposePluginManual(componentName, module, pluginName);
      return;
    }
    
    // Convention 1: module.default.create (structure recommandée)
    if (module.default && typeof module.default.create === 'function') {
      window[pluginName] = module.default.create;
      window[pluginName + 'Styles'] = module.default; // Pour accès aux styles/variantes
      console.log(`  ✅ window.${pluginName} = module.default.create (convention standard)`);
      
      // Exposition des fonctions utilitaires pour certains composants
      if (componentName === 'draggable_builder') {
        window.makeDraggable = module.makeDraggable;
        window.makeDraggableWithDrop = module.makeDraggableWithDrop;
        window.makeDropZone = module.makeDropZone;
        console.log(`  ✅ Fonctions utilitaires Draggable exposées`);
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
        
      case 'unit_builder':
        // Unit builder - gestion spéciale des variables globales
        if (typeof UnitBuilder !== 'undefined') {
          window.UnitBuilder = UnitBuilder;
          window.Unit = UnitBuilder;
          window.Module = UnitBuilder;
// console.log('  ✅ UnitBuilder exposé depuis variable globale');
        } else if (module.UnitBuilder) {
          window.UnitBuilder = module.UnitBuilder;
          window.Unit = module.UnitBuilder;
          window.Module = module.UnitBuilder;
// console.log('  ✅ UnitBuilder exposé depuis module');
        } else if (window.moduleBuilderInstance) {
          window.UnitBuilder = () => window.moduleBuilderInstance;
          window.Unit = window.UnitBuilder;
          window.Module = window.UnitBuilder;
// console.log('  ✅ UnitBuilder wrapper créé');
        }
        
        // Templates
        if (typeof UnitTemplates !== 'undefined') {
          window.UnitTemplates = UnitTemplates;
          window.ModuleTemplates = UnitTemplates;
        } else if (module.UnitTemplates) {
          window.UnitTemplates = module.UnitTemplates;
          window.ModuleTemplates = module.UnitTemplates;
        }
        break;
        
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

// Export du plugin manager
export default PluginManager;

// Exposition globale pour utilisation directe
window.PluginManager = PluginManager;
