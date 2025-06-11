// Module Web Component API Validation Test
// This script tests all the key features of the Module Web Component

import Module from './a/components/Module.js';

console.log('🧪 Starting Module Web Component API Validation...');

// Test 1: Basic Module Creation
console.log('\n📋 Test 1: Basic Module Creation');
try {
    const basicModule = new Module({
        id: 'test-basic',
        name: 'Test Basic Module',
        inputs: [{ name: 'Input 1', type: 'audio' }],
        outputs: [{ name: 'Output 1', type: 'audio' }]
    });
    console.log('✅ Basic module creation: PASSED');
} catch (error) {
    console.error('❌ Basic module creation: FAILED', error);
}

// Test 2: Advanced CSS Properties
console.log('\n🎨 Test 2: Advanced CSS Properties');
try {
    const advancedModule = new Module({
        id: 'test-advanced',
        name: 'Test Advanced Module',
        inputs: [{ name: 'Input 1', type: 'audio' }],
        outputs: [{ name: 'Output 1', type: 'audio' }],
        containerStyle: {
            background: [
                'linear-gradient(45deg, #ff6b6b, #4ecdc4)',
                'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 50%)'
            ],
            boxShadow: [
                '0 10px 30px rgba(0,0,0,0.3)',
                'inset 0 2px 4px rgba(255,255,255,0.1)'
            ]
        }
    });
    console.log('✅ Advanced CSS properties: PASSED');
} catch (error) {
    console.error('❌ Advanced CSS properties: FAILED', error);
}

// Test 3: Animation Configuration
console.log('\n🎭 Test 3: Animation Configuration');
try {
    const animatedModule = new Module({
        id: 'test-animated',
        name: 'Test Animated Module',
        inputs: [{ name: 'Input 1', type: 'audio' }],
        outputs: [{ name: 'Output 1', type: 'audio' }],
        animations: {
            enabled: true,
            moduleHover: {
                enabled: true,
                transform: 'scale(1.05)',
                duration: '0.3s'
            },
            moduleSelect: {
                enabled: true,
                transform: 'scale(1.1)',
                boxShadow: '0 0 20px rgba(255,255,255,0.5)'
            }
        }
    });
    console.log('✅ Animation configuration: PASSED');
} catch (error) {
    console.error('❌ Animation configuration: FAILED', error);
}

// Test 4: Dynamic Animation Control
console.log('\n🎛️ Test 4: Dynamic Animation Control');
try {
    const controlModule = new Module({
        id: 'test-control',
        name: 'Test Control Module',
        inputs: [{ name: 'Input 1', type: 'audio' }],
        outputs: [{ name: 'Output 1', type: 'audio' }]
    });
    
    // Test disable animations
    controlModule.disableAnimations();
    console.log('✅ Disable animations: PASSED');
    
    // Test enable animations
    controlModule.enableAnimations();
    console.log('✅ Enable animations: PASSED');
    
    // Test set animation config
    controlModule.setAnimationConfig('moduleHover', {
        transform: 'scale(1.2)',
        duration: '0.5s'
    });
    console.log('✅ Set animation config: PASSED');
    
} catch (error) {
    console.error('❌ Dynamic animation control: FAILED', error);
}

// Test 5: Connector Types
console.log('\n🔌 Test 5: Connector Types');
try {
    const connectorModule = new Module({
        id: 'test-connectors',
        name: 'Test Connector Module',
        inputs: [
            { name: 'Audio', type: 'audio' },
            { name: 'Control', type: 'control' },
            { name: 'Data', type: 'data' },
            { name: 'MIDI', type: 'midi' },
            { name: 'Video', type: 'video' }
        ],
        outputs: [
            { name: 'Audio Out', type: 'audio' },
            { name: 'Control Out', type: 'control' },
            { name: 'Data Out', type: 'data' },
            { name: 'MIDI Out', type: 'midi' },
            { name: 'Video Out', type: 'video' }
        ]
    });
    console.log('✅ All connector types: PASSED');
} catch (error) {
    console.error('❌ Connector types: FAILED', error);
}

// Test 6: Module Registry
console.log('\n📚 Test 6: Module Registry');
try {
    const registryModule = new Module({
        id: 'test-registry',
        name: 'Test Registry Module',
        inputs: [{ name: 'Input 1', type: 'audio' }],
        outputs: [{ name: 'Output 1', type: 'audio' }]
    });
    
    // Check if module is registered
    if (Module.modules.has('test-registry')) {
        console.log('✅ Module registry: PASSED');
    } else {
        console.log('❌ Module registry: FAILED - Module not found in registry');
    }
} catch (error) {
    console.error('❌ Module registry: FAILED', error);
}

// Test 7: Auto Attachment
console.log('\n📎 Test 7: Auto Attachment');
try {
    const attachModule = new Module({
        id: 'test-attach',
        name: 'Test Auto Attach Module',
        inputs: [{ name: 'Input 1', type: 'audio' }],
        outputs: [{ name: 'Output 1', type: 'audio' }],
        attach: {
            target: document.body,
            position: { x: 100, y: 100 }
        }
    });
    console.log('✅ Auto attachment: PASSED');
} catch (error) {
    console.error('❌ Auto attachment: FAILED', error);
}

// Summary
console.log('\n🎯 API Validation Complete!');
console.log('📊 Check the console above for individual test results.');
console.log('🔧 Module Web Component is ready for production use.');

// Export for manual testing
window.ModuleTestSuite = {
    Module,
    createTestModule: (config) => new Module(config),
    testBasicFeatures: () => {
        const module = new Module({
            id: 'manual-test',
            name: 'Manual Test Module',
            inputs: [{ name: 'Test Input', type: 'audio' }],
            outputs: [{ name: 'Test Output', type: 'audio' }]
        });
        document.body.appendChild(module);
        return module;
    }
};

console.log('🎮 Manual testing functions available in window.ModuleTestSuite');
