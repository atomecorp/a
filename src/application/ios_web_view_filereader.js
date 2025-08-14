/**
 * ios_web_view_filereader.js
 * Code pour lister les fichiers du dossier public de la WebView
 * Utilise fetch() pour accéder aux fichiers locaux de la WebView
 */

/**
 * Fonction pour lister le contenu d'un dossier de la WebView
 * @param {string} path - Le chemin du dossier à lister (ex: './assets/audios', 'assets/audios')
 * @returns {Promise<Array>} - Promise qui retourne un tableau des fichiers/dossiers
 */
async function get_ios_webview_folder_content(path = './assets/audios') {
    console.log('[ios_web_view_filereader] Listage du dossier WebView:', path);
    
    try {
        // Utiliser la même détection iOS que AudioManager
        const userAgent = navigator.userAgent;
        const isIOSUserAgent = /iPad|iPhone|iPod/.test(userAgent);
        const isIOSPlatform = /iPhone|iPad|iPod/i.test(navigator.platform);
        const isIOSStandalone = window.navigator.standalone !== undefined;
        const isIOSTouch = 'ontouchstart' in window;
        
        // AUv3 specific detection - look for iOS file paths or WebKit
        const isAUv3Context = window.webkit && window.webkit.messageHandlers;
        const hasIOSPaths = window.location.href.includes('file://') || 
                           window.location.protocol === 'file:';
        
        // Use the most comprehensive iOS detection
        const finalIOSDetection = isIOSUserAgent || isIOSPlatform || 
                                 (isAUv3Context && (isIOSTouch || hasIOSPaths));
        
        console.log('[ios_web_view_filereader] Platform detection - iOS:', finalIOSDetection);
        console.log('[ios_web_view_filereader] Detected context:', { isIOSUserAgent, isIOSPlatform, isAUv3Context, hasIOSPaths });
        
        // CORRECTION: Garder le chemin exact comme AudioManager qui fonctionne
        // AudioManager utilise "./assets/audios/" sur iOS - on garde la même logique
        const cleanPath = path.replace(/\/$/, ''); // Retire juste le / final, garde le ./
        console.log('[ios_web_view_filereader] Chemin utilisé (même qu\'AudioManager):', cleanPath);
        
        // Essayer de lister les fichiers via fetch d'un index JSON
        // (si le serveur web/assets fournit un listing)
        const indexUrls = [
            `./${cleanPath}/index.json`,
            `./${cleanPath}/files.json`,
            `${cleanPath}/index.json`,
            `${cleanPath}/files.json`
        ];
        
        for (const indexUrl of indexUrls) {
            try {
                console.log('[ios_web_view_filereader] Tentative fetch index:', indexUrl);
                const response = await fetch(indexUrl);
                if (response.ok) {
                    const fileList = await response.json();
                    console.log('[ios_web_view_filereader] Index trouvé:', indexUrl, fileList);
                    return formatWebViewFileList(fileList, cleanPath);
                }
            } catch (error) {
                console.log('[ios_web_view_filereader] Index non trouvé:', indexUrl);
            }
        }
        
        // Méthode améliorée: essayer de détecter les fichiers avec la logique du bouton toolbar
        console.log('[ios_web_view_filereader] Recherche de fichiers audio dans la toolbar...');
        const toolbarFiles = scanToolbarForAudioFiles(cleanPath);
        if (toolbarFiles.length > 0) {
            console.log('[ios_web_view_filereader] Fichiers trouvés via toolbar:', toolbarFiles);
            return toolbarFiles;
        }
        
        // Méthode alternative: essayer de détecter les vrais fichiers du bundle
        const realAudioFiles = [
            'After The War.m4a', 'Alive.m4a', 'Big Brother.m4a', 'Change the world.m4a',
            'Evolutions.m4a', 'GhostBox.m4a', 'Ices From Hells.m4a', 'Last chances.m4a',
            'Runaway.m4a', 'Social Smiles.m4a', 'Vampire.m4a', 'riff.m4a', 'wWw.m4a'
        ];
        
        console.log('[ios_web_view_filereader] Test des fichiers réels du bundle dans:', cleanPath);
        const existingFiles = [];
        
        for (const filename of realAudioFiles) {
            try {
                // Utiliser la même logique d'encoding qu'AudioManager.createUrl()
                let finalFileName;
                if (finalIOSDetection) {
                    // Pour iOS AUv3: Use relative paths with encoded spaces
                    if (filename.includes('%20')) {
                        finalFileName = filename; // Keep encoded
                    } else if (filename.includes(' ')) {
                        finalFileName = encodeURIComponent(filename);
                    } else {
                        finalFileName = filename;
                    }
                } else {
                    // Pour Desktop: encoding standard
                    finalFileName = encodeURIComponent(filename);
                }
                
                // CORRECTION: Utiliser exactement la même logique qu'AudioManager.createUrl()
                // AudioManager utilise cleanPath qui garde le ./ initial
                const fileUrl = `${cleanPath}/${finalFileName}`;
                console.log('[ios_web_view_filereader] Test URL bundle (même format qu\'AudioManager):', fileUrl);
                const response = await fetch(fileUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log('[ios_web_view_filereader] Fichier bundle trouvé:', fileUrl);
                    
                    // Essayer de récupérer la taille depuis les headers
                    const contentLength = response.headers.get('content-length');
                    const lastModified = response.headers.get('last-modified');
                    
                    existingFiles.push({
                        name: filename, // Nom original sans encoding pour l'affichage
                        isDirectory: false,
                        size: contentLength ? parseInt(contentLength) : 0,
                        modified: lastModified ? new Date(lastModified).getTime() / 1000 : Date.now() / 1000,
                        url: fileUrl,
                        path: fileUrl // Pour la lecture
                    });
                }
            } catch (error) {
                // Fichier n'existe pas, continuer
            }
        }
        
        if (existingFiles.length > 0) {
            console.log('[ios_web_view_filereader] Fichiers détectés du bundle:', existingFiles);
            return existingFiles;
        }
        
        // Méthode alternative avec noms de fichiers communs (fallback)
        const commonAudioFiles = [
            'test.mp3', 'sample.mp3', 'demo.mp3', 'audio1.mp3', 'audio2.mp3',
            'test.wav', 'sample.wav', 'demo.wav', 'audio1.wav', 'audio2.wav',
            'test.m4a', 'sample.m4a', 'demo.m4a', 'audio1.m4a', 'audio2.m4a',
            'music.mp3', 'song.mp3', 'track.mp3', 'sound.mp3', 'audio.mp3',
            // Fichiers avec espaces (utilisés par AudioManager)
            'test file.mp3', 'audio test.mp3', 'sample audio.wav', 'demo track.m4a'
        ];
        
        console.log('[ios_web_view_filereader] Test de fichiers communs dans:', cleanPath);
        
        for (const filename of commonAudioFiles) {
            try {
                // Utiliser la même logique d'encoding qu'AudioManager.createUrl()
                let finalFileName;
                if (finalIOSDetection) {
                    // Pour iOS AUv3: Use relative paths with encoded spaces
                    if (filename.includes('%20')) {
                        finalFileName = filename; // Keep encoded
                    } else if (filename.includes(' ')) {
                        finalFileName = encodeURIComponent(filename);
                    } else {
                        finalFileName = filename;
                    }
                } else {
                    // Pour Desktop: encoding standard
                    finalFileName = encodeURIComponent(filename);
                }
                
                // CORRECTION: Utiliser exactement la même logique qu'AudioManager.createUrl()
                // AudioManager utilise cleanPath qui garde le ./ initial
                const fileUrl = `${cleanPath}/${finalFileName}`;
                console.log('[ios_web_view_filereader] Test URL commun (même format qu\'AudioManager):', fileUrl);
                const response = await fetch(fileUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log('[ios_web_view_filereader] Fichier commun trouvé:', fileUrl);
                    
                    // Essayer de récupérer la taille depuis les headers
                    const contentLength = response.headers.get('content-length');
                    const lastModified = response.headers.get('last-modified');
                    
                    existingFiles.push({
                        name: filename, // Nom original sans encoding pour l'affichage
                        isDirectory: false,
                        size: contentLength ? parseInt(contentLength) : 0,
                        modified: lastModified ? new Date(lastModified).getTime() / 1000 : Date.now() / 1000,
                        url: fileUrl,
                        path: fileUrl // Pour la lecture
                    });
                }
            } catch (error) {
                // Fichier n'existe pas, continuer
            }
        }
        
        if (existingFiles.length > 0) {
            console.log('[ios_web_view_filereader] Fichiers détectés:', existingFiles);
            return existingFiles;
        }
        
        // Dernière méthode: essayer de scanner via DOM (si les fichiers sont référencés)
        const domFiles = scanDOMForAudioFiles(cleanPath);
        if (domFiles.length > 0) {
            console.log('[ios_web_view_filereader] Fichiers trouvés via DOM:', domFiles);
            return domFiles;
        }
        
        // Aucun fichier trouvé
        console.log('[ios_web_view_filereader] Aucun fichier trouvé dans:', path);
        return [];
        
    } catch (error) {
        console.error('[ios_web_view_filereader] Erreur lors du listage:', error);
        throw new Error(`Impossible de lister le dossier WebView "${path}": ${error.message}`);
    }
}

/**
 * Fonction pour formater une liste de fichiers depuis un index JSON
 */
function formatWebViewFileList(fileList, basePath) {
    if (!Array.isArray(fileList)) {
        return [];
    }
    
    return fileList.map(file => {
        if (typeof file === 'string') {
            // Simple liste de noms de fichiers
            // CORRECTION: Utiliser basePath qui garde le ./ initial comme AudioManager
            const fileUrl = `${basePath}/${file}`;
            return {
                name: file,
                isDirectory: false,
                size: 0,
                modified: Date.now() / 1000,
                url: fileUrl,
                path: fileUrl // Ajout pour readWebViewFile
            };
        } else if (typeof file === 'object') {
            // Objet avec métadonnées
            const fileName = file.name || 'unknown';
            // CORRECTION: Utiliser basePath qui garde le ./ initial comme AudioManager
            const fileUrl = `${basePath}/${fileName}`;
            return {
                name: fileName,
                isDirectory: file.isDirectory || file.type === 'directory' || false,
                size: file.size || 0,
                modified: file.modified || file.lastModified || Date.now() / 1000,
                url: fileUrl,
                path: fileUrl // Ajout pour readWebViewFile
            };
        }
        return null;
    }).filter(file => file !== null);
}

/**
 * Fonction pour scanner la toolbar à la recherche de fichiers audio déjà chargés
 */
function scanToolbarForAudioFiles(basePath) {
    const audioFiles = [];
    console.log('[ios_web_view_filereader] Scan de la toolbar pour les fichiers audio...');
    
    // Scanner le bouton play de la toolbar (qui utilise AudioManager)
    const playButtons = document.querySelectorAll('.audio-control-play, .play-button, [data-audio-file]');
    playButtons.forEach(button => {
        const audioFile = button.getAttribute('data-audio-file') || 
                         button.getAttribute('data-file') ||
                         button.getAttribute('data-src');
        
        if (audioFile) {
            // Extraire le nom de fichier du chemin
            let filename = audioFile;
            if (audioFile.includes('/')) {
                filename = audioFile.split('/').pop();
            }
            // Décoder les espaces si nécessaire
            if (filename.includes('%20')) {
                filename = decodeURIComponent(filename);
            }
            
            if (filename && !audioFiles.find(f => f.name === filename)) {
                console.log('[ios_web_view_filereader] Fichier audio trouvé via toolbar:', filename);
                audioFiles.push({
                    name: filename,
                    isDirectory: false,
                    size: 0,
                    modified: Date.now() / 1000,
                    url: `./${basePath}/${filename}`,
                    path: `./${basePath}/${filename}`,
                    source: 'toolbar'
                });
            }
        }
    });
    
    // Scanner les éléments avec des références audio directes
    const audioElements = document.querySelectorAll('audio[src], [src*="' + basePath + '"]');
    audioElements.forEach(element => {
        const src = element.src || element.getAttribute('src');
        if (src && src.includes(basePath)) {
            let filename = src.split('/').pop();
            if (filename.includes('%20')) {
                filename = decodeURIComponent(filename);
            }
            
            if (filename && !audioFiles.find(f => f.name === filename)) {
                console.log('[ios_web_view_filereader] Fichier audio trouvé via élément audio:', filename);
                audioFiles.push({
                    name: filename,
                    isDirectory: false,
                    size: 0,
                    modified: Date.now() / 1000,
                    url: src,
                    path: src,
                    source: 'audio-element'
                });
            }
        }
    });
    
    return audioFiles;
}

/**
 * Fonction pour scanner le DOM à la recherche de références audio
 */
function scanDOMForAudioFiles(basePath) {
    const audioFiles = [];
    
    // Scanner les éléments audio et source
    const audioElements = document.querySelectorAll('audio, source, [src*="' + basePath + '"]');
    audioElements.forEach(element => {
        const src = element.src || element.getAttribute('src');
        if (src && src.includes(basePath)) {
            const filename = src.split('/').pop();
            if (filename && !audioFiles.find(f => f.name === filename)) {
                audioFiles.push({
                    name: filename,
                    isDirectory: false,
                    size: 0,
                    modified: Date.now() / 1000,
                    url: src,
                    path: src // Ajout pour readWebViewFile
                });
            }
        }
    });
    
    // Scanner les scripts qui pourraient référencer des fichiers audio
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
        const content = script.textContent || script.innerHTML;
        if (content.includes(basePath)) {
            // Rechercher des patterns comme "assets/audios/filename.mp3"
            const audioPattern = new RegExp(basePath + '/([\\w\\-\\.\\s]+\\.(mp3|wav|m4a|aac|flac|ogg|webm))', 'gi');
            let match;
            while ((match = audioPattern.exec(content)) !== null) {
                const filename = match[1];
                // CORRECTION: Utiliser basePath qui garde le ./ initial comme AudioManager
                const fileUrl = `${basePath}/${filename}`;
                if (!audioFiles.find(f => f.name === filename)) {
                    audioFiles.push({
                        name: filename,
                        isDirectory: false,
                        size: 0,
                        modified: Date.now() / 1000,
                        url: fileUrl,
                        path: fileUrl // Ajout pour readWebViewFile
                    });
                }
            }
        }
    });
    
    return audioFiles;
}

/**
 * Fonction pour lire le contenu d'un fichier de la WebView
 * @param {string} filePath - Le chemin du fichier à lire
 * @returns {Promise<ArrayBuffer>} - Promise qui retourne le contenu du fichier
 */
async function readWebViewFile(filePath) {
    console.log('[ios_web_view_filereader] Lecture du fichier WebView:', filePath);
    
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        console.log('[ios_web_view_filereader] Fichier lu, taille:', arrayBuffer.byteLength, 'bytes');
        return arrayBuffer;
        
    } catch (error) {
        console.error('[ios_web_view_filereader] Erreur lors de la lecture:', error);
        throw new Error(`Impossible de lire le fichier "${filePath}": ${error.message}`);
    }
}

/**
 * Fonction pour convertir un ArrayBuffer en chaîne base64
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Export global
if (typeof window !== 'undefined') {
    window.get_ios_webview_folder_content = get_ios_webview_folder_content;
    window.readWebViewFile = readWebViewFile;
    window.arrayBufferToBase64 = arrayBufferToBase64;
    console.log('[ios_web_view_filereader] Fonctions exportées globalement');
}
