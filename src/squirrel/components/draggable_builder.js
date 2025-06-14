import { $, define } from '../squirrel.js';

/**
 * Composant Draggable avec HyperSquirrel
 * Rend n'importe quel élément draggable avec des callbacks personnalisables
 */

// === FONCTION UTILITAIRE DE DRAG ===

/**
 * Fonction de drag ultra-performante avec transform
 * @param {HTMLElement} element - L'élément à rendre draggable
 * @param {Object} options - Options de configuration
 */
function makeDraggable(element, options = {}) {
  const {
    onDragStart = () => {},
    onDragMove = () => {},
    onDragEnd = () => {},
    cursor = 'move',
    constrainToParent = false,
    bounds = null,
    rotationFactor = 0,
    scaleFactor = 0
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

      // Construire le transform avec les effets demandés
      let transformParts = [`translate(${currentX}px, ${currentY}px)`];

      // Ajouter rotation si demandée
      if (rotationFactor > 0) {
        const totalDeltaX = currentX;
        const totalDeltaY = currentY;
        if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) {
          const rotation = Math.atan2(totalDeltaY, totalDeltaX) * (180 / Math.PI) * rotationFactor;
          transformParts.push(`rotate(${rotation}deg)`);
        }
      }

      // Ajouter scale si demandé
      if (scaleFactor > 0) {
        const distance = Math.sqrt(currentX * currentX + currentY * currentY);
        const scale = 1 + (distance * scaleFactor * 0.001);
        transformParts.push(`scale(${Math.min(scale, 1.5)})`); // Max scale 1.5
      }

      // Appliquer la transformation
      element.style.transform = transformParts.join(' ');

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

// === TEMPLATES POUR DRAGGABLE ===

// Template pour un élément draggable basique
define('draggable-box', {
  tag: 'div',
  class: 'hs-draggable',
  css: {
    position: 'absolute',
    width: '100px',
    height: '100px',
    backgroundColor: '#3498db',
    border: '2px solid #2980b9',
    borderRadius: '8px',
    cursor: 'grab',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: 'bold',
    transition: 'box-shadow 0.2s ease'
  }
});

// Template pour un handle de drag
define('drag-handle', {
  tag: 'div',
  class: 'hs-drag-handle',
  css: {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    height: '30px',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: '8px 8px 0 0',
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
});

// === BUILDER PRINCIPAL ===

/**
 * Créer un élément draggable avec template et options
 * @param {string} template - Template à utiliser
 * @param {Object} config - Configuration du draggable
 */
function draggable(template = 'draggable-box', config = {}) {
  const {
    // Options de création
    content = 'Drag me!',
    css = {},
    attrs = {},
    parent = null,
    
    // Options de drag
    cursor = 'grab',
    rotationFactor = 0,
    scaleFactor = 0,
    constrainToParent = false,
    bounds = null,
    
    // Callbacks
    onDragStart = () => {},
    onDragMove = () => {},
    onDragEnd = () => {},
    
    // Options d'apparence
    dragActiveClass = 'dragging',
    dragHoverShadow = '0 8px 16px rgba(0,0,0,0.2)'
  } = config;

  // Créer l'élément avec le template
  const element = $(template, {
    content,
    css,
    attrs,
    parent
  });

  // Rendre l'élément draggable
  const destroyDrag = makeDraggable(element, {
    cursor,
    rotationFactor,
    scaleFactor,
    constrainToParent,
    bounds,
    onDragStart: (el, x, y, currentX, currentY) => {
      if (dragActiveClass) el.classList.add(dragActiveClass);
      if (dragHoverShadow) el.style.boxShadow = dragHoverShadow;
      onDragStart(el, x, y, currentX, currentY);
    },
    onDragMove: (el, currentX, currentY, deltaX, deltaY) => {
      onDragMove(el, currentX, currentY, deltaX, deltaY);
    },
    onDragEnd: (el, endX, endY, totalX, totalY) => {
      if (dragActiveClass) el.classList.remove(dragActiveClass);
      if (dragHoverShadow) el.style.boxShadow = '';
      onDragEnd(el, endX, endY, totalX, totalY);
    }
  });

  // Attacher la fonction de destruction à l'élément
  element.destroyDraggable = destroyDrag;

  return element;
}

// === EXPORTS ===
export { draggable, makeDraggable };