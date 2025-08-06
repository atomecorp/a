/*
 * AUv3 File Handling Example
 * Demonstrates how to save and load files using the native iOS file system
 * Compatible with Squirrel syntax and components
 */

// =============================================================================
// UTILITAIRES DE BASE
// =============================================================================

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

// Créer un bouton d'accès rapide à l'interface
const quickAccessButton = $('button', {
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
    }
});

quickAccessButton.addEventListener('click', () => {
    // Supprimer l'interface existante si présente
    const existing = document.getElementById('fileManagerContainer');
    if (existing) {
        existing.remove();
    } else {
        creerInterfaceFichiers();
    }
});

document.body.appendChild(quickAccessButton);

// API disponible - pas d'appels automatiques pour éviter les erreurs
console.log('🔍 Utilisez window.debugFileSystemAPI() pour vérifier l\'API manuellement');
