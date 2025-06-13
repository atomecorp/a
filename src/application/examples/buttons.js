
// Bouton toggle on/off avec style Material Design
let isToggleOn = false;

const toggleButton = Button.create({
  text: 'OFF',
  icon: '○',
  id: 'material-toggle',
  skin: {
    container: {
      position: 'relative',
      width: '60px',
      height: '34px',
      padding: '0',
      borderRadius: '17px',
      backgroundColor: '#ccc',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      fontFamily: 'Roboto, Arial, sans-serif',
      fontSize: '0px' // Cache le texte
    },
    icon: {
      position: 'absolute',
      left: '2px',
      top: '2px',
      width: '30px',
      height: '30px',
      borderRadius: '50%',
      backgroundColor: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0px', // Cache l'icône par défaut
      transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      transform: 'translateX(0px)',
      '::before': {
        content: '""',
        display: 'block'
      }
    }
  },
  onClick: () => {
    isToggleOn = !isToggleOn;
    
    if (isToggleOn) {
      // État ON
      toggleButton.$({
        css: {
          backgroundColor: '#4CAF50',
          boxShadow: '0 4px 8px rgba(76, 175, 80, 0.3)'
        }
      });
      
      const iconEl = toggleButton.querySelector('.hs-button-icon');
      if (iconEl) {
        iconEl.style.transform = 'translateX(26px)';
        iconEl.style.backgroundColor = '#fff';
      }
      
      // Effet ripple
      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        background: rgba(255,255,255,0.6);
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
        left: 50%;
        top: 50%;
        width: 20px;
        height: 20px;
        margin-left: -10px;
        margin-top: -10px;
      `;
      
      toggleButton.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
      
      console.log('Toggle activé ✅');
    } else {
      // État OFF
      toggleButton.$({
        css: {
          backgroundColor: '#ccc',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }
      });
      
      const iconEl = toggleButton.querySelector('.hs-button-icon');
      if (iconEl) {
        iconEl.style.transform = 'translateX(0px)';
      }
      
      console.log('Toggle désactivé ❌');
    }
  }
});

// Ajout des styles d'animation pour l'effet ripple
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
  
  #material-toggle:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
  }
  
  #material-toggle:active {
    transform: scale(0.98);
  }
`;
document.head.appendChild(style);

// Ajout du toggle au body avec un label
const toggleContainer = $('div', {
  css: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
    fontFamily: 'Roboto, Arial, sans-serif'
  },
  parent: body
});

const toggleLabel = $('div', {
  text: 'Mode sombre',
  css: {
    fontSize: '16px',
    color: '#333',
    fontWeight: '500',
    userSelect: 'none'
  },
  parent: toggleContainer
});

toggleContainer.appendChild(toggleButton);

const btn = Button.primary({
  text: 'Sauvegarder',
  icon: '💾',
  badge: 3,
  skin: {
    container: { borderRadius: '20px' },
    text: { fontWeight: 'bold' },
    badge: { backgroundColor: '#ff6b6b' }
  }
});