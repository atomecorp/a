//   <div id="timecode" style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 14px; z-index: 1000;">
//     Timecode: --
//   </div>

$('div', {
  // pas besoin de 'tag'
  id: 'timecode',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
});

function fct_to_trig(state) {
    console.log('trig: ' + state);
}

function fct_to_trig2(state) {
    console.log('trigger 2 : ' + state);
}

// Fonction pour recevoir et afficher le timecode depuis AUv3
function updateTimecode(timecodeMs) {
    console.log('🎵 Timecode reçu:', timecodeMs, 'ms');
    
    // Convertir en secondes pour un affichage plus lisible
    const seconds = (timecodeMs / 1000).toFixed(3);
    console.log('🎵 Position:', seconds, 'secondes');
    
    // Utiliser la div timecode créée dynamiquement
    const timecodeElement = document.getElementById('timecode');
    if (timecodeElement) {
        timecodeElement.textContent = `${seconds}s`;
    }
}

// Fonction pour recevoir les informations de transport depuis AUv3
function displayTransportInfo(isPlaying, playheadPosition, sampleRate) {
    console.log('🎵 Transport Info:');
    console.log('  - Is Playing:', isPlaying);
    console.log('  - Playhead Position:', playheadPosition);
    console.log('  - Sample Rate:', sampleRate);
    
    // Convertir la position en millisecondes si nécessaire
    const positionMs = (playheadPosition / sampleRate) * 1000;
    
    // Mettre à jour l'affichage du timecode
    updateTimecode(positionMs);
    
    // Optionnel : ajouter un indicateur de lecture/pause
    const timecodeElement = document.getElementById('timecode');
    if (timecodeElement) {
        const seconds = (positionMs / 1000).toFixed(3);
        const playIcon = isPlaying ? '▶️' : '⏸️';
        timecodeElement.textContent = `${playIcon} ${seconds}s`;
        
        // Changer la couleur selon l'état
        timecodeElement.style.backgroundColor = isPlaying ? '#0a0' : '#a00';
    }
}

// Rendre les fonctions globales pour qu'elles soient accessibles depuis Swift
window.updateTimecode = updateTimecode;
window.displayTransportInfo = displayTransportInfo;
// console.log(Button.templates)
// const toggle = Button({
//     onText: 'ON',
//     offText: 'OFF',
//         template: 'bootstrap_primary',
//     // onAction: fct_to_trig,
//     // offAction: fct_to_trig2,
//     //   onStyle: {
//     //     backgroundColor: 'rgba(99,99,99,1)',
//     //   boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
//     //      color: 'pink',
//     // },
//     // offStyle: { backgroundColor: '#dc3545', color: 'white' },
//     parent: '#view', // parent direct
  
// });

const toggle = Button({
    onText: 'ON',
    offText: 'OFF',
    css: {
        position: 'absolute',
        top: '10px',
        left: '10px',
    },
    template: 'squirrel_design',
    onAction: fct_to_trig,     
    offAction: fct_to_trig2,   
    parent: '#view'
});







