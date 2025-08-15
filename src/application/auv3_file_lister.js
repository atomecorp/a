/**
 * auv3_file_lister.js
 * Module pour lister les fichiers du dossier local de l'AUv3 depuis l'application principale
 * 
 * Chemins AUv3 corrects (App Groups):
 * - "." ou "" = racine du container App Groups
 * - "Projects" = dossier Projects dans App Groups  
 * - "Exports" = dossier Exports dans App Groups
 * - "Recordings" = dossier Recordings dans App Groups
 */

/**
 * Fonction pour lister le contenu d'un dossier AUv3 depuis l'app principale
 * @param {string} path - Chemin relatif dans l'App Groups (ex: "Projects", "Exports", "." pour racine)
 * @returns {Promise<Array>} Liste des fichiers et dossiers
 */
function get_auv3_folder_content(path = '.') {
    return new Promise((resolve, reject) => {
        console.log(`📂 [AUv3 LISTER] Listage du dossier AUv3: "${path}"`);
        
        // Vérifier que le bridge Swift est disponible
        if (!window.webkit?.messageHandlers?.swiftBridge) {
            const error = new Error('Bridge Swift non disponible. Assurez-vous d\'être dans l\'environnement iOS.');
            console.error('❌ [AUv3 LISTER]', error.message);
            reject(error);
            return;
        }
        
        try {
            const requestId = Date.now() + Math.random();
            const timeoutDuration = 10000; // 10 secondes
            
            console.log(`🔄 [AUv3 LISTER] Envoi de la requête (ID: ${requestId})`);
            console.log(`🔍 [AUv3 LISTER] Chemin demandé: "${path}"`);
            
            // Timer pour timeout
            const timeoutTimer = setTimeout(() => {
                console.error(`⏰ [AUv3 LISTER] Timeout: Pas de réponse de Swift après ${timeoutDuration/1000}s`);
                reject(new Error(`Timeout: Pas de réponse de Swift après ${timeoutDuration/1000}s`));
            }, timeoutDuration);
            
            // Fonction pour traiter la réponse
            const handleResponse = (event) => {
                try {
                    if (event.detail?.requestId === requestId) {
                        clearTimeout(timeoutTimer);
                        window.removeEventListener('auv3ListFilesResponse', handleResponse);
                        
                        console.log(`✅ [AUv3 LISTER] Réponse reçue:`, event.detail);
                        
                        if (event.detail.success) {
                            const files = event.detail.files || [];
                            console.log(`📋 [AUv3 LISTER] ${files.length} fichier(s) trouvé(s)`);
                            resolve(files);
                        } else {
                            const error = new Error(event.detail.error || 'Erreur inconnue lors du listage AUv3');
                            console.error('❌ [AUv3 LISTER]', error.message);
                            reject(error);
                        }
                    }
                } catch (parseError) {
                    clearTimeout(timeoutTimer);
                    window.removeEventListener('auv3ListFilesResponse', handleResponse);
                    console.error('❌ [AUv3 LISTER] Erreur de parsing:', parseError);
                    reject(parseError);
                }
            };
            
            // Écouter la réponse
            window.addEventListener('auv3ListFilesResponse', handleResponse);
            
            // Envoyer la requête à Swift
            // Action corrigée pour accéder aux App Groups AUv3
            const message = {
                action: 'listFilesAUv3', // Action spécifique pour les fichiers AUv3
                requestId: requestId,
                path: path, // Chemin direct dans App Groups (ex: "Projects", ".")
                source: 'main_app' // Indiquer qu'on vient de l'app principale
            };
            
            console.log(`📤 [AUv3 LISTER] Message envoyé:`, message);
            window.webkit.messageHandlers.swiftBridge.postMessage(message);
            
        } catch (error) {
            console.error('❌ [AUv3 LISTER] Erreur lors de l\'envoi:', error);
            reject(error);
        }
    });
}

/**
 * Fonction utilitaire pour formater la liste des fichiers AUv3
 * @param {Array} files - Liste des fichiers retournée par get_auv3_folder_content
 * @returns {string} Texte formaté pour affichage
 */
function formatAUv3FileList(files) {
    if (!Array.isArray(files) || files.length === 0) {
        return 'Aucun fichier trouvé dans ce dossier AUv3.';
    }
    
    let content = `${files.length} élément(s) trouvé(s) dans l'AUv3:\n\n`;
    
    files.forEach((file, index) => {
        const type = file.isDirectory ? '📁 [DOSSIER]' : '📄 [FICHIER]';
        const size = file.size ? ` (${formatAUv3FileSize(file.size)})` : '';
        const modified = file.dateModified ? ` - Modifié: ${new Date(file.dateModified).toLocaleString()}` : '';
        
        content += `${index + 1}. ${type} ${file.name}${size}${modified}\n`;
    });
    
    return content;
}

/**
 * Fonction utilitaire pour formater la taille des fichiers
 * @param {number} bytes - Taille en bytes
 * @returns {string} Taille formatée (ex: "1.2 KB", "3.4 MB")
 */
function formatAUv3FileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Export pour usage global
if (typeof window !== 'undefined') {
    window.get_auv3_folder_content = get_auv3_folder_content;
    window.formatAUv3FileList = formatAUv3FileList;
    console.log('✅ [auv3_file_lister] Fonctions exportées globalement');
    console.log('📂 [auv3_file_lister] Chemins supportés: "." (racine), "Projects", "Exports", "Recordings"');
}



//usage example

 
    // if (typeof window.get_ios_folder_content === 'function') {
    //     window.get_ios_folder_content('./')
    //         .then(files => {
    //             console.log('📂 Local files found:', files);
    //             console.log('📋 Files list:');
    //             if (Array.isArray(files)) {
    //                 files.forEach((file, index) => {
    //                     console.log(`${index + 1}. ${file.name} (${file.isDirectory ? 'DIR' : 'FILE'})`);
    //                 });
    //             } else {
    //                 console.log('📄 Raw result:', files);
    //             }
    //         })
    //         .catch(error => {
    //             console.error('❌ Error listing files:', error);
    //         });
    // } else {
    //     console.error('❌ get_ios_folder_content not available. Type of function:', typeof window.get_ios_folder_content);
    //     console.log('🔍 Available webkit functions:', window.webkit?.messageHandlers ? Object.keys(window.webkit.messageHandlers) : 'No webkit available');
    // }