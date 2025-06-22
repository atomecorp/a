const topBar = $('div', {
  id: 'top-bar',
  css: {
    backgroundColor: 'rgb(68, 142, 220)',
    marginLeft: '0',
    color: 'white',
    top: '0',
    left: '0',
    position: 'fixed',
    height: '39px',
    width: '100%',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    borderBottom: '2px solid rgb(68, 142, 220)',
    display: 'block'
  },
  text: 'Je suis la vie !'
});

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
  id: 'sandwich-menu',
  css: {
    position: 'fixed',
    top: '39px',
    left: '0',
    width: '200px',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '10px',
    display: 'none',
    flexDirection: 'column',
    gap: '10px'
  }
});

['Accueil', 'Profil', 'Param\u00e8tres'].forEach(text => {
  $('div', {
    parent: menuOverlay,
    text,
    css: {
      padding: '8px',
      cursor: 'pointer'
    }
  });
});

menuButton.addEventListener('click', () => {
  menuOverlay.style.display = menuOverlay.style.display === 'none' ? 'flex' : 'none';
});


const bottomBar = $('div', {
  id: 'bottom-bar',
  css: {
    backgroundColor: 'rgb(68, 142, 220)',
    marginLeft: '0',
    color: 'white',
    bottom: '0',
    left: '0',
    position: 'fixed',
    height: '39px',
    width: '100%',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    borderBottom: '2px solid rgb(68, 142, 220)',
    display: 'block'
  },
  text: 'Je suis la vie !'
});