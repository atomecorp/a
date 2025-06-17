import { $, define } from '../squirrel.js';

/**
 * Composant WaveSurfer pour lecteur audio avec visualisation
 */

// Template pour le conteneur WaveSurfer
define('wavesurfer-container', {
  tag: 'div',
  class: 'hs-wavesurfer',
  css: {
    position: 'relative',
    width: '100%',
    minHeight: '100px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    overflow: 'hidden'
  }
});

// Template pour les contrôles
define('wavesurfer-controls', {
  tag: 'div',
  class: 'hs-wavesurfer-controls',
  css: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e9ecef'
  }
});

// Template pour les boutons de contrôle
define('wavesurfer-button', {
  tag: 'button',
  class: 'hs-wavesurfer-btn',
  css: {
    padding: '6px 12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    backgroundColor: '#f8f9fa',
    color: '#333',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  }
});

/**
 * Crée un lecteur WaveSurfer
 */
const createWaveSurfer = (config = {}) => {
  const {
    url = '',
    height = 100,
    waveColor = '#4a90e2',
    progressColor = '#2c5282',
    showControls = true,
    ...otherConfig
  } = config;

  // Créer le conteneur principal
  const container = $('wavesurfer-container');
  
  // Zone de visualisation
  const waveform = $({
    tag: 'div',
    class: 'wavesurfer-waveform',
    css: {
      height: `${height}px`,
      backgroundColor: '#fafafa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#666',
      fontSize: '14px'
    },
    text: url ? 'Chargement audio...' : 'Aucun fichier audio'
  });

  container.append(waveform);

  // Ajouter les contrôles si demandé
  if (showControls) {
    const controls = $('wavesurfer-controls');
    
    const playBtn = $('wavesurfer-button', { text: '▶️ Play' });
    const pauseBtn = $('wavesurfer-button', { text: '⏸️ Pause' });
    const stopBtn = $('wavesurfer-button', { text: '⏹️ Stop' });
    
    controls.append(playBtn, pauseBtn, stopBtn);
    container.append(controls);

    // Événements basiques (simulation)
    playBtn.on('click', () => {
      console.log('🎵 WaveSurfer: Play');
      waveform.text('En cours de lecture...');
    });

    pauseBtn.on('click', () => {
      console.log('🎵 WaveSurfer: Pause');
      waveform.text('En pause');
    });

    stopBtn.on('click', () => {
      console.log('🎵 WaveSurfer: Stop');
      waveform.text(url ? 'Arrêté' : 'Aucun fichier audio');
    });
  }

  // Méthodes publiques
  const waveSurferInstance = {
    element: container,
    
    loadUrl(newUrl) {
      waveform.text('Chargement...');
      console.log('🎵 WaveSurfer: Chargement de', newUrl);
      // TODO: Intégrer la vraie librairie WaveSurfer ici
      setTimeout(() => {
        waveform.text('Prêt à lire');
      }, 1000);
      return this;
    },

    play() {
      console.log('🎵 WaveSurfer: Play');
      waveform.text('En cours de lecture...');
      return this;
    },

    pause() {
      console.log('🎵 WaveSurfer: Pause');
      waveform.text('En pause');
      return this;
    },

    stop() {
      console.log('🎵 WaveSurfer: Stop');
      waveform.text('Arrêté');
      return this;
    },

    destroy() {
      container.remove();
      return this;
    }
  };

  // Charger l'URL si fournie
  if (url) {
    waveSurferInstance.loadUrl(url);
  }

  return waveSurferInstance;
};

// Export par défaut
export default {
  create: createWaveSurfer
};

// Export alternatif
export { createWaveSurfer };
