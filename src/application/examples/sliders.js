




// better design

const insetSlider = Slider.create({
  type: 'horizontal',
  min: 0,
  max: 100,
  showLabel: false,
  skin: {
	container: {
	  width: '300px',
	  height: '30px',
	  background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
	  borderRadius: '15px',
	  boxShadow: `
		inset 0 3px 6px rgba(0,0,0,0.15),
		inset 0 1px 3px rgba(0,0,0,0.1),
		0 1px 0 rgba(255,255,255,0.8)
	  `,
	  border: '1px solid rgba(0,0,0,0.1)',
	  position: 'relative',
	//   margin: '50px auto',
	  padding: '0'
	},
	track: {
	  width: '100%',
	  height: '100%',
	  borderRadius: '15px',
	  background: 'transparent',
	  position: 'relative',
	  overflow: 'hidden'
	},
	fill: {
	  height: '100%',
	  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
	  borderTopLeftRadius: '15px',
	  borderBottomLeftRadius: '15px',
	  borderTopRightRadius: '0',
	  borderBottomRightRadius: '0',
	  boxShadow: `
		inset 0 1px 3px rgba(255,255,255,0.3),
		0 1px 2px rgba(0,0,0,0.1)
	  `,
	//   transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)'
	},
	handle: {
	  width: '30px',
	  height: '30px',
	  background: 'linear-gradient(135deg, #ffffff 0%, #e8eaf6 100%)',
	  border: '2px solid #667eea',
	  borderRadius: '50%',
	  top: '50%',
	  transform: 'translateY(-50%) scale(1)',
	  marginLeft: '-15px',
	  boxShadow: `
		0 2px 8px rgba(102, 126, 234, 0.3),
		inset 0 1px 0 rgba(255,255,255,0.8),
		inset 0 -1px 0 rgba(0,0,0,0.1)
	  `,
	  cursor: 'grab'
	//   transition: 'all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
	}
  },
  onInput: (value) => console.log('Slider value:', value)
});

// Style pour l'effet grab/grabbing sur le handle
const handleStyle = document.createElement('style');
handleStyle.textContent = `
  .hs-slider-handle {
	transform: translateY(-50%) scale(1) !important;
  }
  
  .hs-slider-handle:active {
	cursor: grabbing !important;
	transform: translateY(-50%) scale(1.05) !important;
	box-shadow: 
	  0 4px 12px rgba(102, 126, 234, 0.4),
	  inset 0 1px 0 rgba(255,255,255,0.9),
	  inset 0 -1px 0 rgba(0,0,0,0.15) !important;
  }
  
  .hs-slider-handle:hover {
	transform: translateY(-50%) scale(1.02) !important;
	box-shadow: 
	  0 3px 10px rgba(102, 126, 234, 0.35),
	  inset 0 1px 0 rgba(255,255,255,0.85),
	  inset 0 -1px 0 rgba(0,0,0,0.12) !important;
  }
  
  .hs-slider-fill {
	background: linear-gradient(90deg, #667eea 0%, #764ba2 100%) !important;
  }
`;
document.head.appendChild(handleStyle);

// // Container pour présenter le slider
// const demoContainer = document.createElement('div');
// demoContainer.style.cssText = `
//   padding: 4px;
//   background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
//   border-radius: 20px;
//   box-shadow: 
// 	0 10px 30px rgba(0,0,0,0.1),
// 	inset 0 1px 0 rgba(255,255,255,0.6);
//   text-align: center;
//   font-family: system-ui, sans-serif;
// `;

// // Assemblage
// demoContainer.appendChild(insetSlider);

// // Ajout au DOM
// document.body.appendChild(demoContainer);




// Slider simple
const simpleSlider = Slider.create({
  type: 'horizontal',
  min: 0,
  max: 100,
  showLabel: false,
  onInput: (value) => console.log('Slider value:', value)
});

// Ajout au DOM
document.body.appendChild(simpleSlider);

// Slider vertical simple
const verticalSlider = Slider.create({
  type: 'vertical',
  min: 0,
  max: 100,
  showLabel: false,
  skin: {
	container: {
	  width: '40px',
	  height: '300px'
	},
	track: {
	  width: '18px'
	},
	progression: {
	  backgroundColor: 'orange',
	//   borderBottomLeftRadius: '9px',
	//   borderBottomRightRadius: '9px'
	},
	handle: {
	  width: '24px',
	  height: '24px'
	}
  },
  onInput: (value) => console.log('Slider value:', value)
});

// Ajout au DOM
document.body.appendChild(verticalSlider);





// Slider circulaire simple avec SVG personnalisé
const circularSlider = Slider.create({
  type: 'circular',
  min: 0,
  max: 100,
  showLabel: false,
  skin: {
	container: {
	  width: '150px',
	  height: '150px'
	},
	track: {
	  border: '8px solid #e0e0e0'
	},
	handle: {
	  width: '20px',
	  height: '20px',
	  backgroundColor: '#ff6b6b',
	  border: '2px solid #ffffff'
	},
	svg: {
	  stroke: '#ff6b6b',
	  strokeWidth: '6',
	  strokeLinecap: 'round',
	  opacity: '0.8'
	}
  },
  onInput: (value) => console.log('Circular slider value:', value)
});

// Ajout au DOM
document.body.appendChild(circularSlider);
