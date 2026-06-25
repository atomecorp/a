import { $, define } from '../squirrel.js';
import { makeDraggable, makeDraggableWithDrop, makeDropZone } from './draggable_builder.js';
import { DEFAULT_CONFIG } from './slice_config.js';

/**
 * Slice Component - Parametric UI Element with Top/Bottom Zones and Scrollable Content
 * Full parametrization of container, zones, and created blocks
 */

// Configuration par défaut entièrement paramétrable

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

import { sliceEventMethods } from './slice_events.js';
import { sliceObjectMethods } from './slice_objects.js';
Object.assign(Slice.prototype, sliceEventMethods, sliceObjectMethods);


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

