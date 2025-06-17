// === TESTS DU COMPOSANT DRAGGABLE ===

// Test 1: Draggable basique avec template
const basicDrag = Draggable('draggable-box', {
  content: '🔴 Basic',
  css: {
    left: '100px',
    top: '100px',
    backgroundColor: '#e74c3c'
  },
  onDragStart: (el) => {
    console.log('🔴 Début drag basique');
  },
  onDragEnd: (el) => {
    console.log('🔴 Fin drag basique');
  }
});

// Test 2: Draggable avec rotation
const rotatingDrag = Draggable('draggable-box', {
  content: '🔵 Rotation',
  css: {
    left: '250px',
    top: '100px',
    backgroundColor: '#3498db'
  },
  rotationFactor: 0.5, // Rotation basée sur la direction
  onDragStart: (el) => {
    console.log('🔵 Début drag avec rotation');
    el.style.transformOrigin = 'center center';
  },
  onDragEnd: (el) => {
    console.log('🔵 Fin drag avec rotation');
    // Garder seulement la position, enlever la rotation
    const transform = el.style.transform;
    const translateMatch = transform.match(/translate\([^)]+\)/);
    if (translateMatch) {
      el.style.transform = translateMatch[0];
    }
  }
});

// Test 3: Draggable avec scale
const scalingDrag = Draggable('draggable-box', {
  content: '🟢 Scale',
  css: {
    left: '400px',
    top: '100px',
    backgroundColor: '#2ecc71'
  },
  scaleFactor: 2, // Scale basé sur la distance
  onDragStart: (el) => {
    console.log('🟢 Début drag avec scale');
  },
  onDragEnd: (el) => {
    console.log('🟢 Fin drag avec scale');
    // Remettre scale à 1
    const transform = el.style.transform;
    const translateMatch = transform.match(/translate\([^)]+\)/);
    if (translateMatch) {
      el.style.transform = translateMatch[0];
    }
  }
});

// Test 4: Draggable custom avec makeDraggable directement
const customElement = $('div', {
  content: '🟡 Custom',
  css: {
    position: 'absolute',
    left: '550px',
    top: '100px',
    width: '120px',
    height: '60px',
    backgroundColor: '#f39c12',
    border: '3px dashed #e67e22',
    borderRadius: '15px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: 'bold'
  }
});

// Appliquer makeDraggable directement
makeDraggable(customElement, {
  cursor: 'grab',
  rotationFactor: 0.3,
  onDragStart: (el) => {
    console.log('🟡 Début drag custom');
    el.style.border = '3px solid #e67e22';
  },
  onDragEnd: (el) => {
    console.log('🟡 Fin drag custom');
    el.style.border = '3px dashed #e67e22';
  }
});

// === TEST D'OBJETS DRAGGABLES IMBRIQUÉS ===

// Créer le conteneur parent draggable
const parentDrag = Draggable('draggable-box', {
  content: '🟣 Parent',
  css: {
    left: '100px',
    top: '300px',
    width: '200px',
    height: '150px',
    backgroundColor: '#9b59b6',
    borderRadius: '12px',
    fontSize: '16px'
  },
  cursor: 'grab',
  onDragStart: (el) => {
    console.log('🟣 Début drag parent');
    el.style.boxShadow = '0 8px 16px rgba(155, 89, 182, 0.3)';
  },
  onDragEnd: (el) => {
    console.log('🟣 Fin drag parent');
    el.style.boxShadow = '';
  }
});

// Créer l'enfant draggable DANS le parent
const childDrag = Draggable('draggable-box', {
  content: '🟠 Enfant',
  css: {
    left: '20px',
    top: '40px',
    width: '80px',
    height: '60px',
    backgroundColor: '#e67e22',
    borderRadius: '8px',
    fontSize: '12px'
  },
  parent: parentDrag, // L'enfant est placé dans le parent
  cursor: 'move',
  rotationFactor: 0.4, // L'enfant tourne quand on le déplace
  onDragStart: (el) => {
    console.log('🟠 Début drag enfant');
    el.style.border = '2px solid #d35400';
    el.style.zIndex = '1000'; // Au-dessus du parent pendant le drag
    event.stopPropagation(); // Empêcher le drag du parent
  },
  onDragMove: (el, currentX, currentY, deltaX, deltaY) => {
    console.log('🟠 Mouvement enfant:', { currentX, currentY });
  },
  onDragEnd: (el) => {
    console.log('🟠 Fin drag enfant');
    el.style.border = '';
    el.style.zIndex = '';
    // Garder seulement la position, enlever la rotation
    const transform = el.style.transform;
    const translateMatch = transform.match(/translate\([^)]+\)/);
    if (translateMatch) {
      el.style.transform = translateMatch[0];
    }
  }
});

// Créer un deuxième enfant dans le même parent
const child2Drag = Draggable('draggable-box', {
  content: '🟢 Enfant 2',
  css: {
    left: '100px',
    top: '70px',
    width: '70px',
    height: '50px',
    backgroundColor: '#27ae60',
    borderRadius: '8px',
    fontSize: '11px'
  },
  parent: parentDrag, // Deuxième enfant dans le même parent
  cursor: 'grab',
  scaleFactor: 3, // Cet enfant grandit pendant le drag
  onDragStart: (el) => {
    console.log('🟢 Début drag enfant 2');
    el.style.outline = '2px dashed #2ecc71';
    event.stopPropagation(); // Empêcher le drag du parent
  },
  onDragEnd: (el) => {
    console.log('🟢 Fin drag enfant 2');
    el.style.outline = '';
    // Remettre scale à normal
    const transform = el.style.transform;
    const translateMatch = transform.match(/translate\([^)]+\)/);
    if (translateMatch) {
      el.style.transform = translateMatch[0];
    }
  }
});