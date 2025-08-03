// LyricsDisplay class for Lyrix application
import { CONSTANTS } from './constants.js';
import { StorageManager } from './storage.js';
import { UIManager } from './ui.js';
import { default_theme } from './style.js';

export class LyricsDisplay {
    constructor(container, audioController = null) {
        this.container = container; // May be null now since we append directly to lyrix_app
        this.audioController = audioController;
        this.currentLyrics = null;
        this.editMode = false;
        this.recordMode = false;
        this.fullscreenMode = false;
        
        // Style state management for fullscreen mode
        this.originalStyles = {
            normal: {
                backgroundColor: '#383838ff',
                color: 'green'
            },
            fullscreen: {
                backgroundColor: '#000',
                color: '#fff'
            },
            sidebar: {
                backgroundColor: '#2c3e50',
                color: '#ecf0f1'
            },
            hamburgerButton: {
                normal: '#2c3e50',
                hover: '#34495e'
            },
            editPanel: {
                backgroundColor: '#f0f0f0'
            },
            buttons: {
                save: '#4CAF50',
                cancel: '#f44336',
                transparent: 'transparent'
            },
            timecodeEdit: {
                backgroundColor: '#515151ff'
            },
            formElements: {
                color: '#1976D2',
                backgroundColor: '#f5faff',
                textColor: '#666'
            }
        };
        
        // Load timecode display state from localStorage
        const savedTimecodeState = localStorage.getItem('lyrix_show_timecodes');
        this.showTimecodes = savedTimecodeState === 'true';
        
        // Load metadata display states from localStorage
        const savedTitleState = localStorage.getItem('lyrix_show_title');
        this.showTitle = savedTitleState !== 'false'; // Default to true if not set
        
        const savedArtistState = localStorage.getItem('lyrix_show_artist');
        this.showArtist = savedArtistState !== 'false'; // Default to true if not set
        
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
        // ===== CREATE MAIN DISPLAY STRUCTURE (AUCUN SCROLL SUR BODY OU VIEW) =====
        // Create the main display container - FIXED pour empêcher tout scroll externe
        this.displayContainer = $('div', {
            id: 'display-container',
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100vw',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: UIManager.THEME.colors.surface,
                border: `1px solid ${UIManager.THEME.colors.border}`,
                // borderRadius: UIManager.THEME.borderRadius.md,
                overflow: 'hidden', // CRITIQUE : empêche tout scroll sur le container principal
                zIndex: '50' // Au-dessus du contenu normal mais sous les modales
            }
        });
        
        // Create toolbar - SOLIDAIRE et FIXE en haut (ne scroll jamais)
        this.toolbar = $('div', {
            id: 'lyrics-toolbar',
            css: {
                position: 'relative', // Relatif dans le flex container
                display: 'flex',
                flexDirection: 'column', // Colonnes pour main row + audio row
                backgroundColor: UIManager.THEME.colors.background,
                borderBottom: `1px solid ${UIManager.THEME.colors.border}`,
                borderRadius: `${UIManager.THEME.borderRadius.md} ${UIManager.THEME.borderRadius.md} 0 0`,
                flexShrink: 0, // Ne rétrécit JAMAIS
                zIndex: '100' // Au-dessus du contenu de scroll
            }
        });

        // Create hamburger button (always visible, positioned at top-left)
        this.hamburgerButton = $('button', {
            id: 'hamburger-menu-button',
            text: '☰',
            css: {
                position: 'absolute',
                top: '0px',
                left: '0px',
                width: '30px',
                height: '30px',
                backgroundColor: this.originalStyles.sidebar.backgroundColor, // Dark background
                border: '0px solid #34495e',
                borderRadius: '3px',
                color: this.originalStyles.sidebar.color, // Light text color
                fontSize: '18px',
                cursor: 'pointer',
                zIndex: '101',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }
        });

        // Hamburger button hover effects
        this.hamburgerButton.addEventListener('mouseenter', () => {
            this.hamburgerButton.style.backgroundColor = this.originalStyles.hamburgerButton.hover;
            this.hamburgerButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        });

        this.hamburgerButton.addEventListener('mouseleave', () => {
            this.hamburgerButton.style.backgroundColor = this.originalStyles.hamburgerButton.normal;
            this.hamburgerButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        });

        // Hamburger button click handler
        this.hamburgerButton.addEventListener('click', () => {
            this.toggleToolbarVisibility();
        });

        // Load toolbar visibility state from localStorage
        const savedToolbarState = localStorage.getItem('lyrix_toolbar_visible');
        this.toolbarVisible = savedToolbarState === 'true'; // Default to false (minimized)
        
        // Create lyrics content area - SEULE zone autorisée à scroller
        this.lyricsContent = $('div', {
            id: 'lyrics_content_area',
            css: {
                flex: '1', // Prend tout l'espace restant après la toolbar
                padding: UIManager.THEME.spacing.xl,
                backgroundColor: this.originalStyles.normal.backgroundColor,
                color: this.originalStyles.normal.color,
                overflow: 'auto', // SEULE zone qui peut scroller
                height: '0', // Force le flex à calculer la hauteur disponible
                fontSize: `${this.fontSize}px`,
           
                lineHeight: '1.6',
                fontFamily: 'Arial, sans-serif'
            }
        });
        
        // Assemble the structure: toolbar solidaire + content scrollable
        this.displayContainer.append(this.toolbar, this.lyricsContent);
        
        // Edit mode button
        this.editButton = UIManager.createInterfaceButton('✏️', {
            id: 'edit_mode',
            onClick: () => this.toggleEditMode(),
            css: {
                backgroundColor: this.editMode ? default_theme.editModeActiveColor : default_theme.button.backgroundColor
            }
        });
        
        // Record mode button
        this.recordButton = UIManager.createInterfaceButton('⏺️', {
            id: 'record_mode',
            onClick: () => this.toggleRecordMode(),
            css: {
                backgroundColor: this.recordMode ? default_theme.recordModeActiveColor : default_theme.button.backgroundColor
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
        
        // Timecode button - moved to settings panel
        // this.timecodeButton = UIManager.createInterfaceButton('🕐', {
        //     id: 'timecode_options',
        //     onClick: () => this.showTimecodeOptionsPanel()
        // });
        
        // Song navigation buttons
        this.previousSongButton = UIManager.createInterfaceButton('⏮️', {
            id: 'previous_song',
            onClick: () => {
                if (window.navigateToPreviousSong) {
                    window.navigateToPreviousSong();
                } else {
                    console.error('❌ navigateToPreviousSong function not available');
                }
            },
            title: 'Previous Song'
        });
        
        this.nextSongButton = UIManager.createInterfaceButton('⏭️', {
            id: 'next_song',
            onClick: () => {
                if (window.navigateToNextSong) {
                    window.navigateToNextSong();
                } else {
                    console.error('❌ navigateToNextSong function not available');
                }
            },
            title: 'Next Song'
        });
        
        // Font size controls
        this.fontSizeContainer = $('div', {
            id: 'font-size-controls-container',
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
                backgroundColor: this.originalStyles.editPanel.backgroundColor,
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
                backgroundColor: this.originalStyles.buttons.save,
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
                backgroundColor: this.originalStyles.buttons.cancel,
                display: 'none' // Initially hidden
            }
        });
        
        // Get tools from left panel to move to toolbar
        this.nonAudioTools = this.getNonAudioTools();
        this.audioTools = this.getAudioTools();
        this.audioButtons = this.getAudioButtons();
        this.timecodeDisplay = this.getTimecodeDisplay();
        

        
        // Apply compact styling to moved tools
        this.styleModeToolsForToolbar();
        
        // Create main toolbar row (non-audio tools + lyrics controls + timecode display)
        const mainToolRow = $('div', {
            id: 'main-toolbar-row',
            css: {
                display: this.toolbarVisible ? 'flex' : 'none', // Hidden by default
                gap: '8px',
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: '0px 0px 0px 33px', // Extra left padding to avoid hamburger menu overlap (52px = 36px button + 8px margin + 8px clearance)
                backgroundColor: this.originalStyles.buttons.transparent,
                // borderBottom: `1px solid ${UIManager.THEME.colors.border}`,
                transition: 'all 0.3s ease' // Smooth transition for show/hide
            }
        });
        
        // Add all main toolbar elements (timecode display without timecode options button)
        const mainToolElements = [
            ...this.nonAudioTools,
            this.editButton,
            this.recordButton,
            this.fullscreenButton,
            this.previousSongButton,
            this.nextSongButton
        ];
        
        // Add timecode display after timecode button if it exists
        if (this.timecodeDisplay) {
            mainToolElements.push(this.timecodeDisplay);
        }
        
        // Add font size container
        // Font size controls can be used within edit mode but not shown in main toolbar anymore
        // mainToolElements.push(this.fontSizeContainer); // Moved to settings panel
        
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
            console.log('🔧 Buttons found in toolbar:');
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
                display: 'none', // Hidden by default since toolbar starts hidden
                flexDirection: 'column',
                gap: '4px',
                width: '100%',
                padding: '3px 3px 3px 3px', // Extra left padding to align with main toolbar row
                // backgroundColor: UIManager.THEME.colors.surface
            }
        });
        
        // Add audio tools to their row
        this.audioTools.forEach(tool => {
            if (tool && tool.id === 'audio-scrub-slider-container') {
                // Make slider take full width
                // tool.style.width = '98%';
                tool.style.marginLeft = '0';
                tool.style.marginRight = '0';
                // Reset display property to ensure it follows parent container visibility
                tool.style.display = 'block';
            } else if (tool && tool.id === 'audio-player-title') {
                // Audio title styling
                tool.style.display = 'block';
                tool.style.marginBottom = '5px';
                tool.style.fontSize = '12px';
                tool.style.textAlign = 'center';
            }
            // Reset display for all audio tools to ensure they follow parent container
            if (tool && tool.style) {
                tool.style.display = 'block';
            }
            audioToolRow.append(tool);
        });
        
        // Add both rows to the toolbar
        this.toolbar.append(this.hamburgerButton, mainToolRow, audioToolRow);
        
        // Store references to toolbar rows for dynamic visibility
        this.mainToolRow = mainToolRow;
        this.audioToolRow = audioToolRow;
        
        // Update lyrics content positioning based on audio tools visibility
        this.updateLyricsContentPosition();
        
        // ===== EMPÊCHER TOUT SCROLL SUR BODY ET LYRIX_APP =====
        // Empêcher le scroll sur le body
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100vh';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        
        // Empêcher le scroll sur lyrix_app s'il existe
        const lyrixApp = document.getElementById('lyrix_app');
        if (lyrixApp) {
            lyrixApp.style.overflow = 'hidden';
            lyrixApp.style.height = '100vh';
            lyrixApp.style.width = '100vw';
            lyrixApp.style.position = 'relative';
        }
        
        // Ajouter le display container directement au body pour un contrôle total
        document.body.append(this.displayContainer);
        
        // Initialize timecode button appearance based on loaded state
        this.updateTimecodeButtonAppearance();
        
        // Initialize toolbar visibility based on saved state
        this.updateToolbarVisibility();
        
    }
    
    // Setup event listeners
    setupEventListeners() {
        // Click on lyrics line in edit mode
        this.lyricsContent.addEventListener('click', (e) => {
            if (this.editMode && e.target.classList.contains('lyrics-line')) {
                // Find the text span within the clicked line
                const lineIndex = parseInt(e.target.dataset.lineIndex);
                const textSpan = e.target.querySelector('.text-span');
                if (textSpan) {
                    this.editLineText(lineIndex, textSpan);
                }
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
        
        // Get the main buttons from stored references (import button moved to song library panel)
        if (window.leftPanelTools) {
            const { settingsButton, songListButton } = window.leftPanelTools;
            if (settingsButton) tools.push(settingsButton);
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
        }
        
        isAudioPlayerEnabled = isAudioPlayerEnabled === 'true';
        
        if (!isAudioPlayerEnabled) {
            return buttons; // Return empty array if audio player is disabled
        }
        
        // Get audio controls from stored references and use direct button references
        if (window.leftPanelAudioTools) {
            const { playButton, stopButton } = window.leftPanelAudioTools;
            
            // Fix the audio controls container first
            const audioContainer = document.getElementById('audio-controls-container');
            if (audioContainer) {
                audioContainer.style.display = 'flex';
                audioContainer.style.flexDirection = 'row';
                audioContainer.style.gap = '5px';
                audioContainer.style.alignItems = 'center';
                audioContainer.style.marginBottom = '15px';
            }
            
            if (stopButton) {
                // Fix positioning and display for stop button
                stopButton.style.position = 'relative'; // Remove any absolute positioning
                stopButton.style.display = 'inline-block';
                stopButton.style.visibility = 'visible';
                stopButton.style.float = 'none'; // Remove any float
                stopButton.style.top = 'auto';
                stopButton.style.left = 'auto';
                stopButton.style.right = 'auto';
                stopButton.style.bottom = 'auto';
                buttons.push(stopButton);
            }
            if (playButton) {
                // Fix positioning and display for play button
                playButton.style.position = 'relative'; // Remove any absolute positioning
                playButton.style.display = 'inline-block';
                playButton.style.visibility = 'visible';
                playButton.style.float = 'none'; // Remove any float
                playButton.style.top = 'auto';
                playButton.style.left = 'auto';
                playButton.style.right = 'auto';
                playButton.style.bottom = 'auto';
                buttons.push(playButton);
            }
            
            // Add volume slider after play/stop buttons
            const volumeContainer = document.getElementById('audio-volume-slider-container');
            if (volumeContainer) {
                // Create a container for volume slider + value display
                const volumeWrapper = document.createElement('div');
                volumeWrapper.id = 'volume-wrapper-toolbar';
                volumeWrapper.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    margin-left: 10px;
                `;
                
                // Style the volume container for toolbar
                volumeContainer.style.width = '120px';
                volumeContainer.style.height = '25px';
                volumeContainer.style.marginBottom = '0';
                volumeContainer.style.display = 'flex';
                volumeContainer.style.alignItems = 'center';
                
                // Create volume value display
                // const volumeValue = document.createElement('span');
                // volumeValue.id = 'volume-value-display';
                // volumeValue.style.cssText = `
                //     font-size: 11px;
                //     color: #666;
                //     min-width: 25px;
                //     text-align: right;
                // `;
                
                // Get current volume from localStorage and display it
                const savedVolume = localStorage.getItem('lyrix_audio_volume') || '70';
                // volumeValue.textContent = savedVolume + '%';
                
                // Move volume container to wrapper and add value display
                volumeWrapper.appendChild(volumeContainer);
                // volumeWrapper.appendChild(volumeValue);
                
                buttons.push(volumeWrapper);
            }
        } else {
        }
        
        return buttons;
    }
    
    // Get audio tools from left panel to move to lyrics toolbar (excluding buttons that go to main row)
    getAudioTools() {
        const tools = [];
        
        // Get individual audio control elements by their IDs in the correct order
        // Volume slider is now in main toolbar, so only get title and scrub slider
        const audioControlIds = [
            'audio-player-title',
            'audio-scrub-slider-container'  // Volume slider moved to main toolbar
        ];
        
        audioControlIds.forEach(id => {
            const element = document.getElementById(id);
            if (element && !tools.includes(element)) {
                tools.push(element);
            }
        });
        
        // Get scrub container from leftPanelScrubTools if it exists and not already added
        if (window.leftPanelScrubTools) {
            const { scrubContainer } = window.leftPanelScrubTools;
            if (scrubContainer && !tools.includes(scrubContainer)) {
                tools.push(scrubContainer);
            }
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
                    tool.style.flexDirection = 'row'; // Force horizontal layout
                    tool.style.gap = '5px'; // Add space between buttons
                    tool.style.alignItems = 'center'; // Vertically center buttons
                    // Force override any other display setting
                    tool.style.setProperty('display', 'flex', 'important');
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
                    tool.style.boxSizing = 'border-box';
                    tool.style.display = 'flex';
                    tool.style.alignItems = 'center';
                    tool.style.justifyContent = 'center';
                    // Note: height et width viennent déjà de default_theme.button dans createEnhancedTimecodeDisplay
                }
                
        
            }
        });
    }
    
    // Update lyrics content area position based on audio tools visibility
    updateLyricsContentPosition() {
        if (!this.audioToolRow) return;
        
        // Show/hide audio tools row - only if toolbar is visible and audio is enabled
        if (this.toolbarVisible) {
            const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
            if (isAudioPlayerEnabled && this.audioTools.length > 0) {
                this.audioToolRow.style.display = 'flex';
            } else {
                this.audioToolRow.style.display = 'none';
            }
        } else {
            // Always hide if toolbar is hidden
            this.audioToolRow.style.display = 'none';
        }
        
    }
    
    // Public method to refresh audio tools visibility (called when settings change)
    refreshAudioToolsVisibility() {
        // Re-fetch the audio buttons with the new settings
        this.audioButtons = this.getAudioButtons();
        
        // Update toolbar if it exists
        if (this.toolbar) {
            // Clear old audio buttons from toolbar
            const existingAudioButtons = this.toolbar.querySelectorAll('#audio-play-button, #audio-stop-button');
            existingAudioButtons.forEach(btn => {
                if (btn.parentNode === this.toolbar) {
                    this.toolbar.removeChild(btn);
                }
            });
            
            // Add new audio buttons to toolbar if they exist
            if (this.audioButtons && this.audioButtons.length > 0) {
                this.audioButtons.forEach(button => {
                    if (button && !this.toolbar.contains(button)) {
                        this.toolbar.appendChild(button);
                    }
                });
            }
            
            // Re-apply styling
            this.styleModeToolsForToolbar();
        }
        
        // Update the lyrics content position
        this.updateLyricsContentPosition();
    }
    
    // Debug method to force audio buttons visibility
    debugAudioButtons() {
       
        if (this.audioButtons && this.audioButtons.length > 0) {
            this.audioButtons.forEach((btn, index) => {
            
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
        
        // Verify and correct timecode order when loading lyrics
        this.verifyAndCorrectAllTimecodes();
        
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
            id: 'lyrics-metadata-container',
            css: {
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: this.originalStyles.timecodeEdit.backgroundColor,
                borderRadius: '8px',
                // borderLeft: '4px solid #2196F3'
            }
        });
        
        let title;
        if (this.editMode) {
            title = $('input', {
                id: 'edit_title_input',
                type: 'text',
                value: this.currentLyrics.metadata.title || '',
                css: {
                    margin: '0 0 5px 0',
                    color: this.originalStyles.formElements.color,
                    fontSize: '1.3em',
                    fontWeight: 'bold',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: `2px solid ${this.originalStyles.formElements.color}`,
                    backgroundColor: this.originalStyles.formElements.backgroundColor,
                    width: '100%'
                }
            });
            title.addEventListener('input', (e) => {
                this.currentLyrics.metadata.title = e.target.value;
            });
            title.addEventListener('change', (e) => {
                this.currentLyrics.metadata.title = e.target.value;
                if (this.lyricsLibrary && this.lyricsLibrary.saveSong) {
                    this.lyricsLibrary.saveSong(this.currentLyrics);
                }
            });
        } else {
            title = $('h2', {
                id: 'lyrics-title-display',
                text: this.currentLyrics.metadata.title,
                css: {
                    margin: '0 0 5px 0',
                    color: this.originalStyles.formElements.color,
                    fontSize: '1.3em',
                    cursor: 'pointer'
                }
            });
            
            // Add double-click to edit title in normal mode
            title.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.editMetadataField(title, 'title', this.currentLyrics.metadata.title || '');
            });
        }
        
        let artist;
        if (this.editMode) {
            artist = $('input', {
                id: 'edit_artist_input',
                type: 'text',
                value: this.currentLyrics.metadata.artist || '',
                css: {
                    margin: '0 0 5px 0',
                    color: this.originalStyles.formElements.textColor,
                    fontSize: '1.1em',
                    fontWeight: 'normal',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: `2px solid ${this.originalStyles.formElements.textColor}`,
                    backgroundColor: this.originalStyles.formElements.backgroundColor,
                    width: '100%'
                }
            });
            artist.addEventListener('input', (e) => {
                this.currentLyrics.metadata.artist = e.target.value;
            });
            artist.addEventListener('change', (e) => {
                this.currentLyrics.metadata.artist = e.target.value;
                if (this.lyricsLibrary && this.lyricsLibrary.saveSong) {
                    this.lyricsLibrary.saveSong(this.currentLyrics);
                }
            });
        } else {
            artist = $('h3', {
                id: 'lyrics-artist-display',
                text: `by ${this.currentLyrics.metadata.artist}`,
                css: {
                    margin: '0 0 5px 0',
                    color: this.originalStyles.formElements.textColor,
                    fontSize: '1.1em',
                    fontWeight: 'normal',
                    cursor: 'pointer'
                }
            });
            
            // Add double-click to edit artist in normal mode
            artist.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.editMetadataField(artist, 'artist', this.currentLyrics.metadata.artist || '');
            });
        }
        
        metadata.append(title, artist);
        
        if (this.currentLyrics.metadata.album) {
            const album = $('div', {
                id: 'lyrics-album-display',
                text: `Album: ${this.currentLyrics.metadata.album}`,
                css: {
                    color: '#666',
                    fontSize: '0.9em'
                }
            });
            metadata.append(album);
        }
        
        this.lyricsContent.append(metadata);
        
        // Apply metadata visibility setting
        this.updateMetadataVisibility();
        
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
            id: `line-content-${index}`,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }
        });
        
        // Show timecode if enabled and line has a time (but not in fullscreen mode)
        if (this.showTimecodes && line.time >= 0 && !this.fullscreenMode) {
            const timeSpan = $('span', {
                text: this.formatTimeDisplay(line.time),
                css: {
                    fontSize: '0.8em',
                    color: this.originalStyles.formElements.textColor,
                    backgroundColor: this.originalStyles.editPanel.backgroundColor,
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
                timeSpan.setAttribute('title', 'Double-tap to edit or drag up/down to adjust timecode');
                // Add a subtle visual hint for touch devices
                timeSpan.style.borderBottom = '1px dotted #999';
                timeSpan.style.position = 'relative';
            } else {
                timeSpan.setAttribute('title', 'Double-click to edit timecode');
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
                
                // Store initial touch position for swipe detection
                const touch = e.touches[0];
                timeSpan._touchStartY = touch.clientY;
                timeSpan._touchStartTime = Date.now();
                timeSpan._initialTime = line.time;
                timeSpan._isDragging = false;
            });
            
            timeSpan.addEventListener('touchmove', (e) => {
                // Block timecode editing in record mode
                if (this.recordMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                
                e.preventDefault();
                
                if (!timeSpan._touchStartY) return;
                
                const touch = e.touches[0];
                const deltaY = timeSpan._touchStartY - touch.clientY; // Invert: up = positive
                const deltaTime = Date.now() - timeSpan._touchStartTime;
                
                // If moved more than 10px, consider it a drag
                if (Math.abs(deltaY) > 10) {
                    timeSpan._isDragging = true;
                    
                    // Calculate time adjustment (more sensitive for touch)
                    let sensitivity = 30; // milliseconds per pixel for touch
                    const timeChange = deltaY * sensitivity;
                    const newTime = Math.max(0, timeSpan._initialTime + timeChange);
                    
                    // Update the display
                    timeSpan.textContent = this.formatTimeDisplay(newTime);
                    timeSpan.style.backgroundColor = '#007bff';
                    timeSpan.style.color = 'white';
                    
                    // Update the actual time in the lyrics object
                    this.currentLyrics.lines[index].time = newTime;
                    this.currentLyrics.updateLastModified();
                }
            });
            
            timeSpan.addEventListener('touchend', (e) => {
                // Block timecode editing in record mode
                if (this.recordMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('⚠️ Timecode editing is disabled in record mode');
                    return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                
                const deltaTime = Date.now() - (timeSpan._touchStartTime || 0);
                const currentTime = Date.now();
                
                if (timeSpan._isDragging) {
                    // Finish drag operation
                    timeSpan.style.backgroundColor = '#f0f0f0';
                    timeSpan.style.color = '#666';
                    
                    // Verify and correct timecode order after drag adjustment
                    this.verifyAndCorrectTimecodeOrder(index);
                    
                    // Save to localStorage when drag is complete
                    const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                    if (saveSuccess) {
                        console.log(`✅ Touch-adjusted timecode for line ${index + 1} saved successfully`);
                    } else {
                        console.error(`❌ Failed to save touch-adjusted timecode for line ${index + 1}`);
                    }
                } else {
                    // Handle double-tap detection for iOS
                    if (!timeSpan._lastTapTime) {
                        timeSpan._lastTapTime = currentTime;
                    } else {
                        const timeBetweenTaps = currentTime - timeSpan._lastTapTime;
                        if (timeBetweenTaps < 300) { // 300ms for double-tap
                            // Double-tap detected - open edit modal
                            console.log('📱 Double-tap detected on iOS timecode');
                            this.editTimecodeTouch(index, timeSpan);
                            timeSpan._lastTapTime = 0; // Reset
                        } else {
                            timeSpan._lastTapTime = currentTime;
                        }
                    }
                }
                
                // Clean up touch data
                delete timeSpan._touchStartY;
                delete timeSpan._touchStartTime;
                delete timeSpan._initialTime;
                delete timeSpan._isDragging;
            });
            
            // Double-click to edit timecode (desktop only)
            timeSpan.addEventListener('dblclick', (e) => {
                // Block timecode editing in record mode
                if (this.recordMode) {
                    e.stopPropagation();
                    console.log('⚠️ Timecode editing is disabled in record mode');
                    return;
                }
                
                e.stopPropagation();
                this.editTimecode(index, timeSpan);
            });
            
            // Double-tap support for mobile devices only
            if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
                let tapCount = 0;
                let tapTimer = null;
                
                timeSpan.addEventListener('click', (e) => {
                    // Block timecode editing in record mode
                    if (this.recordMode) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('⚠️ Timecode editing is disabled in record mode');
                        return;
                    }
                    
                    tapCount++;
                    
                    if (tapCount === 1) {
                        tapTimer = setTimeout(() => {
                            tapCount = 0; // Reset tap count after timeout
                        }, 300); // 300ms timeout for double-tap detection
                    } else if (tapCount === 2) {
                        // Double-tap detected
                        clearTimeout(tapTimer);
                        tapCount = 0;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Use mobile-optimized modal for touch devices
                        this.editTimecodeTouch(index, timeSpan);
                    }
                });
            }
            
            // Mouse drag to adjust timecode
            let isDragging = false;
            let startX = 0;
            let startTime = line.time;
            
            timeSpan.addEventListener('mousedown', (e) => {
                // Block timecode dragging in record mode
                if (this.recordMode) {
                    e.preventDefault();
                    console.log('⚠️ Timecode dragging is disabled in record mode');
                    return;
                }
                
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
                    
                    // Verify and correct timecode order after drag adjustment
                    this.verifyAndCorrectTimecodeOrder(index);
                    
                    // Save to localStorage when drag is complete
                    const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                    if (saveSuccess) {
                        console.log(`✅ Drag-adjusted timecode for line ${index + 1} saved to localStorage successfully`);
                    } else {
                        console.error(`❌ Failed to save drag-adjusted timecode for line ${index + 1} to localStorage`);
                    }
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
                id: `line-controls-${index}`,
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
                onClick: () => {
                    this.editLineText(index);
                }
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
                // RECORD MODE: Assign the timecode currently displayed in #timecode-display
                let timecodeMs = 0;
                const timecodeElement = document.getElementById('timecode-display');
                if (timecodeElement) {
                    const text = timecodeElement.textContent.replace('s', '').trim();
                    const seconds = parseFloat(text);
                    if (isFinite(seconds)) {
                        timecodeMs = Math.round(seconds * 1000);
                    }
                }
                this.currentLyrics.lines[index].time = timecodeMs;
                this.currentLyrics.updateLastModified();
                
                // Verify and correct timecode order after recording
                this.verifyAndCorrectTimecodeOrder(index);
                
                // Save to localStorage when recording timecode in record mode
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                if (saveSuccess) {
                    console.log(`✅ Record mode timecode for line ${index + 1} saved to localStorage successfully`);
                } else {
                    console.error(`❌ Failed to save record mode timecode for line ${index + 1} to localStorage`);
                }
                
                if (typeof window.updateTimecodeDisplay === 'function') {
                    window.updateTimecodeDisplay(timecodeMs);
                }
                if (this.showTimecodes) {
                    this.renderLyrics();
                }
                // console.log(`🔴 RECORD: Assigned timecode ${this.formatTimeDisplay(timecodeMs)} to line ${index + 1}: "${line.text}"`);
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
                    // RECORD MODE: Get current time from timecode display (works with both audio controller and AUv3 host)
                    let currentTime = 0;
                    const timecodeElement = document.getElementById('timecode-display');
                    if (timecodeElement) {
                        const text = timecodeElement.textContent.replace('s', '').replace('🔴', '').trim();
                        const seconds = parseFloat(text);
                        if (isFinite(seconds)) {
                            currentTime = Math.round(seconds * 1000); // Convert to ms
                        }
                    }
                    
                    // Fallback to audio controller if timecode display is not available
                    if (currentTime === 0 && this.audioController) {
                        currentTime = this.audioController.getCurrentTime() * 1000; // Convert to ms
                    }
                    
                    if (currentTime > 0) {
                        this.currentLyrics.lines[index].time = currentTime;
                        this.currentLyrics.updateLastModified();
                        
                        // Verify and correct timecode order after recording
                        this.verifyAndCorrectTimecodeOrder(index);
                        
                        // Save to localStorage when recording timecode in record mode (touch)
                        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                        if (saveSuccess) {
                            console.log(`✅ Touch record mode timecode for line ${index + 1} saved to localStorage successfully`);
                        } else {
                            console.error(`❌ Failed to save touch record mode timecode for line ${index + 1} to localStorage`);
                        }
                        
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
                element.style.backgroundColor = 'red';
                element.style.color = 'black';
                // element.style.border = '2px solid #ffc107';
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
        // Garder l'icône, changer seulement la couleur (utilise les couleurs du thème)
        this.editButton.style.backgroundColor = this.editMode ? default_theme.editModeActiveColor : default_theme.button.backgroundColor;
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
        // Synchronise la valeur des inputs avec les métadonnées à chaque entrée en mode édition
        if (this.editMode) {
            setTimeout(() => {
                const titleInput = document.getElementById('edit_title_input');
                if (titleInput) titleInput.value = this.currentLyrics.metadata.title || '';
                const artistInput = document.getElementById('edit_artist_input');
                if (artistInput) artistInput.value = this.currentLyrics.metadata.artist || '';
            }, 0);
        }
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
        // Garder l'icône, changer seulement la couleur (utilise les couleurs du thème)
        const newColor = this.recordMode ? default_theme.recordModeActiveColor : default_theme.button.backgroundColor;
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
    
    // Update style configuration (for future customization)
    updateStyleConfig(mode, styleUpdates) {
        if (mode === 'normal' || mode === 'fullscreen') {
            this.originalStyles[mode] = {
                ...this.originalStyles[mode],
                ...styleUpdates
            };
            
            // If updating current mode, apply the changes immediately
            if ((mode === 'fullscreen' && this.fullscreenMode) || 
                (mode === 'normal' && !this.fullscreenMode)) {
                this.applyModeStyles(this.fullscreenMode);
            }
            
            console.log(`🎨 Updated ${mode} styles:`, this.originalStyles[mode]);
        }
    }
    
    // Get current style configuration
    getStyleConfig(mode = null) {
        if (mode) {
            return { ...this.originalStyles[mode] };
        }
        return {
            normal: { ...this.originalStyles.normal },
            fullscreen: { ...this.originalStyles.fullscreen }
        };
    }
    
    // Apply styles based on the current mode (normal or fullscreen)
    applyModeStyles(isFullscreen) {
        const styles = isFullscreen ? this.originalStyles.fullscreen : this.originalStyles.normal;
        
        if (isFullscreen) {
            // Apply fullscreen styles
            this.lyricsContent.style.position = 'fixed';
            this.lyricsContent.style.top = '0';
            this.lyricsContent.style.left = '0';
            this.lyricsContent.style.width = '100vw';
            this.lyricsContent.style.height = '100vh';
            this.lyricsContent.style.zIndex = '9999';
            this.lyricsContent.style.backgroundColor = styles.backgroundColor;
            this.lyricsContent.style.color = styles.color;
            this.lyricsContent.style.padding = '40px';
            this.lyricsContent.style.overflow = 'auto';
            this.lyricsContent.style.fontSize = `${this.fontSize}px`;
            this.lyricsContent.style.textAlign = 'center';
            this.lyricsContent.style.cursor = 'pointer';
            this.lyricsContent.style.flex = 'none';  // Remove flex behavior
        } else {
            // Apply normal styles
            this.lyricsContent.style.position = 'relative';
            this.lyricsContent.style.top = 'auto';
            this.lyricsContent.style.left = 'auto';
            this.lyricsContent.style.width = 'auto';
            this.lyricsContent.style.height = 'auto';
            this.lyricsContent.style.zIndex = 'auto';
            this.lyricsContent.style.backgroundColor = styles.backgroundColor;
            this.lyricsContent.style.color = styles.color;
            this.lyricsContent.style.padding = UIManager.THEME.spacing.xl;
            this.lyricsContent.style.fontSize = `${this.fontSize}px`;
            this.lyricsContent.style.textAlign = 'left';
            this.lyricsContent.style.cursor = 'default';
            this.lyricsContent.style.flex = '1';
            this.lyricsContent.style.overflow = 'auto';
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
            
            // Apply fullscreen styles
            this.applyModeStyles(true);
            
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
            
            // Apply normal styles
            this.applyModeStyles(false);
        }
        
        console.log(`🖼️ Fullscreen mode: ${this.fullscreenMode ? 'ON' : 'OFF'}`);
        
        // Re-render lyrics to update timecode visibility based on fullscreen state
        if (this.currentLyrics) {
            this.renderLyrics();
        }
    }
    
    // Toggle toolbar visibility (hamburger menu functionality)
    toggleToolbarVisibility() {
        this.toolbarVisible = !this.toolbarVisible;
        
        // Save state to localStorage
        localStorage.setItem('lyrix_toolbar_visible', this.toolbarVisible.toString());
        
        // Update main toolbar row visibility
        if (this.mainToolRow) {
            this.mainToolRow.style.display = this.toolbarVisible ? 'flex' : 'none';
        }
        
        // Update audio toolbar row visibility if audio is enabled
        const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
        if (this.audioToolRow && isAudioPlayerEnabled) {
            this.audioToolRow.style.display = this.toolbarVisible ? 'flex' : 'none';
        }
        
        // Update hamburger button icon
this.hamburgerButton.textContent = this.toolbarVisible ? '⋮' : '☰';        
        // Animate the toolbar transition
        if (this.mainToolRow) {
            this.mainToolRow.style.transition = 'all 0.3s ease';
        }
        if (this.audioToolRow) {
            this.audioToolRow.style.transition = 'all 0.3s ease';
        }
        
        console.log(`🍔 Toolbar ${this.toolbarVisible ? 'shown' : 'hidden'}`);
    }
    
    // Update toolbar visibility without toggling (for initialization)
    updateToolbarVisibility() {
        // Update main toolbar row visibility
        if (this.mainToolRow) {
            this.mainToolRow.style.display = this.toolbarVisible ? 'flex' : 'none';
        }
        
        // Update audio toolbar row visibility - always hide if toolbar is hidden
        if (this.audioToolRow) {
            if (this.toolbarVisible) {
                // Only show if toolbar is visible AND audio is enabled
                const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
                this.audioToolRow.style.display = isAudioPlayerEnabled ? 'flex' : 'none';
            } else {
                // Always hide if toolbar is hidden
                this.audioToolRow.style.display = 'none';
            }
        }
        
        // Update hamburger button icon
        if (this.hamburgerButton) {
            this.hamburgerButton.textContent = this.toolbarVisible ? '✕' : '☰';
        }
        
        console.log(`🍔 Toolbar initialized as ${this.toolbarVisible ? 'shown' : 'hidden'}`);
    }
    
    // Toggle timecode display
    toggleTimecodes() {
        this.showTimecodes = !this.showTimecodes;
        
        // Save state to localStorage
        localStorage.setItem('lyrix_show_timecodes', this.showTimecodes.toString());

        // Update button appearance
        this.updateTimecodeButtonAppearance();

        // Re-render lyrics to show/hide timecodes
        this.renderLyrics();
        
        console.log(`⏱️ Timecode display: ${this.showTimecodes ? 'ON' : 'OFF'}`);
    }
    
    // Update timecode button appearance based on current state
    updateTimecodeButtonAppearance() {
        if (this.timecodeButton) {
            if (this.showTimecodes) {
                this.timecodeButton.textContent = '🚫'; // Icône pour cacher
                this.timecodeButton.style.backgroundColor = default_theme.editModeActiveColor;
            } else {
                this.timecodeButton.textContent = '🕐'; // Icône pour afficher
                this.timecodeButton.style.backgroundColor = default_theme.button.backgroundColor;
            }
        }
    }
    
    // Toggle title visibility
    toggleTitle() {
        this.showTitle = !this.showTitle;
        
        // Save state to localStorage
        localStorage.setItem('lyrix_show_title', this.showTitle.toString());

        // Update title visibility
        this.updateTitleVisibility();
        
        console.log(`📄 Title display: ${this.showTitle ? 'ON' : 'OFF'}`);
    }
    
    // Toggle artist visibility
    toggleArtist() {
        this.showArtist = !this.showArtist;
        
        // Save state to localStorage
        localStorage.setItem('lyrix_show_artist', this.showArtist.toString());

        // Update artist visibility
        this.updateArtistVisibility();
        
        console.log(`� Artist display: ${this.showArtist ? 'ON' : 'OFF'}`);
    }
    
    // Update title visibility
    updateTitleVisibility() {
        const titleElement = document.getElementById('edit_title_input') || document.getElementById('lyrics-title-display');
        if (titleElement) {
            titleElement.style.display = this.showTitle ? 'block' : 'none';
        }
    }
    
    // Update artist visibility
    updateArtistVisibility() {
        const artistElement = document.getElementById('edit_artist_input') || document.getElementById('lyrics-artist-display');
        if (artistElement) {
            artistElement.style.display = this.showArtist ? 'block' : 'none';
        }
    }
    
    // Update metadata container visibility (legacy method for compatibility)
    updateMetadataVisibility() {
        this.updateTitleVisibility();
        this.updateArtistVisibility();
    }
    
    // Toggle metadata (title/artist) visibility (legacy method for compatibility)
    toggleMetadata() {
        // If both are currently visible, hide both
        if (this.showTitle && this.showArtist) {
            this.showTitle = false;
            this.showArtist = false;
        }
        // If both are hidden, show both
        else if (!this.showTitle && !this.showArtist) {
            this.showTitle = true;
            this.showArtist = true;
        }
        // If mixed state, show both
        else {
            this.showTitle = true;
            this.showArtist = true;
        }
        
        // Save states to localStorage
        localStorage.setItem('lyrix_show_title', this.showTitle.toString());
        localStorage.setItem('lyrix_show_artist', this.showArtist.toString());

        // Update visibility
        this.updateTitleVisibility();
        this.updateArtistVisibility();
        
        console.log(`📄 Metadata display: Title ${this.showTitle ? 'ON' : 'OFF'}, Artist ${this.showArtist ? 'ON' : 'OFF'}`);
    }
    
    // Show timecode options panel (DEPRECATED - moved to settings panel)
    /* 
    showTimecodeOptionsPanel() {
        // This method has been moved to the settings panel
        // Timecode options are now available in Settings > Timecode Options
        console.log('⚠️ showTimecodeOptionsPanel is deprecated - use settings panel instead');
    }
    */
    
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
        
        // Block timecode editing in record mode
        if (this.recordMode) {
            console.log('⚠️ Timecode editing is blocked in record mode');
            return;
        }
        
        // Get the currently displayed timecode text from the span (similar to editLineText approach)
        const currentDisplayedTime = timeSpan.textContent || timeSpan.innerText || '';
        
        // Clean up the displayed time by removing brackets if present: [02:30.50] -> 02:30.50
        const currentTimeFormatted = currentDisplayedTime.replace(/[\[\]]/g, '').trim();
        
        // Get the computed font size from the original timeSpan to match it exactly
        const computedStyle = window.getComputedStyle(timeSpan);
        const actualFontSize = computedStyle.fontSize;
        
        // Create input field for editing using DOM directly to ensure value is set
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTimeFormatted;
        input.style.cssText = `
            font-size: ${actualFontSize};
            font-family: monospace;
            padding: 2px 6px;
            border: 2px solid #007bff;
            border-radius: 3px;
            min-width: 60px;
            text-align: center;
            background-color: white;
            color: #333;
            cursor: text;
            user-select: text;
        `;
        
        // Add a hint tooltip
        input.title = "Type to edit or drag up/down to adjust timecode\nHold Shift for fine adjustment, Ctrl/Cmd for coarse adjustment";
        
        // Replace the span with input temporarily
        timeSpan.style.display = 'none';
        timeSpan.parentNode.insertBefore(input, timeSpan);
        input.focus();
        input.select();
        
        // Add slide up/down functionality for timecode increment/decrement
        let isDragging = false;
        let startY = 0;
        let startTime = this.currentLyrics.lines[lineIndex].time;
        let lastUpdateY = 0;
        
        const handleMouseDown = (e) => {
            isDragging = true;
            startY = e.clientY;
            startTime = this.currentLyrics.lines[lineIndex].time;
            lastUpdateY = e.clientY;
            input.style.cursor = 'ns-resize';
            input.style.borderColor = '#28a745'; // Green border when dragging
            input.style.backgroundColor = '#f8fff8'; // Light green background
            e.preventDefault();
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaY = lastUpdateY - e.clientY; // Invert: up = positive
            let sensitivity = 50; // Base sensitivity: milliseconds per pixel
            
            // Increase precision when holding Shift
            if (e.shiftKey) {
                sensitivity = 10; // Fine adjustment
            }
            // Decrease precision when holding Ctrl/Cmd for coarse adjustments
            else if (e.ctrlKey || e.metaKey) {
                sensitivity = 200; // Coarse adjustment
            }
            
            // Update every pixel to provide smooth feedback
            if (Math.abs(deltaY) >= 1) {
                const timeChange = deltaY * sensitivity;
                let newTime = Math.max(0, startTime + timeChange);
                
                // Update the input display and actual time
                this.currentLyrics.lines[lineIndex].time = newTime;
                const formattedTime = this.formatTimeDisplay(newTime);
                input.value = formattedTime.replace(/[\[\]]/g, '').trim();
                
                lastUpdateY = e.clientY;
                startTime = newTime; // Update reference point for continuous adjustment
            }
        };
        
        const handleMouseUp = (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            input.style.cursor = 'text';
            input.style.borderColor = '#007bff'; // Back to blue
            input.style.backgroundColor = 'white'; // Back to white
            
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Update lyrics and save to localStorage
            this.currentLyrics.updateLastModified();
            
            // Verify and correct timecode order after drag adjustment
            this.verifyAndCorrectTimecodeOrder(lineIndex);
            
            // Save to localStorage using the same method as the save button
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log(`✅ Drag-adjusted timecode for line ${lineIndex + 1} saved to localStorage successfully`);
            } else {
                console.error(`❌ Failed to save drag-adjusted timecode for line ${lineIndex + 1} to localStorage`);
            }
            
            console.log(`🎯 Timecode adjusted via drag: ${this.formatTimeDisplay(this.currentLyrics.lines[lineIndex].time)}`);
        };
        
        // Add mouse event listeners to input
        input.addEventListener('mousedown', handleMouseDown);
        
        const saveEdit = () => {
            const newTimeText = input.value.trim();
            let newTime = this.parseTimeInput(newTimeText);
            
            if (newTime !== null) {
                // Update the time
                this.currentLyrics.lines[lineIndex].time = newTime;
                this.currentLyrics.updateLastModified();
                
                // Verify and correct timecode order after manual edit
                this.verifyAndCorrectTimecodeOrder(lineIndex);
                
                // Get the potentially corrected time
                const finalTime = this.currentLyrics.lines[lineIndex].time;
                
                // Save to localStorage using the same method as the save button
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                if (saveSuccess) {
                    console.log(`✅ Timecode for line ${lineIndex + 1} saved to localStorage successfully`);
                } else {
                    console.error(`❌ Failed to save timecode for line ${lineIndex + 1} to localStorage`);
                }
                
                timeSpan.textContent = this.formatTimeDisplay(finalTime);
                console.log(`✏️ Updated timecode for line ${lineIndex + 1}: ${this.formatTimeDisplay(finalTime)}`);
            } else {
                console.warn('⚠️ Invalid time format, keeping original value');
            }
            
            // Clean up mouse event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            // Restore the span
            input.parentNode.removeChild(input);
            timeSpan.style.display = 'inline-block';
        };
        
        const cancelEdit = () => {
            // Clean up mouse event listeners
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
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

    // Touch-optimized timecode editing for iOS/mobile devices
    editTimecodeTouch(lineIndex, timeSpan) {
        if (!this.currentLyrics) return;
        
        // Block timecode editing in record mode
        if (this.recordMode) {
            console.log('⚠️ Timecode editing is blocked in record mode');
            return;
        }
        
        // Get current time value
        const currentTime = this.currentLyrics.lines[lineIndex].time;
        
        // Convert milliseconds to mm:ss.sss format for display
        let currentTimeFormatted;
        if (currentTime === undefined || currentTime === null || currentTime < 0) {
            currentTimeFormatted = '00:00.000';
        } else {
            const totalSeconds = currentTime / 1000;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const milliseconds = Math.floor((totalSeconds % 1) * 1000);
            currentTimeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
        }
        
        // Create a mobile-optimized modal for timecode editing
        const modalOverlay = $('div', {
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: '10000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                boxSizing: 'border-box'
            }
        });
        
        const modal = $('div', {
            css: {
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '350px',
                width: '100%',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                position: 'relative'
            }
        });
        
        // Title
        const title = $('h3', {
            text: `Edit Timecode - Line ${lineIndex + 1}`,
            css: {
                margin: '0 0 16px 0',
                fontSize: '18px',
                color: '#333',
                textAlign: 'center'
            }
        });
        
        // Current line preview
        const linePreview = $('div', {
            text: `"${this.currentLyrics.lines[lineIndex].text}"`,
            css: {
                margin: '0 0 20px 0',
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#666',
                fontStyle: 'italic',
                textAlign: 'center',
                border: '1px solid #e9ecef'
            }
        });
        
        // Input container
        const inputContainer = $('div', {
            css: {
                marginBottom: '20px'
            }
        });
        
        const inputLabel = $('label', {
            text: 'Timecode (mm:ss.sss or seconds):',
            css: {
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#333'
            }
        });
        
        // Create input using direct DOM creation to ensure value is set correctly
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTimeFormatted;
        input.style.cssText = `
            width: 100%;
            padding: 12px;
            fontSize: 16px;
            fontFamily: monospace;
            border: 2px solid #007bff;
            borderRadius: 6px;
            textAlign: center;
            boxSizing: border-box;
            backgroundColor: white;
        `;
        
        // Ensure the value is set correctly
        setTimeout(() => {
            input.value = currentTimeFormatted;
        }, 50);
        
        // Focus and select all text for easy editing
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
        
        // Swipe adjustment area
        const swipeArea = $('div', {
            css: {
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '2px dashed #007bff',
                textAlign: 'center',
                userSelect: 'none',
                cursor: 'ns-resize'
            }
        });
        
        const swipeLabel = $('div', {
            text: '👆 Swipe up/down to adjust',
            css: {
                fontSize: '14px',
                color: '#007bff',
                fontWeight: 'bold',
                marginBottom: '4px'
            }
        });
        
        const swipeHint = $('div', {
            text: 'Swipe up: increase time, Swipe down: decrease time',
            css: {
                fontSize: '12px',
                color: '#666'
            }
        });
        
        swipeArea.append(swipeLabel, swipeHint);
        
        // Add swipe functionality
        let startY = 0;
        let startTime = currentTime;
        let isDragging = false;
        
        swipeArea.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            startY = touch.clientY;
            startTime = this.currentLyrics.lines[lineIndex].time;
            isDragging = true;
            swipeArea.style.backgroundColor = '#e3f2fd';
            swipeArea.style.borderColor = '#1976d2';
        });
        
        swipeArea.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            const deltaY = startY - touch.clientY; // Invert: up = positive
            const sensitivity = 25; // milliseconds per pixel
            const timeChange = deltaY * sensitivity;
            const newTime = Math.max(0, startTime + timeChange);
            
            // Update input and line time
            this.currentLyrics.lines[lineIndex].time = newTime;
            
            // Format new time for display using consistent formatting
            const totalSeconds = newTime / 1000;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const milliseconds = Math.floor((totalSeconds % 1) * 1000);
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
            
            input.value = formattedTime;
            
            // Visual feedback
            swipeLabel.textContent = `⏱️ ${formattedTime}`;
        });
        
        swipeArea.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            isDragging = false;
            swipeArea.style.backgroundColor = '#f8f9fa';
            swipeArea.style.borderColor = '#007bff';
            swipeLabel.textContent = '👆 Swipe up/down to adjust';
            
            // Get the current time before validation
            const timeBeforeValidation = this.currentLyrics.lines[lineIndex].time;
            
            // Verify and correct timecode order after swipe gesture completes
            const correctionsMade = this.verifyAndCorrectTimecodeOrder(lineIndex);
            
            // Get the potentially corrected time after validation
            const correctedTime = this.currentLyrics.lines[lineIndex].time;
            
            // Update the input field with the final value (corrected or original)
            const totalSeconds = correctedTime / 1000;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const milliseconds = Math.floor((totalSeconds % 1) * 1000);
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
            
            input.value = formattedTime;
            
            // Show visual feedback if corrections were made
            if (correctionsMade > 0) {
                swipeLabel.textContent = `✅ ${formattedTime} (corrected)`;
                swipeLabel.style.color = '#28a745'; // Green for corrections
                
                // Show brief notification about corrections
                setTimeout(() => {
                    swipeLabel.textContent = `⏱️ ${formattedTime}`;
                    swipeLabel.style.color = '#007bff'; // Back to blue
                }, 2000);
            } else {
                swipeLabel.textContent = `⏱️ ${formattedTime}`;
            }
            
            // Update startTime to the final corrected value for subsequent swipes
            startTime = correctedTime;
        });
        
        // Buttons container
        const buttonsContainer = $('div', {
            css: {
                display: 'flex',
                gap: '12px',
                justifyContent: 'center'
            }
        });
        
        // Cancel button
        const cancelButton = $('button', {
            text: 'Cancel',
            css: {
                padding: '12px 20px',
                fontSize: '16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                minWidth: '80px'
            },
            onClick: () => {
                // Restore original time
                this.currentLyrics.lines[lineIndex].time = currentTime;
                document.body.removeChild(modalOverlay);
            }
        });
        
        // Save button
        const saveButton = $('button', {
            text: 'Save',
            css: {
                padding: '12px 20px',
                fontSize: '16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                minWidth: '80px'
            },
            onClick: () => {
                const newTimeText = input.value.trim();
                let newTime = this.parseTimeInput(newTimeText);
                
                if (newTime !== null) {
                    // Update the time
                    this.currentLyrics.lines[lineIndex].time = newTime;
                    this.currentLyrics.updateLastModified();
                    
                    // Verify and correct timecode order - this is the final validation
                    const correctionsMade = this.verifyAndCorrectTimecodeOrder(lineIndex);
                    
                    // Get the final time after all validations
                    const finalTime = this.currentLyrics.lines[lineIndex].time;
                    
                    // Save to localStorage
                    const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                    if (saveSuccess) {
                        console.log(`✅ Touch-edited timecode for line ${lineIndex + 1} saved successfully`);
                        if (correctionsMade > 0) {
                            console.log(`🔧 ${correctionsMade} additional corrections were applied to maintain timecode order`);
                        }
                    } else {
                        console.error(`❌ Failed to save touch-edited timecode for line ${lineIndex + 1}`);
                    }
                    
                    // Update the original timeSpan with the final time (after all corrections)
                    timeSpan.textContent = this.formatTimeDisplay(finalTime);
                    console.log(`✏️ Touch-updated timecode for line ${lineIndex + 1}: ${this.formatTimeDisplay(finalTime)}`);
                    
                    // If corrections were made, show a brief notification
                    if (correctionsMade > 0) {
                        console.log(`📢 iOS Timecode correction: Line ${lineIndex + 1} and ${correctionsMade} subsequent line(s) were adjusted to maintain order`);
                    }
                } else {
                    console.warn('⚠️ Invalid time format, keeping original value');
                    this.currentLyrics.lines[lineIndex].time = currentTime;
                }
                
                document.body.removeChild(modalOverlay);
            }
        });
        
        // Handle Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveButton.click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelButton.click();
            }
        });
        
        // Assemble modal
        inputContainer.append(inputLabel, input);
        buttonsContainer.append(cancelButton, saveButton);
        modal.append(title, linePreview, inputContainer, swipeArea, buttonsContainer);
        modalOverlay.appendChild(modal);
        
        // Add to document
        document.body.appendChild(modalOverlay);
        
        // Close on overlay click
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                // Restore original time and close
                this.currentLyrics.lines[lineIndex].time = currentTime;
                document.body.removeChild(modalOverlay);
            }
        });
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
        
        // Lock line editing during record mode
        if (this.recordMode) {
            return;
        }
        
        if (!this.currentLyrics) {
            console.log('❌ No currentLyrics in editLineText');
            return;
        }
        
        const currentText = this.currentLyrics.lines[lineIndex].text;
        console.log(`📝 Current text: "${currentText}"`);
        
        // Auto-assign timecode if line has no timecode
        const currentLine = this.currentLyrics.lines[lineIndex];
        if (currentLine.time < 0) {
            // Find the previous line with a timecode
            let previousTimecode = -1;
            for (let i = lineIndex - 1; i >= 0; i--) {
                if (this.currentLyrics.lines[i].time >= 0) {
                    previousTimecode = this.currentLyrics.lines[i].time;
                    break;
                }
            }
            
            if (previousTimecode >= 0) {
                // Assign timecode based on previous line + 1 second (1000ms)
                const newTimecode = previousTimecode + 1000;
                currentLine.time = newTimecode;
                this.currentLyrics.updateLastModified();
                
                // Save to localStorage
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                if (saveSuccess) {
                    console.log(`⏰ Auto-assigned timecode ${this.formatTimeDisplay(newTimecode)} to line ${lineIndex + 1} (previous + 1s)`);
                } else {
                    console.error(`❌ Failed to save auto-assigned timecode for line ${lineIndex + 1}`);
                }
                
                // Trigger timecode verification to ensure chronological order
                if (typeof this.verifyAndCorrectAllTimecodes === 'function') {
                    this.verifyAndCorrectAllTimecodes();
                }
                
                // Refresh display to show the new timecode
                this.renderLyrics();
                
                // Find the text span again after refresh and continue editing
                const refreshedTextSpan = this.findTextSpanForLine(lineIndex);
                if (refreshedTextSpan) {
                    // Continue with editing the refreshed element
                    this.editLineText(lineIndex, refreshedTextSpan);
                    return;
                }
            } else {
                console.log(`⏰ No previous timecode found for line ${lineIndex + 1}, proceeding without auto-assignment`);
            }
        }
        
        // Create container for input and delete button
        const editContainer = document.createElement('div');
        editContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
        `;
        
        // Create input field for editing using DOM directly to ensure value is set
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.style.cssText = `
            font-size: ${this.fontSize}px;
            font-family: inherit;
            padding: 4px 8px;
            border: 2px solid #007bff;
            border-radius: 4px;
            background-color: white;
            color: #333;
            flex: 1;
            box-sizing: border-box;
        `;
        
        // Create delete button
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '🗑️';
        deleteButton.type = 'button'; // Explicitly set button type
        deleteButton.style.cssText = `
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 6px 8px;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            transition: background-color 0.2s;
            flex-shrink: 0;
        `;
        deleteButton.title = 'Delete this line';
        
        // Add hover effect for delete button
        deleteButton.addEventListener('mouseenter', () => {
            deleteButton.style.backgroundColor = '#c82333';
        });
        deleteButton.addEventListener('mouseleave', () => {
            deleteButton.style.backgroundColor = '#dc3545';
        });
        
        editContainer.appendChild(input);
        editContainer.appendChild(deleteButton);
        
        console.log(`📝 Input created with value: "${input.value}"`);
        
        // Replace the text span with edit container temporarily
        textSpan.style.display = 'none';
        textSpan.parentNode.insertBefore(editContainer, textSpan);
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newText = input.value; // Don't trim here to allow spaces-only lines
            
            // Always save if the text is different from original (including empty strings)
            if (newText !== currentText) {
                // Update the text (allow empty lines)
                this.currentLyrics.lines[lineIndex].text = newText;
                this.currentLyrics.updateLastModified();
                
                // Save to localStorage using the same method as the save button
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                if (saveSuccess) {
                    console.log(`✅ Line ${lineIndex + 1} saved to localStorage successfully`);
                } else {
                    console.error(`❌ Failed to save line ${lineIndex + 1} to localStorage`);
                }
                
                textSpan.textContent = newText;
                console.log(`✏️ Updated text for line ${lineIndex + 1}: "${newText}"`);
            }
            
            // Restore the span
            if (editContainer.parentNode) {
                editContainer.parentNode.removeChild(editContainer);
                textSpan.style.display = 'inline';
            }
        };
        
        const cancelEdit = () => {
            // Restore the span without changes
            if (editContainer.parentNode) {
                editContainer.parentNode.removeChild(editContainer);
                textSpan.style.display = 'inline';
            }
            console.log('❌ Text edit cancelled');
        };
        
        const insertNewLine = (atPosition) => {
            const currentText = input.value;
            let beforeText = '';
            let afterText = '';
            
            if (atPosition < currentText.length) {
                // Split the text at cursor position
                beforeText = currentText.substring(0, atPosition);
                afterText = currentText.substring(atPosition);
            } else {
                // Insert at end
                beforeText = currentText;
                afterText = '';
            }
            
            // Update current line with text before cursor
            this.currentLyrics.lines[lineIndex].text = beforeText;
            
            // Create new line with text after cursor
            const newLine = {
                time: -1, // New lines start without timecode
                text: afterText,
                type: 'vocal',
                id: this.currentLyrics.generateLineId()
            };
            
            // Insert the new line after current line
            this.currentLyrics.lines.splice(lineIndex + 1, 0, newLine);
            this.currentLyrics.updateLastModified();
            
            // Save to localStorage
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log(`✅ Line split/inserted at line ${lineIndex + 1} saved successfully`);
            } else {
                console.error(`❌ Failed to save split/inserted line`);
            }
            
            // Refresh the display to show the new line
            this.renderLyrics();
            
            console.log(`📝 Line split: "${beforeText}" | "${afterText}"`);
        };
        
        const deleteLine = () => {
            console.log('🗑️ deleteLine() called for line', lineIndex + 1);
            console.log('🗑️ Total lines before deletion:', this.currentLyrics.lines.length);
            
            if (this.currentLyrics.lines.length <= 1) {
                console.warn('⚠️ Cannot delete the last remaining line');
                return;
            }
            
            // Remove the line from lyrics
            this.currentLyrics.lines.splice(lineIndex, 1);
            this.currentLyrics.updateLastModified();
            
            console.log('🗑️ Total lines after deletion:', this.currentLyrics.lines.length);
            
            // Save to localStorage
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log(`✅ Line ${lineIndex + 1} deleted and saved successfully`);
            } else {
                console.error(`❌ Failed to save after deleting line ${lineIndex + 1}`);
            }
            
            // Refresh the display
            console.log('🗑️ Refreshing display after deletion');
            this.renderLyrics();
            
            console.log(`🗑️ Deleted line ${lineIndex + 1}`);
        };
        
        // Delete button click handler
        deleteButton.addEventListener('click', (e) => {
            console.log('🗑️ Delete button clicked for line', lineIndex + 1);
            e.preventDefault();
            e.stopPropagation();
            
            // Clean up edit interface first
            if (editContainer.parentNode) {
                editContainer.parentNode.removeChild(editContainer);
                textSpan.style.display = 'inline';
                console.log('🗑️ Edit interface cleaned up');
            }
            
            // Then delete the line
            console.log('🗑️ Calling deleteLine()');
            deleteLine();
        });
        
        // Save on Enter (with split behavior), cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cursorPosition = input.selectionStart;
                
                // Restore span first to clean up UI
                if (editContainer.parentNode) {
                    editContainer.parentNode.removeChild(editContainer);
                    textSpan.style.display = 'inline';
                }
                
                // Then handle the line split/insert
                insertNewLine(cursorPosition);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        
        // Save when losing focus (but delay to allow delete button click)
        let isDeleting = false;
        deleteButton.addEventListener('mousedown', () => {
            isDeleting = true;
        });
        
        input.addEventListener('blur', (e) => {
            // Small delay to allow delete button click to register first
            setTimeout(() => {
                // Only save if we're not in the middle of deleting
                if (!isDeleting && editContainer.parentNode) {
                    saveEdit();
                }
                isDeleting = false; // Reset flag
            }, 150);
        });
    }
    
    // Edit metadata field (title or artist) via double-click
    editMetadataField(displayElement, fieldName, currentValue) {
        console.log(`🖱️ editMetadataField called for ${fieldName}: "${currentValue}"`);
        
        if (!this.currentLyrics) {
            console.log('❌ No currentLyrics in editMetadataField');
            return;
        }
        
        // Create input field for editing using DOM directly
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.style.cssText = `
            font-size: ${displayElement.style.fontSize || '1.3em'};
            font-family: inherit;
            font-weight: ${displayElement.style.fontWeight || 'normal'};
            color: ${displayElement.style.color || '#333'};
            padding: 4px 8px;
            border: 2px solid #007bff;
            border-radius: 4px;
            background-color: white;
            width: 100%;
            box-sizing: border-box;
            margin: ${displayElement.style.margin || '0'};
        `;
        
        console.log(`📝 Input created with value: "${input.value}"`);
        
        // Replace the display element with input temporarily
        displayElement.style.display = 'none';
        displayElement.parentNode.insertBefore(input, displayElement);
        input.focus();
        input.select();
        
        const saveEdit = () => {
            const newValue = input.value.trim();
            
            // Always save if the value is different from original
            if (newValue !== currentValue) {
                // Update the metadata
                this.currentLyrics.metadata[fieldName] = newValue;
                this.currentLyrics.updateLastModified();
                
                // Save to localStorage using StorageManager
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                if (saveSuccess) {
                    console.log(`✅ ${fieldName} saved to localStorage successfully: "${newValue}"`);
                } else {
                    console.error(`❌ Failed to save ${fieldName} to localStorage`);
                }
                
                // Update the display element text
                if (fieldName === 'artist') {
                    displayElement.textContent = `by ${newValue}`;
                } else {
                    displayElement.textContent = newValue;
                }
                
                console.log(`✏️ Updated ${fieldName}: "${newValue}"`);
            }
            
            // Restore the display element
            if (input.parentNode) {
                input.parentNode.removeChild(input);
                displayElement.style.display = '';
            }
        };
        
        const cancelEdit = () => {
            // Restore the display element without changes
            if (input.parentNode) {
                input.parentNode.removeChild(input);
                displayElement.style.display = '';
            }
            console.log(`❌ ${fieldName} edit cancelled`);
        };
        
        // Enter to save
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
        input.addEventListener('blur', () => {
            saveEdit();
        });
    }

    // Record current timecode
    recordCurrentTimecode() {
        if (!this.currentLyrics) return;
        
        // Get current time from timecode display (works with both audio controller and AUv3 host)
        let currentTime = 0;
        const timecodeElement = document.getElementById('timecode-display');
        if (timecodeElement) {
            const text = timecodeElement.textContent.replace('s', '').replace('🔴', '').trim();
            const seconds = parseFloat(text);
            if (isFinite(seconds)) {
                currentTime = Math.round(seconds * 1000); // Convert to ms
            }
        }
        
        // Fallback to audio controller if timecode display is not available
        if (currentTime === 0 && this.audioController) {
            currentTime = this.audioController.getCurrentTime() * 1000; // Convert to ms
        }
        
        const nextLineIndex = this.findNextUntimedLine();
        
        if (nextLineIndex >= 0) {
            this.currentLyrics.lines[nextLineIndex].time = currentTime;
            this.currentLyrics.updateLastModified();
            
            // Verify and correct timecode order after recording
            this.verifyAndCorrectTimecodeOrder(nextLineIndex);
            
            // Save to localStorage using the same method as the save button
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log(`✅ Recorded timecode for line ${nextLineIndex + 1} saved to localStorage successfully`);
            } else {
                console.error(`❌ Failed to save recorded timecode for line ${nextLineIndex + 1} to localStorage`);
            }
            
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
        if (!this.currentLyrics) return;
        
        // Get current time from timecode display (works with both audio controller and AUv3 host)
        let currentTime = 0;
        const timecodeElement = document.getElementById('timecode-display');
        if (timecodeElement) {
            const text = timecodeElement.textContent.replace('s', '').replace('🔴', '').trim();
            const seconds = parseFloat(text);
            if (isFinite(seconds)) {
                currentTime = Math.round(seconds * 1000); // Convert to ms
            }
        }
        
        // Fallback to audio controller if timecode display is not available
        if (currentTime === 0 && this.audioController) {
            currentTime = this.audioController.getCurrentTime() * 1000; // Convert to ms
        }
        
        this.currentLyrics.lines[lineIndex].time = currentTime;
        this.currentLyrics.updateLastModified();
        
        // Verify and correct timecode order after setting time
        this.verifyAndCorrectTimecodeOrder(lineIndex);
        
        // Save to localStorage using the same method as the save button
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
        if (saveSuccess) {
            console.log(`✅ Set timecode for line ${lineIndex + 1} saved to localStorage successfully`);
        } else {
            console.error(`❌ Failed to save set timecode for line ${lineIndex + 1} to localStorage`);
        }
        
        this.renderLyrics();
        console.log(`⏰ Set time ${this.formatTimeDisplay(currentTime)} for line ${lineIndex + 1}`);
    }
    
    // Clear time for specific line
    clearLineTime(lineIndex) {
        if (!this.currentLyrics) return;
        
        this.currentLyrics.clearLineTimecode(lineIndex);
        
        // Save to localStorage using the same method as the save button
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
        if (saveSuccess) {
            console.log(`✅ Cleared timecode for line ${lineIndex + 1} saved to localStorage successfully`);
        } else {
            console.error(`❌ Failed to save cleared timecode for line ${lineIndex + 1} to localStorage`);
        }
        
        this.renderLyrics();
    }
    
    // Clear all timecodes
    clearAllTimecodes() {
        if (!this.currentLyrics) return;
        
        if (confirm('Clear all timecodes? This cannot be undone.')) {
            this.currentLyrics.clearAllTimecodes();
            
            // Save to localStorage using the same method as the save button
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log('✅ Cleared all timecodes saved to localStorage successfully');
            } else {
                console.error('❌ Failed to save cleared timecodes to localStorage');
            }
            
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
            
            // Save to localStorage using the same method as the save button
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log('✅ New line saved to localStorage successfully');
            } else {
                console.error('❌ Failed to save new line to localStorage');
            }
            
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
        const timecodeElement = document.getElementById('timecode-display');
        if (timecodeElement) {
            const seconds = (timeMs / 1000).toFixed(3);
            const recordIndicator = this.recordMode ? ' 🔴' : '';
            timecodeElement.textContent = `${seconds}s${recordIndicator}`; // Removed play/pause icons
            // Ne plus modifier la couleur de fond pour garder le style du thème
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

    // Verify and correct timecode order to ensure they are always incremental
    verifyAndCorrectTimecodeOrder(modifiedLineIndex) {
        if (!this.currentLyrics || !this.currentLyrics.lines) {
            return 0;
        }

        const lines = this.currentLyrics.lines;
        let correctionsMade = 0;
        let correctionLog = [];
        const minimumIncrement = 100; // milliseconds

        console.log(`🔍 Verifying timecode order after modifying line ${modifiedLineIndex + 1}...`);

        // Start from the modified line and check forward - with cascading corrections
        let hasMoreCorrections = true;
        let iterations = 0;
        const maxIterations = lines.length; // Prevent infinite loops
        
        while (hasMoreCorrections && iterations < maxIterations) {
            hasMoreCorrections = false;
            iterations++;
            
            for (let i = modifiedLineIndex; i < lines.length - 1; i++) {
                const currentLine = lines[i];
                const nextLine = lines[i + 1];

                // Skip lines without timecodes
                if (currentLine.time < 0 || nextLine.time < 0) {
                    continue;
                }

                // If next line's timecode is not greater than current line's timecode
                if (nextLine.time <= currentLine.time) {
                    const newTimecode = currentLine.time + minimumIncrement;
                    
                    correctionLog.push({
                        lineIndex: i + 1,
                        oldTimecode: nextLine.time,
                        newTimecode: newTimecode,
                        iteration: iterations,
                        reason: `Line ${i + 2} timecode (${this.formatTimeDisplay(nextLine.time)}) was not greater than line ${i + 1} timecode (${this.formatTimeDisplay(currentLine.time)})`
                    });

                    nextLine.time = newTimecode;
                    correctionsMade++;
                    hasMoreCorrections = true; // Continue checking for cascading effects
                }
            }
        }

        // Log corrections if any were made
        if (correctionsMade > 0) {
            console.log(`⚡ Made ${correctionsMade} timecode corrections in ${iterations} iteration(s):`);
            correctionLog.forEach(correction => {
                console.log(`  📝 Iter ${correction.iteration} - Line ${correction.lineIndex + 1}: ${this.formatTimeDisplay(correction.oldTimecode)} → ${this.formatTimeDisplay(correction.newTimecode)}`);
                console.log(`     Reason: ${correction.reason}`);
            });

            // Update last modified and save to localStorage
            this.currentLyrics.updateLastModified();
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log(`✅ Corrected timecodes saved to localStorage successfully`);
            } else {
                console.error(`❌ Failed to save corrected timecodes to localStorage`);
            }

            // Re-render lyrics to show the corrections
            if (this.showTimecodes) {
                this.renderLyrics();
            }
            
            // Update any visible timecode displays in the DOM
            this.updateVisibleTimecodeDisplays();
        } else {
            console.log(`✅ Timecode order verification complete - no corrections needed`);
        }

        return correctionsMade;
    }

    // Verify and correct all timecodes in the song (used for imports or bulk operations)
    verifyAndCorrectAllTimecodes() {
        if (!this.currentLyrics || !this.currentLyrics.lines) {
            return;
        }

        const lines = this.currentLyrics.lines;
        let correctionsMade = 0;
        let correctionLog = [];

        console.log(`🔍 Verifying all timecode order for entire song...`);

        // Check all lines with timecodes
        for (let i = 0; i < lines.length - 1; i++) {
            const currentLine = lines[i];
            const nextLine = lines[i + 1];

            // Skip lines without timecodes
            if (currentLine.time < 0 || nextLine.time < 0) {
                continue;
            }

            // If next line's timecode is not greater than current line's timecode
            if (nextLine.time <= currentLine.time) {
                // Calculate a minimum increment (100ms default)
                const minimumIncrement = 100;
                const newTimecode = currentLine.time + minimumIncrement;
                
                correctionLog.push({
                    lineIndex: i + 1,
                    oldTimecode: nextLine.time,
                    newTimecode: newTimecode,
                    reason: `Line ${i + 2} timecode (${this.formatTimeDisplay(nextLine.time)}) was not greater than line ${i + 1} timecode (${this.formatTimeDisplay(currentLine.time)})`
                });

                nextLine.time = newTimecode;
                correctionsMade++;
            }
        }

        // Log corrections if any were made
        if (correctionsMade > 0) {
            console.log(`⚡ Made ${correctionsMade} timecode corrections for entire song:`);
            correctionLog.forEach(correction => {
                console.log(`  📝 Line ${correction.lineIndex + 1}: ${this.formatTimeDisplay(correction.oldTimecode)} → ${this.formatTimeDisplay(correction.newTimecode)}`);
                console.log(`     Reason: ${correction.reason}`);
            });

            // Update last modified and save to localStorage
            this.currentLyrics.updateLastModified();
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
            if (saveSuccess) {
                console.log(`✅ All corrected timecodes saved to localStorage successfully`);
            } else {
                console.error(`❌ Failed to save all corrected timecodes to localStorage`);
            }

            // Re-render lyrics to show the corrections
            if (this.showTimecodes) {
                this.renderLyrics();
            }
        } else {
            console.log(`✅ All timecode order verification complete - no corrections needed`);
        }

        return correctionsMade;
    }

    // Helper function to find the text span element for a specific line after display refresh
    findTextSpanForLine(lineIndex) {
        try {
            // Find the line element by its data attribute
            const lineElement = document.querySelector(`[data-line-index="${lineIndex}"]`);
            if (!lineElement) {
                console.warn(`⚠️ Could not find line element for index ${lineIndex}`);
                return null;
            }

            // Find the line content div (the flex container)
            const lineContent = lineElement.querySelector('.lyrics-line > div');
            if (!lineContent) {
                console.warn(`⚠️ Could not find line content within line ${lineIndex}`);
                return null;
            }

            // Find all spans in the line content
            const spans = lineContent.querySelectorAll('span');
            
            // The text span is usually the last span (after timecode span if it exists)
            // Or we can find it by checking which span doesn't have the timecode-span class
            for (const span of spans) {
                if (!span.classList.contains('timecode-span')) {
                    return span;
                }
            }

            // Fallback: return the last span if no non-timecode span found
            if (spans.length > 0) {
                return spans[spans.length - 1];
            }

            console.warn(`⚠️ Could not find text span within line ${lineIndex}`);
            return null;
        } catch (error) {
            console.error(`❌ Error finding text span for line ${lineIndex}:`, error);
            return null;
        }
    }

    // Update any visible timecode displays in the DOM after corrections
    updateVisibleTimecodeDisplays() {
        if (!this.currentLyrics || !this.currentLyrics.lines) {
            return;
        }

        try {
            // Find all visible timecode spans in the lyrics display
            const lyricsContainer = document.getElementById('lyrics-container');
            if (!lyricsContainer) {
                console.warn('⚠️ Lyrics container not found for timecode display update');
                return;
            }

            // Update all timecode spans
            const timecodeSpans = lyricsContainer.querySelectorAll('[data-line-index]');
            timecodeSpans.forEach(span => {
                const lineIndex = parseInt(span.getAttribute('data-line-index'));
                if (!isNaN(lineIndex) && this.currentLyrics.lines[lineIndex]) {
                    const line = this.currentLyrics.lines[lineIndex];
                    if (line.time >= 0) {
                        // Check if this is a timecode span (has timecode-like content)
                        if (span.textContent && span.textContent.match(/^\s*\[.*\]\s*$/)) {
                            span.textContent = this.formatTimeDisplay(line.time);
                            console.log(`🔄 Updated visible timecode display for line ${lineIndex + 1}: ${this.formatTimeDisplay(line.time)}`);
                        }
                    }
                }
            });
        } catch (error) {
            console.error('❌ Error updating visible timecode displays:', error);
        }
    }
}
