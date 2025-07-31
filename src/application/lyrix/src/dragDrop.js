// Drag and Drop Module for Lyrix Application
// Compatible with Tauri and web browsers

import { SongManager } from './songs.js';
import { SyncedLyrics } from './syncedLyrics.js';
import { Modal } from './modal.js';
import { CONSTANTS } from './constants.js';

export class DragDropManager {
    // Permet de modifier le titre d'une chanson existante
    async editSongTitle(song, newTitle) {
        if (!song || !newTitle || typeof newTitle !== 'string') return false;
        song.metadata.title = newTitle;
        // Regénérer l'ID si besoin
        if (this.lyricsLibrary && this.lyricsLibrary.generateSongId) {
            song.songId = this.lyricsLibrary.generateSongId(newTitle, song.metadata.artist || 'Artiste Inconnu');
        }
        // Sauvegarder la chanson modifiée
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
        console.log(`${title}: ${message}`);
        
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
            // Vérifier que nous sortons vraiment du conteneur
            if (!this.container.contains(e.relatedTarget)) {
                this.dropZone.style.display = 'none';
                this.container.style.filter = '';
            }
        });

        // Gérer le drop
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
                // Vérifier les types MIME pour les fichiers texte
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
                // Vérifier les types MIME pour les fichiers audio
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
        // iOS detection for enhanced error handling
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        // Afficher un indicateur de traitement
        this.showProcessingIndicator(true);
        
        // Process files sequentially on iOS to avoid thumbnail/view service issues
        if (isIOS) {
            await this.processFilesSequentiallyWithDelay(files);
        } else {
            await this.processFilesInParallel(files);
        }
        
        // Masquer l'indicateur de traitement
        this.showProcessingIndicator(false);
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
                console.error('❌ iOS file processing error:', error);
                // More specific error handling for iOS
                if (error.message.includes('view service') || error.message.includes('thumbnail')) {
                    console.error(`Failed to process ${file.name}. Try selecting files one at a time.`);
                } else {
                    console.error(`Error processing ${file.name}: ${error.message}`);
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

    async processFile(file) {
        // Vérifier si c'est un fichier LRX (Lyrix library)
        if (this.isLRXFile(file)) {
            try {
                const content = await this.readFileContent(file);
                await this.importLRXFile(content);
            } catch (error) {
                console.error('❌ Erreur lecture fichier LRX:', error);
                console.error(`Erreur lors de la lecture du fichier LRX ${file.name}: ${error.message}`);
            }
        }
        // Vérifier si c'est un fichier texte
        else if (this.isTextFile(file)) {
            try {
                const content = await this.readFileContent(file);
                await this.createSongFromText(file.name, content);
            } catch (error) {
                console.error('❌ Erreur lecture fichier:', error);
                console.error(`Erreur lors de la lecture du fichier ${file.name}: ${error.message}`);
            }
        }
        // Vérifier si c'est un fichier audio
        else if (this.isAudioFile(file)) {
            try {
                await this.loadAudioFileWithRetry(file);
            } catch (error) {
                console.error('❌ Erreur chargement audio:', error);
                console.error(`Erreur lors du chargement du fichier audio ${file.name}: ${error.message}`);
            }
        }
        else {
            console.warn('⚠️ Fichier ignoré (format non supporté):', file.name);
            console.warn(`Le fichier "${file.name}" n'est pas un format supporté (texte, audio ou .lrx).`);
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

    // Créer le contenu de la zone de drop
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
        // Vérifier le type MIME
        if (file.type.startsWith('text/') || 
            file.type === 'application/json' ||
            file.type === '') {
            return true;
        }

        // Vérifier l'extension
        const validExtensions = /\.(txt|lrc|json|md|lyrics)$/i;
        return validExtensions.test(file.name);
    }

    isAudioFile(file) {
        // Vérifier le type MIME
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
            return true;
        }

        // Vérifier l'extension
        const validExtensions = /\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i;
        return validExtensions.test(file.name);
    }

    isLRXFile(file) {
        // Vérifier l'extension .lrx
        return /\.lrx$/i.test(file.name);
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Erreur de lecture du fichier'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    async importLRXFile(content) {
        try {
            console.log('📥 Importing LRX file...');
            
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
                    // Crée une instance SyncedLyrics pour chaque chanson importée
                    const syncedLyrics = new SyncedLyrics(
                        songData.metadata?.title || `Imported ${index + 1}`,
                        songData.metadata?.artist || 'Unknown',
                        songData.metadata?.album || '',
                        songData.metadata?.duration || 0,
                        songData.songId || `imported_${Date.now()}_${index}`
                    );
                    syncedLyrics.lines = songData.lines || [];
                    syncedLyrics.audioPath = songData.audioPath;
                    syncedLyrics.syncData = songData.syncData;
                    syncedLyrics.metadata = songData.metadata || {};

                    // Ajoute à la bibliothèque
                    const success = this.lyricsLibrary.saveSong(syncedLyrics);
                    if (success) {
                        importedCount++;
                        console.log(`✅ Imported song: ${syncedLyrics.metadata.title || 'Unknown'}`);
                    } else {
                        errors.push(`Failed to import song: ${syncedLyrics.metadata.title || 'Unknown'}`);
                    }
                } catch (error) {
                    errors.push(`Error importing song ${index + 1}: ${error.message}`);
                }
            }

            // Show results
            const message = errors.length > 0 
                ? `Imported ${importedCount} songs successfully. Errors: ${errors.join(', ')}`
                : `Successfully imported ${importedCount} songs from LRX file.`;

            console.log(`📥 LRX Import: ${message}`);
            
            // Show modal with results
            Modal({
                title: '📥 LRX Import Complete',
                content: `<p>${message}</p>`,
                buttons: [{ text: 'OK' }],
                size: 'medium'
            });

            return { success: true, imported: importedCount, errors };

        } catch (error) {
            console.error('❌ Error importing LRX file:', error);
            
            Modal({
                title: '❌ LRX Import Error',
                content: `<p>Failed to import LRX file: ${error.message}</p>`,
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            
            throw error;
        }
    }

    async createSongFromText(filename, content) {
        try {
            // Extraire le nom du fichier sans extension pour le titre
            const title = filename.replace(/\.[^/.]+$/, '');

            // Vérifier si c'est un fichier LRC (karaoké)
            if (filename.toLowerCase().endsWith('.lrc')) {
                await this.createSongFromLRC(title, content);
                return;
            }

            // Traiter comme fichier texte simple
            await this.createSongFromPlainText(title, content);

        } catch (error) {
            console.error('❌ Erreur création chanson:', error);
            console.error(`Erreur lors de la création de la chanson: ${error.message}`);
        }
    }

    async createSongFromLRC(title, lrcContent) {
        try {
            // Utiliser la méthode existante pour parser le LRC
            const syncedLyrics = SyncedLyrics.fromLRC(lrcContent);

            // Si le titre/artiste n'est pas dans le LRC, utiliser le nom du fichier
            if (!syncedLyrics.metadata.title) {
                syncedLyrics.metadata.title = title;
            }
            if (!syncedLyrics.metadata.artist) {
                syncedLyrics.metadata.artist = 'Artiste Inconnu';
            }

            // Régénérer l'ID avec les nouvelles métadonnées
            syncedLyrics.songId = this.lyricsLibrary.generateSongId(
                syncedLyrics.metadata.title, 
                syncedLyrics.metadata.artist
            );

            // Sauvegarder et charger
            this.lyricsLibrary.saveSong(syncedLyrics);
            
            if (this.lyricsDisplay && this.lyricsDisplay.displayLyrics) {
                this.lyricsDisplay.displayLyrics(syncedLyrics);
                this.currentLyrics = syncedLyrics;
                
                // Notify main application that a song was loaded
                if (this.onSongLoaded) {
                    this.onSongLoaded(syncedLyrics);
                }
            }
            
            // Success message in console instead of modal
            console.log(`✅ Chanson LRC "${syncedLyrics.metadata.title}" créée avec ${syncedLyrics.lines.length} lignes synchronisées!`);

        } catch (error) {
            console.error('❌ Erreur parsing LRC:', error);
            // Fallback vers texte simple
            await this.createSongFromPlainText(title, lrcContent);
        }
    }

    async createSongFromPlainText(title, textContent) {
        try {
            // Créer une nouvelle chanson via SongManager
            const newSong = SongManager.create(title, 'Artiste Inconnu', '', this.lyricsLibrary);

            if (!newSong) {
                throw new Error('Impossible de créer la chanson');
            }

            // Diviser le texte en lignes
            const lines = textContent.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Remplacer les lignes existantes (vider le tableau)
            newSong.lines = [];

            // Ajouter chaque ligne avec un timecode automatique (5 secondes entre chaque ligne)
            lines.forEach((line, index) => {
                const timeMs = index * 5000; // 5 secondes entre chaque ligne
                newSong.addLine(timeMs, line, 'vocal');
            });

            // Si aucune ligne n'a été ajoutée, ajouter une ligne par défaut
            if (lines.length === 0) {
                newSong.addLine(0, 'Paroles importées du fichier...', 'vocal');
            }

            // Sauvegarder et charger
            this.lyricsLibrary.saveSong(newSong);
            
            if (this.lyricsDisplay && this.lyricsDisplay.displayLyrics) {
                this.lyricsDisplay.displayLyrics(newSong);
                this.currentLyrics = newSong;
                
                // Notify main application that a song was loaded
                if (this.onSongLoaded) {
                    this.onSongLoaded(newSong);
                }
            }
            
            // Success message in console instead of modal
            console.log(`✅ Chanson "${title}" créée avec ${lines.length} lignes! Vous pouvez maintenant éditer les timecodes en mode édition.`);
        } catch (error) {
            console.error('❌ Erreur création chanson texte:', error);
            console.error(`Erreur lors de la création de la chanson: ${error.message}`);
        }
    }

    loadAudioFile(file) {
        // Use filepath with BASE_PATH prefix for storage, but pass only filename to AudioController
        const fileName = file.name;
        const fileSize = file.size;
        const lastModified = file.lastModified;
        
        // Create the audio file path with BASE_PATH prefix for storage
        const audioFilePath = `${CONSTANTS.AUDIO.BASE_PATH}${fileName}`;
        
        // Créer un identifiant unique pour le fichier basé sur ses propriétés
        const fileId = `${fileName}_${fileSize}_${lastModified}`;
        
        // Créer les métadonnées du fichier avec le chemin
        const audioMetadata = {
            fileName: fileName,
            fileSize: fileSize,
            lastModified: lastModified,
            fileId: fileId,
            filePath: audioFilePath
        };
        
        // Si une chanson est actuellement chargée, associer le chemin du fichier
        if (this.currentLyrics) {
            this.currentLyrics.setAudioPath(audioFilePath);
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
        console.log(`📁 Audio file associated: ${fileName} (${sizeInMB} MB)`);
        
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
                console.error(`Attempt ${attempt} failed:`, error);
                
                // Check for iOS-specific errors
                if (isIOS && (error.message.includes('view service') || error.message.includes('thumbnail'))) {
                    if (attempt < maxRetries) {
                        console.log(`Retrying in ${attempt * 500}ms...`);
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
            console.log('🍎 iOS audio file loading:', file.name);
            
            // Check memory constraints before processing
            if (file.size > 50 * 1024 * 1024) { // 50MB limit for iOS
                console.warn('⚠️ Large file detected on iOS:', file.size / (1024*1024), 'MB');
            }
            
            // Enhanced object URL creation with error handling
            let fileURL;
            try {
                fileURL = URL.createObjectURL(file);
                console.log('🍎 Object URL created successfully');
            } catch (urlError) {
                console.error('❌ Failed to create object URL:', urlError);
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
                    this.currentLyrics.setAudioPath(JSON.stringify(audioMetadata));
                    
                    if (this.lyricsLibrary) {
                        this.lyricsLibrary.saveSong(this.currentLyrics);
                    }
                    
                    if (this.onSongLoaded) {
                        this.onSongLoaded(this.currentLyrics);
                    }
                } catch (saveError) {
                    console.warn('⚠️ Failed to save audio metadata:', saveError);
                    // Continue processing despite save error
                }
            }
            
            // Load audio with iOS-specific handling and timeout
            if (this.audioController) {
                const loadTimeout = setTimeout(() => {
                    console.error('❌ iOS audio loading timeout');
                    reject(new Error('iOS audio loading timeout after 30 seconds'));
                }, 30000);
                
                try {
                    // Enhanced iOS audio loading
                    if (this.audioController.loadFromUrl) {
                        console.log('🍎 Using enhanced loadFromUrl for iOS');
                        
                        // Add success listener before loading
                        const loadSuccessHandler = () => {
                            clearTimeout(loadTimeout);
                            console.log('✅ iOS audio loaded successfully:', fileName);
                            this.audioController.off('loaded', loadSuccessHandler);
                            this.audioController.off('error', loadErrorHandler);
                            resolve();
                        };
                        
                        const loadErrorHandler = (error) => {
                            clearTimeout(loadTimeout);
                            console.error('❌ iOS audio load error:', error);
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
                    console.error('❌ iOS audio loading exception:', loadError);
                    URL.revokeObjectURL(fileURL);
                    reject(loadError);
                }
            } else {
                console.error('❌ No audio controller available');
                URL.revokeObjectURL(fileURL);
                reject(new Error('Audio controller not available'));
                return;
            }
            
            // Store references
            this.audioPath = fileURL;
            this.currentAudioFileName = fileName;
            this.currentAudioMetadata = audioMetadata;
            
            const sizeInMB = (fileSize / (1024 * 1024)).toFixed(1);
            console.log(`🍎 iOS audio file processing initiated: ${fileName} (${sizeInMB} MB)`);
            
        } catch (error) {
            console.error('❌ iOS audio file processing error:', error);
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
                console.log(`🎵 Audio player title updated: ${cleanFileName}`);
            } else {
                console.warn('⚠️ Audio player title element not found');
            }
        } catch (error) {
            console.error('❌ Error updating audio player title:', error);
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
}

export default DragDropManager;
