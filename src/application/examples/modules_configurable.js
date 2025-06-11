/**
 * 🔧 Module Web Component - Démonstrations Animations Configurables
 * 
 * Exemples montrant comment les animations peuvent être définies et appliquées
 * lors de la création des modules, ou désactivées complètement.
 * 
 * @version 2.1.0 - ANIMATIONS CONFIGURABLES
 * @author Squirrel Framework Team
 */

// Import du nouveau Module avec animations configurables
import Module from '../../a/components/Module.js';

console.log('🎬 Démonstrations Animations Configurables - Démarrage...');

// Module 1: SANS ANIMATIONS - Complètement statique
const moduleStatique = new Module({
    id: 'module-statique',
    name: 'Module Statique',
    attach: 'body',
    x: 50,
    y: 50,
    width: 200,
    height: 120,
    
    inputs: [
        { id: 'static_in', type: 'audio', name: 'Audio In' }
    ],
    
    outputs: [
        { id: 'static_out', type: 'audio', name: 'Audio Out' }
    ],
    
    // ANIMATIONS COMPLÈTEMENT DÉSACTIVÉES
    animations: {
        enabled: false  // Pas d'animations du tout !
    },
    
    containerStyle: {
        backgroundColor: '#34495e',
        border: '2px solid #7f8c8d',
        borderRadius: '8px',
        boxShadow: [
            '0 4px 8px rgba(0, 0, 0, 0.1)'
        ]
    }
});

// Module 2: ANIMATIONS PARTIELLES - Seulement certaines activées
const modulePartiel = new Module({
    id: 'module-partiel',
    name: 'Module Partielles',
    attach: 'body',
    x: 300,
    y: 50,
    width: 220,
    height: 140,
    
    inputs: [
        { id: 'partial_audio', type: 'audio', name: 'Audio' },
        { id: 'partial_control', type: 'control', name: 'Control' }
    ],
    
    outputs: [
        { id: 'partial_out', type: 'audio', name: 'Output' }
    ],
    
    // ANIMATIONS PARTIELLES - Seulement hover module et connecteurs
    animations: {
        enabled: true,
        duration: '0.4s',
        timing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        
        moduleHover: {
            enabled: true,  // ✅ Activé
            transform: 'scale(1.03) translateY(-3px)',
            duration: '0.4s',
            boxShadow: [
                '0 8px 20px rgba(0, 0, 0, 0.15)',
                'inset 0 2px 4px rgba(255, 255, 255, 0.1)'
            ]
        },
        
        moduleSelected: {
            enabled: false,  // ❌ Désactivé
        },
        
        moduleDrag: {
            enabled: false,  // ❌ Désactivé
        },
        
        connectorHover: {
            enabled: true,  // ✅ Activé
            transform: 'scale(1.4)',
            duration: '0.3s',
            timing: 'ease-out'
        },
        
        connectorActive: {
            enabled: false,  // ❌ Désactivé
        }
    },
    
    containerStyle: {
        backgroundColor: '#2c3e50',
        border: '2px solid #e67e22',
        borderRadius: '12px',
        boxShadow: [
            '0 6px 16px rgba(230, 126, 34, 0.2)',
            'inset 0 1px 2px rgba(255, 255, 255, 0.05)'
        ]
    }
});

// Module 3: ANIMATIONS PERSONNALISÉES - Avec timings et transformations custom
const moduleCustom = new Module({
    id: 'module-custom',
    name: 'Module Custom',
    attach: 'body',
    x: 570,
    y: 50,
    width: 240,
    height: 160,
    
    inputs: [
        { id: 'custom_audio', type: 'audio', name: 'Audio In' },
        { id: 'custom_midi', type: 'midi', name: 'MIDI In' },
        { id: 'custom_data', type: 'data', name: 'Data In' }
    ],
    
    outputs: [
        { id: 'custom_audio_out', type: 'audio', name: 'Audio Out' },
        { id: 'custom_analysis', type: 'data', name: 'Analysis' }
    ],
    
    // ANIMATIONS ULTRA PERSONNALISÉES
    animations: {
        enabled: true,
        duration: '0.6s',
        timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Bounce effect
        
        moduleHover: {
            enabled: true,
            transform: 'scale(1.08) rotateZ(1deg) translateY(-6px)',  // Rotation + échelle + élévation
            duration: '0.6s',
            timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            boxShadow: [
                '0 20px 40px rgba(52, 152, 219, 0.3)',
                '0 10px 20px rgba(0, 0, 0, 0.2)',
                'inset 0 4px 8px rgba(255, 255, 255, 0.2)',
                'inset 0 -4px 8px rgba(0, 0, 0, 0.3)'
            ]
        },
        
        moduleSelected: {
            enabled: true,
            transform: 'scale(1.12) rotateZ(-1deg)',  // Plus gros + rotation inverse
            duration: '0.8s',
            timing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            boxShadow: [
                '0 25px 50px rgba(155, 89, 182, 0.4)',
                '0 15px 30px rgba(0, 0, 0, 0.3)',
                'inset 0 6px 12px rgba(255, 255, 255, 0.3)'
            ]
        },
        
        moduleDrag: {
            enabled: true,
            transform: 'scale(1.15) rotateZ(3deg) translateZ(0)',  // Encore plus gros
            duration: '0.3s',
            timing: 'ease-out',
            boxShadow: [
                '0 30px 60px rgba(0, 0, 0, 0.4)',
                '0 20px 40px rgba(0, 0, 0, 0.3)',
                'inset 0 8px 16px rgba(255, 255, 255, 0.4)'
            ]
        },
        
        connectorHover: {
            enabled: true,
            transform: 'scale(1.8) rotateZ(360deg)',  // Grande échelle + rotation complète
            duration: '0.5s',
            timing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            boxShadow: [
                '0 8px 24px rgba(0, 0, 0, 0.4)',
                '0 0 20px rgba(255, 255, 255, 0.8)',
                'inset 0 3px 6px rgba(255, 255, 255, 0.5)'
            ]
        },
        
        connectorActive: {
            enabled: true,
            transform: 'scale(2.0) pulse',  // Échelle maximale
            duration: '0.4s',
            timing: 'ease-in-out',
            boxShadow: [
                '0 12px 30px rgba(0, 0, 0, 0.5)',
                '0 0 30px rgba(255, 255, 255, 1)',
                'inset 0 4px 8px rgba(255, 255, 255, 0.6)'
            ]
        }
    },
    
    containerStyle: {
        backgroundColor: '#1a252f',
        border: '3px solid #9b59b6',
        borderRadius: '16px',
        background: `
            linear-gradient(145deg, #9b59b6 0%, #8e44ad 30%, #1a252f 100%),
            radial-gradient(ellipse at top right, rgba(155, 89, 182, 0.1) 0%, transparent 70%)
        `,
        boxShadow: [
            '0 12px 28px rgba(155, 89, 182, 0.3)',
            '0 6px 14px rgba(0, 0, 0, 0.2)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.1)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.3)'
        ]
    },
    
    headerStyle: {
        color: '#e8b4ff',
        fontSize: '14px',
        fontWeight: '700',
        textShadow: '0 0 8px rgba(155, 89, 182, 0.8)'
    }
});

// Module 4: ANIMATIONS MINIMALES - Très subtiles
const moduleMinimal = new Module({
    id: 'module-minimal',
    name: 'Module Minimal',
    attach: 'body',
    x: 50,
    y: 230,
    width: 180,
    height: 100,
    
    inputs: [
        { id: 'minimal_in', type: 'data', name: 'Data' }
    ],
    
    outputs: [
        { id: 'minimal_out', type: 'data', name: 'Output' }
    ],
    
    // ANIMATIONS TRÈS SUBTILES
    animations: {
        enabled: true,
        duration: '0.2s',
        timing: 'ease',
        
        moduleHover: {
            enabled: true,
            transform: 'scale(1.01)',  // Très petite échelle
            duration: '0.2s',
            timing: 'ease',
            boxShadow: [
                '0 4px 8px rgba(0, 0, 0, 0.1)'
            ]
        },
        
        moduleSelected: {
            enabled: true,
            transform: 'scale(1.02)',  // Très petite échelle
            duration: '0.3s',
            timing: 'ease'
        },
        
        moduleDrag: {
            enabled: false,  // Pas d'animation de drag
        },
        
        connectorHover: {
            enabled: true,
            transform: 'scale(1.1)',  // Petite échelle
            duration: '0.2s',
            timing: 'ease'
        },
        
        connectorActive: {
            enabled: false,  // Pas d'animation active
        }
    },
    
    containerStyle: {
        backgroundColor: '#ecf0f1',
        border: '1px solid #bdc3c7',
        borderRadius: '6px',
        color: '#2c3e50',
        boxShadow: [
            '0 2px 4px rgba(0, 0, 0, 0.05)'
        ]
    },
    
    headerStyle: {
        backgroundColor: 'rgba(52, 73, 94, 0.05)',
        color: '#2c3e50',
        fontSize: '12px',
        fontWeight: '500'
    }
});

// Module 5: CONTRÔLE DYNAMIQUE - Animations activables/désactivables en temps réel
const moduleDynamique = new Module({
    id: 'module-dynamique',
    name: 'Module Dynamique',
    attach: 'body',
    x: 300,
    y: 230,
    width: 260,
    height: 140,
    
    inputs: [
        { id: 'dynamic_control', type: 'control', name: 'Control' }
    ],
    
    outputs: [
        { id: 'dynamic_out', type: 'control', name: 'Output' }
    ],
    
    // Configuration par défaut avec animations
    animations: {
        enabled: true,
        moduleHover: {
            enabled: true,
            transform: 'scale(1.04) translateY(-2px)',
            duration: '0.3s'
        },
        connectorHover: {
            enabled: true,
            transform: 'scale(1.3)',
            duration: '0.3s'
        }
    },
    
    containerStyle: {
        backgroundColor: '#27ae60',
        border: '2px solid #2ecc71',
        borderRadius: '10px',
        boxShadow: [
            '0 6px 16px rgba(46, 204, 113, 0.2)'
        ]
    },
    
    headerStyle: {
        color: '#fff',
        fontSize: '13px',
        fontWeight: '600'
    }
});

// Démonstration du contrôle dynamique des animations
setTimeout(() => {
    console.log('🎛️ Test contrôle dynamique des animations...');
    
    // Désactiver toutes les animations après 3 secondes
    setTimeout(() => {
        console.log('🚫 Désactivation des animations du module dynamique');
        moduleDynamique.disableAnimations();
    }, 3000);
    
    // Réactiver avec nouvelles configurations après 6 secondes
    setTimeout(() => {
        console.log('🎬 Réactivation avec nouvelles animations');
        moduleDynamique.enableAnimations();
        
        // Modifier les configurations d'animation
        moduleDynamique.setAnimationConfig('moduleHover', {
            transform: 'scale(1.1) rotateZ(5deg)',
            duration: '0.5s',
            timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        });
        
        moduleDynamique.setAnimationConfig('connectorHover', {
            transform: 'scale(2.0) rotateZ(180deg)',
            duration: '0.6s'
        });
    }, 6000);
    
}, 1000);

// Logs informatifs
console.log('✅ Modules créés avec différentes configurations d\'animation:');
console.log('📍 Module Statique (x:50)  - AUCUNE animation');
console.log('📍 Module Partiel (x:300)  - Animations PARTIELLES (hover seulement)');
console.log('📍 Module Custom (x:570)   - Animations ULTRA personnalisées');
console.log('📍 Module Minimal (x:50)   - Animations très SUBTILES');
console.log('📍 Module Dynamique (x:300) - Contrôle EN TEMPS RÉEL');

// Event listeners pour démonstration
moduleStatique.addEventListener('moduleClick', () => {
    console.log('🖱️ Module statique cliqué - PAS d\'animation');
});

modulePartiel.addEventListener('moduleClick', () => {
    console.log('🖱️ Module partiel cliqué - Animation hover seulement');
});

moduleCustom.addEventListener('moduleClick', () => {
    console.log('🖱️ Module custom cliqué - Animations personnalisées');
});

moduleDynamique.addEventListener('moduleClick', () => {
    console.log('🖱️ Module dynamique cliqué - État animation:', moduleDynamique.config.animations.enabled);
});

console.log('🎯 Survolez et cliquez sur les modules pour voir les différences d\'animation !');
console.log('⏰ Le module dynamique changera d\'animation automatiquement dans 3 et 6 secondes...');
