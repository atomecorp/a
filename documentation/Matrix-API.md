# 🔲 Matrix API - Interactive Grid Component

## 🚀 Basic Usage

### Simple Grid
```javascript
const basicGrid = new Matrix({
    attach: 'body',
    id: 'my_grid',
    x: 50, y: 50,
    rows: 4,
    columns: 4,
    cellWidth: 60,
    cellHeight: 60,
    callbacks: {
        onClick: (id, x, y, cellData, event) => {
            console.log(`Clicked cell at ${x}, ${y}`);
        }
    }
});
```

## ⚙️ Configuration Options

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `rows` | number | Number of rows | `3` |
| `columns` | number | Number of columns | `3` |
| `cellWidth` | number | Width of each cell | `50` |
| `cellHeight` | number | Height of each cell | `50` |
| `spacing` | object/number | Spacing between cells | `{ gap: 2 }` |
| `data` | array | Initial cell data | `null` |
| `selectable` | boolean | Enable cell selection | `true` |
| `multiSelect` | boolean | Allow multiple selection | `false` |

## 🎨 Styling Options

### Cell Styling
```javascript
const styledMatrix = new Matrix({
    attach: 'body',
    rows: 3, columns: 3,
    cellWidth: 80, cellHeight: 80,
    
    // Default cell style
    cellStyle: {
        backgroundColor: '#ecf0f1',
        border: '2px solid #bdc3c7',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#2c3e50',
        fontWeight: 'bold'
    },
    
    // Hover effect
    cellHoverStyle: {
        backgroundColor: '#3498db',
        transform: 'scale(1.05)',
        boxShadow: '0 4px 8px rgba(52, 152, 219, 0.3)'
    },
    
    // Selected cell style
    cellSelectedStyle: {
        backgroundColor: '#e74c3c',
        border: '3px solid #c0392b',
        color: 'white'
    }
});
```

### Spacing and Layout
```javascript
const spacedMatrix = new Matrix({
    attach: 'body',
    rows: 4, columns: 4,
    
    spacing: {
        gap: 10,                    // Space between cells
        padding: 20,                // Padding around the grid
        method: 'flex',             // Layout method: 'flex' or 'grid'
        responsive: true,           // Enable responsive behavior
        breakpoints: {
            small: { gap: 5, padding: 10 },
            large: { gap: 15, padding: 30 }
        }
    }
});
```

## 📊 Data Management

### Providing Initial Data
```javascript
const dataMatrix = new Matrix({
    attach: 'body',
    rows: 3, columns: 3,
    
    data: [
        { id: 'cell_0_0', content: 'A1', value: 1 },
        { id: 'cell_0_1', content: 'B1', value: 2 },
        { id: 'cell_0_2', content: 'C1', value: 3 },
        // ... more data
    ],
    
    callbacks: {
        onClick: (id, x, y, cellData) => {
            console.log(`Cell ${cellData.content} clicked, value: ${cellData.value}`);
        }
    }
});
```

### Dynamic Data Updates
```javascript
const matrix = new Matrix({ /* config */ });

// Update single cell
matrix.updateCell(0, 1, {
    content: 'Updated!',
    backgroundColor: 'yellow'
});

// Update multiple cells
matrix.updateCells([
    { x: 0, y: 0, data: { content: 'New A1' } },
    { x: 1, y: 1, data: { content: 'New B2' } }
]);

// Get cell data
const cellData = matrix.getCellData(0, 0);
```

## 🎯 Event Callbacks

```javascript
const interactiveMatrix = new Matrix({
    attach: 'body',
    rows: 4, columns: 4,
    
    callbacks: {
        // Single click
        onClick: (id, x, y, cellData, event) => {
            console.log(`Single click: ${x}, ${y}`);
        },
        
        // Double click
        onDoubleClick: (id, x, y, cellData, event) => {
            console.log(`Double click: ${x}, ${y}`);
        },
        
        // Long press/click
        onLongClick: (id, x, y, cellData, event) => {
            console.log(`Long press: ${x}, ${y}`);
        },
        
        // Hover events
        onHover: (id, x, y, cellData, event) => {
            console.log(`Hovering over: ${x}, ${y}`);
        },
        
        // Selection change
        onSelectionChange: (selectedCells) => {
            console.log(`Selected cells:`, selectedCells);
        }
    },
    
    // Long click duration
    longClickDuration: 800 // milliseconds
});
```

## 🔄 Selection Management

### Single Selection
```javascript
const singleSelectMatrix = new Matrix({
    attach: 'body',
    rows: 5, columns: 5,
    selectable: true,
    multiSelect: false,
    
    callbacks: {
        onSelectionChange: (selected) => {
            if (selected.length > 0) {
                console.log(`Selected: ${selected[0].x}, ${selected[0].y}`);
            }
        }
    }
});

// Programmatic selection
singleSelectMatrix.selectCell(2, 2);
singleSelectMatrix.deselectAll();
```

### Multiple Selection
```javascript
const multiSelectMatrix = new Matrix({
    attach: 'body',
    rows: 4, columns: 4,
    multiSelect: true,
    
    callbacks: {
        onSelectionChange: (selected) => {
            console.log(`${selected.length} cells selected`);
        }
    }
});

// Select multiple cells
multiSelectMatrix.selectCells([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 }
]);
```

## 🎨 Complete Examples

### Color Palette Picker
```javascript
const colorPalette = new Matrix({
    attach: 'body',
    id: 'color_palette',
    x: 50, y: 50,
    rows: 8, columns: 8,
    cellWidth: 40, cellHeight: 40,
    
    spacing: {
        gap: 2,
        padding: 10
    },
    
    cellStyle: {
        border: '1px solid #ccc',
        borderRadius: '4px',
        cursor: 'pointer'
    },
    
    cellHoverStyle: {
        transform: 'scale(1.1)',
        border: '2px solid #333'
    },
    
    callbacks: {
        onClick: (id, x, y, cellData) => {
            const selectedColor = cellData.color;
            console.log(`Selected color: ${selectedColor}`);
            
            // Update a preview element
            const preview = document.getElementById('color-preview');
            if (preview) preview.style.backgroundColor = selectedColor;
        }
    }
});

// Generate color data
const colors = [];
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
        const hue = (r * 8 + c) * (360 / 64);
        const color = `hsl(${hue}, 70%, 50%)`;
        colors.push({
            id: `color_${r}_${c}`,
            color: color,
            backgroundColor: color
        });
    }
}

// Apply colors to matrix
colorPalette.setData(colors);
```

### Tic-Tac-Toe Game
```javascript
class TicTacToe {
    constructor() {
        this.currentPlayer = 'X';
        this.gameState = Array(9).fill(null);
        this.gameOver = false;
        
        this.matrix = new Matrix({
            attach: 'body',
            id: 'tic_tac_toe',
            x: 100, y: 100,
            rows: 3, columns: 3,
            cellWidth: 80, cellHeight: 80,
            
            cellStyle: {
                backgroundColor: '#ecf0f1',
                border: '3px solid #34495e',
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#2c3e50',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            },
            
            cellHoverStyle: {
                backgroundColor: '#d5dbdb'
            },
            
            spacing: {
                gap: 3
            },
            
            callbacks: {
                onClick: (id, x, y, cellData) => {
                    this.makeMove(x, y);
                }
            }
        });
    }
    
    makeMove(x, y) {
        if (this.gameOver) return;
        
        const index = y * 3 + x;
        if (this.gameState[index]) return; // Cell already taken
        
        this.gameState[index] = this.currentPlayer;
        
        // Update visual
        this.matrix.updateCell(x, y, {
            content: this.currentPlayer,
            color: this.currentPlayer === 'X' ? '#e74c3c' : '#3498db'
        });
        
        // Check for winner
        if (this.checkWinner()) {
            alert(`${this.currentPlayer} wins!`);
            this.gameOver = true;
            return;
        }
        
        // Check for tie
        if (this.gameState.every(cell => cell !== null)) {
            alert('Tie game!');
            this.gameOver = true;
            return;
        }
        
        // Switch player
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    }
    
    checkWinner() {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];
        
        return winPatterns.some(pattern => {
            const [a, b, c] = pattern;
            return this.gameState[a] && 
                   this.gameState[a] === this.gameState[b] && 
                   this.gameState[a] === this.gameState[c];
        });
    }
}

// Start the game
const game = new TicTacToe();
```

### Image Gallery Grid
```javascript
const imageGallery = new Matrix({
    attach: 'body',
    id: 'image_gallery',
    x: 50, y: 50,
    rows: 3, columns: 4,
    cellWidth: 150, cellHeight: 100,
    
    spacing: {
        gap: 10,
        padding: 20
    },
    
    cellStyle: {
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: '2px solid #ecf0f1',
        borderRadius: '8px',
        cursor: 'pointer',
        overflow: 'hidden'
    },
    
    cellHoverStyle: {
        transform: 'scale(1.02)',
        border: '2px solid #3498db',
        boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)'
    },
    
    callbacks: {
        onClick: (id, x, y, cellData) => {
            // Open image in modal or new window
            const imageUrl = cellData.fullImageUrl;
            window.open(imageUrl, '_blank');
        }
    }
});

// Load images
const images = [
    { backgroundImage: 'url(image1-thumb.jpg)', fullImageUrl: 'image1.jpg' },
    { backgroundImage: 'url(image2-thumb.jpg)', fullImageUrl: 'image2.jpg' },
    // ... more images
];

imageGallery.setData(images);
```
