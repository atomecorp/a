console.log('🔥 VERSION MODIFIÉE - Test de Unit.js - ' + new Date().toISOString());

/**
 * Exemple d'utilisation du composant Unit
 */

// Créer quelques units de test avec des couleurs de fond différentes
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

// Unit 4: Mixer avec couleur de fond vert pastel
const unit4 = Unit({
  id: 'mixer',
  name: 'Mixer',
  position: { x: 200, y: 300 },
  backgroundColor: '#e8f5e8', // Vert pastel très clair
  inputs: [
    { name: 'Input 1', color: '#4ecdc4' },
    { name: 'Input 2', color: '#4ecdc4' }
  ],
  outputs: [
    { name: 'Mix Out', color: '#ff6b6b' }
  ],
  icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJ2MjBtLTQtMTZ2MTJtOC0xMnYxMiIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8Y2lyY2xlIGN4PSI4IiBjeT0iMTAiIHI9IjIiIGZpbGw9IiM2NjYiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSI2IiByPSIyIiBmaWxsPSIjNjY2Ii8+CjxjaXJjbGUgY3g9IjE2IiBjeT0iMTQiIHI9IjIiIGZpbGw9IiM2NjYiLz4KPC9zdmc+'
});

// Unit 5: Multi-Effect Processor avec couleur de fond bleu pastel
const unit5 = Unit({
  id: 'multi-effect',
  name: 'Multi-Effect',
  position: { x: 450, y: 450 },
  backgroundColor: '#e6f3ff', // Bleu pastel très clair
  inputs: [
    { name: 'Audio L', color: '#ff6b6b' },     // Rouge pour l'audio gauche
    { name: 'Audio R', color: '#ff8e53' },     // Orange pour l'audio droit
    { name: 'Wet/Dry', color: '#26de81' },     // Vert pour le contrôle wet/dry
    { name: 'Bypass', color: '#45aaf2' },      // Bleu pour le bypass
    { name: 'Tempo', color: '#f39c12' }        // Orange pour le tempo
  ],
  outputs: [
    { name: 'Out L', color: '#ff6b6b' },       // Rouge pour la sortie gauche
    { name: 'Out R', color: '#ff8e53' },       // Orange pour la sortie droite
    { name: 'Send 1', color: '#a55eea' },      // Violet pour le send 1
    { name: 'Send 2', color: '#26de81' }       // Vert pour le send 2
  ],
  icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiByeD0iNCIgc3Ryb2tlPSIjNjY2IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjIiIGZpbGw9IiM2NjYiLz4KPGNpcmNsZSBjeD0iMTYiIGN5PSI4IiByPSIyIiBmaWxsPSIjNjY2Ii8+CjxjaXJjbGUgY3g9IjgiIGN5PSIxNiIgcj0iMiIgZmlsbD0iIzY2NiIvPgo8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIyIiBmaWxsPSIjNjY2Ii8+CjxsaW5lIHgxPSIxMiIgeTE9IjQiIHgyPSIxMiIgeTI9IjIwIiBzdHJva2U9IiM2NjYiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4='
});

// Unit 6: Synthesizer avec couleur de fond rose pastel
const unit6 = Unit({
  id: 'synthesizer',
  name: 'Synthesizer',
  position: { x: 750, y: 350 },
  backgroundColor: '#ffe6f2', // Rose pastel très clair
  inputs: [
    { name: 'MIDI In', color: '#9b59b6' },     // Violet pour MIDI
    { name: 'Pitch Bend', color: '#e67e22' },  // Orange pour pitch bend
    { name: 'Mod Wheel', color: '#3498db' },   // Bleu pour modulation
    { name: 'Filter CV', color: '#1abc9c' },   // Turquoise pour control voltage
    { name: 'Gate', color: '#e74c3c' }         // Rouge pour le gate
  ],
  outputs: [
    { name: 'Audio Out', color: '#ff6b6b' },   // Rouge pour l'audio
    { name: 'Filter Env', color: '#27ae60' },  // Vert pour l'envelope de filtre
    { name: 'Amp Env', color: '#f1c40f' },     // Jaune pour l'envelope d'amplitude
    { name: 'LFO Out', color: '#8e44ad' }      // Violet pour le LFO
  ],
  icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMgMTJoM2wzIDZoM2wzLTEyaDNsMyA2aDMiIHN0cm9rZT0iIzY2NiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxOCIgcj0iMiIgZmlsbD0iIzY2NiIvPgo8L3N2Zz4='
});

console.log('Units créés:', { unit1, unit2, unit3, unit4, unit5, unit6 });

// Test des événements de clic sur tous les units
unit1.element.addEventListener('click', () => {
  unit1.onClick();
  console.log('🎵 Audio Input cliqué!');
});

unit2.element.addEventListener('click', () => {
  unit2.onClick();
  console.log('⚙️ Audio Processor cliqué!');
});

unit3.element.addEventListener('click', () => {
  unit3.onClick();
  console.log('🔊 Audio Output cliqué!');
});

unit4.element.addEventListener('click', () => {
  unit4.onClick();
  console.log('🎛️ Mixer (vert pastel) cliqué!');
});

unit5.element.addEventListener('click', () => {
  unit5.onClick();
  console.log('🎚️ Multi-Effect (bleu pastel) cliqué!');
});

unit6.element.addEventListener('click', () => {
  unit6.onClick();
  console.log('🎼 Synthesizer (rose pastel) cliqué!');
});

setTimeout(() => {
  console.log('=== Test des APIs avec tous les units ===');
  
  // Sélectionner plusieurs units de types différents
  Unit.selectUnits(['synthesizer', 'multi-effect', 'mixer']);
  console.log('Units sélectionnés:', Unit.getSelectedUnits());
  
  // Affichage des informations sur tous les units créés
  console.log('📊 Statistiques des units:');
  console.log('- Unit 1 (Audio Input): 0 entrées, 1 sortie');
  console.log('- Unit 2 (Audio Processor): 1 entrée, 1 sortie');
  console.log('- Unit 3 (Audio Output): 1 entrée, 0 sortie');
  console.log('- Unit 4 (Mixer): 2 entrées, 1 sortie - 🎨 Fond vert pastel');
  console.log('- Unit 5 (Multi-Effect): 5 entrées, 4 sorties - 🎨 Fond bleu pastel');
  console.log('- Unit 6 (Synthesizer): 5 entrées, 4 sorties - 🎨 Fond rose pastel');
  
  // Instructions pour les connexions
  console.log('🔗 Pour connecter des units:');
  console.log('1. Cliquez sur un connecteur de sortie (rond, à droite)');
  console.log('2. Puis cliquez sur un connecteur d\'entrée compatible (rond, à gauche)');
  console.log('3. Ou faites un drag & drop d\'un connecteur vers un autre');
  console.log('4. Les couleurs indiquent les types de signaux (audio, MIDI, control, etc.)');
  
  // Exemples de connexions suggérées
  console.log('💡 Exemples de connexions suggérées:');
  console.log('- Synthesizer → Multi-Effect (Audio Out rouge vers Audio L rouge)');
  console.log('- Multi-Effect → Audio Output (Out L rouge vers Audio In rouge)');
  console.log('- Audio Input → Mixer (Audio Out rouge vers Input 1 turquoise)');
  console.log('- Mixer → Audio Processor (Mix Out rouge vers Audio In rouge)');
  
  // Lister toutes les connexions
  console.log('🔍 Connexions actives:', Unit.getAllConnections());
  
}, 3000);