// Import des utilitaires nécessaires

// Création d'un conteneur principal pour organiser les exemples
const demoContainer = $('div', {
  css: {
    padding: '40px',
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
	overflow: 'auto',
  }
});

// Titre principal
const title = $('h1', {
  text: '🎯 Sliders Demo - Tous Types',
  css: {
    color: '#333',
    marginBottom: '40px',
    textAlign: 'center'
  }
});
demoContainer.appendChild(title);

// === SLIDER CIRCULAIRE ===
const circularSection = $('div', {
  css: {
    backgroundColor: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '40px'
  }
});

const circularTitle = $('h2', {
  text: 'Slider Circulaire',
  css: {
    color: '#495057',
    marginBottom: '30px',
    textAlign: 'center'
  }
});
circularSection.appendChild(circularTitle);

const circularContainer = $('div', {
  css: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '250px',
    padding: '20px'
  }
});

const circularSlider = window.Slider.create({
  type: 'circular',
  radius: 80,
  value: 75,
  min: 0,
  max: 100,
  handleOffset: -38, // Décalage du handle : négatif = vers l'intérieur, positif = vers l'extérieur
  skin: {
    track: {
      backgroundColor: 'transparent',
      border: '6px solid #e9ecef',
      borderRadius: '50%'
    },
    progression: {
      stroke: '#4ecdc4',
      strokeWidth: '6',
      fill: 'none'
    },
    handle: {
      width: '20px',
      height: '20px',
      backgroundColor: '#ffffff',
      border: '3px solid #4ecdc4',
      borderRadius: '50%',
      boxShadow: '0 2px 8px rgba(78, 205, 196, 0.4)',
      cursor: 'pointer'
    }
  }
});

circularContainer.appendChild(circularSlider);
circularSection.appendChild(circularContainer);
demoContainer.appendChild(circularSection);

// === EXEMPLES D'UTILISATION DE handleOffset ===
const offsetExamplesSection = $('div', {
  css: {
    backgroundColor: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '40px'
  }
});

const offsetTitle = $('h2', {
  text: 'Exemples HandleOffset',
  css: {
    color: '#495057',
    marginBottom: '20px',
    textAlign: 'center'
  }
});
offsetExamplesSection.appendChild(offsetTitle);

const offsetDescription = $('p', {
  text: 'handleOffset contrôle la position du handle par rapport au track : négatif = intérieur, positif = extérieur',
  css: {
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: '30px',
    fontStyle: 'italic'
  }
});
offsetExamplesSection.appendChild(offsetDescription);

const offsetContainer = $('div', {
  css: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '30px',
    padding: '20px'
  }
});

// Exemple 1: Handle vers l'intérieur (-15)
const example1Container = $('div', {
  css: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px'
  }
});

const example1Title = $('h4', {
  text: 'handleOffset: -15',
  css: { color: '#dc3545', margin: '0', textAlign: 'center' }
});

const example1Slider = window.Slider.create({
  type: 'circular',
  radius: 60,
  value: 50,
  min: 0,
  max: 100,
  handleOffset: -15, // Très vers l'intérieur
  skin: {
    track: {
      backgroundColor: 'transparent',
      border: '8px solid #ffeaa7',
      borderRadius: '50%'
    },
    progression: {
      stroke: '#fdcb6e',
      strokeWidth: '8',
      fill: 'none'
    },
    handle: {
      width: '16px',
      height: '16px',
      backgroundColor: '#e17055',
      border: '2px solid #ffffff',
      borderRadius: '50%',
      boxShadow: '0 2px 6px rgba(225, 112, 85, 0.4)',
      cursor: 'pointer'
    }
  }
});

example1Container.appendChild(example1Title);
example1Container.appendChild(example1Slider);
offsetContainer.appendChild(example1Container);

// Exemple 2: Handle centré (0)
const example2Container = $('div', {
  css: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px'
  }
});

const example2Title = $('h4', {
  text: 'handleOffset: 0',
  css: { color: '#00b894', margin: '0', textAlign: 'center' }
});

const example2Slider = window.Slider.create({
  type: 'circular',
  radius: 60,
  value: 25,
  min: 0,
  max: 100,
  handleOffset: 0, // Centré sur le track
  skin: {
    track: {
      backgroundColor: 'transparent',
      border: '8px solid #a29bfe',
      borderRadius: '50%'
    },
    progression: {
      stroke: '#6c5ce7',
      strokeWidth: '8',
      fill: 'none'
    },
    handle: {
      width: '18px',
      height: '18px',
      backgroundColor: '#fd79a8',
      border: '3px solid #ffffff',
      borderRadius: '50%',
      boxShadow: '0 2px 6px rgba(253, 121, 168, 0.4)',
      cursor: 'pointer'
    }
  }
});

example2Container.appendChild(example2Title);
example2Container.appendChild(example2Slider);
offsetContainer.appendChild(example2Container);

// Exemple 3: Handle vers l'extérieur (+10)
const example3Container = $('div', {
  css: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px'
  }
});

const example3Title = $('h4', {
  text: 'handleOffset: +10',
  css: { color: '#0984e3', margin: '0', textAlign: 'center' }
});

const example3Slider = window.Slider.create({
  type: 'circular',
  radius: 60,
  value: 80,
  min: 0,
  max: 100,
  handleOffset: 10, // Vers l'extérieur
  skin: {
    track: {
      backgroundColor: 'transparent',
      border: '6px solid #81ecec',
      borderRadius: '50%'
    },
    progression: {
      stroke: '#00cec9',
      strokeWidth: '6',
      fill: 'none'
    },
    handle: {
      width: '22px',
      height: '22px',
      backgroundColor: '#0984e3',
      border: '3px solid #ffffff',
      borderRadius: '50%',
      boxShadow: '0 3px 8px rgba(9, 132, 227, 0.5)',
      cursor: 'pointer'
    }
  }
});

example3Container.appendChild(example3Title);
example3Container.appendChild(example3Slider);
offsetContainer.appendChild(example3Container);

offsetExamplesSection.appendChild(offsetContainer);
demoContainer.appendChild(offsetExamplesSection);

// === SLIDER HORIZONTAL ===
const horizontalSection = $('div', {
  css: {
    backgroundColor: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '40px'
  }
});

const horizontalTitle = $('h2', {
  text: 'Slider Horizontal',
  css: {
    color: '#495057',
    marginBottom: '30px',
    textAlign: 'center'
  }
});
horizontalSection.appendChild(horizontalTitle);

const horizontalContainer = $('div', {
  css: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px'
  }
});

const horizontalSlider = window.Slider.create({
  type: 'horizontal',
  width: 400,
  height: 8,
  value: 60,
  min: 0,
  max: 100,
  skin: {
    track: {
      backgroundColor: '#e9ecef',
      borderRadius: '4px'
    },
    progression: {
      background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '4px'
    },
    handle: {
      width: '24px',
      height: '24px',
      backgroundColor: '#ffffff',
      border: '3px solid #667eea',
      borderRadius: '50%',
      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
      cursor: 'pointer'
    }
  }
});

horizontalContainer.appendChild(horizontalSlider);
horizontalSection.appendChild(horizontalContainer);
demoContainer.appendChild(horizontalSection);

// === SLIDER VERTICAL ===
const verticalSection = $('div', {
  css: {
    backgroundColor: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '40px'
  }
});

const verticalTitle = $('h2', {
  text: 'Slider Vertical',
  css: {
    color: '#495057',
    marginBottom: '30px',
    textAlign: 'center'
  }
});
verticalSection.appendChild(verticalTitle);

const verticalContainer = $('div', {
  css: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '300px',
    padding: '20px'
  }
});

const verticalSlider = window.Slider.create({
  type: 'vertical',
  width: 8,
  height: 250,
  value: 40,
  min: 0,
  max: 100,
  skin: {
    track: {
      backgroundColor: '#e9ecef',
      borderRadius: '4px'
    },
    progression: {
      background: 'linear-gradient(180deg, #f093fb 0%, #f5576c 100%)',
      borderRadius: '4px'
    },
    handle: {
      width: '24px',
      height: '24px',
      backgroundColor: '#ffffff',
      border: '3px solid #f5576c',
      borderRadius: '50%',
      boxShadow: '0 2px 8px rgba(245, 87, 108, 0.3)',
      cursor: 'pointer'
    }
  }
});

verticalContainer.appendChild(verticalSlider);
verticalSection.appendChild(verticalContainer);
demoContainer.appendChild(verticalSection);

// Ajout du conteneur principal au DOM
document.body.appendChild(demoContainer);

