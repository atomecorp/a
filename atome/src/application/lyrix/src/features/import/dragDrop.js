// Drag and Drop Module for Lyrix Application
// Compatible with Tauri and web browsers

import { SongManager } from '../lyrics/songs.js';
import { SyncedLyrics } from '../../core/syncedLyrics.js';
import { Modal } from '../../components/modal.js';
import { CONSTANTS } from '../../core/constants.js';
import { createSyncedLyricsFromData } from '../lyrics/library.js';
import { debugLog, extractCleanFileName } from '../audio/audio.js';

// iOS-compatible logging function
function dragLog(message) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const prefixedMessage = `⚛️ ATOME-APP: [DRAG-DROP] ${message}`;

    if (isIOS) {
        try {
            if (window.webkit?.messageHandlers?.console) {
            } else {
            }
        } catch (e) {
        }
    } else {
    }
}

export class DragDropManager {
    // Permet de modifier le titre d'une chanson existante
    async editSongTitle(song, newTitle) {
        if (!song || !newTitle || typeof newTitle !== 'string') return false;
        song.metadata.title = newTitle;
        // Regenerate ID if needed
        if (this.lyricsLibrary && this.lyricsLibrary.generateSongId) {
            song.songId = this.lyricsLibrary.generateSongId(newTitle, song.metadata.artist || 'Artiste Inconnu');
        }
        // Save the modified song
        this.lyricsLibrary.saveSong(song);
        if (this.lyricsDisplay && this.lyricsDisplay.displayLyrics) {
            this.lyricsDisplay.displayLyrics(song);
        }
        return true;
    }
    constructor(audioController, lyricsLibrary, lyricsDisplay) {
        this.audioController = audioController;
        this.lyricsLibrary = lyricsLibrary;
        this.lyricsDisplay = lyricsDisplay;
        this.container = null;
        this.dropZone = null;
        this.audioPlayer = null;
        this.currentLyrics = null;
        this.currentAudioFileName = null;
        this.currentAudioMetadata = null;
        this.audioPath = null;
        this.isPlayingInternal = false;
    }

    // Show custom alert using Modal system (currently disabled to avoid pop-ups)
    showCustomAlert(title, message) {
        // Just log to console instead of showing modal

        // Uncomment below to re-enable modal alerts
        /*
        Modal({
            title: title,
            content: $('div', {
                text: message,
                css: {
                    padding: '20px',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap' // Preserve line breaks
                }
            }),
            buttons: [
                {
                    text: 'OK',
                    style: 'primary',
                    action: () => {
                        // Modal closes automatically
                    }
                }
            ]
        });
        */
    }

    initialize(containerElement) {
        this.container = containerElement;
        this.createDropZone();
        this.setupDragAndDropListeners();
    }

    createDropZone() {
        // Remove existing drop zone if any
        const existingDropZone = document.getElementById('drop-zone');
        if (existingDropZone) {
            existingDropZone.remove();
        }

        // Create drop zone using Squirrel syntax
        this.dropZone = $('div', {
            id: 'drop-zone',
            css: {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                background: 'rgba(52, 152, 219, 0.1)',
                border: '2px dashed #3498db',
                display: 'none',
                justifyContent: 'center',
                alignItems: 'center',
                fontSize: '18px',
                color: '#3498db',
                zIndex: '10',
                pointerEvents: 'none',
                flexDirection: 'column',
                textAlign: 'center',
                padding: '20px'
            }
        });

        // Add content to drop zone
        this.createDropZoneContent();

        // Add to container
        if (this.container) {
            this.container.style.position = 'relative';
            this.container.appendChild(this.dropZone);
        }
    }

    setupDragAndDropListeners() {
        if (!this.container || !this.dropZone) return;

        // Add visual feedback
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.container.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Montrer la zone de drop
        this.container.addEventListener('dragenter', (e) => {
            if (this.isDraggedFile(e)) {
                this.dropZone.style.display = 'flex';
                this.container.style.filter = 'brightness(0.8)';
            }
        });

        this.container.addEventListener('dragover', (e) => {
            if (this.isDraggedFile(e)) {
                this.dropZone.style.display = 'flex';
            }
        });

        // Cacher la zone de drop
        this.container.addEventListener('dragleave', (e) => {
            // Verify that we're actually leaving the container
            if (!this.container.contains(e.relatedTarget)) {
                this.dropZone.style.display = 'none';
                this.container.style.filter = '';
            }
        });

        // Handle the drop
        this.container.addEventListener('drop', (e) => {
            this.dropZone.style.display = 'none';
            this.container.style.filter = '';

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleDroppedFiles(files);
            }
        });

    }

    isDraggedFileText(event) {
        const items = event.dataTransfer.items;
        if (!items) return false;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const type = item.type;
                // Check MIME types for text files
                if (type.startsWith('text/') ||
                    type === 'application/json' ||
                    type === '' || // Fichiers sans extension ou .txt
                    item.getAsFile()?.name.match(/\.(txt|lrc|json|md|lyrics)$/i)) {
                    return true;
                }
            }
        }
        return false;
    }

    isDraggedFileAudio(event) {
        const items = event.dataTransfer.items;
        if (!items) return false;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const type = item.type;
                // Check MIME types for audio files
                if (type.startsWith('audio/') ||
                    type.startsWith('video/') ||
                    item.getAsFile()?.name.match(/\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i)) {
                    return true;
                }
            }
        }
        return false;
    }

    isDraggedFile(event) {
        return this.isDraggedFileText(event) || this.isDraggedFileAudio(event);
    }

    async handleDroppedFiles(files) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        // Show processing indicator
        this.showProcessingIndicator(true);

        try {
            if (isIOS) {
                // iOS: Process files sequentially with delays to minimize system conflicts
                await this.processFilesSequentiallyWithDelay(files);
            } else {
                // Desktop: Process files in parallel
                await this.processFilesInParallel(files);
            }
        } catch (error) {
        } finally {
            this.showProcessingIndicator(false);
        }
    }

    async processFilesSequentiallyWithDelay(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                // Add delay between files on iOS to prevent view service issues
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                await this.processFile(file);
            } catch (error) {
                // More specific error handling for iOS
                if (error.message.includes('view service') || error.message.includes('thumbnail')) {
                } else {
                }
            }
        }
    }

    async processFilesInParallel(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            await this.processFile(file);
        }
    }

    async importLRXFile(content) {
        try {

            const importData = JSON.parse(content);

            // Validate LRX format
            if (!importData.songs || !Array.isArray(importData.songs)) {
                throw new Error('Invalid LRX format: missing songs array');
            }

            let importedCount = 0;
            const errors = [];

            // Import each song
            for (const [index, songData] of importData.songs.entries()) {
                try {
                    // Extract metadata with default values 
                    // Check both in metadata and at root level
                    const title = songData.metadata?.title || songData.title || `Imported ${index + 1}`;
                    const artist = songData.metadata?.artist || songData.artist || 'Unknown Artist';
                    const album = songData.metadata?.album || songData.album || '';
                    const duration = songData.metadata?.duration || songData.duration || 0;
                    const songId = songData.songId || `imported_${Date.now()}_${index}`;

                    dragLog(`📦 Importing song: "${title}" by "${artist}"`);

                    // Create SyncedLyrics instance with standard constructor
                    const syncedLyrics = new SyncedLyrics(title, artist, album, duration, songId);

                    // Add other properties
                    syncedLyrics.lines = songData.lines || [];

                    // Assign audioPath in metadata (not directly on the object)
                    if (songData.audioPath) {
                        // MIGRATION: Clean old audioPath format to new format (filename only with spaces)
                        const cleanAudioPath = extractCleanFileName(songData.audioPath);
                        syncedLyrics.metadata.audioPath = cleanAudioPath;

                        dragLog(`📦 Audio path assigned: ${cleanAudioPath}`);

                        // Log migration status
                        if (songData.audioPath !== cleanAudioPath) {
                            dragLog(`🔄 MIGRATED audioPath from: "${songData.audioPath}" to: "${cleanAudioPath}"`);
                        } else {
                            dragLog(`✅ Audio path already in correct format: ${cleanAudioPath}`);
                        }

                        dragLog(`📦 Audio path contains spaces: ${cleanAudioPath.includes(' ')}`);
                        dragLog(`📦 Audio path contains %20: ${cleanAudioPath.includes('%20')}`);
                    }

                    if (songData.syncData) {
                        syncedLyrics.syncData = songData.syncData;
                    }

                    // Merge complete metadata if present
                    if (songData.metadata) {
                        syncedLyrics.metadata = {
                            ...syncedLyrics.metadata,
                            ...songData.metadata
                        };
                    }

                    // Save to library
                    const success = this.lyricsLibrary.saveSong(syncedLyrics);
                    if (success) {
                        importedCount++;
                        dragLog(`✅ Imported song: ${syncedLyrics.metadata.title}`);
                    } else {
                        errors.push(`Failed to save song: ${syncedLyrics.metadata.title}`);
                        dragLog(`❌ Failed to save song: ${syncedLyrics.metadata.title}`);
                    }
                } catch (error) {
                    dragLog(`❌ Error importing song ${index + 1}: ${error.message}`);
                    errors.push(`Error importing song ${index + 1}: ${error.message}`);
                }
            }

            // Log final results
            if (errors.length > 0) {
            } else {
            }

            // Restore MIDI assignments if present in the LRX payload
            if (importData.midiAssignments || importData.midiSpecialAssignments) {
                const midiUtils = window.Lyrix?.midiUtilities;
                if (midiUtils) {
                    if (importData.midiAssignments) {
                        midiUtils.restoreMidiAssignments(importData.midiAssignments);
                        dragLog('🎛️ Restored song MIDI assignments from LRX file');
                    }
                    if (importData.midiSpecialAssignments) {
                        midiUtils.restoreSpecialAssignments(importData.midiSpecialAssignments);
                        dragLog('🎛️ Restored MIDI shortcut assignments from LRX file');
                    }
                }
            }

            return { success: true, imported: importedCount, errors };

        } catch (error) {
            throw error;
        }
    }

    async processFile(file) {
        dragLog(`📂 Processing file: ${file.name} (${file.type}) - ${(file.size / 1024).toFixed(1)} KB`);

        // Check if it's an LRX file (Lyrix library)
        if (this.isLRXFile(file)) {
            try {
                dragLog('📦 Processing LRX file...');
                const content = await this.readFileContent(file);
                dragLog('📦 LRX file content read successfully, starting import...');
                await this.importLRXFile(content);
                dragLog('✅ LRX file processing completed');
                return;
            } catch (error) {
                dragLog(`❌ Error reading LRX file: ${error.message}`);
                throw error;
            }
        }

        // Check if it's a text file (lyrics)
        if (this.isTextFile(file)) {
            dragLog('📄 Processing text file...');
            await this.processTextFile(file);
            return;
        }

        // Check if it's an audio file
        if (this.isAudioFile(file)) {
            dragLog('🎵 Processing audio file...');
            await this.processAudioFile(file);
            return;
        }

        // Unsupported file type
        dragLog(`⚠️ Unsupported file type: ${file.name} (${file.type})`);
        throw new Error(`Type de fichier non supporté: ${file.type}`);
    }

    // Process text file (lyrics)
    async processTextFile(file) {
        try {
            const content = await this.readFileContent(file);

            const filename = file.name;
            await this.createSongFromText(filename, content);
        } catch (error) {
            throw error;
        }
    }

    // Process audio file
    async processAudioFile(file) {
        try {
            await this.loadAudioFileAsync(file);
            // Après chargement audio, tenter copie dans stockage local (Recordings/)
            try {
                const destPath = await this.copyAudioFileToLocal(file);
                if (destPath) {
                    await this.refreshSongAudioBinding(destPath, file.name);
                }
            } catch (copyErr) {
                dragLog(`⚠️ Audio copy skipped: ${copyErr.message}`);
            }
        } catch (error) {
            throw error;
        }
    }

    // Afficher/masquer l'indicateur de traitement
    showProcessingIndicator(show) {
        if (!this.dropZone) return;

        if (show) {
            // No visual feedback during processing
        } else {
            // Restore original content when done
            this.createDropZoneContent();
        }
    }

    // Create drop zone content
    createDropZoneContent() {
        if (!this.dropZone) return;

        this.dropZone.innerHTML = '';

        const dropText = $('div', {
            text: '📄 Déposez un fichier texte (.txt, .lrc) ici pour créer une nouvelle chanson',
            css: {
                marginBottom: '10px',
                fontWeight: 'bold'
            }
        });

        const dropSubText = $('div', {
            text: '🎵 Ou un fichier audio (MP3, MP4, WAV, etc.) pour ajouter la musique',
            css: {
                fontSize: '16px',
                marginBottom: '10px'
            }
        });

        const dropLRXText = $('div', {
            text: '📦 Ou un fichier .lrx pour importer une bibliothèque complète',
            css: {
                fontSize: '16px',
                marginBottom: '10px',
                color: '#e67e22'
            }
        });

        const dropHint = $('div', {
            text: '💡 Glissez et déposez vos fichiers depuis l\'explorateur',
            css: {
                fontSize: '14px',
                fontStyle: 'italic',
                color: '#2980b9'
            }
        });

        this.dropZone.append(dropText, dropSubText, dropLRXText, dropHint);
    }

    isTextFile(file) {
        // Check MIME type
        if (file.type.startsWith('text/') ||
            file.type === 'application/json' ||
            file.type === '') {
            return true;
        }

        // Check extension
        const validExtensions = /\.(txt|lrc|lrx|json|md|lyrics)$/i;
        return validExtensions.test(file.name);
    }

    isAudioFile(file) {
        // Check MIME type
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
            return true;
        }

        // Check extension
        const validExtensions = /\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i;
        return validExtensions.test(file.name);
    }

    isLRXFile(file) {
        // Check .lrx extension
        return /\.lrx$/i.test(file.name);
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            // iOS: Add timeout to prevent hanging
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS) {
                const timeout = setTimeout(() => {
                    reader.abort();
                    reject(new Error('iOS file read timeout'));
                }, 10000); // 10 second timeout for iOS

                reader.onload = (e) => {
                    clearTimeout(timeout);
                    resolve(e.target.result);
                };

                reader.onerror = (e) => {
                    clearTimeout(timeout);
                    reject(new Error('iOS file read error'));
                };
            } else {
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error('Erreur de lecture du fichier'));
            }

            reader.readAsText(file, 'UTF-8');
        });
    }



    async createSongFromText(filename, content) {
        try {
            // Extraire le nom du fichier sans extension pour le titre
            const title = filename.replace(/\.[^/.]+$/, '');

            // Check if it's an LRC file (karaoke)
            if (filename.toLowerCase().endsWith('.lrc')) {
                await this.createSongFromLRC(title, content);
                return;
            }

            // Traiter comme fichier texte simple
            await this.createSongFromPlainText(title, content);

        } catch (error) {
        }
    }

    async createSongFromLRC(title, lrcContent) {
        try {

            // Use existing method to parse LRC
            const syncedLyrics = SyncedLyrics.fromLRC(lrcContent);

            // Si le titre/artiste n'est pas dans le LRC, utiliser le nom du fichier
            if (!syncedLyrics.metadata.title) {
                syncedLyrics.metadata.title = title;
            }
            if (!syncedLyrics.metadata.artist) {
                syncedLyrics.metadata.artist = 'Artiste Inconnu';
            }

            // Regenerate ID with new metadata
            syncedLyrics.songId = this.lyricsLibrary.generateSongId(
                syncedLyrics.metadata.title,
                syncedLyrics.metadata.artist
            );


            // Sauvegarder et charger
            const saved = this.lyricsLibrary.saveSong(syncedLyrics);

            if (this.lyricsDisplay && this.lyricsDisplay.displayLyrics) {
                this.lyricsDisplay.displayLyrics(syncedLyrics);
                this.currentLyrics = syncedLyrics;

                // Notify main application that a song was loaded
                if (this.onSongLoaded) {
                    this.onSongLoaded(syncedLyrics);
                }
            } else {
            }

            // Success message in console instead of modal
            return syncedLyrics;

        } catch (error) {
            // Fallback vers texte simple
            await this.createSongFromPlainText(title, lrcContent);
        }
    }

    async createSongFromPlainText(title, textContent) {
        try {

            // Create new song directly via library
            const newSong = this.lyricsLibrary.createSong(title, 'Artiste Inconnu', '');

            if (!newSong) {
                throw new Error('Impossible de créer la chanson');
            }


            // Diviser le texte en lignes
            const lines = textContent.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);


            // Ajouter chaque ligne avec un timecode automatique (5 secondes entre chaque ligne)
            lines.forEach((line, index) => {
                const timeMs = index * 5000; // 5 secondes entre chaque ligne
                newSong.addLine(timeMs, line, 'vocal');
            });

            // If no lines were added, add a default line
            if (lines.length === 0) {
                newSong.addLine(0, 'Paroles importées du fichier...', 'vocal');
            }


            // Sauvegarder et charger
            const saved = this.lyricsLibrary.saveSong(newSong);

            if (this.lyricsDisplay && this.lyricsDisplay.displayLyrics) {
                this.lyricsDisplay.displayLyrics(newSong);
                this.currentLyrics = newSong;

                // Notify main application that a song was loaded
                if (this.onSongLoaded) {
                    this.onSongLoaded(newSong);
                }
            } else {
            }

            // Success message in console instead of modal
            return newSong;

        } catch (error) {
            throw error;
        }
    }

    loadAudioFile(file) {
        // Use filepath with BASE_PATH prefix for storage, but pass only filename to AudioController
        const fileName = file.name;
        const fileSize = file.size;
        const lastModified = file.lastModified;

        // Create the audio file path with BASE_PATH prefix for storage
        const audioFilePath = `${CONSTANTS.AUDIO.BASE_PATH}${fileName}`;

        // Create unique identifier for file based on its properties
        const fileId = `${fileName}_${fileSize}_${lastModified}`;

        // Create file metadata with path
        const audioMetadata = {
            fileName: fileName,
            fileSize: fileSize,
            lastModified: lastModified,
            fileId: fileId,
            filePath: audioFilePath
        };

        // If a song is currently loaded, associate the file path
        if (this.currentLyrics) {
            // Store ONLY the filename (not the full path) for .lrx files
            // This prevents issues with URL encoding and allows proper path normalization
            const cleanFileName = extractCleanFileName(fileName);
            this.currentLyrics.setAudioPath(cleanFileName);
            debugLog('AUDIO-LOAD', 'Set audioPath to clean filename', { original: fileName, clean: cleanFileName });

            // Sauvegarder les changements
            if (this.lyricsLibrary) {
                this.lyricsLibrary.saveSong(this.currentLyrics);
            }

            // Notify main application that the song was updated with audio
            if (this.onSongLoaded) {
                this.onSongLoaded(this.currentLyrics);
            }
        }

        // Load the audio for playback using just the filename (AudioManager will handle the URL creation)
        if (this.audioController && this.audioController.loadAudio) {
            this.audioController.loadAudio(fileName);
        }

        // Store references
        this.audioPath = audioFilePath;
        this.currentAudioFileName = fileName;
        this.currentAudioMetadata = audioMetadata;

        // Afficher le nom de fichier avec la taille
        const sizeInMB = (fileSize / (1024 * 1024)).toFixed(1);

        // Audio file loaded successfully - update the audio player title

        // Update the audio player title directly
        this.updateAudioPlayerTitle(fileName);
    }

    // iOS-enhanced audio file loading with retry mechanism
    async loadAudioFileWithRetry(file, maxRetries = 2) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // On iOS, add delay for first attempt to prevent view service issues
                if (isIOS && attempt === 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                await this.loadAudioFileAsync(file);
                return; // Success, exit retry loop

            } catch (error) {

                // Check for iOS-specific errors
                if (isIOS && (error.message.includes('view service') || error.message.includes('thumbnail'))) {
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, attempt * 500));
                        continue;
                    } else {
                        throw new Error(`iOS file loading failed after ${maxRetries} attempts. Try selecting one file at a time.`);
                    }
                }

                // For other errors, don't retry
                throw error;
            }
        }
    }

    // Async wrapper for loadAudioFile
    // Async wrapper for loadAudioFile with iOS enhancements
    async loadAudioFileAsync(file) {
        return new Promise((resolve, reject) => {
            try {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

                if (isIOS) {
                    // iOS-specific file handling
                    this.loadAudioFileIOS(file, resolve, reject);
                } else {
                    // Standard file handling
                    this.loadAudioFile(file);
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // iOS-specific audio file loading with enhanced memory management
    loadAudioFileIOS(file, resolve, reject) {
        try {

            // Check memory constraints before processing
            if (file.size > 50 * 1024 * 1024) { // 50MB limit for iOS
            }

            // Enhanced object URL creation with error handling
            let fileURL;
            try {
                fileURL = URL.createObjectURL(file);
            } catch (urlError) {
                reject(new Error(`iOS file URL creation failed: ${urlError.message}`));
                return;
            }

            const fileName = file.name;
            const fileSize = file.size;
            const lastModified = file.lastModified;

            // Create file metadata for iOS with enhanced error checking
            const audioMetadata = {
                fileName: fileName,
                fileSize: fileSize,
                lastModified: lastModified,
                fileId: `${fileName}_${fileSize}_${lastModified}`,
                filePath: fileURL,
                isObjectURL: true,
                platform: 'iOS',
                created: new Date().toISOString()
            };

            // Associate with current lyrics if available
            if (this.currentLyrics) {
                try {
                    // Store ONLY the filename (not the full metadata) for .lrx files
                    // This prevents URL encoding issues and allows proper path normalization
                    const cleanFileName = extractCleanFileName(fileName);
                    this.currentLyrics.setAudioPath(cleanFileName);
                    debugLog('iOS-AUDIO-LOAD', 'Set audioPath to clean filename', { original: fileName, clean: cleanFileName });

                    if (this.lyricsLibrary) {
                        this.lyricsLibrary.saveSong(this.currentLyrics);
                    }

                    if (this.onSongLoaded) {
                        this.onSongLoaded(this.currentLyrics);
                    }
                } catch (saveError) {
                    // Continue processing despite save error
                }
            }

            // Load audio with iOS-specific handling and timeout
            if (this.audioController) {
                const loadTimeout = setTimeout(() => {
                    reject(new Error('iOS audio loading timeout after 30 seconds'));
                }, 30000);

                try {
                    // Enhanced iOS audio loading
                    if (this.audioController.loadFromUrl) {

                        // Add success listener before loading
                        const loadSuccessHandler = () => {
                            clearTimeout(loadTimeout);
                            this.audioController.off('loaded', loadSuccessHandler);
                            this.audioController.off('error', loadErrorHandler);
                            resolve();
                        };

                        const loadErrorHandler = (error) => {
                            clearTimeout(loadTimeout);
                            this.audioController.off('loaded', loadSuccessHandler);
                            this.audioController.off('error', loadErrorHandler);

                            // Clean up object URL on error
                            URL.revokeObjectURL(fileURL);
                            reject(error);
                        };

                        this.audioController.on('loaded', loadSuccessHandler);
                        this.audioController.on('error', loadErrorHandler);

                        // Load with delay for iOS stability
                        setTimeout(() => {
                            const loadResult = this.audioController.loadFromUrl(fileURL);
                            if (!loadResult) {
                                clearTimeout(loadTimeout);
                                this.audioController.off('loaded', loadSuccessHandler);
                                this.audioController.off('error', loadErrorHandler);
                                reject(new Error('Failed to initiate iOS audio loading'));
                            }
                        }, 300);

                    } else {
                        // Fallback to standard loading
                        clearTimeout(loadTimeout);
                        this.loadAudioFile(file);
                        resolve();
                    }
                } catch (loadError) {
                    clearTimeout(loadTimeout);
                    URL.revokeObjectURL(fileURL);
                    reject(loadError);
                }
            } else {
                URL.revokeObjectURL(fileURL);
                reject(new Error('Audio controller not available'));
                return;
            }

            // Store references
            this.audioPath = fileURL;
            this.currentAudioFileName = fileName;
            this.currentAudioMetadata = audioMetadata;

            const sizeInMB = (fileSize / (1024 * 1024)).toFixed(1);

        } catch (error) {
            reject(error);
        }
    }

    // Get current audio file name
    getAudioFileName() {
        return this.currentAudioFileName;
    }

    // Get current audio path - returns metadata if stored as JSON
    getAudioPath() {
        if (this.currentLyrics && this.currentLyrics.getAudioPath()) {
            const audioPath = this.currentLyrics.getAudioPath();
            try {
                // Try to parse as JSON metadata
                const metadata = JSON.parse(audioPath);
                return metadata.fileName; // Return the original filename
            } catch (e) {
                // If not JSON, return as-is (for backward compatibility)
                return audioPath;
            }
        }
        return null;
    }

    // Check if audio is loaded
    hasAudio() {
        return !!(this.currentLyrics && this.currentLyrics.getAudioPath());
    }

    // Clear current audio
    clearAudio() {
        if (this.audioPath && this.audioPath.startsWith('blob:')) {
            URL.revokeObjectURL(this.audioPath);
        }
        this.audioPath = null;
        this.currentAudioFileName = null;

        if (this.currentLyrics) {
            this.currentLyrics.setAudioPath('');
            if (this.lyricsLibrary) {
                this.lyricsLibrary.saveSong(this.currentLyrics);
            }
        }

        if (this.audioController && this.audioController.clearAudio) {
            this.audioController.clearAudio();
        }
    }

    // Set current lyrics reference
    setCurrentLyrics(lyrics) {
        this.currentLyrics = lyrics;
    }

    // Update the audio player title in the UI
    updateAudioPlayerTitle(fileName) {
        try {
            // Find the audio player title element
            const audioTitleElement = document.getElementById('audio-player-title');
            if (audioTitleElement) {
                // Clean the filename and decode URL encoding
                const cleanFileName = decodeURIComponent(fileName);
                audioTitleElement.textContent = cleanFileName;
            } else {
            }
        } catch (error) {
        }
    }

    // Cleanup method
    destroy() {
        this.clearAudio();

        if (this.container && this.dropZone) {
            this.dropZone.remove();
        }

        this.container = null;
        this.dropZone = null;
        this.audioController = null;
        this.lyricsLibrary = null;
        this.lyricsDisplay = null;
    }

    // -------------------------------------------------------------
    // Copie du fichier audio importé dans le stockage local iOS/Files
    // -------------------------------------------------------------
    async copyAudioFileToLocal(file) {
        if (!file) { dragLog('🚫 copyAudioFileToLocal: file null'); return; }
        if (!this.isAudioFile(file)) { dragLog('🚫 copyAudioFileToLocal: pas audio'); return; }
        const bridgeOk = !!(window.AtomeFileSystem && window.webkit?.messageHandlers?.fileSystem);
        if (!bridgeOk) {
            dragLog('⚠️ copyAudioFileToLocal: bridge fileSystem absent -> fallback (pas de copie native)');
            return; // on pourrait ajouter un fallback download si nécessaire
        }
        // Ne pas copier > 120MB (limite arbitraire pour éviter mémoire excessive)
        if (file.size > 120 * 1024 * 1024) throw new Error('fichier trop volumineux pour copie');
        // Enregistrer désormais directement à la racine du dossier local (pas dans Recordings/)
        const baseFolder = ''; // racine
        const originalName = file.name;
        const finalName = await this.computeAvailableFileName(baseFolder, originalName);
        const relPath = finalName; // pas de préfixe dossier
        dragLog(`📥 Préparation copie audio vers racine: ${relPath} (size=${(file.size / 1024).toFixed(1)}KB type=${file.type || 'n/a'})`);

        const arrayBuffer = await file.arrayBuffer();
        const b64 = this.arrayBufferToBase64(arrayBuffer);
        // Utiliser le marqueur __BASE64__ pour déclencher décodage côté Swift
        try {
            await this.saveViaBridge(relPath, '__BASE64__' + b64);
            dragLog(`✅ Audio copié localement: ${relPath}`);
        } catch (err) {
            dragLog(`❌ Echec saveViaBridge: ${err.message}`);
            return;
        }
        // Déclenche une synchronisation serveur pour exposer immédiatement ce fichier via /audio & /tree
        this.triggerServerSync();
        return relPath;
    }

    async computeAvailableFileName(folder, desiredName) {
        // Récup liste existante
        const existing = await this.listFilesPromise(folder || '.').catch(() => []);
        const existingNames = new Set(existing.map(f => f.name));
        if (!existingNames.has(desiredName)) return desiredName;
        const dot = desiredName.lastIndexOf('.');
        const base = dot > 0 ? desiredName.slice(0, dot) : desiredName;
        const ext = dot > 0 ? desiredName.slice(dot) : '';
        let idx = 1;
        while (existingNames.has(base + `_${idx}` + ext)) idx++;
        return base + `_${idx}` + ext;
    }

    listFilesPromise(folder) {
        return new Promise((resolve, reject) => {
            window.fileSystemCallback = function (res) {
                if (res.success) resolve(res.data.files || []); else reject(new Error(res.error || 'listFiles error'));
            };
            window.webkit.messageHandlers.fileSystem.postMessage({ action: 'listFiles', folder });
        });
    }

    saveViaBridge(path, data) {
        return new Promise((resolve, reject) => {
            window.fileSystemCallback = function (res) {
                if (res.success) resolve(); else reject(new Error(res.error || 'save error'));
            };
            window.webkit.messageHandlers.fileSystem.postMessage({ action: 'saveFile', path, data });
        });
    }

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.length;
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        // btoa peut échouer si très large; segmentation possible si besoin futur
        return btoa(binary);
    }

    // -------------------------------------------------------------
    // Déclenche un /sync_now sur le serveur local (si port connu)
    // -------------------------------------------------------------
    triggerServerSync() {
        try {
            const port = (window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__ || null);
            if (!port) { dragLog('ℹ️ Port serveur inconnu, sync immédiate sautée'); return; }
            fetch(`http://127.0.0.1:${port}/sync_now`).then(r => {
                if (!r.ok) dragLog('⚠️ /sync_now HTTP ' + r.status); else dragLog('🔄 /sync_now déclenché');
            }).catch(err => dragLog('⚠️ /sync_now erreur: ' + err.message));
        } catch (err) { /* ignore */ }
    }

    // -------------------------------------------------------------
    // Rafraîchit la chanson courante si le nom final diffère (collision renommée)
    // et recharge l'audio avec le nom réel copié sur disque.
    // -------------------------------------------------------------
    async refreshSongAudioBinding(destPath, originalName) {
        try {
            const newFileName = destPath.split('/').pop();
            if (!newFileName) return;
            if (this.currentLyrics) {
                const currentStored = this.currentLyrics.getAudioPath && this.currentLyrics.getAudioPath();
                // currentStored peut être l'ancien nom (originalName) – si différent on met à jour
                if (!currentStored || extractCleanFileName(currentStored) !== extractCleanFileName(newFileName)) {
                    this.currentLyrics.setAudioPath(newFileName);
                    if (this.lyricsLibrary) { this.lyricsLibrary.saveSong(this.currentLyrics); }
                    dragLog(`🔁 Song audioPath mis à jour -> ${newFileName}`);
                    // Recharger l'audio avec le vrai nom final si différent
                    if (this.audioController && this.audioController.loadAudio) {
                        this.audioController.loadAudio(newFileName);
                    }
                    // Notifier UI
                    if (this.onSongLoaded) { this.onSongLoaded(this.currentLyrics); }
                }
            }
        } catch (e) {
            dragLog(`⚠️ refreshSongAudioBinding erreur: ${e.message}`);
        }
    }
}

export default DragDropManager;
