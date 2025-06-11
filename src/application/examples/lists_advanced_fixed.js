/**
 * 📋 List Web Component - Advanced Styling Demo
 * 
 * Demonstration of the new List Web Component with full CSS properties support
 * including gradients, shadows, transforms, and individual item styling.
 */

// Import the new List Web Component
import { List } from '../../a/components/List.js';

console.log('🎨 Loading Advanced List Web Component Demo...');

// Function to initialize all advanced lists
export async function initAdvancedLists() {
    try {
        console.log('🎨 Initializing Advanced List Demos...');
        
        // Add global styles for the demo
        const globalStyles = document.createElement('style');
        globalStyles.textContent = `
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.7; }
                100% { opacity: 1; }
            }
            
            body {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                font-family: 'Roboto', Arial, sans-serif;
                position: relative;
                overflow-x: auto;
            }
            
            .demo-title {
                position: absolute;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                color: white;
                font-size: 32px;
                font-weight: 700;
                text-align: center;
                text-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                margin: 0;
                z-index: 1000;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                padding: 15px 30px;
                border-radius: 15px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                white-space: nowrap;
            }
            
            .demo-subtitle {
                position: absolute;
                top: 120px;
                left: 50%;
                transform: translateX(-50%);
                color: rgba(255, 255, 255, 0.9);
                font-size: 16px;
                text-align: center;
                margin: 0;
                z-index: 1000;
            }
        `;
        document.head.appendChild(globalStyles);

        // Add title elements
        const title = document.createElement('h1');
        title.className = 'demo-title';
        title.textContent = '🎨 Advanced List Web Component Demo';

        const subtitle = document.createElement('p');
        subtitle.className = 'demo-subtitle';
        subtitle.textContent = 'Glassmorphism • Gaming Style • Material Design';

        document.body.appendChild(title);
        document.body.appendChild(subtitle);

        // =====================
        // DEMO 1: Glassmorphism List
        // =====================
        const glassmorphismList = new List({
            id: 'glassmorphism-list',
            type: 'avatar',
            searchable: true,
            selectable: true,
            multiSelect: true,
            
            // Global glassmorphism style
            style: {
                position: 'absolute',
                left: '50px',
                top: '180px',
                width: '400px',
                height: '500px',
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: [
                    '0 8px 32px rgba(0, 0, 0, 0.1)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.4)'
                ],
                overflow: 'hidden'
            },
            
            // Header glassmorphism style
            headerStyle: {
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '15px',
                padding: '16px',
                margin: '0 0 20px 0',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
            },
            
            // Default item style
            itemStyle: {
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(5px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '16px 20px',
                margin: '8px 0',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                color: '#333'
            },
            
            itemHoverStyle: {
                background: 'rgba(255, 255, 255, 0.25)',
                transform: 'translateY(-2px) scale(1.02)',
                boxShadow: [
                    '0 8px 25px rgba(0, 0, 0, 0.15)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                ]
            },
            
            itemSelectedStyle: {
                background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.3), rgba(21, 101, 192, 0.3))',
                borderLeft: '4px solid #2196f3',
                boxShadow: [
                    '0 0 0 2px rgba(33, 150, 243, 0.3)',
                    '0 8px 25px rgba(33, 150, 243, 0.2)'
                ]
            },
            
            items: [
                {
                    id: 1,
                    avatarText: 'AJ',
                    avatarColor: '#ff6b6b',
                    text: 'Alice Johnson',
                    subtitle: 'Senior Designer',
                    badge: 'Online',
                    badgeColor: '#4caf50',
                    
                    // Custom style override for this item
                    style: {
                        background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(255, 193, 7, 0.2))',
                        borderLeft: '4px solid #ff6b6b',
                        color: '#2c3e50',
                        fontWeight: '500'
                    },
                    
                    hoverStyle: {
                        background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(255, 193, 7, 0.3))',
                        transform: 'translateX(8px) scale(1.05)',
                        boxShadow: [
                            '0 8px 25px rgba(255, 107, 107, 0.3)',
                            'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                        ]
                    },
                    
                    selectedStyle: {
                        background: 'linear-gradient(135deg, #ff6b6b, #feca57)',
                        color: 'white',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                        transform: 'scale(1.02)'
                    }
                },
                
                {
                    id: 2,
                    avatarText: 'BW',
                    avatarColor: '#9c27b0',
                    text: 'Bob Wilson',
                    subtitle: 'Product Manager',
                    badge: 'Busy',
                    badgeColor: '#ff9800',
                    
                    // Neon glow style
                    style: {
                        background: 'rgba(156, 39, 176, 0.1)',
                        border: '1px solid rgba(156, 39, 176, 0.3)',
                        borderRadius: '15px',
                        boxShadow: [
                            '0 0 20px rgba(156, 39, 176, 0.2)',
                            'inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                        ]
                    },
                    
                    hoverStyle: {
                        background: 'rgba(156, 39, 176, 0.2)',
                        boxShadow: [
                            '0 0 30px rgba(156, 39, 176, 0.4)',
                            '0 8px 25px rgba(156, 39, 176, 0.3)'
                        ],
                        transform: 'scale(1.05)',
                        filter: 'brightness(1.1)'
                    }
                },
                
                {
                    id: 3,
                    avatarText: 'CD',
                    avatarColor: '#00bcd4',
                    text: 'Charlie Davis',
                    subtitle: 'Developer',
                    badge: 'Away',
                    badgeColor: '#607d8b'
                }
            ]
        });

        // =====================
        // DEMO 2: Gaming-Style List
        // =====================
        const gamingList = new List({
            id: 'gaming-list',
            type: 'icon',
            selectable: true,
            
            // Dark gaming theme
            style: {
                position: 'absolute',
                left: '480px',
                top: '180px',
                width: '350px',
                height: '450px',
                background: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 50%, #0c0c0c 100%)',
                border: '2px solid #00ff88',
                borderRadius: '15px',
                padding: '15px',
                boxShadow: [
                    '0 0 30px rgba(0, 255, 136, 0.3)',
                    'inset 0 1px 0 rgba(0, 255, 136, 0.1)'
                ],
                color: '#ffffff'
            },
            
            itemStyle: {
                background: 'linear-gradient(90deg, rgba(0, 255, 136, 0.1), transparent)',
                border: '1px solid rgba(0, 255, 136, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                margin: '4px 0',
                transition: 'all 0.3s ease',
                color: '#e0e0e0',
                position: 'relative'
            },
            
            itemHoverStyle: {
                background: 'linear-gradient(90deg, rgba(0, 255, 136, 0.2), rgba(0, 255, 136, 0.1))',
                borderColor: '#00ff88',
                transform: 'translateX(5px)',
                boxShadow: [
                    '0 0 15px rgba(0, 255, 136, 0.4)',
                    'inset 0 1px 0 rgba(0, 255, 136, 0.2)'
                ],
                color: '#ffffff'
            },
            
            itemSelectedStyle: {
                background: 'linear-gradient(90deg, #00ff88, rgba(0, 255, 136, 0.3))',
                borderColor: '#00ff88',
                color: '#000000',
                fontWeight: 'bold',
                boxShadow: [
                    '0 0 20px rgba(0, 255, 136, 0.6)',
                    'inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                ]
            },
            
            items: [
                {
                    id: 1,
                    icon: '🎮',
                    text: 'Start Game',
                    subtitle: 'Begin your adventure',
                    
                    style: {
                        background: 'linear-gradient(45deg, rgba(76, 175, 80, 0.2), rgba(139, 195, 74, 0.2))',
                        borderLeft: '4px solid #4caf50'
                    },
                    
                    hoverStyle: {
                        background: 'linear-gradient(45deg, #4caf50, #8bc34a)',
                        color: 'white',
                        textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                        transform: 'scale(1.05) rotate(1deg)'
                    }
                },
                
                {
                    id: 2,
                    icon: '⚙️',
                    text: 'Settings',
                    subtitle: 'Configure options',
                    
                    style: {
                        background: 'linear-gradient(45deg, rgba(255, 152, 0, 0.2), rgba(255, 193, 7, 0.2))',
                        borderLeft: '4px solid #ff9800'
                    }
                },
                
                {
                    id: 3,
                    icon: '🏆',
                    text: 'Achievements',
                    subtitle: 'View your progress',
                    
                    style: {
                        background: 'linear-gradient(45deg, rgba(255, 193, 7, 0.2), rgba(255, 235, 59, 0.2))',
                        borderLeft: '4px solid #ffc107'
                    }
                },
                
                {
                    id: 4,
                    icon: '👥',
                    text: 'Multiplayer',
                    subtitle: 'Play with friends',
                    
                    style: {
                        background: 'linear-gradient(45deg, rgba(33, 150, 243, 0.2), rgba(3, 169, 244, 0.2))',
                        borderLeft: '4px solid #2196f3'
                    }
                }
            ]
        });

        // =====================
        // DEMO 3: Material Design List
        // =====================
        const materialList = new List({
            id: 'material-list',
            type: 'avatar',
            searchable: true,
            sortable: true,
            
            style: {
                position: 'absolute',
                left: '860px',
                top: '180px',
                width: '380px',
                height: '400px',
                background: '#ffffff',
                borderRadius: '8px',
                boxShadow: [
                    '0 4px 8px rgba(0, 0, 0, 0.12)',
                    '0 2px 4px rgba(0, 0, 0, 0.08)'
                ],
                overflow: 'hidden'
            },
            
            headerStyle: {
                background: '#f5f5f5',
                padding: '16px',
                borderBottom: '1px solid #e0e0e0'
            },
            
            itemStyle: {
                padding: '16px',
                borderBottom: '1px solid #f0f0f0',
                transition: 'all 0.2s ease',
                backgroundColor: 'transparent'
            },
            
            itemHoverStyle: {
                backgroundColor: '#f5f5f5',
                transform: 'translateX(4px)'
            },
            
            itemSelectedStyle: {
                backgroundColor: '#e3f2fd',
                borderLeft: '4px solid #2196f3'
            },
            
            items: [
                {
                    id: 1,
                    avatarText: 'MC',
                    avatarColor: '#f44336',
                    text: 'Material Contact 1',
                    subtitle: 'material@design.com',
                    badge: '2',
                    badgeColor: '#f44336'
                },
                {
                    id: 2,
                    avatarText: 'MD',
                    avatarColor: '#2196f3',
                    text: 'Material Contact 2',
                    subtitle: 'another@material.com'
                },
                {
                    id: 3,
                    avatarText: 'UI',
                    avatarColor: '#4caf50',
                    text: 'UI Designer',
                    subtitle: 'ui@company.com',
                    badge: 'New',
                    badgeColor: '#4caf50'
                }
            ]
        });

        // Create labels for each demo
        const createLabel = (text, left, top) => {
            const label = document.createElement('div');
            label.style.cssText = `
                position: absolute;
                left: ${left};
                top: ${top};
                color: white;
                font-size: 18px;
                font-weight: 600;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                padding: 8px 16px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                z-index: 1000;
            `;
            label.textContent = text;
            document.body.appendChild(label);
        };
        
        // Add labels
        createLabel('🌟 Glassmorphism Style', '50px', '150px');
        createLabel('🎮 Gaming Style', '480px', '150px');
        createLabel('📱 Material Design', '860px', '150px');
        
        // Attach lists to body
        document.body.appendChild(glassmorphismList);
        document.body.appendChild(gamingList);
        document.body.appendChild(materialList);
        
        console.log('✅ All advanced list demos initialized successfully!');
        
        // Add global event listeners for debugging
        document.addEventListener('list-item-click', (e) => {
            console.log('🎯 Global item click:', e.detail);
        });
        
        document.addEventListener('list-selection-change', (e) => {
            console.log('📋 Global selection change:', e.detail);
        });

        console.log('🎨 Advanced List Web Component Demo Ready!');

        // Export for debugging
        window.glassmorphismList = glassmorphismList;
        window.gamingList = gamingList;
        window.materialList = materialList;
        
        return { glassmorphismList, gamingList, materialList };
        
    } catch (error) {
        console.error('❌ Failed to initialize advanced lists:', error);
        throw error;
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdvancedLists);
} else {
    initAdvancedLists();
}
