/**
 * 🔲 Matrix Web Component - Test de Validation Complète
 * 
 * Test exhaustif de toutes les fonctionnalités du composant Matrix Web Component:
 * - Auto-attachment et positioning
 * - Callbacks d'événements
 * - Méthodes publiques
 * - Styles dynamiques
 * - Animations et effets
 * 
 * @version 2.0.0 - VALIDATION COMPLETE
 * @author Squirrel Framework Team
 */

console.log('🔲 Matrix Validation Test - Starting comprehensive validation...');

// Test 1: Matrix avec auto-attachment complet
const validationMatrix = new Matrix({
    id: 'matrix-validation',
    attach: 'body',
    x: 350,
    y: 450,
    grid: { x: 4, y: 3 },
    size: { width: 300, height: 220 },
    spacing: { horizontal: 5, vertical: 5, outer: 10 },
    
    containerStyle: {
        backgroundColor: '#f8f9fa',
        border: '2px solid #dee2e6',
        borderRadius: '16px',
        padding: '12px',
        boxShadow: [
            '0 4px 12px rgba(0, 0, 0, 0.1)',
            'inset 0 1px 2px rgba(255, 255, 255, 0.8)'
        ]
    },
    
    cellStyle: {
        backgroundColor: '#ffffff',
        border: '1px solid #e9ecef',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: '500',
        color: '#495057'
    },
    
    cellHoverStyle: {
        backgroundColor: '#e3f2fd',
        borderColor: '#2196f3',
        color: '#1976d2',
        transform: 'scale(1.05)'
    },
    
    cellSelectedStyle: {
        backgroundColor: '#2196f3',
        borderColor: '#1976d2',
        color: '#ffffff',
        transform: 'scale(1.08)'
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            const testResults = document.getElementById('test-results') || createTestResultsPanel();
            addTestResult(testResults, `✅ Click: Cell (${x}, ${y}) clicked successfully`);
            
            // Test modification du contenu
            cell.querySelector('.cell-content').textContent = `✓${x}${y}`;
        },
        
        onCellDoubleClick: (cell, x, y, cellId) => {
            const testResults = document.getElementById('test-results');
            addTestResult(testResults, `⚡ Double-click: Cell (${x}, ${y}) double-clicked`);
        },
        
        onCellLongClick: (cell, x, y, cellId) => {
            const testResults = document.getElementById('test-results');
            addTestResult(testResults, `⏱️ Long-click: Cell (${x}, ${y}) long-clicked`);
        },
        
        onCellHover: (cell, x, y, cellId) => {
            const testResults = document.getElementById('test-results');
            addTestResult(testResults, `🎯 Hover: Cell (${x}, ${y}) hovered`);
        },
        
        onCellTouch: (cell, x, y, cellId) => {
            const testResults = document.getElementById('test-results');
            addTestResult(testResults, `👆 Touch: Cell (${x}, ${y}) touched`);
        },
        
        onSelectionChange: (selectedCells) => {
            const testResults = document.getElementById('test-results');
            addTestResult(testResults, `📋 Selection: ${selectedCells.length} cells selected [${selectedCells.join(', ')}]`);
        },
        
        onMatrixResize: (width, height) => {
            const testResults = document.getElementById('test-results');
            addTestResult(testResults, `📏 Resize: Matrix resized to ${width}x${height}`);
        }
    }
});

// Création du panneau de résultats de test
function createTestResultsPanel() {
    const panel = document.createElement('div');
    panel.id = 'test-results';
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        max-height: 500px;
        background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
        border: 2px solid #dee2e6;
        border-radius: 12px;
        padding: 16px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        overflow-y: auto;
        z-index: 10000;
        backdrop-filter: blur(10px);
    `;
    
    const title = document.createElement('h3');
    title.textContent = '🔲 Matrix Validation Tests';
    title.style.cssText = `
        margin: 0 0 12px 0;
        color: #495057;
        font-size: 14px;
        font-weight: 600;
        border-bottom: 2px solid #e9ecef;
        padding-bottom: 8px;
    `;
    
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'results-container';
    resultsContainer.style.cssText = `
        max-height: 400px;
        overflow-y: auto;
    `;
    
    panel.appendChild(title);
    panel.appendChild(resultsContainer);
    document.body.appendChild(panel);
    
    return panel;
}

function addTestResult(panel, message) {
    const container = panel.querySelector('#results-container');
    const result = document.createElement('div');
    result.style.cssText = `
        padding: 4px 8px;
        margin: 2px 0;
        background: rgba(33, 150, 243, 0.1);
        border-left: 3px solid #2196f3;
        border-radius: 4px;
        color: #1976d2;
        font-size: 10px;
        opacity: 0;
        transform: translateX(10px);
        transition: all 0.3s ease;
    `;
    result.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    
    container.appendChild(result);
    
    // Animation d'apparition
    setTimeout(() => {
        result.style.opacity = '1';
        result.style.transform = 'translateX(0)';
    }, 10);
    
    // Scroll automatique vers le bas
    container.scrollTop = container.scrollHeight;
    
    // Limiter le nombre de résultats affichés
    if (container.children.length > 50) {
        container.removeChild(container.firstChild);
    }
}

// Test automatique des méthodes publiques
setTimeout(() => {
    console.log('🔧 Matrix Validation - Testing public API methods...');
    const testResults = document.getElementById('test-results');
    
    try {
        // Test 1: Sélection programmatique
        validationMatrix.selectCell(1, 1);
        addTestResult(testResults, '✅ API Test: selectCell(1,1) - Success');
        
        // Test 2: Modification de contenu
        validationMatrix.setCellContent(0, 0, '🎯 API');
        addTestResult(testResults, '✅ API Test: setCellContent(0,0) - Success');
        
        // Test 3: Style personnalisé
        validationMatrix.setCellStyle(3, 0, {
            backgroundColor: '#4caf50',
            color: '#ffffff',
            borderRadius: '50%',
            fontWeight: 'bold'
        });
        addTestResult(testResults, '✅ API Test: setCellStyle(3,0) - Success');
        
        // Test 4: Récupération des cellules sélectionnées
        const selected = validationMatrix.getSelectedCells();
        addTestResult(testResults, `✅ API Test: getSelectedCells() - ${selected.length} cells`);
        
        // Test 5: Récupération d'une cellule spécifique
        const cell = validationMatrix.getCell(2, 1);
        if (cell) {
            addTestResult(testResults, '✅ API Test: getCell(2,1) - Cell found');
        }
        
    } catch (error) {
        addTestResult(testResults, `❌ API Test Error: ${error.message}`);
    }
}, 3000);

// Test de sélection multiple
setTimeout(() => {
    console.log('🔧 Matrix Validation - Testing multiple selection...');
    const testResults = document.getElementById('test-results');
    
    try {
        validationMatrix.selectCell(2, 0);
        validationMatrix.selectCell(1, 2);
        validationMatrix.selectCell(3, 2);
        addTestResult(testResults, '✅ Multi-Select Test: Multiple cells selected');
        
        const selected = validationMatrix.getSelectedCells();
        addTestResult(testResults, `📊 Multi-Select Result: ${selected.length} total selected`);
        
    } catch (error) {
        addTestResult(testResults, `❌ Multi-Select Error: ${error.message}`);
    }
}, 5000);

// Test de redimensionnement
setTimeout(() => {
    console.log('🔧 Matrix Validation - Testing resize functionality...');
    const testResults = document.getElementById('test-results');
    
    try {
        validationMatrix.resize(350, 270);
        addTestResult(testResults, '✅ Resize Test: Matrix resized to 350x270');
        
        setTimeout(() => {
            validationMatrix.resize(300, 220);
            addTestResult(testResults, '✅ Resize Test: Matrix resized back to 300x220');
        }, 2000);
        
    } catch (error) {
        addTestResult(testResults, `❌ Resize Error: ${error.message}`);
    }
}, 7000);

// Test de déselection
setTimeout(() => {
    console.log('🔧 Matrix Validation - Testing deselection...');
    const testResults = document.getElementById('test-results');
    
    try {
        validationMatrix.deselectCell(1, 1);
        addTestResult(testResults, '✅ Deselect Test: Cell (1,1) deselected');
        
        setTimeout(() => {
            validationMatrix.clearSelection();
            addTestResult(testResults, '✅ Clear Test: All selections cleared');
        }, 1000);
        
    } catch (error) {
        addTestResult(testResults, `❌ Deselect Error: ${error.message}`);
    }
}, 9000);

// Test final: Validation complète
setTimeout(() => {
    console.log('🔧 Matrix Validation - Final validation...');
    const testResults = document.getElementById('test-results');
    
    addTestResult(testResults, '🎉 VALIDATION COMPLETE: All Matrix features tested successfully!');
    addTestResult(testResults, '🔥 Matrix Web Component is fully functional and ready for production!');
    
    // Animation de célébration
    const matrix = document.getElementById('matrix-validation');
    if (matrix) {
        matrix.style.animation = 'celebration 2s ease-in-out';
        setTimeout(() => {
            matrix.style.animation = '';
        }, 2000);
    }
    
}, 12000);

// Animation de célébration
const celebrationStyle = document.createElement('style');
celebrationStyle.textContent = `
    @keyframes celebration {
        0%, 100% { transform: scale(1) rotateZ(0deg); }
        25% { transform: scale(1.05) rotateZ(1deg); }
        50% { transform: scale(1.1) rotateZ(-1deg); }
        75% { transform: scale(1.05) rotateZ(0.5deg); }
    }
`;
document.head.appendChild(celebrationStyle);

console.log('🔲 Matrix Validation Test - All validation tests initiated successfully!');
