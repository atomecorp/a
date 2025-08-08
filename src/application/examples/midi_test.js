/*
Teste les capacités MIDI output de l'AUv3
*/

console.log('🎼 Initialisation du test MIDI Output...');

// Interface de test MIDI
const midiTestInterface = $('div', {
    css: {
        position: 'absolute',
        top: '50px',
        left: '50px',
        width: '300px',
        padding: '20px',
        backgroundColor: '#f0f0f0',
        border: '2px solid #333',
        borderRadius: '10px',
        fontFamily: 'Arial, sans-serif'
    }
});

const title = $('h3', {
    text: '🎼 Test MIDI Output',
    css: { margin: '0 0 15px 0', color: '#333' }
});

const statusDiv = $('div', {
    text: 'Status: Initialisation...',
    css: {
        padding: '10px',
        backgroundColor: '#fff',
        border: '1px solid #ccc',
        borderRadius: '5px',
        marginBottom: '15px',
        fontFamily: 'monospace'
    }
});

const buttonContainer = $('div', {
    css: { display: 'flex', gap: '10px', flexWrap: 'wrap' }
});

// Boutons de test
const testButtons = [
    { note: 60, name: 'C4' },
    { note: 62, name: 'D4' },
    { note: 64, name: 'E4' },
    { note: 65, name: 'F4' },
    { note: 67, name: 'G4' },
    { note: 69, name: 'A4' },
    { note: 71, name: 'B4' }
];

// Fonction pour envoyer une note MIDI
function sendMIDINote(note, velocity = 100) {
    try {
        // Note On
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) {
            const noteOnMessage = {
                action: 'sendMidi',
                data: [0x90, note, velocity] // Note On, Channel 1
            };
            window.webkit.messageHandlers.swiftBridge.postMessage(noteOnMessage);
            
            updateStatus(`Sent Note ON: ${note} (vel: ${velocity})`);
            
            // Note Off après 500ms
            setTimeout(() => {
                const noteOffMessage = {
                    action: 'sendMidi',
                    data: [0x80, note, 0] // Note Off, Channel 1
                };
                window.webkit.messageHandlers.swiftBridge.postMessage(noteOffMessage);
                updateStatus(`Sent Note OFF: ${note}`);
            }, 500);
        } else {
            updateStatus('❌ Swift Bridge not available');
        }
    } catch (error) {
        updateStatus(`❌ Error: ${error.message}`);
    }
}

// Fonction pour mettre à jour le statut
function updateStatus(message) {
    statusDiv.text = `Status: ${message}`;
    console.log(`🎼 MIDI: ${message}`);
}

// Créer les boutons de test
testButtons.forEach(({note, name}) => {
    const button = $('button', {
        text: name,
        css: {
            padding: '8px 12px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '12px'
        },
        tap: () => sendMIDINote(note)
    });
    
    buttonContainer.add(button);
});

// Bouton pour tester toutes les notes en séquence
const sequenceButton = $('button', {
    text: '🎵 Play Sequence',
    css: {
        padding: '10px 15px',
        backgroundColor: '#2196F3',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontSize: '14px',
        width: '100%',
        marginTop: '10px'
    },
    tap: () => {
        updateStatus('Playing sequence...');
        testButtons.forEach(({note}, index) => {
            setTimeout(() => sendMIDINote(note, 80), index * 200);
        });
    }
});

// Assemblage de l'interface
midiTestInterface.add(title);
midiTestInterface.add(statusDiv);
midiTestInterface.add(buttonContainer);
midiTestInterface.add(sequenceButton);

// Test initial
updateStatus('Ready - Press buttons to test MIDI output');

// Test automatique au démarrage
setTimeout(() => {
    updateStatus('Auto-test: Sending test note...');
    sendMIDINote(60, 80);
}, 2000);
