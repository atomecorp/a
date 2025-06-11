/**
 * 🎭 Table Bombé Effects Demo
 * 
 * Demonstrating advanced bombé effects with:
 * - Multiple internal/external shadows
 * - Animated size changes on touch/hover
 * - Dynamic color transitions
 * - 3D-like depth effects
 */

// Import the new Table Web Component
// import Table from '../../a/components/Table.js';

console.log('🎭 Loading Table Bombé Effects Demo...');

// Data for bombé effects demonstration
const bombeData = [
    { id: 1, product: 'MacBook Pro', category: 'Laptop', price: 2399, rating: 4.8, stock: 15 },
    { id: 2, product: 'iPhone 15 Pro', category: 'Phone', price: 1199, rating: 4.9, stock: 32 },
    { id: 3, product: 'iPad Air', category: 'Tablet', price: 749, rating: 4.7, stock: 28 },
    { id: 4, product: 'AirPods Pro', category: 'Audio', price: 249, rating: 4.6, stock: 45 },
    { id: 5, product: 'Apple Watch', category: 'Wearable', price: 429, rating: 4.5, stock: 22 },
    { id: 6, product: 'Mac Studio', category: 'Desktop', price: 2999, rating: 4.9, stock: 8 }
];

const bombeColumns = [
    { 
        key: 'id', 
        title: 'ID', 
        width: '60px', 
        align: 'center',
        render: (value) => `<strong style="color: #1976d2;">#${value}</strong>`
    },
    { 
        key: 'product', 
        title: 'Product Name', 
        width: '200px',
        render: (value, row) => {
            const stockColor = row.stock > 30 ? '#4caf50' : row.stock > 15 ? '#ff9800' : '#f44336';
            return `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 12px; height: 12px; border-radius: 2px; background: ${stockColor}; 
                                box-shadow: 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3);"></div>
                    <span style="font-weight: 500;">${value}</span>
                </div>
            `;
        }
    },
    { 
        key: 'category', 
        title: 'Category', 
        width: '120px',
        render: (value) => {
            const colors = {
                'Laptop': { bg: '#e3f2fd', text: '#1565c0' },
                'Phone': { bg: '#f3e5f5', text: '#7b1fa2' },
                'Tablet': { bg: '#e8f5e8', text: '#2e7d32' },
                'Audio': { bg: '#fff3e0', text: '#f57c00' },
                'Wearable': { bg: '#fce4ec', text: '#c2185b' },
                'Desktop': { bg: '#f1f8e9', text: '#558b2f' }
            };
            const color = colors[value] || { bg: '#f5f5f5', text: '#757575' };
            return `
                <span style="
                    background: ${color.bg}; 
                    color: ${color.text}; 
                    padding: 4px 8px; 
                    border-radius: 12px; 
                    font-size: 11px; 
                    font-weight: 600;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.5);
                    display: inline-block;
                ">${value}</span>
            `;
        }
    },
    { 
        key: 'price', 
        title: 'Price', 
        width: '100px', 
        align: 'right',
        render: (value) => `<strong style="color: #4caf50;">$${value}</strong>`
    },
    { 
        key: 'rating', 
        title: 'Rating', 
        width: '100px', 
        align: 'center',
        render: (value) => {
            const stars = '★'.repeat(Math.floor(value)) + '☆'.repeat(5 - Math.floor(value));
            return `
                <div style="color: #ffc107; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
                    ${stars} <small style="color: #666;">(${value})</small>
                </div>
            `;
        }
    },
    { 
        key: 'stock', 
        title: 'Stock', 
        width: '80px', 
        align: 'center',
        render: (value) => {
            const color = value > 30 ? '#4caf50' : value > 15 ? '#ff9800' : '#f44336';
            return `<strong style="color: ${color};">${value}</strong>`;
        }
    }
];

// Create the Bombé Effects Table
console.log('💎 Creating Bombé Effects Table...');
const bombeTable = new Table({
    id: 'bombe-table',
    attach: 'body',
    x: 100,
    y: 50,
    width: 1000,
    height: 500,
    
    columns: bombeColumns,
    data: bombeData,
    
    sortable: true,
    searchable: true,
    selectable: true,
    multiSelect: true,
    
    // Ultra-premium bombé styling
    style: {
        backgroundColor: '#ffffff',
        border: '2px solid #e0e0e0',
        borderRadius: '20px',
        boxShadow: [
            // Main depth shadow
            '0 20px 40px rgba(0, 0, 0, 0.1)',
            // Subtle outer glow
            '0 0 0 1px rgba(255, 255, 255, 0.05)',
            // Inner highlight
            'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            // Inner shadow for depth
            'inset 0 -1px 0 rgba(0, 0, 0, 0.05)'
        ],
        background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 50%, #ffffff 100%)',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '14px'
    },
    
    headerStyle: {
        backgroundColor: '#f8f9fa',
        background: 'linear-gradient(145deg, #ffffff 0%, #f0f2f5 50%, #e9ecef 100%)',
        color: '#2c3e50',
        fontWeight: '600',
        letterSpacing: '0.5px',
        borderBottom: '2px solid #dee2e6',
        padding: '16px 12px',
        boxShadow: [
            // Pronounced bombé effect
            '0 4px 8px rgba(0, 0, 0, 0.08)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.9)',
            'inset 0 -1px 2px rgba(0, 0, 0, 0.05)'
        ]
    },
    
    cellStyle: {
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #f0f0f0',
        padding: '12px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: 'pointer',
        // Subtle bombé base effect
        boxShadow: [
            '0 2px 4px rgba(0, 0, 0, 0.04)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.7)',
            'inset 0 -1px 0 rgba(0, 0, 0, 0.02)'
        ]
    },
    
    cellHoverStyle: {
        backgroundColor: '#f8f9fa',
        background: 'linear-gradient(145deg, #ffffff 0%, #f0f2f5 100%)',
        // Dramatic bombé effect on hover with size increase
        transform: 'scale(1.05) translateZ(0)',
        borderRadius: '8px',
        boxShadow: [
            // Strong external shadow for elevation
            '0 12px 24px rgba(0, 0, 0, 0.15)',
            '0 4px 8px rgba(0, 0, 0, 0.1)',
            // Internal highlights for bombé effect
            'inset 0 3px 6px rgba(255, 255, 255, 0.9)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.08)',
            // Side shadows for 3D effect
            'inset 2px 0 4px rgba(255, 255, 255, 0.5)',
            'inset -2px 0 4px rgba(0, 0, 0, 0.03)'
        ]
    },
    
    cellSelectedStyle: {
        backgroundColor: '#e3f2fd',
        background: 'linear-gradient(145deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%)',
        color: '#1565c0',
        // Enhanced bombé for selected state
        transform: 'scale(1.08) translateZ(0)',
        borderRadius: '10px',
        boxShadow: [
            // Colored elevation shadow
            '0 16px 32px rgba(33, 150, 243, 0.25)',
            '0 6px 12px rgba(33, 150, 243, 0.15)',
            // Colored internal effects
            'inset 0 4px 8px rgba(255, 255, 255, 0.8)',
            'inset 0 -3px 6px rgba(33, 150, 243, 0.2)',
            // 3D colored bombé
            'inset 3px 0 6px rgba(255, 255, 255, 0.4)',
            'inset -3px 0 6px rgba(33, 150, 243, 0.1)'
        ]
    },
    
    stripedStyle: {
        backgroundColor: '#fafbfc',
        background: 'linear-gradient(145deg, #fafbfc 0%, #f5f6f7 100%)'
    },
    
    animations: {
        cellHover: {
            duration: '0.3s',
            easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' // Bounce effect
        },
        cellSelect: {
            duration: '0.4s',
            easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' // Back effect
        }
    },
    
    callbacks: {
        onCellClick: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`💎 Bombé Cell clicked: ${row[column.key]} [${rowIndex}, ${colIndex}]`);
            
            // Create an explosive ripple effect
            const ripple = document.createElement('div');
            const rect = cell.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(33,150,243,0.6) 0%, rgba(33,150,243,0.1) 70%, transparent 100%);
                transform: scale(0);
                animation: bombeRipple 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
                left: ${event.offsetX - size/2}px;
                top: ${event.offsetY - size/2}px;
                width: ${size}px;
                height: ${size}px;
                z-index: 1000;
            `;
            
            cell.style.position = 'relative';
            cell.appendChild(ripple);
            
            // Temporary scale pulse
            cell.style.transform = 'scale(1.15)';
            setTimeout(() => {
                cell.style.transform = '';
                ripple.remove();
            }, 800);
        },
        
        onCellHover: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`💎 Bombé Cell hover: ${row[column.key]}`);
            
            // Add shimmer effect
            cell.style.backgroundImage = 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)';
            cell.style.backgroundSize = '200% 200%';
            cell.style.animation = 'shimmer 1.5s ease-in-out infinite';
        },
        
        onCellLeave: (cell, row, column, rowIndex, colIndex, event) => {
            // Remove shimmer effect
            cell.style.backgroundImage = '';
            cell.style.animation = '';
        },
        
        onRowClick: (tr, row, rowIndex, event) => {
            console.log(`💎 Bombé Row clicked: ${row.product} - $${row.price}`);
        },
        
        onSelectionChange: (selectedRows) => {
            console.log(`💎 Bombé Selection: ${selectedRows.length} products selected`);
        }
    }
});

// Add enhanced CSS animations for bombé effects
const bombeStyle = document.createElement('style');
bombeStyle.textContent = `
    @keyframes bombeRipple {
        0% {
            transform: scale(0);
            opacity: 1;
        }
        50% {
            transform: scale(0.8);
            opacity: 0.7;
        }
        100% {
            transform: scale(2);
            opacity: 0;
        }
    }
    
    @keyframes shimmer {
        0% {
            background-position: -200% 0;
        }
        100% {
            background-position: 200% 0;
        }
    }
    
    /* Enhanced hover states for bombé table */
    squirrel-table[id="bombe-table"] {
        filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.1));
        transition: filter 0.3s ease;
    }
    
    squirrel-table[id="bombe-table"]:hover {
        filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.15));
    }
    
    /* Custom scrollbar for bombé table */
    squirrel-table[id="bombe-table"] .table-container::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    
    squirrel-table[id="bombe-table"] .table-container::-webkit-scrollbar-track {
        background: linear-gradient(145deg, #f0f0f0, #e0e0e0);
        border-radius: 4px;
    }
    
    squirrel-table[id="bombe-table"] .table-container::-webkit-scrollbar-thumb {
        background: linear-gradient(145deg, #c0c0c0, #a0a0a0);
        border-radius: 4px;
        box-shadow: inset 0 1px 2px rgba(255,255,255,0.5), inset 0 -1px 2px rgba(0,0,0,0.2);
    }
    
    squirrel-table[id="bombe-table"] .table-container::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(145deg, #a0a0a0, #808080);
    }
`;
document.head.appendChild(bombeStyle);

console.log('🎉 Table Bombé Effects Demo loaded!');
console.log('  💎 Ultra-premium bombé styling with multiple shadows');
console.log('  🎭 Animated size changes on hover/touch');
console.log('  ✨ Shimmer effects and explosive ripples');
console.log('  🎨 3D-like depth with internal/external shadows');
console.log('  📱 Responsive and interactive design');
