// Import des utilitaires nécessaires
import Slider from '../../squirrel/components/slider_builder.js';
// define('div', {
//   tag: 'div',
// });

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

const circularSlider = Slider({
  type: 'circular',
  radius: 80,
  value: 75,
  min: 0,
  max: 100,
  handleOffset: -30, // Décalage du handle : négatif = vers l'intérieur, positif = vers l'extérieur
  skin: {
	track: {
	  backgroundColor: 'transparent',
	  border: '6px solid #e9ecef',
	  borderRadius: '50%'
	},
	progression: {
	  stroke: '#4ecdc4',
		 strokeLinecap: 'round',
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

const example1Slider = Slider({
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

const example2Slider = Slider({
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

const example3Slider = Slider({
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

const horizontalSlider = Slider({
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

const verticalSlider = Slider({
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

// === EXEMPLES DE LABELS ===
const labelsSection = $('div', {
  css: {
	backgroundColor: '#ffffff',
	padding: '30px',
	borderRadius: '12px',
	boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
	marginBottom: '40px'
  }
});

const labelsTitle = $('h2', {
  text: 'Exemples avec Labels',
  css: {
	color: '#495057',
	marginBottom: '20px',
	textAlign: 'center',
	fontSize: '24px'
  }
});
labelsSection.appendChild(labelsTitle);

const labelsDescription = $('p', {
  text: 'showLabel: true/false pour afficher/masquer les labels + skinning complet avec skin.label',
  css: {
	color: '#6c757d',
	textAlign: 'center',
	marginBottom: '30px',
	fontStyle: 'italic',
	fontSize: '24px'
  }
});
labelsSection.appendChild(labelsDescription);

const labelsContainer = $('div', {
  css: {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
	gap: '30px',
	padding: '20px'
  }
});

// Exemple 1: Slider horizontal avec label personnalisé
const labelExample1Container = $('div', {
  css: {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: '15px'
  }
});

const labelExample1Title = $('h4', {
  text: 'Horizontal avec Label Skinné',
  css: { color: '#e74c3c', margin: '0', textAlign: 'center', fontSize: '14px' }
});

const labelExample1Slider = Slider({
  type: 'horizontal',
  width: 200,
  height: 6,
  value: 65,
  min: 0,
  max: 100,
  showLabel: true, // Activer l'affichage du label
  skin: {
	track: {
	  backgroundColor: '#fadbd8',
	  borderRadius: '3px'
	},
	progression: {
	  background: 'linear-gradient(90deg, #e74c3c, #c0392b)',
	  borderRadius: '3px'
	},
	handle: {
	  width: '18px',
	  height: '18px',
	  backgroundColor: '#ffffff',
	  border: '2px solid #e74c3c',
	  borderRadius: '50%',
	  cursor: 'pointer'
	},
	label: {
	  fontSize: '14px',
	  fontWeight: 'bold',
	  color: '#e74c3c',
	  backgroundColor: '#fadbd8',
	  padding: '4px 8px',
	  borderRadius: '4px',
	  border: '1px solid #e74c3c',
	  top: '-35px', // Position au-dessus du slider
	  left: '50%',
	  transform: 'translateX(-50%)'
	}
  }
});

labelExample1Container.appendChild(labelExample1Title);
labelExample1Container.appendChild(labelExample1Slider);
labelsContainer.appendChild(labelExample1Container);

// Exemple 2: Slider vertical sans label
const labelExample2Container = $('div', {
  css: {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: '15px'
  }
});

const labelExample2Title = $('h4', {
  text: 'Vertical sans Label',
  css: { color: '#8e44ad', margin: '0', textAlign: 'center', fontSize: '14px' }
});

const labelExample2Slider = Slider({
  type: 'vertical',
  width: 8,
  height: 150,
  value: 30,
  min: 0,
  max: 100,
  showLabel: false, // Désactiver l'affichage du label
  skin: {
	track: {
	  backgroundColor: '#f4ecf7',
	  borderRadius: '4px'
	},
	progression: {
	  background: 'linear-gradient(180deg, #8e44ad, #6c3483)',
	  borderRadius: '4px'
	},
	handle: {
	  width: '20px',
	  height: '20px',
	  backgroundColor: '#8e44ad',
	  borderRadius: '50%',
	  cursor: 'pointer'
	}
  }
});

labelExample2Container.appendChild(labelExample2Title);
labelExample2Container.appendChild(labelExample2Slider);
labelsContainer.appendChild(labelExample2Container);

// Exemple 3: Slider circulaire avec label stylé
const labelExample3Container = $('div', {
  css: {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: '15px'
  }
});

const labelExample3Title = $('h4', {
  text: 'Circulaire avec Label Central',
  css: { color: '#f39c12', margin: '0', textAlign: 'center', fontSize: '14px' }
});

const labelExample3Slider = Slider({
  type: 'circular',
  radius: 70,
  value: 85,
  min: 0,
  max: 100,
  handleOffset: -5,
  showLabel: true, // Activer l'affichage du label
  skin: {
	track: {
	  backgroundColor: 'transparent',
	  border: '5px solid #fdeaa7',
	  borderRadius: '50%'
	},
	progression: {
	  stroke: '#f39c12',
	  strokeWidth: '5',
	  fill: 'none'
	},
	handle: {
	  width: '16px',
	  height: '16px',
	  backgroundColor: '#f39c12',
	  border: '2px solid #ffffff',
	  borderRadius: '50%',
	  cursor: 'pointer'
	},
	label: {
	  fontSize: '18px',
	  fontWeight: 'bold',
	  color: '#f39c12',
	  backgroundColor: '#ffffff',
	  padding: '8px 12px',
	  borderRadius: '50%',
	  border: '2px solid #f39c12',
	  boxShadow: '0 2px 8px rgba(243, 156, 18, 0.3)',
	  top: '50%', // Centrer le label
	  left: '50%',
	  transform: 'translate(-50%, -50%)',
	  minWidth: '40px',
	  textAlign: 'center'
	}
  }
});

labelExample3Container.appendChild(labelExample3Title);
labelExample3Container.appendChild(labelExample3Slider);
labelsContainer.appendChild(labelExample3Container);

labelsSection.appendChild(labelsContainer);
demoContainer.appendChild(labelsSection);

// === EXEMPLE PROGRESSION CIRCULAIRE AVEC ARRONDIS ===
const roundedProgressSection = $('div', {
  css: {
	backgroundColor: '#ffffff',
	padding: '30px',
	borderRadius: '12px',
	boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
	marginBottom: '40px'
  }
});

const roundedProgressTitle = $('h2', {
  text: 'Progression Circulaire avec Arrondis',
  css: {
	color: '#495057',
	marginBottom: '20px',
	textAlign: 'center'
  }
});
roundedProgressSection.appendChild(roundedProgressTitle);

const roundedProgressDescription = $('p', {
  text: 'strokeLinecap: "round" ou "square" pour arrondir le début et la fin de la progression',
  css: {
	color: '#6c757d',
	textAlign: 'center',
	marginBottom: '30px',
	fontStyle: 'italic'
  }
});
roundedProgressSection.appendChild(roundedProgressDescription);

const roundedProgressContainer = $('div', {
  css: {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
	gap: '30px',
	padding: '20px'
  }
});

// Exemple 1: strokeLinecap "round"
const roundExample1Container = $('div', {
  css: {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: '15px'
  }
});

const roundExample1Title = $('h4', {
  text: 'strokeLinecap: "round"',
  css: { color: '#e67e22', margin: '0', textAlign: 'center', fontSize: '14px' }
});

const roundExample1Slider = Slider({
  type: 'circular',
  radius: 70,
  value: 70,
  min: 0,
  max: 100,
  handleOffset: -5,
  showLabel: true,
  skin: {
	track: {
	  backgroundColor: 'transparent',
	  border: '8px solid #fdeaa7',
	  borderRadius: '50%'
	},
	progression: {
	  stroke: '#e67e22',
	  strokeWidth: '8',
	  fill: 'none',
	  strokeLinecap: 'round' // ✨ Arrondis aux extrémités
	},
	handle: {
	  width: '18px',
	  height: '18px',
	  backgroundColor: '#ffffff',
	  border: '3px solid #e67e22',
	  borderRadius: '50%',
	  boxShadow: '0 2px 8px rgba(230, 126, 34, 0.4)',
	  cursor: 'pointer'
	},
	label: {
	  fontSize: '16px',
	  fontWeight: 'bold',
	  color: '#e67e22',
	  backgroundColor: '#ffffff',
	  padding: '6px 10px',
	  borderRadius: '50%',
	  border: '2px solid #e67e22',
	  top: '50%',
	  left: '50%',
	  transform: 'translate(-50%, -50%)',
	  minWidth: '35px',
	  textAlign: 'center'
	}
  }
});

roundExample1Container.appendChild(roundExample1Title);
roundExample1Container.appendChild(roundExample1Slider);
roundedProgressContainer.appendChild(roundExample1Container);

// Exemple 2: strokeLinecap "square" 
const roundExample2Container = $('div', {
  css: {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: '15px'
  }
});

const roundExample2Title = $('h4', {
  text: 'strokeLinecap: "square"',
  css: { color: '#9b59b6', margin: '0', textAlign: 'center', fontSize: '14px' }
});

const roundExample2Slider = Slider({
  type: 'circular',
  radius: 70,
  value: 45,
  min: 0,
  max: 100,
  handleOffset: -5,
  showLabel: true,
  skin: {
	track: {
	  backgroundColor: 'transparent',
	  border: '8px solid #e8daef',
	  borderRadius: '50%'
	},
	progression: {
	  stroke: '#9b59b6',
	  strokeWidth: '8',
	  fill: 'none',
	  strokeLinecap: 'square' // ✨ Extrémités carrées (légèrement saillantes)
	},
	handle: {
	  width: '18px',
	  height: '18px',
	  backgroundColor: '#ffffff',
	  border: '3px solid #9b59b6',
	  borderRadius: '50%',
	  boxShadow: '0 2px 8px rgba(155, 89, 182, 0.4)',
	  cursor: 'pointer'
	},
	label: {
	  fontSize: '16px',
	  fontWeight: 'bold',
	  color: '#9b59b6',
	  backgroundColor: '#ffffff',
	  padding: '6px 10px',
	  borderRadius: '50%',
	  border: '2px solid #9b59b6',
	  top: '50%',
	  left: '50%',
	  transform: 'translate(-50%, -50%)',
	  minWidth: '35px',
	  textAlign: 'center'
	}
  }
});

roundExample2Container.appendChild(roundExample2Title);
roundExample2Container.appendChild(roundExample2Slider);
roundedProgressContainer.appendChild(roundExample2Container);

// Exemple 3: strokeLinecap "butt" (défaut, pas d'arrondis)
const roundExample3Container = $('div', {
  css: {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: '15px'
  }
});

const roundExample3Title = $('h4', {
  text: 'strokeLinecap: "butt" (défaut)',
  css: { color: '#34495e', margin: '0', textAlign: 'center', fontSize: '14px' }
});

const roundExample3Slider = Slider({
  type: 'circular',
  radius: 70,
  value: 25,
  min: 0,
  max: 100,
  handleOffset: -5,
  showLabel: true,
  skin: {
	track: {
	  backgroundColor: 'transparent',
	  border: '8px solid #ecf0f1',
	  borderRadius: '50%'
	},
	progression: {
	  stroke: '#34495e',
	  strokeWidth: '8',
	  fill: 'none',
	  strokeLinecap: 'butt' // ✨ Pas d'arrondis (défaut)
	},
	handle: {
	  width: '18px',
	  height: '18px',
	  backgroundColor: '#ffffff',
	  border: '3px solid #34495e',
	  borderRadius: '50%',
	  boxShadow: '0 2px 8px rgba(52, 73, 94, 0.4)',
	  cursor: 'pointer'
	},
	label: {
	  fontSize: '16px',
	  fontWeight: 'bold',
	  color: '#34495e',
	  backgroundColor: '#ffffff',
	  padding: '6px 10px',
	  borderRadius: '50%',
	  border: '2px solid #34495e',
	  top: '50%',
	  left: '50%',
	  transform: 'translate(-50%, -50%)',
	  minWidth: '35px',
	  textAlign: 'center'
	}
  }
});

roundExample3Container.appendChild(roundExample3Title);
roundExample3Container.appendChild(roundExample3Slider);
roundedProgressContainer.appendChild(roundExample3Container);

roundedProgressSection.appendChild(roundedProgressContainer);
demoContainer.appendChild(roundedProgressSection);

// === SLIDER CIRCULAIRE AVEC ZONE DE DRAG LIMITÉE ===
const limitedDragSection = $('div', {
  css: {
    backgroundColor: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '40px'
  }
});

const limitedDragTitle = $('h2', {
  text: 'Slider Circulaire - Zone de Drag Limitée',
  css: {
    color: '#495057',
    marginBottom: '30px',
    textAlign: 'center'
  }
});
limitedDragSection.appendChild(limitedDragTitle);

const limitedDragDescription = $('p', {
  text: 'Plage totale: 200-800 (cercle complet) • Zone de drag: 400-500 (petite portion) • Progression selon zone de drag',
  css: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: '14px',
    marginBottom: '30px',
    backgroundColor: '#f8f9fa',
    padding: '10px',
    borderRadius: '6px'
  }
});
limitedDragSection.appendChild(limitedDragDescription);

const limitedDragContainer = $('div', {
  css: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '250px',
    padding: '20px'
  }
});

const limitedDragSlider = Slider({
  type: 'circular',
  radius: 80,
  value: 450,         // Valeur initiale
  min: 200,           // Plage totale minimum (cercle complet)
  max: 800,           // Plage totale maximum (cercle complet)
  handleOffset: 0,
  dragMin: 400,       // Zone de drag minimum (petite portion)
  dragMax: 500,       // Zone de drag maximum (petite portion)
  showLabel: true,
  onInput: (value) => {
    console.log('Valeur:', value, '(plage totale 200-800, drag 400-500)');
  },
  skin: {
    track: {
      backgroundColor: 'transparent',
      border: '6px solid #dee2e6',
      borderRadius: '50%'
    },
    progression: {
      stroke: '#20c997',
      strokeLinecap: 'round',
      strokeWidth: '6',
      fill: 'none'
    },
    handle: {
      width: '24px',
      height: '24px',
      backgroundColor: '#ffffff',
      border: '3px solid #20c997',
      borderRadius: '50%',
      boxShadow: '0 3px 10px rgba(32, 201, 151, 0.4)'
    },
    label: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#20c997'
    }
  }
});

limitedDragContainer.appendChild(limitedDragSlider);
limitedDragSection.appendChild(limitedDragContainer);

const limitedDragInfo = $('div', {
  css: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: '12px',
    marginTop: '15px',
    lineHeight: '1.4'
  }
});

// Ajouter les lignes d'info une par une
limitedDragInfo.appendChild($('div', { text: '• Le handle se positionne selon la plage totale (200-800 = cercle complet)' }));
limitedDragInfo.appendChild($('div', { text: '• Vous ne pouvez le déplacer que dans la zone 400-500' }));
limitedDragInfo.appendChild($('div', { text: '• La progression suit la zone de drag (400=0%, 500=100%)' }));
limitedDragSection.appendChild(limitedDragInfo);

