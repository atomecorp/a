/**
 * ios_audio_bridge.js
 * Pont pour permettre l'accès aux fichiers audio iOS depuis la WebView
 * Copie les fichiers vers un dossier accessible à la WebView
 */

/**
 * Copie un fichier audio local vers un dossier accessible à la WebView
 * @param {string} filename - Le nom du fichier audio à copier
 * @returns {Promise<string>} - L'URL du fichier copié accessible à la WebView
 */
async function copyAudioFileToWebViewFolder(filename) {
    console.log('🎵 [ios_audio_bridge] Copie du fichier audio:', filename);
    
    // Vérifier le bridge Swift
    if (!window.webkit?.messageHandlers?.swiftBridge) {
        throw new Error('Bridge Swift non disponible pour la copie de fichier audio');
    }

    return new Promise((resolve, reject) => {
        // Créer un ID unique pour cette requête
        const requestId = 'audio_copy_' + Date.now();
        
        // Sauvegarder le callback existant
        const originalCallback = window.fileSystemCallback;
        
        // Créer un callback temporaire pour capturer la réponse
        window.fileSystemCallback = function(response) {
            console.log('🔵 [ios_audio_bridge] Réponse reçue:', response);
            
            // Vérifier si c'est notre réponse
            if (response.requestId === requestId) {
                // Restaurer le callback original
                window.fileSystemCallback = originalCallback;
                
                if (response.success && response.webViewPath) {
                    console.log('✅ [ios_audio_bridge] Fichier copié vers:', response.webViewPath);
                    resolve(response.webViewPath);
                } else {
                    reject(new Error(response.error || 'Erreur lors de la copie du fichier audio'));
                }
            } else {
                // Passer au callback original si ce n'est pas notre réponse
                if (originalCallback) {
                    originalCallback(response);
                }
            }
        };

        // Envoyer la requête au Swift
        console.log('🔴 [ios_audio_bridge] Envoi de la requête copyAudioToWebView...');
        window.webkit.messageHandlers.swiftBridge.postMessage({
            action: 'copyAudioToWebView',
            filename: filename,
            requestId: requestId
        });
        
        // Timeout après 10 secondes
        setTimeout(() => {
            window.fileSystemCallback = originalCallback;
            reject(new Error('Timeout: La copie du fichier audio a pris trop de temps'));
        }, 10000);
    });
}

/**
 * Nettoie les fichiers audio temporaires dans le dossier WebView
 * @returns {Promise<boolean>} - True si le nettoyage a réussi
 */
async function cleanTempAudioFiles() {
    console.log('🧹 [ios_audio_bridge] Nettoyage des fichiers audio temporaires');
    
    if (!window.webkit?.messageHandlers?.swiftBridge) {
        console.warn('Bridge Swift non disponible pour le nettoyage');
        return false;
    }

    return new Promise((resolve) => {
        const originalCallback = window.fileSystemCallback;
        
        window.fileSystemCallback = function(response) {
            if (response.action === 'cleanTempAudio') {
                window.fileSystemCallback = originalCallback;
                resolve(response.success || false);
            } else if (originalCallback) {
                originalCallback(response);
            }
        };

        window.webkit.messageHandlers.swiftBridge.postMessage({
            action: 'cleanTempAudio'
        });
        
        // Timeout
        setTimeout(() => {
            window.fileSystemCallback = originalCallback;
            resolve(false);
        }, 5000);
    });
}

/**
 * Obtient la liste des fichiers audio temporaires disponibles
 * @returns {Promise<Array>} - Liste des fichiers audio dans le dossier WebView
 */
async function getTempAudioFiles() {
    console.log('📋 [ios_audio_bridge] Récupération des fichiers audio temporaires');
    
    if (!window.webkit?.messageHandlers?.swiftBridge) {
        throw new Error('Bridge Swift non disponible');
    }

    return new Promise((resolve, reject) => {
        const originalCallback = window.fileSystemCallback;
        
        window.fileSystemCallback = function(response) {
            if (response.action === 'listTempAudio') {
                window.fileSystemCallback = originalCallback;
                if (response.success) {
                    resolve(response.files || []);
                } else {
                    reject(new Error(response.error || 'Erreur lors de la récupération des fichiers'));
                }
            } else if (originalCallback) {
                originalCallback(response);
            }
        };

        window.webkit.messageHandlers.swiftBridge.postMessage({
            action: 'listTempAudio'
        });
        
        setTimeout(() => {
            window.fileSystemCallback = originalCallback;
            reject(new Error('Timeout lors de la récupération des fichiers temporaires'));
        }, 5000);
    });
}

// Exporter les fonctions pour usage global
window.copyAudioFileToWebViewFolder = copyAudioFileToWebViewFolder;
window.cleanTempAudioFiles = cleanTempAudioFiles;
window.getTempAudioFiles = getTempAudioFiles;

console.log('✅ [ios_audio_bridge] Module chargé - Fonctions disponibles:', {
    copyAudioFileToWebViewFolder: 'Copie un fichier audio vers un dossier accessible',
    cleanTempAudioFiles: 'Nettoie les fichiers temporaires',
    getTempAudioFiles: 'Liste les fichiers audio temporaires'
});
