// MIDI Utilities for Lyrix Application
// Handles MIDI data received from AUv3 host and displays it in a formatted way

export class MidiUtilities {
    constructor() {
        this.midiContainer = null;
        this.maxLogEntries = 50;
        this.midiMessages = [];
        this.midiAssignments = new Map(); // Store MIDI note -> song mappings
        this.specialAssignments = new Map(); // Store MIDI note -> special action mappings
        this.isLearning = false;
        this.learnCallback = null;
        this.loadMidiAssignments();
        this.loadSpecialAssignments();
        this.setupMidiDisplay();
    }

    // Initialize the MIDI display container
    setupMidiDisplay() {
        console.log('🎵 Initializing MIDI display...');
        
        // Check MIDI inspector mode state
        const isMidiInspectorEnabled = localStorage.getItem('lyrix_midi_inspector_enabled') === 'true';
        const initialDisplay = isMidiInspectorEnabled ? 'block' : 'none'; // Show/hide based on MIDI inspector setting
        
        // Create MIDI display container
        this.midiContainer = $('div', {
            id: 'midi-logger-container',
            css: {
                padding: '8px',
                backgroundColor: '#1a1a1a',
                color: '#00ff00',
                borderRadius: '4px',
                textAlign: 'left',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '10px',
                border: '2px solid #333',
                maxHeight: '150px',
                overflow: 'auto',
                minHeight: '50px',
                display: 'none'
            }
        });
        
        // Add data attribute for identification
        this.midiContainer.setAttribute('data-element', 'midi-logger');

        console.log('✅ MIDI container created:', this.midiContainer);

        // Add title
        const midiTitle = $('div', {
            text: 'MIDI Data Logger',
            css: {
                color: '#fff',
                fontSize: '14px',
                fontWeight: 'bold',
                marginBottom: '5px',
                borderBottom: '1px solid #333',
                paddingBottom: '2px'
            }
        });

        // Add clear button
        const clearButton = $('div', {
            id: 'midi_clear_log',
            text: 'Clear',
            css: {
                padding: '2px 6px',
                backgroundColor: '#444',
                color: 'white',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '10px',
                marginRight: '5px',
                display: 'inline-block',
                userSelect: 'none'
            }
        });

        clearButton.addEventListener('click', () => this.clearMidiLog());

        // Add test button
        const testButton = $('div', {
            id: 'midi_test_data',
            text: 'Test',
            css: {
                padding: '2px 6px',
                backgroundColor: '#006600',
                color: 'white',
                border: 'none',
                borderRadius: '2px',
                cursor: 'pointer',
                fontSize: '10px',
                display: 'inline-block',
                userSelect: 'none'
            }
        });

        testButton.addEventListener('click', () => this.testMidiData());

        // Add status line
        this.statusLine = $('div', {
            text: 'Waiting for MIDI data...',
            css: {
                color: '#666',
                fontSize: '11px',
                marginBottom: '5px'
            }
        });

        // Add log content area
        this.logContent = $('div', {
            id: 'midi_log_content',
            css: {
                color: '#00ff00',
                fontSize: '11px',
                lineHeight: '1.2'
            }
        });

        // Assemble the container
        const header = $('div', {
            css: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '5px'
            }
        });

        const buttonContainer = $('div', {
            css: {
                display: 'flex',
                gap: '5px'
            }
        });
        
        buttonContainer.append(clearButton, testButton);
        header.append(midiTitle, buttonContainer);
        this.midiContainer.append(header, this.statusLine, this.logContent);

        // Insert the MIDI display below the timecode
        this.insertMidiDisplay();
    }

    // Insert MIDI display (now will be moved to lyrics toolbar)
    insertMidiDisplay() {
        // MIDI container will be moved to lyrics toolbar by display.js
        // No need to insert into left panel since it's been removed
        console.log('🎵 MIDI container ready for toolbar integration');
    }

    // Parse and format MIDI message
    formatMidiMessage(data1, data2, data3, timestamp = null) {
        const status = data1;
        const data1Byte = data2;
        const data2Byte = data3;
        
        const channel = (status & 0x0F) + 1; // MIDI channels are 1-16
        const messageType = status & 0xF0;
        
        let messageText = '';
        let messageColor = '#00ff00';

        switch (messageType) {
            case 0x80: // Note Off
                messageText = `Note OFF  Ch:${channel.toString().padStart(2)} Note:${data1Byte.toString().padStart(3)} Vel:${data2Byte.toString().padStart(3)}`;
                messageColor = '#ff6666';
                break;
            case 0x90: // Note On
                if (data2Byte === 0) {
                    messageText = `Note OFF  Ch:${channel.toString().padStart(2)} Note:${data1Byte.toString().padStart(3)} Vel:000`;
                    messageColor = '#ff6666';
                } else {
                    messageText = `Note ON   Ch:${channel.toString().padStart(2)} Note:${data1Byte.toString().padStart(3)} Vel:${data2Byte.toString().padStart(3)}`;
                    messageColor = '#66ff66';
                }
                break;
            case 0xA0: // Aftertouch
                messageText = `Aftertouch Ch:${channel.toString().padStart(2)} Note:${data1Byte.toString().padStart(3)} Pressure:${data2Byte.toString().padStart(3)}`;
                messageColor = '#ffff66';
                break;
            case 0xB0: // Control Change
                messageText = `CC        Ch:${channel.toString().padStart(2)} CC:${data1Byte.toString().padStart(3)} Val:${data2Byte.toString().padStart(3)}`;
                messageColor = '#66ffff';
                break;
            case 0xC0: // Program Change
                messageText = `ProgramChg Ch:${channel.toString().padStart(2)} Program:${data1Byte.toString().padStart(3)}`;
                messageColor = '#ff66ff';
                break;
            case 0xD0: // Channel Pressure
                messageText = `ChanPress Ch:${channel.toString().padStart(2)} Pressure:${data1Byte.toString().padStart(3)}`;
                messageColor = '#ffaa66';
                break;
            case 0xE0: // Pitch Bend
                const pitchValue = (data2Byte << 7) | data1Byte;
                messageText = `PitchBend Ch:${channel.toString().padStart(2)} Value:${pitchValue.toString().padStart(5)}`;
                messageColor = '#aa66ff';
                break;
            case 0xF0: // System messages
                if (status === 0xF8) {
                    messageText = 'Clock';
                    messageColor = '#888888';
                } else if (status === 0xFA) {
                    messageText = 'Start';
                    messageColor = '#66ff66';
                } else if (status === 0xFB) {
                    messageText = 'Continue';
                    messageColor = '#66ff66';
                } else if (status === 0xFC) {
                    messageText = 'Stop';
                    messageColor = '#ff6666';
                } else {
                    messageText = `System    Status:0x${status.toString(16).toUpperCase().padStart(2, '0')} Data:${data1Byte} ${data2Byte}`;
                    messageColor = '#ffffff';
                }
                break;
            default:
                messageText = `Unknown   Status:0x${status.toString(16).toUpperCase().padStart(2, '0')} Data:${data1Byte} ${data2Byte}`;
                messageColor = '#ff9999';
        }

        return {
            text: messageText,
            color: messageColor,
            raw: `${status.toString(16).toUpperCase().padStart(2, '0')} ${data1Byte.toString(16).toUpperCase().padStart(2, '0')} ${data2Byte.toString(16).toUpperCase().padStart(2, '0')}`,
            timestamp: timestamp || Date.now()
        };
    }

    // Log MIDI message to display
    logMidiMessage(data1, data2, data3, timestamp = null) {
        // Skip MIDI clock messages to reduce spam (uncomment if you want to see them)
        if (data1 === 0xF8) {
            return; // Skip MIDI clock
        }

        const formattedMessage = this.formatMidiMessage(data1, data2, data3, timestamp);
        
        // Add to messages array
        this.midiMessages.push(formattedMessage);
        
        // Limit number of messages
        if (this.midiMessages.length > this.maxLogEntries) {
            this.midiMessages.shift();
        }

        // Update display
        this.updateMidiDisplay();
        
        // Update status
        this.updateStatus();
    }

    // Update the MIDI display
    updateMidiDisplay() {
        if (!this.logContent) return;

        // Clear current content
        this.logContent.innerHTML = '';

        // Add recent messages (reverse order to show newest first)
        const recentMessages = this.midiMessages.slice(-20).reverse();
        
        recentMessages.forEach(message => {
            const timestamp = new Date(message.timestamp);
            const timeString = `${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}:${timestamp.getSeconds().toString().padStart(2, '0')}.${timestamp.getMilliseconds().toString().padStart(3, '0')}`;
            
            const messageDiv = $('div', {
                css: {
                    marginBottom: '1px',
                    fontFamily: 'monospace'
                }
            });

            const timeSpan = $('span', {
                text: `${timeString} `,
                css: {
                    color: '#666',
                    fontSize: '10px'
                }
            });

            const messageSpan = $('span', {
                text: message.text,
                css: {
                    color: message.color
                }
            });

            const rawSpan = $('span', {
                text: ` [${message.raw}]`,
                css: {
                    color: '#888',
                    fontSize: '10px'
                }
            });

            messageDiv.append(timeSpan, messageSpan, rawSpan);
            this.logContent.append(messageDiv);
        });

        // Auto-scroll to top (newest messages)
        this.logContent.scrollTop = 0;
    }

    // Update status line
    updateStatus() {
        if (!this.statusLine) return;

        const totalMessages = this.midiMessages.length;
        const lastMessage = this.midiMessages[this.midiMessages.length - 1];
        
        if (lastMessage) {
            const timeSince = Date.now() - lastMessage.timestamp;
            this.statusLine.textContent = `Messages: ${totalMessages} | Last: ${timeSince}ms ago`;
        }
    }

    // Clear MIDI log
    clearMidiLog() {
        this.midiMessages = [];
        if (this.logContent) {
            this.logContent.innerHTML = '';
        }
        if (this.statusLine) {
            this.statusLine.textContent = 'MIDI log cleared. Waiting for data...';
        }
        console.log('🗑️ MIDI log cleared');
    }

    // Method to be called from Swift via JavaScript bridge
    receiveMidiData(data1, data2, data3, timestamp = null) {
        console.log('🎵 receiveMidiData called with:', data1, data2, data3, timestamp);
        
        // Handle MIDI learning mode
        if (this.isLearning && this.learnCallback) {
            // Check if it's a Note On message (0x90-0x9F)
            if ((data1 & 0xF0) === 0x90 && data3 > 0) {
                const midiNote = data2;
                console.log(`🎹 MIDI Learn: Note ${midiNote} captured`);
                this.learnCallback(midiNote);
                this.stopMidiLearn();
                return;
            }
        }
        
        // Handle song loading from MIDI
        if ((data1 & 0xF0) === 0x90 && data3 > 0) { // Note On with velocity > 0
            const midiNote = data2;
            this.handleMidiSongTrigger(midiNote);
            this.handleMidiSpecialTrigger(midiNote);
        }
        
        this.logMidiMessage(data1, data2, data3, timestamp);
    }
    
    // Test method to simulate MIDI data
    testMidiData() {
        console.log('🧪 Testing MIDI data...');
        this.receiveMidiData(0x90, 60, 127); // Note On
        setTimeout(() => {
            this.receiveMidiData(0x80, 60, 0); // Note Off
        }, 1000);
    }

    // Get current MIDI statistics
    getStatistics() {
        const stats = {
            totalMessages: this.midiMessages.length,
            messageTypes: {}
        };

        this.midiMessages.forEach(msg => {
            const type = msg.text.split(' ')[0];
            stats.messageTypes[type] = (stats.messageTypes[type] || 0) + 1;
        });

        return stats;
    }

    // Export MIDI log as text
    exportLog() {
        const logText = this.midiMessages.map(msg => {
            const timestamp = new Date(msg.timestamp).toISOString();
            return `${timestamp}: ${msg.text} [${msg.raw}]`;
        }).join('\n');

        return logText;
    }

    // MIDI Learning Methods
    startMidiLearn(callback) {
        console.log('🎹 Starting MIDI learn mode...');
        this.isLearning = true;
        this.learnCallback = callback;
        
        // Update status
        if (this.statusLine) {
            this.statusLine.textContent = 'MIDI Learning: Press a key on your MIDI device...';
            this.statusLine.style.color = '#ff4757';
        }
    }

    stopMidiLearn() {
        console.log('🎹 Stopping MIDI learn mode');
        this.isLearning = false;
        this.learnCallback = null;
        
        // Update status
        if (this.statusLine) {
            this.statusLine.textContent = 'Waiting for MIDI data...';
            this.statusLine.style.color = '#666';
        }
    }

    // MIDI Assignment Methods
    setMidiAssignment(songKey, midiNote) {
        this.midiAssignments.set(parseInt(midiNote), songKey);
        this.saveMidiAssignments();
        console.log(`🎵 MIDI assignment saved: Note ${midiNote} -> ${songKey}`);
    }

    getMidiAssignment(songKey) {
        for (let [midiNote, assignedSong] of this.midiAssignments) {
            if (assignedSong === songKey) {
                return midiNote.toString();
            }
        }
        return null;
    }

    removeMidiAssignment(songKey) {
        for (let [midiNote, assignedSong] of this.midiAssignments) {
            if (assignedSong === songKey) {
                this.midiAssignments.delete(midiNote);
                this.saveMidiAssignments();
                console.log(`🎵 MIDI assignment removed: Note ${midiNote} -> ${songKey}`);
                break;
            }
        }
    }

    handleMidiSongTrigger(midiNote) {
        const songKey = this.midiAssignments.get(midiNote);
        if (songKey) {
            console.log(`🎵 MIDI triggered song load: Note ${midiNote} -> ${songKey}`);
            
            // Call the global loadAndDisplaySong function if available
            if (window.loadAndDisplaySong) {
                window.loadAndDisplaySong(songKey);
            } else {
                console.warn('❌ loadAndDisplaySong function not available');
            }
        }
    }

    // Storage Methods
    saveMidiAssignments() {
        try {
            const assignmentsObj = Object.fromEntries(this.midiAssignments);
            localStorage.setItem('lyrix_midi_assignments', JSON.stringify(assignmentsObj));
        } catch (error) {
            console.error('❌ Error saving MIDI assignments:', error);
        }
    }

    loadMidiAssignments() {
        try {
            const saved = localStorage.getItem('lyrix_midi_assignments');
            if (saved) {
                const assignmentsObj = JSON.parse(saved);
                this.midiAssignments = new Map(Object.entries(assignmentsObj).map(([k, v]) => [parseInt(k), v]));
                console.log('📚 MIDI assignments loaded:', this.midiAssignments.size, 'assignments');
            }
        } catch (error) {
            console.error('❌ Error loading MIDI assignments:', error);
            this.midiAssignments = new Map();
        }
    }

    // Get all assignments for debugging
    getAllAssignments() {
        return Object.fromEntries(this.midiAssignments);
    }

    // Special Assignment Methods (for fullscreen, etc.)
    setMidiSpecialAssignment(actionKey, midiNote) {
        console.log(`🔧 Setting special assignment: ${actionKey} -> Note ${midiNote}`);
        
        // For fullscreen actions, remove any existing assignment to prevent accumulation
        if (actionKey === 'fullscreen_activate' || actionKey === 'fullscreen_deactivate') {
            this.removeMidiSpecialAssignment(actionKey);
        }
        
        this.specialAssignments.set(parseInt(midiNote), actionKey);
        this.saveSpecialAssignments();
        console.log(`🎵 MIDI special assignment saved: Note ${midiNote} -> ${actionKey}`);
        console.log(`🔍 Current special assignments after save:`, Object.fromEntries(this.specialAssignments));
    }

    getMidiSpecialAssignment(actionKey) {
        for (let [midiNote, assignedAction] of this.specialAssignments) {
            if (assignedAction === actionKey) {
                return midiNote.toString();
            }
        }
        return null;
    }

    removeMidiSpecialAssignment(actionKey) {
        for (let [midiNote, assignedAction] of this.specialAssignments) {
            if (assignedAction === actionKey) {
                this.specialAssignments.delete(midiNote);
                this.saveSpecialAssignments();
                console.log(`🎵 MIDI special assignment removed: Note ${midiNote} -> ${actionKey}`);
                break;
            }
        }
    }

    handleMidiSpecialTrigger(midiNote) {
        console.log(`🔍 Checking special triggers for MIDI note: ${midiNote}`);
        console.log(`🔍 Current special assignments:`, Object.fromEntries(this.specialAssignments));
        
        const actionKey = this.specialAssignments.get(midiNote);
        if (actionKey) {
            console.log(`🎵 MIDI triggered special action: Note ${midiNote} -> ${actionKey}`);
            
            switch (actionKey) {
                case 'fullscreen_activate':
                    console.log('🖥️ Calling toggleFullscreen(true) for activation...');
                    this.toggleFullscreen(true);
                    break;
                case 'fullscreen_deactivate':
                    console.log('🖥️ Calling toggleFullscreen(false) for deactivation...');
                    this.toggleFullscreen(false);
                    break;
                default:
                    console.warn(`❌ Unknown special action: ${actionKey}`);
            }
        } else {
            console.log(`🔍 No special assignment found for MIDI note: ${midiNote}`);
        }
    }

    // Unified fullscreen toggle method
    toggleFullscreen(enterFullscreen = null) {
        console.log(`🖥️ toggleFullscreen called with parameter: ${enterFullscreen}`);
        
        // Try to call the display instance method directly
        if (window.Lyrix && window.Lyrix.lyricsDisplay) {
            console.log('✅ Found Lyrix display instance, calling toggleFullscreen...');
            window.Lyrix.lyricsDisplay.toggleFullscreen(enterFullscreen);
            console.log(`✅ Fullscreen ${enterFullscreen === true ? 'activated' : enterFullscreen === false ? 'deactivated' : 'toggled'} via display instance`);
        } else {
            // Fallback to button click (but this won't support the parameter)
            console.log('⚠️ Lyrix display instance not found, falling back to button click...');
            const fullscreenButton = document.getElementById('fullscreen_mode');
            if (fullscreenButton) {
                fullscreenButton.click();
                console.log('✅ Fullscreen button clicked via fallback');
            } else {
                console.error('❌ Fullscreen button not found (ID: fullscreen_mode)');
            }
        }
    }

    // Special assignments storage methods
    saveSpecialAssignments() {
        try {
            const assignmentsObj = Object.fromEntries(this.specialAssignments);
            localStorage.setItem('lyrix_midi_special_assignments', JSON.stringify(assignmentsObj));
        } catch (error) {
            console.error('❌ Error saving MIDI special assignments:', error);
        }
    }

    loadSpecialAssignments() {
        try {
            const saved = localStorage.getItem('lyrix_midi_special_assignments');
            if (saved) {
                const assignmentsObj = JSON.parse(saved);
                this.specialAssignments = new Map(Object.entries(assignmentsObj).map(([k, v]) => [parseInt(k), v]));
                console.log('📚 MIDI special assignments loaded:', this.specialAssignments.size, 'assignments');
            }
        } catch (error) {
            console.error('❌ Error loading MIDI special assignments:', error);
            this.specialAssignments = new Map();
        }
    }

    // Get all special assignments for debugging
    getAllSpecialAssignments() {
        return Object.fromEntries(this.specialAssignments);
    }

    // Test fullscreen functionality manually (for debugging)
    testFullscreenManually() {
        console.log('🧪 Testing fullscreen manually...');
        this.toggleFullscreen(true);  // Enter fullscreen
        
        setTimeout(() => {
            console.log('🧪 Testing fullscreen exit...');
            this.toggleFullscreen(false);  // Exit fullscreen
        }, 3000);
    }
}
