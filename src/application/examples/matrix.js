// Matrix with gradients and shadow-based selection
const matrix = new Matrix({
  id: 'gradient-matrix',
  grid: { x: 4, y: 3 },
  size: { width: 400, height: 300 },
  position: { x: 150, y: 100 },
  spacing: { horizontal: 8, vertical: 8, external: 20 },
  attach: '#view',
  
  // Container with gradient
  containerStyle: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
  },
  
  // Default cell style with gradient and external shadow
  cells: {
    default: {
      style: {
        background: 'linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%)',
        borderRadius: '8px',
        border: 'none',
        boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
        fontSize: '16px',
        fontWeight: '600',
        color: '#333',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
      }
    }
  },
  
  // States with shadow styles
  states: {
    selected: {
      // Selected: external shadow to internal shadow
      boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
      background: 'linear-gradient(145deg, #e8e8e8 0%, #d0d0d0 100%)'
    },
    
    'selected-clicked': {
      // Selected + clicked: add border
      boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
      background: 'linear-gradient(145deg, #e8e8e8 0%, #d0d0d0 100%)',
      border: '3px solid #667eea'
    }
  },
  
  // Click handling
  onCellClick: (cell, x, y, cellId) => {
    const isSelected = matrix.hasCellState(x, y, 'selected');
    const isClickedSelected = matrix.hasCellState(x, y, 'selected-clicked');
    
    if (!isSelected) {
      // Not selected → Selected (internal shadow)
      matrix.addCellState(x, y, 'selected');
      
    } else if (isSelected && !isClickedSelected) {
      // Selected → Selected + Border
      matrix.removeCellState(x, y, 'selected');
      matrix.addCellState(x, y, 'selected-clicked');
      
    } else {
      // Selected + Border → Deselected (original style)
      matrix.removeCellState(x, y, 'selected-clicked');
      matrix.resetCellStyle(x, y);
    }
  }
});

// Adding numbers to cells
for (let y = 0; y < 3; y++) {
  for (let x = 0; x < 4; x++) {
    matrix.setCellContent(x, y, (y * 4 + x + 1).toString());
  }
}

// ///////////
// // Responsive matrix that adapts to its parent
// const responsiveMatrix = new Matrix({
//   id: 'responsive-matrix',
//   grid: { x: 3, y: 2 },
//   autoResize: true,                    // ✨ Automatic resizing
//   maintainAspectRatio: false,          // Cells adapt freely
//   spacing: { horizontal: 4, vertical: 4, external: 10 },
//   attach: '#view',         // Attached to container
  
//   containerStyle: {
//     background: 'linear-gradient(45deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%)',
//     borderRadius: '8px',
//     border: 'none'
//   },
  
//   cells: {
//     default: {
//       style: {
//         background: 'rgba(255, 255, 255, 0.9)',
//         borderRadius: '4px',
//         fontSize: '12px',
//         fontWeight: 'bold',
//         color: '#333',
//         border: '1px solid rgba(255, 255, 255, 0.3)'
//       }
//     }
//   },
  
//   states: {
//     selected: {
//       background: 'rgba(102, 126, 234, 0.8)',
//       color: 'white',
//       transform: 'scale(0.95)'
//     }
//   },
  
//   onCellClick: (cell, x, y) => {
//     responsiveMatrix.toggleCellState(x, y, 'selected');
//   },
  
//   onResize: (width, height) => {
//     console.log(`📐 Responsive matrix resized: ${width}x${height}px`);
//   }
// });

// // Adding content to responsive cells
// for (let y = 0; y < 2; y++) {
//   for (let x = 0; x < 3; x++) {
//     responsiveMatrix.setCellContent(x, y, `R${y * 3 + x + 1}`);
//   }
// }




