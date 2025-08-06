   // Console redefinition
        window.console.log = (function(oldLog) {
            return function(message) {
                oldLog(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("LOG: " + message);
                } catch(e) {
                    oldLog();
                }
            }
        })(window.console.log);

        window.console.error = (function(oldErr) {
            return function(message) {
                oldErr(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("ERROR: " + message);
                } catch(e) {
                    oldErr();
                }
            }
        })(window.console.error);

// === COMPOSANT TONE.JS SIMPLE POUR AUV3 ===
console.log('🎹 Initialisation composant Tone.js pour AUv3');

// Fonction pour créer un composant audio simple
function createAUv3ToneComponent() {
    console.log('🚀 Création composant AUv3 Tone.js...');
    
    // Nettoyer le conteneur
    const view = document.getElementById('view');
    if (view) {
        view.innerHTML = '';
    }
    
    // Créer le titre
    const title = document.createElement('h1');
    title.textContent = '🎹 AUv3 Tone.js Component';
    title.style.cssText = `
        font-size: 24px;
        font-weight: bold;
        color: #3498db;
        text-align: center;
        margin: 20px 0;
        font-family: Arial, sans-serif;
    `;
    view.appendChild(title);
    
    // Créer le conteneur principal
    const container = document.createElement('div');
    container.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 15px;
        padding: 30px;
        margin: 20px auto;
        width: 90%;
        max-width: 600px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;
    view.appendChild(container);
    
    // Status display
    const status = document.createElement('div');
    status.id = 'auv3-status';
    status.textContent = '✅ AUv3 Tone.js Component Ready';
    status.style.cssText = `
        text-align: center;
        padding: 15px;
        background-color: rgba(255,255,255,0.2);
        border-radius: 10px;
        color: white;
        margin-bottom: 25px;
        font-size: 16px;
        font-weight: bold;
    `;
    container.appendChild(status);
    
    // Vérifier que Button et Tone sont disponibles
    if (typeof Button === 'undefined') {
        status.textContent = '❌ Button component not available';
        return;
    }
    
    if (typeof Tone === 'undefined') {
        status.textContent = '❌ Tone.js not available';
        return;
    }
    
    // Créer un synthétiseur global
    let synth = null;
    let isInitialized = false;
    
    // === BRIDGE COMMUNICATION AVEC L'HOST AUV3 ===
    function sendNoteToHost(note, velocity = 127, duration = 0.5) {
        console.log(`🎹 Envoi note à l'host: ${note}, velocity: ${velocity}, duration: ${duration}`);
        
        try {
            // Envoyer la commande MIDI à l'host via webkit messageHandlers
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.auv3) {
                const midiMessage = {
                    type: 'noteOn',
                    note: note,
                    velocity: velocity,
                    duration: duration,
                    timestamp: Date.now()
                };
                
                window.webkit.messageHandlers.auv3.postMessage(JSON.stringify(midiMessage));
                console.log('✅ Message MIDI envoyé à l\'host:', midiMessage);
                return true;
            } else {
                console.warn('⚠️ Bridge AUv3 non disponible, fallback Tone.js');
                return false;
            }
        } catch (error) {
            console.error('❌ Erreur bridge AUv3:', error);
            return false;
        }
    }
    
    function sendChordToHost(notes, velocity = 127, duration = 2.0) {
        console.log(`🎼 Envoi accord à l'host: ${notes.join(', ')}`);
        
        try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.auv3) {
                const chordMessage = {
                    type: 'chord',
                    notes: notes,
                    velocity: velocity,
                    duration: duration,
                    timestamp: Date.now()
                };
                
                window.webkit.messageHandlers.auv3.postMessage(JSON.stringify(chordMessage));
                console.log('✅ Accord envoyé à l\'host:', chordMessage);
                return true;
            } else {
                console.warn('⚠️ Bridge AUv3 non disponible pour accord');
                return false;
            }
        } catch (error) {
            console.error('❌ Erreur bridge accord:', error);
            return false;
        }
    }
    
    function sendSequenceToHost(notes, timing = 0.3) {
        console.log(`🎵 Envoi séquence à l'host: ${notes.join(' -> ')}`);
        
        try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.auv3) {
                const sequenceMessage = {
                    type: 'sequence',
                    notes: notes,
                    timing: timing,
                    velocity: 100,
                    timestamp: Date.now()
                };
                
                window.webkit.messageHandlers.auv3.postMessage(JSON.stringify(sequenceMessage));
                console.log('✅ Séquence envoyée à l\'host:', sequenceMessage);
                return true;
            } else {
                console.warn('⚠️ Bridge AUv3 non disponible pour séquence');
                return false;
            }
        } catch (error) {
            console.error('❌ Erreur bridge séquence:', error);
            return false;
        }
    }
    
    // Boutons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 25px;
    `;
    container.appendChild(buttonsContainer);
    
    // Bouton d'initialisation
    const initBtn = Button({
        text: '🎹 Init AUv3 Host',
        parent: buttonsContainer,
        onClick: async () => {
            console.log('🎹 Test connexion AUv3 Host...');
            status.textContent = '🎹 Test connexion Host...';
            
            try {
                // Tester la connexion avec l'host
                if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.auv3) {
                    // Envoyer un message de test
                    const testMessage = {
                        type: 'init',
                        timestamp: Date.now(),
                        webViewReady: true
                    };
                    
                    window.webkit.messageHandlers.auv3.postMessage(JSON.stringify(testMessage));
                    
                    isInitialized = true;
                    status.textContent = '✅ Connexion AUv3 Host établie !';
                    initBtn.updateText('✅ Host Connecté');
                    console.log('✅ Connexion AUv3 Host réussie');
                    
                } else {
                    // Fallback Tone.js si pas d'host
                    console.log('⚠️ Host AUv3 non détecté, fallback Tone.js...');
                    await Tone.start();
                    synth = new Tone.Synth().toDestination();
                    isInitialized = true;
                    
                    status.textContent = '✅ Fallback Tone.js activé';
                    initBtn.updateText('✅ Tone.js');
                }
                
            } catch (error) {
                console.error('❌ Erreur init:', error);
                status.textContent = '❌ Erreur: ' + error.message;
            }
        },
        css: {
            padding: '15px',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
        }
    });
    
    // Notes de piano
    const notes = [
        { note: 'C4', label: 'Do', color: '#e74c3c' },
        { note: 'D4', label: 'Ré', color: '#e67e22' },
        { note: 'E4', label: 'Mi', color: '#f39c12' },
        { note: 'F4', label: 'Fa', color: '#f1c40f' },
        { note: 'G4', label: 'Sol', color: '#2ecc71' },
        { note: 'A4', label: 'La', color: '#3498db' },
        { note: 'B4', label: 'Si', color: '#9b59b6' },
        { note: 'C5', label: 'Do+', color: '#e91e63' }
    ];
    
    // Fonction pour convertir note en MIDI
    function noteToMidi(note) {
        const noteMap = {
            'C4': 60, 'D4': 62, 'E4': 64, 'F4': 65,
            'G4': 67, 'A4': 69, 'B4': 71, 'C5': 72
        };
        return noteMap[note] || 60;
    }
    
    // Créer les boutons de notes
    notes.forEach(noteInfo => {
        const noteBtn = Button({
            text: `${noteInfo.label}`,
            parent: buttonsContainer,
            onClick: async () => {
                console.log(`🎵 Note jouée: ${noteInfo.note}`);
                
                if (!isInitialized) {
                    status.textContent = '⚠️ Initialisez d\'abord la connexion !';
                    return;
                }
                
                try {
                    // Essayer d'abord l'host AUv3
                    const hostSuccess = sendNoteToHost(noteToMidi(noteInfo.note), 127, 0.5);
                    
                    if (hostSuccess) {
                        status.textContent = `🎵 ${noteInfo.label} (${noteInfo.note}) -> HOST`;
                    } else {
                        // Fallback Tone.js
                        if (synth) {
                            synth.triggerAttackRelease(noteInfo.note, "8n");
                            status.textContent = `🎵 ${noteInfo.label} (${noteInfo.note}) -> Tone.js`;
                        } else {
                            status.textContent = '❌ Aucun synthé disponible';
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ Erreur note:', error);
                    status.textContent = '❌ Erreur: ' + error.message;
                }
            },
            css: {
                padding: '15px',
                backgroundColor: noteInfo.color,
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                transition: 'transform 0.1s'
            }
        });
        
        // Effet hover
        noteBtn.addEventListener('mousedown', () => {
            noteBtn.style.transform = 'scale(0.95)';
        });
        
        noteBtn.addEventListener('mouseup', () => {
            noteBtn.style.transform = 'scale(1)';
        });
    });
    
    // Boutons avancés
    const advancedContainer = document.createElement('div');
    advancedContainer.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
    `;
    container.appendChild(advancedContainer);
    
    // Accord
    const chordBtn = Button({
        text: '🎼 Accord C Maj',
        parent: advancedContainer,
        onClick: async () => {
            console.log('🎼 Accord C Majeur...');
            
            if (!isInitialized) {
                status.textContent = '⚠️ Initialisez d\'abord la connexion !';
                return;
            }
            
            try {
                const chordNotes = [60, 64, 67]; // C4, E4, G4 en MIDI
                
                // Essayer l'host d'abord
                const hostSuccess = sendChordToHost(chordNotes, 120, 2.0);
                
                if (hostSuccess) {
                    status.textContent = '🎼 Accord C Majeur -> HOST !';
                } else {
                    // Fallback Tone.js
                    if (synth) {
                        const chordNotesNames = ['C4', 'E4', 'G4'];
                        const now = Tone.now();
                        
                        chordNotesNames.forEach((note, i) => {
                            synth.triggerAttackRelease(note, "2n", now + i * 0.01);
                        });
                        
                        status.textContent = '🎼 Accord C Majeur -> Tone.js !';
                    } else {
                        status.textContent = '❌ Aucun synthé disponible';
                    }
                }
                
            } catch (error) {
                console.error('❌ Erreur accord:', error);
                status.textContent = '❌ Erreur: ' + error.message;
            }
        },
        css: {
            padding: '12px 20px',
            backgroundColor: '#8e44ad',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
        }
    });
    
    // Mélodie
    const melodyBtn = Button({
        text: '🎵 Mélodie',
        parent: advancedContainer,
        onClick: async () => {
            console.log('🎵 Mélodie simple...');
            
            if (!isInitialized) {
                status.textContent = '⚠️ Initialisez d\'abord la connexion !';
                return;
            }
            
            try {
                const melodyMidi = [60, 64, 67, 72, 67, 64, 60]; // C4, E4, G4, C5, G4, E4, C4
                
                // Essayer l'host d'abord
                const hostSuccess = sendSequenceToHost(melodyMidi, 0.3);
                
                if (hostSuccess) {
                    status.textContent = '🎵 Mélodie -> HOST en cours...';
                    
                    setTimeout(() => {
                        status.textContent = '✅ Mélodie HOST terminée !';
                    }, melodyMidi.length * 300);
                } else {
                    // Fallback Tone.js
                    if (synth) {
                        const melodyNames = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'];
                        let time = Tone.now();
                        
                        melodyNames.forEach((note, i) => {
                            synth.triggerAttackRelease(note, "8n", time + i * 0.3);
                        });
                        
                        status.textContent = '🎵 Mélodie -> Tone.js en cours...';
                        
                        setTimeout(() => {
                            status.textContent = '✅ Mélodie Tone.js terminée !';
                        }, melodyNames.length * 300);
                    } else {
                        status.textContent = '❌ Aucun synthé disponible';
                    }
                }
                
            } catch (error) {
                console.error('❌ Erreur mélodie:', error);
                status.textContent = '❌ Erreur: ' + error.message;
            }
        },
        css: {
            padding: '12px 20px',
            backgroundColor: '#16a085',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold'
        }
    });
    
    console.log('✅ Composant AUv3 Tone.js créé avec succès');
}

// Lancer la création du composant
console.log('🚀 Lancement composant AUv3 Tone.js...');
createAUv3ToneComponent();