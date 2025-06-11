/**
 * 🔲 Matrix Web Component - Démonstrations Avancées
 * 
 * Exemples avec effets bombé, animations avancées et interactions sophistiquées
 * 
 * @version 2.0.0
 * @author Squirrel Framework Team
 */

// Matrix 1: Style Glassmorphism avec effets bombé subtils
const glassmorphismMatrix = new Matrix({
    id: 'matrix-glassmorphism',
    attach: 'body',
    x: 50,
    y: 50,
    grid: { x: 4, y: 4 },
    size: { width: 320, height: 320 },
    spacing: { horizontal: 6, vertical: 6, outer: 12 },
    
    containerStyle: {
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '20px',
        padding: '20px',
        backdropFilter: 'blur(20px)',
        webkitBackdropFilter: 'blur(20px)',
        // Effets bombé glassmorphism
        boxShadow: [
            '0 8px 32px rgba(31, 38, 135, 0.37)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.5)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.1)'
        ],
        background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.15) 100%)',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    },
    
    cellStyle: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        borderRadius: '16px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        webkitBackdropFilter: 'blur(10px)',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        // Effet bombé glass subtil
        boxShadow: [
            '0 4px 16px rgba(31, 38, 135, 0.2)',
            'inset 0 1px 2px rgba(255, 255, 255, 0.4)',
            'inset 0 -1px 2px rgba(0, 0, 0, 0.05)'
        ],
        background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.1) 100%)'
    },
    
    cellHoverStyle: {
        backgroundColor: 'rgba(79, 172, 254, 0.3)',
        borderColor: 'rgba(79, 172, 254, 0.5)',
        color: '#ffffff',
        transform: 'scale(1.08) translateZ(10px)',
        // Effet bombé renforcé au survol
        boxShadow: [
            '0 12px 32px rgba(79, 172, 254, 0.4)',
            '0 6px 16px rgba(79, 172, 254, 0.2)',
            'inset 0 2px 6px rgba(255, 255, 255, 0.6)',
            'inset 0 -2px 6px rgba(79, 172, 254, 0.2)'
        ],
        background: 'linear-gradient(145deg, rgba(79, 172, 254, 0.4) 0%, rgba(79, 172, 254, 0.2) 100%)'
    },
    
    cellSelectedStyle: {
        backgroundColor: 'rgba(79, 172, 254, 0.6)',
        borderColor: 'rgba(79, 172, 254, 0.8)',
        color: '#ffffff',
        transform: 'scale(1.12) translateZ(15px)',
        // Effet bombé sélectionné intense
        boxShadow: [
            '0 20px 40px rgba(79, 172, 254, 0.5)',
            '0 8px 20px rgba(79, 172, 254, 0.3)',
            'inset 0 3px 8px rgba(255, 255, 255, 0.7)',
            'inset 0 -3px 8px rgba(79, 172, 254, 0.3)'
        ],
        background: 'linear-gradient(145deg, rgba(79, 172, 254, 0.7) 0%, rgba(79, 172, 254, 0.5) 100%)'
    },
    
    cellActiveStyle: {
        transform: 'scale(1.15) translateZ(20px)',
        boxShadow: [
            '0 24px 48px rgba(79, 172, 254, 0.6)',
            'inset 0 4px 12px rgba(255, 255, 255, 0.8)',
            'inset 0 -4px 12px rgba(79, 172, 254, 0.4)'
        ]
    },
    
    animations: {
        cellHover: {
            duration: '0.4s',
            easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        },
        cellSelect: {
            duration: '0.5s',
            easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        }
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            console.log(`🔲 Glassmorphism Matrix - Clicked: (${x}, ${y})`);
            
            // Effet shimmer sur click
            cell.style.background = 'linear-gradient(145deg, rgba(255, 255, 255, 0.8) 0%, rgba(79, 172, 254, 0.6) 50%, rgba(255, 255, 255, 0.8) 100%)';
            setTimeout(() => {
                cell.style.background = '';
            }, 600);
        },
        
        onCellHover: (cell, x, y, cellId) => {
            // Effet de halo sur les cellules adjacentes
            document.querySelectorAll('#matrix-glassmorphism .matrix-cell').forEach(otherCell => {
                const [otherX, otherY] = otherCell.dataset.position.split(',').map(Number);
                const distance = Math.abs(x - otherX) + Math.abs(y - otherY);
                
                if (distance === 1) {
                    otherCell.style.boxShadow = '0 6px 20px rgba(79, 172, 254, 0.2), inset 0 1px 3px rgba(255, 255, 255, 0.3)';
                }
            });
        },
        
        onCellLeave: () => {
            // Reset des effets de halo
            document.querySelectorAll('#matrix-glassmorphism .matrix-cell').forEach(cell => {
                if (!cell.classList.contains('selected') && !cell.matches(':hover')) {
                    cell.style.boxShadow = '';
                }
            });
        }
    }
});

// Matrix 2: Style Gaming avec effets néon et animations pulsantes
const gamingMatrix = new Matrix({
    id: 'matrix-gaming',
    attach: 'body',
    x: 420,
    y: 50,
    grid: { x: 5, y: 5 },
    size: { width: 350, height: 350 },
    spacing: { horizontal: 4, vertical: 4, outer: 16 },
    
    containerStyle: {
        backgroundColor: '#0a0a0a',
        border: '2px solid #00ff41',
        borderRadius: '12px',
        padding: '16px',
        // Effets bombé gaming avec néon
        boxShadow: [
            '0 0 30px rgba(0, 255, 65, 0.5)',        // Glow externe
            '0 12px 24px rgba(0, 0, 0, 0.8)',         // Ombre profonde
            'inset 0 2px 4px rgba(0, 255, 65, 0.3)',  // Highlight néon
            'inset 0 -2px 4px rgba(0, 0, 0, 0.5)'     // Ombre interne
        ],
        background: `
            linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%),
            repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                rgba(0, 255, 65, 0.03) 2px,
                rgba(0, 255, 65, 0.03) 4px
            )
        `,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        animation: 'containerPulse 3s ease-in-out infinite'
    },
    
    cellStyle: {
        backgroundColor: '#1a1a1a',
        border: '1px solid #00ff41',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: '600',
        color: '#00ff41',
        fontFamily: '"JetBrains Mono", monospace',
        textShadow: '0 0 8px rgba(0, 255, 65, 0.8)',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        // Effet bombé cyberpunk
        boxShadow: [
            '0 4px 12px rgba(0, 255, 65, 0.2)',
            'inset 0 1px 2px rgba(0, 255, 65, 0.4)',
            'inset 0 -1px 2px rgba(0, 0, 0, 0.6)'
        ],
        background: 'linear-gradient(145deg, #1a1a1a 0%, #2a2a2a 100%)',
        position: 'relative',
        overflow: 'hidden'
    },
    
    cellHoverStyle: {
        backgroundColor: '#2a4d3a',
        borderColor: '#00ff88',
        color: '#ffffff',
        textShadow: '0 0 12px rgba(0, 255, 136, 1)',
        transform: 'scale(1.1) translateZ(0)',
        // Effet bombé hover intense
        boxShadow: [
            '0 0 25px rgba(0, 255, 136, 0.6)',
            '0 8px 20px rgba(0, 255, 136, 0.3)',
            'inset 0 2px 6px rgba(0, 255, 136, 0.5)',
            'inset 0 -2px 6px rgba(0, 0, 0, 0.7)'
        ],
        background: 'linear-gradient(145deg, #2a4d3a 0%, #1a3d2a 100%)',
        animation: 'neonPulse 0.6s ease-in-out'
    },
    
    cellSelectedStyle: {
        backgroundColor: '#ff4757',
        borderColor: '#ff3742',
        color: '#ffffff',
        textShadow: '0 0 15px rgba(255, 71, 87, 1)',
        transform: 'scale(1.15) translateZ(0)',
        // Effet bombé sélection explosive
        boxShadow: [
            '0 0 35px rgba(255, 71, 87, 0.8)',
            '0 12px 30px rgba(255, 71, 87, 0.4)',
            'inset 0 3px 8px rgba(255, 255, 255, 0.4)',
            'inset 0 -3px 8px rgba(255, 71, 87, 0.6)'
        ],
        background: 'linear-gradient(145deg, #ff4757 0%, #ff3742 50%, #e84057 100%)',
        animation: 'explosiveSelect 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
    },
    
    cellActiveStyle: {
        transform: 'scale(1.2) rotateZ(1deg) translateZ(0)',
        boxShadow: [
            '0 0 40px rgba(255, 71, 87, 1)',
            'inset 0 4px 12px rgba(255, 255, 255, 0.6)'
        ],
        filter: 'brightness(1.3) saturate(1.2)'
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            console.log(`🎮 Gaming Matrix - Clicked: (${x}, ${y})`);
            
            // Effet de scan cyberpunk
            const scanner = document.createElement('div');
            scanner.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: linear-gradient(90deg, transparent, #00ff41, transparent);
                animation: scanEffect 0.5s ease-out;
                pointer-events: none;
            `;
            cell.appendChild(scanner);
            setTimeout(() => scanner.remove(), 500);
        },
        
        onCellDoubleClick: (cell, x, y, cellId) => {
            // Effet glitch sur double click
            cell.style.animation = 'glitchEffect 0.6s ease-in-out';
            setTimeout(() => {
                cell.style.animation = '';
            }, 600);
        },
        
        onCellLongClick: (cell, x, y, cellId) => {
            // Hack effect
            const originalText = cell.textContent;
            const hackChars = '!@#$%^&*()_+[]{}|;:,.<>?';
            let iterations = 0;
            
            const hackInterval = setInterval(() => {
                cell.textContent = Array.from(originalText)
                    .map((char, index) => {
                        if (index < iterations) return originalText[index];
                        return hackChars[Math.floor(Math.random() * hackChars.length)];
                    })
                    .join('');
                
                if (iterations >= originalText.length) {
                    clearInterval(hackInterval);
                }
                iterations += 1 / 3;
            }, 30);
        }
    }
});

// Matrix 3: Style Material Design avec transitions fluides
const materialMatrix = new Matrix({
    id: 'matrix-material',
    attach: 'body',
    x: 820,
    y: 50,
    grid: { x: 3, y: 4 },
    size: { width: 280, height: 350 },
    spacing: { horizontal: 8, vertical: 8, outer: 20 },
    
    containerStyle: {
        backgroundColor: '#ffffff',
        border: 'none',
        borderRadius: '24px',
        padding: '24px',
        // Effets bombé Material Design sophistiqués
        boxShadow: [
            '0 16px 40px rgba(0, 0, 0, 0.12)',        // Elevation principale
            '0 8px 24px rgba(0, 0, 0, 0.08)',         // Elevation secondaire
            'inset 0 1px 0 rgba(255, 255, 255, 0.9)', // Highlight subtil
            'inset 0 -1px 0 rgba(0, 0, 0, 0.05)'      // Séparateur interne
        ],
        background: `
            linear-gradient(145deg, #ffffff 0%, #fafafa 50%, #ffffff 100%),
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.05) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 179, 153, 0.05) 0%, transparent 50%)
        `,
        fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, sans-serif'
    },
    
    cellStyle: {
        backgroundColor: '#f8f9fa',
        border: 'none',
        borderRadius: '16px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        color: '#1a1a1a',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        // Effet bombé Material subtil
        boxShadow: [
            '0 2px 8px rgba(0, 0, 0, 0.06)',
            '0 1px 4px rgba(0, 0, 0, 0.04)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.8)'
        ],
        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
    },
    
    cellHoverStyle: {
        backgroundColor: '#e3f2fd',
        color: '#1976d2',
        transform: 'scale(1.06) translateY(-2px)',
        // Effet bombé hover Material élégant
        boxShadow: [
            '0 8px 25px rgba(25, 118, 210, 0.15)',
            '0 4px 12px rgba(25, 118, 210, 0.1)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.9)',
            'inset 0 -1px 2px rgba(25, 118, 210, 0.1)'
        ],
        background: 'linear-gradient(145deg, #e3f2fd 0%, #bbdefb 50%, #e3f2fd 100%)'
    },
    
    cellSelectedStyle: {
        backgroundColor: '#1976d2',
        color: '#ffffff',
        transform: 'scale(1.08) translateY(-4px)',
        // Effet bombé sélection Material sophisticated
        boxShadow: [
            '0 12px 40px rgba(25, 118, 210, 0.25)',
            '0 6px 20px rgba(25, 118, 210, 0.15)',
            'inset 0 2px 6px rgba(255, 255, 255, 0.3)',
            'inset 0 -2px 6px rgba(13, 71, 161, 0.3)'
        ],
        background: 'linear-gradient(145deg, #2196f3 0%, #1976d2 50%, #1565c0 100%)'
    },
    
    cellActiveStyle: {
        transform: 'scale(1.1) translateY(-6px)',
        boxShadow: [
            '0 16px 50px rgba(25, 118, 210, 0.3)',
            'inset 0 3px 8px rgba(255, 255, 255, 0.4)'
        ]
    },
    
    animations: {
        cellHover: {
            duration: '0.4s',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        cellSelect: {
            duration: '0.5s',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            console.log(`📱 Material Matrix - Clicked: (${x}, ${y})`);
            
            // Material ripple effect
            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(25, 118, 210, 0.4) 0%, rgba(25, 118, 210, 0.1) 70%, transparent 100%);
                transform: scale(0);
                animation: materialRipple 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
                top: 50%;
                left: 50%;
                width: 100px;
                height: 100px;
                margin: -50px 0 0 -50px;
            `;
            cell.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        },
        
        onCellHover: (cell, x, y, cellId) => {
            // Subtle elevation animation pour cellules adjacentes
            document.querySelectorAll('#matrix-material .matrix-cell').forEach(otherCell => {
                const [otherX, otherY] = otherCell.dataset.position.split(',').map(Number);
                const distance = Math.sqrt(Math.pow(x - otherX, 2) + Math.pow(y - otherY, 2));
                
                if (distance <= 1.5 && distance > 0) {
                    otherCell.style.transform = 'translateY(-1px)';
                    otherCell.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }
            });
        },
        
        onCellLeave: () => {
            // Reset subtle elevations
            document.querySelectorAll('#matrix-material .matrix-cell').forEach(cell => {
                if (!cell.classList.contains('selected') && !cell.matches(':hover')) {
                    cell.style.transform = '';
                    cell.style.boxShadow = '';
                }
            });
        },
        
        onSelectionChange: (selectedCells) => {
            console.log(`📱 Material Matrix - Selection: ${selectedCells.length} cells`);
        }
    }
});

// Ajouter les animations CSS personnalisées
const customAnimations = document.createElement('style');
customAnimations.textContent = `
    @keyframes containerPulse {
        0%, 100% { box-shadow: 0 0 30px rgba(0, 255, 65, 0.5), 0 12px 24px rgba(0, 0, 0, 0.8), inset 0 2px 4px rgba(0, 255, 65, 0.3), inset 0 -2px 4px rgba(0, 0, 0, 0.5); }
        50% { box-shadow: 0 0 40px rgba(0, 255, 65, 0.7), 0 12px 24px rgba(0, 0, 0, 0.8), inset 0 2px 4px rgba(0, 255, 65, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.5); }
    }
    
    @keyframes neonPulse {
        0% { filter: brightness(1); }
        50% { filter: brightness(1.3) saturate(1.2); }
        100% { filter: brightness(1); }
    }
    
    @keyframes explosiveSelect {
        0% { transform: scale(1); }
        20% { transform: scale(1.2) rotateZ(2deg); }
        40% { transform: scale(1.1) rotateZ(-1deg); }
        60% { transform: scale(1.18) rotateZ(1deg); }
        80% { transform: scale(1.12) rotateZ(-0.5deg); }
        100% { transform: scale(1.15); }
    }
    
    @keyframes scanEffect {
        0% { transform: translateY(0px); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(100px); opacity: 0; }
    }
    
    @keyframes glitchEffect {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-2px) rotateZ(0.5deg); }
        40% { transform: translateX(2px) rotateZ(-0.5deg); }
        60% { transform: translateX(-1px) rotateZ(0.2deg); }
        80% { transform: translateX(1px) rotateZ(-0.2deg); }
    }
    
    @keyframes materialRipple {
        0% { transform: scale(0); opacity: 1; }
        100% { transform: scale(4); opacity: 0; }
    }
`;

document.head.appendChild(customAnimations);

console.log('🔲 Matrix Advanced Examples loaded successfully!');
console.log('   • Glassmorphism Matrix (50, 50)');
console.log('   • Gaming Matrix (420, 50)');
console.log('   • Material Design Matrix (820, 50)');
