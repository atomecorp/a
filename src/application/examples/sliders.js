// Import du système de sliders


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

// === INTERFACE UTILISATEUR POUR LES EXEMPLES MATERIAL DESIGN ===

// Container principal pour la démo
const materialDemo = document.createElement('div');
materialDemo.style.cssText = `
  max-width: 900px;
  margin: 20px auto;
  padding: 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  font-family: 'Roboto', system-ui, sans-serif;
  color: white;
`;

// Titre principal
const title = document.createElement('h1');
title.textContent = '🎛️ Material Design Sliders Demo';
title.style.cssText = `
  text-align: center;
  margin-bottom: 40px;
  font-size: 32px;
  font-weight: 300;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
`;

// Section Volume avec Material Design
const volumeSection = document.createElement('div');
volumeSection.style.cssText = `
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 25px;
  margin-bottom: 30px;
  backdrop-filter: blur(10px);
`;

const volumeTitle = document.createElement('h3');
volumeTitle.textContent = '🔊 Volume Audio - Horizontal Material';
volumeTitle.style.cssText = `
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 500;
`;

const volumeValue = document.createElement('div');
volumeValue.textContent = '75%';
volumeValue.style.cssText = `
  position: absolute;
  background: #1976d2;
  color: white;
  padding: 8px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  margin-top: -10px;
  margin-left: 200px;
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.4);
  transform: translateX(-50%);
`;

// Mise à jour du slider volume avec callback pour l'UI
const enhancedVolumeSlider = Slider.materialHorizontal({
  min: 0,
  max: 100,
  value: 75,
  skin: {
    container: {
      width: '350px',
      margin: '20px 0'
    }
  },
  onChange: (value) => {
    console.log('Volume:', value);
    volumeValue.textContent = value + '%';
    volumeValue.style.marginLeft = (value * 3.5) + 'px';
  },
  onInput: (value) => {
    volumeValue.textContent = value + '%';
    volumeValue.style.marginLeft = (value * 3.5) + 'px';
  }
});

// Section Brightness verticale
const brightnessSection = document.createElement('div');
brightnessSection.style.cssText = `
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 25px;
  margin-bottom: 30px;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: 30px;
`;

const brightnessInfo = document.createElement('div');
brightnessInfo.style.cssText = `
  flex: 1;
`;

const brightnessTitle = document.createElement('h3');
brightnessTitle.textContent = '💡 Luminosité - Vertical Material';
brightnessTitle.style.cssText = `
  margin: 0 0 15px 0;
  font-size: 18px;
  font-weight: 500;
`;

const brightnessValue = document.createElement('div');
brightnessValue.textContent = '50%';
brightnessValue.style.cssText = `
  font-size: 24px;
  font-weight: 300;
  color: #ffd54f;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
`;

const enhancedBrightnessSlider = Slider.materialVertical({
  min: 0,
  max: 100,
  value: 50,
  skin: {
    container: {
      height: '300px'
    }
  },
  onChange: (value) => {
    console.log('Brightness:', value);
    brightnessValue.textContent = value + '%';
    document.body.style.filter = `brightness(${50 + value / 2}%)`;
  },
  onInput: (value) => {
    brightnessValue.textContent = value + '%';
  }
});

// Section Thermostat circulaire
const thermostatSection = document.createElement('div');
thermostatSection.style.cssText = `
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 25px;
  margin-bottom: 30px;
  backdrop-filter: blur(10px);
  text-align: center;
`;

const thermostatTitle = document.createElement('h3');
thermostatTitle.textContent = '🌡️ Thermostat - Circulaire Material';
thermostatTitle.style.cssText = `
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 500;
`;

const thermostatValue = document.createElement('div');
thermostatValue.textContent = '22°C';
thermostatValue.style.cssText = `
  font-size: 28px;
  font-weight: 300;
  color: #ff7043;
  margin-bottom: 20px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
`;

const enhancedThermostatSlider = Slider.materialCircular({
  min: 15,
  max: 35,
  value: 22,
  step: 0.5,
  skin: {
    container: {
      width: '180px',
      height: '180px',
      margin: '0 auto'
    },
    label: {
      fontSize: '0px' // On utilise notre propre label
    }
  },
  onChange: (value) => {
    console.log('Température:', value + '°C');
    thermostatValue.textContent = value + '°C';
    
    // Changement de couleur selon la température
    let color = '#2196f3'; // Bleu pour froid
    if (value > 20) color = '#4caf50'; // Vert pour modéré
    if (value > 25) color = '#ff9800'; // Orange pour chaud
    if (value > 30) color = '#f44336'; // Rouge pour très chaud
    
    thermostatValue.style.color = color;
  }
});

// Section contrôles avancés
const controlsSection = document.createElement('div');
controlsSection.style.cssText = `
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 25px;
  backdrop-filter: blur(10px);
`;

const controlsTitle = document.createElement('h3');
controlsTitle.textContent = '🎮 Contrôles Avancés';
controlsTitle.style.cssText = `
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 500;
`;

const buttonsContainer = document.createElement('div');
buttonsContainer.style.cssText = `
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  justify-content: center;
`;

// Boutons de contrôle
const resetBtn = document.createElement('button');
resetBtn.textContent = '🔄 Reset All';
resetBtn.style.cssText = `
  padding: 12px 24px;
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  transition: transform 0.2s ease;
`;
resetBtn.onmouseenter = () => resetBtn.style.transform = 'translateY(-2px)';
resetBtn.onmouseleave = () => resetBtn.style.transform = 'translateY(0)';
resetBtn.onclick = () => {
  enhancedVolumeSlider.setValue(50);
  enhancedBrightnessSlider.setValue(50);
  enhancedThermostatSlider.setValue(22);
};

const randomBtn = document.createElement('button');
randomBtn.textContent = '🎲 Random Values';
randomBtn.style.cssText = resetBtn.style.cssText;
randomBtn.onmouseenter = resetBtn.onmouseenter;
randomBtn.onmouseleave = resetBtn.onmouseleave;
randomBtn.onclick = () => {
  enhancedVolumeSlider.setValue(Math.random() * 100);
  enhancedBrightnessSlider.setValue(Math.random() * 100);
  enhancedThermostatSlider.setValue(15 + Math.random() * 20);
};

const valuesBtn = document.createElement('button');
valuesBtn.textContent = '📊 Show Values';
valuesBtn.style.cssText = resetBtn.style.cssText;
valuesBtn.onmouseenter = resetBtn.onmouseenter;
valuesBtn.onmouseleave = resetBtn.onmouseleave;
valuesBtn.onclick = () => {
  const values = {
    volume: enhancedVolumeSlider.getValue(),
    brightness: enhancedBrightnessSlider.getValue(),
    temperature: enhancedThermostatSlider.getValue()
  };
  
  console.log('=== VALEURS ACTUELLES ===', values);
  
  alert(`📊 Valeurs actuelles:
  
🔊 Volume: ${values.volume}%
💡 Luminosité: ${values.brightness}%
🌡️ Température: ${values.temperature}°C`);
};

// Assemblage de l'interface
materialDemo.appendChild(title);

volumeSection.appendChild(volumeTitle);
volumeSection.appendChild(volumeValue);
volumeSection.appendChild(enhancedVolumeSlider);
materialDemo.appendChild(volumeSection);

brightnessInfo.appendChild(brightnessTitle);
brightnessInfo.appendChild(brightnessValue);
brightnessSection.appendChild(brightnessInfo);
brightnessSection.appendChild(enhancedBrightnessSlider);
materialDemo.appendChild(brightnessSection);

thermostatSection.appendChild(thermostatTitle);
thermostatSection.appendChild(thermostatValue);
thermostatSection.appendChild(enhancedThermostatSlider);
materialDemo.appendChild(thermostatSection);

buttonsContainer.appendChild(resetBtn);
buttonsContainer.appendChild(randomBtn);
buttonsContainer.appendChild(valuesBtn);
controlsSection.appendChild(controlsTitle);
controlsSection.appendChild(buttonsContainer);
materialDemo.appendChild(controlsSection);

// Ajout au DOM
document.body.appendChild(materialDemo);
