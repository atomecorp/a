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

export default SquirrelPluginAPI;
