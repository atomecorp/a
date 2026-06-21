/**
 * Fonction de drag avancée avec support drag & drop HTML5
 * @param {HTMLElement} element - L'élément à rendre draggable
 * @param {Object} options - Options de configuration
 */
function makeDraggableWithDrop(element, options = {}) {
  const {
    onDragStart = () => { },
    onDragMove = () => { },
    onDragEnd = () => { },
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
    onHTML5DragStart = () => { },
    onHTML5DragEnd = () => { },
    onDropDetection = () => { } // Callback pour détecter les zones de drop en mode classique
  } = options;

  // Configuration CSS de base
  element.style.cursor = cursor;
  element.style.userSelect = 'none';
  element.style.touchAction = 'none';

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
        // Nettoyer et sortir immédiatement
        element.removeAttribute('data-dragging');
        element.removeAttribute('data-drag-id');
        element.removeAttribute('data-moved');
        element.removeAttribute('data-drop-successful');
        return;
      }

      // Si pas de drop réussi, restaurer normalement
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

    const startClassicDrag = (startEvent, mode = 'mouse') => {
      // Si HTML5 drag est activé ET que c'est un clic gauche souris, laisser HTML5 gérer
      if (enableHTML5) {
        const isMouse = mode === 'mouse' || startEvent.pointerType === 'mouse';
        if (isMouse && startEvent.button === 0 && startEvent.target && startEvent.target.draggable) return;
      }

      // Empêcher le comportement par défaut
      startEvent.preventDefault();
      startEvent.stopPropagation();

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

      // Créer un élément ghost qui suit le pointeur
      createGhostElement(startEvent.clientX, startEvent.clientY);

      // Appliquer la classe de drag à l'original
      if (dragStartClass) element.classList.add(dragStartClass);

      const startX = startEvent.clientX;
      const startY = startEvent.clientY;

      // Callback de début
      onDragStart(element, startX, startY, 0, 0);

      const onMove = (e) => {
        if (!isDraggingClassic) return;

        if (ghostElement) {
          ghostElement.style.left = (e.clientX - 30) + 'px';
          ghostElement.style.top = (e.clientY - 20) + 'px';
        }

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        onDragMove(element, e.clientX, e.clientY, deltaX, deltaY);
        e.preventDefault();
      };

      const onEnd = (e) => {
        if (!isDraggingClassic) return;

        isDraggingClassic = false;

        if (dragStartClass) element.classList.remove(dragStartClass);

        if (originalPosition) {
          element.style.transition = originalPosition.transition;
        }

        if (onDropDetection) {
          onDropDetection(element, e.clientX, e.clientY);
        }

        removeGhostElement();

        onDragEnd(element, e.clientX, e.clientY, e.clientX - startX, e.clientY - startY);

        if (mode === 'pointer') {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onEnd);
          document.removeEventListener('pointercancel', onEnd);
        } else {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onEnd);
          document.removeEventListener('mouseleave', onEnd);
        }
      };

      if (mode === 'pointer') {
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onEnd);
        document.addEventListener('pointercancel', onEnd);
      } else {
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('mouseleave', onEnd);
      }
    };

    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
    const onPointerDownClassic = (e) => {
      if (e.isPrimary === false) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startClassicDrag(e, 'pointer');
    };
    const onMouseDownClassic = (e) => startClassicDrag(e, 'mouse');
    if (supportsPointer) {
      element.addEventListener('pointerdown', onPointerDownClassic, { passive: false });
    } else {
      element.addEventListener('mousedown', onMouseDownClassic);
    }
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
  // Fonction de nettoyage améliorée
  return () => {
    if (supportsPointer) element.removeEventListener('pointerdown', onPointerDownClassic);
    else element.removeEventListener('mousedown', onMouseDownClassic);
    element.style.cursor = '';
    element.style.userSelect = '';
    element.style.touchAction = '';
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

export { makeDraggableWithDrop };
