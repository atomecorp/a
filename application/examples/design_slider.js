

import Slider from '../../squirrel/components/slider_builder.js';

// Wrapper pour le slider avec espacement
const sliderWrapper = $('div', {
  id: 'design-slider-wrapper',
  css: {
    left: '50%',
    width: '0px', // Largeur du wrapper
    borderRadius: '20px', // Bordures très arrondies
    backgroundColor: '#f0f0f0', // Fond clair
    position: 'relative',
    padding: '30px'
  }
});

const designSlider = Slider({
  parent: sliderWrapper,
  id: 'design-slider-main',
  type: 'vertical',
  value: 80,        // Position basse comme sur l'image
  min: 0,
  max: 100,
 showLabel: false,
  skin: {
    track: {
      backgroundColor: '#e8e8e8',
      width: '20px',  
      left: '0px'   ,     // Largeur du rail
      borderRadius: '20px',   // Bordures très arrondies
      boxShadow: `
        inset 0 4px 8px rgba(0, 0, 0, 0.3),
        inset 0 -4px 8px rgba(255, 255, 255, 0.7),
        inset 4px 0 8px rgba(0, 0, 0, 0.2),
        inset -4px 0 8px rgba(0, 0, 0, 0.2),
        0 2px 4px rgba(0, 0, 0, 0.1)
      `,
      border: '1px solid #ccc'
    },
    
    // Pas de progression
    progression: {
      display: 'none'
    },
    
    // Poignée plus petite par rapport au rail épais
    handle: {
      width: '28px',
      left: '0px',
      height: '28px',
      backgroundColor: '#ddd',
      border: '1px solid #aaa',
      borderRadius: '50%',
      cursor: 'pointer',
      // Ombres pour donner du relief à la poignée
      boxShadow: `
        0 3px 6px rgba(0, 0, 0, 0.2),
        0 6px 12px rgba(0, 0, 0, 0.15),
        inset 0 1px 3px rgba(255, 255, 255, 0.8),
        inset 0 -1px 3px rgba(0, 0, 0, 0.15)
      `,
      transform: 'translateX(-50%)'
    }
  },
  
  onInput: (value) => {
    console.log(`Slider value: ${value}%`);
  }
});


