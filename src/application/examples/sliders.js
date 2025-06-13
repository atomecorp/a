// Import du système de sliders
import Slider from '../../squirrel/components/Sliders.js';

// === EXEMPLES DE SLIDERS ===

// 1. Slider horizontal Material Design
const volumeSlider = Slider.materialHorizontal({
  min: 0,
  max: 100,
  value: 75,
  onChange: (value) => console.log('Volume:', value),
  onInput: (value) => console.log('Volume input:', value)
});

// 2. Slider vertical Material Design
const brightnessSlider = Slider.materialVertical({
  min: 0,
  max: 100,
  value: 50,
  onChange: (value) => {
    console.log('Brightness:', value);
    document.body.style.filter = `brightness(${50 + value / 2}%)`;
  }
});

// 3. Slider circulaire Material Design
const temperatureSlider = Slider.materialCircular({
  min: 15,
  max: 35,
  value: 22,
  step: 0.5,
  onChange: (value) => console.log('Température:', value + '°C')
});

// 4. Slider horizontal custom avec graduations
const customSlider = Slider.horizontal({
  min: 0,
  max: 10,
  value: 5,
  step: 1,
  showTicks: true,
  ticks: [0, 2, 4, 6, 8, 10],
  skin: {
    container: {
      width: '300px',
      height: '40px',
      backgroundColor: '#f5f5f5',
      borderRadius: '20px',
      padding: '10px'
    },
    track: {
      height: '8px',
      backgroundColor: '#ddd',
      borderRadius: '4px',
      top: '16px'
    },
    fill: {
      backgroundColor: '#4caf50',
      borderRadius: '4px'
    },
    handle: {
      width: '24px',
      height: '24px',
      backgroundColor: '#4caf50',
      border: '3px solid white',
      boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
      top: '-8px'
    },
    tick: {
      backgroundColor: '#999',
      borderRadius: '1px'
    },
    label: {
      top: '45px',
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#4caf50'
    }
  },
  onChange: (value) => console.log('Rating:', value + '/10')
});

// 5. Slider de couleur avec skin personnalisé
const colorSlider = Slider.create({
  type: 'horizontal',
  min: 0,
  max: 360,
  value: 180,
  skin: {
    container: {
      width: '280px',
      height: '30px',
      background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
      borderRadius: '15px',
      border: '2px solid #fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    },
    track: {
      background: 'transparent',
      height: '100%',
      borderRadius: '15px'
    },
    fill: {
      display: 'none'
    },
    handle: {
      width: '26px',
      height: '26px',
      backgroundColor: '#fff',
      border: '3px solid #333',
      top: '2px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
    },
    label: {
      top: '35px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#333'
    }
  },
  onChange: (value) => {
    console.log('Hue:', value + '°');
    document.body.style.backgroundColor = `hsl(${value}, 50%, 95%)`;
  }
});

console.log(`
🎛️ DÉMO SLIDERS SQUIRREL

Fonctionnalités créées:
✅ Slider horizontal Material Design (Volume)
✅ Slider vertical Material Design (Brightness)
✅ Slider circulaire Material Design (Température)
✅ Slider avec graduations personnalisées (Rating)
✅ Slider de couleur avec dégradé (Hue)
✅ Support tactile complet
✅ Skinning granulaire de tous les éléments

Testez les sliders et regardez la console pour les valeurs !
`);
