/**
 * 🔗 Module Web Component - Démonstration Système de Liaisons
 * 
 * Exemple complet montrant le nouveau système de liaisons entre modules :
 * - Click sur output + click sur input = liaison
 * - Click sur input + click sur output = liaison  
 * - Input vers plusieurs outputs (et vice versa)
 * - Click sur éléments déjà liés = suppression
 * - Drag & drop pour créer des liaisons
 * - API de gestion des connexions
 * 
 * @version 2.2.0 - SYSTÈME DE LIAISONS
 * @author Squirrel Framework Team
 */

import Module from '../../a/components/Module.js';

console.log('🔗 Démonstration Système de Liaisons - Démarrage...');

// Module 1: GÉNÉRATEUR AUDIO
const moduleGenerateur = new Module({
    id: 'generateur',
    name: 'Audio Generator',
    attach: 'body',
    x: 50,
    y: 50,
    width: 200,
    height: 140,
    
    inputs: [
        { id: 'freq_in', type: 'control', name: 'Frequency' },
        { id: 'amp_in', type: 'control', name: 'Amplitude' }
    ],
    
    outputs: [
        { id: 'audio_out', type: 'audio', name: 'Audio Out' },
        { id: 'level_out', type: 'data', name: 'Level Data' }
    ],
    
    containerStyle: {
        backgroundColor: '#e74c3c',
        border: '2px solid #c0392b',
        borderRadius: '12px',
        boxShadow: [
            '0 8px 20px rgba(231, 76, 60, 0.3)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.2)'
        ]
    },
    
    callbacks: {
        onConnectionCreate: (connection) => {
            console.log(`✅ Générateur connecté: ${connection.source.config.name} → ${connection.target.config.name}`);
        },
        onConnectionDelete: (connection) => {
            console.log(`❌ Générateur déconnecté: ${connection.source.config.name} ↔ ${connection.target.config.name}`);
        }
    }
});

// Module 2: PROCESSEUR D'EFFETS
const moduleEffet = new Module({
    id: 'effet',
    name: 'Audio Effects',
    attach: 'body',
    x: 350,
    y: 50,
    width: 200,
    height: 160,
    
    inputs: [
        { id: 'audio_in', type: 'audio', name: 'Audio In' },
        { id: 'reverb_in', type: 'control', name: 'Reverb' },
        { id: 'delay_in', type: 'control', name: 'Delay' }
    ],
    
    outputs: [
        { id: 'wet_out', type: 'audio', name: 'Wet Out' },
        { id: 'dry_out', type: 'audio', name: 'Dry Out' },
        { id: 'cpu_out', type: 'data', name: 'CPU Usage' }
    ],
    
    containerStyle: {
        backgroundColor: '#3498db',
        border: '2px solid #2980b9',
        borderRadius: '12px',
        boxShadow: [
            '0 8px 20px rgba(52, 152, 219, 0.3)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.2)'
        ]
    }
});

// Module 3: MIXEUR
const moduleMixeur = new Module({
    id: 'mixeur',
    name: 'Audio Mixer',
    attach: 'body',
    x: 650,
    y: 50,
    width: 200,
    height: 180,
    
    inputs: [
        { id: 'ch1_in', type: 'audio', name: 'Channel 1' },
        { id: 'ch2_in', type: 'audio', name: 'Channel 2' },
        { id: 'ch3_in', type: 'audio', name: 'Channel 3' },
        { id: 'volume_in', type: 'control', name: 'Master Vol' }
    ],
    
    outputs: [
        { id: 'master_out', type: 'audio', name: 'Master Out' },
        { id: 'monitor_out', type: 'data', name: 'Monitor' }
    ],
    
    containerStyle: {
        backgroundColor: '#27ae60',
        border: '2px solid #229954',
        borderRadius: '12px',
        boxShadow: [
            '0 8px 20px rgba(39, 174, 96, 0.3)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.2)'
        ]
    }
});

// Module 4: CONTRÔLEUR
const moduleControleur = new Module({
    id: 'controleur',
    name: 'Control Panel',
    attach: 'body',
    x: 200,
    y: 280,
    width: 200,
    height: 140,
    
    inputs: [
        { id: 'feedback_in', type: 'data', name: 'Feedback' }
    ],
    
    outputs: [
        { id: 'freq_out', type: 'control', name: 'Frequency' },
        { id: 'vol_out', type: 'control', name: 'Volume' },
        { id: 'fx_out', type: 'control', name: 'Effects' }
    ],
    
    containerStyle: {
        backgroundColor: '#9b59b6',
        border: '2px solid #8e44ad',
        borderRadius: '12px',
        boxShadow: [
            '0 8px 20px rgba(155, 89, 182, 0.3)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.2)'
        ]
    }
});

// Module 5: ANALYSEUR
const moduleAnalyseur = new Module({
    id: 'analyseur',
    name: 'Audio Analyzer',
    attach: 'body',
    x: 500,
    y: 280,
    width: 200,
    height: 120,
    
    inputs: [
        { id: 'signal_in', type: 'audio', name: 'Signal In' },
        { id: 'level_in', type: 'data', name: 'Level Data' }
    ],
    
    outputs: [
        { id: 'spectrum_out', type: 'data', name: 'Spectrum' },
        { id: 'peak_out', type: 'data', name: 'Peak Data' }
    ],
    
    containerStyle: {
        backgroundColor: '#f39c12',
        border: '2px solid #e67e22',
        borderRadius: '12px',
        boxShadow: [
            '0 8px 20px rgba(243, 156, 18, 0.3)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.2)'
        ]
    }
});

// Event listeners pour monitorer les connexions
const modules = [moduleGenerateur, moduleEffet, moduleMixeur, moduleControleur, moduleAnalyseur];

modules.forEach(module => {
    module.addEventListener('connectionCreated', (event) => {
        const { connection } = event.detail;
        console.log(`🔗 CONNEXION CRÉÉE: ${connection.source.module.name}.${connection.source.config.name} → ${connection.target.module.name}.${connection.target.config.name}`);
        updateConnectionDisplay();
    });
    
    module.addEventListener('connectionDeleted', (event) => {
        const { connection } = event.detail;
        console.log(`🗑️ CONNEXION SUPPRIMÉE: ${connection.source.module.name}.${connection.source.config.name} ↔ ${connection.target.module.name}.${connection.target.config.name}`);
        updateConnectionDisplay();
    });
    
    module.addEventListener('moduleClick', (event) => {
        console.log(`🖱️ Module cliqué: ${module.name}`);
        showModuleStats(module);
    });
});

// Interface de contrôle
const controlPanel = document.createElement('div');
controlPanel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    background: rgba(44, 62, 80, 0.95);
    border: 2px solid #3498db;
    border-radius: 12px;
    padding: 20px;
    color: #ecf0f1;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    backdrop-filter: blur(10px);
`;

controlPanel.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #3498db; text-align: center;">🔗 Panneau de Contrôle</h3>
    
    <div style="margin-bottom: 15px;">
        <h4 style="margin: 0 0 8px 0; color: #e74c3c;">🎮 Actions:</h4>
        <button id="autoConnect" style="margin: 2px; padding: 8px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Auto-Connect</button>
        <button id="disconnectAll" style="margin: 2px; padding: 8px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Disconnect All</button>
        <button id="showStats" style="margin: 2px; padding: 8px; background: #f39c12; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Show Stats</button>
        <button id="testDrag" style="margin: 2px; padding: 8px; background: #9b59b6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">Test Drag</button>
    </div>
    
    <div style="margin-bottom: 15px;">
        <h4 style="margin: 0 0 8px 0; color: #9b59b6;">📊 Connexions:</h4>
        <div id="connectionCount" style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; font-family: monospace;">0 connexions actives</div>
    </div>
    
    <div>
        <h4 style="margin: 0 0 8px 0; color: #3498db;">📋 Instructions:</h4>
        <ul style="margin: 0; padding-left: 15px; font-size: 10px; line-height: 1.4;">
            <li>Click output → input = liaison</li>
            <li>Click input → output = liaison</li>
            <li>Click éléments liés = suppression</li>
            <li>Drag connecteur = création liaison</li>
            <li>Click ligne = suppression</li>
            <li>Click module = voir stats</li>
        </ul>
    </div>
`;

document.body.appendChild(controlPanel);

// Fonctions du panneau de contrôle
document.getElementById('autoConnect').addEventListener('click', () => {
    console.log('🤖 Auto-connexion en cours...');
    
    // Connexions logiques pour une chaîne audio
    moduleGenerateur.connectTo(moduleEffet, 'audio_out', 'audio_in');
    moduleEffet.connectTo(moduleMixeur, 'wet_out', 'ch1_in');
    moduleEffet.connectTo(moduleMixeur, 'dry_out', 'ch2_in');
    moduleControleur.connectTo(moduleGenerateur, 'freq_out', 'freq_in');
    moduleControleur.connectTo(moduleGenerateur, 'vol_out', 'amp_in');
    moduleControleur.connectTo(moduleEffet, 'fx_out', 'reverb_in');
    moduleGenerateur.connectTo(moduleAnalyseur, 'audio_out', 'signal_in');
    moduleGenerateur.connectTo(moduleAnalyseur, 'level_out', 'level_in');
    moduleAnalyseur.connectTo(moduleControleur, 'peak_out', 'feedback_in');
    
    console.log('✅ Auto-connexion terminée !');
});

document.getElementById('disconnectAll').addEventListener('click', () => {
    console.log('🗑️ Suppression de toutes les connexions...');
    
    let totalDisconnected = 0;
    modules.forEach(module => {
        totalDisconnected += module.disconnectAll();
    });
    
    console.log(`✅ ${totalDisconnected} connexions supprimées !`);
});

document.getElementById('showStats').addEventListener('click', () => {
    console.log('\n📊 STATISTIQUES GLOBALES:');
    console.log('========================');
    
    modules.forEach(module => {
        const stats = module.getConnectionStats();
        console.log(`🔧 ${module.name}:`);
        console.log(`   - Connexions totales: ${stats.total}`);
        console.log(`   - Entrées connectées: ${stats.inputs}/${stats.inputConnectors}`);
        console.log(`   - Sorties connectées: ${stats.outputs}/${stats.outputConnectors}`);
    });
    
    console.log(`\n🌐 Total connexions système: ${Module.connections.size}`);
    console.log(`🔧 Total modules: ${Module.modules.size}`);
});

document.getElementById('testDrag').addEventListener('click', () => {
    console.log('🧪 Lancement du test de drag...');
    Module.testDragConnection();
});

function updateConnectionDisplay() {
    const connectionCount = Module.connections.size;
    const display = document.getElementById('connectionCount');
    if (display) {
        display.textContent = `${connectionCount} connexion${connectionCount !== 1 ? 's' : ''} active${connectionCount !== 1 ? 's' : ''}`;
        display.style.background = connectionCount > 0 ? 'rgba(39, 174, 96, 0.2)' : 'rgba(0,0,0,0.2)';
    }
}

function showModuleStats(module) {
    const stats = module.getConnectionStats();
    console.log(`\n📊 STATS ${module.name.toUpperCase()}:`);
    console.log(`   🔗 Connexions: ${stats.total}`);
    console.log(`   ⬇️ Entrées: ${stats.inputs}/${stats.inputConnectors}`);
    console.log(`   ⬆️ Sorties: ${stats.outputs}/${stats.outputConnectors}`);
    
    // Afficher les modules connectés
    const connectedModules = new Set();
    modules.forEach(otherModule => {
        if (otherModule !== module && module.isConnectedTo(otherModule)) {
            connectedModules.add(otherModule.name);
        }
    });
    
    if (connectedModules.size > 0) {
        console.log(`   🤝 Connecté à: ${Array.from(connectedModules).join(', ')}`);
    } else {
        console.log(`   🚫 Aucune connexion`);
    }
}

// Messages informatifs
console.log('\n🎯 SYSTÈME DE LIAISONS PRÊT !');
console.log('===============================');
console.log('📍 5 modules créés avec connecteurs typés');
console.log('🔗 Système de liaisons complet implémenté');
console.log('🎮 Panneau de contrôle disponible (coin supérieur droit)');
console.log('\n💡 TESTEZ LES FONCTIONNALITÉS:');
console.log('   1. Click output → input (création liaison)');
console.log('   2. Click input → output (création liaison)');
console.log('   3. Click éléments déjà liés (suppression)');
console.log('   4. Drag connecteur vers autre connecteur');
console.log('   5. Click sur ligne de connexion (suppression)');
console.log('   6. Drag modules (lignes suivent automatiquement)');
console.log('   7. Utilisez les boutons du panneau de contrôle');

// Initial display update
updateConnectionDisplay();
