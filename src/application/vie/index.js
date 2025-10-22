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

const MATRIX_VISIBLE_CELLS = 8;
const MATRIX_CELL_SIZE = 56;
const MATRIX_HORIZONTAL_GAP = 8;
const MATRIX_VERTICAL_GAP = 8;
const MATRIX_EXTERNAL_PADDING = 20;
const MATRIX_CONTENT_WIDTH = (MATRIX_CELL_SIZE * MATRIX_VISIBLE_CELLS) + (MATRIX_HORIZONTAL_GAP * (MATRIX_VISIBLE_CELLS - 1));
const MATRIX_CONTENT_HEIGHT = (MATRIX_CELL_SIZE * MATRIX_VISIBLE_CELLS) + (MATRIX_VERTICAL_GAP * (MATRIX_VISIBLE_CELLS - 1));
const MATRIX_VIEWPORT_WIDTH = MATRIX_CONTENT_WIDTH + (MATRIX_EXTERNAL_PADDING * 2);
const MATRIX_VIEWPORT_HEIGHT = MATRIX_CONTENT_HEIGHT + (MATRIX_EXTERNAL_PADDING * 2);

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


const normalizeEventTarget = (node) => {
  if (node instanceof Element) return node;
  return node && node.parentElement ? node.parentElement : null;
};

const isGlobalDropAllowed = (node) => {
  const element = normalizeEventTarget(node);
  if (!element) return true;
  const menuHost = element.closest('#intuition');
  if (!menuHost) return true;
  return Boolean(element.closest('[data-allow-global-drop="true"]'));
};



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
  const target = normalizeEventTarget(event.target) || document.body;
  files.forEach((f, index) => {
    puts(target.id)
    file_drop_analysis(f, target, index)

  });

}

function local_drop(files, event) {

  puts('DropZone local déclenché');
  puts(`Nombre de fichiers: ${files.length}`);

}


// $('div', {
//   id: 'isolation_test_zone',
//   css: {
//     backgroundColor: 'rgba(255, 0, 174, 1)',
//     marginLeft: '0',
//     padding: '10px',
//     left: '333px',
//     position: 'absolute',
//     width: '300px',
//     height: '200px',
//     color: 'white',
//     margin: '10px',
//     display: 'inline-block'
//   },
//   text: 'Drop files here'
// });



// DragDrop.createDropZone('#isolation_test_zone', {
//   accept: '*',
//   multiple: true,
//   event: 'kill', //  event: 'stop', 'kill' //prevent event bubbling
//   allowedDropId: 'isolation_test_zone',
//   onDrop: (files, event) => {
//     local_drop(files, event);
//   }
// }) || null;


DragDrop.registerGlobalDrop({
  accept: '*',
  multiple: true,
  onDragEnter: (event) => {
    if (!isGlobalDropAllowed(event.target)) return;

  },
  onDragLeave: (event) => {
    if (!isGlobalDropAllowed(event.target)) return;

  },
  onDrop: (files, event) => {
    if (!isGlobalDropAllowed(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = normalizeEventTarget(event.target);
    mainfile_drop(files, event)
  }
});








const customElement = $('div', {
  id: 'test_box',
  css: {
    position: 'absolute',
    left: '0px',
    top: '50px',
    right: '0px',
    bottom: '50px',
    width: 'auto',
    height: 'auto',
    backgroundColor: '#f39c12',
    borderRadius: '3px',
    boxSizing: 'border-box',
    overflow: 'auto',
    scrollSnapType: 'both mandatory',
    scrollPadding: `${MATRIX_EXTERNAL_PADDING}px`,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: '0',
    color: '#fff',
    fontWeight: 'bold'
  }
});

// // Appliquer makeDraggable directement
// makeDraggable(customElement, {
//   cursor: 'grab',
//   onDragStart: (el) => {

//   },
//   onDragEnd: (el) => {

//   }
// });

const spacing = 12

const matrix = new Matrix({
  id: 'gradient-matrix',
  grid: { x: MATRIX_VISIBLE_CELLS, y: MATRIX_VISIBLE_CELLS },

  spacing: {
    horizontal: spacing,
    vertical: spacing,
    external: spacing,
  },
  attach: '#test_box',
  autoResize: false,
  cellSize: MATRIX_CELL_SIZE,
  maintainAspectRatio: true,

  // Container with gradient
  containerStyle: {
    background: 'red',
    border: 'none',
    boxShadow: 'none',
    flex: '0 0 auto',
    padding: spacing + 'px'
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

    // 'selected-clicked': {
    //   // Selected + clicked: add border
    //   boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.2)',
    //   background: 'linear-gradient(145deg, #ad1818ff 0%, #560e0eff 100%)',
    //   // border: '3px solid #667eea'
    // }
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




setTimeout(() => {
  matrix.addColumn().addRow()

}, 3000);


