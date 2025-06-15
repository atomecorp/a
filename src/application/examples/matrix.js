
// Matrix avec dégradés et sélection par ombres
const matrix = new Matrix({
  id: 'gradient-matrix',
  grid: { x: 4, y: 3 },
  size: { width: 400, height: 300 },
  position: { x: 150, y: 100 },
  spacing: { horizontal: 8, vertical: 8, external: 20 },
  attach: 'body',
  
  // Container avec dégradé
  containerStyle: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
  },
  
  // Style par défaut des cellules avec dégradé et ombre externe
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
  
  // États avec styles d'ombres
  states: {
    selected: {
      // Sélectionné : ombre externe vers ombre interne
      boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
      background: 'linear-gradient(145deg, #e8e8e8 0%, #d0d0d0 100%)'
    },
    
    'selected-clicked': {
      // Sélectionné + cliqué : ajout du contour
      boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
      background: 'linear-gradient(145deg, #e8e8e8 0%, #d0d0d0 100%)',
      border: '3px solid #667eea'
    }
  },
  
  // Gestion des clics
  onCellClick: (cell, x, y, cellId) => {
    const isSelected = matrix.hasCellState(x, y, 'selected');
    const isClickedSelected = matrix.hasCellState(x, y, 'selected-clicked');
    
    if (!isSelected) {
      // Pas sélectionné → Sélectionné (ombre interne)
      matrix.addCellState(x, y, 'selected');
      
    } else if (isSelected && !isClickedSelected) {
      // Sélectionné → Sélectionné + Contour
      matrix.removeCellState(x, y, 'selected');
      matrix.addCellState(x, y, 'selected-clicked');
      
    } else {
      // Sélectionné + Contour → Désélectionné (style original)
      matrix.removeCellState(x, y, 'selected-clicked');
      matrix.resetCellStyle(x, y);
    }
  }
});

// Ajout de numéros dans les cellules
for (let y = 0; y < 3; y++) {
  for (let x = 0; x < 4; x++) {
    matrix.setCellContent(x, y, (y * 4 + x + 1).toString());
  }
}



