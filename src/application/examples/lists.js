/**
 * 📋 EXEMPLES D'UTILISATION - COMPOSANT LIST MATERIAL DESIGN
 * 
 * @version 2.0
 * @author Squirrel Framework
 * @date 15 juin 2025
 */
console.log('📋 Chargement des exemples de listes Material Design...');

// Attendre que List soit disponible via spark.js
function waitForList() {
    return new Promise((resolve) => {
        if (window.List) {
            console.log('✅ Classe List trouvée !');
            resolve();
        } else {
            console.log('⏳ Attente de la classe List...');
            setTimeout(() => waitForList().then(resolve), 100);
        }
    });
}

// ✅ EXEMPLE 1 : Liste Material Design ultra-personnalisée
function createMaterialList() {
    console.log('🎨 Création de la liste Material Design...');
    const materialList = new window.List({
        id: 'material-list',
        position: { x: 50, y: 50 },
        size: { width: 350, height: 500 },
        attach: '#view',
        
        // Espacement ultra-fin
        spacing: {
            vertical: 2,          // Espace minimal entre éléments
            horizontal: 0,        // Pas de marge horizontale
            itemPadding: 12,      // Padding compact
            marginTop: 0,         // Pas de marge avant
            marginBottom: 0       // Pas de marge après
        },
        
        // Style Material Design des éléments
        itemStyle: {
            fontSize: '14px',
            fontWeight: '400',
            lineHeight: '1.5',
            textColor: '#212121',
            backgroundColor: '#ffffff',
            borderRadius: '6px'
        },
        
        items: [
            { 
                id: 'item-1', 
                content: '📧 Messages non lus',
                style: { 
                    backgroundColor: '#e3f2fd',
                    color: '#1565c0',
                    fontWeight: '500'
                }
            },
            { 
                id: 'item-2', 
                content: '📅 Rendez-vous aujourd\'hui',
                style: { 
                    backgroundColor: '#f3e5f5',
                    color: '#7b1fa2'
                }
            },
            { 
                id: 'item-3', 
                content: '⚡ Tâches urgentes',
                style: { 
                    backgroundColor: '#fff3e0',
                    color: '#ef6c00'
                }
            },
            { 
                id: 'item-4', 
                content: '✅ Projets terminés',
                style: { 
                    backgroundColor: '#e8f5e8',
                    color: '#2e7d32'
                }
            }
        ],
        
        containerStyle: {
            background: '#fafafa',
            borderRadius: '12px',
            border: '1px solid #e0e0e0'
        },
        
        states: {
            hover: { 
                backgroundColor: '#f5f5f5',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                transform: 'translateY(-1px)'
            },
            selected: { 
                backgroundColor: '#1976d2', 
                color: 'white',
                boxShadow: '0 4px 12px rgba(25,118,210,0.4)',
                fontWeight: '500'
            }
        },
        
        elevation: 2,
        selectable: true,
        multiSelect: true,
        rippleEffect: true,
        
        onItemClick: (item, index) => {
            console.log(`🖱️ Material clic: ${item.content}`);
        },
        
        onItemSelect: (item, isSelected) => {
            console.log(`${isSelected ? '✅' : '❌'} ${item.content}`);
        },
        
        debug: true
    });
    
    return materialList;
}

// ✅ EXEMPLE 2 : Liste compacte avec espacement minimal
function createCompactList() {
    console.log('📦 Création de la liste compacte...');
    return new window.List({
        id: 'compact-list',
        position: { x: 450, y: 50 },
        size: { width: 300, height: 400 },
        attach: '#view',
        
        // Espacement ultra-compact
        spacing: {
            vertical: 1,          // Espacement minimal
            itemPadding: 8,       // Padding très fin
            marginTop: 0,
            marginBottom: 0
        },
        
        // Texte plus petit et compact
        itemStyle: {
            fontSize: '12px',
            fontWeight: '400',
            lineHeight: '1.3',
            textColor: '#424242',
            backgroundColor: '#ffffff',
            borderRadius: '4px'
        },
        
        items: [
            { content: '🔧 Configuration' },
            { content: '📊 Statistiques' },
            { content: '🎨 Apparence' },
            { content: '🔒 Sécurité' },
            { content: '📱 Notifications' },
            { content: '🌐 Réseau' },
            { content: '💾 Sauvegarde' }
        ],
        
        elevation: 1,
        
        states: {
            hover: { 
                backgroundColor: '#f8f9fa',
                transform: 'translateX(2px)'
            },
            selected: { 
                backgroundColor: '#e8f4fd',
                color: '#1976d2',
                borderLeft: '3px solid #1976d2'
            }
        }
    });
}

// ✅ EXEMPLE 3 : Liste avec gros texte et espacement généreux
function createLargeTextList() {
    console.log('📝 Création de la liste avec gros texte...');
    return new window.List({
        id: 'large-text-list',
        position: { x: 50, y: 600 },
        size: { width: 400, height: 350 },
        attach: '#view',
        
        // Espacement généreux
        spacing: {
            vertical: 8,          // Beaucoup d'espace entre éléments
            itemPadding: 20,      // Padding généreux
            marginTop: 4,
            marginBottom: 4
        },
        
        // Gros texte lisible
        itemStyle: {
            fontSize: '16px',
            fontWeight: '500',
            lineHeight: '1.6',
            textColor: '#1a1a1a',
            backgroundColor: '#ffffff',
            borderRadius: '8px'
        },
        
        items: [
            { content: '🏠 Accueil' },
            { content: '👤 Profil utilisateur' },
            { content: '⚙️ Paramètres avancés' },
            { content: '📈 Tableau de bord' },
            { content: '💼 Gestion de projet' }
        ],
        
        elevation: 3,
        
        states: {
            hover: { 
                backgroundColor: '#f0f7ff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                transform: 'scale(1.02)'
            },
            selected: { 
                backgroundColor: '#1976d2',
                color: 'white',
                boxShadow: '0 6px 20px rgba(25,118,210,0.3)',
                fontWeight: '600'
            }
        }
    });
}

// ✅ EXEMPLE 4 : API de mise à jour dynamique
function createDynamicList() {
    console.log('⚡ Création de la liste dynamique...');
    const dynamicList = new window.List({
        id: 'dynamic-list',
        position: { x: 500, y: 600 },
        size: { width: 250, height: 300 },
        attach: '#view',
        
        items: [
            { content: '📝 Élément initial' }
        ],
        
        itemStyle: {
            fontSize: '13px',
            textColor: '#333333',
            backgroundColor: '#f9f9f9'
        },
        
        spacing: {
            vertical: 3,
            itemPadding: 10
        },
        
        elevation: 1
    });
    
    // Test des APIs de mise à jour
    setTimeout(() => {
        console.log('🔄 Mise à jour de l\'espacement...');
        dynamicList.updateSpacing({
            vertical: 6,
            itemPadding: 16
        });
    }, 2000);
    
    setTimeout(() => {
        console.log('🎨 Mise à jour du style de texte...');
        dynamicList.updateTextStyle({
            fontSize: '15px',
            fontWeight: '500',
            textColor: '#1976d2'
        });
    }, 4000);
    
    return dynamicList;
}

// 🚀 INITIALISATION DES EXEMPLES
async function initializeLists() {
    console.log('🎯 Attente du chargement de la classe List...');
    await waitForList();
    
    console.log('🚀 Initialisation des listes Material Design...');
    
    // Créer toutes les listes
    const lists = {
        material: createMaterialList(),
        compact: createCompactList(),
        largeText: createLargeTextList(),
        dynamic: createDynamicList()
    };
    
    console.log('✨ Toutes les listes sont créées !');
    console.log('📋 Listes disponibles:', Object.keys(lists));
    
    // Rendre disponible globalement pour les tests
    window.Lists = lists;
    
    return lists;
}

// Démarrer l'initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM chargé, démarrage de l\'initialisation...');
    initializeLists().catch(error => {
        console.error('❌ Erreur lors de l\'initialisation:', error);
    });
});
