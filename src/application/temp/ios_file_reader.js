/**
 * ios_file_reader.js
 * Code minimaliste pour lire des fichiers sur iOS/AUv3
 * Utilise l'action 'loadFile' de handleLoadFile dans FileSystemBridge.swift
 */

/**
 * Fonction pour lire un fichier depuis iOS
 * @param {string} filename - Le nom/chemin du fichier à lire
 * @returns {Promise<string>} - Promise qui résout avec le contenu du fichier
 */
async function readFileFromIOS(filename) {
    console.log('📖 [ios_file_reader] Lecture du fichier:', filename);
    
    // Vérifier le bridge Swift
    if (!window.webkit?.messageHandlers?.swiftBridge) {
        throw new Error('Bridge Swift non disponible pour la lecture de fichier');
    }

    return new Promise((resolve, reject) => {
        // Sauvegarder le callback existant
        const originalCallback = window.fileSystemCallback;
        
        // Créer un callback temporaire pour capturer la réponse
        window.fileSystemCallback = function(response) {
            console.log('🔵 [ios_file_reader] Réponse reçue du Swift:', response);
            
            // Restaurer le callback original
            window.fileSystemCallback = originalCallback;
            
            if (response.success && response.data && response.data.content !== undefined) {
                resolve(response.data.content);
            } else if (response.success === false) {
                reject(new Error(response.error || 'Erreur inconnue lors de la lecture'));
            } else {
                // Passer au callback original si ce n'est pas notre réponse
                if (originalCallback) {
                    originalCallback(response);
                }
            }
        };

        // Envoyer la requête au Swift (même format que handleLoadFile attend)
        console.log('🔴 [ios_file_reader] Envoi de la requête loadFile au Swift...');
        window.webkit.messageHandlers.swiftBridge.postMessage({
            action: 'loadFile',
            path: filename
        });

        // Timeout après 10 secondes
        setTimeout(() => {
            window.fileSystemCallback = originalCallback;
            reject(new Error('Timeout: pas de réponse du bridge Swift après 10 secondes'));
        }, 10000);
    });
}

/**
 * Fonction pour lire un fichier depuis le dossier assets de la WebView
 * @param {string} filename - Le nom du fichier dans assets/audios/
 * @returns {Promise<string>} - Promise qui résout avec le contenu du fichier
 */
async function readAssetFile(filename) {
    console.log('📂 [ios_file_reader] Lecture du fichier asset:', filename);
    
    // Construire l'URL complète vers le fichier dans assets
    const assetUrl = `./assets/audios/${filename}`;
    
    try {
        const response = await fetch(assetUrl);
        
        if (!response.ok) {
            throw new Error(`Impossible de lire le fichier ${assetUrl}: ${response.status} ${response.statusText}`);
        }
        
        // Pour les fichiers audio, on peut lire en ArrayBuffer puis convertir en base64
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convertir en base64 pour pouvoir l'écrire dans le dossier local
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Content = btoa(binary);
        
        console.log('✅ [ios_file_reader] Fichier asset lu avec succès, taille:', arrayBuffer.byteLength, 'bytes');
        
        return {
            content: base64Content,
            size: arrayBuffer.byteLength,
            type: 'binary',
            encoding: 'base64'
        };
        
    } catch (error) {
        console.error('❌ [ios_file_reader] Erreur lors de la lecture du fichier asset:', error);
        throw error;
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.readFileFromIOS = readFileFromIOS;
    window.readAssetFile = readAssetFile;
    console.log('[ios_file_reader] Fonctions exportées globalement');
}


//usage example


    // console.log('📖 Reading iOS file...');
    
    // if (typeof window.readFileFromIOS === 'function') {
    //     window.readFileFromIOS('./my_test.txt')
    //         .then(content => {
    //             console.log('✅ File read successfully:');
    //             console.log('📄 Content:', content);
    //             console.log('📊 Length:', content.length, 'characters');
    //         })
    //         .catch(error => {
    //             console.error('❌ Error reading file:', error);
    //         });
    // } else {
    //     console.error('❌ readFileFromIOS not available. Type of function:', typeof window.readFileFromIOS);
    // }