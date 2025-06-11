/**
 * 🔧 Module Web Component - Test de Validation Final
 * 
 * Test pour valider que les animations configurables fonctionnent correctement
 * et qu'il n'y a plus d'erreurs.
 * 
 * @version 2.1.0 - VALIDATION FINALE
 */

// Import du Module avec animations configurables
import Module from '../../a/components/Module.js';

console.log('🧪 VALIDATION FINALE - Module avec Animations Configurables');

// Test 1: Module sans aucune animation
const testStatique = new Module({
    id: 'validation-statique',
    name: 'Test Statique',
    attach: 'body',
    x: 850,
    y: 50,
    width: 160,
    height: 100,
    
    animations: {
        enabled: false  // Aucune animation
    },
    
    inputs: [
        { id: 'test_in', type: 'audio', name: 'In' }
    ],
    
    outputs: [
        { id: 'test_out', type: 'audio', name: 'Out' }
    ],
    
    containerStyle: {
        backgroundColor: '#95a5a6',
        border: '1px solid #7f8c8d',
        borderRadius: '8px',
        color: '#2c3e50'
    }
});

// Test 2: Module avec animations custom
const testAnimé = new Module({
    id: 'validation-anime',
    name: 'Test Animé',
    attach: 'body',
    x: 850,
    y: 180,
    width: 160,
    height: 100,
    
    animations: {
        enabled: true,
        moduleHover: {
            enabled: true,
            transform: 'scale(1.1) rotateZ(2deg)',
            duration: '0.4s',
            timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        },
        connectorHover: {
            enabled: true,
            transform: 'scale(1.5)',
            duration: '0.3s'
        }
    },
    
    inputs: [
        { id: 'test_in2', type: 'control', name: 'Control' }
    ],
    
    outputs: [
        { id: 'test_out2', type: 'control', name: 'Output' }
    ],
    
    containerStyle: {
        backgroundColor: '#27ae60',
        border: '2px solid #2ecc71',
        borderRadius: '10px',
        color: '#fff'
    }
});

// Test 3: Contrôle dynamique
const testDynamique = new Module({
    id: 'validation-dynamique',
    name: 'Test Dynamique',
    attach: 'body',
    x: 850,
    y: 310,
    width: 160,
    height: 100,
    
    inputs: [
        { id: 'test_in3', type: 'data', name: 'Data' }
    ],
    
    outputs: [
        { id: 'test_out3', type: 'data', name: 'Result' }
    ],
    
    containerStyle: {
        backgroundColor: '#e74c3c',
        border: '2px solid #c0392b',
        borderRadius: '10px',
        color: '#fff'
    }
});

// Tests de l'API
console.log('🔬 Tests API:');
console.log('- Module statique animations:', testStatique.config.animations.enabled);
console.log('- Module animé animations:', testAnimé.config.animations.enabled);
console.log('- Module dynamique animations:', testDynamique.config.animations.enabled);

// Test de contrôle dynamique
setTimeout(() => {
    console.log('⚡ Test désactivation animations...');
    testDynamique.disableAnimations();
    console.log('- Animations désactivées:', !testDynamique.config.animations.enabled);
    
    setTimeout(() => {
        console.log('⚡ Test réactivation animations...');
        testDynamique.enableAnimations();
        console.log('- Animations réactivées:', testDynamique.config.animations.enabled);
        
        // Test modification animation
        testDynamique.setAnimationConfig('moduleHover', {
            transform: 'scale(1.2) rotateZ(10deg)',
            duration: '0.6s'
        });
        console.log('- Animation modifiée');
        
    }, 2000);
}, 2000);

// Events pour validation
testStatique.addEventListener('moduleClick', () => {
    console.log('🖱️ Module statique cliqué - Animation état:', testStatique.config.animations.enabled);
});

testAnimé.addEventListener('moduleClick', () => {
    console.log('🖱️ Module animé cliqué - Animation état:', testAnimé.config.animations.enabled);
});

testDynamique.addEventListener('moduleClick', () => {
    console.log('🖱️ Module dynamique cliqué - Animation état:', testDynamique.config.animations.enabled);
});

console.log('✅ VALIDATION TERMINÉE - 3 modules de test créés');
console.log('🎯 Cliquez sur les modules de droite pour tester les événements');
console.log('⏰ Contrôles dynamiques dans 2 et 4 secondes...');
