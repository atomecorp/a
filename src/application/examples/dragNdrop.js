// Exemple de Drag & Drop avancé avec Squirrel
// Démontre les capacités de drag & drop avec zones de dépôt

console.log('🎯 Chargement de l\'exemple Drag & Drop...');

// Container principal
const container = $('div', {
  css: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px'
  },
  parent: '#view'
});

// Titre
$('h1', {
  text: '🎯 Démo Drag & Drop Avancé',
  css: {
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: '30px'
  },
  parent: container
});

// Description
$('p', {
  text: 'Faites glisser les éléments colorés dans les zones de dépôt. Observez les effets visuels et les callbacks.',
  css: {
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: '30px',
    fontSize: '16px'
  },
  parent: container
});

// === SECTION 1: ÉLÉMENTS DRAGGABLES ===

const sourceSection = $('div', {
  css: {
    backgroundColor: 'white',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  parent: container
});

$('h2', {
  text: '🎮 Éléments Draggables',
  css: { color: '#495057', marginBottom: '15px' },
  parent: sourceSection
});

$('p', {
  text: 'Ces éléments peuvent être déplacés avec la souris ou glissés vers les zones de dépôt :',
  css: { color: '#6c757d', marginBottom: '20px' },
  parent: sourceSection
});

// Container pour les éléments draggables
const draggablesContainer = $('div', {
  css: {
    display: 'flex',
    gap: '15px',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  parent: sourceSection
});

// Créer plusieurs éléments draggables avec différentes propriétés
const draggableItems = [
  { id: 'item1', text: '🔵 Bleu', color: '#3498db', data: { type: 'circle', value: 'blue' } },
  { id: 'item2', text: '🔴 Rouge', color: '#e74c3c', data: { type: 'circle', value: 'red' } },
  { id: 'item3', text: '🟢 Vert', color: '#27ae60', data: { type: 'circle', value: 'green' } },
  { id: 'item4', text: '🟡 Jaune', color: '#f39c12', data: { type: 'circle', value: 'yellow' } },
  { id: 'item5', text: '📄 Document', color: '#9b59b6', data: { type: 'document', value: 'file.txt' } },
  { id: 'item6', text: '📁 Dossier', color: '#34495e', data: { type: 'folder', value: 'projects' } }
];

draggableItems.forEach(item => {
  const element = $('div', {
    id: item.id,
    css: {
      width: '120px',
      height: '80px',
      backgroundColor: item.color,
      color: 'white',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'grab',
      fontWeight: 'bold',
      fontSize: '12px',
      textAlign: 'center',
      userSelect: 'none',
      transition: 'all 0.3s ease',
      border: '2px solid transparent'
    },
    text: item.text,
    parent: draggablesContainer
  });

  // Appliquer le drag & drop avec HTML5
  if (window.makeDraggableWithDrop) {
    window.makeDraggableWithDrop(element, {
      enableHTML5: true,
      transferData: item.data,
      dragStartClass: 'dragging',
      onHTML5DragStart: (e, el) => {
        el.style.opacity = '0.5';
        el.style.transform = 'scale(0.9)';
        logActivity(`🚀 Drag démarré: ${item.text}`);
      },
      onHTML5DragEnd: (e, el) => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
        logActivity(`🏁 Drag terminé: ${item.text}`);
      },
      // Drag classique pour les effets visuels
      onDragStart: (el) => {
        el.style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)';
        el.style.zIndex = '1000';
      },
      onDragEnd: (el) => {
        el.style.boxShadow = '';
        el.style.zIndex = '';
      }
    });
  }
});

// === SECTION 2: ZONES DE DÉPÔT ===

const dropSection = $('div', {
  css: {
    backgroundColor: 'white',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  parent: container
});

$('h2', {
  text: '🎯 Zones de Dépôt',
  css: { color: '#495057', marginBottom: '15px' },
  parent: dropSection
});

// Container pour les zones de dépôt
const dropZonesContainer = $('div', {
  css: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginTop: '20px'
  },
  parent: dropSection
});

// Créer différentes zones de dépôt
const dropZones = [
  {
    id: 'zone-colors',
    title: '🎨 Zone Couleurs',
    description: 'Déposez les éléments colorés ici',
    accepts: ['circle'],
    color: '#e8f4fd'
  },
  {
    id: 'zone-files',
    title: '📂 Zone Fichiers',
    description: 'Déposez les documents et dossiers ici',
    accepts: ['document', 'folder'],
    color: '#f0e6ff'
  },
  {
    id: 'zone-all',
    title: '🌟 Zone Universelle',
    description: 'Accepte tout type d\'élément',
    accepts: [],
    color: '#e8f5e8'
  }
];

dropZones.forEach(zone => {
  const zoneElement = $('div', {
    id: zone.id,
    css: {
      minHeight: '120px',
      border: '2px dashed #bdc3c7',
      borderRadius: '8px',
      backgroundColor: zone.color,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#7f8c8d',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      padding: '20px',
      textAlign: 'center'
    },
    parent: dropZonesContainer
  });

  // Titre de la zone
  $('div', {
    text: zone.title,
    css: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '8px'
    },
    parent: zoneElement
  });

  // Description de la zone
  $('div', {
    text: zone.description,
    css: {
      fontSize: '12px',
      opacity: '0.8'
    },
    parent: zoneElement
  });

  // Container pour les éléments déposés
  const droppedContainer = $('div', {
    css: {
      marginTop: '10px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '5px',
      justifyContent: 'center'
    },
    parent: zoneElement
  });

  // Configurer la zone de dépôt
  if (window.makeDropZone) {
    window.makeDropZone(zoneElement, {
      acceptTypes: zone.accepts,
      onDragEnter: (e, el) => {
        el.style.borderColor = '#3498db';
        el.style.backgroundColor = '#ebf3fd';
        el.style.transform = 'scale(1.02)';
        logActivity(`🎯 Entrée dans ${zone.title}`);
      },
      onDragLeave: (e, el) => {
        el.style.borderColor = '#bdc3c7';
        el.style.backgroundColor = zone.color;
        el.style.transform = 'scale(1)';
      },
      onDragOver: (e, el) => {
        // Validation en temps réel
        try {
          const data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
          const isAccepted = zone.accepts.length === 0 || zone.accepts.includes(data.type);
          
          el.style.borderColor = isAccepted ? '#27ae60' : '#e74c3c';
          el.style.backgroundColor = isAccepted ? '#e8f5e8' : '#fdf2f2';
        } catch (err) {
          // Fallback si pas de données JSON
        }
      },
      onDrop: (e, el, transferData) => {
        console.log('🔍 DEBUG onDrop:', {
          event: e,
          element: el,
          transferData: transferData,
          zone: zone,
          droppedContainer: droppedContainer
        });
        
        el.style.borderColor = '#bdc3c7';
        el.style.backgroundColor = zone.color;
        el.style.transform = 'scale(1)';

        // Vérifier si l'élément est accepté
        const isAccepted = zone.accepts.length === 0 || zone.accepts.includes(transferData.type);
        
        console.log('🔍 DEBUG validation:', {
          accepts: zone.accepts,
          transferType: transferData.type,
          isAccepted: isAccepted
        });
        
        if (isAccepted) {
          // Créer un élément représentant l'objet déposé
          const droppedItem = $('span', {
            css: {
              backgroundColor: '#27ae60',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '10px',
              margin: '2px'
            },
            text: transferData.value || transferData.text || 'Objet',
            parent: droppedContainer
          });

          console.log('✅ Élément déposé créé:', droppedItem);
          logActivity(`✅ Dépôt réussi dans ${zone.title}: ${transferData.value || transferData.text}`);
        } else {
          logActivity(`❌ Dépôt rejeté dans ${zone.title}: type non accepté`);
          
          // Animation de rejet
          el.style.animation = 'shake 0.5s ease-in-out';
          setTimeout(() => {
            el.style.animation = '';
          }, 500);
        }
      }
    });
  }
});

// === SECTION 3: LOG D'ACTIVITÉ ===

const logSection = $('div', {
  css: {
    backgroundColor: 'white',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    padding: '20px'
  },
  parent: container
});

$('h2', {
  text: '📋 Log d\'Activité',
  css: { color: '#495057', marginBottom: '15px' },
  parent: logSection
});

const logContainer = $('div', {
  id: 'activity-log',
  css: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '15px',
    maxHeight: '200px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '12px'
  },
  text: '🚀 Démo initialisée. Commencez à glisser des éléments !',
  parent: logSection
});

// Bouton pour vider le log
$('button', {
  text: '🗑️ Vider le log',
  css: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '10px',
    fontSize: '12px'
  },
  onclick: () => {
    logContainer.innerHTML = '📝 Log vidé.';
  },
  parent: logSection
});

// === FONCTION UTILITAIRE ===

function logActivity(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = $('div', {
    css: {
      borderBottom: '1px solid #dee2e6',
      paddingBottom: '5px',
      marginBottom: '5px',
      color: '#495057'
    },
    text: `[${timestamp}] ${message}`,
    parent: logContainer
  });
  
  // Scroll vers le bas
  logContainer.scrollTop = logContainer.scrollHeight;
}

// === STYLES CSS ADDITIONNELS ===

// Ajouter des styles CSS pour l'animation de rejet
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
  
  .dragging {
    opacity: 0.7;
    transform: scale(0.95) rotate(5deg);
    z-index: 1000;
  }
  
  .drop-hover {
    border-color: #27ae60 !important;
    background-color: #e8f5e8 !important;
    transform: scale(1.02);
  }
`;
document.head.appendChild(style);

console.log('✅ Exemple Drag & Drop chargé avec succès !');
