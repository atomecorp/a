// menu – Modular Snake/Nibble Menu Spec v1.1 
// Notes: canvas holds a working spec with JSON + comments. JSON sections may include // comments.


const intuition_content = {
  "version": "1.1",
  "meta": { "namespace": "atome.menu", "defaultLocale": "en" },

  // =============================
  // 1) Providers (unchanged)
  // =============================
  "providers": {
	"templates": {
	  "type": "static", "items": [
		{ "id": "tpl.photo", "type": "template", "labelKey": "Templates.Photos" },
		{ "id": "tpl.videoFx", "type": "template", "labelKey": "Templates.VideoFX" },
		{ "id": "tpl.programming", "type": "template", "labelKey": "Templates.Programming" }
	  ]
	},
	"viewModes": {
	  "type": "static", "items": [
		{ "id": "vm.list", "type": "viewMode", "labelKey": "ViewMode.List", "icon": "list", "action": { "command": "ui.setViewMode", "params": { "mode": "list" } } },
		{ "id": "vm.grid", "type": "viewMode", "labelKey": "ViewMode.Grid", "icon": "grid", "action": { "command": "ui.setViewMode", "params": { "mode": "grid" } } },
		{ "id": "vm.code", "type": "viewMode", "labelKey": "ViewMode.Code", "icon": "code", "action": { "command": "ui.setViewMode", "params": { "mode": "code" } } }
	  ]
	},
	"recentProjects": { "type": "dynamic", "endpoint": "menu.fetchRecentProjects", "cacheTtlSec": 30 }
  },

  // =============================
  // 2) Menu Tree (sample)
  // =============================
  "toolsbox": {
	"id": "root",
	"type": "group",
	"children": [
	  {
		"id": "home",
		"type": "group",
		"labelKey": "Home",
		"icon": "home",
		"children": [
		  { "id": "home.system", "type": "item", "labelKey": "System", "icon": "cpu", "action": { "command": "system.open" } },
		  { "id": "home.user", "type": "item", "labelKey": "User", "icon": "user", "action": { "command": "user.openProfile" } },
		  { "id": "home.recent", "type": "group", "labelKey": "Recent", "icon": "clock", "childrenProvider": { "use": "recentProjects" } }
		]
	  },

	  {
		"id": "find", "type": "group", "labelKey": "Find", "icon": "search", "children": [
		  { "id": "find.filter", "type": "item", "labelKey": "Filter", "icon": "filter", "action": { "command": "search.openFilter" } },
		  {
			"id": "find.selector", "type": "group", "labelKey": "SelectorTags", "icon": "tag", "children": [
			  { "id": "find.selector.label", "type": "item", "labelKey": "Label", "action": { "command": "tags.pick", "params": { "scope": "label" } } },
			  { "id": "find.selector.name", "type": "item", "labelKey": "Name", "action": { "command": "tags.pick", "params": { "scope": "name" } } },
			  { "id": "find.selector.slicer", "type": "item", "labelKey": "Slicer", "action": { "command": "tags.slicer" } }
			]
		  }
		]
	  },

	  {
		"id": "time", "type": "group", "labelKey": "Time", "icon": "timer", "children": [
		  { "id": "time.schedule", "type": "item", "labelKey": "Schedule", "action": { "command": "time.schedule" } },
		  { "id": "time.clock", "type": "item", "labelKey": "Clock", "action": { "command": "time.clock" } },
		  {
			"id": "time.timeline", "type": "group", "labelKey": "Timeline", "children": [
			  { "id": "time.undo", "type": "item", "labelKey": "Undo", "icon": "undo", "action": { "command": "history.undo" } },
			  { "id": "time.redo", "type": "item", "labelKey": "Redo", "icon": "redo", "action": { "command": "history.redo" } }
			]
		  },
		  { "id": "time.wait", "type": "item", "labelKey": "Wait", "action": { "command": "time.waitDialog" } },
		  { "id": "time.every", "type": "item", "labelKey": "Every", "action": { "command": "time.repeat" } }
		]
	  },

	  { "id": "view", "type": "group", "labelKey": "View", "icon": "layout", "childrenProvider": { "use": "viewModes" } },
	  { "id": "templates", "type": "group", "labelKey": "Templates", "icon": "template", "childrenProvider": { "use": "templates" } },

	  {
		"id": "tools", "type": "group", "labelKey": "Tools", "icon": "wrench", "children": [
		  {
			"id": "tools.communication", "type": "group", "labelKey": "Communication", "children": [
			  { "id": "tools.share", "type": "item", "labelKey": "Share", "icon": "share", "action": { "command": "comm.share" } },
			  { "id": "tools.message", "type": "item", "labelKey": "Message", "action": { "command": "comm.message" } },
			  { "id": "tools.visio", "type": "item", "labelKey": "Visio", "action": { "command": "comm.visio" } },
			  { "id": "tools.tel", "type": "item", "labelKey": "Phone", "action": { "command": "comm.phone" } },
			  { "id": "tools.collab", "type": "item", "labelKey": "Collab", "action": { "command": "comm.collab" } }
			]
		  },
		  { "id": "tools.capture", "type": "item", "labelKey": "Capture", "icon": "camera", "action": { "command": "capture.open" } },
		  { "id": "tools.edit", "type": "item", "labelKey": "EditToolbox", "icon": "edit", "action": { "command": "toolbox.edit" } },
		  { "id": "tools.create", "type": "item", "labelKey": "Create", "action": { "command": "content.create" } },
		  { "id": "tools.change", "type": "item", "labelKey": "Change", "action": { "command": "content.change" } },
		  { "id": "tools.find", "type": "item", "labelKey": "Find", "action": { "command": "search.open" } },
		  { "id": "tools.userHome", "type": "item", "labelKey": "UserHome", "action": { "command": "nav.open", "params": { "path": "atome://home" } } },
		  { "id": "tools.view", "type": "item", "labelKey": "View", "action": { "command": "ui.toggle" } },
		  { "id": "tools.time", "type": "item", "labelKey": "Time", "action": { "command": "time.panel" } }
		]
	  },

	  {
		"id": "settings", "type": "group", "labelKey": "Settings", "icon": "settings", "children": [
		  { "id": "settings.language", "type": "item", "labelKey": "Language", "action": { "command": "settings.language" } },
		  { "id": "settings.inspector", "type": "item", "labelKey": "Inspector", "action": { "command": "inspector.toggle" } },
		  { "id": "settings.clear", "type": "item", "labelKey": "Clear", "action": { "command": "app.clearCache" } }
		]
	  },

	  {
		"id": "help", "type": "group", "labelKey": "Help", "icon": "help", "children": [
		  { "id": "help.docs", "type": "item", "labelKey": "Docs", "action": { "route": "/help" } },
		  { "id": "help.about", "type": "item", "labelKey": "About", "action": { "command": "app.about" } }
		]
	  },

	  { "id": "quit", "type": "item", "labelKey": "Quit", "icon": "power", "action": { "command": "app.quit" } }
	]
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
	"item_border_radius": "1%",


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
  parent: '#intuition',
  class: `tool_${cfg.type}`,
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
 
  const el = intuitionCommon(cfg)

  // const { id, orientation = 'vertical', position = 'bottom-left', theme = 'light' } = cfg;
  // window.IntuitionToolbox = id;
  // const el = intuitionCommon(cfg);
  // el.theme = theme;
  // el.orientation = orientation;
  // el.position = position;
  // // keep original config for later use
  // el._intuitionCfg = cfg;
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
currentTheme.orientation="horizontal";
currentTheme.position="topleft";


const currentToolsBox= toolsbox(
  {  
  id: "toolsbox",
   click: function(e){
    puts("open and craete any element in the place you want");
    grab('toolsbox').style.backgroundColor='blue';
  },
  margin: currentTheme["items_spacing"], 
  css: {
    boxShadow: currentTheme["item_shadow"],
    borderRadius: currentTheme["item_border_radius"],
    // backgroundColor: currentTheme["tool_bg"],
    backgroundColor: 'red',
  //   padding: currentTheme["items_spacing"],
  //   position: 'fixed',
  //   zIndex: 1000,
  //   display: 'flex',
  //   flexDirection: currentTheme.orientation === 'horizontal' ? 'row' : 'column',
  //   ...(currentTheme.position === 'top-left' && { top: '10px', left: '10px' }),
  //   ...(currentTheme.position === 'top-right' && { top: '10px', right: '10px' }),
  //   ...(currentTheme.position === 'bottom-left' && { bottom: '10px', left: '10px' }),
  //   ...(currentTheme.position === 'bottom-right' && { bottom: '10px', right: '10px' }),
  },
  type: "toolsbox",
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


