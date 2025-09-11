// menu – Modular Snake/Nibble Menu Spec v1.1 
// Notes: canvas holds a working spec with JSON + comments. JSON sections may include // comments.




const intuition_content = {
  version: "1.1",
  meta: { "namespace": "atome.menu", "defaultLocale": "en" },

  toolsbox: {
	id: "toolsbox",
	type: "toolsbox",
	children: ['home', 'find', 'time', 'view', 'tools', 'communcation', 'capture', 'edit'],
  },
  home: {
	id: "home",
	type: "palette",
	children: ['quit', 'user', 'settings', 'clear', 'cleanup'],
  },
   home: {
	id: "find",
	type: "palette",
	children: ['filter'],
  }
};




// === Theme (base) ===
const Inntuition_theme = {
  "light": {
  "items_spacing": "5px",
  "item_size": "69px",
	"tool_bg": "#020202ff",
	"tool_bg_active": "#656565ff",
	"tool_text": "#8c8b8bff",
	"tool_active_bg": "#e0e0e0",
	"icon_top": "45%",
  "icon_left": "33%",
  "icon_centered_top": "33%",
  "icon_centered_left": "33%",
	"icon_size": "16%",
	"item_shadow": "0px 0px 5px rgba(0,0,0,0.69)",
	"item_border_radius": "20%",


	// "toggle-btn-size": "33px",
	// "toggle-btn-left": "0px",
	// "toggle-btn-top": "25%",
	//   "global-label-font-size": "3%",
  // "label-max-chars": 5,
  // "particle_value_setter_width": "93%",
  // "particle_value_setter_height": "3%",
  // "particle_value_setter_color": "#656565ff", // default to tool-bg-active
	// "particle_value_setter_shadow": "0% 0% 1% rgba(0,0,0,0.69)", // default to item-shadow
	// "particle_value_setter_top": "50%",
	// "particle_value_setter_left": "50%",
	// "particle_value_setter_transform": "translate(-50%, -50%)"
	// ,
	// "particle_input_value_bottom": "",
	// "particle_input_value_left": "",
	// "label-top": "0px",
	// "label-left": "0px",
	// "value-top": "",
	// "value-left": "0px",
  }
};

function intuitionCommon(cfg) {

  const el=$('div', {
  id: cfg.id,
  parent: cfg.parent,
  class: cfg.type,
 css: {
  backgroundColor: 'rgba(21, 255, 0, 1)',
  width: currentTheme.item_size,
  height: currentTheme.item_size,
  color: 'white',
  display: 'inline-block',
  position: 'relative',
  ...(cfg.css || {})   // <-- écrase/ajoute les clés fournies
},
});
 el.click=cfg.click; // attach click handler properly so the passed function is executed
if (typeof cfg.click === 'function') {
  el.addEventListener('click', function (e) { 
   try { cfg.click.call(el, e); } catch (err) { console.error(err); }
  });
}
return el;
}


function toolsbox(cfg) {
const height = (currentTheme.position === 'left' || currentTheme.position === 'right') 
  ? '100vh'  
  : currentTheme.item_size;

const width = (currentTheme.position === 'top' || currentTheme.position === 'bottom') 
  ? '100vw'   
  : currentTheme.item_size;

let posCss = {};
switch (currentTheme.position) {
  case 'top':
    posCss = { top: '0', left: '0' };
    break;
  case 'bottom':
    posCss = { bottom: '0', left: '0' };
    break;
  case 'left':
    posCss = { top: '0', left: '0' };
    break;
  case 'right':
    posCss = { top: '0', right: '0' };
    break;
}

const toolsbox_support = {
  id: 'toolsbox_support',
  type: 'toolsbox_support',
  parent: '#intuition',
  css: {
    display: 'block',
    width: width,
    maxWidth: width,
    height: height,
    maxHeight: height,
    position: 'fixed',
    backgroundColor: 'red',
    overflow: 'auto',
    ...posCss  // injecte la bonne ancre (haut/bas/gauche/droite)
  }
};
  intuitionCommon(toolsbox_support)
  puts(cfg)
if (currentTheme.direction == 'top'){
cfg.css={...cfg.css, ... {position: 'absolute',bottom: '0px',}}
}

  const el = intuitionCommon(cfg)

  return el;
}





function palette(cfg) {

  cfg.css = {
	...cfg.css,

  };

  // const el = intuitionCommon(cfg)
}

function tool(cfg) {
  // cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)

}

function particle(cfg) {
  // cfg.theme = currentToolbox().theme;
  // if (!cfg.type) cfg.type = 'particle';
  const el = intuitionCommon(cfg);
}

function option(cfg) {
	// cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)
}

function zonespecial(cfg) {
//  cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)
}


const currentTheme=Inntuition_theme.light
currentTheme.direction="bottom";
currentTheme.position="right";


toolsbox(
  {  
  id: "toolsbox",
  type: "toolsbox",
  parent: '#toolsbox_support',
   click: function(e){
    puts(intuition_content.toolsbox.children);  
    grab('toolsbox').style.backgroundColor='blue';
  },
  margin: currentTheme["items_spacing"], 
  css: {
    boxShadow: currentTheme["item_shadow"],
    borderRadius: currentTheme["item_border_radius"],
    backgroundColor: currentTheme["tool_bg"],


  },
  label: null,
  icon: 'menu',
}
);



palette({
  id: "communication",
  // parent: 'toolsbox',
  // margin: currentTheme["items_spacing"],
  type: "palette",
  label: 'communication',
  icon: 'communication',
});



// tool({
// 	id: "create",
//     margin: currentToolsBoxTheme["items_spacing"],
// 	type: "tool",
//   label: 'create',
//   icon: 'create',
//   colorise: true, 
// });
// option({
// 	id: "boolean",
//     margin: currentToolsBoxTheme["items_spacing"],
// 	type: "option",
// 	label: 'boolean',
// 	button: 'boolean',
// 	colorise: true,
// });


// zonespecial({
// 	id: "color-pallete",
//     margin: currentToolsBoxTheme["items_spacing"],
// 	type: "special",
//   label: 'palette',
//   icon: 'color',
//   colorise: true, 
// });


// particle({
//     id: "width-particle",
//       margin: currentToolsBoxTheme["items_spacing"],
//     type: "particle",
//   label: 'width',
//   input: 0.5,
//   selector:['%','px','cm','em','rem','vh','vw'],

// });


// particle({
// 	id: "red-particle",
//     margin: currentToolsBoxTheme["items_spacing"],
// 	type: "particle",
//   label: 'color',
//   input: 0.5,
//   value: 'red',

// });
// intuition_content.current_toolsbox='poil'

