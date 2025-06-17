/**
 * 🚀 SQUIRREL APPLICATION - OPTIMIZED ES6 MODULE ENTRY POINT
 * Version optimisée avec chargement conditionnel et gestion d'erreurs
 */

(async () => {
  try {
    // Import silencieux des APIs et du core Squirrel
    await import('./apis.js');
    const { $, define, observeMutations } = await import('./squirrel.js');

    // Exposition globale des utilitaires
    window.$ = $;
    window.define = define;
    window.observeMutations = observeMutations;
    window.body = document.body;
    window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

    // 🔌 SYSTÈME DE PLUGINS AUTO-DISCOVERY
    // console.log('🔄 Initialisation du système de plugins...');
    
    // Import et initialisation du plugin manager
    const PluginManagerModule = await import('./plugin-manager.js');
    const pluginManager = new PluginManagerModule.default();
    
    // Découverte automatique des composants
    const availablePlugins = await pluginManager.discover();
    
    // Import et initialisation de l'API des plugins
    const PluginAPIModule = await import('./plugin-api.js');
    const pluginAPI = new PluginAPIModule.default(pluginManager);
    
    // Exposition globale des APIs
    window.pluginManager = pluginManager;
    window.Squirrel = pluginAPI;
    
    // Chargement de tous les plugins découverts
    // console.log('🚀 Chargement automatique de tous les plugins...');
    await pluginManager.loadAll();
    
    // Affichage du statut
    const status = pluginManager.getStatus();
    // console.log('📊 Statut des plugins:', status);
    // console.log(`✅ ${status.loaded}/${status.available} plugins chargés avec succès`);
    
    // APIs pour utilisation externe
    window.loadPlugin = async (pluginName) => {
      try {
        const plugin = await pluginManager.load(pluginName);
        // console.log(`✅ Plugin "${pluginName}" chargé manuellement`);
        return plugin;
      } catch (error) {
        console.error(`❌ Erreur lors du chargement manuel de "${pluginName}":`, error);
        return null;
      }
    };
    
    window.listPlugins = () => {
      // console.log('📋 Plugins disponibles:', pluginManager.getAvailablePlugins());
      // console.log('✅ Plugins chargés:', pluginManager.getLoadedPlugins());
      return pluginManager.getStatus();
    };


    // Chargement de l'application principale

    // Chargement de l'application principale
    await import('./kickstart.js');
    await import('../application/index.js');
   

  } catch (error) {
    // Gestion centralisée des erreurs
    console.error('❌ Erreur lors de l\'initialisation:', error.message);
    console.error('📍 Stack:', error.stack);
  }
})();

// Capture des erreurs globales non gérées
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Erreur Promise non gérée:', event.reason);
  event.preventDefault();
});

// import Button from '../squirrel/components/Buttons.js';




// import('../application/index.js');

// import Button from '../squirrel/components/Button.js';
// import Module from '../squirrel/components/Module.js';
// import SliderCompatible, { Slider } from '../squirrel/components/Slider.js';
// import Matrix from '../squirrel/components/Matrix.js';
// import List from '../squirrel/components/List.js';
// import Table from '../squirrel/components/Table.js';
// import WaveSurferCompatible from '../squirrel/components/WaveSurfer.js';

// import WaveSurferLib from './wavesurfer-v7/core/wavesurfer.esm.js';
// import RegionsPlugin from './wavesurfer-v7/plugins/regions.esm.js';
// import TimelinePlugin from './wavesurfer-v7/plugins/timeline.esm.js';
// import MinimapPlugin from './wavesurfer-v7/plugins/minimap.esm.js';
// import ZoomPlugin from './wavesurfer-v7/plugins/zoom.esm.js';
// import HoverPlugin from './wavesurfer-v7/plugins/hover.esm.js';
// import SpectrogramPlugin from './wavesurfer-v7/plugins/spectrogram.esm.js';
// import RecordPlugin from './wavesurfer-v7/plugins/record.esm.js';
// import EnvelopePlugin from './wavesurfer-v7/plugins/envelope.esm.js';


// window.Button = Button;
// window.Module = Module;
// window.Slider = Slider;
// window.SliderCompatible = SliderCompatible;
// window.Matrix = Matrix;
// window.List = List;
// window.Table = Table;
// window.WaveSurferCompatible = WaveSurferCompatible; // Composant WaveSurfer Web Component

// window.WaveSurfer = WaveSurferLib; // Core WaveSurfer

// // Noms standards pour compatibilité avec le code existant
// window.RegionsPlugin = RegionsPlugin;
// window.TimelinePlugin = TimelinePlugin;
// window.MinimapPlugin = MinimapPlugin;
// window.ZoomPlugin = ZoomPlugin;
// window.HoverPlugin = HoverPlugin;
// window.SpectrogramPlugin = SpectrogramPlugin;
// window.RecordPlugin = RecordPlugin;
// window.EnvelopePlugin = EnvelopePlugin;

// // Alias préfixés pour éviter les conflits (optionnel)
// window.WaveSurferRegions = RegionsPlugin;
// window.WaveSurferTimeline = TimelinePlugin;
// window.WaveSurferMinimap = MinimapPlugin;
// window.WaveSurferZoom = ZoomPlugin;
// window.WaveSurferHover = HoverPlugin;
// window.WaveSurferSpectrogram = SpectrogramPlugin;
// window.WaveSurferRecord = RecordPlugin;
// window.WaveSurferEnvelope = EnvelopePlugin;

// // Objet groupé pour faciliter l'utilisation
// window.WaveSurferPlugins = {
//     Regions: RegionsPlugin,
//     Timeline: TimelinePlugin,
//     Minimap: MinimapPlugin,
//     Zoom: ZoomPlugin,
//     Hover: HoverPlugin,
//     Spectrogram: SpectrogramPlugin,
//     Record: RecordPlugin,
//     Envelope: EnvelopePlugin
// };


