  // Console redefinition
        window.console.log = (function(oldLog) {
            return function(message) {
                oldLog(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("LOG: " + message);
                } catch(e) {
                    oldLog();
                }
            }
        })(window.console.log);

        window.console.error = (function(oldErr) {
            return function(message) {
                oldErr(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("ERROR: " + message);
                } catch(e) {
                    oldErr();
                }
            }
        })(window.console.error);

$('span', {
  // pas besoin de 'tag'
  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Je suis un SPAN ! 🎯'
});

/**
 * ios_file_writer.js
 * Code minimaliste pour écrire des fichiers sur iOS/AUv3
 * Utilise l'action 'saveFile' de handleSaveFile dans FileSystemBridge.swift
 */

/**
 * Fonction pour écrire un fichier sur iOS
 * @param {string} filename - Le nom/chemin du fichier à créer
 * @param {string} content - Le contenu à écrire dans le fichier
 * @returns {Promise<Object>} - Promise qui résout avec le résultat de l'écriture
 */
async function writeFileToIOS(filename, content) {
    console.log('📝 [ios_file_writer] Écriture du fichier:', filename);
    
    // Vérifier le bridge Swift
    if (!window.webkit?.messageHandlers?.swiftBridge) {
        throw new Error('Bridge Swift non disponible pour l\'écriture de fichier');
    }

    return new Promise((resolve, reject) => {
        // Sauvegarder le callback existant
        const originalCallback = window.fileSystemCallback;
        
        // Créer un callback temporaire pour capturer la réponse
        window.fileSystemCallback = function(response) {
            console.log('🔵 [ios_file_writer] Réponse reçue du Swift:', response);
            
            // Restaurer le callback original
            window.fileSystemCallback = originalCallback;
            
            if (response.success && response.data && response.data.message === "File saved successfully") {
                resolve({ success: true, message: response.data.message });
            } else if (response.success === false) {
                reject(new Error(response.error || 'Erreur inconnue lors de la sauvegarde'));
            } else {
                // Passer au callback original si ce n'est pas notre réponse
                if (originalCallback) {
                    originalCallback(response);
                }
            }
        };

        // Envoyer la requête au Swift (même format que handleSaveFile attend)
        console.log('🔴 [ios_file_writer] Envoi de la requête saveFile au Swift...');
        window.webkit.messageHandlers.swiftBridge.postMessage({
            action: 'saveFile',
            path: filename,
            data: content
        });

        // Timeout après 10 secondes
        setTimeout(() => {
            window.fileSystemCallback = originalCallback;
            reject(new Error('Timeout: pas de réponse du bridge Swift après 10 secondes'));
        }, 10000);
    });
}

/**
 * Fonction de test pour écrire un fichier avec contenu automatique
 * @param {string} filename - Le nom/chemin du fichier à créer
 * @returns {Promise<Object>} - Promise qui résout avec le résultat de l'écriture
 */
async function testWriteFile(filename) {
    console.log('🧪 [ios_file_writer] Test d\'écriture de fichier:', filename);
    
    // Contenu de test à écrire
    const testContent = `Fichier de test créé le ${new Date().toISOString()}
Nom du fichier: ${filename}
Contenu généré par ios_file_writer.js

Données de test:
- Timestamp Unix: ${Date.now()}
- Random ID: ${Math.random().toString(36).substr(2, 9)}
- User Agent: ${navigator.userAgent}
- URL: ${window.location.href}

Ce fichier a été créé via l'action 'saveFile' du bridge Swift.`;

    try {
        const result = await writeFileToIOS(filename, testContent);
        console.log('✅ [ios_file_writer] Fichier écrit avec succès:', result);
        return { success: true, message: result.message, contentSize: testContent.length };
    } catch (error) {
        console.error('❌ [ios_file_writer] Erreur lors de l\'écriture:', error);
        throw error;
    }
}

// Export global
if (typeof window !== 'undefined') {
    window.writeFileToIOS = writeFileToIOS;
    window.testWriteFile = testWriteFile;
    console.log('[ios_file_writer] Fonctions exportées globalement');
}


// usage example:

// console.log('💾 Writing iOS file...');

// if (typeof window.writeFileToIOS === 'function') {
//     window.writeFileToIOS('my_test_prefect.txt', 'hello nice world')
//         .then(result => {
//             console.log('✅ File written successfully:', result);
//             console.log('📄 Message:', result.message);
//         })
//         .catch(error => {
//             console.error('❌ Error writing file:', error);
//         });
// } else {
//     console.error('❌ writeFileToIOS not available. Type of function:', typeof window.writeFileToIOS);
// }