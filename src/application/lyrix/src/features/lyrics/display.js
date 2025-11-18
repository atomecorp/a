// LyricsDisplay class for Lyrix application
import { CONSTANTS } from '../../core/constants.js';
import { StorageManager } from '../../services/storage.js';
import { UIManager } from '../../components/ui.js';
import { default_theme } from '../../components/style.js';

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
                // Unified normal mode background
                backgroundColor: 'rgb(37, 48, 64)',
                // Harmonized light blue text color replacing green
                color: '#8fbde8'
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
        this.lastManualSelection = 0; // Track manual selections in AUv3 mode
        this.lastHostTime = -1; // Track host time changes to detect playback
        this.lastHostTimeUpdate = 0; // Track when host time last changed
        this.hostTimecodeActive = false; // Track if host is actively sending timecode
        this.lastLocalAudioUpdate = 0; // Track local audio updates

        this.init();
    }

    // Initialize display
    init() {
        this.createDisplayElements();
        this.setupEventListeners();
        // Apply stored font size immediately
        this.applyGlobalFontSize && this.applyGlobalFontSize();
    }

    // Create display elements using Squirrel syntax
    createDisplayElements() {
        // ===== CREATE MAIN DISPLAY STRUCTURE (AUCUN SCROLL SUR BODY OU VIEW) =====
        // Create the main display container - FIXED to prevent any external scroll
        const notch = typeof window.__HAS_NOTCH__ !== 'undefined' ? window.__HAS_NOTCH__ : false;
        const basePrimary = UIManager.THEME.colors.primary;
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
                // If notch, paint container black so the safe-area padding zone is pure black; inner elements keep their own bg
                backgroundColor: notch ? '#000' : basePrimary,
                overflow: 'hidden',
                zIndex: '50',
                // Leave room for notch instead of hiding under it
                paddingTop: notch ? 'env(safe-area-inset-top)' : '0'
            }
        });

        // Provide a reusable updater (Swift calls it after injecting __HAS_NOTCH__ if needed)
        window.updateSafeAreaLayout = () => {
            try {
                const hasNotch = !!window.__HAS_NOTCH__;
                const dc = document.getElementById('display-container');

                if (dc) {
                    dc.style.paddingTop = hasNotch ? 'env(safe-area-inset-top)' : '0';
                    dc.style.backgroundColor = hasNotch ? '#000' : basePrimary;
                }
            } catch (e) { /* silent */ }
        };
        // Re-run after a short delay in case flag arrives slightly later
        setTimeout(window.updateSafeAreaLayout, 50);
        setTimeout(window.updateSafeAreaLayout, 300);

        // Create toolbar - SOLIDAIRE et FIXE en haut (ne scroll jamais)
        // Force toolbar at absolute top for all environments
        const toolbarTop = '0px';
        this.toolbar = $('div', {
            id: 'lyrics-toolbar',
            css: {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'rgb(37, 48, 64)',
                flexShrink: 0,
                zIndex: '100',
                height: '0px',
                top: toolbarTop
            }
        });

        // Create lyrics content area - ONLY zone allowed to scroll
        this.lyricsContent = $('div', {
            id: 'lyrics_content_area',
            css: {
                flex: '1', // Takes all remaining space after toolbar
                padding: UIManager.THEME.spacing.xl,
                // Unified dark blue background in normal mode
                backgroundColor: 'rgb(37, 48, 64)',
                color: this.originalStyles.normal.color,
                overflow: 'auto', // SEULE zone qui peut scroller
                height: '0', // Forces flex to calculate available height
                fontSize: `${this.fontSize}px`,

                lineHeight: '1.6',
                fontFamily: 'Arial, sans-serif'
            }
        });

        // Assemble the structure: toolbar solidaire + content scrollable
        this.displayContainer.append(this.toolbar, this.lyricsContent);

        // Helper to create SVG icon button
        const makeSvgButton = (id, svgFile, onClick, extraCss = {}) => {
            const btn = UIManager.createInterfaceButton('', { id, onClick, css: { padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', ...extraCss } });
            const img = document.createElement('img');
            img.src = `assets/images/icons/${svgFile}`;
            img.alt = id;
            img.style.width = '18px';
            img.style.height = '18px';
            img.style.pointerEvents = 'none';
            btn.innerHTML = '';
            btn.appendChild(img);
            return btn;
        };

        // Edit mode button (SVG)
        this.editButton = makeSvgButton('edit_mode', 'edit.svg', () => this.toggleEditMode());

        // Record mode button (SVG)
        this.recordButton = makeSvgButton('record_mode', 'record.svg', () => this.toggleRecordMode(), { backgroundColor: this.recordMode ? default_theme.recordModeActiveColor : default_theme.button.backgroundColor });
        // Mark custom active background (persistent red)
        this.recordButton.dataset.customActiveBg = default_theme.recordModeActiveColor || '#f44336';

        // Fullscreen button (SVG)
        this.fullscreenButton = makeSvgButton('fullscreen_mode', 'fullscreen.svg', () => this.toggleFullscreen());

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

        // Song navigation buttons (SVG)
        this.previousSongButton = makeSvgButton('previous_song', 'previous.svg', () => {
            if (window.navigateToPreviousSong) { window.navigateToPreviousSong(); }
        });
        this.previousSongButton.title = 'Previous Song';
        this.nextSongButton = makeSvgButton('next_song', 'next.svg', () => {
            if (window.navigateToNextSong) { window.navigateToNextSong(); }
        });
        this.nextSongButton.title = 'Next Song';

        // font-size-controls-container removed. Use a simple in-memory fragment instead.
        this.fontSizeContainer = document.createDocumentFragment();

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
                // backgroundColor: this.originalStyles.buttons.save,
                display: 'none' // Initially hidden
            }
        });

        // function activate_Edition() {
        //      this.originalLinesBackup = null; // Discard changes
        //         this.toggleEditMode(); // Exit edit mode without saving  
        // }

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
                display: 'none', // Always visible
                //     gap: '6px',
                //     alignItems: 'center',
                //     flexWrap: 'wrap',
                //     padding: '6px 8px', // Slightly reduced height
                //     backgroundColor: UIManager.THEME.colors.surfaceAlt, // unified toolbar background
                //     transition: 'all 0.3s ease' // Smooth transition for show/hide
            }
        });

        // Add all main toolbar elements in the requested order
        const mainToolElements = [];

        // 1. Settings button (from nonAudioTools)
        if (this.nonAudioTools && this.nonAudioTools.length > 0) {
            const settingsButton = this.nonAudioTools.find(tool => tool.id === 'settings_button');
            if (settingsButton) mainToolElements.push(settingsButton);
        }

        // 2. Song list button (from nonAudioTools)  
        if (this.nonAudioTools && this.nonAudioTools.length > 0) {
            const songListButton = this.nonAudioTools.find(tool => tool.id === 'song_list_button');
            if (songListButton) mainToolElements.push(songListButton);
        }

        // 3. Previous song button
        mainToolElements.push(this.previousSongButton);

        // 4. Next song button
        mainToolElements.push(this.nextSongButton);

        // 5. Record button
        mainToolElements.push(this.recordButton);

        // 6-7. Audio buttons (stop, play) - these come from audioButtons array
        if (this.audioButtons && this.audioButtons.length > 0) {
            mainToolElements.push(...this.audioButtons);
        }

        // 8. Timecode display
        if (this.timecodeDisplay) {
            mainToolElements.push(this.timecodeDisplay);
        }

        // 9. Fullscreen button
        mainToolElements.push(this.fullscreenButton);

        // 10. Edit button (most to the right, followed only by edit mode buttons)
        mainToolElements.push(this.editButton);

        // Add any remaining nonAudioTools that weren't specifically positioned
        if (this.nonAudioTools && this.nonAudioTools.length > 0) {
            this.nonAudioTools.forEach(tool => {
                if (tool.id !== 'settings_button' && tool.id !== 'song_list_button') {
                    mainToolElements.push(tool);
                }
            });
        }

        // Add edit mode buttons (save and cancel) - these should be at the very end
        mainToolElements.push(this.saveChangesButton, this.cancelEditButton);

        // Force-hide every button/icon in the top toolbar per request
        mainToolElements.forEach((element) => {
            if (element && element.style) {
                element.style.display = 'none';
            }
        });

        mainToolRow.append(...mainToolElements);

        // Debug: Check if audio buttons are actually in the toolbar after appending
        setTimeout(() => {
            const buttonsInToolbar = mainToolRow.querySelectorAll('button');

        }, 100);

        // Create audio tools row (visibility depends on audio player setting AND experimental setting)
        // Always show audio tools if audio player enabled (experimental flag removed)
        let isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled');
        if (isAudioPlayerEnabled === null) {
            // Default first launch: enable
            localStorage.setItem('lyrix_audio_player_enabled', 'true');
            isAudioPlayerEnabled = 'true';
        }
        const shouldShowAudioTools = isAudioPlayerEnabled === 'true';

        const audioToolRow = $('div', {
            id: 'audio-tools-row',
            css: {
                display: shouldShowAudioTools ? 'block' : 'none', // Visible only if both audio and experimental are enabled
                flexDirection: 'column',
                gap: '2px',
                width: '100%',
                padding: '4px 6px 6px 6px', // Compact
                backgroundColor: UIManager.THEME.colors.surfaceAlt // unified background with toolbar
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
        this.toolbar.append(mainToolRow, audioToolRow);

        // Store references to toolbar rows for dynamic visibility
        this.mainToolRow = mainToolRow;
        this.audioToolRow = audioToolRow;

        // Update lyrics content positioning based on audio tools visibility
        this.updateLyricsContentPosition();

        // ===== PREVENT ALL SCROLL ON BODY (lyrix_app removed) =====
        // Prevent scroll on body
        document.body.style.overflow = 'hidden';
        document.body.style.height = '100vh';
        document.body.style.margin = '0';
        document.body.style.padding = '0';

        // (Former lyrix_app container removal: no extra handling needed)

        // Add display container directly to body for total control
        document.body.append(this.displayContainer);

        // Initial layout update
        setTimeout(() => {
            this.updateContentAreaHeight();
        }, 100); // Small delay to ensure settings panel is rendered

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

        // Listen for window resize and settings panel resize
        this.resizeHandler = () => {
            this.updateContentAreaHeight();
        };
        window.addEventListener('resize', this.resizeHandler);

        // Global keyboard shortcuts - work anywhere in the document
        this.keyboardHandler = (e) => {
            this.handleKeyboard(e);
        };
        document.addEventListener('keydown', this.keyboardHandler);

        // Note: timeupdate listener is handled in index.js to avoid double calls
    }

    // Update the height of lyrics content area when layout changes
    updateContentAreaHeight() {
        const displayContainer = this.displayContainer;
        if (!displayContainer) return;

        // Check if settings panel exists and calculate its total height
        const settingsPanel = document.getElementById('lyrix_settings_panel');
        const settingsGrip = document.getElementById('settings-resize-grip');

        let settingsHeight = 0;
        if (settingsPanel) {
            settingsHeight += settingsPanel.offsetHeight;
        }
        if (settingsGrip) {
            settingsHeight += settingsGrip.offsetHeight;
        }

        // Update display container height to account for settings panel
        const availableHeight = window.innerHeight - settingsHeight;
        displayContainer.style.height = `${Math.max(300, availableHeight)}px`;

        // Also update the position if settings panel is above
        if (settingsPanel && settingsPanel.offsetTop === 0) {
            displayContainer.style.top = `${settingsHeight}px`;
        } else {
            displayContainer.style.top = '52px';
        }

        // console.log('🔄 Updated display container height:', availableHeight, 'px, settings height:', settingsHeight, 'px');
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

            // Legacy audio-controls-container removed; buttons handled directly

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

            // No volume slider needed anymore
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
                    tool.style.background = 'transparent';
                    tool.style.border = 'none';
                    tool.style.outline = 'none';
                    tool.style.boxShadow = 'none';
                    // Force child range input track color & remove borders
                    const range = tool.querySelector('input[type="range"]');
                    if (range) {
                        range.style.background = 'rgb(48, 60, 78)';
                        range.style.border = 'none';
                        range.style.height = '6px';
                        range.style.borderRadius = '4px';
                        range.style.outline = 'none';
                        range.style.boxShadow = 'none';
                        // Inject a style tag once for pseudo-element coloring if not already
                        if (!document.getElementById('scrub-slider-style')) {
                            const styleTag = document.createElement('style');
                            styleTag.id = 'scrub-slider-style';
                            styleTag.textContent = `#audio-scrub-slider-container input[type="range"]::-webkit-slider-runnable-track{background:rgb(48,60,78);border:none;}\n#audio-scrub-slider-container input[type="range"]::-moz-range-track{background:rgb(48,60,78);border:none;}\n#audio-scrub-slider-container input[type="range"]{background:rgb(48,60,78);}`;
                            document.head.appendChild(styleTag);
                        }
                    }
                    // Ensure an id in case missing
                    if (!tool.id) tool.id = 'audio-scrub-slider-container';
                    // Observer fallback if slider created later inside container
                    if (!tool.__scrubObserver) {
                        const observer = new MutationObserver(muts => {
                            muts.forEach(m => {
                                m.addedNodes.forEach(n => {
                                    if (n.nodeType === 1) {
                                        const r = n.matches && n.matches('input[type="range"]') ? n : n.querySelector && n.querySelector('input[type="range"]');
                                        if (r) {
                                            r.style.background = 'rgb(48, 60, 78)';
                                            r.style.border = 'none';
                                            r.style.height = '6px';
                                            r.style.borderRadius = '4px';
                                            r.style.outline = 'none';
                                            r.style.boxShadow = 'none';
                                        }
                                    }
                                });
                            });
                        });
                        observer.observe(tool, { childList: true, subtree: true });
                        tool.__scrubObserver = observer;
                    }
                }

                if (tool.id === 'audio-player-title') {
                    tool.style.fontSize = '12px';
                    tool.style.margin = '0 5px';
                }

                // (audio-controls-container removed)

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
                    // Note: height and width already come from default_theme.button in createEnhancedTimecodeDisplay
                }


            }
        });
    }

    // Update lyrics content area position based on audio tools visibility
    updateLyricsContentPosition() {
        if (!this.audioToolRow) return;

        // Show/hide audio tools row - only if toolbar is visible and audio is enabled
        // if (this.toolbarVisible) {
        //     const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
        //     // if (isAudioPlayerEnabled && this.audioTools.length > 0) {
        //     //     this.audioToolRow.style.display = 'flex';
        //     // } else {
        //     //     this.audioToolRow.style.display = 'none';
        //     // }
        // } else {
        //     // Always hide if toolbar is hidden
        //     // this.audioToolRow.style.display = 'none';
        // }

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

        // Update content area height after rendering
        setTimeout(() => {
            this.updateContentAreaHeight();
        }, 10);

        // If we're in edit mode, update the edit fields with new song data
        if (this.editMode) {
            this.updateEditFields();
        }

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
                }
            } else if (hasCurrentAudio) {
            } else {
            }
        }
    }

    // Update edit fields with current song data (when changing songs in edit mode)
    updateEditFields() {
        if (!this.currentLyrics || !this.editMode) {
            return;
        }

        // Update title input
        const titleInput = document.getElementById('edit_title_input');
        if (titleInput) {
            titleInput.value = this.currentLyrics.metadata.title || '';
            console.log('🔄 Updated title input:', titleInput.value);
        }

        // Update artist input
        const artistInput = document.getElementById('edit_artist_input');
        if (artistInput) {
            artistInput.value = this.currentLyrics.metadata.artist || '';
            console.log('🔄 Updated artist input:', artistInput.value);
        }

        // Update time offset input if it exists
        const offsetInput = document.getElementById('time-offset-input');
        if (offsetInput) {
            // Ensure metadata has timeOffset
            if (!this.currentLyrics.metadata.timeOffset) {
                this.currentLyrics.metadata.timeOffset = 0;
            }
            offsetInput.value = (this.currentLyrics.metadata.timeOffset / 1000).toFixed(2);
            console.log('🔄 Updated offset input:', offsetInput.value);
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
        // If in edit mode create centered wrapper
        let editWrapper = null;
        if (this.editMode) {
            editWrapper = document.createElement('div');
            editWrapper.id = 'edit_mode_center_wrapper';
            // Full width, left aligned wrapper replacing previous centered max-width constraint (removed gap to eliminate visual offset)
            editWrapper.style.cssText = 'width:100%;margin:0;display:flex;flex-direction:column;box-sizing:border-box;';
            this.lyricsContent.appendChild(editWrapper);
            // Remove any left padding of the scroll area so wrapper is flush left
            if (this.lyricsContent && this.lyricsContent.style) {
                this._originalPaddingLeft = this._originalPaddingLeft || this.lyricsContent.style.paddingLeft;
                this.lyricsContent.style.paddingLeft = '0';
            }
        } else if (this._originalPaddingLeft !== undefined) {
            // Restore original padding when exiting edit mode
            this.lyricsContent.style.paddingLeft = this._originalPaddingLeft;
        }
        // Add song metadata (with responsive width if edit mode)
        const metadata = $('div', {
            id: 'lyrics-metadata-container',
            css: {
                margin: this.editMode ? '0 0 10px 0' : '0 0 20px 0',
                padding: '15px 20px',
                backgroundColor: 'rgb(48, 60, 78)',
                borderRadius: '8px',
                width: '100%',
                boxSizing: 'border-box',
                // Block selection entirely in view mode (editMode false)
                userSelect: this.editMode ? 'text' : 'none',
                WebkitUserSelect: this.editMode ? 'text' : 'none'
            }
        });
        if (!this.editMode) {
            // Prevent long-press selection / context
            ['selectstart', 'contextmenu'].forEach(ev => metadata.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
        }

        let title;
        if (this.editMode) {
            // Create container for title and time offset control
            const titleContainer = $('div', { id: 'title-offset-container', css: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '10px', margin: '0 0 10px 0' } });

            title = $('input', {
                id: 'edit_title_input',
                type: 'text',
                value: this.currentLyrics.metadata.title || '',
                css: {
                    color: '#ffffff',
                    // Fixed pixel font size increased for readability
                    fontSize: '24px',
                    fontWeight: '600',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'rgb(48, 60, 78)',
                    flex: '1', width: '100%', boxSizing: 'border-box', overflow: 'hidden'
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

            // Create time offset control
            const offsetContainer = $('div', { id: 'time-offset-container', css: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: 'rgb(48, 60, 78)', border: 'none', borderRadius: '4px', minWidth: '160px', width: '100%', boxSizing: 'border-box' } });

            const offsetLabel = $('span', {
                text: 'time offset:',
                css: {
                    fontSize: '24px',
                    color: '#ffffff',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                    lineHeight: '1',
                    userSelect: 'none',
                    webkitUserSelect: 'none',
                    mozUserSelect: 'none',
                    msUserSelect: 'none',
                    webkitTouchCallout: 'none'
                }
            });

            // Get stored offset value for this song or default to 0
            // Ensure metadata exists and has timeOffset property - FORCE INIT
            if (!this.currentLyrics.metadata) {
                this.currentLyrics.metadata = {};
                console.log('🔧 Created empty metadata object');
            }
            if (this.currentLyrics.metadata.timeOffset === undefined ||
                this.currentLyrics.metadata.timeOffset === null ||
                isNaN(this.currentLyrics.metadata.timeOffset)) {
                this.currentLyrics.metadata.timeOffset = 0;
                console.log('🔧 Set timeOffset to 0');
            }
            let storedOffset = this.currentLyrics.metadata.timeOffset;

            // DEBUG: Log all metadata to see what's actually stored
            console.log('🔍 Full metadata at render:', JSON.stringify(this.currentLyrics.metadata, null, 2));
            console.log('🔍 Song ID:', this.currentLyrics.songId);

            // Try to reload from storage if offset is 0 (maybe metadata wasn't loaded properly)
            if (storedOffset === 0 && this.currentLyrics.songId) {
                const reloadedSong = StorageManager.loadSong(this.currentLyrics.songId);
                if (reloadedSong && reloadedSong.metadata && reloadedSong.metadata.timeOffset !== undefined) {
                    storedOffset = reloadedSong.metadata.timeOffset;
                    this.currentLyrics.metadata.timeOffset = storedOffset;
                    console.log('🔄 Reloaded offset from storage:', storedOffset);
                }
            }

            // Extra safety - force to 0 if still problematic
            if (storedOffset === undefined || storedOffset === null || isNaN(storedOffset)) {
                storedOffset = 0;
                this.currentLyrics.metadata.timeOffset = 0;
                console.log('🔧 EMERGENCY: Forced offset to 0');
            }

            console.log('🎯 Final offset value:', storedOffset, typeof storedOffset);

            const offsetInput = $('input', {
                id: 'time_offset_input',
                type: 'text',
                value: storedOffset.toFixed(2), // Format to 2 decimal places for better display
                css: {
                    width: '90px',
                    minWidth: '90px',
                    maxWidth: '110px',
                    textAlign: 'center',
                    // Increased fixed pixel font size for legibility
                    fontSize: '24px',
                    fontWeight: '400',
                    padding: '2px 6px',
                    border: 'none',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    backgroundColor: 'rgb(48, 60, 78)',
                    color: '#fff'
                }
            });

            // Inject global persistent style once
            if (!document.getElementById('time-offset-style-lock')) {
                const style = document.createElement('style');
                style.id = 'time-offset-style-lock';
                style.textContent = `#time_offset_input,\n#time_offset_input:focus,\n#time_offset_input:active,\n#time_offset_input:focus-visible,\n#time_offset_input:hover {\n  background-color: rgb(48,60,78) !important;\n  color: #fff !important;\n  border: none !important;\n  outline: none !important;\n  box-shadow: none !important;\n  -webkit-box-shadow: none !important;\n  -webkit-appearance: none !important;\n}\n#time_offset_input::-webkit-contacts-auto-fill-button,\n#time_offset_input::-webkit-credentials-auto-fill-button {\n  display:none !important;\n}`;
                document.head.appendChild(style);
            }

            const lockStyles = () => {
                offsetInput.style.backgroundColor = 'rgb(48, 60, 78)';
                offsetInput.style.color = '#fff';
                offsetInput.style.border = 'none';
                offsetInput.style.outline = 'none';
                offsetInput.style.boxShadow = 'none';
                offsetInput.style.webkitAppearance = 'none';
            };
            ['focus', 'blur', 'click', 'dblclick', 'input', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(evt => {
                offsetInput.addEventListener(evt, () => {
                    lockStyles();
                    // Reassert shortly after in case of async UA repaint
                    setTimeout(lockStyles, 0);
                    setTimeout(lockStyles, 30);
                });
            });
            // Initial locks
            lockStyles();
            setTimeout(lockStyles, 0);
            setTimeout(lockStyles, 50);

            // Force the value immediately after creation to be 100% sure
            setTimeout(() => {
                if (offsetInput.value === '' || offsetInput.value === 'undefined' || offsetInput.value === 'null') {
                    offsetInput.value = storedOffset.toFixed(2);
                    console.log('🎯 Force fixed empty input to:', storedOffset.toFixed(2));
                } else {
                    console.log('🎯 Input already has value:', offsetInput.value, '- no need to force fix');
                }
            }, 10);

            // Removed unit span 's' to declutter UI

            // Store current offset value (start with stored value)
            this.currentTimeOffset = storedOffset; // Start with actual stored value
            this.isInputFocused = false;
            this.isDragging = false; // Initialize drag state

            // Add drag functionality to offset input
            this.setupOffsetInputDrag(offsetInput);

            // Add manual input functionality
            offsetInput.addEventListener('input', (e) => {
                if (!this.isDragging) {
                    const value = parseFloat(e.target.value) || 0;
                    // Just update the current offset, don't save yet (save on Enter or blur)
                    this.currentTimeOffset = value;
                    console.log('🎯 Input changed:', value);
                }
            });

            offsetInput.addEventListener('focus', (e) => {
                this.isInputFocused = true;
                // Don't select all text, just place cursor at end
                setTimeout(() => {
                    e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                }, 0);
            });

            offsetInput.addEventListener('blur', (e) => {
                this.isInputFocused = false;
                // Save the current value when losing focus
                const value = parseFloat(e.target.value) || 0;
                this.currentLyrics.metadata.timeOffset = value;
                this.currentTimeOffset = value;

                // Save the song with both methods to ensure persistence
                if (this.lyricsLibrary && this.lyricsLibrary.saveSong) {
                    this.lyricsLibrary.saveSong(this.currentLyrics);
                }

                // Also save directly with StorageManager
                if (this.currentLyrics.songId) {
                    StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                }

                console.log('🎯 Blur event, stored offset:', value, 'in song:', this.currentLyrics.songId);

                // If empty when focus lost, reset to current stored value
                if (e.target.value === '') {
                    e.target.value = value.toFixed(2);
                }
            });

            offsetInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = parseFloat(e.target.value) || 0;

                    // Simply store the value
                    this.currentLyrics.metadata.timeOffset = value;
                    this.currentTimeOffset = value;

                    // Save the song with both methods to ensure persistence
                    if (this.lyricsLibrary && this.lyricsLibrary.saveSong) {
                        this.lyricsLibrary.saveSong(this.currentLyrics);
                    }

                    // Also save directly with StorageManager
                    if (this.currentLyrics.songId) {
                        StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                    }

                    console.log('🎯 Enter pressed, stored offset:', value, 'in song:', this.currentLyrics.songId);
                    e.target.blur(); // Remove focus after saving
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    // Reset to stored value on escape
                    const storedValue = this.currentLyrics.metadata.timeOffset || 0;
                    e.target.value = storedValue.toFixed(2);
                    this.currentTimeOffset = storedValue;
                    e.target.blur();
                }
            });

            offsetContainer.append(offsetLabel, offsetInput);
            titleContainer.append(title, offsetContainer);
            title = titleContainer; // Replace title with container
        } else {
            title = $('h2', {
                id: 'lyrics-title-display',
                text: this.currentLyrics.metadata.title,
                css: {
                    margin: '0 0 5px 0',
                    // Light gray title color instead of previous blue
                    color: '#d9dfe5',
                    fontSize: '1.3em',
                    cursor: 'pointer',
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
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
                    border: 'none',
                    backgroundColor: 'rgb(48, 60, 78)',
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

        // Decide parent container (use edit wrapper when in edit mode to ensure centering)
        const parentForBlocks = (this.editMode && document.getElementById('edit_mode_center_wrapper')) || this.lyricsContent;

        // Append metadata to the correct parent (was directly to lyricsContent before)
        parentForBlocks.appendChild(metadata);

        // Apply metadata visibility setting
        this.updateMetadataVisibility();

        // Add lyrics lines
        const linesContainer = $('div', {
            id: 'lyrics_lines_container',
            css: this.editMode ? {
                marginTop: '20px',
                width: '100%',
                marginLeft: '0',
                marginRight: '0',
                boxSizing: 'border-box'
            } : {
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

        parentForBlocks.appendChild(linesContainer);
        if (this.applyGlobalFontSize) this.applyGlobalFontSize();
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
                backgroundColor: index === this.currentLineIndex ? 'rgb(37, 48, 64)' : 'transparent',
                border: '1px solid transparent',
                transform: index === this.currentLineIndex ? 'scale(1.03)' : 'scale(1)',
                fontWeight: index === this.currentLineIndex ? '600' : '400',
                color: index === this.currentLineIndex ? '#ffffff' : (this.fullscreenMode ? '#4a5563' : '#666')
            }
        });

        lineDiv.className = 'lyrics-line';
        lineDiv.style.userSelect = 'none';
        lineDiv.style.webkitUserSelect = 'none';
        lineDiv.style.mozUserSelect = 'none';
        lineDiv.style.msUserSelect = 'none';
        lineDiv.style.webkitTouchCallout = 'none';

        // Create line content container
        const lineContent = $('div', {
            id: `line-content-${index}`,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }
        });

        // Always create timecode if line has a time (but not in fullscreen mode), hide/show based on preferences
        if (line.time >= 0 && !this.fullscreenMode) {
            const timeSpan = $('span', {
                text: this.formatTimeDisplay(line.time),
                css: {
                    fontSize: '0.8em',
                    color: '#fff',
                    backgroundColor: 'rgb(48,60,78)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    minWidth: '60px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                    overflow: 'hidden'
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
                timeSpan.style.backgroundColor = 'rgb(48,60,78)';
                timeSpan.style.color = '#fff';
            });

            timeSpan.addEventListener('mouseleave', () => {
                timeSpan.style.backgroundColor = 'rgb(48,60,78)';
                timeSpan.style.color = '#fff';
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

                } else {
                    // Handle double-tap detection for iOS
                    if (!timeSpan._lastTapTime) {
                        timeSpan._lastTapTime = currentTime;
                    } else {
                        const timeBetweenTaps = currentTime - timeSpan._lastTapTime;
                        if (timeBetweenTaps < 300) { // 300ms for double-tap
                            // Double-tap detected - open edit modal
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

            // Only double-click editing is allowed - no drag on spans

            // Set initial visibility based on user preferences
            timeSpan.style.display = this.showTimecodes ? 'inline-block' : 'none';

            lineContent.append(timeSpan);
        }

        // Line text
        const textSpan = $('span', {
            text: line.text,
            css: {
                fontSize: 'inherit',
                lineHeight: 'inherit',
                flex: '1',
                userSelect: 'none',
                webkitUserSelect: 'none',
                mozUserSelect: 'none',
                msUserSelect: 'none',
                webkitTouchCallout: 'none'
            }
        });

        // Add class for CSS targeting
        textSpan.className = 'text-span';

        // Add touch-friendly styling for text editing
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            textSpan.setAttribute('title', 'Hold to edit lyrics');
        } else {
            textSpan.setAttribute('title', 'Double-click to edit lyrics');
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
            this.setActiveLineIndex(index, true); // true = manual selection

            // Track manual selection for AUv3 mode (already done in setActiveLineIndex, but keeping for clarity)

            if (this.recordMode) {
                // RECORD MODE: Use the current time from host (AUv3) or fallback to 0
                let timecodeMs = 0;

                // In AUv3 context, use the current time from host
                const isAUv3Context = window.webkit && window.webkit.messageHandlers;
                if (isAUv3Context && typeof this.currentTime === 'number' && this.currentTime >= 0) {
                    timecodeMs = this.currentTime;
                } else {
                    // Fallback: try to read from timecode display, but sanitize the value
                    const timecodeElement = document.getElementById('timecode-display');
                    if (timecodeElement) {
                        const text = timecodeElement.textContent.replace('s', '').replace('🔴', '').trim();
                        const seconds = parseFloat(text);
                        if (isFinite(seconds) && seconds >= 0) {
                            timecodeMs = Math.round(seconds * 1000);
                        }
                        // If value is invalid or negative, timecodeMs stays 0
                    }
                }

                this.currentLyrics.lines[index].time = timecodeMs;
                this.currentLyrics.updateLastModified();

                // Verify and correct timecode order after recording
                this.verifyAndCorrectTimecodeOrder(index);

                // Save to localStorage when recording timecode in record mode
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


                if (typeof window.updateTimecodeDisplay === 'function') {
                    window.updateTimecodeDisplay(timecodeMs);
                }
                if (this.showTimecodes) {
                    this.renderLyrics();
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

                } else if (line.time < 0) {
                } else {
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

                this.setActiveLineIndex(index, true); // true = manual selection (touch)

                // Track manual selection (already done in setActiveLineIndex, but keeping for clarity)

                if (this.recordMode) {
                    // RECORD MODE: Use the current time from host (AUv3) or fallback to audio controller/display
                    let timecodeMs = 0;

                    // In AUv3 context, use the current time from host
                    const isAUv3Context = window.webkit && window.webkit.messageHandlers;
                    if (isAUv3Context && typeof this.currentTime === 'number' && this.currentTime >= 0) {
                        timecodeMs = this.currentTime;
                    } else {
                        // Fallback: try to read from timecode display
                        const timecodeElement = document.getElementById('timecode-display');
                        if (timecodeElement) {
                            const text = timecodeElement.textContent.replace('s', '').replace('🔴', '').trim();
                            const seconds = parseFloat(text);
                            if (isFinite(seconds) && seconds >= 0) {
                                timecodeMs = Math.round(seconds * 1000);
                            }
                        }

                        // Fallback to audio controller if available and timecode is still 0
                        if (timecodeMs === 0 && this.audioController) {
                            const audioTime = this.audioController.getCurrentTime() * 1000;
                            if (audioTime >= 0) {
                                timecodeMs = audioTime;
                            }
                        }
                    }

                    // Always assign the timecode, even if it's 0
                    this.currentLyrics.lines[index].time = timecodeMs;
                    this.currentLyrics.updateLastModified();

                    // Verify and correct timecode order after recording
                    this.verifyAndCorrectTimecodeOrder(index);

                    // Save to localStorage when recording timecode in record mode (touch)
                    const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


                    // Re-render to show the new timecode (if timecodes are visible)
                    if (this.showTimecodes) {
                        this.renderLyrics();
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
            this.editLineText(index, textSpan);
        });

        return lineDiv;
    }

    // Format time for display (single canonical version) -> [mm:ss.mmm]
    formatTimeDisplay(ms) {
        if (ms < 0 || isNaN(ms)) return '--:--.---';
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const millis = Math.floor(ms % 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
    }

    // Set active line index - unified function for all line changes
    setActiveLineIndex(index, isManual = false) {

        // Track manual selections for AUv3 mode
        if (isManual) {
            this.lastManualSelection = Date.now();
        }

        // Remove previous highlight
        if (this.currentLineIndex >= 0) {
            // Try multiple strategies to find the previous element
            let prevElement = this.lyricsContent.querySelector(`[data-line-index="${this.currentLineIndex}"]`);
            if (!prevElement) {
                const allLines = this.lyricsContent.querySelectorAll('.lyrics-line');
                prevElement = allLines[this.currentLineIndex];
            }

            if (prevElement) {
                prevElement.style.backgroundColor = 'transparent';
                prevElement.style.border = '1px solid transparent';
                prevElement.style.transform = 'scale(1)';
                prevElement.style.fontWeight = 'normal';
                prevElement.style.color = this.fullscreenMode ? '#4a5563' : '#666';
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
                // Highlight the new active line (harmonized subdued highlight)
                const highlightBg = this.fullscreenMode ? 'rgb(37, 48, 64)' : 'rgba(0, 150, 255, 0.15)';
                element.style.backgroundColor = highlightBg;
                element.style.border = '1px solid transparent';
                element.style.color = '#ffffff';
                element.style.transform = 'scale(1.03)';
                element.style.fontWeight = '600';
                element.style.transition = 'all 0.25s ease';

                // Determine if we should scroll
                // Allow scrolling in record mode for manual selections, but not in edit mode
                let shouldScroll = !this.editMode && (!this.recordMode || isManual);

                // In AUv3 mode, don't scroll for automatic updates if user recently made manual selection
                const isAUv3Context = window.webkit && window.webkit.messageHandlers;
                if (isAUv3Context && !isManual && shouldScroll) {
                    const timeSinceManualSelection = Date.now() - this.lastManualSelection;
                    shouldScroll = timeSinceManualSelection >= 5000; // Same grace period
                }

                // Scroll to active line if appropriate
                if (shouldScroll) {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                    if (this.recordMode && isManual) {
                        console.log(`🔧 Ligne ${index} recentrée en mode record (setActiveLineIndex)`);
                    }
                }
            }
        }
    }

    // Create bulk edit interface
    createBulkEditInterface(container) {

        if (!this.currentLyrics || !this.currentLyrics.lines) {
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

        // Create textarea using DOM directly to ensure compatibility
        const editArea = document.createElement('textarea');
        editArea.id = 'bulk-edit-textarea';
        editArea.value = lyricsText;
        editArea.style.cssText = `
            width: 100%;
            min-height: 400px;
            padding: 15px;
            border: none;
            border-radius: 8px;
            background-color: rgb(48, 60, 78);
            color: #fff;
            font-size: 24px;
            line-height: 1.6;
            font-family: inherit;
            resize: vertical;
            outline: none;
            box-sizing: border-box;
        `;
        // Wrapper to ensure centering even if parent container is flex or has alignment rules
        const bulkWrapper = document.createElement('div');
        bulkWrapper.id = 'bulk-edit-wrapper';
        bulkWrapper.style.cssText = `
            width: 100%;
            margin: 0; /* align wrapper left */
            box-sizing: border-box;
            display: block;
        `;
        // Full width textarea in edit mode (no max width constraint now)
        editArea.style.maxWidth = '100%';
        bulkWrapper.appendChild(editArea);

        container.appendChild(bulkWrapper);

        // Focus the textarea and position cursor at the beginning
        setTimeout(() => {
            editArea.focus();
            editArea.setSelectionRange(0, 0); // Set cursor to beginning
            editArea.scrollTop = 0; // Scroll to top of textarea
        }, 100);
    }

    // Create a new empty song when no song is loaded and edit mode is activated
    createNewEmptySong() {
        // Import SyncedLyrics if not available
        if (!window.Lyrix || !window.Lyrix.SyncedLyrics) {
            console.error('❌ SyncedLyrics not available');
            return;
        }

        // Create a new song with default metadata - SyncedLyrics constructor requires title and artist
        const newSong = new window.Lyrix.SyncedLyrics('New Song', 'Unknown Artist', '');

        // Add one empty line to start with
        newSong.lines = [
            {
                id: newSong.generateLineId(),
                text: '',
                time: -1
            }
        ];

        // Update creation and modification dates (already set by constructor but refresh them)
        newSong.updateLastModified();

        // Save the new song to the library if available
        if (window.Lyrix && window.Lyrix.lyricsLibrary && window.Lyrix.lyricsLibrary.saveSong) {
            const storageKey = window.Lyrix.lyricsLibrary.saveSong(newSong);

            // Set this song as the current song using the proper flow
            if (storageKey && window.loadAndDisplaySong) {
                window.loadAndDisplaySong(storageKey);
            } else {
                // Fallback: set it manually
                this.currentLyrics = newSong;
            }
        } else {
            // Fallback: set it manually
            this.currentLyrics = newSong;
        }

        console.log('✅ Created new empty song for editing');
    }


    // Toggle edit mode
    toggleEditMode() {
        // Check if no song is loaded when trying to enter edit mode
        if (!this.editMode && !this.currentLyrics) {
            // Create a new empty song
            this.createNewEmptySong();
            // Don't return, continue with edit mode activation
        }

        // If exiting edit mode, apply changes
        // Safe theme access with fallbacks to prevent TypeError
        const _theme = (UIManager && UIManager.THEME) ? UIManager.THEME : (default_theme || {});
        const defaultBtnBg = (_theme.button && _theme.button.backgroundColor) || 'transparent';
        const surfaceAlt = (_theme.colors && _theme.colors.surfaceAlt) || defaultBtnBg;

        const wasInEdit = this.editMode;
        // Flip state first
        this.editMode = !this.editMode;
        if (!this.editMode && wasInEdit) {
            // Just exited edit mode -> revert active state
            if (this.editButton && this.editButton._setActive) {
                this.editButton._setActive(false);
            } else {
                this.editButton.style.backgroundColor = defaultBtnBg || surfaceAlt;
            }
            if (this.originalLinesBackup) {
                this.applyBulkEditChanges();
            }
            // Auto-apply time offset if user changed it (baseline captured)
            if (typeof this.currentTimeOffset === 'number' && this.currentTimeOffset !== 0 && this._baselineLineTimes) {
                this.applyTimeOffset(this.currentTimeOffset);
                // Persist offset value in metadata
                if (this.currentLyrics && this.currentLyrics.metadata) {
                    this.currentLyrics.metadata.timeOffset = this.currentTimeOffset;
                    if (this.currentLyrics.songId) {
                        StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                    }
                }
                this.showOffsetAppliedFeedback(this.currentTimeOffset);
            }
        } else if (this.editMode && !wasInEdit) {
            // Just entered edit mode -> activate persistent state
            if (this.editButton && this.editButton._setActive) {
                //  this.editButton._setActive(true);
            } else {
                this.editButton.style.backgroundColor = (_theme.buttonActive && _theme.buttonActive.backgroundColor) || 'rgb(58,74,96)';
            }
        }
        // Keep icon, only change color (uses theme colors)

        // this.editButton.style.backgroundColor = this.editMode ? default_theme.editModeActiveColor : default_theme.button.backgroundColor;
        // Show/hide edit mode buttons in toolbar
        // if (this.saveChangesButton && this.cancelEditButton) {
        //     if (this.editMode) {
        //         this.saveChangesButton.style.display = 'inline-block';
        //         this.cancelEditButton.style.display = 'inline-block';
        //     } else {
        //         this.saveChangesButton.style.display = 'none';
        //         this.cancelEditButton.style.display = 'none';
        //     }
        // }
        this.renderLyrics();

        // Ensure user preference for timecode visibility is applied after re-render
        this.updateTimecodeVisibility && this.updateTimecodeVisibility();

        // Update content area height after toggle
        setTimeout(() => {
            this.updateContentAreaHeight();
        }, 10);

        // Synchronize input values with metadata on each entry in edit mode
        if (this.editMode) {
            setTimeout(() => {
                const titleInput = document.getElementById('edit_title_input');
                if (titleInput) titleInput.value = this.currentLyrics.metadata.title || '';
                const artistInput = document.getElementById('edit_artist_input');
                if (artistInput) artistInput.value = this.currentLyrics.metadata.artist || '';
            }, 0);
        }
    }

    // Sync visibility of existing timecode elements with stored preference (used after mode toggles)
    updateTimecodeVisibility() {
        // Read latest preference (in case changed via settings panel while in edit mode)
        const saved = localStorage.getItem('lyrix_show_timecodes');
        if (saved !== null) {
            this.showTimecodes = (saved === 'true');
        }
        // Update existing spans without full re-render (lightweight)
        const spans = this.lyricsContent ? this.lyricsContent.querySelectorAll('.timecode-span, [data-role="timecode"]') : [];
        spans.forEach(span => {
            span.style.display = this.showTimecodes ? 'inline-block' : 'none';
        });
        // Also refresh button state
        this.updateTimecodeButtonAppearance && this.updateTimecodeButtonAppearance();
    }

    // Apply bulk edit changes
    applyBulkEditChanges() {
        const textarea = document.getElementById('bulk-edit-textarea');
        if (!textarea || !this.originalLinesBackup) return;

        const rawLines = textarea.value.split('\n');
        const originalLines = this.originalLinesBackup;
        // 1. Remove trailing empty lines but keep one if any existed
        let end = rawLines.length;
        while (end > 0 && rawLines[end - 1].trim() === '') end--;
        const trailingEmpty = rawLines.length - end;
        const trimmed = rawLines.slice(0, end);
        if (trailingEmpty > 0) trimmed.push(''); // keep exactly one trailing blank if there were any
        // 2. Preserve internal empty lines (don't filter them out)
        const newLines = trimmed.map((text, idx) => {
            const originalLine = originalLines[idx];
            return {
                text: text.trim() === '' ? '' : text.trim(),
                time: originalLine ? originalLine.time : -1
            };
        });

        // Update the lyrics object
        this.currentLyrics.lines = newLines;

        // Update the lastModified timestamp
        this.currentLyrics.metadata.lastModified = new Date().toISOString();

        // Save to storage using the correct method
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
        if (saveSuccess) {
        } else {
        }

        // Clear backup
        this.originalLinesBackup = null;

    }

    // Toggle record mode
    toggleRecordMode() {
        this.recordMode = !this.recordMode;
        // Active/inactive color handling with persistent state
        const activeColor = default_theme.recordModeActiveColor || '#f44336';
        const inactiveColor = default_theme.button.backgroundColor;
        if (this.recordButton && this.recordButton._setActive) {
            this.recordButton.dataset.customActiveBg = activeColor;
            this.recordButton._setActive(this.recordMode);
        } else {
            this.recordButton.style.backgroundColor = this.recordMode ? activeColor : inactiveColor;
        }
        this.recordButton.dataset.originalBgColor = this.recordButton.style.backgroundColor;

        if (this.recordMode) {

            // Store original lines for saving later
            this.originalLinesForRecord = this.currentLyrics ?
                JSON.parse(JSON.stringify(this.currentLyrics.lines)) : null;
        } else {

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
            // Force persistent unified background in normal mode
            this.lyricsContent.style.backgroundColor = 'rgb(37, 48, 64)';
            this.lyricsContent.style.color = styles.color;
            // Reduce side padding to allow precise centering
            this.lyricsContent.style.padding = '40px 0';
            this.lyricsContent.style.overflow = 'auto';
            this.lyricsContent.style.fontSize = `${this.fontSize}px`;
            // Outer container centers child block; text alignment handled in inner wrapper
            this.lyricsContent.style.textAlign = 'left';
            this.lyricsContent.style.cursor = 'pointer';
            this.lyricsContent.style.flex = 'none';  // Remove flex behavior
            // Center block and constrain line length
            this.lyricsContent.style.display = 'flex';
            this.lyricsContent.style.flexDirection = 'column';
            this.lyricsContent.style.alignItems = 'center'; // centers inner wrapper horizontally
            this.lyricsContent.style.justifyContent = 'flex-start';
            // Wrap inner lines container if exists
            const inner = this.lyricsContent.querySelector('#lyrics_lines_container');
            if (inner) {
                inner.style.maxWidth = '900px';
                inner.style.width = '100%';
                inner.style.margin = '0 auto';
                inner.style.padding = '0 40px';
                inner.style.boxSizing = 'border-box';
                inner.style.textAlign = 'left';
            }
            if (this.applyGlobalFontSize) this.applyGlobalFontSize();
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
            this.lyricsContent.style.display = 'block';
            // Reset inner container if present
            const inner = this.lyricsContent.querySelector('#lyrics_lines_container');
            if (inner) {
                inner.style.maxWidth = '';
                inner.style.width = '';
                inner.style.margin = '';
                inner.style.padding = '';
                inner.style.boxSizing = '';
                inner.style.textAlign = '';
            }
            if (this.applyGlobalFontSize) this.applyGlobalFontSize();
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

            grab('intuition').style.display = 'none';
            grab("_intuition_perform").style.display = 'none';
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
            grab('intuition').style.display = 'flex';
            grab("_intuition_perform").style.display = 'inline-flex';
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


        // Re-render lyrics to update timecode visibility based on fullscreen state
        if (this.currentLyrics) {
            this.renderLyrics();
        }
    }

    // Toolbar is always visible now, no toggle needed

    // Update toolbar visibility without toggling (for initialization)
    updateToolbarVisibility() {
        // Toolbar is always visible now
        if (this.mainToolRow) {
            this.mainToolRow.style.display = 'flex';
        }

        // Update audio toolbar row visibility - show if audio is enabled
        // if (this.audioToolRow) {
        //     const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
        //     // this.audioToolRow.style.display = isAudioPlayerEnabled ? 'flex' : 'none';
        // }
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

    }

    // Update timecode button appearance based on current state
    updateTimecodeButtonAppearance() {
        if (this.timecodeButton) {
            if (this.showTimecodes) {
                this.timecodeButton.textContent = '🚫'; // Icon to hide
                this.timecodeButton.style.backgroundColor = default_theme.editModeActiveColor;
            } else {
                this.timecodeButton.textContent = '🕐'; // Icon to show
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

    }

    // Toggle artist visibility
    toggleArtist() {
        this.showArtist = !this.showArtist;

        // Save state to localStorage
        localStorage.setItem('lyrix_show_artist', this.showArtist.toString());

        // Update artist visibility
        this.updateArtistVisibility();

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

    }

    // Show timecode options panel (DEPRECATED - moved to settings panel)


    // Confirm clearing all timecodes
    confirmClearAllTimecodes() {


        // Import the UI manager for confirmation dialog
        import('./ui.js').then(({ UIManager }) => {
            UIManager.showConfirm(
                'Clear All Timecodes',
                'Are you sure you want to delete all timecodes? This action cannot be undone.',
                () => {
                    // Clear all timecodes
                    this.currentLyrics.clearAllTimecodes();
                    this.renderLyrics(); // Re-render to update display
                },
                () => {
                }
            );
        });
    }

    // Adjust font size
    adjustFontSize(delta) {
        this.fontSize = Math.max(CONSTANTS.UI.MIN_FONT_SIZE, Math.min(CONSTANTS.UI.MAX_FONT_SIZE, this.fontSize + delta));
        // Re-apply mode styles (keeps fullscreen layout) and uniform font size
        if (this.fullscreenMode) {
            this.applyModeStyles(true);
        } else {
            this.lyricsContent.style.fontSize = `${this.fontSize}px`;
        }
        this.applyGlobalFontSize();

        this.fontSizeLabel.textContent = `${this.fontSize}px`;
        StorageManager.saveFontSize(this.fontSize);
    }

    // Directly set font size (used by settings panel) ensuring immediate fullscreen update
    setFontSize(newSize) {
        const clamped = Math.max(CONSTANTS.UI.MIN_FONT_SIZE, Math.min(CONSTANTS.UI.MAX_FONT_SIZE, parseInt(newSize, 10)));
        if (isNaN(clamped)) return;
        this.fontSize = clamped;
        if (this.fullscreenMode) {
            this.applyModeStyles(true);
        } else if (this.lyricsContent) {
            this.lyricsContent.style.fontSize = `${this.fontSize}px`;
        }
        this.applyGlobalFontSize();
        if (this.fontSizeLabel) this.fontSizeLabel.textContent = `${this.fontSize}px`;
        StorageManager.saveFontSize(this.fontSize);
    }

    // Uniform font size propagation for normal & fullscreen
    applyGlobalFontSize() {
        const sizePx = `${this.fontSize}px`;
        if (this.lyricsContent) this.lyricsContent.style.fontSize = sizePx;
        // Remove previously injected inline sizes on lines/title/artist so they inherit
        this.lyricsContent.querySelectorAll('.lyrics-line, #lyrics-title-display, #lyrics-artist-display').forEach(el => {
            el.style.fontSize = '';
        });
    }

    // Edit font size directly by typing
    editFontSizeDirectly() {

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


        // Replace the label with input temporarily
        this.fontSizeLabel.style.display = 'none';
        this.fontSizeLabel.parentNode.insertBefore(input, this.fontSizeLabel);
        input.focus();
        input.select();

        const saveEdit = () => {
            const newSize = parseInt(input.value, 10);

            if (isNaN(newSize) || newSize < CONSTANTS.UI.MIN_FONT_SIZE || newSize > CONSTANTS.UI.MAX_FONT_SIZE) {
                // Keep original value
            } else if (newSize !== this.fontSize) {
                // Apply new font size
                this.fontSize = newSize;

                // Apply font size to lyrics content
                this.lyricsContent.style.fontSize = `${this.fontSize}px`;

                this.fontSizeLabel.textContent = `${this.fontSize}px`;
                StorageManager.saveFontSize(this.fontSize);
            }

            // Restore the label
            input.parentNode.removeChild(input);
            this.fontSizeLabel.style.display = 'inline-block';
        };

        const cancelEdit = () => {
            // Restore the label without changes
            input.parentNode.removeChild(input);
            this.fontSizeLabel.style.display = 'inline-block';
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

    // Duplicate earlier removed; keep single definition above

    // Edit timecode via double-click
    editTimecode(lineIndex, timeSpan) {
        if (!this.currentLyrics) return;

        // Block timecode editing in record mode
        if (this.recordMode) {
            return;
        }

        // Get the currently displayed timecode text from the span (similar to editLineText approach)
        const currentDisplayedTime = timeSpan.textContent || timeSpan.innerText || '';

        // Current display already without brackets (formatTimeDisplay) so just trim
        const currentTimeFormatted = currentDisplayedTime.trim();

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
            min-width: 80px;
            text-align: center;
            background-color: rgb(48,60,78);
            color: #fff;
            cursor: text;
            user-select: text;
            -webkit-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            pointer-events: auto;
            outline: none;
            box-shadow: none;
            -webkit-appearance: none;
        `;
        const lockTCStyles = () => {
            input.style.backgroundColor = 'rgb(48,60,78)';
            input.style.color = '#fff';
            input.style.outline = 'none';
            input.style.boxShadow = 'none';
        };
        ['focus', 'blur', 'keydown', 'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'input'].forEach(ev => {
            input.addEventListener(ev, () => { lockTCStyles(); setTimeout(lockTCStyles, 0); });
        });
        lockTCStyles();

        // Add a hint tooltip
        input.title = "Type to edit or drag up/down to adjust timecode\nHold Shift for fine adjustment, Ctrl/Cmd for coarse adjustment";

        // Replace the span with input temporarily
        timeSpan.style.display = 'none';
        timeSpan.parentNode.insertBefore(input, timeSpan);
        input.focus();

        // Don't auto-position cursor, let user click where they want

        // Add slide up/down functionality for timecode increment/decrement
        let isDragging = false;
        let dragStarted = false;
        let startY = 0;
        let startTime = this.currentLyrics.lines[lineIndex].time;
        let lastUpdateY = 0;
        let outsideClickEnabled = true; // Control when outside click is active
        const DRAG_THRESHOLD = 5; // pixels to differentiate between click and drag

        const handleMouseDown = (e) => {
            dragStarted = false;
            startY = e.clientY;
            lastUpdateY = e.clientY;
            startTime = this.currentLyrics.lines[lineIndex].time;

            // Disable outside click detection during any mouse operation
            outsideClickEnabled = false;

            // Don't prevent default - allow text selection to work
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e) => {
            const deltaY = Math.abs(e.clientY - startY);

            // Only start dragging if mouse moved enough (distinguishes from click)
            if (!dragStarted && deltaY > DRAG_THRESHOLD) {
                dragStarted = true;
                isDragging = true;
                input.style.cursor = 'ns-resize';
                input.style.borderColor = '#28a745'; // Highlight border when dragging
                // Keep stable dark background (user requested no white/green flash)
                input.style.backgroundColor = 'rgb(48,60,78)';
                // Don't blur - keep the input focused for continued editing
            }

            if (!isDragging) return;

            const movementDelta = lastUpdateY - e.clientY; // Invert: up = positive
            let sensitivity = 50; // Base sensitivity: milliseconds per pixel

            // Increase precision when holding Shift
            if (e.shiftKey) {
                sensitivity = 10; // Fine adjustment
            }
            // Decrease precision when holding Ctrl/Cmd for coarse adjustments
            else if (e.ctrlKey || e.metaKey) {
                sensitivity = 200; // Coarse adjustment
            }

            const newTime = Math.max(0, startTime + movementDelta * sensitivity);

            // Update the input value in real-time during drag
            if (Math.abs(movementDelta) > 0) {
                this.currentLyrics.lines[lineIndex].time = newTime;
                const formattedTime = this.formatTimeDisplay(newTime);
                input.value = formattedTime.replace(/[\[\]]/g, '').trim();

                lastUpdateY = e.clientY;
                startTime = newTime; // Update reference point for continuous adjustment
            }
        };

        const handleMouseUp = (e) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            if (isDragging) {
                // End drag operation but STAY in edit mode
                isDragging = false;
                dragStarted = false;
                input.style.backgroundColor = 'rgb(48,60,78)';
                input.style.color = '#fff';

                input.style.cursor = 'text';
                input.style.borderColor = '#007bff'; // Back to standard blue border
                // Preserve dark background after drag end

                // Update lyrics and save to localStorage
                this.currentLyrics.updateLastModified();

                // Verify and correct timecode order after drag adjustment
                this.verifyAndCorrectTimecodeOrder(lineIndex);

                // Save to localStorage using the same method as the save button
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);

                // Keep focus and stay in edit mode
                input.focus();

                // Re-enable outside click after drag is completely done
                setTimeout(() => {
                    outsideClickEnabled = true;
                }, 50);
            } else {
                // It was just a click (no drag), re-enable outside click immediately
                outsideClickEnabled = true;
            }
        };

        // Add mouse event listeners to input
        input.addEventListener('mousedown', handleMouseDown);

        // Detect clicks outside the input
        const handleOutsideClick = (e) => {
            // Only process outside clicks when explicitly enabled
            if (!outsideClickEnabled) {
                return;
            }

            if (!input.contains(e.target) && e.target !== input) {
                saveEdit();
                document.removeEventListener('click', handleOutsideClick);
            }
        };

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

                timeSpan.textContent = this.formatTimeDisplay(finalTime);
                timeSpan.style.backgroundColor = 'rgb(48,60,78)';
                input.style.backgroundColor = 'rgb(48,60,78)';
            }

            // Clean up event listeners
            document.removeEventListener('click', handleOutsideClick);

            // Restore the span
            input.parentNode.removeChild(input);
            timeSpan.style.display = 'inline-block';
        };

        const cancelEdit = () => {
            // Clean up event listeners
            document.removeEventListener('click', handleOutsideClick);

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

        // Add outside click listener after a small delay to avoid immediate trigger
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 100);
    }

    // Touch-optimized timecode editing for iOS/mobile devices
    editTimecodeTouch(lineIndex, timeSpan) {
        if (!this.currentLyrics) return;

        // Block timecode editing in record mode
        if (this.recordMode) {
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

        // Focus and let user position cursor manually
        setTimeout(() => {
            input.focus();
            // Don't auto-position, let user click where they want
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
                        log(`✅ Touch-edited timecode for line ${lineIndex + 1} saved successfully`);
                        if (correctionsMade > 0) {
                        }
                    } else {
                    }

                    // Update the original timeSpan with the final time (after all corrections)
                    timeSpan.textContent = this.formatTimeDisplay(finalTime);

                    // If corrections were made, show a brief notification

                } else {
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

        // Lock line editing during record mode
        if (this.recordMode) {
            return;
        }

        if (!this.currentLyrics) {
            return;
        }

        const currentText = this.currentLyrics.lines[lineIndex].text;

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
                } else {
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
            background-color: rgb(48,60,78);
            color: #fff;
            flex: 1;
            box-sizing: border-box;
            user-select: text !important;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            -webkit-touch-callout: default !important;
        `;

        // Ensure the input allows text selection and is marked as editable
        input.className = 'editable-content text-input';

        // Create delete button
        const deleteButton = document.createElement('button');
        // Replace trash emoji with SVG icon
        deleteButton.innerHTML = '';
        (function attachDeleteIcon(btn) {
            try {
                const img = document.createElement('img');
                img.src = 'assets/images/icons/delete.svg';
                img.alt = 'delete';
                img.style.width = '14px';
                img.style.height = '14px';
                img.style.pointerEvents = 'none';
                btn.appendChild(img);
            } catch (e) { /* silent */ }
        })(deleteButton);
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


        // Replace the text span with edit container temporarily
        textSpan.style.display = 'none';
        textSpan.parentNode.insertBefore(editContainer, textSpan);
        input.focus();

        const saveEdit = () => {
            const newText = input.value; // Don't trim here to allow spaces-only lines

            // Always save if the text is different from original (including empty strings)
            if (newText !== currentText) {
                // Update the text (allow empty lines)
                this.currentLyrics.lines[lineIndex].text = newText;
                this.currentLyrics.updateLastModified();

                // Save to localStorage using the same method as the save button
                const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


                textSpan.textContent = newText;
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

            // Refresh the display to show the new line
            this.renderLyrics();

        };

        const deleteLine = () => {

            if (this.currentLyrics.lines.length <= 1) {
                return;
            }

            // Remove the line from lyrics
            this.currentLyrics.lines.splice(lineIndex, 1);
            this.currentLyrics.updateLastModified();

            // Save to localStorage
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


            // Refresh the display
            this.renderLyrics();

        };

        // Delete button click handler
        deleteButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Clean up edit interface first
            if (editContainer.parentNode) {
                editContainer.parentNode.removeChild(editContainer);
                textSpan.style.display = 'inline';
            }

            // Then delete the line
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

        if (!this.currentLyrics) {
            log('❌ No currentLyrics in editMetadataField');
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


                // Update the display element text
                if (fieldName === 'artist') {
                    displayElement.textContent = `by ${newValue}`;
                } else {
                    displayElement.textContent = newValue;
                }

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


            this.renderLyrics();
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


        this.renderLyrics();
    }

    // Clear time for specific line
    clearLineTime(lineIndex) {
        if (!this.currentLyrics) return;

        this.currentLyrics.clearLineTimecode(lineIndex);

        // Save to localStorage using the same method as the save button
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


        this.renderLyrics();
    }

    // Clear all timecodes
    clearAllTimecodes() {
        if (!this.currentLyrics) return;

        if (confirm('Clear all timecodes? This cannot be undone.')) {
            this.currentLyrics.clearAllTimecodes();

            // Save to localStorage using the same method as the save button
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


            this.renderLyrics();
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


            this.renderLyrics();
        }
    }

    // Update time and synchronize lyrics (core functionality from original)
    updateTime(timeMs, source = 'unknown') {
        if (!this.currentLyrics) {
            return;
        }

        // Priority management: Host AUv3 has priority when both sources are active
        const now = Date.now();

        // Track last update time for each source
        if (!this.lastUpdateTimes) {
            this.lastUpdateTimes = {};
        }
        this.lastUpdateTimes[source] = now;

        // Check if both host and local are sending updates (within last 500ms)
        const hostActive = this.lastUpdateTimes.host && (now - this.lastUpdateTimes.host) < 500;
        const localActive = this.lastUpdateTimes.local && (now - this.lastUpdateTimes.local) < 500;

        // If both are active and this is a local update, ignore it to give priority to host
        if (hostActive && localActive && source === 'local') {
            console.log('🎯 Host priority: ignoring local update while host is active');
            return;
        }

        // Also check if we're receiving conflicting updates too quickly
        if (this.lastUpdateTime && (now - this.lastUpdateTime) < 16) { // ~60fps throttle
            // Only allow host updates through when throttling
            if (source !== 'host') {
                return;
            }
        }
        this.lastUpdateTime = now;

        // CRITICAL: Filter timecode display updates for parasitic zero resets
        // This prevents the timecode display from jumping to 0 when host sends resets
        if (timeMs === 0 && this.currentTime > 1000 && source === 'host') {
            // Host is sending a zero reset but we have valid content - skip timecode display update
            console.log(`🚨 Blocking timecode display reset to zero (current: ${(this.currentTime / 1000).toFixed(3)}s)`);
            // Still update scroll/lyrics but skip the timecode and currentTime update
        } else {
            // Normal update: update both currentTime and timecode display
            this.currentTime = timeMs;
            this.updateTimecodeDisplay(timeMs);
        }

        // In record mode, don't auto-update active lines to prevent unwanted scroll
        if (this.recordMode) {
            return;
        }

        // Find the line that should be active at this time
        const targetLine = this.currentLyrics.getActiveLineAt(timeMs);
        if (!targetLine) {
            return;
        }

        // Find the index of this line
        const targetIndex = this.currentLyrics.lines.findIndex(line => line === targetLine);
        if (targetIndex < 0) {
            return;
        }

        // Only update if it's actually a different line
        if (targetIndex !== this.currentLineIndex) {
            this.setActiveLineIndex(targetIndex, false); // false = not manual
        }
    }

    // Update timecode display
    updateTimecodeDisplay(timeMs) {
        const timecodeElement = document.getElementById('timecode-display');
        if (timecodeElement) {
            // Additional protection: don't update display to 0 if we recently had a valid time
            if (timeMs === 0 && this.lastValidTimecodeUpdate && (Date.now() - this.lastValidTimecodeUpdate) < 2000) {
                // Throttle protection logging to avoid spam
                if (!this.lastProtectionLog || (Date.now() - this.lastProtectionLog) > 3000) {
                    console.log(`🛡️ Protecting timecode display from resets (last valid: ${(this.lastValidTimecode / 1000).toFixed(3)}s)`);
                    this.lastProtectionLog = Date.now();
                }
                return; // Keep the current display value
            }

            const seconds = (timeMs / 1000).toFixed(3);
            const recordIndicator = this.recordMode ? ' 🔴' : '';
            timecodeElement.textContent = `${seconds}s${recordIndicator}`;

            // Track valid timecode updates (not zero resets)
            if (timeMs > 0) {
                this.lastValidTimecodeUpdate = Date.now();
                this.lastValidTimecode = timeMs;
            }
        }
    }

    // Highlight active line with scroll
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
            return;
        }

        let newIndex;

        // If no line is currently selected, start with the first line
        if (this.currentLineIndex < 0) {
            newIndex = 0;
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

        log(`🔄 Navigating ${direction} from line ${this.currentLineIndex + 1} to line ${newIndex + 1}`);

        // Set the new active line
        this.setActiveLineIndex(newIndex, true); // true = manual navigation (keyboard)

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

        } else if (line.time < 0) {
        } else {
        }
    }

    // Save recorded timecodes when exiting record mode
    saveRecordedTimecodes() {
        if (!this.currentLyrics) {
            return;
        }

        // Update the lastModified timestamp
        this.currentLyrics.metadata.lastModified = new Date().toISOString();

        // Save to storage using the correct method
        const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
        if (saveSuccess) {

            // Count how many timecodes were recorded
            const recordedCount = this.currentLyrics.lines.filter(line => line.time >= 0).length;
        } else {
            log('❌ Failed to save recorded timecodes');
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


            // Update last modified and save to localStorage
            this.currentLyrics.updateLastModified();
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


            // Re-render lyrics to show the corrections
            if (this.showTimecodes) {
                this.renderLyrics();
            }

            // Update any visible timecode displays in the DOM
            this.updateVisibleTimecodeDisplays();
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


            // Update last modified and save to localStorage
            this.currentLyrics.updateLastModified();
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);


            // Re-render lyrics to show the corrections
            if (this.showTimecodes) {
                this.renderLyrics();
            }
        }
        return correctionsMade;
    }

    // Helper function to find the text span element for a specific line after display refresh
    findTextSpanForLine(lineIndex) {
        try {
            // Find the line element by its data attribute
            const lineElement = document.querySelector(`[data-line-index="${lineIndex}"]`);
            if (!lineElement) {
                return null;
            }

            // Find the line content div (the flex container)
            const lineContent = lineElement.querySelector('.lyrics-line > div');
            if (!lineContent) {
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

            return null;
        } catch (error) {
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
                        }
                    }
                }
            });
        } catch (error) {
        }
    }

    // Setup drag functionality for time offset input
    setupOffsetInputDrag(offsetInput) {
        let isDragging = false;
        let startY = 0;
        let startValue = 0;
        let mouseIsDown = false;

        // Mouse events for desktop
        offsetInput.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button only
                mouseIsDown = true;
                startY = e.clientY;
                startValue = parseFloat(offsetInput.value) || 0;

                // Start drag immediately on mousedown if not focused for typing
                if (!this.isInputFocused) {
                    isDragging = true;
                    this.isDragging = true;
                    offsetInput.style.cursor = 'ns-resize';
                    offsetInput.style.backgroundColor = '#e3f2fd';
                    offsetInput.blur(); // Remove focus to prevent typing conflicts
                    e.preventDefault(); // Prevent text selection
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging && mouseIsDown) {
                const deltaY = startY - e.clientY; // Invert: up = positive
                const sensitivity = 0.01; // 0.01 second per pixel
                const newValue = startValue + (deltaY * sensitivity);

                offsetInput.value = newValue.toFixed(2);
                this.updateTimeOffset(newValue);
                e.preventDefault();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.isDragging = false;
                mouseIsDown = false;
                offsetInput.style.cursor = 'text';
                offsetInput.style.backgroundColor = '#fff';

                // Simply store the final value - NO timecode modification
                const finalValue = parseFloat(offsetInput.value) || 0;
                this.currentLyrics.metadata.timeOffset = finalValue;
                this.currentTimeOffset = finalValue;

                // Save the song with both methods to ensure persistence
                if (this.lyricsLibrary && this.lyricsLibrary.saveSong) {
                    this.lyricsLibrary.saveSong(this.currentLyrics);
                }

                // Also save directly with StorageManager
                if (this.currentLyrics.songId) {
                    StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                }

                console.log('🎯 Drag ended, stored offset:', finalValue, 'in song:', this.currentLyrics.songId);
            }
            mouseIsDown = false;
        });

        // Touch events for mobile
        offsetInput.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !this.isInputFocused) {
                isDragging = true;
                this.isDragging = true;
                startY = e.touches[0].clientY;
                startValue = parseFloat(offsetInput.value) || 0;
                offsetInput.style.backgroundColor = '#e3f2fd';
                e.preventDefault();
            }
        });

        document.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                const deltaY = startY - e.touches[0].clientY;
                const sensitivity = 0.01;
                const newValue = startValue + (deltaY * sensitivity);

                offsetInput.value = newValue.toFixed(2);
                this.updateTimeOffset(newValue);
                e.preventDefault();
            }
        });

        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                this.isDragging = false;
                offsetInput.style.backgroundColor = '#fff';

                // Simply store the final value - NO timecode modification
                const finalValue = parseFloat(offsetInput.value) || 0;
                this.currentLyrics.metadata.timeOffset = finalValue;
                this.currentTimeOffset = finalValue;

                // Save the song with both methods to ensure persistence
                if (this.lyricsLibrary && this.lyricsLibrary.saveSong) {
                    this.lyricsLibrary.saveSong(this.currentLyrics);
                }

                // Also save directly with StorageManager
                if (this.currentLyrics.songId) {
                    StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);
                }

                console.log('🎯 Touch ended, stored offset:', finalValue, 'in song:', this.currentLyrics.songId);
            }
        });
    }

    // Update time offset preview (visual feedback during drag)
    updateTimeOffset(offsetSeconds) {
        if (!this.currentLyrics || !Array.isArray(this.currentLyrics.lines)) return;
        // Initialize baseline if not present
        if (!this._baselineLineTimes) {
            this._baselineLineTimes = this.currentLyrics.lines.map(l => l.time);
        }
        this.currentTimeOffset = offsetSeconds;
        const offsetMs = Math.round(offsetSeconds * 1000);
        // Live update DOM spans only (non destructive to data until apply)
        const timecodeSpans = document.querySelectorAll('.timecode-span');
        timecodeSpans.forEach((span, idx) => {
            const base = this._baselineLineTimes[idx];
            if (typeof base === 'number' && base >= 0) {
                const adjusted = Math.max(0, base + offsetMs);
                // Use same formatter as initial render to avoid display disappearance
                span.textContent = this.formatTimeDisplay(adjusted);
            }
        });
    }

    // Apply time offset to all timecodes permanently
    applyTimeOffset(offsetSeconds) {
        if (!this.currentLyrics || !Array.isArray(this.currentLyrics.lines) || !this._baselineLineTimes) return;
        const offsetMs = Math.round(offsetSeconds * 1000);
        let appliedCount = 0;
        this.currentLyrics.lines.forEach((line, idx) => {
            const base = this._baselineLineTimes[idx];
            if (typeof base === 'number' && base >= 0) {
                line.time = Math.max(0, base + offsetMs);
                appliedCount++;
            }
        });
        delete this._baselineLineTimes;

        if (appliedCount > 0) {
            // Update last modified timestamp
            this.currentLyrics.updateLastModified();

            // Verify and correct timecode order after applying offset
            this.verifyAndCorrectAllTimecodes();

            // Save to localStorage
            const saveSuccess = StorageManager.saveSong(this.currentLyrics.songId, this.currentLyrics);

            // Reset visual feedback
            const timecodeSpans = document.querySelectorAll('.timecode-span');
            timecodeSpans.forEach(span => {
                span.style.backgroundColor = this.originalStyles.editPanel.backgroundColor;
                span.style.color = this.originalStyles.formElements.textColor;
            });

            // Re-render to show final values
            this.renderLyrics();
            // Ensure timecode spans use consistent formatting post-apply
            requestAnimationFrame(() => {
                const spans = document.querySelectorAll('.timecode-span');
                spans.forEach((span, idx) => {
                    const line = this.currentLyrics.lines[idx];
                    if (line && typeof line.time === 'number' && line.time >= 0) {
                        span.textContent = this.formatTimeDisplay(line.time);
                    }
                });
            });

            console.log(`Applied time offset of ${offsetSeconds}s to ${appliedCount} lines`);
        }
    }

    // Show feedback when offset is applied
    showOffsetAppliedFeedback(appliedValue) {
        const offsetInput = document.getElementById('time_offset_input');
        if (!offsetInput) return;
        // Subtle pulse feedback only, no color override (keeps theme)
        offsetInput.animate([
            { opacity: 0.6 },
            { opacity: 1 }
        ], { duration: 220 });
    }
}
