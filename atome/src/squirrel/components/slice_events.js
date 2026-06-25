// Extracted from slice_builder.js: Slice events methods (prototype mixin; `this` bound to the Slice instance).
import { makeDraggable, makeDraggableWithDrop, makeDropZone } from './draggable_builder.js';

export const sliceEventMethods = {
  setupInteractions() {
    this.setupContentEvents();
    this.setupZoneEvents();
    this.setupDragDrop(); // Nouveau : configurer le drag & drop
  },
  
  // Nouvelle méthode pour configurer le drag & drop
  setupDragDrop() {
    const dragConfig = this.config.dragDrop || {};
    
    // 1. Configurer la slice comme draggable si demandé
    if (dragConfig.enabled) {
      const handle = dragConfig.handle || this.topZone; // Handle par défaut = zone du haut
      
      if (dragConfig.enableHTML5) {
        // Utiliser le drag HTML5 avancé
        this.dragDestroy = makeDraggableWithDrop(this.element, {
          enableHTML5: true,
          transferData: {
            type: 'slice',
            id: this.element.id || `slice-${Date.now()}`,
            ...dragConfig.transferData
          },
          onDragStart: (element, event) => {
            this.element.isDragging = true;
            this.dragJustEnded = false;
            if (dragConfig.onDragStart) {
              dragConfig.onDragStart(this, event);
            }
          },
          onDragEnd: (element, event) => {
            this.element.isDragging = false;
            this.dragJustEnded = true;
            setTimeout(() => {
              this.dragJustEnded = false;
            }, 50);
            if (dragConfig.onDragEnd) {
              dragConfig.onDragEnd(this, event);
            }
          }
        });
      } else {
        // Utiliser le drag classique simple
        this.dragDestroy = makeDraggable(this.element, {
          onDragStart: () => {
            this.element.isDragging = true;
            this.dragJustEnded = false;
            if (dragConfig.onDragStart) {
              dragConfig.onDragStart(this);
            }
          },
          onDragEnd: () => {
            this.element.isDragging = false;
            this.dragJustEnded = true;
            setTimeout(() => {
              this.dragJustEnded = false;
            }, 50);
            if (dragConfig.onDragEnd) {
              dragConfig.onDragEnd(this);
            }
          }
        });
      }
    }
    
    // 2. Configurer la slice comme drop zone si demandé
    if (dragConfig.dropZone && dragConfig.dropZone.enabled) {
      const dropConfig = dragConfig.dropZone;
      
      this.dropDestroy = makeDropZone(this.contentZone, {
        onDragEnter: (event, element) => {
          element.classList.add(dropConfig.hoverClass || 'slice-drop-hover');
          this.bottomZone.textContent = '📦 Zone de drop active';
          if (dropConfig.onDragEnter) {
            dropConfig.onDragEnter(this, event);
          }
        },
        onDragLeave: (event, element) => {
          element.classList.remove(dropConfig.hoverClass || 'slice-drop-hover');
          this.bottomZone.textContent = this.config.zones.bottomText;
          if (dropConfig.onDragLeave) {
            dropConfig.onDragLeave(this, event);
          }
        },
        onDrop: (event, element, transferData) => {
          element.classList.remove(dropConfig.hoverClass || 'slice-drop-hover');
          this.bottomZone.textContent = '✅ Drop réussi !';
          
          // Créer un objet avec les données droppées
          this.addObject();
          const newObj = this.contentZone.lastElementChild;
          if (newObj && transferData.text) {
            newObj.textContent = `📦 ${transferData.text}`;
          }
          
          setTimeout(() => {
            this.bottomZone.textContent = this.config.zones.bottomText;
          }, 2000);
          
          if (dropConfig.onDrop) {
            dropConfig.onDrop(this, transferData, event);
          }
        }
      });
    }
  },
  
  setupContentEvents() {
    const contentEvents = this.config.content.events || {};
    
    // Clic sur la zone de contenu - logique simplifiée et robuste
    this.contentZone.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Protection principale: vérifier si la slice entière est en cours de drag OU vient de finir
      if (this.element.isDragging || this.dragJustEnded) {
        return; // Pas de log pour éviter le spam
      }
      
      // Événement personnalisé ou comportement par défaut
      if (contentEvents.onClick) {
        contentEvents.onClick(this, e);
      } else if (this.config.behaviors.createOnContentClick) {
        this.addObject();
      }
    });
    
    // Double clic
    this.contentZone.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (contentEvents.onDoubleClick) {
        contentEvents.onDoubleClick(this, e);
      }
    });
    
    // Mouse down pour les événements personnalisés
    this.contentZone.addEventListener('mousedown', (e) => {
      if (contentEvents.onMouseDown) {
        contentEvents.onMouseDown(this, e);
      }
    });
    
    // Mouse up
    this.contentZone.addEventListener('mouseup', (e) => {
      if (contentEvents.onMouseUp) {
        contentEvents.onMouseUp(this, e);
      }
    });
    
    // Clic droit
    this.contentZone.addEventListener('contextmenu', (e) => {
      if (this.config.behaviors.preventContextMenu) {
        e.preventDefault();
      }
      if (contentEvents.onRightClick) {
        contentEvents.onRightClick(this, e);
      }
    });
    
    // Hover
    this.contentZone.addEventListener('mouseenter', (e) => {
      this.contentZone.style.backgroundColor = this.config.content.hoverColor;
      if (contentEvents.onHover) {
        contentEvents.onHover(this, true, e);
      }
    });
    
    this.contentZone.addEventListener('mouseleave', (e) => {
      this.contentZone.style.backgroundColor = this.config.content.backgroundColor;
      if (contentEvents.onHover) {
        contentEvents.onHover(this, false, e);
      }
    });
    
    // Scroll
    this.contentZone.addEventListener('scroll', (e) => {
      if (contentEvents.onScroll) {
        contentEvents.onScroll(this, this.contentZone.scrollTop, this.contentZone.scrollHeight, e);
      }
    });
  },
  
  setupZoneEvents() {
    this.setupZoneEventHandlers(this.topZone, this.config.zones.topEvents || {}, 'top');
    this.setupZoneEventHandlers(this.bottomZone, this.config.zones.bottomEvents || {}, 'bottom');
  },
  
  setupZoneEventHandlers(zoneElement, events, zoneName) {
    // Clic - logique simplifiée et robuste
    zoneElement.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Protection principale: vérifier si la slice entière est en cours de drag OU vient de finir
      if (this.element.isDragging || this.dragJustEnded) {
        return; // Pas de log pour éviter le spam
      }
      
      if (events.onClick) {
        events.onClick(this, e);
      }
    });
    
    // Double clic
    zoneElement.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (events.onDoubleClick) {
        events.onDoubleClick(this, e);
      }
    });
    
    // Mouse down/up pour les événements personnalisés
    zoneElement.addEventListener('mousedown', (e) => {
      if (events.onMouseDown) {
        events.onMouseDown(this, e);
      }
    });
    
    zoneElement.addEventListener('mouseup', (e) => {
      if (events.onMouseUp) {
        events.onMouseUp(this, e);
      }
    });
    
    // Clic droit
    zoneElement.addEventListener('contextmenu', (e) => {
      if (this.config.behaviors.preventContextMenu) {
        e.preventDefault();
      }
      if (events.onRightClick) {
        events.onRightClick(this, e);
      }
    });
    
    // Hover
    zoneElement.addEventListener('mouseenter', (e) => {
      if (events.onHover) {
        events.onHover(this, true, e);
      }
    });
    
    zoneElement.addEventListener('mouseleave', (e) => {
      if (events.onHover) {
        events.onHover(this, false, e);
      }
    });
  },
  
};
