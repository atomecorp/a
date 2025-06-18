# 📊 Table Web Component - Usage Guide

## Quick Start

```javascript
import Table from '../a/components/Table_New.js';

// Basic usage
const table = new Table({
    attach: 'body',
    x: 50,
    y: 100,
    width: 800,
    height: 400,
    
    columns: [
        { key: 'id', title: 'ID', width: '60px' },
        { key: 'name', title: 'Name', width: '200px' },
        { key: 'email', title: 'Email', width: '250px' }
    ],
    
    data: [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ]
});
```

## Advanced Styling

### Bombé Effects with Multiple Shadows

```javascript
const table = new Table({
    cellStyle: {
        // Multiple shadows for bombé effect
        boxShadow: [
            '0 2px 4px rgba(0, 0, 0, 0.1)',           // External shadow
            'inset 0 1px 0 rgba(255, 255, 255, 0.5)', // Internal highlight
            'inset 0 -1px 0 rgba(0, 0, 0, 0.1)'       // Internal shadow
        ]
    },
    
    cellHoverStyle: {
        transform: 'scale(1.05)',
        boxShadow: [
            '0 8px 16px rgba(0, 0, 0, 0.15)',
            'inset 0 2px 4px rgba(255, 255, 255, 0.8)',
            'inset 0 -2px 4px rgba(0, 0, 0, 0.2)'
        ]
    }
});
```

### CSS Gradients

```javascript
const table = new Table({
    style: {
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)'
    },
    
    headerStyle: {
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'
    }
});
```

### Animations

```javascript
const table = new Table({
    animations: {
        cellHover: {
            duration: '0.3s',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        cellSelect: {
            duration: '0.4s',
            easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }
    }
});
```

## Features

### Auto-Attachment and Positioning

```javascript
const table = new Table({
    attach: 'body',        // or '#container' or element
    x: 100,               // absolute positioning
    y: 200,
    width: 800,
    height: 400
});
```

### Interactive Callbacks

```javascript
const table = new Table({
    callbacks: {
        onCellClick: (cell, row, column, rowIndex, colIndex, event) => {
            console.log(`Cell clicked: ${row[column.key]}`);
        },
        
        onCellHover: (cell, row, column, rowIndex, colIndex, event) => {
            // Add custom hover effects
            cell.style.background = 'linear-gradient(45deg, #f0f0f0, #e0e0e0)';
        },
        
        onSelectionChange: (selectedRows) => {
            console.log(`${selectedRows.length} rows selected`);
        }
    }
});
```

### Custom Renderers

```javascript
const table = new Table({
    columns: [
        {
            key: 'status',
            title: 'Status',
            render: (value) => {
                const color = value === 'Active' ? '#4caf50' : '#f44336';
                return `<span style="color: ${color};">${value}</span>`;
            }
        }
    ]
});
```

## API Methods

```javascript
// Update data
table.setData(newData);

// Refresh table
table.refresh();

// Get selections
const selected = table.getSelectedRows();

// Clear selection
table.clearSelection();
```

## Examples in Action

Check out these demo files:
- `tables_advanced.js` - Three styled tables (Glassmorphism, Gaming, Material)
- `tables_bombe.js` - Advanced bombé effects with animations
- `tables.js` - Basic usage examples

## Web Component Registration

The Table is automatically registered as `<squirrel-table>` custom element:

```html
<!-- Can also be used in HTML -->
<squirrel-table></squirrel-table>
```

```javascript
// Access via custom element
const tableElement = document.querySelector('squirrel-table');
```
