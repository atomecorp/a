// Extracted from slice_builder.js: DEFAULT_CONFIG — default slice options (zones, drag/drop, styles, callbacks).
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

export { DEFAULT_CONFIG };
