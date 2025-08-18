/**
 * ios_file_lister.js
 * Code minimaliste pour lister les fichiers iOS/AUv3
 * Reproduit exactement la logique du bouton 'List Projects' d'ios_apis.js
 */

// Variables globales pour gérer les callbacks
const pendingLists = {};
let requestIdCounter = 0;

// Fonction pour générer un ID unique
function nextId() {
    return ++requestIdCounter;
}

// Fonction pour vérifier si le bridge Swift est disponible
function bridgeAvailable() {
    return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
}

// Fonction pour envoyer un message au Swift
function postToSwift(payload) {
    if (bridgeAvailable()) {
        try {
            window.webkit.messageHandlers.swiftBridge.postMessage(payload);
        } catch (e) {
            console.warn('[ios_file_lister] Failed to post to swiftBridge', e, payload);
        }
    } else {
        console.warn('[ios_file_lister] swiftBridge not available');
    }
}

// Gestionnaire des réponses du Swift (exactement comme dans ios_apis.js)
function handleSwiftResponse(msg) {
    if (msg.action === 'listFilesResult') {
        const cb = pendingLists[msg.requestId];
        if (cb) {
            delete pendingLists[msg.requestId];
            msg.success ? cb.resolve(msg.files || []) : cb.reject(new Error(msg.error || 'List failed'));
        }
    }
}

// Installer le gestionnaire de réponses
if (!window._iosFileListenerInstalled) {
    window._receiveFromSwift = function(msg) {
        handleSwiftResponse(msg);
    };
    window._iosFileListenerInstalled = true;
}

/**
 * Fonction pour récupérer le contenu d'un dossier sur iOS
 * Reproduit exactement auv3_file_list d'ios_apis.js
 */
function get_ios_folder_content(path = 'Projects') {
    return new Promise((resolve, reject) => {
        console.log('[ios_file_lister] Listage du dossier:', path);
        
        // Vérifier si AtomeFileSystem est disponible (comme dans ios_apis.js)
        if (window.AtomeFileSystem && window.AtomeFileSystem.listFiles) {
            window.AtomeFileSystem.listFiles(path, (result) => {
                if (result.success) resolve(result.data.files);
                else reject(new Error(result.error || 'List failed'));
            });
            return;
        }
        
        // Sinon utiliser le bridge Swift (exactement comme ios_apis.js)
        if (!bridgeAvailable()) {
            reject(new Error('swiftBridge not available'));
            return;
        }
        
        const id = nextId();
        pendingLists[id] = { resolve, reject };
        postToSwift({ action: 'listFiles', requestId: id, path });
    });
}

// Export global
window.get_ios_folder_content = get_ios_folder_content;

// Fonction utilitaire pour formater la liste des fichiers
function formatFileList(files) {
    if (!Array.isArray(files) || files.length === 0) {
        return 'Aucun fichier trouvé dans ce dossier.';
    }
    
    let output = `${files.length} élément(s) trouvé(s):\n\n`;
    
    files.forEach((file, index) => {
        const type = file.isDirectory ? '📁 [DIR]' : '📄 [FILE]';
        const size = file.size ? ` (${formatFileSize(file.size)})` : '';
        const modified = file.modificationDate ? ` - ${new Date(file.modificationDate).toLocaleString()}` : '';
        
        output += `${index + 1}. ${type} ${file.name}${size}${modified}\n`;
    });
    
    return output;
}

// Fonction utilitaire pour formater la taille des fichiers
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Export pour usage global
if (typeof window !== 'undefined') {
    window.get_ios_folder_content = get_ios_folder_content;
    window.formatFileList = formatFileList;
    console.log('[ios_file_lister] Fonctions exportées globalement');
}


//usage example


//     if (typeof window.get_ios_folder_content === 'function') {
//     window.get_ios_folder_content('./')
//         .then(files => {
//             console.log('📂 iOS files found:', files);
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
//             console.error('❌ Error listing iOS files:', error);
//         });
// } else {
//     console.error('❌ get_ios_folder_content not available. Type of function:', typeof window.get_ios_folder_content);
// }