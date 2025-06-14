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

// Ajout du conteneur principal au DOM
document.body.appendChild(demoContainer);
