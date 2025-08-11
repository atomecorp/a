// Settings Modal Module
// Handles all application settings including MIDI assignments, audio controls, and preferences

// Toggle audio player controls visibility
export function toggleAudioPlayerControls() {
    const audioPlayer = document.getElementById('audioPlayer');
    const showControls = localStorage.getItem('lyrix_show_audio_controls') === 'true';
    
    if (audioPlayer) {
        audioPlayer.style.display = showControls ? 'block' : 'none';
        console.log('🎵 Audio player visibility:', showControls ? 'shown' : 'hidden');
    }
}

// Toggle audio sync functionality
export function toggleAudioSync() {
    const enableSync = localStorage.getItem('lyrix_enable_audio_sync') === 'true';
    
    if (window.audioController) {
        window.audioController.syncEnabled = enableSync;
        console.log('🔄 Audio sync:', enableSync ? 'enabled' : 'disabled');
    }
}

// Toggle MIDI inspector functionality
export function toggleMidiInspector() {
    const showInspector = localStorage.getItem('lyrix_show_midi_inspector') === 'true';
    
    if (window.midiUtilities && window.midiUtilities.inspector) {
        if (showInspector) {
            window.midiUtilities.inspector.show();
        } else {
            window.midiUtilities.inspector.hide();
        }
        console.log('🎹 MIDI inspector:', showInspector ? 'shown' : 'hidden');
    }
}

// Start MIDI learn for settings function
export function startMidiLearnForSetting(settingName, inputElement, buttonElement) {
    if (!window.midiUtilities) {
        console.error('❌ MIDI utilities not available');
        return;
    }

    if (window.midiUtilities.isLearning) {
        // Stop learning
        window.midiUtilities.stopMidiLearn();
        buttonElement.style.backgroundColor = '#f0f8ff';
        buttonElement.style.color = '#007acc';
        buttonElement.textContent = '🎹';
        console.log('🎹 MIDI learn stopped');
    } else {
        // Start learning
        buttonElement.style.backgroundColor = '#ff6b6b';
        buttonElement.style.color = 'white';
        buttonElement.textContent = '⏹️';
        console.log(`🎹 MIDI learn started for setting: ${settingName}`);
        
        window.midiUtilities.startMidiLearn((midiNote) => {
            console.log(`🎹 MIDI learn callback triggered with note: ${midiNote} for setting: ${settingName}`);
            // Remove any existing assignment for this setting
            window.midiUtilities.removeMidiSpecialAssignment(settingName);
            // Set new special assignment for settings
            window.midiUtilities.setMidiSpecialAssignment(settingName, midiNote);
            // Update input field
            inputElement.value = midiNote;
            // Reset button appearance
            buttonElement.style.backgroundColor = '#f0f8ff';
            buttonElement.style.color = '#007acc';
            buttonElement.textContent = '🎹';
            console.log(`🎹 MIDI learn completed: Note ${midiNote} -> Setting ${settingName}`);
        });
    }
}

// Show settings modal
export function showSettingsModal() {
    console.log('⚙️ Opening settings...');
    
    const modalContainer = window.UIManager.createEnhancedModalOverlay();
    const modal = window.UIManager.createEnhancedModalContainer({
        id: 'settings-modal',
        css: { maxWidth: '800px', width: '95%', maxHeight: '90vh', overflow: 'hidden' }
    });

    // Header
    const header = window.$('div', {
        css: {
            padding: window.UIManager.THEME.spacing.lg,
            backgroundColor: window.UIManager.THEME.colors.primary,
            borderRadius: `${window.UIManager.THEME.borderRadius.lg} ${window.UIManager.THEME.borderRadius.lg} 0 0`,
            borderBottom: `1px solid ${window.UIManager.THEME.colors.border}`,
            color: 'white'
        }
    });

    const headerTitle = window.$('h3', {
        text: '⚙️ Settings',
        css: { margin: '0', color: 'white' }
    });

    const headerSubtitle = window.$('div', {
        text: 'Configure MIDI assignments, audio settings, and display preferences',
        css: {
            fontSize: '14px',
            opacity: '0.9',
            marginTop: '5px',
            fontStyle: 'italic'
        }
    });

    header.append(headerTitle, headerSubtitle);

    // Content with scrollable sections
    const content = window.$('div', {
        css: {
            padding: window.UIManager.THEME.spacing.lg,
            maxHeight: '500px',
            overflowY: 'auto',
            backgroundColor: 'white'
        }
    });

    // Helper function to create setting sections
    function createSettingSection(title, items) {
        const section = window.$('div', {
            css: {
                marginBottom: '25px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                overflow: 'hidden'
            }
        });

        const sectionHeader = window.$('div', {
            text: title,
            css: {
                backgroundColor: '#f8f9fa',
                padding: '12px 15px',
                fontWeight: 'bold',
                fontSize: '16px',
                color: '#333',
                borderBottom: '1px solid #e0e0e0'
            }
        });

        const sectionContent = window.$('div', {
            css: {
                padding: '15px'
            }
        });

        items.forEach(item => sectionContent.appendChild(item));

        section.append(sectionHeader, sectionContent);
        return section;
    }

    // Helper function to create MIDI assignment row
    function createMidiAssignmentRow(label, settingKey, description) {
        const row = window.$('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#fafafa',
                borderRadius: '5px',
                border: '1px solid #eee'
            }
        });

        const leftColumn = window.$('div', {
            css: { flex: '1' }
        });

        const labelDiv = window.$('div', {
            text: label,
            css: {
                fontWeight: '500',
                marginBottom: '3px',
                color: '#333'
            }
        });

        const descDiv = window.$('div', {
            text: description,
            css: {
                fontSize: '12px',
                color: '#666',
                fontStyle: 'italic'
            }
        });

        leftColumn.append(labelDiv, descDiv);

        const rightColumn = window.$('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }
        });

        // Get current MIDI assignment
        let currentMidiNote = null;
        if (window.midiUtilities && window.midiUtilities.getMidiSpecialAssignment) {
            currentMidiNote = window.midiUtilities.getMidiSpecialAssignment(settingKey);
            console.log(`🎹 Loading MIDI special assignment for ${settingKey}: ${currentMidiNote}`);
            console.log(`🔍 All special assignments:`, window.midiUtilities.getAllSpecialAssignments());
        } else {
            console.warn('⚠️ MIDI utilities not available or getMidiSpecialAssignment method missing');
        }

        const midiInput = window.$('input', {
            type: 'number',
            min: '0',
            max: '127',
            placeholder: 'Note',
            value: currentMidiNote || '',
            css: {
                width: '60px',
                padding: '5px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
                textAlign: 'center'
            }
        });

        // Force update the input value after creation
        if (currentMidiNote) {
            midiInput.value = currentMidiNote;
            midiInput.setAttribute('value', currentMidiNote);
        }

        // Store setting key as data attribute for later reference
        midiInput.setAttribute('data-setting-key', settingKey);

        console.log(`🔍 Input created for ${settingKey} with value: "${currentMidiNote || ''}" (raw: ${currentMidiNote})`);
        console.log(`🔍 Input element value:`, midiInput.value);

        const midiLearnButton = window.$('button', {
            text: '🎹',
            css: {
                width: '30px',
                height: '30px',
                border: '1px solid #007acc',
                borderRadius: '3px',
                backgroundColor: '#f0f8ff',
                color: '#007acc',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0'
            },
            title: `Learn MIDI note for ${label}`
        });

        // MIDI learn functionality
        midiLearnButton.addEventListener('click', () => {
            startMidiLearnForSetting(settingKey, midiInput, midiLearnButton);
        });

        // Update MIDI assignment when input changes
        midiInput.addEventListener('change', (e) => {
            const midiNote = parseInt(e.target.value);
            if (window.midiUtilities && !isNaN(midiNote) && midiNote >= 0 && midiNote <= 127) {
                // Remove any existing assignment for this setting
                window.midiUtilities.removeMidiSpecialAssignment(settingKey);
                // Set new special assignment
                window.midiUtilities.setMidiSpecialAssignment(settingKey, midiNote);
                console.log(`🎹 Manual MIDI special assignment: Note ${midiNote} -> Setting ${settingKey}`);
            } else if (window.midiUtilities && e.target.value === '') {
                // Remove assignment if input is cleared
                window.midiUtilities.removeMidiSpecialAssignment(settingKey);
                console.log(`🎹 MIDI special assignment removed for setting: ${settingKey}`);
            }
        });

        const clearButton = window.$('button', {
            text: '✕',
            css: {
                width: '25px',
                height: '25px',
                border: '1px solid #dc3545',
                borderRadius: '3px',
                backgroundColor: '#fff5f5',
                color: '#dc3545',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0'
            },
            title: `Clear MIDI assignment for ${label}`
        });

        clearButton.addEventListener('click', () => {
            if (window.midiUtilities) {
                window.midiUtilities.removeMidiSpecialAssignment(settingKey);
                midiInput.value = '';
                console.log(`🎹 MIDI special assignment cleared for setting: ${settingKey}`);
            }
        });

        rightColumn.append(midiInput, midiLearnButton, clearButton);
        row.append(leftColumn, rightColumn);
        
        return row;
    }

    // Helper function to create toggle setting row
    function createToggleRow(label, storageKey, description, onToggle) {
        const row = window.$('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#fafafa',
                borderRadius: '5px',
                border: '1px solid #eee'
            }
        });

        const leftColumn = window.$('div', {
            css: { flex: '1' }
        });

        const labelDiv = window.$('div', {
            text: label,
            css: {
                fontWeight: '500',
                marginBottom: '3px',
                color: '#333'
            }
        });

        const descDiv = window.$('div', {
            text: description,
            css: {
                fontSize: '12px',
                color: '#666',
                fontStyle: 'italic'
            }
        });

        leftColumn.append(labelDiv, descDiv);

        const toggle = window.$('input', {
            type: 'checkbox',
            checked: localStorage.getItem(storageKey) === 'true',
            css: {
                width: '20px',
                height: '20px',
                cursor: 'pointer'
            }
        });

        toggle.addEventListener('change', (e) => {
            localStorage.setItem(storageKey, e.target.checked);
            if (onToggle) onToggle();
            console.log(`⚙️ Setting ${storageKey}: ${e.target.checked}`);
        });

        row.append(leftColumn, toggle);
        return row;
    }

    // MIDI Assignments Section
    const midiAssignments = [
        createMidiAssignmentRow('Previous Song', 'previous_song', 'Navigate to previous song in library'),
        createMidiAssignmentRow('Next Song', 'next_song', 'Navigate to next song in library'),
        createMidiAssignmentRow('Play/Pause', 'play_pause', 'Toggle audio playback'),
        createMidiAssignmentRow('Stop', 'stop', 'Stop audio playback'),
        createMidiAssignmentRow('Rewind', 'rewind', 'Restart song from beginning'),
        createMidiAssignmentRow('Scroll Up', 'scroll_up', 'Scroll lyrics up'),
        createMidiAssignmentRow('Scroll Down', 'scroll_down', 'Scroll lyrics down'),
        createMidiAssignmentRow('Auto-Scroll Toggle', 'auto_scroll_toggle', 'Enable/disable auto-scroll'),
        createMidiAssignmentRow('Font Size Up', 'font_size_up', 'Increase font size'),
        createMidiAssignmentRow('Font Size Down', 'font_size_down', 'Decrease font size'),
        createMidiAssignmentRow('Show Song Library', 'show_song_library', 'Open song library modal'),
        createMidiAssignmentRow('Show Settings', 'show_settings', 'Open settings modal'),
        createMidiAssignmentRow('Enter Fullscreen', 'enter_fullscreen', 'Enter fullscreen mode'),
        createMidiAssignmentRow('Exit Fullscreen', 'exit_fullscreen', 'Exit fullscreen mode'),
    ];

    const midiSection = createSettingSection('🎹 MIDI Assignments', midiAssignments);

    // Audio Controls Section
    const audioControls = [
        createToggleRow('Show Audio Player', 'lyrix_show_audio_controls', 'Display audio player controls', toggleAudioPlayerControls),
        createToggleRow('Enable Audio Sync', 'lyrix_enable_audio_sync', 'Synchronize lyrics with audio playback', toggleAudioSync)
    ];

    const audioSection = createSettingSection('🎵 Audio Player', audioControls);

    // Sync Settings Section
    const syncSettings = [
        createToggleRow('Auto-Scroll', 'lyrix_auto_scroll', 'Automatically scroll lyrics during playback'),
        createToggleRow('Smooth Scrolling', 'lyrix_smooth_scroll', 'Use smooth scrolling animations'),
        createToggleRow('Show Progress Bar', 'lyrix_show_progress', 'Display playback progress indicator')
    ];

    const syncSection = createSettingSection('🔄 Sync Settings', syncSettings);

    // Timecode Display Section
    const timecodeContainer = window.$('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#fafafa',
            borderRadius: '5px',
            border: '1px solid #eee'
        }
    });

    const timecodeLeftColumn = window.$('div', {
        css: { flex: '1' }
    });

    const timecodeLabel = window.$('div', {
        text: 'Show Timecode',
        css: {
            fontWeight: '500',
            marginBottom: '3px',
            color: '#333'
        }
    });

    const timecodeDesc = window.$('div', {
        text: 'Display current playback time',
        css: {
            fontSize: '12px',
            color: '#666',
            fontStyle: 'italic'
        }
    });

    timecodeLeftColumn.append(timecodeLabel, timecodeDesc);

    const timecodeToggle = window.$('input', {
        type: 'checkbox',
        checked: localStorage.getItem('lyrix_show_timecode') === 'true',
        css: {
            width: '20px',
            height: '20px',
            cursor: 'pointer'
        }
    });

    timecodeToggle.addEventListener('change', (e) => {
        localStorage.setItem('lyrix_show_timecode', e.target.checked);
        if (window.audioController && window.audioController.updateTimecodeDisplay) {
            window.audioController.updateTimecodeDisplay();
        }
        console.log(`⚙️ Timecode display: ${e.target.checked}`);
    });

    timecodeContainer.append(timecodeLeftColumn, timecodeToggle);

    // Time monitoring display (shows current audio time)
    const timeMonitorContainer = window.$('div', {
        css: {
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#f0f8ff',
            borderRadius: '5px',
            border: '1px solid #b0d4ff'
        }
    });

    const timeMonitorLabel = window.$('div', {
        text: 'Current Audio Time',
        css: {
            fontWeight: '500',
            marginBottom: '5px',
            color: '#333'
        }
    });

    const timeDisplay = window.$('div', {
        text: '00:00',
        css: {
            fontSize: '18px',
            fontFamily: 'monospace',
            color: '#007acc',
            fontWeight: 'bold'
        }
    });

    timeMonitorContainer.append(timeMonitorLabel, timeDisplay);

    // Update time display periodically
    let timeUpdateInterval;
    function startTimeMonitoring() {
        timeUpdateInterval = setInterval(() => {
            if (window.audioController && window.audioController.audio) {
                const currentTime = window.audioController.audio.currentTime;
                const minutes = Math.floor(currentTime / 60);
                const seconds = Math.floor(currentTime % 60);
                timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                timeDisplay.textContent = '00:00';
            }
        }, 500);
    }

    function stopTimeMonitoring() {
        if (timeUpdateInterval) {
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
        }
    }

    startTimeMonitoring();

    const timecodeSettings = [timecodeContainer, timeMonitorContainer];
    const timecodeSection = createSettingSection('🕐 Timecode', timecodeSettings);

    // Metadata Display Section
    const metadataContainer = window.$('div', {
        css: {
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#f9f9f9',
            borderRadius: '5px',
            border: '1px solid #ddd'
        }
    });

    const metadataLabel = window.$('div', {
        text: 'Current Song Information',
        css: {
            fontWeight: '500',
            marginBottom: '10px',
            color: '#333'
        }
    });

    const metadataContent = window.$('div', {
        css: {
            fontSize: '14px',
            lineHeight: '1.4'
        }
    });

    // Get current song info
    function updateMetadataDisplay() {
        if (window.currentSong) {
            const song = window.currentSong;
            const metadata = song.metadata || {};
            
            metadataContent.innerHTML = `
                <div><strong>Title:</strong> ${metadata.title || song.title || 'Unknown'}</div>
                <div><strong>Artist:</strong> ${metadata.artist || song.artist || 'Unknown'}</div>
                <div><strong>Album:</strong> ${metadata.album || song.album || 'N/A'}</div>
                <div><strong>Duration:</strong> ${metadata.duration || 'N/A'}</div>
                <div><strong>BPM:</strong> ${metadata.bpm || 'N/A'}</div>
                <div><strong>Key:</strong> ${metadata.key || 'N/A'}</div>
            `;
        } else {
            metadataContent.innerHTML = '<div style="color: #666; font-style: italic;">No song loaded</div>';
        }
    }

    updateMetadataDisplay();
    metadataContainer.append(metadataLabel, metadataContent);

    const metadataSettings = [metadataContainer];
    const metadataSection = createSettingSection('📋 Song Metadata', metadataSettings);

    // Font Controls Section
    const fontSizeContainer = window.$('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: '#fafafa',
            borderRadius: '5px',
            border: '1px solid #eee'
        }
    });

    const fontLeftColumn = window.$('div', {
        css: { flex: '1' }
    });

    const fontLabel = window.$('div', {
        text: 'Font Size',
        css: {
            fontWeight: '500',
            marginBottom: '3px',
            color: '#333'
        }
    });

    const fontDesc = window.$('div', {
        text: 'Adjust lyrics font size',
        css: {
            fontSize: '12px',
            color: '#666',
            fontStyle: 'italic'
        }
    });

    fontLeftColumn.append(fontLabel, fontDesc);

    const fontControls = window.$('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const fontSizeSlider = window.$('input', {
        type: 'range',
        min: '12',
        max: '48',
        value: localStorage.getItem('lyrix_font_size') || '16',
        css: {
            width: '120px'
        }
    });

    const fontSizeValue = window.$('span', {
        text: `${localStorage.getItem('lyrix_font_size') || '16'}px`,
        css: {
            minWidth: '40px',
            textAlign: 'center',
            fontSize: '12px',
            fontFamily: 'monospace'
        }
    });

    fontSizeSlider.addEventListener('input', (e) => {
        const size = e.target.value;
        fontSizeValue.textContent = `${size}px`;
        localStorage.setItem('lyrix_font_size', size);
        
        // Apply font size immediately
        const lyricsContainer = document.querySelector('.lyrics-container');
        if (lyricsContainer) {
            lyricsContainer.style.fontSize = `${size}px`;
        }
        console.log(`📝 Font size changed to: ${size}px`);
    });

    fontControls.append(fontSizeSlider, fontSizeValue);
    fontSizeContainer.append(fontLeftColumn, fontControls);

    const fontSettings = [fontSizeContainer];
    const fontSection = createSettingSection('📝 Display', fontSettings);

    // MIDI Inspector Section
    const midiInspectorSettings = [
        createToggleRow('Show MIDI Inspector', 'lyrix_show_midi_inspector', 'Display MIDI input monitoring panel', toggleMidiInspector)
    ];

    const midiInspectorSection = createSettingSection('🔍 MIDI Inspector', midiInspectorSettings);

    // Add all sections to content
    content.append(
        midiSection,
        audioSection, 
        syncSection,
        timecodeSection,
        metadataSection,
        fontSection,
        midiInspectorSection
    );

    // Footer
    const footer = window.UIManager.createModalFooter({});
    
    const resetButton = window.$('button', {
        text: 'Reset All MIDI',
        css: {
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
        },
        onClick: () => {
            window.ConfirmModal({
                title: '🗑️ Reset MIDI Assignments',
                message: 'Are you sure you want to clear all MIDI assignments? This action cannot be undone.',
                confirmText: 'Reset All',
                cancelText: 'Cancel',
                onConfirm: () => {
                    if (window.midiUtilities) {
                        window.midiUtilities.clearAllAssignments();
                        console.log('🎹 All MIDI assignments cleared');
                        // Refresh the modal to update the display
                        document.body.removeChild(modalContainer);
                        showSettingsModal();
                    }
                }
            });
        }
    });

    const closeButton = window.UIManager.createCancelButton({
        text: 'Close',
        onClick: () => {
            stopTimeMonitoring();
            document.body.removeChild(modalContainer);
        }
    });

    footer.append(resetButton, closeButton);

    // Assemble modal
    modal.append(header, content, footer);
    modalContainer.appendChild(modal);
    
    // Add to DOM
    document.body.appendChild(modalContainer);

    // Close on overlay click
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            stopTimeMonitoring();
            document.body.removeChild(modalContainer);
        }
    });

    // Focus first input
    setTimeout(() => {
        const firstInput = modal.querySelector('input');
        if (firstInput) firstInput.focus();
    }, 100);

    // Force update all MIDI assignment values after DOM is ready
    setTimeout(() => {
        updateAllMidiInputValues(modal);
    }, 200);
}

// Function to update all MIDI input values in the modal
function updateAllMidiInputValues(modal) {
    if (!window.midiUtilities) return;
    
    // Find all MIDI inputs and update their values using the data-setting-key attribute
    const midiInputs = modal.querySelectorAll('input[data-setting-key]');
    
    midiInputs.forEach((input) => {
        const settingKey = input.getAttribute('data-setting-key');
        if (settingKey) {
            const midiNote = window.midiUtilities.getMidiSpecialAssignment(settingKey);
            if (midiNote) {
                input.value = midiNote;
            }
        }
    });
}
