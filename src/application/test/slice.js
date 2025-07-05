
// /**
//  * Simple Button Component Template
//  */

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



////////////////// test 3

// import { $, define } from '../squirrel.js';

/**
 * Slice Component - Composant avec zones top/bottom et contenu scrollable
 */

// Configuration par défaut
const DEFAULT_CONFIG = {
  width: 69,
  height: 69, // En pourcentage
  backgroundColor: 'rgba(3, 123, 190, 0.8)',
  position: { x: 0, y: 0 }
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
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.objectCounter = 0;
    
    this.createElement();
    this.setupInteractions();
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
    // Zone du haut (input_flow)
    this.topZone = $('slice-zone', {
      class: 'input_flow',
      css: {
        height: (this.config.width / 4) + 'px', // 25% de la largeur
        backgroundColor: this.config.backgroundColor,
        borderTopLeftRadius: '6px',
        borderTopRightRadius: '6px',
        boxShadow: '0 2px 8px rgba(5,8,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        color: 'white',
        fontWeight: 'bold'
      },
      text: '▼ INPUT'
    });
    
    // Zone de contenu scrollable (milieu)
    this.contentZone = $('slice-content', {
      class: 'slice-content',
      css: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        padding: '8px',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }
    });
    
    // Zone du bas (output_flow)
    this.bottomZone = $('slice-zone', {
      class: 'output_flow',
      css: {
        height: (this.config.width / 4) + 'px', // 25% de la largeur
        backgroundColor: this.config.backgroundColor,
        borderBottomLeftRadius: '6px',
        borderBottomRightRadius: '6px',
        boxShadow: '0 -2px 8px rgba(5,8,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        color: 'white',
        fontWeight: 'bold'
      },
      text: '▲ OUTPUT'
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
    
    // Feedback visuel
    this.contentZone.addEventListener('mouseenter', () => {
      this.contentZone.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });
    
    this.contentZone.addEventListener('mouseleave', () => {
      this.contentZone.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
  }
  
  addObject() {
    this.objectCounter++;
    
    // Calculer la taille des objets en fonction de la taille du conteneur
    const objectSize = Math.max(20, this.config.width / 3);
    
    const newObject = $('div', {
      text: this.objectCounter.toString(),
      css: {
        width: objectSize + 'px',
        height: objectSize + 'px',
        backgroundColor: `hsl(${this.objectCounter * 45}, 70%, 60%)`,
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: (objectSize / 3) + 'px',
        marginBottom: '4px',
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
        border: '2px solid rgba(255, 255, 255, 0.3)'
      }
    });
    
    // Effet hover sur les objets
    newObject.addEventListener('mouseenter', () => {
      newObject.style.transform = 'scale(1.05)';
    });
    
    newObject.addEventListener('mouseleave', () => {
      newObject.style.transform = 'scale(1)';
    });
    
    // Clic pour supprimer
    newObject.addEventListener('click', (e) => {
      e.stopPropagation();
      newObject.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => newObject.remove(), 300);
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

// CSS pour l'animation
const sliceStyles = `
  @keyframes fadeOut {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.8); }
  }
  
  .slice-content::-webkit-scrollbar {
    width: 4px;
  }
  
  .slice-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
  
  .slice-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
  
  .slice-content::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

// Injecter les styles
if (!document.querySelector('#slice-styles')) {
  const style = document.createElement('style');
  style.id = 'slice-styles';
  style.textContent = sliceStyles;
  document.head.appendChild(style);
}

// Exports
export { createSlice };
export default createSlice;

//// verif 


import { createSlice } from './slice.js';

// Slice basique
const slice1 = createSlice();
document.body.appendChild(slice1.element);

// Slice personnalisée
const slice2 = createSlice({
  width: 120,
  height: 80,
  backgroundColor: 'rgba(255, 100, 150, 0.8)',
  position: { x: 200, y: 100 }
});
document.body.appendChild(slice2.element);

// Slice plus grande
const slice3 = createSlice({
  width: 200,
  height: 60,
  backgroundColor: 'rgba(100, 255, 100, 0.8)',
  position: { x: 400, y: 100 }
});
document.body.appendChild(slice3.element);

// Utilisation de l'API
slice2.updateSize(150, 90);
slice2.updatePosition(250, 150);
console.log(`Objets dans slice2: ${slice2.getObjectCount()}`);