/*
 * AUv3 File Handling Example
 * Demonstrates how to save and load files using the native iOS file system
 * Compatible with Squirrel syntax and components
 */

// =============================================================================
// UTILITAIRES DE BASE
// =============================================================================

/**
 * Sauvegarde un projet Atome avec Document Picker pour AUv3
 * @param {Object} projectData - Données du projet (objets, paramètres, etc.)
 * @param {string} projectName - Nom du projet
 * @returns {Promise} - Résultat de la sauvegarde
 */
async function sauvegarderProjetAUv3(projectData, projectName) {
    try {
        // Vérifier que l'API est disponible
        if (typeof window.AtomeFileSystem === 'undefined') {
            throw new Error('API FileSystem non disponible. WebView non configuré correctement.');
        }
        
        console.log(`💾 Sauvegarde AUv3 du projet: ${projectName}`);
        
        // Utiliser le Document Picker pour permettre à l'utilisateur de choisir l'emplacement
        const result = await new Promise((resolve, reject) => {
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'saveFileWithDocumentPicker',
                data: JSON.stringify(projectData),
                fileName: `${projectName}.atome`
            });
            
            // Handler pour la réponse
            window.documentPickerResult = (success, error) => {
                if (success) {
                    resolve(true);
                } else {
                    reject(new Error(error || 'Document Picker cancelled'));
                }
            };
        });
        
        console.log('✅ Projet AUv3 sauvegardé avec Document Picker');
        
        // Afficher un message de confirmation avec Squirrel
        $('div', {
            id: 'saveConfirmation',
            text: `✅ Projet "${projectName}" sauvegardé via Document Picker !`,
            css: {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '10px 20px',
                backgroundColor: '#2196F3',
                color: 'white',
                borderRadius: '5px',
                zIndex: '1000'
            }
        });
        
        // Supprimer la notification après 3 secondes
        setTimeout(() => {
            const notification = document.getElementById('saveConfirmation');
            if (notification) notification.remove();
        }, 3000);
        
        return result;
        
    } catch (error) {
        console.error('❌ Erreur sauvegarde AUv3:', error);
        
        // Afficher un message d'erreur avec Squirrel
        $('div', {
            id: 'saveError',
            text: `❌ Erreur: ${error.message}`,
            css: {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '10px 20px',
                backgroundColor: '#f44336',
                color: 'white',
                borderRadius: '5px',
                zIndex: '1000'
            }
        });
        
        setTimeout(() => {
            const errorNotif = document.getElementById('saveError');
            if (errorNotif) errorNotif.remove();
        }, 5000);
        
        throw error;
    }
}

/**
 * Sauvegarde un projet Atome
 * @param {Object} projectData - Données du projet (objets, paramètres, etc.)
 * @param {string} projectName - Nom du projet
 * @returns {Promise} - Résultat de la sauvegarde
 */
async function sauvegarderProjet(projectData, projectName) {
    try {
        // Vérifier que l'API est disponible
        if (typeof window.AtomeFileSystem === 'undefined') {
            throw new Error('API FileSystem non disponible. WebView non configuré correctement.');
        }
        
        console.log(`💾 Sauvegarde du projet: ${projectName}`);
        
        // Le bridge ajoute automatiquement "Projects/" et ".atome"
        const result = await window.saveProject(projectData, projectName);
        console.log('✅ Projet sauvegardé avec succès');
        
        // Afficher un message de confirmation avec Squirrel
        $('div', {
            id: 'saveConfirmation',
            text: `✅ Projet "${projectName}" sauvegardé !`,
            css: {
                position: 'fixed',
                top: '20px',
                right: '20px',
                padding: '10px 20px',
                backgroundColor: '#4CAF50',
                color: 'white',
                borderRadius: '5px',
                zIndex: '1000'
            }
        });
        
        // Supprimer la notification après 3 secondes
        setTimeout(() => {
            const notification = document.getElementById('saveConfirmation');
            if (notification) notification.remove();
        }, 3000);
        
        return result;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde:', error);
        throw error;
    }
}

/**
 * Charge un projet Atome
 * @param {string} projectName - Nom du projet à charger
 * @returns {Promise<Object>} - Données du projet
 */
async function chargerProjet(projectName) {
    try {
        console.log(`📂 Chargement du projet: ${projectName}`);
        
        const projectData = await window.loadProject(projectName);
        console.log('✅ Projet chargé avec succès');
        
        return projectData;
    } catch (error) {
        console.error('❌ Erreur lors du chargement:', error);
        throw error;
    }
}

/**
 * Exporte de l'audio vers le système de fichiers
 * @param {ArrayBuffer|string} audioData - Données audio
 * @param {string} fileName - Nom du fichier (sans extension)
 * @returns {Promise} - Résultat de l'export
 */
async function exporterAudio(audioData, fileName) {
    try {
        console.log(`🎵 Export audio: ${fileName}`);
        
        const result = await window.exportAudio(audioData, fileName);
        console.log('✅ Audio exporté avec succès');
        
        return result;
    } catch (error) {
        console.error('❌ Erreur lors de l\'export audio:', error);
        throw error;
    }
}

// =============================================================================
// INTERFACE UTILISATEUR SQUIRREL
// =============================================================================

/**
 * Crée une interface de gestion des fichiers avec Squirrel
 */
function creerInterfaceFichiers() {
    // Container principal
    const container = $('div', {
        id: 'fileManagerContainer',
        css: {
            position: 'fixed',
            top: '50px',
            left: '50px',
            width: '400px',
            backgroundColor: '#f0f0f0',
            border: '2px solid #333',
            borderRadius: '10px',
            padding: '20px',
            zIndex: '999',
            fontFamily: 'Arial, sans-serif'
        }
    });

    // Titre
    container.appendChild($('h3', {
        text: '📁 Gestionnaire de Fichiers AUv3',
        css: {
            margin: '0 0 20px 0',
            color: '#333',
            textAlign: 'center'
        }
    }));

    // Section sauvegarde
    const saveSection = $('div', {
        css: { marginBottom: '20px' }
    });
    
    saveSection.appendChild($('h4', {
        text: '💾 Sauvegarder un projet',
        css: { margin: '0 0 10px 0', color: '#555' }
    }));
    
    const projectNameInput = $('input', {
        id: 'projectNameInput',
        type: 'text',
        placeholder: 'Nom du projet...',
        css: {
            width: '100%',
            padding: '8px',
            marginBottom: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxSizing: 'border-box'
        }
    });
    saveSection.appendChild(projectNameInput);
    
    const saveButton = $('button', {
        text: '💾 Sauvegarder',
        css: {
            width: '100%',
            padding: '10px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
        }
    });
    
    saveButton.addEventListener('click', async () => {
        const projectName = projectNameInput.value.trim();
        if (!projectName) {
            alert('⚠️ Veuillez entrer un nom de projet');
            return;
        }
        
        // Exemple de données de projet
        const projectData = {
            version: '1.0',
            created: new Date().toISOString(),
            atoms: [
                { type: 'oscillator', frequency: 440, amplitude: 0.5 },
                { type: 'filter', cutoff: 1000, resonance: 0.3 }
            ],
            settings: {
                sampleRate: 44100,
                bufferSize: 512
            }
        };
        
        try {
            await sauvegarderProjet(projectData, projectName);
            projectNameInput.value = '';
        } catch (error) {
            alert('❌ Erreur lors de la sauvegarde: ' + error.message);
        }
    });
    
    saveSection.appendChild(saveButton);
    
    // Bouton spécialement pour AUv3 avec Document Picker
    const saveAUv3Button = $('button', {
        text: '📄 Sauvegarder avec Document Picker (AUv3)',
        css: {
            width: '100%',
            padding: '10px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            marginTop: '10px'
        }
    });
    
    saveAUv3Button.addEventListener('click', async () => {
        const projectName = projectNameInput.value.trim();
        if (!projectName) {
            alert('⚠️ Veuillez entrer un nom de projet');
            return;
        }
        
        // Exemple de données de projet
        const projectData = {
            version: '1.0',
            created: new Date().toISOString(),
            atoms: [
                { type: 'oscillator', frequency: 440, amplitude: 0.5 },
                { type: 'filter', cutoff: 1000, resonance: 0.3 }
            ],
            settings: {
                sampleRate: 44100,
                bufferSize: 512
            }
        };
        
        try {
            await sauvegarderProjetAUv3(projectData, projectName);
            projectNameInput.value = '';
        } catch (error) {
            alert('❌ Erreur lors de la sauvegarde AUv3: ' + error.message);
        }
    });
    
    saveSection.appendChild(saveAUv3Button);
    container.appendChild(saveSection);

    // Section chargement
    const loadSection = $('div', {
        css: { marginBottom: '20px' }
    });
    
    loadSection.appendChild($('h4', {
        text: '📂 Charger un projet',
        css: { margin: '0 0 10px 0', color: '#555' }
    }));
    
    const loadNameInput = $('input', {
        id: 'loadNameInput',
        type: 'text',
        placeholder: 'Nom du projet à charger...',
        css: {
            width: '100%',
            padding: '8px',
            marginBottom: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxSizing: 'border-box'
        }
    });
    loadSection.appendChild(loadNameInput);
    
    const loadButton = $('button', {
        text: '📂 Charger',
        css: {
            width: '100%',
            padding: '10px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
        }
    });
    
    loadButton.addEventListener('click', async () => {
        const projectName = loadNameInput.value.trim();
        if (!projectName) {
            alert('⚠️ Veuillez entrer un nom de projet');
            return;
        }
        
        try {
            const projectData = await chargerProjet(projectName);
            console.log('📁 Données du projet chargé:', projectData);
            
            // Afficher les données dans un popup
            alert(`✅ Projet chargé:\n${JSON.stringify(projectData, null, 2)}`);
            loadNameInput.value = '';
        } catch (error) {
            alert('❌ Erreur lors du chargement: ' + error.message);
        }
    });
    
    loadSection.appendChild(loadButton);
    container.appendChild(loadSection);

    // Section liste des fichiers
    const listSection = $('div', {
        css: { marginBottom: '20px' }
    });
    
    listSection.appendChild($('h4', {
        text: '📋 Fichiers disponibles',
        css: { margin: '0 0 10px 0', color: '#555' }
    }));
    
    const listButton = $('button', {
        text: '🔄 Actualiser la liste',
        css: {
            width: '100%',
            padding: '10px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '10px'
        }
    });
    
    const filesList = $('div', {
        id: 'filesList',
        css: {
            maxHeight: '150px',
            overflowY: 'auto',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '10px',
            backgroundColor: 'white'
        }
    });
    
    listButton.addEventListener('click', async () => {
        try {
            await listerFichiers('Projects', filesList);
        } catch (error) {
            console.error('❌ Erreur lors du listing:', error);
        }
    });
    
    listSection.appendChild(listButton);
    listSection.appendChild(filesList);
    container.appendChild(listSection);

    // Bouton fermer
    const closeButton = $('button', {
        text: '❌ Fermer',
        css: {
            width: '100%',
            padding: '10px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
        }
    });
    
    closeButton.addEventListener('click', () => {
        container.remove();
    });
    
    container.appendChild(closeButton);
    
    // Ajouter à la page
    document.body.appendChild(container);
    
    // Charger la liste initiale (créer le dossier s'il n'existe pas)
    listerFichiers('Projects', filesList).catch(() => {
        console.log('📁 Dossier Projects pas encore créé - sera créé à la première sauvegarde');
    });
}

/**
 * Liste les fichiers dans un dossier
 * @param {string} folder - Nom du dossier
 * @param {HTMLElement} container - Élément où afficher la liste
 */
async function listerFichiers(folder, container) {
    try {
        return new Promise((resolve, reject) => {
            window.AtomeFileSystem.listFiles(folder, (result) => {
                if (result.success) {
                    container.innerHTML = '';
                    
                    if (result.data.files.length === 0) {
                        container.appendChild($('p', {
                            text: 'Aucun fichier trouvé',
                            css: { color: '#666', fontStyle: 'italic' }
                        }));
                    } else {
                        result.data.files.forEach(file => {
                            const fileItem = $('div', {
                                css: {
                                    padding: '5px',
                                    borderBottom: '1px solid #eee',
                                    cursor: 'pointer'
                                }
                            });
                            
                            fileItem.appendChild($('span', {
                                text: `📄 ${file.name}`,
                                css: { fontWeight: 'bold' }
                            }));
                            
                            fileItem.appendChild($('span', {
                                text: ` (${Math.round(file.size / 1024)} KB)`,
                                css: { color: '#666', fontSize: '12px' }
                            }));
                            
                            fileItem.addEventListener('click', () => {
                                const projectName = file.name.replace('.atome', '');
                                document.getElementById('loadNameInput').value = projectName;
                            });
                            
                            container.appendChild(fileItem);
                        });
                    }
                    resolve(result.data.files);
                } else {
                    // Si le dossier n'existe pas encore
                    if (result.error && result.error.includes("n'existe pas")) {
                        container.innerHTML = '<p style="color: #666; font-style: italic;">📁 Dossier pas encore créé - sauvegardez un projet pour le créer</p>';
                    } else {
                        container.innerHTML = '<p style="color: red;">Erreur: ' + result.error + '</p>';
                    }
                    reject(new Error(result.error));
                }
            });
        });
    } catch (error) {
        console.error('❌ Erreur listing:', error);
        container.innerHTML = '<p style="color: red;">Erreur lors du listing</p>';
    }
}

// =============================================================================
// FONCTIONS D'EXEMPLE AVANCÉES
// =============================================================================

/**
 * Sauvegarde automatique périodique
 */
function activerSauvegardeAutomatique(projectName, intervalSeconds = 30) {
    console.log(`🔄 Sauvegarde automatique activée toutes les ${intervalSeconds}s`);
    
    return setInterval(async () => {
        try {
            const projectData = {
                version: '1.0',
                lastSaved: new Date().toISOString(),
                autoSave: true,
                data: 'Données de sauvegarde automatique...'
            };
            
            await sauvegarderProjet(projectData, `${projectName}_autosave`);
            console.log('💾 Sauvegarde automatique effectuée');
        } catch (error) {
            console.error('❌ Erreur sauvegarde automatique:', error);
        }
    }, intervalSeconds * 1000);
}

/**
 * Export d'audio avec feedback visuel
 */
async function exporterAudioAvecFeedback(audioData, fileName) {
    // Créer un indicateur de progression
    const progressDiv = $('div', {
        id: 'exportProgress',
        css: {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '20px',
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: 'white',
            borderRadius: '10px',
            zIndex: '9999',
            textAlign: 'center'
        }
    });
    
    progressDiv.appendChild($('div', {
        text: '🎵 Export en cours...',
        css: { marginBottom: '10px' }
    }));
    
    const progressBar = $('div', {
        css: {
            width: '200px',
            height: '10px',
            backgroundColor: '#333',
            borderRadius: '5px',
            overflow: 'hidden'
        }
    });
    
    const progressFill = $('div', {
        css: {
            width: '0%',
            height: '100%',
            backgroundColor: '#4CAF50',
            transition: 'width 0.3s'
        }
    });
    
    progressBar.appendChild(progressFill);
    progressDiv.appendChild(progressBar);
    document.body.appendChild(progressDiv);
    
    // Simuler le progrès
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        progressFill.style.width = progress + '%';
    }, 100);
    
    try {
        const result = await exporterAudio(audioData, fileName);
        
        clearInterval(progressInterval);
        progressFill.style.width = '100%';
        
        setTimeout(() => {
            progressDiv.remove();
        }, 1000);
        
        return result;
    } catch (error) {
        clearInterval(progressInterval);
        progressDiv.remove();
        throw error;
    }
}

// =============================================================================
// INITIALISATION ET TESTS
// =============================================================================

/**
 * Test de l'API de fichiers
 */
async function testerApiFichiers() {
    console.log('🧪 Test de l\'API de fichiers...');
    
    try {
        // Vérifier que l'API est disponible
        if (typeof window.AtomeFileSystem === 'undefined') {
            throw new Error('API FileSystem non disponible');
        }
        
        // Test de sauvegarde
        const testData = {
            test: true,
            timestamp: Date.now(),
            message: 'Hello from AUv3!'
        };
        
        await sauvegarderProjet(testData, 'test_api');
        console.log('✅ Test sauvegarde OK');
        
        // Test de chargement
        const loadedData = await chargerProjet('test_api');
        console.log('✅ Test chargement OK:', loadedData);
        
        // Test d'informations système
        return new Promise((resolve) => {
            window.AtomeFileSystem.getStorageInfo((result) => {
                console.log('📊 Informations de stockage:', result);
                resolve(result);
            });
        });
        
    } catch (error) {
        console.error('❌ Test échoué:', error);
        throw error;
    }
}

// =============================================================================
// EXPORT DES FONCTIONS GLOBALES
// =============================================================================

// Rendre les fonctions disponibles globalement
window.FileHandlingExample = {
    sauvegarderProjet,
    chargerProjet,
    exporterAudio,
    creerInterfaceFichiers,
    listerFichiers,
    activerSauvegardeAutomatique,
    exporterAudioAvecFeedback,
    testerApiFichiers
};

// Message de démarrage
console.log('📁 AUv3 File Handling Example chargé !');
console.log('💡 Utilisez: window.FileHandlingExample.creerInterfaceFichiers() pour ouvrir l\'interface');
console.log('🧪 Utilisez: window.FileHandlingExample.testerApiFichiers() pour tester l\'API');

// Fonction de debugging pour vérifier l'API immédiatement
window.debugFileSystemAPI = function() {
    console.log('🔍 État de l\'API FileSystem:');
    console.log('- window.AtomeFileSystem:', typeof window.AtomeFileSystem);
    console.log('- window.saveProject:', typeof window.saveProject);
    console.log('- window.loadProject:', typeof window.loadProject);
    console.log('- window.exportAudio:', typeof window.exportAudio);
    
    if (typeof window.AtomeFileSystem !== 'undefined') {
        console.log('✅ API FileSystem disponible !');
        // Test simple de l'API
        window.AtomeFileSystem.getStorageInfo((result) => {
            console.log('📊 Info stockage:', result);
        });
    } else {
        console.log('❌ API FileSystem non disponible');
        console.log('💡 Vérifiez:');
        console.log('   1. WebViewManager.swift appelle addFileSystemAPI()');
        console.log('   2. FileSystemBridge.swift est bien lié au projet');
        console.log('   3. MainAppFileManager.swift est accessible');
    }
};

// Fonction pour créer les boutons avec fallback DOM natif
function creerBoutons() {
    console.log('🔧 Création des boutons de test...');
    
    // Fonction helper pour créer des boutons avec ou sans Squirrel
    function creerBouton(config) {
        let button;
        
        if (typeof $ === 'function') {
            // Utiliser Squirrel si disponible
            button = $(config.tag || 'button', {
                text: config.text,
                css: config.css
            });
        } else {
            // Fallback DOM natif
            button = document.createElement(config.tag || 'button');
            button.textContent = config.text;
            
            // Appliquer les styles
            Object.assign(button.style, config.css);
        }
        
        if (config.click) {
            button.addEventListener('click', config.click);
        }
        
        return button;
    }
    
    // 1. Bouton Gestionnaire de Fichiers
    const quickAccessButton = creerBouton({
        text: '📁 Gestionnaire de Fichiers AUv3',
        css: {
            position: 'fixed',
            top: '20px',
            left: '20px',
            padding: '15px 20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: '1000',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        },
        click: () => {
            const existing = document.getElementById('fileManagerContainer');
            if (existing) {
                existing.remove();
            } else {
                creerInterfaceFichiers();
            }
        }
    });
    
    // 2. Bouton Document Picker direct
    const documentPickerButton = creerBouton({
        text: '📄 Document Picker AUv3',
        css: {
            position: 'fixed',
            top: '20px',
            left: '280px',
            padding: '15px 20px',
            backgroundColor: '#FF6B35',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: '1000',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        },
        click: async () => {
            console.log('🔥 DÉBUT: Clic sur Document Picker AUv3');
            
            try {
                // 1. Vérifier les APIs disponibles
                console.log('🔍 Vérification des APIs:');
                console.log('- window.AtomeFileSystem:', typeof window.AtomeFileSystem);
                console.log('- window.webkit:', typeof window.webkit);
                console.log('- window.webkit.messageHandlers:', typeof window.webkit?.messageHandlers);
                console.log('- window.webkit.messageHandlers.swiftBridge:', typeof window.webkit?.messageHandlers?.swiftBridge);
                
                // 2. Vérifier le bridge
                if (typeof window.webkit === 'undefined' || 
                    typeof window.webkit.messageHandlers === 'undefined' || 
                    typeof window.webkit.messageHandlers.swiftBridge === 'undefined') {
                    throw new Error('Bridge Swift non disponible. Vérifiez WebViewManager.swift');
                }
                
                // 3. Créer les données de test
                const testData = {
                    version: '1.0',
                    created: new Date().toISOString(),
                    testAUv3: true,
                    atoms: [
                        { type: 'oscillator', frequency: 440 },
                        { type: 'filter', cutoff: 800 }
                    ]
                };
                
                console.log('� Données à sauvegarder:', testData);
                
                // 4. Notification de début
                const startNotification = document.createElement('div');
                startNotification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 20px;
                    background-color: #FF6B35;
                    color: white;
                    border-radius: 5px;
                    z-index: 1001;
                    font-family: Arial, sans-serif;
                `;
                startNotification.textContent = '�🚀 Lancement Document Picker...';
                document.body.appendChild(startNotification);
                
                // 5. Préparer le message pour Swift
                const message = {
                    action: 'saveFileWithDocumentPicker',
                    data: JSON.stringify(testData),
                    fileName: 'TestDocumentPicker.atome'
                };
                
                console.log('📤 Message envoyé au bridge Swift:', message);
                
                // 6. Envoyer le message au bridge Swift
                window.webkit.messageHandlers.swiftBridge.postMessage(message);
                console.log('✅ Message envoyé avec succès !');
                
                // 7. Attendre une réponse (timeout après 10 secondes)
                const result = await new Promise((resolve, reject) => {
                    // Timeout si pas de réponse
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout: Pas de réponse du Document Picker après 10 secondes'));
                    }, 10000);
                    
                    // Handler pour la réponse
                    window.documentPickerResult = (success, error) => {
                        clearTimeout(timeout);
                        console.log('📥 Réponse reçue du Document Picker:', { success, error });
                        
                        if (success) {
                            resolve(true);
                        } else {
                            reject(new Error(error || 'Document Picker cancelled'));
                        }
                    };
                    
                    console.log('⏳ En attente de la réponse du Document Picker...');
                });
                
                // 8. Succès
                console.log('✅ Document Picker terminé avec succès !');
                
                // Supprimer notification de début
                if (startNotification.parentNode) {
                    startNotification.remove();
                }
                
                // Notification de succès
                const successNotification = document.createElement('div');
                successNotification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 20px;
                    background-color: #4CAF50;
                    color: white;
                    border-radius: 5px;
                    z-index: 1001;
                    font-family: Arial, sans-serif;
                `;
                successNotification.textContent = '✅ Fichier sauvegardé via Document Picker !';
                document.body.appendChild(successNotification);
                
                setTimeout(() => {
                    if (successNotification.parentNode) {
                        successNotification.remove();
                    }
                }, 3000);
                
            } catch (error) {
                console.error('❌ ERREUR Document Picker:', error);
                console.error('Stack trace:', error.stack);
                
                // LOGS DE DEBUGGING POUR LE PANNEAU D'ERREUR
                console.log('🔧 DÉBUT: Création du panneau d\'erreur...');
                console.log('🔧 document.body disponible:', !!document.body);
                console.log('🔧 document.createElement fonctionne:', typeof document.createElement);
                
                try {
                    // Créer notification d'erreur détaillée
                    console.log('🔧 Création de l\'élément errorDiv...');
                    const errorDiv = document.createElement('div');
                    console.log('🔧 errorDiv créé:', !!errorDiv);
                    
                    console.log('🔧 Application des styles CSS...');
                    errorDiv.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        padding: 20px;
                        background-color: rgba(255, 0, 0, 0.9);
                        color: white;
                        border-radius: 10px;
                        z-index: 10000;
                        max-width: 80%;
                        text-align: left;
                        font-family: monospace;
                        font-size: 12px;
                        white-space: pre-wrap;
                    `;
                    console.log('🔧 Styles CSS appliqués');
                    
                    console.log('🔧 Création du message d\'erreur...');
                    let errorMessage = `❌ ERREUR Document Picker:\n\n`;
                    errorMessage += `Message: ${error.message}\n\n`;
                    errorMessage += `APIs disponibles:\n`;
                    errorMessage += `- window.AtomeFileSystem: ${typeof window.AtomeFileSystem}\n`;
                    errorMessage += `- window.webkit: ${typeof window.webkit}\n`;
                    errorMessage += `- messageHandlers: ${typeof window.webkit?.messageHandlers}\n`;
                    errorMessage += `- swiftBridge: ${typeof window.webkit?.messageHandlers?.swiftBridge}\n\n`;
                    errorMessage += `Vérifiez:\n`;
                    errorMessage += `1. FileSystemBridge.swift est lié au projet\n`;
                    errorMessage += `2. WebViewManager.swift appelle addFileSystemAPI()\n`;
                    errorMessage += `3. App lancée en mode iOS (pas web browser)\n\n`;
                    errorMessage += `Stack trace:\n${error.stack || 'Non disponible'}`;
                    
                    console.log('🔧 Attribution du textContent...');
                    errorDiv.textContent = errorMessage;
                    console.log('🔧 textContent attribué');
                    
                    // Bouton fermer
                    console.log('🔧 Création du bouton fermer...');
                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = '✕ Fermer';
                    closeBtn.style.cssText = `
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: rgba(255,255,255,0.2);
                        border: 1px solid white;
                        color: white;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                    `;
                    closeBtn.addEventListener('click', () => {
                        console.log('🔧 Bouton fermer cliqué');
                        errorDiv.remove();
                    });
                    console.log('🔧 Bouton fermer créé');
                    
                    console.log('🔧 Ajout du bouton à errorDiv...');
                    errorDiv.appendChild(closeBtn);
                    console.log('🔧 Bouton ajouté à errorDiv');
                    
                    console.log('🔧 Ajout d\'errorDiv au document.body...');
                    console.log('🔧 document.body avant ajout:', document.body);
                    document.body.appendChild(errorDiv);
                    console.log('🔧 errorDiv ajouté au DOM');
                    
                    // Vérifier que l'élément est bien dans le DOM
                    console.log('🔧 errorDiv dans le DOM:', document.body.contains(errorDiv));
                    console.log('🔧 errorDiv visible (offsetWidth > 0):', errorDiv.offsetWidth > 0);
                    console.log('🔧 errorDiv styles calculés:', window.getComputedStyle(errorDiv).display);
                    console.log('🔧 errorDiv position:', window.getComputedStyle(errorDiv).position);
                    console.log('🔧 errorDiv z-index:', window.getComputedStyle(errorDiv).zIndex);
                    
                    // Forcer un reflow
                    console.log('🔧 Forçage d\'un reflow...');
                    errorDiv.offsetHeight; // Trigger reflow
                    
                    // Auto-suppression après 15 secondes
                    setTimeout(() => {
                        console.log('🔧 Timeout auto-suppression...');
                        if (errorDiv.parentNode) {
                            console.log('🔧 Suppression auto du panneau d\'erreur');
                            errorDiv.remove();
                        } else {
                            console.log('🔧 errorDiv déjà supprimé');
                        }
                    }, 15000);
                    
                    console.log('✅ PANNEAU D\'ERREUR CRÉÉ ET AJOUTÉ AU DOM !');
                    
                } catch (panelError) {
                    console.error('❌ ERREUR lors de la création du panneau:', panelError);
                    console.error('❌ Stack trace panneau:', panelError.stack);
                    
                    // Fallback: simple alert
                    alert(`❌ ERREUR Document Picker:\n${error.message}\n\nErreur panneau: ${panelError.message}`);
                }
            }
        }
    });
    
    // 3. Bouton Debug Localisation
    const debugLocationButton = creerBouton({
        text: '🔍 Où sauvegarde AUv3?',
        css: {
            position: 'fixed',
            top: '80px',
            left: '20px',
            padding: '10px 15px',
            backgroundColor: '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: '1000',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
        },
        click: () => {
            if (typeof window.AtomeFileSystem !== 'undefined') {
                window.AtomeFileSystem.getStorageInfo((result) => {
                    console.log('📁 Info stockage AUv3:', result);
                    
                    const popup = document.createElement('div');
                    popup.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background-color: rgba(0,0,0,0.9);
                        color: white;
                        padding: 20px;
                        border-radius: 10px;
                        z-index: 10000;
                        max-width: 80%;
                        text-align: left;
                        font-family: monospace;
                        font-size: 12px;
                        white-space: pre;
                    `;
                    
                    popup.textContent = `📁 Stockage AUv3:\n\n${JSON.stringify(result, null, 2)}\n\nNote: Ce dossier est inaccessible aux utilisateurs.\nUtilisez le Document Picker pour sauvegarder dans un dossier visible.`;
                    
                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = '✕';
                    closeBtn.style.cssText = `
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: none;
                        border: none;
                        color: white;
                        font-size: 16px;
                        cursor: pointer;
                    `;
                    closeBtn.addEventListener('click', () => popup.remove());
                    popup.appendChild(closeBtn);
                    
                    document.body.appendChild(popup);
                    
                    setTimeout(() => {
                        if (popup.parentNode) popup.remove();
                    }, 10000);
                });
            } else {
                alert('❌ API FileSystem non disponible');
            }
        }
    });
    
    // 4. Bouton Test Simple
    const testButton = creerBouton({
        text: '🧪 Test Simple',
        css: {
            position: 'fixed',
            top: '80px',
            left: '200px',
            padding: '10px 15px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: '1000',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
        },
        click: () => {
            console.log('🧪 Test des APIs...');
            window.debugFileSystemAPI();
            
            // Notification visuelle
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 10px 20px;
                background-color: #4CAF50;
                color: white;
                border-radius: 5px;
                z-index: 1001;
                font-family: Arial, sans-serif;
            `;
            notification.textContent = '🧪 Test lancé - Vérifiez la console !';
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
        }
    });
    
    // 5. Bouton Test Panneau DOM
    const testPanelButton = creerBouton({
        text: '🎭 Test Panneau',
        css: {
            position: 'fixed',
            top: '80px',
            left: '340px',
            padding: '10px 15px',
            backgroundColor: '#E91E63',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: '1000',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
        },
        click: () => {
            console.log('🎭 Test création panneau DOM...');
            
            try {
                // Test simple de création d'un panneau
                const testPanel = document.createElement('div');
                testPanel.style.cssText = `
                    position: fixed;
                    top: 30%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 300px;
                    padding: 20px;
                    background-color: rgba(0, 150, 255, 0.95);
                    color: white;
                    border-radius: 10px;
                    z-index: 10000;
                    text-align: center;
                    font-family: Arial, sans-serif;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                `;
                
                testPanel.innerHTML = `
                    <h3>🎭 Test Panneau DOM</h3>
                    <p>Ce panneau teste si les overlays fonctionnent correctement dans l'AUv3.</p>
                    <p><strong>DOM Status:</strong></p>
                    <p>document.body: ${!!document.body ? '✅' : '❌'}</p>
                    <p>createElement: ${!!document.createElement ? '✅' : '❌'}</p>
                    <p>appendChild: ${!!document.body?.appendChild ? '✅' : '❌'}</p>
                    <button onclick="this.parentElement.remove()" style="
                        margin-top: 10px;
                        padding: 8px 16px;
                        background-color: rgba(255,255,255,0.2);
                        border: 1px solid white;
                        border-radius: 4px;
                        color: white;
                        cursor: pointer;
                    ">🗑️ Fermer Test</button>
                `;
                
                console.log('🎭 Ajout du panneau de test au DOM...');
                document.body.appendChild(testPanel);
                console.log('🎭 Panneau de test ajouté !');
                
                // Vérifications
                console.log('🎭 Panneau dans DOM:', document.body.contains(testPanel));
                console.log('🎭 Panneau visible:', testPanel.offsetWidth > 0);
                console.log('🎭 Styles calculés:', {
                    display: window.getComputedStyle(testPanel).display,
                    position: window.getComputedStyle(testPanel).position,
                    zIndex: window.getComputedStyle(testPanel).zIndex,
                    visibility: window.getComputedStyle(testPanel).visibility
                });
                
                // Auto-suppression après 10 secondes
                setTimeout(() => {
                    if (testPanel.parentNode) {
                        console.log('🎭 Auto-suppression du panneau de test');
                        testPanel.remove();
                    }
                }, 10000);
                
            } catch (error) {
                console.error('❌ Erreur test panneau:', error);
                alert('❌ Erreur test panneau: ' + error.message);
            }
        }
    });
    
    // Ajouter tous les boutons au DOM
    document.body.appendChild(quickAccessButton);
    document.body.appendChild(documentPickerButton);
    document.body.appendChild(debugLocationButton);
    document.body.appendChild(testButton);
    document.body.appendChild(testPanelButton);
    
    console.log('✅ 5 boutons créés avec succès !');
    console.log('📁 Bouton bleu: Gestionnaire de Fichiers');
    console.log('📄 Bouton orange: Document Picker direct');
    console.log('🔍 Bouton violet: Debug localisation');
    console.log('🧪 Bouton vert: Test simple');
    console.log('🎭 Bouton rose: Test panneau DOM');
}

// Attendre que le DOM soit prêt et créer les boutons
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', creerBoutons);
} else {
    // DOM déjà prêt
    setTimeout(creerBoutons, 100);
}

// API disponible - pas d'appels automatiques pour éviter les erreurs
console.log('🔍 Utilisez window.debugFileSystemAPI() pour vérifier l\'API manuellement');
