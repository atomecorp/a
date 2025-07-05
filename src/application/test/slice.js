
import '../../../squirrel/squirrel.js';

/**
 * Slice Component - Parametric UI Element with Top/Bottom Zones and Scrollable Content
 * Full parametrization of container, zones, and created blocks
 */

// const slice_width = 69;
// const slice_height = 69
// const slice_backgroundColor = 'rgba(3, 123, 190, 0.8)'; // Couleur de fond par défaut
// define('slice', {
//     tag: 'slice',
//     css: {
//         backgroundColor: slice_backgroundColor,
//         width: slice_width + 'px',
//         height: slice_height + '%',
//         overflow: 'auto',
//     },
//     attrs: {
//         type: 'button'
//     },
//                onClick: function() {
//         // Créer un nouvel élément
//         const newObject = $('div', {
//             // text: '🔥 Nouvel objet !',
//             css: {
//                 position: 'absolute',
//                 top: '770px',
//                 left: '10px',
//                 width: '50px',
//                 height: '50px',
//                 // padding: '5px',
//                 backgroundColor: 'rgba(255, 255, 0, 0.8)',
//                 borderRadius: '4px',
//                 fontSize: '12px',
//                 zIndex: 10
//             }
//         });
        
//         // Ajouter à la slice courante
//         this.appendChild(newObject);
        
//         console.log('Objet ajouté à la slice !');
//     },
//     children: [
//         {
//             tag: 'div',
//             class: 'input_flow',
//             css: {
//                 borderTopLeftRadius: '6px',
//                 borderTopRightRadius: '6px',
//                 position: 'absolute',
//                 top: -slice_width / 2 + 'px',
//                 boxShadow: '0 0px 24px rgba(5,8,0,1)',
//                 left: '0px',
//                 width: slice_width + 'px',
//                 height: slice_width / 2 + 'px',
//                 backgroundColor: slice_backgroundColor,
//             }
//         },
//         {
//             tag: 'div',
//             class: 'output_flow',
//             css: {
//                 borderBottomLeftRadius: '6px',
//                 borderBottomRightRadius: '6px',
//                 position: 'absolute',
//                 bottom: -slice_width / 2 + 'px',
//                 boxShadow: '0 0px 24px rgba(5,8,0,1)',
//                 left: '0px',
//                 width: slice_width + 'px',
//                 height: slice_width / 2 + 'px',
//                 backgroundColor: slice_backgroundColor,
//             }
//         }
//     ]
// });

// // Usage with property override
// const my_slice = $('slice', {
//     //   text: 'My Custom Button',
//     css: {
//         left: '100px',
//         top: '99px',
//         position: 'absolute',
//     },
//     // onClick: () => alert('Clicked!')
// });



// // //////////////////////////////////////////////////////////////: new try 
// // define('slice-container', {
// //   tag: 'div',
// //   css: {
// //     backgroundColor: 'rgba(3, 123, 190, 0.8)',
// //     position: 'relative',
// //     overflow: 'hidden' // ← Important : masquer les flows
// //   }
// // });

// // define('slice-flow', {
// //   tag: 'div',
// //   css: {
// //     position: 'absolute',
// //     boxShadow: '0 0px 24px rgba(5,8,0,1)',
// //     zIndex: 0 // ← Derrière le contenu
// //   }
// // });

// // class Slice {
// //   constructor(options = {}) {
// //     const {
// //       width = 69,
// //       height = 120, // ← Hauteur fixe par défaut
// //       backgroundColor = 'rgba(3, 123, 190, 0.8)'
// //     } = options;
    
// //     this.width = width;
// //     this.height = height;
// //     this.backgroundColor = backgroundColor;
// //     this.objectCounter = 0;
    
// //     this.createElement();
// //     this.setupInteractions();
// //   }
  
// //   createElement() {
// //     this.element = $('slice-container', {
// //       css: {
// //         width: this.width + 'px',
// //         height: this.height + 'px', // ← Hauteur fixe
// //         backgroundColor: this.backgroundColor
// //       }
// //     });
    
// //     this.createFlows();
// //     this.createContentArea();
// //   }
  
// //   createFlows() {
// //     this.inputFlow = $('slice-flow', {
// //       class: 'input_flow',
// //       css: {
// //         borderTopLeftRadius: '6px',
// //         borderTopRightRadius: '6px',
// //         top: -this.width / 2 + 'px',
// //         left: '0px',
// //         width: this.width + 'px',
// //         height: this.width / 2 + 'px',
// //         backgroundColor: this.backgroundColor
// //       }
// //     });
    
// //     this.outputFlow = $('slice-flow', {
// //       class: 'output_flow',
// //       css: {
// //         borderBottomLeftRadius: '6px',
// //         borderBottomRightRadius: '6px',
// //         bottom: -this.width / 2 + 'px',
// //         left: '0px',
// //         width: this.width + 'px',
// //         height: this.width / 2 + 'px',
// //         backgroundColor: this.backgroundColor
// //       }
// //     });
    
// //     this.element.appendChild(this.inputFlow);
// //     this.element.appendChild(this.outputFlow);
// //   }
  
// //   createContentArea() {
// //     // Zone de contenu avec scroll indépendant
// //     this.contentArea = $('div', {
// //       class: 'slice-content',
// //       css: {
// //         position: 'absolute',
// //         top: '10px',
// //         left: '10px',
// //         right: '10px',
// //         bottom: '10px',
// //         overflow: 'auto', // ← Seule cette zone scroll
// //         zIndex: 2, // ← Au-dessus des flows
// //         padding: '5px'
// //       }
// //     });
    
// //     this.element.appendChild(this.contentArea);
// //   }
  
// //   setupInteractions() {
// //     // Clic sur la zone de contenu seulement
// //     this.contentArea.addEventListener('click', () => {
// //       this.addObject();
// //     });
// //   }
  
// //   addObject() {
// //     this.objectCounter++;
    
// //     const newObject = $('div', {
// //       text: this.objectCounter.toString(),
// //       css: {
// //         position: 'relative',
// //         marginBottom: '5px',
// //         width: '30px',
// //         height: '30px',
// //         backgroundColor: `hsl(${this.objectCounter * 40}, 70%, 60%)`,
// //         borderRadius: '4px',
// //         display: 'flex',
// //         alignItems: 'center',
// //         justifyContent: 'center',
// //         color: 'white',
// //         fontWeight: 'bold',
// //         cursor: 'pointer'
// //       }
// //     });
    
// //     // Ajouter à la zone de contenu
// //     this.contentArea.appendChild(newObject);
    
// //     // Auto-scroll vers le bas
// //     this.contentArea.scrollTop = this.contentArea.scrollHeight;
// //   }
// // }

// // // API simple
// // function createSlice(options) {
// //   return new Slice(options);
// // }

// // export { createSlice };
// // export default createSlice;

// // // Créer une slice avec options par défaut
// // const slice1 = createSlice();

// // // Ajouter au DOM
// // document.body.appendChild(slice1.element);

// // // Positionner la slice
// // slice1.element.style.left = '100px';
// // slice1.element.style.top = '100px';
// // slice1.element.style.position = 'absolute';



// import { $, define } from '../../squirrel/squirrel.js';

/**
 * Slice Component - Composant avec zones top/bottom et contenu scrollable
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
    // Clic sur la zone de contenu pour ajouter des blocs
    this.contentZone.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addObject();
    });
    
    // Feedback visuel basé sur la configuration
    this.contentZone.addEventListener('mouseenter', () => {
      this.contentZone.style.backgroundColor = this.config.content.hoverColor;
    });
    
    this.contentZone.addEventListener('mouseleave', () => {
      this.contentZone.style.backgroundColor = this.config.content.backgroundColor;
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
    
    // Effet hover sur les objets basé sur la configuration
    newObject.addEventListener('mouseenter', () => {
      newObject.style.transform = hoverTransform;
    });
    
    newObject.addEventListener('mouseleave', () => {
      newObject.style.transform = 'scale(1)';
    });
    
    // Clic pour supprimer avec animation paramétrable
    newObject.addEventListener('click', (e) => {
      e.stopPropagation();
      const animConfig = this.config.objects.removeAnimation || {};
      const animName = animConfig.name || 'fadeOut';
      const animDuration = animConfig.duration || '0.3s';
      const animTiming = animConfig.timing || 'ease';
      
      newObject.style.animation = `${animName} ${animDuration} ${animTiming}`;
      
      const duration = parseFloat(animDuration) * 1000; // Convertir en ms
      setTimeout(() => newObject.remove(), duration);
    });
    
    this.contentZone.appendChild(newObject);
    
    // Auto-scroll vers le bas
    this.contentZone.scrollTop = this.contentZone.scrollHeight;
    
    console.log(`✨ Objet ${this.objectCounter} ajouté à la slice`);
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
export { createSlice };
export default createSlice;




// ==================== EXEMPLES D'UTILISATION ====================

// 1. Slice basique avec configuration par défaut
const slice1 = createSlice();
document.body.appendChild(slice1.element);

// 2. Slice avec zones personnalisées
const slice2 = createSlice({
  width: 120,
  height: 80,
  backgroundColor: 'rgba(255, 100, 150, 0.8)',
  position: { x: 200, y: 100 },
  borderRadius: 8,
  
  zones: {
    topHeight: 0.3,        // Zone top = 30% de la largeur
    bottomHeight: 0.2,     // Zone bottom = 20% de la largeur
    margin: 8,
    textColor: 'yellow',
    fontWeight: 'normal',
    topText: '🔥 ENTRÉE',
    bottomText: '⚡ SORTIE',
    
    // Styles spécifiques
    top: {
      backgroundColor: 'rgba(255, 0, 0, 0.3)',
      textColor: 'white'
    },
    bottom: {
      backgroundColor: 'rgba(0, 255, 0, 0.3)',
      textColor: 'black'
    }
  },
  
  content: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    hoverColor: 'rgba(0, 0, 0, 0.4)',
    padding: 8
  },
  
  objects: {
    sizeRatio: 0.4,
    alignment: 'center',
    spacing: 6,
    backgroundColor: 'rgba(100, 200, 255, 0.9)',
    borderRadius: 8,
    border: '3px solid white'
  }
});
document.body.appendChild(slice2.element);

// 3. Slice avec objets complètement personnalisés
const slice3 = createSlice({
  width: 200,
  height: 60,
  backgroundColor: 'rgba(100, 255, 100, 0.8)',
  position: { x: 400, y: 100 },
  
  zones: {
    topHeight: 0.15,    // Zones minces
    bottomHeight: 0.15,
    topText: '↓ IN',
    bottomText: '↑ OUT',
    fontSize: 10
  },
  
  objects: {
    sizeRatio: 0.5,     // Gros objets
    minSize: 30,
    maxSize: 100,
    alignment: 'right',
    spacing: 8,
    backgroundColor: 'rgba(255, 165, 0, 0.9)', // Orange fixe
    textColor: 'black',
    fontWeight: 'bold',
    borderRadius: 12,
    border: '2px solid #ff6600',
    
    hover: {
      transform: 'scale(1.1) rotate(5deg)',
      transition: 'all 0.3s ease'
    },
    
    removeAnimation: {
      name: 'fadeOut',
      duration: '0.5s',
      timing: 'ease-in-out'
    }
  },
  
  content: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    hoverColor: 'rgba(255, 255, 255, 0.5)',
    scrollbar: {
      width: 8,
      trackColor: 'rgba(0, 0, 0, 0.2)',
      thumbColor: 'rgba(255, 165, 0, 0.7)',
      thumbHoverColor: 'rgba(255, 165, 0, 1)'
    }
  }
});
document.body.appendChild(slice3.element);

// 4. Slice avec configuration extrême
const slice4 = createSlice({
  width: 150,
  height: 90,
  backgroundColor: 'rgba(75, 0, 130, 0.9)', // Violet
  position: { x: 50, y: 300 },
  borderRadius: 15,
  
  zones: {
    topHeight: 0.4,     // Zone top très large
    bottomHeight: 0.1,  // Zone bottom très petite
    backgroundColor: 'rgba(138, 43, 226, 0.8)',
    textColor: 'cyan',
    fontWeight: 'bold',
    topText: '🌟 MAGIQUE',
    bottomText: '✨',
    
    top: {
      backgroundColor: 'rgba(255, 0, 255, 0.6)',
      fontSize: 14
    }
  },
  
  objects: {
    sizeRatio: 0.6,     // Très gros objets
    minSize: 40,
    maxSize: 120,
    alignment: 'center',
    spacing: 10,
    backgroundColor: null, // Couleurs HSL dynamiques
    textColor: 'white',
    fontSize: 16,
    borderRadius: 20,
    border: '4px solid rgba(255, 255, 255, 0.8)',
    
    hover: {
      transform: 'scale(1.2) rotate(-10deg)',
      transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
    }
  },
  
  content: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    hoverColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 5
  }
});
document.body.appendChild(slice4.element);