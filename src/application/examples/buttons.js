import Button from '../../squirrel/components/button_builder.js';


function createMaterialToggle(initialState = false) {
  let state = initialState;
  
  const container = document.createElement('div');
  container.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
  `;
  
  const toggle = Button({
    text: state ? 'on' : 'off',
    parent: '#view',//TODO correct parent attache is not working
    onClick: () => {
      state = !state;
      updateVisualState();
      console.log('Toggle:', state ? 'ON ✅' : 'OFF ❌');
    },
    css: {
      width: '50px',
      height: '24px',
      left: '120px',
      top: '120px',
      borderRadius: '6px',
      backgroundColor: state ? 'red' : 'yellow',
      position: 'relative',
      border: 'none',
      cursor: 'pointer',
      transition: 'background-color 0.3s ease',
          border: '3px solid rgba(255,255,255,0.3)',
              boxShadow: '0 2px 4px rgba(255,255,1,1)',
           
    }
  });
  
  // const thumb = document.createElement('div');
  // thumb.style
  //   top: 2px;
  //   left: ${state ? '26px' : '2px'};
  //   width: 20px;
  //   height: 20px;
  //   border-radius: 50%;
  //   background: white;
  //   transition: left 0.3s ease;
  //   box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  // `;
  
  // toggle.appendChild(thumb);
  
  const label = document.createElement('span');
  label.textContent = state ? 'Activé' : 'Désactivé';
  label.style.fontWeight = 'bold';
  
  function updateVisualState() {
    toggle.$({ css: { backgroundColor: state ? 'red' : 'blue' } });
    toggle.updateText(state ? 'on' : 'off');
    // thumb.style.left = state ? '26px' : '2px';
    label.textContent = state ? 'Activé' : 'Désactivé';
    label.style.color = state ? 'red' : 'blue';
  }
  
  container.appendChild(toggle);
  container.appendChild(label);
  
  return {
    element: container,
    getValue: () => state,
    setValue: (newState) => {
      state = newState;
      updateVisualState();
    }
  };
}

// Utilisation
const myToggle = createMaterialToggle(false);
document.body.appendChild(myToggle.element);

// Pour récupérer la valeur
console.log('État actuel:', myToggle.getValue());