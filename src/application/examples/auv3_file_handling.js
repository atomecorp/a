/*
 * Document Picker Simple - AUv3
 * Un seul bouton pour ouvrir le Document Picker iOS
 */

console.log('📱 Document Picker Simple chargé');

// Fonction pour créer le bouton
function creerBoutonDocumentPicker() {
    console.log('🔧 Création du bouton Document Picker...');
    
    // Supprimer bouton existant s'il y en a un
    const existing = document.getElementById('document-picker-btn');
    if (existing) existing.remove();
    
    // Créer le bouton Document Picker
    const button = document.createElement('button');
    button.id = 'document-picker-btn';
    button.textContent = '📄 DOCUMENT PICKER AUV3';
    button.style.cssText = `
        position: fixed;
        top: 50px;
        left: 50px;
        padding: 20px 30px;
        background-color: #FF0066;
        color: white;
        border: none;
        border-radius: 15px;
        font-size: 20px;
        font-weight: bold;
        cursor: pointer;
        z-index: 99999;
        box-shadow: 0 8px 16px rgba(255,0,102,0.4);
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    
    // Action du bouton
    button.addEventListener('click', async () => {
        try {
            console.log('� CLIC SUR DOCUMENT PICKER !');
            
            // Vérifier bridge Swift
            if (!window.webkit?.messageHandlers?.swiftBridge) {
                alert('❌ Bridge Swift non disponible');
                console.error('❌ Pas de bridge Swift');
                return;
            }
            
            console.log('✅ Bridge Swift OK - Envoi message...');
            
            // Message pour sauvegarder
            const testData = {
                version: '1.0',
                created: new Date().toISOString(),
                message: 'Test Document Picker - ENFIN !'
            };
            
            // Envoyer au bridge Swift
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'saveFileWithDocumentPicker',
                data: JSON.stringify(testData),
                fileName: 'test-enfin.atome'
            });
            
            console.log('🚀 Message envoyé au Document Picker !');
            
            // Feedback visuel
            button.textContent = '⏳ Ouverture en cours...';
            button.style.backgroundColor = '#FFA500';
            
            setTimeout(() => {
                button.textContent = '📄 DOCUMENT PICKER AUV3';
                button.style.backgroundColor = '#FF0066';
            }, 3000);
            
        } catch (error) {
            console.error('❌ ERREUR DOCUMENT PICKER:', error);
            alert('❌ Erreur: ' + error.message);
        }
    });
    
    // Ajouter au DOM
    document.body.appendChild(button);
    console.log('✅ Bouton Document Picker créé et ajouté !');
    console.log('🎯 Position:', button.getBoundingClientRect());
    
    return button;
}

// Essayer plusieurs fois de créer le bouton
function initialiserBouton() {
    if (document.body) {
        console.log('✅ DOM prêt - création du bouton');
        creerBoutonDocumentPicker();
    } else {
        console.log('⏳ DOM pas encore prêt - retry dans 100ms');
        setTimeout(initialiserBouton, 100);
    }
}

// Démarrer immédiatement
initialiserBouton();

// Backup avec DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('� DOMContentLoaded - vérification bouton');
    if (!document.getElementById('document-picker-btn')) {
        console.log('🔄 Pas de bouton trouvé - création backup');
        creerBoutonDocumentPicker();
    }
});

// Backup avec window.load
window.addEventListener('load', () => {
    console.log('🌍 Window load - vérification finale bouton');
    if (!document.getElementById('document-picker-btn')) {
        console.log('🚨 Création d\'urgence du bouton');
        creerBoutonDocumentPicker();
    }
});
