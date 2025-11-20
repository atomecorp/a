// Settings Panel Module
// Handles all application settings including MIDI assignments, audio controls, and preferences
// Converted from modal to inline panel that appears above lyrics viewer
import { CONSTANTS } from '../core/constants.js';
import { StorageManager } from '../services/storage.js';
import default_theme from './style.js';
import { getPurchaseManager } from '../features/purchase/purchase_manager.js';

// Settings panel state management
let isSettingsOpen = false;
let settingsPanel = null;
let originalLyricsViewerContainer = null;

// Expose settings state for cross-panel communication
window.settingsState = {
    get isSettingsOpen() { return isSettingsOpen; },
    set isSettingsOpen(value) { isSettingsOpen = value; },
    get settingsPanel() { return settingsPanel; },
    set settingsPanel(value) { settingsPanel = value; }
};

// Toggle audio player controls visibility
export function toggleAudioPlayerControls() {
    const audioPlayer = document.getElementById('audioPlayer');
    const showControls = getToggleState('lyrix_show_audio_controls');

    if (audioPlayer) {
        audioPlayer.style.display = showControls ? 'block' : 'none';
    }
}

// Toggle audio sync functionality
export function toggleAudioSync() {
    const enableSync = getToggleState('lyrix_enable_audio_sync');

    if (window.audioController) {
        window.audioController.syncEnabled = enableSync;
    }
}

// Toggle MIDI inspector functionality
export function toggleMidiInspector() {
    const showInspector = getToggleState('lyrix_show_midi_inspector');

    if (window.midiUtilities && window.midiUtilities.inspector) {
        if (showInspector) {
            window.midiUtilities.inspector.show();
        } else {
            window.midiUtilities.inspector.hide();
        }
    }
}

// Toggle timecode visibility in lyrics lines
export function toggleTimecodeVisibility() {
    const showTimecodes = getToggleState('lyrix_show_timecodes');

    // Find all existing timecode elements and toggle their visibility
    const timecodeElements = document.querySelectorAll('.timecode-span, [class*="timecode"]');
    timecodeElements.forEach(timecode => {
        if (timecode) {
            timecode.style.display = showTimecodes ? 'inline' : 'none';
        }
    });

    // Also trigger any existing timecode update mechanism in LyricsDisplay
    if (window.lyricsDisplay && window.lyricsDisplay.updateTimecodeVisibility) {
        window.lyricsDisplay.updateTimecodeVisibility();
    }
}

// Toggle title visibility in lyrics display
export function toggleTitleVisibility() {
    const savedTitleState = localStorage.getItem('lyrix_show_title');
    const showTitle = savedTitleState !== 'false'; // Default to true if not set, same logic as display.js

    // Update display instance if available
    if (window.Lyrix && window.Lyrix.lyricsDisplay) {
        window.Lyrix.lyricsDisplay.showTitle = showTitle;
        window.Lyrix.lyricsDisplay.updateTitleVisibility();
    }

    // Also update directly in DOM
    const titleElement = document.getElementById('edit_title_input') || document.getElementById('lyrics-title-display');
    if (titleElement) {
        titleElement.style.display = showTitle ? 'block' : 'none';
    }
}

// Toggle artist visibility in lyrics display
export function toggleArtistVisibility() {
    const savedArtistState = localStorage.getItem('lyrix_show_artist');
    const showArtist = savedArtistState !== 'false'; // Default to true if not set, same logic as display.js

    // Update display instance if available
    if (window.Lyrix && window.Lyrix.lyricsDisplay) {
        window.Lyrix.lyricsDisplay.showArtist = showArtist;
        window.Lyrix.lyricsDisplay.updateArtistVisibility();
    }

    // Also update directly in DOM
    const artistElement = document.getElementById('edit_artist_input') || document.getElementById('lyrics-artist-display');
    if (artistElement) {
        artistElement.style.display = showArtist ? 'block' : 'none';
    }
}

// Toggle experimental audio controls visibility

// Helper function to get correct default value for storage keys
function getToggleState(storageKey) {
    if (storageKey === 'lyrix_show_title' || storageKey === 'lyrix_show_artist') {
        // For title and artist, default to true (same logic as display.js)
        const savedState = localStorage.getItem(storageKey);
        return savedState !== 'false'; // Default to true if not set
    } else {
        // For other settings, default to false
        return localStorage.getItem(storageKey) === 'true';
    }
}

// Start MIDI learn for settings function
export function startMidiLearnForSetting(settingName, inputElement, buttonElement) {
    // Force le fond transparent après toute interaction (blur ou mouseup)
    const forceTransparent = () => {
        buttonElement.style.backgroundColor = 'transparent';
        buttonElement.style.setProperty('background-color', 'transparent', 'important');
        // Double forçage asynchrone pour écraser tout style réappliqué par le framework
        setTimeout(() => {
            buttonElement.style.backgroundColor = 'transparent';
            buttonElement.style.setProperty('background-color', 'transparent', 'important');
        }, 0);
    };
    buttonElement.addEventListener('blur', forceTransparent);
    buttonElement.addEventListener('mouseup', forceTransparent);
    buttonElement.addEventListener('click', forceTransparent);
    if (!window.midiUtilities) {
        return;
    }

    if (window.midiUtilities.isLearning) {
        // Stop learning
        window.midiUtilities.stopMidiLearn();
        buttonElement.style.backgroundColor = 'transparent';
        // Force aussi important pour écraser tout style résiduel
        buttonElement.style.setProperty('background-color', 'transparent', 'important');
        buttonElement.style.color = '#007acc';
        buttonElement.innerHTML = '';
        try { const img = document.createElement('img'); img.src = 'assets/images/icons/target.svg'; img.alt = 'midi'; img.style.width = '14px'; img.style.height = '14px'; img.style.pointerEvents = 'none'; buttonElement.appendChild(img); } catch (e) { }
    } else {
        // Start learning
        buttonElement.style.backgroundColor = '#ff6b6b';
        buttonElement.style.color = 'white';
        buttonElement.textContent = '⏹️';

        window.midiUtilities.startMidiLearn((midiNote) => {
            // Remove any existing assignment for this setting
            window.midiUtilities.removeMidiSpecialAssignment(settingName);
            // Set new special assignment for settings
            window.midiUtilities.setMidiSpecialAssignment(settingName, midiNote);
            // Update input field
            inputElement.value = midiNote;
            // Reset button appearance
            buttonElement.style.backgroundColor = 'transparent';
            buttonElement.style.setProperty('background-color', 'transparent', 'important');
            buttonElement.style.color = '#007acc';
            buttonElement.innerHTML = '';
            try { const img = document.createElement('img'); img.src = 'assets/images/icons/target.svg'; img.alt = 'midi'; img.style.width = '14px'; img.style.height = '14px'; img.style.pointerEvents = 'none'; buttonElement.appendChild(img); } catch (e) { }
        });
    }
}

// Toggle settings panel (replaces modal behavior)
export function toggleSettingsPanel(id_passed) {
    if (isSettingsOpen) {
        closeSettingsPanel();

        // Remettre la couleur de fond normale du bouton
        const button = document.getElementById(id_passed);
        if (button) {
            if (button._setActive) { button._setActive(false); } else { button.style.backgroundColor = 'transparent'; }
        }
    } else {
        openSettingsPanel(id_passed);

        // Changer la couleur de fond du bouton pour indiquer qu'il est actif
        const button = document.getElementById(id_passed);
        if (button) {
            if (button._setActive) { button._setActive(true); } else { button.style.backgroundColor = '#ffffffff'; }
        }
    }
}

// Open settings panel above lyrics viewer
export function openSettingsPanel(triggerId) {
    if (isSettingsOpen || settingsPanel) {
        return; // Panel already open
    }
    // New behavior: keep song library panel open (and its button active) when opening settings
    // So we intentionally do NOT close song library here anymore.

    isSettingsOpen = true;

    // Find the main app container and lyrics content
    const appContainer = document.getElementById('lyrix_app') || document.getElementById('view') || document.body;
    const displayContainer = document.getElementById('display-container');
    const lyricsContent = document.querySelector('#lyrics_content_area') ||
        document.querySelector('#lyrics-content') ||
        document.querySelector('#lyrics-metadata-container')?.parentNode ||
        document.querySelector('#lyrics_lines_container')?.parentNode ||
        displayContainer ||
        appContainer;

    if (!appContainer && !displayContainer && !lyricsContent) {
        return;
    }

    // Use the lyrics content container if found, otherwise display container, otherwise app container
    const targetContainer = lyricsContent || displayContainer || appContainer;
    originalLyricsViewerContainer = targetContainer;

    // Create the inline settings panel (themed)
    settingsPanel = window.$('div', { id: 'settings-panel', css: { width: '100%', height: localStorage.getItem('lyrix_settings_panel_height') || '40vh', marginBottom: '6px', overflow: 'hidden', transition: 'opacity 0.3s ease, transform 0.3s ease', opacity: '0', transform: 'translateY(-10px)', display: 'flex', flexDirection: 'column', userSelect: 'none', webkitUserSelect: 'none', mozUserSelect: 'none', msUserSelect: 'none', resize: 'none', backgroundColor: default_theme.colors.surface, border: `1px solid ${default_theme.colors.border}`, borderRadius: default_theme.borderRadius.lg, boxShadow: default_theme.panel.shadow, backdropFilter: default_theme.panel.backdrop }, 'aria-hidden': 'false', role: 'region', 'aria-label': 'Settings panel' });

    // Create panel content (no header to save space)
    const content = createSettingsContent();
    settingsPanel.appendChild(content);

    // Create resize grip
    const resizeGrip = window.$('div', { id: 'settings-resize-grip', css: { width: '100%', height: '8px', backgroundColor: default_theme.colors.primary, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: `0 0 ${default_theme.borderRadius.md} ${default_theme.borderRadius.md}`, transition: 'background-color 0.2s ease', marginBottom: '15px', borderTop: `1px solid ${default_theme.colors.border}` }, title: 'Drag to resize settings panel' });

    // Add grip visual indicator
    const gripIndicator = window.$('div', { css: { width: '34px', height: '3px', backgroundColor: default_theme.colors.textMuted, borderRadius: '2px', position: 'relative', opacity: '0.9' } });

    gripIndicator.innerHTML = '<div style="position: absolute; top: -2px; left: 0; width: 30px; height: 1px; background-color: #999; border-radius: 1px;"></div><div style="position: absolute; top: 4px; left: 0; width: 30px; height: 1px; background-color: #999; border-radius: 1px;"></div>';

    resizeGrip.appendChild(gripIndicator);

    // Add resize functionality
    addResizeListeners(settingsPanel, resizeGrip, 'lyrix_settings_panel_height');

    // Insert panel at the appropriate location
    if (targetContainer === appContainer) {
        // Insert as first child of app container
        appContainer.insertBefore(settingsPanel, appContainer.firstChild);
        appContainer.insertBefore(resizeGrip, settingsPanel.nextSibling);
    } else if (targetContainer === displayContainer) {
        // Insert the panel at the beginning of the display container (after toolbar, before lyrics content)
        const toolbar = displayContainer.querySelector('#lyrics-toolbar');
        const lyricsContent = displayContainer.querySelector('#lyrics_content_area');
        if (toolbar && lyricsContent) {
            // Insert between toolbar and lyrics content
            displayContainer.insertBefore(settingsPanel, lyricsContent);
            displayContainer.insertBefore(resizeGrip, lyricsContent);
        } else {
            // Fallback: insert as first child
            displayContainer.insertBefore(settingsPanel, displayContainer.firstChild);
            displayContainer.insertBefore(resizeGrip, settingsPanel.nextSibling);
        }
    } else if (targetContainer && targetContainer.parentNode) {
        // Insert before the target container
        targetContainer.parentNode.insertBefore(settingsPanel, targetContainer);
        targetContainer.parentNode.insertBefore(resizeGrip, targetContainer);
    } else {
        // Fallback: append to body
        document.body.appendChild(settingsPanel);
        document.body.appendChild(resizeGrip);
    }

    // Animate panel in
    requestAnimationFrame(() => {
        settingsPanel.style.opacity = '1';
        settingsPanel.style.transform = 'translateY(0)';
    });

    // Update settings button accessibility
    updateSettingsButtonAria(true);

    // Focus first interactive element in panel
    const firstFocusable = settingsPanel.querySelector('input, button, select, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) {
        setTimeout(() => firstFocusable.focus(), 100);
    }

    // Add escape key listener
    document.addEventListener('keydown', handlePanelEscapeKey);
}

// Close settings panel
export function closeSettingsPanel() {
    if (!isSettingsOpen || !settingsPanel) {
        return;
    }

    isSettingsOpen = false;

    // Animate panel out
    settingsPanel.style.opacity = '0';
    settingsPanel.style.transform = 'translateY(-10px)';

    // Also hide the resize grip
    const resizeGrip = document.getElementById('settings-resize-grip');
    if (resizeGrip) {
        resizeGrip.style.opacity = '0';
    }

    // Remove panel and grip from DOM after animation
    setTimeout(() => {
        if (settingsPanel && settingsPanel.parentNode) {
            settingsPanel.parentNode.removeChild(settingsPanel);
        }
        if (resizeGrip && resizeGrip.parentNode) {
            resizeGrip.parentNode.removeChild(resizeGrip);
        }
        settingsPanel = null;
    }, 300);

    // Update settings button accessibility
    updateSettingsButtonAria(false);

    // Return focus to settings button
    const settingsButton = document.getElementById('settings_button');
    if (settingsButton) {
        settingsButton.focus();
    }

    // Remove escape key listener
    document.removeEventListener('keydown', handlePanelEscapeKey);

    // New requirement: when settings are closed, also exit edit mode and close song list to return to normal view
    // Exit edit mode if active
    if (window.Lyrix && window.Lyrix.lyricsDisplay && window.Lyrix.lyricsDisplay.editMode) {
        try { window.Lyrix.lyricsDisplay.toggleEditMode(); } catch (e) { }
    }
    // Close song library panel if present
    const songLibraryPanel = document.getElementById('song-library-panel');
    if (songLibraryPanel) {
        try {
            songLibraryPanel.remove();
            const songLibraryGrip = document.getElementById('song-library-resize-grip');
            if (songLibraryGrip) songLibraryGrip.remove();
        } catch (e) { }
        const songListButton = document.getElementById('song_list_button');
        if (songListButton && songListButton._setActive) songListButton._setActive(false);
    }
}

// Create settings panel header
function createSettingsPanelHeader() {
    const header = window.$('div', {
        css: {
            padding: '15px 20px',
            backgroundColor: 'rgb(58, 74, 96)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: '0',
            minHeight: '60px'
        }
    });

    const title = window.$('h3', {
        id: 'settings-panel-title',
        text: '⚙️ Settings',
        css: {
            margin: '0',
            color: '#fff',
            fontSize: '18px',
            fontWeight: 'bold'
        }
    });

    const closeButton = window.$('button', {
        text: '✕',
        type: 'button',
        'aria-label': 'Close settings panel',
        css: {
            backgroundColor: 'transparent',
            border: 'none',
            color: '#666',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '5px 10px',
            borderRadius: '4px',
            transition: 'background-color 0.2s'
        },
        onClick: closeSettingsPanel
    });

    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.backgroundColor = '#e9ecef';
    });

    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.backgroundColor = 'transparent';
    });

    header.append(title, closeButton);
    return header;
}

// Handle escape key for panel
function handlePanelEscapeKey(event) {
    if (event.key === 'Escape' && isSettingsOpen) {
        // Only close panel if focus is within the panel
        if (settingsPanel && settingsPanel.contains(event.target)) {
            event.stopPropagation();
            closeSettingsPanel();
        }
    }
}

// Update settings button aria attributes and visual state
function updateSettingsButtonAria(isOpen) {
    const settingsButton = document.getElementById('settings_button');
    if (settingsButton) {
        settingsButton.setAttribute('aria-expanded', isOpen.toString());
        settingsButton.setAttribute('aria-controls', 'settings-panel');

        // Update button text for screen readers
        const ariaLabel = isOpen ? 'Close settings panel' : 'Open settings panel';
        settingsButton.setAttribute('aria-label', ariaLabel);

        // Simple visual state change
        if (isOpen) {
            settingsButton.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
            settingsButton.style.color = '#007bff';
        } else {
            settingsButton.style.backgroundColor = '';
            settingsButton.style.color = '';
        }
    }
}

// Create settings content (shared by panel and modal)
function createSettingsContent() {
    const content = window.$('div', {
        id: 'settings_overflow_container',
        css: {
            padding: '20px',
            backgroundColor: 'rgb(48, 60, 78)',
            flex: '1',
            height: '100%',
            overflowY: 'auto',
            maxHeight: '100%', // Full panel height since no header
            position: 'relative'
        }
    });

    // Helper function to create setting sections
    function createSettingSection(title, items) {
        const section = window.$('div', {
            css: {
                marginBottom: '25px',
                border: 'none',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'rgb(52, 66, 86)' // slightly lighter/greyed blue
            }
        });

        const sectionHeader = window.$('div', {
            text: title,
            css: {
                backgroundColor: 'rgb(58, 74, 96)',
                padding: '12px 15px',
                fontWeight: 'bold',
                fontSize: '16px',
                color: '#fff',
                borderBottom: '1px solid rgba(255,255,255,0.08)'
            }
        });

        const sectionContent = window.$('div', {
            css: {
                padding: '15px',
                backgroundColor: 'rgb(52, 66, 86)',
                color: '#fff'
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
                backgroundColor: 'rgb(52, 66, 86)',
                borderRadius: '5px',
                border: 'none'
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
                color: '#fff'
            }
        });

        const descDiv = window.$('div', {
            text: description,
            css: {
                fontSize: '12px',
                color: '#cbd5e1',
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
                border: 'none',
                borderRadius: '3px',
                fontSize: '12px',
                textAlign: 'center',
                backgroundColor: 'rgb(48, 60, 78)',
                color: '#fff'
            }
        });

        if (currentMidiNote) {
            midiInput.value = currentMidiNote;
            midiInput.setAttribute('value', currentMidiNote);
        }

        midiInput.setAttribute('data-setting-key', settingKey);

        const midiLearnButton = window.$('button', {
            text: '',
            type: 'button',
            css: {
                width: '30px',
                height: '30px',
                border: 'none',
                borderRadius: '3px',
                backgroundColor: 'rgb(58, 74, 96)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0'
            },
            title: `Learn MIDI note for ${label}`
        });
        try { midiLearnButton.innerHTML = ''; const img = document.createElement('img'); img.src = 'assets/images/icons/target.svg'; img.alt = 'midi'; img.style.width = '14px'; img.style.height = '14px'; img.style.pointerEvents = 'none'; midiLearnButton.appendChild(img); } catch (e) { }

        midiLearnButton.addEventListener('click', () => {
            startMidiLearnForSetting(settingKey, midiInput, midiLearnButton);
        });

        midiInput.addEventListener('change', (e) => {
            const midiNote = parseInt(e.target.value);
            if (window.midiUtilities && !isNaN(midiNote) && midiNote >= 0 && midiNote <= 127) {
                window.midiUtilities.removeMidiSpecialAssignment(settingKey);
                window.midiUtilities.setMidiSpecialAssignment(settingKey, midiNote);
            } else if (window.midiUtilities && e.target.value === '') {
                window.midiUtilities.removeMidiSpecialAssignment(settingKey);
            }
        });

        rightColumn.append(midiInput, midiLearnButton);
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
                backgroundColor: 'rgb(52, 66, 86)',
                borderRadius: '5px',
                border: 'none'
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
                color: '#fff'
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

        // Get current state
        const isEnabled = getToggleState(storageKey);

        // Create toggle button
        const toggleButton = window.$('button', {
            text: isEnabled ? 'ON' : 'OFF',
            type: 'button',
            css: {
                width: '60px',
                height: '30px',
                border: 'none',
                borderRadius: '15px',
                // Inverted: dark when ON, lighter when OFF
                backgroundColor: isEnabled ? 'rgb(44, 56, 72)' : 'rgb(58, 74, 96)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                transition: 'background-color 150ms ease, box-shadow 150ms ease, transform 80ms ease',
                outline: 'none'
            },
            title: `${isEnabled ? 'Disable' : 'Enable'} ${label}`
        });

        // Initial shadow states
        const applyStateShadow = (enabled) => {
            if (enabled) {
                toggleButton.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.05)';
                toggleButton.style.transform = 'translateY(1px)';
            } else {
                toggleButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
                toggleButton.style.transform = 'translateY(0)';
            }
        };
        applyStateShadow(isEnabled);

        // Toggle functionality
        toggleButton.addEventListener('click', () => {
            const currentState = getToggleState(storageKey);
            const newState = !currentState;

            // Update localStorage
            localStorage.setItem(storageKey, newState.toString());

            // Update button appearance
            toggleButton.textContent = newState ? 'ON' : 'OFF';
            toggleButton.style.backgroundColor = newState ? 'rgb(44, 56, 72)' : 'rgb(58, 74, 96)';
            toggleButton.title = `${newState ? 'Disable' : 'Enable'} ${label}`;
            applyStateShadow(newState);

            // Call the toggle function
            if (onToggle) {
                onToggle();
            }
        });

        // Hover effects
        toggleButton.addEventListener('mouseenter', () => {
            const isCurrentlyEnabled = getToggleState(storageKey);
            // Lighten each state slightly
            toggleButton.style.backgroundColor = isCurrentlyEnabled ? 'rgb(52, 66, 86)' : 'rgb(66, 84, 108)';
            if (!isCurrentlyEnabled) toggleButton.style.boxShadow = '0 3px 6px rgba(0,0,0,0.55)';
        });

        toggleButton.addEventListener('mouseleave', () => {
            const isCurrentlyEnabled = getToggleState(storageKey);
            toggleButton.style.backgroundColor = isCurrentlyEnabled ? 'rgb(44, 56, 72)' : 'rgb(58, 74, 96)';
            applyStateShadow(isCurrentlyEnabled);
        });

        // Active press feedback
        toggleButton.addEventListener('mousedown', () => {
            toggleButton.style.transform = 'translateY(2px)';
            toggleButton.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.65)';
        });
        ['mouseup', 'mouseleave'].forEach(ev => toggleButton.addEventListener(ev, () => {
            applyStateShadow(getToggleState(storageKey));
        }));

        row.append(leftColumn, toggleButton);
        return row;
    }

    // Create all sections with essential settings
    const midiAssignments = [
        createMidiAssignmentRow('Previous Song', 'previous_song', 'Navigate to previous song in library'),
        createMidiAssignmentRow('Next Song', 'next_song', 'Navigate to next song in library'),
        createMidiAssignmentRow('Play/Pause', 'play_pause', 'Toggle audio playback'),
        createMidiAssignmentRow('Stop', 'stop', 'Stop audio playback'),
        createMidiAssignmentRow('Enter Fullscreen', 'enter_fullscreen', 'Enter fullscreen mode'),
        createMidiAssignmentRow('Exit Fullscreen', 'exit_fullscreen', 'Exit fullscreen mode'),
    ];

    const midiSection = createSettingSection('MIDI Assignments', midiAssignments);

    const audioControls = [
        createToggleRow('Show Timecodes', 'lyrix_show_timecodes', 'Display time markers in lyrics lines', toggleTimecodeVisibility),
        createToggleRow('Show Song Title', 'lyrix_show_title', 'Display song title in lyrics view', toggleTitleVisibility),
        createToggleRow('Show Artist Name', 'lyrix_show_artist', 'Display artist name in lyrics view', toggleArtistVisibility),
        // Experimental section removed
    ];

    const audioSection = createSettingSection('Audio & Display', audioControls);

    // In-App Purchases section
    const purchaseManager = getPurchaseManager();
    function createInAppPurchaseRow() {
        const storageKey = 'lyrix_purchase_midi_console';
        const label = 'MIDI Console';
        // Reuse toggle row layout but override behavior
        const row = createToggleRow(label, storageKey, 'Unlock advanced MIDI inspection console', () => { });
        // Grab the actual button we created in createToggleRow
        const toggleBtn = row.querySelector('button');
        const applyOwnedUI = () => {
            const owned = purchaseManager.isOwned();
            toggleBtn.textContent = owned ? 'ON' : 'OFF';
            toggleBtn.style.backgroundColor = owned ? 'rgb(44, 56, 72)' : 'rgb(58, 74, 96)';
            if (owned) localStorage.setItem(storageKey, 'owned');
        };
        applyOwnedUI();
        toggleBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (purchaseManager.isOwned()) {
                // Allow user to temporarily hide console (acts like off)
                const currentlyEnabled = localStorage.getItem('lyrix_midi_inspector_enabled') === 'true';
                const newState = !currentlyEnabled;
                localStorage.setItem('lyrix_midi_inspector_enabled', newState.toString());
                if (window.midiUtilities && window.midiUtilities.midiContainer) {
                    window.midiUtilities.midiContainer.style.display = newState ? 'block' : 'none';
                }
                toggleBtn.textContent = newState ? 'ON' : 'OFF';
                toggleBtn.style.backgroundColor = newState ? 'rgb(44,56,72)' : 'rgb(58,74,96)';
            } else {
                toggleBtn.textContent = 'Buying...';
                toggleBtn.style.opacity = '0.6';
                const ok = await purchaseManager.requestPurchase();
                toggleBtn.style.opacity = '1';
                if (ok) {
                    // Auto-enable inspector after purchase
                    localStorage.setItem('lyrix_midi_inspector_enabled', 'true');
                    if (window.midiUtilities && window.midiUtilities.midiContainer) {
                        window.midiUtilities.midiContainer.style.display = 'block';
                    }
                }
                applyOwnedUI();
            }
        }, { capture: true });
        window.addEventListener('lyrix-purchase-updated', applyOwnedUI);
        return row;
    }
    function createRestoreRow() {
        const row = window.$('div', { css: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: 'rgb(52, 66, 86)', borderRadius: '5px', marginBottom: '10px' } });
        const left = window.$('div');
        left.append(
            window.$('div', { text: 'Restore Purchases', css: { fontWeight: '500', color: '#fff', marginBottom: '3px' } }),
            window.$('div', { text: 'Re-activate previous purchases', css: { fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic' } })
        );
        const btn = window.$('div', { text: 'Restore', css: { padding: '6px 14px', backgroundColor: 'rgb(58,74,96)', color: '#fff', borderRadius: '4px', cursor: 'pointer', userSelect: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' } });
        btn.addEventListener('click', async () => {
            btn.textContent = 'Restoring...'; btn.style.opacity = '0.6';
            const ok = await purchaseManager.restorePurchases();
            btn.style.opacity = '1'; btn.textContent = ok ? 'Restored' : 'Retry';
            setTimeout(() => { if (ok) btn.textContent = 'Restore'; }, 2000);
        });
        row.append(left, btn);
        return row;
    }
    const iapSection = createSettingSection('In-App Purchases', [createInAppPurchaseRow(), createRestoreRow()]);

    // Font size control
    function createFontSizeControl() {
        const container = window.$('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: 'rgb(52, 66, 86)',
                borderRadius: '5px',
                border: 'none'
            }
        });

        const leftColumn = window.$('div', {
            css: { flex: '1' }
        });

        const labelDiv = window.$('div', {
            text: 'Font Size',
            css: {
                fontWeight: '500',
                marginBottom: '3px',
                color: '#fff'
            }
        });

        const descDiv = window.$('div', {
            text: 'Adjust lyrics text size',
            css: {
                fontSize: '12px',
                color: '#cbd5e1',
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

        // Get current font size - check multiple sources
        let currentFontSize = parseInt(localStorage.getItem('lyrix_font_size'));

        // If not in localStorage, try to get from actual lyrics container
        if (!currentFontSize || isNaN(currentFontSize)) {
            const lyricsContainer = document.querySelector('#lyrics-content, #lyrics_lines_container, .lyrics-container');
            if (lyricsContainer) {
                const computedStyle = window.getComputedStyle(lyricsContainer);
                const fontSize = parseInt(computedStyle.fontSize);
                if (fontSize && !isNaN(fontSize)) {
                    currentFontSize = fontSize;
                }
            }
        }

        // Fallback to default
        if (!currentFontSize || isNaN(currentFontSize)) {
            currentFontSize = 16;
        }

        // Decrease button
        const decreaseButton = window.$('button', {
            text: '−',
            type: 'button',
            css: {
                width: '30px',
                height: '30px',
                border: 'none',
                borderRadius: '3px',
                backgroundColor: 'rgb(58, 74, 96)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0'
            },
            title: 'Decrease font size'
        });

        // Font size input
        const fontInput = window.$('input', {
            type: 'number',
            min: '10',
            max: '255',
            value: currentFontSize.toString(),
            css: {
                width: '60px',
                padding: '5px',
                border: 'none',
                borderRadius: '3px',
                fontSize: '12px',
                textAlign: 'center',
                backgroundColor: 'rgb(48, 60, 78)',
                color: '#fff'
            }
        });

        // Increase button
        const increaseButton = window.$('button', {
            text: '+',
            type: 'button',
            css: {
                width: '30px',
                height: '30px',
                border: 'none',
                borderRadius: '3px',
                backgroundColor: 'rgb(58, 74, 96)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0'
            },
            title: 'Increase font size'
        });

        // Function to update font size
        function updateFontSize(newSize) {
            newSize = Math.max(10, Math.min(255, newSize)); // Clamp between 10-255
            fontInput.value = newSize;
            localStorage.setItem('lyrix_font_size', newSize);

            // Prefer central API if available for consistent fullscreen behavior
            if (window.Lyrix && window.Lyrix.lyricsDisplay && typeof window.Lyrix.lyricsDisplay.setFontSize === 'function') {
                window.Lyrix.lyricsDisplay.setFontSize(newSize);
            } else {
                // Fallback: apply directly
                const lyricsContainers = document.querySelectorAll('.lyrics-container, #lyrics-content, #lyrics_lines_container');
                lyricsContainers.forEach(container => {
                    if (container) {
                        container.style.fontSize = `${newSize}px`;
                    }
                });
            }
        }

        // Event listeners
        decreaseButton.addEventListener('click', () => {
            const currentSize = parseInt(fontInput.value) || 16;
            updateFontSize(currentSize - 1);
        });

        increaseButton.addEventListener('click', () => {
            const currentSize = parseInt(fontInput.value) || 16;
            updateFontSize(currentSize + 1);
        });

        // Press & hold auto-repeat logic
        let repeatTimeout = null;
        let repeatInterval = null;
        const INITIAL_DELAY = 400; // ms before repeat starts
        const REPEAT_RATE = 70; // ms per step
        let activeDirection = null; // 'inc' | 'dec'

        function stepOnce(direction) {
            const currentSize = parseInt(fontInput.value) || 16;
            updateFontSize(direction === 'inc' ? currentSize + 1 : currentSize - 1);
        }

        function startRepeat(direction) {
            activeDirection = direction;
            clearTimers();
            // Start after initial delay
            repeatTimeout = setTimeout(() => {
                stepOnce(direction); // first repeat step
                repeatInterval = setInterval(() => stepOnce(direction), REPEAT_RATE);
            }, INITIAL_DELAY);
        }

        function clearTimers() {
            if (repeatTimeout) { clearTimeout(repeatTimeout); repeatTimeout = null; }
            if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null; }
            activeDirection = null;
        }

        // Mouse / touch events for decrease
        ['mousedown', 'touchstart'].forEach(evt => {
            decreaseButton.addEventListener(evt, (e) => { e.preventDefault(); startRepeat('dec'); });
            increaseButton.addEventListener(evt, (e) => { e.preventDefault(); startRepeat('inc'); });
        });
        ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
            decreaseButton.addEventListener(evt, clearTimers);
            increaseButton.addEventListener(evt, clearTimers);
        });
        // Global mouseup (in case pointer released outside)
        document.addEventListener('mouseup', clearTimers);

        fontInput.addEventListener('change', (e) => {
            const newSize = parseInt(e.target.value);
            if (!isNaN(newSize)) {
                updateFontSize(newSize);
            }
        });

        // Hover effects
        [decreaseButton, increaseButton].forEach(button => {
            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = 'rgb(66, 84, 108)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = 'rgb(58, 74, 96)';
            });
        });

        rightColumn.append(decreaseButton, fontInput, increaseButton);
        container.append(leftColumn, rightColumn);

        // Update input value when container is created (refresh current value)
        setTimeout(() => {
            let refreshedSize = parseInt(localStorage.getItem('lyrix_font_size'));
            if (!refreshedSize || isNaN(refreshedSize)) {
                const lyricsContainer = document.querySelector('#lyrics-content, #lyrics_lines_container, .lyrics-container');
                if (lyricsContainer) {
                    const computedStyle = window.getComputedStyle(lyricsContainer);
                    const fontSize = parseInt(computedStyle.fontSize);
                    if (fontSize && !isNaN(fontSize)) {
                        refreshedSize = fontSize;
                    }
                }
            }
            if (refreshedSize && !isNaN(refreshedSize)) {
                fontInput.value = refreshedSize;
            }
        }, 100);

        return container;
    }

    const fontSection = createSettingSection('🔤 Font Settings', [createFontSizeControl()]);

    // Add sections to content
    // Insert IAP section between audio/display and font settings for visibility
    content.append(midiSection, audioSection, fontSection, iapSection);

    return content;
}

// Show settings modal
export function showSettingsModal() {

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

    // Content - reuse shared content creation function
    const content = createSettingsContent();

    // Update content styles for modal
    content.style.padding = window.UIManager.THEME.spacing.lg;
    content.style.maxHeight = '500px';
    content.style.overflowY = 'auto';

    // Footer    // Helper function to create MIDI assignment row
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
        } else {
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
                border: 'none',
                borderRadius: '3px',
                fontSize: '12px',
                textAlign: 'center',
                backgroundColor: 'rgb(48, 60, 78)',
                color: '#fff'
            }
        });

        // Force update the input value after creation
        if (currentMidiNote) {
            midiInput.value = currentMidiNote;
            midiInput.setAttribute('value', currentMidiNote);
        }

        // Store setting key as data attribute for later reference
        midiInput.setAttribute('data-setting-key', settingKey);


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
            } else if (window.midiUtilities && e.target.value === '') {
                // Remove assignment if input is cleared
                window.midiUtilities.removeMidiSpecialAssignment(settingKey);
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

        // Get current state
        const isEnabled = getToggleState(storageKey);

        // Create toggle button
        const toggleButton = window.$('button', {
            text: isEnabled ? 'ON' : 'OFF',
            type: 'button',
            css: {
                width: '60px',
                height: '30px',
                border: 'none',
                borderRadius: '15px',
                backgroundColor: isEnabled ? '#28a745' : '#6c757d',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                transition: 'all 0.3s ease',
                outline: 'none'
            },
            title: `${isEnabled ? 'Disable' : 'Enable'} ${label}`
        });

        // Toggle functionality
        toggleButton.addEventListener('click', () => {
            const currentState = getToggleState(storageKey);
            const newState = !currentState;

            // Update localStorage
            localStorage.setItem(storageKey, newState.toString());

            // Update button appearance
            toggleButton.textContent = newState ? 'ON' : 'OFF';
            toggleButton.style.backgroundColor = newState ? '#28a745' : '#6c757d';
            toggleButton.title = `${newState ? 'Disable' : 'Enable'} ${label}`;

            // Call the toggle function
            if (onToggle) {
                onToggle();
            }
        });

        // Hover effects
        toggleButton.addEventListener('mouseenter', () => {
            const isCurrentlyEnabled = getToggleState(storageKey);
            toggleButton.style.backgroundColor = isCurrentlyEnabled ? '#218838' : '#5a6268';
        });

        toggleButton.addEventListener('mouseleave', () => {
            const isCurrentlyEnabled = getToggleState(storageKey);
            toggleButton.style.backgroundColor = isCurrentlyEnabled ? '#28a745' : '#6c757d';
        });

        row.append(leftColumn, toggleButton);
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
        checked: getToggleState('lyrix_show_timecode'),
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
    });

    fontControls.append(fontSizeSlider, fontSizeValue);
    fontSizeContainer.append(fontLeftColumn, fontControls);

    const fontSettings = [fontSizeContainer];
    const fontSection = createSettingSection('📝 Display', fontSettings);

    // Add all sections to content
    content.append(
        midiSection,
        syncSection,
        timecodeSection,
        metadataSection,
        fontSection
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
                title: 'Reset MIDI Assignments',
                message: 'Are you sure you want to clear all MIDI assignments? This action cannot be undone.',
                confirmText: 'Reset All',
                cancelText: 'Cancel',
                onConfirm: () => {
                    if (window.midiUtilities) {
                        window.midiUtilities.clearAllAssignments();
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

// Add resize functionality to panels
function addResizeListeners(panel, grip, storageKey) {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    // Hover effects for the grip
    grip.addEventListener('mouseenter', () => {
        grip.style.backgroundColor = '#d0d0d0';
        grip.querySelector('div').style.backgroundColor = '#666';
    });

    grip.addEventListener('mouseleave', () => {
        if (!isResizing) {
            grip.style.backgroundColor = '#e0e0e0';
            grip.querySelector('div').style.backgroundColor = '#999';
        }
    });

    // Start resizing
    grip.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = parseInt(window.getComputedStyle(panel).height, 10);

        grip.style.backgroundColor = '#007acc';
        grip.querySelector('div').style.backgroundColor = 'white';

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';

        e.preventDefault();
    });

    // Handle resizing
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;

        // Set minimum and maximum heights
        const minHeight = 150; // minimum 150px
        const maxHeight = window.innerHeight * 0.8; // maximum 80% of viewport height

        const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

        panel.style.height = `${clampedHeight}px`;

        e.preventDefault();
    });

    // Stop resizing
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;

            // Save the new height
            const finalHeight = panel.style.height;
            localStorage.setItem(storageKey, finalHeight);

            // Reset cursor and selection
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Reset grip appearance
            grip.style.backgroundColor = '#e0e0e0';
            grip.querySelector('div').style.backgroundColor = '#999';

            // IMPORTANT: Trigger a resize event to update the lyrics content area
            // This forces the lyrics container to recalculate its height
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));

                // Also directly update lyrics content area height if it exists
                const lyricsContentArea = document.getElementById('lyrics_content_area');
                if (lyricsContentArea) {
                    // Force recalculation of height
                    lyricsContentArea.style.height = 'auto';
                    requestAnimationFrame(() => {
                        // Calculate available height
                        const container = lyricsContentArea.parentElement;
                        if (container) {
                            const containerHeight = container.offsetHeight;
                            const toolbar = container.querySelector('#lyrics-toolbar');
                            const settingsPanel = document.getElementById('lyrix_settings_panel');

                            let availableHeight = containerHeight;
                            if (toolbar) availableHeight -= toolbar.offsetHeight;
                            if (settingsPanel) availableHeight -= settingsPanel.offsetHeight;

                            lyricsContentArea.style.height = `${Math.max(200, availableHeight)}px`;
                            console.log('🔄 Updated lyrics content area height:', lyricsContentArea.style.height);
                        }
                    });
                }
            }, 10);
        }
    });
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

export class SettingsManager {

    // Set font size with persistence and DOM updates
    static setFontSize(size) {
        if (size >= CONSTANTS.UI.MIN_FONT_SIZE && size <= CONSTANTS.UI.MAX_FONT_SIZE) {
            StorageManager.saveFontSize(size);

            // Update all lyrics lines
            document.querySelectorAll('.lyrics-line').forEach(el => {
                el.style.fontSize = size + 'px';
            });

            // Update font size display
            const display = document.getElementById('font-size-display');
            if (display) display.textContent = size + 'px';

            const slider = document.getElementById('font-size-slider');
            if (slider) slider.value = size;

            return true;
        }
        return false;
    }

    // Get current font size from storage
    static getFontSize() {
        return StorageManager.loadFontSize() || CONSTANTS.UI.DEFAULT_FONT_SIZE;
    }

    // Apply saved settings on startup
    static applySavedSettings() {
        const savedFontSize = this.getFontSize();
        this.setFontSize(savedFontSize);
    }

    // Reset settings to defaults
    static resetToDefaults() {
        this.setFontSize(CONSTANTS.UI.DEFAULT_FONT_SIZE);
    }
}

export default SettingsManager;
