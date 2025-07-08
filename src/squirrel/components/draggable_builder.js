import { $, define } from '../squirrel.js';

/**
 * Composant Draggable avec HyperSquirrel
 * Rend n'importe quel élément draggable avec des callbacks personnalisables
 */

// === FONCTION UTILITAIRE DE DRAG & DROP ===

/**
 * Fonction pour créer des zones de drop
 * @param {HTMLElement|string} element - L'élément ou sélecteur de la drop zone
 * @param {Object} options - Options de configuration
 */
function makeDropZone(element, options = {}) {
  const {
    onDragEnter = () => {},
    onDragOver = () => {},
    onDragLeave = () => {},
    onDrop = () => {},
    acceptTypes = [], // Types de données acceptées
    hoverClass = 'drop-hover',
    activeClass = 'drop-active',
    acceptClass = 'drop-accept',
    rejectClass = 'drop-reject'
  } = options;

  const dropElement = typeof element === 'string' ? document.querySelector(element) : element;
  if (!dropElement) return;

  let dragCounter = 0; // Pour gérer les événements imbriqués

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounter++;
    
    if (dragCounter === 1) {
      dropElement.classList.add(hoverClass);
      onDragEnter(e, dropElement);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(e, dropElement);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter--;
    
    if (dragCounter === 0) {
      dropElement.classList.remove(hoverClass, acceptClass, rejectClass);
      onDragLeave(e, dropElement);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    
    dropElement.classList.remove(hoverClass, acceptClass, rejectClass);
    
    // Récupérer les données transférées
    const transferData = {};
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        Object.assign(transferData, JSON.parse(jsonData));
      }
    } catch (err) {
      console.warn('Erreur parsing des données de drop:', err);
    }
    
    // Récupérer les données texte
    transferData.text = e.dataTransfer.getData('text/plain');
    
    // Trouver l'élément source par son ID de drag
    let sourceElement = null;
    if (transferData.dragId) {
      sourceElement = document.querySelector(`[data-drag-id="${transferData.dragId}"]`);
    }
    
    // CRUCIAL: Marquer l'élément source comme ayant un drop réussi IMMÉDIATEMENT
    if (sourceElement) {
      sourceElement.setAttribute('data-drop-successful', 'true');
      sourceElement.setAttribute('data-moved', 'true');
      
      // Utiliser la fonction pour marquer le drop comme réussi
      if (sourceElement._markDropSuccessful) {
        sourceElement._markDropSuccessful();
      }
      
      console.log('🎯 Marked source element as successfully dropped');
    }
    
    // Appeler la fonction de drop
    onDrop(e, dropElement, transferData, sourceElement);
  };

  // Attacher les événements
  dropElement.addEventListener('dragenter', handleDragEnter);
  dropElement.addEventListener('dragover', handleDragOver);
  dropElement.addEventListener('dragleave', handleDragLeave);
  dropElement.addEventListener('drop', handleDrop);

  // Fonction de nettoyage
  return () => {
    dropElement.removeEventListener('dragenter', handleDragEnter);
    dropElement.removeEventListener('dragover', handleDragOver);
    dropElement.removeEventListener('dragleave', handleDragLeave);
    dropElement.removeEventListener('drop', handleDrop);
    dropElement.classList.remove(hoverClass, activeClass, acceptClass, rejectClass);
  };
}

/**
 * Fonction de drag avancée avec support drag & drop HTML5
 * @param {HTMLElement} element - L'élément à rendre draggable
 * @param {Object} options - Options de configuration
 */
function makeDraggableWithDrop(element, options = {}) {
  const {
    onDragStart = () => {},
    onDragMove = () => {},
    onDragEnd = () => {},
    cursor = 'move',
    constrainToParent = false,
    bounds = null,
    rotationFactor = 0,
    scaleFactor = 0,
    // Nouvelles options pour drag & drop
    enableHTML5 = true,
    transferData = {},
    ghostImage = null,
    dragStartClass = 'dragging',
    onHTML5DragStart = () => {},
    onHTML5DragEnd = () => {},
    onDropDetection = () => {} // Callback pour détecter les zones de drop en mode classique
  } = options;

  // Configuration CSS de base
  element.style.cursor = cursor;
  element.style.userSelect = 'none';
  
  // Activer le drag HTML5 si demandé
  if (enableHTML5) {
    element.draggable = true;
  }

  // Variables pour stocker la position originale et le ghost
  let originalPosition = null;
  let ghostElement = null;
  let isDraggingClassic = false;

  // === DRAG HTML5 ===
  if (enableHTML5) {
    let dragEndHandler = null;
    let dragStartHandler = null;
    let isDropSuccessful = false;
    
    dragStartHandler = (e) => {
      if (dragStartClass) element.classList.add(dragStartClass);
      isDropSuccessful = false;
      
      // Configurer l'image fantôme
      if (ghostImage) {
        e.dataTransfer.setDragImage(ghostImage, 0, 0);
      }
      
      // Transférer les données avec un identifiant unique
      e.dataTransfer.effectAllowed = 'move';
      let uniqueTransferData = {};
      if (transferData) {
        uniqueTransferData = {
          ...transferData,
          dragStartTime: Date.now(),
          dragId: transferData.dragId || Math.random().toString(36).substr(2, 9)
        };
        e.dataTransfer.setData('application/json', JSON.stringify(uniqueTransferData));
      }
      e.dataTransfer.setData('text/plain', element.textContent || '');
      
      // Marquer l'élément comme en cours de drag
      element.setAttribute('data-dragging', 'true');
      element.setAttribute('data-drag-id', uniqueTransferData.dragId || 'unknown');
      
      // Réinitialiser les flags
      element.removeAttribute('data-moved');
      element.removeAttribute('data-drop-successful');
      
      onHTML5DragStart(e, element);
    };
    
    dragEndHandler = (e) => {
      if (dragStartClass) element.classList.remove(dragStartClass);
      
      // Si le drop est réussi, on ignore complètement dragend
      if (isDropSuccessful || element.getAttribute('data-drop-successful') === 'true') {
        console.log('Drop successful - ignoring dragend completely');
        // Nettoyer et sortir immédiatement
        element.removeAttribute('data-dragging');
        element.removeAttribute('data-drag-id');
        element.removeAttribute('data-moved');
        element.removeAttribute('data-drop-successful');
        return;
      }
      
      // Si pas de drop réussi, restaurer normalement
      console.log('No successful drop - restoring element');
      element.removeAttribute('data-dragging');
      element.removeAttribute('data-drag-id');
      element.removeAttribute('data-moved');
      element.removeAttribute('data-drop-successful');
      
      onHTML5DragEnd(e, element);
    };

    element.addEventListener('dragstart', dragStartHandler);
    element.addEventListener('dragend', dragEndHandler);
    
    // Stocker la référence pour pouvoir marquer le drop comme réussi
    element._markDropSuccessful = () => {
      isDropSuccessful = true;
      element.setAttribute('data-drop-successful', 'true');
    };
  }

  // === DRAG CLASSIQUE OPTIMISÉ (avec ghost) ===
  const onMouseDown = (e) => {
    // Si HTML5 drag est activé ET que c'est un clic gauche, laisser HTML5 gérer
    if (enableHTML5 && e.button === 0 && e.target.draggable) return;
    
    // Empêcher le comportement par défaut
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingClassic = true;
    
    // Désactiver temporairement les transitions sur l'élément original
    const originalTransition = element.style.transition;
    element.style.transition = 'none';
    
    // Sauvegarder la position originale
    const rect = element.getBoundingClientRect();
    originalPosition = {
      x: rect.left,
      y: rect.top,
      transform: element.style.transform || '',
      transition: originalTransition
    };
    
    // Créer un élément ghost qui suit la souris
    createGhostElement(e.clientX, e.clientY);
    
    // Appliquer la classe de drag à l'original
    if (dragStartClass) element.classList.add(dragStartClass);
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    // Callback de début
    onDragStart(element, startX, startY, 0, 0);

    const onMouseMove = (e) => {
      if (!isDraggingClassic) return;
      
      // Déplacer le ghost, pas l'élément original
      if (ghostElement) {
        ghostElement.style.left = (e.clientX - 30) + 'px'; // Offset pour centrer
        ghostElement.style.top = (e.clientY - 20) + 'px';
      }
      
      // Callback de mouvement
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      onDragMove(element, e.clientX, e.clientY, deltaX, deltaY);
    };

    const onMouseUp = (e) => {
      if (!isDraggingClassic) return;
      
      isDraggingClassic = false;
      
      // Supprimer la classe de drag
      if (dragStartClass) element.classList.remove(dragStartClass);
      
      // Restaurer la transition originale
      if (originalPosition) {
        element.style.transition = originalPosition.transition;
      }
      
      // Détection de drop
      let dropSuccess = false;
      if (onDropDetection) {
        try {
          onDropDetection(element, e.clientX, e.clientY);
          dropSuccess = true;
        } catch (err) {
          // console.log('Pas de zone de drop détectée');
        }
      }
      
      // Nettoyer le ghost
      removeGhostElement();
      
      // Remettre l'élément à sa position originale (il n'a jamais bougé)
      // L'élément reste à sa place, seul le ghost bougeait
      
      // Callback de fin
      onDragEnd(element, e.clientX, e.clientY, e.clientX - startX, e.clientY - startY);

      // Nettoyer les événements
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseUp);
    };

    // Attacher les événements globalement pour capturer même en dehors de l'élément
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseUp);
  };

  // Fonction pour créer l'élément ghost
  function createGhostElement(x, y) {
    ghostElement = element.cloneNode(true);
    ghostElement.style.position = 'fixed';
    ghostElement.style.left = (x - 30) + 'px';
    ghostElement.style.top = (y - 20) + 'px';
    ghostElement.style.width = element.offsetWidth + 'px';
    ghostElement.style.height = element.offsetHeight + 'px';
    ghostElement.style.opacity = '0.7';
    ghostElement.style.transform = 'scale(0.95)'; // Pas de rotation
    ghostElement.style.zIndex = '9999';
    ghostElement.style.pointerEvents = 'none';
    ghostElement.style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)';
    ghostElement.style.borderRadius = '8px';
    ghostElement.style.transition = 'none'; // ← IMPORTANT: Pas de transition sur le ghost
    
    // Ajouter une bordure pour distinguer le ghost
    ghostElement.style.border = '2px solid rgba(255,255,255,0.5)';
    
    document.body.appendChild(ghostElement);
  }
  
  // Fonction pour supprimer l'élément ghost
  function removeGhostElement() {
    if (ghostElement && ghostElement.parentNode) {
      ghostElement.parentNode.removeChild(ghostElement);
      ghostElement = null;
    }
  }

  element.addEventListener('mousedown', onMouseDown);

  // Fonction de nettoyage améliorée
  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    element.style.cursor = '';
    element.style.userSelect = '';
    element.draggable = false;
    
    // Nettoyer le ghost s'il existe encore
    removeGhostElement();
    
    // Remettre la position originale si nécessaire
    if (originalPosition) {
      element.style.transform = originalPosition.transform;
      element.style.transition = originalPosition.transition;
    }
  };
}

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
    let isDragging = false;  // Changé: ne commence pas à true
    let hasStarted = false;  // Nouveau: track si le drag a vraiment commencé
    let lastX = e.clientX;
    let lastY = e.clientY;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 5; // Seuil de mouvement pour commencer le drag

    // Changer le curseur
    const originalCursor = element.style.cursor;

    const onMouseMove = (e) => {
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      const totalMoveX = e.clientX - startX;
      const totalMoveY = e.clientY - startY;
      const totalDistance = Math.sqrt(totalMoveX * totalMoveX + totalMoveY * totalMoveY);

      // Vérifier si on dépasse le seuil pour commencer le drag
      if (!hasStarted && totalDistance > DRAG_THRESHOLD) {
        hasStarted = true;
        isDragging = true;
        element.style.cursor = cursor === 'grab' ? 'grabbing' : cursor;
        onDragStart(element, startX, startY, currentX, currentY);
      }

      if (!isDragging) return;

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
      element.style.cursor = originalCursor;

      // Ne déclencher onDragEnd que si le drag a vraiment commencé
      if (hasStarted) {
        onDragEnd(element, currentX, currentY, currentX, currentY);
      }

      isDragging = false;
      hasStarted = false;

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