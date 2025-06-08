// Import du composant Module
import Module from '../../a/components/Module.js';

console.log('🔧 Initialisation des modules de test...');

// Exemple 1: Module Synthétiseur
const synthesizer = new Module({
    id: 'synth_01',
    name: 'Synthesizer',
    x: 50,
    y: 100,
    width: 180,
    height: 140,
    
    outputs: [
        { id: 'osc_out', name: 'Oscillator', type: 'audio' },
        { id: 'freq_out', name: 'Frequency', type: 'control' },
        { id: 'amp_out', name: 'Amplitude', type: 'control' }
    ],
    
    style: {
        backgroundColor: '#8e44ad',
        borderColor: '#9b59b6'
    },
    
    callbacks: {
        onMove: (module, x, y) => console.log(`📍 ${module.name} moved to (${x}, ${y})`),
        onConnect: (fromModule, fromConnector, toModule, toConnector) => 
            console.log(`🔗 ${fromModule.name}.${fromConnector} → ${toModule.name}.${toConnector}`)
    }
});

// Exemple 2: Module Filtre
const filter = new Module({
    id: 'filter_01',
    name: 'Low Pass Filter',
    x: 300,
    y: 100,
    width: 160,
    height: 160,
    
    inputs: [
        { id: 'audio_in', name: 'Audio In', type: 'audio' },
        { id: 'cutoff', name: 'Cutoff', type: 'control' },
        { id: 'resonance', name: 'Resonance', type: 'control' }
    ],
    
    outputs: [
        { id: 'filtered_out', name: 'Filtered', type: 'audio' },
        { id: 'env_out', name: 'Envelope', type: 'data' }
    ],
    
    style: {
        backgroundColor: '#e67e22',
        borderColor: '#f39c12'
    }
});

// Exemple 3: Module Mélangeur
const mixer = new Module({
    id: 'mixer_01',
    name: 'Audio Mixer',
    x: 550,
    y: 100,
    width: 200,
    height: 180,
    
    inputs: [
        { id: 'ch1_in', name: 'Channel 1', type: 'audio' },
        { id: 'ch2_in', name: 'Channel 2', type: 'audio' },
        { id: 'ch3_in', name: 'Channel 3', type: 'audio' },
        { id: 'master_vol', name: 'Master Vol', type: 'control' }
    ],
    
    outputs: [
        { id: 'mixed_out', name: 'Mixed Output', type: 'audio' },
        { id: 'level_meter', name: 'Level Meter', type: 'data' }
    ],
    
    style: {
        backgroundColor: '#27ae60',
        borderColor: '#2ecc71'
    },
    
    connectors: {
        input: {
            backgroundColor: '#e74c3c',
            size: 14
        },
        output: {
            backgroundColor: '#f39c12',
            size: 14
        }
    }
});

// Exemple 4: Module Effet
const reverb = new Module({
    id: 'reverb_01',
    name: 'Reverb Effect',
    x: 300,
    y: 320,
    width: 180,
    height: 140,
    
    inputs: [
        { id: 'dry_in', name: 'Dry Signal', type: 'audio' },
        { id: 'room_size', name: 'Room Size', type: 'control' },
        { id: 'wet_level', name: 'Wet Level', type: 'control' }
    ],
    
    outputs: [
        { id: 'wet_out', name: 'Wet Output', type: 'audio' }
    ],
    
    style: {
        backgroundColor: '#3498db',
        borderColor: '#5dade2'
    },
    
    connectorTypes: {
        audio: { color: '#e74c3c', shape: 'circle' },
        control: { color: '#f1c40f', shape: 'square' },
        data: { color: '#9b59b6', shape: 'triangle' }
    }
});

// Exemple 5: Module Analyseur
const analyzer = new Module({
    id: 'analyzer_01',
    name: 'Spectrum Analyzer',
    x: 50,
    y: 320,
    width: 200,
    height: 100,
    
    inputs: [
        { id: 'signal_in', name: 'Signal', type: 'audio' }
    ],
    
    outputs: [
        { id: 'fft_data', name: 'FFT Data', type: 'data' },
        { id: 'peak_freq', name: 'Peak Freq', type: 'data' }
    ],
    
    style: {
        backgroundColor: '#34495e',
        borderColor: '#7f8c8d'
    },
    
    grid: {
        enabled: true,
        size: 25
    }
});

// Test des connexions automatiques
setTimeout(() => {
    console.log('🔗 Test des connexions automatiques...');
    
    // Connecter le synthétiseur au filtre
    const connection1 = synthesizer.connectTo(filter, 'osc_out', 'audio_in');
    console.log(`✅ Connexion créée: ${connection1}`);
    
    // Connecter le filtre au mélangeur
    const connection2 = filter.connectTo(mixer, 'filtered_out', 'ch1_in');
    console.log(`✅ Connexion créée: ${connection2}`);
    
    // Connecter le mélangeur à l'effet reverb
    const connection3 = mixer.connectTo(reverb, 'mixed_out', 'dry_in');
    console.log(`✅ Connexion créée: ${connection3}`);
    
    // Connecter l'analyseur
    const connection4 = mixer.connectTo(analyzer, 'mixed_out', 'signal_in');
    console.log(`✅ Connexion créée: ${connection4}`);
    
}, 2000);

// Test d'ajout dynamique de connecteurs
setTimeout(() => {
    console.log('➕ Test d\'ajout de connecteurs...');
    
    // Ajouter un nouveau connecteur au synthétiseur
    synthesizer.addOutput({
        id: 'lfo_out',
        name: 'LFO',
        type: 'control'
    });
    
    // Ajouter un connecteur au filtre
    filter.addInput({
        id: 'mod_input',
        name: 'Modulation',
        type: 'control'
    });
    
    // Connecter le nouveau LFO à la modulation
    setTimeout(() => {
        const connection5 = synthesizer.connectTo(filter, 'lfo_out', 'mod_input');
        console.log(`✅ Nouvelle connexion: ${connection5}`);
    }, 500);
    
}, 4000);

// Test de sélection et d'informations
setTimeout(() => {
    console.log('📊 Informations sur les modules:');
    
    const allModules = Module.getAllModules();
    console.log(`📦 Nombre total de modules: ${allModules.length}`);
    
    allModules.forEach(module => {
        console.log(`🔧 ${module.name}:`);
        console.log(`   - Entrées: ${module.getInputs().length}`);
        console.log(`   - Sorties: ${module.getOutputs().length}`);
        console.log(`   - Connexions: ${module.getConnections().length}`);
    });
    
    const allConnections = Module.getAllConnections();
    console.log(`🔗 Nombre total de connexions: ${allConnections.length}`);
    
}, 6000);

// Interface utilisateur simple
const createUI = () => {
    const ui = document.createElement('div');
    ui.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: Roboto, sans-serif;
        font-size: 12px;
        z-index: 2000;
        min-width: 200px;
    `;
    
    ui.innerHTML = `
        <h3 style="margin: 0 0 10px 0;">🔧 Module Controls</h3>
        <div>
            <button id="add-module-btn" style="margin: 2px; padding: 5px 10px;">Add Random Module</button>
        </div>
        <div>
            <button id="clear-all-btn" style="margin: 2px; padding: 5px 10px;">Clear All</button>
        </div>
        <div style="margin-top: 10px; font-size: 10px;">
            <div>🖱️ Drag headers to move</div>
            <div>🔗 Click connectors to connect</div>
            <div>🎯 Click modules to select</div>
        </div>
    `;
    
    document.body.appendChild(ui);
    
    // Add event handlers
    document.getElementById('add-module-btn').addEventListener('click', () => {
        const types = ['Oscillator', 'Filter', 'Amplifier', 'Delay', 'Compressor'];
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];
        
        const randomType = types[Math.floor(Math.random() * types.length)];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        new Module({
            id: `module_${Date.now()}`,
            name: randomType,
            x: 100 + Math.random() * 400,
            y: 100 + Math.random() * 300,
            width: 150 + Math.random() * 100,
            height: 100 + Math.random() * 80,
            
            inputs: [
                { id: `in_${Date.now()}`, name: 'Input', type: 'audio' }
            ],
            outputs: [
                { id: `out_${Date.now()}`, name: 'Output', type: 'audio' }
            ],
            
            style: {
                backgroundColor: randomColor
            }
        });
    });
    
    document.getElementById('clear-all-btn').addEventListener('click', () => {
        Module.clearAll();
    });
};

// Créer l'interface après un délai
setTimeout(createUI, 1000);

console.log('🎛️ Modules de démonstration créés!');
console.log('📋 Modules disponibles:');
console.log('   🎵 Synthesizer - Générateur de son');
console.log('   🔽 Low Pass Filter - Filtre passe-bas');
console.log('   🎚️ Audio Mixer - Mélangeur audio');
console.log('   🌊 Reverb Effect - Effet de réverbération');
console.log('   📊 Spectrum Analyzer - Analyseur de spectre');
console.log('');
console.log('💡 Instructions:');
console.log('   - Glissez les en-têtes pour déplacer les modules');
console.log('   - Cliquez sur les connecteurs pour les relier');
console.log('   - Cliquez sur les modules pour les sélectionner');
