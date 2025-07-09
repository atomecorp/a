import('./values.js').then(() => {
  

const vieViewer = $('div', {
  id: 'vieViewer',
  css: {
    backgroundColor: vieBackColor,
    marginLeft: '0',
    color: 'white',
    bottom: barsHeight+'px',
    top: barsHeight+'px',
    left: '0',
    position: 'fixed',
    width: '100%',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    borderBottom: '2px solid rgb(68, 142, 220)',
    display: 'block'
  },

});


const topBar = $('div', {
  id: 'top-bar',
  css: {
    backgroundColor: vieBackColor,
    marginLeft: '0',
    color: 'white',
    top: '0',
    left: '0',
    position: 'fixed',
    height: barsHeight+'px',
    width: '100%',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    // borderBottom: '2px solid rgb(68, 142, 220)',
    boxShadow: '-2px 0px 6px rgb(6, 5, 5)',
    display: 'block'
  },
});






const bottomBar = $('div', {
  id: 'bottom-bar',
  css: {
    backgroundColor: vieBackColor,
    boxShadow: '2px 0px 6px rgba(0,0,0,1)',
    smooth: 10,
    marginLeft: '0',
    color: 'white',
    bottom: '0',
    left: '0',
    position: 'fixed',
    height: barsHeight+'px',
    width: '100%',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    display: 'block'
  },
});



const vieLogo = $('svg', {
  id: 'svg-vie-from-file',
  attrs: {

    viewBox: '0 0 237 237',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  svgSrc: '../../assets/images/logos/vie.svg',
  parent: topBar,  
  css: {
  top: Math.floor((barsHeight - (barsHeight-10)) / 2) + 'px',  
    width: barsHeight-10+'px',    
    height: barsHeight-10+'px',
    position: 'absolute',
    right: '10px',
  }
});





///menu system 

// --- Simple hamburger / sandwich menu ---
const menuButton = $('div', {
  id: 'menu-button',
  parent: topBar,
  css: {
    position: 'absolute',
    left: '10px',
    top: '7px',
    width: '24px',
    height: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer'
  }
});

['', '', ''].forEach(() => {
  $('div', {
    parent: menuButton,
    css: {
      height: '3px',
      backgroundColor: 'white',
      borderRadius: '2px'
    }
  });
});

const menuOverlay = $('div', {
   parent: vieViewer,
  id: 'sandwich-menu',
  css: {
    position: 'fixed',
    top: barsHeight+'px',
    left: '0',
    width: basicWidth+ 'px',
    top: barsHeight+ 'px',
    bottom: barsHeight+ 'px',
    overflow: 'auto',
    backgroundColor: itemskColor,
    color: 'white',
    padding: '10px',
    display: 'none',
    flexDirection: 'column',
    gap: '10px'
  }
});

['Load', 'Tools', 'Infos', 'Inspector'].forEach(text => {
  $('div', {
    parent: menuOverlay,
    text,
    css: {
      padding: '8px',
      cursor: 'pointer',
      fontSize: '12Px'
    }
  });
});



menuButton.addEventListener('click', () => {
  menuOverlay.style.display = menuOverlay.style.display === 'none' ? 'flex' : 'none';
});

function updateMenuLayout() {
  const topHeight = topBar.getBoundingClientRect().height;
  const buttonHeight = menuButton.getBoundingClientRect().height;
  menuOverlay.$({ css: { top: `${topHeight}px` } });
  menuButton.$({ css: { top: `${(topHeight - buttonHeight) / 2}px` } });
}

window.addEventListener('squirrel:ready', () => {
  updateMenuLayout();
  window.addEventListener('resize', updateMenuLayout);
});






/// tools 


function fct_to_trig(state) {
    console.log('trig: ' + state);
}


const toggle = Button({
   onStyle: {
        background: 'linear-gradient(135deg, #48c6ef 0%, #6f86d6 100%)',
        transform: 'scale(1.05)',
        boxShadow: '0 6px 20px rgba(72, 198, 239, 0.6)'
    },
    offStyle: {
        background: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)',
        transform: 'scale(0.95)',
        boxShadow: '0 2px 10px rgba(252, 70, 107, 0.4)'
    },
    hover: {
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 25px rgba(102, 126, 234, 0.6)'
    },
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig,
    parent: topBar, 
      // template: 'material_design_green',
    template:    'lyrix_custom',
        css: {
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '1px'
    },
});
// À la fin de votre fichier vie.js, ajouter :
import('./unit_test.js')

});