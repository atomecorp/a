console.log('🔥 VERSION MODIFIÉE - Test de Unit.js - ' + new Date().toISOString());

/**
 * Exemple d'utilisation du composant Unit
 */

// Créer quelques units de test
const unit1 = Unit({
  id: 'audio-input',
  name: 'Audio Input',
  position: { x: 100, y: 100 },
  inputs: [],
  outputs: [
    { name: 'Audio Out', color: '#ff6b6b' }
  ],
  iconSrc: 'assets/images/icons/microphone.svg'
});

const unit2 = Unit({
  id: 'audio-processor',
  name: 'Audio Processor',
  position: { x: 350, y: 100 },
  inputs: [
    { name: 'Audio In', color: '#ff6b6b' }
  ],
  outputs: [
    { name: 'Audio Out', color: '#ff6b6b' }
  ],
  iconSrc: 'assets/images/icons/equalizer.svg'
});

const unit3 = Unit({
  id: 'audio-output',
  name: 'Audio Output',
  position: { x: 600, y: 100 },
  inputs: [
    { name: 'Audio In', color: '#ff6b6b' }
  ],
  outputs: [],
  iconSrc: 'assets/images/icons/speaker.svg'
});

// Exemple avec une icône base64
const unit4 = Unit({
  id: 'mixer',
  name: 'Mixer',
  position: { x: 200, y: 300 },
  inputs: [
    { name: 'Input 1', color: '#4ecdc4' },
    { name: 'Input 2', color: '#4ecdc4' }
  ],
  outputs: [
    { name: 'Mix Out', color: '#ff6b6b' }
  ],
  icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJ2MjBtLTQtMTZ2MTJtOC0xMnYxMiIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8Y2lyY2xlIGN4PSI4IiBjeT0iMTAiIHI9IjIiIGZpbGw9IiM2NjYiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSI2IiByPSIyIiBmaWxsPSIjNjY2Ii8+CjxjaXJjbGUgY3g9IjE2IiBjeT0iMTQiIHI9IjIiIGZpbGw9IiM2NjYiLz4KPC9zdmc+'
});

console.log('Units créés:', { unit1, unit2, unit3, unit4 });

// Test des événements de clic
unit1.element.addEventListener('click', () => {
  unit1.onClick();
  console.log('Unit 1 cliqué!');
});

unit2.element.addEventListener('click', () => {
  unit2.onClick();
  console.log('Unit 2 cliqué!');
});

setTimeout(() => {
  console.log('=== Test des APIs ===');
  
  // Sélectionner plusieurs units
  Unit.selectUnits(['audio-input', 'audio-processor']);
  console.log('Units sélectionnés:', Unit.getSelectedUnits());
  
  // Connecter deux units (vous devrez cliquer sur les connecteurs)
  console.log('Pour connecter, cliquez sur un connecteur de sortie puis sur un connecteur d\'entrée');
  
  // Lister toutes les connexions
  console.log('Connexions actives:', Unit.getAllConnections());
  
}, 2000);
