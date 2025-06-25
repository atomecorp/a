


const testWave = new WaveSurferCompatible({
    attach: 'body',
    x: 100, y: 100,
    width: 800, height: 170,
    url: './assets/audios/riff.m4a',
    waveColor: '#4A90E2',
    progressColor: '#2ECC71',
    
    interactionMode: 'scrub', // Commencer en mode scrub
    
    timeline: { enabled: true, height: 25 },
    regions: { enabled: true },
    
    controls: {
        enabled: true,
        play: true,
        pause: true,
        modeToggle: true, // Le bouton qui nous intéresse
        loop: true,
        clearRegions: true // Bouton pour supprimer les régions
    }
});
