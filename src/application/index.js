// Import du composant Module
import Module from '../a/components/Module.js';

console.log('🔧 Initialisation des Modules - Test de la syntaxe');

// Exemple 1: Création d'un module basique - Audio Mixer
const audioMixer = new Module({
    id: 'audio_mixer_01',
    name: 'Audio Mixer',
    attach: 'body',
    x: 100,
    y: 150,
    width: 200,
    height: 120,
    
    // Connecteurs d'entrée
    inputs: [
        { id: 'audio_in_1', name: 'Audio L', type: 'audio' },
        { id: 'audio_in_2', name: 'Audio R', type: 'audio' },
        { id: 'volume_ctrl', name: 'Volume', type: 'control' }
    ],
    
    // Connecteurs de sortie
    outputs: [
        { id: 'mixed_out', name: 'Mixed Output', type: 'audio' },
        { id: 'level_meter', name: 'Level', type: 'data' }
    ],
    
    // Style du module
    style: {
        backgroundColor: '#2c3e50',
        borderRadius: '8px',
        border: '2px solid #34495e',
        color: 'white'
    },
    
    // Style des connecteurs
    connectors: {
        input: {
            backgroundColor: '#e74c3c',
            size: 12,
            position: 'left'
        },
        output: {
            backgroundColor: '#27ae60',
            size: 12,
            position: 'right'
        }
    },
    
    // Callbacks
    callbacks: {
        onMove: (module, x, y) => console.log(`Module ${module.name} moved to ${x}, ${y}`),
        onConnect: (fromModule, fromConnector, toModule, toConnector) => 
            console.log(`Connected ${fromModule.name}.${fromConnector} to ${toModule.name}.${toConnector}`),
        onDisconnect: (connection) => console.log('Connection removed')
    }
});

// Exemple 2: Module synthétiseur
const synthesizer = new Module({
    id: 'synth_01',
    name: 'Synthesizer',
    x: 50, 
    y: 100,
    width: 180, 
    height: 100,
    outputs: [
        { id: 'osc_out', name: 'Oscillator', type: 'audio' },
        { id: 'freq_out', name: 'Frequency', type: 'control' }
    ],
    style: { 
        backgroundColor: '#8e44ad',
        color: 'white' 
    }
});

// Exemple 3: Module filtre
const filter = new Module({
    id: 'filter_01', 
    name: 'Low Pass Filter',
    x: 350, 
    y: 100,
    width: 160, 
    height: 120,
    inputs: [
        { id: 'audio_in', name: 'Audio In', type: 'audio' },
        { id: 'cutoff', name: 'Cutoff', type: 'control' }
    ],
    outputs: [
        { id: 'filtered_out', name: 'Filtered', type: 'audio' }
    ],
    style: { 
        backgroundColor: '#e67e22',
        color: 'white' 
    }
});

// Exemple 4: Module complexe avec configuration avancée
const complexModule = new Module({
    id: 'complex_processor',
    name: 'Audio Processor',
    x: 500, 
    y: 200,
    width: 250, 
    height: 180,
    
    inputs: [
        { id: 'main_in', name: 'Main Input', type: 'audio' },
        { id: 'aux_in', name: 'Aux Input', type: 'audio' }
    ],
    
    outputs: [
        { id: 'main_out', name: 'Main Output', type: 'audio' },
        { id: 'monitor_out', name: 'Monitor', type: 'audio' }
    ],
    
    // Types de connecteurs personnalisés
    connectorTypes: {
        audio: { color: '#e74c3c', shape: 'circle' },
        control: { color: '#3498db', shape: 'square' },
        data: { color: '#f39c12', shape: 'triangle' }
    },
    
    // Drag & Drop
    draggable: true,
    
    // Snap to grid
    grid: {
        enabled: true,
        size: 20
    },
    
    style: {
        backgroundColor: '#34495e',
        color: 'white'
    }
});

console.log('✅ Modules créés avec succès!');

// Test des fonctionnalités après création
setTimeout(() => {
    console.log('\n🔧 Test des fonctionnalités des modules...\n');
    
    // Test 1: Gestion des connecteurs
    console.log('📌 Test 1: Ajout/suppression de connecteurs');
    audioMixer.addInput({ id: 'new_input', name: 'New Input', type: 'audio' });
    audioMixer.addOutput({ id: 'new_output', name: 'New Output', type: 'data' });
    
    setTimeout(() => {
        audioMixer.removeInput('audio_in_1');
        console.log('✅ Test des connecteurs terminé');
    }, 1000);
    
    // Test 2: Connexions entre modules
    console.log('\n📌 Test 2: Connexions entre modules');
    const connection1 = synthesizer.connectTo(filter, 'osc_out', 'audio_in');
    const connection2 = filter.connectTo(audioMixer, 'filtered_out', 'audio_in_2');
    console.log('✅ Connexions créées');
    
    // Test 3: Déplacement des modules
    console.log('\n📌 Test 3: Déplacement des modules');
    setTimeout(() => {
        audioMixer.moveTo(300, 200);
        synthesizer.moveTo(100, 50);
        console.log('✅ Modules déplacés');
    }, 2000);
    
    // Test 4: Gestion de la position et du dragging
    console.log('\n📌 Test 4: Configuration du dragging');
    audioMixer.setDraggable(true);
    complexModule.setDraggable(false);
    console.log('✅ Configuration du dragging mise à jour');
    
    // Test 5: Informations sur les modules
    console.log('\n📌 Test 5: Informations sur les modules');
    setTimeout(() => {
        console.log('🔍 Connexions de audioMixer:', audioMixer.getConnections());
        console.log('🔍 Inputs de filter:', filter.getInputs());
        console.log('🔍 Outputs de synthesizer:', synthesizer.getOutputs());
        
        console.log('\n📊 Statistiques globales:');
        console.log('- Modules totaux:', Module.getAllModules().length);
        console.log('- Connexions totales:', Module.getAllConnections().length);
    }, 3000);
    
    // Test 6: Déconnexion (optionnel - après 10 secondes)
    setTimeout(() => {
        console.log('\n📌 Test 6: Déconnexion des modules');
        if (connection1) {
            synthesizer.disconnect(connection1);
            console.log('✅ Connexion synthé -> filtre supprimée');
        }
    }, 10000);
    
}, 1000);

// Interface utilisateur simple pour tester
setTimeout(() => {
    console.log('\n🎮 Interface de test disponible!');
    console.log('📝 Instructions:');
    console.log('  - Cliquez et glissez les modules pour les déplacer');
    console.log('  - Cliquez sur les connecteurs pour créer des connexions');
    console.log('  - Cliquez sur un connecteur de sortie puis sur un connecteur d\'entrée');
    console.log('  - Les connexions apparaissent comme des lignes bleues');
    console.log('  - Consultez la console pour les logs détaillés');
    
    // Ajouter des boutons de test
    const controlPanel = document.createElement('div');
    controlPanel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        z-index: 10000;
    `;
    
    controlPanel.innerHTML = `
        <h3>🔧 Module Control Panel</h3>
        <button id="addModule">➕ Add Module</button><br><br>
        <button id="clearAll">🗑️ Clear All</button><br><br>
        <button id="showInfo">📊 Show Info</button><br><br>
        <div id="moduleInfo" style="font-size: 12px; margin-top: 10px;"></div>
    `;
    
    // Styles pour les boutons
    controlPanel.querySelectorAll('button').forEach(btn => {
        btn.style.cssText = `
            background: #3498db;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 5px;
            cursor: pointer;
            width: 150px;
            margin: 2px 0;
        `;
    });
    
    document.body.appendChild(controlPanel);
    
    // Event handlers
    document.getElementById('addModule').addEventListener('click', () => {
        const newModule = new Module({
            id: `module_${Date.now()}`,
            name: `Module ${Module.getAllModules().length + 1}`,
            x: Math.random() * 400 + 50,
            y: Math.random() * 300 + 100,
            inputs: [{ id: 'in1', name: 'Input', type: 'audio' }],
            outputs: [{ id: 'out1', name: 'Output', type: 'audio' }],
            style: {
                backgroundColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
                color: 'white'
            }
        });
        console.log(`➕ Module ajouté: ${newModule.name}`);
    });
    
    document.getElementById('clearAll').addEventListener('click', () => {
        Module.clearAll();
        console.log('🗑️ Tous les modules supprimés');
    });
    
    document.getElementById('showInfo').addEventListener('click', () => {
        const info = document.getElementById('moduleInfo');
        info.innerHTML = `
            Modules: ${Module.getAllModules().length}<br>
            Connexions: ${Module.getAllConnections().length}<br>
            <small>Voir console pour détails</small>
        `;
        
        console.log('📊 État actuel des modules:');
        Module.getAllModules().forEach(module => {
            console.log(`  - ${module.name} (${module.inputs.length}→${module.outputs.length})`);
        });
    });
    
}, 2000);

// 🎯 Test spécifique du Drag & Drop des connecteurs
console.log('🎯 Configuration test Drag & Drop des connecteurs');

// Module source - Générateur de signal
const signalGenerator = new Module({
    id: 'signal_gen',
    name: 'Signal Generator',
    x: 50,
    y: 300,
    width: 180,
    height: 100,
    outputs: [
        { id: 'wave_out', name: 'Wave', type: 'audio' },
        { id: 'sync_out', name: 'Sync', type: 'control' }
    ],
    style: { backgroundColor: '#8e44ad' }
});

// Module cible - Filtre
const audioFilter = new Module({
    id: 'audio_filter',
    name: 'Audio Filter',
    x: 350,
    y: 300,
    width: 180,
    height: 120,
    inputs: [
        { id: 'audio_in', name: 'Audio In', type: 'audio' },
        { id: 'cutoff', name: 'Cutoff', type: 'control' }
    ],
    outputs: [
        { id: 'filtered_out', name: 'Filtered', type: 'audio' }
    ],
    style: { backgroundColor: '#2980b9' }
});

// Module analyseur - Destination
const analyzer = new Module({
    id: 'analyzer',
    name: 'Spectrum Analyzer',
    x: 600,
    y: 280,
    width: 200,
    height: 160,
    inputs: [
        { id: 'signal_in', name: 'Signal', type: 'audio' },
        { id: 'window_size', name: 'Window', type: 'data' },
        { id: 'resolution', name: 'Resolution', type: 'control' }
    ],
    outputs: [
        { id: 'spectrum_data', name: 'Spectrum', type: 'data' }
    ],
    style: { backgroundColor: '#27ae60' }
});

// Ajouter instructions visuelles sur la page
const instructions = document.createElement('div');
instructions.innerHTML = `
    <div style="
        position: fixed; 
        top: 10px; 
        left: 10px; 
        background: rgba(0,0,0,0.8); 
        color: white; 
        padding: 15px; 
        border-radius: 8px; 
        font-family: monospace; 
        z-index: 10001;
        max-width: 400px;
        font-size: 12px;
    ">
        <h3 style="margin: 0 0 10px 0; color: #3498db;">🎯 Tests Drag & Drop Connecteurs</h3>
        
        <h4 style="margin: 10px 0 5px 0; color: #e74c3c;">Méthode 1: Clic (existant)</h4>
        <div>• Clic sur connecteur de sortie → clic sur connecteur d'entrée</div>
        <div>• Clic sur connecteur connecté = déconnexion instantanée</div>
        
        <h4 style="margin: 10px 0 5px 0; color: #2ecc71;">Méthode 2: Drag & Drop (nouveau)</h4>
        <div>• <strong>Glisser</strong> depuis un connecteur vers un autre</div>
        <div>• <strong>Ligne verte</strong> suit la souris pendant le drag</div>
        <div>• <strong>Connecteurs valides</strong> s'illuminent en vert</div>
        <div>• <strong>Relâcher</strong> sur un connecteur valide = connexion</div>
        
        <h4 style="margin: 10px 0 5px 0; color: #f39c12;">Règles de validation</h4>
        <div>• Output → Input uniquement</div>
        <div>• Modules différents</div>
        <div>• Pas de connexion existante</div>
        
        <h4 style="margin: 10px 0 5px 0; color: #9b59b6;">Actions spéciales</h4>
        <div>• <strong>Clic droit</strong> ou <strong>Escape</strong> = annule la connexion</div>
        <div>• <strong>Clic long (600ms)</strong> sur module = menu contextuel</div>
        
        <div style="margin-top: 10px; padding: 5px; background: rgba(52, 73, 94, 0.5); border-radius: 4px;">
            <strong>🎮 Essayez:</strong> Connecter Signal Generator → Filter → Analyzer
        </div>
    </div>
`;

document.body.appendChild(instructions);

// Rendre les modules accessibles globalement pour debug
window.audioMixer = audioMixer;
window.synthesizer = synthesizer;
window.filter = filter;
window.complexModule = complexModule;
window.Module = Module;

console.log('\n🚀 Test du composant Module lancé!');
console.log('🔗 Variables globales disponibles: audioMixer, synthesizer, filter, complexModule, Module');