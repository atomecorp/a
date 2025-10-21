// const vieLogo = $('img', {
//   id: 'img_test',
//   parent: "#view",
//   attrs: {
//     src: './assets/images/2.png',
//     alt: 'ballanim'
//   },
//   css: {
//     marginLeft: '0',
//     color: 'white',
//     left: '0px',
//     top: '0px',
//     position: 'relative',
//     height: "100%",
//     width: "100%",
//     textAlign: 'center',
//     display: 'block'
//   }
// });

import './menu.js';

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
function create_audio_object(f, target) {
  const panel = $('section', {
    parent: target,
    id: 'file_audio_' + f.name,
    css: {

      width: '39px',
      height: '39px',
      padding: '24px',
      backgroundColor: '#333',
      borderRadius: '12px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      marginBottom: '12px',
      marginTop: '12px',
      marginLeft: '12px',
      marginRight: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      color: '#fff'
    }
  });


  $('audio', {
    parent: panel,
    attrs: {
      controls: 'controls',
      src: URL.createObjectURL(f.file),
      // autoplay: false
    },
    css: {
      width: '100%'
    }
  });
}



function file_drop_analysis(f, target, index) {
  const extension = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : null;

  // puts(`Fichier ${index + 1}:`);
  // puts(`  - Nom: ${f.name}`);
  // puts(`  - Extension: ${extension}`);
  // puts(`  - Type: ${f.type || 'inconnu'}`);
  // puts(`  - Taille: ${formatBytes(f.size)}`);
  // puts(`  - Chemin: ${f.path || f.fullPath || 'non disponible'}`);

  let category = '';

  switch (extension) {
    case 'txt':
    case 'text':
      puts('Texte');
      break;
    case 'json':
      puts('JSON');
      break;
    case 'vie':
      puts('project');
      break;
    case 'md':
      puts('Markdown');
      break;
    case 'wav':
      puts('WAV');
      break;
    case 'aif':
    case 'aiff':
      puts('Audio');
      break;
    case 'mp3':
      puts('Audio');
      break;
    case 'm4v':
    case 'mp4':
      puts('Audio/Vidéo');
      break;
    case 'm4a':
      create_audio_object(f, target);
      // puts('Audio');
      break;
    case 'flac':
      puts('Audio');
      break;
    case 'mid':
    case 'midi':
      puts('MIDI');
      break;
    case 'jpg':
    case 'jpeg':
      puts('Image');
      break;
    case 'png':
      puts('Image');
      break;
    case 'svg':
      puts('Image');
      break;
    default:
      puts('unknow');
  }
}

function mainfile_drop(files, event) {
  const target = event.target;
  files.forEach((f, index) => {
    puts('  - Fichier: ' + f.name);
    file_drop_analysis(f, target, index)

  });

}

function local_drop(files, event) {

  puts('DropZone local déclenché');
  puts(`Nombre de fichiers: ${files.length}`);

}


$('div', {
  id: 'isolation_test_zone',
  css: {
    backgroundColor: 'rgba(255, 0, 174, 1)',
    marginLeft: '0',
    padding: '10px',
    left: '333px',
    position: 'absolute',
    width: '300px',
    height: '200px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Drop files here'
});



DragDrop.createDropZone('#isolation_test_zone', {
  accept: '*',
  multiple: true,
  event: 'kill', //  event: 'stop', 'kill' //prevent event bubbling
  allowedDropId: 'isolation_test_zone',
  onDrop: (files, event) => {
    local_drop(files, event);
  }
}) || null;


DragDrop.registerGlobalDrop({
  accept: '*',
  multiple: true,
  onDragEnter: (event) => {
    const target = event.target;

  },
  onDragLeave: (event) => {
    const target = event.target;

  },
  onDrop: (files, event) => {
    const target = event.target;
    mainfile_drop(files, event)
  }
});








// const customElement = $('div', {
//   content: '🟡 Custom',
//   css: {
//     position: 'absolute',
//     left: '550px',
//     top: '100px',
//     width: '120px',
//     height: '60px',
//     backgroundColor: '#f39c12',
//     borderRadius: '15px',
//     display: 'flex',
//     alignItems: 'center',
//     justifyContent: 'center',
//     color: 'white',
//     fontWeight: 'bold'
//   }
// });

// // Appliquer makeDraggable directement
// makeDraggable(customElement, {
//   cursor: 'grab',
//   onDragStart: (el) => {

//   },
//   onDragEnd: (el) => {

//   }
// });


const matrix = new Matrix({
  id: 'gradient-matrix',
  grid: { x: 8, y: 8 },

  spacing: { horizontal: 8, vertical: 8, external: 20 },
  attach: '#view',
  maintainAspectRatio: true,   // ← garde chaque cellule carrée

  // Container with gradient
  containerStyle: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
  },

  // Default cell style with gradient and external shadow
  cells: {
    default: {
      style: {
        background: 'linear-gradient(145deg, #ffffff 0%, #f0f0f0 100%)',
        borderRadius: '8px',
        border: 'none',
        boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
        fontSize: '16px',
        fontWeight: '600',
        color: '#333',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
      }
    }
  },

  // States with shadow styles
  states: {
    selected: {
      // Selected: external shadow to internal shadow
      boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
      background: 'linear-gradient(145deg, #e8e8e8 0%, #d0d0d0 100%)'
    },

    'selected-clicked': {
      // Selected + clicked: add border
      boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
      background: 'linear-gradient(145deg, #e8e8e8 0%, #d0d0d0 100%)',
      border: '3px solid #667eea'
    }
  },

  // Click handling
  onCellClick: (cell, x, y, cellId) => {
    const isSelected = matrix.hasCellState(x, y, 'selected');
    const isClickedSelected = matrix.hasCellState(x, y, 'selected-clicked');

    if (!isSelected) {
      // Not selected → Selected (internal shadow)
      matrix.addCellState(x, y, 'selected');

    } else if (isSelected && !isClickedSelected) {
      // Selected → Selected + Border
      matrix.removeCellState(x, y, 'selected');
      matrix.addCellState(x, y, 'selected-clicked');

    } else {
      // Selected + Border → Deselected (original style)
      matrix.removeCellState(x, y, 'selected-clicked');
      matrix.resetCellStyle(x, y);
    }
  }
});



function addColumn(matrix) {
  const newX = matrix.config.grid.x;
  const rowCount = matrix.config.grid.y;

  matrix.config.grid.x += 1;
  matrix.container.style.gridTemplateColumns = `repeat(${matrix.config.grid.x}, 1fr)`;

  for (let y = 0; y < rowCount; y += 1) {
    matrix.createCell(newX, y);
  }

  matrix.updateCellSizes();
}


function addRow(matrix) {
  const newY = matrix.config.grid.y;
  const colCount = matrix.config.grid.x;

  matrix.config.grid.y += 1;
  matrix.container.style.gridTemplateRows = `repeat(${matrix.config.grid.y}, 1fr)`;

  for (let x = 0; x < colCount; x += 1) {
    matrix.createCell(x, newY);
  }

  matrix.updateCellSizes();
}


setTimeout(() => {
  addColumn(matrix);
  addRow(matrix);
}, 3000);