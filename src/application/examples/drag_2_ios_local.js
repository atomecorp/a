

// === BOUTON: Ouvrir une fenêtre système pour browser les fichiers (Document Picker) ===
// Utilise le bridge FileSystemBridge -> action: loadFileWithDocumentPicker
function openSystemFileBrowser() {
    console.log('[drag_2_ios_local] ouverture du sélecteur de fichiers système');
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem) {
        // Définir callbacks de résultat si besoin
        window.documentPickerLoadResult = function(success, content, error){
            if (success) {
                console.log('✅ Fichier chargé via Document Picker, longueur contenu:', content ? content.length : 0);
            } else {
                console.warn('❌ Echec chargement Document Picker:', error);
            }
        };
        window.webkit.messageHandlers.fileSystem.postMessage({
            action: 'loadFileWithDocumentPicker',
            fileTypes: ['m4a','mp3','wav','atome','json']
        });
    } else {
        console.warn('Bridge fileSystem indisponible dans ce contexte.');
    }
}

const browseBtn = Button({
    onText: 'Browse',
    offText: 'Browse',
    parent: '#view',
    onAction: openSystemFileBrowser,
    offAction: openSystemFileBrowser,
    css: {
        width: '110px',
        height: '30px',
        left: '200px',
        top: '120px',
        borderRadius: '6px',
        backgroundColor: '#007bff',
        color: 'white',
        position: 'relative',
        border: '2px solid rgba(255,255,255,0.25)',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
        fontSize: '14px'
    }
});

console.log('[drag_2_ios_local] Bouton Browse ajouté');

function resetPermission(){
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem){
        window.webkit.messageHandlers.fileSystem.postMessage({action:'resetFileAccessPermission'});
        console.log('[drag_2_ios_local] Permission fichiers réinitialisée – prochaine ouverture re‑demandera.');
    }
}

const resetBtn = Button({
    onText:'ResetPerm',
    offText:'ResetPerm',
    parent:'#view',
    onAction: resetPermission,
    offAction: resetPermission,
    css:{
        width:'110px',height:'30px',left:'200px',top:'160px',borderRadius:'6px',backgroundColor:'#6c757d',color:'white',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'12px'
    }
});

console.log('[drag_2_ios_local] Bouton ResetPerm ajouté');

// === DEMO: copy_to_ios_local ===
function copyToLocalDemo(){
    if(!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem)){
        console.warn('bridge indisponible'); return;
    }
    // Exemple: destination ./Projects/ (garde le nom original)
    window.fileSystemCallback = function(res){
        if(res.success){
            console.log('✅ Import enregistré path=', res.data.path);
        } else {
            console.warn('❌ Import échoué', res.error);
        }
    };
    window.webkit.messageHandlers.fileSystem.postMessage({
        action:'copyToIOSLocal',
        requestedDestPath:'./',
        fileTypes:['m4a','mp3','wav','atome','json']
    });
}

const copyBtn = Button({
    onText:'Import→Local',
    offText:'Import→Local',
    parent:'#view',
    onAction: copyToLocalDemo,
    offAction: copyToLocalDemo,
    css:{
        width:'130px',height:'30px',left:'200px',top:'200px',borderRadius:'6px',backgroundColor:'#28a745',color:'white',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'12px'
    }
});

console.log('[drag_2_ios_local] Bouton Import→Local ajouté');

// === DEMO: import multiple ===
function copyMultipleToLocalDemo(){
    if(!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem)){
        console.warn('bridge indisponible'); return;
    }
    window.fileSystemCallback = function(res){
        if(res.success){
            console.log('✅ Imports enregistrés paths=', res.data.paths);
        } else {
            console.warn('❌ Imports multiples échoués', res.error);
        }
    };
    window.webkit.messageHandlers.fileSystem.postMessage({
        action:'copyMultipleToIOSLocal',
        requestedDestPath:'./',
        fileTypes:['m4a','mp3','wav','atome','json']
    });
}

const copyMultipleBtn = Button({
    onText:'Multi→Local',
    offText:'Multi→Local',
    parent:'#view',
    onAction: copyMultipleToLocalDemo,
    offAction: copyMultipleToLocalDemo,
    css:{
        width:'130px',height:'30px',left:'200px',top:'240px',borderRadius:'6px',backgroundColor:'#17a2b8',color:'white',position:'relative',border:'2px solid rgba(255,255,255,0.25)',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,0.4)',fontSize:'12px'
    }
});

console.log('[drag_2_ios_local] Bouton Multi→Local ajouté');