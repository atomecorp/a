/**
 * auv3_file_lister.js
 * Module pour lister les fichiers du dossier local de l'AUv3 depuis l'application principale
 * 
 * Supporte n'importe quel chemin dans le container App Groups:
 * - "." ou "" = racine du container App Groups
 * - "./" = racine du container App Groups
 * - "./toto" = sous-dossier "toto" 
 * - "./toto/titi/" = sous-dossier imbriqué
 * - N'importe quel autre chemin relatif
 */

/**
 * Fonction pour lister le contenu d'un dossier AUv3 depuis l'app principale
 * @param {string} path - Chemin relatif dans l'App Groups (ex: "./", "./Projects", "./toto/titi/", etc.)
 * @returns {Promise<Array>} Liste des fichiers et dossiers
 */
function get_auv3_folder_content(path = './') {
    return new Promise((resolve, reject) => {
        // Normaliser le chemin pour accepter différents formats
        let normalizedPath = path;
        if (path === '.' || path === '') {
            normalizedPath = './';
        }
        // S'assurer que le chemin se termine par '/' si c'est un dossier
        if (!normalizedPath.endsWith('/') && !normalizedPath.includes('.')) {
            normalizedPath += '/';
        }
        
        console.log(`📂 [AUv3 LISTER] Listage du dossier AUv3: "${normalizedPath}"`);
        console.log(`📝 [AUv3 LISTER] Chemin original: "${path}" → normalisé: "${normalizedPath}"`);
        
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
            console.log(`🔍 [AUv3 LISTER] Chemin demandé: "${normalizedPath}"`);
            
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
                            console.log(`📋 [AUv3 LISTER] ${files.length} fichier(s) trouvé(s) dans "${normalizedPath}"`);
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
            
            // Envoyer la requête à Swift avec le chemin normalisé
            const message = {
                action: 'listFilesAUv3', // Action spécifique pour les fichiers AUv3
                requestId: requestId,
                path: normalizedPath, // Chemin normalisé (ex: "./", "./toto/", "./toto/titi/")
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
    console.log('📂 [auv3_file_lister] Supporte tous les chemins: "./", "./toto/", "./toto/titi/", etc.');
    console.log('📝 [auv3_file_lister] Exemples: get_auv3_folder_content("./"), get_auv3_folder_content("./Projects/")');
}


//usage examples

    // Exemples d'utilisation avec différents chemins:
    
    // Lister la racine
    // get_auv3_folder_content('./') ou get_auv3_folder_content('.')
    
    // Lister un sous-dossier
    // get_auv3_folder_content('./Projects/')
    // get_auv3_folder_content('./Exports/')  
    // get_auv3_folder_content('./MonDossier/')
    
    // Lister un dossier imbriqué
    // get_auv3_folder_content('./toto/titi/')
    // get_auv3_folder_content('./Projects/MyProject/')

    // if (typeof window.get_auv3_folder_content === 'function') {
    //     window.get_auv3_folder_content('./')
    //         .then(files => {
    //             console.log('📂 AUv3 files found:', files);
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
    //             console.error('❌ Error listing AUv3 files:', error);
    //         });
    // } else {
    //     console.error('❌ get_auv3_folder_content not available');
    // }