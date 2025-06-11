/**
 * 🔧 Module Web Component - Test Simple
 * 
 * Test minimal pour valider le fonctionnement des Modules Web Components
 * avec effets bombé et animations de taille.
 */

// Import du Module Web Component
import Module from '../../a/components/Module.js';

console.log('🔧 Test Module Web Component - Démarrage...');

// Test 1: Module simple avec effet relief
const testModule1 = new Module({
    id: 'test-module-1',
    name: 'Test Module Simple',
    attach: 'body',
    x: 350,
    y: 50,
    width: 200,
    height: 120,
    
    inputs: [
        { id: 'test_in', type: 'audio', name: 'Test In' }
    ],
    
    outputs: [
        { id: 'test_out', type: 'audio', name: 'Test Out' }
    ],
    
    // Style avec effet bombé basique
    containerStyle: {
        backgroundColor: '#34495e',
        border: '2px solid #3498db',
        borderRadius: '12px',
        boxShadow: [
            '0 8px 24px rgba(0, 0, 0, 0.15)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.1)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.2)'
        ],
        background: 'linear-gradient(145deg, #3498db 0%, #2980b9 50%, #34495e 100%)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    
    // Animation au survol
    moduleHoverStyle: {
        transform: 'scale(1.05) translateY(-2px)',
        boxShadow: [
            '0 12px 32px rgba(0, 0, 0, 0.2)',
            '0 0 16px rgba(52, 152, 219, 0.3)',
            'inset 0 2px 6px rgba(255, 255, 255, 0.15)',
            'inset 0 -2px 6px rgba(0, 0, 0, 0.25)'
        ]
    },
    
    connectorConfig: {
        size: 14,
        hoverStyle: {
            transform: 'scale(1.4) translateZ(0)',
            boxShadow: [
                '0 4px 12px rgba(0, 0, 0, 0.3)',
                '0 0 8px rgba(255, 255, 255, 0.6)'
            ]
        }
    }
});

// Test 2: Module avec connecteurs multiples
const testModule2 = new Module({
    id: 'test-module-2',
    name: 'Test Multi-Connecteurs',
    attach: 'body',
    x: 600,
    y: 200,
    width: 220,
    height: 140,
    
    inputs: [
        { id: 'audio_in', type: 'audio', name: 'Audio' },
        { id: 'control_in', type: 'control', name: 'Control' },
        { id: 'data_in', type: 'data', name: 'Data' }
    ],
    
    outputs: [
        { id: 'audio_out', type: 'audio', name: 'Audio' },
        { id: 'midi_out', type: 'midi', name: 'MIDI' }
    ],
    
    containerStyle: {
        backgroundColor: '#2c3e50',
        border: '2px solid #e74c3c',
        borderRadius: '16px',
        boxShadow: [
            '0 10px 28px rgba(231, 76, 60, 0.2)',
            '0 6px 16px rgba(0, 0, 0, 0.15)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.08)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.25)'
        ],
        background: 'linear-gradient(145deg, #e74c3c 0%, #c0392b 50%, #2c3e50 100%)'
    },
    
    moduleHoverStyle: {
        transform: 'scale(1.04) translateY(-3px) rotateZ(0.3deg)',
        boxShadow: [
            '0 15px 40px rgba(231, 76, 60, 0.25)',
            '0 8px 20px rgba(0, 0, 0, 0.2)',
            'inset 0 3px 6px rgba(255, 255, 255, 0.12)',
            'inset 0 -3px 6px rgba(0, 0, 0, 0.3)'
        ]
    }
});

// Test des événements
testModule1.addEventListener('moduleClick', (event) => {
    console.log('✅ Module 1 cliqué:', event.detail);
});

testModule2.addEventListener('moduleMouseEnter', (event) => {
    console.log('🎯 Module 2 survol:', event.detail);
});

testModule1.addEventListener('connectorClick', (event) => {
    console.log('🔌 Connecteur cliqué:', event.detail);
});

// Test des connexions
testModule1.addEventListener('connectionStart', (event) => {
    console.log('🔗 Connexion démarrée:', event.detail);
});

console.log('✅ Tests Module Web Component initialisés');
console.log('🎯 Modules créés:', {
    module1: testModule1.id,
    module2: testModule2.id
});

// Validation des fonctionnalités
setTimeout(() => {
    console.log('🔍 Validation des modules:');
    console.log('- Module 1 position:', testModule1.getPosition());
    console.log('- Module 2 connecteurs:', {
        inputs: testModule2.inputs.length,
        outputs: testModule2.outputs.length
    });
    console.log('- Registry modules:', Module.modules.size);
}, 1000);
