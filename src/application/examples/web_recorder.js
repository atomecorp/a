// Fonction utilitaire pour formater le temps en timecode HH:MM:SS
function formatTimecode(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

const output = $('div', {
  parent: '#view',
  id: 'demo-output',
  css: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
    minHeight: '40px',
    fontFamily: 'monospace',
    fontSize: '16px'
  },
  text: 'Cliquez sur lecture pour voir le timecode.'
});


const videoElement = $('video', {
  parent: '#view',
  id: 'demo-video',
  attrs: {
    src: './assets/videos/avengers.mp4',
    controls: true,
    width: 400,
    height: 225
  },
  css: {
    margin: '16px auto',
    display: 'block',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
  },
  onplay: () => {
    console.log('Video play event triggered');
    output.$({ text: '🎬 Vidéo en cours de lecture - Timecode: ' + formatTimecode(videoElement.currentTime) });
  },
  onpause: () => {
    console.log('Video pause event triggered');
    output.$({ text: '⏸️ Vidéo en pause - Timecode: ' + formatTimecode(videoElement.currentTime) });
  },
  onended: () => {
    console.log('Video ended event triggered');
    output.$({ text: '🎭 Lecture vidéo terminée - Durée totale: ' + formatTimecode(videoElement.duration) });
  },
  onerror: (e) => {
    console.log('Video error:', e);
    output.$({ text: '❌ Erreur lors du chargement de la vidéo' });
  },
  ontimeupdate: () => {
    // Mise à jour du timecode en temps réel pendant la lecture
    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration || 0;
    const progress = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
    
    output.$({ 
      text: `⏱️ Timecode: ${formatTimecode(currentTime)} / ${formatTimecode(duration)} (${progress}%)`
    });
  },
  onloadedmetadata: () => {
    // Affiche la durée totale une fois les métadonnées chargées
    console.log('Video metadata loaded');
    output.$({ 
      text: `📹 Vidéo chargée - Durée: ${formatTimecode(videoElement.duration)} - Prêt à jouer`
    });
  },
  onseeked: () => {
    // Mise à jour quand l'utilisateur navigue dans la vidéo
    console.log('Video seeked to:', videoElement.currentTime);
    output.$({ 
      text: `🎯 Position: ${formatTimecode(videoElement.currentTime)} / ${formatTimecode(videoElement.duration)}`
    });
  }
});



function fct_to_trig(state) {
    console.log('trig: ' + state);
}

function fct_to_trig2(state) {
    console.log('trigger 2 : ' + state);
}

// === EXEMPLE 1: Votre bouton existant ===
const toggle = Button({
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view', // parent direct
    onStyle: { backgroundColor: '#28a745', color: 'white' },
    offStyle: { backgroundColor: '#dc3545', color: 'white' },
    css: {
        width: '50px',
        height: '24px',
        left: '120px',
        top: '120px',
        borderRadius: '6px',
        backgroundColor: 'orange',
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
        border: '3px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 4px rgba(255,255,1,1)',
    }
});
