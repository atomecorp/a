/**
 * 🚀 SQUIRREL APPLICATION - OPTIMIZED ES6 MODULE ENTRY POINT
 * Version optimisée avec chargement conditionnel et gestion d'erreurs
 */

(async () => {
  try {
    // Import silencieux
    await import('../squirrel/apis.js');
    const { $, define, observeMutations } = await import('../squirrel/squirrel.js');

    // Exposition globale
    window.$ = $;
    window.define = define;
    window.observeMutations = observeMutations;
    window.body = document.body;
    window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

    // Chargement application
    await import('../application/index.js');

  } catch (error) {
    // SEULE erreur affichée si problème
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
  }
})();

// Capture erreurs globales (silencieuse)
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Erreur:', event.reason);
  event.preventDefault();
});
try {
  const { $, define, observeMutations } = await import('../squirrel/squirrel.js');
  window.$ = $;
  window.define = define;
  window.observeMutations = observeMutations;
  window.body = document.body;
  window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();
  await import('../application/index.js');
} catch (error) {
  console.error('❌ Erreur import:', error);
  console.error('📍 Stack:', error.stack);
}

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


