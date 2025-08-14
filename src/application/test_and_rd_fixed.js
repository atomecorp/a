/**
 * test_and_rd.js
 * Fichier de test et R&D pour les fonctionnalités iOS
 */

// Fonction de test pour get_ios_folder_content
async function testGetFolderContent() {
    console.log('🧪 [CLICK] Bouton Test cliqué !');
    console.log('[Debug] Test de get_ios_folder_content...');
    
    // Vérifier que la fonction existe
    if (typeof window.get_ios_folder_content !== 'function') {
        console.error('[Error] Fonction get_ios_folder_content non disponible');
        const display = document.getElementById('file_content_display');
        if (display) {
            display.textContent = 'Erreur: Fonction get_ios_folder_content non disponible. Assurez-vous que ios_file_lister.js est chargé.';
        }
        return;
    }
    
    try {
        // Afficher la fenêtre
        const contentWindow = document.getElementById('file_content_w');
        if (contentWindow) {
            console.log('[Debug] Fenetre trouvee, affichage...');
            contentWindow.style.display = 'flex';
        } else {
            console.error('[Error] Fenetre file_content_w non trouvee dans le DOM');
            return;
        }
        
        // Mettre à jour le contenu avec un message de chargement
        const display = document.getElementById('file_content_display');
        if (display) {
            display.textContent = 'Chargement du contenu du dossier "./..."';
        } else {
            console.error('[Error] Element file_content_display non trouve');
        }
        
        // Appeler la fonction
        console.log('[Debug] Appel de window.get_ios_folder_content avec path: "./"');
        console.log('[Debug] Type de get_ios_folder_content:', typeof window.get_ios_folder_content);
        console.log('[Debug] Environnement webkit:', !!window.webkit);
        console.log('[Debug] MessageHandlers:', !!window.webkit?.messageHandlers);
        console.log('[Debug] SwiftBridge:', !!window.webkit?.messageHandlers?.swiftBridge);
        
        const result = await window.get_ios_folder_content('./');
        
        console.log('[Debug] Résultat reçu:', result);
        
        // Afficher le résultat
        if (display) {
            display.textContent = JSON.stringify(result, null, 2);
        }
        
        console.log('[Debug] Résultat get_ios_folder_content:', result);
        
    } catch (error) {
        console.error('[Error] Erreur lors du test:', error);
        
        const display = document.getElementById('file_content_display');
        if (display) {
            display.textContent = `Erreur: ${error.message || error}`;
        }
    }
}

function createTestButton() {
    // Chercher le bouton d'édition avec l'ID correct
    const editButton = document.getElementById('edit_mode');
    
    if (!editButton) {
        console.error('[Error] Bouton d edition non trouve avec ID edit_mode');
        return;
    }
    
    // Chercher la toolbar parente
    const toolbar = editButton.closest('#lyrics-toolbar') || 
                   editButton.closest('.lyrics-toolbar') || 
                   editButton.closest('[id*="toolbar"]') ||
                   editButton.parentElement;
    
    if (!toolbar) {
        console.error('[Error] Toolbar parente non trouvee');
        return;
    }
    
    console.log('[Debug] Bouton d edition trouve, creation du bouton test...');
    console.log('[Debug] Toolbar trouvee:', toolbar);
    console.log('[Debug] Toolbar ID:', toolbar.id);
    console.log('[Debug] Toolbar classes:', toolbar.className);
    
    // S'assurer que la toolbar a un ID
    if (!toolbar.id) {
        toolbar.id = 'test-toolbar-parent';
        console.log('[Debug] ID assigné à la toolbar:', toolbar.id);
    }
    
    // Créer le bouton de test avec le système Squirrel Button (bonne syntaxe)
    const testButton = Button({
        onText: '🧪 Test',
        offText: '🧪 Test', 
        onAction: function(state) {
            console.log('🔴 [BUTTON] onAction appelée ! State:', state);
            testGetFolderContent();
        },
        offAction: function(state) {
            console.log('🔵 [BUTTON] offAction appelée ! State:', state);
            testGetFolderContent();
        },
        parent: '#' + toolbar.id, // Utiliser l'ID qu'on vient d'assigner
        css: {
            backgroundColor: '#ff6b35',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            padding: '8px 12px',
            marginLeft: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            position: 'relative'
        }
    });
    
    console.log('[Debug] Bouton test cree et ajoute a la toolbar');
    console.log('[Debug] Bouton objet:', testButton);
    console.log('[Debug] Parent toolbar:', toolbar);
}

// Fonction pour créer la fenêtre de contenu
function createFileContentWindow() {
    console.log('[Debug] Creation de la fenetre file_content_w...');
    
    // Vérifier si la fenêtre existe déjà
    const existingWindow = document.getElementById('file_content_w');
    if (existingWindow) {
        console.log('[Debug] Fenetre file_content_w existe deja');
        return;
    }
    
    const window = $('div', {
        id: 'file_content_w',
        css: {
            position: 'fixed',
            top: '50px',
            left: '50px',
            width: '600px',
            height: '500px',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            border: '2px solid #444',
            borderRadius: '8px',
            zIndex: '10000',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
        }
    });

    // Header de la fenêtre
    const header = $('div', {
        css: {
            backgroundColor: '#2d2d2d',
            padding: '10px 15px',
            borderBottom: '1px solid #444',
            borderRadius: '6px 6px 0 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }
    });

    const title = $('span', {
        text: 'Contenu du dossier iOS',
        css: {
            fontWeight: 'bold',
            fontSize: '16px'
        }
    });

    const closeButton = Button({
        onText: '✕',
        offText: '✕',
        onAction: function(state) { 
            console.log('🔴 [CLOSE BUTTON] onAction appelée ! State:', state);
            window.style.display = 'none'; 
        },
        offAction: function(state) { 
            console.log('🔵 [CLOSE BUTTON] offAction appelée ! State:', state);
            window.style.display = 'none'; 
        },
        parent: header,
        css: {
            backgroundColor: 'transparent',
            color: '#fff',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0',
            width: '24px',
            height: '24px',
            position: 'relative'
        }
    });

    header.appendChild(title);
    header.appendChild(closeButton);

    // Zone de contenu
    const content = $('div', {
        id: 'file_content_display',
        css: {
            flex: '1',
            padding: '15px',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap'
        },
        text: 'Cliquez sur le bouton "🧪 Test" dans la toolbar pour charger le contenu du dossier...'
    });

    // Audio debugging section
    const audioDebugSection = $('div', {
        css: {
            padding: '10px 15px',
            backgroundColor: '#2a2a2a',
            borderTop: '1px solid #444',
            borderBottom: '1px solid #444'
        }
    });

    const audioLabel = $('label', {
        text: '🎵 Test Audio File:',
        css: {
            display: 'block',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '8px'
        }
    });

    const testAudio = $('audio', {
        id: 'test-audio-player',
        attrs: {
            src: './assets/audios/wWw.m4a',
            controls: true
        },
        css: {
            width: '100%',
            marginBottom: '10px'
        }
    });
    
    // Debug pour vérifier l'audio
    console.log('🎵 [AUDIO DEBUG] Audio element created:', testAudio);
    console.log('🎵 [AUDIO DEBUG] Audio src:', testAudio.src);
    console.log('🎵 [AUDIO DEBUG] Audio controls:', testAudio.controls);

    const pathTestLabel = $('label', {
        text: '🔍 Manual Path Test:',
        css: {
            display: 'block',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '8px'
        }
    });

    const audioPathInput = $('input', {
        type: 'text',
        value: './assets/audios/wWw.m4a',
        placeholder: 'Enter audio file path to test...',
        css: {
            width: '100%',
            padding: '6px 10px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
            marginBottom: '8px'
        }
    });

    const testPathButton = Button({
        onText: '🧪 Test Path',
        offText: '🧪 Test Path',
        onAction: async function(state) {
            const testPath = audioPathInput.value.trim();
            if (testPath) {
                testAudio.src = testPath;
                console.log('🎵 Testing audio path:', testPath);
                try {
                    await testAudio.load();
                    console.log('✅ Audio loaded successfully');
                } catch (error) {
                    console.error('❌ Audio load failed:', error);
                }
            }
        },
        offAction: async function(state) {
            const testPath = audioPathInput.value.trim();
            if (testPath) {
                testAudio.src = testPath;
                console.log('🎵 Testing audio path:', testPath);
                try {
                    await testAudio.load();
                    console.log('✅ Audio loaded successfully');
                } catch (error) {
                    console.error('❌ Audio load failed:', error);
                }
            }
        },
        parent: audioDebugSection,
        css: {
            backgroundColor: '#ff6b35',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
        }
    });

    audioDebugSection.appendChild(audioLabel);
    audioDebugSection.appendChild(testAudio);
    audioDebugSection.appendChild(pathTestLabel);
    audioDebugSection.appendChild(audioPathInput);
    audioDebugSection.appendChild(testPathButton);

    // Zone de contrôles
    const controls = $('div', {
        css: {
            padding: '10px 15px',
            borderTop: '1px solid #444',
            backgroundColor: '#2d2d2d',
            borderRadius: '0 0 6px 6px',
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap'
        }
    });

    const pathInput = $('input', {
        id: 'folder_path_input',
        type: 'text',
        value: './',
        placeholder: 'Chemin du dossier (ex: ./, Projects, music)',
        css: {
            flex: '1',
            padding: '6px 10px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px'
        }
    });

    const refreshButton = Button({
        onText: 'Actualiser',
        offText: 'Actualiser', 
        onAction: async function(state) {
            console.log('🔴 [REFRESH BUTTON] onAction appelée ! State:', state);
            const path = pathInput.value.trim() || './';
            await testFolderListing(path);
        },
        offAction: async function(state) {
            console.log('🔵 [REFRESH BUTTON] offAction appelée ! State:', state);
            const path = pathInput.value.trim() || './';
            await testFolderListing(path);
        },
        parent: controls,
        css: {
            backgroundColor: '#4a9eff',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            position: 'relative'
        }
    });

    // Input pour le nom de fichier à écrire
    const filenameInput = $('input', {
        id: 'input_filename',
        type: 'text',
        value: 'test.txt',
        placeholder: 'Nom du fichier à créer (ex: test.txt, Projects/mon_fichier.json)',
        css: {
            flex: '1',
            padding: '6px 10px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
            marginTop: '8px'
        }
    });

    // Bouton Write Test
    const writeTestButton = Button({
        onText: '📝 Write Test',
        offText: '📝 Write Test',
        onAction: async function(state) {
            console.log('🔴 [WRITE BUTTON] onAction appelée ! State:', state);
            const filename = filenameInput.value.trim();
            if (!filename) {
                alert('Veuillez entrer un nom de fichier');
                return;
            }
            await testWriteFileLocal(filename);
        },
        offAction: async function(state) {
            console.log('🔵 [WRITE BUTTON] offAction appelée ! State:', state);
            const filename = filenameInput.value.trim();
            if (!filename) {
                alert('Veuillez entrer un nom de fichier');
                return;
            }
            await testWriteFileLocal(filename);
        },
        parent: controls,
        css: {
            backgroundColor: '#ff6b35',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            position: 'relative',
            marginTop: '8px'
        }
    });

    // Bouton Copy File
    const copyFileButton = Button({
        onText: '📂 Copy File',
        offText: '📂 Copy File',
        onAction: async function(state) {
            console.log('🔴 [COPY BUTTON] onAction appelée ! State:', state);
            await testCopyFiles();
        },
        offAction: async function(state) {
            console.log('🔵 [COPY BUTTON] offAction appelée ! State:', state);
            await testCopyFiles();
        },
        parent: controls,
        css: {
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            position: 'relative',
            marginTop: '8px',
            marginLeft: '8px'
        }
    });

    controls.appendChild(pathInput);
    controls.appendChild(refreshButton);
    controls.appendChild(filenameInput);
    controls.appendChild(writeTestButton);
    controls.appendChild(copyFileButton);

    window.appendChild(header);
    window.appendChild(content);
    window.appendChild(audioDebugSection);
    window.appendChild(controls);

    document.body.appendChild(window);
    
    // Afficher la fenêtre automatiquement au démarrage
    window.style.display = 'flex';
    
    console.log('[Debug] Fenetre file_content_w creee et ajoutee au DOM - VISIBLE par defaut');
    console.log('[Debug] Audio player avec ID:', testAudio.id, 'et src:', testAudio.src);

    // Rendre la fenêtre déplaçable
    makeWindowDraggable(window, header);
}

// Fonction pour rendre la fenêtre déplaçable
function makeWindowDraggable(windowElement, headerElement) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    headerElement.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === headerElement || headerElement.contains(e.target)) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            windowElement.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }
}

// Fonction de test principal
async function testFolderListing(path = './') {
    const display = document.getElementById('file_content_display');
    const window = document.getElementById('file_content_w');
    
    if (!display || !window) {
        console.error('Elements d\'affichage non trouves');
        return;
    }

    // Afficher la fenêtre
    window.style.display = 'flex';
    
    // Afficher un message de chargement
    display.textContent = `Chargement du contenu du dossier "${path}"...\n\nVeuillez patienter...`;

    try {
        // Vérifier que la fonction est disponible
        if (typeof get_ios_folder_content !== 'function') {
            throw new Error('Fonction get_ios_folder_content non disponible. Assurez-vous que ios_file_lister.js est chargé.');
        }

        // Appeler la fonction de listage
        console.log('Appel de get_ios_folder_content avec le path:', path);
        const files = await get_ios_folder_content(path);
        
        console.log('Fichiers reçus:', files);
        
        // Formater et afficher le résultat
        let content = `Contenu du dossier: "${path}"\n`;
        content += `Dernière mise à jour: ${new Date().toLocaleString()}\n`;
        content += '='.repeat(50) + '\n\n';
        
        if (typeof formatFileList === 'function') {
            content += formatFileList(files);
        } else {
            // Formatage de base si formatFileList n'est pas disponible
            if (Array.isArray(files) && files.length > 0) {
                content += `${files.length} element(s) trouve(s):\n\n`;
                files.forEach((file, index) => {
                    const type = file.isDirectory ? '📁 [DIR]' : '📄 [FILE]';
                    const size = file.size ? ` (${file.size} bytes)` : '';
                    content += `${index + 1}. ${type} ${file.name}${size}\n`;
                });
            } else {
                content += 'Aucun fichier trouve dans ce dossier.';
            }
        }
        
        display.textContent = content;
        
    } catch (error) {
        console.error('Erreur lors du listage:', error);
        
        let errorContent = `❌ Erreur lors du listage du dossier "${path}"\n\n`;
        errorContent += `Message d'erreur: ${error.message}\n\n`;
        errorContent += 'Détails techniques:\n';
        errorContent += `- Timestamp: ${new Date().toISOString()}\n`;
        errorContent += `- User Agent: ${navigator.userAgent}\n`;
        errorContent += `- URL: ${window.location.href}\n`;
        
        // Vérifier l'environnement
        if (window.webkit && window.webkit.messageHandlers) {
            errorContent += '- Swift Bridge: Disponible\n';
            if (window.webkit.messageHandlers.swiftBridge) {
                errorContent += '- Swift Bridge Handler: Disponible\n';
            } else {
                errorContent += '- Swift Bridge Handler: Non disponible\n';
            }
        } else {
            errorContent += '- Swift Bridge: Non disponible (pas dans un environnement iOS/AUv3)\n';
        }
        
        display.textContent = errorContent;
    }
}

// Fonction de test pour écrire un fichier (utilise ios_file_writer.js)
async function testWriteFileLocal(filename) {
    console.log('🧪 [WRITE TEST] Test d\'écriture de fichier:', filename);
    
    const display = document.getElementById('file_content_display');
    if (!display) {
        console.error('Element d\'affichage non trouve');
        return;
    }

    // Afficher un message de chargement
    display.textContent = `📝 Écriture du fichier "${filename}"...\n\nVeuillez patienter...`;

    try {
        // Vérifier que la fonction est disponible
        if (typeof window.testWriteFile !== 'function') {
            throw new Error('Fonction testWriteFile non disponible. Assurez-vous que ios_file_writer.js est chargé.');
        }

        // Utiliser la fonction du module ios_file_writer.js
        const result = await window.testWriteFile(filename);
        
        console.log('✅ [WRITE TEST] Fichier écrit avec succès:', result);
        
        let successContent = `✅ Fichier "${filename}" écrit avec succès!\n\n`;
        successContent += `Timestamp: ${new Date().toLocaleString()}\n`;
        successContent += `Taille du contenu: ${result.contentSize} caractères\n`;
        successContent += `Message Swift: ${result.message}\n\n`;
        successContent += 'Le fichier a ete cree avec un contenu de test genere automatiquement.';
        
        display.textContent = successContent;

    } catch (error) {
        console.error('❌ [WRITE TEST] Erreur lors de l\'écriture:', error);
        
        let errorContent = `❌ Erreur lors de l'écriture du fichier "${filename}"\n\n`;
        errorContent += `Message d'erreur: ${error.message}\n\n`;
        errorContent += 'Détails techniques:\n';
        errorContent += `- Timestamp: ${new Date().toISOString()}\n`;
        errorContent += `- Bridge Swift disponible: ${!!window.webkit?.messageHandlers?.swiftBridge}\n`;
        errorContent += `- Module ios_file_writer chargé: ${typeof window.testWriteFile === 'function'}\n`;
        errorContent += `- Action envoyée: saveFile\n`;
        errorContent += `- Path: ${filename}\n`;
        
        display.textContent = errorContent;
    }
}

// Fonction pour copier le fichier wWw.m4a spécifiquement vers le dossier local iOS
async function testCopyFiles() {
    console.log('📂 [COPY FILE] Test de copie du fichier wWw.m4a depuis WebView vers iOS local');
    
    const display = document.getElementById('file_content_display');
    if (!display) {
        console.error('Element d\'affichage non trouve');
        return;
    }

    // Afficher un message de chargement
    display.textContent = `📂 Copie du fichier wWw.m4a

Étape 1: Préparation...
Vérification des fonctions disponibles...`;

    try {
        // Vérifier que la fonction d'écriture est disponible
        if (typeof window.writeFileToIOS !== 'function') {
            throw new Error('Fonction writeFileToIOS non disponible. Assurez-vous que ios_file_writer.js est chargé.');
        }

        // Fichier spécifique à copier
        const sourceFile = './assets/audios/wWw.m4a';
        const targetFileName = 'copied_wWw.m4a';

        // Étape 1: Lire le fichier avec XMLHttpRequest (alternative à fetch)
        display.textContent = `📂 Copie du fichier wWw.m4a

Étape 1: Lecture du fichier depuis WebView...
Source: ${sourceFile}
Méthode: XMLHttpRequest (alternative à fetch)`;

        console.log('📖 [COPY FILE] Lecture du fichier avec XMLHttpRequest:', sourceFile);
        
        const fileContent = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', sourceFile, true);
            xhr.responseType = 'arraybuffer';
            
            xhr.onload = function() {
                if (xhr.status === 200) {
                    console.log(`📋 [COPY FILE] Fichier lu avec XMLHttpRequest: ${sourceFile} (${xhr.response.byteLength} bytes)`);
                    resolve(xhr.response);
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };
            
            xhr.onerror = function() {
                reject(new Error('Erreur réseau lors de la lecture du fichier'));
            };
            
            xhr.ontimeout = function() {
                reject(new Error('Timeout lors de la lecture du fichier'));
            };
            
            xhr.timeout = 30000; // 30 secondes
            xhr.send();
        });
        
        if (!fileContent) {
            throw new Error(`Impossible de lire le contenu du fichier ${sourceFile}`);
        }

        // Étape 2: Écrire le fichier dans le dossier local iOS
        display.textContent = `📂 Copie du fichier wWw.m4a

Étape 2: Écriture vers iOS local...
Target: ${targetFileName}
Taille: ${fileContent.byteLength} bytes`;

        console.log('💾 [COPY FILE] Écriture vers iOS:', targetFileName);
        const result = await window.writeFileToIOS(targetFileName, fileContent, 'audio/mp4');
        
        if (!result) {
            throw new Error('Échec de l\'écriture (pas de confirmation)');
        }
        
        console.log(`✅ [COPY FILE] Fichier copié avec succès: ${sourceFile} → ${targetFileName}`);

        // Étape 3: Vérification
        display.textContent = `📂 Copie du fichier wWw.m4a

Étape 3: Vérification...`;

        try {
            const iosFiles = await window.get_ios_folder_content('./');
            const copiedFile = iosFiles.find(file => file.name === targetFileName);

            // Afficher le résultat final
            let resultContent = `📂 Copie du fichier wWw.m4a terminée\n\n`;
            resultContent += `Timestamp: ${new Date().toLocaleString()}\n`;
            resultContent += `Source: ${sourceFile}\n`;
            resultContent += `Target: ${targetFileName}\n`;
            resultContent += `Taille originale: ${fileContent.byteLength} bytes\n`;
            resultContent += `Méthode: XMLHttpRequest (pas fetch)\n`;
            
            if (copiedFile) {
                resultContent += `✅ Fichier vérifié dans iOS local:\n`;
                resultContent += `   Nom: ${copiedFile.name}\n`;
                resultContent += `   Taille iOS: ${copiedFile.size} bytes\n`;
                resultContent += `   Type: ${copiedFile.isDirectory ? 'Dossier' : 'Fichier'}\n\n`;
                resultContent += `🎵 Le fichier audio wWw.m4a est maintenant disponible localement !`;
            } else {
                resultContent += `⚠️ Fichier copié mais non trouvé lors de la vérification.\n`;
                resultContent += `Cela peut être normal selon le timing de synchronisation iOS.`;
            }
            
            display.textContent = resultContent;
            console.log('🏁 [COPY FILE] Copie terminée avec succès');

        } catch (verifyError) {
            console.error('❌ [COPY FILE] Erreur lors de la vérification:', verifyError);
            
            // Afficher les résultats sans vérification
            let resultContent = `📂 Copie du fichier wWw.m4a terminée (sans vérification)\n\n`;
            resultContent += `Timestamp: ${new Date().toLocaleString()}\n`;
            resultContent += `Source: ${sourceFile}\n`;
            resultContent += `Target: ${targetFileName}\n`;
            resultContent += `Taille: ${fileContent.byteLength} bytes\n`;
            resultContent += `Méthode: XMLHttpRequest\n\n`;
            resultContent += `✅ Fichier copié avec succès !\n`;
            resultContent += `⚠️ Erreur de vérification: ${verifyError.message}`;
            
            display.textContent = resultContent;
        }

    } catch (error) {
        console.error('❌ [COPY FILE] Erreur lors de la copie:', error);
        
        let errorContent = `❌ Erreur lors de la copie du fichier wWw.m4a\n\n`;
        errorContent += `Message d'erreur: ${error.message}\n\n`;
        errorContent += 'Détails techniques:\n';
        errorContent += `- Timestamp: ${new Date().toISOString()}\n`;
        errorContent += `- Bridge Swift disponible: ${!!window.webkit?.messageHandlers?.swiftBridge}\n`;
        errorContent += `- Module ios_file_writer chargé: ${typeof window.writeFileToIOS === 'function'}\n`;
        errorContent += `- Source: ./assets/audios/wWw.m4a\n`;
        errorContent += `- Destination: copied_wWw.m4a\n`;
        errorContent += `- Méthode: XMLHttpRequest (alternative à fetch)\n`;
        errorContent += `\n💡 Info: L'audio player peut lire le fichier (streaming) mais la copie binaire peut échouer selon les restrictions iOS WebView.`;
        
        display.textContent = errorContent;
    }
}

// Initialisation automatique quand le DOM est prêt
function initTestAndRD() {
    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    function init() {
        console.log('[Debug] Initialisation Test & R&D...');
        
        // Attendre que l'interface soit chargée
        const checkInterface = () => {
            const editButton = document.getElementById('edit_mode');
            if (editButton) {
                console.log('[Debug] Interface chargee, creation des elements...');
                createFileContentWindow();
                createTestButton();
                console.log('Test & R&D iOS initialise avec succes');
            } else {
                console.log('[Debug] Interface pas encore chargee, nouvel essai dans 500ms...');
                setTimeout(checkInterface, 500);
            }
        };
        
        // Démarrer la vérification après un délai initial
        setTimeout(checkInterface, 1000);
    }
}

// Lancer l'initialisation
initTestAndRD();
