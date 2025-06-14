// import('./examples/basic.js');
// import('./examples/button.js');
// import('./examples/sliders.js');
// import('./examples/drag.js');
/**
 * Fonction de drag ultra-performante avec transform
 */


function draggable(element, options = {}) {
  const {
    onDragStart = () => {},
    onDragMove = () => {},
    onDragEnd = () => {},
    cursor = 'move'
  } = options;

  // Configuration CSS de base
  element.style.cursor = cursor;
  element.style.userSelect = 'none';

  // Variables pour stocker la translation
  let currentX = 0;
  let currentY = 0;

  const onMouseDown = (e) => {
    let isDragging = true;
    let lastX = e.clientX;
    let lastY = e.clientY;

    console.log('🟡 DEBUG transform drag start:', { lastX, lastY, currentX, currentY });

    // Changer le curseur
    const originalCursor = element.style.cursor;
    element.style.cursor = cursor === 'grab' ? 'grabbing' : cursor;

    onDragStart(element, lastX, lastY, currentX, currentY);

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      currentX += deltaX;
      currentY += deltaY;

      // Appliquer la transformation de base
      element.style.transform = `translate(${currentX}px, ${currentY}px)`;

      console.log('🟡 DEBUG transform move:', { deltaX, deltaY, currentX, currentY });

      // Callback de mouvement (peut modifier le transform)
      onDragMove(element, currentX, currentY, deltaX, deltaY);

      // Mettre à jour les positions de référence
      lastX = e.clientX;
      lastY = e.clientY;

      e.preventDefault();
    };

    const onMouseUp = (e) => {
      isDragging = false;
      element.style.cursor = originalCursor;

      onDragEnd(element, currentX, currentY, currentX, currentY);

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseUp);

    e.preventDefault();
  };

  element.addEventListener('mousedown', onMouseDown);

  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    element.style.cursor = '';
    element.style.userSelect = '';
    element.style.transform = '';
  };
}

// Création du premier élément draggable (rouge)
const redElement = $('span', {
  tag: 'span',
  id: 'monSpan',  
  css: {
   position: 'absolute', 
   left: '333px',
   top: '333px',
   width: '100px',
   height: '100px',
   backgroundColor: 'red',
   margin: '10px'
 }
});

// Rendre l'élément rouge draggable avec la nouvelle méthode
draggable(redElement, {
  cursor: 'grab',
  onDragStart: (element, startX, startY, currentX, currentY) => {
    console.log('🔴 Début drag rouge (transform):', { startX, startY, currentX, currentY });
    element.style.zIndex = '1000';
  },
  onDragMove: (element, currentX, currentY, deltaX, deltaY) => {
    // Optionnel : feedback visuel pendant le drag
    element.style.opacity = '0.8';
  },
  onDragEnd: (element, endX, endY, totalX, totalY) => {
    console.log('🔴 Fin drag rouge (transform):', { endX, endY, totalX, totalY });
    element.style.opacity = '1';
    element.style.zIndex = '';
  }
});

// Création du deuxième élément draggable (bleu)
const blueElement = $('span', {
  tag: 'div',
  id: 'monSpan2',
  parent: '#monSpan', 
  css: {
   position: 'absolute', 
   left: '33px',
   top: '33px',
   width: '100px',
   height: '100px',
   backgroundColor: 'blue',
   margin: '10px'
 }
});

// Test de l'élément bleu avec rotation corrigée
draggable(blueElement, {
  cursor: 'move',
  onDragStart: (element, startX, startY, currentX, currentY) => {
    console.log('🔵 Début drag bleu (transform):', { startX, startY, currentX, currentY });
    element.style.border = '2px solid yellow';
    element.style.transformOrigin = 'center center';
    // Stocker la position de départ pour calculer la direction globale
    element._startDragX = startX;
    element._startDragY = startY;
    event.stopPropagation();
  },
  onDragMove: (element, currentX, currentY, deltaX, deltaY) => {
    console.log('🔵 Mouvement bleu (transform):', { currentX, currentY, deltaX, deltaY });
    
    // Calculer la direction globale depuis le début du drag
    const totalDeltaX = currentX;
    const totalDeltaY = currentY;
    
    // Rotation basée sur la direction globale (plus prononcée)
    let rotation = 0;
    if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) { // Seuil minimum pour éviter les micro-rotations
      rotation = Math.atan2(totalDeltaY, totalDeltaX) * (180 / Math.PI) * 0.5; // Facteur 0.5 pour plus de rotation
    }
    
    // Combiner translation ET rotation
    element.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
  },
  onDragEnd: (element, endX, endY, totalX, totalY) => {
    console.log('🔵 Fin drag bleu (transform):', { endX, endY, totalX, totalY });
    element.style.border = '';
    // Garder seulement la translation finale, supprimer la rotation
    element.style.transform = `translate(${totalX}px, ${totalY}px)`;
    element.style.transformOrigin = '';
    // Nettoyer les variables temporaires
    delete element._startDragX;
    delete element._startDragY;
  }
});

// Exemple d'utilisation avancée : élément avec la nouvelle méthode
const greenElement = $('div', {
  id: 'greenBox',
  css: {
    position: 'absolute',
    left: '200px',
    top: '200px',
    width: '80px',
    height: '80px',
    backgroundColor: 'green',
    borderRadius: '50%'
  }
});

// Drag avec la nouvelle méthode transform
draggable(greenElement, {
  cursor: 'grab',
  onDragStart: (element) => {
    console.log('🟢 Début drag vert (transform)');
    element.style.boxShadow = '0 0 20px rgba(0,255,0,0.5)';
  },
  onDragEnd: (element) => {
    console.log('🟢 Fin drag vert (transform)');
    element.style.boxShadow = '';
  }
});
