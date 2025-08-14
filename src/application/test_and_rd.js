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
            width: '800px',
            height: '700px',
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
        onText: 'read local folder',
        offText: 'read local folder', 
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

    // === SECTION AUV3 CONTROLS ===
    
    // Séparateur AUv3
    const auv3Separator = $('div', {
        css: {
            width: '100%',
            height: '1px',
            backgroundColor: '#666',
            margin: '15px 0 10px 0'
        }
    });

    // Label AUv3 Section
    const auv3Label = $('label', {
        id: 'auv3_section_label',
        text: '🎛️ AUv3 AtomeFiles Access:',
        css: {
            display: 'block',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '10px',
            width: '100%'
        }
    });

    // Input pour le chemin AUv3 (corrigé pour App Groups)
    const auv3PathInput = $('input', {
        id: 'auv3_folder_path_input',
        type: 'text',
        value: '.',
        placeholder: 'Chemin AUv3: . (racine), Projects, Exports, Recordings',
        css: {
            flex: '1',
            padding: '6px 10px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
            marginBottom: '8px'
        }
    });

    // Bouton Read AUv3 Folder
    const readAUv3Button = Button({
        onText: '📖 Read AUv3 Folder',
        offText: '📖 Read AUv3 Folder',
        onAction: async function(state) {
            console.log('🔴 [READ AUV3 BUTTON] onAction appelée ! State:', state);
            const auv3Path = auv3PathInput.value.trim() || 'Projects';
            await testReadAUv3Folder(auv3Path);
        },
        offAction: async function(state) {
            console.log('🔵 [READ AUV3 BUTTON] offAction appelée ! State:', state);
            const auv3Path = auv3PathInput.value.trim() || 'Projects';
            await testReadAUv3Folder(auv3Path);
        },
        parent: controls,
        css: {
            backgroundColor: '#9c27b0',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            position: 'relative',
            marginBottom: '8px'
        }
    });

    // Input pour le nom de fichier AUv3
    const auv3FilenameInput = $('input', {
        id: 'auv3_filename_input',
        type: 'text',
        value: 'test_from_main.txt',
        placeholder: 'Nom du fichier à écrire dans AUv3 (ex: mon_projet.atome)',
        css: {
            flex: '1',
            padding: '6px 10px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '14px',
            marginBottom: '8px'
        }
    });

    // Bouton Write AUv3 File
    const writeAUv3Button = Button({
        onText: '💾 Write AUv3 File',
        offText: '💾 Write AUv3 File',
        onAction: async function(state) {
            console.log('🔴 [WRITE AUV3 BUTTON] onAction appelée ! State:', state);
            const filename = auv3FilenameInput.value.trim();
            const subfolder = auv3PathInput.value.trim() || 'Projects';
            if (!filename) {
                alert('Veuillez entrer un nom de fichier AUv3');
                return;
            }
            await testWriteAUv3File(filename, subfolder);
        },
        offAction: async function(state) {
            console.log('🔵 [WRITE AUV3 BUTTON] offAction appelée ! State:', state);
            const filename = auv3FilenameInput.value.trim();
            const subfolder = auv3PathInput.value.trim() || 'Projects';
            if (!filename) {
                alert('Veuillez entrer un nom de fichier AUv3');
                return;
            }
            await testWriteAUv3File(filename, subfolder);
        },
        parent: controls,
        css: {
            backgroundColor: '#673ab7',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            position: 'relative',
            marginRight: '8px'
        }
    });

    controls.appendChild(pathInput);
    controls.appendChild(refreshButton);
    controls.appendChild(filenameInput);
    controls.appendChild(writeTestButton);
    controls.appendChild(copyFileButton);
    
    // Ajouter les contrôles AUv3
    controls.appendChild(auv3Separator);
    controls.appendChild(auv3Label);
    controls.appendChild(auv3PathInput);
    controls.appendChild(readAUv3Button);
    controls.appendChild(auv3FilenameInput);
    controls.appendChild(writeAUv3Button);

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

// Fonction pour copier des fichiers sélectionnés par l'utilisateur (via fenêtre système)
async function testCopyFiles() {
    console.log('📂 [COPY FILE] Ouverture de la fenêtre de sélection système');
    
    const display = document.getElementById('file_content_display');
    if (!display) {
        console.error('Element d\'affichage non trouve');
        return;
    }

    // Afficher un message de préparation
    display.textContent = `📂 Copie de fichier via sélection système

Étape 1: Ouverture de la fenêtre...
Sélectionnez le fichier à copier dans l'application locale.`;

    try {
        // Utiliser la même méthode que le bouton "iOS Load" d'ios_apis.js
        console.log('📖 [COPY FILE] Création de l\'input file pour sélection');
        
        const selectedFile = await openSystemFileSelector();
        
        if (!selectedFile) {
            display.textContent = `📂 Copie de fichier annulée

Aucun fichier sélectionné.
Utilisez le bouton "📂 Copy File" pour réessayer.`;
            return;
        }

        console.log(`📋 [COPY FILE] Fichier sélectionné: ${selectedFile.fileName} (${selectedFile.data.length} chars/bytes)`);

        // Étape 2: Sauvegarder le fichier dans le dossier local
        display.textContent = `📂 Copie de fichier: ${selectedFile.fileName}

Étape 2: Sauvegarde dans le dossier local...
Méthode: writeFileToIOS()
Taille: ${selectedFile.data.length} ${selectedFile.encoding === 'base64' ? 'bytes (base64)' : 'caractères'}`;

        // Préparer les données selon l'encodage
        let fileDataForSave;
        if (selectedFile.encoding === 'base64') {
            // Fichier binaire : garder le base64 tel quel
            fileDataForSave = selectedFile.data; // Déjà en base64
            console.log(`📋 [COPY FILE] Fichier binaire en base64 (${selectedFile.data.length} chars)`);
        } else {
            // Fichier texte : garder le texte tel quel
            fileDataForSave = selectedFile.data; // Texte UTF-8
            console.log(`📋 [COPY FILE] Fichier texte UTF-8 (${selectedFile.data.length} chars)`);
        }

        // Déterminer le type MIME basé sur l'extension
        const fileName = selectedFile.fileName;
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        let mimeType = 'application/octet-stream';
        
        const mimeTypes = {
            'txt': 'text/plain',
            'json': 'application/json',
            'atome': 'application/json',
            'lrc': 'text/plain',
            'md': 'text/markdown',
            'mp3': 'audio/mpeg',
            'm4a': 'audio/mp4',
            'wav': 'audio/wav',
            'flac': 'audio/flac',
            'ogg': 'audio/ogg',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'pdf': 'application/pdf'
        };
        
        if (mimeTypes[extension]) {
            mimeType = mimeTypes[extension];
        }

        console.log(`� [COPY FILE] Sauvegarde: ${fileName} (type: ${mimeType})`);
        
        // Sauvegarder avec writeFileToIOS (accepte seulement des strings)
        const result = await window.writeFileToIOS(fileName, fileDataForSave);
        
        if (!result) {
            throw new Error('Échec de la sauvegarde (pas de confirmation)');
        }
        
        console.log(`✅ [COPY FILE] Fichier sauvegardé avec succès: ${fileName}`);

        // Étape 3: Vérification et affichage du résultat
        display.textContent = `📂 Copie de fichier: ${fileName}

Étape 3: Vérification...`;

        try {
            // Vérifier que le fichier a été créé
            const iosFiles = await window.get_ios_folder_content('./');
            const savedFile = iosFiles.find(file => file.name === fileName);

            // Afficher le résultat final
            let resultContent = `📂 Copie de fichier terminée avec succès !\n\n`;
            resultContent += `📊 DÉTAILS DE LA COPIE:\n`;
            resultContent += `• Nom: ${fileName}\n`;
            resultContent += `• Taille originale: ${selectedFile.data.length} ${selectedFile.encoding === 'base64' ? 'bytes (binaire)' : 'caractères (texte)'}\n`;
            resultContent += `• Encodage source: ${selectedFile.encoding}\n`;
            resultContent += `• Extension: .${extension}\n`;
            resultContent += `• Timestamp: ${new Date().toLocaleString()}\n\n`;
            
            if (savedFile) {
                resultContent += `✅ VÉRIFICATION RÉUSSIE:\n`;
                resultContent += `• Fichier trouvé dans le dossier local\n`;
                resultContent += `• Taille sur disque: ${savedFile.size} bytes\n`;
                resultContent += `• Type: ${savedFile.isDirectory ? 'Dossier' : 'Fichier'}\n\n`;
            } else {
                resultContent += `⚠️ VÉRIFICATION PARTIELLE:\n`;
                resultContent += `• Fichier sauvegardé mais non trouvé lors du listage\n`;
                resultContent += `• Cela peut être normal selon le timing de synchronisation\n\n`;
            }
            
            resultContent += `🎯 RÉSULTAT:\n`;
            resultContent += `Le fichier "${fileName}" a été copié depuis la sélection système\n`;
            resultContent += `vers le dossier local de l'application avec préservation de l'intégrité\n`;
            resultContent += `des données et du nom de fichier.\n\n`;
            resultContent += `📂 Le fichier est maintenant disponible localement !`;
            
            display.textContent = resultContent;

        } catch (verifyError) {
            console.error('❌ [COPY FILE] Erreur lors de la vérification:', verifyError);
            
            // Afficher les résultats sans vérification
            let resultContent = `📂 Copie de fichier: ${fileName} (sans vérification)\n\n`;
            resultContent += `• Nom: ${fileName}\n`;
            resultContent += `• Taille: ${selectedFile.data.length} ${selectedFile.encoding === 'base64' ? 'bytes' : 'chars'}\n`;
            resultContent += `• Encodage: ${selectedFile.encoding}\n`;
            resultContent += `• Extension: .${extension}\n`;
            resultContent += `• Timestamp: ${new Date().toLocaleString()}\n\n`;
            resultContent += `✅ Fichier copié avec succès !\n`;
            resultContent += `⚠️ Erreur de vérification: ${verifyError.message}`;
            
            display.textContent = resultContent;
        }

    } catch (error) {
        console.error('❌ [COPY FILE] Erreur lors de la copie:', error);
        
        let errorContent = `❌ Erreur lors de la copie de fichier\n\n`;
        errorContent += `Message d'erreur: ${error.message}\n\n`;
        errorContent += 'Détails techniques:\n';
        errorContent += `- Timestamp: ${new Date().toISOString()}\n`;
        errorContent += `- Bridge Swift disponible: ${!!window.webkit?.messageHandlers?.swiftBridge}\n`;
        errorContent += `- Module ios_file_writer chargé: ${typeof window.writeFileToIOS === 'function'}\n`;
        errorContent += `- Méthode: Sélection système → sauvegarde locale\n`;
        errorContent += `\n💡 Info: Cette fonction utilise la fenêtre de sélection système pour\n`;
        errorContent += `choisir un fichier et le copier dans le dossier local de l'application\n`;
        errorContent += `en préservant l'intégrité du nom et du contenu.`;
        
        display.textContent = errorContent;
    }
}

// Fonction pour ouvrir la fenêtre de sélection système (inspirée d'ios_apis.js)
function openSystemFileSelector() {
    return new Promise((resolve, reject) => {
        try {
            console.log('📂 [FILE SELECTOR] Création de l\'input file caché');
            
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = false; // Un seul fichier
            input.accept = '*/*'; // Accepter tous les types
            input.style.display = 'none';
            document.body.appendChild(input);

            const cleanup = () => { 
                try { 
                    input.parentNode && document.body.removeChild(input); 
                } catch(_){} 
            };

            input.addEventListener('change', () => {
                try {
                    if (!input.files || !input.files.length) { 
                        cleanup(); 
                        return resolve(null); // Pas d'erreur, juste annulation
                    }
                    
                    const file = input.files[0];
                    const name = file.name;
                    console.log(`📋 [FILE SELECTOR] Fichier sélectionné: ${name} (${file.size} bytes)`);

                    const reader = new FileReader();
                    reader.onerror = (err) => { 
                        cleanup(); 
                        reject(new Error('Erreur lors de la lecture du fichier')); 
                    };

                    // Déterminer si traiter comme texte ou binaire
                    const lowerName = name.toLowerCase();
                    const treatAsText = /\.(atome|json|txt|lrc|md|html|css|js|xml|csv)$/i.test(name) || 
                                      file.type.startsWith('text/') || 
                                      file.type === 'application/json' || 
                                      file.type === '';

                    console.log(`📖 [FILE SELECTOR] Traitement: ${treatAsText ? 'texte' : 'binaire'}`);

                    reader.onload = () => {
                        try {
                            if (treatAsText) {
                                resolve({ 
                                    fileName: name, 
                                    data: reader.result, 
                                    encoding: 'utf8', 
                                    rawFile: file 
                                });
                            } else {
                                // Convertir ArrayBuffer en base64
                                const buf = new Uint8Array(reader.result);
                                let binary = '';
                                for (let i = 0; i < buf.length; i++) {
                                    binary += String.fromCharCode(buf[i]);
                                }
                                const b64 = btoa(binary);
                                resolve({ 
                                    fileName: name, 
                                    data: b64, 
                                    encoding: 'base64', 
                                    rawFile: file 
                                });
                            }
                        } finally { 
                            cleanup(); 
                        }
                    };

                    if (treatAsText) {
                        reader.readAsText(file);
                    } else {
                        reader.readAsArrayBuffer(file);
                    }
                    
                } catch(e) { 
                    cleanup(); 
                    reject(e); 
                }
            });

            // Déclencher l'ouverture de la fenêtre système
            console.log('🖱️ [FILE SELECTOR] Ouverture de la fenêtre de sélection...');
            input.click();
            
        } catch(e) { 
            reject(e); 
        }
    });
}

// === FONCTIONS DE TEST AUV3 ===

// Fonction pour tester la lecture des dossiers AUv3
async function testReadAUv3Folder(subfolder = 'Projects') {
    console.log(`🎛️ [READ AUV3] Test de lecture du dossier AUv3: AtomeFiles/${subfolder}`);
    
    const display = document.getElementById('file_content_display');
    if (!display) {
        console.error('Element d\'affichage non trouve');
        return;
    }

    // Afficher la fenêtre si elle est cachée
    const contentWindow = document.getElementById('file_content_w');
    if (contentWindow) {
        contentWindow.style.display = 'flex';
    }

    // Afficher un message de chargement
    display.textContent = `🎛️ Lecture du dossier AUv3 AtomeFiles/${subfolder}

Étape 1: Vérification des modules...
Chargement de auv3_file_lister.js...`;

    try {
        // Vérifier que le module auv3_file_lister est chargé
        if (typeof window.get_auv3_folder_content !== 'function') {
            throw new Error('Module auv3_file_lister.js non chargé. Assurez-vous que le fichier est inclus dans l\'application.');
        }

        display.textContent = `🎛️ Lecture du dossier AUv3 AtomeFiles/${subfolder}

Étape 2: Connexion au bridge Swift...
Requête vers MainAppFileManager...`;

        // Appeler la fonction de listage AUv3
        console.log(`[READ AUV3] Appel de get_auv3_folder_content avec subfolder: ${subfolder}`);
        const files = await window.get_auv3_folder_content(subfolder);
        
        console.log(`[READ AUV3] Résultat reçu:`, files);
        
        // Formater et afficher le résultat
        let content = `🎛️ Contenu du dossier AUv3: "AtomeFiles/${subfolder}"\n`;
        content += `Dernière mise à jour: ${new Date().toLocaleString('fr-FR')}\n`;
        content += `Source: MainAppFileManager.swift via App Groups\n`;
        content += '='.repeat(60) + '\n\n';
        
        if (Array.isArray(files) && files.length > 0) {
            content += `✅ ${files.length} élément(s) trouvé(s) dans AtomeFiles/${subfolder}:\n\n`;
            
            files.forEach((file, index) => {
                const icon = file.isDirectory ? '📁' : getAUv3FileIcon(file.type);
                const type = file.isDirectory ? '[DIR]' : `[${file.type.toUpperCase()}]`;
                const size = file.isDirectory ? '' : ` (${file.sizeFormatted})`;
                const modified = file.lastModifiedFormatted !== 'Inconnu' ? ` - ${file.lastModifiedFormatted}` : '';
                
                content += `${index + 1}. ${icon} ${type} ${file.name}${size}${modified}\n`;
                content += `   📍 Path: ${file.path}\n`;
                if (!file.isDirectory && file.source) {
                    content += `   🔗 Source: ${file.source}\n`;
                }
                content += '\n';
            });
            
            content += `\n💡 Info: Ces fichiers sont dans le dossier local de l'AUv3 (AtomeFiles)\n`;
            content += `🔄 Ils sont accessibles depuis l'app Files iOS sous "Atome"\n`;
            content += `📱 Partagés via App Groups entre l'app principale et l'AUv3`;
            
        } else {
            content += `📂 Aucun fichier trouvé dans AtomeFiles/${subfolder}\n\n`;
            content += `💡 Suggestions:\n`;
            content += `- Vérifiez que l'AUv3 a été lancé au moins une fois\n`;
            content += `- Créez des fichiers via l'interface AUv3\n`;
            content += `- Utilisez le bouton "Write AUv3 File" pour tester l'écriture`;
        }
        
        display.textContent = content;
        
    } catch (error) {
        console.error('[READ AUV3] Erreur:', error);
        
        let errorContent = `❌ Erreur lors de la lecture du dossier AUv3 "AtomeFiles/${subfolder}"\n\n`;
        errorContent += `Message d'erreur: ${error.message}\n\n`;
        errorContent += 'Détails techniques:\n';
        errorContent += `- Timestamp: ${new Date().toISOString()}\n`;
        errorContent += `- Module auv3_file_lister chargé: ${typeof window.get_auv3_folder_content === 'function'}\n`;
        errorContent += `- Bridge Swift disponible: ${!!window.webkit?.messageHandlers?.swiftBridge}\n`;
        errorContent += `- Sous-dossier demandé: ${subfolder}\n`;
        errorContent += `- Chemin complet: AtomeFiles/${subfolder}\n\n`;
        
        errorContent += `🔧 Actions à vérifier:\n`;
        errorContent += `1. L'AUv3 a été compilé et installé\n`;
        errorContent += `2. Le MainAppFileManager.swift gère l'action 'listFilesAUv3'\n`;
        errorContent += `3. Les App Groups sont configurés correctement\n`;
        errorContent += `4. Le dossier AtomeFiles existe sur l'appareil`;
        
        display.textContent = errorContent;
    }
}

// Fonction pour tester l'écriture de fichiers AUv3
async function testWriteAUv3File(filename, subfolder = 'Projects') {
    console.log(`🎛️ [WRITE AUV3] Test d'écriture fichier AUv3: ${filename} dans AtomeFiles/${subfolder}`);
    
    const display = document.getElementById('file_content_display');
    if (!display) {
        console.error('Element d\'affichage non trouve');
        return;
    }

    // Afficher la fenêtre si elle est cachée
    const contentWindow = document.getElementById('file_content_w');
    if (contentWindow) {
        contentWindow.style.display = 'flex';
    }

    // Afficher un message de chargement
    display.textContent = `💾 Écriture fichier AUv3: ${filename}

Étape 1: Préparation du contenu...
Destination: AtomeFiles/${subfolder}/${filename}`;

    try {
        // Vérifier que le module auv3_file_writer est chargé
        if (typeof window.writeFileToAUv3 !== 'function') {
            throw new Error('Module auv3_file_writer.js non chargé. Assurez-vous que le fichier est inclus dans l\'application.');
        }

        // Préparer le contenu selon le type de fichier
        let content;
        let mimeType;

        if (filename.endsWith('.atome') || filename.endsWith('.json')) {
            // Fichier de projet Atome
            content = {
                metadata: {
                    name: filename.replace(/\.(atome|json)$/, ''),
                    version: '1.0',
                    created: new Date().toISOString(),
                    createdBy: 'MainApp_Test',
                    description: `Fichier de test créé depuis l'application principale vers AUv3`
                },
                data: {
                    atoms: [],
                    connections: [],
                    settings: {
                        tempo: 120,
                        volume: 0.8,
                        effects: []
                    }
                },
                testInfo: {
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    url: window.location.href,
                    source: 'test_and_rd.js -> auv3_file_writer.js',
                    target: `AtomeFiles/${subfolder}/${filename}`
                }
            };
            mimeType = 'application/json';
        } else {
            // Fichier texte simple
            content = `Test d'écriture depuis l'application principale vers AUv3

=== INFORMATIONS DU TEST ===
Fichier: ${filename}
Destination: AtomeFiles/${subfolder}
Timestamp: ${new Date().toISOString()}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}

=== DÉTAILS TECHNIQUES ===
Source: test_and_rd.js -> auv3_file_writer.js -> MainAppFileManager.swift
Méthode: App Groups shared container
Bridge: window.webkit.messageHandlers.swiftBridge
Action Swift: writeFileAUv3

=== CONTENU DU TEST ===
Ce fichier a été créé par l'application principale pour tester
l'accès en écriture au dossier local de l'AUv3.

Les fichiers créés ici seront visibles:
- Dans l'app Files iOS sous "Atome"
- Dans l'interface AUv3 des apps musicales
- Depuis les deux applications (principale et AUv3)

Test de caractères spéciaux: àéèùçñ🎵🎛️📱💾
Test de multiligne avec indentation:
    - Item 1
    - Item 2
        - Sous-item 2.1
        - Sous-item 2.2

Fin du test d'écriture AUv3.
`;
            mimeType = 'text/plain';
        }

        display.textContent = `💾 Écriture fichier AUv3: ${filename}

Étape 2: Transmission vers Swift...
Bridge: swiftBridge.postMessage()
Action: writeFileAUv3`;

        // Utiliser writeFileToAUv3 pour sauvegarder
        console.log(`[WRITE AUV3] Appel de writeFileToAUv3:`, { filename, subfolder, contentType: typeof content });
        const result = await window.writeFileToAUv3(filename, content, subfolder, mimeType);
        
        console.log(`[WRITE AUV3] Résultat:`, result);

        // Afficher le résultat de succès
        let successContent = `💾 Fichier AUv3 écrit avec succès !\n\n`;
        successContent += `✅ Fichier: ${result.filename}\n`;
        successContent += `📁 Dossier: AtomeFiles/${result.subfolder}\n`;
        successContent += `📍 Chemin complet: ${result.path}\n`;
        successContent += `📊 Taille: ${result.size} caractères (${window.formatAUv3FileSize ? window.formatAUv3FileSize(result.size) : result.size + ' B'})\n`;
        successContent += `🏷️ Type MIME: ${result.mimeType}\n`;
        successContent += `⏰ Timestamp: ${result.timestamp}\n\n`;
        
        successContent += `🎯 Message Swift: ${result.message}\n\n`;
        
        successContent += `📱 Accès au fichier:\n`;
        successContent += `- App Files iOS: "Atome" > "${result.subfolder}" > "${result.filename}"\n`;
        successContent += `- Interface AUv3: Bouton de gestion des fichiers\n`;
        successContent += `- App principale: Bouton "Read AUv3 Folder"\n\n`;
        
        successContent += `🔄 Pour vérifier: Changez le dossier vers "${result.subfolder}" et cliquez "Read AUv3 Folder"`;
        
        display.textContent = successContent;

    } catch (error) {
        console.error('[WRITE AUV3] Erreur:', error);
        
        let errorContent = `❌ Erreur lors de l'écriture du fichier AUv3 "${filename}"\n\n`;
        errorContent += `Message d'erreur: ${error.message}\n\n`;
        errorContent += 'Détails techniques:\n';
        errorContent += `- Timestamp: ${new Date().toISOString()}\n`;
        errorContent += `- Module auv3_file_writer chargé: ${typeof window.writeFileToAUv3 === 'function'}\n`;
        errorContent += `- Bridge Swift disponible: ${!!window.webkit?.messageHandlers?.swiftBridge}\n`;
        errorContent += `- Fichier: ${filename}\n`;
        errorContent += `- Sous-dossier: ${subfolder}\n`;
        errorContent += `- Destination: AtomeFiles/${subfolder}/${filename}\n\n`;
        
        errorContent += `🔧 Vérifications nécessaires:\n`;
        errorContent += `1. MainAppFileManager.swift gère l'action 'writeFileAUv3'\n`;
        errorContent += `2. Les permissions d'écriture sont accordées\n`;
        errorContent += `3. Le dossier AtomeFiles/${subfolder} existe\n`;
        errorContent += `4. L'App Group est configuré correctement`;
        
        display.textContent = errorContent;
    }
}

// Fonction utilitaire pour obtenir l'icône selon le type de fichier AUv3
function getAUv3FileIcon(fileType) {
    const iconMap = {
        'audio': '🎵',
        'project': '🎛️',
        'data': '📊',
        'text': '📝',
        'document': '📄',
        'image': '🖼️',
        'folder': '📁',
        'file': '📄',
        'unknown': '❓'
    };
    
    return iconMap[fileType] || iconMap.file;
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
