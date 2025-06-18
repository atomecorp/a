/**
 * 🔲 Matrix Web Component - Effets Bombé Ultra-Premium
 * 
 * Démonstrations avec les effets de relief les plus sophistiqués:
 * - Multiple shadow layers pour profondeur 3D
 * - Animations explosives et fluides
 * - Effets shimmer et particules
 * - Interactions tactiles avancées
 * 
 * @version 2.0.0 - ULTRA PREMIUM
 * @author Squirrel Framework Team
 */

// Matrix 1: LUXURY GOLD - Effet relief luxe avec or et cristal
const luxuryGoldMatrix = new Matrix({
    id: 'matrix-luxury-gold',
    attach: 'body',
    x: 50,
    y: 50,
    grid: { x: 4, y: 4 },
    size: { width: 380, height: 380 },
    spacing: { horizontal: 8, vertical: 8, outer: 20 },
    
    containerStyle: {
        backgroundColor: '#2c1810',
        border: '3px solid #d4af37',
        borderRadius: '28px',
        padding: '24px',
        // Effet bombé container ULTRA LUXE
        boxShadow: [
            '0 25px 60px rgba(212, 175, 55, 0.4)',     // Glow externe doré
            '0 15px 35px rgba(0, 0, 0, 0.6)',          // Ombre profonde noire
            '0 8px 20px rgba(212, 175, 55, 0.2)',      // Ombre secondaire dorée
            'inset 0 3px 8px rgba(255, 223, 128, 0.6)', // Highlight doré interne
            'inset 0 -3px 8px rgba(139, 69, 19, 0.5)',  // Ombre bronze interne
            'inset 1px 1px 2px rgba(255, 255, 255, 0.3)', // Micro highlight
            'inset -1px -1px 2px rgba(0, 0, 0, 0.3)'     // Micro ombre
        ],
        background: `
            radial-gradient(ellipse at top, #3d2817 0%, #2c1810 50%, #1f0f08 100%),
            linear-gradient(145deg, 
                rgba(212, 175, 55, 0.1) 0%, 
                rgba(255, 223, 128, 0.05) 25%,
                rgba(139, 69, 19, 0.1) 50%,
                rgba(212, 175, 55, 0.05) 75%,
                rgba(255, 223, 128, 0.1) 100%
            )
        `,
        fontFamily: '"Playfair Display", "Times New Roman", serif'
    },
    
    cellStyle: {
        backgroundColor: '#3d2817',
        border: '2px solid #d4af37',
        borderRadius: '18px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '600',
        color: '#ffd700',
        textShadow: '0 0 8px rgba(255, 215, 0, 0.8)',
        transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        // Effet bombé cellule GOLD PREMIUM
        boxShadow: [
            '0 8px 20px rgba(212, 175, 55, 0.3)',      // Ombre externe dorée
            '0 4px 12px rgba(0, 0, 0, 0.4)',           // Ombre noire profonde
            'inset 0 2px 6px rgba(255, 223, 128, 0.5)', // Highlight doré
            'inset 0 -2px 6px rgba(139, 69, 19, 0.4)',  // Ombre bronze
            'inset 1px 1px 3px rgba(255, 255, 255, 0.2)', // Micro highlight
            'inset -1px -1px 3px rgba(0, 0, 0, 0.2)'     // Micro ombre
        ],
        background: `
            linear-gradient(145deg, 
                #3d2817 0%, 
                #4a2f1c 25%,
                #3d2817 50%,
                #2f1e10 75%,
                #3d2817 100%
            )
        `
    },
    
    cellHoverStyle: {
        backgroundColor: '#5d3f2a',
        borderColor: '#ffd700',
        color: '#ffffff',
        textShadow: '0 0 15px rgba(255, 215, 0, 1)',
        transform: 'scale(1.12) translateY(-4px) rotateZ(1deg)',
        // Effet bombé hover INTENSE
        boxShadow: [
            '0 0 40px rgba(255, 215, 0, 0.8)',         // Glow intense
            '0 15px 35px rgba(255, 215, 0, 0.4)',      // Ombre colorée
            '0 8px 25px rgba(0, 0, 0, 0.5)',           // Ombre profonde
            'inset 0 4px 12px rgba(255, 255, 255, 0.6)', // Highlight intense
            'inset 0 -4px 12px rgba(212, 175, 55, 0.5)', // Ombre dorée
            'inset 2px 2px 6px rgba(255, 255, 255, 0.3)', // Relief 3D
            'inset -2px -2px 6px rgba(0, 0, 0, 0.3)'     // Profondeur 3D
        ],
        background: `
            radial-gradient(circle at 30% 30%, #ffd700 0%, #d4af37 50%, #b8860b 100%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%)
        `
    },
    
    cellSelectedStyle: {
        backgroundColor: '#ff6b35',
        borderColor: '#ff4500',
        color: '#ffffff',
        textShadow: '0 0 20px rgba(255, 107, 53, 1)',
        transform: 'scale(1.18) translateY(-8px) rotateZ(-1deg)',
        // Effet bombé sélection EXPLOSIVE
        boxShadow: [
            '0 0 60px rgba(255, 107, 53, 1)',          // Explosion de lumière
            '0 20px 50px rgba(255, 107, 53, 0.6)',     // Ombre explosive
            '0 12px 30px rgba(255, 69, 0, 0.4)',       // Ombre secondaire
            'inset 0 6px 16px rgba(255, 255, 255, 0.7)', // Highlight maximal
            'inset 0 -6px 16px rgba(139, 69, 19, 0.6)', // Ombre profonde
            'inset 3px 3px 8px rgba(255, 255, 255, 0.4)', // Relief 3D fort
            'inset -3px -3px 8px rgba(0, 0, 0, 0.4)'     // Profondeur maximale
        ],
        background: `
            radial-gradient(circle at 40% 40%, #ff8c00 0%, #ff6b35 30%, #ff4500 70%, #cc3300 100%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 107, 53, 0.1) 100%)
        `
    },
    
    cellActiveStyle: {
        transform: 'scale(1.25) translateY(-12px) rotateZ(2deg)',
        boxShadow: [
            '0 0 80px rgba(255, 215, 0, 1)',
            '0 25px 60px rgba(255, 107, 53, 0.8)',
            'inset 0 8px 20px rgba(255, 255, 255, 0.8)'
        ],
        filter: 'brightness(1.4) saturate(1.3)'
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            console.log(`✨ Luxury Gold Matrix - Clicked: (${x}, ${y})`);
            
            // Effet shimmer doré
            const shimmer = document.createElement('div');
            shimmer.style.cssText = `
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(
                    90deg,
                    transparent 0%,
                    rgba(255, 215, 0, 0.8) 50%,
                    transparent 100%
                );
                animation: shimmerEffect 0.8s ease-out;
                pointer-events: none;
            `;
            cell.appendChild(shimmer);
            setTimeout(() => shimmer.remove(), 800);
            
            // Particules dorées
            for (let i = 0; i < 6; i++) {
                setTimeout(() => {
                    const particle = document.createElement('div');
                    particle.style.cssText = `
                        position: absolute;
                        width: 4px;
                        height: 4px;
                        background: radial-gradient(circle, #ffd700, #d4af37);
                        border-radius: 50%;
                        top: 50%;
                        left: 50%;
                        animation: particleExplosion 1s ease-out forwards;
                        pointer-events: none;
                        transform-origin: center;
                        --angle: ${i * 60}deg;
                    `;
                    cell.appendChild(particle);
                    setTimeout(() => particle.remove(), 1000);
                }, i * 50);
            }
        },
        
        onCellLongClick: (cell, x, y, cellId) => {
            // Transformation en diamant
            cell.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
            cell.style.transform = 'scale(1.3) rotateZ(45deg)';
            setTimeout(() => {
                cell.style.clipPath = '';
                cell.style.transform = '';
            }, 1000);
        }
    }
});

// Matrix 2: CRYSTAL ICE - Effet cristal de glace avec réfractions
const crystalIceMatrix = new Matrix({
    id: 'matrix-crystal-ice',
    attach: 'body',
    x: 480,
    y: 50,
    grid: { x: 5, y: 4 },
    size: { width: 400, height: 320 },
    spacing: { horizontal: 6, vertical: 6, outer: 18 },
    
    containerStyle: {
        backgroundColor: 'rgba(240, 248, 255, 0.9)',
        border: '2px solid rgba(176, 224, 230, 0.8)',
        borderRadius: '32px',
        padding: '20px',
        backdropFilter: 'blur(20px)',
        webkitBackdropFilter: 'blur(20px)',
        // Effet bombé CRYSTAL container
        boxShadow: [
            '0 20px 60px rgba(135, 206, 235, 0.4)',    // Glow crystal externe
            '0 12px 35px rgba(70, 130, 180, 0.3)',     // Ombre bleue profonde
            'inset 0 4px 12px rgba(255, 255, 255, 0.8)', // Highlight crystal
            'inset 0 -4px 12px rgba(176, 224, 230, 0.4)', // Ombre crystal
            'inset 2px 2px 6px rgba(255, 255, 255, 0.6)', // Relief cristal
            'inset -2px -2px 6px rgba(135, 206, 235, 0.3)' // Profondeur cristal
        ],
        background: `
            radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.8) 0%, rgba(240, 248, 255, 0.6) 50%, rgba(176, 224, 230, 0.4) 100%),
            linear-gradient(145deg, 
                rgba(255, 255, 255, 0.9) 0%,
                rgba(240, 248, 255, 0.7) 25%,
                rgba(176, 224, 230, 0.5) 50%,
                rgba(135, 206, 235, 0.6) 75%,
                rgba(255, 255, 255, 0.8) 100%
            )
        `,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif'
    },
    
    cellStyle: {
        backgroundColor: 'rgba(248, 252, 255, 0.9)',
        border: '1px solid rgba(176, 224, 230, 0.6)',
        borderRadius: '16px',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: '500',
        color: 'rgba(70, 130, 180, 0.9)',
        backdropFilter: 'blur(10px)',
        webkitBackdropFilter: 'blur(10px)',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        // Effet bombé cellule CRYSTAL
        boxShadow: [
            '0 6px 18px rgba(135, 206, 235, 0.2)',     // Ombre crystal douce
            'inset 0 2px 6px rgba(255, 255, 255, 0.9)', // Highlight crystal
            'inset 0 -2px 6px rgba(176, 224, 230, 0.3)', // Ombre crystal interne
            'inset 1px 1px 3px rgba(255, 255, 255, 0.8)', // Micro relief
            'inset -1px -1px 3px rgba(135, 206, 235, 0.2)' // Micro profondeur
        ],
        background: `
            linear-gradient(145deg, 
                rgba(255, 255, 255, 0.95) 0%,
                rgba(248, 252, 255, 0.9) 50%,
                rgba(240, 248, 255, 0.85) 100%
            )
        `
    },
    
    cellHoverStyle: {
        backgroundColor: 'rgba(176, 224, 230, 0.8)',
        borderColor: 'rgba(135, 206, 235, 0.9)',
        color: 'rgba(25, 25, 112, 0.9)',
        transform: 'scale(1.1) translateZ(10px)',
        // Effet bombé hover CRYSTAL INTENSE
        boxShadow: [
            '0 0 30px rgba(135, 206, 235, 0.6)',       // Glow crystal
            '0 12px 30px rgba(135, 206, 235, 0.3)',    // Ombre colorée
            'inset 0 4px 12px rgba(255, 255, 255, 1)',  // Highlight maximal
            'inset 0 -4px 12px rgba(176, 224, 230, 0.5)', // Ombre crystal
            'inset 2px 2px 6px rgba(255, 255, 255, 0.9)', // Relief 3D
            'inset -2px -2px 6px rgba(135, 206, 235, 0.4)' // Profondeur 3D
        ],
        background: `
            radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 1) 0%, rgba(176, 224, 230, 0.8) 50%, rgba(135, 206, 235, 0.6) 100%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%)
        `
    },
    
    cellSelectedStyle: {
        backgroundColor: 'rgba(30, 144, 255, 0.8)',
        borderColor: 'rgba(0, 100, 200, 0.9)',
        color: '#ffffff',
        textShadow: '0 0 12px rgba(255, 255, 255, 0.8)',
        transform: 'scale(1.15) translateZ(15px) rotateX(5deg)',
        // Effet bombé sélection CRYSTAL PREMIUM
        boxShadow: [
            '0 0 40px rgba(30, 144, 255, 0.8)',        // Explosion crystal
            '0 16px 40px rgba(30, 144, 255, 0.4)',     // Ombre explosive
            'inset 0 6px 16px rgba(255, 255, 255, 0.9)', // Highlight intense
            'inset 0 -6px 16px rgba(0, 100, 200, 0.4)', // Ombre profonde
            'inset 3px 3px 8px rgba(255, 255, 255, 0.7)', // Relief crystal
            'inset -3px -3px 8px rgba(30, 144, 255, 0.3)' // Profondeur crystal
        ],
        background: `
            radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(30, 144, 255, 0.8) 40%, rgba(0, 100, 200, 0.9) 100%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.4) 0%, rgba(30, 144, 255, 0.2) 100%)
        `
    },
    
    cellActiveStyle: {
        transform: 'scale(1.2) translateZ(20px) rotateX(10deg) rotateY(5deg)',
        boxShadow: [
            '0 0 60px rgba(30, 144, 255, 1)',
            '0 20px 50px rgba(30, 144, 255, 0.6)',
            'inset 0 8px 20px rgba(255, 255, 255, 1)'
        ],
        filter: 'brightness(1.5) saturate(1.4)'
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            console.log(`❄️ Crystal Ice Matrix - Clicked: (${x}, ${y})`);
            
            // Effet de cristallisation
            const frost = document.createElement('div');
            frost.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: radial-gradient(
                    circle at 50% 50%,
                    rgba(255, 255, 255, 0.8) 0%,
                    rgba(176, 224, 230, 0.6) 30%,
                    rgba(135, 206, 235, 0.4) 60%,
                    transparent 100%
                );
                border-radius: inherit;
                animation: frostEffect 1s ease-out;
                pointer-events: none;
            `;
            cell.appendChild(frost);
            setTimeout(() => frost.remove(), 1000);
            
            // Fragments de glace
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    const fragment = document.createElement('div');
                    fragment.style.cssText = `
                        position: absolute;
                        width: 6px;
                        height: 6px;
                        background: linear-gradient(45deg, rgba(255, 255, 255, 0.9), rgba(176, 224, 230, 0.7));
                        border-radius: 2px;
                        top: 50%;
                        left: 50%;
                        animation: iceFragment 1.2s ease-out forwards;
                        pointer-events: none;
                        --angle: ${i * 45}deg;
                        --distance: 80px;
                    `;
                    cell.appendChild(fragment);
                    setTimeout(() => fragment.remove(), 1200);
                }, i * 30);
            }
        },
        
        onCellDoubleClick: (cell, x, y, cellId) => {
            // Effet de bris de glace
            cell.style.animation = 'iceShatter 0.8s ease-in-out';
            setTimeout(() => {
                cell.style.animation = '';
            }, 800);
        }
    }
});

// Matrix 3: NEON CYBERPUNK - Effet néon futuriste avec hologrammes
const neonCyberpunkMatrix = new Matrix({
    id: 'matrix-neon-cyberpunk',
    attach: 'body',
    x: 930,
    y: 50,
    grid: { x: 3, y: 5 },
    size: { width: 300, height: 400 },
    spacing: { horizontal: 10, vertical: 8, outer: 16 },
    
    containerStyle: {
        backgroundColor: '#000508',
        border: '2px solid #00ffff',
        borderRadius: '20px',
        padding: '18px',
        // Effet bombé CYBERPUNK container
        boxShadow: [
            '0 0 40px rgba(0, 255, 255, 0.6)',         // Glow néon externe
            '0 0 20px rgba(255, 0, 255, 0.4)',         // Glow magenta
            '0 15px 40px rgba(0, 0, 0, 0.8)',          // Ombre profonde
            'inset 0 3px 8px rgba(0, 255, 255, 0.4)',  // Highlight néon
            'inset 0 -3px 8px rgba(255, 0, 255, 0.3)', // Ombre magenta
            'inset 1px 1px 3px rgba(255, 255, 255, 0.2)', // Micro relief
            'inset -1px -1px 3px rgba(0, 0, 0, 0.6)'    // Micro profondeur
        ],
        background: `
            radial-gradient(ellipse at center, #001122 0%, #000508 70%, #000000 100%),
            repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0, 255, 255, 0.03) 2px,
                rgba(0, 255, 255, 0.03) 4px
            ),
            repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                rgba(255, 0, 255, 0.02) 2px,
                rgba(255, 0, 255, 0.02) 4px
            )
        `,
        fontFamily: '"JetBrains Mono", "Courier New", monospace',
        animation: 'cyberPulse 2s ease-in-out infinite alternate'
    },
    
    cellStyle: {
        backgroundColor: '#0a0a0f',
        border: '1px solid #00ffff',
        borderRadius: '12px',
        cursor: 'pointer',
        fontSize: '10px',
        fontWeight: '600',
        color: '#00ffff',
        textShadow: '0 0 8px rgba(0, 255, 255, 0.8)',
        fontFamily: '"JetBrains Mono", monospace',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        // Effet bombé cellule CYBERPUNK
        boxShadow: [
            '0 0 15px rgba(0, 255, 255, 0.3)',         // Glow néon
            '0 4px 12px rgba(0, 0, 0, 0.6)',           // Ombre profonde
            'inset 0 2px 6px rgba(0, 255, 255, 0.4)',  // Highlight néon
            'inset 0 -2px 6px rgba(0, 0, 0, 0.6)',     // Ombre interne
            'inset 1px 1px 2px rgba(255, 255, 255, 0.1)', // Micro relief
            'inset -1px -1px 2px rgba(0, 0, 0, 0.8)'    // Micro profondeur
        ],
        background: `
            linear-gradient(145deg, #0a0a0f 0%, #151520 50%, #0a0a0f 100%),
            radial-gradient(circle at 80% 20%, rgba(0, 255, 255, 0.1) 0%, transparent 50%)
        `
    },
    
    cellHoverStyle: {
        backgroundColor: '#1a0a2e',
        borderColor: '#ff00ff',
        color: '#ff00ff',
        textShadow: '0 0 12px rgba(255, 0, 255, 1)',
        transform: 'scale(1.12) translateZ(0) rotateZ(1deg)',
        // Effet bombé hover HOLOGRAPHIQUE
        boxShadow: [
            '0 0 25px rgba(255, 0, 255, 0.8)',         // Glow magenta intense
            '0 0 15px rgba(0, 255, 255, 0.4)',         // Glow cyan secondaire
            '0 8px 20px rgba(255, 0, 255, 0.3)',       // Ombre colorée
            'inset 0 4px 12px rgba(255, 0, 255, 0.5)',  // Highlight magenta
            'inset 0 -4px 12px rgba(0, 255, 255, 0.3)', // Ombre cyan
            'inset 2px 2px 6px rgba(255, 255, 255, 0.2)', // Relief holographique
            'inset -2px -2px 6px rgba(0, 0, 0, 0.7)'    // Profondeur holographique
        ],
        background: `
            radial-gradient(circle at 40% 40%, rgba(255, 0, 255, 0.3) 0%, rgba(26, 10, 46, 0.8) 50%, rgba(10, 10, 15, 0.9) 100%),
            linear-gradient(145deg, rgba(255, 0, 255, 0.1) 0%, rgba(0, 255, 255, 0.05) 100%)
        `
    },
    
    cellSelectedStyle: {
        backgroundColor: '#ff0080',
        borderColor: '#ff0040',
        color: '#ffffff',
        textShadow: '0 0 20px rgba(255, 255, 255, 1)',
        transform: 'scale(1.18) translateZ(0) rotateZ(-2deg)',
        // Effet bombé sélection NÉON EXPLOSIF
        boxShadow: [
            '0 0 50px rgba(255, 0, 128, 1)',           // Explosion néon
            '0 0 30px rgba(255, 0, 64, 0.8)',          // Glow secondaire
            '0 12px 35px rgba(255, 0, 128, 0.5)',      // Ombre explosive
            'inset 0 6px 16px rgba(255, 255, 255, 0.6)', // Highlight intense
            'inset 0 -6px 16px rgba(128, 0, 64, 0.5)', // Ombre profonde
            'inset 3px 3px 8px rgba(255, 255, 255, 0.4)', // Relief néon
            'inset -3px -3px 8px rgba(0, 0, 0, 0.7)'    // Profondeur maximale
        ],
        background: `
            radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4) 0%, rgba(255, 0, 128, 0.9) 40%, rgba(255, 0, 64, 1) 100%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 0, 128, 0.1) 100%)
        `
    },
    
    cellActiveStyle: {
        transform: 'scale(1.25) translateZ(0) rotateZ(3deg)',
        boxShadow: [
            '0 0 80px rgba(255, 0, 128, 1)',
            '0 20px 50px rgba(255, 0, 128, 0.8)',
            'inset 0 8px 20px rgba(255, 255, 255, 0.8)'
        ],
        filter: 'brightness(1.6) saturate(1.5) hue-rotate(15deg)'
    },
    
    callbacks: {
        onCellClick: (cell, x, y, cellId) => {
            console.log(`🌈 Neon Cyberpunk Matrix - Clicked: (${x}, ${y})`);
            
            // Effet holographique
            const holo = document.createElement('div');
            holo.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(
                    45deg,
                    rgba(0, 255, 255, 0.6) 0%,
                    rgba(255, 0, 255, 0.6) 25%,
                    rgba(255, 255, 0, 0.6) 50%,
                    rgba(255, 0, 255, 0.6) 75%,
                    rgba(0, 255, 255, 0.6) 100%
                );
                border-radius: inherit;
                animation: holoEffect 1s ease-out;
                pointer-events: none;
                mix-blend-mode: screen;
            `;
            cell.appendChild(holo);
            setTimeout(() => holo.remove(), 1000);
            
            // Données Matrix rain
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const dataChar = document.createElement('div');
                    dataChar.textContent = String.fromCharCode(0x30A0 + Math.random() * 96);
                    dataChar.style.cssText = `
                        position: absolute;
                        font-size: 8px;
                        color: #00ff00;
                        text-shadow: 0 0 6px #00ff00;
                        animation: matrixRain 1.5s linear forwards;
                        pointer-events: none;
                        left: ${Math.random() * 100}%;
                        top: -10px;
                    `;
                    cell.appendChild(dataChar);
                    setTimeout(() => dataChar.remove(), 1500);
                }, i * 100);
            }
        },
        
        onCellLongClick: (cell, x, y, cellId) => {
            // Transformation holographique
            cell.style.background = `
                conic-gradient(
                    from 0deg,
                    #ff0080 0deg,
                    #0080ff 60deg,
                    #80ff00 120deg,
                    #ff8000 180deg,
                    #8000ff 240deg,
                    #00ff80 300deg,
                    #ff0080 360deg
                )
            `;
            cell.style.animation = 'holoSpin 2s linear';
            setTimeout(() => {
                cell.style.background = '';
                cell.style.animation = '';
            }, 2000);
        }
    }
});

// Ajouter les animations CSS ultra-avancées
const ultraAnimations = document.createElement('style');
ultraAnimations.textContent = `
    @keyframes shimmerEffect {
        0% { left: -100%; }
        100% { left: 100%; }
    }
    
    @keyframes particleExplosion {
        0% { 
            transform: translate(-50%, -50%) scale(1) rotateZ(var(--angle));
            opacity: 1;
        }
        100% { 
            transform: translate(-50%, -50%) translateX(60px) scale(0.2) rotateZ(calc(var(--angle) + 180deg));
            opacity: 0;
        }
    }
    
    @keyframes frostEffect {
        0% { 
            transform: scale(0);
            opacity: 0;
        }
        50% { 
            transform: scale(1.1);
            opacity: 0.8;
        }
        100% { 
            transform: scale(1);
            opacity: 0;
        }
    }
    
    @keyframes iceFragment {
        0% { 
            transform: translate(-50%, -50%) rotateZ(var(--angle)) translateX(0);
            opacity: 1;
        }
        100% { 
            transform: translate(-50%, -50%) rotateZ(calc(var(--angle) + 360deg)) translateX(var(--distance));
            opacity: 0;
        }
    }
    
    @keyframes iceShatter {
        0%, 100% { transform: scale(1) rotateZ(0deg); }
        25% { transform: scale(1.05) rotateZ(1deg) skewX(2deg); }
        50% { transform: scale(0.95) rotateZ(-1deg) skewX(-2deg); }
        75% { transform: scale(1.02) rotateZ(0.5deg) skewX(1deg); }
    }
    
    @keyframes cyberPulse {
        0% { 
            box-shadow: 
                0 0 40px rgba(0, 255, 255, 0.6),
                0 0 20px rgba(255, 0, 255, 0.4),
                0 15px 40px rgba(0, 0, 0, 0.8),
                inset 0 3px 8px rgba(0, 255, 255, 0.4),
                inset 0 -3px 8px rgba(255, 0, 255, 0.3),
                inset 1px 1px 3px rgba(255, 255, 255, 0.2),
                inset -1px -1px 3px rgba(0, 0, 0, 0.6);
        }
        100% { 
            box-shadow: 
                0 0 50px rgba(0, 255, 255, 0.8),
                0 0 30px rgba(255, 0, 255, 0.6),
                0 15px 40px rgba(0, 0, 0, 0.8),
                inset 0 3px 8px rgba(0, 255, 255, 0.5),
                inset 0 -3px 8px rgba(255, 0, 255, 0.4),
                inset 1px 1px 3px rgba(255, 255, 255, 0.3),
                inset -1px -1px 3px rgba(0, 0, 0, 0.6);
        }
    }
    
    @keyframes holoEffect {
        0% { 
            opacity: 0;
            transform: scale(0.8) rotateZ(0deg);
        }
        50% { 
            opacity: 0.8;
            transform: scale(1.1) rotateZ(180deg);
        }
        100% { 
            opacity: 0;
            transform: scale(1) rotateZ(360deg);
        }
    }
    
    @keyframes matrixRain {
        0% { 
            transform: translateY(0);
            opacity: 1;
        }
        100% { 
            transform: translateY(120px);
            opacity: 0;
        }
    }
    
    @keyframes holoSpin {
        0% { transform: rotateZ(0deg) scale(1); }
        50% { transform: rotateZ(180deg) scale(1.1); }
        100% { transform: rotateZ(360deg) scale(1); }
    }
`;

document.head.appendChild(ultraAnimations);

console.log('🔲 Matrix Bombé Ultra-Premium Examples loaded successfully!');
console.log('   • Luxury Gold Matrix (50, 50) - ✨ Premium relief effects');
console.log('   • Crystal Ice Matrix (480, 50) - ❄️ Crystal refraction effects');
console.log('   • Neon Cyberpunk Matrix (930, 50) - 🌈 Holographic neon effects');
