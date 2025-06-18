/**
 * 🔲 Matrix Web Component - Test Simple
 * 
 * Test basique pour valider le bon fonctionnement du composant Matrix
 * 
 * @version 2.0.0 - TEST
 * @author Squirrel Framework Team
 */

console.log('🔲 Matrix Test - Starting basic test...');

// Test simple avec configuration minimale
try {
    const testMatrix = new Matrix({
        id: 'matrix-test-simple',
        attach: 'body',
        x: 50,
        y: 450,
        grid: { x: 3, y: 3 },
        size: { width: 250, height: 250 },
        
        callbacks: {
            onCellClick: (cell, x, y, cellId) => {
                console.log(`✅ Matrix Test - Cell clicked: (${x}, ${y})`);
                
                // Test de modification du contenu
                const content = cell.querySelector('.cell-content');
                if (content) {
                    content.textContent = `✓ ${x},${y}`;
                    content.style.color = '#00ff00';
                }
            },
            
            onCellHover: (cell, x, y, cellId) => {
                console.log(`🎯 Matrix Test - Cell hovered: (${x}, ${y})`);
            },
            
            onSelectionChange: (selectedCells) => {
                console.log(`📋 Matrix Test - Selection changed: ${selectedCells.length} cells selected`);
            }
        }
    });
    
    console.log('✅ Matrix Test - Basic matrix created successfully');
    
    // Test des méthodes publiques
    setTimeout(() => {
        console.log('🔧 Matrix Test - Testing public methods...');
        
        // Test de sélection programmatique
        testMatrix.selectCell(1, 1);
        console.log('✅ Matrix Test - selectCell(1,1) executed');
        
        // Test de modification de contenu
        testMatrix.setCellContent(0, 0, '🎯');
        console.log('✅ Matrix Test - setCellContent(0,0) executed');
        
        // Test de style personnalisé
        testMatrix.setCellStyle(2, 2, {
            backgroundColor: '#ff6b35',
            color: '#ffffff',
            borderRadius: '50%'
        });
        console.log('✅ Matrix Test - setCellStyle(2,2) executed');
        
        // Test de récupération des cellules sélectionnées
        const selected = testMatrix.getSelectedCells();
        console.log(`✅ Matrix Test - getSelectedCells() returned: ${selected.length} cells`);
        
    }, 2000);
    
    // Test de redimensionnement
    setTimeout(() => {
        console.log('🔧 Matrix Test - Testing resize...');
        testMatrix.resize(300, 300);
        console.log('✅ Matrix Test - resize(300,300) executed');
    }, 4000);
    
} catch (error) {
    console.error('❌ Matrix Test - Error creating basic matrix:', error);
}

console.log('🔲 Matrix Test - All tests initiated');
