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

// import Module from '../../a/components/Module.js';

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
