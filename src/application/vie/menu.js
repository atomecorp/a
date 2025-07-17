
const topBar = document.querySelector('#top-bar');


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
      zIndex: 1000,
      top: barsHeight + 'px',
      left: '0',
      width: basicWidth + 'px',
      top: barsHeight + 'px',
      bottom: barsHeight + 'px',
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


