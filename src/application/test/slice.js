
// import '../../../squirrel/squirrel.js';

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
    slice1.dragJustEnded = false; // Réinitialiser le flag
    console.log('🔥 Slice1 drag start');
  },
  onDragEnd: () => {
    slice1.element.isDragging = false;
    slice1.dragJustEnded = true; // Marquer comme ayant fini récemment
    console.log('🔥 Slice1 drag end');
    
    // Réinitialiser le flag après les événements de clic
    setTimeout(() => {
      slice1.dragJustEnded = false;
    }, 50); // Délai très court pour laisser les clics se traiter
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
        
        console.log('🔥 Zone TOP cliquée !');
        slice.addObject(); // Crée un objet depuis le top
      },
      onDoubleClick: (slice, event) => {
        console.log('🔥🔥 Zone TOP double-cliquée !');
        slice.clear(); // Vide la slice
      },
      onHover: (slice, isEntering, event) => {
        console.log(`🔥 Zone TOP ${isEntering ? 'survolée' : 'quittée'}`);
      }
    },
    
    // Événements sur la zone bottom
    bottomEvents: {
      onClick: (slice, event) => {
        console.log('⚡ Zone BOTTOM cliquée !');
        // Exporter les données vers la console
        console.log('📊 Objets:', slice.getObjectCount());
      },
      onRightClick: (slice, event) => {
        console.log('⚡ Zone BOTTOM clic droit !');
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
        console.log(`🎯 Objet ${index} cliqué !`);
        // Changer la couleur de l'objet
        object.style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
      },
      onDoubleClick: (object, index, slice) => {
        console.log(`🎯🎯 Objet ${index} double-cliqué !`);
        // Supprimer l'objet
        slice.removeObject(object);
      },
      onRightClick: (object, index, slice, event) => {
        console.log(`🖱️ Objet ${index} clic droit !`);
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

// 3. Slice avec drag & drop simulé et sélection multiple
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
        object.style.transform = 'scale(1.1) rotate(5deg)';
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
        console.log('🖱️ Contenu clic droit - Suppression des objets sélectionnés');
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
        // Vérifier si on est en train de dragger
        if (slice.element.isDragging) return;
        
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
        // Vérifier si on est en train de dragger
        if (slice.element.isDragging) return;
        
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

// Rendre la slice4 draggable - SIMPLE
makeDraggable(slice4.element, {
  handle: slice4.topZone,
  onDragStart: () => {
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

// Rendre cette slice draggable ET drop zone - SIMPLE
makeDraggable(dropSlice.element, {
  handle: dropSlice.topZone
});

makeDropZone(dropSlice.contentZone, {
  onDrop: (draggedElement) => {
    dropSlice.bottomZone.textContent = '📦 Reçu !';
    setTimeout(() => {
      dropSlice.bottomZone.textContent = '⬇️ Déposez ici';
    }, 1000);
  }
});