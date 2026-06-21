import { $, define } from '../squirrel.js';
import { makeDropZone } from './draggable_drop_zone.js';
import { makeDraggableWithDrop } from './draggable_with_drop.js';
import { makeDraggable } from './draggable_core.js';

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

// Template pour une drop zone
define('drop-zone', {
  tag: 'div',
  class: 'hs-drop-zone',
  css: {
    position: 'relative',
    minHeight: '100px',
    border: '2px dashed #bdc3c7',
    borderRadius: '8px',
    backgroundColor: '#ecf0f1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#7f8c8d',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    margin: '10px'
  }
});

// Styles pour les états des drop zones
define('drop-zone-active', {
  css: {
    borderColor: '#3498db',
    backgroundColor: '#ebf3fd',
    color: '#2980b9'
  }
});

define('drop-zone-hover', {
  css: {
    borderColor: '#27ae60',
    backgroundColor: '#e8f5e8',
    color: '#27ae60',
    transform: 'scale(1.02)'
  }
});

define('drop-zone-reject', {
  css: {
    borderColor: '#e74c3c',
    backgroundColor: '#fdf2f2',
    color: '#c0392b'
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
    onDragStart = () => { },
    onDragMove = () => { },
    onDragEnd = () => { },

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
export { draggable };

// Alias pour compatibilité avec l'ancien pattern
const Draggable = draggable;
Draggable.makeDraggable = makeDraggable;
export { Draggable };

// Export par défaut - fonction directe pour usage: Draggable({...})
export default draggable;

// Export des utilitaires supplémentaires
export {
  makeDraggable,
  makeDraggableWithDrop,
  makeDropZone
};
