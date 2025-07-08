// Détection d'environnement Tauri
const isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;

// Force l'activation des événements HTML5 drag & drop dans Tauri
if (isTauri) {
  // Désactiver l'interception native de Tauri pour les événements de drag
  document.addEventListener('DOMContentLoaded', () => {
    // Forcer l'activation des événements HTML5
    document.body.setAttribute('draggable', 'false'); // Empêcher le drag du body
    document.documentElement.style.setProperty('--webkit-user-drag', 'auto');
    
    // Empêcher les événements natifs de Tauri d'interférer
    ['dragstart', 'dragend', 'dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        // Laisser passer les événements HTML5 normaux
      }, { passive: false });
    });
  });
}

// Import des fonctionnalités
import { 
  createSlice,
  createDraggableSlice, 
  createDropZoneSlice, 
  createDragDropSlice, 
  makeDraggable,
  makeDraggableWithDrop, 
  makeDropZone 
} from '../../../squirrel/components/slice_builder.js';

// ==================== SLICES DRAGGABLES AVEC COMPOSANT DRAGGABLE ====================

// 1. Slice basique avec configuration par défaut - DRAGGABLE
const slice1 = createSlice({
  zones: {
    topText: '🔥 1 ENTRÉE',
    bottomText: '1 SORTIE'
  },
  behaviors: {
    createOnContentClick: true  // Activé pour permettre création au clic
  }
});
document.body.appendChild(slice1.element);

// Rendre la slice1 draggable - SIMPLE
makeDraggable(slice1.element, {
  handle: slice1.topZone,
  onDragStart: () => {
    slice1.element.isDragging = true;
    slice1.dragJustEnded = false;
  },
  onDragEnd: () => {
    slice1.element.isDragging = false;
    slice1.dragJustEnded = true;
    
    setTimeout(() => {
      slice1.dragJustEnded = false;
    }, 50);
  }
});

// 2. Slice avec événements personnalisés sur les zones
const slice2 = createSlice({
  width: 120,
  height: 80,
  backgroundColor: 'rgba(255, 100, 150, 0.8)',
  position: { x: 200, y: 100 },
  borderRadius: 8,
  
  zones: {
    topHeight: 0.3,
    bottomHeight: 0.2,
    topText: '🔥 2 ENTRÉE',
    bottomText: '⚡2 SORTIE',
    
    // Événements sur la zone top
    topEvents: {
      onClick: (slice, event) => {
        // Vérifier si on est en train de dragger
        if (slice.element.isDragging) return;
        
        slice.addObject(); // Crée un objet depuis le top
      },
      onDoubleClick: (slice, event) => {
        slice.clear(); // Vide la slice
      },
      onHover: (slice, isEntering, event) => {
        // Zone TOP survolée ou quittée
      }
    },
    
    // Événements sur la zone bottom
    bottomEvents: {
      onClick: (slice, event) => {
        // Exporter les données vers la console
      },
      onRightClick: (slice, event) => {
        // Changer la couleur de fond
        slice.updateBackgroundColor(`hsl(${Math.random() * 360}, 70%, 50%)`);
      }
    }
  },
  
  objects: {
    sizeRatio: 0.4,
    alignment: 'center',
    
    // Événements sur les objets
    events: {
      onClick: (object, index, slice) => {
        // Changer la couleur de l'objet
        object.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
      },
      onDoubleClick: (object, index, slice) => {
        // Supprimer l'objet
        slice.removeObject(object);
      },
      onRightClick: (object, index, slice, event) => {
        // Cloner l'objet
        slice.addObject();
      },
      onHover: (object, index, slice, isEntering) => {
        if (isEntering) {
          object.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.5)';
        } else {
          object.style.boxShadow = 'none';
        }
      }
    }
  },
  
  behaviors: {
    createOnContentClick: false,  // Désactivé pour éviter conflit avec drag
    removeOnObjectClick: false,   // Désactivé car on utilise le double-clic
    preventContextMenu: true,     // Empêche le menu contextuel
  }
});
document.body.appendChild(slice2.element);

// Rendre la slice2 draggable - SIMPLE
makeDraggable(slice2.element, {
  handle: slice2.bottomZone,
  onDragStart: () => {
    slice2.element.isDragging = true;
    slice2.dragJustEnded = false;
    console.log('🔥 Slice2 drag start');
  },
  onDragEnd: () => {
    slice2.element.isDragging = false;
    slice2.dragJustEnded = true;
    console.log('🔥 Slice2 drag end');
    
    setTimeout(() => {
      slice2.dragJustEnded = false;
    }, 50);
  }
});

// 3. Slice avec drag & drop simulé et sélection multiple (SANS ROTATION)
const slice3 = createSlice({
  width: 200,
  height: 60,
   zones: {
    topText: '3 in',
    bottomText: '3 out'},
  backgroundColor: 'rgba(100, 255, 100, 0.8)',
  position: { x: 400, y: 100 },
  
  objects: {
    sizeRatio: 0.5,
    alignment: 'left',
    
    events: {
      onMouseDown: (object, index, slice, event) => {
        object.isDragging = true;
        object.style.cursor = 'grabbing';
        object.style.transform = 'scale(1.05)'; // Pas de rotation
      },
      onMouseUp: (object, index, slice, event) => {
        object.isDragging = false;
        object.style.cursor = 'pointer';
        object.style.transform = 'scale(1)';
      },
      onClick: (object, index, slice) => {
        // Système de sélection multiple
        if (object.isSelected) {
          object.isSelected = false;
          object.style.border = '2px solid #ff6600';
          object.style.boxShadow = 'none';
        } else {
          object.isSelected = true;
          object.style.border = '3px solid yellow';
          object.style.boxShadow = '0 0 10px yellow';
        }
      }
    }
  },
  
  content: {
    events: {
      onRightClick: (slice, event) => {
        // Supprimer tous les objets sélectionnés
        const objects = slice.contentZone.querySelectorAll('div');
        objects.forEach(obj => {
          if (obj.isSelected) {
            slice.removeObject(obj);
          }
        });
      }
    }
  },
  
  behaviors: {
    createOnContentClick: true,   // Réactiver la création par clic sur contenu
    preventContextMenu: true,
  }
});
document.body.appendChild(slice3.element);

// Rendre la slice3 draggable - SIMPLE
makeDraggable(slice3.element, {
  onDragStart: () => {
    slice3.element.isDragging = true;
    slice3.dragJustEnded = false;
    console.log('🔥 Slice3 drag start');
  },
  onDragEnd: () => {
    slice3.element.isDragging = false;
    slice3.dragJustEnded = true;
    console.log('🔥 Slice3 drag end');
    
    setTimeout(() => {
      slice3.dragJustEnded = false;
    }, 50);
  }
});

// 4. Slice avec comportements avancés et données personnalisées
const slice4 = createSlice({
  width: 150,
  height: 90,
  
  backgroundColor: 'rgba(75, 0, 130, 0.9)',
  position: { x: 50, y: 300 },

  objects: {
    sizeRatio: 0.6,
    alignment: 'center',
    
    events: {
      onClick: (object, index, slice) => {
        // Protection contre le drag ET vérification de propagation
        if (object.isDragging || slice.element.isDragging) return;
        
        // Données personnalisées sur l'objet
        if (!object.customData) {
          object.customData = {
            clicks: 0,
            created: new Date(),
            color: object.style.backgroundColor
          };
        }
        object.customData.clicks++;
        object.textContent = `${index}\n${object.customData.clicks}`;
        console.log(`📊 Objet ${index}: ${object.customData.clicks} clics`);
      },
      onRemove: (object, index, slice) => {
        console.log(`🗑️ Suppression objet ${index} - Données:`, object.customData);
      },
      onRemoved: (index, slice) => {
        console.log(`✅ Objet ${index} supprimé avec succès`);
      }
    }
  },
  
  content: {
    events: {
      onScroll: (slice, scrollTop, scrollHeight, event) => {
        // Effet de parallaxe sur le scroll
        const scrollPercent = scrollTop / (scrollHeight - slice.contentZone.clientHeight);
        slice.topZone.style.opacity = 1 - scrollPercent * 0.5;
        slice.bottomZone.style.opacity = 1 - scrollPercent * 0.5;
      }
    }
  },
  
  zones: {
        topText: '4 in',
    bottomText: '⚡ 4 out',
    topEvents: {
      onClick: (slice, event) => {
        // Vérifier si on est en train de dragger la slice OU un objet
        if (slice.element.isDragging) return;
        
        // Vérifier qu'aucun objet n'est en cours de drag
        const isDraggingChild = Array.from(slice.contentZone.querySelectorAll('div')).some(obj => obj.isDragging);
        if (isDraggingChild) return;
        
        // Tri des objets par nombre de clics
        const objects = Array.from(slice.contentZone.querySelectorAll('div'));
        objects.sort((a, b) => {
          const aClicks = a.customData ? a.customData.clicks : 0;
          const bClicks = b.customData ? b.customData.clicks : 0;
          return bClicks - aClicks;
        });
        
        // Réorganiser dans le DOM
        objects.forEach(obj => slice.contentZone.appendChild(obj));
        console.log('🔄 Objets triés par nombre de clics');
      }
    },
    
    bottomEvents: {
      onClick: (slice, event) => {
        // Vérifier si on est en train de dragger la slice OU un objet
        if (slice.element.isDragging) return;
        
        // Vérifier qu'aucun objet n'est en cours de drag
        const isDraggingChild = Array.from(slice.contentZone.querySelectorAll('div')).some(obj => obj.isDragging);
        if (isDraggingChild) return;
        
        // Statistiques
        const objects = Array.from(slice.contentZone.querySelectorAll('div'));
        const totalClicks = objects.reduce((sum, obj) => {
          return sum + (obj.customData ? obj.customData.clicks : 0);
        }, 0);
        console.log(`📊 Statistiques: ${objects.length} objets, ${totalClicks} clics totaux`);
      }
    }
  },
  
  behaviors: {
    createOnContentClick: true,   // Réactiver la création par clic sur contenu
    preventContextMenu: true,
  }
});
document.body.appendChild(slice4.element);

// Fonction pour rendre un objet draggable
function makeObjectDraggable(object, slice) {
  const dragId = Math.random().toString(36).substr(2, 9);
  
  // Force explicite pour Tauri : Activer HTML5 drag & drop
  if (isTauri) {
    object.draggable = true;
    object.style.webkitUserDrag = 'element';
    object.setAttribute('draggable', 'true');
  }
  
  makeDraggableWithDrop(object, {
    enableHTML5: true,
    cursor: 'grab',
    transferData: {
      type: 'slice-object',
      objectIndex: object.objectIndex,
      sourceSlice: 'slice4',
      content: object.textContent,
      customData: object.customData,
      dragId: dragId,
      isTauri: isTauri
    },
    onHTML5DragStart: (e, element) => {
      element.isDragging = true;
      element.style.opacity = '0.5';
      
      // IMPORTANT: Empêcher la propagation pour éviter de draguer la slice
      e.stopPropagation();
    },
    onHTML5DragEnd: (e, element) => {
      // Attendre un peu pour laisser le temps au drop de se terminer
      setTimeout(() => {
        // Vérification simple : si l'objet n'est plus dans slice4, c'est qu'il a été déplacé
        if (!element.parentNode || element.parentNode !== slice4.contentZone) {
          return;
        }
        
        // Sinon, restaurer l'état normal
        element.isDragging = false;
        element.style.opacity = '1';
      }, 100);
    }
  });
  
  // Empêcher le drag de la slice quand on clique sur l'objet
  object.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  
  // Empêcher les autres événements de remonter
  object.addEventListener('click', (e) => {
    if (object.isDragging) {
      e.stopPropagation();
      return;
    }
  });
}

// Override de la méthode addObject de slice4 pour rendre les nouveaux objets draggables
const originalAddObject = slice4.addObject.bind(slice4);
slice4.addObject = function() {
  originalAddObject();
  // Rendre le dernier objet créé draggable
  const lastObject = this.contentZone.lastElementChild;
  if (lastObject) {
    makeObjectDraggable(lastObject, this);
  }
};

// Rendre la slice4 draggable - AVEC GESTION DES OBJETS ENFANTS
makeDraggable(slice4.element, {
  handle: slice4.topZone, // Utiliser seulement la zone du haut comme handle
  onDragStart: (element, x, y) => {
    // Vérifier qu'on ne drag pas un objet enfant
    const isDraggingChild = Array.from(slice4.contentZone.querySelectorAll('div')).some(obj => obj.isDragging);
    if (isDraggingChild) {
      console.log('🚫 Drag de slice4 annulé - objet enfant en cours de drag');
      return false; // Annuler le drag de la slice
    }
    
    slice4.element.isDragging = true;
    slice4.dragJustEnded = false;
    console.log('🔥 Slice4 drag start');
  },
  onDragEnd: () => {
    slice4.element.isDragging = false;
    slice4.dragJustEnded = true;
    console.log('🔥 Slice4 drag end');
    
    setTimeout(() => {
      slice4.dragJustEnded = false;
    }, 50);
  }
});

// ==================== BONUS: SLICE AVEC DROP ZONE ====================

// Créer une slice spéciale qui peut recevoir d'autres éléments
const dropSlice = createSlice({
  width: 180,
  height: 100,
  backgroundColor: 'rgba(255, 0, 255, 0.3)',
  position: { x: 650, y: 100 },
  zones: {
    topText: '📦 DROP ZONE',
    bottomText: '⬇️ Déposez ici'
  },
  behaviors: {
    createOnContentClick: false // Pas de création d'objets
  }
});
document.body.appendChild(dropSlice.element);

// Rendre cette slice draggable - SIMPLE drag
makeDraggable(dropSlice.element, {
  handle: dropSlice.topZone
});

// Configurer la drop zone avec logs détaillés pour Tauri
makeDropZone(dropSlice.contentZone, {
  onDragEnter: (e, dropElement) => {
    console.log(`🎯 [${isTauri ? 'TAURI' : 'BROWSER'}] Entrée dans la drop zone`);
    dropSlice.contentZone.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
    dropSlice.bottomZone.textContent = '🎯 Prêt à recevoir';
  },
  
  onDragLeave: (e, dropElement) => {
    console.log(`🚪 [${isTauri ? 'TAURI' : 'BROWSER'}] Sortie de la drop zone`);
    dropSlice.contentZone.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    dropSlice.bottomZone.textContent = '⬇️ Déposez ici';
  },
  
  onDrop: (e, dropElement, transferData, sourceElement) => {
    console.log(`📦 [${isTauri ? 'TAURI' : 'BROWSER'}] Drop détecté !`, transferData);
    
    if (isTauri) {
      console.log(`🔍 [TAURI] Drop - sourceElement:`, sourceElement);
      console.log(`🔍 [TAURI] Drop - transferData:`, transferData);
      console.log(`🔍 [TAURI] Drop - event:`, e);
    }
    
    // Vérifier si c'est un objet de slice
    if (transferData.type === 'slice-object' && transferData.sourceSlice === 'slice4') {
      // Utiliser sourceElement si disponible, sinon chercher par index
      let originalObject = sourceElement;
      if (!originalObject) {
        const sourceObjects = Array.from(slice4.contentZone.querySelectorAll('div'));
        originalObject = sourceObjects.find(obj => obj.objectIndex === transferData.objectIndex);
        console.log(`🔍 [${isTauri ? 'TAURI' : 'BROWSER'}] Objet trouvé par index:`, originalObject);
      }
      
      if (originalObject) {
        console.log(`🔄 [${isTauri ? 'TAURI' : 'BROWSER'}] Déplacement de l'objet ${transferData.objectIndex}`);
        
        // Nettoyer les styles de drag
        originalObject.style.opacity = '1';
        originalObject.isDragging = false;
        originalObject.draggable = false;
        
        // Adapter le style pour la drop zone
        originalObject.style.backgroundColor = 'rgba(255, 0, 255, 0.6)';
        originalObject.style.border = '2px solid rgba(255, 0, 255, 0.8)';
        originalObject.style.marginBottom = '4px';
        originalObject.style.cursor = 'default';
        originalObject.textContent = `📦 ${transferData.content}`;
        
        // Déplacer l'objet physiquement vers la drop zone
        dropSlice.contentZone.appendChild(originalObject);
        
        console.log(`✅ [${isTauri ? 'TAURI' : 'BROWSER'}] Objet ${transferData.objectIndex} déplacé vers la drop zone`);
        
        // Feedback visuel
        dropSlice.bottomZone.textContent = '✅ Objet reçu !';
        setTimeout(() => {
          dropSlice.bottomZone.textContent = '⬇️ Déposez ici';
        }, 2000);
        
      } else {
        console.log(`❌ [${isTauri ? 'TAURI' : 'BROWSER'}] Objet source non trouvé`);
      }
    } else {
      console.log(`❌ [${isTauri ? 'TAURI' : 'BROWSER'}] Type d'objet non supporté`);
    }
    
    // Remettre le style normal
    dropSlice.contentZone.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  },
  
  acceptTypes: ['slice-object'] // N'accepte que les objets de slice
});

console.log('🎮 Instructions pour tester le drag & drop d\'objets:');
console.log('1. Cliquez sur le contenu de la slice 4 (violette) pour créer des objets');
console.log('2. Draggez les objets créés vers la drop zone (magenta)');
console.log('3. Les objets seront déplacés de slice4 vers la drop zone');
console.log('4. Regardez la console pour voir les événements détaillés');

// Instructions spécifiques selon l'environnement
if (isTauri) {
  console.log('🎮 Instructions spécifiques pour Tauri WebView:');
  console.log('1. Cliquez sur le contenu de la slice 4 (violette) pour créer des objets');
  console.log('2. Draggez les objets créés vers la drop zone (magenta) avec la souris');
  console.log('3. Observez les logs détaillés pour comprendre le comportement');
  console.log('4. Les objets seront déplacés de slice4 vers la drop zone');
  console.log('⚠️  Logs détaillés activés pour déboguer le comportement dans Tauri');
} else {
  console.log('🎮 Instructions pour navigateur standard:');
  console.log('1. Cliquez sur le contenu de la slice 4 (violette) pour créer des objets');
  console.log('2. Draggez les objets créés vers la drop zone (magenta)');
  console.log('3. Le système utilise HTML5 drag & drop natif');
  console.log('4. Les objets seront déplacés de slice4 vers la drop zone');
  console.log('5. Regardez la console pour voir les événements');
}
