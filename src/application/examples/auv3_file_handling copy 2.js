/*
 * Document Picker & Sauvegarde AUv3
 * Boutons pour sauvegarder directement et via Document Picker, plus charger des fichiers
 */

console.log('📱 Document Picker & Sauvegarde AUv3 chargé');

// Fonction pour créer tous les boutons
function creerBoutons() {
    console.log('🔧 Création des boutons...');
    
    // Supprimer boutons existants
    ['document-picker-btn', 'save-direct-btn', 'load-auv3-btn', 'load-picker-btn'].forEach(id => {
        const existing = document.getElementById(id);
        if (existing) existing.remove();
    });
    
    // 1. BOUTON DOCUMENT PICKER (sauvegarde avec choix utilisateur)
    const pickerButton = document.createElement('button');
    pickerButton.id = 'document-picker-btn';
    pickerButton.textContent = '📄 Document Picker';
    pickerButton.style.cssText = `
        position: fixed;
        top: 50px;
        left: 50px;
        padding: 15px 25px;
        background-color: #FF0066;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(255,0,102,0.4);
    `;
    
    pickerButton.addEventListener('click', async () => {
        try {
            console.log('📄 DOCUMENT PICKER - Sauvegarde avec choix utilisateur');
            
            if (!window.webkit?.messageHandlers?.swiftBridge) {
                alert('❌ Bridge Swift non disponible');
                return;
            }
            
            const testData = {
                type: 'document-picker-save',
                version: '1.0',
                created: new Date().toISOString(),
                message: 'Sauvegarde via Document Picker',
                atoms: [
                    { type: 'oscillator', frequency: 440, amplitude: 0.7 },
                    { type: 'filter', cutoff: 1200, resonance: 0.5 }
                ]
            };
            
            // Feedback visuel
            pickerButton.textContent = '⏳ Ouverture...';
            pickerButton.style.backgroundColor = '#FFA500';
            
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'saveFileWithDocumentPicker',
                data: JSON.stringify(testData),
                fileName: `picker-save-${Date.now()}.atome`
            });
            
            setTimeout(() => {
                pickerButton.textContent = '📄 Document Picker';
                pickerButton.style.backgroundColor = '#FF0066';
            }, 3000);
            
        } catch (error) {
            console.error('❌ Erreur Document Picker:', error);
            alert('❌ Erreur: ' + error.message);
        }
    });
    
    // 2. BOUTON SAUVEGARDE DIRECTE (sans Document Picker)
    const saveButton = document.createElement('button');
    saveButton.id = 'save-direct-btn';
    saveButton.textContent = '💾 Sauvegarde Directe';
    saveButton.style.cssText = `
        position: fixed;
        top: 50px;
        left: 280px;
        padding: 15px 25px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(76,175,80,0.4);
    `;
    
    saveButton.addEventListener('click', async () => {
        try {
            console.log('💾 SAUVEGARDE DIRECTE - Sans Document Picker');
            
            if (!window.webkit?.messageHandlers?.swiftBridge) {
                alert('❌ Bridge Swift non disponible');
                return;
            }
            
            const testData = {
                type: 'direct-save',
                version: '1.0',
                created: new Date().toISOString(),
                message: 'Sauvegarde directe dans Documents',
                atoms: [
                    { type: 'synthesizer', frequency: 880, amplitude: 0.6 },
                    { type: 'reverb', roomSize: 0.8, damping: 0.3 }
                ],
                settings: {
                    sampleRate: 44100,
                    bufferSize: 512
                }
            };
            
            // Feedback visuel
            saveButton.textContent = '⏳ Sauvegarde...';
            saveButton.style.backgroundColor = '#FFA500';
            
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'saveFile',
                data: JSON.stringify(testData),
                fileName: `direct-save-${Date.now()}.atome`
            });
            
            setTimeout(() => {
                saveButton.textContent = '💾 Sauvegarde Directe';
                saveButton.style.backgroundColor = '#4CAF50';
            }, 2000);
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde directe:', error);
            alert('❌ Erreur: ' + error.message);
        }
    });
    
    // 3. BOUTON CHARGER DEPUIS AUV3 (fichiers locaux)
    const loadAuv3Button = document.createElement('button');
    loadAuv3Button.id = 'load-auv3-btn';
    loadAuv3Button.textContent = '📂 Charger AUv3';
    loadAuv3Button.style.cssText = `
        position: fixed;
        top: 120px;
        left: 50px;
        padding: 15px 25px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(33,150,243,0.4);
    `;
    
    loadAuv3Button.addEventListener('click', async () => {
        try {
            console.log('📂 CHARGEMENT AUV3 - Fichiers locaux');
            
            if (!window.webkit?.messageHandlers?.swiftBridge) {
                alert('❌ Bridge Swift non disponible');
                return;
            }
            
            // Feedback visuel
            loadAuv3Button.textContent = '⏳ Chargement...';
            loadAuv3Button.style.backgroundColor = '#FFA500';
            
            // Handler pour la réponse
            window.loadFileResult = (success, data, fileName, error) => {
                loadAuv3Button.textContent = '📂 Charger AUv3';
                loadAuv3Button.style.backgroundColor = '#2196F3';
                
                if (success && data) {
                    try {
                        const projectData = JSON.parse(data);
                        console.log('✅ Fichier AUv3 chargé:', fileName);
                        console.log('📊 Données:', projectData);
                        
                        // Afficher un popup avec les données
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
                            border: 2px solid #2196F3;
                            border-radius: 15px;
                            z-index: 100000;
                            overflow: auto;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                        `;
                        
                        popup.innerHTML = `
                            <h3 style="margin-top: 0; color: #2196F3;">📂 Fichier AUv3 chargé</h3>
                            <p><strong>Fichier:</strong> ${fileName}</p>
                            <p><strong>Type:</strong> ${projectData.type || 'Non spécifié'}</p>
                            <p><strong>Version:</strong> ${projectData.version || 'Non spécifiée'}</p>
                            <p><strong>Créé:</strong> ${projectData.created || 'Non spécifié'}</p>
                            <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; max-height: 300px; font-size: 12px;">${JSON.stringify(projectData, null, 2)}</pre>
                            <button onclick="this.parentElement.remove()" style="margin-top: 15px; padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer;">Fermer</button>
                        `;
                        
                        document.body.appendChild(popup);
                        
                    } catch (parseError) {
                        alert('❌ Erreur parsing fichier: ' + parseError.message);
                    }
                } else {
                    alert('❌ Erreur chargement: ' + (error || 'Aucun fichier sélectionné'));
                }
            };
            
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'loadFile',
                fileName: 'latest' // Charger le dernier fichier ou liste
            });
            
        } catch (error) {
            console.error('❌ Erreur chargement AUv3:', error);
            alert('❌ Erreur: ' + error.message);
        }
    });
    
    // 4. BOUTON CHARGER VIA DOCUMENT PICKER
    const loadPickerButton = document.createElement('button');
    loadPickerButton.id = 'load-picker-btn';
    loadPickerButton.textContent = '📁 Charger Picker';
    loadPickerButton.style.cssText = `
        position: fixed;
        top: 120px;
        left: 280px;
        padding: 15px 25px;
        background-color: #9C27B0;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(156,39,176,0.4);
    `;
    
    loadPickerButton.addEventListener('click', async () => {
        try {
            console.log('📁 CHARGEMENT DOCUMENT PICKER - Choix utilisateur');
            
            if (!window.webkit?.messageHandlers?.swiftBridge) {
                alert('❌ Bridge Swift non disponible');
                return;
            }
            
            // Feedback visuel avec instructions pour l'utilisateur
            loadPickerButton.textContent = '🔐 Autorisation...';
            loadPickerButton.style.backgroundColor = '#FFA500';
            
            // Afficher les instructions à l'utilisateur
            const instructionPopup = document.createElement('div');
            instructionPopup.id = 'instruction-popup';
            instructionPopup.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                max-width: 90%;
                padding: 20px;
                background-color: white;
                border: 2px solid #9C27B0;
                border-radius: 15px;
                z-index: 100001;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            
            instructionPopup.innerHTML = `
                <h3 style="margin-top: 0; color: #9C27B0; text-align: center;">📁 Instructions Document Picker</h3>
                <div style="margin: 15px 0; color: #333; line-height: 1.4;">
                    <p><strong>🔐 Étape 1:</strong> Autoriser l'accès aux fichiers</p>
                    <p><strong>📂 Étape 2:</strong> Naviguer vers "Sur mon iPhone/iPad"</p>
                    <p><strong>🔍 Étape 3:</strong> Chercher le dossier "Atome" ou "AtomeFiles"</p>
                    <p><strong>✅ Étape 4:</strong> Sélectionner votre fichier .atome</p>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 8px; margin: 10px 0;">
                        <strong>💡 Astuce:</strong> Si vous ne voyez pas vos fichiers, assurez-vous d'avoir sauvegardé au moins un fichier avec le bouton "Sauvegarde Directe" vert.
                    </div>
                </div>
                <button onclick="this.parentElement.remove(); document.getElementById('load-picker-btn').textContent = '⏳ Ouverture...'" 
                        style="width: 100%; padding: 12px; background-color: #9C27B0; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
                    J'ai compris - Ouvrir le sélecteur
                </button>
            `;
            
            document.body.appendChild(instructionPopup);
            
            // Attendre 2 secondes avant de permettre de continuer
            setTimeout(() => {
                const button = instructionPopup.querySelector('button');
                if (button) {
                    button.onclick = () => {
                        instructionPopup.remove();
                        // Continuer avec l'ouverture du Document Picker
                        proceedWithDocumentPicker();
                    };
                }
            }, 2000);
            
            function proceedWithDocumentPicker() {
                loadPickerButton.textContent = '⏳ Ouverture...';
                loadPickerButton.style.backgroundColor = '#FFA500';
                
                // Handler pour la réponse
                window.documentPickerLoadResult = (success, data, fileName, error) => {
                    loadPickerButton.textContent = '📁 Charger Picker';
                    loadPickerButton.style.backgroundColor = '#9C27B0';
                    
                    if (success && data) {
                        try {
                            const projectData = JSON.parse(data);
                            console.log('✅ Fichier Document Picker chargé:', fileName);
                            console.log('📊 Données:', projectData);
                            
                            // Afficher un popup avec les données
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
                                border: 2px solid #9C27B0;
                                border-radius: 15px;
                                z-index: 100000;
                                overflow: auto;
                                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                            `;
                            
                            popup.innerHTML = `
                                <h3 style="margin-top: 0; color: #9C27B0;">📁 Fichier Document Picker chargé</h3>
                                <p><strong>Fichier:</strong> ${fileName}</p>
                                <p><strong>Type:</strong> ${projectData.type || 'Non spécifié'}</p>
                                <p><strong>Version:</strong> ${projectData.version || 'Non spécifiée'}</p>
                                <p><strong>Créé:</strong> ${projectData.created || 'Non spécifié'}</p>
                                <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; max-height: 300px; font-size: 12px;">${JSON.stringify(projectData, null, 2)}</pre>
                                <button onclick="this.parentElement.remove()" style="margin-top: 15px; padding: 10px 20px; background-color: #9C27B0; color: white; border: none; border-radius: 5px; cursor: pointer;">Fermer</button>
                            `;
                            
                            document.body.appendChild(popup);
                            
                        } catch (parseError) {
                            alert('❌ Erreur parsing fichier: ' + parseError.message);
                        }
                    } else {
                        alert('❌ Erreur chargement: ' + (error || 'Document Picker annulé'));
                    }
                };
                
                window.webkit.messageHandlers.swiftBridge.postMessage({
                    action: 'loadFileWithDocumentPicker',
                    fileTypes: ['atome', 'json']
                });
            }
            
        } catch (error) {
            console.error('❌ Erreur chargement Document Picker:', error);
            alert('❌ Erreur: ' + error.message);
            loadPickerButton.textContent = '📁 Charger Picker';
            loadPickerButton.style.backgroundColor = '#9C27B0';
        }
    });
    
    // Ajouter tous les boutons au DOM
    [pickerButton, saveButton, loadAuv3Button, loadPickerButton].forEach(button => {
        document.body.appendChild(button);
    });
    
    console.log('✅ 4 boutons créés !');
    console.log('📄 Rose: Document Picker (sauvegarde)');
    console.log('💾 Vert: Sauvegarde directe');
    console.log('📂 Bleu: Charger AUv3');
    console.log('📁 Violet: Charger Document Picker');
}

// Essayer plusieurs fois de créer les boutons
function initialiserBoutons() {
    if (document.body) {
        console.log('✅ DOM prêt - création des boutons');
        creerBoutons();
    } else {
        console.log('⏳ DOM pas encore prêt - retry dans 100ms');
        setTimeout(initialiserBoutons, 100);
    }
}

// Démarrer immédiatement
initialiserBoutons();

// Backup avec DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOMContentLoaded - vérification boutons');
    if (!document.getElementById('document-picker-btn')) {
        console.log('🔄 Pas de boutons trouvés - création backup');
        creerBoutons();
    }
});

// Backup avec window.load
window.addEventListener('load', () => {
    console.log('🌍 Window load - vérification finale boutons');
    if (!document.getElementById('document-picker-btn')) {
        console.log('🚨 Création d\'urgence des boutons');
        creerBoutons();
    }
});