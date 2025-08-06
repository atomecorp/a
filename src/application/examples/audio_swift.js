// Audio Swift Bridge - Simple example for AUv3 host communication with Squirrel Buttons
// This example generates audio in JavaScript and sends it to Swift for AUv3 processing

console.log("Loading Audio Swift Bridge example with Squirrel Buttons...");

// Functions pour les boutons
function switchMode(isAUv3Mode) {
    console.log("Mode switch clicked - AUv3 Mode:", isAUv3Mode);
    
    // Update global mode
    window.forceAUv3Mode = isAUv3Mode;
    
    const messageEl = document.getElementById('messageDisplay');
    const modeInfoEl = document.getElementById('modeInfo');
    const bridgeEl = document.getElementById('bridgeText');
    
    if (isAUv3Mode) {
        // Mode AUv3 forcé
        if (messageEl) {
            messageEl.textContent = '🎯 Mode AUv3 ACTIVÉ - Sons envoyés vers host';
            messageEl.style.color = '#4CAF50';
        }
        if (modeInfoEl) {
            modeInfoEl.textContent = '🎯 Mode AUv3: Les sons sont envoyés vers le host Swift (même sans bridge détecté)';
            modeInfoEl.style.color = '#4CAF50';
        }
        if (bridgeEl) {
            bridgeEl.textContent = 'Bridge: AUv3 Mode (forced)';
            bridgeEl.style.color = '#4CAF50';
        }
    } else {
        // Mode local
        if (messageEl) {
            messageEl.textContent = '🔊 Mode LOCAL ACTIVÉ - Sons joués dans le navigateur';
            messageEl.style.color = '#2196F3';
        }
        if (modeInfoEl) {
            modeInfoEl.textContent = '🔊 Mode Local: Les sons sont joués localement dans le navigateur pour test';
            modeInfoEl.style.color = '#2196F3';
        }
        if (bridgeEl) {
            bridgeEl.textContent = 'Bridge: Local Mode (forced)';
            bridgeEl.style.color = '#2196F3';
        }
    }
}
function playC4(state) {
    console.log("C4 button clicked - state:", state);
    const messageEl = document.getElementById('messageDisplay');
    if (messageEl) {
        if (state) {
            messageEl.textContent = '🎵 Bouton C4 ACTIVÉ - NOTE ON (261Hz)';
            messageEl.style.color = '#00ff00';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.playNote('C4', 261.63);
            }
        } else {
            messageEl.textContent = '⏹️ Bouton C4 DÉSACTIVÉ - NOTE OFF';
            messageEl.style.color = '#ff6600';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.stopNote('C4');
            }
        }
    }
}

function playA4(state) {
    console.log("A4 button clicked - state:", state);
    const messageEl = document.getElementById('messageDisplay');
    if (messageEl) {
        if (state) {
            messageEl.textContent = '🎵 Bouton A4 ACTIVÉ - NOTE ON (440Hz)';
            messageEl.style.color = '#00ff00';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.playNote('A4', 440);
            }
        } else {
            messageEl.textContent = '⏹️ Bouton A4 DÉSACTIVÉ - NOTE OFF';
            messageEl.style.color = '#ff6600';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.stopNote('A4');
            }
        }
    }
}

function playE5(state) {
    console.log("E5 button clicked - state:", state);
    const messageEl = document.getElementById('messageDisplay');
    if (messageEl) {
        if (state) {
            messageEl.textContent = '🎵 Bouton E5 ACTIVÉ - NOTE ON (659Hz)';
            messageEl.style.color = '#00ff00';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.playNote('E5', 659.25);
            }
        } else {
            messageEl.textContent = '⏹️ Bouton E5 DÉSACTIVÉ - NOTE OFF';
            messageEl.style.color = '#ff6600';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.stopNote('E5');
            }
        }
    }
}

function playChord(state) {
    console.log("Chord button clicked - state:", state);
    const messageEl = document.getElementById('messageDisplay');
    if (messageEl) {
        if (state) {
            messageEl.textContent = '🎼 Bouton CHORD ACTIVÉ - ACCORD ON (C Major)';
            messageEl.style.color = '#00ff00';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.playChord([261.63, 329.63, 392.00]);
            }
        } else {
            messageEl.textContent = '⏹️ Bouton CHORD DÉSACTIVÉ - ACCORD OFF';
            messageEl.style.color = '#ff6600';
            if (window.audioSwiftBridge) {
                window.audioSwiftBridge.stopChord();
            }
        }
    }
}

function stopAllAudio() {
    console.log("Stop All button clicked");
    const messageEl = document.getElementById('messageDisplay');
    if (messageEl) {
        messageEl.textContent = '⛔ STOP ALL - TOUT ARRÊTÉ';
        messageEl.style.color = '#ff0000';
    }
    if (window.audioSwiftBridge) {
        window.audioSwiftBridge.stopAll();
    }
    
    // Reset tous les boutons à OFF
    if (btnC4) btnC4.setState(false);
    if (btnA4) btnA4.setState(false);
    if (btnE5) btnE5.setState(false);
    if (btnChord) btnChord.setState(false);
}

// Create interface title
$('h2', {
    id: 'audioTitle',
    css: {
        position: 'absolute',
        left: '50px',
        top: '80px',
        fontSize: '24px',
        color: 'white',
        margin: '0',
        fontFamily: 'Arial, sans-serif'
    },
    text: 'Audio Swift Bridge'
});

// Message display area
$('div', {
    id: 'messageDisplay',
    css: {
        position: 'absolute',
        left: '50px',
        top: '280px',
        fontSize: '16px',
        color: '#ffff00',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: '10px',
        borderRadius: '5px',
        minWidth: '400px',
        minHeight: '20px'
    },
    text: 'Prêt - Cliquez sur un bouton...'
});

// Status indicators
$('div', {
    id: 'statusText',
    css: {
        position: 'absolute',
        left: '50px',
        top: '230px',
        fontSize: '14px',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
    },
    text: 'Status: Initializing...'
});

$('div', {
    id: 'bridgeText',
    css: {
        position: 'absolute',
        left: '50px',
        top: '250px',
        fontSize: '14px',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
    },
    text: 'Bridge: Checking...'
});

$('div', {
    id: 'modeInfo',
    css: {
        position: 'absolute',
        left: '50px',
        top: '320px',
        fontSize: '12px',
        color: '#888888',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'italic',
        maxWidth: '400px'
    },
    text: 'ℹ️ Mode TEST: Sons joués localement. Dans AUv3 host, les sons seront envoyés vers Swift.'
});

// Switch Local/AUv3 Mode
$('div', {
    id: 'switchContainer',
    css: {
        position: 'absolute',
        left: '350px',
        top: '80px',
        fontSize: '14px',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
    },
    text: 'Mode:'
});

const modeSwitch = Button({
    onText: '🎯 AUv3 Mode',
    offText: '🔊 Local Mode',
    onAction: (state) => switchMode(state),
    offAction: (state) => switchMode(state),
    parent: 'body',
    onStyle: { backgroundColor: '#4CAF50', color: 'white' },
    offStyle: { backgroundColor: '#2196F3', color: 'white' },
    css: {
        position: 'absolute',
        left: '400px',
        top: '78px',
        width: '120px',
        height: '30px',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        transition: 'all 0.3s ease'
    }
});

// Boutons avec système Squirrel Button()
const btnC4 = Button({
    onText: 'C4 ● ON',
    offText: 'C4 (261Hz)',
    onAction: playC4,
    offAction: playC4,
    parent: 'body',
    onStyle: { backgroundColor: '#ff6b35', color: 'white' },
    offStyle: { backgroundColor: '#4CAF50', color: 'white' },
    css: {
        position: 'absolute',
        left: '50px',
        top: '120px',
        width: '120px',
        height: '40px',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        transition: 'all 0.3s ease'
    }
});

const btnA4 = Button({
    onText: 'A4 ● ON',
    offText: 'A4 (440Hz)',
    onAction: playA4,
    offAction: playA4,
    parent: 'body',
    onStyle: { backgroundColor: '#ff6b35', color: 'white' },
    offStyle: { backgroundColor: '#4CAF50', color: 'white' },
    css: {
        position: 'absolute',
        left: '180px',
        top: '120px',
        width: '120px',
        height: '40px',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        transition: 'all 0.3s ease'
    }
});

const btnE5 = Button({
    onText: 'E5 ● ON',
    offText: 'E5 (659Hz)',
    onAction: playE5,
    offAction: playE5,
    parent: 'body',
    onStyle: { backgroundColor: '#ff6b35', color: 'white' },
    offStyle: { backgroundColor: '#4CAF50', color: 'white' },
    css: {
        position: 'absolute',
        left: '310px',
        top: '120px',
        width: '120px',
        height: '40px',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        transition: 'all 0.3s ease'
    }
});

const btnChord = Button({
    onText: 'Chord ● ON',
    offText: 'C Major Chord',
    onAction: playChord,
    offAction: playChord,
    parent: 'body',
    onStyle: { backgroundColor: '#ff6b35', color: 'white' },
    offStyle: { backgroundColor: '#2196F3', color: 'white' },
    css: {
        position: 'absolute',
        left: '50px',
        top: '170px',
        width: '150px',
        height: '40px',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        transition: 'all 0.3s ease'
    }
});

// Bouton Stop All (bouton simple, pas toggle)
$('button', {
    id: 'btnStop',
    css: {
        position: 'absolute',
        left: '220px',
        top: '170px',
        width: '100px',
        height: '40px',
        backgroundColor: '#ff4444',
        color: 'white',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'Arial, sans-serif',
        transition: 'all 0.3s ease'
    },
    text: 'Stop All'
}).click(stopAllAudio);
// Audio generation class with improved state management
class SimpleAudioGenerator {
    constructor() {
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.currentFrequency = 440;
        this.activeNotes = new Set(); // Track active notes
        this.chordActive = false;
        
        this.initializeAudio();
        this.setupSwiftBridge();
    }

    async initializeAudio() {
        try {
            // Create AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0.3;
            
            console.log("Audio context initialized for Swift bridge");
            this.sendToSwift("Audio system ready", "audioReady");
            
        } catch (error) {
            console.error("Failed to initialize audio:", error);
        }
    }

    setupSwiftBridge() {
        // Define Swift communication function (utilise swiftBridge comme to_study.html)
        window.sendToSwift = (message, type = "log") => {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) {
                try {
                    const payload = {
                        type: type,
                        data: message
                    };
                    window.webkit.messageHandlers.swiftBridge.postMessage(payload);
                    console.log(`📡 Swift Bridge: [${type}]`, message);
                } catch (error) {
                    console.error("Error sending to Swift:", error);
                }
            } else {
                // Mode test local SEULEMENT si pas d'host AUv3
                console.log(`🔗 Swift Bridge (TEST MODE): [${type}]`, message);
            }
        };

        // Request host sample rate from Swift
        this.sendToSwift({ requestSampleRate: true }, "getSampleRate");
    }

    sendToSwift(message, type = "audioData") {
        if (window.sendToSwift) {
            window.sendToSwift(message, type);
        }
    }

    // Generate audio buffer and send to Swift
    generateAudioBuffer(frequency, duration = 0.1) {
        if (!this.audioContext) return;

        const sampleRate = this.audioContext.sampleRate;
        const frameCount = sampleRate * duration;
        const audioBuffer = new Float32Array(frameCount);

        // Generate sine wave
        for (let i = 0; i < frameCount; i++) {
            const t = i / sampleRate;
            audioBuffer[i] = Math.sin(2 * Math.PI * frequency * t) * 0.5;
        }

        // Send audio data to Swift
        this.sendToSwift({
            frequency: frequency,
            sampleRate: sampleRate,
            duration: duration,
            audioData: Array.from(audioBuffer), // Convert to array for JSON
            channels: 1
        }, "audioBuffer");

        return audioBuffer;
    }

    // Play a note by sending audio to Swift
    async playNote(noteName, frequency, duration = 5.0) {
        console.log(`Playing note: ${noteName} ${frequency}Hz for ${duration}s`);
        
        this.activeNotes.add(noteName);
        this.currentFrequency = frequency;

        // Check mode: force AUv3 if switch is ON, otherwise check for real bridge
        const isAUv3Mode = window.forceAUv3Mode || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
        
        if (!isAUv3Mode) {
            // Mode local - jouer le son localement avec activation AudioContext
            await this.playLocalAudio(frequency, duration);
        }

        // Always generate and send audio buffer to Swift (even if no bridge detected)
        this.generateAudioBuffer(frequency, duration);

        // Send note command to Swift (comme dans to_study.html)
        this.sendToSwift({
            command: "playNote",
            note: noteName,
            frequency: frequency,
            duration: duration,
            amplitude: 0.5
        }, "audioNote");
    }

    // Play audio locally for testing (when no Swift bridge)
    async playLocalAudio(frequency, duration = 2.0) {
        if (!this.audioContext) return;

        // CORRECTION: Activer l'AudioContext si suspendu
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('🔊 AudioContext resumed for local playback');
            } catch (error) {
                console.error('Failed to resume AudioContext:', error);
                return;
            }
        }

        // Create oscillator for local playback
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        // Envelope for smooth sound
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);

        console.log(`🔊 Local audio playing: ${frequency}Hz for ${duration}s`);
    }

    stopNote(noteName) {
        console.log(`Stopping note: ${noteName}`);
        this.activeNotes.delete(noteName);

        this.sendToSwift({
            command: "stopNote",
            note: noteName
        }, "noteCommand");
    }

    // Play a chord by sending multiple frequencies
    async playChord(frequencies, duration = 5.0) {
        console.log(`Playing chord: ${frequencies.join(', ')}Hz`);
        
        this.chordActive = true;

        // Check mode: force AUv3 if switch is ON, otherwise check for real bridge
        const isAUv3Mode = window.forceAUv3Mode || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
        
        if (!isAUv3Mode) {
            // Mode local - jouer l'accord localement avec activation AudioContext
            for (const freq of frequencies) {
                await this.playLocalAudio(freq, duration);
            }
        }

        this.sendToSwift({
            command: "playChord",
            frequencies: frequencies,
            duration: duration,
            amplitude: 0.3
        }, "audioChord");
    }

    stopChord() {
        console.log("Stopping chord");
        this.chordActive = false;

        this.sendToSwift({
            command: "stopChord"
        }, "chordCommand");
    }

    stopAll() {
        console.log("Stopping all audio");
        this.activeNotes.clear();
        this.chordActive = false;

        this.sendToSwift({
            command: "stopAll"
        }, "noteCommand");
    }

    // Update sample rate from Swift host
    updateSampleRate(sampleRate) {
        if (this.audioContext && sampleRate !== this.audioContext.sampleRate) {
            console.log(`Updating sample rate from ${this.audioContext.sampleRate} to ${sampleRate}`);
            this.sendToSwift({
                message: `Sample rate updated to ${sampleRate}`,
                webAudioSampleRate: this.audioContext.sampleRate,
                hostSampleRate: sampleRate
            }, "sampleRateUpdate");
        }
    }
}

// Initialize audio generator
const audioGen = new SimpleAudioGenerator();

// Initialize mode switch to local by default
window.forceAUv3Mode = false;

// Update status indicators
setTimeout(() => {
    const statusEl = document.getElementById('statusText');
    const bridgeEl = document.getElementById('bridgeText');
    
    if (statusEl) {
        statusEl.textContent = `Status: ${audioGen.audioContext ? 'Ready' : 'Failed'}`;
    }
    
    if (bridgeEl) {
        const hasWebkit = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge;
        if (hasWebkit) {
            bridgeEl.textContent = `Bridge: Connected`;
            bridgeEl.style.color = '#4CAF50';
        } else {
            bridgeEl.textContent = `Bridge: TEST MODE (local browser)`;
            bridgeEl.style.color = '#ffaa00';
        }
    }
}, 500);

// Make audioGen globally available for testing
window.audioSwiftBridge = audioGen;

// Test Swift communication
audioGen.sendToSwift("Audio Swift Bridge example loaded successfully", "init");

console.log("Audio Swift Bridge example ready with Squirrel Buttons!");

// Global functions for Swift to call back
window.updateSampleRate = function(sampleRate) {
    if (window.audioSwiftBridge) {
        window.audioSwiftBridge.updateSampleRate(sampleRate);
    }
};

window.updateAudioState = function(state) {
    console.log("Audio state update from Swift:", state);
    if (window.audioSwiftBridge) {
        console.log("Received audio state:", state);
    }
};
