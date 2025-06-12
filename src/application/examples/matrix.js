


// ========================================
// 🔲 EXEMPLES AVEC LE MATRIX WEB COMPONENT
// ========================================

console.log('🔲 Test du Matrix Web Component...');

// Importer le composant
// import Matrix from '../../a/components/Matrix.js';

// Attendre que le DOM soit prêt
document.addEventListener('DOMContentLoaded', () => {
    createMatrixExamples();
});

function createMatrixExamples() {
    console.log('🚀 Création des matrices avec Web Components...');
    
    // Matrix 1: Audio Control avec borderRadius 89px
    const audioMatrix = document.createElement('squirrel-matrix');
    audioMatrix.setAttribute('id', 'audio-control');
    audioMatrix.setAttribute('grid-x', '4');
    audioMatrix.setAttribute('grid-y', '4');
    audioMatrix.setAttribute('width', '300px');
    audioMatrix.setAttribute('height', '300px');
    audioMatrix.style.position = 'absolute';
    audioMatrix.style.left = '50px';
    audioMatrix.style.top = '50px';
    
    // Configuration après création
    audioMatrix.configure({
        cellStyle: {
            backgroundColor: '#2c3e50',
            border: '2px solid #34495e',
            borderRadius: '89px', // ← TEST PRINCIPAL
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            color: '#ecf0f1',
            fontWeight: 'bold'
        },
        cellHoverStyle: {
            backgroundColor: '#3498db',
            transform: 'scale(1.05)',
            boxShadow: '0 4px 15px rgba(52, 152, 219, 0.4)'
        },
        callbacks: {
            onClick: (cellId, x, y, cell) => {
                console.log(`🎵 Audio: ${x+1},${y+1}`);
                cell.textContent = '♪';
            }
        }
    });
    
    document.body.appendChild(audioMatrix);
    
    // Matrix 2: Mixer Interface
    const mixerMatrix = document.createElement('squirrel-matrix');
    mixerMatrix.setAttribute('id', 'mixer');
    mixerMatrix.setAttribute('grid-x', '6');
    mixerMatrix.setAttribute('grid-y', '3');
    mixerMatrix.setAttribute('width', '350px');
    mixerMatrix.setAttribute('height', '180px');
    mixerMatrix.style.position = 'absolute';
    mixerMatrix.style.left = '400px';
    mixerMatrix.style.top = '50px';
    
    mixerMatrix.configure({
        cellStyle: {
            backgroundColor: '#95a5a6',
            border: '1px solid #7f8c8d',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: 'white',
            fontSize: '10px'
        },
        cellHoverStyle: {
            backgroundColor: '#f39c12',
            transform: 'scale(1.03)'
        },
        callbacks: {
            onClick: (cellId, x, y, cell) => {
                console.log(`🎚️ Mixer: ${x+1},${y+1}`);
                cell.textContent = `M${x+1}`;
            }
        }
    });
    
    document.body.appendChild(mixerMatrix);
    
    // Matrix 3: Step Sequencer
    const sequencerMatrix = document.createElement('squirrel-matrix');
    sequencerMatrix.setAttribute('id', 'sequencer');
    sequencerMatrix.setAttribute('grid-x', '8');
    sequencerMatrix.setAttribute('grid-y', '4');
    sequencerMatrix.setAttribute('width', '500px');
    sequencerMatrix.setAttribute('height', '200px');
    sequencerMatrix.style.position = 'absolute';
    sequencerMatrix.style.left = '50px';
    sequencerMatrix.style.top = '300px';
    
    sequencerMatrix.configure({
        cellStyle: {
            backgroundColor: '#34495e',
            border: '1px solid #2c3e50',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: '#bdc3c7',
            fontSize: '10px'
        },
        cellHoverStyle: {
            backgroundColor: '#f39c12',
            transform: 'scale(1.05)'
        },
        callbacks: {
            onClick: (cellId, x, y, cell) => {
                console.log(`🥁 Step: ${x+1},${y+1}`);
                const isActive = cell.textContent === '●';
                cell.textContent = isActive ? '' : '●';
            }
        }
    });
    
    document.body.appendChild(sequencerMatrix);
    
    // Test automatique du borderRadius après 1 seconde
    setTimeout(() => {
        testBorderRadius();
    }, 1000);
    
    console.log('✅ Web Components créés!');
}

function testBorderRadius() {
    console.log('🔍 Test du borderRadius 89px...');
    
    const audioMatrix = document.getElementById('audio-control');
    if (audioMatrix && audioMatrix.shadowRoot) {
        const cells = audioMatrix.shadowRoot.querySelectorAll('.matrix-cell');
        if (cells.length > 0) {
            const firstCell = cells[0];
            const computedStyle = window.getComputedStyle(firstCell);
            
            console.log(`📊 Border Radius détecté: ${computedStyle.borderRadius}`);
            console.log(`📊 Background Color: ${computedStyle.backgroundColor}`);
            
            if (computedStyle.borderRadius.includes('89px')) {
                console.log('🎯 SUCCESS: BorderRadius 89px correctement appliqué!');
            } else {
                console.log('❌ PROBLÈME: BorderRadius non appliqué correctement');
            }
        }
    }
}

