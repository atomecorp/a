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
      'button_builder', 
      'draggable_builder',
      'matrix_builder',
      'menu_builder',
      'module_builder',
      'slider_builder',
      'table_builder',
      'waveSurfer_builder'
    ];

    console.log(`🔍 Découverte de ${availableComponents.length} composants:`, availableComponents);

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

    console.log(`📝 Plugin "${pluginName}" enregistré (lazy loading)`);
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
      console.log(`✅ Plugin "${pluginName}" déjà chargé`);
      return this.plugins.get(pluginName);
    }

    console.log(`🔄 Chargement du plugin "${pluginName}" depuis "${componentName}.js"`);

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
      
      console.log(`✅ Plugin "${pluginName}" chargé et exposé en tant que window.${pluginName}`);
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
   * Exposition intelligente des plugins selon leur structure
   */
  exposePlugin(componentName, module, pluginName) {
    console.log(`🔧 Exposition du plugin "${pluginName}" depuis "${componentName}"`);
    
    switch (componentName) {
      case 'button_builder':
        // Button exporte un objet avec des méthodes
        const buttonExports = module.default;
        window.Button = buttonExports.create; // Fonction principale
        window.ButtonStyles = buttonExports; // Objet complet pour styles avancés
        console.log('  → window.Button = create function');
        console.log('  → window.ButtonStyles = full object');
        break;
        
      case 'slider_builder':
        // Slider - vérifier la structure
        if (module.default && typeof module.default === 'function') {
          window.Slider = module.default;
          console.log('  → window.Slider = default function');
        } else if (module.default && module.default.create) {
          window.Slider = module.default.create;
          window.SliderStyles = module.default;
          console.log('  → window.Slider = create function');
        } else if (module.default) {
          window.Slider = module.default;
          console.log('  → window.Slider = default object');
        }
        break;
        
      case 'module_builder':
        // Module builder exporte ModuleBuilder et templates via des variables globales
        // Vérifier si ModuleBuilder est disponible dans le scope global après import
        if (typeof ModuleBuilder !== 'undefined') {
          window.ModuleBuilder = ModuleBuilder;
          window.Module = ModuleBuilder; // Alias simple
          console.log('  → window.ModuleBuilder = constructor (global)');
          console.log('  → window.Module = alias');
        } else if (module.ModuleBuilder) {
          window.ModuleBuilder = module.ModuleBuilder;
          window.Module = module.ModuleBuilder; // Alias simple
          console.log('  → window.ModuleBuilder = constructor (export)');
          console.log('  → window.Module = alias');
        } else {
          // Le module s'expose automatiquement via $ et window.moduleBuilderInstance
          console.log('  → Module s\'expose automatiquement via $ et window.moduleBuilderInstance');
          
          // Essayer de récupérer ModuleBuilder du module importé
          const moduleKeys = Object.keys(module);
          console.log('  → Keys du module:', moduleKeys);
          
          // Chercher une classe qui ressemble à ModuleBuilder
          for (const key of moduleKeys) {
            if (typeof module[key] === 'function' && module[key].name === 'ModuleBuilder') {
              window.ModuleBuilder = module[key];
              window.Module = module[key];
              console.log(`  → window.ModuleBuilder = ${key} (trouvé par inspection)`);
              break;
            }
          }
          
          // Si toujours pas trouvé, créer un wrapper
          if (!window.ModuleBuilder && window.moduleBuilderInstance) {
            window.ModuleBuilder = function() {
              return window.moduleBuilderInstance;
            };
            window.Module = window.ModuleBuilder;
            console.log('  → window.ModuleBuilder = wrapper vers instance globale');
          }
        }
        if (typeof ModuleTemplates !== 'undefined') {
          window.ModuleTemplates = ModuleTemplates;
          console.log('  → window.ModuleTemplates = templates (global)');
        } else if (module.ModuleTemplates) {
          window.ModuleTemplates = module.ModuleTemplates;
          console.log('  → window.ModuleTemplates = templates (export)');
        }
        break;
        
      case 'draggable_builder':
        // Draggable exporte plusieurs fonctions
        window.draggable = module.draggable;
        window.makeDraggable = module.makeDraggable;
        window.Draggable = module.draggable; // Alias principal
        console.log('  → window.draggable = function');
        console.log('  → window.makeDraggable = function');
        break;
        
      case 'matrix_builder':
      case 'table_builder':
      case 'menu_builder':
      case 'List_builder':
      case 'waveSurfer_builder':
        // Pour les autres, utiliser l'export par défaut
        if (module.default) {
          if (typeof module.default === 'function') {
            window[pluginName] = module.default;
            console.log(`  → window.${pluginName} = default function`);
          } else if (module.default.create && typeof module.default.create === 'function') {
            window[pluginName] = module.default.create;
            window[pluginName + 'Styles'] = module.default;
            console.log(`  → window.${pluginName} = create function`);
          } else {
            window[pluginName] = module.default;
            console.log(`  → window.${pluginName} = default object`);
          }
        } else {
          // Prendre la première exportation nommée
          const firstExport = Object.keys(module)[0];
          if (firstExport) {
            window[pluginName] = module[firstExport];
            console.log(`  → window.${pluginName} = ${firstExport}`);
          }
        }
        break;
        
      default:
        // Fallback générique
        if (module.default) {
          window[pluginName] = module.default;
          console.log(`  → window.${pluginName} = default (fallback)`);
        } else {
          const firstExport = Object.keys(module)[0];
          if (firstExport) {
            window[pluginName] = module[firstExport];
            console.log(`  → window.${pluginName} = ${firstExport} (fallback)`);
          }
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
    console.log(`🔄 Chargement de tous les plugins: ${pluginNames.join(', ')}`);
    
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
}

// Export du plugin manager
export default PluginManager;

// Exposition globale pour utilisation directe
window.PluginManager = PluginManager;
