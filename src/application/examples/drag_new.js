// === TESTS DU COMPOSANT DRAGGABLE ===

// Test 1: Draggable basique avec template
// const basicDrag = Draggable('draggable-box', {
//   content: '🔴 Basic',
//   css: {
//     left: '100px',
//     top: '100px',
//     backgroundColor: '#e74c3c'
//   },
//   onDragStart: (el) => {
//     console.log('🔴 Début drag basique');
//   },
//   onDragEnd: (el) => {
//     console.log('🔴 Fin drag basique');
//   }
// });




$('div', {
  // pas besoin de 'tag'
  id: 'drag1',
  drag: true, // Activer le drag
  text: 'Drag Me' ,

  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    width: '66px',
    height: '66px',
    borderRadius: '12px',
    display: 'inline-block'
  }
  ,
  onDragStart: (el) => {
    console.log('🔴 Début drag basique');
  },
  onDragEnd: (el) => {
    console.log('🔴 Fin drag basique');
  }
});


const div_to_be_draggeble = $('div', {
  // pas besoin de 'tag'
  id: 'drag2',
  text: 'Drag Me' ,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    width: '66px',
    height: '66px',
    borderRadius: '12px',
    display: 'inline-block'
  }

});



div_to_be_draggeble.drag = {
  enabled: true,
    cursor: 'grab',
  rotationFactor: 0.3,
  onDragStart: (el) => {
    console.log('🟡 Début drag custom');
    el.style.border = '3px solid #e67e22';
  },
  onDragEnd: (el) => {
    console.log('🟡 Fin drag custom');
    el.style.border = '3px dashed #e67e22';
  }
};


$('div', {
  id: 'my-draggable',
  text: 'Glisse-moi',
  css: { 
    width: '100px',
    height: '100px',
    background: '#3498db',
    borderRadius: '16px',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab'
  },
  drag: {
    enabled: true,                // active le drag
    axis: 'both',                 // 'x', 'y', 'both'
    bounds: 'parent',             // ou { top, left, right, bottom }
    revert: false,                // revient à sa place si drop raté
    ghost: true,                  // affiche un clone pendant le drag
    grid: [20, 20],               // snap sur une grille optionnelle
    handle: '.handle',            // drag que depuis un sous-élément
    group: 'cards',               // permet le drop entre groupes
    dropTarget: true,             // accepte les drops
    data: { type: 'user', id: 42 }, // données transférées custom

    onDragStart: (el, event, data) => { 
      el.style.opacity = 0.7;
    },
    onDrag: (el, event, data) => {
      // déclenché pendant le drag, pour animation custom
    },
    onDragEnd: (el, event, data) => {
      el.style.opacity = 1;
    },
    onDrop: (el, droppedEl, data) => {
      // quand on drop un autre élément dessus
      el.appendChild(droppedEl);
    }
  }
});