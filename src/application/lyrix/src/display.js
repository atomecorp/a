// LyricsDisplay class for Lyrix application
import { CONSTANTS } from './constants.js';
import { StorageManager } from './storage.js';
import { UIManager } from './ui.js';

export class LyricsDisplay {
    constructor(container, audioController = null) {
        this.container = container; // May be null now since we append directly to lyrix_app
        this.audioController = audioController;
        this.currentLyrics = null;
        this.editMode = false;
        this.recordMode = false;
        this.fullscreenMode = false;
        this.showTimecodes = false;
        this.currentLineIndex = -1;
        this.fontSize = StorageManager.loadFontSize();
        this.lastScrollTime = 0;
        
        this.init();
    }
    
    // Initialize display
    init() {
        this.createDisplayElements();
        this.setupEventListeners();
    }
    
    // Create display elements using Squirrel syntax
    createDisplayElements() {
        // Create fixed toolbar (stays at top, doesn't scroll)
        this.toolbar = $('div', {
            id: 'lyrics_toolbar',
            css: {
                padding: '8px',
                backgroundColor: '#e9e9e9',
                borderRadius: '0',
                display: 'flex',
                flexDirection: 'column', // Stack rows vertically
                gap: '4px',
                borderBottom: '1px solid #ccc',
                flexShrink: 0,
                maxHeight: '120px', // Reduced to accommodate smaller audio row with half-height slider
                overflowY: 'auto',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                width: '100%'
            }
        });
        
        // Scrollable lyrics content area
        this.lyricsContent = $('div', {
            id: 'lyrics_content_area',
            css: {
                padding: '20px',
                overflow: 'auto',  // Only this area scrolls
                backgroundColor: '#f9f9f9',
                fontFamily: 'Arial, sans-serif',
                fontSize: `${this.fontSize}px`,
                lineHeight: '1.6',
                position: 'absolute',
                top: '60px',  // Initial position, will be updated based on audio tools visibility
                left: 0,
                right: 0,
                bottom: 0,  // Stretch to bottom
                width: '100%'
            }
        });
        
        // Edit mode button
        this.editButton = UIManager.createInterfaceButton('✏️', {
            id: 'edit_mode',
            onClick: () => this.toggleEditMode(),
            css: {
                backgroundColor: this.editMode ? '#4CAF50' : '#4a6fa5'
            }
        });
        
        // Record mode button
        this.recordButton = UIManager.createInterfaceButton('⏺️', {
            id: 'record_mode',
            onClick: () => this.toggleRecordMode(),
            css: {
                backgroundColor: this.recordMode ? '#f44336' : '#4a6fa5'
            }
        });
        
        // Fullscreen button
        this.fullscreenButton = UIManager.createInterfaceButton('⛶', {
            id: 'fullscreen_mode',
            onClick: () => this.toggleFullscreen()
        });

        // Add simple touch support for fullscreen button (mobile compatibility)
        this.fullscreenButton.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent mouse events from also firing
        });
        
        this.fullscreenButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleFullscreen(); // Call the toggle function directly
        });
        
        // Timecode button
        this.timecodeButton = UIManager.createInterfaceButton('🕐', {
            id: 'timecode_options',
            onClick: () => this.showTimecodeOptionsPanel()
        });
        
        // Font size controls
        this.fontSizeContainer = $('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
            }
        });
        
        const fontMinusButton = UIManager.createInterfaceButton('A-', {
            id: 'font_size_decrease',
            onClick: () => this.adjustFontSize(-2)
        });
        
        const fontPlusButton = UIManager.createInterfaceButton('A+', {
            id: 'font_size_increase',
            onClick: () => this.adjustFontSize(2)
        });
        
        this.fontSizeLabel = $('span', {
            id: 'font_size_label',
            text: `${this.fontSize}px`,
            css: {
                padding: '5px 10px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                userSelect: 'none'
            }
        });
        
        // Add double-click handler for direct font size editing
        this.fontSizeLabel.addEventListener('dblclick', (e) => {
            e.preventDefault();
            this.editFontSizeDirectly();
        });
        
        // Add touch-friendly editing for mobile
        let fontSizeTouchTimer;
        let fontSizeTouchStartTime;
        let fontSizeHasMoved = false;
        
        this.fontSizeLabel.addEventListener('touchstart', (e) => {
            fontSizeTouchStartTime = Date.now();
            fontSizeHasMoved = false;
            
            fontSizeTouchTimer = setTimeout(() => {
                if (!fontSizeHasMoved) {
                    e.preventDefault();
                    this.editFontSizeDirectly();
                }
            }, 500); // Longer delay for touch
        });
        
        this.fontSizeLabel.addEventListener('touchmove', (e) => {
            fontSizeHasMoved = true;
            clearTimeout(fontSizeTouchTimer);
        });
        
        this.fontSizeLabel.addEventListener('touchend', (e) => {
            clearTimeout(fontSizeTouchTimer);
        });
        
        this.fontSizeContainer.append(fontMinusButton, this.fontSizeLabel, fontPlusButton);
        
        // Create edit mode save and cancel buttons (initially hidden)
        this.saveChangesButton = UIManager.createInterfaceButton('💾', {
            id: 'save_changes_button',
            onClick: () => {
                this.applyBulkEditChanges();
                this.toggleEditMode(); // Exit edit mode after saving
            },
            css: {
                backgroundColor: '#4CAF50',
                display: 'none' // Initially hidden
            }
        });
        
        this.cancelEditButton = UIManager.createInterfaceButton('❌', {
            id: 'cancel_edit_button',
            onClick: () => {
                this.originalLinesBackup = null; // Discard changes
                this.toggleEditMode(); // Exit edit mode without saving
            },
            css: {
                backgroundColor: '#f44336',
                display: 'none' // Initially hidden
            }
        });
        
        // Get tools from left panel to move to toolbar
        this.nonAudioTools = this.getNonAudioTools();
        this.audioTools = this.getAudioTools();
        this.audioButtons = this.getAudioButtons();
        this.timecodeDisplay = this.getTimecodeDisplay();
        
        console.log('🔧 Retrieved tools:');
        console.log('  - nonAudioTools:', this.nonAudioTools.length);
        console.log('  - audioTools:', this.audioTools.length);
        console.log('  - audioButtons:', this.audioButtons.length, this.audioButtons);
        console.log('  - timecodeDisplay:', this.timecodeDisplay);
        
        // Apply compact styling to moved tools
        this.styleModeToolsForToolbar();
        
        // Create main toolbar row (non-audio tools + lyrics controls + timecode display)
        const mainToolRow = $('div', {
            css: {
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap'
            }
        });
        
        // Add all main toolbar elements (timecode display after timecode button)
        const mainToolElements = [
            ...this.nonAudioTools,
            this.editButton,
            this.recordButton,
            this.fullscreenButton,
            this.timecodeButton
        ];
        
        // Add timecode display after timecode button if it exists
        if (this.timecodeDisplay) {
            mainToolElements.push(this.timecodeDisplay);
        }
        
        // Add font size container
        mainToolElements.push(this.fontSizeContainer);
        
        // Add edit mode buttons (save and cancel)
        mainToolElements.push(this.saveChangesButton, this.cancelEditButton);
        
        // Add audio buttons after font size container (play button, then stop button)
        if (this.audioButtons && this.audioButtons.length > 0) {
            console.log('🎵 Adding audio buttons to main toolbar:', this.audioButtons.length);
            console.log('🎵 Audio buttons details:', this.audioButtons.map(btn => ({
                id: btn.id,
                className: btn.className,
                style: btn.style.cssText,
                visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
                parent: btn.parentElement?.id
            })));
            mainToolElements.push(...this.audioButtons);
        } else {
            console.log('🎵 No audio buttons to add to toolbar');
        }
        
        console.log('🔧 Final mainToolElements:', mainToolElements.length, 'elements');
        
        mainToolRow.append(...mainToolElements);
        
        // Debug: Check if audio buttons are actually in the toolbar after appending
        setTimeout(() => {
            const buttonsInToolbar = mainToolRow.querySelectorAll('button');
            console.log('🔍 Buttons found in main toolbar after append:', buttonsInToolbar.length);
            buttonsInToolbar.forEach((btn, index) => {
                console.log(`  Button ${index}:`, {
                    id: btn.id,
                    text: btn.textContent,
                    visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
                    display: window.getComputedStyle(btn).display,
                    visibility: window.getComputedStyle(btn).visibility
                });
            });
        }, 100);
        
        // Create audio tools row (will be hidden by default)
        const audioToolRow = $('div', {
            id: 'audio-tools-row',
            css: {
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                width: '100%'
            }
        });
        
        // Add audio tools to their row
        this.audioTools.forEach(tool => {
            if (tool && tool.id === 'audio-scrub-slider-container') {
                // Make slider take full width
                tool.style.width = '100%';
                tool.style.marginLeft = '0';
                tool.style.marginRight = '0';
            }
            audioToolRow.append(tool);
        });
        
        // Add both rows to the toolbar
        this.toolbar.append(mainToolRow, audioToolRow);
        
        // Store reference to audio tools row for dynamic visibility
        this.audioToolRow = audioToolRow;
        
        // Update lyrics content positioning based on audio tools visibility
        this.updateLyricsContentPosition();
        
        // Get lyrix_app and append toolbar and content directly to it
        const lyrixApp = document.getElementById('lyrix_app');
        if (lyrixApp) {
            lyrixApp.append(this.toolbar, this.lyricsContent);
        } else {
            // Fallback - try to find a container or create a warning
            console.error('lyrix_app not found! Unable to append lyrics display elements.');
            if (this.container) {
                console.warn('Using fallback container for lyrics display');
                this.container.append(this.toolbar, this.lyricsContent);
            } else {
                console.error('No container available for lyrics display elements');
            }
        }
    }
    
    // Setup event listeners
    setupEventListeners() {
        // Click on lyrics line in edit mode
        this.lyricsContent.addEventListener('click', (e) => {
            if (this.editMode && e.target.classList.contains('lyrics-line')) {
                this.editLine(parseInt(e.target.dataset.lineIndex));
            }
        });
        
        // Global keyboard shortcuts - work anywhere in the document
        this.keyboardHandler = (e) => {
            this.handleKeyboard(e);
        };
        document.addEventListener('keydown', this.keyboardHandler);
        
        // Auto-scroll when audio is playing
        if (this.audioController) {
            this.audioController.on('timeupdate', (currentTime) => {
                this.updateActiveLineByTime(currentTime * 1000); // Convert to ms
            });
        }
    }
    
    // Handle keyboard shortcuts
    handleKeyboard(e) {
        // Don't handle keyboard shortcuts if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Prevent default for our shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'e':
                    e.preventDefault();
                    this.toggleEditMode();
                    break;
                case 'r':
                    e.preventDefault();
                    this.toggleRecordMode();
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case '=':
                case '+':
                    e.preventDefault();
                    this.adjustFontSize(2);
                    break;
                case '-':
                    e.preventDefault();
                    this.adjustFontSize(-2);
                    break;
            }
        }
        
        // Arrow key navigation for lyrics lines (only when lyrics are loaded and not in edit mode or record mode)
        if (this.currentLyrics && !this.editMode && !this.recordMode) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateToLine('up');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateToLine('down');
            }
        }
        
        // Space bar to play/pause in record mode
        if (e.code === 'Space' && this.recordMode && this.audioController) {
            e.preventDefault();
            if (this.audioController.isPlaying()) {
                this.audioController.pause();
            } else {
                this.audioController.play();
            }
        }
        
        // Enter to record timecode in record mode
        if (e.code === 'Enter' && this.recordMode && this.audioController) {
            e.preventDefault();
            this.recordCurrentTimecode();
        }
    }
    
    // Get non-audio tools from left panel to move to lyrics toolbar
    getNonAudioTools() {
        const tools = [];
        
        // Get the 4 main buttons from stored references
        if (window.leftPanelTools) {
            const { settingsButton, importButton, createSongButton, songListButton } = window.leftPanelTools;
            if (settingsButton) tools.push(settingsButton);
            if (importButton) tools.push(importButton);
            if (createSongButton) tools.push(createSongButton);
            if (songListButton) tools.push(songListButton);
        }
        
        // Get MIDI container from global reference (non-audio tool)
        if (window.midiUtilities && window.midiUtilities.midiContainer) {
            tools.push(window.midiUtilities.midiContainer);
        }
        
        return tools;
    }
    
    // Get timecode display separately (will be positioned after timecode button)
    getTimecodeDisplay() {
        if (window.leftPanelScrubTools) {
            const { timecodeDisplay } = window.leftPanelScrubTools;
            return timecodeDisplay;
        }
        return null;
    }
    
    // Get individual audio buttons for main toolbar integration
    getAudioButtons() {
        const buttons = [];
        
        // Check audio player controls setting state
        let isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled');
        
        // If setting doesn't exist, default to enabled for testing
        if (isAudioPlayerEnabled === null) {
            isAudioPlayerEnabled = 'true';
            localStorage.setItem('lyrix_audio_player_enabled', 'true');
            console.log('🎵 Audio player setting not found, defaulting to enabled');
        }
        
        isAudioPlayerEnabled = isAudioPlayerEnabled === 'true';
        console.log('🎵 Audio player enabled:', isAudioPlayerEnabled);
        
        if (!isAudioPlayerEnabled) {
            console.log('🎵 Audio player disabled, returning empty buttons array');
            return buttons; // Return empty array if audio player is disabled
        }
        
        // Get audio controls from stored references and use direct button references
        if (window.leftPanelAudioTools) {
            console.log('🎵 Found leftPanelAudioTools:', window.leftPanelAudioTools);
            const { playButton, stopButton } = window.leftPanelAudioTools;
            
            console.log('🎵 Play button:', playButton);
            console.log('🎵 Stop button:', stopButton);
            
            if (playButton) {
                buttons.push(playButton);
                console.log('🎵 Added play button to toolbar');
                // Ensure button is visible
                playButton.style.display = 'inline-block';
                playButton.style.visibility = 'visible';
            }
            if (stopButton) {
                buttons.push(stopButton);
                console.log('🎵 Added stop button to toolbar');
                // Ensure button is visible
                stopButton.style.display = 'inline-block';
                stopButton.style.visibility = 'visible';
            }
        } else {
            console.log('🎵 window.leftPanelAudioTools not found');
        }
        
        console.log('🎵 Returning buttons array:', buttons, 'length:', buttons.length);
        return buttons;
    }
    
    // Get audio tools from left panel to move to lyrics toolbar (excluding buttons that go to main row)
    getAudioTools() {
        const tools = [];
        
        // Get scrub container (should appear at bottom and take full width)
        // Note: timecode display is now handled separately in main toolbar row
        // Note: audio buttons are now handled separately in main toolbar row
        if (window.leftPanelScrubTools) {
            const { scrubContainer } = window.leftPanelScrubTools;
            if (scrubContainer) tools.push(scrubContainer);
        }
        
        return tools;
    }
    
    // Get all tools (backward compatibility)
    getLeftPanelTools() {
        const allTools = [...this.getNonAudioTools(), ...this.getAudioTools()];
        const timecodeDisplay = this.getTimecodeDisplay();
        if (timecodeDisplay) {
            allTools.push(timecodeDisplay);
        }
        return allTools;
    }
    
    // Apply compact styling to moved tools for toolbar
    styleModeToolsForToolbar() {
        const allTools = [...this.nonAudioTools, ...this.audioTools];
        if (this.timecodeDisplay) {
            allTools.push(this.timecodeDisplay);
        }
        // Add audio buttons to styling
        if (this.audioButtons) {
            allTools.push(...this.audioButtons);
        }
        
        allTools.forEach(tool => {
            if (tool && tool.style) {
                // Make tools more compact for toolbar
                tool.style.margin = '2px';
                tool.style.marginBottom = '0';
                
                // Scale down larger elements
                if (tool.id === 'audio-scrub-slider-container') {
                    // Slider will take full width and be styled separately - reduced to half height
                    tool.style.minHeight = '20px';
                    tool.style.padding = '2px 5px';
                }
                
                if (tool.id === 'audio-player-title') {
                    tool.style.fontSize = '12px';
                    tool.style.margin = '0 5px';
                }
                
                if (tool.id === 'audio-controls-container') {
                    tool.style.marginBottom = '0';
                    tool.style.display = 'flex'; // Ensure buttons are side by side
                }
                
                if (tool.id === 'midi-logger-container') {
                    tool.style.width = '150px';
                    tool.style.minHeight = '30px';
                    tool.style.fontSize = '10px';
                    tool.style.overflow = 'hidden';
                }
                
                // Style timecode display - same height as buttons, twice the width
                if (tool.classList && tool.classList.contains('timecode-display')) {
                    tool.style.fontSize = '11px';
                    tool.style.padding = '3px 6px';
                    tool.style.height = '32px'; // Same height as interface buttons
                    tool.style.width = '120px'; // Twice the width of normal buttons (~60px)
                    tool.style.minWidth = '120px';
                    tool.style.boxSizing = 'border-box';
                    tool.style.display = 'flex';
                    tool.style.alignItems = 'center';
                    tool.style.justifyContent = 'center';
                }
                
                // Ensure audio buttons (play/stop) remain visible and properly styled
                if (tool.id === 'audio-play-button' || tool.id === 'audio-stop-button') {
                    tool.style.display = 'inline-block';
                    tool.style.visibility = 'visible';
                    tool.style.opacity = '1';
                    tool.style.margin = '2px';
                    console.log(`🎵 Styling audio button ${tool.id}:`, {
                        display: tool.style.display,
                        visibility: tool.style.visibility,
                        opacity: tool.style.opacity
                    });
                }
            }
        });
    }
    
    // Update lyrics content area position based on audio tools visibility
    updateLyricsContentPosition() {
        if (!this.lyricsContent || !this.audioToolRow) return;
        
        // Check if audio player is enabled
        const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
        
        // Show/hide audio tools row
        if (isAudioPlayerEnabled && this.audioTools.length > 0) {
            this.audioToolRow.style.display = 'flex';
            // Adjust lyrics content to account for audio tools row (~30px for reduced slider height)
            this.lyricsContent.style.top = '90px'; // Increased from base to accommodate audio row
        } else {
            this.audioToolRow.style.display = 'none';
            // Adjust lyrics content to only account for main toolbar (~60px)
            this.lyricsContent.style.top = '60px'; // Reduced space when audio tools hidden
        }
        
        console.log(`📐 Updated lyrics content position: top=${this.lyricsContent.style.top}, audio tools visible=${isAudioPlayerEnabled && this.audioTools.length > 0}`);
    }
    
    // Public method to refresh audio tools visibility (called when settings change)
    refreshAudioToolsVisibility() {
        this.updateLyricsContentPosition();
    }
    
    // Debug method to force audio buttons visibility
    debugAudioButtons() {
        console.log('🔍 Debug audio buttons:');
        console.log('  - audioButtons array:', this.audioButtons);
        console.log('  - localStorage setting:', localStorage.getItem('lyrix_audio_player_enabled'));
        console.log('  - window.leftPanelAudioTools:', window.leftPanelAudioTools);
        
        if (this.audioButtons && this.audioButtons.length > 0) {
            this.audioButtons.forEach((btn, index) => {
                console.log(`  Button ${index}:`, {
                    element: btn,
                    id: btn.id,
                    parentElement: btn.parentElement,
                    offsetWidth: btn.offsetWidth,
                    offsetHeight: btn.offsetHeight,
                    display: window.getComputedStyle(btn).display,
                    visibility: window.getComputedStyle(btn).visibility,
                    opacity: window.getComputedStyle(btn).opacity
                });
                
                // Force visibility
                btn.style.display = 'inline-block';
                btn.style.visibility = 'visible';
                btn.style.opacity = '1';
            });
        }
    }
    
    // Display lyrics
    displayLyrics(syncedLyrics) {
        // Set the current lyrics first
        this.currentLyrics = syncedLyrics;
        this.currentLineIndex = -1;
        
        // Verify we have valid lyrics before rendering
        if (!syncedLyrics) {
            this.renderLyrics(); // This will show "No lyrics loaded"
            return;
        }
        
        // Check if lyrics has required properties
        if (!syncedLyrics.metadata || !syncedLyrics.lines) {
            this.currentLyrics = null; // Reset to null to show error message
            this.renderLyrics();
            return;
        }
        
        // Ensure all lines have IDs (for backward compatibility)
        syncedLyrics.ensureLineIds();
        
        // Set current lyrics and render
        this.currentLyrics = syncedLyrics;
        this.renderLyrics();
        
        // Auto-load associated audio if available (but only if no audio is currently loaded)
        if (syncedLyrics.hasAudio()) {
            const audioPath = syncedLyrics.getAudioPath();
            
            // Only load audio if no audio is currently loaded to prevent duplicate loading
            const hasCurrentAudio = this.audioController && 
                                   this.audioController.audioPlayer && 
                                   this.audioController.audioPlayer.src;
            
            if (!hasCurrentAudio && this.audioController && this.audioController.loadAudio) {
                // Use the audio path directly since AudioManager.normalize() is called in loadAudio()
                const success = this.audioController.loadAudio(audioPath);
                if (!success) {
                    console.error('❌ Failed to initiate audio loading for:', audioPath);
                }
            } else if (hasCurrentAudio) {
                // console.log('🎵 Audio already loaded, skipping auto-load');
            } else {
                console.error('❌ AudioController not available or loadAudio method missing');
            }
        }
    }
    
    // Render lyrics content
    renderLyrics() {
        if (!this.currentLyrics) {
            this.lyricsContent.innerHTML = '<div style="text-align: center; color: #666; font-style: italic;">No lyrics loaded</div>';
            return;
        }
        
        // Clear content
        this.lyricsContent.innerHTML = '';
        
        // Add song metadata
        const metadata = $('div', {
            css: {
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                borderLeft: '4px solid #2196F3'
            }
        });
        
        const title = $('h2', {
            text: this.currentLyrics.metadata.title,
            css: {
                margin: '0 0 5px 0',
                color: '#1976D2',
                fontSize: '1.3em'
            }
        });
        
        const artist = $('h3', {
            text: `by ${this.currentLyrics.metadata.artist}`,
            css: {
                margin: '0 0 5px 0',
                color: '#666',
                fontSize: '1.1em',
                fontWeight: 'normal'
            }
        });
        
        metadata.append(title, artist);
        
        if (this.currentLyrics.metadata.album) {
            const album = $('div', {
                text: `Album: ${this.currentLyrics.metadata.album}`,
                css: {
                    color: '#666',
                    fontSize: '0.9em'
                }
            });
            metadata.append(album);
        }
        
        this.lyricsContent.append(metadata);
        
        // Add lyrics lines
        const linesContainer = $('div', {
            id: 'lyrics_lines_container',
            css: {
                marginTop: '20px'
            }
        });

        if (this.editMode) {
            // Edit mode: single text area for all lyrics
            this.createBulkEditInterface(linesContainer);
        } else {
            // Display mode: individual line elements
            this.currentLyrics.lines.forEach((line, index) => {
                const lineElement = this.createLineElement(line, index);
                linesContainer.append(lineElement);
            });
        }

        this.lyricsContent.append(linesContainer);
    }
    
    // Create single line element
    createLineElement(line, index) {
        const lineDiv = $('div', {
            id: line.id, // Set the DOM element ID to match the line ID
            dataset: { lineIndex: index },
            css: {
                margin: '8px 0',
                padding: '8px 12px',
                borderRadius: '4px',
                cursor: this.editMode ? 'pointer' : 'default',
                transition: 'all 0.3s ease',
                backgroundColor: index === this.currentLineIndex ? '#fff3cd' : 'transparent',
                border: index === this.currentLineIndex ? '2px solid #ffc107' : '1px solid transparent',
                transform: index === this.currentLineIndex ? 'scale(1.05)' : 'scale(1)',
                fontWeight: index === this.currentLineIndex ? 'bold' : 'normal'
            }
        });
        
        lineDiv.className = 'lyrics-line';
        
        // Create line content container
        const lineContent = $('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }
        });
        
        // Show timecode if enabled and line has a time
        if (this.showTimecodes && line.time >= 0) {
            const timeSpan = $('span', {
                text: this.formatTimeDisplay(line.time),
                css: {
                    fontSize: '0.8em',
                    color: '#666',
                    backgroundColor: '#f0f0f0',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    minWidth: '60px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    userSelect: 'none'
                }
            });
            
            // Add CSS class for easier identification
            timeSpan.className = 'timecode-span';
            
            // Add touch-friendly styling hints
            timeSpan.style.userSelect = 'none';
            timeSpan.style.webkitUserSelect = 'none';
            timeSpan.style.webkitTouchCallout = 'none';
            timeSpan.style.position = 'relative';
            
            // Add a small edit indicator for touch devices
            if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
                timeSpan.setAttribute('title', 'Tap to edit timecode');
                // Add a subtle visual hint
                timeSpan.style.borderBottom = '1px dotted #999';
            }
            
            // Add hover effects
            timeSpan.addEventListener('mouseenter', () => {
                timeSpan.style.backgroundColor = '#e0e0e0';
                timeSpan.style.color = '#333';
            });
            
            timeSpan.addEventListener('mouseleave', () => {
                timeSpan.style.backgroundColor = '#f0f0f0';
                timeSpan.style.color = '#666';
            });
            
            // Simple touch-friendly editing for timecode (like other buttons)
            timeSpan.addEventListener('touchstart', (e) => {
                // Prevent default to avoid double-firing with click events
                e.preventDefault();
            });
            
            timeSpan.addEventListener('touchend', (e) => {
                // Simple tap to edit on mobile
                e.preventDefault();
                e.stopPropagation();
                this.editTimecode(index, timeSpan);
            });
            
            // Double-click to edit timecode (desktop only)
            timeSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.editTimecode(index, timeSpan);
            });
            
            // Mouse drag to adjust timecode
            let isDragging = false;
            let startX = 0;
            let startTime = line.time;
            
            timeSpan.addEventListener('mousedown', (e) => {
                if (e.detail === 1) { // Single click, not double click
                    isDragging = true;
                    startX = e.clientX;
                    startTime = line.time;
                    timeSpan.style.backgroundColor = '#007bff';
                    timeSpan.style.color = 'white';
                    e.preventDefault();
                }
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isDragging && timeSpan) {
                    const deltaX = e.clientX - startX;
                    const timeDelta = deltaX * 10; // 10ms per pixel
                    const newTime = Math.max(0, startTime + timeDelta);
                    
                    // Update the display
                    timeSpan.textContent = this.formatTimeDisplay(newTime);
                    
                    // Update the actual time in the lyrics object
                    this.currentLyrics.lines[index].time = newTime;
                    this.currentLyrics.updateLastModified();
                }
            });
            
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    timeSpan.style.backgroundColor = '#f0f0f0';
                    timeSpan.style.color = '#666';
                    console.log(`⏰ Updated timecode for line ${index + 1}: ${this.formatTimeDisplay(line.time)}`);
                }
            });
            
            lineContent.append(timeSpan);
        }
        
        // Line text
        const textSpan = $('span', {
            text: line.text,
            css: {
                fontSize: 'inherit',
                lineHeight: 'inherit',
                flex: '1'
            }
        });
        
        // Add touch-friendly styling for text editing
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            textSpan.setAttribute('title', 'Hold to edit lyrics');
            textSpan.style.userSelect = 'none';
            textSpan.style.webkitUserSelect = 'none';
            textSpan.style.webkitTouchCallout = 'none';
        }
        
        lineContent.append(textSpan);
        lineDiv.append(lineContent);
        
        // Edit mode controls
        if (this.editMode) {
            lineDiv.style.backgroundColor = '#f8f9fa';
            lineDiv.style.border = '1px solid #dee2e6';
            
            const controls = $('div', {
                css: {
                    marginTop: '5px',
                    fontSize: '0.8em'
                }
            });
            
            const setTimeButton = UIManager.createInterfaceButton('⏰', {
                id: `set_time_line_${index}`,
                onClick: () => this.setLineTime(index)
            });
            
            const clearTimeButton = UIManager.createInterfaceButton('❌', {
                id: `clear_time_line_${index}`,
                onClick: () => this.clearLineTime(index)
            });
            
            const editTextButton = UIManager.createInterfaceButton('✏️', {
                id: `edit_text_line_${index}`,
                onClick: () => this.editLineText(index)
            });
            
            controls.append(setTimeButton, clearTimeButton, editTextButton);
            lineDiv.append(controls);
        }
        
        // Add click handlers for line interaction
        // Single click: seek to timecode and select line (normal mode) OR assign current time (record mode)
        lineDiv.addEventListener('click', (e) => {
            // Don't trigger if clicking on timecode, controls, or during timecode editing
            if (e.target.tagName === 'INPUT' || 
                e.target.closest && e.target.closest('.timecode-span') ||
                (e.target !== lineDiv && e.target !== textSpan && e.target !== lineContent)) {
                return;
            }
            
            // Set this line as active
            this.setActiveLineIndex(index);
            
            if (this.recordMode) {
                // RECORD MODE: Assign current audio time to this line
                if (this.audioController) {
                    const currentTime = this.audioController.getCurrentTime() * 1000; // Convert to ms
                    this.currentLyrics.lines[index].time = currentTime;
                    this.currentLyrics.updateLastModified();
                    
                    // Re-render to show the new timecode (if timecodes are visible)
                    if (this.showTimecodes) {
                        this.renderLyrics();
                    }
                    
                    // console.log(`🔴 RECORD: Assigned timecode ${this.formatTimeDisplay(currentTime)} to line ${index + 1}: "${line.text}"`);
                } else {
                    // console.log('❌ No audio controller available for recording timecode');
                }
            } else {
                // NORMAL MODE: Seek to timecode if available and audio controller exists
                if (line.time >= 0 && this.audioController) {
                    const timeInSeconds = line.time / 1000;
                    this.audioController.setCurrentTime(timeInSeconds);
                    
                    // Update the timecode display immediately
                    this.updateTimecodeDisplay(line.time);
                    
                    // Also trigger a manual timeupdate to update any other time displays
                    if (this.audioController.emit) {
                        // Use the audio controller's event system if available
                        this.audioController.emit('timeupdate', timeInSeconds);
                    }
                    
                    // console.log(`🎯 Seeking to line ${index + 1} at ${this.formatTimeDisplay(line.time)}`);
                } else if (line.time < 0) {
                    // console.log(`📍 Selected line ${index + 1} (no timecode)`);
                } else {
                    // console.log(`📍 Selected line ${index + 1} (no audio controller)`);
                }
            }
        });
        
        // Touch-friendly editing for lyrics text
        let textTouchTimer;
        let textTouchStartTime;
        let textHasMoved = false;
        let lastTapTime = 0;
        
        lineDiv.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'INPUT' || 
                e.target.closest && e.target.closest('.timecode-span') ||
                (e.target !== lineDiv && e.target !== textSpan && e.target !== lineContent)) {
                return;
            }
            
            textTouchStartTime = Date.now();
            textHasMoved = false;
            
            textTouchTimer = setTimeout(() => {
                if (!textHasMoved) {
                    e.preventDefault();
                    this.editLineText(index, textSpan);
                }
            }, 300);
        });
        
        lineDiv.addEventListener('touchmove', (e) => {
            textHasMoved = true;
            clearTimeout(textTouchTimer);
        });
        
        lineDiv.addEventListener('touchend', (e) => {
            clearTimeout(textTouchTimer);
            const touchDuration = Date.now() - textTouchStartTime;
            const currentTime = Date.now();
            
            if (e.target.tagName === 'INPUT' || 
                e.target.closest && e.target.closest('.timecode-span') ||
                (e.target !== lineDiv && e.target !== textSpan && e.target !== lineContent)) {
                return;
            }
            
            if (!textHasMoved && touchDuration < 300) {
                // Check for double tap
                if (currentTime - lastTapTime < 400) {
                    e.preventDefault();
                    this.editLineText(index, textSpan);
                    lastTapTime = 0;
                    return;
                }
                lastTapTime = currentTime;
                
                this.setActiveLineIndex(index);
                
                if (this.recordMode) {
                    // RECORD MODE: Assign current audio time to this line
                    if (this.audioController) {
                        const currentTime = this.audioController.getCurrentTime() * 1000; // Convert to ms
                        this.currentLyrics.lines[index].time = currentTime;
                        this.currentLyrics.updateLastModified();
                        
                        // Re-render to show the new timecode (if timecodes are visible)
                        if (this.showTimecodes) {
                            this.renderLyrics();
                        }
                    }
                } else {
                    // NORMAL MODE: Seek to timecode if available and audio controller exists
                    if (line.time >= 0 && this.audioController) {
                        const timeInSeconds = line.time / 1000;
                        this.audioController.setCurrentTime(timeInSeconds);
                        
                        // Update the timecode display immediately
                        this.updateTimecodeDisplay(line.time);
                        
                        // Also trigger a manual timeupdate to update any other time displays
                        if (this.audioController.emit) {
                            this.audioController.emit('timeupdate', timeInSeconds);
                        }
                    }
                }
            }
        });
        
        // Double click: edit line text (desktop only)
        lineDiv.addEventListener('dblclick', (e) => {
            // Don't trigger if clicking on timecode or if there's already an input field
            if (e.target.tagName === 'INPUT' || 
                e.target.classList.contains('timecode-span') ||
                e.target.closest('.timecode-span')) {
                return;
            }
            
            e.stopPropagation();
            // console.log(`🖱️ Double-click detected on line ${index + 1}, calling editLineText`);
            this.editLineText(index, textSpan);
        });
        
        return lineDiv;
    }
    
    // Format time for display
    formatTimeDisplay(ms) {
        if (ms < 0) return '[--:--]';
        
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const centiseconds = Math.floor((ms % 1000) / 10);
        return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}]`;
    }
    
    // Update active line by time
    updateActiveLineByTime(timeMs) {
        if (!this.currentLyrics) return;
        
        // In record mode, don't auto-update active lines to prevent unwanted scroll
        if (this.recordMode) {
            // Only update timecode display, not active lines
            this.updateTimecodeDisplay(timeMs);
            return;
        }
        
        // Throttle scroll updates
        const now = Date.now();
        if (now - this.lastScrollTime < 100) return; // Max 10 updates per second
        this.lastScrollTime = now;
        
        const activeLine = this.currentLyrics.getActiveLineAt(timeMs);
        if (!activeLine) return;
        
        const lineIndex = this.currentLyrics.lines.findIndex(line => line === activeLine);
        
        // Update if this is the first time or if line changed
        if (lineIndex !== this.currentLineIndex || this.currentLineIndex === -1) {
            // console.log('🎵 Switching to line:', lineIndex, '(from:', this.currentLineIndex + ')');
            this.setActiveLineIndex(lineIndex);
        }
    }
    
    // Set active line index
    setActiveLineIndex(index) {
        // console.log('🎯 setActiveLineIndex called with:', index, 'previous:', this.currentLineIndex);
        
        // Remove previous highlight
        if (this.currentLineIndex >= 0) {
            // Try multiple strategies to find the previous element
            let prevElement = this.lyricsContent.querySelector(`[data-line-index="${this.currentLineIndex}"]`);
            if (!prevElement) {
                const allLines = this.lyricsContent.querySelectorAll('.lyrics-line');
                prevElement = allLines[this.currentLineIndex];
            }
            
            if (prevElement) {
                // console.log('🎯 Removing highlight from previous line:', this.currentLineIndex);
                prevElement.style.backgroundColor = 'transparent';
                prevElement.style.border = '1px solid transparent';
                prevElement.style.transform = 'scale(1)';
                prevElement.style.fontWeight = 'normal';
            }
        }
        
        // Set new active line
        this.currentLineIndex = index;
        
        if (index >= 0) {
            // Try multiple selector strategies
            let element = this.lyricsContent.querySelector(`[data-line-index="${index}"]`);
            if (!element) {
                // Try accessing by className and index
                const allLines = this.lyricsContent.querySelectorAll('.lyrics-line');
                element = allLines[index];
            }
            
            if (element) {
                // console.log('🎯 Applying highlight to new line:', index);
                element.style.backgroundColor = '#fff3cd';
                element.style.border = '2px solid #ffc107';
                element.style.transform = 'scale(1.05)';
                element.style.fontWeight = 'bold';
                element.style.transition = 'all 0.3s ease';
                
                // console.log('🎯 Scrolling to active line');
                // Auto-scroll to active line
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            } else {
                // console.log('❌ Could not find element for index:', index);
            }
        }
    }
    
    // Create bulk edit interface
    createBulkEditInterface(container) {
        // console.log('🎯 createBulkEditInterface called');
        // console.log('🎯 currentLyrics:', this.currentLyrics);
        // console.log('🎯 currentLyrics.lines:', this.currentLyrics?.lines);
        
        if (!this.currentLyrics || !this.currentLyrics.lines) {
            // console.log('❌ No currentLyrics or lines available for editing');
            container.innerHTML = '<div style="color: red; padding: 20px;">Error: No lyrics data available for editing</div>';
            return;
        }
        
        // Store original lines with timecodes for restoration
        this.originalLinesBackup = this.currentLyrics.lines.map(line => ({
            text: line.text,
            time: line.time
        }));
        
        // Create textarea with all lyrics text
        const lyricsText = this.currentLyrics.lines.map(line => line.text).join('\n');
        // console.log('🎯 lyricsText to display:', lyricsText);
        
        // Create textarea using DOM directly to ensure compatibility
        const editArea = document.createElement('textarea');
        editArea.id = 'bulk-edit-textarea';
        editArea.value = lyricsText;
        editArea.style.cssText = `
            width: 100%;
            min-height: 400px;
            padding: 15px;
            border: 2px solid #2196F3;
            border-radius: 8px;
            background-color: #f5f5f5;
            color: #333;
            font-size: 16px;
            line-height: 1.6;
            font-family: inherit;
            resize: vertical;
            outline: none;
        `;
        
        // console.log('🎯 editArea created:', editArea);
        // console.log('🎯 editArea.value:', editArea.value);
        
        container.appendChild(editArea);
        
        // Focus the textarea and position cursor at the beginning
        setTimeout(() => {
            editArea.focus();
            editArea.setSelectionRange(0, 0); // Set cursor to beginning
            editArea.scrollTop = 0; // Scroll to top of textarea
        }, 100);
    }
    
    // Toggle edit mode
    toggleEditMode() {
        // console.log('🎯 toggleEditMode called, current editMode:', this.editMode);
        
        // If exiting edit mode, apply changes
        if (this.editMode) {
            // console.log('🎯 Exiting edit mode, applying changes');
            if (this.originalLinesBackup) {
                this.applyBulkEditChanges();
            }
        } else {
            // console.log('🎯 Entering edit mode');
        }
        
        this.editMode = !this.editMode;
        // Garder l'icône, changer seulement la couleur
        this.editButton.style.backgroundColor = this.editMode ? '#4CAF50' : '#4a6fa5';
        
        // Show/hide edit mode buttons in toolbar
        if (this.saveChangesButton && this.cancelEditButton) {
            if (this.editMode) {
                this.saveChangesButton.style.display = 'inline-block';
                this.cancelEditButton.style.display = 'inline-block';
            } else {
                this.saveChangesButton.style.display = 'none';
                this.cancelEditButton.style.display = 'none';
            }
        }
        
        // console.log('🎯 New editMode:', this.editMode, 'calling renderLyrics');
        this.renderLyrics();
    }
    
    // Apply bulk edit changes
    applyBulkEditChanges() {
        const textarea = document.getElementById('bulk-edit-textarea');
        if (!textarea || !this.originalLinesBackup) return;
        
        const newLinesText = textarea.value.split('\n');
        const originalLines = this.originalLinesBackup;
        
        // Create new lines array
        const newLines = [];
        
        // Process each new line
        newLinesText.forEach((text, index) => {
            if (text.trim()) { // Only add non-empty lines
                // Try to match with original line to preserve timecode
                const originalLine = originalLines[index];
                newLines.push({
                    text: text.trim(),
                    time: originalLine ? originalLine.time : -1 // Keep original timecode or -1 for new lines
                });
            }
        });
        
        // Handle case where we have fewer lines than before
        if (newLines.length < originalLines.length) {
            // If we have more original lines with timecodes, keep them but mark as empty
            for (let i = newLines.length; i < originalLines.length; i++) {
                if (originalLines[i].time >= 0) {
                    newLines.push({
                        text: '',
                        time: originalLines[i].time
                    });
                }
            }
        }
        
        // Update the lyrics object
        this.currentLyrics.lines = newLines;
        
        // Update the lastModified timestamp
        this.currentLyrics.metadata.lastModified = new Date().toISOString();
        
        // Save to storage using the correct method
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
        if (saveSuccess) {
            // console.log('✅ Lyrics saved successfully');
        } else {
            // console.error('❌ Failed to save lyrics');
        }
        
        // Clear backup
        this.originalLinesBackup = null;
        
        // console.log('✅ Bulk edit changes applied');
    }
    
    // Toggle record mode
    toggleRecordMode() {
        this.recordMode = !this.recordMode;
        // Garder l'icône, changer seulement la couleur
        const newColor = this.recordMode ? '#f44336' : '#4a6fa5';
        this.recordButton.style.backgroundColor = newColor;
        // Update the stored original color for hover behavior
        this.recordButton.dataset.originalBgColor = newColor;
        
        if (this.recordMode) {
            // console.log('🔴 Record mode: ON - Click lines to assign current audio time as timecode');
            // console.log('🔴 Auto-scroll disabled, line seeking disabled');
            
            // Store original lines for saving later
            this.originalLinesForRecord = this.currentLyrics ? 
                JSON.parse(JSON.stringify(this.currentLyrics.lines)) : null;
        } else {
            // console.log('⏹️ Record mode: OFF - Saving recorded timecodes and restoring normal behavior');
            
            // Save all recorded timecodes when exiting record mode
            if (this.currentLyrics && this.originalLinesForRecord) {
                this.saveRecordedTimecodes();
            }
            
            // Clear the backup
            this.originalLinesForRecord = null;
        }
    }
    
    // Toggle fullscreen
    toggleFullscreen(enterFullscreen = null) {
        // If parameter is provided, use it to explicitly set fullscreen state
        // If no parameter, toggle current state
        if (enterFullscreen !== null) {
            this.fullscreenMode = !enterFullscreen; // Set opposite so the toggle below works correctly
        }
        
        this.fullscreenMode = !this.fullscreenMode;
        
        if (this.fullscreenMode) {
            // Hide everything except lyrics content
            const leftPanel = document.getElementById('control_panel');
            const statusBar = document.querySelector('[style*="position: fixed"][style*="bottom"]');
            
            // Hide other elements
            if (leftPanel) leftPanel.style.display = 'none';
            if (statusBar) statusBar.style.display = 'none';
            
            // Hide the toolbar but NOT the display container
            if (this.toolbar) this.toolbar.style.display = 'none';
            
            // Make ONLY lyrics content fullscreen
            this.lyricsContent.style.position = 'fixed';
            this.lyricsContent.style.top = '0';
            this.lyricsContent.style.left = '0';
            this.lyricsContent.style.width = '100vw';
            this.lyricsContent.style.height = '100vh';
            this.lyricsContent.style.zIndex = '9999';
            this.lyricsContent.style.backgroundColor = '#000';
            this.lyricsContent.style.color = '#fff';
            this.lyricsContent.style.padding = '40px';
            this.lyricsContent.style.overflow = 'auto';
            this.lyricsContent.style.fontSize = `${this.fontSize}px`;
            this.lyricsContent.style.textAlign = 'center';
            this.lyricsContent.style.cursor = 'pointer';
            this.lyricsContent.style.flex = 'none';  // Remove flex behavior
            
            // Add click handler to exit fullscreen
            this.fullscreenClickHandler = () => {
                this.toggleFullscreen(false);  // Explicitly exit fullscreen
            };
            this.lyricsContent.addEventListener('click', this.fullscreenClickHandler);
            
        } else {
            // Remove click handler
            if (this.fullscreenClickHandler) {
                this.lyricsContent.removeEventListener('click', this.fullscreenClickHandler);
                this.fullscreenClickHandler = null;
            }
            
            // Restore everything
            const leftPanel = document.getElementById('control_panel');
            const statusBar = document.querySelector('[style*="position: fixed"][style*="bottom"]');
            
            // Show hidden elements
            if (leftPanel) leftPanel.style.display = 'block';
            if (statusBar) statusBar.style.display = 'block';
            if (this.toolbar) this.toolbar.style.display = 'flex';
            
            // Restore lyrics content to normal (inside the container structure)
            this.lyricsContent.style.position = 'relative';
            this.lyricsContent.style.top = 'auto';
            this.lyricsContent.style.left = 'auto';
            this.lyricsContent.style.width = 'auto';
            this.lyricsContent.style.height = 'auto';
            this.lyricsContent.style.zIndex = 'auto';
            this.lyricsContent.style.backgroundColor = 'transparent';
            this.lyricsContent.style.color = '#000';
            this.lyricsContent.style.padding = '20px';
            this.lyricsContent.style.fontSize = ''; // Clear inline fontSize to restore inheritance
            this.lyricsContent.style.textAlign = 'left';
            this.lyricsContent.style.cursor = 'default';
            this.lyricsContent.style.flex = '1';
            this.lyricsContent.style.overflow = 'auto';
            
        }
        
        console.log(`🖼️ Fullscreen mode: ${this.fullscreenMode ? 'ON' : 'OFF'}`);
    }
    
    // Toggle timecode display
    toggleTimecodes() {
        this.showTimecodes = !this.showTimecodes;

        // Update button appearance
        if (this.showTimecodes) {
            this.timecodeButton.textContent = '🚫'; // Icône pour cacher
            this.timecodeButton.style.backgroundColor = '#4CAF50';
        } else {
            this.timecodeButton.textContent = '🕐'; // Icône pour afficher
            this.timecodeButton.style.backgroundColor = '#4a6fa5'; // Couleur standard
        }

        // Re-render lyrics to show/hide timecodes
        this.renderLyrics();
        
        console.log(`⏱️ Timecode display: ${this.showTimecodes ? 'ON' : 'OFF'}`);
    }
    
    // Show timecode options panel
    showTimecodeOptionsPanel() {
        // Create panel content using Squirrel syntax
        const panelContent = $('div', {
            css: {
                padding: '20px',
                minWidth: '300px'
            }
        });

        // Title
        const title = $('h3', {
            text: 'Timecode Options',
            css: {
                margin: '0 0 20px 0',
                color: '#333',
                textAlign: 'center'
            }
        });

        // Show/Hide Timecodes button with label
        const toggleContainer = $('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px'
            }
        });
        
        const toggleButton = UIManager.createInterfaceButton(this.showTimecodes ? '👁️' : '🚫', {
            id: 'toggle_timecodes_display',
            onClick: () => {
                this.toggleTimecodes();
                // Close the modal after toggling
                document.querySelector('.modal-overlay')?.remove();
            }
        });
        
        const toggleLabel = $('span', {
            text: this.showTimecodes ? 'Hide Timecodes' : 'Show Timecodes',
            css: {
                fontSize: '14px',
                color: '#333',
                fontWeight: '500'
            }
        });
        
        toggleContainer.append(toggleButton, toggleLabel);

        // Clear All Timecodes button with label
        const clearContainer = $('div', {
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px'
            }
        });
        
        const clearAllButton = UIManager.createInterfaceButton('🗑️', {
            id: 'clear_all_timecodes',
            onClick: () => {
                // Close current modal first
                document.querySelector('.modal-overlay')?.remove();
                // Then show confirmation
                this.confirmClearAllTimecodes();
            }
        });
        
        const clearLabel = $('span', {
            text: 'Clear All Timecodes',
            css: {
                fontSize: '14px',
                color: '#333',
                fontWeight: '500'
            }
        });
        
        clearContainer.append(clearAllButton, clearLabel);

        // Assemble the content
        panelContent.append(title, toggleContainer, clearContainer);

        // Show modal using the Modal from modal.js
        import('./modal.js').then(({ Modal }) => {
            Modal({
                title: 'Timecode Options',
                content: panelContent,
                buttons: [
                    {
                        text: 'Close',
                        style: 'secondary',
                        action: () => {
                            console.log('🔧 Timecode options panel closed');
                        }
                    }
                ]
            });
        }).catch(error => {
            // Fallback if modal import fails
            console.error('Failed to load modal:', error);
            alert('Show/Hide: ' + (this.showTimecodes ? 'Hide' : 'Show') + ' Timecodes\nClear All: Clear all timecodes');
        });
    }
    
    // Confirm clearing all timecodes
    confirmClearAllTimecodes() {
        if (!this.currentLyrics) {
            console.log('❌ No lyrics loaded');
            return;
        }
        
        // Import the UI manager for confirmation dialog
        import('./ui.js').then(({ UIManager }) => {
            UIManager.showConfirm(
                'Clear All Timecodes',
                'Are you sure you want to delete all timecodes? This action cannot be undone.',
                () => {
                    // Clear all timecodes
                    this.currentLyrics.clearAllTimecodes();
                    this.renderLyrics(); // Re-render to update display
                    console.log('🗑️ All timecodes cleared');
                },
                () => {
                    console.log('❌ Clear timecodes cancelled');
                }
            );
        });
    }
    
    // Adjust font size
    adjustFontSize(delta) {
        this.fontSize = Math.max(CONSTANTS.UI.MIN_FONT_SIZE, Math.min(CONSTANTS.UI.MAX_FONT_SIZE, this.fontSize + delta));
        
        // Apply font size to lyrics content
        this.lyricsContent.style.fontSize = `${this.fontSize}px`;
        
        this.fontSizeLabel.textContent = `${this.fontSize}px`;
        StorageManager.saveFontSize(this.fontSize);
        console.log(`🔤 Font size: ${this.fontSize}px`);
    }
    
    // Edit font size directly by typing
    editFontSizeDirectly() {
        console.log('🖱️ Double-click detected on font size label, opening editor');
        
        // Get current value without "px" suffix
        const currentValue = this.fontSize.toString();
        
        // Create input field for editing using DOM directly
        const input = document.createElement('input');
        input.type = 'number';
        input.min = CONSTANTS.UI.MIN_FONT_SIZE.toString();
        input.max = CONSTANTS.UI.MAX_FONT_SIZE.toString();
        input.step = '1';
        input.value = currentValue;
        input.style.cssText = `
            width: 60px;
            padding: 5px 8px;
            border: 2px solid #007bff;
            borderRadius: 4px;
            backgroundColor: white;
            color: #333;
            fontSize: 12px;
            textAlign: center;
            fontFamily: inherit;
        `;
        
        console.log(`📝 Input created with value: ${input.value}`);
        
        // Replace the label with input temporarily
        this.fontSizeLabel.style.display = 'none';
        this.fontSizeLabel.parentNode.insertBefore(input, this.fontSizeLabel);
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newSize = parseInt(input.value, 10);
            
            if (isNaN(newSize) || newSize < CONSTANTS.UI.MIN_FONT_SIZE || newSize > CONSTANTS.UI.MAX_FONT_SIZE) {
                console.warn('⚠️ Invalid font size, keeping original value');
                // Keep original value
            } else if (newSize !== this.fontSize) {
                // Apply new font size
                this.fontSize = newSize;
                
                // Apply font size to lyrics content
                this.lyricsContent.style.fontSize = `${this.fontSize}px`;
                
                this.fontSizeLabel.textContent = `${this.fontSize}px`;
                StorageManager.saveFontSize(this.fontSize);
                console.log(`✏️ Font size updated to: ${this.fontSize}px`);
            }
            
            // Restore the label
            input.parentNode.removeChild(input);
            this.fontSizeLabel.style.display = 'inline-block';
        };
        
        const cancelEdit = () => {
            // Restore the label without changes
            input.parentNode.removeChild(input);
            this.fontSizeLabel.style.display = 'inline-block';
            console.log('❌ Font size edit cancelled');
        };
        
        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        
        // Save when losing focus
        input.addEventListener('blur', saveEdit);
    }
    
    // Format time for display using UIManager
    formatTimeDisplay(timeMs) {
        return UIManager.formatTimeDisplay(timeMs / 1000); // Convert ms to seconds
    }
    
    // Edit timecode via double-click
    editTimecode(lineIndex, timeSpan) {
        if (!this.currentLyrics) return;
        
        // Get the currently displayed timecode text from the span (similar to editLineText approach)
        const currentDisplayedTime = timeSpan.textContent || timeSpan.innerText || '';
        
        // Clean up the displayed time by removing brackets if present: [02:30.50] -> 02:30.50
        const currentTimeFormatted = currentDisplayedTime.replace(/[\[\]]/g, '').trim();
        
        // Create input field for editing using DOM directly to ensure value is set
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTimeFormatted;
        input.style.cssText = `
            fontSize: 0.8em;
            fontFamily: monospace;
            padding: 2px 6px;
            border: 2px solid #007bff;
            borderRadius: 3px;
            minWidth: 60px;
            textAlign: center;
            backgroundColor: white;
            color: #333;
        `;
        
        // Replace the span with input temporarily
        timeSpan.style.display = 'none';
        timeSpan.parentNode.insertBefore(input, timeSpan);
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newTimeText = input.value.trim();
            let newTime = this.parseTimeInput(newTimeText);
            
            if (newTime !== null) {
                // Update the time
                this.currentLyrics.lines[lineIndex].time = newTime;
                this.currentLyrics.updateLastModified();
                timeSpan.textContent = this.formatTimeDisplay(newTime);
                console.log(`✏️ Updated timecode for line ${lineIndex + 1}: ${this.formatTimeDisplay(newTime)}`);
            } else {
                console.warn('⚠️ Invalid time format, keeping original value');
            }
            
            // Restore the span
            input.parentNode.removeChild(input);
            timeSpan.style.display = 'inline-block';
        };
        
        const cancelEdit = () => {
            // Restore the span without changes
            input.parentNode.removeChild(input);
            timeSpan.style.display = 'inline-block';
        };
        
        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        
        // Save when losing focus
        input.addEventListener('blur', saveEdit);
    }
    
    // Parse time input in various formats (mm:ss.sss, mm:ss, seconds)
    parseTimeInput(timeStr) {
        if (!timeStr) return null;
        
        // Remove any whitespace
        timeStr = timeStr.trim();
        
        // Try to parse mm:ss.sss format
        const mmssMatch = timeStr.match(/^(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
        if (mmssMatch) {
            const minutes = parseInt(mmssMatch[1], 10);
            const seconds = parseInt(mmssMatch[2], 10);
            const milliseconds = mmssMatch[3] ? parseInt(mmssMatch[3].padEnd(3, '0'), 10) : 0;
            
            if (seconds < 60) {
                return (minutes * 60 + seconds) * 1000 + milliseconds;
            }
        }
        
        // Try to parse as plain seconds
        const secondsMatch = timeStr.match(/^(\d+(?:\.\d+)?)$/);
        if (secondsMatch) {
            const seconds = parseFloat(secondsMatch[1]);
            return seconds * 1000;
        }
        
        return null; // Invalid format
    }
    
    // Edit line text via double-click
    editLineText(lineIndex, textSpan) {
        console.log(`🖱️ editLineText called for line ${lineIndex + 1}`);
        
        if (!this.currentLyrics) {
            console.log('❌ No currentLyrics in editLineText');
            return;
        }
        
        const currentText = this.currentLyrics.lines[lineIndex].text;
        console.log(`📝 Current text: "${currentText}"`);
        
        // Create input field for editing using DOM directly to ensure value is set
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.style.cssText = `
            fontSize: inherit;
            fontFamily: inherit;
            padding: 4px 8px;
            border: 2px solid #007bff;
            borderRadius: 4px;
            backgroundColor: white;
            color: #333;
            width: 100%;
            boxSizing: border-box;
        `;
        
        console.log(`📝 Input created with value: "${input.value}"`);
        
        // Replace the text span with input temporarily
        textSpan.style.display = 'none';
        textSpan.parentNode.insertBefore(input, textSpan);
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newText = input.value.trim();
            
            if (newText && newText !== currentText) {
                // Update the text
                this.currentLyrics.lines[lineIndex].text = newText;
                this.currentLyrics.updateLastModified();
                textSpan.textContent = newText;
                console.log(`✏️ Updated text for line ${lineIndex + 1}: "${newText}"`);
            } else if (newText === '') {
                console.warn('⚠️ Empty text not allowed, keeping original value');
            }
            
            // Restore the span
            input.parentNode.removeChild(input);
            textSpan.style.display = 'inline';
        };
        
        const cancelEdit = () => {
            // Restore the span without changes
            input.parentNode.removeChild(input);
            textSpan.style.display = 'inline';
            console.log('❌ Text edit cancelled');
        };
        
        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEdit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        
        // Save when losing focus
        input.addEventListener('blur', saveEdit);
    }
    
    // Record current timecode
    recordCurrentTimecode() {
        if (!this.audioController || !this.currentLyrics) return;
        
        const currentTime = this.audioController.getCurrentTime() * 1000; // Convert to ms
        const nextLineIndex = this.findNextUntimedLine();
        
        if (nextLineIndex >= 0) {
            this.currentLyrics.lines[nextLineIndex].time = currentTime;
            this.currentLyrics.updateLastModified();
            this.renderLyrics();
            console.log(`⏺️ Recorded timecode ${this.formatTimeDisplay(currentTime)} for line ${nextLineIndex + 1}`);
        } else {
            console.log('⚠️ No untimed lines found');
        }
    }
    
    // Find next line without time
    findNextUntimedLine() {
        return this.currentLyrics.lines.findIndex(line => line.time < 0);
    }
    
    // Set time for specific line
    setLineTime(lineIndex) {
        if (!this.audioController || !this.currentLyrics) return;
        
        const currentTime = this.audioController.getCurrentTime() * 1000;
        this.currentLyrics.lines[lineIndex].time = currentTime;
        this.currentLyrics.updateLastModified();
        this.renderLyrics();
        console.log(`⏰ Set time ${this.formatTimeDisplay(currentTime)} for line ${lineIndex + 1}`);
    }
    
    // Clear time for specific line
    clearLineTime(lineIndex) {
        if (!this.currentLyrics) return;
        
        this.currentLyrics.clearLineTimecode(lineIndex);
        this.renderLyrics();
    }
    
    // Clear all timecodes
    clearAllTimecodes() {
        if (!this.currentLyrics) return;
        
        if (confirm('Clear all timecodes? This cannot be undone.')) {
            this.currentLyrics.clearAllTimecodes();
            this.renderLyrics();
            console.log('🗑️ All timecodes cleared');
        }
    }
    
    // Add new line
    addNewLine() {
        if (!this.currentLyrics) return;
        
        const text = prompt('Enter new line text:');
        if (text && text.trim()) {
            this.currentLyrics.addLine(-1, text.trim());
            this.renderLyrics();
            console.log('➕ New line added');
        }
    }
    
    // Update time and synchronize lyrics (core functionality from original)
    updateTime(timeMs) {
        this.currentTime = timeMs;
        
        if (!this.currentLyrics) {
            return;
        }

        // In record mode, don't auto-update active lines to prevent unwanted scroll
        if (this.recordMode) {
            // Only update timecode display, not active lines
            this.updateTimecodeDisplay(timeMs);
            return;
        }

        const activeLine = this.currentLyrics.getActiveLineAt(timeMs);
        
        // Debug for understanding line selection near zero
        // if (timeMs < 1000) {
        //     console.log(`🏠 Timecode near zero (${timeMs}ms):`, {
        //         timeMs,
        //         activeLine: activeLine ? { text: activeLine.text.substring(0, 30), time: activeLine.time } : null,
        //         firstLineTime: this.currentLyrics.lines[0]?.time,
        //         shouldBeFirstLine: timeMs < this.currentLyrics.lines[0]?.time
        //     });
        // }
        
        if (activeLine && activeLine !== this.activeLine) {
            this.highlightLine(activeLine);
            this.activeLine = activeLine;
        }
        
        // Update external timecode display
        this.updateTimecodeDisplay(timeMs);
    }
    
    // Update timecode display
    updateTimecodeDisplay(timeMs) {
        const timecodeElement = document.getElementById('timecode');
        if (timecodeElement) {
            const seconds = (timeMs / 1000).toFixed(3);
            const isPlaying = this.audioController && this.audioController.isPlaying();
            const recordIndicator = this.recordMode ? ' 🔴' : '';
            timecodeElement.textContent = `${seconds}s${recordIndicator}`; // Removed play/pause icons
            timecodeElement.style.backgroundColor = isPlaying ? '#0a0' : '#a00';
        }
    }
    
    // Highlight active line with scroll
    highlightLine(line) {
        // Remove previous highlight
        document.querySelectorAll('.lyrics-line').forEach(el => {
            el.style.color = '#666';
            el.style.fontWeight = 'normal';
            el.style.backgroundColor = 'transparent';
        });

        // Highlight active line
        const lineElement = document.getElementById(line.id);
        if (lineElement) {
            lineElement.style.color = '#fff';
            lineElement.style.fontWeight = 'bold';
            lineElement.style.backgroundColor = 'rgba(0, 150, 255, 0.2)';
            
            // Scroll to active line only if scroll is not blocked (record mode or edit mode)
            if (!this.recordMode && !this.editMode) {
                lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
    
    // Get active line at specific time
    getActiveLineAt(timeMs) {
        if (!this.currentLyrics) return null;
        return this.currentLyrics.getActiveLineAt(timeMs);
    }
    
    // Set current time programmatically (for testing)
    setCurrentTime(timeMs) {
        this.updateTime(timeMs);
    }

    // Get current display state
    getState() {
        return {
            hasLyrics: !!this.currentLyrics,
            editMode: this.editMode,
            recordMode: this.recordMode,
            fullscreenMode: this.fullscreenMode,
            fontSize: this.fontSize,
            currentLineIndex: this.currentLineIndex,
            currentTime: this.currentTime || 0
        };
    }
    
    // Navigate to line using arrow keys
    navigateToLine(direction) {
        if (!this.currentLyrics || !this.currentLyrics.lines.length) {
            console.log('❌ No lyrics available for navigation');
            return;
        }
        
        let newIndex;
        
        // If no line is currently selected, start with the first line
        if (this.currentLineIndex < 0) {
            newIndex = 0;
            console.log('🎯 No line selected, starting with first line');
        } else {
            if (direction === 'up') {
                // Move to previous line
                if (this.currentLineIndex <= 0) {
                    newIndex = this.currentLyrics.lines.length - 1; // Wrap to last line
                } else {
                    newIndex = this.currentLineIndex - 1;
                }
            } else if (direction === 'down') {
                // Move to next line
                if (this.currentLineIndex >= this.currentLyrics.lines.length - 1) {
                    newIndex = 0; // Wrap to first line
                } else {
                    newIndex = this.currentLineIndex + 1;
                }
            } else {
                return; // Invalid direction
            }
        }
        
        console.log(`🔄 Navigating ${direction} from line ${this.currentLineIndex + 1} to line ${newIndex + 1}`);
        
        // Set the new active line
        this.setActiveLineIndex(newIndex);
        
        // If the line has a timecode and we have an audio controller, seek to it
        const line = this.currentLyrics.lines[newIndex];
        if (line.time >= 0 && this.audioController) {
            const timeInSeconds = line.time / 1000;
            this.audioController.setCurrentTime(timeInSeconds);
            
            // Update the timecode display immediately
            this.updateTimecodeDisplay(line.time);
            
            // Also trigger a manual timeupdate
            if (this.audioController.emit) {
                this.audioController.emit('timeupdate', timeInSeconds);
            }
            
            console.log(`🎯 Navigated to line ${newIndex + 1} and seeking to ${this.formatTimeDisplay(line.time)}`);
        } else if (line.time < 0) {
            console.log(`📍 Navigated to line ${newIndex + 1} (no timecode)`);
        } else {
            console.log(`📍 Navigated to line ${newIndex + 1} (no audio controller)`);
        }
    }
    
    // Save recorded timecodes when exiting record mode
    saveRecordedTimecodes() {
        if (!this.currentLyrics) {
            console.log('❌ No current lyrics to save');
            return;
        }
        
        // Update the lastModified timestamp
        this.currentLyrics.metadata.lastModified = new Date().toISOString();
        
        // Save to storage using the correct method
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
        if (saveSuccess) {
            console.log('✅ Recorded timecodes saved successfully');
            
            // Count how many timecodes were recorded
            const recordedCount = this.currentLyrics.lines.filter(line => line.time >= 0).length;
            console.log(`📊 Total timecodes recorded: ${recordedCount}/${this.currentLyrics.lines.length}`);
        } else {
            console.error('❌ Failed to save recorded timecodes');
        }
    }
    
    // Cleanup method to remove event listeners
    destroy() {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
        }
    }
}
