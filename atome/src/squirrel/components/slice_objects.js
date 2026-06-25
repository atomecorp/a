// Extracted from slice_builder.js: Slice objects methods (prototype mixin; `this` bound to the Slice instance).
import { $ } from '../squirrel.js';

export const sliceObjectMethods = {
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
    
  },
  
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
  },
  
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
  },
  
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
  },
  
  updatePosition(x, y) {
    this.config.position = { x, y };
    this.element.style.left = x + 'px';
    this.element.style.top = y + 'px';
  },
  
  updateBackgroundColor(color) {
    this.config.backgroundColor = color;
    this.element.style.backgroundColor = color;
    this.topZone.style.backgroundColor = color;
    this.bottomZone.style.backgroundColor = color;
  },
  
  getObjectCount() {
    return this.objectCounter;
  },
  
  clear() {
    this.contentZone.innerHTML = '';
    this.objectCounter = 0;
  },
  
};
