/**
 * auv3_file_writer.js
 * Module pour écrire des fichiers dans le dossier local de l'AUv3 depuis l'application principale
 * 
 * Utilise les App Groups pour accéder au stockage AUv3:
 * - Chemin de base: App Groups container ("group.atome.one" ou "group.com.atomecorp.atome")
 * - Sous-dossiers: Projects, Exports, Recordings
 */

/**
 * Fonction pour écrire un fichier dans le dossier AUv3 depuis l'app principale
 * @param {string} filename - Nom du fichier (ex: "test.txt", "Projects/mon_projet.json")
 * @param {string|Object} content - Contenu du fichier (string ou objet à sérialiser)
 * @param {string} subfolder - Sous-dossier optionnel (ex: "Projects", "Exports", "Recordings")
 * @returns {Promise<Object>} Résultat de l'écriture avec chemin et métadonnées
 */
function writeFileToAUv3(filename, content, subfolder = '') {
    return new Promise((resolve, reject) => {
        console.log(`💾 [AUv3 WRITER] Écriture de fichier AUv3: "${filename}"`);
        console.log(`📁 [AUv3 WRITER] Sous-dossier: "${subfolder}"`);
        
        // Vérifier que le bridge Swift est disponible
        if (!window.webkit?.messageHandlers?.swiftBridge) {
            const error = new Error('Bridge Swift non disponible. Assurez-vous d\'être dans l\'environnement iOS.');
            console.error('❌ [AUv3 WRITER]', error.message);
            reject(error);
            return;
        }
        
        try {
            const requestId = Date.now() + Math.random();
            const timeoutDuration = 15000; // 15 secondes pour l'écriture
            
            // Préparer le contenu
            let finalContent;
            if (typeof content === 'object') {
                finalContent = JSON.stringify(content, null, 2);
                console.log(`📝 [AUv3 WRITER] Sérialisation JSON (${finalContent.length} chars)`);
            } else {
                finalContent = String(content);
                console.log(`📝 [AUv3 WRITER] Contenu texte (${finalContent.length} chars)`);
            }
            
            console.log(`🔄 [AUv3 WRITER] Envoi de la requête (ID: ${requestId})`);
            
            // Timer pour timeout
            const timeoutTimer = setTimeout(() => {
                console.error(`⏰ [AUv3 WRITER] Timeout: Pas de réponse de Swift après ${timeoutDuration/1000}s`);
                reject(new Error(`Timeout: Pas de réponse de Swift après ${timeoutDuration/1000}s`));
            }, timeoutDuration);
            
            // Fonction pour traiter la réponse
            const handleResponse = (event) => {
                try {
                    if (event.detail?.requestId === requestId) {
                        clearTimeout(timeoutTimer);
                        window.removeEventListener('auv3WriteFileResponse', handleResponse);
                        
                        console.log(`✅ [AUv3 WRITER] Réponse reçue:`, event.detail);
                        
                        if (event.detail.success) {
                            const result = {
                                filename: event.detail.filename || filename,
                                path: event.detail.path || 'Chemin inconnu',
                                size: event.detail.size || finalContent.length,
                                message: event.detail.message || 'Fichier écrit avec succès'
                            };
                            console.log(`📁 [AUv3 WRITER] Fichier écrit: ${result.path}`);
                            resolve(result);
                        } else {
                            const error = new Error(event.detail.error || 'Erreur inconnue lors de l\'écriture AUv3');
                            console.error('❌ [AUv3 WRITER]', error.message);
                            reject(error);
                        }
                    }
                } catch (parseError) {
                    clearTimeout(timeoutTimer);
                    window.removeEventListener('auv3WriteFileResponse', handleResponse);
                    console.error('❌ [AUv3 WRITER] Erreur de parsing:', parseError);
                    reject(parseError);
                }
            };
            
            // Écouter la réponse
            window.addEventListener('auv3WriteFileResponse', handleResponse);
            
            // Construire le chemin relatif
            let relativePath = filename;
            if (subfolder) {
                relativePath = `${subfolder}/${filename}`;
            }
            
            // Envoyer la requête à Swift
            const message = {
                action: 'writeFileAUv3', // Action spécifique pour les fichiers AUv3
                requestId: requestId,
                filename: relativePath, // Chemin relatif dans App Groups
                content: finalContent,
                source: 'main_app' // Indiquer qu'on vient de l'app principale
            };
            
            console.log(`📤 [AUv3 WRITER] Message envoyé (${message.content.length} chars):`, {
                ...message,
                content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : '')
            });
            
            window.webkit.messageHandlers.swiftBridge.postMessage(message);
            
        } catch (error) {
            console.error('❌ [AUv3 WRITER] Erreur lors de l\'envoi:', error);
            reject(error);
        }
    });
}

/**
 * Fonction de test pour créer un fichier AUv3 avec contenu de démonstration
 * @param {string} filename - Nom du fichier de test
 * @param {string} subfolder - Sous-dossier optionnel
 * @returns {Promise<Object>} Résultat de l'écriture
 */
function testWriteAUv3File(filename, subfolder = 'Projects') {
    const testContent = {
        type: 'test_file',
        created_by: 'main_app',
        timestamp: new Date().toISOString(),
        test_data: {
            filename: filename,
            subfolder: subfolder,
            description: 'Fichier de test créé depuis l\'application principale pour vérifier l\'accès aux fichiers AUv3',
            random_id: Math.random().toString(36).substring(2),
            platform: 'iOS',
            source: 'test_and_rd.js -> auv3_file_writer.js -> App Groups -> AUv3 Storage'
        },
        content_test: {
            text: 'Ceci est un test de contenu texte avec caractères spéciaux: àéèùçñ🎵🎛️📱💾',
            numbers: [1, 2, 3.14, 42],
            boolean: true,
            null_value: null,
            nested_object: {
                level1: {
                    level2: {
                        message: 'Test de structure imbriquée'
                    }
                }
            }
        }
    };
    
    console.log(`🧪 [AUv3 WRITER] Test d'écriture: ${filename} dans ${subfolder}`);
    return writeFileToAUv3(filename, testContent, subfolder);
}

// Export pour usage global
if (typeof window !== 'undefined') {
    window.writeFileToAUv3 = writeFileToAUv3;
    window.testWriteAUv3File = testWriteAUv3File;
    console.log('✅ [auv3_file_writer] Fonctions exportées globalement');
    console.log('💾 [auv3_file_writer] writeFileToAUv3() et testWriteAUv3File() disponibles');
}

//usage examples

// if (typeof window.testWriteFile === 'function') {
//     // Test simple: écrire un fichier texte (comme dans test_and_rd.js)
//     window.testWriteFile('my_test.txt')
//         .then(result => {
//             console.log('✅ File written successfully:', result);
//             console.log('📄 Success:', result.success);
//             console.log('📊 Content size:', result.contentSize, 'characters');
//             console.log('💬 Message:', result.message);
//         })
//         .catch(error => {
//             console.error('❌ Error writing file:', error);
//         });
        
//     // Test avec un autre nom de fichier
//     setTimeout(() => {
//         window.testWriteFile('hello_world.txt')
//             .then(result => {
//                 console.log('✅ Second file written:', result);
//             })
//             .catch(error => {
//                 console.error('❌ Error writing second file:', error);
//             });
//     }, 2000);
    
// } else {
//     console.error('❌ testWriteFile not available. Type of function:', typeof window.testWriteFile);
//     console.log('🔍 Available iOS functions:', window.writeFileToIOS ? 'writeFileToIOS available' : 'writeFileToIOS not available');
// }
