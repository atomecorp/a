// Import des utilitaires nécessaires
import { $ } from '../../squirrel/squirrel.js';

// Création d'un conteneur principal pour organiser les exemples
const demoContainer = $('div', {
  css: {
    padding: '40px',
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh'
  }
});

// Titre principal
const title = $('h1', {
  text: '🎯 Debug Précis - Alignement Handle sur Track',
  css: {
    color: '#dc3545',
    marginBottom: '40px',
    textAlign: 'center'
  }
});
demoContainer.appendChild(title);

// === DEBUG AVEC REPÈRES VISUELS ===
const debugSection = $('div', {
  css: { marginBottom: '50px', textAlign: 'center' }
});

const debugTitle = $('h2', {
  text: 'Slider avec repères pour vérifier l\'alignement',
  css: { color: '#198754', marginBottom: '20px' }
});
debugSection.appendChild(debugTitle);

// Container avec repères visuels
const debugContainer = $('div', {
  css: {
    position: 'relative',
    width: '300px',
    height: '300px',
    margin: '40px auto',
    border: '2px solid #007bff'
  }
});

// Ajouter des repères visuels (croix au centre et points cardinaux)
const centerCross = $('div', {
  css: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '20px',
    height: '20px',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'red',
    borderRadius: '50%',
    zIndex: '100'
  }
});
debugContainer.appendChild(centerCross);

// Points cardinaux
const cardinalPoints = [
  { top: '5px', left: '50%', transform: 'translateX(-50%)', label: 'N' }, // Nord (haut)
  { top: '50%', right: '5px', transform: 'translateY(-50%)', label: 'E' }, // Est (droite)
  { bottom: '5px', left: '50%', transform: 'translateX(-50%)', label: 'S' }, // Sud (bas)
  { top: '50%', left: '5px', transform: 'translateY(-50%)', label: 'W' }  // Ouest (gauche)
];

cardinalPoints.forEach(point => {
  const marker = $('div', {
    text: point.label,
    css: {
      position: 'absolute',
      ...point,
      width: '20px',
      height: '20px',
      backgroundColor: '#007bff',
      color: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: 'bold',
      zIndex: '100'
    }
  });
  debugContainer.appendChild(marker);
});

// Slider de debug
const debugSlider = Slider.create({
  type: 'circular',
  min: 0,
  max: 100,
  value: 0,
  showLabel: false,
  skin: {
    container: {
      width: '100%',
      height: '100%',
      position: 'absolute',
      top: '0',
      left: '0'
    },
    track: {
      border: '8px solid rgba(0,123,255,0.3)',
      backgroundColor: 'transparent'
    },
    handle: {
      width: '24px',
      height: '24px',
      backgroundColor: '#dc3545',
      border: '3px solid #ffffff',
      boxShadow: '0 4px 8px rgba(220,53,69,0.8)',
      zIndex: '50'
    },
    progression: {
      stroke: '#007bff',
      strokeWidth: '4',
      opacity: '0.7'
    }
  },
  onInput: (value) => {
    valueDisplay.textContent = `Valeur: ${Math.round(value)}%`;
    // Afficher les coordonnées calculées
    const angle = (value / 100) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + 46 * Math.cos(angle);
    const y = 50 + 46 * Math.sin(angle);
    coordsDisplay.textContent = `Coords: x=${x.toFixed(1)}%, y=${y.toFixed(1)}%`;
  }
});

debugContainer.appendChild(debugSlider);
debugSection.appendChild(debugContainer);

// Contrôles pour tester différentes positions
const controlsContainer = $('div', {
  css: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
    marginTop: '20px'
  }
});

const testPositions = [
  { value: 0, label: '0% (Haut)', color: '#dc3545' },
  { value: 25, label: '25% (Droite)', color: '#fd7e14' },
  { value: 50, label: '50% (Bas)', color: '#198754' },
  { value: 75, label: '75% (Gauche)', color: '#6f42c1' }
];

testPositions.forEach(pos => {
  const button = $('button', {
    text: pos.label,
    css: {
      padding: '8px 16px',
      backgroundColor: pos.color,
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  button.addEventListener('click', () => {
    debugSlider.setValue(pos.value);
  });
  
  controlsContainer.appendChild(button);
});

debugSection.appendChild(controlsContainer);

// Affichage des infos
const valueDisplay = $('div', {
  text: 'Valeur: 0%',
  css: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#dc3545',
    marginTop: '20px'
  }
});
debugSection.appendChild(valueDisplay);

const coordsDisplay = $('div', {
  text: 'Coords: x=50.0%, y=4.0%',
  css: {
    fontSize: '14px',
    color: '#666',
    marginTop: '10px'
  }
});
debugSection.appendChild(coordsDisplay);

// Instructions
const instructions = $('div', {
  css: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffeaa7',
    borderRadius: '8px',
    padding: '20px',
    marginTop: '30px',
    textAlign: 'left'
  }
});

const instructionsTitle = $('h3', {
  text: '🔍 Vérification visuelle :',
  css: { color: '#856404', marginBottom: '15px' }
});
instructions.appendChild(instructionsTitle);

const checkList = $('ul', {
  css: { color: '#856404', lineHeight: '1.8' }
});

const checks = [
  'Le handle rouge doit être exactement sur la ligne bleue de la track',
  'À 0% : Le handle doit toucher le point N (nord/haut)',
  'À 25% : Le handle doit toucher le point E (est/droite)',
  'À 50% : Le handle doit toucher le point S (sud/bas)',
  'À 75% : Le handle doit toucher le point W (ouest/gauche)',
  'Utilisez les boutons pour tester chaque position rapidement'
];

checks.forEach(check => {
  const li = $('li', {
    text: check,
    css: { marginBottom: '10px' }
  });
  checkList.appendChild(li);
});

instructions.appendChild(checkList);
debugSection.appendChild(instructions);

demoContainer.appendChild(debugSection);

// Ajout du conteneur principal au DOM
document.body.appendChild(demoContainer);
