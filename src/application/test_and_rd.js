/**
 * test_and_rd.js
 * Fichier de test et R&D pour les fonctionnalités iOS
 */

// Fonction pour créer le bouton de test
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
    console.log('[Debug] Toolbar trouvée:', toolbar);
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
}// Fonction pour créer la fenêtre de contenu
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
            height: '400px',
            backgroundColor: '#1a1a1a',
            color: '#ffffff',
            border: '2px solid #444',
            borderRadius: '8px',
            zIndex: '10000',
            display: 'block',
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

    // Zone de contrôles
    const controls = $('div', {
        css: {
            padding: '10px 15px',
            borderTop: '1px solid #444',
            backgroundColor: '#2d2d2d',
            borderRadius: '0 0 6px 6px',
            display: 'flex',
            gap: '10px',
            alignItems: 'center'
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

    controls.appendChild(pathInput);
    controls.appendChild(refreshButton);
    controls.appendChild(filenameInput);
    controls.appendChild(writeTestButton);

    window.appendChild(header);
    window.appendChild(content);
    window.appendChild(controls);

    document.body.appendChild(window);
    
    console.log('[Debug] Fenetre file_content_w creee et ajoutee au DOM');

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
        console.error('Éléments d\'affichage non trouvés');
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
        content += '=' .repeat(50) + '\n\n';
        
        if (typeof formatFileList === 'function') {
            content += formatFileList(files);
        } else {
            // Formatage de base si formatFileList n'est pas disponible
            if (Array.isArray(files) && files.length > 0) {
                content += `${files.length} élément(s) trouvé(s):\n\n`;
                files.forEach((file, index) => {
                    const type = file.isDirectory ? '📁 [DIR]' : '📄 [FILE]';
                    const size = file.size ? ` (${file.size} bytes)` : '';
                    content += `${index + 1}. ${type} ${file.name}${size}\n`;
                });
            } else {
                content += 'Aucun fichier trouvé dans ce dossier.';
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
        console.error('Élément d\'affichage non trouvé');
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
        successContent += 'Le fichier a été créé avec un contenu de test généré automatiquement.';
        
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
