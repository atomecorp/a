// Extracted from console_builder.js: drag + resize wiring for the console container. No mutable state.
export const makeConsoleInteractions = (deps) => {
  const { container, header, position, size, draggable, resizable } = deps;

  function makeDraggable() {
    if (!draggable) return;
    
    const header = container.querySelector('.hs-console-header');
    let isDragging = false;
    let currentX = position.x;
    let currentY = position.y;
    let initialX = 0;
    let initialY = 0;
    let xOffset = position.x;
    let yOffset = position.y;

    // Support souris ET touch pour iOS
    header.addEventListener('mousedown', dragStart);
    header.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);

    function dragStart(e) {
      // Gérer à la fois mouse et touch events
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      
      initialX = clientX - xOffset;
      initialY = clientY - yOffset;
      isDragging = true;
      header.style.cursor = 'grabbing';
      
      // Empêcher le scroll sur mobile
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
    }

    function dragMove(e) {
      if (!isDragging) return;
      
      e.preventDefault();
      
      // Gérer à la fois mouse et touch events
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      
      currentX = clientX - initialX;
      currentY = clientY - initialY;
      
      // Empêcher que la console sorte par le haut (garder au moins la barre de titre visible)
      const minY = 0;
      const maxX = window.innerWidth - 100; // Garder au moins 100px visibles
      const maxY = window.innerHeight - 50; // Garder au moins 50px visibles
      
      // Contraindre les positions
      currentX = Math.max(-size.width + 100, Math.min(maxX, currentX));
      currentY = Math.max(minY, Math.min(maxY, currentY));
      
      xOffset = currentX;
      yOffset = currentY;
      
      container.style.left = `${currentX}px`;
      container.style.top = `${currentY}px`;
    }

    function dragEnd() {
      isDragging = false;
      header.style.cursor = 'move';
    }
  }

  function makeResizable() {
    if (!resizable) return;
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'hs-console-resize-handle';
    resizeHandle.style.cssText = `
      position: absolute;
      bottom: 0;
      right: 0;
      width: 15px;
      height: 15px;
      cursor: se-resize;
      background: linear-gradient(-45deg, transparent 40%, #666 40%, #666 60%, transparent 60%);
    `;
    
    container.appendChild(resizeHandle);
    
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(document.defaultView.getComputedStyle(container).width, 10);
      startHeight = parseInt(document.defaultView.getComputedStyle(container).height, 10);
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      const width = startWidth + e.clientX - startX;
      const height = startHeight + e.clientY - startY;
      
      container.style.width = `${Math.max(300, width)}px`;
      container.style.height = `${Math.max(200, height)}px`;
    });
    
    document.addEventListener('mouseup', () => {
      isResizing = false;
    });
  }

  // === CONSTRUCTION ET ASSEMBLAGE ===

  makeDraggable();
  makeResizable();
};
