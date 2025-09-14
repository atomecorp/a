// menu – Modular Snake/Nibble Menu Spec v1.1 

// init constants
let calculatedCSS = {};
const shadowLeft = 5,
  shadowTop = 5,
  shadowBlur = 5,
  margin = shadowLeft + shadowTop + shadowBlur
let menuOpen = 'false'

//Theme (base) 
const Inntuition_theme = {
  light: {
    margin: `${margin}px`,
    items_spacing: "5px",
    item_size: "69px",
    tool_bg: "#484747ff",
    tool_bg_active: "#656565ff",
    tool_text: "#8c8b8bff",
    tool_active_bg: "#e0e0e0",
    icon_top: "45%",
    icon_left: "33%",
    icon_centered_top: "33%",
    icon_centered_left: "33%",
    icon_size: "16%",
    item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
    item_border_radius: "20%",


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

// curent theme
const currentTheme = Inntuition_theme.light
currentTheme.direction = "bottom_left_vertical"; //direction: top, bottom, left, right

// calculated values
calculatedCSS = calculate_positions()
const width = calculatedCSS.toolbox_support.width
const height = calculatedCSS.toolbox_support.height
const posCss = calculatedCSS.toolbox_support


// basic components
const toolbox_support = {
  id: 'toolbox_support',
  type: 'toolbox_support',
  parent: '#intuition',
  css: {
    display: 'flex',
    flexDirection: 'column-reverse',   /* le footer reste en bas, le reste s’empile au-dessus */
    justifyContent: 'flex-start',      /* NE PAS utiliser space-between */
    alignItems: 'flex-start',
    width: width,
    maxWidth: width,
    height: height,
    maxHeight: height,
    position: 'fixed',
    boxShadow: "0px 0px 0px rgba(0,0,0,0)",
    bottom: '20px',
    borderRadius: 0,
    backgroundColor: 'red',
    overflow: 'auto',
    gap: '0',
    ...posCss  // injecte la bonne ancre (haut/bas/gauche/droite)
  }
};

const intuition_content = {
  version: "1.1",
  meta: { "namespace": "atome.menu", "defaultLocale": "en" },

  toolbox: {
    //type: toolbox,
    children: ['home', 'find', 'time', 'view', 'tools', 'communication', 'capture', 'edit']
  },
  home: {
    type: palette,
    children: ['quit', 'user', 'settings', 'clear', 'cleanup'],
  },

  find: {
    type: tool,
    children: ['filter'],
  }
  ,
  time: {
    type: particle,
    children: ['filter'],
  }
  ,
  view: {
    type: option,
    children: ['filter'],
  }
  ,
  tools: {
    type: zonespecial,
    children: ['filter'],
  }
  ,
  communication: {
    type: palette,
    children: ['filter'],
  }
  ,
  capture: {
    type: palette,
    children: ['filter'],
  }
  ,
  edit: {
    type: palette,
    children: ['filter'],
  }

};

const toolbox = {
  id: "toolbox",
  type: "toolbox",
  parent: '#intuition',
  css: {
    backgroundColor: 'red',
    position: 'fixed',
    // zIndex: 10000000,


  },

  click: function (e) {
    reveal_children('toolbox')
  },
  label: null,
  icon: 'menu',
}

// utils
function calculate_positions() {
  let css_list = {};
  const dir = (currentTheme?.direction || 'top_left').toLowerCase();

  switch (dir) {
    case 'top_left_horizontal':
      css_list = {
        toolbox_support: {
          flexDirection: 'row',
          top: '0',
          left: `${parseInt(currentTheme.item_size)}px`,
          width: '100vw',
          height: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { top: '6px', left: '6px' }
      };
      break;

    case 'top_left_vertical':
      css_list = {
        toolbox_support: {
          flexDirection: 'column',
          top: '0',
          left: '0',
          height: '100vh',
          width: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { top: '6px', left: '6px' }
      };
      break;

    case 'top_right_horizontal':
      css_list = {
        toolbox_support: {
          flexDirection: 'row-reverse',
          top: '0',
          right: '0',
          width: '100vw',
          height: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { top: '6px', right: '6px' }
      };
      break;

    case 'top_right_vertical':
      css_list = {
        toolbox_support: {
          flexDirection: 'column',
          top: '0',
          right: '0',
          height: '100vh',
          width: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { top: '6px', right: '6px' }
      };
      break;

    case 'bottom_left_horizontal':
      css_list = {
        toolbox_support: {
          flexDirection: 'row',
          bottom: '0',
          left: '0',
          width: '100vw',
          height: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { bottom: '6px', left: '6px' }
      };
      break;

    case 'bottom_left_vertical':
      css_list = {
        toolbox_support: {
          flexDirection: 'column-reverse',
          bottom: '0',
          left: '0',
          height: '100vh',
          width: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { bottom: '6px', left: '6px' }
      };
      break;

    case 'bottom_right_horizontal':
      css_list = {
        toolbox_support: {
          flexDirection: 'row-reverse',
          bottom: '0',
          right: '0',
          width: '100vw',
          height: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { bottom: '6px', right: '6px' }
      };
      break;

    case 'bottom_right_vertical':
      css_list = {
        toolbox_support: {
          flexDirection: 'column-reverse',
          bottom: '0',
          right: '0',
          height: '100vh',
          width: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { bottom: '6px', right: '6px' }
      };
      break;

    default:
      css_list = {
        toolbox_support: {
          flexDirection: 'row',
          top: '0',
          left: '0',
          width: '100vw',
          height: `${parseInt(currentTheme.item_size) + parseInt(currentTheme.margin)}px`
        },
        toolbox: { top: '6px', left: '6px' }
      };
  }

  return css_list;
}

function reveal_children(parent) {
  const methods = intuition_content[parent].children || [];
  if (menuOpen !== parent) {

    methods.forEach(name => {
      const fct_exec = intuition_content[name]['type']
      if (typeof fct_exec === "function") {
        const optionalParams = { ...{ id: `_intuition_${name}`, label: name, icon: name, parent: '#toolbox_support' }, ...intuitionAddOn[name] }
        fct_exec(optionalParams);
      } else {
        console.warn(`Function ${fct_exec} not found`);
      }
    });
    menuOpen = parent;
  }
  else {
    methods.forEach(name => {
      const el = grab(`_intuition_${name}`);
      if (el) {
        el.remove();
      }
    });
    menuOpen = 'false';
  }

}


// main builder
function intuitionCommon(cfg) {
  puts(calculatedCSS);
  const el = $('div', {
    id: cfg.id,
    parent: cfg.parent,
    class: cfg.type,
    css: {
      backgroundColor: currentTheme.tool_bg,
      width: currentTheme.item_size,
      height: currentTheme.item_size,
      color: 'lightgray',
      // padding: currentTheme["items_spacing"],
      marginTop: currentTheme["items_spacing"],
      boxShadow: currentTheme["item_shadow"],
      borderRadius: currentTheme["item_border_radius"],
      textAlign: 'center',
      display: 'inline-block',
      position: 'relative',
      flex: '0 0 auto',
      ...(cfg.css || {})
    },
  });
  el.click = cfg.click; // attach click handler properly so the passed function is executed
  if (typeof cfg.click === 'function') {
    el.addEventListener('click', function (e) {
      try { cfg.click.call(el, e); } catch (err) { console.error(err); }
    });
  }
  return el;
}

// item menu builder by type

function palette(cfg) {
  // puts(cfg)
  // cfg.css = {
  // ...cfg.css,

  // };

  const el = intuitionCommon(cfg)
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


const intuitionAddOn = {
  communication: {
    // margin: currentTheme["items_spacing"],
    label: 'communication',
    icon: 'communication',
  }
}
// startup environment
function init_inituition() {
  intuitionCommon(toolbox_support)
  intuitionCommon(toolbox)
}


init_inituition()




// palette({
// id: "communication",
// // parent: 'toolbox',
// // margin: currentTheme["items_spacing"],
// type: "palette",
// label: 'communication',
// icon: 'communication',
// });



// tool({
// 	id: "create",
//     margin: currenttoolboxTheme["items_spacing"],
// 	type: "tool",
//   label: 'create',
//   icon: 'create',
//   colorise: true, 
// });
// option({
// 	id: "boolean",
//     margin: currenttoolboxTheme["items_spacing"],
// 	type: "option",
// 	label: 'boolean',
// 	button: 'boolean',
// 	colorise: true,
// });


// zonespecial({
// 	id: "color-pallete",
//     margin: currenttoolboxTheme["items_spacing"],
// 	type: "special",
//   label: 'palette',
//   icon: 'color',
//   colorise: true, 
// });


// particle({
//     id: "width-particle",
//       margin: currenttoolboxTheme["items_spacing"],
//     type: "particle",
//   label: 'width',
//   input: 0.5,
//   selector:['%','px','cm','em','rem','vh','vw'],

// });


// particle({
// 	id: "red-particle",
//     margin: currenttoolboxTheme["items_spacing"],
// 	type: "particle",
//   label: 'color',
//   input: 0.5,
//   value: 'red',

// });
// intuition_content.current_toolbox='poil'
