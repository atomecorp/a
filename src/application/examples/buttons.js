import Button from '../../squirrel/components/button_builder.js';


function createMaterialToggle(initialState = false) {
  let state = initialState;

  // Création du conteneur avec Squirrel
  const container = $("div", {
    id: 'test1',
    css: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px',
    }
  });

  const toggle = Button({
    text: 'hello',
    parent: container, // parent direct
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
      backgroundColor: 'orange',
      position: 'relative',
      border: 'none',
      cursor: 'pointer',
      transition: 'background-color 0.3s ease',
      border: '3px solid rgba(255,255,255,0.3)',
      boxShadow: '0 2px 4px rgba(255,255,1,1)',
    }
  });

  const label = document.createElement('span');
  label.textContent = state ? 'Activé' : 'Désactivé';
  label.style.fontWeight = 'bold';
  label.style.color = state ? 'yellowgreen' : 'green';

  function updateVisualState() {
    toggle.updateText(state ? 'on' : 'off');
    toggle.style.backgroundColor = state ? 'yellowgreen' : 'yellow';
    label.textContent = state ? 'Activé' : 'Désactivé';
    label.style.color = state ? 'yellowgreen' : 'green';
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