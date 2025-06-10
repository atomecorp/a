


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



// Test d'ajout dynamique de connecteurs

