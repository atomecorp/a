// Song Library Modal Component
// Handles all song library functionality including MIDI controls, export, import, and sorting

// Show song library
export function showSongLibrary() {
    if (window.midiUtilities) {
    }
    
    if (!window.lyricsLibrary) {
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
    
    // Create inline panel instead of modal - insert between toolbar and lyrics
    const toolbar = document.querySelector('#lyrics-toolbar, .lyrics-toolbar, [id*="toolbar"]') || 
                   document.querySelector('#lyrix_app > div:first-child');
    const lyricsContainer = document.querySelector('#lyrics-content, #lyrics_lines_container, .lyrics-container') || 
                           document.querySelector('#lyrix_app > div:last-child');
    
    // Remove existing song library panel if it exists
    const existingPanel = document.getElementById('song-library-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    // Create panel container (not modal)
    const modalContainer = window.$('div', {
        id: 'song-library-panel',
        css: {
            width: '100%',
            height: '400px',
            backgroundColor: '#ffffff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            margin: '10px 0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }
    });
    
    const modal = window.$('div', {
        id: 'song-library-modal',
        css: { 
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
        }
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
        id: 'song-library-header-top',
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
            modalContainer.remove();
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
            modalContainer.remove();
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
            modalContainer.remove();
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
            modalContainer.remove();
            // Local file import dialog implementation to ensure .lrx files are accepted
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = false;
            // Don't use accept attribute to allow all file types including .lrx
            input.style.display = 'none';
            
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        // Use the drag drop manager to process the file
                        if (window.Lyrix && window.Lyrix.dragDropManager) {
                            await window.Lyrix.dragDropManager.processFile(file);
                        } else if (window.dragDropManager) {
                            await window.dragDropManager.processFile(file);
                        } else {
                        }
                        // Refresh the song library display
                        if (window.showSongLibrary) {
                            window.showSongLibrary();
                        }
                    } catch (error) {
                        if (window.Modal) {
                            window.Modal({
                                title: '❌ File Import Error',
                                content: `<p>Failed to import file: ${error.message}</p>`,
                                buttons: [{ text: 'OK' }],
                                size: 'small'
                            });
                        }
                    }
                }
                // Clean up
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            });
            
            document.body.appendChild(input);
            input.click();
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
                        modalContainer.remove();
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



    header.append(headerTop);

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
    }

    function loadCustomSongOrder() {
        try {
            const savedOrder = localStorage.getItem('lyrix_custom_song_order');
            if (!savedOrder) {
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

        } catch (error) {
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
    }

    // Function to auto-fill MIDI notes starting from root note
    function autoFillMidiNotes() {
        if (!window.midiUtilities) {
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
                skippedCount++;
                return;
            }

            try {
                // Remove any existing assignment for this song
                window.midiUtilities.removeMidiAssignment(item.value);
                
                // Set new assignment
                window.midiUtilities.setMidiAssignment(item.value, midiNote);
                assignedCount++;
                
            } catch (error) {
                skippedCount++;
            }
        });

        // Refresh MIDI inputs in the UI
        setTimeout(() => refreshMidiInputs(), 100);

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
                } else if (window.midiUtilities && e.target.value === '') {
                    // Remove assignment if input is cleared
                    window.midiUtilities.removeMidiAssignment(item.value);
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
                    return;
                }

                if (window.midiUtilities.isLearning) {
                    // Stop learning
                    window.midiUtilities.stopMidiLearn();
                    midiLearnButton.style.backgroundColor = '#f0f8ff';
                    midiLearnButton.style.color = '#007acc';
                    midiLearnButton.textContent = '🎹';
                } else {
                    // Start learning
                    midiLearnButton.style.backgroundColor = '#ff6b6b';
                    midiLearnButton.style.color = 'white';
                    midiLearnButton.textContent = '⏹️';
                    
                    window.midiUtilities.startMidiLearn((midiNote) => {
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
                                    modalContainer.remove();
                                    showSongLibrary();
                                } else {
                                }
                            } catch (error) {
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
                    modalContainer.remove();
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
    }, 100);

    // Assemble panel (without footer/close button)
    modal.append(header, content);
    modalContainer.appendChild(modal);
    
    // Insert between toolbar and lyrics (not as modal overlay)
    if (toolbar && lyricsContainer) {
        if (toolbar.nextSibling) {
            toolbar.parentNode.insertBefore(modalContainer, toolbar.nextSibling);
        } else {
            toolbar.parentNode.appendChild(modalContainer);
        }
    } else {
        // Fallback: add to body if toolbar/lyrics not found
        document.body.appendChild(modalContainer);
    }

    // Focus search input
    setTimeout(() => searchInput.focus(), 100);
}
