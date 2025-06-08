// Import des composants
import Module from '../../a/components/Module.js';
import Matrix from '../../a/components/Matrix.js';

console.log('🔧 Initialisation des modules et matrices de test...');

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

// ========================================
// 🔲 EXEMPLES D'UTILISATION DES MATRICES
// ========================================

console.log('🔲 Création des exemples de matrices...');

// Exemple 1: Matrix de contrôle audio (pad controller)
const audioControlMatrix = new Matrix({
    id: 'audio_control_pad',
    attach: 'body',
    grid: {
        x: 4,
        y: 4
    },
    position: {
        x: 800,
        y: 50
    },
    size: {
        width: '300px',
        height: '300px'
    },
    spacing: {
        horizontal: 4,
        vertical: 4,
        mode: 'gap',       // Mode CSS Gap avec espacement régulier
        uniform: true,     // Espacement uniforme
        outer: 2          // Padding externe du container
    },
    cellStyle: {
        backgroundColor: '#2c3e50',
        border: '2px solid #34495e',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        color: '#ecf0f1',
        fontWeight: 'bold'
    },
    cellHoverStyle: {
        backgroundColor: '#3498db',
        transform: 'scale(1.1)',
        boxShadow: '0 4px 15px rgba(52, 152, 219, 0.4)'
    },
    cellSelectedStyle: {
        backgroundColor: '#e74c3c',
        border: '3px solid #c0392b',
        boxShadow: '0 0 20px rgba(231, 76, 60, 0.6)'
    },
    callbacks: {
        onClick: (cellId, x, y, cell) => {
            console.log(`🎵 Audio Pad: ${cellId} triggered at (${x}, ${y})`);
            // Simuler un trigger audio
            const note = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][x - 1] || 'C';
            const octave = y + 3;
            console.log(`♪ Playing ${note}${octave}`);
        },
        onDoubleClick: (cellId, x, y, cell) => {
            console.log(`🎵 Audio Pad: Recording ${cellId}`);
            audioControlMatrix.selectCell(x, y);
        },
        onLongClick: (cellId, x, y, cell) => {
            console.log(`🎵 Audio Pad: Settings for ${cellId}`);
            // Changer la couleur pour indiquer un mode spécial
            const colors = ['#9b59b6', '#f39c12', '#27ae60', '#e67e22'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            audioControlMatrix.setCellStyle(x, y, { backgroundColor: randomColor });
        }
    }
});

// Exemple 2: Matrix responsive pour interface de mixage
const mixerMatrix = new Matrix({
    id: 'mixer_interface',
    attach: 'body',
    grid: {
        x: 8,
        y: 3
    },
    position: {
        x: 800,
        y: 380
    },
    size: {
        width: '60%',  // Responsive
        height: '25%'  // Responsive
    },
    spacing: {
        horizontal: 2,
        vertical: 2,
        mode: 'margin',    // Mode margin pour espacement plus précis
        uniform: false,    // Espacement différencié horizontal/vertical
        outer: 1          // Padding externe minimal
    },
    cellStyle: {
        backgroundColor: '#95a5a6',
        border: '1px solid #7f8c8d',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '9px',
        color: 'white',
        fontWeight: 'normal'
    },
    cellHoverStyle: {
        backgroundColor: '#f39c12',
        transform: 'scale(1.05)'
    },
    cellSelectedStyle: {
        backgroundColor: '#27ae60',
        border: '2px solid #229954'
    },
    callbacks: {
        onClick: (cellId, x, y, cell) => {
            const controls = ['Vol', 'Pan', 'EQ', 'FX', 'Mute', 'Solo', 'Rec', 'Mon'];
            const channel = x;
            const control = controls[y - 1] || 'Unknown';
            console.log(`🎚️ Mixer: Ch${channel} ${control} - ${cellId}`);
        },
        onDoubleClick: (cellId, x, y, cell) => {
            console.log(`🎚️ Mixer: Reset ${cellId}`);
            mixerMatrix.deselectCell(x, y);
        },
        onResize: (matrix, newWidth, newHeight) => {
            console.log(`🎚️ Mixer interface resized: ${Math.round(newWidth)}x${Math.round(newHeight)}px`);
        }
    }
});

// Exemple 3: Matrix de séquenceur (step sequencer)
const sequencerMatrix = new Matrix({
    id: 'step_sequencer',
    attach: 'body',
    grid: {
        x: 16,  // 16 steps
        y: 8    // 8 tracks
    },
    position: {
        x: 50,
        y: 500
    },
    size: {
        width: '700px',
        height: '250px'
    },
    spacing: {
        horizontal: 1,
        vertical: 1,
        mode: 'border',    // Mode border pour espacement minimal précis
        uniform: true,     // Espacement uniforme pour le séquenceur
        outer: 0          // Pas d'espacement externe
    },
    cellStyle: {
        backgroundColor: '#34495e',
        border: '1px solid #2c3e50',
        borderRadius: '2px',
        cursor: 'pointer',
        transition: 'all 0.1s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '8px',
        color: '#bdc3c7'
    },
    cellHoverStyle: {
        backgroundColor: '#f39c12',
        transform: 'scale(1.1)'
    },
    cellSelectedStyle: {
        backgroundColor: '#e74c3c',
        border: '1px solid #c0392b',
        boxShadow: 'inset 0 0 5px rgba(0,0,0,0.5)'
    },
    callbacks: {
        onClick: (cellId, x, y, cell) => {
            const tracks = ['Kick', 'Snare', 'HiHat', 'OpenHat', 'Clap', 'Crash', 'Tom', 'Perc'];
            const track = tracks[y - 1] || `Track${y}`;
            const step = x;
            
            if (cell.selected) {
                sequencerMatrix.deselectCell(x, y);
                console.log(`🥁 Sequencer: ${track} step ${step} OFF`);
            } else {
                sequencerMatrix.selectCell(x, y);
                console.log(`🥁 Sequencer: ${track} step ${step} ON`);
            }
        },
        onDoubleClick: (cellId, x, y, cell) => {
            console.log(`🥁 Sequencer: Velocity edit for ${cellId}`);
            // Double-click pour éditer la vélocité
            const velocities = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
            const randomVelocity = velocities[Math.floor(Math.random() * velocities.length)];
            sequencerMatrix.setCellStyle(x, y, { backgroundColor: randomVelocity });
        },
        onLongClick: (cellId, x, y, cell) => {
            console.log(`🥁 Sequencer: Clear column ${x}`);
            // Long click pour effacer toute la colonne
            for (let row = 1; row <= sequencerMatrix.config.grid.y; row++) {
                sequencerMatrix.deselectCell(x, row);
            }
        }
    }
});

// Démonstration des fonctionnalités de Matrix
setTimeout(() => {
    console.log('🔲 Test des fonctionnalités Matrix...');
    
    // Test sélection aléatoire sur le séquenceur
    for (let i = 0; i < 10; i++) {
        const x = Math.ceil(Math.random() * 16);
        const y = Math.ceil(Math.random() * 8);
        sequencerMatrix.selectCell(x, y);
    }
    
    // Test du mixer
    mixerMatrix.selectCell(1, 1); // Channel 1 Volume
    mixerMatrix.selectCell(2, 1); // Channel 2 Volume
    mixerMatrix.selectCell(1, 5); // Channel 1 Mute
    
    console.log(`🔲 Matrices créées et testées!`);
    console.log(`   🎵 Audio Control Pad: ${audioControlMatrix.config.grid.x}x${audioControlMatrix.config.grid.y}`);
    console.log(`   🎚️ Mixer Interface: ${mixerMatrix.config.grid.x}x${mixerMatrix.config.grid.y} (responsive)`);
    console.log(`   🥁 Step Sequencer: ${sequencerMatrix.config.grid.x}x${sequencerMatrix.config.grid.y}`);
    
}, 3000);

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
        <h3 style="margin: 0 0 10px 0;">🔧 Module & Matrix Controls</h3>
        
        <div style="border-bottom: 1px solid #555; padding-bottom: 10px; margin-bottom: 10px;">
            <strong>📦 Modules:</strong>
            <div>
                <button id="add-module-btn" style="margin: 2px; padding: 5px 10px; font-size: 11px;">Add Random Module</button>
            </div>
            <div>
                <button id="clear-modules-btn" style="margin: 2px; padding: 5px 10px; font-size: 11px;">Clear Modules</button>
            </div>
        </div>
        
        <div style="border-bottom: 1px solid #555; padding-bottom: 10px; margin-bottom: 10px;">
            <strong>🔲 Matrices:</strong>
            <div>
                <button id="clear-sequencer-btn" style="margin: 2px; padding: 5px 8px; font-size: 10px;">Clear Sequencer</button>
            </div>
            <div>
                <button id="random-sequence-btn" style="margin: 2px; padding: 5px 8px; font-size: 10px;">Random Sequence</button>
            </div>
            <div>
                <button id="resize-mixer-btn" style="margin: 2px; padding: 5px 8px; font-size: 10px;">Resize Mixer</button>
            </div>
            <div>
                <button id="clear-all-btn" style="margin: 2px; padding: 5px 10px; font-size: 11px; background: #e74c3c;">Clear Everything</button>
            </div>
        </div>
        
        <div style="border-bottom: 1px solid #555; padding-bottom: 10px; margin-bottom: 10px;">
            <strong>📏 Espacement Matrices:</strong>
            <div style="font-size: 10px; margin-bottom: 5px;">
                <label>Mode: </label>
                <select id="spacing-mode-select" style="font-size: 9px; width: 70px;">
                    <option value="gap">Gap</option>
                    <option value="margin">Margin</option>
                    <option value="border">Border</option>
                    <option value="padding">Padding</option>
                </select>
            </div>
            <div style="font-size: 10px; margin-bottom: 3px;">
                <label>H: </label>
                <input type="range" id="spacing-h" min="0" max="10" value="2" style="width: 60px;">
                <span id="spacing-h-val">2</span>px
            </div>
            <div style="font-size: 10px; margin-bottom: 5px;">
                <label>V: </label>
                <input type="range" id="spacing-v" min="0" max="10" value="2" style="width: 60px;">
                <span id="spacing-v-val">2</span>px
            </div>
            <div>
                <button id="apply-spacing-btn" style="margin: 1px; padding: 3px 8px; font-size: 9px;">Apply Spacing</button>
                <button id="test-spacing-btn" style="margin: 1px; padding: 3px 8px; font-size: 9px;">Test Page</button>
            </div>
        </div>
        
        <div style="font-size: 10px;">
            <div><strong>📦 Modules:</strong></div>
            <div>🖱️ Drag headers to move</div>
            <div>🔗 Click connectors to connect</div>
            <div>🎯 Click modules to select</div>
            <br>
            <div><strong>🔲 Matrices:</strong></div>
            <div>🖱️ Click: Select/trigger</div>
            <div>🖱️🖱️ Double-click: Toggle/edit</div>
            <div>⏱️ Long-click: Special actions</div>
        </div>
    `;
    
    document.body.appendChild(ui);
    
    // Add event handlers pour les modules
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
    
    document.getElementById('clear-modules-btn').addEventListener('click', () => {
        Module.clearAll();
        console.log('📦 Tous les modules supprimés');
    });
    
    // Event handlers pour les matrices
    document.getElementById('clear-sequencer-btn').addEventListener('click', () => {
        if (window.sequencerMatrix) {
            sequencerMatrix.deselectAll();
            console.log('🥁 Séquenceur effacé');
        }
    });
    
    document.getElementById('random-sequence-btn').addEventListener('click', () => {
        if (window.sequencerMatrix) {
            // Effacer d'abord
            sequencerMatrix.deselectAll();
            
            // Créer une séquence aléatoire
            for (let i = 0; i < 20; i++) {
                const x = Math.ceil(Math.random() * sequencerMatrix.config.grid.x);
                const y = Math.ceil(Math.random() * sequencerMatrix.config.grid.y);
                sequencerMatrix.selectCell(x, y);
            }
            console.log('🥁 Séquence aléatoire générée');
        }
    });
    
    document.getElementById('resize-mixer-btn').addEventListener('click', () => {
        if (window.mixerMatrix) {
            const sizes = [
                { width: '40%', height: '20%' },
                { width: '70%', height: '30%' },
                { width: '50%', height: '25%' },
                { width: '80%', height: '35%' }
            ];
            const randomSize = sizes[Math.floor(Math.random() * sizes.length)];
            mixerMatrix.resize(randomSize);
            console.log(`🎚️ Mixer redimensionné: ${randomSize.width} x ${randomSize.height}`);
        }
    });
    
    document.getElementById('clear-all-btn').addEventListener('click', () => {
        Module.clearAll();
        Matrix.clearAll();
        console.log('🗑️ Tout supprimé (modules et matrices)');
    });
    
    // Event handlers pour l'espacement des matrices
    document.getElementById('spacing-h').addEventListener('input', (e) => {
        document.getElementById('spacing-h-val').textContent = e.target.value;
    });
    
    document.getElementById('spacing-v').addEventListener('input', (e) => {
        document.getElementById('spacing-v-val').textContent = e.target.value;
    });
    
    document.getElementById('apply-spacing-btn').addEventListener('click', () => {
        const mode = document.getElementById('spacing-mode-select').value;
        const horizontal = parseInt(document.getElementById('spacing-h').value);
        const vertical = parseInt(document.getElementById('spacing-v').value);
        
        const newSpacing = {
            horizontal: horizontal,
            vertical: vertical,
            mode: mode,
            uniform: mode === 'border' || mode === 'gap',
            outer: mode === 'margin' ? 1 : 0
        };
        
        // Appliquer à toutes les matrices
        if (window.audioControlMatrix) {
            audioControlMatrix.setSpacing(newSpacing);
        }
        if (window.mixerMatrix) {
            mixerMatrix.setSpacing(newSpacing);
        }
        if (window.sequencerMatrix) {
            sequencerMatrix.setSpacing(newSpacing);
        }
        
        console.log(`📏 Espacement appliqué: ${mode} ${horizontal}x${vertical}px`);
    });
    
    document.getElementById('test-spacing-btn').addEventListener('click', () => {
        window.open('test-spacing-matrix.html', '_blank');
    });

    // Rendre les matrices accessibles globalement pour les contrôles
    window.audioControlMatrix = audioControlMatrix;
    window.mixerMatrix = mixerMatrix;
    window.sequencerMatrix = sequencerMatrix;
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
