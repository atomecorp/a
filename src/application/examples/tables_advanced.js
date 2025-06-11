/**
 * 📊 Table Web Component Advanced Demo
 * 
 * Demonstrating:
 * - Bombé effects with multiple shadows
 * - Animated cell interactions
 * - CSS gradients and advanced styling
 * - Interactive callbacks
 * - Auto-attachment and positioning
 */

// Import the new Table Web Component
// import Table from '../../a/components/Table.js';

// console.log('🎯 Loading Table Web Component Advanced Demo...');

// Sample data for demonstrations
const sampleData = [
    { id: 1, name: 'Alice Johnson', role: 'Senior Developer', department: 'Engineering', salary: 95000, status: 'Active' },
    { id: 2, name: 'Bob Smith', role: 'Product Manager', department: 'Product', salary: 105000, status: 'Active' },
    { id: 3, name: 'Carol Williams', role: 'UX Designer', department: 'Design', salary: 80000, status: 'Active' },
    { id: 4, name: 'David Brown', role: 'DevOps Engineer', department: 'Engineering', salary: 90000, status: 'Away' },
    { id: 5, name: 'Eva Davis', role: 'Data Scientist', department: 'Analytics', salary: 110000, status: 'Active' },
    { id: 6, name: 'Frank Miller', role: 'QA Engineer', department: 'Engineering', salary: 75000, status: 'Active' },
    { id: 7, name: 'Grace Wilson', role: 'Marketing Lead', department: 'Marketing', salary: 85000, status: 'Inactive' },
    { id: 8, name: 'Henry Garcia', role: 'Sales Rep', department: 'Sales', salary: 70000, status: 'Active' }
];

// Column configuration with custom renderers
const columns = [
    { 
        key: 'id', 
        title: 'ID', 
        width: '60px', 
        align: 'center',
        render: (value) => `<strong>#${value}</strong>`
    },
    { 
        key: 'name', 
        title: 'Employee Name', 
        width: '180px',
        render: (value, row) => {
            const statusColor = row.status === 'Active' ? '#4caf50' : 
                              row.status === 'Away' ? '#ff9800' : '#f44336';
            return `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
                    <span>${value}</span>
                </div>
            `;
        }
    },
    { key: 'role', title: 'Role', width: '150px' },
    { 
        key: 'department', 
        title: 'Department', 
        width: '120px',
        render: (value) => {
            const colors = {
                'Engineering': '#2196f3',
                'Product': '#9c27b0',
                'Design': '#e91e63',
                'Analytics': '#00bcd4',
                'Marketing': '#ff5722',
                'Sales': '#4caf50'
            };
            const color = colors[value] || '#757575';
            return `<span style="color: ${color}; font-weight: 500;">${value}</span>`;
        }
    },
    { 
        key: 'salary', 
        title: 'Salary', 
        width: '100px', 
        align: 'right',
        render: (value) => `$${value.toLocaleString()}`
    },
    { 
        key: 'status', 
        title: 'Status', 
        width: '80px', 
        align: 'center',
        render: (value) => {
            const colors = {
                'Active': '#4caf50',
                'Away': '#ff9800',
                'Inactive': '#f44336'
            };
            return `<span style="color: ${colors[value]}; font-weight: bold;">${value}</span>`;
        }
    }
];

// 1. Glassmorphism Table with Bombé Effects
console.log('🎨 Creating Glassmorphism Table...');
const glassmorphismTable = new Table({
    id: 'glassmorphism-table',
    attach: 'body',
    x: 50,
    y: 100,
    width: 900,
    height: 400,
    
    columns: columns,
    data: sampleData,
    
    sortable: true,
    searchable: true,
    selectable: true,
    multiSelect: true,
    
    pagination: {
        enabled: true,
        pageSize: 5
    },
    
    // Glassmorphism styling with bombé effects
    style: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '16px',
        boxShadow: [
            '0 8px 32px rgba(0, 0, 0, 0.1)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            'inset 0 -1px 0 rgba(0, 0, 0, 0.1)'
        ],
        background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
    },
    
    headerStyle: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)',
        backdropFilter: 'blur(10px)',
        fontWeight: 'bold',
        color: '#333',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: [
            'inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            '0 1px 3px rgba(0, 0, 0, 0.1)'
        ]
    },
    
    cellStyle: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(5px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: [
            '0 1px 3px rgba(0, 0, 0, 0.1)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        ]
    },
    
    cellHoverStyle: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%)',
        transform: 'scale(1.02) translateZ(0)',
        boxShadow: [
            '0 8px 25px rgba(0, 0, 0, 0.15)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.3)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.1)'
        ]
    },
    
    cellSelectedStyle: {
        backgroundColor: 'rgba(33, 150, 243, 0.2)',
        background: 'linear-gradient(135deg, rgba(33,150,243,0.3) 0%, rgba(33,150,243,0.15) 100%)',
        boxShadow: [
            '0 8px 25px rgba(33, 150, 243, 0.3)',
            'inset 0 2px 4px rgba(33, 150, 243, 0.4)',
            'inset 0 -1px 2px rgba(0, 0, 0, 0.1)'
        ]
    },
    
    animations: {
        cellHover: {
            duration: '0.3s',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        cellSelect: {
            duration: '0.4s',
            easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }
    },
    
    callbacks: {
        onCellClick: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`🎯 Glassmorphism Cell clicked: [${rowIndex}, ${colIndex}] = ${row[column.key]}`);
            
            // Add ripple effect
            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.6);
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
                left: ${event.offsetX - 10}px;
                top: ${event.offsetY - 10}px;
                width: 20px;
                height: 20px;
            `;
            
            cell.style.position = 'relative';
            cell.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        },
        
        onCellHover: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`🎯 Glassmorphism Cell hover: ${row[column.key]}`);
        },
        
        onRowClick: (tr, row, rowIndex, event) => {
            console.log(`🎯 Glassmorphism Row clicked: ${row.name} (${row.role})`);
        },
        
        onSelectionChange: (selectedRows) => {
            console.log(`🎯 Glassmorphism Selection changed: ${selectedRows.length} rows selected`);
        }
    }
});

// 2. Gaming-Style Table with Neon Effects
console.log('🎮 Creating Gaming-Style Table...');
const gamingTable = new Table({
    id: 'gaming-table',
    attach: 'body',
    x: 50,
    y: 550,
    width: 900,
    height: 400,
    
    columns: columns,
    data: sampleData,
    
    sortable: true,
    searchable: true,
    selectable: true,
    multiSelect: false,
    
    // Gaming-style with neon effects
    style: {
        backgroundColor: '#0a0a0a',
        border: '2px solid #00ff41',
        borderRadius: '12px',
        boxShadow: [
            '0 0 20px rgba(0, 255, 65, 0.5)',
            'inset 0 1px 0 rgba(0, 255, 65, 0.2)',
            '0 8px 32px rgba(0, 0, 0, 0.8)'
        ],
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        color: '#00ff41',
        fontFamily: '"Courier New", monospace'
    },
    
    headerStyle: {
        backgroundColor: '#1a1a1a',
        background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)',
        color: '#00ff41',
        fontWeight: 'bold',
        borderBottom: '2px solid #00ff41',
        textShadow: '0 0 10px rgba(0, 255, 65, 0.8)',
        boxShadow: [
            'inset 0 1px 0 rgba(0, 255, 65, 0.3)',
            '0 2px 10px rgba(0, 255, 65, 0.2)'
        ]
    },
    
    cellStyle: {
        backgroundColor: '#0f0f0f',
        borderBottom: '1px solid rgba(0, 255, 65, 0.3)',
        color: '#00ff41',
        transition: 'all 0.2s ease',
        boxShadow: [
            'inset 0 1px 0 rgba(0, 255, 65, 0.1)',
            '0 1px 3px rgba(0, 0, 0, 0.5)'
        ]
    },
    
    cellHoverStyle: {
        backgroundColor: '#1a3d1a',
        background: 'linear-gradient(135deg, #1a3d1a 0%, #0d2a0d 100%)',
        color: '#ffffff',
        textShadow: '0 0 5px rgba(0, 255, 65, 1)',
        transform: 'scale(1.03)',
        boxShadow: [
            '0 0 15px rgba(0, 255, 65, 0.6)',
            'inset 0 2px 4px rgba(0, 255, 65, 0.2)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.3)'
        ]
    },
    
    cellSelectedStyle: {
        backgroundColor: '#2d5a2d',
        background: 'linear-gradient(135deg, #2d5a2d 0%, #1a3d1a 100%)',
        color: '#ffffff',
        textShadow: '0 0 10px rgba(0, 255, 65, 1)',
        boxShadow: [
            '0 0 20px rgba(0, 255, 65, 0.8)',
            'inset 0 2px 6px rgba(0, 255, 65, 0.3)',
            'inset 0 -2px 6px rgba(0, 0, 0, 0.5)'
        ]
    },
    
    callbacks: {
        onCellClick: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`🎮 Gaming Cell clicked: [${rowIndex}, ${colIndex}] = ${row[column.key]}`);
            
            // Add glitch effect
            cell.style.animation = 'glitch 0.3s ease';
            setTimeout(() => {
                cell.style.animation = '';
            }, 300);
        },
        
        onRowClick: (tr, row, rowIndex, event) => {
            console.log(`🎮 Gaming Row clicked: ${row.name} - ${row.role}`);
        }
    }
});

// 3. Material Design Table with Elevation Effects
console.log('🎨 Creating Material Design Table...');
const materialTable = new Table({
    id: 'material-table',
    attach: 'body',
    x: 1000,
    y: 100,
    width: 900,
    height: 850,
    
    columns: columns,
    data: sampleData,
    
    sortable: true,
    searchable: true,
    selectable: true,
    multiSelect: true,
    
    pagination: {
        enabled: true,
        pageSize: 4
    },
    
    // Material Design styling
    style: {
        backgroundColor: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        boxShadow: [
            '0 2px 4px rgba(0, 0, 0, 0.1)',
            '0 8px 16px rgba(0, 0, 0, 0.1)'
        ],
        background: 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    },
    
    headerStyle: {
        backgroundColor: '#f5f5f5',
        background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
        color: '#424242',
        fontWeight: '500',
        borderBottom: '1px solid #e0e0e0',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        fontSize: '12px',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)'
    },
    
    cellStyle: {
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
        color: '#424242',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
    },
    
    cellHoverStyle: {
        backgroundColor: '#f5f5f5',
        background: 'linear-gradient(135deg, #f5f5f5 0%, #eeeeee 100%)',
        transform: 'translateY(-1px)',
        boxShadow: [
            '0 4px 8px rgba(0, 0, 0, 0.12)',
            '0 2px 4px rgba(0, 0, 0, 0.08)'
        ]
    },
    
    cellSelectedStyle: {
        backgroundColor: '#e3f2fd',
        background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
        color: '#1976d2',
        boxShadow: [
            '0 4px 12px rgba(25, 118, 210, 0.2)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
        ]
    },
    
    animations: {
        cellHover: {
            duration: '0.2s',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        cellSelect: {
            duration: '0.3s',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }
    },
    
    callbacks: {
        onCellClick: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`🎨 Material Cell clicked: [${rowIndex}, ${colIndex}] = ${row[column.key]}`);
        },
        
        onCellHover: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`🎨 Material Cell hover: ${row[column.key]}`);
        },
        
        onRowClick: (tr, row, rowIndex, event) => {
            console.log(`🎨 Material Row clicked: ${row.name}`);
        },
        
        onSelectionChange: (selectedRows) => {
            console.log(`🎨 Material Selection: ${selectedRows.length} rows`);
        },
        
        onSort: (column, direction) => {
            console.log(`🎨 Material Sort: ${column} ${direction}`);
        }
    }
});

// Add CSS for additional animations
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    @keyframes glitch {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-2px); }
        40% { transform: translateX(2px); }
        60% { transform: translateX(-1px); }
        80% { transform: translateX(1px); }
    }
`;
document.head.appendChild(style);

console.log('🎉 Table Web Component Advanced Demo loaded with:');
console.log('  - Glassmorphism table with bombé effects');
console.log('  - Gaming-style table with neon glow');
console.log('  - Material Design table with elevation');
console.log('  - Interactive callbacks and animations');
console.log('  - Auto-attachment and positioning');
