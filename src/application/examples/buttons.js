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

// Bouton toggle on/off avec style Material Design
let isToggleOn = false;

const toggleButton = Button.materialSwitch({
  onClick: () => {
    isToggleOn = !isToggleOn;
    if (isToggleOn) {
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





// Optionnal ripple Animation
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

