// Song List Modal Module
// Handles all song library functionality including MIDI controls, export, import, and sorting

// Show song library
export function showSongLibrary() {
    console.log('📚 Opening song library...');
    console.log('🎹 MIDI utilities available:', !!window.midiUtilities);
    if (window.midiUtilities) {
        console.log('🎹 Current MIDI assignments:', window.midiUtilities.getAllAssignments());
    }
    
    if (!window.lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        window.Modal({
            title: '❌ Error',
            content: '<p>Library not initialized</p>',
            buttons: [{ text: 'OK' }],
            size: 'small'
        });
        return;
    }

    const songs = window.lyricsLibrary.getAllSongs();
    
    // Always show the song library, even if empty, so users can create or import songs
    
    // Create custom modal with export/import buttons
    const modalContainer = window.UIManager.createEnhancedModalOverlay();
    const modal = window.UIManager.createEnhancedModalContainer({
        id: 'song-library-modal',
        css: { maxWidth: '700px', width: '90%' }
    });

    // Header with title and action buttons
    const header = window.$('div', {
        css: {
            padding: window.UIManager.THEME.spacing.lg,
            backgroundColor: window.UIManager.THEME.colors.primary,
            borderRadius: `${window.UIManager.THEME.borderRadius.lg} ${window.UIManager.THEME.borderRadius.lg} 0 0`,
            borderBottom: `1px solid ${window.UIManager.THEME.colors.border}`,
            color: 'white'
        }
    });

    const headerTop = window.$('div', {
        css: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
        }
    });

    const headerTitle = window.$('h3', {
        id: 'song-library-header',
        css: { margin: '0', color: 'white' }
    });

    // Action buttons container
    const actionButtons = window.$('div', {
        css: {
            display: 'flex',
            gap: '8px'
        }
    });

    // Create new song button
    const createNewSongButton = window.$('button', {
        id: 'create_new_song_button',
        text: '➕ New',
        css: {
            backgroundColor: '#2ecc71',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            document.body.removeChild(modalContainer);
            window.createNewSong();
        }
    });

    // Export all to LRX button
    const exportLRXButton = window.$('button', {
        id: 'export-lrx-format',
        text: '💾 Save',
        css: {
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            document.body.removeChild(modalContainer);
            window.exportAllSongsToLRX(); // Direct download, no dialog
        }
    });

    // Export selected as text button
    const exportTextButton = window.$('button', {
        id: 'export-songs-as-text',
        text: 'save txt',
        css: {
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            document.body.removeChild(modalContainer);
            window.exportSelectedSongsAsTextWithFolderDialog();
        }
    });

    // Import file button - moved from toolbar to song library panel
    const importFileButton = window.$('button', {
        id: 'import_file_button_library',
        text: '📁 Import',
        css: {
            backgroundColor: '#f39c12',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            document.body.removeChild(modalContainer);
            window.showFileImportDialog();
        }
    });

    // Auto Fill MIDI container
    const autoFillContainer = window.$('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: '#f8f9fa',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ddd'
        }
    });

    const autoFillLabel = window.$('span', {
        css: {
            fontSize: '11px',
            color: '#666',
            fontWeight: '500'
        }
    });

    const autoFillInput = window.$('input', {
        type: 'number',
        min: '0',
        max: '127',
        placeholder: 'Root',
        value: '60', // Default to middle C
        css: {
            width: '50px',
            padding: '2px 4px',
            border: '1px solid #ccc',
            borderRadius: '3px',
            fontSize: '11px',
            textAlign: 'center'
        }
    });

    const autoFillButton = window.$('button', {
        text: '🎹 Fill',
        css: {
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '3px',
            fontSize: '11px',
            cursor: 'pointer'
        },
        onClick: () => {
            autoFillMidiNotes();
        }
    });

    autoFillContainer.append(autoFillLabel, autoFillInput, autoFillButton);

    // Sort alphabetically button
    const sortAlphabeticallyButton = window.$('button', {
        text: '🔤 Sort A-Z',
        css: {
            backgroundColor: '#9c27b0',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            sortSongsAlphabetically();
        }
    });

    // Bouton supprimer toutes les chansons
    const deleteAllButton = window.$('button', {
        text: '🗑️',
        css: {
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            window.Modal({
                title: 'Confirmation',
                content: '<p>Voulez-vous vraiment supprimer toutes les chansons ? Cette action est irréversible.</p>',
                buttons: [
                    { text: 'Annuler' },
                    { text: 'Supprimer', onClick: () => {
                        window.lyricsLibrary.deleteAllSongs();
                        document.body.removeChild(modalContainer);
                        // No need for additional confirmation modal - user can see the empty library
                        showSongLibrary(); // Reopen the library to show it's now empty
                    }, css: { backgroundColor: '#e74c3c', color: 'white' } }
                ],
                size: 'small'
            });
        }
    });
    actionButtons.append(createNewSongButton, importFileButton, exportLRXButton, exportTextButton, autoFillContainer, sortAlphabeticallyButton, deleteAllButton);
    headerTop.append(headerTitle, actionButtons);

    // Instructions
    const instructions = window.$('div', {
        text: 'Select a song to load, or use the action buttons above',
        css: {
            fontSize: '14px',
            opacity: '0.9',
            fontStyle: 'italic'
        }
    });

    header.append(headerTop, instructions);

    // Content with search and song list
    const content = window.UIManager.createModalContent({});
    
    // Search input
    const searchInput = window.$('input', {
        type: 'text',
        placeholder: 'Search songs...',
        css: {
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            marginBottom: '15px',
            fontSize: '14px',
            boxSizing: 'border-box'
        }
    });

    // Song list container
    const listContainer = window.UIManager.createListContainer({});
    
    // Prepare items for display
    const songItems = songs.map(song => ({
        text: `${(song.metadata?.title || song.title || 'Untitled')} - ${(song.metadata?.artist || song.artist || 'Unknown Artist')}${(song.metadata?.album || song.album) ? ` (${song.metadata?.album || song.album})` : ''}`,
        value: song.key,
        song: song
    }));

    let filteredItems = [...songItems];

    // Functions to manage custom song order persistence
    function saveCustomSongOrder() {
        const orderData = filteredItems.map((item, index) => ({
            songKey: item.value,
            order: index
        }));
        localStorage.setItem('lyrix_custom_song_order', JSON.stringify(orderData));
        console.log('💾 Custom song order saved to localStorage');
    }

    function loadCustomSongOrder() {
        try {
            const savedOrder = localStorage.getItem('lyrix_custom_song_order');
            if (!savedOrder) {
                console.log('📋 No custom song order found, using default');
                return;
            }

            const orderData = JSON.parse(savedOrder);
            const orderMap = new Map();
            orderData.forEach(item => {
                orderMap.set(item.songKey, item.order);
            });

            // Separate songs with saved order from new songs
            const songsWithOrder = [];
            const newSongs = [];
            
            filteredItems.forEach(item => {
                if (orderMap.has(item.value)) {
                    songsWithOrder.push({
                        ...item,
                        savedOrder: orderMap.get(item.value)
                    });
                } else {
                    newSongs.push(item);
                }
            });

            // Sort songs with saved order
            songsWithOrder.sort((a, b) => a.savedOrder - b.savedOrder);
            
            // Combine: ordered songs first, then new songs at the end
            filteredItems = [
                ...songsWithOrder.map(item => ({ ...item, savedOrder: undefined })),
                ...newSongs
            ];

            console.log(`📋 Custom song order loaded: ${songsWithOrder.length} ordered songs, ${newSongs.length} new songs`);
        } catch (error) {
            console.error('❌ Error loading custom song order:', error);
        }
    }

    // Load custom order on initialization
    loadCustomSongOrder();

    // Function to refresh all MIDI input values
    function refreshMidiInputs() {
        if (!window.midiUtilities) return;
        
        const midiInputs = listContainer.querySelectorAll('input[data-song-key]');
        midiInputs.forEach(input => {
            const songKey = input.getAttribute('data-song-key');
            const midiNote = window.midiUtilities.getMidiAssignment(songKey);
            input.value = midiNote || '';
        });
    }

    // Function to sort songs alphabetically
    function sortSongsAlphabetically() {
        filteredItems.sort((a, b) => {
            const titleA = (a.song.metadata?.title || a.song.title || 'Untitled').toLowerCase();
            const titleB = (b.song.metadata?.title || b.song.title || 'Untitled').toLowerCase();
            return titleA.localeCompare(titleB);
        });
        updateSongList();
        setTimeout(() => refreshMidiInputs(), 50);
        saveCustomSongOrder(); // Save the new order
        console.log('🔤 Songs sorted alphabetically and order saved');
    }

    // Function to auto-fill MIDI notes starting from root note
    function autoFillMidiNotes() {
        if (!window.midiUtilities) {
            console.error('❌ MIDI utilities not available');
            window.Modal({
                title: '❌ Error',
                content: '<p>MIDI utilities not available</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        const rootNoteStr = autoFillInput.value.trim();
        if (!rootNoteStr) {
            console.error('❌ Root note not specified');
            window.Modal({
                title: '❌ Error',
                content: '<p>Please enter a root note (0-127)</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        const rootNote = parseInt(rootNoteStr);
        if (isNaN(rootNote) || rootNote < 0 || rootNote > 127) {
            console.error('❌ Invalid root note');
            window.Modal({
                title: '❌ Error',
                content: '<p>Root note must be between 0 and 127</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        // Perform auto-fill directly
        performAutoFill(rootNote);
    }

    // Function to perform the actual auto-fill
    function performAutoFill(rootNote) {
        let assignedCount = 0;
        let skippedCount = 0;

        filteredItems.forEach((item, index) => {
            const midiNote = rootNote + index;
            
            // Check if MIDI note is in valid range
            if (midiNote > 127) {
                console.warn(`⚠️ Skipping ${item.song.title}: MIDI note ${midiNote} exceeds 127`);
                skippedCount++;
                return;
            }

            try {
                // Remove any existing assignment for this song
                window.midiUtilities.removeMidiAssignment(item.value);
                
                // Set new assignment
                window.midiUtilities.setMidiAssignment(item.value, midiNote);
                assignedCount++;
                
                console.log(`🎹 Auto-assigned: ${item.song.title} -> Note ${midiNote}`);
            } catch (error) {
                console.error(`❌ Error assigning MIDI note to ${item.song.title}:`, error);
                skippedCount++;
            }
        });

        // Refresh MIDI inputs in the UI
        setTimeout(() => refreshMidiInputs(), 100);

        console.log(`🎹 Auto-fill complete: ${assignedCount} assigned, ${skippedCount} skipped`);
    }

    function updateSongList() {
        listContainer.innerHTML = '';
        
        // Check if there are no songs to display
        if (filteredItems.length === 0) {
            const emptyMessage = window.$('div', {
                css: {
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#666',
                    fontSize: '16px'
                }
            });
            
            const emptyIcon = window.$('div', {
                text: '🎵',
                css: {
                    fontSize: '48px',
                    marginBottom: '15px'
                }
            });
            
            const emptyText = window.$('div', {
                text: songs.length === 0 ? 
                    'No songs in your library yet.\nUse the buttons above to create a new song or import existing ones.' : 
                    'No songs match your search.',
                css: {
                    lineHeight: '1.6',
                    whiteSpace: 'pre-line'
                }
            });
            
            emptyMessage.append(emptyIcon, emptyText);
            listContainer.appendChild(emptyMessage);
            return;
        }
        
        filteredItems.forEach((item, index) => {
            const itemDiv = window.UIManager.createListItem({});
            
            // Add drag and drop functionality
            itemDiv.draggable = true;
            itemDiv.dataset.songIndex = index;
            itemDiv.style.cursor = 'grab';
            
            // Add drag handle visual indicator
            const dragHandle = window.$('span', {
                text: '⋮⋮',
                css: {
                    marginRight: '8px',
                    color: '#999',
                    fontSize: '14px',
                    cursor: 'grab',
                    userSelect: 'none'
                }
            });
            
            const textSpan = window.UIManager.createListItemText({
                text: item.text
            });

            // MIDI controls container
            const midiControls = window.$('div', {
                css: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    marginLeft: '10px'
                }
            });

            // MIDI note input box - get fresh value each time the list is updated
            let currentMidiNote = null;
            if (window.midiUtilities) {
                currentMidiNote = window.midiUtilities.getMidiAssignment(item.value);
            }
            
            const midiInput = window.$('input', {
                type: 'number',
                min: '0',
                max: '127',
                placeholder: 'Note',
                value: currentMidiNote || '',
                css: {
                    width: '50px',
                    padding: '2px 4px',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                    fontSize: '11px',
                    textAlign: 'center'
                }
            });
            
            // Store reference to input for updating
            midiInput.setAttribute('data-song-key', item.value);

            // Update MIDI assignment when input changes
            midiInput.addEventListener('change', (e) => {
                e.stopPropagation();
                const midiNote = parseInt(e.target.value);
                if (window.midiUtilities && !isNaN(midiNote) && midiNote >= 0 && midiNote <= 127) {
                    // Remove any existing assignment for this song
                    window.midiUtilities.removeMidiAssignment(item.value);
                    // Set new assignment
                    window.midiUtilities.setMidiAssignment(item.value, midiNote);
                    console.log(`🎹 Manual MIDI assignment: Note ${midiNote} -> ${item.song.title}`);
                } else if (window.midiUtilities && e.target.value === '') {
                    // Remove assignment if input is cleared
                    window.midiUtilities.removeMidiAssignment(item.value);
                    console.log(`🎹 MIDI assignment removed for: ${item.song.title}`);
                }
            });

            // MIDI learn button
            const midiLearnButton = window.$('button', {
                text: '🎹',
                css: {
                    width: '25px',
                    height: '25px',
                    border: '1px solid #007acc',
                    borderRadius: '3px',
                    backgroundColor: '#f0f8ff',
                    color: '#007acc',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0'
                },
                title: `Learn MIDI note for ${item.song.title}`
            });

            // MIDI learn functionality
            midiLearnButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.midiUtilities) {
                    console.error('❌ MIDI utilities not available');
                    return;
                }

                if (window.midiUtilities.isLearning) {
                    // Stop learning
                    window.midiUtilities.stopMidiLearn();
                    midiLearnButton.style.backgroundColor = '#f0f8ff';
                    midiLearnButton.style.color = '#007acc';
                    midiLearnButton.textContent = '🎹';
                    console.log('🎹 MIDI learn stopped');
                } else {
                    // Start learning
                    midiLearnButton.style.backgroundColor = '#ff6b6b';
                    midiLearnButton.style.color = 'white';
                    midiLearnButton.textContent = '⏹️';
                    console.log(`🎹 MIDI learn started for: ${item.song.title}`);
                    
                    window.midiUtilities.startMidiLearn((midiNote) => {
                        console.log(`🎹 MIDI learn callback triggered with note: ${midiNote}`);
                        // Remove any existing assignment for this song
                        window.midiUtilities.removeMidiAssignment(item.value);
                        // Set new assignment
                        window.midiUtilities.setMidiAssignment(item.value, midiNote);
                        // Update input field
                        midiInput.value = midiNote;
                        // Reset button appearance
                        midiLearnButton.style.backgroundColor = '#f0f8ff';
                        midiLearnButton.style.color = '#007acc';
                        midiLearnButton.textContent = '🎹';
                        console.log(`🎹 MIDI learn completed: Note ${midiNote} -> ${item.song.title}`);
                    });
                }
            });

            midiControls.append(midiInput, midiLearnButton);

            // Delete button
            const deleteButton = window.UIManager.createDeleteButton({
                onClick: (e) => {
                    e.stopPropagation();
                    
                    window.ConfirmModal({
                        title: '🗑️ Delete Song',
                        message: `Are you sure you want to delete "${item.song.title}" by ${item.song.artist}?`,
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                        onConfirm: () => {
                            try {
                                // Remove MIDI assignment when deleting song
                                if (window.midiUtilities) {
                                    window.midiUtilities.removeMidiAssignment(item.value);
                                }
                                const success = window.lyricsLibrary.deleteSong(item.value);
                                if (success) {
                                    document.body.removeChild(modalContainer);
                                    showSongLibrary();
                                } else {
                                    console.error('❌ Failed to delete song');
                                }
                            } catch (error) {
                                console.error('❌ Error deleting song:', error);
                            }
                        }
                    });
                }
            });

            // Controls container for MIDI and delete buttons
            const controlsContainer = window.$('div', {
                css: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }
            });

            controlsContainer.append(midiControls, deleteButton);

            // Click handler for song selection
            itemDiv.addEventListener('click', (e) => {
                if (e.target !== deleteButton && 
                    e.target !== midiLearnButton && 
                    e.target !== midiInput && 
                    e.target !== dragHandle &&
                    !midiControls.contains(e.target)) {
                    document.body.removeChild(modalContainer);
                    window.loadAndDisplaySong(item.value);
                }
            });

            // Drag and drop event handlers
            itemDiv.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                itemDiv.style.opacity = '0.5';
                itemDiv.style.cursor = 'grabbing';
            });

            itemDiv.addEventListener('dragend', (e) => {
                itemDiv.style.opacity = '1';
                itemDiv.style.cursor = 'grab';
            });

            itemDiv.addEventListener('dragover', (e) => {
                e.preventDefault();
                itemDiv.style.borderTop = '2px solid #007acc';
            });

            itemDiv.addEventListener('dragleave', (e) => {
                itemDiv.style.borderTop = '';
            });

            itemDiv.addEventListener('drop', (e) => {
                e.preventDefault();
                itemDiv.style.borderTop = '';
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = index;
                
                if (draggedIndex !== targetIndex) {
                    // Reorder the filteredItems array
                    const draggedItem = filteredItems[draggedIndex];
                    filteredItems.splice(draggedIndex, 1);
                    filteredItems.splice(targetIndex, 0, draggedItem);
                    
                    // Update the display
                    updateSongList();
                    setTimeout(() => refreshMidiInputs(), 50);
                    saveCustomSongOrder(); // Save the new order
                    console.log(`🔄 Moved song from position ${draggedIndex} to ${targetIndex} and saved order`);
                }
            });

            itemDiv.append(dragHandle, textSpan, controlsContainer);
            listContainer.appendChild(itemDiv);
        });
    }

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredItems = songItems.filter(item => 
            item.text.toLowerCase().includes(searchTerm)
        );
        updateSongList();
        // Refresh MIDI inputs after search
        setTimeout(() => refreshMidiInputs(), 50);
    });

    content.append(searchInput, listContainer);
    updateSongList();
    
    // Refresh MIDI inputs after DOM is ready
    setTimeout(() => {
        refreshMidiInputs();
        console.log('🎹 MIDI inputs refreshed in song library');
    }, 100);

    // Footer
    const footer = window.UIManager.createModalFooter({});
    
    const cancelButton = window.UIManager.createCancelButton({
        text: 'Close',
        onClick: () => document.body.removeChild(modalContainer)
    });

    footer.appendChild(cancelButton);

    // Assemble modal
    modal.append(header, content, footer);
    modalContainer.appendChild(modal);
    
    // Add to DOM
    document.body.appendChild(modalContainer);

    // Close on overlay click
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            document.body.removeChild(modalContainer);
        }
    });

    // Focus search input
    setTimeout(() => searchInput.focus(), 100);
}
