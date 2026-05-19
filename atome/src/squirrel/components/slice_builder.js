import { $, define } from '../squirrel.js';
import { makeDraggable, makeDraggableWithDrop, makeDropZone } from './draggable_builder.js';

/**
 * Slice Component - Parametric UI Element with Top/Bottom Zones and Scrollable Content
 * Full parametrization of container, zones, and created blocks
 */

// Configuration par défaut entièrement paramétrable
const DEFAULT_CONFIG = {
  // Conteneur principal
  width: 100,
  height: 70,
  backgroundColor: 'rgba(3, 123, 190, 0.8)',
  position: { x: 50, y: 50 },
  borderRadius: 6,
  
  // Zones (top et bottom)
  zones: {
    topHeight: 0.25,           // Hauteur top = 25% de la largeur
    bottomHeight: 0.25,        // Hauteur bottom = 25% de la largeur
    margin: 5,                 // Padding intérieur
    backgroundColor: null,     // null = hérite du conteneur
    textColor: 'white',
    fontSize: null,            // null = calculé automatiquement
    fontWeight: 'bold',
    boxShadow: '0 2px 8px rgba(5,8,0,0.3)',
    borderRadius: null,        // null = hérite du conteneur
    
    // Textes des zones
    topText: '▼ INPUT',
    bottomText: '▲ OUTPUT',
    
    // Événements sur la zone top
    topEvents: {
      onClick: null,           // Function(slice, event) => {}
      onDoubleClick: null,     // Function(slice, event) => {}
      onMouseDown: null,       // Function(slice, event) => {}
      onMouseUp: null,         // Function(slice, event) => {}
      onRightClick: null,      // Function(slice, event) => {}
      onHover: null,           // Function(slice, isEntering, event) => {}
    },
    
    // Événements sur la zone bottom
    bottomEvents: {
      onClick: null,           
      onDoubleClick: null,     
      onMouseDown: null,       
      onMouseUp: null,         
      onRightClick: null,      
      onHover: null,           
    },
    
    // Styles spécifiques par zone
    top: {
      backgroundColor: null,
      textColor: null,
      fontSize: null,
      borderRadius: { topLeft: true, topRight: true, bottomLeft: false, bottomRight: false }
    },
    bottom: {
      backgroundColor: null,
      textColor: null,
      fontSize: null,
      borderRadius: { topLeft: false, topRight: false, bottomLeft: true, bottomRight: true }
    }
  },
  
  // Zone de contenu
  content: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    hoverColor: 'rgba(255, 255, 255, 0.2)',
    padding: 5,
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 0,
    
    // Événements sur la zone de contenu
    events: {
      onClick: null,           // Function(slice, event) => {} - Par défaut: crée un objet
      onDoubleClick: null,     // Function(slice, event) => {}
      onMouseDown: null,       // Function(slice, event) => {}
      onMouseUp: null,         // Function(slice, event) => {}
      onRightClick: null,      // Function(slice, event) => {}
      onHover: null,           // Function(slice, isEntering, event) => {}
      onScroll: null,          // Function(slice, scrollTop, scrollHeight, event) => {}
    },
    
    // Scrollbar
    scrollbar: {
      width: 4,
      trackColor: 'rgba(255, 255, 255, 0.1)',
      thumbColor: 'rgba(255, 255, 255, 0.3)',
      thumbHoverColor: 'rgba(255, 255, 255, 0.5)'
    }
  },
  
  // Objets créés dynamiquement
  objects: {
    sizeRatio: 0.3,            // Taille = 30% de la largeur du conteneur
    minSize: 20,
    maxSize: 80,
    alignment: 'left',         // 'left', 'center', 'right'
    spacing: 4,                // Espacement entre les objets
    
    // Styles des objets
    backgroundColor: null,     // null = couleur HSL dynamique
    textColor: 'white',
    fontSize: null,            // null = calculé automatiquement
    fontWeight: 'bold',
    borderRadius: 4,
    border: '2px solid rgba(255, 255, 255, 0.3)',
    
    // Interactions
    hover: {
      transform: 'scale(1.05)',
      transition: 'transform 0.2s ease'
    },
    
    // Animation de suppression
    removeAnimation: {
      name: 'fadeOut',
      duration: '0.3s',
      timing: 'ease'
    },
    
    // Événements sur les objets créés
    events: {
      onClick: null,           // Function(object, index, slice) => {}
      onDoubleClick: null,     // Function(object, index, slice) => {}
      onMouseDown: null,       // Function(object, index, slice, event) => {}
      onMouseUp: null,         // Function(object, index, slice, event) => {}
      onRightClick: null,      // Function(object, index, slice, event) => {}
      onHover: null,           // Function(object, index, slice, isEntering) => {}
      onRemove: null,          // Function(object, index, slice) => {} - avant suppression
      onRemoved: null,         // Function(index, slice) => {} - après suppression
    }
  },
  
  // Comportements globaux
  behaviors: {
    createOnContentClick: true,  // Crée un objet au clic sur le contenu
    removeOnObjectClick: true,   // Supprime l'objet au clic dessus
    preventContextMenu: false,   // Empêche le menu contextuel
    selectMultiple: false,       // Permet la sélection multiple d'objets
    dragAndDrop: false,          // Active le drag & drop des objets
    autoScroll: true,            // Auto-scroll vers le bas lors de l'ajout
  },
  
  // Configuration du drag & drop
  dragDrop: {
    enabled: false,              // Active le drag & drop de la slice
    enableHTML5: true,           // Utilise HTML5 drag & drop (pour drop zones)
    handle: null,                // Element à utiliser comme handle (null = toute la slice)
    transferData: {},            // Données à transférer lors du drag
    ghostImage: null,            // Image fantôme personnalisée
    
    // Événements drag & drop
    onDragStart: null,           // Function(slice, event) => {}
    onDragEnd: null,             // Function(slice, event) => {}
    
    // Drop zone configuration
    dropZone: {
      enabled: false,            // Cette slice peut recevoir des drops
      acceptTypes: [],           // Types de données acceptées
      onDrop: null,              // Function(slice, draggedData, event) => {}
      onDragEnter: null,         // Function(slice, event) => {}
      onDragLeave: null,         // Function(slice, event) => {}
      
      // Styles des états de drop
      hoverClass: 'slice-drop-hover',
      acceptClass: 'slice-drop-accept',
      rejectClass: 'slice-drop-reject'
    }
  }
};

// Templates pour les parties
define('slice-container', {
  tag: 'div',
  css: {
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  }
});

define('slice-zone', {
  tag: 'div',
  css: {
    position: 'relative',
    flexShrink: 0
  }
});

define('slice-content', {
  tag: 'div',
  css: {
    flex: 1,
    overflow: 'auto',
    position: 'relative'
  }
});

// Classe Slice
class Slice {
  constructor(options = {}) {
    // Deep merge configuration with proper fallbacks
    this.config = this.deepMerge(DEFAULT_CONFIG, options);
    this.objectCounter = 0;
    this.dragJustEnded = false; // Flag pour détecter la fin récente d'un drag
    
    this.createElement();
    this.setupInteractions();
  }
  
  // Helper pour merge profond des configurations
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  createElement() {
    // Conteneur principal
    this.element = $('slice-container', {
      css: {
        width: this.config.width + 'px',
        height: this.config.height + '%',
        backgroundColor: this.config.backgroundColor,
        position: 'absolute',
        left: this.config.position.x + 'px',
        top: this.config.position.y + 'px'
      }
    });
    
    this.createZones();
  }
  
  createZones() {
    // Calculer les hauteurs selon la configuration
    const topHeight = this.config.width * this.config.zones.topHeight;
    const bottomHeight = this.config.width * this.config.zones.bottomHeight;
    
    // Helpers pour les styles
    const getZoneBackgroundColor = (zone) => {
      const zoneConfig = this.config.zones[zone] || {};
      return zoneConfig.backgroundColor || 
             this.config.zones.backgroundColor || 
             this.config.backgroundColor;
    };
    
    const getZoneTextColor = (zone) => {
      const zoneConfig = this.config.zones[zone] || {};
      return zoneConfig.textColor || 
             this.config.zones.textColor;
    };
    
    const getZoneFontSize = (zone, height) => {
      const zoneConfig = this.config.zones[zone] || {};
      return zoneConfig.fontSize || 
             this.config.zones.fontSize || 
             Math.max(8, height / 3);
    };
    
    const getZoneBorderRadius = (zone) => {
      const radius = this.config.zones.borderRadius || this.config.borderRadius;
      const zoneConfig = this.config.zones[zone] || {};
      const zoneRadius = zoneConfig.borderRadius;
      
      if (!zoneRadius) return {};
      
      const radiusValue = radius + 'px';
      return {
        borderTopLeftRadius: zoneRadius.topLeft ? radiusValue : '0',
        borderTopRightRadius: zoneRadius.topRight ? radiusValue : '0',
        borderBottomLeftRadius: zoneRadius.bottomLeft ? radiusValue : '0',
        borderBottomRightRadius: zoneRadius.bottomRight ? radiusValue : '0'
      };
    };
    
    // Zone du haut (input_flow)
    this.topZone = $('slice-zone', {
      class: 'input_flow',
      css: {
        height: topHeight + 'px',
        backgroundColor: getZoneBackgroundColor('top'),
        ...getZoneBorderRadius('top'),
        boxShadow: this.config.zones.boxShadow || '0 2px 8px rgba(5,8,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: getZoneFontSize('top', topHeight) + 'px',
        color: getZoneTextColor('top'),
        fontWeight: this.config.zones.fontWeight
      },
      text: this.config.zones.topText
    });
    
    // Zone de contenu scrollable (milieu)
    this.contentZone = $('slice-content', {
      class: 'slice-content',
      css: {
        backgroundColor: this.config.content.backgroundColor,
        padding: this.config.content.padding + 'px',
        border: this.config.content.border,
        borderRadius: this.config.content.borderRadius + 'px',
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden'
      }
    });
    
    // Zone du bas (output_flow)
    this.bottomZone = $('slice-zone', {
      class: 'output_flow',
      css: {
        height: bottomHeight + 'px',
        backgroundColor: getZoneBackgroundColor('bottom'),
        ...getZoneBorderRadius('bottom'),
        boxShadow: (this.config.zones.boxShadow || '0 2px 8px rgba(5,8,0,0.3)').replace('0 2px', '0 -2px'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: getZoneFontSize('bottom', bottomHeight) + 'px',
        color: getZoneTextColor('bottom'),
        fontWeight: this.config.zones.fontWeight
      },
      text: this.config.zones.bottomText
    });
    
    // Assembler
    this.element.appendChild(this.topZone);
    this.element.appendChild(this.contentZone);
    this.element.appendChild(this.bottomZone);
  }
  
  setupInteractions() {
    this.setupContentEvents();
    this.setupZoneEvents();
    this.setupDragDrop(); // Nouveau : configurer le drag & drop
  }
  
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
  }
  
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
  }
  
  setupZoneEvents() {
    this.setupZoneEventHandlers(this.topZone, this.config.zones.topEvents || {}, 'top');
    this.setupZoneEventHandlers(this.bottomZone, this.config.zones.bottomEvents || {}, 'bottom');
  }
  
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
  }
  
  addObject() {
    this.objectCounter++;
    
    // Calculer la taille selon la configuration
    const baseSize = this.config.width * this.config.objects.sizeRatio;
    const objectSize = Math.max(
      this.config.objects.minSize, 
      Math.min(this.config.objects.maxSize, baseSize)
    );
    
    // Calculer l'alignement
    let alignmentStyle = {};
    switch(this.config.objects.alignment) {
      case 'center':
        alignmentStyle = {
          marginLeft: 'auto',
          marginRight: 'auto'
        };
        break;
      case 'right':
        alignmentStyle = {
          marginLeft: 'auto'
        };
        break;
      case 'left':
      default:
        alignmentStyle = {
          marginRight: 'auto'
        };
        break;
    }
    
    // Calculer la couleur de fond
    const backgroundColor = this.config.objects.backgroundColor || 
                          `hsl(${this.objectCounter * 45}, 70%, 60%)`;
    
    // Calculer la taille de police
    const fontSize = this.config.objects.fontSize || 
                    Math.max(8, objectSize / 3);
    
    // Sécuriser les propriétés hover
    const hoverConfig = this.config.objects.hover || {};
    const hoverTransform = hoverConfig.transform || 'scale(1.05)';
    const hoverTransition = hoverConfig.transition || 'transform 0.2s ease';
    
    const newObject = $('div', {
      text: this.objectCounter.toString(),
      css: {
        width: objectSize + 'px',
        height: objectSize + 'px',
        backgroundColor: backgroundColor,
        borderRadius: this.config.objects.borderRadius + 'px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: this.config.objects.textColor,
        fontWeight: this.config.objects.fontWeight,
        fontSize: fontSize + 'px',
        marginBottom: this.config.objects.spacing + 'px',
        cursor: 'pointer',
        transition: hoverTransition,
        border: this.config.objects.border,
        ...alignmentStyle
      }
    });
    
    // Ajouter les données de l'objet
    newObject.objectIndex = this.objectCounter;
    newObject.sliceRef = this;
    
    // Configurer tous les événements sur l'objet
    this.setupObjectEvents(newObject);
    
    this.contentZone.appendChild(newObject);
    
    // Auto-scroll vers le bas si activé
    if (this.config.behaviors.autoScroll) {
      this.contentZone.scrollTop = this.contentZone.scrollHeight;
    }
    
  }
  
  setupObjectEvents(objectElement) {
    const events = this.config.objects.events || {};
    const hoverConfig = this.config.objects.hover || {};
    const hoverTransform = hoverConfig.transform || 'scale(1.05)';
    
    const index = objectElement.objectIndex;
    
    // Clic sur l'objet
    objectElement.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Événement personnalisé ou comportement par défaut
      if (events.onClick) {
        events.onClick(objectElement, index, this);
      } else if (this.config.behaviors.removeOnObjectClick) {
        this.removeObject(objectElement);
      }
    });
    
    // Double clic
    objectElement.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (events.onDoubleClick) {
        events.onDoubleClick(objectElement, index, this);
      }
    });
    
    // Mouse down/up
    objectElement.addEventListener('mousedown', (e) => {
      if (events.onMouseDown) {
        events.onMouseDown(objectElement, index, this, e);
      }
    });
    
    objectElement.addEventListener('mouseup', (e) => {
      if (events.onMouseUp) {
        events.onMouseUp(objectElement, index, this, e);
      }
    });
    
    // Clic droit
    objectElement.addEventListener('contextmenu', (e) => {
      if (this.config.behaviors.preventContextMenu) {
        e.preventDefault();
      }
      if (events.onRightClick) {
        events.onRightClick(objectElement, index, this, e);
      }
    });
    
    // Hover
    objectElement.addEventListener('mouseenter', (e) => {
      objectElement.style.transform = hoverTransform;
      if (events.onHover) {
        events.onHover(objectElement, index, this, true);
      }
    });
    
    objectElement.addEventListener('mouseleave', (e) => {
      objectElement.style.transform = 'scale(1)';
      if (events.onHover) {
        events.onHover(objectElement, index, this, false);
      }
    });
  }
  
  removeObject(objectElement) {
    const events = this.config.objects.events || {};
    const index = objectElement.objectIndex;
    
    // Événement avant suppression
    if (events.onRemove) {
      events.onRemove(objectElement, index, this);
    }
    
    // Animation de suppression
    const animConfig = this.config.objects.removeAnimation || {};
    const animName = animConfig.name || 'fadeOut';
    const animDuration = animConfig.duration || '0.3s';
    const animTiming = animConfig.timing || 'ease';
    
    objectElement.style.animation = `${animName} ${animDuration} ${animTiming}`;
    
    const duration = parseFloat(animDuration) * 1000;
    setTimeout(() => {
      objectElement.remove();
      // Événement après suppression
      if (events.onRemoved) {
        events.onRemoved(index, this);
      }
    }, duration);
  }
  
  // API publique
  updateSize(width, height) {
    this.config.width = width;
    this.config.height = height;
    
    this.element.style.width = width + 'px';
    this.element.style.height = height + '%';
    
    // Recalculer les zones
    const zoneHeight = width / 4;
    this.topZone.style.height = zoneHeight + 'px';
    this.bottomZone.style.height = zoneHeight + 'px';
  }
  
  updatePosition(x, y) {
    this.config.position = { x, y };
    this.element.style.left = x + 'px';
    this.element.style.top = y + 'px';
  }
  
  updateBackgroundColor(color) {
    this.config.backgroundColor = color;
    this.element.style.backgroundColor = color;
    this.topZone.style.backgroundColor = color;
    this.bottomZone.style.backgroundColor = color;
  }
  
  getObjectCount() {
    return this.objectCounter;
  }
  
  clear() {
    this.contentZone.innerHTML = '';
    this.objectCounter = 0;
  }
  
  destroy() {
    // Nettoyer les listeners drag & drop
    if (this.dragDestroy) {
      this.dragDestroy();
    }
    if (this.dropDestroy) {
      this.dropDestroy();
    }
    
    this.element.remove();
  }
}

// Factory function
function createSlice(options = {}) {
  return new Slice(options);
}

// CSS dynamique pour l'animation et la scrollbar
function generateSliceStyles(config = DEFAULT_CONFIG) {
  const scrollbar = config.content?.scrollbar || DEFAULT_CONFIG.content.scrollbar;
  const removeAnim = config.objects?.removeAnimation || DEFAULT_CONFIG.objects.removeAnimation;
  
  return `
    @keyframes ${removeAnim.name} {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.8); }
    }
    
    .slice-content::-webkit-scrollbar {
      width: ${scrollbar.width}px;
    }
    
    .slice-content::-webkit-scrollbar-track {
      background: ${scrollbar.trackColor};
      border-radius: ${scrollbar.width / 2}px;
    }
    
    .slice-content::-webkit-scrollbar-thumb {
      background: ${scrollbar.thumbColor};
      border-radius: ${scrollbar.width / 2}px;
    }
    
    .slice-content::-webkit-scrollbar-thumb:hover {
      background: ${scrollbar.thumbHoverColor};
    }
    
    /* Styles pour les drop zones */
    .slice-drop-hover {
      background-color: rgba(46, 204, 113, 0.2) !important;
      border: 2px dashed #27ae60 !important;
      transform: scale(1.02);
      transition: all 0.3s ease;
    }
    
    .slice-drop-accept {
      background-color: rgba(52, 152, 219, 0.2) !important;
      border: 2px solid #3498db !important;
    }
    
    .slice-drop-reject {
      background-color: rgba(231, 76, 60, 0.2) !important;
      border: 2px solid #e74c3c !important;
    }
  `;
}

// Injecter les styles par défaut
function injectSliceStyles(config = DEFAULT_CONFIG) {
  const styleId = 'slice-styles';
  
  // Supprimer les anciens styles s'ils existent
  const existingStyle = document.querySelector(`#${styleId}`);
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Injecter les nouveaux styles
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = generateSliceStyles(config);
  document.head.appendChild(style);
}

// Injecter les styles par défaut au chargement
injectSliceStyles();

// Exports
export { createSlice, Slice };
export default createSlice;

// Export des nouvelles fonctions
export { 
  createDraggableSlice, 
  createDropZoneSlice, 
  createDragDropSlice,
  // Export des composants draggable pour usage direct
  makeDraggable,
  makeDraggableWithDrop,
  makeDropZone
};

// === FONCTIONS HELPER POUR DRAG & DROP ===

/**
 * Créer une slice draggable avec HTML5 drag & drop
 * @param {Object} options - Options de configuration de la slice
 * @returns {Slice} Instance de slice avec drag activé
 */
function createDraggableSlice(options = {}) {
  const sliceOptions = {
    ...options,
    dragDrop: {
      enabled: true,
      enableHTML5: true,
      transferData: { type: 'slice' },
      ...options.dragDrop
    }
  };
  
  return new Slice(sliceOptions);
}

/**
 * Créer une slice drop zone qui peut recevoir d'autres slices
 * @param {Object} options - Options de configuration de la slice
 * @returns {Slice} Instance de slice avec drop zone activée
 */
function createDropZoneSlice(options = {}) {
  const sliceOptions = {
    ...options,
    zones: {
      topText: '📦 DROP ZONE',
      bottomText: '⬇️ Déposez ici',
      ...options.zones
    },
    behaviors: {
      createOnContentClick: false, // Pas de création d'objets par défaut
      ...options.behaviors
    },
    dragDrop: {
      dropZone: {
        enabled: true,
        acceptTypes: ['slice'],
        onDrop: (slice, transferData, event) => {
          slice.addObject();
          const newObj = slice.contentZone.lastElementChild;
          if (newObj && transferData.text) {
            newObj.textContent = `📦 ${transferData.text || transferData.type}`;
          }
        }
      },
      ...options.dragDrop
    }
  };
  
  return new Slice(sliceOptions);
}

/**
 * Créer une slice complète avec drag & drop intégré
 * @param {Object} options - Options de configuration
 * @returns {Slice} Instance de slice avec drag et drop
 */
function createDragDropSlice(options = {}) {
  const sliceOptions = {
    ...options,
    dragDrop: {
      enabled: true,
      enableHTML5: true,
      transferData: { type: 'slice' },
      dropZone: {
        enabled: true,
        acceptTypes: ['slice'],
        onDrop: (slice, transferData, event) => {
          slice.addObject();
          const newObj = slice.contentZone.lastElementChild;
          if (newObj && transferData.content) {
            newObj.textContent = `🔄 ${transferData.content}`;
          }
        }
      },
      ...options.dragDrop
    }
  };
  
  return new Slice(sliceOptions);
}
