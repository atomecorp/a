/**
 * 🎯 Test simple des modes interaction WaveSurfer
 * JUSTE pour tester le switching entre scrub et selection
 */

console.log('🎯 === TEST SIMPLE DES MODES ===');

// UN SEUL exemple pour tester
const testWave = new WaveSurferCompatible({
    attach: 'body',
    x: 100, y: 100,
    width: 800, height: 140,
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

// Message simple pour l'utilisateur
const message = document.createElement('div');
message.style.cssText = `
    position: absolute;
    top: 50px;
    left: 100px;
    font-size: 16px;
    font-weight: bold;
    color: #333;
`;
message.innerHTML = `
🎯 TEST DES MODES:<br>
• <strong>Mode SCRUB (🎯)</strong>: Clic = seek, Drag = scrub<br>
• <strong>Mode SELECTION (✋)</strong>: Clic = position, Drag = créer région<br>
• <strong>🗑️ Clear Regions</strong>: Supprimer toutes les régions<br>
<br>
👆 <strong>Cliquez sur le bouton 🎯/✋ pour changer de mode</strong>
`;
document.body.appendChild(message);

// Log les changements de mode
testWave.addEventListener('mode-changed', (event) => {
    const { newMode } = event.detail;
    console.log(`🔄 MODE CHANGÉ VERS: ${newMode.toUpperCase()}`);
    
    // Mettre à jour le message
    message.innerHTML = `
🎯 TEST DES MODES:<br>
• <strong>Mode SCRUB (🎯)</strong>: Clic = seek, Drag = scrub<br>
• <strong>Mode SELECTION (✋)</strong>: Clic = position, Drag = créer région<br>
• <strong>🗑️ Clear Regions</strong>: Supprimer toutes les régions<br>
<br>
👆 <strong>MODE ACTUEL: ${newMode.toUpperCase()}</strong>
    `;
});

console.log('✅ Test mode créé - utilisez le bouton 🎯/✋ pour changer de mode');
