// Import des composants

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
        onMove: (module) => console.log(`📍 ${module.name} moved to (${module.config.x}, ${module.config.y})`),
        onConnect: (connection) => 
            console.log(`🔗 ${connection.from.module.name}.${connection.from.connector} → ${connection.to.module.name}.${connection.to.connector}`)
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
