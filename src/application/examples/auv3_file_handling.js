/*
 * AUv3 File Handling Example
 * Demonstrates how to save and load files using the native iOS file system
 * Compatible with Squirrel syntax and components
 */

// =============================================================================
// UTILITAIRES DE BASE
// =============================================================================

/**
 * Détecte si nous sommes dans une extension AUv3 ou dans l'app principale
 * @returns {boolean} - true si nous sommes dans l'extension AUv3
 */
function estDansAUv3() {
    // Méthodes pour détecter l'extension AUv3
    if (typeof window.webkit !== 'undefined' && 
        typeof window.webkit.messageHandlers !== 'undefined' && 
        typeof window.webkit.messageHandlers.swiftBridge !== 'undefined') {
        return true; // Bridge Swift disponible = probablement AUv3
    }
    
    // Vérifier l'user agent ou d'autres indices
    const userAgent = navigator.userAgent || '';
    if (userAgent.includes('AudioUnit') || userAgent.includes('AUv3')) {
        return true;
    }
    
    // Vérifier si AtomeFileSystem (app principale) est disponible
    return typeof window.AtomeFileSystem === 'undefined';
}

/**
 * Log sécurisé pour éviter les crashes
 * @param {string} message - Message à logger
 * @param {any} data - Données optionnelles à logger
 */
function logSafe(message, data = null) {
    try {
        if (data) {
            console.log(message, data);
        } else {
            console.log(message);
        }
    } catch (error) {
        // Si même console.log plante, on ignore silencieusement
    }
}

/**
 * Sauvegarde un projet Atome avec Document Picker pour AUv3
 * @param {Object} projectData - Données du projet (objets, paramètres, etc.)
 * @param {string} projectName - Nom du projet
 * @returns {Promise} - Résultat de la sauvegarde
 */
async function sauvegarderProjetAUv3(projectData, projectName) {
    try {
        logSafe('🔍 Détection environnement:', {
            estAUv3: estDansAUv3(),
            hasWebkit: typeof window.webkit !== 'undefined',
            hasSwiftBridge: typeof window.webkit?.messageHandlers?.swiftBridge !== 'undefined',
            hasAtomeFileSystem: typeof window.AtomeFileSystem !== 'undefined'
        });

        // Vérifier que l'API Swift bridge est disponible (pas AtomeFileSystem pour AUv3)
        if (typeof window.webkit === 'undefined' || 
            typeof window.webkit.messageHandlers === 'undefined' || 
            typeof window.webkit.messageHandlers.swiftBridge === 'undefined') {
            throw new Error('Bridge Swift non disponible. WebView non configuré correctement.');
        }
        
        logSafe(`💾 Sauvegarde AUv3 du projet: ${projectName}`);
        
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
        
        logSafe('✅ Projet AUv3 sauvegardé avec Document Picker');
        
        // Afficher un message de confirmation avec Squirrel (si disponible)
        try {
            if (typeof $ === 'function') {
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
            } else {
                logSafe('ℹ️ Squirrel ($) non disponible - pas de notification visuelle');
            }
        } catch (notifError) {
            logSafe('⚠️ Erreur notification:', notifError.message);
        }
        
        return result;
        
    } catch (error) {
        logSafe('❌ Erreur sauvegarde AUv3:', error);
        
        // Afficher un message d'erreur avec Squirrel (si disponible)
        try {
            if (typeof $ === 'function') {
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
            } else {
                logSafe('ℹ️ Squirrel ($) non disponible - pas de notification d\'erreur visuelle');
            }
        } catch (notifError) {
            logSafe('⚠️ Erreur notification d\'erreur:', notifError.message);
        }
        
        throw error;
    }
}

/**
 * Charge un projet Atome avec Document Picker pour AUv3
 * @returns {Promise<Object>} - Données du projet chargé
 */
async function chargerProjetAUv3() {
    try {
        logSafe('🔍 Détection environnement pour chargement:', {
            estAUv3: estDansAUv3(),
            hasWebkit: typeof window.webkit !== 'undefined',
            hasSwiftBridge: typeof window.webkit?.messageHandlers?.swiftBridge !== 'undefined'
        });

        // Vérifier que l'API est disponible
        if (typeof window.webkit === 'undefined' || 
            typeof window.webkit.messageHandlers === 'undefined' || 
            typeof window.webkit.messageHandlers.swiftBridge === 'undefined') {
            throw new Error('Bridge Swift non disponible. WebView non configuré correctement.');
        }
        
        logSafe('📂 Ouverture du Document Picker pour charger un fichier...');
        
        // Utiliser le Document Picker pour permettre à l'utilisateur de choisir un fichier
        const result = await new Promise((resolve, reject) => {
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'loadFileWithDocumentPicker',
                fileTypes: ['atome', 'json'] // Types de fichiers acceptés
            });
            
            // Handler pour la réponse
            window.documentPickerLoadResult = (success, data, error) => {
                if (success && data) {
                    try {
                        const projectData = JSON.parse(data);
                        resolve(projectData);
                    } catch (parseError) {
                        reject(new Error('Fichier invalide: ' + parseError.message));
                    }
                } else {
                    reject(new Error(error || 'Document Picker annulé ou aucun fichier sélectionné'));
                }
            };
        });
        
        logSafe('✅ Projet AUv3 chargé avec Document Picker');
        
        // Afficher un message de confirmation avec Squirrel (si disponible)
        try {
            if (typeof $ === 'function') {
                $('div', {
                    id: 'loadConfirmation',
                    text: '✅ Projet chargé via Document Picker !',
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
                    const notification = document.getElementById('loadConfirmation');
                    if (notification) notification.remove();
                }, 3000);
            } else {
                logSafe('ℹ️ Squirrel ($) non disponible - pas de notification visuelle');
            }
        } catch (notifError) {
            logSafe('⚠️ Erreur notification:', notifError.message);
        }
        
        return result;
        
    } catch (error) {
        logSafe('❌ Erreur chargement AUv3:', error);
        
        // Afficher un message d'erreur avec Squirrel (si disponible)
        try {
            if (typeof $ === 'function') {
                $('div', {
                    id: 'loadError',
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
                    const errorNotif = document.getElementById('loadError');
                    if (errorNotif) errorNotif.remove();
                }, 5000);
            } else {
                logSafe('ℹ️ Squirrel ($) non disponible - pas de notification d\'erreur visuelle');
            }
        } catch (notifError) {
            logSafe('⚠️ Erreur notification d\'erreur:', notifError.message);
        }
        
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
    
    // Bouton pour charger avec Document Picker AUv3
    const loadAUv3Button = $('button', {
        text: '📂 Charger avec Document Picker (AUv3)',
        css: {
            width: '100%',
            padding: '10px',
            backgroundColor: '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            marginTop: '10px'
        }
    });
    
    loadAUv3Button.addEventListener('click', async () => {
        try {
            const projectData = await chargerProjetAUv3();
            console.log('📁 Données du projet chargé via Document Picker:', projectData);
            
            // Afficher les données dans un popup
            const popup = $('div', {
                css: {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    maxWidth: '80%',
                    maxHeight: '80%',
                    padding: '20px',
                    backgroundColor: 'white',
                    border: '2px solid #333',
                    borderRadius: '10px',
                    zIndex: '10000',
                    overflow: 'auto'
                }
            });
            
            popup.innerHTML = `
                <h3>📂 Projet chargé via Document Picker</h3>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; max-height: 400px;">${JSON.stringify(projectData, null, 2)}</pre>
                <button onclick="this.parentElement.remove()" style="
                    margin-top: 10px;
                    padding: 8px 16px;
                    background-color: #f44336;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                ">✕ Fermer</button>
            `;
            
            document.body.appendChild(popup);
        } catch (error) {
            alert('❌ Erreur lors du chargement via Document Picker: ' + error.message);
        }
    });
    
    saveSection.appendChild(loadAUv3Button);
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
    sauvegarderProjetAUv3,
    chargerProjet,
    chargerProjetAUv3,
    exporterAudio,
    creerInterfaceFichiers,
    listerFichiers,
    activerSauvegardeAutomatique,
    exporterAudioAvecFeedback,
    testerApiFichiers
};

// Message de démarrage sécurisé
logSafe('📁 AUv3 File Handling Example chargé !');
logSafe('🔍 Environnement détecté:', {
    estAUv3: estDansAUv3(),
    hasSquirrel: typeof $ !== 'undefined',
    hasWebkit: typeof window.webkit !== 'undefined',
    hasAtomeFileSystem: typeof window.AtomeFileSystem !== 'undefined'
});

if (!estDansAUv3()) {
    logSafe('💡 Utilisez: window.FileHandlingExample.creerInterfaceFichiers() pour ouvrir l\'interface');
    logSafe('🧪 Utilisez: window.FileHandlingExample.testerApiFichiers() pour tester l\'API');
} else {
    logSafe('🔌 Mode AUv3 détecté - Fonctionnalités Document Picker disponibles');
}

// Fonction de debugging pour vérifier l'API (sécurisée pour AUv3)
window.debugFileSystemAPI = function() {
    try {
        logSafe('🔍 État de l\'API FileSystem:');
        logSafe('- Environnement AUv3:', estDansAUv3());
        logSafe('- window.AtomeFileSystem:', typeof window.AtomeFileSystem);
        logSafe('- window.webkit:', typeof window.webkit);
        logSafe('- window.webkit.messageHandlers:', typeof window.webkit?.messageHandlers);
        logSafe('- window.webkit.messageHandlers.swiftBridge:', typeof window.webkit?.messageHandlers?.swiftBridge);
        logSafe('- window.saveProject:', typeof window.saveProject);
        logSafe('- window.loadProject:', typeof window.loadProject);
        logSafe('- window.exportAudio:', typeof window.exportAudio);
        logSafe('- Squirrel ($):', typeof $);
        
        if (estDansAUv3()) {
            logSafe('🔌 Mode AUv3: Utilisation du bridge Swift');
            if (typeof window.webkit?.messageHandlers?.swiftBridge !== 'undefined') {
                logSafe('✅ Bridge Swift disponible !');
            } else {
                logSafe('❌ Bridge Swift non disponible');
                logSafe('💡 Vérifiez WebViewManager.swift dans l\'extension AUv3');
            }
        } else if (typeof window.AtomeFileSystem !== 'undefined') {
            logSafe('✅ API FileSystem disponible !');
            // Test simple de l'API seulement dans l'app mère
            try {
                window.AtomeFileSystem.getStorageInfo((result) => {
                    logSafe('📊 Info stockage:', result);
                });
            } catch (storageError) {
                logSafe('⚠️ Erreur test stockage:', storageError.message);
            }
        } else {
            logSafe('❌ API FileSystem non disponible');
            logSafe('💡 Vérifiez:');
            logSafe('   1. WebViewManager.swift appelle addFileSystemAPI()');
            logSafe('   2. FileSystemBridge.swift est bien lié au projet');
            logSafe('   3. MainAppFileManager.swift est accessible');
        }
    } catch (debugError) {
        logSafe('❌ Erreur debug:', debugError.message);
    }
};

// Fonction pour créer les boutons avec fallback DOM natif et protection robuste


function creerBoutons() {
    try {
        logSafe('🔧 Création des boutons de test...');
        
        // Nettoyage préalable - supprimer les boutons existants
        try {
            const existingButtons = document.querySelectorAll('[id^="auv3-button-"], [style*="position: fixed"][style*="top: 20px"], [style*="position: fixed"][style*="top: 80px"]');
            existingButtons.forEach(btn => {
                if (btn && btn.parentNode) {
                    btn.remove();
                    logSafe('🧹 Bouton existant supprimé');
                }
            });
        } catch (cleanError) {
            logSafe('⚠️ Erreur nettoyage boutons existants:', cleanError);
        }
        
        // Fonction helper pour créer des boutons avec protection d'erreur
        function creerBouton(config) {
            try {
                let button;
                
                if (typeof $ === 'function' && !estDansAUv3()) {
                    // Utiliser Squirrel si disponible (seulement dans app mère)
                    button = $(config.tag || 'button', {
                        text: config.text,
                        css: config.css,
                        id: config.id
                    });
                } else {
                    // Fallback DOM natif
                    button = document.createElement(config.tag || 'button');
                    button.textContent = config.text;
                    
                    if (config.id) {
                        button.id = config.id;
                    }
                    
                    // Appliquer les styles de façon sécurisée
                    if (config.css) {
                        Object.keys(config.css).forEach(key => {
                            try {
                                button.style[key] = config.css[key];
                            } catch (styleError) {
                                logSafe(`⚠️ Erreur style ${key}:`, styleError);
                            }
                        });
                    }
                }
                
                if (config.click && button.addEventListener) {
                    button.addEventListener('click', config.click);
                }
                
                return button;
            } catch (buttonError) {
                logSafe('❌ Erreur création bouton:', buttonError);
                return null;
            }
        }
    
    // 1. Bouton Gestionnaire de Fichiers
    const quickAccessButton = creerBouton({
        text: '📁 Gestionnaire de Fichiers AUv3',
        id: 'auv3-button-manager',
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
    
    // 2. Bouton Document Picker pour sauvegarder
    const saveDocumentPickerButton = creerBouton({
        text: '💾 Sauvegarder AUv3',
        id: 'auv3-button-save',
        css: {
            position: 'fixed',
            top: '20px',
            left: '250px',
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
            console.log('🔥 DÉBUT: Clic sur Sauvegarder AUv3');
            
            try {
                // 1. Vérifier les APIs disponibles
                if (typeof window.webkit === 'undefined' || 
                    typeof window.webkit.messageHandlers === 'undefined' || 
                    typeof window.webkit.messageHandlers.swiftBridge === 'undefined') {
                    throw new Error('Bridge Swift non disponible. Vérifiez WebViewManager.swift');
                }
                
                // 2. Créer les données de test
                const testData = {
                    version: '1.0',
                    created: new Date().toISOString(),
                    testAUv3: true,
                    atoms: [
                        { type: 'oscillator', frequency: 440 },
                        { type: 'filter', cutoff: 800 }
                    ]
                };
                
                console.log('📊 Données à sauvegarder:', testData);
                
                // 3. Notification de début
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
                startNotification.textContent = '🚀 Lancement Document Picker sauvegarde...';
                document.body.appendChild(startNotification);
                
                // 4. Utiliser la fonction sauvegarderProjetAUv3
                await sauvegarderProjetAUv3(testData, 'TestSauvegardeAUv3');
                
                // 5. Supprimer notification de début
                if (startNotification.parentNode) {
                    startNotification.remove();
                }
                
            } catch (error) {
                console.error('❌ ERREUR Document Picker Sauvegarde:', error);
                
                // Supprimer notification de début si elle existe
                const startNotif = document.querySelector('div[style*="FF6B35"]');
                if (startNotif) startNotif.remove();
                
                // Simple alert pour l'erreur
                alert(`❌ ERREUR Document Picker Sauvegarde:\n${error.message}`);
            }
        }
    });
    
    // 3. Bouton Document Picker pour charger
    const loadDocumentPickerButton = creerBouton({
        text: '📂 Charger Fichier AUv3',
        id: 'auv3-button-load',
        css: {
            position: 'fixed',
            top: '20px',
            left: '480px',
            padding: '15px 20px',
            backgroundColor: '#9C27B0',
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
            console.log('🔥 DÉBUT: Clic sur Charger Fichier AUv3');
            
            try {
                // 1. Vérifier les APIs disponibles
                if (typeof window.webkit === 'undefined' || 
                    typeof window.webkit.messageHandlers === 'undefined' || 
                    typeof window.webkit.messageHandlers.swiftBridge === 'undefined') {
                    throw new Error('Bridge Swift non disponible. Vérifiez WebViewManager.swift');
                }
                
                console.log('📂 Ouverture du Document Picker pour charger...');
                
                // 2. Notification de début
                const startNotification = document.createElement('div');
                startNotification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 20px;
                    background-color: #9C27B0;
                    color: white;
                    border-radius: 5px;
                    z-index: 1001;
                    font-family: Arial, sans-serif;
                `;
                startNotification.textContent = '📂 Ouverture Document Picker...';
                document.body.appendChild(startNotification);
                
                // 3. Utiliser la nouvelle fonction chargerProjetAUv3
                const projectData = await chargerProjetAUv3();
                
                // 4. Supprimer notification de début
                if (startNotification.parentNode) {
                    startNotification.remove();
                }
                
                // 5. Afficher les données dans un popup
                const popup = document.createElement('div');
                popup.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    max-width: 80%;
                    max-height: 80%;
                    padding: 20px;
                    background-color: white;
                    border: 2px solid #333;
                    border-radius: 10px;
                    z-index: 10000;
                    overflow: auto;
                    font-family: Arial, sans-serif;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                `;
                
                popup.innerHTML = `
                    <h3 style="margin-top: 0; color: #333;">📂 Fichier chargé via Document Picker</h3>
                    <div style="margin: 15px 0;">
                        <strong>Version:</strong> ${projectData.version || 'Non spécifiée'}
                    </div>
                    <div style="margin: 15px 0;">
                        <strong>Créé le:</strong> ${projectData.created || 'Non spécifié'}
                    </div>
                    <pre style="
                        background: #f5f5f5; 
                        padding: 15px; 
                        border-radius: 5px; 
                        overflow: auto; 
                        max-height: 300px;
                        font-size: 12px;
                        white-space: pre-wrap;
                    ">${JSON.stringify(projectData, null, 2)}</pre>
                    <div style="text-align: center; margin-top: 15px;">
                        <button onclick="this.parentElement.remove()" style="
                            padding: 10px 20px;
                            background-color: #f44336;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        ">✕ Fermer</button>
                    </div>
                `;
                
                document.body.appendChild(popup);
                
            } catch (error) {
                console.error('❌ ERREUR Document Picker Chargement:', error);
                
                // Supprimer notification de début si elle existe
                const startNotif = document.querySelector('div[style*="9C27B0"]');
                if (startNotif) startNotif.remove();
                
                // Simple alert pour l'erreur
                alert(`❌ ERREUR Document Picker Chargement:\n${error.message}`);
            }
        }
    });

    // 4. Bouton Debug Localisation
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
    
    
    // Ajouter tous les boutons au DOM de façon sécurisée
    const boutons = [
        quickAccessButton,
        saveDocumentPickerButton,
        loadDocumentPickerButton,
        debugLocationButton
    ];
    
    let boutonsAjoutes = 0;
    boutons.forEach((bouton, index) => {
        try {
            if (bouton && document.body && document.body.appendChild) {
                document.body.appendChild(bouton);
                boutonsAjoutes++;
                logSafe(`✅ Bouton ${index + 1}/4 ajouté`);
            } else {
                logSafe(`❌ Impossible d'ajouter bouton ${index + 1}`);
            }
        } catch (addError) {
            logSafe(`❌ Erreur ajout bouton ${index + 1}:`, addError);
        }
    });
    
    logSafe(`✅ ${boutonsAjoutes}/4 boutons créés avec succès !`);
    if (boutonsAjoutes > 0) {
        logSafe('📁 Bouton bleu: Gestionnaire de Fichiers');
        logSafe('� Bouton orange: Sauvegarder AUv3');
        logSafe('📂 Bouton violet: Charger Fichier AUv3');
        logSafe('🔍 Bouton violet foncé: Debug localisation');
    }
    
    } catch (globalError) {
        logSafe('❌ Erreur globale création boutons:', globalError);
        
        // Fallback minimaliste si tout échoue
        try {
            const emergencyButton = document.createElement('button');
            emergencyButton.textContent = '⚠️ Mode Urgence AUv3';
            emergencyButton.style.cssText = `
                position: fixed;
                top: 20px;
                left: 20px;
                padding: 10px;
                background-color: #FF0000;
                color: white;
                border: none;
                border-radius: 4px;
                z-index: 9999;
                cursor: pointer;
            `;
            emergencyButton.addEventListener('click', () => {
                alert('Mode urgence - vérifiez la console pour plus de détails');
                window.debugFileSystemAPI();
            });
            document.body.appendChild(emergencyButton);
            logSafe('🚨 Bouton d\'urgence créé');
        } catch (emergencyError) {
            logSafe('💀 Échec total création boutons:', emergencyError);
        }
    }
}

// Fonction de nettoyage du DOM pour corriger le HTML corrompu
function nettoyerDOM() {
    try {
        logSafe('🧹 Nettoyage du DOM...');
        
        // 1. Supprimer les éléments HTML dupliqués
        const htmlElements = document.querySelectorAll('html');
        if (htmlElements.length > 1) {
            logSafe(`⚠️ ${htmlElements.length} éléments <html> détectés - nettoyage`);
            for (let i = 1; i < htmlElements.length; i++) {
                htmlElements[i].remove();
            }
        }
        
        // 2. Supprimer les éléments HEAD dupliqués
        const headElements = document.querySelectorAll('head');
        if (headElements.length > 1) {
            logSafe(`⚠️ ${headElements.length} éléments <head> détectés - nettoyage`);
            for (let i = 1; i < headElements.length; i++) {
                headElements[i].remove();
            }
        }
        
        // 3. Supprimer les éléments BODY dupliqués
        const bodyElements = document.querySelectorAll('body');
        if (bodyElements.length > 1) {
            logSafe(`⚠️ ${bodyElements.length} éléments <body> détectés - nettoyage`);
            for (let i = 1; i < bodyElements.length; i++) {
                bodyElements[i].remove();
            }
        }
        
        // 4. Nettoyer les overlays/notifications/boutons obsolètes
        const overlays = document.querySelectorAll('[style*="position: fixed"], [id*="Confirmation"], [id*="Error"], [id*="auv3-button"]');
        overlays.forEach(el => {
            if (el && el.parentNode) {
                try {
                    const rect = el.getBoundingClientRect();
                    // Supprimer les éléments invisibles ou mal placés
                    if (rect.width === 0 || rect.height === 0 || rect.top < 0) {
                        el.remove();
                        logSafe('🧹 Overlay obsolète supprimé');
                    }
                } catch (rectError) {
                    // Si getBoundingClientRect échoue, c'est probablement un élément corrompu
                    el.remove();
                    logSafe('🧹 Élément corrompu supprimé');
                }
            }
        });
        
        // 5. Vérifier et corriger l'état du DOM
        if (!document.body) {
            logSafe('❌ Pas de body - création d\'urgence');
            const newBody = document.createElement('body');
            if (document.documentElement) {
                document.documentElement.appendChild(newBody);
            } else {
                logSafe('💀 DOM complètement corrompu');
                return false;
            }
        }
        
        // 6. S'assurer que le body a un viewport de base
        if (document.body && !document.getElementById('view')) {
            logSafe('🔧 Création du viewport de base');
            const mainView = document.createElement('div');
            mainView.id = 'view';
            mainView.className = 'atome';
            mainView.style.cssText = `
                background: rgb(39, 39, 39);
                color: lightgray;
                left: 0px;
                top: 0px;
                position: absolute;
                width: 100%;
                height: 100%;
                overflow: auto;
            `;
            document.body.appendChild(mainView);
        }
        
        logSafe('✅ Nettoyage DOM terminé');
        return true;
        
    } catch (error) {
        logSafe('❌ Erreur nettoyage DOM:', error);
        return false;
    }
}

// Fonction de vérification robuste du DOM
// Fonction de vérification robuste du DOM
function verifierEtatDOM() {
    try {
        // Vérifications essentielles
        if (!document || !document.body) {
            logSafe('❌ DOM non disponible (pas de document.body) - tentative de nettoyage');
            
            // Essayer de nettoyer d'abord
            if (document) {
                nettoyerDOM();
                // Re-vérifier après nettoyage
                if (!document.body) {
                    logSafe('❌ DOM toujours non disponible après nettoyage');
                    return false;
                }
            } else {
                logSafe('💀 Pas de document du tout');
                return false;
            }
        }
        
        if (!document.createElement) {
            logSafe('❌ DOM non fonctionnel (pas de createElement)');
            return false;
        }
        
        // Test de création d'élément
        const testEl = document.createElement('div');
        if (!testEl) {
            logSafe('❌ DOM défaillant (échec createElement)');
            return false;
        }
        
        // Vérifier que le body peut recevoir des enfants
        if (!document.body.appendChild) {
            logSafe('❌ DOM non manipulable (pas d\'appendChild)');
            return false;
        }
        
        // Test d'ajout/suppression
        try {
            document.body.appendChild(testEl);
            testEl.remove();
        } catch (domTestError) {
            logSafe('❌ DOM non fonctionnel (échec test append/remove):', domTestError);
            return false;
        }
        
        logSafe('✅ DOM vérifié et fonctionnel');
        return true;
    } catch (error) {
        logSafe('❌ Erreur vérification DOM:', error);
        return false;
    }
}

// Fonction d'initialisation sécurisée avec retry
function initializerInterface() {
    let tentatives = 0;
    const maxTentatives = 5;
    
    const essayerInitialisation = () => {
        try {
            tentatives++;
            logSafe(`🔧 Tentative d'initialisation ${tentatives}/${maxTentatives}...`);
            
            // Vérifier l'état du DOM
            if (!verifierEtatDOM()) {
                if (tentatives < maxTentatives) {
                    logSafe(`⏳ DOM pas prêt, nouvelle tentative dans 500ms...`);
                    setTimeout(essayerInitialisation, 500);
                    return;
                } else {
                    logSafe('❌ DOM définitivement non disponible après 5 tentatives');
                    return;
                }
            }
            
            if (estDansAUv3()) {
                logSafe('🔌 Extension AUv3 détectée - Interface gérée par l\'hôte');
                // Dans l'extension AUv3, on ne crée pas les boutons car l'hôte gère l'interface
                // On rend juste les fonctions disponibles
                return;
            }
            
            // Vérifier qu'il n'y a pas déjà des boutons
            const existingButton = document.querySelector('[style*="position: fixed"][style*="top: 20px"]');
            if (existingButton) {
                logSafe('ℹ️ Interface déjà créée, skip');
                return;
            }
            
            // Seulement dans l'app mère avec DOM stable
            logSafe('🏠 App mère détectée - Création de l\'interface...');
            creerBoutons();
            
        } catch (error) {
            logSafe('❌ Erreur initialisation interface:', error);
            if (tentatives < maxTentatives) {
                logSafe(`🔄 Retry dans 1 seconde...`);
                setTimeout(essayerInitialisation, 1000);
            }
        }
    };
    
    essayerInitialisation();
}

// Initialisation différée et conditionnelle
function demarrerInitialisation() {
    // Ne pas initialiser si on est dans un environnement problématique
    if (typeof document === 'undefined') {
        logSafe('❌ Pas de document disponible');
        return;
    }
    
    if (typeof window === 'undefined') {
        logSafe('❌ Pas de window disponible');
        return;
    }
    
    // Multiple points d'entrée pour différents états de readiness
    if (document.readyState === 'complete') {
        logSafe('📄 Document complete - initialisation immédiate');
        setTimeout(initializerInterface, 100);
    } else if (document.readyState === 'interactive') {
        logSafe('📄 Document interactive - initialisation rapide');
        setTimeout(initializerInterface, 300);
    } else {
        logSafe('📄 Document loading - attendre DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializerInterface, 200);
        });
        
        // Fallback au cas où DOMContentLoaded ne fire pas
        setTimeout(() => {
            if (document.readyState !== 'complete') {
                logSafe('⚠️ DOMContentLoaded timeout - force initialisation');
                initializerInterface();
            }
        }, 3000);
    }
    
    // Fallback final avec window.load
    window.addEventListener('load', () => {
        setTimeout(() => {
            // Double vérification
            const buttons = document.querySelectorAll('[style*="position: fixed"][style*="top: 20px"]');
            if (buttons.length === 0) {
                logSafe('🔄 Aucun bouton détecté après window.load - force création');
                initializerInterface();
            }
        }, 500);
    });
}

// Démarrage sécurisé
try {
    demarrerInitialisation();
} catch (initError) {
    logSafe('❌ Erreur démarrage initialisation:', initError);
}

// API disponible - pas d'appels automatiques pour éviter les erreurs
logSafe('🔍 Utilisez window.debugFileSystemAPI() pour vérifier l\'API manuellement');

// Message final selon l'environnement
if (estDansAUv3()) {
    logSafe('🎵 AUv3 Extension Mode - Fonctions Document Picker disponibles');
    logSafe('📂 Utilisez: window.FileHandlingExample.sauvegarderProjetAUv3() et chargerProjetAUv3()');
} else {
    logSafe('🏠 App principale Mode - Interface complète disponible');
    logSafe('🎛️ Interface créée automatiquement au chargement');
}
 creerBoutons()
